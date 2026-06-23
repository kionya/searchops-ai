import Link from "next/link";

import {
  AppWorkspaceFrame,
  MetricCard,
  metricGridStyle,
  mutedTextStyle,
  SectionHeader,
} from "../../../src/dashboard-shell";
import {
  codeTextStyle,
  pillStyle,
  tableHeaderStyle,
  tableScrollStyle,
  tableSectionStyle,
  tableStyle,
  tdStyle,
  thStyle,
} from "../../../src/dashboard-table-styles";
import {
  formatInviteDate,
  getInviteCreateFeedback,
  getInviteRevokeFeedback,
  invitationRoles,
  loadInviteOperations,
} from "../../../src/invite-operations";
import { createInvitationAction, revokeInvitationAction } from "./actions";

export const dynamic = "force-dynamic";

interface InvitesPageProps {
  readonly searchParams: Promise<{
    readonly create?: string;
    readonly revoke?: string;
    readonly inviteId?: string;
  }>;
}

const statusTone: Record<string, { background: string; color: string }> = {
  accepted: { background: "#ecfdf5", color: "#047857" },
  expired: { background: "#f8fafc", color: "#475569" },
  pending: { background: "#eff6ff", color: "#1d4ed8" },
  revoked: { background: "#fef2f2", color: "#b91c1c" },
};

