import { createCipheriv, randomBytes } from "node:crypto";

import { describe, expect, it } from "vitest";

import {
  CredentialDecryptionError,
  decryptProviderCredential,
  encryptProviderCredential,
  parseCredentialKeyring,
  type CredentialContext,
  type EncryptedProviderCredential
} from "./credential-crypto.js";

const activeKey = randomBytes(32).toString("base64");
const previousKey = randomBytes(32).toString("base64");
const context = {
  organizationId: "org_a",
  providerAccountId: "pa_1",
  provider: "google" as const
};

describe("credential crypto", () => {
  it("round trips a validated secret with a fresh IV for every encryption", () => {
    const keyring = createKeyring();
    const secret = {
      kind: "oauth2" as const,
      accessToken: "access-token",
      refreshToken: "refresh-token",
      tokenType: "Bearer"
    };

    const first = encryptProviderCredential(keyring, context, secret);
    const second = encryptProviderCredential(keyring, context, secret);

    expect(first).toMatchObject({ encryptionKeyId: "v1", encryptionVersion: 1 });
    expect(first.credentialIv).not.toBe(second.credentialIv);
    expect(decryptProviderCredential(keyring, context, first)).toEqual(secret);
  });

  it.each([
    ["ciphertext", "credentialCiphertext"],
    ["authentication tag", "credentialAuthTag"],
    ["IV", "credentialIv"]
  ] as const)("rejects %s tampering without exposing crypto details", (_, field) => {
    const keyring = createKeyring();
    const envelope = encryptProviderCredential(keyring, context, { kind: "api_key", apiKey: "secret" });

    expectCredentialDecryptionFailure(keyring, context, tamperEnvelope(envelope, field));
  });

  it.each([
    ["organization", { ...context, organizationId: "org_b" }],
    ["provider account", { ...context, providerAccountId: "pa_2" }],
    ["provider", { ...context, provider: "bing" as const }]
  ])("rejects an envelope bound to a different %s", (_, wrongContext) => {
    const keyring = createKeyring();
    const envelope = encryptProviderCredential(keyring, context, { kind: "api_key", apiKey: "secret" });

    expectCredentialDecryptionFailure(keyring, wrongContext, envelope);
  });

  it("rejects an envelope with an unknown key ID", () => {
    const keyring = createKeyring();
    const envelope = encryptProviderCredential(keyring, context, { kind: "api_key", apiKey: "secret" });

    expectCredentialDecryptionFailure(keyring, context, { ...envelope, encryptionKeyId: "unknown" });
  });

  it("decrypts a previous-key envelope after active key rotation", () => {
    const v1Keyring = createKeyring({ encryptionKey: previousKey, encryptionKeyId: "v1" });
    const envelope = encryptProviderCredential(v1Keyring, context, { kind: "api_key", apiKey: "secret" });
    const rotatingKeyring = createKeyring({
      encryptionKey: activeKey,
      encryptionKeyId: "v2",
      previousKeys: JSON.stringify({ v1: previousKey })
    });

    expect(decryptProviderCredential(rotatingKeyring, context, envelope)).toEqual({
      kind: "api_key",
      apiKey: "secret"
    });
  });

  it.each([
    ["active key", { SEARCHOPS_CREDENTIAL_ENCRYPTION_KEY: randomBytes(31).toString("base64") }],
    [
      "previous key",
      { SEARCHOPS_CREDENTIAL_ENCRYPTION_PREVIOUS_KEYS_JSON: JSON.stringify({ v0: randomBytes(31).toString("base64") }) }
    ],
    ["malformed previous-key JSON", { SEARCHOPS_CREDENTIAL_ENCRYPTION_PREVIOUS_KEYS_JSON: "{" }],
    ["duplicate active key ID", { SEARCHOPS_CREDENTIAL_ENCRYPTION_PREVIOUS_KEYS_JSON: JSON.stringify({ v1: previousKey }) }]
  ])("rejects invalid %s keyring configuration", (_, overrides) => {
    expect(() => parseCredentialKeyring({ ...keyringEnvironment(), ...overrides })).toThrow(
      "credential_keyring_invalid"
    );
  });

  it.each([
    ["invalid encryption version", { encryptionVersion: 2 }],
    ["malformed base64", { credentialIv: "not-base64" }]
  ] as const)("collapses %s to the generic decryption error", (_, overrides) => {
    const keyring = createKeyring();
    const envelope = encryptProviderCredential(keyring, context, { kind: "api_key", apiKey: "secret" });

    expectCredentialDecryptionFailure(
      keyring,
      context,
      { ...envelope, ...overrides } as unknown as EncryptedProviderCredential,
    );
  });

  it.each([
    ["invalid decrypted JSON", "not-json"],
    ["secret schema mismatch", JSON.stringify({ kind: "api_key", apiKey: "", extra: "value" })]
  ])("collapses %s to the generic decryption error", (_, plaintext) => {
    const keyring = createKeyring();

    expectCredentialDecryptionFailure(keyring, context, encryptUnvalidatedPlaintext(plaintext));
  });
});

