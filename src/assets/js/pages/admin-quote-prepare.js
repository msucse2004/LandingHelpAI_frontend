import { loadSidebar } from "../components/sidebar.js";
import { quoteApi, serviceCatalogAdminApi } from "../core/api.js";
import { ensureAdminAccess, protectCurrentPage } from "../core/guards.js";
import { applyI18nToDom } from "../core/i18n-dom.js";
import { formatSurveyAnswerForDisplay } from "../core/survey-answer-display.js";
import { formatDate, formatMoney, safeText } from "../core/utils.js";
import {
  ADMIN_FEE_LINE_TITLE,
  buildCustomerPreviewStateFromEditor,
  buildQuoteEditorPayloadFromEditor,
  computeDefaultAdminFee,
  computeQuoteTotal,
  customerDisplayNameFromQuote,
  formatQuoteStatusLabel,
  getQuoteReadonlyWarnMessage,
  getQuoteStatusBadgeModifier,
  isQuoteDraft,
  normalizeAdminFee,
  normalizeQuoteStatus,
  proposeQuoteToCustomer,
  readAdminFeeFromQuote,
  validateProposeFields,
} from "./admin-quote-prepare-logic.js";

const DELIVERY_KO = {
  ai_guide: "Landing Help AI Agent",
  in_person: "대면 지원",
  ai_plus_human: "AI + 선택 대면",
  general: "일반",
};

/**
 * 설문 스냅샷 `selected_services[]` 행 — 고객이 고른 전달 방식 vs 카탈로그 버킷(`delivery_mode`).
 * @param {Record<string, unknown>} s
 * @returns {{ headline: string, detail: string, catalogLabel: string }}
 */
function describeCustomerDeliveryPick(s) {
  if (!s || typeof s !== "object") {
    return { headline: "—", detail: "", catalogLabel: "—" };
  }
  const picked = String(s.selected_delivery_mode || "").trim().toUpperCase();
  const dm = String(s.delivery_mode || "").trim();
  const catalogLabel = DELIVERY_KO[dm] || dm || "—";

  if (picked === "AI_AGENT") {
    return {
      headline: "고객 선택: Landing Help AI Agent",
      detail: "디지털 안내·체크리스트 중심으로 진행합니다.",
      catalogLabel,
    };
  }
  if (picked === "IN_PERSON") {
    return {
      headline: "고객 선택: 대면 지원",
      detail: "담당자·현장 지원이 포함된 방식으로 진행합니다.",
      catalogLabel,
    };
  }
  if (dm === "ai_guide") {
    return {
      headline: "전달 방식: Landing Help AI Agent만 제공",
      detail: "이 서비스는 카탈로그상 디지털 안내만 제공됩니다.",
      catalogLabel,
    };
  }
  if (dm === "in_person") {
    return {
      headline: "전달 방식: 대면 지원만 제공",
      detail: "이 서비스는 카탈로그상 대면 지원만 제공됩니다.",
      catalogLabel,
    };
  }
  if (dm === "ai_plus_human") {
    return {
      headline: "고객 전달 선택: 확인 필요",
      detail:
        "카탈로그상 AI 또는 대면 중 하나를 고르게 되어 있으나, 제출 데이터에 선택값이 없습니다. 고객 화면에서 다시 확인하거나 메시지로 확인해 주세요.",
      catalogLabel,
    };
  }
  return {
    headline: catalogLabel,
    detail: "",
    catalogLabel,
  };
}

const PREF_LANG = {
  ko: "한국어",
  en: "영어",
  mix: "한국어 + 영어",
  other: "기타",
};

function qs(sel) {
  return document.querySelector(sel);
}

function renderQuoteStatusBadge(badgeEl, status) {
  if (!badgeEl) return;
  const key = normalizeQuoteStatus(status);
  const label = formatQuoteStatusLabel(status);
  badgeEl.textContent = label;
  badgeEl.title = key && label !== key ? key : "";
  badgeEl.className = `lhai-quote-prep__badge lhai-quote-prep__badge--${getQuoteStatusBadgeModifier(status)}`;
}

