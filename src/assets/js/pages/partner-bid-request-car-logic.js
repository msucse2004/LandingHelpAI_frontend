/**
 * CAR_PURCHASE partner bid — pure helpers (unit-testable).
 * Submit/storage uses PRODUCT_OFFER + product_category vehicle (legacy CAR_PURCHASE read).
 */

import { formatBidDeadlineRemaining, isBidDeadlinePassed } from "../core/bid-deadline-display.js";
import { PRODUCT_OFFER_BID_TYPE } from "./partner-bid-request-product-logic.js";

export const CAR_BID_TYPE = "CAR_PURCHASE";
export const VEHICLE_PRODUCT_CATEGORY = "vehicle";
export const DEFAULT_MAX_OFFER_PHOTOS = 12;
/** Backend limit (bid_offer_photo_storage._MAX_BYTES). */
export const MAX_BID_OFFER_PHOTO_BYTES = 8 * 1024 * 1024;
/** Client prep target — many nginx defaults use client_max_body_size 1m. */
export const BID_OFFER_PHOTO_UPLOAD_TARGET_BYTES = 950 * 1024;
export const BID_OFFER_PHOTO_ACCEPT_TYPES = Object.freeze([
  "image/jpeg",
  "image/png",
  "image/webp",
]);

/** @typedef {'empty'|'bad_type'|'too_large'} BidOfferPhotoFileError */

/** @param {File | null | undefined} file @returns {BidOfferPhotoFileError | null} */
export function validateBidOfferPhotoFile(file) {
  if (!(file instanceof File) || !file.size) {
    return "empty";
  }
  const type = String(file.type || "")
    .split(";")[0]
    .trim()
    .toLowerCase();
  if (!BID_OFFER_PHOTO_ACCEPT_TYPES.includes(type)) {
    return "bad_type";
  }
  if (file.size > MAX_BID_OFFER_PHOTO_BYTES) {
    return "too_large";
  }
  return null;
}

/**
 * Resize/compress large photos so uploads pass typical reverse-proxy body limits.
 * @param {File} file
 * @returns {Promise<File>}
 */
export async function prepareBidOfferPhotoFileForUpload(file) {
  const validationError = validateBidOfferPhotoFile(file);
  if (validationError) {
    throw new Error(validationError);
  }
  if (file.size <= BID_OFFER_PHOTO_UPLOAD_TARGET_BYTES) {
    return file;
  }
  if (typeof document === "undefined" || typeof createImageBitmap !== "function") {
    return file;
  }

  const bitmap = await createImageBitmap(file);
  try {
    let width = bitmap.width;
    let height = bitmap.height;
    const maxSide = 2048;
    if (width > maxSide || height > maxSide) {
      const scale = maxSide / Math.max(width, height);
      width = Math.max(1, Math.round(width * scale));
      height = Math.max(1, Math.round(height * scale));
    }

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      throw new Error("image_process_failed");
    }
    ctx.drawImage(bitmap, 0, 0, width, height);

    let quality = 0.88;
    /** @type {Blob | null} */
    let blob = await new Promise((resolve) => {
      canvas.toBlob(resolve, "image/jpeg", quality);
    });
    while (blob && blob.size > BID_OFFER_PHOTO_UPLOAD_TARGET_BYTES && quality > 0.45) {
      quality -= 0.08;
      blob = await new Promise((resolve) => {
        canvas.toBlob(resolve, "image/jpeg", quality);
      });
    }

    if (!blob || blob.size > MAX_BID_OFFER_PHOTO_BYTES) {
      throw new Error(
        "photo_too_large_after_compress",
      );
    }

    const baseName = String(file.name || "photo")
      .replace(/\.[^.]+$/, "")
      .trim();
    return new File([blob], `${baseName || "photo"}.jpg`, { type: "image/jpeg" });
  } finally {
    if (typeof bitmap.close === "function") {
      bitmap.close();
    }
  }
}

export const OFFER_KIND_MATCH = "REQUESTED_MATCH";
export const OFFER_KIND_ALT = "ALTERNATIVE";

/** Shown when bid_request is EXPIRED — partner submit/edit/upload is closed. */
export const PARTNER_BID_EXPIRED_POLICY_BANNER =
  "Bidding ended. You can no longer edit offers. A customer may still select an existing offer.";

