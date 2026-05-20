/**
 * CAR_PURCHASE partner bid — pure helpers (unit-testable).
 */

import { formatBidDeadlineRemaining, isBidDeadlinePassed } from "../core/bid-deadline-display.js";

export const CAR_BID_TYPE = "CAR_PURCHASE";
export const OFFER_KIND_MATCH = "REQUESTED_MATCH";
export const OFFER_KIND_ALT = "ALTERNATIVE";

/** @param {unknown} v */
export function isCarPurchaseBiddingMode(v) {
  return String(v ?? "").trim().toUpperCase() === CAR_BID_TYPE;
}

/**
 * @param {unknown} caps
 * @returns {boolean} false only when capabilities are known and omit CAR_PURCHASE
 */
export function partnerHasCarPurchaseCapability(caps) {
  if (caps == null) return true;
  if (Array.isArray(caps)) {
    return caps.some((c) => String(c ?? "").trim().toUpperCase() === CAR_BID_TYPE);
  }
  return true;
}

/** @param {Record<string, unknown>} offer */
export function computeOfferEstimatedTotal(offer) {
  const parts = [
    "vehicle_price",
    "estimated_tax_fees",
    "dealer_fee",
    "partner_service_fee",
    "delivery_fee",
  ];
  let sum = 0;
  let any = false;
  for (const k of parts) {
    const n = Number(offer[k]);
    if (Number.isFinite(n) && n > 0) {
      sum += n;
      any = true;
    }
  }
  return any ? Math.round(sum * 100) / 100 : 0;
}

/**
 * @param {Record<string, unknown>} offer
 * @param {{ linkedRequestIndex?: number|null, isAlternative?: boolean }} opts
 */
export function createEmptyCarOffer(opts = {}) {
  const isAlt = Boolean(opts.isAlternative);
  return {
    offer_id: "",
    offer_kind: isAlt ? OFFER_KIND_ALT : OFFER_KIND_MATCH,
    is_alternative: isAlt,
    linked_request_index: opts.linkedRequestIndex ?? null,
    vehicle_condition: "",
    make: "",
    model: "",
    trim: "",
    year: null,
    mileage: null,
    clean_title_required: null,
    no_accident_preferred: null,
    location: "",
    color: "",
    vehicle_price: null,
    estimated_tax_fees: null,
    dealer_fee: null,
    partner_service_fee: null,
    delivery_fee: null,
    estimated_total: 0,
    currency: "USD",
    available_timeline: "",
    included_services: "",
    message_to_customer: "",
    alternative_reason: "",
    notes: "",
  };
}

/** @param {unknown} raw */
export function offersFromIncludedItems(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return [];
  const o = /** @type {Record<string, unknown>} */ (raw);
  if (String(o.bid_type || "").toUpperCase() !== CAR_BID_TYPE) return [];
  const list = o.offers;
  if (!Array.isArray(list)) return [];
  return list.map((item, i) => normalizeLoadedOffer(item, i));
}

/** @param {unknown} item @param {number} index */
function normalizeLoadedOffer(item, index) {
  const x = item && typeof item === "object" ? /** @type {Record<string, unknown>} */ ({ ...item }) : {};
  if (!x.offer_id) x.offer_id = `offer_${index + 1}`;
  x.is_alternative = Boolean(x.is_alternative) || String(x.offer_kind || "").toUpperCase() === OFFER_KIND_ALT;
  x.offer_kind = x.is_alternative ? OFFER_KIND_ALT : OFFER_KIND_MATCH;
  const est = Number(x.estimated_total);
  if (!Number.isFinite(est) || est <= 0) {
    x.estimated_total = computeOfferEstimatedTotal(x) || null;
  }
  return x;
}

/** @param {Record<string, unknown>} offer */
export function assignOfferIds(offers) {
  return offers.map((o, i) => ({
    ...o,
    offer_id: String(o.offer_id || "").trim() || `offer_${i + 1}`,
  }));
}

/**
 * @param {Record<string, unknown>[]} offers
 * @param {{ maxOffers: number, allowAlternatives: boolean }} cfg
 */
export function validateCarOffersForSubmit(offers, cfg) {
  const max = Math.max(1, Number(cfg.maxOffers) || 3);
  if (!offers.length) return "최소 1개의 차량 제안을 추가해 주세요.";
  if (offers.length > max) return `제안은 최대 ${max}개까지 가능합니다.`;
  if (!cfg.allowAlternatives && offers.some((o) => o.is_alternative)) {
    return "이 요청에서는 대안 차량 제안이 허용되지 않습니다.";
  }
  for (let i = 0; i < offers.length; i += 1) {
    const o = offers[i];
    const label = `제안 ${i + 1}`;
    if (!String(o.make || "").trim() || !String(o.model || "").trim()) {
      return `${label}: 브랜드와 모델을 입력해 주세요.`;
    }
    const est = Number(o.estimated_total);
    if (!Number.isFinite(est) || est <= 0) {
      return `${label}: 예상 총액을 입력하거나 가격 항목을 채워 주세요.`;
    }
    if (!String(o.available_timeline || "").trim()) {
      return `${label}: 진행 가능 시점을 입력해 주세요.`;
    }
    if (o.is_alternative && !String(o.alternative_reason || "").trim()) {
      return `${label}: 대안 차량 제안 사유를 입력해 주세요.`;
    }
  }
  return "";
}

/**
 * @param {Record<string, unknown>[]} offers
 * @param {string|null|undefined} globalMessage
 */
