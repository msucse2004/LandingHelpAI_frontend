/**
 * Hash-based router (stub).
 * For Step 1 we keep it as a no-op scaffold.
 *
 * 파트너 셸은 전체 페이지 로드(location)로 전환되며 SPA 라우트 변경 이벤트가 없다.
 * partner → 경로 전환 시점 디버그 로그는 `sidebar.js`의 loadSidebar 진입부를 본다.
 */

import { debugDashboard, isPartnerDashboardDebugEnabled } from "./partner-dashboard-debug.js";

function initRouter() {
  if (typeof window !== "undefined" && isPartnerDashboardDebugEnabled()) {
    const page = (window.location.pathname || "").split("/").pop() || "";
    if (page.includes("partner-dashboard")) {
      debugDashboard("router-init", {
        note: "initRouter stub; partner-dashboard uses full page load, not SPA route map",
        pathname: window.location.pathname,
      });
    }
  }
  // TODO: Implement route-to-view mapping once pages are wired.
  return;
}

export { initRouter };
