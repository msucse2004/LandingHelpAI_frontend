/**
 * BIDDING_ONLY 견적 요청 상세·제출 (generic PRODUCT_OFFER).
 * 라우트: `#/partner/bid-requests/<uuid>` 또는 `?bid_request_id=`
 *
 * Bump PARTNER_BID_DETAIL_ASSET_VERSION (and the same query in partner-bid-request.html)
 * when car-ui / product-ui / this entry script changes.
 */
import { partnerNavHref } from "../config/partner-nav-config.js";
import { mountPartnerShell } from "../layouts/partner-shell.js";
import { renderPartnerBidRequestContentHtml } from "./partner-bid-request-content.js";
import { partnerThreadsApi } from "../core/api.js";
import { alertI18n } from "../core/app-dialog.js";
import { subscribeRealtimeEvents } from "../core/realtime-client.js";
import {
  bidUpdatedMatchesScope,
  BIDDING_EVENT_KINDS,
  isBiddingEventPayload,
  isBiddingRealtimeSseEvent,
  isPartnerBidRequestHtmlPage,
  normalizeBiddingEventPayload,
  showBidUpdatedToast,
} from "../core/bid-realtime.js";
import { isPartnerBidDetailPollingPhase } from "./partner-bid-request-product-logic.js";
import { getCurrentRole } from "../core/auth.js";
import { ROLES } from "../core/config.js";
import { refreshPartnerModeSession } from "../core/partner-mode-session.js";
import { ensureCustomerAccess, protectCurrentPage } from "../core/guards.js";
import { syncHeaderRoleBadge } from "../core/role-header-badge.js";
import { clearShellTopLayerBlockers } from "../core/ui-blockers.js";
import { bootAppPageContent } from "../core/app-page-i18n-boot.js";
import { t } from "../core/i18n-client.js";
import { resolvePartnerBidServiceTitle } from "./partner-bid-request-intake-display.js";
import { applyI18nToDom, wireDynamicPageI18nRefresh } from "../core/i18n-dom.js";
import {
  createBidCountdownTicker,
  formatPartnerCountdownBanner,
  normalizeDeadlineSnapshot,
  remainingSecondsFromDeadline,
} from "../core/bid-deadline-display.js";
import { setClassNameIfChanged, setTextIfChanged } from "../core/page-refresh.js";
import { resolveCarPurchaseMode } from "./partner-bid-request-car-logic.js";
import { isPartnerCarOfferDraftDirty, clearPartnerCarOfferDraft } from "./partner-bid-request-car-draft.js";
import {
  endedStateMessage,
  offersFromIncludedItems as productOffersFromIncludedItems,
  partnerBidStatusLabel,
  resolvePartnerBidEditable,
} from "./partner-bid-request-product-logic.js";
import { offersFromIncludedItems as carOffersFromIncludedItems } from "./partner-bid-request-car-logic.js";

/** Cache-bust query for partner bid detail modules (must match partner-bid-request.html script src). */
const PARTNER_BID_DETAIL_ASSET_VERSION = "20260519-flicker-refresh-1";

/** @type {(() => Promise<void>) | null} */
let partnerBidDetailLanguageRefresh = null;

const PARTNER_BID_I18N_PREFIXES = ["partner.", "common.", "messages."];

function refreshPartnerBidDetailStaticI18n() {
  const root = document.querySelector("#partnerBidMain") || document;
  applyI18nToDom(root);
  if (latestPartnerDetailForCountdown) {
    renderPartnerCountdownBanner(latestPartnerDetailForCountdown);
  }
}

wireDynamicPageI18nRefresh(() => {
  void partnerBidDetailLanguageRefresh?.();
}, { languageChangeOnly: true });

wireDynamicPageI18nRefresh(refreshPartnerBidDetailStaticI18n, {
  runtimeResolvedOnly: true,
  keyPrefixes: PARTNER_BID_I18N_PREFIXES,
});

