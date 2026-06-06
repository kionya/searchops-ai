import type { Metadata } from "next";
import Script from "next/script";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "SearchOps AI",
  description: "검색엔진최적화(SEO), 답변엔진최적화(AEO), 생성형 검색최적화(GEO) 자동화 대시보드",
  verification: {
    google: "XO6iCCPRtNaESiPjpDjLSC6nTkVojbv9DvblIu0sGJ8",
    other: {
      "msvalidate.01": "2146744F9321702CC14B8388BF640471"
    }
  }
};

const isProduction = process.env.NODE_ENV === "production";
const gtmId = process.env.SEARCHOPS_GTM_ID ?? (isProduction ? "GTM-NRXJR3JB" : "");
const gaId = process.env.SEARCHOPS_GA_ID ?? (isProduction ? "G-J4S923Y2Z5" : "");

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ko">
      <head />
      <body>
        {isProduction && gtmId ? (
          <>
            <noscript>
              <iframe
                src={`https://www.googletagmanager.com/ns.html?id=${gtmId}`}
                height="0"
                width="0"
                style={{ display: "none", visibility: "hidden" }}
              />
            </noscript>
            <Script id="searchops-gtm" strategy="afterInteractive">
              {`
                (function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':
                new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],
                j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=
                'https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);
                })(window,document,'script','dataLayer','${gtmId}');
              `}
            </Script>
          </>
        ) : null}
        {isProduction && gaId ? (
          <>
            <Script
              async
              src={`https://www.googletagmanager.com/gtag/js?id=${gaId}`}
              strategy="afterInteractive"
            />
            <Script id="searchops-ga" strategy="afterInteractive">
              {`
                window.dataLayer = window.dataLayer || [];
                function gtag(){window.dataLayer.push(arguments);}
                gtag("js", new Date());
                gtag("config", "${gaId}");
              `}
            </Script>
          </>
        ) : null}
        {children}
      </body>
    </html>
  );
}
