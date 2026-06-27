"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { ComplianceFlagStatus } from "@searchops/types";

import { loadDashboardSite } from "../../../../src/dashboard-shell";
import {
  convertComplianceFlagToWorkOrder,
  createComplianceReviewFromFixture,
  recheckComplianceFlagWithFixtureRevision,
  updateComplianceFlagStatus
} from "../../../../src/compliance-dashboard";

export async function createComplianceReviewAction(siteId: string, _formData: FormData) {
  const searchParams = new URLSearchParams();
  const site = await loadDashboardSite(siteId);

  try {
    const result = await createComplianceReviewFromFixture(site);
    searchParams.set("review", result.status);
    searchParams.set("flagCount", String(result.flagCount));
  } catch {
    searchParams.set("review", "failed");
  }

  revalidatePath(`/sites/${siteId}/compliance`);
  redirect(`/sites/${siteId}/compliance?${searchParams.toString()}`);
}

export async function createComplianceWorkOrderAction(
  siteId: string,
  flagId: string,
  _formData: FormData,
) {
  const searchParams = new URLSearchParams();

  try {
    const result = await convertComplianceFlagToWorkOrder(flagId);
    searchParams.set("workOrder", result.status);
    searchParams.set("flagId", result.flagId);
    if (result.workOrderId) {
      searchParams.set("workOrderId", result.workOrderId);
    }
  } catch {
    searchParams.set("workOrder", "failed");
    searchParams.set("flagId", flagId);
  }

  revalidatePath(`/sites/${siteId}/compliance`);
  redirect(`/sites/${siteId}/compliance?${searchParams.toString()}`);
}

export async function updateComplianceFlagStatusAction(
  siteId: string,
  flagId: string,
  status: ComplianceFlagStatus,
  _formData: FormData,
) {
  const searchParams = new URLSearchParams();

  try {
    const result = await updateComplianceFlagStatus(flagId, status);
    searchParams.set("statusUpdate", result.status);
    searchParams.set("flagId", result.flagId);
  } catch {
    searchParams.set("statusUpdate", "failed");
    searchParams.set("flagId", flagId);
  }

  revalidatePath(`/sites/${siteId}/compliance`);
  redirect(`/sites/${siteId}/compliance?${searchParams.toString()}`);
}

export async function recheckComplianceFlagAction(
  siteId: string,
  flagId: string,
  _formData: FormData,
) {
  const searchParams = new URLSearchParams();

  try {
    const result = await recheckComplianceFlagWithFixtureRevision(flagId);
    searchParams.set("recheck", result.status);
    searchParams.set("flagId", result.flagId);
    if (result.workOrderStatus) {
      searchParams.set("workOrderStatus", result.workOrderStatus);
    }
  } catch {
    searchParams.set("recheck", "failed");
    searchParams.set("flagId", flagId);
  }

  revalidatePath(`/sites/${siteId}/compliance`);
  redirect(`/sites/${siteId}/compliance?${searchParams.toString()}`);
}