/** @param {Record<string, unknown>} quote @returns {boolean} isDraft */
function applyQuoteEditorReadonlyState(quote) {
  const isDraft = normalizeQuoteStatus(quote?.status) === "DRAFT";
  const form = qs("#qpForm");
  const warn = qs("#qpEditorWarn");
  const badge = qs("#qpStatusBadge");
  const saveBtn = qs("#qpSaveBtn");
  const proposeBtn = qs("#qpProposeBtn");
  const headingLabel = qs("#qpEditorHeadingLabel");
  const kicker = qs("#qpEditorKicker");

  renderQuoteStatusBadge(badge, quote?.status);

  if (headingLabel) {
    headingLabel.textContent = isDraft ? "견적 초안" : "견적 내용";
  }

  if (kicker) {
    if (isDraft) {
      kicker.innerHTML =
        '저장하면 초안만 갱신됩니다. 내용을 확인한 뒤 <strong>고객에게 견적 보내기</strong>로 검토용 견적을 전달하세요.';
    } else {
      kicker.textContent =
        "고객에게 전달된 견적 내용을 확인할 수 있습니다. 변경이 필요하면 견적 목록에서 상태와 후속 절차를 확인하세요.";
    }
  }

  if (warn) {
    if (!isDraft) {
      warn.hidden = false;
      warn.textContent = getQuoteReadonlyWarnMessage(quote?.status);
    } else {
      warn.hidden = true;
      warn.textContent = "";
    }
  }

  if (form) {
    form.classList.toggle("lhai-quote-prep__form--readonly", !isDraft);
    form.querySelectorAll("input, textarea").forEach((el) => {
      if (isDraft) el.removeAttribute("disabled");
      else el.setAttribute("disabled", "disabled");
    });
    form.querySelectorAll("button").forEach((el) => {
      if (isDraft) el.removeAttribute("disabled");
      else el.setAttribute("disabled", "disabled");
    });
  }

  if (saveBtn instanceof HTMLButtonElement) saveBtn.disabled = !isDraft;
  if (proposeBtn instanceof HTMLButtonElement) proposeBtn.disabled = !isDraft;

  return isDraft;
}

/** @type {Record<string, unknown> | null} */
let previewQuoteRef = null;
/** @type {Array<Record<string, unknown>>} */
let previewSelectedServicesRef = [];

/**
 * @param {Record<string, unknown>} quote
 * @param {Array<Record<string, unknown>>} selectedServices
 */
function buildCustomerPreviewState(quote, selectedServices) {
  return buildCustomerPreviewStateFromEditor({
    quote,
    selectedServices,
    unitPriceMap: getServiceUnitPriceMapFromInputs(),
    adminFee: getAdminFeeFromInput(),
    customerNote: (qs("#qpCustomerNote")?.value || "").trim(),
  });
}

/**
 * @param {Record<string, unknown>} quote
 * @param {Array<Record<string, unknown>>} selectedServices
 */
function renderCustomerPreview(quote, selectedServices) {
  const el = qs("#qpCustomerPreview");
  if (!el) return;
  const state = buildCustomerPreviewState(quote, selectedServices);

  const itemsHtml = state.items.length
    ? state.items
        .map(
          (item) => `
        <li class="lhai-quote-prep__preview-row">
          <span class="lhai-quote-prep__preview-row-name">${safeText(item.title)}</span>
          <span class="lhai-quote-prep__preview-row-price">${safeText(item.priceText)}</span>
        </li>
      `,
        )
        .join("")
    : `<li class="lhai-quote-prep__preview-row lhai-quote-prep__preview-row--empty"><span class="lhai-help">표시할 서비스 항목이 없습니다.</span></li>`;

  const noteHtml = state.noteEmpty
    ? `<p class="lhai-quote-prep__preview-note lhai-quote-prep__preview-note--empty">추가 안내 메모가 없습니다.</p>`
    : `<p class="lhai-quote-prep__preview-note">${safeText(state.note)}</p>`;

  el.innerHTML = `
    <div class="lhai-quote-prep__preview-header">
      <h3 class="lhai-quote-prep__preview-title">고객 견적 미리보기</h3>
      <p class="lhai-quote-prep__preview-subtitle">${safeText(state.subtitle)}</p>
    </div>
    <ul class="lhai-quote-prep__preview-list">${itemsHtml}</ul>
    <p class="lhai-quote-prep__preview-total">
      <span class="lhai-quote-prep__preview-total-label">고객에게 제안할 총액</span>
      <span class="lhai-quote-prep__preview-total-amount">${safeText(state.totalText)}</span>
    </p>
    ${noteHtml}
  `;
}

function refreshCustomerPreview() {
  if (!previewQuoteRef) return;
  renderCustomerPreview(previewQuoteRef, previewSelectedServicesRef);
}

function validateProposeClientFields() {
  const total = computeQuoteTotal(getServiceUnitPriceMapFromInputs(), getAdminFeeFromInput());
  return validateProposeFields((qs("#qpServiceName")?.value || "").trim(), total);
}

/**
 * @param {Record<string, unknown>} quote
 * @param {Array<Record<string, unknown>>} selectedServices
 */
