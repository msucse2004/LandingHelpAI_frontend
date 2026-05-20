/**
 * 고객 자동차 구매 견적 비교 전용 페이지.
 * customer-bid-results.html?service_request_id=...&thread_id=...
 */
import { customerBidsApi } from "../core/api.js";
import { ensureCustomerAccess } from "../core/guards.js";
import { loadSidebar } from "../components/sidebar.js";
import { subscribeRealtimeEvents } from "../core/realtime-client.js";
import { isCarPurchaseBidUpdatedPayload, normalizeBidUpdatedPayload } from "../core/bid-realtime.js";
import {
  buildCustomerBidRequestTabs,
  buildCustomerBidsApiQuery,
  buildCustomerBidResultsPageHref,
  collectDistinctMakes,
  CUSTOMER_BID_SORT_OPTIONS,
  filterOffersByTab,
  formatBudgetDelta,
  formatCountdownToExpiry,
  formatMoney,
  formatOfferRelationLabel,
  formatOfferVehicleStatusLine,
  formatOfferVehicleTitle,
  formatQuoteRequestUsage,
  isCarPurchaseBidListResponse,
  offerMatchScoreLabel,
  offerPricingSummaryLines,
  offerShowsUpdatedBadge,
  resolveCustomerBidDisplayPhase,
} from "./customer-bid-results-logic.js";
import { formatBidDeadlineForUi } from "../core/bid-deadline-display.js";

/** @typedef {import('./customer-bid-results-logic.js').CustomerOfferSort} CustomerOfferSort */

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
/** @type {CustomerOfferSort} */
let activeSort = "recommended";
/** @type {Record<string, unknown>} */
let activeFilters = {
  budgetOnly: false,
  condition: "",
  cleanTitle: false,
  noAccident: false,
  includeAlternatives: true,
  updatedOnly: false,
  make: "",
};
let selectedBidId = "";
let countdownTimer = null;
let listPollTimer = null;
let realtimeUnsub = null;
const CBR_LIST_POLL_MS = 30_000;
/** @type {{ bidId: string, offer: Record<string, unknown> } | null} */
let pendingSelect = null;

const { serviceRequestId: initialServiceRequestId, threadId: initialThreadId } = readPageParams();
let serviceRequestId = initialServiceRequestId;
let threadId = initialThreadId;

function buildApiQuery() {
  const q = buildCustomerBidsApiQuery({
    sort: activeSort,
    budgetOnly: activeFilters.budgetOnly,
    condition: activeFilters.condition,
    cleanTitle: activeFilters.cleanTitle,
    noAccident: activeFilters.noAccident,
    includeAlternatives: activeFilters.includeAlternatives,
    updatedOnly: activeFilters.updatedOnly,
    make: activeFilters.make,
  });
  const tab = buildCustomerBidRequestTabs(listSnapshot?.customer_vehicle_requests || []);
  const tabRow = tab.find((t) => t.key === activeTabKey);
  if (tabRow?.requestIndex != null && activeTabKey.startsWith("req-")) {
    q.request_index = tabRow.requestIndex;
  }
  if (activeTabKey === "alternatives") {
    q.include_alternatives = true;
  }
  return q;
}

async function fetchList() {
  const query = buildApiQuery();
  if (serviceRequestId) {
    return await customerBidsApi.listByServiceRequest(serviceRequestId, query);
  }
  if (threadId) {
    const snap = await customerBidsApi.listByThread(threadId, query);
    if (!serviceRequestId && snap?.bid_request_id) {
      /* thread-only: service_request_id는 스냅샷에 없을 수 있음 */
    }
    return snap;
  }
  throw new Error("service_request_id 또는 thread_id가 필요합니다.");
}

function displayPhase() {
  return resolveCustomerBidDisplayPhase(listSnapshot?.status, listSnapshot?.expires_at);
}

function visibleOffers() {
  const offers = Array.isArray(listSnapshot?.offers) ? listSnapshot.offers : [];
  return filterOffersByTab(offers, activeTabKey);
}

