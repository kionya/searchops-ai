import { createHmac, timingSafeEqual } from "node:crypto";

import {
  CmsWebhookSignatureHeadersSchema,
  type CmsContentUpdatedEventRequest,
} from "@searchops/types";

export const defaultCmsWebhookToleranceMs = 5 * 60 * 1000;

export interface CmsWebhookSecretMap {
  readonly [cmsType: string]: string;
}

export interface CreateCmsWebhookSignatureInput {
  readonly event: CmsContentUpdatedEventRequest;
  readonly secret: string;
  readonly timestamp: string;
}

export interface VerifyCmsWebhookSignatureInput extends CreateCmsWebhookSignatureInput {
  readonly cmsType: string;
  readonly now: Date;
  readonly signature: string;
  readonly toleranceMs?: number;
}

export type CmsWebhookSignatureScheme = "searchops_hmac" | "webflow_native" | "wordpress_native";

export interface CreateCmsNativeWebhookSignatureInput {
  readonly cmsType: string;
  readonly payload: unknown;
  readonly secret: string;
  readonly timestamp: string;
}

export interface VerifyCmsNativeWebhookSignatureInput {
  readonly cmsType: string;
  readonly headers: CmsWebhookHeaderInput;
  readonly now: Date;
  readonly payload: unknown;
  readonly secret: string;
  readonly toleranceMs?: number;
}

export interface CmsWebhookHeaderInput {
  readonly [headerName: string]: string | string[] | undefined;
}

export interface VerifyCmsWebhookRequestInput {
  readonly allowNativeProviderSignature?: boolean;
  readonly event: CmsContentUpdatedEventRequest;
  readonly headers: CmsWebhookHeaderInput;
  readonly nativePayload?: unknown;
  readonly now: Date;
  readonly required: boolean;
  readonly secrets: CmsWebhookSecretMap;
  readonly toleranceMs?: number;
}

export interface VerifyCmsWebhookRequestResult {
  readonly ok: boolean;
  readonly message?: string;
  readonly scheme?: CmsWebhookSignatureScheme;
}

interface CmsNativeWebhookSignatureConfig {
  readonly label: string;
  readonly scheme: CmsWebhookSignatureScheme;
  readonly signatureHeader: string;
  readonly timestampHeader: string;
}

export const cmsNativeWebhookSignatureConfigs = {
  webflow: {
    label: "Webflow",
    scheme: "webflow_native",
    signatureHeader: "x-webflow-signature",
    timestampHeader: "x-webflow-timestamp",
  },
  wordpress: {
    label: "WordPress",
    scheme: "wordpress_native",
    signatureHeader: "x-wp-webhook-signature",
    timestampHeader: "x-wp-webhook-timestamp",
  },
} as const satisfies Record<string, CmsNativeWebhookSignatureConfig>;

export function parseCmsWebhookSecrets(value: string | undefined): CmsWebhookSecretMap {
  if (value === undefined || value.trim() === "") {
    return {};
  }

  const parsed = JSON.parse(value) as unknown;
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error("SEARCHOPS_CMS_WEBHOOK_SECRETS must be a JSON object.");
  }

  const secrets: Record<string, string> = {};
  for (const [cmsType, secret] of Object.entries(parsed)) {
    if (typeof secret !== "string" || secret.trim() === "") {
      throw new Error(`CMS webhook secret for ${cmsType} must be a non-empty string.`);
    }
    secrets[cmsType] = secret;
  }

  return secrets;
}

export function createCmsWebhookSignature(input: CreateCmsWebhookSignatureInput) {
  const signedPayload = `${input.timestamp}.${canonicalJsonStringify(input.event)}`;
  return `sha256=${createHmac("sha256", input.secret).update(signedPayload).digest("hex")}`;
}

export function createCmsNativeWebhookSignature(input: CreateCmsNativeWebhookSignatureInput) {
  if (getCmsNativeWebhookSignatureConfig(input.cmsType) === null) {
    throw new Error(`CMS native webhook signatures are not supported for ${input.cmsType}.`);
  }

  const signedPayload = `${input.timestamp}.${canonicalJsonStringify(input.payload)}`;
  return `sha256=${createHmac("sha256", input.secret).update(signedPayload).digest("hex")}`;
}

export function verifyCmsWebhookSignature(input: VerifyCmsWebhookSignatureInput) {
  const timestampMs = Date.parse(input.timestamp);
  if (!Number.isFinite(timestampMs)) {
    return false;
  }

  const toleranceMs = input.toleranceMs ?? defaultCmsWebhookToleranceMs;
  if (Math.abs(input.now.getTime() - timestampMs) > toleranceMs) {
    return false;
  }

  const expected = createCmsWebhookSignature(input);
  return timingSafeEqualText(expected.toLowerCase(), input.signature.toLowerCase());
}