function populateProposeConfirmModal(quote, selectedServices) {
  const summaryEl = qs("#qpProposeConfirmSummary");
  if (!summaryEl) return;
  const displayName = customerDisplayNameFromQuote(quote);
  const customerLabel = displayName ? `${displayName}님` : "고객님";
  const state = buildCustomerPreviewState(quote, selectedServices);
  const servicesHtml = state.items.length
    ? `<ul class="lhai-quote-prep__modal-service-list">${state.items
        .map(
          (item) =>
            `<li><span>${safeText(item.title)}</span><span>${safeText(item.priceText)}</span></li>`,
        )
        .join("")}</ul>`
    : `<p class="lhai-help">표시할 서비스 항목이 없습니다.</p>`;
  const noteHtml = state.noteEmpty
    ? `<p class="lhai-help">추가 안내 메모 없음</p>`
    : `<p class="lhai-quote-prep__modal-note">${safeText(state.note)}</p>`;

  summaryEl.innerHTML = `
    <dl class="lhai-quote-prep__modal-summary-grid">
      <dt>고객</dt><dd>${safeText(customerLabel)}</dd>
      <dt>서비스</dt><dd>${servicesHtml}</dd>
      <dt>고객에게 제안할 총액</dt><dd class="lhai-quote-prep__modal-total">${safeText(state.totalText)}</dd>
      <dt>고객에게 보여줄 메모</dt><dd>${noteHtml}</dd>
    </dl>
  `;
}

function openProposeConfirmModal(quote, selectedServices) {
  const dialog = qs("#qpProposeConfirmDialog");
  if (!(dialog instanceof HTMLDialogElement)) return;
  populateProposeConfirmModal(quote, selectedServices);
  dialog.showModal();
  const cancelBtn = qs("#qpProposeConfirmCancel");
  if (cancelBtn instanceof HTMLButtonElement) cancelBtn.focus();
}

function closeProposeConfirmModal() {
  const dialog = qs("#qpProposeConfirmDialog");
  if (dialog instanceof HTMLDialogElement && dialog.open) dialog.close();
}

/** @param {boolean} busy */
function setProposeModalBusy(busy) {
  const cancelBtn = qs("#qpProposeConfirmCancel");
  const confirmBtn = qs("#qpProposeConfirmSubmit");
  const proposeBtn = qs("#qpProposeBtn");
  const saveBtn = qs("#qpSaveBtn");
  if (cancelBtn instanceof HTMLButtonElement) cancelBtn.disabled = busy;
  if (confirmBtn instanceof HTMLButtonElement) {
    confirmBtn.disabled = busy;
    confirmBtn.textContent = busy ? "보내는 중…" : "고객에게 보내기";
  }
  if (proposeBtn instanceof HTMLButtonElement && busy) proposeBtn.disabled = true;
  if (saveBtn instanceof HTMLButtonElement) saveBtn.disabled = busy;
}

function getServiceUnitPriceMapFromInputs() {
  const out = {};
  document.querySelectorAll("[data-service-price-id]").forEach((el) => {
    if (!(el instanceof HTMLInputElement)) return;
    const sid = String(el.dataset.servicePriceId || "").trim();
    if (!sid) return;
    const n = Number(el.value || 0);
    if (!Number.isFinite(n) || n < 0) {
      out[sid] = 0;
      return;
    }
    out[sid] = Math.round(n * 100) / 100;
  });
  return out;
}

/** 고객 제안 총액 = 선택 서비스 단가 합계 + Admin Fee(서버도 동일 규칙으로 저장). */
function getQuoteTotalFromInputs() {
  return computeQuoteTotal(getServiceUnitPriceMapFromInputs(), getAdminFeeFromInput());
}

function getAdminFeeFromInput() {
  const prices = getServiceUnitPriceMapFromInputs();
  const defaultFee = computeDefaultAdminFee(prices);
  const el = qs("#qpAdminFee");
  if (!(el instanceof HTMLInputElement)) {
    return defaultFee;
  }
  return normalizeAdminFee(el.value, defaultFee);
}

function buildQuoteEditorPayload() {
  return buildQuoteEditorPayloadFromEditor({
    serviceName: (qs("#qpServiceName")?.value || "").trim(),
    unitPriceMap: getServiceUnitPriceMapFromInputs(),
    adminFee: getAdminFeeFromInput(),
    customerNote: qs("#qpCustomerNote")?.value || "",
    internalNotes: qs("#qpInternalNotes")?.value || "",
  });
}

function deliverySummaryShort(s) {
  const { headline } = describeCustomerDeliveryPick(s);
  return headline || "—";
}