function formatDateTime(iso) {
  const s = String(iso || "").trim();
  if (!s) return "—";
  try {
    return new Date(s).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
  } catch {
    return s;
  }
}

function renderStatusBanner(phase) {
  const el = document.querySelector("#cbrStatusBanner");
  if (!(el instanceof HTMLElement)) return;
  if (phase === "CUSTOMER_SELECTED") {
    el.hidden = false;
    el.className = "lhai-cbr-banner lhai-cbr-banner--success";
    el.textContent = "파트너 선택이 완료되었습니다. 메시지함에서 다음 단계를 진행해 주세요.";
    return;
  }
  if (phase === "EXPIRED") {
    el.hidden = false;
    el.className = "lhai-cbr-banner lhai-cbr-banner--warn";
    el.textContent = "비딩이 종료되었습니다. 현재 제안 중 하나를 선택해 주세요.";
    return;
  }
  el.hidden = true;
  el.textContent = "";
}

function renderHeader() {
  const phase = displayPhase();
  const snap = listSnapshot;
  setText("#cbrOfferCount", snap?.offer_count != null ? String(snap.offer_count) : "0");
  setText("#cbrPartnerCount", snap?.partner_count != null ? String(snap.partner_count) : "0");
  setText("#cbrRecentUpdate", formatDateTime(snap?.recent_updated_at));
  setText("#cbrQuoteUsage", formatQuoteRequestUsage(snap?.quote_request_usage));
  const countdownEl = document.querySelector("#cbrCountdown");
  if (countdownEl) {
    if (phase === "OPEN" || phase === "EXPIRED") {
      countdownEl.textContent = formatBidDeadlineForUi(
        snap
          ? {
              expires_at: snap.expires_at,
              is_expired: phase === "EXPIRED" || snap.is_expired === true,
              remaining_label: snap.remaining_label,
            }
          : null,
      );
    } else {
      countdownEl.textContent = "—";
    }
  }
  renderStatusBanner(phase);
}

function setText(sel, text) {
  const el = document.querySelector(sel);
  if (el) el.textContent = text;
}

function renderTabs() {
  const nav = document.querySelector("#cbrTabs");
  if (!(nav instanceof HTMLElement)) return;
  const tabs = buildCustomerBidRequestTabs(listSnapshot?.customer_vehicle_requests || []);
  nav.innerHTML = tabs
    .map((t) => {
      const active = t.key === activeTabKey ? " is-active" : "";
      return `<button type="button" class="lhai-cbr-tab${active}" data-cbr-tab="${escapeHtml(t.key)}">${escapeHtml(t.label)}</button>`;
    })
    .join("");
}

function renderToolbar() {
  const sortSel = document.querySelector("#cbrSort");
  if (sortSel instanceof HTMLSelectElement) {
    sortSel.innerHTML = CUSTOMER_BID_SORT_OPTIONS.map(
      (o) => `<option value="${escapeHtml(o.value)}"${o.value === activeSort ? " selected" : ""}>${escapeHtml(o.label)}</option>`
    ).join("");
  }
  const makeSel = document.querySelector("#cbrFilterMake");
  if (makeSel instanceof HTMLSelectElement) {
    const makes = collectDistinctMakes(listSnapshot?.customer_vehicle_requests, listSnapshot?.offers);
    const cur = String(activeFilters.make || "");
    makeSel.innerHTML =
      `<option value="">브랜드 전체</option>` +
      makes.map((m) => `<option value="${escapeHtml(m)}"${m === cur ? " selected" : ""}>${escapeHtml(m)}</option>`).join("");
  }
  const map = {
    cbrFilterBudget: "budgetOnly",
    cbrFilterNew: "conditionNew",
    cbrFilterUsed: "conditionUsed",
    cbrFilterCleanTitle: "cleanTitle",
    cbrFilterNoAccident: "noAccident",
    cbrFilterAlt: "includeAlternatives",
    cbrFilterUpdated: "updatedOnly",
  };
  for (const [id, key] of Object.entries(map)) {
    const el = document.querySelector(`#${id}`);
    if (!(el instanceof HTMLInputElement)) continue;
    if (key === "conditionNew") el.checked = activeFilters.condition === "NEW";
    else if (key === "conditionUsed") el.checked = activeFilters.condition === "USED";
    else if (key === "includeAlternatives") el.checked = activeFilters.includeAlternatives !== false;
    else el.checked = Boolean(activeFilters[key]);
  }
}

