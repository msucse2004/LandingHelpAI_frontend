/**
 * 파트너 유형(BIDDING_ONLY 등)을 세션에 두어 사이드바·타 페이지에서 재사용한다.
 * @param {Record<string, unknown> | null | undefined} data
 */
export function persistPartnerModeFromDashboard(data) {
  try {
    const mode = String(data?.partner_mode ?? "").trim();
    const dt = String(data?.dashboard_type ?? "").trim();
    if (mode) sessionStorage.setItem("lhai_partner_mode", mode);
    else sessionStorage.removeItem("lhai_partner_mode");
    if (dt) sessionStorage.setItem("lhai_partner_dashboard_type", dt);
    else sessionStorage.removeItem("lhai_partner_dashboard_type");
  } catch {
    /* ignore */
  }
}

/** @param {{ dashboard: () => Promise<unknown> }} partnerThreadsApi */
export async function refreshPartnerModeSession(partnerThreadsApi) {
  try {
    const data = await partnerThreadsApi.dashboard();
    if (data && typeof data === "object") {
      persistPartnerModeFromDashboard(/** @type {Record<string, unknown>} */ (data));
    }
  } catch {
    /* keep existing session keys */
  }
}
