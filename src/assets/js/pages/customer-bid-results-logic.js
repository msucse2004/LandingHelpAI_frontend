/**
 * 고객 견적 제안 비교 — 순수 로직(테스트 가능).
 */

import {
  formatBidDeadlineRemaining,
  isBidDeadlinePassed,
} from "../core/bid-deadline-display.js";

/**
 * `/uploads/...` 등 상대 경로를 API 베이스(또는 현재 origin)에 붙임.
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

/** Shown on vehicle offer cards when bidding is EXPIRED. */
export const EXPIRED_AVAILABILITY_BADGE =
  "Bidding ended — availability needs confirmation";

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
    return "Bidding has ended. Partners can no longer update offers. You can still select an existing offer, but availability and price should be confirmed with the partner.";
  }
  if (phase === "CLOSED") {
    return "이 비딩 라운드는 종료되었습니다. 새 라운드가 시작된 경우 최신 라운드를 확인해 주세요.";
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
 */
export function buildCustomerBidSelectConfirmContent(phase, offer, snap) {
  const title = offer?.title ? String(offer.title) : formatOfferTitle(offer);
  const total = formatMoney(offer.estimated_total, offer.currency || "USD");
  if (phase === "EXPIRED") {
    return {
      modalTitle: "Select this offer?",
      bodyHtml: `<p>This bidding round has ended. This vehicle may still be available, but price and availability should be confirmed with the partner. Do you want to select this offer and start a conversation?</p>`,
      warnText: "",
      submitLabel: "Select and contact partner",
    };
  }
  const countdown =
    snap?.expires_at != null ? formatCountdownToExpiry(snap.expires_at) : "";
  return {
    modalTitle: "제안 선택 확인",
    bodyHtml: `<p><strong>${escapeHtml(title)}</strong> 제안을 선택하시겠습니까?</p>
    <p>예상 총액 ${escapeHtml(total)}</p>
    <p class="u-text-muted">선택 후에는 해당 파트너와 메시지로 협의가 진행됩니다.</p>`,
    warnText: countdown
      ? `비딩 마감까지 ${escapeHtml(countdown)} 남았습니다. 지금 선택하면 다른 파트너의 추가 제안을 받기 어려울 수 있습니다.`
      : "",
    submitLabel: "선택 확정",
  };
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
 */
export function buildOfferThumbImgHtml(offer, esc) {
  const { thumb, full } = getOfferPhotoDisplayUrls(offer);
  if (!thumb && !full) {
    return `<div class="lhai-cbr-card__thumb-placeholder" aria-hidden="true"><span>사진을 불러올 수 없습니다</span></div>`;
  }
  const src = esc(thumb || full);
  const fallback =
    thumb && full && thumb !== full ? ` data-cbr-photo-fallback="${esc(full)}"` : "";
  return `<img class="lhai-cbr-card__thumb-img" src="${src}" alt="" loading="lazy"${fallback} />`;
}

/**
 * img error: thumbnail → original → placeholder.
 * @param {ParentNode} [root]
 */
export function wireOfferPhotoImgFallbacks(root = document) {
  const scope = root instanceof Document ? root : root;
  if (!scope || typeof scope.querySelectorAll !== "function") return;
  const placeholder =
    '<div class="lhai-cbr-card__thumb-placeholder" aria-hidden="true"><span>사진을 불러올 수 없습니다</span></div>';
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

/** English rank label for vehicle cards, e.g. "Recommended #2 of 9". */
export function formatOfferRankBadgeEn(offer, activeSort) {
  const rank = Number(offer.rank);
  if (!Number.isFinite(rank) || rank <= 0) return "";
  const total = Number(offer.rank_total);
  const basis = String(offer.rank_basis || activeSort || "recommended").trim();
  const label =
    /** @type {Record<string, string>} */ (RANK_BASIS_LABELS_EN)[basis] || "Ranked";
  if (Number.isFinite(total) && total > 0) return `${label} #${rank} of ${total}`;
  return `${label} #${rank}`;
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

/** @param {Record<string, unknown>} offer */
export function formatVehiclePriceBreakdownLines(offer) {
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
    lines.push({ label: "Vehicle price", value: formatMoney(vehiclePrice, cur) });
  }
  const tax =
    p.estimated_tax_registration ??
    p.estimated_tax_fees ??
    attrs.estimated_tax_fees ??
    attrs.estimated_tax_registration;
  if (tax != null && tax !== "") {
    lines.push({ label: "Tax & fees", value: formatMoney(tax, cur) });
  }
  const dealer = p.dealer_fee ?? attrs.dealer_fee;
  if (dealer != null && dealer !== "") {
    lines.push({ label: "Dealer fee", value: formatMoney(dealer, cur) });
  }
  const partnerFee = p.partner_service_fee ?? attrs.partner_service_fee;
  if (partnerFee != null && partnerFee !== "") {
    lines.push({ label: "Partner service fee", value: formatMoney(partnerFee, cur) });
  }
  const delivery = p.delivery_fee ?? attrs.delivery_fee;
  if (delivery != null && delivery !== "") {
    lines.push({ label: "Delivery fee", value: formatMoney(delivery, cur) });
  }
  const total = p.estimated_total ?? offer.estimated_total;
  if (total != null && total !== "") {
    lines.push({ label: "Estimated total", value: formatMoney(total, cur), strong: true });
  }
  if (!lines.length) {
    return formatOfferPriceBreakdownLines(offer);
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
    selectLabel: isSelected ? "Your selection" : "Select this offer",
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
 * }} ctx
 * @param {(s: string) => string} esc
 */
export function buildVehicleOfferCardHtml(offer, ctx, esc) {
  const bidId = String(offer.bid_id || "").trim();
  const offerId = String(offer.offer_id || "").trim();
  const cur = String(offer.currency || "USD");
  const photos = collectOfferPhotos(offer);
  const veh = resolveVehicleFromOffer(offer);
  const rankBadge = formatOfferRankBadgeEn(offer, ctx.activeSort);
  const sel = offerSelectionUiState(ctx.phase, offer, {
    selectedBidId: ctx.selectedBidId,
    selectedOfferId: ctx.selectedOfferId,
    snap: ctx.snap,
  });
  const phase = ctx.phase;
  const showExpiredBadge = phase === "EXPIRED";
  const relation = formatOfferRelationLabel(offer);
  const updatedBadge = offerShowsUpdatedBadge(offer.updated_at, ctx.recentUpdatedAt)
    ? `<span class="lhai-cbr-badge lhai-cbr-badge--updated">Updated</span>`
    : "";
  const altBadge = offer.is_alternative
    ? `<span class="lhai-cbr-badge lhai-cbr-badge--alt">Alternative</span>`
    : "";
  const expiredBadge = showExpiredBadge
    ? `<span class="lhai-cbr-badge lhai-cbr-badge--expired">${esc(EXPIRED_AVAILABILITY_BADGE)}</span>`
    : "";
  const selectedBadge = sel.isSelected
    ? `<span class="lhai-cbr-badge lhai-cbr-badge--selected">Your selection</span>`
    : "";
  const breakdown = formatVehiclePriceBreakdownLines(offer);
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
  const titleStatus = titleStatusLabelKo(veh.title_status) || "—";
  const accident = accidentLabelKo(veh.accident_history) || "—";
  const location = veh.location || "—";
  const availability = offerAvailabilityLabel(offer) || "—";
  const msg = String(offer.message_to_customer || "").trim();
  const msgPreview = msg
    ? esc(msg.slice(0, 160)).replace(/\n/g, "<br />") + (msg.length > 160 ? "…" : "")
    : "—";
  const thumbHtml = buildOfferThumbImgHtml(offer, esc);
  const photoCount =
    photos.length > 1
      ? `<span class="lhai-cbr-card__photo-count">${photos.length} photos</span>`
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
        <h3 class="lhai-cbr-card__title">${esc(formatOfferTitle(offer))}</h3>
        <p class="lhai-cbr-card__partner">${esc(formatOfferPartnerName(offer))}</p>
        <p class="lhai-cbr-card__total">${esc(formatMoney(offer.estimated_total, cur))}</p>
        ${
          breakdown.length
            ? `<details class="lhai-cbr-card__price-details">
          <summary>Price breakdown</summary>
          <ul class="lhai-cbr-card__price-list" id="${breakdownId}">${breakdownRows}</ul>
        </details>`
            : ""
        }
        <dl class="lhai-cbr-card__specs">
          <div><dt>Mileage</dt><dd>${esc(mileage)}</dd></div>
          <div><dt>Title</dt><dd>${esc(titleStatus)}</dd></div>
          <div><dt>Accident</dt><dd>${esc(accident)}</dd></div>
          <div><dt>Location</dt><dd>${esc(location)}</dd></div>
          <div class="lhai-cbr-card__specs--wide"><dt>Availability</dt><dd>${esc(availability)}</dd></div>
        </dl>
        <div class="lhai-cbr-card__preview">
          <span class="lhai-cbr-card__preview-label">Partner message</span>
          <p>${msgPreview}</p>
        </div>
        <div class="lhai-cbr-card__actions">
          <button type="button" class="lhai-button lhai-button--secondary" data-cbr-detail="${esc(offerId)}">View details</button>
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
 * }} ctx
 * @param {(s: string) => string} esc
 */
export function buildVehicleOfferDetailModalHtml(offer, ctx, esc) {
  const cur = String(offer.currency || "USD");
  const photos = collectOfferPhotos(offer);
  const veh = resolveVehicleFromOffer(offer);
  const rankBadge = formatOfferRankBadgeEn(offer, ctx.activeSort);
  const sel = offerSelectionUiState(ctx.phase, offer, {
    selectedBidId: ctx.selectedBidId,
    selectedOfferId: ctx.selectedOfferId,
    snap: ctx.snap,
  });
  const breakdown = formatVehiclePriceBreakdownLines(offer);
  const attrs = formatAttributesList(offer.attributes);
  const vehAttrs = [
    ["Year", veh.year],
    ["Make", veh.make],
    ["Model", veh.model],
    ["Trim", veh.trim],
    ["Mileage", veh.mileage != null ? `${Number(veh.mileage).toLocaleString()} mi` : ""],
    ["Condition", conditionLabelKo(veh.condition)],
    ["Title status", titleStatusLabelKo(veh.title_status)],
    ["Accident history", accidentLabelKo(veh.accident_history)],
    ["Color", veh.color],
    ["Location", veh.location],
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
    : `<p class="u-text-muted">No photos submitted.</p>`;
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
      ? `<p class="lhai-cbr-modal__expired-note" role="status">${esc(EXPIRED_AVAILABILITY_BADGE)}</p>`
      : "";

  return `
    ${expiredNote}
    <div class="lhai-cbr-modal__head">
      <h3 class="lhai-cbr-modal__title">${esc(formatOfferTitle(offer))}</h3>
      <p class="lhai-cbr-modal__partner">${esc(formatOfferPartnerName(offer))}</p>
      ${rankBadge ? `<p class="lhai-cbr-modal__rank"><span class="lhai-cbr-badge lhai-cbr-badge--rank">${esc(rankBadge)}</span></p>` : ""}
    </div>
    ${galleryHtml}
    <section class="lhai-cbr-modal__section">
      <h4>Vehicle details</h4>
      ${attrsHtml}
    </section>
    <section class="lhai-cbr-modal__section">
      <h4>Price breakdown</h4>
      <p class="lhai-cbr-modal__total-line">Estimated total: <strong>${esc(formatMoney(offer.estimated_total, cur))}</strong></p>
      ${breakdownHtml}
    </section>
    <section class="lhai-cbr-modal__section">
      <h4>Availability</h4>
      <p>${esc(offerAvailabilityLabel(offer) || "—")}</p>
    </section>
    <section class="lhai-cbr-modal__section">
      <h4>Partner message</h4>
      <p class="lhai-cbr-modal__message">${esc(String(offer.message_to_customer || "—")).replace(/\n/g, "<br />")}</p>
    </section>
    <p class="lhai-cbr-modal__notice u-text-muted">Confirm price and availability with the partner in messages after you select an offer.</p>
    <div class="lhai-cbr-modal__select-hint" data-cbr-modal-can-select="${sel.showSelectButton && !sel.selectDisabled ? "1" : "0"}"></div>`;
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
 * 고객 견적 비교 화면 링크.
 * 1) service_request_id 있으면 service_request_id (+ thread_id 있으면 함께)
 * 2) thread_id만 있으면 thread_id
 * 3) 둘 다 없으면 fallbackHref (기본 messages.html)
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
