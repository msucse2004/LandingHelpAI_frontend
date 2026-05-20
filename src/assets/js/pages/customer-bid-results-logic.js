/**
 * 고객 자동차 견적 비교 화면 — 순수 로직(테스트 가능).
 */

import {
  formatBidDeadlineRemaining,
  isBidDeadlinePassed,
} from "../core/bid-deadline-display.js";

export { formatBidDeadlineRemaining, isBidDeadlinePassed };

/** @typedef {'recommended'|'lowest_total'|'newest_year'|'lowest_mileage'|'fastest_timeline'|'lowest_fees'|'recently_updated'} CustomerOfferSort */

export const CUSTOMER_BID_SORT_OPTIONS = [
  { value: "recommended", label: "추천순" },
  { value: "lowest_total", label: "낮은 총액순" },
  { value: "newest_year", label: "연식 최신순" },
  { value: "lowest_mileage", label: "주행거리 낮은순" },
  { value: "fastest_timeline", label: "빠른 진행순" },
  { value: "lowest_fees", label: "수수료 낮은순" },
  { value: "recently_updated", label: "최근 업데이트순" },
];

/** @param {unknown} snap */
export function isCarPurchaseBidListResponse(snap) {
  if (!snap || typeof snap !== "object") return false;
  const mode = String(/** @type {Record<string, unknown>} */ (snap).bidding_mode || "")
    .trim()
    .toUpperCase();
  if (mode === "CAR_PURCHASE") return true;
  const offers = /** @type {Record<string, unknown>} */ (snap).offers;
  return Array.isArray(offers);
}

/**
 * @param {string} requestStatus
 * @param {string | null | undefined} expiresAtIso
 * @returns {'OPEN'|'EXPIRED'|'CUSTOMER_SELECTED'}
 */
export function resolveCustomerBidDisplayPhase(requestStatus, expiresAtIso) {
  const st = String(requestStatus || "").trim().toUpperCase();
  if (st === "CUSTOMER_SELECTED") return "CUSTOMER_SELECTED";
  const exp = parseIsoMs(expiresAtIso);
  if (exp != null && Date.now() > exp) return "EXPIRED";
  return "OPEN";
}

/** @param {string | null | undefined} iso */
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

/**
 * @param {Array<Record<string, unknown>> | null | undefined} vehicleRequests
 * @returns {Array<{ key: string, label: string, requestIndex: number | null }>}
 */
export function buildCustomerBidRequestTabs(vehicleRequests) {
  const tabs = [{ key: "all", label: "전체 제안", requestIndex: null }];
  const reqs = Array.isArray(vehicleRequests) ? vehicleRequests : [];
  const indices = new Set();
  for (const r of reqs) {
    if (!r || typeof r !== "object") continue;
    const idx = optionalInt(r.request_index);
    if (idx != null) indices.add(idx);
  }
  if (!indices.size) {
    for (let i = 1; i <= 3; i += 1) indices.add(i);
  }
  [...indices].sort((a, b) => a - b).forEach((idx) => {
    const label = requestTabLabel(reqs, idx);
    tabs.push({ key: `req-${idx}`, label, requestIndex: idx });
  });
  tabs.push({ key: "alternatives", label: "대안 제안", requestIndex: null });
  return tabs;
}

/**
 * @param {Array<Record<string, unknown>>} reqs
 * @param {number} idx
 */
function requestTabLabel(reqs, idx) {
  const row = reqs.find((r) => optionalInt(r?.request_index) === idx);
  if (row && typeof row === "object") {
    const make = String(row.make || "").trim();
    const model = String(row.model || "").trim();
    if (make || model) return `요청 ${idx} · ${[make, model].filter(Boolean).join(" ")}`;
  }
  return `요청 ${idx}`;
}

/** @param {unknown} v */
function optionalInt(v) {
  if (v == null || v === "") return null;
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  return Math.trunc(n);
}

/**
 * 탭은 클라이언트에서만 적용(서버 필터·정렬은 별도).
 * @param {Array<Record<string, unknown>>} offers
 * @param {string} tabKey
 */
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
 * @param {{ sort?: string, condition?: string, budgetOnly?: boolean, cleanTitle?: boolean, noAccident?: boolean, includeAlternatives?: boolean, updatedOnly?: boolean, make?: string, requestIndex?: number | null }} ui
 * @returns {Record<string, string | number | boolean>}
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
  const make = String(ui.make || "").trim();
  if (make) q.make = make;
  return q;
}

