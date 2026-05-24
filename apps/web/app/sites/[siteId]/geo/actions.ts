"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { resolveDashboardSite } from "../../../../src/dashboard-shell";
import { createGeoVisibilityReportFromFixture } from "../../../../src/geo-visibility-dashboard";

export async function createGeoVisibilityReportAction(siteId: string, _formData: FormData) {
  const searchParams = new URLSearchParams();
  const site = resolveDashboardSite(siteId);

  try {
    const result = await createGeoVisibilityReportFromFixture(site);
    searchParams.set("geo", result.status);
    if (result.reportId) {
      searchParams.set("reportId", result.reportId);
    }
  } catch {
    searchParams.set("geo", "failed");
  }

  revalidatePath(`/sites/${siteId}/geo`);
  redirect(`/sites/${siteId}/geo?${searchParams.toString()}`);
}
