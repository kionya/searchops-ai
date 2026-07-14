"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import {
  ProviderAccountClientError,
  canManageProviderAccounts,
  canRunConnectorSync,
  deleteSiteConnector,
  getCurrentProviderUser,
  parseConnectorSyncForm,
  parseDeleteSiteConnectorForm,
  parseSiteConnectorForm,
  saveSiteConnector,
  triggerSiteConnectorSync,
} from "../../../../src/provider-accounts";

export async function runConnectorSyncAction(siteId: string, formData: FormData) {
  const searchParams = new URLSearchParams();

  try {
    const context = await getCurrentProviderUser();
    if (!canRunConnectorSync(context.role)) {
      throw new ProviderAccountClientError("forbidden");
    }
    const providers = parseConnectorSyncForm(formData);
    const result = await triggerSiteConnectorSync(context, siteId, providers);
    searchParams.set("sync", "queued");
    searchParams.set("runId", result.connectorSyncRunId);
    revalidatePath(siteConnectorsPath(siteId));
  } catch {
    searchParams.set("sync", "failed");
  }

  redirect(`${siteConnectorsPath(siteId)}?${searchParams.toString()}`);
}

export async function saveSiteConnectorAction(siteId: string, formData: FormData) {
  let status: ConnectorBindingActionStatus = "saved";
  try {
    const context = await requireCredentialManager();
    await saveSiteConnector(context, { siteId, ...parseSiteConnectorForm(formData) });
    revalidatePath(siteConnectorsPath(siteId));
  } catch {
    status = "failed";
  }
  redirect(`${siteConnectorsPath(siteId)}?binding=${status}`);
}

export async function deleteSiteConnectorAction(siteId: string, formData: FormData) {
  let status: ConnectorBindingActionStatus = "deleted";
  try {
    const context = await requireCredentialManager();
    const input = parseDeleteSiteConnectorForm(formData);
    await deleteSiteConnector(context, siteId, input.provider);
    revalidatePath(siteConnectorsPath(siteId));
  } catch {
    status = "failed";
  }
  redirect(`${siteConnectorsPath(siteId)}?binding=${status}`);
}

type ConnectorBindingActionStatus = "deleted" | "failed" | "saved";

async function requireCredentialManager() {
  const context = await getCurrentProviderUser();
  if (!canManageProviderAccounts(context.role)) {
    throw new ProviderAccountClientError("forbidden");
  }
  return context;
}

function siteConnectorsPath(siteId: string): string {
  return `/sites/${encodeURIComponent(siteId)}/connectors`;
}
