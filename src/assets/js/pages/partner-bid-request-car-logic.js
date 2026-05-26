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

const VP_VEHICLE_TYPE_LABELS = {
  any: "Any",
  sedan: "Sedan",
  suv: "SUV",
  minivan: "Minivan",
  truck: "Truck",
  hatchback: "Hatchback",
  hybrid: "Hybrid",
  electric: "Electric",
};

const VP_PRIORITY_LABELS = {
  reliability: "Reliability",
  good_mpg: "Good gas mileage",
  family_friendly: "Family friendly",
  low_maintenance: "Low maintenance cost",
  safety: "Safety",
  value: "Best value",
  comfort: "Comfort",
  cargo: "Cargo space",
};

const VP_FEATURE_LABELS = {
  clean_title: "Clean title",
  no_accident: "No accident history",
  backup_camera: "Backup camera",
  carplay: "Apple CarPlay",
  android_auto: "Android Auto",
  bluetooth: "Bluetooth",
  good_mpg: "Good gas mileage",
  low_maintenance: "Low maintenance cost",
  leather: "Leather seats",
  sunroof: "Sunroof",
  awd: "AWD / 4WD",
  hybrid: "Hybrid",
  family_friendly: "Family friendly",
};

const VP_TIMELINE_LABELS = {
  asap: "As soon as possible",
  "1_week": "Within 1 week",
  "2_weeks": "Within 2 weeks",
  "1_month": "Within 1 month",
  flexible: "Flexible",
};

const VP_COLOR_LABELS = {
  white: "White",
  black: "Black",
  silver: "Silver",
  gray: "Gray",
  blue: "Blue",
  red: "Red",
};

/** @param {unknown} raw */
function formatVehicleType(raw) {
  const s = String(raw ?? "").trim().toLowerCase();
  if (!s || s === "any") return "Any";
  return VP_VEHICLE_TYPE_LABELS[s] || String(raw).trim();
}

/** @param {unknown} raw */
function formatVpEnumList(raw, labels) {
  const list = Array.isArray(raw) ? raw : [];
  return list
    .map((v) => labels[String(v).trim().toLowerCase()] || String(v).trim())
    .filter(Boolean)
    .join(", ");
}

/** @param {unknown} n */
function formatBudgetCap(n) {
  const v = Number(n);
  if (!Number.isFinite(v) || v <= 0) return "";
  return `Under $${v.toLocaleString("en-US")}`;
}

/** @param {unknown} year */
function formatYearMin(year) {
  if (year == null || year === "") return "";
  const n = Number(year);
  if (Number.isFinite(n) && n >= 1980) return `${n} or newer`;
  const s = String(year).trim();
  return s || "";
}

/** @param {unknown} miles */
function formatMileageMax(miles) {
  if (miles == null || miles === "") return "";
  const n = Number(miles);
  if (Number.isFinite(n) && n > 0) return `Under ${n.toLocaleString("en-US")} miles`;
  const s = String(miles).trim();
  return s || "";
}

/** @param {Record<string, unknown>} vr */
export function vehicleRequestDetailLevel(vr) {
  const explicit = String(vr.detail_level || "").trim().toLowerCase();
  if (explicit === "simple" || explicit === "detailed") return explicit;
  const make = String(vr.make || "").trim();
  const model = String(vr.model || "").trim();
  const pref = String(vr.preference_type || "").trim();
  if (make || model || pref) return "detailed";
  return "simple";
}

/** @param {Record<string, unknown>} vr */
export function vehicleRequestModeLine(vr) {
  if (vehicleRequestDetailLevel(vr) === "simple") {
    return "Customer provided simple preferences and is open to recommendations.";
  }
  return "Customer provided detailed requirements.";
}

/** @param {Record<string, unknown>} vr */
export function vehicleRequestHeadline(vr) {
  const make = String(vr.make || "").trim();
  const model = String(vr.model || "").trim();
  const idx = vr.request_index ?? "";
  const level = vehicleRequestDetailLevel(vr);

  if (level === "simple") {
    const vt = formatVehicleType(vr.vehicle_type);
    const budget = formatBudgetCap(vr.budget_max) || "No strict budget";
    const vtPart = vt && vt !== "Any" ? vt : "Any vehicle";
    return `${vtPart} under ${budget}`;
  }

  const pref = String(vr.preference_type || "").trim().toLowerCase();
  if (pref === "open_to_suggestions") {
    const vt = formatVehicleType(vr.vehicle_type);
    return vt && vt !== "Any" ? `${vt} (open to suggestions)` : "Open to suggestions";
  }
  if (!make && !model) return String(vr.label || `Request #${idx}`).trim() || `Request #${idx}`;
  const mm = [make, model].filter(Boolean).join(" ");
  if (pref === "similar_vehicle") return `${mm} or similar`;
  return mm;
}

/** @param {Record<string, unknown>} vr */
export function vehicleRequestSummaryLines(vr) {
  const level = vehicleRequestDetailLevel(vr);
  const parts = [];

  if (level === "simple") {
    const priorities = formatVpEnumList(vr.top_priorities, VP_PRIORITY_LABELS);
    if (priorities) parts.push(`Priorities: ${priorities}`);
    const timeline = VP_TIMELINE_LABELS[String(vr.desired_timeline || "").trim().toLowerCase()];
    if (timeline) parts.push(`Timeline: ${timeline}`);
    return parts.join(" · ");
  }

  const cond = String(vr.vehicle_condition || "").trim();
  const condLabel = cond === "NEW" ? "신차" : cond === "USED" ? "중고차" : cond || "";
  if (condLabel) parts.push(condLabel);
  const year = formatYearMin(vr.year_min);
  if (year) parts.push(`Year: ${year}`);
  const miles = formatMileageMax(vr.mileage_max);
  if (miles) parts.push(`Mileage: ${miles}`);
  const budget = formatBudgetCap(vr.budget_max);
  if (budget) parts.push(`Budget: ${budget}`);
  const mustHave = formatVpEnumList(vr.must_have_features, VP_FEATURE_LABELS);
  const legacyOpts = Array.isArray(vr.required_options) ? vr.required_options : [];
  const featText = mustHave || legacyOpts.join(", ");
  if (featText) parts.push(`Must-have: ${featText}`);
  const color = VP_COLOR_LABELS[String(vr.color_preference || "").trim().toLowerCase()];
  if (color) parts.push(`Color: ${color}`);
  return parts.join(" · ");
}