function renderOfferCard(offer) {
  const phase = displayPhase();
  const bidId = String(offer.bid_id || "").trim();
  const offerId = String(offer.offer_id || "").trim();
  const pricing = offer.pricing && typeof offer.pricing === "object" ? offer.pricing : {};
  const service = offer.service && typeof offer.service === "object" ? offer.service : {};
  const total = pricing.estimated_total;
  const cur = String(pricing.currency || "USD");
  const budgetLine = formatBudgetDelta(pricing.budget_delta);
  const updatedBadge = offerShowsUpdatedBadge(offer.updated_at, listSnapshot?.recent_updated_at)
    ? `<span class="lhai-cbr-badge lhai-cbr-badge--updated">업데이트됨</span>`
    : "";
  const relBadge = offer.is_alternative
    ? `<span class="lhai-cbr-badge lhai-cbr-badge--alt">대안 제안</span>`
    : `<span class="lhai-cbr-badge lhai-cbr-badge--match">요청 차량과 일치</span>`;
  const partner = escapeHtml(String(offer.partner_display_name || "파트너"));
  const msg = String(service.message || "").trim();
  const msgPreview = msg ? escapeHtml(msg.slice(0, 160)).replace(/\n/g, "<br />") : "—";
  const priceLines = offerPricingSummaryLines(offer)
    .map((line) => `<li>${escapeHtml(line)}</li>`)
    .join("");
  const canSelect = phase === "OPEN" || phase === "EXPIRED";
  const isSelected = phase === "CUSTOMER_SELECTED" && selectedBidId && bidId === selectedBidId;
  const selectDisabled = !canSelect || (phase === "CUSTOMER_SELECTED" && !isSelected);
  const selectLabel = isSelected ? "선택한 제안" : "이 제안 선택";
  return `
    <article class="lhai-cbr-card${isSelected ? " lhai-cbr-card--selected" : ""}" data-offer-id="${escapeHtml(offerId)}" data-bid-id="${escapeHtml(bidId)}">
      <div class="lhai-cbr-card__badges">${updatedBadge}${relBadge}</div>
      <h3 class="lhai-cbr-card__title">${escapeHtml(formatOfferVehicleTitle(offer))}</h3>
      <p class="lhai-cbr-card__meta">${escapeHtml(formatOfferVehicleStatusLine(offer))}</p>
      <p class="lhai-cbr-card__relation u-text-muted">${escapeHtml(formatOfferRelationLabel(offer))} · ${partner}</p>
      <p class="lhai-cbr-card__total">${escapeHtml(formatMoney(total, cur))}</p>
      ${budgetLine ? `<p class="lhai-cbr-card__budget">${escapeHtml(budgetLine)}</p>` : ""}
      <ul class="lhai-cbr-card__prices">${priceLines || "<li>—</li>"}</ul>
      <p class="lhai-cbr-card__timeline"><span>진행 가능</span> ${escapeHtml(String(service.available_timeline || "—"))}</p>
      <p class="lhai-cbr-card__match">${escapeHtml(offerMatchScoreLabel(offer))}</p>
      <div class="lhai-cbr-card__preview">
        <span class="lhai-cbr-card__preview-label">파트너 메시지</span>
        <p>${msgPreview}</p>
      </div>
      <p class="lhai-cbr-card__updated u-text-muted">마지막 업데이트 ${escapeHtml(formatDateTime(offer.updated_at))}</p>
      <div class="lhai-cbr-card__actions">
        <button type="button" class="lhai-button lhai-button--secondary" data-cbr-detail="${escapeHtml(offerId)}">자세히 보기</button>
        <button type="button" class="lhai-button lhai-button--primary" data-cbr-select="${escapeHtml(bidId)}" data-cbr-offer="${escapeHtml(offerId)}"${selectDisabled ? " disabled" : ""}>${escapeHtml(selectLabel)}</button>
      </div>
    </article>`;
}

