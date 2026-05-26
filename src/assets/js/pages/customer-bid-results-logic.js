/**
 * 고객 견적 제안 비교 — 순수 로직(테스트 가능).
 */

import {
  formatBidDeadlineRemaining,
  isBidDeadlinePassed,
} from "../core/bid-deadline-display.js";

export { formatBidDeadlineRemaining, isBidDeadlinePassed };

/** @typedef {'recommended'|'lowest_total'|'recently_updated'|'fastest_timeline'|'photo_first'|'newest_year'|'lowest_mileage'|'lowest_fees'} CustomerOfferSort */

export const CUSTOMER_BID_SORT_OPTIONS = [
  { value: "recommended", label: "추천순" },
  { value: "lowest_total", label: "총액 낮은순" },
  { value: "recently_updated", label: "최근 업데이트순" },
  { value: "fastest_timeline", label: "빠른 진행순" },
  { value: "photo_first", label: "사진 있는 순" },
];

export const RANK_BASIS_LABELS = {
  recommended: "추천순",
  lowest_total: "총액 낮은순",
  recently_updated: "최근 업데이트순",
  fastest_timeline: "빠른 진행순",
  photo_first: "사진 있는 순",
  newest_year: "연식 최신순",
  lowest_mileage: "주행거리 낮은순",
  lowest_fees: "수수료 낮은순",
};

/** @param {unknown} snap */
export function isProductOfferListResponse(snap) {
  if (!snap || typeof snap !== "object") return false;
  const offers = /** @type {Record<string, unknown>} */ (snap).offers;
  return Array.isArray(offers);
}

/** @deprecated use isProductOfferListResponse */
export function isCarPurchaseBidListResponse(snap) {
  if (!snap || typeof snap !== "object") return false;
  const mode = String(/** @type {Record<string, unknown>} */ (snap).bidding_mode || "")
    .trim()
    .toUpperCase();
  if (mode === "CAR_PURCHASE") return true;
  return isProductOfferListResponse(snap);
}

/**
 * @param {string} requestStatus
 * @param {string | null | undefined} expiresAtIso
 * @returns {'OPEN'|'EXPIRED'|'CUSTOMER_SELECTED'|'CLOSED'}
 */
export function resolveCustomerBidDisplayPhase(requestStatus, expiresAtIso) {
  const st = String(requestStatus || "").trim().toUpperCase();
  if (st === "CUSTOMER_SELECTED") return "CUSTOMER_SELECTED";
  if (st === "CANCELLED" || st === "CLOSED") return "CLOSED";
  if (st === "EXPIRED") return "EXPIRED";
  const exp = parseIsoMs(expiresAtIso);
  if (exp != null && Date.now() > exp) return "EXPIRED";
  return "OPEN";
}

/** @param {'OPEN'|'EXPIRED'|'CUSTOMER_SELECTED'|'CLOSED'} phase */
export function isCustomerBidListPollingPhase(phase) {
  return phase === "OPEN" || phase === "EXPIRED";
}

/** @param {'OPEN'|'EXPIRED'|'CUSTOMER_SELECTED'|'CLOSED'} phase */
export function customerBidStatusBannerMessage(phase) {
  if (phase === "CUSTOMER_SELECTED") {
    return "파트너 선택이 완료되었습니다. 메시지함에서 다음 단계를 진행해 주세요.";
  }
  if (phase === "EXPIRED") {
    return "비딩이 종료되었습니다. 제출된 제안을 검토하거나 새 라운드를 요청할 수 있습니다. (만료 후 선택은 불가)";
  }
  if (phase === "CLOSED") {
    return "이 비딩 라운드는 종료되었습니다. 새 라운드가 시작된 경우 최신 라운드를 확인해 주세요.";
  }
  return "";
}

/** @param {string | null | undefined} status */
export function formatBidRequestStatusLabel(status) {
  const st = String(status || "").trim().toUpperCase();
  if (st === "OPEN") return "비딩 진행 중";
  if (st === "EXPIRED") return "비딩 종료";
  if (st === "CUSTOMER_SELECTED") return "제안 선택 완료";
  if (st === "CLOSED") return "종료됨";
  if (st === "CANCELLED") return "취소됨";
  return st || "—";
}

