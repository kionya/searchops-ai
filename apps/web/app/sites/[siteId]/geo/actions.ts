"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { resolveDashboardSite } from "../../../../src/dashboard-shell";
import {
  convertGeoVisibilityReportToWorkOrder,
  createGeoVisibilityReportFromFixture,
  queueGeoAnswerMonitorJob
} from "../../../../src/geo-visibility-dashboard";

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

export async function queueGeoAnswerMonitorAction(siteId: string, formData: FormData) {
  const searchParams = new URLSearchParams();
  const site = resolveDashboardSite(siteId);

  try {
    const result = await queueGeoAnswerMonitorJob(site, formData);
    searchParams.set("monitor", result.status);
    searchParams.set("providers", result.providers.join(","));
    searchParams.set("queryCount", String(result.queryCount));
    if (result.jobId) {
      searchParams.set("jobId", result.jobId);
    }
  } catch {
    searchParams.set("monitor", "failed");
  }

  revalidatePath(`/sites/${siteId}/geo`);
  redirect(`/sites/${siteId}/geo?${searchParams.toString()}`);
}

export async function createGeoWorkOrderAction(
  siteId: string,
  reportId: string,
  _formData: FormData,
) {
  const searchParams = new URLSearchParams();

  try {
    const result = await convertGeoVisibilityReportToWorkOrder(reportId);
    searchParams.set("workOrder", result.status);
    searchParams.set("reportId", result.reportId);
    if (result.workOrderId) {
      searchParams.set("workOrderId", result.workOrderId);
    }
  } catch {
    searchParams.set("workOrder", "failed");
    searchParams.set("reportId", reportId);
  }

  revalidatePath(`/sites/${siteId}/geo`);
  redirect(`/sites/${siteId}/geo?${searchParams.toString()}`);
}
