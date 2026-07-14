import {
  ConnectorLiveSetupReportSchema,
  type ConnectorLiveSetupCheck,
  type ConnectorLiveSetupReport,
  type ConnectorLiveSetupStatus
} from "@searchops/types";

import { getApiBaseUrl } from "./api-base-url";
import { apiFetchAsUser } from "./api-client";
import type { ProviderUserContext } from "./provider-accounts";

export type ConnectorLiveSetupSource = "api" | "fixture";
export type ConnectorLiveSetupTone = "missing" | "ready" | "risk" | "warning";

export interface ConnectorLiveSetupData {
  readonly errorMessage: string | null;
  readonly report: ConnectorLiveSetupReport;
  readonly source: ConnectorLiveSetupSource;
}

export interface ProtectedConnectorLiveSetupData {
  readonly errorMessage: string | null;
  readonly report: ConnectorLiveSetupReport | null;
  readonly source: "api";
}

export async function loadConnectorLiveSetupDataAsUser(
  context: ProviderUserContext,
): Promise<ProtectedConnectorLiveSetupData> {
  const apiBaseUrl = getApiBaseUrl();
  if (apiBaseUrl === null) {
    return unavailableProtectedLiveSetup();
  }

  try {
    const response = await apiFetchAsUser(
      `${apiBaseUrl}/ops/connector-live-setup`,
      context.accessToken,
      { cache: "no-store" },
    );
    if (!response.ok) {
      return unavailableProtectedLiveSetup();
    }
    return {
      errorMessage: null,
      report: ConnectorLiveSetupReportSchema.parse(await response.json()),
      source: "api",
    };
  } catch {
    return unavailableProtectedLiveSetup();
  }
}

function unavailableProtectedLiveSetup(): ProtectedConnectorLiveSetupData {
  return {
    errorMessage: "Live setup 정보를 불러오지 못했습니다.",
    report: null,
    source: "api",
  };
}

export function findPageSpeedLiveSetupCheck(
  report: ConnectorLiveSetupReport | null,
): ConnectorLiveSetupCheck | null {
  if (report === null) {
    return null;
  }
  return report.checks.find((check) => check.id === "pagespeed-live-credential") ??
    report.checks.find((check) => check.area === "pagespeed") ??
    null;
}

export async function loadConnectorLiveSetupData(): Promise<ConnectorLiveSetupData> {
  return createDemoConnectorLiveSetupData();
}

export function createDemoConnectorLiveSetupData(): ConnectorLiveSetupData {
  return {
    errorMessage: null,
    report: ConnectorLiveSetupReportSchema.parse({
      generatedAt: "2026-05-27T00:00:00.000Z",
      environment: "local",
      liveExternalApis: "disabled",
      canRunFixtureMode: true,
      canRunLiveConnectorSync: false,
      checks: [
        {
          id: "pagespeed-live-credential",
          area: "pagespeed",
          title: "PageSpeed live credential",
          status: "needs_provisioning",
          summary: "PageSpeed live sync API key가 없습니다.",
          nextAction: "SEARCHOPS_PAGESPEED_API_KEY를 로컬 또는 배포 secret에 등록하세요.",
          envKeys: ["SEARCHOPS_PAGESPEED_API_KEY"]
        }
      ],
      summary: {
        ready: 0,
        configured: 0,
        needsProvisioning: 1,
        warnings: 0,
        blocked: 0,
        total: 1
      }
    }),
    source: "fixture"
  };
}

export function getPageSpeedLiveSetupCheck(
  report: ConnectorLiveSetupReport,
): ConnectorLiveSetupCheck {
  const fallback = createDemoConnectorLiveSetupData().report.checks.find(
    (check) => check.id === "pagespeed-live-credential",
  );
  if (fallback === undefined) {
    throw new Error("PageSpeed live setup fixture is missing.");
  }

  return (
    report.checks.find((check) => check.id === "pagespeed-live-credential") ??
    report.checks.find((check) => check.area === "pagespeed") ??
    fallback
  );
}

export function formatConnectorLiveSetupStatus(status: ConnectorLiveSetupStatus) {
  const labels = {
    blocked: "차단됨",
    configured: "구성됨",
    needs_provisioning: "설정 필요",
    ready: "준비됨",
    warning: "주의"
  } as const satisfies Record<ConnectorLiveSetupStatus, string>;

  return labels[status];
}

export function getConnectorLiveSetupTone(
  status: ConnectorLiveSetupStatus,
): ConnectorLiveSetupTone {
  if (status === "ready" || status === "configured") {
    return "ready";
  }

  if (status === "needs_provisioning") {
    return "missing";
  }

  if (status === "warning") {
    return "warning";
  }

  return "risk";
}
