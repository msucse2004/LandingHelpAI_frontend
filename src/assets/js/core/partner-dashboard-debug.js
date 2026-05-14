/**
 * 파트너 대시보드 디버그 플래그 (UI/CSS/API 변경 없음, 로그 전용).
 *
 * 켜기:
 *   URL에 ?debugPartnerDashboard=1
 *   또는 localStorage.setItem("LHAI_DEBUG_PARTNER_DASHBOARD", "1")
 *
 * 끄기:
 *   localStorage.removeItem("LHAI_DEBUG_PARTNER_DASHBOARD")
 */

const LS_KEY = "LHAI_DEBUG_PARTNER_DASHBOARD";
const QS_KEY = "debugPartnerDashboard";

export function isPartnerDashboardDebugEnabled() {
  try {
    if (typeof window === "undefined") return false;
    const q = new URLSearchParams(window.location.search || "");
    const v = (q.get(QS_KEY) || "").trim().toLowerCase();
    if (v === "1" || v === "true" || v === "yes") return true;
    return window.localStorage.getItem(LS_KEY) === "1";
  } catch {
    return false;
  }
}

/** @param {string} phase @param {Record<string, unknown>} [payload] */
export function debugDashboard(phase, payload) {
  if (!isPartnerDashboardDebugEnabled()) return;
  const p = payload && typeof payload === "object" ? payload : {};
  console.debug("[partner-dashboard]", phase, p);
}

/** @param {string} tag @param {Record<string, unknown>} [payload] */
export function debugPartnerDashboardApi(tag, payload) {
  if (!isPartnerDashboardDebugEnabled()) return;
  const p = payload && typeof payload === "object" ? payload : {};
  console.debug("[partner-dashboard-api]", tag, p);
}

/** @param {unknown} data */
export function partnerDashboardResponsePreview(data) {
  if (!data || typeof data !== "object") {
    return { shape: typeof data };
  }
  const d = /** @type {Record<string, unknown>} */ (data);
  const req = Array.isArray(d.requests) ? d.requests : [];
  return {
    dashboard_type: d.dashboard_type,
    partner_mode: d.partner_mode,
    requests_count: req.length,
    stats_keys: d.stats && typeof d.stats === "object" ? Object.keys(/** @type {object} */ (d.stats)) : [],
  };
}