function createKeyring(options: KeyringOptions = {}) {
  return parseCredentialKeyring({
    SEARCHOPS_CREDENTIAL_ENCRYPTION_KEY_ID: options.encryptionKeyId ?? "v1",
    SEARCHOPS_CREDENTIAL_ENCRYPTION_KEY: options.encryptionKey ?? activeKey,
    SEARCHOPS_CREDENTIAL_ENCRYPTION_PREVIOUS_KEYS_JSON: options.previousKeys ?? "{}"
  });
}

function keyringEnvironment(): CredentialKeyringEnvironment {
  return {
    SEARCHOPS_CREDENTIAL_ENCRYPTION_KEY_ID: "v1",
    SEARCHOPS_CREDENTIAL_ENCRYPTION_KEY: activeKey,
    SEARCHOPS_CREDENTIAL_ENCRYPTION_PREVIOUS_KEYS_JSON: "{}"
  };
}

interface CredentialKeyringEnvironment {
  readonly SEARCHOPS_CREDENTIAL_ENCRYPTION_KEY_ID: string;
  readonly SEARCHOPS_CREDENTIAL_ENCRYPTION_KEY: string;
  readonly SEARCHOPS_CREDENTIAL_ENCRYPTION_PREVIOUS_KEYS_JSON: string;
}

interface KeyringOptions {
  readonly encryptionKey?: string;
  readonly encryptionKeyId?: string;
  readonly previousKeys?: string;
}

function expectCredentialDecryptionFailure(
  keyring: ReturnType<typeof parseCredentialKeyring>,
  input: CredentialContext,
  envelope: EncryptedProviderCredential,
) {
  expect(() => decryptProviderCredential(keyring, input, envelope)).toThrow(CredentialDecryptionError);
  expect(() => decryptProviderCredential(keyring, input, envelope)).toThrow("credential_decryption_failed");
}

function tamperEnvelope(
  envelope: EncryptedProviderCredential,
  field: "credentialCiphertext" | "credentialAuthTag" | "credentialIv",
): EncryptedProviderCredential {
  const value = Buffer.from(envelope[field], "base64");
  value[0] = value[0] === undefined ? 1 : value[0] ^ 1;

  return { ...envelope, [field]: value.toString("base64") };
}

function encryptUnvalidatedPlaintext(plaintext: string): EncryptedProviderCredential {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", Buffer.from(activeKey, "base64"), iv);
  cipher.setAAD(Buffer.from("searchops:provider-account:v1:org_a:pa_1:google"));
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);

  return {
    credentialAuthTag: cipher.getAuthTag().toString("base64"),
    credentialCiphertext: ciphertext.toString("base64"),
    credentialIv: iv.toString("base64"),
    encryptionKeyId: "v1",
    encryptionVersion: 1
  };
}
