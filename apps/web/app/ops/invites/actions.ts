"use server";

import { redirect } from "next/navigation";

import { InvitationRoleSchema } from "@searchops/types";

import { createInvitation, revokeInvitation } from "../../../src/invite-operations";

export async function createInvitationAction(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim();
  const roleResult = InvitationRoleSchema.safeParse(String(formData.get("role") ?? "viewer"));
  if (email.length === 0 || !roleResult.success) {
    redirect("/ops/invites?create=failed");
  }

  const result = await createInvitation(email, roleResult.data);
  const params = new URLSearchParams({ create: result.status });
  if (result.invitationId) {
    params.set("inviteId", result.invitationId);
  }
  redirect(`/ops/invites?${params.toString()}`);
}

export async function revokeInvitationAction(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  if (id.length === 0) {
    redirect("/ops/invites?revoke=failed");
  }

  const result = await revokeInvitation(id);
  const params = new URLSearchParams({ revoke: result.status });
  if (result.invitationId) {
    params.set("inviteId", result.invitationId);
  }
  redirect(`/ops/invites?${params.toString()}`);
}
