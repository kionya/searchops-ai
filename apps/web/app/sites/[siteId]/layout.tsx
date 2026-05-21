import type { ReactNode } from "react";

import { resolveDashboardSite, SiteDashboardFrame } from "../../../src/dashboard-shell";

interface SiteDashboardLayoutProps {
  readonly children: ReactNode;
  readonly params: Promise<{
    readonly siteId: string;
  }>;
}

export default async function SiteDashboardLayout({ children, params }: SiteDashboardLayoutProps) {
  const { siteId } = await params;
  const site = resolveDashboardSite(siteId);

  return <SiteDashboardFrame site={site}>{children}</SiteDashboardFrame>;
}
