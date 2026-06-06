"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createContentBriefFromForm } from "../../../../src/content-brief-history";
import { createKeywordDiscoveryFromConnectorRun } from "../../../../src/keyword-aeo-dashboard";

export async function createContentBriefAction(siteId: string, formData: FormData) {
  const searchParams = new URLSearchParams();

  try {
    const result = await createContentBriefFromForm(siteId, formData);
    searchParams.set("brief", result.status);
    searchParams.set("keyword", result.primaryKeyword);
    if (result.contentBriefId) {
      searchParams.set("briefId", result.contentBriefId);
    }
  } catch {
    searchParams.set("brief", "failed");
  }

  revalidatePath(`/sites/${siteId}/content`);
  redirect(`/sites/${siteId}/content?${searchParams.toString()}`);
}

export async function createKeywordDiscoveryAction(siteId: string, formData: FormData) {
  const searchParams = new URLSearchParams();

  try {
    const result = await createKeywordDiscoveryFromConnectorRun(siteId, formData);
    searchParams.set("keywordDiscovery", result.status);
    searchParams.set("candidates", String(result.candidateCount));
    searchParams.set("connectorSyncRunId", result.connectorSyncRunId);
    if (result.topKeyword) {
      searchParams.set("keyword", result.topKeyword);
    }
  } catch {
    searchParams.set("keywordDiscovery", "failed");
  }

  revalidatePath(`/sites/${siteId}/content`);
  redirect(`/sites/${siteId}/content?${searchParams.toString()}`);
}
