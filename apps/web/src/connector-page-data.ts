import type { ProviderAccountSummary, Site, SiteConnector } from "@searchops/types";

import {
  loadConnectorLiveSetupDataAsUser,
  type ProtectedConnectorLiveSetupData,
} from "./connector-live-setup";
import { loadConnectorOAuthData, type ConnectorOAuthData } from "./connector-oauth";
import {
  loadConnectorSyncHistoryAsUser,
  type ConnectorSyncHistoryData,
} from "./connector-sync-history";
import { loadDashboardSiteAsUser } from "./dashboard-shell";
import {
  loadProviderAccounts,
  loadSiteConnectors,
  type ProviderUserContext,
} from "./provider-accounts";

export type ProtectedConnectorPageData =
  | { readonly status: "site_unavailable" }
  | {
      readonly accounts: readonly ProviderAccountSummary[];
      readonly accountLoadFailed: boolean;
      readonly connectors: readonly SiteConnector[];
      readonly connectorLoadFailed: boolean;
      readonly history: ConnectorSyncHistoryData;
      readonly liveSetup: ProtectedConnectorLiveSetupData;
      readonly oauth: ConnectorOAuthData;
      readonly site: Site;
      readonly status: "ready";
    };

export async function loadProtectedConnectorPageData(
  context: ProviderUserContext,
  siteId: string,
): Promise<ProtectedConnectorPageData> {
  const site = await loadDashboardSiteAsUser(context, siteId);
  if (site === null) {
    return { status: "site_unavailable" };
  }

  const [history, liveSetup, oauth, accountResult, connectorResult] = await Promise.all([
    loadConnectorSyncHistoryAsUser(context, site),
    loadConnectorLiveSetupDataAsUser(context),
    loadConnectorOAuthData(siteId, context),
    loadProviderAccounts(context).then(
      (accounts) => ({ accounts, failed: false as const }),
      () => ({ accounts: [] as ProviderAccountSummary[], failed: true as const }),
    ),
    loadSiteConnectors(context, siteId).then(
      (connectors) => ({ connectors, failed: false as const }),
      () => ({ connectors: [] as SiteConnector[], failed: true as const }),
    ),
  ]);

  return {
    accounts: accountResult.accounts,
    accountLoadFailed: accountResult.failed,
    connectors: connectorResult.connectors,
    connectorLoadFailed: connectorResult.failed,
    history,
    liveSetup,
    oauth,
    site,
    status: "ready",
  };
}
