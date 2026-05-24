import { z } from "zod";

import {
  CmsContentUpdatedEventRequestSchema,
  type CmsContentStatus,
  type CmsContentUpdatedEventRequest,
} from "@searchops/types";

export const CmsWebhookProviderSchema = z.enum(["wordpress", "webflow", "headless"]);

export type CmsWebhookProvider = z.infer<typeof CmsWebhookProviderSchema>;

export interface NormalizeCmsWebhookPayloadOptions {
  readonly defaultIndustry?: string | null;
  readonly defaultLocale?: string;
  readonly payload: unknown;
  readonly receivedAt?: string;
  readonly siteDomain?: string;
  readonly siteId: string;
}

const RenderedTextSchema = z.union([
  z.string(),
  z.object({
    rendered: z.string().optional(),
  }),
]);

const WordPressWebhookPayloadSchema = z
  .object({
    content: RenderedTextSchema.optional(),
    date: z.string().optional(),
    date_gmt: z.string().optional(),
    excerpt: RenderedTextSchema.optional(),
    id: z.union([z.number(), z.string()]),
    industry: z.string().min(1).nullable().optional(),
    link: z.string().url().optional(),
    locale: z.string().min(2).optional(),
    modified: z.string().optional(),
    modified_gmt: z.string().optional(),
    status: z.string().optional(),
    title: RenderedTextSchema.optional(),
    url: z.string().url().optional(),
  })
  .passthrough();

const WebflowWebhookPayloadSchema = z
  .object({
    _id: z.string().optional(),
    data: z.record(z.unknown()).optional(),
    fieldData: z.record(z.unknown()).optional(),
    id: z.string().optional(),
    industry: z.string().min(1).nullable().optional(),
    isArchived: z.boolean().optional(),
    isDraft: z.boolean().optional(),
    lastUpdated: z.string().optional(),
    locale: z.string().min(2).optional(),
    name: z.string().optional(),
    payload: z.record(z.unknown()).optional(),
    publishedOn: z.string().nullable().optional(),
    slug: z.string().optional(),
    title: z.string().optional(),
    updatedAt: z.string().optional(),
    url: z.string().url().optional(),
  })
  .passthrough();

const HeadlessWebhookPayloadSchema = z
  .object({
    body: RenderedTextSchema.optional(),
    content: RenderedTextSchema.optional(),
    externalId: z.union([z.number(), z.string()]).optional(),
    id: z.union([z.number(), z.string()]).optional(),
    industry: z.string().min(1).nullable().optional(),
    locale: z.string().min(2).optional(),
    status: z.string().optional(),
    text: z.string().optional(),
    title: z.string().nullable().optional(),
    updated_at: z.string().optional(),
    updatedAt: z.string().optional(),
    url: z.string().url(),
  })
  .passthrough();

export function normalizeCmsWebhookPayload(
  provider: CmsWebhookProvider,
  options: NormalizeCmsWebhookPayloadOptions,
): CmsContentUpdatedEventRequest {
  switch (provider) {
    case "headless":
      return normalizeHeadlessWebhookPayload(options);
    case "webflow":
      return normalizeWebflowWebhookPayload(options);
    case "wordpress":
      return normalizeWordPressWebhookPayload(options);
  }

  throw new Error(`Unsupported CMS webhook provider: ${provider}`);
}

export function normalizeWordPressWebhookPayload({
  defaultIndustry,
  defaultLocale,
  payload,
  receivedAt,
  siteId,
}: NormalizeCmsWebhookPayloadOptions): CmsContentUpdatedEventRequest {
  const input = WordPressWebhookPayloadSchema.parse(payload);
  const title = extractRenderedText(input.title) ?? null;
  const text =
    normalizeText(extractRenderedText(input.content)) ??
    normalizeText(extractRenderedText(input.excerpt)) ??
    normalizeText(title);

  return buildCmsContentUpdatedEvent({
    cmsType: "wordpress",
    defaultIndustry,
    defaultLocale,
    externalId: String(input.id),
    industry: input.industry,
    locale: input.locale,
    receivedAt,
    siteId,
    status: mapCmsStatus(input.status),
    text,
    title,
    updatedAt: input.modified_gmt ?? input.modified ?? input.date_gmt ?? input.date,
    url: input.link ?? input.url,
  });
}

export function normalizeWebflowWebhookPayload({
  defaultIndustry,
  defaultLocale,
  payload,
  receivedAt,
  siteDomain,
  siteId,
}: NormalizeCmsWebhookPayloadOptions): CmsContentUpdatedEventRequest {
  const raw = WebflowWebhookPayloadSchema.parse(payload);
  const input = unwrapWebflowPayload(raw);
  const fieldData = getRecord(input.fieldData) ?? getRecord(input["fieldData"]) ?? {};
  const externalId = getString(input._id) ?? getString(input.id);
  const slug = getString(input.slug) ?? getString(fieldData.slug);
  const title =
    getString(input.title) ??
    getString(input.name) ??
    getString(fieldData.name) ??
    getString(fieldData.title) ??
    null;
  const text =
    normalizeText(getString(fieldData.body)) ??
    normalizeText(getString(fieldData.content)) ??
    normalizeText(getString(fieldData.description)) ??
    normalizeText(title);

  return buildCmsContentUpdatedEvent({
    cmsType: "webflow",
    defaultIndustry,
    defaultLocale,
    externalId,
    industry: getString(input.industry) ?? defaultIndustry,
    locale: getString(input.locale) ?? defaultLocale,
    receivedAt,
    siteId,
    status: mapWebflowStatus(input),
    text,
    title,
    updatedAt:
      getString(input.lastUpdated) ?? getString(input.updatedAt) ?? getString(input.publishedOn),
    url: getString(input.url) ?? getString(fieldData.url) ?? buildUrlFromSlug(siteDomain, slug),
  });
}

