import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";

export interface LegalSection {
  readonly heading: string;
  readonly body: ReactNode;
}

export interface LegalDocumentProps {
  readonly title: string;
  readonly effectiveDate: string;
  readonly intro: ReactNode;
  readonly sections: readonly LegalSection[];
  readonly relatedHref: string;
  readonly relatedLabel: string;
}

/**
 * 공개 법무 문서(개인정보처리방침·이용약관) 공용 셸. 대시보드 셸과 분리된 단순 정적
 * 레이아웃. 내용은 표준 템플릿이며 운영 게시 전 법무 검토가 필요하다.
 */
export function LegalDocument({
  title,
  effectiveDate,
  intro,
  sections,
  relatedHref,
  relatedLabel,
}: LegalDocumentProps) {
  return (
    <main style={pageStyle}>
      <div style={containerStyle}>
        <Link href="/" style={brandLinkStyle}>
          ← SearchOps AI
        </Link>
        <h1 style={titleStyle}>{title}</h1>
        <p style={metaStyle}>시행일: {effectiveDate}</p>
        <div style={noticeStyle}>
          ⚠️ 본 문서는 표준 템플릿을 기반으로 작성되었습니다. 운영 게시 전 <strong>법무 검토</strong>를 권장합니다.
        </div>
        <div style={introStyle}>{intro}</div>
        {sections.map((section, index) => (
          <section key={section.heading} style={sectionStyle}>
            <h2 style={headingStyle}>
              제{index + 1}조 ({section.heading})
            </h2>
            <div style={bodyStyle}>{section.body}</div>
          </section>
        ))}
        <nav style={navStyle}>
          <Link href={relatedHref} style={navLinkStyle}>
            {relatedLabel} →
          </Link>
          <Link href="/" style={navLinkStyle}>
            홈으로
          </Link>
        </nav>
      </div>
    </main>
  );
}

const pageStyle: CSSProperties = {
  background: "#f8fafc",
  color: "#0f172a",
  minHeight: "100vh",
  padding: "48px 20px",
};

const containerStyle: CSSProperties = {
  background: "#ffffff",
  border: "1px solid #e2e8f0",
  borderRadius: 14,
  margin: "0 auto",
  maxWidth: 820,
  padding: "40px clamp(20px, 5vw, 48px)",
};

const brandLinkStyle: CSSProperties = {
  color: "#1d4ed8",
  fontSize: 14,
  fontWeight: 700,
  textDecoration: "none",
};

const titleStyle: CSSProperties = {
  fontSize: 28,
  fontWeight: 800,
  letterSpacing: -0.4,
  margin: "16px 0 6px",
};

const metaStyle: CSSProperties = {
  color: "#64748b",
  fontSize: 13,
  margin: 0,
};

const noticeStyle: CSSProperties = {
  background: "#fff7ed",
  border: "1px solid #fed7aa",
  borderRadius: 8,
  color: "#9a3412",
  fontSize: 13,
  lineHeight: 1.6,
  margin: "20px 0 8px",
  padding: "12px 14px",
};

const introStyle: CSSProperties = {
  color: "#334155",
  fontSize: 15,
  lineHeight: 1.75,
  margin: "16px 0 8px",
};

const sectionStyle: CSSProperties = {
  marginTop: 28,
};

const headingStyle: CSSProperties = {
  fontSize: 17,
  fontWeight: 700,
  margin: "0 0 10px",
};

const bodyStyle: CSSProperties = {
  color: "#334155",
  fontSize: 14.5,
  lineHeight: 1.8,
};

const navStyle: CSSProperties = {
  borderTop: "1px solid #e2e8f0",
  display: "flex",
  gap: 20,
  marginTop: 40,
  paddingTop: 20,
};

const navLinkStyle: CSSProperties = {
  color: "#1d4ed8",
  fontSize: 14,
  fontWeight: 600,
  textDecoration: "none",
};
