/**
 * BIDDING_ONLY 견적 요청 상세·제출 (generic PRODUCT_OFFER).
 * 라우트: `#/partner/bid-requests/<uuid>` 또는 `?bid_request_id=`
 */
import { applyPartnerBiddingSidebarMessagingHide, loadSidebar } from "../components/sidebar.js";
import { partnerThreadsApi } from "../core/api.js";
import { subscribeRealtimeEvents } from "../core/realtime-client.js";
import {
  bidUpdatedMatchesScope,
  isBiddingBidUpdatedPayload,
  isPartnerBidRequestHtmlPage,
  normalizeBidUpdatedPayload,
  showBidUpdatedToast,
} from "../core/bid-realtime.js";
import { isPartnerBidDetailPollingPhase } from "./partner-bid-request-product-logic.js";
import { getCurrentRole } from "../core/auth.js";
import { ROLES } from "../core/config.js";
import { refreshPartnerModeSession } from "../core/partner-mode-session.js";
import { ensureCustomerAccess, protectCurrentPage } from "../core/guards.js";
import { syncHeaderRoleBadge } from "../core/role-header-badge.js";
import { clearShellTopLayerBlockers } from "../core/ui-blockers.js";
import {
  createBidCountdownTicker,
  formatPartnerCountdownBanner,
  normalizeDeadlineSnapshot,
} from "../core/bid-deadline-display.js";
import { partnerBidStatusLabel } from "./partner-bid-request-product-logic.js";
import { mountProductOfferBidUi } from "./partner-bid-request-product-ui.js";