export function normalizeHeadlessWebhookPayload({
  defaultIndustry,
  defaultLocale,
  payload,
  receivedAt,
  siteId,
}: NormalizeCmsWebhookPayloadOptions): CmsContentUpdatedEventRequest {
  const input = HeadlessWebhookPayloadSchema.parse(payload);
  const title = input.title ?? null;
  const text =
    normalizeText(input.text) ??
    normalizeText(extractRenderedText(input.body)) ??
    normalizeText(extractRenderedText(input.content)) ??
    normalizeText(title);

  return buildCmsContentUpdatedEvent({
    cmsType: "headless",
    defaultIndustry,
    defaultLocale,
    externalId: String(input.externalId ?? input.id),
    industry: input.industry,
    locale: input.locale,
    receivedAt,
    siteId,
    status: mapCmsStatus(input.status),
    text,
    title,
    updatedAt: input.updatedAt ?? input.updated_at,
    url: input.url,
  });
}

function buildCmsContentUpdatedEvent({
  cmsType,
  defaultIndustry,
  defaultLocale,
  externalId,
  industry,
  locale,
  receivedAt,
  siteId,
  status,
  text,
  title,
  updatedAt,
  url,
}: {
  readonly cmsType: CmsWebhookProvider;
  readonly defaultIndustry: string | null | undefined;
  readonly defaultLocale: string | undefined;
  readonly externalId: string | undefined;
  readonly industry: string | null | undefined;
  readonly locale: string | undefined;
  readonly receivedAt: string | undefined;
  readonly siteId: string;
  readonly status: CmsContentStatus;
  readonly text: string | undefined;
  readonly title: string | null;
  readonly updatedAt: string | undefined;
  readonly url: string | undefined;
}) {
  return CmsContentUpdatedEventRequestSchema.parse({
    cmsType,
    externalId,
    industry: industry ?? defaultIndustry,
    locale: locale ?? defaultLocale,
    siteId,
    status,
    text,
    title,
    updatedAt: toIsoDateTime(updatedAt ?? receivedAt, "updatedAt"),
    url,
  });
}

function unwrapWebflowPayload(input: Record<string, unknown>): Record<string, unknown> {
  return getRecord(input.payload) ?? getRecord(input.data) ?? input;
}

function extractRenderedText(value: unknown) {
  if (typeof value === "string") {
    return normalizeText(value);
  }

  if (value !== null && typeof value === "object" && "rendered" in value) {
    return normalizeText((value as { readonly rendered?: unknown }).rendered);
  }

  return undefined;
}

function normalizeText(value: unknown) {
  if (typeof value !== "string") {
    return undefined;
  }

  const text = value
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/giu, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/giu, " ")
    .replace(/<[^>]+>/gu, " ")
    .replace(/&nbsp;/giu, " ")
    .replace(/&amp;/giu, "&")
    .replace(/&#39;/gu, "'")
    .replace(/&quot;/giu, "\"")
    .replace(/\s+/gu, " ")
    .trim();

  return text.length > 0 ? text : undefined;
}

function mapCmsStatus(status: string | undefined): CmsContentStatus {
  switch (status?.toLowerCase()) {
    case "archive":
    case "archived":
    case "trash":
      return "archived";
    case "publish":
    case "published":
      return "published";
    default:
      return "draft";
  }
}

function mapWebflowStatus(input: Record<string, unknown>): CmsContentStatus {
  if (input.isArchived === true) {
    return "archived";
  }

  if (input.isDraft === true) {
    return "draft";
  }

  return input.publishedOn === null || input.publishedOn === undefined ? "draft" : "published";
}

function buildUrlFromSlug(siteDomain: string | undefined, slug: string | undefined) {
  if (siteDomain === undefined || slug === undefined) {
    return undefined;
  }

  const normalizedDomain = siteDomain.replace(/^https?:\/\//u, "").replace(/\/+$/u, "");
  const normalizedSlug = slug.replace(/^\/+/u, "");
  return `https://${normalizedDomain}/${normalizedSlug}`;
}

function toIsoDateTime(value: string | undefined, fieldName: string) {
  if (value === undefined || value.trim() === "") {
    throw new Error(`CMS webhook ${fieldName} is required.`);
  }

  const normalized = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/u.test(value) ? `${value}Z` : value;
  const parsed = new Date(normalized);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`CMS webhook ${fieldName} must be a valid date.`);
  }

  return parsed.toISOString();
}

function getRecord(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function getString(value: unknown) {
  return typeof value === "string" && value.trim() !== "" ? value : undefined;
}