function syncSelectedServiceTotal() {
  const totalEl = qs("#qpSelectedServiceTotal");
  const heroEl = qs("#qpCustomerTotalHero");
  const total = getQuoteTotalFromInputs();
  const formatted = formatMoney(total, "USD");
  if (totalEl) totalEl.textContent = formatted;
  if (heroEl instanceof HTMLElement) {
    heroEl.hidden = false;
    heroEl.classList.toggle("lhai-quote-prep__total-card--zero", !(total > 0));
  }
  refreshCustomerPreview();
}

function renderSelectedServicePriceSummary(selectedServices, priceByServiceId, adminFeeAmount) {
  const listEl = qs("#qpSelectedServicePriceEditor");
  const emptyEl = qs("#qpSelectedServicePriceEmpty");
  const totalEl = qs("#qpSelectedServiceTotal");
  if (!listEl || !totalEl) return;

  const rows = Array.isArray(selectedServices) ? selectedServices : [];
  const adminFee = normalizeAdminFee(adminFeeAmount, computeDefaultAdminFee(priceByServiceId));

  if (emptyEl) emptyEl.hidden = rows.length > 0;

  const rowHtml = rows
    .map((s) => {
      if (!s || typeof s !== "object") return "";
      const sid = String(s.id || "").trim();
      const title = safeText(s.title || s.id || "서비스");
      const delivery = safeText(deliverySummaryShort(s));
      const unit = priceByServiceId[sid];
      const value = unit && unit.amount != null ? Number(unit.amount || 0) : 0;
      const inputId = `qpSvcPrice_${safeText(sid)}`;
      return `
        <div class="lhai-quote-prep__price-row">
          <div class="lhai-quote-prep__price-main">
            <p class="lhai-quote-prep__price-title">${title}</p>
          </div>
          <p class="lhai-quote-prep__price-subtitle">${delivery}</p>
          <div class="lhai-quote-prep__price-input-wrap">
            <label class="lhai-label lhai-quote-prep__price-input-label" for="${inputId}">단가 (USD)</label>
            <input
              class="lhai-input lhai-quote-prep__price-input"
              id="${inputId}"
              data-service-price-id="${safeText(sid)}"
              type="number"
              min="0"
              step="0.01"
              value="${Number.isFinite(value) ? value : 0}"
            />
          </div>
        </div>
      `;
    })
    .filter(Boolean)
    .join("");

  const adminFeeValue = Number.isFinite(adminFee) ? adminFee : computeDefaultAdminFee(priceByServiceId);

  listEl.innerHTML = `
    <div class="lhai-quote-prep__price-card" role="region" aria-label="견적 항목">
      <div class="lhai-quote-prep__price-row lhai-quote-prep__price-row--head" aria-hidden="true">
        <span class="lhai-quote-prep__price-col lhai-quote-prep__price-col--service">서비스</span>
        <span class="lhai-quote-prep__price-col lhai-quote-prep__price-col--delivery">전달 방식</span>
        <span class="lhai-quote-prep__price-col lhai-quote-prep__price-col--amount">단가</span>
      </div>
      ${rowHtml}
      <div class="lhai-quote-prep__price-row lhai-quote-prep__price-row--admin-fee">
        <div class="lhai-quote-prep__price-main">
          <p class="lhai-quote-prep__price-title">${safeText(ADMIN_FEE_LINE_TITLE)}</p>
          <p class="lhai-help lhai-quote-prep__price-admin-note">플랫폼 관리 수수료 · 기본 서비스 합계의 4% · 견적·청구 총액에 포함</p>
        </div>
        <p class="lhai-quote-prep__price-subtitle" aria-hidden="true">—</p>
        <div class="lhai-quote-prep__price-input-wrap">
          <label class="lhai-label lhai-quote-prep__price-input-label" for="qpAdminFee">단가 (USD)</label>
          <input
            class="lhai-input lhai-quote-prep__price-input"
            id="qpAdminFee"
            type="number"
            min="0"
            step="0.01"
            value="${adminFeeValue}"
          />
        </div>
      </div>
    </div>
  `;
  listEl.querySelectorAll("[data-service-price-id]").forEach((el) => {
    el.addEventListener("input", () => syncSelectedServiceTotal());
  });
  const adminFeeEl = qs("#qpAdminFee");
  if (adminFeeEl instanceof HTMLInputElement) {
    adminFeeEl.addEventListener("input", () => syncSelectedServiceTotal());
  }
  syncSelectedServiceTotal();
  refreshCustomerPreview();
}

function parseAnswerDisplay(aj) {
  if (!aj || typeof aj !== "object") return "—";
  const line = formatSurveyAnswerForDisplay(aj, { yes: "예", no: "아니요" });
  return line.trim() !== "" ? line : "—";
}

