"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import {
  parseConnectorProviders,
  triggerConnectorSync
} from "../../../../src/connector-sync-history";

export async function runConnectorSyncAction(siteId: string, formData: FormData) {
  const searchParams = new URLSearchParams();

  try {
    const providers = parseConnectorProviders(formData.getAll("providers"));
    const result = await triggerConnectorSync(siteId, providers);
    searchParams.set("sync", result.status);
    if (result.connectorSyncRunId) {
      searchParams.set("runId", result.connectorSyncRunId);
    }
  } catch {
    searchParams.set("sync", "failed");
  }

  revalidatePath(`/sites/${siteId}/connectors`);
  redirect(`/sites/${siteId}/connectors?${searchParams.toString()}`);
}