function renderCards() {
  const grid = document.querySelector("#cbrCards");
  const empty = document.querySelector("#cbrEmpty");
  if (!(grid instanceof HTMLElement)) return;
  const offers = visibleOffers();
  if (!offers.length) {
    grid.innerHTML = "";
    if (empty instanceof HTMLElement) {
      empty.hidden = false;
      empty.textContent = "조건에 맞는 제안이 없습니다. 필터를 조정해 보세요.";
    }
    return;
  }
  if (empty instanceof HTMLElement) empty.hidden = true;
  grid.innerHTML = offers.map((o) => renderOfferCard(/** @type {Record<string, unknown>} */ (o))).join("");
}

function renderMessagesCta() {
  const el = document.querySelector("#cbrMessagesCta");
  if (!(el instanceof HTMLElement)) return;
  const phase = displayPhase();
  if (phase !== "CUSTOMER_SELECTED" || !threadId) {
    el.hidden = true;
    return;
  }
  el.hidden = false;
  el.innerHTML = `<a class="lhai-button lhai-button--primary" href="messages.html?thread_id=${encodeURIComponent(threadId)}">메시지 열기</a>`;
}

function renderAll() {
  renderHeader();
  renderTabs();
  renderToolbar();
  renderCards();
  renderMessagesCta();
}

async function reloadList() {
  const loading = document.querySelector("#cbrLoading");
  const main = document.querySelector("#cbrMain");
  const err = document.querySelector("#cbrError");
  if (loading instanceof HTMLElement) loading.hidden = false;
  if (main instanceof HTMLElement) main.hidden = true;
  if (err instanceof HTMLElement) err.hidden = true;
  try {
    listSnapshot = await fetchList();
    if (!isCarPurchaseBidListResponse(listSnapshot)) {
      throw new Error("이 서비스는 자동차 견적 비교 화면을 지원하지 않습니다.");
    }
    if (displayPhase() === "CUSTOMER_SELECTED" && !selectedBidId) {
      const bids = Array.isArray(listSnapshot.bids) ? listSnapshot.bids : [];
      if (bids.length === 1) selectedBidId = String(bids[0].bid_id || "").trim();
    }
    renderAll();
    if (main instanceof HTMLElement) main.hidden = false;
  } catch (e) {
    const msg = e && typeof e.message === "string" ? e.message : "견적을 불러오지 못했습니다.";
    if (err instanceof HTMLElement) {
      err.hidden = false;
      err.textContent = msg;
    }
  } finally {
    if (loading instanceof HTMLElement) loading.hidden = true;
  }
}

function findOfferById(offerId) {
  const offers = Array.isArray(listSnapshot?.offers) ? listSnapshot.offers : [];
  return offers.find((o) => String(o?.offer_id || "") === offerId) || null;
}

