"use server";

import { redirect } from "next/navigation";

import {
  clearDeadLetterJob,
  loadDeadLetterReplayPlan,
} from "../../../src/dead-letter-operations";

export async function clearDeadLetterJobAction(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  if (id.length === 0) {
    redirect("/ops/dead-letter?clear=failed");
  }

  const result = await clearDeadLetterJob(id);
  const searchParams = new URLSearchParams({
    clear: result.status,
  });

  if (result.deadLetterJobId) {
    searchParams.set("jobId", result.deadLetterJobId);
  }

  redirect(`/ops/dead-letter?${searchParams.toString()}`);
}

export async function planDeadLetterReplayAction(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  if (id.length === 0) {
    redirect("/ops/dead-letter?replay=failed");
  }

  const result = await loadDeadLetterReplayPlan(id);
  const searchParams = new URLSearchParams({
    replay: result.status,
    replayJobId: id,
  });

  if (result.plan?.id) {
    searchParams.set("planId", result.plan.id);
  }

  redirect(`/ops/dead-letter?${searchParams.toString()}`);
}
