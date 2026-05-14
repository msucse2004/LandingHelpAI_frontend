import { applyPartnerBiddingSidebarMessagingHide, loadSidebar } from "../components/sidebar.js";
import {
  emitPartnerDashboardAuthDebug,
  getCurrentRole,
  getCurrentUserId,
  getSession,
  isAuthenticated,
} from "../core/auth.js";
import { partnerThreadsApi } from "../core/api.js";
import { persistPartnerModeFromDashboard } from "../core/partner-mode-session.js";
import { ROLES } from "../core/config.js";
import { ensureCustomerAccess, protectCurrentPage } from "../core/guards.js";
import { initRouter } from "../core/router.js";
import { syncHeaderRoleBadge } from "../core/role-header-badge.js";
import {
  debugDashboard,
  isPartnerDashboardDebugEnabled,
  partnerDashboardResponsePreview,
} from "../core/partner-dashboard-debug.js";
import { clearShellTopLayerBlockers, diagnoseShellTopLayerBlockers } from "../core/ui-blockers.js";
import { formatMessageTimestamp } from "../core/utils.js";

const ERR_LOAD =
  "대시보드를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.";
const EMPTY_ASSIGNED = "아직 배정된 고객 신청이 없습니다.";
const EMPTY_BIDDING = "아직 새 견적 요청이 없습니다.";

if (typeof window !== "undefined") {
  window.__lhaiPartnerDashboardDebug = {
    isEnabled: () => isPartnerDashboardDebugEnabled(),
    enable: () => {
      try {
        window.localStorage.setItem("LHAI_DEBUG_PARTNER_DASHBOARD", "1");
      } catch {
        /* ignore */
      }
    },
    disable: () => {
      try {
        window.localStorage.removeItem("LHAI_DEBUG_PARTNER_DASHBOARD");
      } catch {
        /* ignore */
      }
    },
  };
}

/**
 * render-complete 직후 DOM·화면 중앙 hit (오버레이 vs 본문 구분용).
 * @param {string} dashboardType
 */
function logPartnerDashboardDomAfterRender(dashboardType) {
  if (!isPartnerDashboardDebugEnabled()) return;
  const run = () => {
    const statsId = dashboardType === "BIDDING_WORK" ? "#partnerDashStatsBidding" : "#partnerDashStatsAssigned";
    const statsRoot = document.querySelector(statsId);
    const statsVisible = statsRoot instanceof HTMLElement && !statsRoot.hidden;
    const statCards = statsVisible ? statsRoot.querySelectorAll("article.lhai-partner-dash__stat-card").length : 0;
    const nA = document.querySelectorAll("#partnerDashboardTbodyAssigned tr").length;
    const nB = document.querySelectorAll("#partnerDashboardTbodyBidding tr").length;
    const main = document.querySelector("main.lhai-main");
    const allBtns = main ? main.querySelectorAll("a.lhai-button, button.lhai-button") : [];
    const visibleBtns = Array.from(allBtns).filter(
      (n) => n instanceof HTMLElement && !n.hidden && n.offsetParent !== null
    ).length;
    const cx = Math.floor(window.innerWidth / 2);
    const cy = Math.floor(window.innerHeight / 2);
    const hit = document.elementFromPoint(cx, cy);
    /** @type {Record<string, unknown> | null} */
    let hitInfo = null;
    if (hit instanceof Element) {
      const cs = window.getComputedStyle(hit);
      hitInfo = {
        tagName: hit.tagName,
        id: hit.id || null,
        className: (hit.className && String(hit.className).slice(0, 200)) || null,
        zIndex: cs.zIndex,
        pointerEvents: cs.pointerEvents,
      };
    }
    debugDashboard("dom-state", {
      statsCardCount: statCards,
      requestRowCountAssigned: nA,
      requestRowCountBidding: nB,
      visibleButtonsCount: visibleBtns,
      buttonsInMainCount: allBtns.length,
      elementFromPointCenter: hitInfo,
    });
    const mainEl = document.querySelector("main.lhai-main");
    const onDashboardMain =
      mainEl && hit instanceof Node && document.body.contains(hit) ? mainEl.contains(hit) : false;
    const tag = (hit && /** @type {Element} */ (hit).tagName) || "";
    const dialogOpen = tag === "DIALOG" && /** @type {HTMLDialogElement} */ (hit).open;
    const cls = (hit instanceof Element && hit.className && String(hit.className)) || "";
    const looksBackdrop =
      /backdrop|overlay|modal-backdrop|lhai-modal-backdrop/i.test(cls) ||
      (hit instanceof Element && hit.getAttribute("role") === "dialog");
    if (!onDashboardMain || dialogOpen || looksBackdrop) {
      console.warn("[partner-dashboard] center point is blocked by possible overlay", {
        onDashboardMain,
        dialogOpen,
        looksBackdrop,
        hitInfo,
      });
    }
  };
  window.requestAnimationFrame(() => {
    window.setTimeout(run, 0);
  });
}

