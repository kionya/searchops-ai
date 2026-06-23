import { afterEach, describe, expect, it, vi } from "vitest";

import {
  createDemoInviteOperations,
  createInvitation,
  getInviteCreateFeedback,
  getInviteRevokeFeedback,
  loadInviteOperations,
  revokeInvitation,
  summarizeInvitations,
} from "./invite-operations";

describe("invite operations", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("summarizes invitation fixtures and falls back to demo without an API base url", () => {
    const operations = createDemoInviteOperations();
    expect(operations.source).toBe("fixture");
    expect(operations.invitations).toHaveLength(1);
    expect(summarizeInvitations(operations.invitations)).toEqual({
      total: 1,
      pending: 1,
      accepted: 0,
      revoked: 0,
    });
  });

  it("formats create and revoke feedback", () => {
    expect(getInviteCreateFeedback("ok", "invite_9")?.tone).toBe("success");
    expect(getInviteCreateFeedback("fixture", undefined)?.tone).toBe("info");
    expect(getInviteRevokeFeedback("not_found", undefined)?.tone).toBe("warning");
    expect(getInviteCreateFeedback(undefined, undefined)).toBeNull();
  });

  it("loads invitations through the org-scoped API contract", async () => {
    vi.stubEnv("SEARCHOPS_API_BASE_URL", "https://api.searchops.test");
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        expect(String(input)).toBe("https://api.searchops.test/organizations/org_demo/invites");
        return Response.json({
          invitations: [
            {
              id: "invite_1",
              organizationId: "org_demo",
              email: "a@example.com",
              role: "editor",
              status: "pending",
              invitedByUserId: "user_demo_owner",
              createdAt: "2026-06-23T00:00:00.000Z",
              expiresAt: "2026-06-30T00:00:00.000Z",
              acceptedAt: null,
            },
          ],
        });
      }),
    );

    const operations = await loadInviteOperations();
    expect(operations.source).toBe("api");
    expect(operations.summary.pending).toBe(1);
  });

  it("creates and revokes invitations via the API", async () => {
    vi.stubEnv("SEARCHOPS_API_BASE_URL", "https://api.searchops.test");
    const invitation = {
      id: "invite_2",
      organizationId: "org_demo",
      email: "b@example.com",
      role: "viewer",
      status: "pending",
      invitedByUserId: "user_demo_owner",
      createdAt: "2026-06-23T00:00:00.000Z",
      expiresAt: "2026-06-30T00:00:00.000Z",
      acceptedAt: null,
    };
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        expect(String(input)).toBe("https://api.searchops.test/organizations/org_demo/invites");
        expect(init?.method).toBe("POST");
        return Response.json(invitation, { status: 201 });
      }),
    );
    const created = await createInvitation("b@example.com", "viewer");
    expect(created.status).toBe("ok");
    expect(created.invitationId).toBe("invite_2");

    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        expect(String(input)).toBe(
          "https://api.searchops.test/organizations/org_demo/invites/invite_2/revoke",
        );
        return Response.json({ ...invitation, status: "revoked" });
      }),
    );
    const revoked = await revokeInvitation("invite_2");
    expect(revoked.status).toBe("ok");
  });
});
