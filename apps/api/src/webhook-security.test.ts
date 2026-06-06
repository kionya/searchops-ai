import { describe, expect, it } from "vitest";

import { CmsContentUpdatedEventRequestSchema } from "@searchops/types";

import {
  createCmsNativeWebhookSignature,
  createCmsWebhookSignature,
  parseCmsWebhookSecrets,
  verifyCmsNativeWebhookSignature,
  verifyCmsWebhookRequest,
  verifyCmsWebhookSignature,
} from "./webhook-security.js";

const event = CmsContentUpdatedEventRequestSchema.parse({
  siteId: "site_seed",
  cmsType: "wordpress",
  externalId: "page_seed",
  url: "https://exampleclinic.com/services/botox",
  text: "This clinic explains risks and consultation steps.",
  updatedAt: "2026-05-24T02:00:00.000Z",
});

describe("CMS webhook security", () => {
  it("creates deterministic HMAC signatures for normalized CMS events", () => {
    const signature = createCmsWebhookSignature({
      event,
      secret: "secret_1",
      timestamp: "2026-05-24T02:00:00.000Z",
    });

    expect(signature).toMatch(/^sha256=[a-f0-9]{64}$/);
    expect(
      createCmsWebhookSignature({
        event,
        secret: "secret_1",
        timestamp: "2026-05-24T02:00:00.000Z",
      }),
    ).toBe(signature);
  });

  it("verifies matching signatures within the replay window", () => {
    const timestamp = "2026-05-24T02:00:00.000Z";
    const signature = createCmsWebhookSignature({ event, secret: "secret_1", timestamp });

    expect(
      verifyCmsWebhookSignature({
        cmsType: "wordpress",
        event,
        now: new Date("2026-05-24T02:04:59.000Z"),
        secret: "secret_1",
        signature,
        timestamp,
      }),
    ).toBe(true);
  });

  it("rejects stale timestamps and mismatched signatures", () => {
    const timestamp = "2026-05-24T02:00:00.000Z";
    const signature = createCmsWebhookSignature({ event, secret: "secret_1", timestamp });

    expect(
      verifyCmsWebhookSignature({
        cmsType: "wordpress",
        event,
        now: new Date("2026-05-24T02:06:00.000Z"),
        secret: "secret_1",
        signature,
        timestamp,
      }),
    ).toBe(false);
    expect(
      verifyCmsWebhookSignature({
        cmsType: "wordpress",
        event,
        now: new Date("2026-05-24T02:01:00.000Z"),
        secret: "wrong_secret",
        signature,
        timestamp,
      }),
    ).toBe(false);
  });

  it("verifies required webhook request headers against provider-specific secrets", () => {
    const timestamp = "2026-05-24T02:00:00.000Z";
    const signature = createCmsWebhookSignature({ event, secret: "secret_1", timestamp });

    expect(
      verifyCmsWebhookRequest({
        event,
        headers: {
          "x-searchops-cms-type": "wordpress",
          "x-searchops-signature": signature,
          "x-searchops-timestamp": timestamp,
        },
        now: new Date("2026-05-24T02:01:00.000Z"),
        required: true,
        secrets: {
          wordpress: "secret_1",
        },
      }),
    ).toEqual({ ok: true, scheme: "searchops_hmac" });
    expect(
      verifyCmsWebhookRequest({
        event,
        headers: {
          "x-searchops-cms-type": "webflow",
          "x-searchops-signature": signature,
          "x-searchops-timestamp": timestamp,
        },
        now: new Date("2026-05-24T02:01:00.000Z"),
        required: true,
        secrets: {
          wordpress: "secret_1",
        },
      }),
    ).toMatchObject({ ok: false });
  });

  it("verifies selected provider native webhook signatures", () => {
    const timestamp = "2026-05-24T02:00:00.000Z";
    const wordpressPayload = {
      id: 101,
      link: "https://exampleclinic.com/services/botox",
      modified_gmt: "2026-05-24T02:00:00",
      status: "publish",
    };
    const wordpressSignature = createCmsNativeWebhookSignature({
      cmsType: "wordpress",
      payload: wordpressPayload,
      secret: "secret_1",
      timestamp,
    });
    const webflowPayload = {
      payload: {
        _id: "wf_201",
        fieldData: {
          slug: "services/laser-care",
        },
        lastUpdated: "2026-05-24T03:00:00.000Z",
      },
    };
    const webflowSignature = createCmsNativeWebhookSignature({
      cmsType: "webflow",
      payload: webflowPayload,
      secret: "secret_2",
      timestamp,
    });

    expect(
      verifyCmsNativeWebhookSignature({
        cmsType: "wordpress",
        headers: {
          "x-wp-webhook-signature": wordpressSignature,
          "x-wp-webhook-timestamp": timestamp,
        },
        now: new Date("2026-05-24T02:01:00.000Z"),
        payload: wordpressPayload,
        secret: "secret_1",
      }),
    ).toEqual({ ok: true, scheme: "wordpress_native" });
    expect(
      verifyCmsNativeWebhookSignature({
        cmsType: "webflow",
        headers: {
          "x-webflow-signature": webflowSignature.replace("sha256=", ""),
          "x-webflow-timestamp": timestamp,
        },
        now: new Date("2026-05-24T02:01:00.000Z"),
        payload: webflowPayload,
        secret: "secret_2",
      }),
    ).toEqual({ ok: true, scheme: "webflow_native" });
    expect(() =>
      createCmsNativeWebhookSignature({
        cmsType: "headless",
        payload: {},
        secret: "secret_3",
        timestamp,
      }),
    ).toThrow("not supported");
  });

  it("accepts native webhook signatures as a provider-route fallback", () => {
    const timestamp = "2026-05-24T02:00:00.000Z";
    const payload = {
      id: 101,
      link: "https://exampleclinic.com/services/botox",
      modified_gmt: "2026-05-24T02:00:00",
      status: "publish",
    };
    const signature = createCmsNativeWebhookSignature({
      cmsType: "wordpress",
      payload,
      secret: "secret_1",
      timestamp,
    });

    expect(
      verifyCmsWebhookRequest({
        allowNativeProviderSignature: true,
        event,
        headers: {
          "x-wp-webhook-signature": signature,
          "x-wp-webhook-timestamp": timestamp,
        },
        nativePayload: payload,
        now: new Date("2026-05-24T02:01:00.000Z"),
        required: true,
        secrets: {
          wordpress: "secret_1",
        },
      }),
    ).toEqual({ ok: true, scheme: "wordpress_native" });
    expect(
      verifyCmsWebhookRequest({
        event,
        headers: {
          "x-wp-webhook-signature": signature,
          "x-wp-webhook-timestamp": timestamp,
        },
        nativePayload: payload,
        now: new Date("2026-05-24T02:01:00.000Z"),
        required: true,
        secrets: {
          wordpress: "secret_1",
        },
      }),
    ).toMatchObject({ ok: false });
  });

  it("parses JSON webhook secret maps", () => {
    expect(parseCmsWebhookSecrets('{"wordpress":"secret_1","webflow":"secret_2"}')).toEqual({
      webflow: "secret_2",
      wordpress: "secret_1",
    });
    expect(parseCmsWebhookSecrets(undefined)).toEqual({});
    expect(() => parseCmsWebhookSecrets("[]")).toThrow("JSON object");
  });
});
