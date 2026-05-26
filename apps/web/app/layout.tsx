import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "SearchOps AI",
  description: "검색엔진최적화(SEO), 답변엔진최적화(AEO), 생성형 검색최적화(GEO) 자동화 대시보드"
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
