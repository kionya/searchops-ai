import {
  InvitationListResponseSchema,
  InvitationSchema,
  type Invitation,
  type InvitationRole,
  type InvitationStatus,
} from "@searchops/types";

import { apiFetch } from "./api-client";
import { getApiBaseUrl } from "./api-base-url";
import { defaultOrganizationId } from "./site-registry";

export type InviteOperationsSource = "api" | "fixture";
export type InviteWriteStatus = "ok" | "failed" | "fixture" | "conflict" | "not_found";

export interface InviteOperationsData {
  readonly invitations: readonly Invitation[];
  readonly errorMessage: string | null;
  readonly source: InviteOperationsSource;
  readonly summary: InviteOperationsSummary;
}

export interface InviteOperationsSummary {
  readonly total: number;
  readonly pending: number;
  readonly accepted: number;
  readonly revoked: number;
}

export interface InviteWriteResult {
  readonly errorMessage: string | null;
  readonly invitationId: string | null;
  readonly source: InviteOperationsSource;
  readonly status: InviteWriteStatus;
}

export interface InviteFeedback {
  readonly message: string;
  readonly tone: "info" | "success" | "warning";
}

export const invitationRoles: readonly InvitationRole[] = ["viewer", "editor", "admin", "owner"];

export const demoInvitations: Invitation[] = [
  {
    id: "invite_demo_1",
    organizationId: defaultOrganizationId,
    email: "newmember@example.com",
    role: "editor",
    status: "pending",
    invitedByUserId: "user_demo_owner",
    createdAt: "2026-06-23T00:00:00.000Z",
    expiresAt: "2026-06-30T00:00:00.000Z",
    acceptedAt: null,
  },
];

export async function loadInviteOperations(): Promise<InviteOperationsData> {
  const apiBaseUrl = getApiBaseUrl();
  if (apiBaseUrl === null) {
    return createDemoInviteOperations();
  }

  try {
    const response = await apiFetch(
      `${apiBaseUrl}/organizations/${defaultOrganizationId}/invites`,
      { cache: "no-store" },
    );
    if (!response.ok) {
      throw new Error(`초대 목록 조회 실패: ${response.status}`);
    }

    const output = InvitationListResponseSchema.parse(await response.json());
    return {
      invitations: output.invitations,
      errorMessage: null,
      source: "api",
      summary: summarizeInvitations(output.invitations),
    };
  } catch (error) {
    const fallback = createDemoInviteOperations();
    return {
      ...fallback,
      errorMessage: error instanceof Error ? error.message : "초대 목록 조회에 실패했습니다",
    };
  }
}

export async function createInvitation(
  email: string,
  role: InvitationRole,
): Promise<InviteWriteResult> {
  const apiBaseUrl = getApiBaseUrl();
  if (apiBaseUrl === null) {
    return { errorMessage: null, invitationId: null, source: "fixture", status: "fixture" };
  }

  try {
    const response = await apiFetch(
      `${apiBaseUrl}/organizations/${defaultOrganizationId}/invites`,
      {
        body: JSON.stringify({ email, role }),
        cache: "no-store",
        headers: { "content-type": "application/json" },
        method: "POST",
      },
    );
    if (!response.ok) {
      throw new Error(`초대 생성 실패: ${response.status}`);
    }

    const invitation = InvitationSchema.parse(await response.json());
    return { errorMessage: null, invitationId: invitation.id, source: "api", status: "ok" };
  } catch (error) {
    return {
      errorMessage: error instanceof Error ? error.message : "초대 생성에 실패했습니다",
      invitationId: null,
      source: "api",
      status: "failed",
    };
  }
}

export async function revokeInvitation(invitationId: string): Promise<InviteWriteResult> {
  const apiBaseUrl = getApiBaseUrl();
  if (apiBaseUrl === null) {
    return { errorMessage: null, invitationId, source: "fixture", status: "fixture" };
  }

  try {
    const response = await apiFetch(
      `${apiBaseUrl}/organizations/${defaultOrganizationId}/invites/${encodeURIComponent(invitationId)}/revoke`,
      { cache: "no-store", method: "POST" },
    );
    if (response.status === 404) {
      return { errorMessage: null, invitationId, source: "api", status: "not_found" };
    }
    if (!response.ok) {
      throw new Error(`초대 철회 실패: ${response.status}`);
    }

    const invitation = InvitationSchema.parse(await response.json());
    return { errorMessage: null, invitationId: invitation.id, source: "api", status: "ok" };
  } catch (error) {
    return {
      errorMessage: error instanceof Error ? error.message : "초대 철회에 실패했습니다",
      invitationId,
      source: "api",
      status: "failed",
    };
  }
}

export function createDemoInviteOperations(): InviteOperationsData {
  return {
    invitations: demoInvitations,
    errorMessage: null,
    source: "fixture",
    summary: summarizeInvitations(demoInvitations),
  };
}

export function summarizeInvitations(
  invitations: readonly Invitation[],
): InviteOperationsSummary {
  const byStatus = (status: InvitationStatus) =>
    invitations.filter((invitation) => invitation.status === status).length;
  return {
    total: invitations.length,
    pending: byStatus("pending"),
    accepted: byStatus("accepted"),
    revoked: byStatus("revoked"),
  };
}

export function getInviteCreateFeedback(
  status: string | undefined,
  invitationId: string | undefined,
): InviteFeedback | null {
  if (status === "ok") {
    return {
      message: invitationId
        ? `초대를 생성했습니다: ${invitationId} (수락 링크는 이메일/서버 로그로 전달)`
        : "초대를 생성했습니다.",
      tone: "success",
    };
  }
  if (status === "fixture") {
    return {
      message: "데모 데이터 모드: 실제 초대를 만들려면 SEARCHOPS_API_BASE_URL을 설정하세요.",
      tone: "info",
    };
  }
  if (status === "failed") {
    return {
      message: "초대 생성에 실패했습니다. 이메일 형식·권한(admin/owner)·API 서버를 확인하세요.",
      tone: "warning",
    };
  }
  return null;
}

export function getInviteRevokeFeedback(
  status: string | undefined,
  invitationId: string | undefined,
): InviteFeedback | null {
  if (status === "ok") {
    return {
      message: invitationId ? `초대를 철회했습니다: ${invitationId}` : "초대를 철회했습니다.",
      tone: "success",
    };
  }
  if (status === "not_found") {
    return { message: "철회할 초대를 찾지 못했습니다.", tone: "warning" };
  }
  if (status === "fixture") {
    return {
      message: "데모 데이터 모드: 실제 철회는 SEARCHOPS_API_BASE_URL 설정 후 가능합니다.",
      tone: "info",
    };
  }
  if (status === "failed") {
    return {
      message: "초대 철회에 실패했습니다. 권한과 API 서버를 확인하세요.",
      tone: "warning",
    };
  }
  return null;
}

export function formatInviteDate(isoDate: string | null) {
  return isoDate ? isoDate.replace("T", " ").slice(0, 16) : "-";
}
