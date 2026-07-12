/**
 * Generic PRODUCT_OFFER partner bid — pure helpers (unit-testable).
 */

import { formatBidDeadlineRemaining, isBidDeadlinePassed } from "../core/bid-deadline-display.js";
import { t } from "../core/i18n-client.js";

export const PRODUCT_OFFER_BID_TYPE = "PRODUCT_OFFER";

const SORT_BASIS_KEYS = {
  recommended: "partner.bid.rank.sort.recommended",
  lowest_total: "partner.bid.rank.sort.lowest_total",
  recently_updated: "partner.bid.rank.sort.recently_updated",
  fastest_timeline: "partner.bid.rank.sort.fastest_timeline",
  photo_first: "partner.bid.rank.sort.photo_first",
  newest_year: "partner.bid.rank.sort.newest_year",
  lowest_mileage: "partner.bid.rank.sort.lowest_mileage",
  lowest_fees: "partner.bid.rank.sort.lowest_fees",
};

/** @param {string} basis @param {(key: string, fallback: string) => string} [translate] */
function sortBasisLabel(basis, translate = t) {
  const key = SORT_BASIS_KEYS[basis];
  const fallbacks = {
    recommended: "Recommended",
    lowest_total: "Lowest total",
    recently_updated: "Recently updated",
    fastest_timeline: "Fastest timeline",
    photo_first: "Photos first",
    newest_year: "Newest year",
    lowest_mileage: "Lowest mileage",
    lowest_fees: "Lowest fees",
  };
  return key ? translate(key, fallbacks[basis] || basis) : translate("partner.bid.rank.sort.recommended", "Recommended");
}

/** @param {unknown} raw */
export function offersFromIncludedItems(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return [];
  const o = /** @type {Record<string, unknown>} */ (raw);
  if (String(o.bid_type || "").toUpperCase() !== PRODUCT_OFFER_BID_TYPE) return [];
  const list = o.offers;
  if (!Array.isArray(list)) return [];
  return list.map((item, i) => normalizeLoadedOffer(item, i));
}

/** @param {unknown} item @param {number} index */
function normalizeLoadedOffer(item, index) {
  const x =
    item && typeof item === "object" ? /** @type {Record<string, unknown>} */ ({ ...item }) : {};
  if (!x.offer_id) x.offer_id = `offer_${index + 1}`;
  if (!Array.isArray(x.photos)) x.photos = [];
  if (x.attributes && typeof x.attributes === "object" && !Array.isArray(x.attributes)) {
    x.attributes_json = JSON.stringify(x.attributes, null, 2);
  } else if (typeof x.attributes_json !== "string") {
    x.attributes_json = "";
  }
  return x;
}

/** @returns {Record<string, unknown>} */
export function createEmptyProductOffer() {
  return {
    offer_id: "",
    title: "",
    description: "",
    product_category: "",
    estimated_total: "",
    price_amount: "",
    fees: "",
    currency: "USD",
    available_timeline: "",
    location: "",
    photos: [],
    attributes_json: "",
    message_to_customer: "",
  };
}

/** @param {Record<string, unknown>[]} offers */
export function assignOfferIds(offers) {
  return offers.map((o, i) => ({
    ...o,
    offer_id: String(o.offer_id || "").trim() || `offer_${i + 1}`,
  }));
}

/** @param {string} json */
export function parseAttributesJson(json) {
  const raw = String(json ?? "").trim();
  if (!raw) return null;
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("attributes_json_invalid");
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("attributes_not_object");
  }
  return parsed;
}

/** @param {Record<string, unknown>[]} photos */
export function normalizePhotosForSubmit(photos) {
  if (!Array.isArray(photos)) return [];
  return photos
    .map((p, i) => {
      const row = p && typeof p === "object" ? /** @type {Record<string, unknown>} */ (p) : {};
      const url = String(row.url || "").trim();
      if (!url) return null;
      const out = { url };
      const thumb = String(row.thumbnail_url || "").trim();
      if (thumb) out.thumbnail_url = thumb;
      const cap = String(row.caption || "").trim();
      if (cap) out.caption = cap;
      out.sort_order = i;
      return out;
    })
    .filter(Boolean);
}

/**
 * @param {Record<string, unknown>[]} offers
 * @param {{ requiresOfferPhotos?: boolean }} cfg
 * @returns {{ code: string, params?: Record<string, number> } | null}
 */
