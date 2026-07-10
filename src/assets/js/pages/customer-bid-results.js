/**
 * 고객 견적 제안 비교 — PRODUCT_OFFER 카드 리스트.
 */
import { customerBidsApi } from "../core/api.js";
import { alertI18n, alertPlain } from "../core/app-dialog.js";
import { t } from "../core/i18n-client.js";
import { resolveBackendMediaUrl } from "../core/utils.js";
import { ensureCustomerAccess } from "../core/guards.js";
import { loadSidebar } from "../components/sidebar.js";
import { bootAppPageContent } from "../core/app-page-i18n-boot.js";
import { applyI18nToDom, wireDynamicPageI18nRefresh } from "../core/i18n-dom.js";
import { subscribeRealtimeEvents } from "../core/realtime-client.js";
import {
  bidUpdatedMatchesScope,
  BIDDING_EVENT_KINDS,
  isBiddingEventPayload,
  isBiddingRealtimeSseEvent,
  normalizeBiddingEventPayload,
} from "../core/bid-realtime.js";
import {
  buildCustomerBidRequestTabs,
  buildCustomerBidsApiQuery,
  buildCustomerBidResultsPageHref,
  buildMessagesThreadHref,
  renderSelectionConversationBannerHtml,
  collectDistinctLocations,
  collectDistinctPartners,
  collectDistinctProductCategories,
  CUSTOMER_BID_SORT_OPTIONS,
  emptyOffersMessage,
  filterOffersByTab,
  formatAttributesList,
  formatBidRequestStatusLabel,
  customerBidStatusBannerMessage,
  buildCustomerBidSelectConfirmContent,
  canSelectCustomerBid,
  formatCountdownToExpiry,
  formatMoney,
  formatOfferPartnerName,
  formatOfferPriceBreakdownLines,
  formatOfferRankBadge,
  formatOfferTitle,
  formatQuoteRequestUsage,
  canRequestNewBidRound,
  quoteRequestRemaining,
  isProductOfferListResponse,
  offerShowsUpdatedBadge,
  buildOfferThumbImgHtml,
  wireOfferPhotoImgFallbacks,
  resolveCustomerBidDisplayPhase,
  isCustomerBidListPollingPhase,
  snapshotHasBudgetHint,
  isVehicleOffer,
  buildVehicleOfferCardHtml,
  buildVehicleOfferDetailModalHtml,
  offerSelectionUiState,
} from "./customer-bid-results-logic.js";
import {
  createBidCountdownTicker,
  formatBidDeadlineForUi,
  formatCustomerCountdownBanner,
  normalizeDeadlineSnapshot,
} from "../core/bid-deadline-display.js";
import { setInnerHtmlIfChanged } from "../core/page-refresh.js";

function escapeHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function readPageParams() {
  const q = new URLSearchParams(window.location.search);
  return {
    serviceRequestId: (q.get("service_request_id") || q.get("workflow_instance_id") || "").trim(),
    threadId: (q.get("thread_id") || q.get("thread") || "").trim(),
  };
}

/** @type {Record<string, unknown> | null} */
let listSnapshot = null;
let activeTabKey = "all";
let activeSort = "recommended";
/** @type {Record<string, unknown>} */
let activeFilters = {
  hasPhotos: false,
  budgetOnly: false,
  productCategory: "",
  partner: "",
  location: "",
  includeAlternatives: true,
  updatedOnly: false,
};
let selectedBidId = "";
let selectedOfferId = "";
let countdownStop = null;
let listPollTimer = null;
let realtimeUnsub = null;
let deadlineExpireReloadPending = false;
const CBR_LIST_POLL_MS = 20_000;
/** @type {{ bidId: string, offer: Record<string, unknown> } | null} */
let pendingSelect = null;
/** @type {Record<string, unknown> | null} */
let detailOffer = null;
let newRoundInFlight = false;
/** @type {string | null} */
let lastCardsRenderKey = null;
/** @type {string | null} */
let lastToolbarOptionsKey = null;
/** @type {string | null} */
let lastTabsRenderKey = null;
let sortSelectInitialized = false;

const { serviceRequestId: initialServiceRequestId, threadId: initialThreadId } = readPageParams();
let serviceRequestId = initialServiceRequestId;
let threadId = initialThreadId;

function buildApiQuery() {
  const q = buildCustomerBidsApiQuery({
    sort: activeSort,
    hasPhotos: activeFilters.hasPhotos,
    budgetOnly: activeFilters.budgetOnly,
    productCategory: activeFilters.productCategory,
    partner: activeFilters.partner,
    location: activeFilters.location,
    includeAlternatives: activeFilters.includeAlternatives,
    updatedOnly: activeFilters.updatedOnly,
  });
  const tab = buildCustomerBidRequestTabs(listSnapshot?.customer_vehicle_requests || []);
  const tabRow = tab.find((t) => t.key === activeTabKey);
  if (tabRow?.requestIndex != null && activeTabKey.startsWith("req-")) {
    q.request_index = tabRow.requestIndex;
  }
  if (activeTabKey === "alternatives") q.include_alternatives = true;
  return q;
}

async function fetchList() {
  const query = buildApiQuery();
  if (serviceRequestId) return await customerBidsApi.listByServiceRequest(serviceRequestId, query);
  if (threadId) return await customerBidsApi.listByThread(threadId, query);
  throw new Error("service_request_id 또는 thread_id가 필요합니다.");
}

function deadlineSnapshot() {
  return normalizeDeadlineSnapshot(listSnapshot);
}

