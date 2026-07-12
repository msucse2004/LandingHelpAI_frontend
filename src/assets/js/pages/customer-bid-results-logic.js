/**
 * Customer bid results — pure logic (testable).
 */

import {
  formatBidDeadlineRemaining,
  isBidDeadlinePassed,
} from "../core/bid-deadline-display.js";

/** @typedef {(key: string, fallback: string) => string} CustomerBidTranslate */

/** @param {CustomerBidTranslate | null | undefined} translate @param {string} key @param {string} fallback @param {Record<string, string | number>} [params] */
export function cbrT(translate, key, fallback, params = null) {
  const fn = typeof translate === "function" ? translate : (_k, fb) => fb;
  let text = fn(key, fallback);
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      text = text.replace(new RegExp(`\\{${k}\\}`, "g"), String(v));
    }
  }
  return text;
}

export const OFFER_TRANSLATION_STATUS_FAILED = "translation_required_failed";

export const OFFER_TRANSLATION_I18N_KEYS = {
  preparingTitle: "messages.translation.preparing_title",
  preparingMessage: "messages.translation.preparing_message",
};

/** @param {Record<string, unknown> | null | undefined} offer */
export function normalizeOfferTranslationStatus(offer) {
  return String(offer?.translation_status ?? "")
    .trim()
    .toLowerCase()
    .replace(/-/g, "_");
}

/** @param {Record<string, unknown> | null | undefined} offer */
export function offerCrossLocaleViewer(offer) {
  const src = String(offer?.source_locale ?? "")
    .trim()
    .toLowerCase();
  const disp = String(offer?.display_locale ?? "")
    .trim()
    .toLowerCase();
  if (!src || !disp) return false;
  return src !== disp;
}

/** @param {Record<string, unknown> | null | undefined} offer */
export function offerTranslationFailed(offer) {
  return normalizeOfferTranslationStatus(offer) === OFFER_TRANSLATION_STATUS_FAILED;
}

/** @param {CustomerBidTranslate | null | undefined} [translate] */
export function offerTranslationPreparingTitle(translate = null) {
  return cbrT(translate, OFFER_TRANSLATION_I18N_KEYS.preparingTitle, "Preparing title translation...");
}

/** @param {CustomerBidTranslate | null | undefined} [translate] */
export function offerTranslationPreparingMessage(translate = null) {
  return cbrT(translate, OFFER_TRANSLATION_I18N_KEYS.preparingMessage, "Preparing message...");
}

/**
 * Viewer-locale offer title — never leaks raw ``title`` on cross-locale failure.
 * @param {Record<string, unknown>} offer
 * @param {CustomerBidTranslate | null | undefined} [translate]
 */
export function offerDisplayTitle(offer, translate = null) {
  const display = String(offer?.display_title ?? "").trim();
  if (display) return display;
  const original = String(offer?.title ?? "").trim();
  if (offerCrossLocaleViewer(offer)) {
    if (offerTranslationFailed(offer) || original) {
      return offerTranslationPreparingTitle(translate);
    }
    return offerTranslationPreparingTitle(translate);
  }
  if (original) return original;
  return formatOfferVehicleTitle(offer, translate);
}

/**
 * @param {Record<string, unknown>} offer
 * @param {CustomerBidTranslate | null | undefined} [translate]
 * @param {{ placeholderOnFailure?: boolean }} [options]
 */
export function offerDisplayDescription(offer, translate = null, options = {}) {
  const display = String(offer?.display_description ?? "").trim();
  if (display) return display;
  const original = String(offer?.description ?? "").trim();
  if (offerCrossLocaleViewer(offer)) {
    if (offerTranslationFailed(offer) && options.placeholderOnFailure) {
      return offerTranslationPreparingMessage(translate);
    }
    return null;
  }
  return original || null;
}

/**
 * @param {Record<string, unknown>} offer
 * @param {CustomerBidTranslate | null | undefined} [translate]
 * @param {{ placeholderOnFailure?: boolean }} [options]
 */
export function offerDisplayPartnerMessage(offer, translate = null, options = {}) {
  const svc =
    offer.service && typeof offer.service === "object"
      ? /** @type {Record<string, unknown>} */ (offer.service)
      : {};
  const display = String(offer.display_message_to_customer ?? svc.display_message ?? "").trim();
  if (display) return display;
  const original = String(offer.message_to_customer ?? svc.message ?? "").trim();
  if (offerCrossLocaleViewer(offer)) {
    if (offerTranslationFailed(offer) || original) {
      if (options.placeholderOnFailure !== false) {
        return offerTranslationPreparingMessage(translate);
      }
      return null;
    }
    return null;
  }
  return original || null;
}

/** @param {Record<string, unknown>} offer */
export function offerDisplayAvailability(offer) {
  const svc =
    offer.service && typeof offer.service === "object"
      ? /** @type {Record<string, unknown>} */ (offer.service)
      : {};
  const display = String(offer.display_available_timeline ?? svc.display_available_timeline ?? "").trim();
  if (display) return display;
  if (offerCrossLocaleViewer(offer)) return null;
  return offerAvailabilityLabel(offer) || null;
}

/** @param {Record<string, unknown>} offer @param {CustomerBidTranslate | null | undefined} [translate] */
export function offerDisplayVehicleCondition(offer, translate = null) {
  const veh =
    offer.vehicle && typeof offer.vehicle === "object"
      ? /** @type {Record<string, unknown>} */ (offer.vehicle)
      : {};
  const display = String(veh.display_condition ?? "").trim();
  if (display) return display;
  if (offerCrossLocaleViewer(offer)) return null;
  const raw = veh.condition ?? resolveVehicleFromOffer(offer).condition;
  return conditionLabel(raw, translate) || null;
}

/** @param {Record<string, unknown>} offer @param {CustomerBidTranslate | null | undefined} [translate] */
export function offerDisplayTitleStatus(offer, translate = null) {
  const veh =
    offer.vehicle && typeof offer.vehicle === "object"
      ? /** @type {Record<string, unknown>} */ (offer.vehicle)
      : {};
  const display = String(veh.display_title_status ?? "").trim();
  if (display) return display;
  if (offerCrossLocaleViewer(offer)) return null;
  const raw = veh.title_status ?? resolveVehicleFromOffer(offer).title_status;
  return titleStatusLabel(raw, translate) || null;
}

/** @param {Record<string, unknown>} offer @param {CustomerBidTranslate | null | undefined} [translate] */
export function offerDisplayAccidentHistory(offer, translate = null) {
  const veh =
    offer.vehicle && typeof offer.vehicle === "object"
      ? /** @type {Record<string, unknown>} */ (offer.vehicle)
      : {};
  const display = String(veh.display_accident_history ?? "").trim();
  if (display) return display;
  if (offerCrossLocaleViewer(offer)) return null;
  const raw = veh.accident_history ?? resolveVehicleFromOffer(offer).accident_history;
  return accidentLabel(raw, translate) || null;
}

/** @param {Record<string, unknown>} offer @returns {string[]} */
export function offerDisplayIncludedServices(offer) {
  const svc =
    offer.service && typeof offer.service === "object"
      ? /** @type {Record<string, unknown>} */ (offer.service)
      : {};
  const display = svc.display_included_services;
  if (Array.isArray(display) && display.length) {
    return display
      .map((item) => (item == null ? "" : String(item).trim()))
      .filter(Boolean);
  }
  if (offerCrossLocaleViewer(offer)) return [];
  const raw = svc.included_services;
  if (!Array.isArray(raw)) return [];
  return raw.map((item) => String(item || "").trim()).filter(Boolean);
}

/** @typedef {'recommended'|'lowest_total'|'recently_updated'|'fastest_timeline'|'photo_first'|'newest_year'|'lowest_mileage'|'lowest_fees'} CustomerOfferSort */

export const CUSTOMER_BID_SORT_OPTIONS = [
  { value: "recommended", i18nKey: "customer.bid_results.sort.recommended", fallback: "Recommended" },
  { value: "lowest_total", i18nKey: "customer.bid_results.sort.lowest_total", fallback: "Lowest total" },
  { value: "recently_updated", i18nKey: "customer.bid_results.sort.recently_updated", fallback: "Recently updated" },
  { value: "fastest_timeline", i18nKey: "customer.bid_results.sort.fastest_timeline", fallback: "Fastest timeline" },
  { value: "photo_first", i18nKey: "customer.bid_results.sort.photo_first", fallback: "With photos first" },
];

