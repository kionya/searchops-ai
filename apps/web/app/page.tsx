import Link from "next/link";

import { productName, type Site } from "@searchops/types";

const mockSites: Site[] = [
  {
    id: "site_demo_rejuel",
    organizationId: "org_demo",
    domain: "example-clinic.com",
    name: "Example Clinic",
    industry: "medical",
    language: "ko",
    country: "KR",
    createdAt: "2026-05-19T00:00:00.000Z"
  }
];

export default function HomePage() {
  return (
    <main style={{ fontFamily: "sans-serif", margin: "40px auto", maxWidth: 960, padding: 24 }}>
      <header style={{ borderBottom: "1px solid #e5e7eb", marginBottom: 32, paddingBottom: 20 }}>
        <p style={{ color: "#64748b", margin: 0 }}>Core Product Shell</p>
        <h1 style={{ margin: "4px 0 8px" }}>{productName}</h1>
        <p style={{ color: "#475569", margin: 0 }}>
          Multi-tenant SEO/AEO/GEO workflow foundation for sites, crawl runs, issues, and work
          orders.
        </p>
      </header>

      <section aria-labelledby="sites-heading">
        <div style={{ alignItems: "center", display: "flex", justifyContent: "space-between" }}>
          <h2 id="sites-heading">Sites</h2>
          <span style={{ color: "#64748b" }}>{mockSites.length} configured</span>
        </div>

        <div style={{ display: "grid", gap: 12 }}>
          {mockSites.map((site) => (
            <article
              key={site.id}
              style={{ border: "1px solid #e5e7eb", borderRadius: 8, padding: 16 }}
            >
              <h3 style={{ margin: "0 0 6px" }}>{site.name}</h3>
              <p style={{ color: "#475569", margin: "0 0 12px" }}>{site.domain}</p>
              <dl style={{ display: "flex", gap: 20, margin: "0 0 12px" }}>
                <div>
                  <dt style={{ color: "#64748b", fontSize: 12 }}>Industry</dt>
                  <dd style={{ margin: 0 }}>{site.industry}</dd>
                </div>
                <div>
                  <dt style={{ color: "#64748b", fontSize: 12 }}>Locale</dt>
                  <dd style={{ margin: 0 }}>
                    {site.language}-{site.country}
                  </dd>
                </div>
              </dl>
              <Link href={`/sites/${site.id}`}>Open site detail</Link>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}