export function validateProductOffersForSubmit(offers, cfg) {
  const requirePhotos = cfg.requiresOfferPhotos === true;
  if (!offers.length) return { code: "min_offers" };
  for (let i = 0; i < offers.length; i += 1) {
    const o = offers[i];
    const offer = i + 1;
    const title = String(o.title || "").trim();
    if (!title) return { code: "title_required", params: { offer } };
    const total = Number(String(o.estimated_total || "").replace(/,/g, ""));
    if (!Number.isFinite(total) || total <= 0) {
      return { code: "estimated_total_required", params: { offer } };
    }
    const pa = String(o.price_amount ?? "").trim();
    if (pa) {
      const nPa = Number(pa.replace(/,/g, ""));
      if (!Number.isFinite(nPa) || nPa < 0) return { code: "price_amount_invalid", params: { offer } };
    }
    const fees = String(o.fees ?? "").trim();
    if (fees) {
      const nFees = Number(fees.replace(/,/g, ""));
      if (!Number.isFinite(nFees) || nFees < 0) return { code: "fees_invalid", params: { offer } };
    }
    try {
      parseAttributesJson(String(o.attributes_json || ""));
    } catch (e) {
      const code =
        e instanceof Error && (e.message === "attributes_json_invalid" || e.message === "attributes_not_object")
          ? e.message
          : "attributes_json_invalid";
      return { code, params: { offer } };
    }
    const photos = Array.isArray(o.photos) ? o.photos : [];
    let hasPhoto = Boolean(String(o.thumbnail_url || "").trim());
    for (const p of photos) {
      const row = p && typeof p === "object" ? p : {};
      if (String(row.url || "").trim() || String(row.thumbnail_url || "").trim()) hasPhoto = true;
      if (String(row.url || "").trim() && !/^https?:\/\//i.test(String(row.url).trim())) {
        return { code: "photo_url_invalid", params: { offer } };
      }
    }
    if (requirePhotos && !hasPhoto) {
      return { code: "photos_min", params: { offer } };
    }
  }
  return null;
}

/**
 * @param {Record<string, unknown>[]} offers
 * @param {{ messageToCustomer?: string|null }} opts
 */
export function buildProductSubmitPayload(offers, opts = {}) {
  const withIds = assignOfferIds(offers);
  const normalized = withIds.map((o) => {
    const row = {
      offer_id: String(o.offer_id || "").trim(),
      title: String(o.title || "").trim(),
      estimated_total: String(o.estimated_total || "").trim(),
      currency: String(o.currency || "USD").trim().toUpperCase().slice(0, 3) || "USD",
    };
    const desc = String(o.description || "").trim();
    if (desc) row.description = desc;
    const cat = String(o.product_category || "").trim();
    if (cat) row.product_category = cat;
    const pa = String(o.price_amount ?? "").trim();
    if (pa) row.price_amount = pa.replace(/,/g, "");
    const fees = String(o.fees ?? "").trim();
    if (fees) row.fees = fees.replace(/,/g, "");
    const tl = String(o.available_timeline || "").trim();
    if (tl) row.available_timeline = tl;
    const loc = String(o.location || "").trim();
    if (loc) row.location = loc;
    const msg = String(o.message_to_customer || "").trim();
    if (msg) row.message_to_customer = msg;
    const photos = normalizePhotosForSubmit(Array.isArray(o.photos) ? o.photos : []);
    if (photos.length) row.photos = photos;
    const attrsRaw = String(o.attributes_json || "").trim();
    if (attrsRaw) row.attributes = parseAttributesJson(attrsRaw);
    return row;
  });

  const firstTotal = Number(String(normalized[0]?.estimated_total || "").replace(/,/g, ""));
  const msgBid = String(opts.messageToCustomer ?? "").trim();

  return {
    price_amount: Number.isFinite(firstTotal) && firstTotal > 0 ? firstTotal : 1,
    price_currency: String(normalized[0]?.currency || "USD"),
    estimated_time: normalized[0]?.available_timeline || null,
    included_items: {
      bid_type: PRODUCT_OFFER_BID_TYPE,
      offers: normalized,
    },
    message_to_customer: msgBid === "" ? null : msgBid,
  };
}

/** @param {Record<string, unknown>|null|undefined} summary @param {{ prefix?: string, translate?: (key: string, fallback: string) => string }} [opts] */
export function formatRankSummaryLabel(summary, opts = {}) {
  if (!summary || typeof summary !== "object") return "";
  const tr = typeof opts.translate === "function" ? opts.translate : t;
  const prefix = String(
    opts.prefix || tr("partner.bid.rank.prefix", "My offer rank"),
  ).trim();
  const labelKo = String(summary.label_ko || "").trim();
  if (labelKo) return `${prefix}: ${labelKo}`;
  const rank = summary.best_rank ?? summary.partner_best_rank;
  const total = summary.total_offers;
  const basis = String(summary.basis || summary.sort_basis || "recommended").trim();
  const basisLabel = sortBasisLabel(basis, tr);
  if (rank != null && total != null) {
    return tr("partner.bid.rank.format", "{prefix}: #{rank} of {total} ({basis})")
      .replace("{prefix}", prefix)
      .replace("{rank}", String(rank))
      .replace("{total}", String(total))
      .replace("{basis}", basisLabel);
  }
  return "";
}