export const RANK_BASIS_I18N = {
  recommended: { i18nKey: "customer.bid_results.sort.recommended", fallback: "Recommended" },
  lowest_total: { i18nKey: "customer.bid_results.sort.lowest_total", fallback: "Lowest total" },
  recently_updated: { i18nKey: "customer.bid_results.sort.recently_updated", fallback: "Recently updated" },
  fastest_timeline: { i18nKey: "customer.bid_results.sort.fastest_timeline", fallback: "Fastest timeline" },
  photo_first: { i18nKey: "customer.bid_results.sort.photo_first", fallback: "With photos first" },
  newest_year: { i18nKey: "customer.bid_results.sort.newest_year", fallback: "Newest year" },
  lowest_mileage: { i18nKey: "customer.bid_results.sort.lowest_mileage", fallback: "Lowest mileage" },
  lowest_fees: { i18nKey: "customer.bid_results.sort.lowest_fees", fallback: "Lowest fees" },
};

/** @type {Record<string, { i18nKey: string, fallback: string }>} */
export const MATCH_CONDITION_I18N = {
  within_budget: {
    i18nKey: "customer.bid_results.match.within_budget",
    fallback: "Within budget",
  },
  clean_title: {
    i18nKey: "customer.bid_results.match.clean_title",
    fallback: "Clean title",
  },
  make: { i18nKey: "customer.bid_results.match.make", fallback: "Make matches request" },
  model: { i18nKey: "customer.bid_results.match.model", fallback: "Model matches request" },
  make_model_match: {
    i18nKey: "customer.bid_results.match.make_model_match",
    fallback: "Matches requested vehicle",
  },
  year: { i18nKey: "customer.bid_results.match.year", fallback: "Year matches request" },
  year_min_met: {
    i18nKey: "customer.bid_results.match.year_min_met",
    fallback: "Year {year_min} or newer",
  },
  mileage_within_limit: {
    i18nKey: "customer.bid_results.match.mileage_within_limit",
    fallback: "Within mileage limit",
  },
};

/** @type {Record<string, { i18nKey: string, fallback: string }>} */
export const MATCH_WARNING_I18N = {
  over_budget: {
    i18nKey: "customer.bid_results.match.over_budget",
    fallback: "Over budget",
  },
  alternative_vehicle: {
    i18nKey: "customer.bid_results.match.alternative_vehicle",
    fallback: "Alternative vehicle",
  },
  mileage_above_request: {
    i18nKey: "customer.bid_results.match.mileage_above",
    fallback: "Above mileage limit",
  },
};

/** @type {Record<string, { i18nKey: string, fallback: string }>} */
export const PRICE_BREAKDOWN_I18N = {
  vehicle_price: {
    i18nKey: "customer.bid_results.price.vehicle_line",
    fallback: "Vehicle price",
  },
  tax_fees: {
    i18nKey: "customer.bid_results.price.tax_fees_line",
    fallback: "Tax & fees",
  },
  dealer_fee: {
    i18nKey: "customer.bid_results.price.dealer_fee_line",
    fallback: "Dealer fee",
  },
  partner_service_fee: {
    i18nKey: "customer.bid_results.price.partner_fee_line",
    fallback: "Partner service fee",
  },
  delivery_fee: {
    i18nKey: "customer.bid_results.price.delivery_line",
    fallback: "Delivery fee",
  },
  estimated_total: {
    i18nKey: "customer.bid_results.price.estimated_total",
    fallback: "Estimated total",
  },
};

/**
 * @param {string | null | undefined} code
 * @param {CustomerBidTranslate | null | undefined} [translate]
 * @param {Record<string, string | number>} [params]
 */
export function formatMatchConditionCode(code, translate = null, params = {}) {
  const raw = String(code || "").trim();
  if (!raw) return "";
  const key = raw.toLowerCase().replace(/\s+/g, "_");
  const row = MATCH_CONDITION_I18N[key];
  if (row) return cbrT(translate, row.i18nKey, row.fallback, params);
  const missing = /^missing_(.+)$/.exec(key);
  if (missing) {
    return cbrT(translate, "customer.bid_results.match.missing_field", "Missing {field}", {
      field: missing[1],
    });
  }
  return raw;
}

/**
 * @param {string | null | undefined} code
 * @param {CustomerBidTranslate | null | undefined} [translate]
 * @param {Record<string, unknown>} [offer]
 */
export function formatMatchWarningCode(code, translate = null, offer = null) {
  const raw = String(code || "").trim();
  if (!raw) return "";
  const key = raw.toLowerCase().replace(/\s+/g, "_");
  const row = MATCH_WARNING_I18N[key];
  if (row) return cbrT(translate, row.i18nKey, row.fallback);
  const mismatch = /^(.+)_mismatch$/.exec(key);
  if (mismatch) {
    return cbrT(translate, "customer.bid_results.match.field_mismatch", "{field} differs from request", {
      field: mismatch[1],
    });
  }
  const match = offer?.match && typeof offer.match === "object" ? offer.match : {};
  const pricing = offer?.pricing && typeof offer.pricing === "object" ? offer.pricing : {};
  const delta = match.budget_delta ?? pricing.budget_delta;
  if (key === "over_budget" && delta != null && Number(delta) > 0) {
    return cbrT(translate, "customer.bid_results.match.over_budget_amount", "{amount} over budget", {
      amount: formatMoney(delta),
    });
  }
  return raw;
}

/**
 * @param {Record<string, unknown>} offer
 * @param {CustomerBidTranslate | null | undefined} [translate]
 * @param {{ useWarnings?: boolean, limit?: number }} [options]
 */
export function formatMatchCodesList(offer, translate = null, options = {}) {
  const m = offer.match && typeof offer.match === "object" ? offer.match : {};
  const useWarnings = Boolean(options.useWarnings);
  const source = useWarnings
    ? Array.isArray(m.display_warnings)
      ? m.display_warnings
      : Array.isArray(m.warnings)
        ? m.warnings
        : []
    : Array.isArray(m.display_matched_conditions)
      ? m.display_matched_conditions
      : Array.isArray(m.matched_conditions)
        ? m.matched_conditions
        : [];
  const limit = options.limit ?? 3;
  const yearMin = m.year_min;
  const formatter = useWarnings ? formatMatchWarningCode : formatMatchConditionCode;
  return source
    .map((code) => {
      if (code == null || String(code).trim() === "") return "";
      const params =
        !useWarnings && String(code).toLowerCase() === "year_min_met" && yearMin != null
          ? { year_min: yearMin }
          : {};
      return useWarnings
        ? formatter(code, translate, offer)
        : formatter(code, translate, params);
    })
    .filter(Boolean)
    .slice(0, limit);
}

/** @deprecated use RANK_BASIS_I18N */
export const RANK_BASIS_LABELS_EN = {
  recommended: "Recommended",
  lowest_total: "Lowest total",
  recently_updated: "Recently updated",
  fastest_timeline: "Fastest timeline",
  photo_first: "With photos",
  newest_year: "Newest year",
  lowest_mileage: "Lowest mileage",
  lowest_fees: "Lowest fees",
};

const BID_STATUS_I18N = {
  OPEN: { i18nKey: "customer.bid_results.status.open", fallback: "Bidding in progress" },
  EXPIRED: { i18nKey: "customer.bid_results.status.expired", fallback: "Bidding ended" },
  CUSTOMER_SELECTED: { i18nKey: "customer.bid_results.status.customer_selected", fallback: "Offer selected" },
  CLOSED: { i18nKey: "customer.bid_results.status.closed", fallback: "Closed" },
  CANCELLED: { i18nKey: "customer.bid_results.status.cancelled", fallback: "Cancelled" },
};

/** @param {{ i18nKey: string, fallback: string }} row @param {CustomerBidTranslate | null | undefined} [translate] */
export function formatSortOptionLabel(row, translate = null) {
  return cbrT(translate, row.i18nKey, row.fallback);
}

