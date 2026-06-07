import Link from "next/link";

import {
  mutedTextStyle,
  pageStyle,
  SectionHeader,
} from "../../src/dashboard-shell";

const opsLinks = [
  {
    href: "/ops/readiness",
    title: "출시 준비도",
    description: "credential, hardening, 제품화 잔여 항목을 상태별로 확인합니다.",
  },
  {
    href: "/ops/observability",
    title: "운영 지표",
    description: "API 요청, worker dead-letter, 알림 라우팅 신호를 확인합니다.",
  },
  {
    href: "/ops/dead-letter",
    title: "실패 작업 관리",
    description: "dead-letter metadata와 안전한 replay-plan checklist를 확인합니다.",
  },
  {
    href: "/ops/hardening",
    title: "Production hardening",
    description: "restore drill, migration gate, 운영 실행 계획을 확인합니다.",
  },
];

export default function OperationsHubPage() {
  return (
    <main style={pageStyle}>
      <Link href="/sites" style={{ color: "#2563eb", fontSize: 14, textDecoration: "none" }}>
        사이트 목록으로
      </Link>
      <section style={{ marginTop: 18 }}>
        <SectionHeader
          description="운영자가 배포 전후 확인해야 하는 readiness, metrics, failed jobs, hardening 계획을 한 곳에서 엽니다."
          eyebrow="운영"
          title="운영 허브"
        />
        <div style={opsGridStyle}>
          {opsLinks.map((item) => (
            <Link key={item.href} href={item.href} style={opsLinkStyle}>
              <strong style={{ display: "block", fontSize: 17 }}>{item.title}</strong>
              <span style={{ ...mutedTextStyle, display: "block", fontSize: 13, marginTop: 6 }}>
                {item.description}
              </span>
            </Link>
          ))}
        </div>
      </section>
    </main>
  );
}

const opsGridStyle = {
  display: "grid",
  gap: 12,
  gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 260px), 1fr))",
} as const;

const opsLinkStyle = {
  border: "1px solid #e5e7eb",
  borderRadius: 8,
  color: "#172033",
  display: "block",
  padding: 16,
  textDecoration: "none",
} as const;
