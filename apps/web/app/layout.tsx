import type { Metadata } from "next";
import Script from "next/script";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "SearchOps AI",
  description: "검색엔진최적화(SEO), 답변엔진최적화(AEO), 생성형 검색최적화(GEO) 자동화 대시보드",
  verification: {
    google: "XO6iCCPRtNaESiPjpDjLSC6nTkVojbv9DvblIu0sGJ8"
  }
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ko">
      <body>
        <Script
          src="https://www.googletagmanager.com/gtag/js?id=G-J4S923Y2Z5"
          strategy="afterInteractive"
        />
        <Script id="google-analytics" strategy="afterInteractive">
          {`
            window.dataLayer = window.dataLayer || [];
            function gtag(){window.dataLayer.push(arguments);}
            gtag("js", new Date());
            gtag("config", "G-J4S923Y2Z5");
          `}
        </Script>
        {children}
      </body>
    </html>
  );
}