/**
 * `/uploads/...` etc. — resolve relative media paths against API base or origin.
 * @param {string} url
 */
export function resolveOfferMediaUrl(url) {

  const s = String(url || "").trim();
  if (!s) return "";
  if (/^https?:\/\//i.test(s)) return s;
  const path = s.startsWith("/") ? s : `/${s}`;
  if (typeof window === "undefined") return s;
  const explicit = window.LHAI_API_BASE_URL;
  let base = "";
  if (explicit != null && String(explicit).trim() !== "") {
    base = String(explicit).replace(/\/$/, "");
  } else {
    const host = window.location.hostname;
    const port = window.location.port;
    const local = host === "localhost" || host === "127.0.0.1";
    if (local && (port === "8000" || port === "")) {
      base = "";
    } else if (window.location.protocol === "https:") {
      base = "";
    } else {
      base = "http://localhost:8000";
    }
  }
  if (base) return `${base}${path}`;
  return `${window.location.origin}${path}`;
}

export { formatBidDeadlineRemaining, isBidDeadlinePassed };

/** Shown on vehicle offer cards when bidding is EXPIRED. */
export const EXPIRED_AVAILABILITY_BADGE =
  "Bidding ended — availability needs confirmation";

/** Shown when customer confirms a vehicle offer selection. */
export const VEHICLE_BID_SELECT_AVAILABILITY_NOTICE =
  "The proposed vehicle may be sold to another buyer first. Even after you select it, confirm actual availability and price with the partner.";

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

/** @param {'OPEN'|'EXPIRED'|'CUSTOMER_SELECTED'|'CLOSED'} phase @param {CustomerBidTranslate | null | undefined} [translate] */
export function customerBidStatusBannerMessage(phase, translate = null) {
  if (phase === "CUSTOMER_SELECTED") {
    return cbrT(
      translate,
      "customer.bid_results.banner.partner_selected",
      "Partner selection is complete. Continue the next steps in messages.",
    );
  }
  if (phase === "EXPIRED") {
    return cbrT(
      translate,
      "customer.bid_results.banner.expired",
      "Bidding has ended. Partners can no longer update offers. You can still select an existing offer, but availability and price should be confirmed with the partner.",
    );
  }
  if (phase === "CLOSED") {
    return cbrT(
      translate,
      "customer.bid_results.banner.round_closed",
      "This bidding round has ended. If a new round has started, check the latest round.",
    );
  }
  return "";
}

/**
 * @param {Record<string, unknown> | null | undefined} snap
 */
export function resolveCustomerBidActions(snap) {
  const phase = resolveCustomerBidDisplayPhase(
    snap?.bid_request_status ?? snap?.status,
    snap?.expires_at,
  );
  const fromApi =
    typeof snap?.can_select_existing_offers === "boolean" &&
    typeof snap?.can_partner_submit === "boolean";
  if (fromApi) {
    return {
      can_select_existing_offers: Boolean(snap.can_select_existing_offers),
      can_partner_submit: Boolean(snap.can_partner_submit),
      can_request_new_round: Boolean(snap?.can_request_new_round),
      phase,
    };
  }
  const canSelect = phase === "OPEN" || phase === "EXPIRED";
  return {
    can_select_existing_offers: canSelect,
    can_partner_submit: phase === "OPEN",
    can_request_new_round: canRequestNewBidRound(snap),
    phase,
  };
}

/**
 * @param {'OPEN'|'EXPIRED'|'CUSTOMER_SELECTED'|'CLOSED'} phase
 * @param {Record<string, unknown>} offer
 * @param {Record<string, unknown> | null | undefined} [snap]
 * @param {CustomerBidTranslate | null | undefined} [translate]
 */
function vehicleBidSelectNoticeHtml(translate = null) {
  return `<p class="lhai-cbr-confirm-notice" role="note">${escapeHtml(
    cbrT(
      translate,
      "customer.bid_results.vehicle.select_notice",
      VEHICLE_BID_SELECT_AVAILABILITY_NOTICE,
    ),
  )}</p>`;
}

export function buildCustomerBidSelectConfirmContent(phase, offer, snap, translate = null) {
  const title = offerDisplayTitle(offer, translate);
  const total = formatMoney(offer.estimated_total, offer.currency || "USD");
  const vehicleNotice =
    offer && typeof offer === "object" && isVehicleOffer(/** @type {Record<string, unknown>} */ (offer))
      ? vehicleBidSelectNoticeHtml(translate)
      : "";
  if (phase === "EXPIRED") {
    return {
      modalTitle: cbrT(translate, "customer.bid_results.confirm.expired.title", "Select this offer?"),
      bodyHtml: `<p>${escapeHtml(
        cbrT(
          translate,
          "customer.bid_results.confirm.expired.body",
          "This bidding round has ended. This vehicle may still be available, but price and availability should be confirmed with the partner. Do you want to select this offer and start a conversation?",
        ),
      )}</p>${vehicleNotice}`,
      warnText: "",
      submitLabel: cbrT(
        translate,
        "customer.bid_results.confirm.expired.submit",
        "Select and contact partner",
      ),
    };
  }
  const countdown =
    snap?.expires_at != null ? formatCountdownToExpiry(snap.expires_at, Date.now(), translate) : "";
  return {
    modalTitle: cbrT(translate, "customer.bid_results.confirm.open.title", "Confirm offer selection"),
    bodyHtml: `<p><strong>${escapeHtml(title)}</strong></p>
    <p>${escapeHtml(
      cbrT(translate, "customer.bid_results.confirm.open.body", "Do you want to select this offer?"),
    )}</p>
    <p>${escapeHtml(
      cbrT(translate, "customer.bid_results.confirm.open.total", "Estimated total {total}", { total }),
    )}</p>
    <p class="u-text-muted">${escapeHtml(
      cbrT(
        translate,
        "customer.bid_results.confirm.open.note",
        "After selection, you will continue with this partner in messages.",
      ),
    )}</p>${vehicleNotice}`,
    warnText: countdown
      ? cbrT(
          translate,
          "customer.bid_results.confirm.open.warn",
          "{countdown} left until bidding closes. Selecting now may limit additional partner proposals.",
          { countdown },
        )
      : "",
    submitLabel: cbrT(translate, "customer.bid_results.confirm.open.submit", "Confirm selection"),
  };
}

/** @param {string | null | undefined} status @param {CustomerBidTranslate | null | undefined} [translate] */
export function formatBidRequestStatusLabel(status, translate = null) {
  const st = String(status || "").trim().toUpperCase();
  const row = /** @type {Record<string, { i18nKey: string, fallback: string }>} */ (BID_STATUS_I18N)[st];
  if (row) return cbrT(translate, row.i18nKey, row.fallback);
  return st || "—";
}

/** @param {string | null | undefined} iso @param {number} [nowMs] @param {CustomerBidTranslate | null | undefined} [translate] */
export function formatRelativeTime(iso, nowMs = Date.now(), translate = null) {
  const ms = parseIsoMs(iso);
  if (ms == null) return "—";
  const diff = nowMs - ms;
  if (diff < 0) return cbrT(translate, "customer.bid_results.time.just_now", "Just now");
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return cbrT(translate, "customer.bid_results.time.just_now", "Just now");
  const min = Math.floor(sec / 60);
  if (min < 60) {
    return cbrT(translate, "customer.bid_results.time.minutes_ago", "{minutes} min ago", { minutes: min });
  }
  const hr = Math.floor(min / 60);
  if (hr < 48) {
    return cbrT(translate, "customer.bid_results.time.hours_ago", "{hours} hr ago", { hours: hr });
  }
  const day = Math.floor(hr / 24);
  if (day < 14) {
    return cbrT(translate, "customer.bid_results.time.days_ago", "{days} days ago", { days: day });
  }
  try {
    return new Date(ms).toLocaleDateString(undefined, { month: "short", day: "numeric" });
  } catch {
    return "—";
  }
}

/** @deprecated use formatRelativeTime */
export function formatRelativeTimeKo(iso, nowMs = Date.now()) {
  return formatRelativeTime(iso, nowMs);
}

/** @param {string | null | undefined} iso */
export function parseIsoMs(iso) {
  const s = String(iso || "").trim();
  if (!s) return null;
  const ms = Date.parse(s);
  return Number.isNaN(ms) ? null : ms;
}

/** @param {Record<string, unknown>} offer @param {CustomerBidTranslate | null | undefined} [translate] */
export function formatOfferTitle(offer, translate = null) {
  return offerDisplayTitle(offer, translate);
}

/**
 * Primary + full URLs for card thumbnail (thumb first; full used on img error).
 * @param {Record<string, unknown>} offer
 */
export function getOfferPhotoDisplayUrls(offer) {
  const photos = collectOfferPhotos(offer);
  if (!photos.length) {
    const topThumb = String(offer.thumbnail_url || "").trim();
    if (!topThumb) return { thumb: "", full: "" };
    const resolved = resolveOfferMediaUrl(topThumb);
    return { thumb: resolved, full: resolved };
  }
  const primary = photos[0];
  const full = String(primary.url || "").trim();
  const thumb = String(primary.thumbnail_url || full).trim();
  return {
    thumb: thumb ? resolveOfferMediaUrl(thumb) : "",
    full: full ? resolveOfferMediaUrl(full) : "",
  };
}

/** @param {Record<string, unknown>} offer */
export function offerThumbnailUrl(offer) {
  const { thumb, full } = getOfferPhotoDisplayUrls(offer);
  const pick = thumb || full;
  return pick || null;
}

/**
 * @param {Record<string, unknown>} offer
 * @param {(s: string) => string} esc
 * @param {CustomerBidTranslate | null | undefined} [translate]
 */
export function buildOfferThumbImgHtml(offer, esc, translate = null) {
  const { thumb, full } = getOfferPhotoDisplayUrls(offer);
  const unavailable = cbrT(translate, "customer.bid_results.photo.unavailable", "Photo unavailable");
  if (!thumb && !full) {
    return `<div class="lhai-cbr-card__thumb-placeholder" aria-hidden="true"><span>${esc(unavailable)}</span></div>`;
  }
  const src = esc(thumb || full);
  const fallback =
    thumb && full && thumb !== full ? ` data-cbr-photo-fallback="${esc(full)}"` : "";
  return `<img class="lhai-cbr-card__thumb-img" src="${src}" alt="" loading="lazy"${fallback} />`;
}

/**
 * img error: thumbnail → original → placeholder.
 * @param {ParentNode} [root]
 * @param {CustomerBidTranslate | null | undefined} [translate]
 */
export function wireOfferPhotoImgFallbacks(root = document, translate = null) {
  const scope = root instanceof Document ? root : root;
  if (!scope || typeof scope.querySelectorAll !== "function") return;
  const unavailable = escHtmlForPlaceholder(
    cbrT(translate, "customer.bid_results.photo.unavailable", "Photo unavailable"),
  );
  const placeholder = `<div class="lhai-cbr-card__thumb-placeholder" aria-hidden="true"><span>${unavailable}</span></div>`;
  scope.querySelectorAll(".lhai-cbr-card__thumb-img").forEach((node) => {
    if (!(node instanceof HTMLImageElement) || node.dataset.cbrPhotoWired === "1") return;
    node.dataset.cbrPhotoWired = "1";
    node.addEventListener("error", () => {
      const fb = node.getAttribute("data-cbr-photo-fallback");
      if (fb && node.dataset.cbrPhotoFallbackStage !== "full") {
        node.dataset.cbrPhotoFallbackStage = "full";
        node.src = fb;
        return;
      }
      const host =
        node.closest(".lhai-cbr-card__thumb") ||
        node.closest(".lhai-cbr-card__media");
      if (host instanceof HTMLElement) {
        host.innerHTML = placeholder;
      }
    });
  });
}

function escHtmlForPlaceholder(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** @param {Record<string, unknown>} offer @param {string} [activeSort] @param {CustomerBidTranslate | null | undefined} [translate] */
export function formatOfferRankBadge(offer, activeSort, translate = null) {
  const rank = Number(offer.rank);
  if (!Number.isFinite(rank) || rank <= 0) return "";
  const total = Number(offer.rank_total);
  const basis = String(offer.rank_basis || activeSort || "recommended").trim();
  const row =
    /** @type {Record<string, { i18nKey: string, fallback: string }>} */ (RANK_BASIS_I18N)[basis] ||
    { i18nKey: "customer.bid_results.rank.default_basis", fallback: "Ranked" };
  const label = cbrT(translate, row.i18nKey, row.fallback);
  if (Number.isFinite(total) && total > 0) {
    return cbrT(translate, "customer.bid_results.rank.of_total", "{basis} #{rank} of {total}", {
      basis: label,
      rank,
      total,
    });
  }
  return cbrT(translate, "customer.bid_results.rank.only", "{basis} #{rank}", { basis: label, rank });
}

/** English rank label for vehicle cards — delegates to i18n-aware formatter. */
export function formatOfferRankBadgeEn(offer, activeSort) {
  return formatOfferRankBadge(offer, activeSort);
}

/** @param {Record<string, unknown>} offer */
export function isVehicleOffer(offer) {
  if (!offer || typeof offer !== "object") return false;
  const cat = String(offer.product_category || "").trim().toLowerCase();
  if (cat === "vehicle") return true;
  if (offer.vehicle && typeof offer.vehicle === "object") return true;
  const attrs = offer.attributes;
  if (attrs && typeof attrs === "object") {
    if (attrs.make || attrs.model || attrs.year != null) return true;
  }
  return false;
}

/** @param {Record<string, unknown>} offer */
export function resolveVehicleFromOffer(offer) {
  const v =
    offer.vehicle && typeof offer.vehicle === "object"
      ? /** @type {Record<string, unknown>} */ (offer.vehicle)
      : {};
  const attrs =
    offer.attributes && typeof offer.attributes === "object"
      ? /** @type {Record<string, unknown>} */ (offer.attributes)
      : {};
  return {
    year: v.year ?? attrs.year,
    make: v.make ?? attrs.make,
    model: v.model ?? attrs.model,
    trim: v.trim ?? attrs.trim,
    mileage: v.mileage ?? attrs.mileage,
    title_status: v.title_status ?? attrs.title_status,
    accident_history: v.accident_history ?? attrs.accident_history,
    condition: v.condition ?? attrs.condition ?? attrs.vehicle_condition,
    color: v.color ?? attrs.color ?? attrs.exterior_color,
    location:
      String(offer.location || v.location || attrs.location || "").trim() || null,
  };
}

/** @param {Record<string, unknown>} offer */
export function offerAvailabilityLabel(offer) {
  const direct = String(offer.available_timeline || "").trim();
  if (direct) return direct;
  const svc =
    offer.service && typeof offer.service === "object"
      ? /** @type {Record<string, unknown>} */ (offer.service)
      : {};
  return String(svc.available_timeline || "").trim() || "";
}

/** @param {Record<string, unknown>} offer @param {CustomerBidTranslate | null | undefined} [translate] */
export function formatVehiclePriceBreakdownLines(offer, translate = null) {
  const p =
    offer.pricing && typeof offer.pricing === "object"
      ? /** @type {Record<string, unknown>} */ (offer.pricing)
      : {};
  const attrs =
    offer.attributes && typeof offer.attributes === "object"
      ? /** @type {Record<string, unknown>} */ (offer.attributes)
      : {};
  const cur = String(p.currency || offer.currency || "USD");
  /** @type {Array<{ label: string, value: string, strong?: boolean }>} */
  const lines = [];
  const vehiclePrice = p.vehicle_price ?? attrs.vehicle_price ?? offer.price_amount;
  if (vehiclePrice != null && vehiclePrice !== "") {
    lines.push({
      label: cbrT(translate, PRICE_BREAKDOWN_I18N.vehicle_price.i18nKey, PRICE_BREAKDOWN_I18N.vehicle_price.fallback),
      value: formatMoney(vehiclePrice, cur),
    });
  }
  const tax =
    p.estimated_tax_registration ??
    p.estimated_tax_fees ??
    attrs.estimated_tax_fees ??
    attrs.estimated_tax_registration;
  if (tax != null && tax !== "") {
    lines.push({
      label: cbrT(translate, PRICE_BREAKDOWN_I18N.tax_fees.i18nKey, PRICE_BREAKDOWN_I18N.tax_fees.fallback),
      value: formatMoney(tax, cur),
    });
  }
  const dealer = p.dealer_fee ?? attrs.dealer_fee;
  if (dealer != null && dealer !== "") {
    lines.push({
      label: cbrT(translate, PRICE_BREAKDOWN_I18N.dealer_fee.i18nKey, PRICE_BREAKDOWN_I18N.dealer_fee.fallback),
      value: formatMoney(dealer, cur),
    });
  }
  const partnerFee = p.partner_service_fee ?? attrs.partner_service_fee;
  if (partnerFee != null && partnerFee !== "") {
    lines.push({
      label: cbrT(
        translate,
        PRICE_BREAKDOWN_I18N.partner_service_fee.i18nKey,
        PRICE_BREAKDOWN_I18N.partner_service_fee.fallback,
      ),
      value: formatMoney(partnerFee, cur),
    });
  }
  const delivery = p.delivery_fee ?? attrs.delivery_fee;
  if (delivery != null && delivery !== "") {
    lines.push({
      label: cbrT(translate, PRICE_BREAKDOWN_I18N.delivery_fee.i18nKey, PRICE_BREAKDOWN_I18N.delivery_fee.fallback),
      value: formatMoney(delivery, cur),
    });
  }
  const total = p.estimated_total ?? offer.estimated_total;
  if (total != null && total !== "") {
    lines.push({
      label: cbrT(
        translate,
        PRICE_BREAKDOWN_I18N.estimated_total.i18nKey,
        PRICE_BREAKDOWN_I18N.estimated_total.fallback,
      ),
      value: formatMoney(total, cur),
      strong: true,
    });
  }
  if (!lines.length) {
    return formatOfferPriceBreakdownLines(offer, translate);
  }
  return lines;
}

/** @param {Record<string, unknown>} offer */
export function collectOfferPhotos(offer) {
  const photos = Array.isArray(offer.photos) ? offer.photos : [];
  return photos
    .map((p, i) => {
      const row = p && typeof p === "object" ? /** @type {Record<string, unknown>} */ (p) : {};
      const url = String(row.url || "").trim();
      const thumb = String(row.thumbnail_url || url).trim();
      if (!url && !thumb) return null;
      const resolvedUrl = resolveOfferMediaUrl(url || thumb);
      const resolvedThumb = resolveOfferMediaUrl(thumb || url);
      return {
        url: resolvedUrl || resolvedThumb,
        thumbnail_url: resolvedThumb || resolvedUrl,
        caption: String(row.caption || "").trim(),
        is_primary: Boolean(row.is_primary) || i === 0,
        sort_order: i,
      };
    })
    .filter(Boolean)
    .sort((a, b) => {
      if (a.is_primary && !b.is_primary) return -1;
      if (!a.is_primary && b.is_primary) return 1;
      return (a.sort_order ?? 0) - (b.sort_order ?? 0);
    });
}

/**
 * @param {'OPEN'|'EXPIRED'|'CUSTOMER_SELECTED'|'CLOSED'} phase
 * @param {Record<string, unknown>} offer
 * @param {{ selectedBidId?: string, selectedOfferId?: string, snap?: Record<string, unknown> | null }} ctx
 */
export function offerSelectionUiState(phase, offer, ctx) {
  const bidId = String(offer.bid_id || "").trim();
  const offerId = String(offer.offer_id || "").trim();
  const translate = ctx.translate ?? null;
  const canSelectGlobal = canSelectCustomerBid(phase, ctx.snap);
  const isSelected =
    phase === "CUSTOMER_SELECTED" &&
    Boolean(ctx.selectedBidId) &&
    bidId === String(ctx.selectedBidId || "").trim() &&
    (!ctx.selectedOfferId ||
      !offerId ||
      offerId === String(ctx.selectedOfferId || "").trim());
  const showSelectButton = canSelectGlobal && phase !== "CUSTOMER_SELECTED";
  const selectDisabled = !canSelectGlobal;
  const dimmed = phase === "CUSTOMER_SELECTED" && !isSelected;
  return {
    isSelected,
    showSelectButton,
    selectDisabled,
    dimmed,
    selectLabel: isSelected
      ? cbrT(translate, "customer.bid_results.selection.yours", "Your selection")
      : cbrT(translate, "customer.bid_results.action.select_offer", "Select this offer"),
  };
}

/**
 * @param {Record<string, unknown>} offer
 * @param {{
 *   phase: string,
 *   activeSort: string,
 *   recentUpdatedAt?: string | null,
 *   snap?: Record<string, unknown> | null,
 *   selectedBidId?: string,
 *   selectedOfferId?: string,
 *   translate?: CustomerBidTranslate | null,
 * }} ctx
 * @param {(s: string) => string} esc
 */
export function buildVehicleOfferCardHtml(offer, ctx, esc) {
  const translate = ctx.translate ?? null;
  const bidId = String(offer.bid_id || "").trim();
  const offerId = String(offer.offer_id || "").trim();
  const cur = String(offer.currency || "USD");
  const photos = collectOfferPhotos(offer);
  const veh = resolveVehicleFromOffer(offer);
  const rankBadge = formatOfferRankBadge(offer, ctx.activeSort, translate);
  const sel = offerSelectionUiState(ctx.phase, offer, {
    selectedBidId: ctx.selectedBidId,
    selectedOfferId: ctx.selectedOfferId,
    snap: ctx.snap,
    translate,
  });
  const phase = ctx.phase;
  const showExpiredBadge = phase === "EXPIRED";
  const relation = formatOfferRelationLabel(offer, translate);
  const updatedBadge = offerShowsUpdatedBadge(offer.updated_at, ctx.recentUpdatedAt)
    ? `<span class="lhai-cbr-badge lhai-cbr-badge--updated">${esc(
        cbrT(translate, "customer.bid_results.badge.updated", "Updated"),
      )}</span>`
    : "";
  const altBadge = offer.is_alternative
    ? `<span class="lhai-cbr-badge lhai-cbr-badge--alt">${esc(
        cbrT(translate, "customer.bid_results.tab.alternatives", "Alternative offers"),
      )}</span>`
    : "";
  const expiredBadge = showExpiredBadge
    ? `<span class="lhai-cbr-badge lhai-cbr-badge--expired">${esc(
        cbrT(translate, "customer.bid_results.badge.expired_availability", EXPIRED_AVAILABILITY_BADGE),
      )}</span>`
    : "";
  const selectedBadge = sel.isSelected
    ? `<span class="lhai-cbr-badge lhai-cbr-badge--selected">${esc(sel.selectLabel)}</span>`
    : "";
  const breakdown = formatVehiclePriceBreakdownLines(offer, translate);
  const breakdownId = `cbr-price-${esc(offerId || bidId)}`;
  const breakdownRows = breakdown
    .map((line) => {
      const cls = line.strong ? " lhai-cbr-card__price-row--strong" : "";
      return `<li class="lhai-cbr-card__price-row${cls}"><span>${esc(line.label)}</span><span>${esc(line.value)}</span></li>`;
    })
    .join("");
  const mileage =
    veh.mileage != null && veh.mileage !== ""
      ? `${Number(veh.mileage).toLocaleString()} mi`
      : "—";
  const titleStatus = offerDisplayTitleStatus(offer, translate) || "—";
  const accident = offerDisplayAccidentHistory(offer, translate) || "—";
  const location = veh.location || "—";
  const availability = offerDisplayAvailability(offer) || "—";
  const msg = offerDisplayPartnerMessage(offer, translate, { placeholderOnFailure: true });
  const msgPreview = msg
    ? esc(msg.slice(0, 160)).replace(/\n/g, "<br />") + (msg.length > 160 ? "…" : "")
    : "—";
  const thumbHtml = buildOfferThumbImgHtml(offer, esc, translate);
  const photoCount =
    photos.length > 1
      ? `<span class="lhai-cbr-card__photo-count">${esc(
          cbrT(translate, "customer.bid_results.photo.count", "{count} photos", { count: photos.length }),
        )}</span>`
      : "";
  const selectBtn = sel.showSelectButton
    ? `<button type="button" class="lhai-button lhai-button--primary" data-cbr-select="${esc(bidId)}" data-cbr-offer="${esc(offerId)}"${sel.selectDisabled ? " disabled" : ""}>${esc(sel.selectLabel)}</button>`
    : "";
  const cardClasses = [
    "lhai-cbr-card",
    "lhai-cbr-card--vehicle",
    sel.isSelected ? "lhai-cbr-card--selected" : "",
    sel.dimmed ? "lhai-cbr-card--dimmed" : "",
  ]
    .filter(Boolean)
    .join(" ");
  const mileageLabel = cbrT(translate, "customer.bid_results.card.mileage", "Mileage");
  const titleLabel = cbrT(translate, "customer.bid_results.card.title_status", "Title");
  const accidentLabelText = cbrT(translate, "customer.bid_results.card.accident", "Accident");
  const locationLabel = cbrT(translate, "customer.bid_results.card.location", "Location");
  const availabilityLabel = cbrT(translate, "customer.bid_results.card.availability", "Availability");
  const partnerMessageLabel = cbrT(translate, "customer.bid_results.card.partner_message", "Partner message");
  const viewDetailsLabel = cbrT(translate, "customer.bid_results.action.view_details", "View details");
  const priceBreakdownLabel = cbrT(translate, "customer.bid_results.card.price_breakdown", "Price breakdown");

  return `
    <article class="${cardClasses}" data-offer-id="${esc(offerId)}" data-bid-id="${esc(bidId)}">
      <div class="lhai-cbr-card__media">
        <div class="lhai-cbr-card__thumb">${thumbHtml}${photoCount}</div>
      </div>
      <div class="lhai-cbr-card__body">
        <div class="lhai-cbr-card__badges">
          ${rankBadge ? `<span class="lhai-cbr-badge lhai-cbr-badge--rank">${esc(rankBadge)}</span>` : ""}
          ${selectedBadge}
          ${expiredBadge}
          ${updatedBadge}
          ${altBadge}
          ${relation ? `<span class="lhai-cbr-badge lhai-cbr-badge--match">${esc(relation)}</span>` : ""}
        </div>
        <h3 class="lhai-cbr-card__title">${esc(formatOfferTitle(offer, translate))}</h3>
        <p class="lhai-cbr-card__partner">${esc(formatOfferPartnerName(offer, translate))}</p>
        <p class="lhai-cbr-card__total">${esc(formatMoney(offer.estimated_total, cur))}</p>
        ${
          breakdown.length
            ? `<details class="lhai-cbr-card__price-details">
          <summary>${esc(priceBreakdownLabel)}</summary>
          <ul class="lhai-cbr-card__price-list" id="${breakdownId}">${breakdownRows}</ul>
        </details>`
            : ""
        }
        <dl class="lhai-cbr-card__specs">
          <div><dt>${esc(mileageLabel)}</dt><dd>${esc(mileage)}</dd></div>
          <div><dt>${esc(titleLabel)}</dt><dd>${esc(titleStatus)}</dd></div>
          <div><dt>${esc(accidentLabelText)}</dt><dd>${esc(accident)}</dd></div>
          <div><dt>${esc(locationLabel)}</dt><dd>${esc(location)}</dd></div>
          <div class="lhai-cbr-card__specs--wide"><dt>${esc(availabilityLabel)}</dt><dd>${esc(availability)}</dd></div>
        </dl>
        <div class="lhai-cbr-card__preview">
          <span class="lhai-cbr-card__preview-label">${esc(partnerMessageLabel)}</span>
          <p>${msgPreview}</p>
        </div>
        <div class="lhai-cbr-card__actions">
          <button type="button" class="lhai-button lhai-button--secondary" data-cbr-detail="${esc(offerId)}">${esc(viewDetailsLabel)}</button>
          ${selectBtn}
        </div>
      </div>
    </article>`;
}

/**
 * @param {Record<string, unknown>} offer
 * @param {{
 *   phase: string,
 *   activeSort: string,
 *   snap?: Record<string, unknown> | null,
 *   selectedBidId?: string,
 *   selectedOfferId?: string,
 *   translate?: CustomerBidTranslate | null,
 * }} ctx
 * @param {(s: string) => string} esc
 */
export function buildVehicleOfferDetailModalHtml(offer, ctx, esc) {
  const translate = ctx.translate ?? null;
  const cur = String(offer.currency || "USD");
  const photos = collectOfferPhotos(offer);
  const veh = resolveVehicleFromOffer(offer);
  const rankBadge = formatOfferRankBadge(offer, ctx.activeSort, translate);
  const sel = offerSelectionUiState(ctx.phase, offer, {
    selectedBidId: ctx.selectedBidId,
    selectedOfferId: ctx.selectedOfferId,
    snap: ctx.snap,
    translate,
  });
  const breakdown = formatVehiclePriceBreakdownLines(offer, translate);
  const attrs = formatAttributesList(offer.attributes);
  const vehAttrs = [
    [cbrT(translate, "customer.bid_results.modal.year", "Year"), veh.year],
    [cbrT(translate, "customer.bid_results.modal.make", "Make"), veh.make],
    [cbrT(translate, "customer.bid_results.modal.model", "Model"), veh.model],
    [cbrT(translate, "customer.bid_results.modal.trim", "Trim"), veh.trim],
    [
      cbrT(translate, "customer.bid_results.card.mileage", "Mileage"),
      veh.mileage != null ? `${Number(veh.mileage).toLocaleString()} mi` : "",
    ],
    [cbrT(translate, "customer.bid_results.modal.condition", "Condition"), offerDisplayVehicleCondition(offer, translate)],
    [cbrT(translate, "customer.bid_results.card.title_status", "Title"), offerDisplayTitleStatus(offer, translate)],
    [
      cbrT(translate, "customer.bid_results.modal.accident_history", "Accident history"),
      offerDisplayAccidentHistory(offer, translate),
    ],
    [cbrT(translate, "customer.bid_results.modal.color", "Color"), veh.color],
    [cbrT(translate, "customer.bid_results.card.location", "Location"), veh.location],
  ].filter(([, v]) => v != null && String(v).trim() !== "");
  const seenKeys = new Set(vehAttrs.map(([k]) => k.toLowerCase()));
  for (const a of attrs) {
    const key = String(a.key || "").trim();
    if (!key || seenKeys.has(key.toLowerCase())) continue;
    vehAttrs.push([key, a.value]);
  }
  const attrsHtml = vehAttrs.length
    ? `<dl class="lhai-cbr-dl lhai-cbr-dl--vehicle">${vehAttrs
        .map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(String(v))}</dd></div>`)
        .join("")}</dl>`
    : `<p class="u-text-muted">—</p>`;
  const primary = photos[0];
  const mainUrl = primary ? esc(primary.url) : "";
  const galleryId = `cbr-gallery-${esc(String(offer.offer_id || "x"))}`;
  const thumbsHtml = photos.length
    ? `<div class="lhai-cbr-modal__gallery-thumbs" role="list">${photos
        .map((p, i) => {
          const u = esc(p.thumbnail_url || p.url);
          const active = i === 0 ? " is-active" : "";
          return `<button type="button" class="lhai-cbr-modal__gallery-thumb${active}" role="listitem" data-cbr-gallery-url="${esc(p.url)}" aria-label="Photo ${i + 1}">
            <img src="${u}" alt="" loading="lazy" />
          </button>`;
        })
        .join("")}</div>`
    : "";
  const galleryHtml = photos.length
    ? `<div class="lhai-cbr-modal__gallery" id="${galleryId}" data-cbr-gallery>
        <div class="lhai-cbr-modal__gallery-main">
          <img src="${mainUrl}" alt="" loading="lazy" data-cbr-gallery-main />
        </div>
        ${thumbsHtml}
      </div>`
    : `<p class="u-text-muted">${esc(cbrT(translate, "customer.bid_results.modal.no_photos", "No photos submitted."))}</p>`;
  const breakdownHtml = breakdown.length
    ? `<ul class="lhai-cbr-modal__price-list">${breakdown
        .map(
          (line) =>
            `<li class="${line.strong ? "lhai-cbr-modal__price-line--strong" : ""}"><span>${esc(line.label)}</span><span>${esc(line.value)}</span></li>`,
        )
        .join("")}</ul>`
    : `<p class="u-text-muted">—</p>`;
  const expiredNote =
    ctx.phase === "EXPIRED"
      ? `<p class="lhai-cbr-modal__expired-note" role="status">${esc(
          cbrT(translate, "customer.bid_results.badge.expired_availability", EXPIRED_AVAILABILITY_BADGE),
        )}</p>`
      : "";
  const includedServices = offerDisplayIncludedServices(offer);
  const includedHtml = includedServices.length
    ? `<ul class="lhai-cbr-modal__included">${includedServices.map((s) => `<li>${esc(s)}</li>`).join("")}</ul>`
    : `<p class="u-text-muted">—</p>`;
  const vehicleDetailsLabel = cbrT(translate, "customer.bid_results.modal.vehicle_details", "Vehicle details");
  const includedLabel = cbrT(translate, "customer.bid_results.modal.included_services", "Included services");
  const priceBreakdownLabel = cbrT(translate, "customer.bid_results.card.price_breakdown", "Price breakdown");
  const estimatedTotalLabel = cbrT(
    translate,
    "customer.bid_results.modal.estimated_total",
    "Estimated total: {total}",
    { total: formatMoney(offer.estimated_total, cur) },
  );
  const availabilityLabel = cbrT(translate, "customer.bid_results.card.availability", "Availability");
  const partnerMessageLabel = cbrT(translate, "customer.bid_results.card.partner_message", "Partner message");
  const modalNotice = cbrT(
    translate,
    "customer.bid_results.modal.vehicle_notice",
    "Confirm price and availability with the partner in messages after you select an offer.",
  );

  return `
    ${expiredNote}
    <div class="lhai-cbr-modal__head">
      <h3 class="lhai-cbr-modal__title">${esc(formatOfferTitle(offer, translate))}</h3>
      <p class="lhai-cbr-modal__partner">${esc(formatOfferPartnerName(offer, translate))}</p>
      ${rankBadge ? `<p class="lhai-cbr-modal__rank"><span class="lhai-cbr-badge lhai-cbr-badge--rank">${esc(rankBadge)}</span></p>` : ""}
    </div>
    ${galleryHtml}
    <section class="lhai-cbr-modal__section">
      <h4>${esc(vehicleDetailsLabel)}</h4>
      ${attrsHtml}
    </section>
    <section class="lhai-cbr-modal__section">
      <h4>${esc(priceBreakdownLabel)}</h4>
      <p class="lhai-cbr-modal__total-line">${esc(estimatedTotalLabel)}</p>
      ${breakdownHtml}
    </section>
    <section class="lhai-cbr-modal__section">
      <h4>${esc(availabilityLabel)}</h4>
      <p>${esc(offerDisplayAvailability(offer) || "—")}</p>
    </section>
    <section class="lhai-cbr-modal__section">
      <h4>${esc(includedLabel)}</h4>
      ${includedHtml}
    </section>
    <section class="lhai-cbr-modal__section">
      <h4>${esc(partnerMessageLabel)}</h4>
      <p class="lhai-cbr-modal__message">${esc(offerDisplayPartnerMessage(offer, translate, { placeholderOnFailure: true }) || "—").replace(/\n/g, "<br />")}</p>
    </section>
    <p class="lhai-cbr-modal__notice u-text-muted">${esc(modalNotice)}</p>
    <div class="lhai-cbr-modal__select-hint" data-cbr-modal-can-select="${sel.showSelectButton && !sel.selectDisabled ? "1" : "0"}"></div>`;
}

/** @param {Record<string, unknown>} offer @param {CustomerBidTranslate | null | undefined} [translate] */
export function formatOfferPartnerName(offer, translate = null) {
  return (
    String(offer.partner_name || offer.partner_display_name || "").trim() ||
    cbrT(translate, "customer.bid_results.partner.default_name", "Partner")
  );
}

/** @param {Record<string, unknown>} offer @param {CustomerBidTranslate | null | undefined} [translate] */
export function formatOfferPriceBreakdownLines(offer, translate = null) {
  const cur = String(offer.currency || "USD");
  const lines = [];
  if (offer.price_amount != null && offer.price_amount !== "") {
    lines.push({
      label: cbrT(translate, "customer.bid_results.price.product", "Product price"),
      value: formatMoney(offer.price_amount, cur),
    });
  }
  if (offer.fees != null && offer.fees !== "") {
    lines.push({
      label: cbrT(translate, "customer.bid_results.price.fees", "Fees"),
      value: formatMoney(offer.fees, cur),
    });
  }
  if (offer.estimated_total != null && offer.estimated_total !== "") {
    lines.push({
      label: cbrT(translate, "customer.bid_results.price.estimated_total", "Estimated total"),
      value: formatMoney(offer.estimated_total, cur),
      strong: true,
    });
  }
  const legacy = offerPricingSummaryLines(offer, translate);
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
 * @param {CustomerBidTranslate | null | undefined} [translate]
 * @returns {Array<{ key: string, label: string, requestIndex: number | null }>}
 */
export function buildCustomerBidRequestTabs(vehicleRequests, translate = null) {
  const tabs = [
    {
      key: "all",
      label: cbrT(translate, "customer.bid_results.tab.all_offers", "All offers"),
      requestIndex: null,
    },
  ];
  const reqs = Array.isArray(vehicleRequests) ? vehicleRequests : [];
  if (!reqs.length) return tabs;
  const indices = new Set();
  for (const r of reqs) {
    if (!r || typeof r !== "object") continue;
    const idx = optionalInt(r.request_index);
    if (idx != null) indices.add(idx);
  }
  [...indices].sort((a, b) => a - b).forEach((idx) => {
    const label = requestTabLabel(reqs, idx, translate);
    tabs.push({ key: `req-${idx}`, label, requestIndex: idx });
  });
  tabs.push({
    key: "alternatives",
    label: cbrT(translate, "customer.bid_results.tab.alternatives", "Alternative offers"),
    requestIndex: null,
  });
  return tabs;
}

function requestTabLabel(reqs, idx, translate = null) {
  const row = reqs.find((r) => optionalInt(r?.request_index) === idx);
  if (row && typeof row === "object") {
    const make = String(row.make || "").trim();
    const model = String(row.model || "").trim();
    if (make || model) {
      return cbrT(
        translate,
        "customer.bid_results.tab.request_vehicle",
        "Request {index} · {vehicle}",
        { index: idx, vehicle: [make, model].filter(Boolean).join(" ") },
      );
    }
  }
  return cbrT(translate, "customer.bid_results.tab.request_n", "Request {index}", { index: idx });
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

/** @param {Record<string, unknown>} offer @param {CustomerBidTranslate | null | undefined} [translate] */
export function formatOfferVehicleTitle(offer, translate = null) {
  const v = offer.vehicle && typeof offer.vehicle === "object" ? offer.vehicle : {};
  const parts = [v.year, v.make, v.model, v.trim]
    .map((x) => (x == null ? "" : String(x).trim()))
    .filter(Boolean);
  return parts.length ? parts.join(" ") : cbrT(translate, "customer.bid_results.offer.default_title", "Offer");
}

/** @param {Record<string, unknown>} offer @param {CustomerBidTranslate | null | undefined} [translate] */
export function formatOfferVehicleStatusLine(offer, translate = null) {
  const v = offer.vehicle && typeof offer.vehicle === "object" ? offer.vehicle : {};
  const cond = offerDisplayVehicleCondition(offer, translate);
  const mileage = v.mileage != null && v.mileage !== "" ? `${Number(v.mileage).toLocaleString()} mi` : "";
  const title = offerDisplayTitleStatus(offer, translate);
  const accident = offerDisplayAccidentHistory(offer, translate);
  return [cond, mileage, title, accident].filter(Boolean).join(" · ") || "—";
}

/** @param {string | null | undefined} raw @param {CustomerBidTranslate | null | undefined} [translate] */
export function conditionLabel(raw, translate = null) {
  const u = String(raw || "").trim().toUpperCase();
  if (u === "NEW") return cbrT(translate, "customer.bid_results.vehicle.condition.new", "New");
  if (u === "USED") return cbrT(translate, "customer.bid_results.vehicle.condition.used", "Used");
  return String(raw || "").trim() || "";
}

/** @param {string | null | undefined} raw @param {CustomerBidTranslate | null | undefined} [translate] */
export function titleStatusLabel(raw, translate = null) {
  const u = String(raw || "").trim().toUpperCase();
  if (u === "CLEAN") return cbrT(translate, "customer.bid_results.vehicle.title.clean", "Clean title");
  return String(raw || "").trim() || "";
}

/** @param {string | null | undefined} raw @param {CustomerBidTranslate | null | undefined} [translate] */
export function accidentLabel(raw, translate = null) {
  const s = String(raw || "").trim();
  const low = s.toLowerCase();
  const u = s.toUpperCase();
  if (u === "NONE" || u === "NO" || low === "no accident reported") {
    return cbrT(translate, "customer.bid_results.vehicle.accident.none", "No accident history");
  }
  if (low.includes("minor accident")) {
    return cbrT(translate, "customer.bid_results.vehicle.accident.minor", "Minor accident reported");
  }
  if (low.includes("major accident")) {
    return cbrT(translate, "customer.bid_results.vehicle.accident.major", "Major accident reported");
  }
  if (u === "YES" || u === "REPORTED" || s === "Accident reported") {
    return cbrT(translate, "customer.bid_results.vehicle.accident.reported", "Accident reported");
  }
  return s || "";
}

/** @param {Record<string, unknown>} offer @param {CustomerBidTranslate | null | undefined} [translate] */
export function formatOfferRelationLabel(offer, translate = null) {
  if (offer.is_alternative) {
    return cbrT(translate, "customer.bid_results.relation.alternative", "Alternative offer");
  }
  const idx = optionalInt(offer.linked_request_index);
  if (idx != null) {
    return cbrT(translate, "customer.bid_results.relation.linked", "Linked to request {index}", { index: idx });
  }
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

export function formatBudgetDelta(delta, translate = null) {
  if (delta == null || delta === "") return "";
  const n = Number(delta);
  if (Number.isNaN(n)) return "";
  if (n <= 0) {
    return cbrT(translate, "customer.bid_results.budget.under", "{amount} under budget", {
      amount: formatMoney(Math.abs(n)),
    });
  }
  return cbrT(translate, "customer.bid_results.budget.over", "{amount} over budget", {
    amount: formatMoney(n),
  });
}

export function formatCountdownToExpiry(expiresAtIso, nowMs = Date.now(), translate = null) {
  return formatBidDeadlineRemaining(expiresAtIso, nowMs, translate);
}

export function offerShowsUpdatedBadge(offerUpdatedAt, recentUpdatedAt) {
  const o = parseIsoMs(offerUpdatedAt);
  const r = parseIsoMs(recentUpdatedAt);
  if (o == null || r == null) return false;
  return Math.abs(o - r) < 120_000;
}

export function formatQuoteRequestUsage(usage, translate = null) {
  if (!usage || typeof usage !== "object") return "—";
  const used = usage.used_quote_requests ?? usage.used_count ?? usage.used ?? usage.count;
  const max = usage.max_quote_requests ?? usage.max_count ?? usage.max ?? usage.limit;
  const remaining = quoteRequestRemaining(usage);
  if (used == null && max == null) return "—";
  if (remaining != null) {
    return cbrT(
      translate,
      "customer.bid_results.quote.usage",
      "{used} / {max} (remaining {remaining})",
      { used: used ?? "—", max: max ?? "—", remaining },
    );
  }
  return cbrT(translate, "customer.bid_results.quote.usage_short", "{used} / {max}", {
    used: used ?? "—",
    max: max ?? "—",
  });
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
export function canSelectCustomerBid(phase, snap) {
  if (snap && typeof snap === "object") {
    return resolveCustomerBidActions(snap).can_select_existing_offers;
  }
  return phase === "OPEN" || phase === "EXPIRED";
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

/**
 * Customer bid offer comparison page link.
 * 1) service_request_id when present (+ thread_id when also present)
 * 2) thread_id only
 * 3) fallbackHref when both missing (default messages.html)
 *
 * @param {string} [serviceRequestId]
 * @param {string} [threadId]
 * @param {{ fallbackHref?: string }} [options]
 */
export function buildCustomerBidResultsPageHref(serviceRequestId, threadId, options = {}) {
  const fallbackHref = String(options.fallbackHref || "messages.html").trim() || "messages.html";
  const wid = String(serviceRequestId || "").trim();
  const tid = String(threadId || "").trim();

  if (wid) {
    const p = new URLSearchParams();
    p.set("service_request_id", wid);
    if (tid) p.set("thread_id", tid);
    return `customer-bid-results.html?${p.toString()}`;
  }

  if (tid) {
    const p = new URLSearchParams();
    p.set("thread_id", tid);
    return `customer-bid-results.html?${p.toString()}`;
  }

  return fallbackHref;
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

export function offerPricingSummaryLines(offer, translate = null) {
  const p = offer.pricing && typeof offer.pricing === "object" ? offer.pricing : {};
  const cur = String(p.currency || offer.currency || "USD");
  const lines = [];
  if (p.vehicle_price != null) {
    lines.push(
      cbrT(translate, "customer.bid_results.price.vehicle", "Vehicle {amount}", {
        amount: formatMoney(p.vehicle_price, cur),
      }),
    );
  }
  if (p.estimated_tax_registration != null) {
    lines.push(
      cbrT(translate, "customer.bid_results.price.tax_registration", "Tax & registration {amount}", {
        amount: formatMoney(p.estimated_tax_registration, cur),
      }),
    );
  }
  if (p.dealer_fee != null) {
    lines.push(
      cbrT(translate, "customer.bid_results.price.dealer_fee", "Dealer fee {amount}", {
        amount: formatMoney(p.dealer_fee, cur),
      }),
    );
  }
  if (p.partner_service_fee != null) {
    lines.push(
      cbrT(translate, "customer.bid_results.price.partner_fee", "Partner fee {amount}", {
        amount: formatMoney(p.partner_service_fee, cur),
      }),
    );
  }
  if (p.delivery_fee != null) {
    lines.push(
      cbrT(translate, "customer.bid_results.price.delivery", "Delivery {amount}", {
        amount: formatMoney(p.delivery_fee, cur),
      }),
    );
  }
  return lines;
}

export function offerMatchScoreLabel(offer, translate = null) {
  const m = offer.match && typeof offer.match === "object" ? offer.match : {};
  const score = Number(m.match_score);
  const matchedText = formatMatchCodesList(offer, translate, { useWarnings: false, limit: 3 });
  if (matchedText.length) return matchedText.join(" · ");
  if (Number.isFinite(score) && score > 0) {
    return cbrT(translate, "customer.bid_results.match.score", "Match score {percent}%", {
      percent: Math.round(score),
    });
  }
  const warningsText = formatMatchCodesList(offer, translate, { useWarnings: true, limit: 2 });
  if (warningsText.length) return warningsText.join(" · ");
  return "";
}

/** @param {'OPEN'|'EXPIRED'|'CUSTOMER_SELECTED'} phase @param {number} offerCount @param {CustomerBidTranslate | null | undefined} [translate] */
export function emptyOffersMessage(phase, offerCount, translate = null) {
  if (offerCount > 0) {
    return cbrT(
      translate,
      "customer.bid_results.empty.no_match",
      "No offers match your filters. Try adjusting your filters.",
    );
  }
  if (phase === "EXPIRED") {
    return cbrT(
      translate,
      "customer.bid_results.empty.no_submissions",
      "No offers were submitted. You can request a new bidding round.",
    );
  }
  return cbrT(
    translate,
    "customer.bid_results.empty.waiting",
    "Partners are preparing offers. Please check back soon.",
  );
}

/** @param {Record<string, unknown>} attrs */
export function formatAttributesList(attrs) {
  if (!attrs || typeof attrs !== "object") return [];
  return Object.entries(attrs)
    .filter(([, v]) => v != null && String(v).trim() !== "")
    .map(([k, v]) => ({ key: k, value: String(v) }));
}