/** @param {string} code */
function assignedStatusLabelKo(code) {
  const c = String(code || "").trim().toUpperCase();
  const map = {
    NEW_REQUEST: "새 신청",
    IN_PROGRESS: "진행 중",
    WAITING_CUSTOMER: "고객 응답 대기",
    COMPLETED: "완료",
  };
  return map[c] || c || "—";
}

/** API bid_status: NOT_SUBMITTED | SUBMITTED | SELECTED | CLOSED */
/** @param {string} code */
function biddingBidStatusLabelKo(code) {
  const c = String(code || "").trim().toUpperCase();
  const map = {
    NOT_SUBMITTED: "견적 제출 전",
    SUBMITTED: "견적 제출 완료",
    SELECTED: "선택됨",
    CLOSED: "종료됨",
    REJECTED: "종료됨",
  };
  return map[c] || c || "—";
}

function escHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function scrollToHash() {
  const h = (window.location.hash || "").trim();
  if (h === "#partner-requests") {
    document.querySelector("#partner-requests")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }
}

/** @param {HTMLElement | null} el @param {boolean} visible */
function setHidden(el, visible) {
  if (!(el instanceof HTMLElement)) return;
  el.hidden = !visible;
}

/**
 * @param {HTMLElement | null} errEl
 * @param {HTMLElement | null} emptyEl
 * @param {HTMLElement | null} assignedWrap
 * @param {HTMLElement | null} biddingWrap
 */
function showDashboardError(errEl, emptyEl, assignedWrap, biddingWrap, msg) {
  debugDashboard("render-error", { message: String(msg || "").slice(0, 240) });
  if (errEl instanceof HTMLElement) {
    errEl.hidden = false;
    errEl.textContent = msg;
  }
  if (emptyEl instanceof HTMLElement) emptyEl.hidden = true;
  setHidden(assignedWrap, false);
  setHidden(biddingWrap, false);
  const wa = document.querySelector("#partnerDashboardTableWrapAssigned");
  const wb = document.querySelector("#partnerDashboardTableWrapBidding");
  setHidden(wa, false);
  setHidden(wb, false);
}

function clearDashboardError(errEl) {
  if (errEl instanceof HTMLElement) {
    errEl.hidden = true;
    errEl.textContent = "";
  }
}

/** @param {Record<string, unknown>} data */
function renderAssignedDashboard(data) {
  const titleEl = document.querySelector("#partnerDashboardTitle");
  const subEl = document.querySelector("#partnerDashboardSubtitle");
  const secTitle = document.querySelector("#partnerRequestsSectionTitle");

  if (titleEl) titleEl.textContent = "배정 업무 대시보드";
  if (subEl) subEl.textContent = "배정된 고객 신청을 확인합니다.";
  if (secTitle) secTitle.textContent = "신청 리스트";

  setHidden(document.querySelector("#partnerDashStatsAssigned"), true);
  setHidden(document.querySelector("#partnerDashStatsBidding"), false);

  setHidden(document.querySelector("#partnerTableAssignedWrap"), true);
  setHidden(document.querySelector("#partnerTableBiddingWrap"), false);

  /** @type {Record<string, HTMLElement | null>} */
  const statEls = {
    new_requests: document.querySelector("#partnerStatNew"),
    in_progress: document.querySelector("#partnerStatProgress"),
    waiting_customer: document.querySelector("#partnerStatWaiting"),
    completed: document.querySelector("#partnerStatDone"),
  };

  const stats = data.stats && typeof data.stats === "object" ? /** @type {Record<string, number>} */ (data.stats) : {};
  const keys = ["new_requests", "in_progress", "waiting_customer", "completed"];
  for (const k of keys) {
    const el = statEls[k];
    if (el) el.textContent = String(stats[k] ?? 0);
  }

  const emptyEl = document.querySelector("#partnerDashboardEmpty");
  const wrapEl = document.querySelector("#partnerDashboardTableWrapAssigned");
  const tbody = document.querySelector("#partnerDashboardTbodyAssigned");

  const requests = Array.isArray(data.requests) ? data.requests : [];

  if (!requests.length) {
    if (emptyEl instanceof HTMLElement) {
      emptyEl.hidden = false;
      emptyEl.textContent = EMPTY_ASSIGNED;
    }
    setHidden(wrapEl, false);
    if (tbody) tbody.innerHTML = "";
    return;
  }

  if (emptyEl instanceof HTMLElement) emptyEl.hidden = true;
  setHidden(wrapEl, true);

  if (tbody) {
    tbody.innerHTML = requests
      .map((row) => {
        /** @type {Record<string, unknown>} */
        const r = row && typeof row === "object" ? row : {};
        const detailHref = `partner-assigned-request.html?thread_id=${encodeURIComponent(String(r.thread_id || "").trim())}`;
        const svc = escHtml(r.service_name || "—");
        const cust = escHtml(r.customer_name || "—");
        const subAt = formatMessageTimestamp(r.submitted_at);
        const st = escHtml(assignedStatusLabelKo(String(r.status || "")));
        const lastAt = formatMessageTimestamp(r.last_message_at);
        return `<tr>
          <td>${svc}</td>
          <td>${cust}</td>
          <td>${escHtml(subAt)}</td>
          <td>${st}</td>
          <td>${escHtml(lastAt)}</td>
          <td><a class="lhai-button lhai-button--secondary" href="${detailHref}">자세히 보기</a></td>
        </tr>`;
      })
      .join("");
  }
}