export function buildCarSubmitPayload(offers, globalMessage) {
  const normalized = assignOfferIds(offers).map((o) => {
    const est = Number(o.estimated_total);
    const total = Number.isFinite(est) && est > 0 ? est : computeOfferEstimatedTotal(o);
    const out = {
      offer_id: String(o.offer_id),
      offer_kind: o.is_alternative ? OFFER_KIND_ALT : OFFER_KIND_MATCH,
      is_alternative: Boolean(o.is_alternative),
      estimated_total: String(total),
      currency: String(o.currency || "USD").trim().toUpperCase().slice(0, 3) || "USD",
    };
    if (o.linked_request_index != null && o.linked_request_index !== "") {
      out.linked_request_index = Number(o.linked_request_index);
    }
    if (o.is_alternative && String(o.alternative_reason || "").trim()) {
      out.alternative_reason = String(o.alternative_reason).trim();
    }
    const copyKeys = [
      "vehicle_condition",
      "make",
      "model",
      "trim",
      "year",
      "mileage",
      "clean_title_required",
      "no_accident_preferred",
      "location",
      "color",
      "vehicle_price",
      "estimated_tax_fees",
      "dealer_fee",
      "partner_service_fee",
      "delivery_fee",
      "available_timeline",
      "included_services",
      "message_to_customer",
      "notes",
      "title_status",
      "accident_history",
    ];
    for (const k of copyKeys) {
      if (o[k] === null || o[k] === undefined || o[k] === "") continue;
      out[k] = o[k];
    }
    return out;
  });

  const totals = normalized
    .map((o) => Number(o.estimated_total))
    .filter((n) => Number.isFinite(n) && n > 0);
  const price_amount = totals.length ? Math.min(...totals) : 0;
  const timelines = normalized.map((o) => String(o.available_timeline || "").trim()).filter(Boolean);
  const perOfferMsg = normalized.map((o) => String(o.message_to_customer || "").trim()).find(Boolean);
  const gm = String(globalMessage ?? "").trim();

  return {
    price_amount,
    price_currency: String(normalized[0]?.currency || "USD"),
    estimated_time: timelines[0] || "",
    message_to_customer: gm || perOfferMsg || null,
    included_items: {
      bid_type: CAR_BID_TYPE,
      offers: normalized,
    },
  };
}

/** @param {Record<string, unknown>} offer */
export function cloneOffer(offer) {
  const c = structuredClone(offer);
  c.offer_id = "";
  c.is_alternative = Boolean(c.is_alternative);
  c.offer_kind = c.is_alternative ? OFFER_KIND_ALT : OFFER_KIND_MATCH;
  return c;
}

/**
 * 파트너 견적 폼 수정 가능 여부 (마감·요청 OPEN·입찰 상태).
 * @param {{ bidStatus?: string, expiresAt?: string, requestStatus?: string }} opts
 */
export function resolvePartnerBidEditable(opts) {
  const rs = String(opts.requestStatus ?? "OPEN").trim().toUpperCase();
  if (rs !== "OPEN") return false;
  if (isBidExpired(opts.expiresAt)) return false;
  const bs = String(opts.bidStatus ?? "").trim().toUpperCase();
  if (
    bs === "SELECTED" ||
    bs === "CLOSED" ||
    bs === "REJECTED" ||
    bs === "EXPIRED" ||
    bs === "WITHDRAWN"
  ) {
    return false;
  }
  return bs === "NOT_SUBMITTED" || bs === "SUBMITTED";
}

/** @param {string|number|Date|null|undefined} expiresAt */
export function isBidExpired(expiresAt) {
  if (!expiresAt) return false;
  return isBidDeadlinePassed(String(expiresAt));
}

/** @param {string|number|Date|null|undefined} expiresAt */
export function formatDeadlineCountdown(expiresAt) {
  if (!expiresAt) return "—";
  return formatBidDeadlineRemaining(String(expiresAt));
}

/** @param {Record<string, unknown> | null | undefined} bidRequestBlock */
export function formatDeadlineFromBidRequestBlock(bidRequestBlock) {
  if (!bidRequestBlock || typeof bidRequestBlock !== "object") return "—";
  if (bidRequestBlock.is_expired === true) return "비딩 종료";
  const label = String(bidRequestBlock.remaining_label || "").trim();
  if (label && label !== "—") return label;
  return formatBidDeadlineRemaining(
    bidRequestBlock.expires_at != null ? String(bidRequestBlock.expires_at) : "",
  );
}

/** @param {number|null|undefined} n @param {string} currency */
export function formatMoney(n, currency = "USD") {
  const v = Number(n);
  if (!Number.isFinite(v)) return "—";
  const cur = String(currency || "USD").toUpperCase();
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency: cur, maximumFractionDigits: 0 }).format(v);
  } catch {
    return `${cur} ${v.toLocaleString()}`;
  }
}

/** @param {Record<string, unknown>} vr */
export function vehicleRequestSummaryLines(vr) {
  const cond = String(vr.vehicle_condition || "").trim();
  const condLabel =
    cond === "NEW" ? "신차" : cond === "USED" ? "중고차" : cond || "";
  const parts = [];
  if (condLabel) parts.push(condLabel);
  if (vr.year_min != null) parts.push(`${vr.year_min}년 이후`);
  if (vr.mileage_max != null) parts.push(`${Number(vr.mileage_max).toLocaleString()} miles 이하`);
  return parts.join(" · ");
}