/**
 * @param {{ bidStatus?: string, requestStatus?: string, expiresAt?: string }} opts
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
  return bs === "NOT_SUBMITTED" || bs === "SUBMITTED" || bs === "DRAFT";
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

/** @param {string} requestStatus */
export function isPartnerBidDetailPollingPhase(requestStatus) {
  return String(requestStatus || "").trim().toUpperCase() === "OPEN";
}

/** @param {string} bidStatus @param {string} requestStatus @param {(key: string, fallback: string) => string} [translate] */
export function partnerBidStatusLabel(bidStatus, requestStatus, translate = t) {
  const tr = translate;
  const rs = String(requestStatus || "").trim().toUpperCase();
  if (rs === "CUSTOMER_SELECTED") return tr("partner.bid.status.customer_selected", "Customer selection complete");
  if (rs === "EXPIRED") return tr("partner.bid.status.expired", "Bidding ended (deadline passed)");
  if (rs === "CANCELLED") return tr("partner.bid.status.cancelled", "Round closed (new round)");
  if (rs === "CLOSED") return tr("partner.bid.status.closed", "Closed");
  const bs = String(bidStatus || "").trim().toUpperCase();
  if (bs === "SELECTED") return tr("partner.bid.status.my_offer_selected", "Customer selected my offer");
  if (bs === "REJECTED") return tr("partner.bid.status.not_selected", "Not selected");
  if (bs === "SUBMITTED") return tr("partner.bid.status.submitted", "Submitted");
  if (bs === "NOT_SUBMITTED" || bs === "DRAFT") return tr("partner.bid.status.not_submitted", "Not submitted");
  return bs || "—";
}

/** @param {string} requestStatus @param {(key: string, fallback: string) => string} [translate] */
export function partnerBidRequestRoundLabel(requestStatus, translate = t) {
  const tr = translate;
  const rs = String(requestStatus || "").trim().toUpperCase();
  if (rs === "OPEN") return tr("partner.bid.round.open", "Accepting offers");
  if (rs === "CUSTOMER_SELECTED") return tr("partner.bid.status.customer_selected", "Customer selection complete");
  if (rs === "EXPIRED") return tr("partner.bid.round.expired", "Submission deadline passed");
  if (rs === "CANCELLED") return tr("partner.bid.round.cancelled", "Round closed (re-requested)");
  if (rs === "CLOSED") return tr("partner.bid.status.closed", "Closed");
  return rs || "—";
}

/** @param {string} bidStatus @param {(key: string, fallback: string) => string} [translate] */
export function partnerMyBidSubmissionLabel(bidStatus, translate = t) {
  const tr = translate;
  const bs = String(bidStatus || "").trim().toUpperCase();
  if (bs === "SUBMITTED") return tr("partner.bid.my_bid.submitted", "Submitted");
  if (bs === "SELECTED") return tr("partner.bid.my_bid.submitted_selected", "Submitted · customer selected");
  if (bs === "DRAFT") return tr("partner.bid.my_bid.draft", "Draft saved (not submitted)");
  if (bs === "REJECTED") return tr("partner.bid.my_bid.rejected", "Submitted but not selected");
  if (bs === "CLOSED") return tr("partner.bid.my_bid.closed", "Cannot edit");
  return tr("partner.bid.my_bid.not_submitted", "Not submitted yet");
}

/** @param {Record<string, unknown>} bid @param {string} requestStatus @param {(key: string, fallback: string) => string} [translate] */
export function endedStateMessage(bid, requestStatus, translate = t) {
  const tr = translate;
  const bs = String(bid?.status ?? "").trim().toUpperCase();
  const rs = String(requestStatus || "").trim().toUpperCase();
  if (bs === "SELECTED") {
    return tr(
      "partner.bid.ended.selected",
      "Customer selected your offer. You have been added to the message thread.",
    );
  }
  if (rs === "EXPIRED") {
    return tr(
      "partner.bid.ended.expired",
      "Bidding ended. You can no longer edit offers. A customer may still select an existing offer.",
    );
  }
  if (rs === "CANCELLED") {
    return tr(
      "partner.bid.ended.cancelled",
      "Customer requested a new bidding round. This round is closed.",
    );
  }
  if (rs === "CUSTOMER_SELECTED" && bs === "REJECTED") {
    return tr("partner.bid.ended.other_selected", "Bidding ended. Another offer was selected.");
  }
  if (rs === "CUSTOMER_SELECTED" || rs === "CLOSED" || bs === "REJECTED" || bs === "EXPIRED") {
    return tr("partner.bid.ended.closed", "This bidding round is closed.");
  }
  return "";
}