/** @param {Record<string, unknown>} data */
function renderBiddingDashboard(data) {
  const titleEl = document.querySelector("#partnerDashboardTitle");
  const subEl = document.querySelector("#partnerDashboardSubtitle");
  const secTitle = document.querySelector("#partnerRequestsSectionTitle");

  if (titleEl) titleEl.textContent = "견적 요청 대시보드";
  if (subEl) subEl.textContent = "받은 견적 요청을 확인하고 견적을 제출합니다.";
  if (secTitle) secTitle.textContent = "견적 요청 리스트";

  setHidden(document.querySelector("#partnerDashStatsAssigned"), false);
  setHidden(document.querySelector("#partnerDashStatsBidding"), true);

  setHidden(document.querySelector("#partnerTableAssignedWrap"), false);
  setHidden(document.querySelector("#partnerTableBiddingWrap"), true);

  /** @type {Record<string, HTMLElement | null>} */
  const statEls = {
    open_bid_requests: document.querySelector("#partnerStatBiddingOpen"),
    submitted_bids: document.querySelector("#partnerStatBiddingSubmitted"),
    selected_bids: document.querySelector("#partnerStatBiddingSelected"),
    closed_bids: document.querySelector("#partnerStatBiddingClosed"),
  };

  const stats = data.stats && typeof data.stats === "object" ? /** @type {Record<string, number>} */ (data.stats) : {};
  const keys = ["open_bid_requests", "submitted_bids", "selected_bids", "closed_bids"];
  for (const k of keys) {
    const el = statEls[k];
    if (el) el.textContent = String(stats[k] ?? 0);
  }

  const emptyEl = document.querySelector("#partnerDashboardEmpty");
  const wrapEl = document.querySelector("#partnerDashboardTableWrapBidding");
  const tbody = document.querySelector("#partnerDashboardTbodyBidding");

  const requests = Array.isArray(data.requests) ? data.requests : [];

  if (!requests.length) {
    if (emptyEl instanceof HTMLElement) {
      emptyEl.hidden = false;
      emptyEl.textContent = EMPTY_BIDDING;
    }
    setHidden(wrapEl, false);
    if (tbody) tbody.innerHTML = "";
    return;
  }

  if (emptyEl instanceof HTMLElement) emptyEl.hidden = true;
  setHidden(wrapEl, true);

  if (tbody) {
    tbody.innerHTML = requests
      .map((row) => {
        /** @type {Record<string, unknown>} */
        const r = row && typeof row === "object" ? row : {};
        const bidRequestId = String(r.bid_request_id || "").trim();
        const expRaw = r.expires_at;
        const expQ =
          expRaw != null && String(expRaw).trim() !== ""
            ? `?expires_at=${encodeURIComponent(String(expRaw).trim())}`
            : "";
        const detailHref = `partner-bid-request.html${expQ}#/partner/bid-requests/${encodeURIComponent(bidRequestId)}`;
        const svc = escHtml(r.service_name || "—");
        const cust = escHtml(r.customer_display_name || "—");
        const loc = escHtml(r.location || "—");
        const subAt = formatMessageTimestamp(r.submitted_at);
        const expAt = formatMessageTimestamp(r.expires_at);
        const bidSt = escHtml(biddingBidStatusLabelKo(String(r.bid_status || "")));
        return `<tr>
          <td>${svc}</td>
          <td>${cust}</td>
          <td>${loc}</td>
          <td>${escHtml(subAt)}</td>
          <td>${escHtml(expAt)}</td>
          <td>${bidSt}</td>
          <td><a class="lhai-button lhai-button--secondary" href="${detailHref}">요청 보기</a></td>
        </tr>`;
      })
      .join("");
  }
}