/** @param {Record<string, unknown>} offer */
export function formatOfferVehicleTitle(offer) {
  const v = offer.vehicle && typeof offer.vehicle === "object" ? offer.vehicle : {};
  const parts = [v.year, v.make, v.model, v.trim]
    .map((x) => (x == null ? "" : String(x).trim()))
    .filter(Boolean);
  return parts.length ? parts.join(" ") : "차량 제안";
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

/** @param {unknown} raw */
function conditionLabelKo(raw) {
  const u = String(raw || "").trim().toUpperCase();
  if (u === "NEW") return "신차";
  if (u === "USED") return "중고차";
  return String(raw || "").trim() || "";
}

/** @param {unknown} raw */
function titleStatusLabelKo(raw) {
  const u = String(raw || "").trim().toUpperCase();
  if (u === "CLEAN") return "Clean title";
  if (u === "SALVAGE" || u === "REBUILT") return String(raw || "").trim();
  return String(raw || "").trim() || "";
}

/** @param {unknown} raw */
function accidentLabelKo(raw) {
  const u = String(raw || "").trim().toUpperCase();
  if (u === "NONE" || u === "NO") return "사고 이력 없음";
  if (u === "YES" || u === "REPORTED") return "사고 이력 있음";
  return String(raw || "").trim() || "";
}

/** @param {Record<string, unknown>} offer */
export function formatOfferRelationLabel(offer) {
  if (offer.is_alternative) return "대안 제안";
  const idx = optionalInt(offer.linked_request_index);
  if (idx != null) return `요청 ${idx} 차량과 일치`;
  return "요청 차량과 연결";
}

/**
 * @param {number | null | undefined} amount
 * @param {string} [currency]
 */
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

/** @param {number | null | undefined} delta */
export function formatBudgetDelta(delta) {
  if (delta == null || delta === "") return "";
  const n = Number(delta);
  if (Number.isNaN(n)) return "";
  if (n <= 0) return `예산 대비 ${formatMoney(Math.abs(n))} 절약`;
  return `예산 대비 ${formatMoney(n)} 초과`;
}

/** @param {string | null | undefined} expiresAtIso */
export function formatCountdownToExpiry(expiresAtIso, nowMs = Date.now()) {
  return formatBidDeadlineRemaining(expiresAtIso, nowMs);
}

/**
 * @param {string | null | undefined} offerUpdatedAt
 * @param {string | null | undefined} recentUpdatedAt
 */
export function offerShowsUpdatedBadge(offerUpdatedAt, recentUpdatedAt) {
  const o = parseIsoMs(offerUpdatedAt);
  const r = parseIsoMs(recentUpdatedAt);
  if (o == null || r == null) return false;
  return Math.abs(o - r) < 120_000;
}

/**
 * @param {Record<string, unknown> | null | undefined} usage
 */
export function formatQuoteRequestUsage(usage) {
  if (!usage || typeof usage !== "object") return "—";
  const used = usage.used_count ?? usage.used ?? usage.count;
  const max = usage.max_count ?? usage.max ?? usage.limit;
  if (used == null && max == null) return "—";
  return `${used ?? "—"} / ${max ?? "—"}회`;
}

/**
 * @param {string} serviceRequestId
 * @param {string} [threadId]
 */
export function buildCustomerBidResultsPageHref(serviceRequestId, threadId) {
  const p = new URLSearchParams();
  const wid = String(serviceRequestId || "").trim();
  const tid = String(threadId || "").trim();
  if (wid) p.set("service_request_id", wid);
  if (tid) p.set("thread_id", tid);
  const qs = p.toString();
  return qs ? `customer-bid-results.html?${qs}` : "customer-bid-results.html";
}

/** @param {Array<Record<string, unknown>> | null | undefined} vehicleRequests */
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
  }
  return [...set].sort((a, b) => a.localeCompare(b, "ko"));
}

/** @param {Record<string, unknown>} offer */
export function offerPricingSummaryLines(offer) {
  const p = offer.pricing && typeof offer.pricing === "object" ? offer.pricing : {};
  const cur = String(p.currency || "USD");
  const lines = [];
  if (p.vehicle_price != null) lines.push(`차량 ${formatMoney(p.vehicle_price, cur)}`);
  if (p.estimated_tax_registration != null) lines.push(`세금·등록 ${formatMoney(p.estimated_tax_registration, cur)}`);
  if (p.dealer_fee != null) lines.push(`딜러 수수료 ${formatMoney(p.dealer_fee, cur)}`);
  if (p.partner_service_fee != null) lines.push(`파트너 수수료 ${formatMoney(p.partner_service_fee, cur)}`);
  if (p.delivery_fee != null) lines.push(`배송 ${formatMoney(p.delivery_fee, cur)}`);
  return lines;
}

/** @param {Record<string, unknown>} offer */
export function offerMatchScoreLabel(offer) {
  const m = offer.match && typeof offer.match === "object" ? offer.match : {};
  const score = Number(m.match_score);
  if (Number.isFinite(score) && score > 0) return `조건 일치도 ${Math.round(score)}%`;
  const matched = Array.isArray(m.matched_conditions) ? m.matched_conditions : [];
  if (matched.length) return matched.slice(0, 3).join(" · ");
  return "—";
}
