import type { ReactNode } from "react";
import { notFound, redirect } from "next/navigation";

import { loadDashboardSiteAsUser, SiteDashboardFrame } from "../../../src/dashboard-shell";
import { getCurrentProviderUser } from "../../../src/provider-accounts";

interface SiteDashboardLayoutProps {
  readonly children: ReactNode;
  readonly params: Promise<{
    readonly siteId: string;
  }>;
}

export default async function SiteDashboardLayout({ children, params }: SiteDashboardLayoutProps) {
  const { siteId } = await params;
  let context;
  try {
    context = await getCurrentProviderUser();
  } catch {
    redirect(`/login?next=${encodeURIComponent(`/sites/${siteId}`)}`);
  }
  const site = await loadDashboardSiteAsUser(context, siteId);
  if (site === null) {
    notFound();
  }

  return <SiteDashboardFrame site={site}>{children}</SiteDashboardFrame>;
}
