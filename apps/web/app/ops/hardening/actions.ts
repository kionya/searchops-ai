"use server";

import { redirect } from "next/navigation";

import { runBackupRestoreDrill } from "../../../src/operations-hardening-dashboard";

export async function runBackupRestoreDrillAction(formData: FormData) {
  const environment = String(formData.get("environment") ?? "production").trim() || "production";
  const dryRun = String(formData.get("dryRun") ?? "true") !== "false";
  const result = await runBackupRestoreDrill({ dryRun, environment });
  const searchParams = new URLSearchParams({
    restore: result.status,
  });

  if (result.planId) {
    searchParams.set("planId", result.planId);
  }

  redirect(`/ops/hardening?${searchParams.toString()}`);
}