async function initPartnerDashboard() {
  diagnoseShellTopLayerBlockers("partner-dashboard:init-start");
  clearShellTopLayerBlockers();
  syncHeaderRoleBadge();

  emitPartnerDashboardAuthDebug("auth-check-start", {});
  const role = getCurrentRole();
  emitPartnerDashboardAuthDebug("auth-check-result", {
    role,
    hasAccessToken: isAuthenticated(),
    hasUserId: Boolean(getCurrentUserId()),
    sessionEmailFieldPresent: Boolean((getSession()?.email || "").toString().trim()),
    isPartnerRole: role === ROLES.PARTNER,
  });

  if (role !== ROLES.PARTNER) {
    window.location.replace("dashboard.html");
    return;
  }
  if (!protectCurrentPage()) return;
  if (!ensureCustomerAccess()) return;

  const errEl = document.querySelector("#partnerDashboardError");
  const emptyEl = document.querySelector("#partnerDashboardEmpty");
  const assignedWrap = document.querySelector("#partnerTableAssignedWrap");
  const biddingWrap = document.querySelector("#partnerTableBiddingWrap");

  let data;
  try {
    diagnoseShellTopLayerBlockers("partner-dashboard:api-before");
    debugDashboard("api-request-start", { path: "/api/partner/dashboard" });
    data = await partnerThreadsApi.dashboard();
    diagnoseShellTopLayerBlockers("partner-dashboard:api-success");
    debugDashboard("api-request-success", partnerDashboardResponsePreview(data));
  } catch (e) {
    diagnoseShellTopLayerBlockers("partner-dashboard:api-error");
    debugDashboard("api-request-error", {
      message: e && typeof e.message === "string" ? e.message.slice(0, 400) : String(e).slice(0, 400),
    });
    showDashboardError(errEl, emptyEl, assignedWrap, biddingWrap, ERR_LOAD);
    await loadSidebar("#sidebar", "customer");
    applyPartnerBiddingSidebarMessagingHide();
    debugDashboard("render-complete", { path: "error-no-data" });
    logPartnerDashboardDomAfterRender("");
    return;
  }

  clearDashboardError(errEl);

  if (!data || typeof data !== "object") {
    debugDashboard("api-request-error", { reason: "invalid_or_empty_json" });
    showDashboardError(errEl, emptyEl, assignedWrap, biddingWrap, ERR_LOAD);
    await loadSidebar("#sidebar", "customer");
    applyPartnerBiddingSidebarMessagingHide();
    debugDashboard("render-complete", { path: "invalid-payload" });
    logPartnerDashboardDomAfterRender("");
    return;
  }

  persistPartnerModeFromDashboard(data);

  await loadSidebar("#sidebar", "customer");
  applyPartnerBiddingSidebarMessagingHide();

  const dashType = String(data.dashboard_type || "").trim();

  debugDashboard("render-start", { dashboard_type: dashType });

  if (dashType === "BIDDING_WORK") {
    renderBiddingDashboard(data);
  } else {
    renderAssignedDashboard(data);
  }

  const reqs = Array.isArray(data.requests) ? data.requests : [];
  debugDashboard("render-stats", {
    dashboard_type: dashType,
    partner_mode: data.partner_mode,
    stats: data.stats,
  });
  debugDashboard("render-requests", {
    count: reqs.length,
    preview_thread_or_bid_ids: reqs.slice(0, 12).map((r) => {
      if (!r || typeof r !== "object") return null;
      const o = /** @type {Record<string, unknown>} */ (r);
      return o.thread_id != null ? String(o.thread_id).slice(0, 36) : o.bid_request_id != null ? String(o.bid_request_id).slice(0, 36) : null;
    }),
  });
  if (!reqs.length) {
    debugDashboard("render-empty", { dashboard_type: dashType });
  }

  scrollToHash();
  diagnoseShellTopLayerBlockers("partner-dashboard:render-complete");
  clearShellTopLayerBlockers();
  debugDashboard("render-complete", { dashboard_type: dashType, requests_count: reqs.length });
  logPartnerDashboardDomAfterRender(dashType || "ASSIGNED_WORK");
}

// 브라우저 콘솔: window.__lhaiDiagnoseTopLayer("manual-check") | window.__lhaiPartnerDashboardDebug.enable()
diagnoseShellTopLayerBlockers("partner-dashboard:module-load");
debugDashboard("module-load", { href: window.location.href });
initRouter();

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => {
    diagnoseShellTopLayerBlockers("partner-dashboard:dom-content-loaded");
    debugDashboard("dom-ready", { readyState: document.readyState });
  });
} else {
  diagnoseShellTopLayerBlockers("partner-dashboard:dom-content-loaded");
  debugDashboard("dom-ready", { readyState: document.readyState });
}

void initPartnerDashboard();