function openDetailModal(offerId) {
  const offer = findOfferById(offerId);
  if (!offer) return;
  const body = document.querySelector("#cbrDetailBody");
  const dlg = document.querySelector("#cbrDetailModal");
  if (!(body instanceof HTMLElement) || !(dlg instanceof HTMLDialogElement)) return;
  const v = offer.vehicle && typeof offer.vehicle === "object" ? offer.vehicle : {};
  const p = offer.pricing && typeof offer.pricing === "object" ? offer.pricing : {};
  const s = offer.service && typeof offer.service === "object" ? offer.service : {};
  const services = Array.isArray(s.included_services) ? s.included_services : [];
  const cur = String(p.currency || "USD");
  const altReason = offer.is_alternative ? String(offer.alternative_reason || "").trim() : "";
  body.innerHTML = `
    <h3 class="lhai-cbr-modal__title">${escapeHtml(formatOfferVehicleTitle(offer))}</h3>
    <section class="lhai-cbr-modal__section">
      <h4>차량 정보</h4>
      <dl class="lhai-cbr-dl">
        <div><dt>상태</dt><dd>${escapeHtml(formatOfferVehicleStatusLine(offer))}</dd></div>
        <div><dt>색상</dt><dd>${escapeHtml(String(v.color || "—"))}</dd></div>
        <div><dt>위치</dt><dd>${escapeHtml(String(v.location || "—"))}</dd></div>
        ${v.masked_vin ? `<div><dt>VIN</dt><dd>${escapeHtml(String(v.masked_vin))}</dd></div>` : ""}
      </dl>
    </section>
    <section class="lhai-cbr-modal__section">
      <h4>가격 상세</h4>
      <ul>${offerPricingSummaryLines(offer).map((line) => `<li>${escapeHtml(line)}</li>`).join("")}</ul>
      <p class="lhai-cbr-modal__total">예상 총액 <strong>${escapeHtml(formatMoney(p.estimated_total, cur))}</strong></p>
    </section>
    <section class="lhai-cbr-modal__section">
      <h4>포함 서비스</h4>
      ${services.length ? `<ul>${services.map((x) => `<li>${escapeHtml(String(x))}</li>`).join("")}</ul>` : "<p class=\"u-text-muted\">—</p>"}
    </section>
    <section class="lhai-cbr-modal__section">
      <h4>파트너 메시지</h4>
      <p>${escapeHtml(String(s.message || "—")).replace(/\n/g, "<br />")}</p>
    </section>
    ${altReason ? `<section class="lhai-cbr-modal__section"><h4>대안 사유</h4><p>${escapeHtml(altReason).replace(/\n/g, "<br />")}</p></section>` : ""}
    <p class="lhai-cbr-modal__notice u-text-muted">선택 전에는 파트너 연락처·정확한 재고 위치 등 일부 정보가 제한될 수 있습니다. 선택 후 메시지함에서 상세 협의를 진행합니다.</p>
  `;
  dlg.showModal();
}

function openConfirmModal(bidId, offer) {
  pendingSelect = { bidId, offer };
  const dlg = document.querySelector("#cbrConfirmModal");
  const body = document.querySelector("#cbrConfirmBody");
  const warn = document.querySelector("#cbrConfirmWarn");
  if (!(dlg instanceof HTMLDialogElement) || !(body instanceof HTMLElement)) return;
  const phase = displayPhase();
  const name = formatOfferVehicleTitle(offer);
  const pricing = offer.pricing && typeof offer.pricing === "object" ? offer.pricing : {};
  body.innerHTML = `<p><strong>${escapeHtml(name)}</strong> 제안을 선택하시겠습니까?</p>
    <p>예상 총액 ${escapeHtml(formatMoney(pricing.estimated_total, pricing.currency || "USD"))}</p>
    <p class="u-text-muted">선택 후에는 해당 파트너와 메시지로 협의가 진행됩니다.</p>`;
  if (warn instanceof HTMLElement) {
    if (phase === "OPEN") {
      warn.hidden = false;
      warn.textContent = `비딩 마감까지 ${formatCountdownToExpiry(listSnapshot?.expires_at)} 남았습니다. 지금 선택하면 다른 파트너의 추가 제안을 받기 어려울 수 있습니다.`;
    } else {
      warn.hidden = true;
      warn.textContent = "";
    }
  }
  dlg.showModal();
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
    const confirmDlg = dlg instanceof HTMLDialogElement ? dlg : null;
    confirmDlg?.close();
    await reloadList();
  } catch (e) {
    const msg = e && typeof e.message === "string" ? e.message : "선택에 실패했습니다.";
    window.alert(msg);
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
    const type = String(ev?.type || "").trim();
    if (type !== "bid.updated") return;
    const payload = normalizeBidUpdatedPayload(ev);
    if (!isCarPurchaseBidUpdatedPayload(payload)) return;
    const tid = String(payload.thread_id || "").trim();
    const wid = String(payload.workflow_instance_id || payload.service_request_id || "").trim();
    if (threadId && tid && tid !== threadId) return;
    if (serviceRequestId && wid && wid !== serviceRequestId) return;
    void reloadList();
  });
  window.addEventListener("lhai:customer-bid-updated", () => {
    void reloadList();
  });
}