function formatHousehold(common) {
  if (!common || typeof common !== "object") return "—";
  const a = Number.parseInt(String(common.adult_count ?? ""), 10);
  const m = Number.parseInt(String(common.minor_count ?? ""), 10);
  if (Number.isNaN(a) && Number.isNaN(m)) return "—";
  const ages = Array.isArray(common.minor_ages) ? common.minor_ages.filter(Boolean).join(", ") : "";
  let s = `성인 ${Number.isNaN(a) ? "—" : a}명 · 미성년 ${Number.isNaN(m) ? "—" : m}명`;
  if (ages) s += ` (미성년 나이: ${ages})`;
  return s;
}

function formatPreferredLanguage(code) {
  const raw = String(code || "").trim();
  if (!raw) return "—";
  return PREF_LANG[raw] || raw;
}

function formatLocationSummary(state, city) {
  const st = String(state || "").trim();
  const ct = String(city || "").trim();
  if (st && ct) return `${st} · ${ct}`;
  if (st) return st;
  if (ct) return ct;
  return "—";
}

function serviceUnitPriceText(sid, priceByServiceId) {
  const unit = priceByServiceId[String(sid || "").trim()];
  if (unit && unit.amount != null) {
    return formatMoney(Number(unit.amount || 0), unit.currency || "USD");
  }
  return "—";
}

function renderRequestSummaryCard({ name, location, entryDate, household, categories, serviceCount, preferredLanguage }) {
  const catChips =
    categories.length > 0
      ? categories.map((t) => `<span class="lhai-quote-prep__summary-chip">${safeText(t)}</span>`).join("")
      : `<span class="lhai-quote-prep__summary-chip lhai-quote-prep__summary-chip--muted">—</span>`;

  return `
    <div class="lhai-quote-prep__summary-card" role="region" aria-label="핵심 요약">
      <h3 class="lhai-quote-prep__summary-title">${safeText(name)}</h3>
      <dl class="lhai-quote-prep__summary-grid">
        <div class="lhai-quote-prep__summary-item">
          <dt>희망 지역</dt>
          <dd>${safeText(location)}</dd>
        </div>
        <div class="lhai-quote-prep__summary-item">
          <dt>입국·시작 예정</dt>
          <dd>${safeText(entryDate)}</dd>
        </div>
        <div class="lhai-quote-prep__summary-item">
          <dt>이동 인원</dt>
          <dd>${safeText(household)}</dd>
        </div>
        <div class="lhai-quote-prep__summary-item">
          <dt>선택 서비스</dt>
          <dd>${safeText(String(serviceCount))}개</dd>
        </div>
        <div class="lhai-quote-prep__summary-item lhai-quote-prep__summary-item--wide">
          <dt>도움 영역</dt>
          <dd class="lhai-quote-prep__summary-chips">${catChips}</dd>
        </div>
        <div class="lhai-quote-prep__summary-item">
          <dt>선호 언어</dt>
          <dd>${safeText(preferredLanguage)}</dd>
        </div>
      </dl>
    </div>
  `;
}

