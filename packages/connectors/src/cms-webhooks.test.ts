import { describe, expect, it } from "vitest";

import {
  CmsWebhookProviderSchema,
  normalizeCmsWebhookPayload,
  normalizeHeadlessWebhookPayload,
  normalizeWebflowWebhookPayload,
  normalizeWordPressWebhookPayload,
} from "./cms-webhooks.js";

describe("CMS webhook payload adapters", () => {
  it("normalizes WordPress webhook payloads into CMS content events", () => {
    const event = normalizeWordPressWebhookPayload({
      defaultIndustry: "medical",
      defaultLocale: "ko-KR",
      payload: {
        content: {
          rendered:
            "<p>This page explains consultation steps, risks, and individual variation.</p>",
        },
        id: 101,
        link: "https://exampleclinic.com/services/botox",
        modified_gmt: "2026-05-24T02:00:00",
        status: "publish",
        title: {
          rendered: "Botox guide",
        },
      },
      siteId: "site_seed",
    });

    expect(event).toEqual({
      cmsType: "wordpress",
      externalId: "101",
      industry: "medical",
      locale: "ko-KR",
      provider: "cms",
      siteId: "site_seed",
      source: "cms",
      status: "published",
      text: "This page explains consultation steps, risks, and individual variation.",
      title: "Botox guide",
      updatedAt: "2026-05-24T02:00:00.000Z",
      url: "https://exampleclinic.com/services/botox",
    });
  });

  it("normalizes Webflow webhook payloads from nested fieldData", () => {
    const event = normalizeWebflowWebhookPayload({
      defaultLocale: "ko-KR",
      payload: {
        payload: {
          _id: "wf_201",
          fieldData: {
            body: "<article>Revised service copy with risks and recovery details.</article>",
            name: "Laser care",
            slug: "services/laser-care",
          },
          isDraft: false,
          lastUpdated: "2026-05-24T03:00:00.000Z",
          publishedOn: "2026-05-24T03:00:00.000Z",
        },
      },
      siteDomain: "exampleclinic.com",
      siteId: "site_seed",
    });

    expect(event).toMatchObject({
      cmsType: "webflow",
      externalId: "wf_201",
      locale: "ko-KR",
      status: "published",
      text: "Revised service copy with risks and recovery details.",
      title: "Laser care",
      url: "https://exampleclinic.com/services/laser-care",
    });
  });

  it("normalizes generic headless CMS payloads without live fetches", () => {
    const event = normalizeHeadlessWebhookPayload({
      payload: {
        externalId: "entry_301",
        status: "archived",
        text: "Archived content body retained for compliance history.",
        title: "Old promotion",
        updated_at: "2026-05-24T04:00:00+09:00",
        url: "https://exampleclinic.com/promotions/old",
      },
      siteId: "site_seed",
    });

    expect(event).toMatchObject({
      cmsType: "headless",
      externalId: "entry_301",
      status: "archived",
      updatedAt: "2026-05-23T19:00:00.000Z",
    });
  });

  it("dispatches provider adapters through a common normalizer", () => {
    const event = normalizeCmsWebhookPayload("headless", {
      payload: {
        id: 401,
        text: "Updated headless CMS body.",
        updatedAt: "2026-05-24T05:00:00.000Z",
        url: "https://exampleclinic.com/blog/headless",
      },
      siteId: "site_seed",
    });

    expect(CmsWebhookProviderSchema.options).toEqual(["wordpress", "webflow", "headless"]);
    expect(event).toMatchObject({
      cmsType: "headless",
      externalId: "401",
      text: "Updated headless CMS body.",
    });
  });

  it("rejects incomplete provider payloads before API side effects", () => {
    expect(() =>
      normalizeCmsWebhookPayload("wordpress", {
        payload: {
          content: "<p>No URL.</p>",
          id: 999,
          modified_gmt: "2026-05-24T02:00:00",
        },
        siteId: "site_seed",
      }),
    ).toThrow();
  });
});
