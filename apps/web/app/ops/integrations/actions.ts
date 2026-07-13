"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createGoogleOAuthStartPath } from "../../../src/connector-oauth";
import {
  ProviderAccountClientError,
  canManageProviderAccounts,
  createApiKeyProviderAccount,
  deleteProviderAccount,
  getCurrentProviderUser,
  loadOrganizationSites,
  parseCreateProviderAccountForm,
  parseDeleteProviderAccountForm,
  parseGoogleOAuthStartForm,
  parseReplaceProviderCredentialForm,
  parseUpdateProviderAccountForm,
  replaceProviderAccountCredential,
  updateProviderAccountMetadata,
  type ProviderUserContext,
} from "../../../src/provider-accounts";

const integrationsPath = "/ops/integrations";

export async function createProviderAccountAction(formData: FormData) {
  let status: IntegrationActionStatus = "saved";
  try {
    const context = await requireCredentialManager();
    await createApiKeyProviderAccount(context, parseCreateProviderAccountForm(formData));
    revalidatePath(integrationsPath);
  } catch {
    status = "failed";
  }
  redirectWithStatus(status);
}

export async function replaceProviderCredentialAction(formData: FormData) {
  let status: IntegrationActionStatus = "saved";
  try {
    const context = await requireCredentialManager();
    const input = parseReplaceProviderCredentialForm(formData);
    await replaceProviderAccountCredential(context, input.accountId, input.apiKey);
    revalidatePath(integrationsPath);
  } catch {
    status = "failed";
  }
  redirectWithStatus(status);
}

export async function updateProviderAccountAction(formData: FormData) {
  let status: IntegrationActionStatus = "saved";
  try {
    const context = await requireCredentialManager();
    const input = parseUpdateProviderAccountForm(formData);
    await updateProviderAccountMetadata(context, input.accountId, input.update);
    revalidatePath(integrationsPath);
  } catch {
    status = "failed";
  }
  redirectWithStatus(status);
}

export async function deleteProviderAccountAction(formData: FormData) {
  let status: IntegrationActionStatus = "deleted";
  try {
    const context = await requireCredentialManager();
    const input = parseDeleteProviderAccountForm(formData);
    await deleteProviderAccount(context, input.accountId);
    revalidatePath(integrationsPath);
  } catch (error) {
    status =
      error instanceof ProviderAccountClientError && error.code === "account_in_use"
        ? "account_in_use"
        : "failed";
  }
  redirectWithStatus(status);
}

export async function startGoogleOAuthAction(formData: FormData) {
  let startPath: string | null = null;
  try {
    const context = await requireCredentialManager();
    const input = parseGoogleOAuthStartForm(formData);
    const sites = await loadOrganizationSites(context);
    if (!sites.some((site) => site.id === input.siteId)) {
      throw new ProviderAccountClientError("forbidden");
    }
    startPath = createGoogleOAuthStartPath(
      input.siteId,
      ["gsc", "ga4"],
      integrationsPath,
    );
  } catch {
    startPath = null;
  }
  redirect(startPath ?? `${integrationsPath}?status=failed`);
}

type IntegrationActionStatus = "account_in_use" | "deleted" | "failed" | "saved";

async function requireCredentialManager(): Promise<ProviderUserContext> {
  const context = await getCurrentProviderUser();
  if (!canManageProviderAccounts(context.role)) {
    throw new ProviderAccountClientError("forbidden");
  }
  return context;
}

function redirectWithStatus(status: IntegrationActionStatus): never {
  redirect(`${integrationsPath}?status=${status}`);
}
