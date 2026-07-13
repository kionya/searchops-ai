import {
  ConnectorOAuthCredentialListResponseSchema,
  type ConnectorOAuthCredential,
  type ConnectorOAuthCredentialStatus,
  type ConnectorOAuthProvider,
} from "@searchops/types";

import { apiFetchAsUser } from "./api-client";
import { getApiBaseUrl } from "./api-base-url";
import type { ProviderUserContext } from "./provider-accounts";
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

export function createGoogleOAuthStartPath(
  siteId: string,
  providers: readonly ConnectorOAuthProvider[] = connectorOAuthProviders,
  returnPath = `/sites/${siteId}/connectors`,
): string | null {
  const appBaseUrl = process.env.SEARCHOPS_PUBLIC_APP_URL?.trim();
  if (!appBaseUrl || siteId.trim().length === 0 || providers.length === 0) {
    return null;
  }

  try {
    const appUrl = new URL(appBaseUrl);
    const isLocalHttp = appUrl.protocol === "http:" &&
      (appUrl.hostname === "localhost" || appUrl.hostname === "127.0.0.1");
    if (
      (appUrl.protocol !== "https:" && !isLocalHttp) ||
      appUrl.username.length > 0 ||
      appUrl.password.length > 0
    ) {
      return null;
    }
    const returnTo = new URL(returnPath, appUrl.origin);
    if (returnTo.origin !== appUrl.origin) {
      return null;
    }
    const query = new URLSearchParams({
      providers: [...new Set(providers)].join(","),
      returnTo: returnTo.toString(),
    });
    return `/sites/${encodeURIComponent(siteId)}/connectors/google/oauth/start?${query.toString()}`;
  } catch {
    return null;
  }
}

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

export async function loadConnectorOAuthData(
  siteId: string,
  context: ProviderUserContext,
): Promise<ConnectorOAuthData> {
  const apiBaseUrl = getApiBaseUrl();
  if (apiBaseUrl === null) {
    return {
      credentials: [],
      errorMessage: "OAuth 상태를 불러오지 못했습니다.",
      source: "api",
    };
  }

  try {
    const response = await apiFetchAsUser(
      `${apiBaseUrl}/sites/${encodeURIComponent(siteId)}/connectors/oauth`,
      context.accessToken,
      { cache: "no-store" },
    );
    if (!response.ok) {
      throw new Error(`OAuth credential request failed: ${response.status}`);
    }

    const output = ConnectorOAuthCredentialListResponseSchema.parse(await response.json());
    if (output.credentials.some(
      (credential) =>
        credential.organizationId !== context.organizationId || credential.siteId !== siteId,
    )) {
      throw new Error("oauth_tenant_mismatch");
    }
    return {
      credentials: output.credentials,
      errorMessage: null,
      source: "api"
    };
  } catch {
    return {
      credentials: [],
      errorMessage: "OAuth 상태를 불러오지 못했습니다.",
      source: "api"
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
