import type { ReactNode } from "react";
import { notFound, redirect } from "next/navigation";

import { getApiBaseUrl } from "../../../src/api-base-url";
import {
  loadDashboardSiteAsUser,
  resolveDashboardSite,
  SiteDashboardFrame
} from "../../../src/dashboard-shell";
import { getCurrentProviderUser } from "../../../src/provider-accounts";
import { isDirectDatabaseMode } from "../../../src/site-database";

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
    // null 은 두 가지를 뜻한다: 실데이터 경로가 아예 없거나, 있는데 이 사용자에게
    // 사이트를 거부했거나. 뒤쪽은 테넌트 격리라 반드시 404 여야 한다. 앞쪽까지 404 를
    // 내면 하위 10개 라우트가 통째로 죽는데, 정작 데이터 로더들은 이미 fixture 로
    // 폴백한다(site-detail-views.ts). 그래서 셸도 같이 폴백하고 배너로 알린다.
    if (isDirectDatabaseMode() || getApiBaseUrl() !== null) {
      notFound();
    }

    return (
      <SiteDashboardFrame demo site={resolveDashboardSite(siteId)}>
        {children}
      </SiteDashboardFrame>
    );
  }

  return <SiteDashboardFrame site={site}>{children}</SiteDashboardFrame>;
}
