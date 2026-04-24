import { loadSidebar } from "../components/sidebar.js";
import { quoteApi, serviceCatalogAdminApi } from "../core/api.js";
import { APP_CONFIG } from "../core/config.js";
import { ensureAdminAccess, protectCurrentPage } from "../core/guards.js";
import { applyI18nToDom } from "../core/i18n-dom.js";
import { formatSurveyAnswerForDisplay } from "../core/survey-answer-display.js";
import { formatDate, formatMoney, safeText } from "../core/utils.js";

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

/** 고객 제안 총액 = 선택 서비스 단가 합계(서버도 동일 규칙으로 저장). */
function getServiceUnitPricesSum() {
  const vals = Object.values(getServiceUnitPriceMapFromInputs());
  const sum = vals.reduce((s, v) => s + Number(v || 0), 0);
  return Math.round(sum * 100) / 100;
}

function buildQuoteEditorPayload() {
  const unitPriceMap = getServiceUnitPriceMapFromInputs();
  return {
    service_name: (qs("#qpServiceName")?.value || "").trim(),
    estimated_cost: getServiceUnitPricesSum(),
    service_unit_prices: unitPriceMap,
    internal_notes: qs("#qpInternalNotes")?.value || "",
    customer_facing_note: qs("#qpCustomerNote")?.value || "",
  };
}

function syncSelectedServiceTotal() {
  const totalEl = qs("#qpSelectedServiceTotal");
  if (!totalEl) return;
  const vals = Object.values(getServiceUnitPriceMapFromInputs());
  const total = vals.reduce((sum, v) => sum + Number(v || 0), 0);
  totalEl.textContent = formatMoney(total, "USD");
}