function displayPhase() {
  const snap = listSnapshot;
  const status = snap?.bid_request_status ?? snap?.status;
  return resolveCustomerBidDisplayPhase(status, snap?.expires_at);
}

function visibleOffers() {
  const offers = Array.isArray(listSnapshot?.offers) ? listSnapshot.offers : [];
  return filterOffersByTab(offers, activeTabKey);
}

function totalOfferCount() {
  return Array.isArray(listSnapshot?.offers) ? listSnapshot.offers.length : 0;
}

function renderSelectedBanner(phase) {
  const el = document.querySelector("#cbrSelectedBanner");
  if (!(el instanceof HTMLElement)) return;
  const summary = listSnapshot?.selected_offer_summary;
  if (phase !== "CUSTOMER_SELECTED" || !summary || typeof summary !== "object") {
    el.hidden = true;
    el.textContent = "";
    return;
  }
  const title = String(summary.vehicle_title || summary.title || "선택한 제안").trim();
  const total = summary.estimated_total;
  const cur = String(summary.currency || "USD");
  const partner = String(summary.partner_name || "").trim();
  el.hidden = false;
  const price =
    total != null ? ` · ${formatMoney(total, cur)}` : "";
  const partnerBit = partner ? ` · ${partner}` : "";
  el.textContent = `선택한 제안: ${title}${price}${partnerBit}`;
}

function renderConversationBanner(phase) {
  const el = document.querySelector("#cbrConversationBanner");
  if (!(el instanceof HTMLElement)) return;
  if (phase !== "CUSTOMER_SELECTED" || !threadId) {
    el.hidden = true;
    el.innerHTML = "";
    return;
  }
  const summary = listSnapshot?.selected_offer_summary;
  const partner =
    summary && typeof summary === "object"
      ? { partner_name: summary.partner_name }
      : null;
  const offer =
    summary && typeof summary === "object"
      ? {
          title: summary.title || summary.vehicle_title,
          estimated_total: summary.estimated_total,
          currency: summary.currency,
        }
      : null;
  el.hidden = false;
  setInnerHtmlIfChanged(el, renderSelectionConversationBannerHtml(threadId, offer, partner));
}

function renderStatusBanner(phase) {
  const el = document.querySelector("#cbrStatusBanner");
  if (!(el instanceof HTMLElement)) return;
  const msg = customerBidStatusBannerMessage(phase);
  if (!msg) {
    el.hidden = true;
    el.textContent = "";
    return;
  }
  el.hidden = false;
  el.className =
    phase === "CUSTOMER_SELECTED"
      ? "lhai-cbr-banner lhai-cbr-banner--success"
      : "lhai-cbr-banner lhai-cbr-banner--warn";
  el.textContent = msg;
}

function applyCountdownBannerText(text, expired) {
  const el = document.querySelector("#cbrCountdownBanner");
  if (!(el instanceof HTMLElement)) return;
  const nextClass = expired
    ? "lhai-cbr-countdown lhai-cbr-countdown--expired"
    : "lhai-cbr-countdown";
  if (el.textContent !== text) el.textContent = text;
  if (el.className !== nextClass) el.className = nextClass;
  if (el.hidden) el.hidden = false;
}

function renderCountdownBanner(phase) {
  const el = document.querySelector("#cbrCountdownBanner");
  if (!(el instanceof HTMLElement)) return;
  if (phase === "CUSTOMER_SELECTED") {
    el.hidden = true;
    el.textContent = "";
    return;
  }
  const snap = deadlineSnapshot();
  const text = formatCustomerCountdownBanner(snap);
  const expired = phase === "EXPIRED" || text === "비딩 종료";
  applyCountdownBannerText(text, expired);
}

function renderHeader() {
  const phase = displayPhase();
  const snap = listSnapshot;
  const status = snap?.bid_request_status ?? snap?.status;
  setText("#cbrBidStatus", formatBidRequestStatusLabel(String(status || "")));
  setText("#cbrOfferCount", snap?.offer_count != null ? String(snap.offer_count) : "0");
  setText("#cbrQuoteUsage", formatQuoteRequestUsage(snap?.quote_request_usage));
  const countdownEl = document.querySelector("#cbrCountdown");
  if (countdownEl) {
    countdownEl.textContent =
      phase === "OPEN" || phase === "EXPIRED" ? formatBidDeadlineForUi(deadlineSnapshot()) : "—";
  }
  renderCountdownBanner(phase);
  renderSelectedBanner(phase);
  renderConversationBanner(phase);
  renderStatusBanner(phase);
  renderNewRoundCta(phase);
}

function renderNewRoundCta(phase) {
  const btn = document.querySelector("#cbrNewRoundBtn");
  const hint = document.querySelector("#cbrNewRoundHint");
  if (!(btn instanceof HTMLButtonElement)) return;
  const snap = listSnapshot;
  const can = canRequestNewBidRound(snap) && !newRoundInFlight;
  const show = phase === "OPEN" || phase === "EXPIRED";
  btn.hidden = !show;
  if (!show) {
    if (hint instanceof HTMLElement) hint.hidden = true;
    return;
  }
  btn.disabled = !can;
  if (hint instanceof HTMLElement) {
    if (phase === "CUSTOMER_SELECTED") {
      hint.hidden = false;
      hint.textContent = "이미 파트너를 선택했습니다.";
    } else if (quoteRequestRemaining(snap?.quote_request_usage) === 0) {
      hint.hidden = false;
      hint.textContent = "새 비딩 요청 횟수를 모두 사용했습니다.";
    } else if (newRoundInFlight) {
      hint.hidden = false;
      hint.textContent = "새 라운드를 요청하는 중…";
    } else {
      hint.hidden = true;
      hint.textContent = "";
    }
  }
}

