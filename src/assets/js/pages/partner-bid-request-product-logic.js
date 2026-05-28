/**
 * Generic PRODUCT_OFFER partner bid — pure helpers (unit-testable).
 */

import { formatBidDeadlineRemaining, isBidDeadlinePassed } from "../core/bid-deadline-display.js";

export const PRODUCT_OFFER_BID_TYPE = "PRODUCT_OFFER";

const SORT_BASIS_LABEL = {
  recommended: "추천순",
  lowest_total: "총액 낮은순",
  recently_updated: "최근 업데이트순",
  fastest_timeline: "빠른 진행순",
  photo_first: "사진 있는 순",
  newest_year: "연식 최신순",
  lowest_mileage: "주행거리 낮은순",
  lowest_fees: "수수료 낮은순",
};

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
    throw new Error("attributes JSON 형식이 올바르지 않습니다.");
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("attributes는 JSON 객체여야 합니다.");
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
 */
export function validateProductOffersForSubmit(offers, cfg) {
  const requirePhotos = cfg.requiresOfferPhotos === true;
  if (!offers.length) return "최소 1개의 제안을 추가해 주세요.";
  for (let i = 0; i < offers.length; i += 1) {
    const o = offers[i];
    const n = i + 1;
    const title = String(o.title || "").trim();
    if (!title) return `제안 ${n}: 상품명(title)을 입력해 주세요.`;
    const total = Number(String(o.estimated_total || "").replace(/,/g, ""));
    if (!Number.isFinite(total) || total <= 0) return `제안 ${n}: 예상 총액(estimated_total)을 입력해 주세요.`;
    const pa = String(o.price_amount ?? "").trim();
    if (pa) {
      const nPa = Number(pa.replace(/,/g, ""));
      if (!Number.isFinite(nPa) || nPa < 0) return `제안 ${n}: price_amount 형식이 올바르지 않습니다.`;
    }
    const fees = String(o.fees ?? "").trim();
    if (fees) {
      const nFees = Number(fees.replace(/,/g, ""));
      if (!Number.isFinite(nFees) || nFees < 0) return `제안 ${n}: fees 형식이 올바르지 않습니다.`;
    }
    try {
      parseAttributesJson(String(o.attributes_json || ""));
    } catch (e) {
      return `제안 ${n}: ${e instanceof Error ? e.message : "attributes 오류"}`;
    }
    const photos = Array.isArray(o.photos) ? o.photos : [];
    let hasPhoto = Boolean(String(o.thumbnail_url || "").trim());
    for (const p of photos) {
      const row = p && typeof p === "object" ? p : {};
      if (String(row.url || "").trim() || String(row.thumbnail_url || "").trim()) hasPhoto = true;
      if (String(row.url || "").trim() && !/^https?:\/\//i.test(String(row.url).trim())) {
        return `제안 ${n}: 사진 URL은 http(s)로 시작해야 합니다.`;
      }
    }
    if (requirePhotos && !hasPhoto) {
      return `제안 ${n}: 최소 1장의 사진이 필요합니다.`;
    }
  }
  return "";
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

/** @param {Record<string, unknown>|null|undefined} summary @param {{ prefix?: string }} [opts] */
export function formatRankSummaryLabel(summary, opts = {}) {
  if (!summary || typeof summary !== "object") return "";
  const prefix = String(opts.prefix || "내 제안 현재 순위").trim();
  const labelKo = String(summary.label_ko || "").trim();
  if (labelKo) return `${prefix}: ${labelKo}`;
  const rank = summary.best_rank ?? summary.partner_best_rank;
  const total = summary.total_offers;
  const basis = String(summary.basis || summary.sort_basis || "recommended").trim();
  const basisLabel = SORT_BASIS_LABEL[basis] || "추천순";
  if (rank != null && total != null) {
    return `${prefix}: ${basisLabel} 기준 ${rank}위 / ${total}개`;
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

/** @param {string} bidStatus @param {string} requestStatus */
export function partnerBidStatusLabel(bidStatus, requestStatus) {
  const rs = String(requestStatus || "").trim().toUpperCase();
  if (rs === "CUSTOMER_SELECTED") return "고객 선택 완료";
  if (rs === "EXPIRED") return "비딩 종료 (기한 만료)";
  if (rs === "CANCELLED") return "라운드 종료 (새 라운드)";
  if (rs === "CLOSED") return "종료됨";
  const bs = String(bidStatus || "").trim().toUpperCase();
  if (bs === "SELECTED") return "고객이 내 제안 선택";
  if (bs === "REJECTED") return "선택되지 않음";
  if (bs === "SUBMITTED") return "제출 완료";
  if (bs === "NOT_SUBMITTED" || bs === "DRAFT") return "미제출";
  return bs || "—";
}

/** 고객 견적 요청(라운드) 상태 — 파트너 히어로 카드용 */
export function partnerBidRequestRoundLabel(requestStatus) {
  const rs = String(requestStatus || "").trim().toUpperCase();
  if (rs === "OPEN") return "견적 접수 중";
  if (rs === "CUSTOMER_SELECTED") return "고객 선택 완료";
  if (rs === "EXPIRED") return "제출 마감됨";
  if (rs === "CANCELLED") return "라운드 종료 (재요청)";
  if (rs === "CLOSED") return "종료됨";
  return rs || "—";
}

/** 이 파트너의 견적 제안 제출 여부 — 파트너 히어로 카드용 */
export function partnerMyBidSubmissionLabel(bidStatus) {
  const bs = String(bidStatus || "").trim().toUpperCase();
  if (bs === "SUBMITTED") return "제출 완료";
  if (bs === "SELECTED") return "제출 완료 · 고객 선택";
  if (bs === "DRAFT") return "초안 저장됨 (미제출)";
  if (bs === "REJECTED") return "제출했으나 선택되지 않음";
  if (bs === "CLOSED") return "수정 불가";
  return "아직 제출 안 함";
}

/** @param {Record<string, unknown>} bid @param {string} requestStatus */
export function endedStateMessage(bid, requestStatus) {
  const bs = String(bid?.status ?? "").trim().toUpperCase();
  const rs = String(requestStatus || "").trim().toUpperCase();
  if (bs === "SELECTED") {
    return "Customer selected your offer. You have been added to the message thread.";
  }
  if (rs === "EXPIRED") {
    return "Bidding ended. You can no longer edit offers. A customer may still select an existing offer.";
  }
  if (rs === "CANCELLED") {
    return "Customer requested a new bidding round. This round is closed.";
  }
  if (rs === "CUSTOMER_SELECTED" && bs === "REJECTED") {
    return "Bidding ended. Another offer was selected.";
  }
  if (rs === "CUSTOMER_SELECTED" || rs === "CLOSED" || bs === "REJECTED" || bs === "EXPIRED") {
    return "This bidding round is closed.";
  }
  return "";
}
