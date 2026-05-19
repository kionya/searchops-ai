interface SiteDetailPageProps {
  readonly params: Promise<{
    readonly siteId: string;
  }>;
}

export default async function SiteDetailPage({ params }: SiteDetailPageProps) {
  const { siteId } = await params;

  return (
    <main style={{ fontFamily: "sans-serif", margin: "40px auto", maxWidth: 960, padding: 24 }}>
      <header style={{ borderBottom: "1px solid #e5e7eb", marginBottom: 32, paddingBottom: 20 }}>
        <p style={{ color: "#64748b", margin: 0 }}>Site Detail Skeleton</p>
        <h1 style={{ margin: "4px 0 8px" }}>{siteId}</h1>
        <p style={{ color: "#475569", margin: 0 }}>
          Crawl runs, URL records, SEO issues, work orders, keywords, content briefs, and
          compliance flags will be attached here in later phases.
        </p>
      </header>

      <section aria-label="Workflow skeleton" style={{ display: "grid", gap: 12 }}>
        {[
          "Crawl runs",
          "URL records",
          "SEO issues",
          "Work orders",
          "Keywords",
          "Content briefs",
          "Compliance flags"
        ].map((label) => (
          <article key={label} style={{ border: "1px solid #e5e7eb", borderRadius: 8, padding: 16 }}>
            <h2 style={{ fontSize: 18, margin: "0 0 6px" }}>{label}</h2>
            <p style={{ color: "#64748b", margin: 0 }}>Phase 1 placeholder</p>
          </article>
        ))}
      </section>
    </main>
  );
}