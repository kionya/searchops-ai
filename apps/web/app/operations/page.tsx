import Link from "next/link";

import {
  mutedTextStyle,
  pageStyle,
  SectionHeader,
} from "../../src/dashboard-shell";

const opsLinks = [
  {
    description: "요청 지표, worker 실패 요약, alert export 상태를 확인합니다.",
    href: "/ops/observability",
    title: "관측성",
  },
  {
    description: "실패한 queue job을 확인하고 안전한 정리/replay 흐름으로 이동합니다.",
    href: "/ops/dead-letter",
    title: "실패 작업 관리",
  },
  {
    description: "provider credential, 운영 자동화, 제품화 후속 항목을 추적합니다.",
    href: "/ops/readiness",
    title: "출시 준비도",
  },
];

export default function OperationsPage() {
  return (
    <main style={pageStyle}>
      <Link href="/sites" style={{ color: "#2563eb", fontSize: 14, textDecoration: "none" }}>
        사이트 목록으로
      </Link>
      <section style={{ marginTop: 18 }}>
        <SectionHeader
          description="운영자가 배포 상태, 실패 작업, 출시 전 남은 항목을 빠르게 확인하는 화면입니다."
          eyebrow="운영"
          title="운영 대시보드"
        />
        <div style={opsGridStyle}>
          {opsLinks.map((link) => (
            <Link href={link.href} key={link.href} style={opsCardStyle}>
              <strong style={{ color: "#0f172a", display: "block", fontSize: 18 }}>
                {link.title}
              </strong>
              <span style={{ ...mutedTextStyle, display: "block", fontSize: 13, marginTop: 8 }}>
                {link.description}
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
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
  marginTop: 18,
} as const;

const opsCardStyle = {
  border: "1px solid #e5e7eb",
  borderRadius: 8,
  display: "block",
  minHeight: 118,
  padding: 16,
  textDecoration: "none",
} as const;
