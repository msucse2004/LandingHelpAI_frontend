/**
 * CAR_PURCHASE partner bid request UI (vehicle offer form).
 */

import { resolveBackendMediaUrl } from "../core/utils.js";
import {
  buildCarSubmitPayload,
  buildAutoOfferTitle,
  cloneOffer,
  computeOfferEstimatedTotal,
  createBlankCarOfferForAdd,
  createEmptyCarOffer,
  optionalNumberInputValue,
  DEFAULT_MAX_OFFER_PHOTOS,
  prepareBidOfferPhotoFileForUpload,
  validateBidOfferPhotoFile,
  ensureOffersLinkedRequestIndexes,
  formatDeadlineFromBidRequestBlock,
  formatMoney,
  linkedRequestDisplayLabel,
  offersFromIncludedItems,
  PARTNER_BID_EXPIRED_POLICY_BANNER,
  partnerHasCarPurchaseCapability,
  resolveDefaultLinkedRequestIndex,
  resolvePartnerBidEditable,
  validateCarOffersForSubmit,
  vehicleRequestSummaryLines,
  withLinkedRequestIndex,
} from "./partner-bid-request-car-logic.js";
import {
  renderAiBidRequestBriefCard,
  renderFullIntakeAnswersDisclosure,
  resolvePartnerIntakeAnswerRows,
} from "./partner-bid-request-intake-display.js";
import {
  clearPartnerCarOfferDraft,
  loadPartnerCarOfferDraft,
  savePartnerCarOfferDraft,
} from "./partner-bid-request-car-draft.js";
import {
  formatRankSummaryLabel,
  partnerBidRequestRoundLabel,
  partnerMyBidSubmissionLabel,
} from "./partner-bid-request-product-logic.js";
import { setTextIfChanged } from "../core/page-refresh.js";

function escHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function readPartnerCapabilities() {
  try {
    const raw = sessionStorage.getItem("lhai_partner_bidding_capabilities");
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/** @param {Record<string, unknown>} data */
function normalizeBidStatus(data) {
  const bid = data.bid && typeof data.bid === "object" ? data.bid : {};
  return String(bid.status ?? "").trim().toUpperCase();
}

const CONDITION_OPTIONS = [
  { value: "", label: "—" },
  { value: "NEW", label: "New" },
  { value: "USED", label: "Used" },
  { value: "CPO", label: "Certified pre-owned" },
];

const TITLE_STATUS_OPTIONS = [
  { value: "", label: "—" },
  { value: "Clean title", label: "Clean title" },
  { value: "Rebuilt title", label: "Rebuilt title" },
  { value: "Salvage title", label: "Salvage title" },
  { value: "Unknown", label: "Unknown" },
];

const ACCIDENT_OPTIONS = [
  { value: "", label: "—" },
  { value: "No accident reported", label: "No accident reported" },
  { value: "Minor accident reported", label: "Minor accident reported (경미한 사고)" },
  { value: "Major accident reported", label: "Major accident reported (중대 사고)" },
  { value: "Unknown", label: "Unknown" },
];

/** @param {string} selected */
function accidentHistorySelectOptionsHtml(selected) {
  const value = String(selected || "").trim();
  const options = [...ACCIDENT_OPTIONS];
  if (value === "Accident reported" && !options.some((o) => o.value === value)) {
    options.splice(3, 0, {
      value: "Accident reported",
      label: "Accident reported (기존 제안 — 세부 등급 미지정)",
    });
  }
  return renderSelectOptions(options, value);
}

/** @param {Array<{value:string,label:string}>} options @param {string} selected */
function renderSelectOptions(options, selected) {
  return options
    .map((o) => `<option value="${escHtml(o.value)}"${o.value === selected ? " selected" : ""}>${escHtml(o.label)}</option>`)
    .join("");
}

/** @param {Record<string, unknown>} vr @param {string} currency */
function renderVehicleCard(vr, currency) {
  const idx = vr.request_index ?? "";
  const opts = Array.isArray(vr.required_options) ? vr.required_options.join(", ") : "";
  const lines = [
    `<p class="lhai-par-car__vreq-title">${escHtml(vr.label || `요청 ${idx}`)}</p>`,
    `<p class="lhai-par-car__vreq-model">${escHtml([vr.make, vr.model].filter(Boolean).join(" ") || "—")}</p>`,
    `<p class="lhai-par-car__vreq-meta">${escHtml(vehicleRequestSummaryLines(vr))}</p>`,
  ];
  if (vr.budget_max != null) {
    lines.push(
      `<p class="lhai-par-car__vreq-meta">예산: ${escHtml(formatMoney(vr.budget_max, currency))} 이하</p>`,
    );
  }
  if (opts) lines.push(`<p class="lhai-par-car__vreq-meta">필수 옵션: ${escHtml(opts)}</p>`);
  if (vr.notes) lines.push(`<p class="lhai-par-car__vreq-notes">${escHtml(vr.notes)}</p>`);
  return `<article class="lhai-par-car__vreq-card" data-request-index="${escHtml(idx)}">
    ${lines.join("")}
    <div class="lhai-par-car__vreq-actions">
      <button type="button" class="lhai-button lhai-button--primary" data-action="match" data-index="${escHtml(idx)}">이 요청으로 견적 작성</button>
      <button type="button" class="lhai-button lhai-button--ghost lhai-par-car__alt-btn" data-action="alt" data-index="${escHtml(idx)}">대안 차량 제안</button>
    </div>
  </article>`;
}

/** @param {string} url */
function photoDisplayName(url) {
  const s = String(url || "").trim();
  if (!s) return "photo";
  const part = s.split("/").pop() || "photo";
  return part.split("?")[0] || "photo";
}

/**
 * @param {unknown[]} photos
 * @param {number} primaryIndex
 * @param {boolean} disabled
 * @param {{ uploading?: boolean, maxPhotos?: number }} opts
 */
function renderCarPhotosHtml(photos, primaryIndex, disabled, opts = {}) {
  const dis = disabled ? "disabled" : "";
  const uploading = opts.uploading === true;
  const maxPhotos = Math.max(1, Number(opts.maxPhotos) || DEFAULT_MAX_OFFER_PHOTOS);
  const list = Array.isArray(photos) ? photos : [];
  const atLimit = list.length >= maxPhotos;

  const uploadedRows = list.length
    ? list
        .map((p, i) => {
          const row = p && typeof p === "object" ? /** @type {Record<string, unknown>} */ (p) : {};
          const url = String(row.url || "").trim();
          const thumb = resolveBackendMediaUrl(String(row.thumbnail_url || url).trim());
          const isPrimary = Boolean(row.is_primary) || i === primaryIndex;
          const name = photoDisplayName(url);
          return `<div class="lhai-par-car__photo-row" data-photo-index="${i}">
            ${thumb ? `<img class="lhai-par-car__photo-thumb" src="${escHtml(thumb)}" alt="" loading="lazy" />` : ""}
            <div class="lhai-par-car__photo-meta">
              <p class="lhai-par-car__photo-name">${escHtml(name)}</p>
              <input type="text" class="lhai-par-car__photo-caption" name="photo_caption" data-photo-index="${i}" placeholder="캡션 (선택)" value="${escHtml(row.caption || "")}" ${dis} />
              <div class="lhai-par-car__photo-actions">
                ${
                  isPrimary
                    ? '<span class="lhai-par-car__photo-primary-badge">Primary</span>'
                    : `<button type="button" class="lhai-button lhai-button--ghost lhai-par-car__photo-set-primary" data-action="set-primary" data-photo-index="${i}" ${dis}>Set primary</button>`
                }
                <button type="button" class="lhai-button lhai-button--ghost" data-action="remove-photo" data-photo-index="${i}" ${dis}>Remove</button>
              </div>
            </div>
            <input type="hidden" name="photo_url" value="${escHtml(url)}" />
            <input type="hidden" name="photo_thumbnail_url" value="${escHtml(String(row.thumbnail_url || url))}" />
            <input type="hidden" name="photo_asset_id" value="${escHtml(row.asset_id || "")}" />
          </div>`;
        })
        .join("")
    : '<p class="lhai-par-car__photo-empty u-text-muted">업로드된 사진이 없습니다.</p>';

  const uploadBusy = uploading
    ? '<p class="lhai-par-car__photo-uploading" role="status"><span class="lhai-par-car__spinner" aria-hidden="true"></span> 사진 업로드 중…</p>'
    : "";

  return `<div class="lhai-par-car__photos">
    <h3 class="lhai-par-car__subhead">Vehicle photos</h3>
    <p class="lhai-par-car__photo-hint">JPEG, PNG, WebP · 최대 8MB · ${list.length}/${maxPhotos}장</p>
    <div class="lhai-par-car__photo-dropzone ${uploading ? "is-uploading" : ""} ${atLimit ? "is-at-limit" : ""}" data-action="photo-dropzone">
      <p class="lhai-par-car__photo-drop-label">Drag photos here or choose files</p>
      <label class="lhai-button lhai-button--secondary lhai-par-car__photo-choose">
        <input type="file" accept="image/jpeg,image/png,image/webp" data-action="upload-photo" multiple ${dis || atLimit || uploading ? "disabled" : ""} hidden />
        Choose files
      </label>
      ${uploadBusy}
    </div>
    <h4 class="lhai-par-car__photo-list-title">Uploaded photos</h4>
    <div class="lhai-par-car__photo-list">${uploadedRows}</div>
    <details class="lhai-par-car__photo-advanced">
      <summary>Advanced: Add photo URL</summary>
      <div class="lhai-par-car__photo-url-add">
        <input type="url" name="advanced_photo_url" placeholder="https://..." ${dis || atLimit ? "disabled" : ""} />
        <button type="button" class="lhai-button lhai-button--ghost" data-action="add-photo-url" ${dis || atLimit ? "disabled" : ""}>Add URL</button>
      </div>
    </details>
  </div>`;
}

/**
 * @param {Record<string, unknown>} offer
 * @param {boolean} disabled
 * @param {{ uploading?: boolean, maxPhotos?: number, vehicleRequests?: Array<Record<string, unknown>> }} [photoOpts]
 */
function renderOfferFields(offer, disabled, photoOpts = {}) {
  const isAlt = Boolean(offer.is_alternative);
  const dis = disabled ? "disabled" : "";
  const cond = String(offer.vehicle_condition || "");
  const titleSt = String(offer.title_status || "");
  const accident = String(offer.accident_history || "");
  const primaryIdx = Number(offer.primary_photo_index);
  const safePrimary = Number.isFinite(primaryIdx) ? primaryIdx : 0;
  const autoTitle = buildAutoOfferTitle(offer);
  const vehicleRequests = Array.isArray(photoOpts.vehicleRequests) ? photoOpts.vehicleRequests : [];
  const linkedOffer = withLinkedRequestIndex(offer, vehicleRequests);
  const linkedIdx = linkedOffer.linked_request_index ?? resolveDefaultLinkedRequestIndex(vehicleRequests);
  const linkedLabel = linkedRequestDisplayLabel(vehicleRequests, linkedIdx);

  return `
    <fieldset class="lhai-par-car__section">
      <legend class="lhai-par-car__section-title">제안 유형</legend>
      <div class="lhai-par-car__field-row">
        <label>제안 유형</label>
        <select name="offer_kind" ${dis}>
          <option value="REQUESTED_MATCH" ${!isAlt ? "selected" : ""}>요청 차량과 일치</option>
          <option value="ALTERNATIVE" ${isAlt ? "selected" : ""}>비슷한 대안 차량</option>
        </select>
      </div>
      <div class="lhai-par-car__field-row lhai-par-car__alt-reason ${isAlt ? "" : "lhai-par-car__hidden"}">
        <label>대안 제안 사유 <span class="u-text-muted">(필수)</span></label>
        <textarea name="alternative_reason" rows="2" ${dis}>${escHtml(offer.alternative_reason || "")}</textarea>
      </div>
      <div class="lhai-par-car__field-row lhai-par-car__linked-request-row">
        <label>연결된 고객 요청 #</label>
        <input type="hidden" name="linked_request_index" value="${escHtml(String(linkedIdx))}" />
        <p class="lhai-par-car__linked-request-value">
          <strong>#${escHtml(String(linkedIdx))}</strong>${linkedLabel ? ` — ${escHtml(linkedLabel)}` : ""}
        </p>
        <p class="lhai-help u-mt-1">고객 요청과 자동으로 연결됩니다.</p>
      </div>
    </fieldset>

    <fieldset class="lhai-par-car__section">
      <legend class="lhai-par-car__section-title">차량 정보</legend>
      <p class="lhai-par-car__auto-title">자동 제목: <strong>${escHtml(autoTitle)}</strong></p>
      <div class="lhai-par-car__grid-2">
        <div class="lhai-par-car__field-row">
          <label>연식 <span class="u-text-muted">(필수)</span></label>
          <input type="number" name="year" min="1980" max="2100" value="${offer.year ?? ""}" required ${dis} />
        </div>
        <div class="lhai-par-car__field-row">
          <label>신차/중고</label>
          <select name="vehicle_condition" ${dis}>${renderSelectOptions(CONDITION_OPTIONS, cond)}</select>
        </div>
      </div>
      <div class="lhai-par-car__grid-2">
        <div class="lhai-par-car__field-row">
          <label>브랜드 <span class="u-text-muted">(필수)</span></label>
          <input name="make" value="${escHtml(offer.make || "")}" required ${dis} />
        </div>
        <div class="lhai-par-car__field-row">
          <label>모델 <span class="u-text-muted">(필수)</span></label>
          <input name="model" value="${escHtml(offer.model || "")}" required ${dis} />
        </div>
      </div>
      <div class="lhai-par-car__field-row">
        <label>트림</label>
        <input name="trim" value="${escHtml(offer.trim || "")}" ${dis} />
      </div>
      <div class="lhai-par-car__grid-2">
        <div class="lhai-par-car__field-row">
          <label>주행거리 (miles) <span class="u-text-muted">(필수)</span></label>
          <input type="number" name="mileage" min="0" value="${offer.mileage ?? ""}" required ${dis} />
        </div>
        <div class="lhai-par-car__field-row">
          <label>VIN / 재고 번호</label>
          <input name="vin_or_stock" value="${escHtml(offer.vin_or_stock || "")}" ${dis} />
        </div>
      </div>
      <div class="lhai-par-car__grid-2">
        <div class="lhai-par-car__field-row">
          <label>외장 색상</label>
          <input name="exterior_color" value="${escHtml(offer.exterior_color || "")}" ${dis} />
        </div>
        <div class="lhai-par-car__field-row">
          <label>위치</label>
          <input name="location" value="${escHtml(offer.location || "")}" ${dis} />
        </div>
      </div>
      <div class="lhai-par-car__field-row">
        <label>납품 가능 시기 <span class="u-text-muted">(필수)</span></label>
        <input name="available_timeline" value="${escHtml(offer.available_timeline || "")}" required ${dis} placeholder="예: 즉시 가능" />
      </div>
    </fieldset>

    <fieldset class="lhai-par-car__section">
      <legend class="lhai-par-car__section-title">차량 이력</legend>
      <div class="lhai-par-car__grid-2">
        <div class="lhai-par-car__field-row">
          <label>소유권 상태</label>
          <select name="title_status" ${dis}>${renderSelectOptions(TITLE_STATUS_OPTIONS, titleSt)}</select>
        </div>
        <div class="lhai-par-car__field-row">
          <label>사고 이력</label>
          <select name="accident_history" ${dis}>${accidentHistorySelectOptionsHtml(accident)}</select>
        </div>
      </div>
    </fieldset>

    <fieldset class="lhai-par-car__section">
      <legend class="lhai-par-car__section-title">가격</legend>
      <div class="lhai-par-car__grid-2">
        <div class="lhai-par-car__field-row">
          <label>차량 가격 <span class="u-text-muted">(필수)</span></label>
          <input type="number" name="vehicle_price" min="0" step="1" value="${offer.vehicle_price ?? ""}" ${dis} />
        </div>
        <div class="lhai-par-car__field-row">
          <label>예상 세금·수수료</label>
          <input type="number" name="estimated_tax_fees" min="0" step="1" value="${optionalNumberInputValue(offer.estimated_tax_fees)}" ${dis} />
        </div>
        <div class="lhai-par-car__field-row">
          <label>딜러 수수료</label>
          <input type="number" name="dealer_fee" min="0" step="1" value="${optionalNumberInputValue(offer.dealer_fee)}" ${dis} />
        </div>
        <div class="lhai-par-car__field-row">
          <label>파트너 서비스 수수료</label>
          <input type="number" name="partner_service_fee" min="0" step="1" value="${optionalNumberInputValue(offer.partner_service_fee)}" ${dis} />
        </div>
        <div class="lhai-par-car__field-row">
          <label>배송비</label>
          <input type="number" name="delivery_fee" min="0" step="1" value="${optionalNumberInputValue(offer.delivery_fee)}" ${dis} />
        </div>
        <div class="lhai-par-car__field-row lhai-par-car__total-row">
          <label>총 견적 <span class="u-text-muted">(수동 입력 가능)</span></label>
          <input type="number" name="estimated_total" min="0" step="1" value="${offer.estimated_total ?? ""}" data-manual-total ${dis} />
          <p class="lhai-par-car__total-hint">자동 합계: <output name="estimated_total_display" class="lhai-par-car__total-out">${escHtml(formatMoney(computeOfferEstimatedTotal(offer), offer.currency || "USD"))}</output></p>
        </div>
      </div>
      <input type="hidden" name="estimated_total_manual_override" value="${offer.estimated_total_manual_override ? "1" : "0"}" />
    </fieldset>

    ${renderCarPhotosHtml(offer.photos, safePrimary, disabled, photoOpts)}

    <fieldset class="lhai-par-car__section">
      <legend class="lhai-par-car__section-title">메시지</legend>
      <div class="lhai-par-car__field-row">
        <label>고객에게 보낼 메시지</label>
        <textarea name="message_to_customer" rows="3" ${dis}>${escHtml(offer.message_to_customer || "")}</textarea>
      </div>
      <div class="lhai-par-car__field-row">
        <label>포함 서비스 / 설명 (선택)</label>
        <textarea name="included_services" rows="2" ${dis}>${escHtml(offer.included_services || offer.description || "")}</textarea>
      </div>
    </fieldset>
  `;
}

/**
 * Vehicle request list + partner offer editor (below briefing / intake disclosure).
 * @param {object} params
 */
function renderVehicleOfferFormHtml(params) {
  const { vehicleRequests, isEditable, bidStatus, bid } = params;
  const vreqSection = vehicleRequests.length
    ? `<section class="lhai-card lhai-par-car__vreq-section lhai-par-car__offer-block">
        <h2 class="lhai-card__title">고객 요청 차량</h2>
        <div id="partnerCarVreqList" class="lhai-par-car__vreq-list"></div>
      </section>`
    : "";

  return `
    ${vreqSection}
    <section class="lhai-card lhai-par-car__editor lhai-par-car__offer-block" id="partnerCarEditorSection" ${isEditable ? "" : "hidden"}>
      <div class="lhai-par-car__editor-head">
        <h2 class="lhai-card__title">차량 견적 제안</h2>
        <button type="button" class="lhai-button lhai-button--secondary" id="partnerCarAddOfferBtn" ${isEditable ? "" : "disabled"}>+ 제안 추가</button>
      </div>
      <div class="lhai-par-car__offer-tabs" id="partnerCarOfferTabs"></div>
      <form class="lhai-par-car__form" id="partnerCarForm" novalidate>
        <div id="partnerCarOfferFields"></div>
        <div class="lhai-par-bid__field">
          <label for="partnerCarGlobalMessage">전체 메시지 (선택, 모든 제안에 공통)</label>
          <textarea id="partnerCarGlobalMessage" name="global_message" rows="3" ${isEditable ? "" : "disabled"}>${escHtml(String(bid.message_to_customer || ""))}</textarea>
        </div>
        <p class="lhai-par-bid__form-error" id="partnerCarFormError" role="alert" hidden></p>
        <div class="lhai-par-car__toolbar">
          <button type="button" class="lhai-button lhai-button--ghost" id="partnerCarApplyDefaultsBtn" ${isEditable ? "" : "disabled"}>기본값 적용</button>
          <button type="button" class="lhai-button lhai-button--ghost" id="partnerCarCopyOfferBtn" ${isEditable ? "" : "disabled"}>제안 복사</button>
          <button type="button" class="lhai-button lhai-button--ghost" id="partnerCarRemoveOfferBtn" ${isEditable ? "" : "disabled"}>제안 삭제</button>
          <button type="submit" class="lhai-button lhai-button--primary" id="partnerCarSubmitBtn" ${isEditable ? "" : "disabled"}>${bidStatus === "SUBMITTED" ? "견적 수정 제출" : "견적 제출"}</button>
        </div>
      </form>
    </section>
  `;
}

/**
 * Rank / meta only — keeps offer form DOM when background refresh runs while typing.
 * @param {HTMLElement} root
 * @param {Record<string, unknown>} data
 */
export function refreshCarPurchaseBidMeta(root, data) {
  if (!(root instanceof HTMLElement)) return;
  const bidRequestBlock =
    data.bid_request && typeof data.bid_request === "object"
      ? /** @type {Record<string, unknown>} */ (data.bid_request)
      : null;
  const bid =
    data.bid && typeof data.bid === "object"
      ? /** @type {Record<string, unknown>} */ (data.bid)
      : {};
  const reqStatus = String(
    data.bid_request_status ?? bidRequestBlock?.bid_request_status ?? "OPEN",
  )
    .trim()
    .toUpperCase();
  const bidStatus = String(bid.status ?? "").trim().toUpperCase();
  setTextIfChanged(
    root.querySelector("#partnerCarReqRound"),
    partnerBidRequestRoundLabel(reqStatus),
  );
  setTextIfChanged(
    root.querySelector("#partnerCarMyBidStatus"),
    partnerMyBidSubmissionLabel(bidStatus),
  );
  setTextIfChanged(
    root.querySelector("#partnerCarDeadline"),
    formatDeadlineFromBidRequestBlock(bidRequestBlock || data),
  );

  const rankSummary =
    data.rank_summary && typeof data.rank_summary === "object" ? data.rank_summary : null;
  const rankLabel = formatRankSummaryLabel(rankSummary, { prefix: "현재 순위" });
  const lastViewSummary =
    data.last_view_rank_summary && typeof data.last_view_rank_summary === "object"
      ? data.last_view_rank_summary
      : null;
  const lastViewLabel = formatRankSummaryLabel(lastViewSummary, {
    prefix: "마지막 확인 시 순위",
  });
  const rankCard = root.querySelector("#partnerCarRankCard");
  const rankEl = root.querySelector("#partnerCarRank");
  const lastViewRankEl = root.querySelector("#partnerCarLastViewRank");
  if (!(rankCard instanceof HTMLElement) || !(rankEl instanceof HTMLElement)) return;
  if (rankLabel) {
    rankCard.hidden = false;
    setTextIfChanged(rankEl, rankLabel);
    if (lastViewRankEl instanceof HTMLElement) {
      if (lastViewLabel) {
        lastViewRankEl.hidden = false;
        setTextIfChanged(lastViewRankEl, lastViewLabel);
      } else {
        lastViewRankEl.hidden = true;
        lastViewRankEl.textContent = "";
      }
    }
  } else {
    rankCard.hidden = true;
    rankEl.textContent = "";
    if (lastViewRankEl instanceof HTMLElement) {
      lastViewRankEl.hidden = true;
      lastViewRankEl.textContent = "";
    }
  }
}

/**
 * @param {HTMLElement} root
 * @param {object} ctx
 */
export function mountCarPurchaseBidUi(root, ctx) {
  const {
    data,
    expiresAtQuery,
    requestStatusQuery,
    bidRequestBlock,
    onDetailUpdate,
    submitFn,
    uploadOfferPhotoFn,
    requiresOfferPhotos,
    openMessagesFn,
  } = ctx;

  const carReq =
    data.car_purchase_request && typeof data.car_purchase_request === "object"
      ? data.car_purchase_request
      : {};
  const carCfg =
    data.car_purchase_config && typeof data.car_purchase_config === "object"
      ? data.car_purchase_config
      : {};
  const bidCfg =
    data.bidding_config && typeof data.bidding_config === "object" ? data.bidding_config : {};
  const maxPhotosPerOffer = Math.max(
    1,
    Number(bidCfg.max_offer_photos_per_offer) ||
      Number(carCfg.max_offer_photos_per_vehicle) ||
      DEFAULT_MAX_OFFER_PHOTOS,
  );
  let photoUploadsInFlight = 0;
  const cust =
    data.customer_summary && typeof data.customer_summary === "object" ? data.customer_summary : {};
  const bid = data.bid && typeof data.bid === "object" ? data.bid : {};

  const allowAlternatives = carCfg.allow_alternative_vehicle_offers !== false;
  const currency = String(carReq.currency || "USD");

  const bidStatus = normalizeBidStatus(data);
  const reqStatus = String(data.bid_request_status ?? requestStatusQuery ?? "OPEN")
    .trim()
    .toUpperCase();
  const deadlineExpires =
    bidRequestBlock && typeof bidRequestBlock === "object" && bidRequestBlock.expires_at
      ? String(bidRequestBlock.expires_at)
      : expiresAtQuery;
  const serverExpired =
    bidRequestBlock && typeof bidRequestBlock === "object" && bidRequestBlock.is_expired === true;
  const isEditable =
    !serverExpired &&
    resolvePartnerBidEditable({
      bidStatus,
      expiresAt: deadlineExpires,
      requestStatus: reqStatus,
    });
  const isSelected = bidStatus === "SELECTED";
  const isTerminal = bidStatus === "CLOSED" || bidStatus === "REJECTED";

  const rankSummary =
    data.rank_summary && typeof data.rank_summary === "object" ? data.rank_summary : null;
  const rankLabel = formatRankSummaryLabel(rankSummary, { prefix: "현재 순위" });
  const lastViewSummary =
    data.last_view_rank_summary && typeof data.last_view_rank_summary === "object"
      ? data.last_view_rank_summary
      : null;
  const lastViewLabel = formatRankSummaryLabel(lastViewSummary, {
    prefix: "마지막 확인 시 순위",
  });

  const vehicleRequests = Array.isArray(carReq.vehicle_requests) ? carReq.vehicle_requests : [];
  const bidRequestId = String(data.bid_request_id || "").trim();

  let offers = ensureOffersLinkedRequestIndexes(
    offersFromIncludedItems(bid.included_items),
    vehicleRequests,
  );
  if (!offers.length && isEditable) {
    offers = [withLinkedRequestIndex(createEmptyCarOffer({ isAlternative: false }), vehicleRequests)];
  }
  let activeIdx = 0;

  const savedDraft =
    bidRequestId && isEditable ? loadPartnerCarOfferDraft(bidRequestId) : null;
  if (savedDraft?.dirty && Array.isArray(savedDraft.offers) && savedDraft.offers.length) {
    offers = ensureOffersLinkedRequestIndexes(savedDraft.offers, vehicleRequests);
    activeIdx = Math.max(0, Math.min(Number(savedDraft.activeIdx) || 0, offers.length - 1));
  }

  const hasCap = partnerHasCarPurchaseCapability(readPartnerCapabilities());

  const intakeAnswerRows = resolvePartnerIntakeAnswerRows(data);
  const aiBrief =
    data.ai_bid_request_brief && typeof data.ai_bid_request_brief === "object"
      ? data.ai_bid_request_brief
      : null;

  root.innerHTML = `
    <section class="lhai-card lhai-par-car__hero">
      <h2 class="lhai-card__title">자동차 구매 견적 요청</h2>
      ${!hasCap ? '<p class="lhai-par-car__cap-warn" role="status">CAR_PURCHASE 견적 권한이 프로필에 없을 수 있습니다. 제출이 거절되면 관리자에게 문의하세요.</p>' : ""}
      <dl class="lhai-par-car__status-dl">
        <div><dt>견적 요청</dt><dd id="partnerCarReqRound">${escHtml(partnerBidRequestRoundLabel(reqStatus))}</dd></div>
        <div><dt>내 견적</dt><dd id="partnerCarMyBidStatus">${escHtml(partnerMyBidSubmissionLabel(bidStatus))}</dd></div>
        <div><dt>제출 마감</dt><dd id="partnerCarDeadline">${escHtml(formatDeadlineFromBidRequestBlock(bidRequestBlock) || formatDeadlineFromBidRequestBlock({ expires_at: expiresAtQuery }))}</dd></div>
      </dl>
      <div class="lhai-par-car__rank-card" id="partnerCarRankCard" hidden>
        <p class="lhai-par-car__rank" id="partnerCarRank"></p>
        <p class="lhai-par-car__rank-hint">순위는 제출 후 갱신됩니다. 고객 화면과 기준이 다를 수 있습니다.</p>
        <p class="lhai-par-car__rank lhai-par-car__rank--secondary" id="partnerCarLastViewRank" hidden></p>
      </div>
      <dl class="lhai-par-car__summary-dl">
        <div><dt>고객</dt><dd>${escHtml(cust.display_name || "—")}</dd></div>
        <div><dt>지역</dt><dd>${escHtml(carReq.location || cust.location || "—")}</dd></div>
        <div><dt>대안 차량</dt><dd>${allowAlternatives ? "허용" : "불가"}</dd></div>
      </dl>
    </section>

    ${isSelected ? '<section class="lhai-par-bid__selected-banner"><p><strong>고객이 이 견적을 선택했습니다.</strong> 이후에는 수정할 수 없습니다.</p><button type="button" class="lhai-button lhai-button--primary" id="partnerCarOpenMessagesBtn">고객과 메시지</button></section>' : ""}
    ${isTerminal && !isSelected ? '<p class="lhai-par-bid__closed-banner">이 견적 요청은 종료되었습니다. 더 이상 수정할 수 없습니다.</p>' : ""}
    ${!isEditable && !isSelected && !isTerminal && (reqStatus === "EXPIRED" || serverExpired) ? `<p class="lhai-par-car__expired" role="status">${escHtml(PARTNER_BID_EXPIRED_POLICY_BANNER)}</p>` : ""}

    <div class="lhai-par-car__request-stack">
      ${renderAiBidRequestBriefCard(aiBrief, {
        serviceTitle: String(
          data.service_title ||
            (data.service && typeof data.service === "object"
              ? data.service.title
              : "") ||
            "",
        ).trim() || undefined,
      })}
      ${renderFullIntakeAnswersDisclosure(intakeAnswerRows)}
      ${renderVehicleOfferFormHtml({
        vehicleRequests,
        isEditable,
        bidStatus,
        bid,
      })}
    </div>
  `;

  const rankCard = root.querySelector("#partnerCarRankCard");
  const rankEl = root.querySelector("#partnerCarRank");
  const lastViewRankEl = root.querySelector("#partnerCarLastViewRank");
  if (rankLabel && rankCard instanceof HTMLElement && rankEl instanceof HTMLElement) {
    rankCard.hidden = false;
    rankEl.textContent = rankLabel;
    if (lastViewLabel && lastViewRankEl instanceof HTMLElement) {
      lastViewRankEl.hidden = false;
      lastViewRankEl.textContent = lastViewLabel;
    }
  }

  const vreqList = root.querySelector("#partnerCarVreqList");
  const offerFields = root.querySelector("#partnerCarOfferFields");
  const offerTabs = root.querySelector("#partnerCarOfferTabs");
  const form = root.querySelector("#partnerCarForm");
  const formErr = root.querySelector("#partnerCarFormError");
  const globalMsg = root.querySelector("#partnerCarGlobalMessage");
  const submitBtn = root.querySelector("#partnerCarSubmitBtn");
  const deadlineEl = root.querySelector("#partnerCarDeadline");

  if (globalMsg instanceof HTMLTextAreaElement) {
    globalMsg.disabled = !isEditable;
    if (savedDraft?.globalMessage) {
      globalMsg.value = savedDraft.globalMessage;
    }
  }

  function persistCarOfferDraft() {
    if (!bidRequestId || !isEditable) return;
    if (offerFields instanceof HTMLElement && offers.length) {
      offers[activeIdx] = withLinkedRequestIndex(readOfferFromForm(), vehicleRequests);
    }
    savePartnerCarOfferDraft(bidRequestId, {
      offers: offers.map((o) => cloneOffer(o)),
      activeIdx,
      globalMessage: globalMsg instanceof HTMLTextAreaElement ? globalMsg.value : "",
      dirty: true,
    });
  }

  if (deadlineEl) {
    const tick = () => {
      deadlineEl.textContent =
        formatDeadlineFromBidRequestBlock(bidRequestBlock) ||
        formatDeadlineFromBidRequestBlock({
          expires_at: deadlineExpires || expiresAtQuery,
        });
    };
    tick();
    window.setInterval(tick, 60000);
  }

  function findVehicleRequest(index) {
    return vehicleRequests.find((v) => Number(v.request_index) === Number(index));
  }

  function readOfferFromForm() {
    const o = offers[activeIdx] ? { ...offers[activeIdx] } : createEmptyCarOffer({});
    if (!(offerFields instanceof HTMLElement)) return o;

    const kind = offerFields.querySelector('[name="offer_kind"]');
    const isAlt = kind instanceof HTMLSelectElement && kind.value === "ALTERNATIVE";
    o.is_alternative = isAlt;
    o.offer_kind = isAlt ? "ALTERNATIVE" : "REQUESTED_MATCH";

    const getVal = (name) => {
      const el = offerFields.querySelector(`[name="${name}"]`);
      if (el instanceof HTMLInputElement && el.type === "checkbox") return el.checked;
      if (
        el instanceof HTMLInputElement ||
        el instanceof HTMLSelectElement ||
        el instanceof HTMLTextAreaElement
      ) {
        return el.value;
      }
      return "";
    };

    const manualEl = offerFields.querySelector('[name="estimated_total_manual_override"]');
    o.estimated_total_manual_override =
      manualEl instanceof HTMLInputElement && manualEl.value === "1";

    const lri = getVal("linked_request_index");
    o.linked_request_index = lri === "" ? null : Number(lri);
    o.vehicle_condition = getVal("vehicle_condition");
    o.make = String(getVal("make")).trim();
    o.model = String(getVal("model")).trim();
    o.trim = String(getVal("trim")).trim();
    o.year = getVal("year") === "" ? null : Number(getVal("year"));
    o.mileage = getVal("mileage") === "" ? null : Number(getVal("mileage"));
    o.vin_or_stock = String(getVal("vin_or_stock")).trim();
    o.title_status = String(getVal("title_status")).trim();
    o.accident_history = String(getVal("accident_history")).trim();
    o.exterior_color = String(getVal("exterior_color")).trim();
    o.location = String(getVal("location")).trim();
    o.vehicle_price = getVal("vehicle_price") === "" ? null : Number(getVal("vehicle_price"));
    o.estimated_tax_fees =
      getVal("estimated_tax_fees") === "" ? 0 : Number(getVal("estimated_tax_fees"));
    o.dealer_fee = getVal("dealer_fee") === "" ? 0 : Number(getVal("dealer_fee"));
    o.partner_service_fee =
      getVal("partner_service_fee") === "" ? 0 : Number(getVal("partner_service_fee"));
    o.delivery_fee = getVal("delivery_fee") === "" ? 0 : Number(getVal("delivery_fee"));
    o.available_timeline = String(getVal("available_timeline")).trim();
    o.included_services = String(getVal("included_services")).trim();
    o.message_to_customer = String(getVal("message_to_customer")).trim();
    o.alternative_reason = String(getVal("alternative_reason")).trim();

    const totalInput = offerFields.querySelector('[name="estimated_total"]');
    if (totalInput instanceof HTMLInputElement && totalInput.value !== "") {
      o.estimated_total = Number(totalInput.value);
    } else if (!o.estimated_total_manual_override) {
      o.estimated_total = computeOfferEstimatedTotal(o);
    }

    o.currency = currency;
    const existing = Array.isArray(offers[activeIdx]?.photos)
      ? offers[activeIdx].photos.map((p) =>
          p && typeof p === "object" ? { .../** @type {Record<string, unknown>} */ (p) } : {},
        )
      : [];
    offerFields.querySelectorAll(".lhai-par-car__photo-row").forEach((row) => {
      const idx = Number(row.getAttribute("data-photo-index"));
      if (!Number.isFinite(idx) || !existing[idx]) return;
      const cap = row.querySelector('[name="photo_caption"]');
      if (cap instanceof HTMLInputElement) {
        existing[idx].caption = cap.value.trim();
      }
    });
    let primaryIdx = existing.findIndex((p) => Boolean(p.is_primary));
    if (primaryIdx < 0) primaryIdx = Number(offers[activeIdx]?.primary_photo_index) || 0;
    existing.forEach((p, i) => {
      p.is_primary = i === primaryIdx;
    });
    o.photos = existing.filter((p) => String(p.url || "").trim());
    o.primary_photo_index = primaryIdx;
    return o;
  }

  function syncSubmitUploadLock() {
    if (!(submitBtn instanceof HTMLButtonElement)) return;
    submitBtn.disabled = !isEditable || photoUploadsInFlight > 0;
  }

  function syncOfferFromForm() {
    if (!offers.length) return;
    offers[activeIdx] = withLinkedRequestIndex(readOfferFromForm(), vehicleRequests);
  }

  function renderVreqList() {
    if (!(vreqList instanceof HTMLElement)) return;
    vreqList.innerHTML = vehicleRequests.map((vr) => renderVehicleCard(vr, currency)).join("");
    vreqList.querySelectorAll(".lhai-par-car__alt-btn").forEach((btn) => {
      if (!(btn instanceof HTMLButtonElement)) return;
      if (!allowAlternatives) {
        btn.disabled = true;
        btn.hidden = true;
      }
    });
    vreqList.querySelectorAll("[data-action]").forEach((btn) => {
      if (!(btn instanceof HTMLButtonElement)) return;
      const action = btn.getAttribute("data-action");
      const index = Number(btn.getAttribute("data-index"));
      if (!isEditable) btn.disabled = true;
      btn.addEventListener("click", () => {
        syncOfferFromForm();
        const isAlt = action === "alt";
        const next = createBlankCarOfferForAdd({ linkedRequestIndex: index, isAlternative: isAlt });
        offers.push(next);
        activeIdx = offers.length - 1;
        persistCarOfferDraft();
        renderOffersUi();
      });
    });
  }

  function renderOffersUi() {
    if (!(offerTabs instanceof HTMLElement) || !(offerFields instanceof HTMLElement)) return;
    if (offers[activeIdx]) {
      offers[activeIdx] = withLinkedRequestIndex(offers[activeIdx], vehicleRequests);
    }
    offerTabs.innerHTML = offers
      .map((o, i) => {
        const title = buildAutoOfferTitle(o) || `제안 ${i + 1}`;
        return `<button type="button" class="lhai-par-car__tab ${i === activeIdx ? "is-active" : ""}" data-idx="${i}">${escHtml(title)}${o.is_alternative ? " · 대안" : ""}</button>`;
      })
      .join("");
    offerTabs.querySelectorAll(".lhai-par-car__tab").forEach((btn) => {
      btn.addEventListener("click", () => {
        syncOfferFromForm();
        persistCarOfferDraft();
        activeIdx = Number(btn.getAttribute("data-idx"));
        renderOffersUi();
      });
    });
    offerFields.innerHTML = renderOfferFields(offers[activeIdx] || createEmptyCarOffer({}), !isEditable, {
      uploading: photoUploadsInFlight > 0,
      maxPhotos: maxPhotosPerOffer,
      vehicleRequests,
    });
    bindOfferFieldEvents();
    bindCarPhotoEvents();
    syncSubmitUploadLock();
  }

  /** @param {File[]} files */
  async function uploadPhotoFiles(files) {
    if (typeof uploadOfferPhotoFn !== "function") {
      window.alert("사진 업로드 API를 사용할 수 없습니다.");
      return;
    }
    syncOfferFromForm();
    const list = Array.isArray(offers[activeIdx].photos) ? [...offers[activeIdx].photos] : [];
    const offerId = String(offers[activeIdx].offer_id || "").trim();
    const batch = Array.from(files).filter((f) => f && f.size > 0);
    if (!batch.length) return;

    photoUploadsInFlight += 1;
    renderOffersUi();
    try {
      for (const file of batch) {
        if (list.length >= maxPhotosPerOffer) {
          window.alert(`사진은 제안당 최대 ${maxPhotosPerOffer}장까지입니다.`);
          break;
        }
        const prepErr = validateBidOfferPhotoFile(file);
        if (prepErr) {
          window.alert(prepErr);
          continue;
        }
        let uploadFile = file;
        try {
          uploadFile = await prepareBidOfferPhotoFileForUpload(file);
        } catch (compressErr) {
          window.alert(
            compressErr instanceof Error ? compressErr.message : "사진을 처리하지 못했습니다.",
          );
          continue;
        }
        const res = await uploadOfferPhotoFn(uploadFile, { offerId });
        const url = String(res?.url || "").trim();
        if (!url) throw new Error("업로드 URL을 받지 못했습니다.");
        const isFirst = list.length === 0;
        list.push({
          asset_id: String(res.asset_id || "").trim() || undefined,
          url,
          thumbnail_url: String(res.thumbnail_url || url).trim(),
          caption: String(res.caption || "").trim(),
          is_primary: isFirst,
        });
        if (isFirst) offers[activeIdx].primary_photo_index = 0;
      }
      offers[activeIdx].photos = list;
    } catch (err) {
      window.alert(err instanceof Error ? err.message : "사진 업로드에 실패했습니다.");
    } finally {
      photoUploadsInFlight = Math.max(0, photoUploadsInFlight - 1);
      persistCarOfferDraft();
      renderOffersUi();
    }
  }

  function bindCarPhotoEvents() {
    if (!(offerFields instanceof HTMLElement)) return;

    offerFields.querySelectorAll('[data-action="remove-photo"]').forEach((btn) => {
      btn.addEventListener("click", () => {
        syncOfferFromForm();
        const idx = Number(btn.getAttribute("data-photo-index"));
        const list = Array.isArray(offers[activeIdx].photos) ? [...offers[activeIdx].photos] : [];
        if (Number.isFinite(idx)) list.splice(idx, 1);
        if (list.length && !list.some((p) => p.is_primary)) {
          list[0].is_primary = true;
          offers[activeIdx].primary_photo_index = 0;
        }
        offers[activeIdx].photos = list;
        persistCarOfferDraft();
        renderOffersUi();
      });
    });

    offerFields.querySelectorAll('[data-action="set-primary"]').forEach((btn) => {
      btn.addEventListener("click", () => {
        syncOfferFromForm();
        const idx = Number(btn.getAttribute("data-photo-index"));
        const list = Array.isArray(offers[activeIdx].photos) ? offers[activeIdx].photos : [];
        list.forEach((p, i) => {
          p.is_primary = i === idx;
        });
        offers[activeIdx].primary_photo_index = idx;
        offers[activeIdx].photos = list;
        persistCarOfferDraft();
        renderOffersUi();
      });
    });

    const uploadInput = offerFields.querySelector('[data-action="upload-photo"]');
    if (uploadInput instanceof HTMLInputElement) {
      uploadInput.addEventListener("change", () => {
        const picked = uploadInput.files ? Array.from(uploadInput.files) : [];
        uploadInput.value = "";
        void uploadPhotoFiles(picked);
      });
    }

    const dropzone = offerFields.querySelector('[data-action="photo-dropzone"]');
    if (dropzone instanceof HTMLElement && isEditable) {
      dropzone.addEventListener("dragover", (ev) => {
        ev.preventDefault();
        dropzone.classList.add("is-dragover");
      });
      dropzone.addEventListener("dragleave", () => {
        dropzone.classList.remove("is-dragover");
      });
      dropzone.addEventListener("drop", (ev) => {
        ev.preventDefault();
        dropzone.classList.remove("is-dragover");
        const dt = ev.dataTransfer;
        const dropped = dt?.files ? Array.from(dt.files) : [];
        void uploadPhotoFiles(dropped);
      });
    }

    const addUrlBtn = offerFields.querySelector('[data-action="add-photo-url"]');
    if (addUrlBtn instanceof HTMLButtonElement) {
      addUrlBtn.addEventListener("click", () => {
        syncOfferFromForm();
        const urlEl = offerFields.querySelector('[name="advanced_photo_url"]');
        const raw = urlEl instanceof HTMLInputElement ? urlEl.value.trim() : "";
        if (!raw) return;
        if (!/^https?:\/\//i.test(raw)) {
          window.alert("URL은 http:// 또는 https://로 시작해야 합니다.");
          return;
        }
        const list = Array.isArray(offers[activeIdx].photos) ? [...offers[activeIdx].photos] : [];
        if (list.length >= maxPhotosPerOffer) {
          window.alert(`사진은 제안당 최대 ${maxPhotosPerOffer}장까지입니다.`);
          return;
        }
        const isFirst = list.length === 0;
        list.push({
          url: raw,
          thumbnail_url: raw,
          caption: "",
          is_primary: isFirst,
        });
        offers[activeIdx].photos = list;
        if (urlEl instanceof HTMLInputElement) urlEl.value = "";
        renderOffersUi();
      });
    }
  }

  function bindOfferFieldEvents() {
    if (!(offerFields instanceof HTMLElement)) return;

    const setManualOverride = (on) => {
      const hid = offerFields.querySelector('[name="estimated_total_manual_override"]');
      if (hid instanceof HTMLInputElement) hid.value = on ? "1" : "0";
      if (offers[activeIdx]) offers[activeIdx].estimated_total_manual_override = on;
    };

    const recalc = (forceAuto = false) => {
      const o = readOfferFromForm();
      const out = offerFields.querySelector('[name="estimated_total_display"]');
      const totalInput = offerFields.querySelector('[name="estimated_total"]');
      const computed = computeOfferEstimatedTotal(o);
      if (out instanceof HTMLOutputElement) {
        out.textContent = formatMoney(computed, currency);
      }
      if (!o.estimated_total_manual_override || forceAuto) {
        if (totalInput instanceof HTMLInputElement) totalInput.value = String(computed || "");
        setManualOverride(false);
      }
    };

    offerFields.querySelectorAll("input, select, textarea").forEach((el) => {
      if (el instanceof HTMLInputElement && el.name === "estimated_total") return;
      el.addEventListener("input", () => {
        recalc(false);
        persistCarOfferDraft();
      });
      el.addEventListener("change", () => {
        recalc(false);
        persistCarOfferDraft();
      });
    });

    const totalInput = offerFields.querySelector('[name="estimated_total"]');
    if (totalInput instanceof HTMLInputElement) {
      totalInput.addEventListener("input", () => {
        setManualOverride(true);
        syncOfferFromForm();
        persistCarOfferDraft();
      });
      totalInput.addEventListener("change", () => {
        setManualOverride(true);
        persistCarOfferDraft();
      });
    }

    const kind = offerFields.querySelector('[name="offer_kind"]');
    if (kind instanceof HTMLSelectElement) {
      kind.addEventListener("change", () => {
        const altRow = offerFields.querySelector(".lhai-par-car__alt-reason");
        const isAlt = kind.value === "ALTERNATIVE";
        if (altRow instanceof HTMLElement) altRow.classList.toggle("lhai-par-car__hidden", !isAlt);
        recalc(false);
      });
    }

    recalc(true);
  }

  if (globalMsg instanceof HTMLTextAreaElement && isEditable) {
    globalMsg.addEventListener("input", () => persistCarOfferDraft());
    globalMsg.addEventListener("change", () => persistCarOfferDraft());
  }

  if (vehicleRequests.length) renderVreqList();
  renderOffersUi();

  root.querySelector("#partnerCarApplyDefaultsBtn")?.addEventListener("click", () => {
    syncOfferFromForm();
    const o = offers[activeIdx];
    if (!o) return;
    if (!o.location) o.location = String(carReq.location || cust.location || "");
    if (!o.vehicle_condition && vehicleRequests[0]) {
      o.vehicle_condition = vehicleRequests[0].vehicle_condition || "USED";
    }
    if (!o.currency) o.currency = currency;
    offers[activeIdx] = o;
    persistCarOfferDraft();
    renderOffersUi();
  });

  root.querySelector("#partnerCarCopyOfferBtn")?.addEventListener("click", () => {
    syncOfferFromForm();
    offers.push(cloneOffer(offers[activeIdx]));
    activeIdx = offers.length - 1;
    persistCarOfferDraft();
    renderOffersUi();
  });

  root.querySelector("#partnerCarAddOfferBtn")?.addEventListener("click", () => {
    syncOfferFromForm();
    const linked = offers[activeIdx]?.linked_request_index;
    const linkedRequestIndex =
      linked != null && linked !== "" && Number.isFinite(Number(linked)) && Number(linked) >= 1
        ? Math.floor(Number(linked))
        : null;
    offers.push(
      withLinkedRequestIndex(
        createBlankCarOfferForAdd({ linkedRequestIndex, isAlternative: false }),
        vehicleRequests,
      ),
    );
    activeIdx = offers.length - 1;
    persistCarOfferDraft();
    renderOffersUi();
  });

  root.querySelector("#partnerCarRemoveOfferBtn")?.addEventListener("click", () => {
    if (offers.length <= 1) {
      window.alert("최소 1개의 제안이 필요합니다.");
      return;
    }
    offers.splice(activeIdx, 1);
    activeIdx = Math.min(activeIdx, offers.length - 1);
    renderOffersUi();
  });

  root.querySelector("#partnerCarOpenMessagesBtn")?.addEventListener("click", () => {
    if (typeof openMessagesFn === "function") openMessagesFn();
    else {
      const tid = String(data.thread_id || "").trim();
      if (tid) {
        window.location.href = `partner-assigned-request.html?thread_id=${encodeURIComponent(tid)}`;
      }
    }
  });

  if (form instanceof HTMLFormElement) {
    form.addEventListener("submit", async (ev) => {
      ev.preventDefault();
      if (!isEditable) return;
      syncOfferFromForm();
      offers = ensureOffersLinkedRequestIndexes(offers, vehicleRequests);
      if (formErr instanceof HTMLElement) {
        formErr.hidden = true;
        formErr.textContent = "";
      }
      if (photoUploadsInFlight > 0) {
        if (formErr instanceof HTMLElement) {
          formErr.hidden = false;
          formErr.textContent = "사진 업로드가 끝날 때까지 기다려 주세요.";
        }
        return;
      }
      const verr = validateCarOffersForSubmit(offers, {
        allowAlternatives,
        requiresOfferPhotos: requiresOfferPhotos === true,
        maxPhotosPerOffer,
        uploadsInProgress: photoUploadsInFlight > 0,
      });
      if (verr) {
        if (formErr instanceof HTMLElement) {
          formErr.hidden = false;
          formErr.textContent = verr;
        }
        return;
      }
      const gm = globalMsg instanceof HTMLTextAreaElement ? globalMsg.value : "";
      const payload = buildCarSubmitPayload(offers, gm, vehicleRequests);
      if (submitBtn instanceof HTMLButtonElement) submitBtn.disabled = true;
      try {
        const next = await submitFn(payload);
        if (bidRequestId) clearPartnerCarOfferDraft(bidRequestId);
        onDetailUpdate(next);
      } catch (err) {
        const msg = err instanceof Error ? err.message : "제출에 실패했습니다.";
        if (formErr instanceof HTMLElement) {
          formErr.hidden = false;
          formErr.textContent = msg;
        }
      } finally {
        syncSubmitUploadLock();
      }
    });
  }
}
