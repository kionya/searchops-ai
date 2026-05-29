import type { Metadata } from "next";
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

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ko">
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `
            (function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':
            new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],
            j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=
            'https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);
            })(window,document,'script','dataLayer','GTM-NRXJR3JB');
          `
          }}
        />
      </head>
      <body>
        <noscript>
          <iframe
            src="https://www.googletagmanager.com/ns.html?id=GTM-NRXJR3JB"
            height="0"
            width="0"
            style={{ display: "none", visibility: "hidden" }}
          />
        </noscript>
        <script
          async
          src="https://www.googletagmanager.com/gtag/js?id=G-J4S923Y2Z5"
        />
        <script
          dangerouslySetInnerHTML={{
            __html: `
            window.dataLayer = window.dataLayer || [];
            function gtag(){window.dataLayer.push(arguments);}
            gtag("js", new Date());
            gtag("config", "G-J4S923Y2Z5");
          `
          }}
        />
        {children}
      </body>
    </html>
  );
}
