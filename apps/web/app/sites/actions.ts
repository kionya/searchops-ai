"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import {
  createSiteInRegistry,
  createSiteRegistrationSearchParams
} from "../../src/site-registry";

export async function createSiteAction(formData: FormData) {
  let redirectTo = "/sites?siteCreate=error&siteCreateMessage=site-registration-failed";

  try {
    const result = await createSiteInRegistry(formData);
    if (result.redirectPath) {
      redirectTo = result.redirectPath;
    } else {
      const searchParams = createSiteRegistrationSearchParams(result.site, result.mode);
      redirectTo = `/sites?${searchParams.toString()}`;
    }
    revalidatePath("/sites");
  } catch (error) {
    const message = error instanceof Error ? error.message : "site-registration-failed";
    const searchParams = new URLSearchParams({
      siteCreate: "error",
      siteCreateMessage: message.slice(0, 80)
    });
    redirectTo = `/sites?${searchParams.toString()}`;
  }

  redirect(redirectTo);
}