/** @param {string} moduleFile e.g. partner-bid-request-car-ui.js */
function partnerBidDetailModuleUrl(moduleFile) {
  const base = String(moduleFile || "").trim().replace(/^\.\//, "");
  return `./${base}?v=${encodeURIComponent(PARTNER_BID_DETAIL_ASSET_VERSION)}`;
}

/** @type {((root: HTMLElement, ctx: object) => void) | null} */
let mountCarPurchaseBidUiCached = null;

/** @type {((root: HTMLElement, ctx: object) => void) | null} */
let mountProductOfferBidUiCached = null;

/** Load CAR UI with cache-busted module URL. */
async function loadMountCarPurchaseBidUi() {
  if (mountCarPurchaseBidUiCached) return mountCarPurchaseBidUiCached;
  const mod = await import(partnerBidDetailModuleUrl("partner-bid-request-car-ui.js"));
  if (typeof mod.mountCarPurchaseBidUi !== "function") {
    throw new Error("mountCarPurchaseBidUi export missing");
  }
  mountCarPurchaseBidUiCached = mod.mountCarPurchaseBidUi;
  return mountCarPurchaseBidUiCached;
}

/** Load product UI on demand so a broken product module cannot block CAR_PURCHASE pages. */
async function loadMountProductOfferBidUi() {
  if (mountProductOfferBidUiCached) return mountProductOfferBidUiCached;
  const mod = await import(partnerBidDetailModuleUrl("partner-bid-request-product-ui.js"));
  if (typeof mod.mountProductOfferBidUi !== "function") {
    throw new Error("mountProductOfferBidUi export missing");
  }
  mountProductOfferBidUiCached = mod.mountProductOfferBidUi;
  return mountProductOfferBidUiCached;
}

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

/** @param {Record<string, unknown>} data */
function partnerBidRequestStatusFromData(data) {
  const brBlock =
    data.bid_request && typeof data.bid_request === "object"
      ? /** @type {Record<string, unknown>} */ (data.bid_request)
      : null;
  return String(data.bid_request_status ?? brBlock?.bid_request_status ?? "OPEN")
    .trim()
    .toUpperCase();
}

/** @param {Record<string, unknown>} data */
function partnerBidExpiresAtFromData(data) {
  const brBlock =
    data.bid_request && typeof data.bid_request === "object"
      ? /** @type {Record<string, unknown>} */ (data.bid_request)
      : null;
  const fromBlock = brBlock?.expires_at != null ? String(brBlock.expires_at) : "";
  if (fromBlock.trim()) return fromBlock.trim();
  const top = data.expires_at != null ? String(data.expires_at) : "";
  if (top.trim()) return top.trim();
  return getExpiresAtFromQuery();
}

/** @param {Record<string, unknown>} data */
function partnerBidStructuralRenderKey(data) {
  const isCar = resolveCarPurchaseMode(data);
  const bid =
    data.bid && typeof data.bid === "object"
      ? /** @type {Record<string, unknown>} */ (data.bid)
      : {};
  const reqStatus = partnerBidRequestStatusFromData(data);
  const bidStatus = String(bid.status ?? "").trim().toUpperCase();
  const expiresAt = partnerBidExpiresAtFromData(data);
  const editable = resolvePartnerBidEditable({
    bidStatus,
    requestStatus: reqStatus,
    expiresAt,
  });
  const ended = endedStateMessage(bid, reqStatus) ? "1" : "0";
  const selected = bidStatus === "SELECTED" ? "1" : "0";
  const bidCfg =
    data.bidding_config && typeof data.bidding_config === "object"
      ? data.bidding_config
      : data.car_purchase_config && typeof data.car_purchase_config === "object"
        ? data.car_purchase_config
        : {};
  const requiresPhotos = bidCfg.requires_offer_photos === true ? "1" : "0";
  let layout = "";
  if (isCar) {
    const vreqs = Array.isArray(data.customer_vehicle_requests)
      ? data.customer_vehicle_requests
      : [];
    const offers = carOffersFromIncludedItems(bid.included_items);
    layout = `v:${vreqs.length}:o:${offers.length || 1}`;
  } else {
    const offers = productOffersFromIncludedItems(bid.included_items);
    layout = `o:${Math.max(offers.length, 1)}`;
  }
  return `${isCar ? "car" : "prod"}|${reqStatus}|${bidStatus}|${editable ? "e" : "l"}|${selected}|${ended}|${layout}|ph:${requiresPhotos}`;
}

/** @returns {"car" | "product" | null} */
function detectMountedPartnerBidMode() {
  const carRoot = document.querySelector("#partnerBidCarRoot");
  if (
    carRoot instanceof HTMLElement &&
    !carRoot.hidden &&
    carRoot.querySelector("#partnerCarForm")
  ) {
    return "car";
  }
  const prodRoot = document.querySelector("#partnerBidProductRoot");
  if (
    prodRoot instanceof HTMLElement &&
    !prodRoot.hidden &&
    prodRoot.querySelector("#pbrProdForm")
  ) {
    return "product";
  }
  return null;
}

function setText(sel, text) {
  const el = document.querySelector(sel);
  if (el) el.textContent = text;
}

/** @type {(() => void) | null} */
let partnerCountdownStop = null;
/** @type {ReturnType<typeof setInterval> | null} */
let partnerDetailPollTimer = null;
/** @type {(() => void) | null} */
let partnerRealtimeUnsub = null;
/** @type {Record<string, unknown> | null} */
let latestPartnerDetailForCountdown = null;
const PARTNER_BID_DETAIL_POLL_MS = 30_000;
const PARTNER_DASHBOARD_HREF = partnerNavHref("bid_requests");

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
  const text = formatPartnerCountdownBanner(snap, Date.now(), t);
  const rem = remainingSecondsFromDeadline(snap);
  const expired =
    snap?.is_expired === true ||
    reqStatus === "EXPIRED" ||
    (rem != null && rem <= 0);
  el.hidden = false;
  setTextIfChanged(el, text);
  setClassNameIfChanged(
    el,
    expired ? "lhai-par-bid__countdown lhai-par-bid__countdown--expired" : "lhai-par-bid__countdown",
  );
}