function renderSelectedServicePriceSummary(selectedServices, priceByServiceId) {
  const listEl = qs("#qpSelectedServicePriceEditor");
  const emptyEl = qs("#qpSelectedServicePriceEmpty");
  const totalEl = qs("#qpSelectedServiceTotal");
  if (!listEl || !totalEl) return;

  const rows = Array.isArray(selectedServices) ? selectedServices : [];
  if (!rows.length) {
    listEl.innerHTML = "";
    if (emptyEl) emptyEl.hidden = false;
    totalEl.textContent = "—";
    return;
  }

  if (emptyEl) emptyEl.hidden = true;

  const deliverySummaryHtml = rows
    .map((s) => {
      if (!s || typeof s !== "object") return "";
      const title = safeText(s.title || s.id || "서비스");
      const { headline, detail } = describeCustomerDeliveryPick(s);
      return `
        <div class="lhai-quote-prep__delivery-item">
          <p class="lhai-quote-prep__delivery-item-title">${title}</p>
          <p class="lhai-quote-prep__delivery-item-pick"><strong>${safeText(headline)}</strong></p>
          ${detail ? `<p class="lhai-help lhai-quote-prep__delivery-item-detail">${safeText(detail)}</p>` : ""}
        </div>
      `;
    })
    .filter(Boolean)
    .join("");

  const priceInputsHtml = rows
    .map((s) => {
      if (!s || typeof s !== "object") return "";
      const sid = String(s.id || "").trim();
      const title = safeText(s.title || s.id || "서비스");
      const unit = priceByServiceId[sid];
      const value = unit && unit.amount != null ? Number(unit.amount || 0) : 0;
      return `
        <div class="u-mb-2">
          <label class="lhai-label" for="qpSvcPrice_${safeText(sid)}">${title}</label>
          <input
            class="lhai-input"
            id="qpSvcPrice_${safeText(sid)}"
            data-service-price-id="${safeText(sid)}"
            type="number"
            min="0"
            step="0.01"
            value="${Number.isFinite(value) ? value : 0}"
          />
        </div>
      `;
    })
    .join("");

  listEl.innerHTML = `
    <div class="lhai-quote-prep__delivery-box" role="region" aria-label="고객이 선택한 전달 방식">
      <p class="lhai-quote-prep__delivery-box-title">고객이 선택한 전달 방식</p>
      ${deliverySummaryHtml || `<p class="lhai-help">전달 방식 정보가 없습니다.</p>`}
    </div>
    ${priceInputsHtml}
  `;
  listEl.querySelectorAll("[data-service-price-id]").forEach((el) => {
    el.addEventListener("input", () => syncSelectedServiceTotal());
  });
  syncSelectedServiceTotal();
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
  const cats = (survey.selected_categories || [])
    .map((c) => (c && typeof c === "object" ? c.title || c.id : ""))
    .filter(Boolean);
  const services = Array.isArray(survey.selected_services) ? survey.selected_services : [];
  const answers = Array.isArray(survey.detailed_answers) ? survey.detailed_answers : [];

  let html = `<h3 class="lhai-quote-prep__subhead">기본 정보</h3><dl class="lhai-quote-prep__dl">`;
  html += `<dt>아이디</dt><dd>${safeText(customerUsername || "—")}</dd>`;
  html += `<dt>이름</dt><dd>${safeText(name)}</dd>`;
  html += `<dt>이메일</dt><dd>${safeText(email)}</dd>`;
  html += `<dt>생년월일</dt><dd>${safeText(common.profile_birth_date || "—")}</dd>`;
  html += `<dt>입국·시작 예정</dt><dd>${safeText(common.entry_date || "—")}</dd>`;
  html += `<dt>이동 인원</dt><dd>${safeText(formatHousehold(common))}</dd>`;
  html += `<dt>희망 주</dt><dd>${safeText(common.target_state || "—")}</dd>`;
  html += `<dt>희망 도시</dt><dd>${safeText(common.target_city || "—")}</dd>`;
  html += `<dt>선호 언어</dt><dd>${safeText(PREF_LANG[common.preferred_language] || common.preferred_language || "—")}</dd>`;
  html += `</dl>`;

  html += `<h3 class="lhai-quote-prep__subhead">도움 영역</h3><ul class="lhai-quote-prep__list">`;
  html += (cats.length ? cats : ["—"]).map((t) => `<li>${safeText(t)}</li>`).join("");
  html += `</ul>`;

  html += `<h3 class="lhai-quote-prep__subhead">선택 서비스 · 전달 방식</h3><ul class="lhai-quote-prep__list lhai-quote-prep__list--services">`;
  if (!services.length) {
    html += `<li>—</li>`;
  } else {
    for (const s of services) {
      if (!s || typeof s !== "object") continue;
      const { headline, detail, catalogLabel } = describeCustomerDeliveryPick(s);
      const sid = String(s.id || "").trim();
      const unit = priceByServiceId[sid];
      const unitText =
        unit && unit.amount != null
          ? `${formatMoney(Number(unit.amount || 0), unit.currency || "USD")}`
          : `—`;
      html += `<li class="lhai-quote-prep__svc-li">`;
      html += `<div class="lhai-quote-prep__svc-li-title">${safeText(s.title || s.id || "")}</div>`;
      html += `<p class="lhai-quote-prep__svc-li-pick"><strong>${safeText(headline)}</strong></p>`;
      if (detail) {
        html += `<p class="lhai-help lhai-quote-prep__svc-li-detail">${safeText(detail)}</p>`;
      }
      html += `<p class="lhai-help lhai-quote-prep__svc-li-meta">카탈로그 범위: ${safeText(catalogLabel)} · 제안 단가: ${unitText}</p>`;
      html += `</li>`;
    }
  }
  html += `</ul>`;

  html += `<h3 class="lhai-quote-prep__subhead">추가 응답</h3><dl class="lhai-quote-prep__dl">`;
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
  html += `</dl>`;

  html += `<h3 class="lhai-quote-prep__subhead">접수 메타</h3><dl class="lhai-quote-prep__dl">`;
  html += `<dt>견적 ID</dt><dd>${safeText(quote.id)}</dd>`;
  html += `<dt>고객 프로필</dt><dd>${safeText(quote.customer_profile_id || "—")}</dd>`;
  html += `<dt>제출 시각</dt><dd>${safeText(formatDate(quote.created_at))}</dd>`;
  html += `<dt>검토 상태</dt><dd>${safeText(survey.review_state || rd.workflow_state || "—")}</dd>`;
  html += `</dl>`;

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
  renderSelectedServicePriceSummary(selectedServices, priceByServiceId);
  fillEditor(quote);

  const isDraft = String(quote.status || "").toUpperCase() === "DRAFT";
  const warn = qs("#qpEditorWarn");
  const badge = qs("#qpStatusBadge");
  if (badge) {
    badge.textContent = String(quote.status || "");
    badge.className = `lhai-quote-prep__badge ${isDraft ? "lhai-quote-prep__badge--draft" : "lhai-quote-prep__badge--locked"}`;
  }
  if (warn) {
    if (!isDraft) {
      warn.hidden = false;
      warn.textContent =
        "이 견적은 초안이 아닙니다. 저장은 서버 정책에 따라 거부되거나 반영되지 않을 수 있습니다. 필요하면 견적 목록에서 상태를 확인하세요.";
    } else {
      warn.hidden = true;
      warn.textContent = "";
    }
  }

  const form = qs("#qpForm");
  if (!isDraft && form) {
    form.querySelectorAll("input, textarea, button").forEach((el) => {
      if (el.id === "qpProposeLink") return;
      if (el.tagName === "A") return;
      el.setAttribute("disabled", "disabled");
    });
  }
  const saveBtn = qs("#qpSaveBtn");
  const statusEl = qs("#qpSaveStatus");
  const proposeBtn = qs("#qpProposeBtn");
  if (proposeBtn instanceof HTMLButtonElement) proposeBtn.disabled = !isDraft;

  proposeBtn?.addEventListener("click", async () => {
    if (String(quote?.status || "").toUpperCase() !== "DRAFT") {
      if (statusEl) statusEl.textContent = "초안 상태에서만 견적 제안을 할 수 있습니다.";
      return;
    }

    const serviceName = (qs("#qpServiceName")?.value || "").trim();
    const lineSum = getServiceUnitPricesSum();

    const clientErrors = [];
    if (!serviceName) clientErrors.push("서비스/패키지 표시명");
    if (!(lineSum > 0)) clientErrors.push("서비스 단가 합계(0 초과)");
    if (clientErrors.length) {
      if (statusEl) statusEl.textContent = `견적 제안 전 필수 항목을 채워 주세요: ${clientErrors.join(", ")}`;
      return;
    }

    if (statusEl) statusEl.textContent = "견적 제안 처리 중…";
    if (proposeBtn instanceof HTMLButtonElement) proposeBtn.disabled = true;
    if (saveBtn instanceof HTMLButtonElement) saveBtn.disabled = true;

    try {
      // Propose 직전에 현재 단가/합계를 서버 Draft에 먼저 저장해
      // 서버 전환 검증(estimated_cost > 0)과 화면 상태를 일치시킵니다.
      await quoteApi.update(qid, buildQuoteEditorPayload());
      await quoteApi.transition(qid, "PROPOSED", "Proposed by admin panel");
      const refreshed = await quoteApi.getDetail(qid);
      renderRequest(refreshed, priceByServiceId);
      renderSelectedServicePriceSummary(selectedServices, priceByServiceId);
      fillEditor(refreshed);

      const nowIsDraft = String(refreshed.status || "").toUpperCase() === "DRAFT";
      const badge = qs("#qpStatusBadge");
      const warn = qs("#qpEditorWarn");
      if (badge) {
        badge.textContent = String(refreshed.status || "");
        badge.className = `lhai-quote-prep__badge ${nowIsDraft ? "lhai-quote-prep__badge--draft" : "lhai-quote-prep__badge--locked"}`;
      }
      if (warn) {
        if (!nowIsDraft) {
          warn.hidden = false;
          warn.textContent =
            "이 견적은 초안이 아닙니다. 고객에게 제안된 상태이므로 이 화면에서는 더 이상 수정되지 않습니다.";
        } else {
          warn.hidden = true;
          warn.textContent = "";
        }
      }

      if (form && !nowIsDraft) {
        form.querySelectorAll("input, textarea, button").forEach((el) => {
          if (el.id === "qpProposeLink") return;
          if (el.tagName === "A") return;
          el.setAttribute("disabled", "disabled");
        });
      }

      if (proposeBtn instanceof HTMLButtonElement) proposeBtn.disabled = !nowIsDraft;
      if (statusEl) {
        if (nowIsDraft) {
          statusEl.textContent = "견적 제안에 실패했습니다. 필수 항목을 다시 확인해 주세요.";
        } else {
          statusEl.textContent = "견적이 제안 상태로 전환되었고, 고객에게 검토용 알림이 발송되었습니다.";
        }
      }
    } catch (e) {
      const msg = e && typeof e.message === "string" ? e.message : String(e);
      if (statusEl) statusEl.textContent = `견적 제안 실패: ${msg}`;
    } finally {
      if (saveBtn instanceof HTMLButtonElement) saveBtn.disabled = false;
    }
  });

  form?.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    if (!isDraft) {
      if (statusEl) statusEl.textContent = "초안 상태에서만 초안을 저장할 수 있습니다.";
      return;
    }
    if (saveBtn instanceof HTMLButtonElement) saveBtn.disabled = true;
    if (statusEl) statusEl.textContent = "저장 중…";
    try {
      const payload = buildQuoteEditorPayload();
      await quoteApi.update(qid, payload);
      if (statusEl) statusEl.textContent = "초안이 저장되었습니다. 고객에게 전달하려면 견적 제안을 진행하세요.";
    } catch (e) {
      const msg = e && typeof e.message === "string" ? e.message : String(e);
      if (statusEl) statusEl.textContent = `저장 실패: ${msg}`;
    } finally {
      if (saveBtn instanceof HTMLButtonElement) saveBtn.disabled = false;
    }
  });
}

void main();