function setText(sel, text) {
  const el = document.querySelector(sel);
  if (el) el.textContent = text;
}

function renderTabs() {
  const nav = document.querySelector("#cbrTabs");
  if (!(nav instanceof HTMLElement)) return;
  const vehicleReqs = listSnapshot?.customer_vehicle_requests;
  const tabs = buildCustomerBidRequestTabs(vehicleReqs || []);
  const showTabs = Array.isArray(vehicleReqs) && vehicleReqs.length > 0;
  nav.hidden = !showTabs;
  if (!showTabs) {
    lastTabsRenderKey = null;
    return;
  }
  const tabsKey = `${tabs.map((t) => t.key).join("\u0001")}|${activeTabKey}`;
  if (tabsKey === lastTabsRenderKey) return;
  lastTabsRenderKey = tabsKey;
  nav.innerHTML = tabs
    .map((t) => {
      const active = t.key === activeTabKey ? " is-active" : "";
      return `<button type="button" class="lhai-cbr-tab${active}" data-cbr-tab="${escapeHtml(t.key)}">${escapeHtml(t.label)}</button>`;
    })
    .join("");
}

function buildToolbarOptionsKey(offers) {
  const cats = collectDistinctProductCategories(offers).join("\u0001");
  const partners = collectDistinctPartners(offers)
    .map((p) => p.id)
    .join("\u0001");
  const locs = collectDistinctLocations(offers).join("\u0001");
  const budget = snapshotHasBudgetHint(listSnapshot) ? "1" : "0";
  return `${cats}|${partners}|${locs}|${budget}`;
}

function renderToolbar() {
  const sortSel = document.querySelector("#cbrSort");
  if (sortSel instanceof HTMLSelectElement) {
    if (!sortSelectInitialized) {
      sortSel.innerHTML = CUSTOMER_BID_SORT_OPTIONS.map(
        (o) => `<option value="${escapeHtml(o.value)}">${escapeHtml(o.label)}</option>`,
      ).join("");
      sortSelectInitialized = true;
    }
    if (sortSel.value !== activeSort) sortSel.value = activeSort;
  }

  const budgetWrap = document.querySelector("#cbrFilterBudgetWrap");
  if (budgetWrap instanceof HTMLElement) {
    budgetWrap.hidden = !snapshotHasBudgetHint(listSnapshot);
  }

  const offers = Array.isArray(listSnapshot?.offers) ? listSnapshot.offers : [];
  const optionsKey = buildToolbarOptionsKey(offers);
  const rebuildFilters = optionsKey !== lastToolbarOptionsKey;
  if (rebuildFilters) lastToolbarOptionsKey = optionsKey;

  const catSel = document.querySelector("#cbrFilterCategory");
  if (catSel instanceof HTMLSelectElement && rebuildFilters) {
    const cats = collectDistinctProductCategories(offers);
    const cur = String(activeFilters.productCategory || "");
    catSel.innerHTML =
      `<option value="">전체</option>` +
      cats.map((c) => `<option value="${escapeHtml(c)}"${c === cur ? " selected" : ""}>${escapeHtml(c)}</option>`).join("");
  }
  const partnerSel = document.querySelector("#cbrFilterPartner");
  if (partnerSel instanceof HTMLSelectElement && rebuildFilters) {
    const partners = collectDistinctPartners(offers);
    const cur = String(activeFilters.partner || "");
    partnerSel.innerHTML =
      `<option value="">전체</option>` +
      partners
        .map(
          (p) =>
            `<option value="${escapeHtml(p.id)}"${p.id === cur ? " selected" : ""}>${escapeHtml(p.name)}</option>`,
        )
        .join("");
  }
  const locSel = document.querySelector("#cbrFilterLocation");
  if (locSel instanceof HTMLSelectElement && rebuildFilters) {
    const locs = collectDistinctLocations(offers);
    const cur = String(activeFilters.location || "");
    locSel.innerHTML =
      `<option value="">전체</option>` +
      locs.map((l) => `<option value="${escapeHtml(l)}"${l === cur ? " selected" : ""}>${escapeHtml(l)}</option>`).join("");
  }

  const photos = document.querySelector("#cbrFilterPhotos");
  if (photos instanceof HTMLInputElement) photos.checked = Boolean(activeFilters.hasPhotos);
  const budget = document.querySelector("#cbrFilterBudget");
  if (budget instanceof HTMLInputElement) budget.checked = Boolean(activeFilters.budgetOnly);
  const alt = document.querySelector("#cbrFilterAlt");
  if (alt instanceof HTMLInputElement) alt.checked = activeFilters.includeAlternatives !== false;
  const updated = document.querySelector("#cbrFilterUpdated");
  if (updated instanceof HTMLInputElement) updated.checked = Boolean(activeFilters.updatedOnly);
}

function offerCardContext() {
  return {
    phase: displayPhase(),
    activeSort,
    recentUpdatedAt: listSnapshot?.recent_updated_at,
    snap: listSnapshot,
    selectedBidId,
    selectedOfferId,
  };
}