/** @param {string | null | undefined} iso */
export function formatRelativeTimeKo(iso, nowMs = Date.now()) {
  const ms = parseIsoMs(iso);
  if (ms == null) return "—";
  const diff = nowMs - ms;
  if (diff < 0) return "방금";
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return "방금";
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}분 전`;
  const hr = Math.floor(min / 60);
  if (hr < 48) return `${hr}시간 전`;
  const day = Math.floor(hr / 24);
  if (day < 14) return `${day}일 전`;
  try {
    return new Date(ms).toLocaleDateString("ko-KR", { month: "short", day: "numeric" });
  } catch {
    return "—";
  }
}

/** @param {string | null | undefined} iso */
export function parseIsoMs(iso) {
  const s = String(iso || "").trim();
  if (!s) return null;
  const ms = Date.parse(s);
  return Number.isNaN(ms) ? null : ms;
}

/** @param {Record<string, unknown>} offer */
export function formatOfferTitle(offer) {
  const title = String(offer.title || "").trim();
  if (title) return title;
  return formatOfferVehicleTitle(offer);
}

/** @param {Record<string, unknown>} offer */
export function offerThumbnailUrl(offer) {
  const thumb = String(offer.thumbnail_url || "").trim();
  if (thumb) return thumb;
  const photos = Array.isArray(offer.photos) ? offer.photos : [];
  if (photos.length && photos[0] && typeof photos[0] === "object") {
    const p = /** @type {Record<string, unknown>} */ (photos[0]);
    return String(p.thumbnail_url || p.url || "").trim() || null;
  }
  return null;
}

/** @param {Record<string, unknown>} offer @param {string} [activeSort] */
export function formatOfferRankBadge(offer, activeSort) {
  const rank = Number(offer.rank);
  if (!Number.isFinite(rank) || rank <= 0) return "";
  const total = Number(offer.rank_total);
  const basis = String(offer.rank_basis || activeSort || "recommended").trim();
  const label =
    /** @type {Record<string, string>} */ (RANK_BASIS_LABELS)[basis] || "순위";
  if (Number.isFinite(total) && total > 0) return `${label} 기준 ${rank}위 / ${total}개`;
  return `${label} 기준 ${rank}위`;
}

/** @param {Record<string, unknown>} offer */
export function formatOfferPartnerName(offer) {
  return (
    String(offer.partner_name || offer.partner_display_name || "").trim() || "파트너"
  );
}

/** @param {Record<string, unknown>} offer */
export function formatOfferPriceBreakdownLines(offer) {
  const cur = String(offer.currency || "USD");
  const lines = [];
  if (offer.price_amount != null && offer.price_amount !== "") {
    lines.push({ label: "상품 가격", value: formatMoney(offer.price_amount, cur) });
  }
  if (offer.fees != null && offer.fees !== "") {
    lines.push({ label: "수수료", value: formatMoney(offer.fees, cur) });
  }
  if (offer.estimated_total != null && offer.estimated_total !== "") {
    lines.push({ label: "예상 총액", value: formatMoney(offer.estimated_total, cur), strong: true });
  }
  const legacy = offerPricingSummaryLines(offer);
  if (!lines.length && legacy.length) {
    return legacy.map((text) => ({ label: "", value: text }));
  }
  return lines;
}

/** @param {Record<string, unknown> | null | undefined} snap */
export function snapshotHasBudgetHint(snap) {
  if (!snap || typeof snap !== "object") return false;
  const reqs = snap.customer_vehicle_requests;
  if (Array.isArray(reqs)) {
    for (const r of reqs) {
      if (r && typeof r === "object" && (r.budget_max != null || r.budget_min != null)) return true;
    }
  }
  const offers = Array.isArray(snap.offers) ? snap.offers : [];
  return offers.some((o) => o && typeof o === "object" && o.budget_delta != null);
}

/**
 * @param {Array<Record<string, unknown>> | null | undefined} offers
 */
export function collectDistinctProductCategories(offers) {
  const set = new Set();
  for (const o of Array.isArray(offers) ? offers : []) {
    const c = String(o?.product_category || "").trim();
    if (c) set.add(c);
  }
  return [...set].sort((a, b) => a.localeCompare(b, "ko"));
}

/** @param {Array<Record<string, unknown>> | null | undefined} offers */
export function collectDistinctPartners(offers) {
  /** @type {Map<string, string>} */
  const map = new Map();
  for (const o of Array.isArray(offers) ? offers : []) {
    if (!o || typeof o !== "object") continue;
    const id = String(o.partner_account_id || "").trim();
    if (!id) continue;
    map.set(id, formatOfferPartnerName(o));
  }
  return [...map.entries()]
    .map(([id, name]) => ({ id, name }))
    .sort((a, b) => a.name.localeCompare(b.name, "ko"));
}

/** @param {Array<Record<string, unknown>> | null | undefined} offers */
export function collectDistinctLocations(offers) {
  const set = new Set();
  for (const o of Array.isArray(offers) ? offers : []) {
    const loc = String(o?.location || "").trim();
    if (loc) set.add(loc);
  }
  return [...set].sort((a, b) => a.localeCompare(b, "ko"));
}

/**
 * @param {Array<Record<string, unknown>> | null | undefined} vehicleRequests
 * @returns {Array<{ key: string, label: string, requestIndex: number | null }>}
 */
export function buildCustomerBidRequestTabs(vehicleRequests) {
  const tabs = [{ key: "all", label: "전체 제안", requestIndex: null }];
  const reqs = Array.isArray(vehicleRequests) ? vehicleRequests : [];
  if (!reqs.length) return tabs;
  const indices = new Set();
  for (const r of reqs) {
    if (!r || typeof r !== "object") continue;
    const idx = optionalInt(r.request_index);
    if (idx != null) indices.add(idx);
  }
  [...indices].sort((a, b) => a - b).forEach((idx) => {
    const label = requestTabLabel(reqs, idx);
    tabs.push({ key: `req-${idx}`, label, requestIndex: idx });
  });
  tabs.push({ key: "alternatives", label: "대안 제안", requestIndex: null });
  return tabs;
}

function requestTabLabel(reqs, idx) {
  const row = reqs.find((r) => optionalInt(r?.request_index) === idx);
  if (row && typeof row === "object") {
    const make = String(row.make || "").trim();
    const model = String(row.model || "").trim();
    if (make || model) return `요청 ${idx} · ${[make, model].filter(Boolean).join(" ")}`;
  }
  return `요청 ${idx}`;
}

function optionalInt(v) {
  if (v == null || v === "") return null;
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  return Math.trunc(n);
}

export function filterOffersByTab(offers, tabKey) {
  const list = Array.isArray(offers) ? offers : [];
  const key = String(tabKey || "all").trim();
  if (key === "all") return list;
  if (key === "alternatives") return list.filter((o) => Boolean(o?.is_alternative));
  const m = /^req-(\d+)$/.exec(key);
  if (m) {
    const idx = Number(m[1]);
    return list.filter((o) => optionalInt(o?.linked_request_index) === idx && !o?.is_alternative);
  }
  return list;
}

/**
 * @param {{ sort?: string, condition?: string, budgetOnly?: boolean, cleanTitle?: boolean, noAccident?: boolean, includeAlternatives?: boolean, updatedOnly?: boolean, make?: string, requestIndex?: number | null, hasPhotos?: boolean, productCategory?: string, partner?: string, location?: string }} ui
 */
export function buildCustomerBidsApiQuery(ui) {
  /** @type {Record<string, string | number | boolean>} */
  const q = {};
  const sort = String(ui.sort || "recommended").trim();
  if (sort) q.sort = sort;
  if (ui.requestIndex != null && ui.requestIndex !== "") {
    const ri = Number(ui.requestIndex);
    if (Number.isFinite(ri)) q.request_index = Math.trunc(ri);
  }
  const cond = String(ui.condition || "").trim().toUpperCase();
  if (cond === "NEW" || cond === "USED") q.condition = cond;
  if (ui.budgetOnly) q.budget_only = true;
  if (ui.cleanTitle) q.clean_title = true;
  if (ui.noAccident) q.no_accident = true;
  if (ui.includeAlternatives === false) q.include_alternatives = false;
  else q.include_alternatives = true;
  if (ui.updatedOnly) q.updated_only = true;
  if (ui.hasPhotos) q.has_photos = true;
  const make = String(ui.make || "").trim();
  if (make) q.make = make;
  const cat = String(ui.productCategory || "").trim();
  if (cat) q.product_category = cat;
  const partner = String(ui.partner || "").trim();
  if (partner) q.partner = partner;
  const loc = String(ui.location || "").trim();
  if (loc) q.location = loc;
  return q;
}

/** @param {Record<string, unknown>} offer */
export function formatOfferVehicleTitle(offer) {
  const v = offer.vehicle && typeof offer.vehicle === "object" ? offer.vehicle : {};
  const parts = [v.year, v.make, v.model, v.trim]
    .map((x) => (x == null ? "" : String(x).trim()))
    .filter(Boolean);
  return parts.length ? parts.join(" ") : "제안";
}

/** @param {Record<string, unknown>} offer */
export function formatOfferVehicleStatusLine(offer) {
  const v = offer.vehicle && typeof offer.vehicle === "object" ? offer.vehicle : {};
  const cond = conditionLabelKo(v.condition);
  const mileage = v.mileage != null && v.mileage !== "" ? `${Number(v.mileage).toLocaleString()} mi` : "";
  const title = titleStatusLabelKo(v.title_status);
  const accident = accidentLabelKo(v.accident_history);
  return [cond, mileage, title, accident].filter(Boolean).join(" · ") || "—";
}

function conditionLabelKo(raw) {
  const u = String(raw || "").trim().toUpperCase();
  if (u === "NEW") return "신차";
  if (u === "USED") return "중고차";
  return String(raw || "").trim() || "";
}

function titleStatusLabelKo(raw) {
  const u = String(raw || "").trim().toUpperCase();
  if (u === "CLEAN") return "Clean title";
  if (u === "SALVAGE" || u === "REBUILT") return String(raw || "").trim();
  return String(raw || "").trim() || "";
}

function accidentLabelKo(raw) {
  const u = String(raw || "").trim().toUpperCase();
  if (u === "NONE" || u === "NO") return "사고 이력 없음";
  if (u === "YES" || u === "REPORTED") return "사고 이력 있음";
  return String(raw || "").trim() || "";
}

export function formatOfferRelationLabel(offer) {
  if (offer.is_alternative) return "대안 제안";
  const idx = optionalInt(offer.linked_request_index);
  if (idx != null) return `요청 ${idx}와 연결`;
  return "";
}

export function formatMoney(amount, currency = "USD") {
  if (amount == null || amount === "") return "—";
  const n = Number(amount);
  if (Number.isNaN(n)) return "—";
  const cur = String(currency || "USD").trim().toUpperCase() || "USD";
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency: cur }).format(n);
  } catch {
    return `${n.toLocaleString()} ${cur}`;
  }
}

export function formatBudgetDelta(delta) {
  if (delta == null || delta === "") return "";
  const n = Number(delta);
  if (Number.isNaN(n)) return "";
  if (n <= 0) return `예산 대비 ${formatMoney(Math.abs(n))} 절약`;
  return `예산 대비 ${formatMoney(n)} 초과`;
}

export function formatCountdownToExpiry(expiresAtIso, nowMs = Date.now()) {
  return formatBidDeadlineRemaining(expiresAtIso, nowMs);
}

export function offerShowsUpdatedBadge(offerUpdatedAt, recentUpdatedAt) {
  const o = parseIsoMs(offerUpdatedAt);
  const r = parseIsoMs(recentUpdatedAt);
  if (o == null || r == null) return false;
  return Math.abs(o - r) < 120_000;
}

export function formatQuoteRequestUsage(usage) {
  if (!usage || typeof usage !== "object") return "—";
  const used = usage.used_quote_requests ?? usage.used_count ?? usage.used ?? usage.count;
  const max = usage.max_quote_requests ?? usage.max_count ?? usage.max ?? usage.limit;
  const remaining = quoteRequestRemaining(usage);
  if (used == null && max == null) return "—";
  if (remaining != null) return `${used ?? "—"} / ${max ?? "—"}회 (남음 ${remaining})`;
  return `${used ?? "—"} / ${max ?? "—"}회`;
}

/** @param {Record<string, unknown> | null | undefined} usage */
export function quoteRequestRemaining(usage) {
  if (!usage || typeof usage !== "object") return null;
  const r = usage.remaining_quote_requests;
  if (r != null && Number.isFinite(Number(r))) return Math.max(0, Number(r));
  const max = Number(usage.max_quote_requests ?? usage.max);
  const used = Number(usage.used_quote_requests ?? usage.used);
  if (Number.isFinite(max) && Number.isFinite(used)) return Math.max(0, max - used);
  return null;
}

/**
 * @param {Record<string, unknown> | null | undefined} snap
 */
export function canSelectCustomerBid(phase) {
  return phase === "OPEN";
}

export function canRequestNewBidRound(snap) {
  const phase = resolveCustomerBidDisplayPhase(
    snap?.bid_request_status ?? snap?.status,
    snap?.expires_at,
  );
  if (phase === "CUSTOMER_SELECTED" || phase === "CLOSED") return false;
  if (phase !== "OPEN" && phase !== "EXPIRED") return false;
  const remaining = quoteRequestRemaining(
    snap?.quote_request_usage && typeof snap.quote_request_usage === "object"
      ? snap.quote_request_usage
      : null,
  );
  return remaining != null && remaining > 0;
}

/** @param {string} threadId */
export function buildMessagesThreadHref(threadId) {
  const tid = String(threadId || "").trim();
  if (!tid) return "messages.html";
  return `messages.html?thread_id=${encodeURIComponent(tid)}`;
}

/**
 * @param {string} threadId
 * @param {Record<string, unknown> | null | undefined} [selectedOffer]
 * @param {Record<string, unknown> | null | undefined} [partner]
 */
export function renderSelectionConversationBannerHtml(threadId, selectedOffer, partner) {
  const href = buildMessagesThreadHref(threadId);
  const title = selectedOffer
    ? String(selectedOffer.title || selectedOffer.vehicle_title || "").trim()
    : "";
  const partnerName = partner ? String(partner.partner_name || "").trim() : "";
  const detail =
    title && partnerName
      ? `${title} · ${partnerName}`
      : title || partnerName || "";
  const detailLine = detail
    ? `<p class="lhai-cbr-conversation__detail">${escapeHtml(detail)}</p>`
    : "";
  return `
    <p class="lhai-cbr-conversation__lead">Your selected partner has been added to the conversation.</p>
    ${detailLine}
    <div class="lhai-cbr-conversation__actions">
      <a class="lhai-button lhai-button--primary" href="${escapeHtml(href)}">Open conversation</a>
    </div>`;
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function buildCustomerBidResultsPageHref(serviceRequestId, threadId) {
  const p = new URLSearchParams();
  const wid = String(serviceRequestId || "").trim();
  const tid = String(threadId || "").trim();
  if (wid) p.set("service_request_id", wid);
  if (tid) p.set("thread_id", tid);
  const qs = p.toString();
  return qs ? `customer-bid-results.html?${qs}` : "customer-bid-results.html";
}

export function collectDistinctMakes(vehicleRequests, offers) {
  const set = new Set();
  for (const r of Array.isArray(vehicleRequests) ? vehicleRequests : []) {
    if (r && typeof r === "object") {
      const m = String(r.make || "").trim();
      if (m) set.add(m);
    }
  }
  for (const o of Array.isArray(offers) ? offers : []) {
    const v = o?.vehicle;
    if (v && typeof v === "object") {
      const m = String(v.make || "").trim();
      if (m) set.add(m);
    }
    const attrs = o?.attributes;
    if (attrs && typeof attrs === "object") {
      const m = String(attrs.make || "").trim();
      if (m) set.add(m);
    }
  }
  return [...set].sort((a, b) => a.localeCompare(b, "ko"));
}

export function offerPricingSummaryLines(offer) {
  const p = offer.pricing && typeof offer.pricing === "object" ? offer.pricing : {};
  const cur = String(p.currency || offer.currency || "USD");
  const lines = [];
  if (p.vehicle_price != null) lines.push(`차량 ${formatMoney(p.vehicle_price, cur)}`);
  if (p.estimated_tax_registration != null) lines.push(`세금·등록 ${formatMoney(p.estimated_tax_registration, cur)}`);
  if (p.dealer_fee != null) lines.push(`딜러 수수료 ${formatMoney(p.dealer_fee, cur)}`);
  if (p.partner_service_fee != null) lines.push(`파트너 수수료 ${formatMoney(p.partner_service_fee, cur)}`);
  if (p.delivery_fee != null) lines.push(`배송 ${formatMoney(p.delivery_fee, cur)}`);
  return lines;
}

export function offerMatchScoreLabel(offer) {
  const m = offer.match && typeof offer.match === "object" ? offer.match : {};
  const score = Number(m.match_score);
  if (Number.isFinite(score) && score > 0) return `조건 일치도 ${Math.round(score)}%`;
  const matched = Array.isArray(m.matched_conditions) ? m.matched_conditions : [];
  if (matched.length) return matched.slice(0, 3).join(" · ");
  return "";
}

/** @param {'OPEN'|'EXPIRED'|'CUSTOMER_SELECTED'} phase @param {number} offerCount */
export function emptyOffersMessage(phase, offerCount) {
  if (offerCount > 0) return "조건에 맞는 제안이 없습니다. 필터를 조정해 보세요.";
  if (phase === "EXPIRED") {
    return "제출된 제안이 없습니다. 새 비딩 라운드를 요청할 수 있습니다.";
  }
  return "파트너가 제안을 준비 중입니다. 잠시 후 다시 확인해 주세요.";
}

/** @param {Record<string, unknown>} attrs */
export function formatAttributesList(attrs) {
  if (!attrs || typeof attrs !== "object") return [];
  return Object.entries(attrs)
    .filter(([, v]) => v != null && String(v).trim() !== "")
    .map(([k, v]) => ({ key: k, value: String(v) }));
}