function renderRequest(quote, priceByServiceId = {}) {
  const body = qs("#qpRequestBody");
  if (!body) return;
  const rd = quote.request_details && typeof quote.request_details === "object" ? quote.request_details : {};
  const survey = rd.survey_submission;

  if (!survey || typeof survey !== "object") {
    body.innerHTML = `<p class="lhai-help">이 견적에는 설문 스냅샷(<code>survey_submission</code>)이 없습니다. 오른쪽에서 초안만 편집할 수 있습니다.</p>`;
    return;
  }

  const common = survey.common_info && typeof survey.common_info === "object" ? survey.common_info : {};
  const customerUsername = common.customer_username ? String(common.customer_username).trim() : "";
  const name = [common.profile_first_name, common.profile_last_name].filter(Boolean).join(" ").trim() || "—";
  const email = common.profile_email ? String(common.profile_email) : "—";
  const entryDate = common.entry_date ? String(common.entry_date) : "—";
  const household = formatHousehold(common);
  const location = formatLocationSummary(common.target_state, common.target_city);
  const preferredLanguage = formatPreferredLanguage(common.preferred_language);
  const cats = (survey.selected_categories || [])
    .map((c) => {
      if (!c || typeof c !== "object") return "";
      return String(c.title || c.customer_title || c.name || c.id || "").trim();
    })
    .filter(Boolean);
  const services = Array.isArray(survey.selected_services) ? survey.selected_services : [];
  const answers = Array.isArray(survey.detailed_answers) ? survey.detailed_answers : [];

  let html = renderRequestSummaryCard({
    name,
    location,
    entryDate,
    household,
    categories: cats,
    serviceCount: services.length,
    preferredLanguage,
  });

  html += `<section class="lhai-quote-prep__section" aria-labelledby="qpSectionCustomer">`;
  html += `<h3 class="lhai-quote-prep__section-title" id="qpSectionCustomer">고객 정보</h3>`;
  html += `<dl class="lhai-quote-prep__dl">`;
  html += `<dt>이름</dt><dd>${safeText(name)}</dd>`;
  html += `<dt>이메일</dt><dd>${safeText(email)}</dd>`;
  html += `<dt>생년월일</dt><dd>${safeText(common.profile_birth_date || "—")}</dd>`;
  html += `<dt>입국·시작 예정</dt><dd>${safeText(entryDate)}</dd>`;
  html += `<dt>이동 인원</dt><dd>${safeText(household)}</dd>`;
  html += `<dt>희망 주</dt><dd>${safeText(common.target_state || "—")}</dd>`;
  html += `<dt>희망 도시</dt><dd>${safeText(common.target_city || "—")}</dd>`;
  html += `<dt>선호 언어</dt><dd>${safeText(preferredLanguage)}</dd>`;
  html += `</dl></section>`;

  html += `<section class="lhai-quote-prep__section" aria-labelledby="qpSectionServices">`;
  html += `<h3 class="lhai-quote-prep__section-title" id="qpSectionServices">요청 서비스</h3>`;
  if (!services.length) {
    html += `<p class="lhai-help">선택된 서비스가 없습니다.</p>`;
  } else {
    html += `<ul class="lhai-quote-prep__service-cards">`;
    for (const s of services) {
      if (!s || typeof s !== "object") continue;
      const { headline, detail } = describeCustomerDeliveryPick(s);
      const sid = String(s.id || "").trim();
      const unitText = serviceUnitPriceText(sid, priceByServiceId);
      html += `<li class="lhai-quote-prep__service-card">`;
      html += `<p class="lhai-quote-prep__service-card-name">${safeText(s.title || s.id || "서비스")}</p>`;
      html += `<p class="lhai-quote-prep__service-card-pick"><strong>${safeText(headline)}</strong></p>`;
      if (detail) {
        html += `<p class="lhai-help lhai-quote-prep__service-card-detail">${safeText(detail)}</p>`;
      }
      html += `<p class="lhai-quote-prep__service-card-price"><span class="lhai-quote-prep__service-card-price-label">제안 단가</span> ${safeText(unitText)}</p>`;
      html += `</li>`;
    }
    html += `</ul>`;
  }
  html += `</section>`;

  html += `<section class="lhai-quote-prep__section" aria-labelledby="qpSectionAnswers">`;
  html += `<h3 class="lhai-quote-prep__section-title" id="qpSectionAnswers">추가 응답</h3>`;
  html += `<dl class="lhai-quote-prep__dl">`;
  if (!answers.length) {
    html += `<dt>—</dt><dd>없음</dd>`;
  } else {
    for (const a of answers) {
      if (!a || typeof a !== "object") continue;
      const lab = safeText(a.label || "");
      const aj = a.answer_json && typeof a.answer_json === "object" ? a.answer_json : {};
      const val = safeText(parseAnswerDisplay(aj));
      html += `<dt>${lab || "항목"}</dt><dd>${val}</dd>`;
    }
  }
  html += `</dl></section>`;

  html += `<section class="lhai-quote-prep__section lhai-quote-prep__section--meta" aria-labelledby="qpSectionAdmin">`;
  html += `<h3 class="lhai-quote-prep__section-title" id="qpSectionAdmin">관리 정보</h3>`;
  html += `<div class="lhai-quote-prep__meta-box">`;
  html += `<dl class="lhai-quote-prep__dl lhai-quote-prep__dl--meta">`;
  html += `<dt>아이디</dt><dd>${safeText(customerUsername || "—")}</dd>`;
  html += `<dt>견적 ID</dt><dd>${safeText(quote.id)}</dd>`;
  html += `<dt>고객 프로필</dt><dd>${safeText(quote.customer_profile_id || "—")}</dd>`;
  html += `<dt>검토 상태</dt><dd>${safeText(survey.review_state || rd.workflow_state || "—")}</dd>`;
  html += `<dt>제출 시각</dt><dd>${safeText(formatDate(quote.created_at))}</dd>`;
  html += `</dl></div></section>`;

  body.innerHTML = html;
}