function startPartnerCountdownTicker() {
  if (partnerCountdownStop) {
    partnerCountdownStop();
    partnerCountdownStop = null;
  }
  partnerCountdownStop = createBidCountdownTicker({
    getDeadline: () => normalizeDeadlineSnapshot(latestPartnerDetailForCountdown),
    formatBanner: (snap) => formatPartnerCountdownBanner(snap, Date.now(), t),
    onTick: (text, expired) => {
      const el = document.querySelector("#partnerBidCountdownBanner");
      if (!(el instanceof HTMLElement)) return;
      el.hidden = false;
      setTextIfChanged(el, text);
      setClassNameIfChanged(
        el,
        expired ? "lhai-par-bid__countdown lhai-par-bid__countdown--expired" : "lhai-par-bid__countdown",
      );
    },
    intervalMs: 1000,
  });
}

/** @param {Record<string, unknown>} data */
function applyPageHeader(data) {
  const bid =
    data.bid && typeof data.bid === "object" ? /** @type {Record<string, unknown>} */ (data.bid) : {};
  const bidStatus = String(bid.status ?? "").trim().toUpperCase();
  const reqStatus = String(data.bid_request_status ?? "OPEN").trim().toUpperCase();
  const svcName = resolvePartnerBidServiceTitle(data, t);
  setText("#partnerBidPageTitle", svcName);
  setText("#partnerBidPageSubtitle", `${partnerBidStatusLabel(bidStatus, reqStatus, t)} · ${String(data.bid_request_id || "").trim() || "—"}`);
}

/** @param {Record<string, unknown>} data @param {object} mountCtx */
async function renderProductBidRequest(data, mountCtx) {
  const carRoot = document.querySelector("#partnerBidCarRoot");
  const root = document.querySelector("#partnerBidProductRoot");
  if (carRoot instanceof HTMLElement) {
    carRoot.hidden = true;
    carRoot.innerHTML = "";
  }
  if (!(root instanceof HTMLElement)) return;
  root.hidden = false;
  applyPageHeader(data);
  const mount = await loadMountProductOfferBidUi();
  mount(root, mountCtx);
}

/** @param {Record<string, unknown>} data @param {object} mountCtx */
async function renderCarPurchaseBidRequest(data, mountCtx) {
  const productRoot = document.querySelector("#partnerBidProductRoot");
  const root = document.querySelector("#partnerBidCarRoot");
  if (productRoot instanceof HTMLElement) {
    productRoot.hidden = true;
    productRoot.innerHTML = "";
  }
  if (!(root instanceof HTMLElement)) return;
  root.hidden = false;
  applyPageHeader(data);
  const bidRequestBlock =
    data.bid_request && typeof data.bid_request === "object"
      ? /** @type {Record<string, unknown>} */ (data.bid_request)
      : null;
  const mount = await loadMountCarPurchaseBidUi();
  mount(root, { ...mountCtx, data, bidRequestBlock });
}

function getPartnerBidPageEls() {
  return {
    loadingEl: document.querySelector("#partnerBidLoading"),
    mainEl: document.querySelector("#partnerBidMain"),
    errEl: document.querySelector("#partnerBidError"),
  };
}