/** @param {unknown} v */
export function isCarPurchaseBiddingMode(v) {
  return String(v ?? "").trim().toUpperCase() === CAR_BID_TYPE;
}

/** @param {Record<string, unknown> | null | undefined} data */
export function resolveCarPurchaseMode(data) {
  if (!data || typeof data !== "object") return false;
  if (isCarPurchaseBiddingMode(data.bidding_mode)) return true;
  const bidCfg =
    data.bidding_config && typeof data.bidding_config === "object"
      ? /** @type {Record<string, unknown>} */ (data.bidding_config)
      : null;
  if (bidCfg && isCarPurchaseBiddingMode(bidCfg.mode)) return true;
  if (
    data.car_purchase_config &&
    typeof data.car_purchase_config === "object" &&
    Object.keys(/** @type {Record<string, unknown>} */ (data.car_purchase_config)).length > 0
  ) {
    return true;
  }
  const svc = data.service;
  if (svc && typeof svc === "object") {
    return isCarPurchaseBiddingMode(/** @type {Record<string, unknown>} */ (svc).bidding_mode);
  }
  return false;
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
 * @param {Array<Record<string, unknown>> | null | undefined} vehicleRequests
 */
export function resolveDefaultLinkedRequestIndex(vehicleRequests) {
  const list = Array.isArray(vehicleRequests) ? vehicleRequests : [];
  if (!list.length) return 1;
  for (const vr of list) {
    const n = Number(vr?.request_index);
    if (Number.isFinite(n) && n >= 1) return Math.floor(n);
  }
  return 1;
}

/**
 * @param {Array<Record<string, unknown>> | null | undefined} vehicleRequests
 * @param {number} index
 */
export function linkedRequestDisplayLabel(vehicleRequests, index) {
  const idx = Number(index);
  if (!Number.isFinite(idx) || idx < 1) return "";
  const list = Array.isArray(vehicleRequests) ? vehicleRequests : [];
  const vr = list.find((row) => Number(row?.request_index) === idx);
  if (!vr || typeof vr !== "object") return "";
  const parts = [vr.label, vr.make, vr.model]
    .map((x) => (x == null ? "" : String(x).trim()))
    .filter(Boolean);
  return parts.join(" ").trim();
}

/**
 * @param {Record<string, unknown>} offer
 * @param {Array<Record<string, unknown>> | null | undefined} vehicleRequests
 */
export function withLinkedRequestIndex(offer, vehicleRequests) {
  const base = offer && typeof offer === "object" ? { ...offer } : createEmptyCarOffer({});
  const current = base.linked_request_index;
  if (current != null && current !== "" && Number.isFinite(Number(current)) && Number(current) >= 1) {
    return { ...base, linked_request_index: Math.floor(Number(current)) };
  }
  return { ...base, linked_request_index: resolveDefaultLinkedRequestIndex(vehicleRequests) };
}

/**
 * @param {Record<string, unknown>[]} offers
 * @param {Array<Record<string, unknown>> | null | undefined} vehicleRequests
 */
export function ensureOffersLinkedRequestIndexes(offers, vehicleRequests) {
  return (Array.isArray(offers) ? offers : []).map((o) =>
    withLinkedRequestIndex(o && typeof o === "object" ? o : {}, vehicleRequests),
  );
}

/**
 * @param {Record<string, unknown>} offer
 * @param {{ linkedRequestIndex?: number|null, isAlternative?: boolean }} opts
 */
/** @param {unknown} value */
export function optionalNumberInputValue(value) {
  if (value == null || value === "") return "";
  const n = Number(value);
  return Number.isFinite(n) ? n : "";
}

/**
 * New offer tab — blank fields only. Optionally links to a customer vehicle request #.
 * @param {{ linkedRequestIndex?: number|null, isAlternative?: boolean }} [opts]
 */
export function createBlankCarOfferForAdd(opts = {}) {
  return createEmptyCarOffer({
    linkedRequestIndex: opts.linkedRequestIndex ?? null,
    isAlternative: Boolean(opts.isAlternative),
  });
}

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
    vin_or_stock: "",
    title_status: "",
    accident_history: "",
    exterior_color: "",
    location: "",
    vehicle_price: null,
    estimated_tax_fees: null,
    dealer_fee: null,
    partner_service_fee: null,
    delivery_fee: null,
    estimated_total: null,
    estimated_total_manual_override: false,
    currency: "USD",
    available_timeline: "",
    description: "",
    included_services: "",
    message_to_customer: "",
    alternative_reason: "",
    photos: [],
    primary_photo_index: 0,
    notes: "",
  };
}

