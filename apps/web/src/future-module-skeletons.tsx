import {
  MetricCard,
  metricGridStyle,
  mutedTextStyle,
  SectionHeader
} from "./dashboard-shell";
import {
  pillStyle,
  tableHeaderStyle,
  tableSectionStyle
} from "./dashboard-table-styles";

export type FutureModuleKey = "compliance" | "content" | "geo";
export type FutureModuleStatus = "planned";

export interface FutureModuleMetric {
  readonly label: string;
  readonly value: string;
}

export interface FutureModuleSkeleton {
  readonly key: FutureModuleKey;
  readonly eyebrow: string;
  readonly title: string;
  readonly description: string;
  readonly status: FutureModuleStatus;
  readonly metrics: readonly FutureModuleMetric[];
  readonly emptyTitle: string;
  readonly emptyDescription: string;
  readonly dependsOn: readonly string[];
  readonly nextMilestones: readonly string[];
}

export const futureModuleKeys = ["content", "geo", "compliance"] as const satisfies readonly FutureModuleKey[];

export const futureModuleSkeletons: Record<FutureModuleKey, FutureModuleSkeleton> = {
  content: {
    key: "content",
    eyebrow: "Content Briefs",
    title: "Content briefs",
    description: "Keyword, topic, and page planning workspace for future content workflows.",
    status: "planned",
    metrics: [
      { label: "Briefs", value: "0" },
      { label: "Drafts", value: "0" },
      { label: "Ready", value: "0" }
    ],
    emptyTitle: "No content briefs",
    emptyDescription: "Content briefs will appear after keyword and content planning modules are connected.",
    dependsOn: ["Keyword inventory", "Content brief schema", "Work order linking"],
    nextMilestones: ["CDX-070 Keyword / AEO engine", "CDX-080 Schema engine"]
  },
  geo: {
    key: "geo",
    eyebrow: "GEO Monitor",
    title: "AI visibility report",
    description: "AI mention, citation, and non-brand query coverage surface for future GEO monitoring.",
    status: "planned",
    metrics: [
      { label: "Mention rate", value: "0%" },
      { label: "Citation rate", value: "0%" },
      { label: "Query coverage", value: "0%" }
    ],
    emptyTitle: "No GEO rows",
    emptyDescription: "GEO visibility rows will appear after query sets and AI answer snapshots are available.",
    dependsOn: ["Non-brand query set", "AI answer snapshots", "Citation parser"],
    nextMilestones: ["CDX-090 GEO monitor", "CDX-110 Production hardening"]
  },
  compliance: {
    key: "compliance",
    eyebrow: "Compliance",
    title: "Medical ad risk flags",
    description: "Medical advertising risk review surface for future compliance checks.",
    status: "planned",
    metrics: [
      { label: "Open flags", value: "0" },
      { label: "Legal review", value: "0" },
      { label: "Cleared", value: "0" }
    ],
    emptyTitle: "No compliance flags",
    emptyDescription: "Compliance flags will appear after claim checks and medical ad rule filters are wired.",
    dependsOn: ["Claim extraction", "Medical ad rules", "Draft-only publishing guard"],
    nextMilestones: ["CDX-100 Compliance engine", "CDX-110 Production hardening"]
  }
};

export function getFutureModuleSkeleton(moduleKey: FutureModuleKey) {
  return futureModuleSkeletons[moduleKey];
}

export function summarizeFutureModules(modules: readonly FutureModuleSkeleton[]) {
  return {
    total: modules.length,
    planned: modules.filter((module) => module.status === "planned").length,
    placeholderMetrics: modules.reduce((total, module) => total + module.metrics.length, 0),
    emptyStates: modules.filter((module) => module.emptyTitle.length > 0).length
  };
}

export function FutureModulePage({ moduleKey }: { readonly moduleKey: FutureModuleKey }) {
  const content = getFutureModuleSkeleton(moduleKey);

  return (
    <section aria-labelledby={`${content.key}-future-module-heading`}>
      <SectionHeader
        description={content.description}
        eyebrow={content.eyebrow}
        title={content.title}
      />
      <div style={metricGridStyle}>
        {content.metrics.map((metric) => (
          <MetricCard key={metric.label} label={metric.label} value={metric.value} />
        ))}
      </div>
      <section aria-label={content.emptyTitle} style={tableSectionStyle}>
        <header style={tableHeaderStyle}>
          <div>
            <h3 id={`${content.key}-future-module-heading`} style={{ fontSize: 18, margin: 0 }}>
              {content.emptyTitle}
            </h3>
            <p style={{ ...mutedTextStyle, fontSize: 13, marginTop: 6 }}>{content.emptyDescription}</p>
          </div>
          <span style={{ ...pillStyle, background: "#f8fafc", color: "#475569" }}>
            {content.status}
          </span>
        </header>
        <div
          style={{
            display: "grid",
            gap: 16,
            gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
            padding: 16
          }}
        >
          <DefinitionList title="Depends on" values={content.dependsOn} />
          <DefinitionList title="Next milestones" values={content.nextMilestones} />
        </div>
      </section>
    </section>
  );
}

function DefinitionList({
  title,
  values
}: {
  readonly title: string;
  readonly values: readonly string[];
}) {
  return (
    <div>
      <h4 style={{ color: "#475569", fontSize: 12, margin: "0 0 8px", textTransform: "uppercase" }}>
        {title}
      </h4>
      <ul style={{ display: "grid", gap: 7, listStyle: "none", margin: 0, padding: 0 }}>
        {values.map((value) => (
          <li key={value}>{value}</li>
        ))}
      </ul>
    </div>
  );
}