/** @param {unknown} err */
function httpStatusFromError(err) {
  if (err != null && typeof err === "object" && "status" in err) {
    const n = Number(/** @type {{ status?: unknown }} */ (err).status);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function getBidRequestIdFromLocation() {
  const q = new URLSearchParams(window.location.search).get("bid_request_id");
  if (q && String(q).trim()) return String(q).trim();

  let rawHash = (window.location.hash || "").replace(/^#/, "").trim();
  while (rawHash.startsWith("/")) rawHash = rawHash.slice(1);
  const m = /^partner\/bid-requests\/([^/?#]+)/i.exec(rawHash);
  if (m) return decodeURIComponent(m[1]).trim();

  try {
    const path = window.location.pathname.replace(/\/+$/, "");
    const parts = path.split("/").filter(Boolean);
    const i = parts.findIndex((p) => p.toLowerCase() === "bid-requests");
    if (i >= 0 && parts[i + 1]) return decodeURIComponent(parts[i + 1]).trim();
  } catch {
    /* ignore */
  }
  return "";
}

function getExpiresAtFromQuery() {
  const v = new URLSearchParams(window.location.search).get("expires_at");
  return v && String(v).trim() ? String(v).trim() : "";
}

function getRequestStatusFromQuery() {
  const v = new URLSearchParams(window.location.search).get("request_status");
  return v && String(v).trim() ? String(v).trim().toUpperCase() : "OPEN";
}

function setText(sel, text) {
  const el = document.querySelector(sel);
  if (el) el.textContent = text;
}

/** @type {(() => void) | null} */
let partnerCountdownStop = null;
/** @type {ReturnType<typeof setInterval> | null} */
let partnerDetailPollTimer = null;
/** @type {Record<string, unknown> | null} */
let latestPartnerDetailForCountdown = null;
const PARTNER_BID_DETAIL_POLL_MS = 30_000;

/** @param {Record<string, unknown> | null | undefined} payload */
function renderPartnerCountdownBanner(payload) {
  const el = document.querySelector("#partnerBidCountdownBanner");
  if (!(el instanceof HTMLElement)) return;
  const snap = normalizeDeadlineSnapshot(payload);
  const reqStatus = String(
    snap?.bid_request_status ?? payload?.bid_request_status ?? payload?.status ?? "",
  )
    .trim()
    .toUpperCase();
  if (reqStatus === "CUSTOMER_SELECTED" || reqStatus === "CLOSED" || reqStatus === "CANCELLED") {
    el.hidden = true;
    el.textContent = "";
    return;
  }
  const text = formatPartnerCountdownBanner(snap);
  const expired = text === "비딩이 종료되었습니다" || reqStatus === "EXPIRED";
  el.hidden = false;
  el.textContent = text;
  el.className = expired
    ? "lhai-par-bid__countdown lhai-par-bid__countdown--expired"
    : "lhai-par-bid__countdown";
}

function startPartnerCountdownTicker() {
  if (partnerCountdownStop) {
    partnerCountdownStop();
    partnerCountdownStop = null;
  }
  partnerCountdownStop = createBidCountdownTicker({
    getDeadline: () => normalizeDeadlineSnapshot(latestPartnerDetailForCountdown),
    formatBanner: formatPartnerCountdownBanner,
    onTick: (text, expired) => {
      const el = document.querySelector("#partnerBidCountdownBanner");
      if (!(el instanceof HTMLElement)) return;
      el.hidden = false;
      el.textContent = text;
      el.className = expired
        ? "lhai-par-bid__countdown lhai-par-bid__countdown--expired"
        : "lhai-par-bid__countdown";
    },
    intervalMs: 1000,
  });
}

/** @param {Record<string, unknown>} data */
function applyPageHeader(data) {
  const svc =
    data.service && typeof data.service === "object"
      ? /** @type {Record<string, unknown>} */ (data.service)
      : {};
  const bid =
    data.bid && typeof data.bid === "object" ? /** @type {Record<string, unknown>} */ (data.bid) : {};
  const bidStatus = String(bid.status ?? "").trim().toUpperCase();
  const reqStatus = String(data.bid_request_status ?? "OPEN").trim().toUpperCase();
  const svcName = String(svc.name || "견적 요청");
  setText("#partnerBidPageTitle", svcName);
  setText("#partnerBidPageSubtitle", `${partnerBidStatusLabel(bidStatus, reqStatus)} · ${String(data.bid_request_id || "").trim() || "—"}`);
}

/** @param {Record<string, unknown>} data @param {object} mountCtx */
function renderProductBidRequest(data, mountCtx) {
  const root = document.querySelector("#partnerBidProductRoot");
  if (!(root instanceof HTMLElement)) return;
  root.hidden = false;
  applyPageHeader(data);
  mountProductOfferBidUi(root, mountCtx);
}

async function init() {
  clearShellTopLayerBlockers();
  syncHeaderRoleBadge();
  if (getCurrentRole() !== ROLES.PARTNER) {
    window.location.replace("dashboard.html");
    return;
  }
  if (!protectCurrentPage()) return;
  if (!ensureCustomerAccess()) return;

  await refreshPartnerModeSession(partnerThreadsApi);
  await loadSidebar("#sidebar", "customer");
  applyPartnerBiddingSidebarMessagingHide();

  const bidRequestId = getBidRequestIdFromLocation();
  const expiresAtQuery = getExpiresAtFromQuery();
  const requestStatusQuery = getRequestStatusFromQuery();
  const loadingEl = document.querySelector("#partnerBidLoading");
  const mainEl = document.querySelector("#partnerBidMain");
  const errEl = document.querySelector("#partnerBidError");

  const showLoadErr = (msg) => {
    if (loadingEl instanceof HTMLElement) loadingEl.hidden = true;
    if (mainEl instanceof HTMLElement) mainEl.hidden = true;
    if (errEl instanceof HTMLElement) {
      errEl.hidden = false;
      errEl.textContent = msg;
    }
  };

  if (!bidRequestId) {
    showLoadErr("견적 요청 ID가 없습니다. 대시보드에서 다시 열어 주세요.");
    return;
  }

  let detail;
  try {
    detail = await partnerThreadsApi.bidRequestDetail(bidRequestId);
  } catch (err) {
    const st = httpStatusFromError(err);
    if (st === 403) showLoadErr("이 견적 요청을 볼 권한이 없습니다.");
    else if (st === 404) showLoadErr("견적 요청을 찾을 수 없습니다.");
    else showLoadErr(err instanceof Error ? err.message : "불러오지 못했습니다.");
    return;
  }

  if (!detail || typeof detail !== "object") {
    showLoadErr("응답 형식이 올바르지 않습니다.");
    return;
  }

  if (loadingEl instanceof HTMLElement) loadingEl.hidden = true;
  if (mainEl instanceof HTMLElement) mainEl.hidden = false;
  if (errEl instanceof HTMLElement) {
    errEl.hidden = true;
    errEl.textContent = "";
  }

  /** @type {Record<string, unknown>} */
  let latestDetail = /** @type {Record<string, unknown>} */ (detail);
  latestPartnerDetailForCountdown = latestDetail;

  const bidRequestBlock =
    detail.bid_request && typeof detail.bid_request === "object"
      ? /** @type {Record<string, unknown>} */ (detail.bid_request)
      : null;
  const expiresAtEffective =
    bidRequestBlock?.expires_at != null
      ? String(bidRequestBlock.expires_at)
      : detail.expires_at != null
        ? String(detail.expires_at)
        : expiresAtQuery;
  const requestStatusEffective = String(
    detail.bid_request_status ?? bidRequestBlock?.bid_request_status ?? requestStatusQuery,
  )
    .trim()
    .toUpperCase();

  const carCfg =
    detail.car_purchase_config && typeof detail.car_purchase_config === "object"
      ? detail.car_purchase_config
      : {};
  const bidCfg =
    detail.bidding_config && typeof detail.bidding_config === "object"
      ? detail.bidding_config
      : carCfg;
  const maxOffers =
    bidCfg.max_partner_offers_per_bid ??
    carCfg.max_partner_vehicle_offers_per_bid ??
    carCfg.max_partner_offers_per_bid ??
    3;
  const requiresOfferPhotos = bidCfg.requires_offer_photos === true;

  /** @param {Record<string, unknown>} data */
  function renderBidRequestView(data) {
    latestPartnerDetailForCountdown = data;
    renderPartnerCountdownBanner(data);
    const brBlock =
      data.bid_request && typeof data.bid_request === "object"
        ? /** @type {Record<string, unknown>} */ (data.bid_request)
        : bidRequestBlock;
    const expEff =
      brBlock?.expires_at != null
        ? String(brBlock.expires_at)
        : data.expires_at != null
          ? String(data.expires_at)
          : expiresAtEffective;
    const reqStatus = String(
      data.bid_request_status ?? brBlock?.bid_request_status ?? requestStatusEffective,
    )
      .trim()
      .toUpperCase();

    renderProductBidRequest(data, {
      data,
      expiresAtQuery: expEff,
      requestStatusQuery: reqStatus,
      maxOffers: Number(maxOffers) || 3,
      requiresOfferPhotos,
      onDetailUpdate: (next) => {
        latestDetail = /** @type {Record<string, unknown>} */ (next);
        renderBidRequestView(latestDetail);
        syncPartnerDetailPolling();
        window.alert("제안이 저장되었습니다.");
      },
      submitFn: (payload) => partnerThreadsApi.submitBidRequest(bidRequestId, payload),
      openMessagesFn: () => {
        const tid = String(latestDetail.thread_id || "").trim();
        if (!tid) {
          window.alert("연결된 고객 대화방을 찾을 수 없습니다.");
          return;
        }
        window.location.href = `partner-assigned-request.html?thread_id=${encodeURIComponent(tid)}`;
      },
    });
  }

  /** @param {boolean} [showToast] */
  async function refreshPartnerBidDetail(showToast = false) {
    try {
      const next = await partnerThreadsApi.bidRequestDetail(bidRequestId);
      latestDetail = /** @type {Record<string, unknown>} */ (next);
      renderBidRequestView(latestDetail);
      syncPartnerDetailPolling();
      if (
        showToast &&
        isPartnerBidRequestHtmlPage() &&
        typeof document !== "undefined" &&
        document.visibilityState === "visible"
      ) {
        const href = `${window.location.pathname}${window.location.search}${window.location.hash}`;
        showBidUpdatedToast({
          title: "비딩 정보가 업데이트되었습니다.",
          cta: "확인",
          href,
        });
      }
    } catch {
      /* ignore */
    }
  }

  function partnerRequestStatusFromDetail(data) {
    const brBlock =
      data?.bid_request && typeof data.bid_request === "object"
        ? /** @type {Record<string, unknown>} */ (data.bid_request)
        : null;
    return String(
      data?.bid_request_status ?? brBlock?.bid_request_status ?? requestStatusEffective,
    )
      .trim()
      .toUpperCase();
  }

  function stopPartnerDetailPolling() {
    if (partnerDetailPollTimer) {
      window.clearInterval(partnerDetailPollTimer);
      partnerDetailPollTimer = null;
    }
  }

  function syncPartnerDetailPolling() {
    const rs = partnerRequestStatusFromDetail(latestDetail);
    if (!isPartnerBidDetailPollingPhase(rs)) {
      stopPartnerDetailPolling();
      return;
    }
    if (!partnerDetailPollTimer) {
      partnerDetailPollTimer = window.setInterval(() => {
        if (document.visibilityState !== "visible") return;
        const status = partnerRequestStatusFromDetail(latestDetail);
        if (!isPartnerBidDetailPollingPhase(status)) {
          stopPartnerDetailPolling();
          return;
        }
        void refreshPartnerBidDetail(false);
      }, PARTNER_BID_DETAIL_POLL_MS);
    }
  }

  renderBidRequestView(latestDetail);
  startPartnerCountdownTicker();
  syncPartnerDetailPolling();

  subscribeRealtimeEvents((ev) => {
    const type = String(ev?.type || "").trim();
    if (type !== "bid.updated") return;
    const payload = normalizeBidUpdatedPayload(ev);
    if (!isBiddingBidUpdatedPayload(payload)) return;
    if (!bidUpdatedMatchesScope(payload, { bidRequestId })) return;
    const kind = String(payload.update_kind || "").trim().toUpperCase();
    const showToast = kind !== "CUSTOMER_SELECTED" && kind !== "EXPIRED" && kind !== "CANCELLED";
    void refreshPartnerBidDetail(showToast);
  });
}

init();
