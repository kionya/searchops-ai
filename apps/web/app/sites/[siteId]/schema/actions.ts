"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { convertSchemaRecommendationToWorkOrder } from "../../../../src/schema-recommendations";

export async function createSchemaWorkOrderAction(
  siteId: string,
  recommendationId: string,
  _formData: FormData,
) {
  const searchParams = new URLSearchParams();

  try {
    const result = await convertSchemaRecommendationToWorkOrder(recommendationId);
    searchParams.set("schema", result.status);
    searchParams.set("recommendationId", result.recommendationId);
    if (result.workOrderId) {
      searchParams.set("workOrderId", result.workOrderId);
    }
  } catch {
    searchParams.set("schema", "failed");
    searchParams.set("recommendationId", recommendationId);
  }

  revalidatePath(`/sites/${siteId}/schema`);
  redirect(`/sites/${siteId}/schema?${searchParams.toString()}`);
}