/** @param {Record<string, unknown>} offer */
export function buildAutoOfferTitle(offer) {
  const parts = [offer.year, offer.make, offer.model, offer.trim]
    .map((x) => (x == null ? "" : String(x).trim()))
    .filter(Boolean);
  return parts.length ? parts.join(" ") : "Vehicle offer";
}

/** @param {Record<string, unknown>} offer */
function sumFeeComponents(offer) {
  let sum = 0;
  let any = false;
  for (const k of ["estimated_tax_fees", "dealer_fee", "partner_service_fee", "delivery_fee"]) {
    const n = Number(offer[k]);
    if (Number.isFinite(n) && n > 0) {
      sum += n;
      any = true;
    }
  }
  return any ? Math.round(sum * 100) / 100 : 0;
}

/** @param {unknown} v */
function numOrNull(v) {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/** @param {Record<string, unknown>} offer @param {Record<string, unknown>} attrs */
function mergeAttrsIntoOffer(offer, attrs) {
  const a = attrs;
  if (a.year != null) offer.year = numOrNull(a.year);
  if (a.make != null) offer.make = String(a.make).trim();
  if (a.model != null) offer.model = String(a.model).trim();
  if (a.trim != null) offer.trim = String(a.trim).trim();
  if (a.mileage != null) offer.mileage = numOrNull(a.mileage);
  if (a.vin_or_stock != null) offer.vin_or_stock = String(a.vin_or_stock).trim();
  if (a.vehicle_condition != null) offer.vehicle_condition = String(a.vehicle_condition).trim();
  if (a.title_status != null) offer.title_status = String(a.title_status).trim();
  if (a.accident_history != null) offer.accident_history = String(a.accident_history).trim();
  if (a.exterior_color != null) offer.exterior_color = String(a.exterior_color).trim();
  if (a.vehicle_price != null) offer.vehicle_price = numOrNull(a.vehicle_price);
  if (a.estimated_tax_fees != null) offer.estimated_tax_fees = numOrNull(a.estimated_tax_fees);
  if (a.dealer_fee != null) offer.dealer_fee = numOrNull(a.dealer_fee);
  if (a.partner_service_fee != null) offer.partner_service_fee = numOrNull(a.partner_service_fee);
  if (a.delivery_fee != null) offer.delivery_fee = numOrNull(a.delivery_fee);
}

/** @param {unknown} item @param {number} index @param {string} topCategory */
function hydrateVehicleOfferFromStored(item, index, topCategory) {
  const x =
    item && typeof item === "object" ? /** @type {Record<string, unknown>} */ ({ ...item }) : {};
  const attrs =
    x.attributes && typeof x.attributes === "object" && !Array.isArray(x.attributes)
      ? /** @type {Record<string, unknown>} */ ({ ...x.attributes })
      : {};

  mergeAttrsIntoOffer(x, attrs);

  if (!x.offer_id) x.offer_id = `offer_${index + 1}`;

  const kind = String(x.offer_kind || "").toUpperCase();
  x.is_alternative = Boolean(x.is_alternative) || kind === OFFER_KIND_ALT;
  x.offer_kind = x.is_alternative ? OFFER_KIND_ALT : OFFER_KIND_MATCH;

  if (x.color && !x.exterior_color) x.exterior_color = String(x.color).trim();
  if (!x.vehicle_price && x.price_amount != null) x.vehicle_price = numOrNull(x.price_amount);

  const feeFromRow = numOrNull(x.fees);
  if (feeFromRow != null && feeFromRow > 0) {
    if (x.estimated_tax_fees == null) x.estimated_tax_fees = feeFromRow;
  }

  const storedTotal = numOrNull(x.estimated_total);
  const computed = computeOfferEstimatedTotal(x);
  if (storedTotal != null && storedTotal > 0) {
    x.estimated_total = storedTotal;
    x.estimated_total_manual_override =
      computed > 0 && Math.abs(storedTotal - computed) > 0.009;
  } else {
    x.estimated_total = computed || 0;
    x.estimated_total_manual_override = false;
  }

  if (!String(x.product_category || "").trim()) {
    x.product_category = topCategory || VEHICLE_PRODUCT_CATEGORY;
  }

  if (!Array.isArray(x.photos)) x.photos = [];
  const initialPrimary = Number(x.primary_photo_index);
  const hadPrimary = Number.isFinite(initialPrimary) ? initialPrimary : 0;
  const normalized = x.photos
    .map((p, i) => {
      const pr = p && typeof p === "object" ? /** @type {Record<string, unknown>} */ (p) : {};
      const url = String(pr.url || "").trim();
      if (!url) return null;
      const isPrimary = Boolean(pr.is_primary) || i === hadPrimary;
      return {
        asset_id: String(pr.asset_id || "").trim() || undefined,
        url,
        thumbnail_url: String(pr.thumbnail_url || url).trim(),
        caption: String(pr.caption || "").trim(),
        is_primary: isPrimary,
        sort_order: i,
      };
    })
    .filter(Boolean);
  let primaryIdx = normalized.findIndex((p) => p && p.is_primary);
  if (primaryIdx < 0 && normalized.length) {
    normalized[0].is_primary = true;
    primaryIdx = 0;
  }
  normalized.forEach((p, i) => {
    if (p) p.is_primary = i === primaryIdx;
  });
  x.photos = normalized;
  x.primary_photo_index = primaryIdx >= 0 ? primaryIdx : 0;

  return x;
}

/** @param {unknown[]} photos @param {number} primaryIndex */
export function normalizeVehiclePhotosForSubmit(photos, primaryIndex = 0) {
  if (!Array.isArray(photos)) return [];
  const rows = photos
    .map((p, i) => {
      const pr = p && typeof p === "object" ? /** @type {Record<string, unknown>} */ (p) : {};
      const url = String(pr.url || "").trim();
      if (!url) return null;
      const thumb = String(pr.thumbnail_url || url).trim();
      /** @type {Record<string, unknown>} */
      const out = {
        url,
        thumbnail_url: thumb,
        sort_order: i,
      };
      const assetId = String(pr.asset_id || "").trim();
      if (assetId) out.asset_id = assetId;
      const cap = String(pr.caption || "").trim();
      if (cap) out.caption = cap;
      if (Boolean(pr.is_primary)) out.is_primary = true;
      return out;
    })
    .filter(Boolean);
  let pi = rows.findIndex((r) => r && r.is_primary === true);
  if (pi < 0) pi = Number.isFinite(primaryIndex) ? primaryIndex : 0;
  if (pi > 0 && pi < rows.length) {
    const [primary] = rows.splice(pi, 1);
    rows.unshift(primary);
  }
  return rows.map((r, i) => ({
    ...r,
    sort_order: i,
    is_primary: i === 0,
  }));
}

/** @param {unknown} item @param {string} topCategory */
function isVehicleStoredOffer(item, topCategory) {
  const row = item && typeof item === "object" ? /** @type {Record<string, unknown>} */ (item) : {};
  const cat = String(row.product_category || topCategory || "").trim().toLowerCase();
  if (cat === VEHICLE_PRODUCT_CATEGORY) return true;
  const attrs = row.attributes;
  if (attrs && typeof attrs === "object" && !Array.isArray(attrs)) {
    if (attrs.make != null || attrs.year != null || attrs.model != null) return true;
  }
  if (row.make || row.model || row.vehicle_price != null) return true;
  return topCategory === VEHICLE_PRODUCT_CATEGORY;
}

/** @param {unknown} raw */
export function offersFromIncludedItems(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return [];
  const o = /** @type {Record<string, unknown>} */ (raw);
  const bt = String(o.bid_type || "").toUpperCase();
  const list = o.offers;
  if (!Array.isArray(list)) return [];
  const topCat = String(o.product_category || "").trim().toLowerCase();

  if (bt === PRODUCT_OFFER_BID_TYPE) {
    return list
      .filter((item) => isVehicleStoredOffer(item, topCat))
      .map((item, i) => hydrateVehicleOfferFromStored(item, i, topCat || VEHICLE_PRODUCT_CATEGORY));
  }
  if (bt === CAR_BID_TYPE) {
    return list.map((item, i) =>
      hydrateVehicleOfferFromStored(item, i, VEHICLE_PRODUCT_CATEGORY),
    );
  }
  return [];
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
 * @param {{ allowAlternatives: boolean, requiresOfferPhotos?: boolean, maxPhotosPerOffer?: number, uploadsInProgress?: boolean }} cfg
 * @returns {{ code: string, params?: Record<string, number> } | null}
 */
export function validateCarOffersForSubmit(offers, cfg) {
  const maxPhotos = Math.max(1, Number(cfg.maxPhotosPerOffer) || DEFAULT_MAX_OFFER_PHOTOS);
  const requirePhotos = cfg.requiresOfferPhotos === true;
  if (cfg.uploadsInProgress === true) {
    return { code: "upload_in_progress" };
  }
  if (!offers.length) return { code: "min_offers" };
  if (!cfg.allowAlternatives && offers.some((o) => o.is_alternative)) {
    return { code: "alternatives_not_allowed" };
  }
  for (let i = 0; i < offers.length; i += 1) {
    const o = offers[i];
    const offer = i + 1;
    const year = numOrNull(o.year);
    if (year == null || year < 1980) {
      return { code: "year_required", params: { offer } };
    }
    if (!String(o.make || "").trim() || !String(o.model || "").trim()) {
      return { code: "make_model_required", params: { offer } };
    }
    const mileage = numOrNull(o.mileage);
    if (mileage == null || mileage < 0) {
      return { code: "mileage_required", params: { offer } };
    }
    const est = Number(o.estimated_total);
    if (!Number.isFinite(est) || est <= 0) {
      return { code: "estimated_total_required", params: { offer } };
    }
    if (!String(o.available_timeline || "").trim()) {
      return { code: "timeline_required", params: { offer } };
    }
    if (o.is_alternative && !String(o.alternative_reason || "").trim()) {
      return { code: "alternative_reason_required", params: { offer } };
    }
    const photos = Array.isArray(o.photos) ? o.photos : [];
    const photoCount = photos.filter(
      (p) => p && typeof p === "object" && String(/** @type {Record<string, unknown>} */ (p).url || "").trim(),
    ).length;
    if (photoCount > maxPhotos) {
      return { code: "photos_max", params: { offer, max: maxPhotos } };
    }
    if (requirePhotos && photoCount < 1) {
      return { code: "photos_min", params: { offer } };
    }
  }
  return null;
}

/** @param {Record<string, unknown>} offer */
function buildOfferAttributes(offer) {
  /** @type {Record<string, unknown>} */
  const attrs = {};
  const setNum = (k, v) => {
    const n = numOrNull(v);
    if (n != null) attrs[k] = n;
  };
  const setStr = (k, v) => {
    const s = String(v ?? "").trim();
    if (s) attrs[k] = s;
  };
  setNum("year", offer.year);
  setStr("make", offer.make);
  setStr("model", offer.model);
  setStr("trim", offer.trim);
  setNum("mileage", offer.mileage);
  setStr("vin_or_stock", offer.vin_or_stock);
  setStr("vehicle_condition", offer.vehicle_condition);
  setStr("title_status", offer.title_status);
  setStr("accident_history", offer.accident_history);
  setStr("exterior_color", offer.exterior_color);
  setNum("vehicle_price", offer.vehicle_price);
  setNum("estimated_tax_fees", offer.estimated_tax_fees ?? 0);
  setNum("dealer_fee", offer.dealer_fee ?? 0);
  setNum("partner_service_fee", offer.partner_service_fee ?? 0);
  setNum("delivery_fee", offer.delivery_fee ?? 0);
  if (offer.is_alternative && String(offer.alternative_reason || "").trim()) {
    attrs.alternative_reason = String(offer.alternative_reason).trim();
  }
  if (offer.linked_request_index != null && offer.linked_request_index !== "") {
    attrs.linked_request_index = Number(offer.linked_request_index);
  }
  return attrs;
}

/** @param {Record<string, unknown>} o */
function vehicleOfferToProductRow(o) {
  const totalRaw = Number(o.estimated_total);
  const total =
    Number.isFinite(totalRaw) && totalRaw > 0 ? totalRaw : computeOfferEstimatedTotal(o);
  const vehiclePrice = numOrNull(o.vehicle_price);
  const feesSum = sumFeeComponents(o);
  const currency = String(o.currency || "USD").trim().toUpperCase().slice(0, 3) || "USD";

  /** @type {Record<string, unknown>} */
  const row = {
    offer_id: String(o.offer_id || "").trim(),
    offer_kind: o.is_alternative ? OFFER_KIND_ALT : OFFER_KIND_MATCH,
    title: buildAutoOfferTitle(o),
    product_category: VEHICLE_PRODUCT_CATEGORY,
    estimated_total: String(Math.round(total * 100) / 100),
    currency,
  };

  const descParts = [o.description, o.included_services, o.notes]
    .map((x) => String(x ?? "").trim())
    .filter(Boolean);
  if (descParts.length) row.description = descParts.join("\n");

  if (vehiclePrice != null && vehiclePrice > 0) row.price_amount = String(vehiclePrice);
  if (feesSum > 0) row.fees = String(feesSum);

  const tl = String(o.available_timeline || "").trim();
  if (tl) row.available_timeline = tl;
  const loc = String(o.location || "").trim();
  if (loc) row.location = loc;
  const msg = String(o.message_to_customer || "").trim();
  if (msg) row.message_to_customer = msg;

  if (o.is_alternative) {
    row.is_alternative = true;
    const reason = String(o.alternative_reason || "").trim();
    if (reason) row.alternative_reason = reason;
  }
  if (o.linked_request_index != null && o.linked_request_index !== "") {
    row.linked_request_index = Number(o.linked_request_index);
  }

  const photos = normalizeVehiclePhotosForSubmit(
    Array.isArray(o.photos) ? o.photos : [],
    Number(o.primary_photo_index),
  );
  if (photos.length) row.photos = photos;

  row.attributes = buildOfferAttributes(o);
  return row;
}

/**
 * @param {Record<string, unknown>[]} offers
 * @param {string|null|undefined} globalMessage
 * @param {Array<Record<string, unknown>> | null | undefined} [vehicleRequests]
 */
export function buildCarSubmitPayload(offers, globalMessage, vehicleRequests) {
  const linked = ensureOffersLinkedRequestIndexes(offers, vehicleRequests);
  const normalized = assignOfferIds(linked).map((o) => vehicleOfferToProductRow(o));

  const totals = normalized
    .map((o) => Number(String(o.estimated_total || "").replace(/,/g, "")))
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
      bid_type: PRODUCT_OFFER_BID_TYPE,
      product_category: VEHICLE_PRODUCT_CATEGORY,
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
  if (bidRequestBlock.is_expired === true) return "Bidding ended";
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

/**
 * @param {Record<string, unknown> | null | undefined} carReq
 * @returns {number | null}
 */
export function resolveCarPurchaseBudgetMax(carReq) {
  if (!carReq || typeof carReq !== "object") return null;
  const top = carReq.budget_max;
  if (top != null && top !== "") {
    const n = Number(top);
    if (Number.isFinite(n)) return n;
  }
  const vrs = Array.isArray(carReq.vehicle_requests) ? carReq.vehicle_requests : [];
  let max = null;
  for (const vr of vrs) {
    if (!vr || typeof vr !== "object") continue;
    const n = Number(vr.budget_max);
    if (!Number.isFinite(n)) continue;
    max = max == null ? n : Math.max(max, n);
  }
  return max;
}

/**
 * @param {unknown} raw
 * @returns {string}
 */
export function formatCarDesiredTimeline(raw) {
  const key = String(raw ?? "").trim().toLowerCase();
  if (!key) return "";
  return VP_TIMELINE_LABELS[key] || String(raw).trim();
}

/**
 * @param {Record<string, unknown> | null | undefined} carReq
 * @returns {string}
 */
export function resolveCarDesiredTimeline(carReq) {
  if (!carReq || typeof carReq !== "object") return "";
  const top = formatCarDesiredTimeline(carReq.desired_timeline);
  if (top) return top;
  const vrs = Array.isArray(carReq.vehicle_requests) ? carReq.vehicle_requests : [];
  for (const vr of vrs) {
    if (!vr || typeof vr !== "object") continue;
    const label = formatCarDesiredTimeline(vr.desired_timeline);
    if (label) return label;
  }
  return "";
}

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
  const condLabel = cond === "NEW" ? "New" : cond === "USED" ? "Used" : cond || "";
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