function fillEditor(quote) {
  const sn = qs("#qpServiceName");
  if (sn) sn.value = quote.service_name || "";
  const cn = qs("#qpCustomerNote");
  if (cn) cn.value = quote.customer_facing_note || "";
  const inn = qs("#qpInternalNotes");
  if (inn) inn.value = quote.internal_notes || "";

  const propose = qs("#qpProposeLink");
  if (propose instanceof HTMLAnchorElement) {
    propose.href = "admin-quotes.html";
  }
}

async function main() {
  if (!protectCurrentPage()) return;
  if (!ensureAdminAccess()) return;
  await loadSidebar("#sidebar", "admin");
  applyI18nToDom(document);

  const params = new URLSearchParams(window.location.search);
  const qid = (params.get("id") || params.get("quote_id") || "").trim();
  const errEl = qs("#qpLoadError");
  if (!qid) {
    if (errEl) {
      errEl.hidden = false;
      errEl.textContent = "견적 ID가 필요합니다. URL에 ?id=견적ID 를 붙여 주세요.";
    }
    return;
  }

  let quote;
  try {
    quote = await quoteApi.getDetail(qid);
  } catch (e) {
    const msg = e && typeof e.message === "string" ? e.message : String(e);
    if (errEl) {
      errEl.hidden = false;
      errEl.textContent = `견적을 불러오지 못했습니다. ${msg}`;
    }
    return;
  }

  const root = qs("#qpRoot");
  if (root) root.hidden = false;
  // Survey 스냅샷(selected_services)에는 가격 정보가 없어서, Admin service catalog에서 base_price를 조회해 표시합니다.
  const priceByServiceId = {};
  const surveyServices =
    quote?.request_details?.survey_submission && typeof quote.request_details.survey_submission === "object"
      ? quote.request_details.survey_submission.selected_services
      : [];
  const selectedServices = Array.isArray(surveyServices) ? surveyServices : [];
  const uniqueIds = [...new Set(selectedServices.map((s) => (s && typeof s === "object" ? String(s.id || "") : "")).filter(Boolean))];
  await Promise.all(
    uniqueIds.map(async (sid) => {
      try {
        const pkg = await serviceCatalogAdminApi.getPackage(sid);
        if (pkg) {
          priceByServiceId[sid] = { amount: pkg.base_price, currency: pkg.currency || "USD" };
          return;
        }
      } catch {
        // 설문 스냅샷 id는 패키지가 아니라 service-item UUID인 경우가 많음 → 단가 조회 폴백.
      }
      try {
        const item = await serviceCatalogAdminApi.getServiceItem(sid);
        if (item) {
          const cap = String(item.delivery_capability || "").toUpperCase();
          const useExtra = cap === "IN_PERSON";
          const amount = useExtra
            ? Number(item.extra_price || 0)
            : Number(item.ai_guide_default_price ?? APP_CONFIG.defaultAiGuideUnitPriceUsd);
          priceByServiceId[sid] = {
            amount,
            currency: item.currency || "USD",
          };
        }
      } catch {
        // Ignore missing pricing.
      }
    })
  );
  const existingUnitPrices =
    quote?.request_details &&
    typeof quote.request_details === "object" &&
    quote.request_details.quote_pricing &&
    typeof quote.request_details.quote_pricing === "object" &&
    quote.request_details.quote_pricing.service_unit_prices &&
    typeof quote.request_details.quote_pricing.service_unit_prices === "object"
      ? quote.request_details.quote_pricing.service_unit_prices
      : {};
  Object.entries(existingUnitPrices).forEach(([sid, amount]) => {
    if (!sid) return;
    if (priceByServiceId[sid]) {
      priceByServiceId[sid].amount = Number(amount || 0);
    } else {
      priceByServiceId[sid] = { amount: Number(amount || 0), currency: "USD" };
    }
  });
  renderRequest(quote, priceByServiceId);
  previewQuoteRef = quote;
  previewSelectedServicesRef = selectedServices;
  renderSelectedServicePriceSummary(selectedServices, priceByServiceId, readAdminFeeFromQuote(quote, priceByServiceId));
  fillEditor(quote);
  renderCustomerPreview(quote, selectedServices);

  const customerNoteEl = qs("#qpCustomerNote");
  if (customerNoteEl instanceof HTMLTextAreaElement) {
    customerNoteEl.addEventListener("input", () => refreshCustomerPreview());
  }

  applyQuoteEditorReadonlyState(quote);

  const form = qs("#qpForm");
  const saveBtn = qs("#qpSaveBtn");
  const statusEl = qs("#qpSaveStatus");
  const proposeBtn = qs("#qpProposeBtn");
  const proposeDialog = qs("#qpProposeConfirmDialog");
  const proposeConfirmCancel = qs("#qpProposeConfirmCancel");
  const proposeConfirmSubmit = qs("#qpProposeConfirmSubmit");

  async function executeProposeToCustomer() {
    if (!isQuoteDraft(quote)) {
      if (statusEl) {
        statusEl.textContent =
          "이미 고객에게 보낸 견적이거나 초안이 아니므로 다시 보낼 수 없습니다.";
      }
      return;
    }

    if (statusEl) statusEl.textContent = "고객에게 견적을 보내는 중…";
    setProposeModalBusy(true);

    try {
      const refreshed = await proposeQuoteToCustomer({
        qid,
        buildPayload: buildQuoteEditorPayload,
        quoteApi,
      });
      quote = refreshed;
      previewQuoteRef = refreshed;
      renderRequest(refreshed, priceByServiceId);
      renderSelectedServicePriceSummary(selectedServices, priceByServiceId, readAdminFeeFromQuote(quote, priceByServiceId));
      fillEditor(refreshed);
      renderCustomerPreview(refreshed, selectedServices);
      applyQuoteEditorReadonlyState(refreshed);

      closeProposeConfirmModal();

      const nowIsDraft = isQuoteDraft(refreshed);
      if (statusEl) {
        if (nowIsDraft) {
          statusEl.textContent = "고객에게 견적을 보내지 못했습니다. 필수 항목을 다시 확인해 주세요.";
        } else {
          statusEl.textContent = "고객에게 견적을 보냈습니다. 검토용 알림이 발송되었을 수 있습니다.";
        }
      }
    } catch (e) {
      const msg = e && typeof e.message === "string" ? e.message : String(e);
      if (statusEl) statusEl.textContent = `고객에게 견적 보내기 실패: ${msg}`;
    } finally {
      setProposeModalBusy(false);
      if (proposeBtn instanceof HTMLButtonElement) {
        proposeBtn.disabled = !isQuoteDraft(quote);
      }
      if (saveBtn instanceof HTMLButtonElement) {
        saveBtn.disabled = !isQuoteDraft(quote);
      }
    }
  }

  proposeBtn?.addEventListener("click", () => {
    if (!isQuoteDraft(quote)) {
      if (statusEl) {
        statusEl.textContent =
          "이미 고객에게 보낸 견적이거나 초안이 아니므로 다시 보낼 수 없습니다.";
      }
      return;
    }

    const { clientErrors } = validateProposeClientFields();
    if (clientErrors.length) {
      if (statusEl) {
        statusEl.textContent = `보내기 전 필수 항목을 채워 주세요: ${clientErrors.join(", ")}`;
      }
      return;
    }

    openProposeConfirmModal(quote, selectedServices);
  });

  proposeConfirmCancel?.addEventListener("click", () => closeProposeConfirmModal());
  proposeConfirmSubmit?.addEventListener("click", () => void executeProposeToCustomer());

  if (proposeDialog instanceof HTMLDialogElement) {
    proposeDialog.addEventListener("cancel", (ev) => {
      if (proposeConfirmSubmit instanceof HTMLButtonElement && proposeConfirmSubmit.disabled) {
        ev.preventDefault();
        return;
      }
      ev.preventDefault();
      closeProposeConfirmModal();
    });
    proposeDialog.addEventListener("close", () => {
      setProposeModalBusy(false);
      if (proposeConfirmSubmit instanceof HTMLButtonElement) {
        proposeConfirmSubmit.textContent = "고객에게 보내기";
      }
    });
  }

  form?.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    if (!isQuoteDraft(quote)) {
      if (statusEl) {
        statusEl.textContent =
          "이 견적은 더 이상 초안이 아니므로 저장할 수 없습니다. 견적 목록에서 현재 상태를 확인하세요.";
      }
      return;
    }
    if (saveBtn instanceof HTMLButtonElement) saveBtn.disabled = true;
    if (statusEl) statusEl.textContent = "초안 저장 중…";
    try {
      const payload = buildQuoteEditorPayload();
      await quoteApi.update(qid, payload);
      if (statusEl) {
        statusEl.textContent =
          "초안이 저장되었습니다. 고객에게 보내려면 「고객에게 견적 보내기」를 진행하세요.";
      }
    } catch (e) {
      const msg = e && typeof e.message === "string" ? e.message : String(e);
      if (statusEl) statusEl.textContent = `초안 저장 실패: ${msg}`;
    } finally {
      if (saveBtn instanceof HTMLButtonElement) saveBtn.disabled = !isQuoteDraft(quote);
    }
  });
}

void main();
