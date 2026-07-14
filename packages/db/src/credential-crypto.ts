import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

import {
  ProviderCredentialSecretSchema,
  type ProviderAccountProvider,
  type ProviderCredentialSecret
} from "@searchops/types";

const AES_256_KEY_BYTES = 32;
const GCM_AUTH_TAG_BYTES = 16;
const GCM_IV_BYTES = 12;

export interface CredentialContext {
  readonly organizationId: string;
  readonly providerAccountId: string;
  readonly provider: ProviderAccountProvider;
}

export interface CredentialKeyringEnvironment {
  readonly SEARCHOPS_CREDENTIAL_ENCRYPTION_KEY_ID?: string;
  readonly SEARCHOPS_CREDENTIAL_ENCRYPTION_KEY?: string;
  readonly SEARCHOPS_CREDENTIAL_ENCRYPTION_PREVIOUS_KEYS_JSON?: string;
}

export interface CredentialKeyring {
  readonly activeKey: Buffer;
  readonly activeKeyId: string;
  readonly previousKeys: ReadonlyMap<string, Buffer>;
}

export interface EncryptedProviderCredential {
  readonly credentialCiphertext: string;
  readonly credentialIv: string;
  readonly credentialAuthTag: string;
  readonly encryptionKeyId: string;
  readonly encryptionVersion: 1;
}

export class CredentialDecryptionError extends Error {
  constructor() {
    super("credential_decryption_failed");
    this.name = "CredentialDecryptionError";
  }
}

export function parseCredentialKeyring(input: CredentialKeyringEnvironment): CredentialKeyring {
  const activeKeyId = input.SEARCHOPS_CREDENTIAL_ENCRYPTION_KEY_ID;
  const activeKeyMaterial = input.SEARCHOPS_CREDENTIAL_ENCRYPTION_KEY;

  if (!isNonEmptyString(activeKeyId) || !isNonEmptyString(activeKeyMaterial)) {
    throwInvalidKeyring();
  }

  const activeKey = decodeKeyMaterial(activeKeyMaterial);
  const previousKeys = parsePreviousKeys(input.SEARCHOPS_CREDENTIAL_ENCRYPTION_PREVIOUS_KEYS_JSON);

  if (previousKeys.has(activeKeyId)) {
    throwInvalidKeyring();
  }

  return { activeKey, activeKeyId, previousKeys };
}

export function encryptProviderCredential(
  keyring: CredentialKeyring,
  context: CredentialContext,
  secret: ProviderCredentialSecret,
): EncryptedProviderCredential {
  const plaintext = Buffer.from(JSON.stringify(ProviderCredentialSecretSchema.parse(secret)), "utf8");
  const iv = randomBytes(GCM_IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", keyring.activeKey, iv);

  cipher.setAAD(Buffer.from(buildCredentialAad(context)));
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);

  return {
    credentialCiphertext: ciphertext.toString("base64"),
    credentialIv: iv.toString("base64"),
    credentialAuthTag: cipher.getAuthTag().toString("base64"),
    encryptionKeyId: keyring.activeKeyId,
    encryptionVersion: 1
  };
}

export function decryptProviderCredential(
  keyring: CredentialKeyring,
  context: CredentialContext,
  envelope: EncryptedProviderCredential,
): ProviderCredentialSecret {
  try {
    const parsedEnvelope = parseEnvelope(envelope);
    const key = getEnvelopeKey(keyring, parsedEnvelope.encryptionKeyId);
    const decipher = createDecipheriv("aes-256-gcm", key, parsedEnvelope.credentialIv);

    decipher.setAAD(Buffer.from(buildCredentialAad(context)));
    decipher.setAuthTag(parsedEnvelope.credentialAuthTag);

    const plaintext = Buffer.concat([
      decipher.update(parsedEnvelope.credentialCiphertext),
      decipher.final()
    ]).toString("utf8");

    return ProviderCredentialSecretSchema.parse(JSON.parse(plaintext));
  } catch {
    throw new CredentialDecryptionError();
  }
}

function parsePreviousKeys(value: string | undefined): ReadonlyMap<string, Buffer> {
  const rawPreviousKeys = value ?? "{}";
  let parsed: unknown;

  try {
    parsed = JSON.parse(rawPreviousKeys);
  } catch {
    throwInvalidKeyring();
  }

  if (!isPlainObject(parsed)) {
    throwInvalidKeyring();
  }

  const keys = new Map<string, Buffer>();
  for (const [keyId, keyMaterial] of Object.entries(parsed)) {
    if (!isNonEmptyString(keyId) || !isNonEmptyString(keyMaterial)) {
      throwInvalidKeyring();
    }

    keys.set(keyId, decodeKeyMaterial(keyMaterial));
  }

  return keys;
}

function parseEnvelope(envelope: EncryptedProviderCredential): {
  readonly credentialCiphertext: Buffer;
  readonly credentialIv: Buffer;
  readonly credentialAuthTag: Buffer;
  readonly encryptionKeyId: string;
} {
  if (!isPlainObject(envelope) || envelope.encryptionVersion !== 1 || !isNonEmptyString(envelope.encryptionKeyId)) {
    throw new Error("invalid_envelope");
  }

  const credentialCiphertext = decodeBase64(envelope.credentialCiphertext);
  const credentialIv = decodeBase64(envelope.credentialIv);
  const credentialAuthTag = decodeBase64(envelope.credentialAuthTag);

  if (
    credentialCiphertext === undefined ||
    credentialIv === undefined ||
    credentialIv.length !== GCM_IV_BYTES ||
    credentialAuthTag === undefined ||
    credentialAuthTag.length !== GCM_AUTH_TAG_BYTES
  ) {
    throw new Error("invalid_envelope");
  }

  return {
    credentialCiphertext,
    credentialIv,
    credentialAuthTag,
    encryptionKeyId: envelope.encryptionKeyId
  };
}

function getEnvelopeKey(keyring: CredentialKeyring, keyId: string): Buffer {
  if (keyId === keyring.activeKeyId) {
    return keyring.activeKey;
  }

  const previousKey = keyring.previousKeys.get(keyId);
  if (previousKey === undefined) {
    throw new Error("unknown_key");
  }

  return previousKey;
}

function decodeKeyMaterial(value: string): Buffer {
  const key = decodeBase64(value);
  if (key === undefined || key.length !== AES_256_KEY_BYTES) {
    throwInvalidKeyring();
  }

  return key;
}

function decodeBase64(value: unknown): Buffer | undefined {
  if (!isNonEmptyString(value)) {
    return undefined;
  }

  const decoded = Buffer.from(value, "base64");
  return decoded.toString("base64") === value ? decoded : undefined;
}

function buildCredentialAad(input: CredentialContext) {
  return `searchops:provider-account:v1:${input.organizationId}:${input.providerAccountId}:${input.provider}`;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function throwInvalidKeyring(): never {
  throw new Error("credential_keyring_invalid");
}