function startCountdownTicker() {
  if (countdownTimer) window.clearInterval(countdownTimer);
  countdownTimer = window.setInterval(() => {
    const phase = displayPhase();
    if (phase === "OPEN" || phase === "EXPIRED") renderHeader();
  }, 60_000);
}

/** SSE ``bid.updated`` 고객 fan-out 전 안전망: OPEN·EXPIRED 중 탭이 보일 때만 목록 갱신. */
function startListPolling() {
  if (listPollTimer) window.clearInterval(listPollTimer);
  listPollTimer = window.setInterval(() => {
    if (typeof document !== "undefined" && document.visibilityState !== "visible") return;
    const phase = displayPhase();
    if (phase === "OPEN" || phase === "EXPIRED") void reloadList();
  }, CBR_LIST_POLL_MS);
}

function wireUi() {
  document.querySelector("#cbrTabs")?.addEventListener("click", (ev) => {
    const btn = ev.target instanceof Element ? ev.target.closest("[data-cbr-tab]") : null;
    if (!(btn instanceof HTMLButtonElement)) return;
    activeTabKey = String(btn.getAttribute("data-cbr-tab") || "all");
    renderTabs();
    renderCards();
  });

  document.querySelector("#cbrSort")?.addEventListener("change", (ev) => {
    if (!(ev.target instanceof HTMLSelectElement)) return;
    activeSort = /** @type {CustomerOfferSort} */ (ev.target.value || "recommended");
    void reloadList();
  });

  const onFilterChange = () => {
    const budget = document.querySelector("#cbrFilterBudget");
    const newC = document.querySelector("#cbrFilterNew");
    const used = document.querySelector("#cbrFilterUsed");
    activeFilters.budgetOnly = budget instanceof HTMLInputElement && budget.checked;
    if (newC instanceof HTMLInputElement && newC.checked) activeFilters.condition = "NEW";
    else if (used instanceof HTMLInputElement && used.checked) activeFilters.condition = "USED";
    else activeFilters.condition = "";
    activeFilters.cleanTitle = document.querySelector("#cbrFilterCleanTitle") instanceof HTMLInputElement && document.querySelector("#cbrFilterCleanTitle").checked;
    activeFilters.noAccident = document.querySelector("#cbrFilterNoAccident") instanceof HTMLInputElement && document.querySelector("#cbrFilterNoAccident").checked;
    activeFilters.includeAlternatives = document.querySelector("#cbrFilterAlt") instanceof HTMLInputElement && document.querySelector("#cbrFilterAlt").checked;
    activeFilters.updatedOnly = document.querySelector("#cbrFilterUpdated") instanceof HTMLInputElement && document.querySelector("#cbrFilterUpdated").checked;
    const makeSel = document.querySelector("#cbrFilterMake");
    activeFilters.make = makeSel instanceof HTMLSelectElement ? makeSel.value : "";
    void reloadList();
  };
  document.querySelector("#cbrFilters")?.addEventListener("change", onFilterChange);

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
    document.querySelector("#cbrDetailModal")?.closest("dialog")?.close?.();
    const dlg = document.querySelector("#cbrDetailModal");
    if (dlg instanceof HTMLDialogElement) dlg.close();
  });
  document.querySelector("#cbrConfirmCancel")?.addEventListener("click", () => {
    const dlg = document.querySelector("#cbrConfirmModal");
    if (dlg instanceof HTMLDialogElement) dlg.close();
    pendingSelect = null;
  });
  document.querySelector("#cbrConfirmSubmit")?.addEventListener("click", () => {
    void confirmSelection();
  });

  const back = document.querySelector("#cbrBackLink");
  if (back instanceof HTMLAnchorElement) {
    if (threadId) back.href = `messages.html?thread_id=${encodeURIComponent(threadId)}`;
    else back.href = "messages.html";
  }
}

async function initCustomerBidResultsPage() {
  if (!ensureCustomerAccess()) return;
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
  startListPolling();
  await reloadList();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => void initCustomerBidResultsPage());
} else {
  void initCustomerBidResultsPage();
}

export { initCustomerBidResultsPage, buildCustomerBidResultsPageHref };
