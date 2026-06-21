import {
  ConnectorOAuthCredentialListResponseSchema,
  type ConnectorOAuthCredential,
  type ConnectorOAuthCredentialStatus,
  type ConnectorOAuthProvider,
} from "@searchops/types";

import { apiFetch } from "./api-client";
import { getApiBaseUrl } from "./api-base-url";
import { demoSite } from "./work-order-board";

export type ConnectorOAuthSource = "api" | "fixture";
export type ConnectorOAuthTone = "connected" | "missing" | "risk";

export interface ConnectorOAuthData {
  readonly credentials: readonly ConnectorOAuthCredential[];
  readonly errorMessage: string | null;
  readonly source: ConnectorOAuthSource;
}

export interface ConnectorOAuthProviderStatus {
  readonly credential: ConnectorOAuthCredential | null;
  readonly provider: ConnectorOAuthProvider;
  readonly status: ConnectorOAuthCredentialStatus | "missing";
}

export const connectorOAuthProviders = ["gsc", "ga4"] as const satisfies readonly ConnectorOAuthProvider[];

export const demoConnectorOAuthCredentials: ConnectorOAuthCredential[] = [
  {
    id: "oauth_demo_gsc",
    organizationId: demoSite.organizationId,
    siteId: demoSite.id,
    provider: "gsc",
    status: "connected",
    scopes: ["https://www.googleapis.com/auth/webmasters.readonly"],
    connectedByUserId: "user_demo",
    connectedAt: "2026-05-27T00:00:00.000Z",
    tokenExpiresAt: "2026-05-27T01:00:00.000Z",
    externalAccountEmail: "searchops-demo@example.com",
    updatedAt: "2026-05-27T00:00:00.000Z"
  }
];

export async function loadConnectorOAuthData(siteId: string): Promise<ConnectorOAuthData> {
  const apiBaseUrl = getApiBaseUrl();
  if (apiBaseUrl === null) {
    return createDemoConnectorOAuthData(siteId);
  }

  try {
    const response = await apiFetch(`${apiBaseUrl}/sites/${encodeURIComponent(siteId)}/connectors/oauth`, {
      cache: "no-store"
    });
    if (!response.ok) {
      throw new Error(`OAuth credential request failed: ${response.status}`);
    }

    const output = ConnectorOAuthCredentialListResponseSchema.parse(await response.json());
    return {
      credentials: output.credentials,
      errorMessage: null,
      source: "api"
    };
  } catch (error) {
    return {
      ...createDemoConnectorOAuthData(siteId),
      errorMessage: error instanceof Error ? error.message : "OAuth credential request failed",
      source: "fixture"
    };
  }
}

export function createDemoConnectorOAuthData(siteId: string = demoSite.id): ConnectorOAuthData {
  return {
    credentials: demoConnectorOAuthCredentials.map((credential) => ({
      ...credential,
      siteId
    })),
    errorMessage: null,
    source: "fixture"
  };
}

export function summarizeConnectorOAuthProviders(
  credentials: readonly ConnectorOAuthCredential[],
): ConnectorOAuthProviderStatus[] {
  return connectorOAuthProviders.map((provider) => {
    const credential = credentials.find((item) => item.provider === provider) ?? null;
    return {
      credential,
      provider,
      status: credential?.status ?? "missing"
    };
  });
}

export function getConnectorOAuthTone(
  status: ConnectorOAuthCredentialStatus | "missing",
): ConnectorOAuthTone {
  if (status === "connected") {
    return "connected";
  }

  if (status === "missing") {
    return "missing";
  }

  return "risk";
}

export function formatConnectorOAuthStatus(status: ConnectorOAuthCredentialStatus | "missing") {
  const labels = {
    connected: "연결됨",
    expired: "만료됨",
    missing: "미연결",
    revoked: "해제됨"
  } as const satisfies Record<ConnectorOAuthCredentialStatus | "missing", string>;

  return labels[status];
}

export function formatConnectorOAuthDate(isoDate: string | null) {
  if (isoDate === null) {
    return "없음";
  }

  return isoDate.replace("T", " ").slice(0, 16);
}