function renderOfferCard(offer) {
  if (isVehicleOffer(offer)) {
    return buildVehicleOfferCardHtml(offer, offerCardContext(), escapeHtml);
  }
  const ctx = offerCardContext();
  const bidId = String(offer.bid_id || "").trim();
  const offerId = String(offer.offer_id || "").trim();
  const cur = String(offer.currency || "USD");
  const rankBadge = formatOfferRankBadge(offer, activeSort);
  const partner = escapeHtml(formatOfferPartnerName(offer));
  const desc = String(offer.description || "").trim();
  const descShort = desc ? escapeHtml(desc.slice(0, 120)) + (desc.length > 120 ? "…" : "") : "";
  const msg = String(offer.message_to_customer || "").trim();
  const msgPreview = msg ? escapeHtml(msg.slice(0, 140)).replace(/\n/g, "<br />") : "—";
  const breakdown = formatOfferPriceBreakdownLines(offer);
  const breakdownHtml = breakdown
    .map((line) => {
      const cls = line.strong ? " lhai-cbr-card__price-line--strong" : "";
      const label = line.label ? `<span>${escapeHtml(line.label)}</span> ` : "";
      return `<li class="lhai-cbr-card__price-line${cls}">${label}${escapeHtml(line.value)}</li>`;
    })
    .join("");
  const updatedBadge = offerShowsUpdatedBadge(offer.updated_at, listSnapshot?.recent_updated_at)
    ? `<span class="lhai-cbr-badge lhai-cbr-badge--updated">업데이트됨</span>`
    : "";
  const sel = offerSelectionUiState(ctx.phase, offer, {
    selectedBidId,
    selectedOfferId,
    snap: listSnapshot,
  });
  const thumbHtml = buildOfferThumbImgHtml(offer, escapeHtml);
  const selectBtn = sel.showSelectButton
    ? `<button type="button" class="lhai-button lhai-button--primary" data-cbr-select="${escapeHtml(bidId)}" data-cbr-offer="${escapeHtml(offerId)}"${sel.selectDisabled ? " disabled" : ""}>이 제안 선택</button>`
    : "";
  const cardClasses = [
    "lhai-cbr-card",
    sel.isSelected ? "lhai-cbr-card--selected" : "",
    sel.dimmed ? "lhai-cbr-card--dimmed" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return `
    <article class="${cardClasses}" data-offer-id="${escapeHtml(offerId)}" data-bid-id="${escapeHtml(bidId)}">
      <div class="lhai-cbr-card__thumb">${thumbHtml}</div>
      <div class="lhai-cbr-card__body">
        <div class="lhai-cbr-card__badges">${rankBadge ? `<span class="lhai-cbr-badge lhai-cbr-badge--rank">${escapeHtml(rankBadge)}</span>` : ""}${updatedBadge}</div>
        <h3 class="lhai-cbr-card__title">${escapeHtml(formatOfferTitle(offer))}</h3>
        <p class="lhai-cbr-card__partner">${partner}</p>
        <p class="lhai-cbr-card__total">${escapeHtml(formatMoney(offer.estimated_total, cur))}</p>
        <ul class="lhai-cbr-card__prices">${breakdownHtml || `<li>—</li>`}</ul>
        <p class="lhai-cbr-card__timeline"><span>가능 시점</span> ${escapeHtml(String(offer.available_timeline || "—"))}</p>
        <p class="lhai-cbr-card__location"><span>위치</span> ${escapeHtml(String(offer.location || "—"))}</p>
        ${descShort ? `<p class="lhai-cbr-card__desc">${descShort}</p>` : ""}
        <div class="lhai-cbr-card__preview">
          <span class="lhai-cbr-card__preview-label">파트너 메시지</span>
          <p>${msgPreview}</p>
        </div>
        <div class="lhai-cbr-card__actions">
          <button type="button" class="lhai-button lhai-button--secondary" data-cbr-detail="${escapeHtml(offerId)}">자세히 보기</button>
          ${selectBtn}
        </div>
      </div>
    </article>`;
}

function buildCardsRenderKey(offers, phase) {
  const offerPart = offers
    .map((o) => {
      const row = /** @type {Record<string, unknown>} */ (o);
      return [
        row.offer_id,
        row.bid_id,
        row.updated_at,
        row.rank,
        row.estimated_total,
        selectedBidId,
        selectedOfferId,
        activeSort,
        activeTabKey,
        phase,
      ].join(":");
    })
    .join("|");
  return [
    offerPart,
    JSON.stringify(activeFilters),
    totalOfferCount(),
    listSnapshot?.bid_request_status,
    listSnapshot?.offer_count,
  ].join(";");
}

function renderCards() {
  const grid = document.querySelector("#cbrCards");
  const empty = document.querySelector("#cbrEmpty");
  if (!(grid instanceof HTMLElement)) return;
  const offers = visibleOffers();
  const phase = displayPhase();
  const emptyMsg = emptyOffersMessage(phase, totalOfferCount());
  if (!offers.length) {
    lastCardsRenderKey = `empty:${phase}:${totalOfferCount()}`;
    grid.innerHTML = "";
    if (empty instanceof HTMLElement) {
      empty.hidden = false;
      if (empty.textContent !== emptyMsg) empty.textContent = emptyMsg;
    }
    return;
  }
  if (empty instanceof HTMLElement) empty.hidden = true;
  const hasVehicle = offers.some((o) => isVehicleOffer(/** @type {Record<string, unknown>} */ (o)));
  grid.classList.toggle("lhai-cbr-cards--vehicle", hasVehicle);
  const renderKey = buildCardsRenderKey(offers, phase);
  if (renderKey === lastCardsRenderKey) return;
  lastCardsRenderKey = renderKey;
  grid.innerHTML = offers
    .map((o) => renderOfferCard(/** @type {Record<string, unknown>} */ (o)))
    .join("");
  wireOfferPhotoImgFallbacks(grid);
}

function renderMessagesCta() {
  const el = document.querySelector("#cbrMessagesCta");
  if (!(el instanceof HTMLElement)) return;
  if (displayPhase() !== "CUSTOMER_SELECTED" || !threadId) {
    el.hidden = true;
    return;
  }
  el.hidden = false;
  const href = buildMessagesThreadHref(threadId);
  setInnerHtmlIfChanged(
    el,
    `<a class="lhai-button lhai-button--primary" href="${escapeHtml(href)}">Open conversation</a>`,
  );
}

function renderAll() {
  renderHeader();
  renderTabs();
  renderToolbar();
  renderCards();
  renderMessagesCta();
  renderNewRoundCta(displayPhase());
}

/** @param {{ silent?: boolean }} [options] */
async function reloadList(options = {}) {
  const silent = Boolean(options.silent);
  const loading = document.querySelector("#cbrLoading");
  const main = document.querySelector("#cbrMain");
  const err = document.querySelector("#cbrError");
  if (!silent) {
    if (loading instanceof HTMLElement) loading.hidden = false;
    if (main instanceof HTMLElement) main.hidden = true;
    if (err instanceof HTMLElement) err.hidden = true;
    lastCardsRenderKey = null;
    lastToolbarOptionsKey = null;
    lastTabsRenderKey = null;
  }
  try {
    listSnapshot = await fetchList();
    if (!isProductOfferListResponse(listSnapshot)) {
      throw new Error("제안 목록을 불러올 수 없습니다.");
    }
    const serverSort = String(listSnapshot.default_sort || "").trim();
    if (serverSort) activeSort = serverSort;
    if (displayPhase() === "CUSTOMER_SELECTED" && !selectedBidId) {
      const summary = listSnapshot.selected_offer_summary;
      if (summary && typeof summary === "object" && summary.bid_id) {
        selectedBidId = String(summary.bid_id).trim();
        if (summary.offer_id) selectedOfferId = String(summary.offer_id).trim();
      } else {
        const bids = Array.isArray(listSnapshot.bids) ? listSnapshot.bids : [];
        if (bids.length === 1) selectedBidId = String(bids[0].bid_id || "").trim();
      }
    }
    renderAll();
    syncListPolling();
    if (!silent && main instanceof HTMLElement) main.hidden = false;
  } catch (e) {
    const msg = e && typeof e.message === "string" ? e.message : "제안을 불러오지 못했습니다.";
    if (err instanceof HTMLElement) {
      err.hidden = false;
      err.textContent = msg;
      if (!silent && main instanceof HTMLElement) main.hidden = true;
    }
  } finally {
    if (!silent && loading instanceof HTMLElement) loading.hidden = true;
  }
}

function findOfferById(offerId) {
  const offers = Array.isArray(listSnapshot?.offers) ? listSnapshot.offers : [];
  return offers.find((o) => String(o?.offer_id || "") === offerId) || null;
}

function wireDetailModalGallery(root) {
  if (!(root instanceof HTMLElement)) return;
  const main = root.querySelector("[data-cbr-gallery-main]");
  if (!(main instanceof HTMLImageElement)) return;
  root.querySelectorAll("[data-cbr-gallery-url]").forEach((btn) => {
    if (!(btn instanceof HTMLButtonElement)) return;
    btn.addEventListener("click", () => {
      const url = String(btn.getAttribute("data-cbr-gallery-url") || "").trim();
      if (!url) return;
      main.src = url;
      root.querySelectorAll(".lhai-cbr-modal__gallery-thumb").forEach((el) => {
        el.classList.toggle("is-active", el === btn);
      });
    });
  });
}

function openDetailModal(offerId) {
  const offer = findOfferById(offerId);
  if (!offer) return;
  detailOffer = offer;
  const body = document.querySelector("#cbrDetailBody");
  const dlg = document.querySelector("#cbrDetailModal");
  const selectBtn = document.querySelector("#cbrDetailSelect");
  if (!(body instanceof HTMLElement) || !(dlg instanceof HTMLDialogElement)) return;
  const ctx = offerCardContext();
  const vehicle = isVehicleOffer(offer);
  dlg.classList.toggle("lhai-cbr-modal--vehicle", vehicle);
  if (vehicle) {
    body.innerHTML = buildVehicleOfferDetailModalHtml(offer, ctx, escapeHtml);
    wireDetailModalGallery(body);
    wireOfferPhotoImgFallbacks(body);
  } else {
    const cur = String(offer.currency || "USD");
    const photos = Array.isArray(offer.photos) ? offer.photos : [];
    const photosHtml = photos.length
      ? `<div class="lhai-cbr-modal__photos">${photos
          .map((p) => {
            const row = p && typeof p === "object" ? p : {};
            const url = resolveBackendMediaUrl(String(row.url || row.thumbnail_url || "").trim());
            if (!url) return "";
            return `<img src="${escapeHtml(url)}" alt="${escapeHtml(String(row.caption || ""))}" loading="lazy" />`;
          })
          .filter(Boolean)
          .join("")}</div>`
      : "";
    const attrs = formatAttributesList(offer.attributes);
    const attrsHtml = attrs.length
      ? `<dl class="lhai-cbr-dl">${attrs.map((a) => `<div><dt>${escapeHtml(a.key)}</dt><dd>${escapeHtml(a.value)}</dd></div>`).join("")}</dl>`
      : `<p class="u-text-muted">—</p>`;
    const breakdown = formatOfferPriceBreakdownLines(offer);
    body.innerHTML = `
    <h3 class="lhai-cbr-modal__title">${escapeHtml(formatOfferTitle(offer))}</h3>
    <p class="lhai-cbr-modal__partner">${escapeHtml(formatOfferPartnerName(offer))}</p>
    ${photosHtml}
    <section class="lhai-cbr-modal__section">
      <h4>설명</h4>
      <p>${escapeHtml(String(offer.description || "—")).replace(/\n/g, "<br />")}</p>
    </section>
    <section class="lhai-cbr-modal__section">
      <h4>상세 속성</h4>
      ${attrsHtml}
    </section>
    <section class="lhai-cbr-modal__section">
      <h4>가격</h4>
      <ul>${breakdown.map((line) => `<li>${line.label ? `${escapeHtml(line.label)}: ` : ""}${escapeHtml(line.value)}</li>`).join("")}</ul>
    </section>
    <section class="lhai-cbr-modal__section">
      <h4>파트너 메시지</h4>
      <p>${escapeHtml(String(offer.message_to_customer || "—")).replace(/\n/g, "<br />")}</p>
    </section>
    <p class="lhai-cbr-modal__notice u-text-muted">선택 전에는 일부 정보가 제한될 수 있습니다. 선택 후 메시지함에서 상세 협의를 진행합니다.</p>
  `;
    wireOfferPhotoImgFallbacks(body);
  }
  if (selectBtn instanceof HTMLButtonElement) {
    const sel = offerSelectionUiState(ctx.phase, offer, {
      selectedBidId,
      selectedOfferId,
      snap: listSnapshot,
    });
    selectBtn.hidden = !sel.showSelectButton;
    selectBtn.disabled = sel.selectDisabled;
    selectBtn.textContent = vehicle ? "Select this offer" : "이 제안 선택";
  }
  dlg.showModal();
}

function openConfirmModal(bidId, offer) {
  pendingSelect = { bidId, offer };
  const dlg = document.querySelector("#cbrConfirmModal");
  const body = document.querySelector("#cbrConfirmBody");
  const warn = document.querySelector("#cbrConfirmWarn");
  const titleEl = document.querySelector("#cbrConfirmModal .lhai-cbr-modal__title");
  const submitBtn = document.querySelector("#cbrConfirmSubmit");
  if (!(dlg instanceof HTMLDialogElement) || !(body instanceof HTMLElement)) return;
  const phase = displayPhase();
  const content = buildCustomerBidSelectConfirmContent(phase, offer, listSnapshot);
  if (titleEl instanceof HTMLElement) titleEl.textContent = content.modalTitle;
  body.innerHTML = content.bodyHtml;
  if (warn instanceof HTMLElement) {
    if (content.warnText) {
      warn.hidden = false;
      warn.textContent = content.warnText;
    } else {
      warn.hidden = true;
      warn.textContent = "";
    }
  }
  if (submitBtn instanceof HTMLButtonElement) {
    submitBtn.textContent = content.submitLabel;
  }
  dlg.showModal();
}

function openNewRoundModal() {
  const dlg = document.querySelector("#cbrNewRoundModal");
  const remainingEl = document.querySelector("#cbrNewRoundRemaining");
  const reasonEl = document.querySelector("#cbrNewRoundReason");
  if (!(dlg instanceof HTMLDialogElement)) return;
  const remaining = quoteRequestRemaining(listSnapshot?.quote_request_usage);
  if (remainingEl instanceof HTMLElement) {
    remainingEl.textContent =
      remaining != null
        ? `새 요청 가능 횟수: ${remaining}회 남음`
        : "";
  }
  if (reasonEl instanceof HTMLTextAreaElement) reasonEl.value = "";
  dlg.showModal();
}

async function confirmNewRound() {
  const bidRequestId = String(listSnapshot?.bid_request_id || "").trim();
  if (!bidRequestId || newRoundInFlight) return;
  const dlg = document.querySelector("#cbrNewRoundModal");
  const submitBtn = document.querySelector("#cbrNewRoundSubmit");
  const reasonEl = document.querySelector("#cbrNewRoundReason");
  newRoundInFlight = true;
  renderNewRoundCta(displayPhase());
  if (submitBtn instanceof HTMLButtonElement) submitBtn.disabled = true;
  try {
    const reason =
      reasonEl instanceof HTMLTextAreaElement ? String(reasonEl.value || "").trim() : "";
    await customerBidsApi.requestNewRound(bidRequestId, { reason: reason || undefined });
    if (dlg instanceof HTMLDialogElement) dlg.close();
    selectedBidId = "";
    selectedOfferId = "";
    lastCardsRenderKey = null;
    await reloadList({ silent: true });
    window.dispatchEvent(new CustomEvent("lhai:customer-bid-updated"));
    alertI18n(
      "common.dialog.bid.new_round_started",
      "A new bidding round has started. Please wait for new partner proposals.",
    );
  } catch (e) {
    alertPlain(
      e && typeof e.message === "string"
        ? e.message
        : t("common.dialog.bid.new_round_failed", "Could not start a new bidding round."),
    );
  } finally {
    newRoundInFlight = false;
    if (submitBtn instanceof HTMLButtonElement) submitBtn.disabled = false;
    renderNewRoundCta(displayPhase());
  }
}

async function confirmSelection() {
  if (!pendingSelect) return;
  const { bidId, offer } = pendingSelect;
  const offerId = String(offer?.offer_id || "").trim();
  const dlg = document.querySelector("#cbrConfirmModal");
  const btn = document.querySelector("#cbrConfirmSubmit");
  if (btn instanceof HTMLButtonElement) btn.disabled = true;
  try {
    const res = await customerBidsApi.selectBid(bidId, { selectedOfferId: offerId });
    selectedBidId = String(res?.selected_bid_id || bidId).trim();
    selectedOfferId = String(res?.selected_offer_id || offerId).trim();
    const tid = String(res?.message_thread_id || res?.thread_id || threadId || "").trim();
    if (tid) threadId = tid;
    if (dlg instanceof HTMLDialogElement) dlg.close();
    lastCardsRenderKey = null;
    await reloadList({ silent: true });
    window.dispatchEvent(new CustomEvent("lhai:customer-bid-updated"));
    const conv = document.querySelector("#cbrConversationBanner");
    if (conv instanceof HTMLElement && tid) {
      conv.hidden = false;
      conv.innerHTML = renderSelectionConversationBannerHtml(
        tid,
        res?.selected_offer && typeof res.selected_offer === "object" ? res.selected_offer : offer,
        res?.partner && typeof res.partner === "object" ? res.partner : null,
      );
    }
  } catch (e) {
    alertPlain(
      e && typeof e.message === "string" ? e.message : t("common.dialog.bid.select_failed", "Selection failed."),
    );
  } finally {
    if (btn instanceof HTMLButtonElement) btn.disabled = false;
    pendingSelect = null;
  }
}

function wireRealtime() {
  if (realtimeUnsub) {
    try {
      realtimeUnsub();
    } catch {
      /* ignore */
    }
  }
  realtimeUnsub = subscribeRealtimeEvents((ev) => {
    if (!isBiddingRealtimeSseEvent(ev)) return;
    const payload = normalizeBiddingEventPayload(ev);
    if (!isBiddingEventPayload(payload)) return;
    if (!bidUpdatedMatchesScope(payload, { threadId, serviceRequestId })) return;
    const kind = String(payload.event_kind || "");
    const refreshKinds = [
      BIDDING_EVENT_KINDS.BID_SUBMITTED,
      BIDDING_EVENT_KINDS.BID_UPDATED,
      BIDDING_EVENT_KINDS.BIDDING_EXPIRED,
      BIDDING_EVENT_KINDS.CUSTOMER_SELECTED,
      BIDDING_EVENT_KINDS.NEW_ROUND_STARTED,
      BIDDING_EVENT_KINDS.BIDDING_STARTED,
    ];
    if (!refreshKinds.includes(kind)) return;
    if (kind === BIDDING_EVENT_KINDS.NEW_ROUND_STARTED) {
      const newBr = String(payload.new_bid_request_id || "").trim();
      if (newBr) {
        /* list API resolves latest open round for thread */
      }
    }
    void reloadList({ silent: true });
  });
  window.addEventListener("lhai:customer-bid-updated", () => void reloadList({ silent: true }));
}

function stopListPolling() {
  if (listPollTimer) {
    window.clearInterval(listPollTimer);
    listPollTimer = null;
  }
}

function syncListPolling() {
  const phase = displayPhase();
  if (!isCustomerBidListPollingPhase(phase)) {
    stopListPolling();
    return;
  }
  if (!listPollTimer) startListPolling();
}

function startCountdownTicker() {
  if (countdownStop) {
    countdownStop();
    countdownStop = null;
  }
  countdownStop = createBidCountdownTicker({
    getDeadline: () => deadlineSnapshot(),
    formatBanner: formatCustomerCountdownBanner,
    onTick: (text, expired) => {
      const phase = displayPhase();
      if (phase !== "OPEN" && phase !== "EXPIRED") return;
      applyCountdownBannerText(text, expired);
      const countdownEl = document.querySelector("#cbrCountdown");
      if (countdownEl) {
        const uiText = formatBidDeadlineForUi(deadlineSnapshot());
        if (countdownEl.textContent !== uiText) countdownEl.textContent = uiText;
      }
      if (expired && phase === "OPEN" && !deadlineExpireReloadPending) {
        deadlineExpireReloadPending = true;
        void reloadList({ silent: true }).finally(() => {
          deadlineExpireReloadPending = false;
        });
      }
    },
    intervalMs: 1000,
  });
}

function startListPolling() {
  stopListPolling();
  if (!isCustomerBidListPollingPhase(displayPhase())) return;
  listPollTimer = window.setInterval(() => {
    if (document.visibilityState !== "visible") return;
    const phase = displayPhase();
    if (!isCustomerBidListPollingPhase(phase)) {
      stopListPolling();
      return;
    }
    void reloadList({ silent: true });
  }, CBR_LIST_POLL_MS);
}

function readFiltersFromDom() {
  activeFilters.hasPhotos =
    document.querySelector("#cbrFilterPhotos") instanceof HTMLInputElement &&
    document.querySelector("#cbrFilterPhotos").checked;
  activeFilters.budgetOnly =
    document.querySelector("#cbrFilterBudget") instanceof HTMLInputElement &&
    document.querySelector("#cbrFilterBudget").checked;
  activeFilters.productCategory =
    document.querySelector("#cbrFilterCategory") instanceof HTMLSelectElement
      ? document.querySelector("#cbrFilterCategory").value
      : "";
  activeFilters.partner =
    document.querySelector("#cbrFilterPartner") instanceof HTMLSelectElement
      ? document.querySelector("#cbrFilterPartner").value
      : "";
  activeFilters.location =
    document.querySelector("#cbrFilterLocation") instanceof HTMLSelectElement
      ? document.querySelector("#cbrFilterLocation").value
      : "";
  activeFilters.includeAlternatives =
    document.querySelector("#cbrFilterAlt") instanceof HTMLInputElement &&
    document.querySelector("#cbrFilterAlt").checked;
  activeFilters.updatedOnly =
    document.querySelector("#cbrFilterUpdated") instanceof HTMLInputElement &&
    document.querySelector("#cbrFilterUpdated").checked;
}

function wireUi() {
  document.querySelector("#cbrTabs")?.addEventListener("click", (ev) => {
    const btn = ev.target instanceof Element ? ev.target.closest("[data-cbr-tab]") : null;
    if (!(btn instanceof HTMLButtonElement)) return;
    activeTabKey = String(btn.getAttribute("data-cbr-tab") || "all");
    lastCardsRenderKey = null;
    renderTabs();
    renderCards();
  });

  document.querySelector("#cbrSort")?.addEventListener("change", (ev) => {
    if (!(ev.target instanceof HTMLSelectElement)) return;
    activeSort = ev.target.value || "recommended";
    lastCardsRenderKey = null;
    void reloadList({ silent: true });
  });

  document.querySelector("#cbrFilters")?.addEventListener("change", () => {
    readFiltersFromDom();
    lastCardsRenderKey = null;
    void reloadList({ silent: true });
  });

  document.querySelector("#cbrCards")?.addEventListener("click", (ev) => {
    const t = ev.target instanceof Element ? ev.target : null;
    const detail = t?.closest("[data-cbr-detail]");
    if (detail instanceof HTMLButtonElement) {
      openDetailModal(String(detail.getAttribute("data-cbr-detail") || ""));
      return;
    }
    const sel = t?.closest("[data-cbr-select]");
    if (sel instanceof HTMLButtonElement && !sel.disabled) {
      const bidId = String(sel.getAttribute("data-cbr-select") || "");
      const offerId = String(sel.getAttribute("data-cbr-offer") || "");
      const offer = findOfferById(offerId);
      if (offer && bidId) openConfirmModal(bidId, offer);
    }
  });

  document.querySelector("#cbrDetailClose")?.addEventListener("click", () => {
    const dlg = document.querySelector("#cbrDetailModal");
    if (dlg instanceof HTMLDialogElement) dlg.close();
    detailOffer = null;
  });
  document.querySelector("#cbrDetailSelect")?.addEventListener("click", () => {
    if (!detailOffer) return;
    const bidId = String(detailOffer.bid_id || "").trim();
    const dlg = document.querySelector("#cbrDetailModal");
    if (dlg instanceof HTMLDialogElement) dlg.close();
    if (bidId) openConfirmModal(bidId, detailOffer);
  });
  document.querySelector("#cbrConfirmCancel")?.addEventListener("click", () => {
    const dlg = document.querySelector("#cbrConfirmModal");
    if (dlg instanceof HTMLDialogElement) dlg.close();
    pendingSelect = null;
  });
  document.querySelector("#cbrConfirmSubmit")?.addEventListener("click", () => void confirmSelection());

  document.querySelector("#cbrNewRoundBtn")?.addEventListener("click", () => openNewRoundModal());
  document.querySelector("#cbrNewRoundCancel")?.addEventListener("click", () => {
    const dlg = document.querySelector("#cbrNewRoundModal");
    if (dlg instanceof HTMLDialogElement) dlg.close();
  });
  document.querySelector("#cbrNewRoundSubmit")?.addEventListener("click", () => void confirmNewRound());

  const back = document.querySelector("#cbrBackLink");
  if (back instanceof HTMLAnchorElement) {
    back.href = threadId ? `messages.html?thread_id=${encodeURIComponent(threadId)}` : "messages.html";
  }
}

function refreshCustomerBidResultsPageI18nFromCache() {
  applyI18nToDom(document);
  if (!listSnapshot) return;
  renderAll();
}

wireDynamicPageI18nRefresh(() => {
  void reloadList({ silent: true });
}, { keyPrefixes: ["customer.bid.", "cbr.", "common."] });

wireDynamicPageI18nRefresh(refreshCustomerBidResultsPageI18nFromCache, {
  runtimeResolvedOnly: true,
  keyPrefixes: ["customer.bid.", "cbr.", "common."],
});

async function initCustomerBidResultsPage() {
  if (!ensureCustomerAccess()) return;
  await bootAppPageContent(["common", "nav"], async () => {
  await loadSidebar("#sidebar", "customer");
  if (!serviceRequestId && !threadId) {
    const err = document.querySelector("#cbrError");
    if (err instanceof HTMLElement) {
      err.hidden = false;
      err.textContent = "URL에 service_request_id 또는 thread_id가 필요합니다.";
    }
    return;
  }
  wireUi();
  wireRealtime();
  startCountdownTicker();
  await reloadList();
  });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => void initCustomerBidResultsPage());
} else {
  void initCustomerBidResultsPage();
}

export { initCustomerBidResultsPage, buildCustomerBidResultsPageHref };