/** @param {string} step @param {unknown} [detail] */
function debugLog(step, detail) {
  if (detail !== undefined) {
    console.debug(`[partner-bid-request] ${step}`, detail);
  } else {
    console.debug(`[partner-bid-request] ${step}`);
  }
}

/** @param {string} phase @param {unknown} err */
function logPartnerBidError(phase, err) {
  console.error(`[partner-bid-request] ${phase}`, err);
  if (err instanceof Error && err.stack) {
    console.error(err.stack);
  }
}

/** @param {unknown} err */
function shortErrorMessage(err) {
  if (err instanceof Error) return err.message || "Unknown error";
  if (typeof err === "string" && err.trim()) return err.trim();
  return "Unknown error";
}

/** @param {unknown} err */
function httpUserMessageFromError(err) {
  const st = httpStatusFromError(err);
  if (st === 401) return t("partner.bid.error.auth_required", "Sign in is required.");
  if (st === 403) return t("partner.bid.error.forbidden", "You do not have access to this bid request.");
  if (st === 404) return t("partner.bid.error.not_found", "Bid request not found.");
  if (st === 500) return t("partner.bid.error.server", "A server error occurred.");
  return shortErrorMessage(err);
}

function teardownPartnerBidPageRuntime() {
  if (partnerCountdownStop) {
    partnerCountdownStop();
    partnerCountdownStop = null;
  }
  if (partnerDetailPollTimer) {
    window.clearInterval(partnerDetailPollTimer);
    partnerDetailPollTimer = null;
  }
  if (partnerRealtimeUnsub) {
    try {
      partnerRealtimeUnsub();
    } catch {
      /* ignore */
    }
    partnerRealtimeUnsub = null;
  }
  latestPartnerDetailForCountdown = null;
}

function showPartnerBidLoading() {
  const { loadingEl, mainEl, errEl } = getPartnerBidPageEls();
  if (loadingEl instanceof HTMLElement) loadingEl.hidden = false;
  if (mainEl instanceof HTMLElement) mainEl.hidden = true;
  if (errEl instanceof HTMLElement) {
    errEl.hidden = true;
    errEl.replaceChildren();
  }
}

function showPartnerBidMain() {
  const { loadingEl, mainEl, errEl } = getPartnerBidPageEls();
  if (loadingEl instanceof HTMLElement) loadingEl.hidden = true;
  if (mainEl instanceof HTMLElement) mainEl.hidden = false;
  if (errEl instanceof HTMLElement) {
    errEl.hidden = true;
    errEl.replaceChildren();
  }
}

/**
 * @param {{
 *   title?: string,
 *   lead?: string,
 *   errorDetail?: string,
 *   phase?: string,
 *   showRetry?: boolean,
 * }} [opts]
 */
function showPartnerBidLoadError(opts = {}) {
  const { loadingEl, mainEl, errEl } = getPartnerBidPageEls();
  if (loadingEl instanceof HTMLElement) loadingEl.hidden = true;
  if (mainEl instanceof HTMLElement) mainEl.hidden = true;
  if (!(errEl instanceof HTMLElement)) return;

  errEl.hidden = false;
  errEl.replaceChildren();

  const title = document.createElement("h2");
  title.className = "lhai-par-bid__error-panel__title";
  title.textContent =
    opts.title || t("partner.bid.error.load_title", "Could not load bid request details.");

  const lead = document.createElement("p");
  lead.className = "lhai-par-bid__error-panel__lead";
  lead.textContent = opts.lead || t("partner.bid.error.load_lead", "Please try again in a moment.");

  errEl.append(title, lead);

  if (opts.phase) {
    const phaseEl = document.createElement("p");
    phaseEl.className = "lhai-par-bid__error-panel__phase";
    phaseEl.textContent = t("partner.bid.error.phase", "Step: {phase}").replace("{phase}", opts.phase);
    errEl.append(phaseEl);
  }

  if (opts.errorDetail) {
    const detail = document.createElement("div");
    detail.className = "lhai-par-bid__error-panel__detail";
    const lbl = document.createElement("span");
    lbl.className = "lhai-par-bid__error-panel__detail-label";
    lbl.textContent = "Error:";
    const txt = document.createElement("p");
    txt.className = "lhai-par-bid__error-panel__detail-text";
    txt.textContent = opts.errorDetail;
    detail.append(lbl, txt);
    errEl.append(detail);
  }

  const actions = document.createElement("div");
  actions.className = "lhai-par-bid__error-actions";

  if (opts.showRetry !== false) {
    const retryBtn = document.createElement("button");
    retryBtn.type = "button";
    retryBtn.className = "lhai-button lhai-button--primary";
    retryBtn.textContent = t("common.retry", "Try again");
    retryBtn.addEventListener("click", () => {
      void runPartnerBidRequestPage();
    });
    actions.append(retryBtn);
  }

  const dashBtn = document.createElement("a");
  dashBtn.className = "lhai-button lhai-button--secondary";
  dashBtn.href = PARTNER_DASHBOARD_HREF;
  dashBtn.textContent = t("partner.bid.error.back_dashboard", "Back to dashboard");
  actions.append(dashBtn);

  errEl.append(actions);
}