export default async function OrganizationInvitesPage({ searchParams }: InvitesPageProps) {
  const params = await searchParams;
  const operations = await loadInviteOperations();
  const createFeedback = getInviteCreateFeedback(params.create, params.inviteId);
  const revokeFeedback = getInviteRevokeFeedback(params.revoke, params.inviteId);

  return (
    <AppWorkspaceFrame
      actions={
        <Link className="searchops-button secondary" href="/ops">
          운영 콘솔로
        </Link>
      }
      description="조직 멤버 초대를 생성·확인·철회합니다. 수락 링크는 이메일(미설정 시 서버 로그)로 전달됩니다."
      eyebrow="Operations"
      title="초대 관리"
    >
      <section aria-labelledby="invites-heading">
        <SectionHeader
          description="조직 멤버 초대를 생성·확인·철회합니다. 생성·철회는 admin/owner 권한이 필요합니다."
          eyebrow="운영"
          title="조직 초대 관리"
        />
        <div style={metricGridStyle}>
          <MetricCard label="전체 초대" value={String(operations.summary.total)} />
          <MetricCard label="대기 중(pending)" value={String(operations.summary.pending)} />
          <MetricCard label="수락됨(accepted)" value={String(operations.summary.accepted)} />
          <MetricCard label="철회됨(revoked)" value={String(operations.summary.revoked)} />
        </div>

        <section aria-label="초대 생성" style={tableSectionStyle}>
          <header style={tableHeaderStyle}>
            <div>
              <h3 style={{ fontSize: 18, margin: 0 }}>새 초대 생성</h3>
              <p style={{ ...mutedTextStyle, fontSize: 13, marginTop: 6 }}>
                이메일과 역할을 입력하면 단명 토큰 초대가 생성됩니다.
              </p>
              {createFeedback ? (
                <p style={{ ...feedbackStyle[createFeedback.tone], margin: "8px 0 0" }}>
                  {createFeedback.message}
                </p>
              ) : null}
            </div>
          </header>
          <form action={createInvitationAction} style={formStyle}>
            <input
              aria-label="초대 이메일"
              name="email"
              placeholder="member@example.com"
              required
              style={inputStyle}
              type="email"
            />
            <select aria-label="역할" defaultValue="viewer" name="role" style={inputStyle}>
              {invitationRoles.map((role) => (
                <option key={role} value={role}>
                  {role}
                </option>
              ))}
            </select>
            <button style={primaryButtonStyle} type="submit">
              초대 생성
            </button>
          </form>
        </section>

        <section aria-label="초대 목록" style={tableSectionStyle}>
          <header style={tableHeaderStyle}>
            <div>
              <h3 style={{ fontSize: 18, margin: 0 }}>초대 목록</h3>
              {operations.errorMessage ? (
                <p style={{ color: "#b91c1c", fontSize: 13, margin: "6px 0 0" }}>
                  API 연결 실패: {operations.errorMessage}
                </p>
              ) : null}
              {revokeFeedback ? (
                <p style={{ ...feedbackStyle[revokeFeedback.tone], margin: "8px 0 0" }}>
                  {revokeFeedback.message}
                </p>
              ) : null}
            </div>
            <span
              style={{
                ...pillStyle,
                background: operations.source === "api" ? "#ecfdf5" : "#eef2ff",
                color: operations.source === "api" ? "#047857" : "#3730a3",
              }}
            >
              {operations.source === "api" ? "API 데이터" : "데모 데이터"}
            </span>
          </header>
          <div style={tableScrollStyle}>
            <table style={{ ...tableStyle, minWidth: 900 }}>
              <thead>
                <tr>
                  <th style={thStyle}>이메일</th>
                  <th style={thStyle}>역할</th>
                  <th style={thStyle}>상태</th>
                  <th style={thStyle}>생성</th>
                  <th style={thStyle}>만료</th>
                  <th style={thStyle}>작업</th>
                </tr>
              </thead>
              <tbody>
                {operations.invitations.map((invitation) => (
                  <tr key={invitation.id}>
                    <td style={tdStyle}>
                      <strong>{invitation.email}</strong>
                      <span style={{ ...codeTextStyle, color: "#64748b", display: "block", marginTop: 3 }}>
                        {invitation.id}
                      </span>
                    </td>
                    <td style={tdStyle}>{invitation.role}</td>
                    <td style={tdStyle}>
                      <span style={{ ...pillStyle, ...(statusTone[invitation.status] ?? statusTone.expired) }}>
                        {invitation.status}
                      </span>
                    </td>
                    <td style={tdStyle}>{formatInviteDate(invitation.createdAt)}</td>
                    <td style={tdStyle}>{formatInviteDate(invitation.expiresAt)}</td>
                    <td style={tdStyle}>
                      {invitation.status === "pending" ? (
                        <form action={revokeInvitationAction}>
                          <input name="id" type="hidden" value={invitation.id} />
                          <button style={dangerButtonStyle} type="submit">
                            철회
                          </button>
                        </form>
                      ) : (
                        <span style={{ ...mutedTextStyle, fontSize: 13 }}>-</span>
                      )}
                    </td>
                  </tr>
                ))}
                {operations.invitations.length === 0 ? (
                  <tr>
                    <td colSpan={6} style={{ ...tdStyle, ...mutedTextStyle }}>
                      초대가 없습니다. 위에서 새 초대를 생성하세요.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </section>
      </section>
    </AppWorkspaceFrame>
  );
}

const formStyle = {
  alignItems: "center",
  display: "flex",
  flexWrap: "wrap",
  gap: 10,
  padding: "12px 16px",
} as const;

const inputStyle = {
  border: "1px solid #dbe4ef",
  borderRadius: 8,
  fontSize: 14,
  minHeight: 38,
  padding: "8px 12px",
} as const;

const primaryButtonStyle = {
  background: "#111827",
  border: "1px solid #111827",
  borderRadius: 8,
  color: "#ffffff",
  cursor: "pointer",
  fontSize: 13,
  fontWeight: 800,
  minHeight: 38,
  padding: "8px 16px",
} as const;

const dangerButtonStyle = {
  background: "#ffffff",
  border: "1px solid #fca5a5",
  borderRadius: 8,
  color: "#b91c1c",
  cursor: "pointer",
  fontSize: 13,
  fontWeight: 800,
  minHeight: 34,
  padding: "8px 12px",
} as const;

const feedbackStyle = {
  info: { color: "#3730a3", fontSize: 13 },
  success: { color: "#047857", fontSize: 13 },
  warning: { color: "#b91c1c", fontSize: 13 },
} as const;
