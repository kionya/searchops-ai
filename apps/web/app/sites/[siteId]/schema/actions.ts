"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import type { SchemaRecommendationRecord } from "@searchops/types";

import {
  convertSchemaRecommendationToWorkOrder,
  queueSchemaRichResultValidation,
  recheckSchemaRecommendationWithDraft
} from "../../../../src/schema-recommendations";

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

export async function recheckSchemaRecommendationAction(
  siteId: string,
  recommendation: SchemaRecommendationRecord,
  _formData: FormData,
) {
  const searchParams = new URLSearchParams();

  try {
    const result = await recheckSchemaRecommendationWithDraft(recommendation);
    searchParams.set("recheck", result.status);
    searchParams.set("recommendationId", result.recommendationId);
    if (result.workOrderId) {
      searchParams.set("workOrderId", result.workOrderId);
    }
  } catch {
    searchParams.set("recheck", "failed");
    searchParams.set("recommendationId", recommendation.id);
  }

  revalidatePath(`/sites/${siteId}/schema`);
  redirect(`/sites/${siteId}/schema?${searchParams.toString()}`);
}

export async function queueSchemaRichResultValidationAction(
  siteId: string,
  recommendationId: string,
  _formData: FormData,
) {
  const searchParams = new URLSearchParams();

  try {
    const result = await queueSchemaRichResultValidation(recommendationId);
    searchParams.set("richResult", result.status);
    searchParams.set("recommendationId", result.recommendationId);
    if (result.jobId) {
      searchParams.set("jobId", result.jobId);
    }
  } catch {
    searchParams.set("richResult", "failed");
    searchParams.set("recommendationId", recommendationId);
  }

  revalidatePath(`/sites/${siteId}/schema`);
  redirect(`/sites/${siteId}/schema?${searchParams.toString()}`);
}