async function runPartnerBidRequestPage() {
  teardownPartnerBidPageRuntime();
  showPartnerBidLoading();

  try {
    debugLog("page init started");

    try {
      await refreshPartnerModeSession(partnerThreadsApi);
    } catch (err) {
      logPartnerBidError("shell init failed", err);
      debugLog("render failed", { phase: "shell_init" });
      showPartnerBidLoadError({
        lead: t("partner.bid.error.shell_init", "Could not prepare the page. Please try again."),
        errorDetail: shortErrorMessage(err),
        phase: "shell_init",
      });
      return;
    }

    const bidRequestId = getBidRequestIdFromLocation();
    const expiresAtQuery = getExpiresAtFromQuery();
    const requestStatusQuery = getRequestStatusFromQuery();

    debugLog("bid_request_id parsed", { bidRequestId: bidRequestId || null });

    if (!bidRequestId) {
      debugLog("render failed", { phase: "parse_id", reason: "missing bid_request_id" });
      showPartnerBidLoadError({
        lead: t("partner.bid.error.missing_id", "Bid request ID is missing. Open it again from the dashboard."),
        errorDetail: "bid_request_id missing from URL",
        phase: "parse_id",
      });
      return;
    }

    let detail;
    try {
      debugLog("API fetch started", { bidRequestId });
      detail = await partnerThreadsApi.bidRequestDetail(bidRequestId);
      debugLog("API fetch success", { bidRequestId });
    } catch (err) {
      logPartnerBidError("API fetch failed", err);
      debugLog("render failed", { phase: "api_fetch", status: httpStatusFromError(err) });
      showPartnerBidLoadError({
        lead: httpUserMessageFromError(err),
        errorDetail: shortErrorMessage(err),
        phase: "api_fetch",
      });
      return;
    }

    if (!detail || typeof detail !== "object") {
      debugLog("render failed", { phase: "api_response", reason: "invalid payload" });
      showPartnerBidLoadError({
        lead: t("partner.bid.error.invalid_response", "The response format was invalid."),
        errorDetail: "bidRequestDetail returned empty or non-object response",
        phase: "api_response",
      });
      return;
    }

    showPartnerBidMain();

  /** @type {Record<string, unknown>} */
  let latestDetail = /** @type {Record<string, unknown>} */ (detail);
  latestPartnerDetailForCountdown = latestDetail;
  let lastPartnerBidStructuralKey = partnerBidStructuralRenderKey(latestDetail);

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
  const requiresOfferPhotos = bidCfg.requires_offer_photos === true;

  /** @param {Record<string, unknown>} data */
  async function renderBidRequestView(data) {
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

    const mountCtx = {
      data,
      expiresAtQuery: expEff,
      requestStatusQuery: reqStatus,
      requiresOfferPhotos,
      onDetailUpdate: (next) => {
        latestDetail = /** @type {Record<string, unknown>} */ (next);
        void renderBidRequestView(latestDetail)
          .then(() => syncPartnerDetailPolling())
          .catch((renderErr) => {
            logPartnerBidError("re-render after submit failed", renderErr);
            debugLog("render failed", { phase: "re_render" });
            showPartnerBidLoadError({
              lead: t("partner.bid.error.rerender", "Could not refresh the page. Please try again."),
              errorDetail: shortErrorMessage(renderErr),
              phase: "re_render",
            });
          });
        alertI18n(
          "common.dialog.partner.proposal_saved",
          "Your proposal was saved.",
        );
      },
      submitFn: (payload) => partnerThreadsApi.submitBidRequest(bidRequestId, payload),
      uploadOfferPhotoFn: (file, opts) =>
        partnerThreadsApi.uploadBidOfferPhoto(bidRequestId, file, opts),
      openMessagesFn: () => {
        const tid = String(latestDetail.thread_id || "").trim();
        if (!tid) {
          alertI18n(
            "common.dialog.partner.thread_not_found",
            "Could not find the linked customer conversation.",
          );
          return;
        }
        window.location.href = `partner-assigned-request.html?thread_id=${encodeURIComponent(tid)}`;
      },
    };

    lastPartnerBidStructuralKey = partnerBidStructuralRenderKey(data);
    if (resolveCarPurchaseMode(data)) {
      debugLog("render mode selected", { mode: "CAR_PURCHASE" });
      await renderCarPurchaseBidRequest(data, mountCtx);
    } else {
      debugLog("render mode selected", { mode: "PRODUCT_OFFER" });
      await renderProductBidRequest(data, mountCtx);
    }
  }

  /** @param {Record<string, unknown>} data */
  async function softRefreshPartnerBidDetail(data) {
    applyPageHeader(data);
    renderPartnerCountdownBanner(data);
    const mounted = detectMountedPartnerBidMode();
    const expectCar = resolveCarPurchaseMode(data);
    if (expectCar && mounted === "car") {
      const carRoot = document.querySelector("#partnerBidCarRoot");
      if (carRoot instanceof HTMLElement) {
        const carUi = await import(partnerBidDetailModuleUrl("partner-bid-request-car-ui.js"));
        if (typeof carUi.refreshCarPurchaseBidMeta === "function") {
          carUi.refreshCarPurchaseBidMeta(carRoot, data);
        }
      }
      return;
    }
    if (!expectCar && mounted === "product") {
      const prodRoot = document.querySelector("#partnerBidProductRoot");
      if (prodRoot instanceof HTMLElement) {
        const prodUi = await import(partnerBidDetailModuleUrl("partner-bid-request-product-ui.js"));
        if (typeof prodUi.refreshProductBidMeta === "function") {
          prodUi.refreshProductBidMeta(prodRoot, data);
        }
      }
    }
  }

  /** @param {boolean} [showToast] @param {string} [toastEventKind] */
  async function refreshPartnerBidDetail(showToast = false, toastEventKind = "") {
    try {
      const next = await partnerThreadsApi.bidRequestDetail(bidRequestId);
      latestDetail = /** @type {Record<string, unknown>} */ (next);
      latestPartnerDetailForCountdown = latestDetail;
      const reqStatus = partnerRequestStatusFromDetail(latestDetail);
      const carDraftDirty =
        resolveCarPurchaseMode(latestDetail) && isPartnerCarOfferDraftDirty(bidRequestId);

      if (carDraftDirty && isPartnerBidDetailPollingPhase(reqStatus)) {
        applyPageHeader(latestDetail);
        renderPartnerCountdownBanner(latestDetail);
        const carRoot = document.querySelector("#partnerBidCarRoot");
        if (carRoot instanceof HTMLElement && !carRoot.hidden) {
          const carUi = await import(partnerBidDetailModuleUrl("partner-bid-request-car-ui.js"));
          if (typeof carUi.refreshCarPurchaseBidMeta === "function") {
            carUi.refreshCarPurchaseBidMeta(carRoot, latestDetail);
          }
        }
        syncPartnerDetailPolling();
        return;
      }

      if (carDraftDirty) {
        clearPartnerCarOfferDraft(bidRequestId);
      }

      const structuralKey = partnerBidStructuralRenderKey(latestDetail);
      const mounted = detectMountedPartnerBidMode();
      const modeMatch =
        (resolveCarPurchaseMode(latestDetail) && mounted === "car") ||
        (!resolveCarPurchaseMode(latestDetail) && mounted === "product");

      if (mounted && modeMatch && structuralKey === lastPartnerBidStructuralKey) {
        await softRefreshPartnerBidDetail(latestDetail);
      } else {
        lastPartnerBidStructuralKey = structuralKey;
        await renderBidRequestView(latestDetail);
      }

      syncPartnerDetailPolling();
      if (
        showToast &&
        isPartnerBidRequestHtmlPage() &&
        typeof document !== "undefined" &&
        document.visibilityState === "visible"
      ) {
        const href = `${window.location.pathname}${window.location.search}${window.location.hash}`;
        const tid = String(latestDetail?.thread_id ?? "").trim();
        showBidUpdatedToast({
          title: t("partner.bid.toast.updated", "Bidding details were updated."),
          cta: t("common.confirm", "OK"),
          href,
          threadId: tid,
          bidRequestId,
          eventKind: toastEventKind || "BID_UPDATED",
        });
      }
    } catch (err) {
      logPartnerBidError("background refresh failed", err);
    }
  }

  /** Refetch detail for viewer locale; preserve in-progress offer/message drafts. */
  async function refreshPartnerBidDetailForLanguageChange() {
    try {
      refreshPartnerBidDetailStaticI18n();
      const next = await partnerThreadsApi.bidRequestDetail(bidRequestId);
      latestDetail = /** @type {Record<string, unknown>} */ (next);
      latestPartnerDetailForCountdown = latestDetail;

      const mounted = detectMountedPartnerBidMode();
      const expectCar = resolveCarPurchaseMode(latestDetail);
      const modeMatch =
        (expectCar && mounted === "car") || (!expectCar && mounted === "product");

      if (mounted && modeMatch) {
        await softRefreshPartnerBidDetail(latestDetail);
      } else {
        lastPartnerBidStructuralKey = partnerBidStructuralRenderKey(latestDetail);
        await renderBidRequestView(latestDetail);
        refreshPartnerBidDetailStaticI18n();
      }

      syncPartnerDetailPolling();
    } catch (err) {
      logPartnerBidError("language refresh failed", err);
    }
  }

  partnerBidDetailLanguageRefresh = refreshPartnerBidDetailForLanguageChange;

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

    try {
      await renderBidRequestView(latestDetail);
      debugLog("render success", { bidRequestId });
    } catch (err) {
      logPartnerBidError("render failed", err);
      debugLog("render failed", { phase: "render" });
      showPartnerBidLoadError({
        errorDetail: shortErrorMessage(err),
        phase: "render",
      });
      return;
    }

    startPartnerCountdownTicker();
    syncPartnerDetailPolling();

    partnerRealtimeUnsub = subscribeRealtimeEvents((ev) => {
      if (!isBiddingRealtimeSseEvent(ev)) return;
      const payload = normalizeBiddingEventPayload(ev);
      if (!isBiddingEventPayload(payload)) return;
      if (!bidUpdatedMatchesScope(payload, { bidRequestId })) return;
      const kind = String(payload.event_kind || "");
      const refreshKinds = [
        BIDDING_EVENT_KINDS.BID_SUBMITTED,
        BIDDING_EVENT_KINDS.BID_UPDATED,
        BIDDING_EVENT_KINDS.BIDDING_EXPIRED,
        BIDDING_EVENT_KINDS.CUSTOMER_SELECTED,
        BIDDING_EVENT_KINDS.NEW_ROUND_STARTED,
      ];
      if (!refreshKinds.includes(kind)) return;
      const showToast =
        kind === BIDDING_EVENT_KINDS.BID_SUBMITTED || kind === BIDDING_EVENT_KINDS.BID_UPDATED;
      void refreshPartnerBidDetail(showToast, kind);
    });
  } catch (err) {
    logPartnerBidError("page init failed", err);
    debugLog("render failed", { phase: "init" });
    showPartnerBidLoadError({
      errorDetail: shortErrorMessage(err),
      phase: "init",
    });
  }
}

async function bootstrapPartnerBidRequestPage() {
  console.debug("[partner-bid-request] asset version", PARTNER_BID_DETAIL_ASSET_VERSION);
  clearShellTopLayerBlockers();
  syncHeaderRoleBadge();
  if (getCurrentRole() !== ROLES.PARTNER) {
    window.location.replace("dashboard.html");
    return;
  }
  if (!protectCurrentPage()) return;
  if (!ensureCustomerAccess()) return;

  await bootAppPageContent(["common", "nav", "partner"], async () => {
  await mountPartnerShell("#app", {
    pageKey: "bid_requests",
    documentTitle: t("partner.bid.page_title", "Bid request — Landing Help AI"),
    contentHtml: renderPartnerBidRequestContentHtml(),
  });

  await runPartnerBidRequestPage();
  });
}

void bootstrapPartnerBidRequestPage().catch((err) => {
  logPartnerBidError("bootstrap failed", err);
  debugLog("render failed", { phase: "bootstrap" });
  showPartnerBidLoadError({
    errorDetail: shortErrorMessage(err),
    phase: "bootstrap",
  });
});