export function verifyCmsNativeWebhookSignature(
  input: VerifyCmsNativeWebhookSignatureInput,
): VerifyCmsWebhookRequestResult {
  const config = getCmsNativeWebhookSignatureConfig(input.cmsType);
  if (config === null) {
    return {
      ok: false,
      message: `CMS native webhook signatures are not supported for ${input.cmsType}.`,
    };
  }

  const timestamp = getSingleHeader(input.headers, config.timestampHeader);
  const signature = normalizeSignature(getSingleHeader(input.headers, config.signatureHeader));
  if (timestamp === undefined || signature === undefined) {
    return {
      ok: false,
      message: `${config.label} native webhook signature headers are required.`,
    };
  }

  const timestampMs = Date.parse(timestamp);
  if (!Number.isFinite(timestampMs)) {
    return {
      ok: false,
      message: `${config.label} native webhook timestamp is invalid.`,
    };
  }

  const toleranceMs = input.toleranceMs ?? defaultCmsWebhookToleranceMs;
  if (Math.abs(input.now.getTime() - timestampMs) > toleranceMs) {
    return {
      ok: false,
      message: `${config.label} native webhook timestamp is outside the replay window.`,
    };
  }

  const expected = createCmsNativeWebhookSignature({
    cmsType: input.cmsType,
    payload: input.payload,
    secret: input.secret,
    timestamp,
  });
  return timingSafeEqualText(expected.toLowerCase(), signature.toLowerCase())
    ? { ok: true, scheme: config.scheme }
    : {
        ok: false,
        message: `${config.label} native webhook signature verification failed.`,
      };
}

export function verifyCmsWebhookRequest(
  input: VerifyCmsWebhookRequestInput,
): VerifyCmsWebhookRequestResult {
  if (!input.required) {
    return { ok: true };
  }

  const searchOpsVerification = verifySearchOpsWebhookRequest(input);
  if (searchOpsVerification.ok) {
    return searchOpsVerification;
  }

  if (input.allowNativeProviderSignature === true && input.nativePayload !== undefined) {
    const secret = input.secrets[input.event.cmsType];
    if (secret === undefined) {
      return {
        ok: false,
        message: "CMS webhook secret is not configured for this cmsType.",
      };
    }

    return verifyCmsNativeWebhookSignature({
      cmsType: input.event.cmsType,
      headers: input.headers,
      now: input.now,
      payload: input.nativePayload,
      secret,
      ...(input.toleranceMs === undefined ? {} : { toleranceMs: input.toleranceMs }),
    });
  }

  return searchOpsVerification;
}

function verifySearchOpsWebhookRequest(
  input: VerifyCmsWebhookRequestInput,
): VerifyCmsWebhookRequestResult {
  const headers = CmsWebhookSignatureHeadersSchema.safeParse({
    "x-searchops-cms-type": getSingleHeader(input.headers, "x-searchops-cms-type"),
    "x-searchops-signature": getSingleHeader(input.headers, "x-searchops-signature"),
    "x-searchops-timestamp": getSingleHeader(input.headers, "x-searchops-timestamp"),
  });
  if (!headers.success) {
    return {
      ok: false,
      message: "CMS webhook signature headers are required.",
    };
  }

  const cmsType = headers.data["x-searchops-cms-type"];
  if (cmsType !== input.event.cmsType) {
    return {
      ok: false,
      message: "CMS webhook cms type header must match the event cmsType.",
    };
  }

  const secret = input.secrets[cmsType];
  if (secret === undefined) {
    return {
      ok: false,
      message: "CMS webhook secret is not configured for this cmsType.",
    };
  }

  const signatureInput: VerifyCmsWebhookSignatureInput = {
    cmsType,
    event: input.event,
    now: input.now,
    secret,
    signature: headers.data["x-searchops-signature"],
    timestamp: headers.data["x-searchops-timestamp"],
  };
  const ok = verifyCmsWebhookSignature(
    input.toleranceMs === undefined
      ? signatureInput
      : { ...signatureInput, toleranceMs: input.toleranceMs },
  );
  return ok
    ? { ok: true, scheme: "searchops_hmac" }
    : {
        ok: false,
        message: "CMS webhook signature verification failed.",
      };
}

function getSingleHeader(headers: CmsWebhookHeaderInput, name: string) {
  const value = headers[name];
  return Array.isArray(value) ? value[0] : value;
}

function getCmsNativeWebhookSignatureConfig(cmsType: string) {
  return cmsType in cmsNativeWebhookSignatureConfigs
    ? cmsNativeWebhookSignatureConfigs[
        cmsType as keyof typeof cmsNativeWebhookSignatureConfigs
      ]
    : null;
}

function normalizeSignature(value: string | undefined) {
  if (value === undefined) {
    return undefined;
  }

  return /^[a-f0-9]{64}$/iu.test(value) ? `sha256=${value}` : value;
}

function canonicalJsonStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalJsonStringify(item)).join(",")}]`;
  }

  if (value !== null && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .filter((key) => record[key] !== undefined)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJsonStringify(record[key])}`)
      .join(",")}}`;
  }

  return JSON.stringify(value);
}

function timingSafeEqualText(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}
