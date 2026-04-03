/**
 * Service-driven customer flow:
 * category → common info → service(s) with inline questions → review.
 */
import { serviceCatalogBrowseApi, serviceIntakeCustomerApi, surveyCustomerApi, userCustomerApi } from "../core/api.js";
import { getSession, getAccessToken, getCustomerMessagingProfileId } from "../core/auth.js";
import { t } from "../core/i18n-client.js";
import { initCommonI18nAndApplyDom } from "../core/i18n-dom.js";
import { qs, safeText } from "../core/utils.js";

const esc = safeText;

/** Default badge + explanation (overridden via `t()` keys `common.service_flow.delivery.{mode}.*`). */
const DELIVERY_FALLBACK = {
  ai_guide: {
    badge: "AI 안내",
    explain: "이 서비스는 AI 안내, 체크리스트, 디지털 도움으로 진행됩니다.",
  },
  in_person: {
    badge: "대면 지원",
    explain: "이 서비스는 담당자 또는 현장 지원이 필요합니다.",
  },
  ai_plus_human: {
    badge: "AI + 선택 대면",
    explain: "AI 안내로 시작하며, 필요 시 선택적으로 대면 지원을 받을 수 있습니다.",
  },
  general: {
    badge: "안내형 서비스",
    explain: "다음 단계를 명확하고 단순하게 안내해 드립니다.",
  },
};

/**
 * @param {string} mode backend `delivery_mode`
 * @returns {{ mode: string, badge: string, explain: string }}
 */
function deliveryMeta(mode) {
  const m = mode && DELIVERY_FALLBACK[mode] ? mode : "general";
  const fb = DELIVERY_FALLBACK[m];
  return {
    mode: m,
    badge: t(`common.service_flow.delivery.${m}.badge`, fb.badge),
    explain: t(`common.service_flow.delivery.${m}.explain`, fb.explain),
  };
}

/** @type {{ id: string, name: string, description?: string, sort_order?: number }[]} */
let categories = [];
/** @type {{ id: string, name: string, description?: string, delivery_mode: string, type?: string }[]} */
let serviceItems = [];
let selectedCategoryIds = [];
const categoryModeSummaryById = new Map();
const categoryDeliveryMetaById = new Map();
/** @type {string[]} */
let selectedServiceIds = [];
const serviceItemsByCategoryId = new Map();
const selectedServiceIdsByCategoryId = new Map();
let servicesCategoryOrder = [];
let servicesCategoryIndex = 0;

let commonInfo = {
  profile_first_name: "",
  profile_last_name: "",
  profile_birth_date: "",
  profile_email: "",
  entry_date: "",
  adult_count: "",
  minor_count: "",
  minor_ages: [],
  target_state: "",
  preferred_language: "",
  budget_range: "",
  support_need_level: "",
};

/** phase: 'category' | 'common_info' | 'services' | 'review' */
let phase = "category";
let conditionalQuestions = [];
let conditionalAnswersByItemId = {};
let conditionalOptionsByItemId = {};
let conditionalLoadedGroup = "";

let profilePrefillAttempted = false;
let submittingReview = false;

function conditionalQuestionKey(serviceId, fieldId) {
  return `${serviceId}::${fieldId}`;
}

function setStatus(msg) {
  const el = qs("#sfStatus");
  if (el) el.textContent = msg || "";
}

function categoryTitle(category) {
  const title = (category?.customer_title || "").trim();
  if (title) return title;
  const fallback = (category?.name || "").trim();
  if (!fallback) return t("common.service_flow.unknown_category", "선택한 문제 영역");
  if (/^[a-z0-9_-]+$/i.test(fallback) || fallback.includes("pkg-") || fallback.includes("cat-")) {
    return t("common.service_flow.unknown_category", "선택한 문제 영역");
  }
  return fallback;
}

function serviceTitle(serviceItem) {
  const title = (serviceItem?.customer_title || "").trim();
  if (title) return title;
  const fallback = (serviceItem?.name || "").trim();
  if (!fallback) return t("common.service_flow.unknown_service", "선택 서비스");
  if (/^[a-z0-9_-]+$/i.test(fallback) || fallback.includes("addon-") || fallback.includes("module-")) {
    return t("common.service_flow.unknown_service", "선택 서비스");
  }
  return fallback;
}

function resolveProblemGroup(category) {
  const explicit = String(category?.problem_group || "").trim().toLowerCase();
  if (explicit) return explicit;
  const src = `${category?.customer_title || ""} ${category?.name || ""} ${category?.customer_subtitle || ""}`.toLowerCase();
  if (src.includes("housing") || src.includes("집")) return "housing";
  if (src.includes("mobility") || src.includes("자동차") || src.includes("차량")) return "mobility";
  if (src.includes("family") || src.includes("school") || src.includes("가족") || src.includes("학교")) return "family_school";
  if (src.includes("arrival") || src.includes("입국") || src.includes("setup") || src.includes("초기")) return "arrival_setup";
  if (src.includes("admin") || src.includes("business") || src.includes("행정") || src.includes("llc")) return "admin_business";
  return "";
}

function summarizeDeliveryModes(modeSet) {
  const hasAiOnly = modeSet.has("ai_guide");
  const hasInPersonOnly = modeSet.has("in_person");
  const hasHybrid = modeSet.has("ai_plus_human");
  const hasGeneral = modeSet.has("general");
  const hasAi = hasAiOnly || hasHybrid;
  const hasInPerson = hasInPersonOnly || hasHybrid;
  if (hasAi && hasInPerson) {
    return t(
      "common.service_flow.category_mixed_delivery_short",
      "AI 안내형과 대면 지원형이 함께 있습니다."
    );
  }
  if (hasAiOnly && !hasInPersonOnly && !hasHybrid && !hasGeneral) {
    return t("common.service_flow.category_ai_only_short", "주로 AI 안내형 서비스로 진행됩니다.");
  }
  if (hasInPersonOnly && !hasAiOnly && !hasHybrid && !hasGeneral) {
    return t("common.service_flow.category_inperson_only_short", "주로 대면 지원형 서비스로 진행됩니다.");
  }
  return "";
}

function categoryDeliveryMeta(modeSet) {
  const hasAiGuide = modeSet.has("ai_guide");
  const hasInPerson = modeSet.has("in_person");
  const hasHybrid = modeSet.has("ai_plus_human");
  const hasGeneral = modeSet.has("general");
  const activeTypes = [hasAiGuide, hasInPerson, hasHybrid].filter(Boolean).length;
  const mixed = activeTypes > 1 || (hasGeneral && (hasAiGuide || hasInPerson || hasHybrid));
  if (mixed) {
    return {
      mode: "ai_plus_human",
      badge: t("common.service_flow.category_mixed_badge", "AI + 선택 대면"),
      explain: t(
        "common.service_flow.category_mixed_explain",
        "이 영역에는 여러 진행 방식이 섞여 있을 수 있습니다. 선택 전 각 서비스 카드를 확인해 주세요."
      ),
    };
  }
  if (hasHybrid) return deliveryMeta("ai_plus_human");
  if (hasInPerson) return deliveryMeta("in_person");
  if (hasAiGuide) return deliveryMeta("ai_guide");
  return deliveryMeta("general");
}

async function preloadCategoryDeliverySummary() {
  categoryModeSummaryById.clear();
  categoryDeliveryMetaById.clear();
  if (!Array.isArray(categories) || !categories.length) return;
  await Promise.all(
    categories.map(async (category) => {
      try {
        const items = await serviceCatalogBrowseApi.listServiceItems(category.id);
        const modes = new Set(items.map((x) => x.delivery_mode || "general"));
        categoryModeSummaryById.set(category.id, summarizeDeliveryModes(modes));
        categoryDeliveryMetaById.set(category.id, categoryDeliveryMeta(modes));
      } catch {
        categoryModeSummaryById.set(category.id, "");
        categoryDeliveryMetaById.set(category.id, deliveryMeta("general"));
      }
    })
  );
}

function currentTotalSteps() {
  return 4;
}

function currentStepNumber() {
  if (phase === "category") return 1;
  if (phase === "common_info") return 2;
  if (phase === "services") return 3;
  return 4;
}

function updateProgress() {
  const total = currentTotalSteps();
  const n = currentStepNumber();
  const fill = qs("#sfProgressFill");
  const label = qs("#sfProgressLabel");
  const pct = total <= 1 ? 0 : ((n - 1) / (total - 1)) * 100;
  if (fill) fill.style.width = `${Math.round(pct)}%`;
  if (label) {
    label.textContent = t("common.service_flow.progress_label", "총 {total}단계 중 {current}단계")
      .replace("{current}", String(n))
      .replace("{total}", String(total));
  }
}

function showOnlyStep(which) {
  const byId = (id) => qs(id);
  const stepCategory = byId("#sfStepCategory");
  const stepCommon = byId("#sfStepCommonInfo");
  const stepServices = byId("#sfStepServices");
  const stepReview = byId("#sfStepReview");
  if (stepCategory) stepCategory.hidden = which !== "category";
  if (stepCommon) stepCommon.hidden = which !== "common_info";
  if (stepServices) stepServices.hidden = which !== "services";
  if (stepReview) stepReview.hidden = which !== "review";
  updateChrome();
}

function updateChrome() {
  const back = qs("#sfBackBtn");
  if (back) {
    back.disabled = phase === "category" || submittingReview;
    back.textContent = phase === "review"
      ? t("common.service_flow.btn_back_edit", "돌아가서 수정")
      : t("common.service_flow.btn_back", "이전");
  }
  const next = qs("#sfNextBtn");
  if (next) {
    next.disabled = (phase === "category" && selectedCategoryIds.length < 1) || submittingReview;
    if (phase === "review") {
      next.textContent = submittingReview
        ? t("common.service_flow.btn_submitting_request", "요청 제출 중…")
        : t("common.service_flow.btn_submit_request", "이 요청 제출하기");
    } else if (phase === "services" && servicesCategoryIndex < servicesCategoryOrder.length - 1) {
      next.textContent = t("common.service_flow.btn_next_category", "다음 카테고리");
    } else {
      next.textContent = t("common.service_flow.btn_next", "다음");
    }
  }
}

function updateCategorySelectedCount() {
  const el = qs("#sfCategorySelectedCount");
  if (!el) return;
  const n = selectedCategoryIds.length;
  el.textContent = n > 0 ? `${n}개 선택됨` : "0개 선택됨";
}

/**
 * 내 정보(/users/me)와 동일 규칙: first_name·last_name 우선, 없으면 full_name 분해.
 * @param {object} me
 * @returns {{ profile_first_name: string; profile_last_name: string; profile_birth_date: string; profile_email: string } | null}
 */
function profileIdentityFromMeBasicInfo(me) {
  if (!me || typeof me !== "object") return null;
  const firstName = (me.first_name || "").trim();
  const lastName = (me.last_name || "").trim();
  const fullName = (me.full_name || "").trim();
  const parts = fullName ? fullName.split(" ").filter(Boolean) : [];
  const profile_first_name = firstName || (parts[0] || "");
  const profile_last_name =
    lastName || (parts.length > 1 ? parts.slice(1).join(" ") : "");
  const profile_birth_date = me.birth_date != null && String(me.birth_date).trim() !== "" ? String(me.birth_date) : "";
  const profile_email = (me.email || "").trim();
  return { profile_first_name, profile_last_name, profile_birth_date, profile_email };
}

/**
 * 로그인 시 commonInfo 신원 필드를 DB 등록 값으로 맞춤(이름=firstname+lastname, 생년월일, 이메일).
 * @param {Record<string, unknown>} info
 */
async function mergeRegisteredIdentityFromMeIntoCommonInfo(info) {
  if (!info || typeof info !== "object") return;
  if (getAccessToken()) {
    const un = (getSession()?.username || "").trim();
    if (un) info.customer_username = un;
  }
  if (!getAccessToken()) return;
  try {
    const me = await userCustomerApi.getMeBasicInfo();
    const idn = profileIdentityFromMeBasicInfo(me);
    if (!idn) return;
    if (idn.profile_first_name) info.profile_first_name = idn.profile_first_name;
    if (idn.profile_last_name) info.profile_last_name = idn.profile_last_name;
    if (idn.profile_birth_date) info.profile_birth_date = idn.profile_birth_date;
    if (idn.profile_email && idn.profile_email.includes("@")) info.profile_email = idn.profile_email;
  } catch {
    /* 폼·스냅샷 유지 */
  }
}

async function prefillProfileBasicInfo() {
  const firstNameInput = qs("#sfProfileFirstName");
  const lastNameInput = qs("#sfProfileLastName");
  const birthDateInput = qs("#sfProfileBirthDate");
  const emailInput = qs("#sfProfileEmail");
  if (!firstNameInput || !lastNameInput || !birthDateInput || !emailInput) return;

  // Avoid overwriting user edits.
  if (profilePrefillAttempted) return;
  profilePrefillAttempted = true;

  // 로그인 아이디(username)는 이름이 아님 — First name에 넣지 않음(내 정보 /users/me 값만 사용).
  const s = getSession();
  const token = getAccessToken();

  try {
    if (token) {
      const me = await userCustomerApi.getMeBasicInfo();
      const idn = profileIdentityFromMeBasicInfo(me);
      if (idn) {
        // Set only if empty to keep edits (초기 진입 시에만 채움).
        if (idn.profile_first_name && !String(firstNameInput.value || "").trim()) firstNameInput.value = idn.profile_first_name;
        if (idn.profile_last_name && !String(lastNameInput.value || "").trim()) lastNameInput.value = idn.profile_last_name;
        if (idn.profile_birth_date && !String(birthDateInput.value || "").trim()) birthDateInput.value = idn.profile_birth_date;
        if (idn.profile_email && !String(emailInput.value || "").trim()) emailInput.value = idn.profile_email;
      }
    }
  } catch {
    // 토큰은 있으나 /me 실패 시 이메일만 세션으로 보조
  }

  if (s?.email && !String(emailInput.value || "").trim()) emailInput.value = String(s.email || "");

  // 로그인 상태에서 이메일이 채워졌으면 읽기 전용(제출 시 서버도 등록 이메일로 정합성 유지).
  if (token && String(emailInput.value || "").trim()) {
    emailInput.readOnly = true;
    emailInput.setAttribute(
      "title",
      t(
        "common.service_flow.email_locked_hint",
        "회원 등록 이메일입니다. 제출·관리자 화면에는 이 주소가 사용됩니다."
      )
    );
  }
}

function renderCategories() {
  const root = qs("#sfCategoryGrid");
  if (!root) return;
  if (!categories.length) {
    root.innerHTML = `<p class="lhai-help">${esc(t("common.service_flow.empty_categories", "No categories available yet."))}</p>`;
    return;
  }
  root.innerHTML = categories
    .map(
      (c) => `
    <button type="button" class="service-flow__category-card ${selectedCategoryIds.includes(c.id) ? "is-selected" : ""}" data-category-id="${esc(c.id)}" role="listitem" aria-pressed="${selectedCategoryIds.includes(c.id) ? "true" : "false"}">
      ${selectedCategoryIds.includes(c.id) ? `<span class="service-flow__category-selected-pill">✓ 선택됨</span>` : ""}
      <span class="service-flow__category-card-title">${esc(categoryTitle(c))}</span>
      <span class="service-flow__badge service-flow__badge--${esc(categoryDeliveryMetaById.get(c.id)?.mode || "general")}">${esc(
        categoryDeliveryMetaById.get(c.id)?.badge || deliveryMeta("general").badge
      )}</span>
      ${c.customer_subtitle ? `<span class="lhai-help service-flow__category-card-desc">${esc(c.customer_subtitle)}</span>` : ""}
      ${c.customer_help_text ? `<span class="lhai-help service-flow__category-card-desc">${esc(c.customer_help_text)}</span>` : ""}
      ${categoryModeSummaryById.get(c.id) ? `<span class="service-flow__category-card-note">${esc(categoryModeSummaryById.get(c.id))}</span>` : ""}
    </button>`
    )
    .join("");

  root.querySelectorAll("[data-category-id]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = btn.getAttribute("data-category-id") || "";
      if (!id) return;
      if (selectedCategoryIds.includes(id)) selectedCategoryIds = selectedCategoryIds.filter((x) => x !== id);
      else selectedCategoryIds = [...selectedCategoryIds, id];
      renderCategories();
      updateCategorySelectedCount();
      updateChrome();
    });
  });
}

async function loadServicesAndGo() {
  setStatus("");
  phase = "common_info";
  showOnlyStep("common_info");
  await prefillProfileBasicInfo();
  updateProgress();
}

async function loadConditionalQuestions(serviceIds = []) {
  const selectedProblemGroups = categories
    .filter((c) => selectedCategoryIds.includes(c.id))
    .map((c) => resolveProblemGroup(c))
    .filter(Boolean);
  if (!selectedProblemGroups.length) {
    conditionalLoadedGroup = "";
    conditionalQuestions = [];
    conditionalAnswersByItemId = {};
    conditionalOptionsByItemId = {};
    return;
  }
  const groupKey = `${selectedProblemGroups.sort().join(",")}::${serviceIds.join(",")}`;
  if (conditionalLoadedGroup === groupKey && conditionalQuestions.length) return;
  const prevAnswers = { ...conditionalAnswersByItemId };
  conditionalLoadedGroup = groupKey;
  conditionalQuestions = [];
  conditionalAnswersByItemId = {};
  conditionalOptionsByItemId = {};
  try {
    const all = [];
    for (const categoryId of selectedCategoryIds) {
      const perCategory = await serviceCatalogBrowseApi.listServiceItems(categoryId);
      all.push(...(perCategory || []));
    }
    const seenServiceIds = new Set();
    const scopedServices = all
      .filter((s) => s?.id && (!serviceIds.length || serviceIds.includes(s.id)))
      .filter((s) => {
        if (seenServiceIds.has(s.id)) return false;
        seenServiceIds.add(s.id);
        return true;
      })
      .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));

    for (const svc of scopedServices) {
      let bundle = null;
      try {
        bundle = await serviceIntakeCustomerApi.getActiveBundle(svc.id);
      } catch {
        bundle = null;
      }
      if (!bundle?.template?.id) continue;
      const fields = (bundle.fields || [])
        .filter((f) => f.active !== false && !f.archived_at)
        .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
      const svcName = serviceTitle(svc) || svc.name || "";
      const svcMode = svc.delivery_mode || "general";
      for (const f of fields) {
        const qid = conditionalQuestionKey(svc.id, f.id);
        const options = (bundle.options_by_field_id?.[f.id] || [])
          .filter((o) => o.active !== false)
          .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
        conditionalQuestions.push({
          id: qid,
          service_id: svc.id,
          service_name: svcName,
          delivery_mode: svcMode,
          field_id: f.id,
          label: f.label || "",
          help_text: f.help_text || "",
          input_type: f.input_type || "text",
          placeholder: f.placeholder || "",
          required: Boolean(f.required),
          sort_order: f.sort_order ?? 0,
          visibility_rule_json: f.visibility_rule_json || {},
        });
        conditionalOptionsByItemId[qid] = options;
        if (prevAnswers[qid]) conditionalAnswersByItemId[qid] = prevAnswers[qid];
      }
    }
  } catch {
    conditionalQuestions = [];
  }
}

function isConditionalQuestionVisible(question) {
  const rule = question?.visibility_rule_json;
  if (!rule || typeof rule !== "object" || Array.isArray(rule) || Object.keys(rule).length === 0) return true;
  if (rule.mode !== "when_answer_equals") return true;
  const sourceFieldId = String(rule.source_field_id || "").trim();
  if (!sourceFieldId) return true;
  const sourceKey = conditionalQuestionKey(question.service_id, sourceFieldId);
  const sourceAnswer = conditionalAnswersByItemId[sourceKey];
  if (!sourceAnswer) return false;
  const expected = String(rule.match_value ?? "");
  if (Array.isArray(sourceAnswer.values)) return sourceAnswer.values.map(String).includes(expected);
  return String(sourceAnswer.value ?? "") === expected;
}

function readInlineConditionalAnswer(question) {
  const inputType = String(question.input_type || "text").toLowerCase();
  const base = inlineConditionalDomBase(question.id);
  if (inputType === "number") {
    const raw = qs(`#${base}_number`)?.value;
    if (raw === "" || raw == null) return {};
    const n = Number(raw);
    if (Number.isNaN(n)) return {};
    return { value: n };
  }
  if (inputType === "select" || inputType === "radio") {
    const v = qs(`#${base}_select`)?.value || "";
    return v ? { value: v } : {};
  }
  if (inputType === "multi_select") {
    const values = Array.from(document.querySelectorAll(`input[name="${base}_multi"]:checked`)).map((x) => x.value);
    return values.length ? { values } : {};
  }
  if (inputType === "checkbox") {
    return { value: Boolean(qs(`#${base}_checkbox`)?.checked) };
  }
  const text = (qs(`#${base}_text`)?.value || "").trim();
  return text ? { value: text } : {};
}

function inlineConditionalDomBase(questionId) {
  const safe = String(questionId || "")
    .trim()
    .replace(/[^a-zA-Z0-9_-]/g, "_");
  return `sfInline_${safe}`;
}

function renderInlineConditionalControl(question) {
  const prev = conditionalAnswersByItemId[question.id] || {};
  const inputType = String(question.input_type || "text").toLowerCase();
  const base = inlineConditionalDomBase(question.id);
  if (inputType === "number") {
    return `<input class="lhai-input" id="${esc(base)}_number" type="number" min="0" step="1" value="${esc(prev.value ?? "")}" placeholder="${esc(
      question.placeholder || ""
    )}" />`;
  }
  if (inputType === "select" || inputType === "radio") {
    const options = (conditionalOptionsByItemId[question.id] || [])
      .filter((o) => o.active !== false)
      .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
      .map((o) => `<option value="${esc(o.value)}" ${String(prev.value ?? "") === String(o.value) ? "selected" : ""}>${esc(o.label || o.value)}</option>`)
      .join("");
    return `<select class="lhai-select" id="${esc(base)}_select"><option value="">${esc(
      t("common.service_flow.pick_one", "Choose…")
    )}</option>${options}</select>`;
  }
  if (inputType === "multi_select") {
    const selected = new Set(Array.isArray(prev.values) ? prev.values : []);
    return (conditionalOptionsByItemId[question.id] || [])
      .filter((o) => o.active !== false)
      .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
      .map(
        (o) => `<label class="service-flow__check"><input type="checkbox" name="${esc(base)}_multi" value="${esc(o.value)}" ${
          selected.has(o.value) ? "checked" : ""
        } /> ${esc(o.label || o.value)}</label>`
      )
      .join("");
  }
  if (inputType === "checkbox") {
    return `<label class="service-flow__switch-row"><input type="checkbox" id="${esc(base)}_checkbox" ${
      prev.value === true ? "checked" : ""
    } /> ${esc(t("common.service_flow.yes_no", "Yes"))}</label>`;
  }
  return `<input class="lhai-input" id="${esc(base)}_text" type="text" value="${esc(prev.value ?? "")}" placeholder="${esc(
    question.placeholder || ""
  )}" />`;
}

function renderInlineConditionalQuestions(serviceId) {
  if (!selectedServiceIds.includes(serviceId)) return "";
  const questions = conditionalQuestions
    .filter((q) => q.service_id === serviceId)
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
  if (!questions.length) return "";
  const visible = questions.filter((q) => isConditionalQuestionVisible(q));
  if (!visible.length) return "";
  return `
    <div class="service-flow__inline-questions">
      <p class="lhai-help service-flow__inline-questions-lead">${esc(
        t("common.service_flow.inline_questions_lead", "이 서비스에 필요한 추가 질문입니다.")
      )}</p>
      ${visible
        .map(
          (q) => `
        <div class="service-flow__field service-flow__inline-question" data-inline-question-id="${esc(q.id)}">
          <label class="lhai-label">${esc(q.label)}${q.required ? " *" : ""}</label>
          ${q.help_text ? `<p class="lhai-help">${esc(q.help_text)}</p>` : ""}
          ${renderInlineConditionalControl(q)}
        </div>`
        )
        .join("")}
    </div>`;
}

function clearConditionalAnswersForUnselectedServices() {
  const selectedSet = new Set(selectedServiceIds);
  const next = {};
  for (const q of conditionalQuestions) {
    if (!selectedSet.has(q.service_id)) continue;
    const aj = conditionalAnswersByItemId[q.id];
    if (!aj) continue;
    next[q.id] = aj;
  }
  conditionalAnswersByItemId = next;
}

function renderMinorAgeInputs() {
  const wrap = qs("#sfCommonMinorAgesWrap");
  const list = qs("#sfCommonMinorAgesList");
  if (!wrap || !list) return;

  const raw = qs("#sfCommonMinorCount")?.value || "0";
  const n = Math.max(0, Number.parseInt(raw, 10) || 0);
  if (n <= 0) {
    wrap.hidden = true;
    list.innerHTML = "";
    return;
  }

  wrap.hidden = false;
  const prev = Array.isArray(commonInfo.minor_ages) ? commonInfo.minor_ages : [];
  list.innerHTML = Array.from({ length: n })
    .map((_, i) => {
      const v = prev[i] ?? "";
      return `
        <div class="service-flow__field">
          <label class="lhai-label" for="sfCommonMinorAge_${i}">만 18세 이하 ${i + 1}번째 나이</label>
          <input class="lhai-input" id="sfCommonMinorAge_${i}" type="number" min="0" max="17" step="1" value="${esc(v)}" placeholder="예: 7" />
        </div>
      `;
    })
    .join("");
}

function readCommonInfoFromForm() {
  const profileFirstName = (qs("#sfProfileFirstName")?.value || "").trim();
  const profileLastName = (qs("#sfProfileLastName")?.value || "").trim();
  const profileBirthDate = qs("#sfProfileBirthDate")?.value || "";
  const profileEmail = (qs("#sfProfileEmail")?.value || "").trim();

  const entryDate = qs("#sfCommonEntryDate")?.value || "";
  const adultCount = qs("#sfCommonAdultCount")?.value || "";
  const minorCount = qs("#sfCommonMinorCount")?.value || "";
  const minors = Math.max(0, Number.parseInt(minorCount, 10) || 0);
  const minorAges = Array.from({ length: minors })
    .map((_, i) => qs(`#sfCommonMinorAge_${i}`)?.value || "")
    .map((x) => String(x || "").trim());
  const targetState = (qs("#sfCommonTargetState")?.value || "").trim();
  const preferredLanguage = qs("#sfCommonPreferredLanguage")?.value || "";
  const budgetRange = qs("#sfCommonBudgetRange")?.value || "";
  const supportNeedLevel = qs("#sfCommonSupportNeedLevel")?.value || "";
  return {
    profile_first_name: profileFirstName,
    profile_last_name: profileLastName,
    profile_birth_date: profileBirthDate,
    profile_email: profileEmail,
    entry_date: entryDate,
    adult_count: adultCount,
    minor_count: minorCount,
    minor_ages: minorAges,
    target_state: targetState,
    preferred_language: preferredLanguage,
    budget_range: budgetRange,
    support_need_level: supportNeedLevel,
  };
}

function validateCommonInfo(info) {
  const adults = Number.parseInt(info.adult_count || "0", 10);
  const minors = Number.parseInt(info.minor_count || "0", 10);
  if (Number.isNaN(adults) || adults < 0) {
    return "만 18세 이상 인원을 0 이상으로 입력해 주세요.";
  }
  if (Number.isNaN(minors) || minors < 0) {
    return "만 18세 이하 인원을 0 이상으로 입력해 주세요.";
  }
  if (adults + minors <= 0) {
    return "함께 이동 인원(성인/미성년)을 1명 이상 입력해 주세요.";
  }
  if (minors > 0) {
    const ages = Array.isArray(info.minor_ages) ? info.minor_ages : [];
    if (ages.length !== minors) {
      return "만 18세 이하 인원 수에 맞게 나이를 모두 입력해 주세요.";
    }
    for (const a of ages) {
      const n = Number.parseInt(String(a || ""), 10);
      if (Number.isNaN(n) || n < 0 || n >= 18) {
        return "만 18세 이하 나이는 0~17 사이로 입력해 주세요.";
      }
    }
  }
  if (!info.entry_date) {
    return "입국(또는 시작) 예정일을 선택해 주세요.";
  }
  if (!info.target_state) {
    return "정착 희망 주(State)를 입력해 주세요.";
  }
  if (!info.preferred_language) {
    return "선호 언어를 선택해 주세요.";
  }
  if (!info.budget_range) {
    return "예산 범위를 선택해 주세요.";
  }
  if (!info.support_need_level) {
    return "필요한 도움 정도를 선택해 주세요.";
  }
  return "";
}

async function loadServicesForSelectedCategory() {
  try {
    serviceItemsByCategoryId.clear();
    selectedServiceIdsByCategoryId.clear();
    const all = [];
    for (const categoryId of selectedCategoryIds) {
      const perCategory = await serviceCatalogBrowseApi.listServiceItems(categoryId);
      const rows = Array.isArray(perCategory) ? perCategory : [];
      serviceItemsByCategoryId.set(categoryId, rows);
      const validIds = new Set(rows.map((x) => x.id).filter(Boolean));
      const prior = selectedServiceIds.filter((id) => validIds.has(id));
      selectedServiceIdsByCategoryId.set(categoryId, Array.from(new Set(prior)));
      all.push(...rows);
    }
    rebuildSelectedServiceIds();
    servicesCategoryOrder = selectedCategoryIds.slice();
    servicesCategoryIndex = 0;
    const seenServiceIds = new Set();
    serviceItems = all.filter((s) => {
      if (!s?.id || seenServiceIds.has(s.id)) return false;
      seenServiceIds.add(s.id);
      return true;
    });
  } catch (e) {
    setStatus(e?.message || t("common.service_flow.load_services_error", "Could not load services."));
    return false;
  }
  return true;
}

function currentServicesCategoryId() {
  if (!servicesCategoryOrder.length) return "";
  const idx = Math.max(0, Math.min(servicesCategoryIndex, servicesCategoryOrder.length - 1));
  return servicesCategoryOrder[idx] || "";
}

function currentServicesCategory() {
  const cid = currentServicesCategoryId();
  return categories.find((c) => c.id === cid) || null;
}

function rebuildSelectedServiceIds() {
  const merged = [];
  selectedServiceIdsByCategoryId.forEach((ids) => {
    for (const id of ids || []) merged.push(id);
  });
  selectedServiceIds = Array.from(new Set(merged));
}

function syncCurrentCategorySelectionsFromDom() {
  const categoryId = currentServicesCategoryId();
  if (!categoryId) return;
  const root = qs("#sfServiceList");
  if (!root) return;
  const checked = Array.from(root.querySelectorAll('input[name="sfSvc"]:checked')).map((x) => x.value);
  selectedServiceIdsByCategoryId.set(categoryId, checked);
  rebuildSelectedServiceIds();
}

function renderServicesSubstepHeader() {
  const idxEl = qs("#sfServicesSubstepIndex");
  const titleEl = qs("#sfServicesCurrentCategoryTitle");
  const descEl = qs("#sfServicesCurrentCategoryDesc");
  const helpEl = qs("#sfServicesCurrentCategoryHelp");
  const prevBtn = qs("#sfServicesPrevCategoryBtn");
  const nextBtn = qs("#sfServicesNextCategoryBtn");

  const total = servicesCategoryOrder.length;
  const n = total ? servicesCategoryIndex + 1 : 0;
  if (idxEl) idxEl.textContent = total ? `영역 ${n} / ${total}` : "영역 0 / 0";

  const category = currentServicesCategory();
  if (titleEl) titleEl.textContent = category ? categoryTitle(category) : t("common.service_flow.unknown_category", "선택한 문제 영역");

  if (descEl) {
    const subtitle = (category?.customer_subtitle || "").trim();
    descEl.hidden = !subtitle;
    descEl.textContent = subtitle;
  }
  if (helpEl) {
    const help = (category?.customer_help_text || "").trim();
    helpEl.hidden = !help;
    helpEl.textContent = help;
  }

  if (prevBtn) prevBtn.disabled = servicesCategoryIndex <= 0;
  if (nextBtn) nextBtn.disabled = servicesCategoryIndex >= total - 1;
}

function renderMixedDeliveryNote(list = []) {
  const el = qs("#sfMixedDeliveryNote");
  if (!el) return;
  const modes = [...new Set(list.map((s) => s.delivery_mode || "general"))];
  if (list.length < 2 || modes.length <= 1) {
    el.hidden = true;
    el.innerHTML = "";
    return;
  }
  el.hidden = false;
  el.innerHTML = `<p class="service-flow__mixed-note-text">${esc(
    t(
      "common.service_flow.mixed_delivery_note",
      "This category mixes different delivery types. Each card shows a badge (AI, in-person, or AI + optional human) — read it before you select, because services here may work differently."
    )
  )}</p>`;
}

function renderServiceCards() {
  const root = qs("#sfServiceList");
  if (!root) return;
  const categoryId = currentServicesCategoryId();
  const list = serviceItemsByCategoryId.get(categoryId) || [];
  renderServicesSubstepHeader();
  renderMixedDeliveryNote(list);

  if (!list.length) {
    root.innerHTML = `<p class="lhai-help">${esc(t("common.service_flow.empty_services", "No services in this category yet."))}</p>`;
    return;
  }
  root.innerHTML = list
    .map((s) => {
      const d = deliveryMeta(s.delivery_mode);
      return `
      <label class="service-flow__service-card">
        <input type="checkbox" class="service-flow__service-check" name="sfSvc" value="${esc(s.id)}" />
        <span class="service-flow__service-card-body">
          <span class="service-flow__service-name">${esc(serviceTitle(s) || s.name || "")}</span>
          <span class="service-flow__badge service-flow__badge--${esc(d.mode)}">${esc(s.delivery_type_label || d.badge)}</span>
          <span class="lhai-help service-flow__badge-explainer">${esc(s.delivery_type_help_text || d.explain)}</span>
          ${s.customer_short_description ? `<span class="lhai-help service-flow__service-desc">${esc(s.customer_short_description)}</span>` : ""}
          ${s.customer_long_description ? `<span class="lhai-help service-flow__service-desc">${esc(s.customer_long_description)}</span>` : ""}
          ${!s.customer_short_description && s.description ? `<span class="lhai-help service-flow__service-desc">${esc(s.description)}</span>` : ""}
          ${renderInlineConditionalQuestions(s.id)}
        </span>
      </label>`;
    })
    .join("");

  const selected = new Set(selectedServiceIdsByCategoryId.get(categoryId) || []);
  root.querySelectorAll('input[name="sfSvc"]').forEach((inp) => {
    if (inp instanceof HTMLInputElement) inp.checked = selected.has(inp.value);
    inp.addEventListener("change", () => {
      const checkedInCurrent = Array.from(root.querySelectorAll('input[name="sfSvc"]:checked')).map((x) => x.value);
      selectedServiceIdsByCategoryId.set(categoryId, checkedInCurrent);
      rebuildSelectedServiceIds();
      clearConditionalAnswersForUnselectedServices();
      renderServiceCards();
    });
  });

  root.querySelectorAll("[data-inline-question-id]").forEach((row) => {
    const qid = row.getAttribute("data-inline-question-id") || "";
    if (!qid) return;
    const question = conditionalQuestions.find((q) => q.id === qid);
    if (!question) return;
    row.querySelectorAll("input, select, textarea").forEach((ctrl) => {
      ctrl.addEventListener("change", () => {
        const answer = readInlineConditionalAnswer(question);
        if (Object.keys(answer).length === 0) delete conditionalAnswersByItemId[question.id];
        else conditionalAnswersByItemId[question.id] = answer;
        renderServiceCards();
      });
      ctrl.addEventListener("input", () => {
        const answer = readInlineConditionalAnswer(question);
        if (Object.keys(answer).length === 0) delete conditionalAnswersByItemId[question.id];
        else conditionalAnswersByItemId[question.id] = answer;
      });
    });
  });
}

function validateInlineConditionalRequired() {
  for (const q of conditionalQuestions) {
    if (!selectedServiceIds.includes(q.service_id)) continue;
    if (!isConditionalQuestionVisible(q)) continue;
    if (!q.required) continue;
    const aj = conditionalAnswersByItemId[q.id] || {};
    if (Array.isArray(aj.values) && aj.values.length > 0) continue;
    if (aj.value !== undefined && aj.value !== null && String(aj.value) !== "") continue;
    return q.label || t("common.service_flow.required_question", "필수 추가 질문");
  }
  return "";
}

function isTechnicalLikeLabel(text) {
  const s = String(text || "").trim();
  if (!s) return true;
  if (s.length > 64 && /[_:-]/.test(s)) return true;
  if (/^[a-z0-9_.:-]+$/i.test(s) && (s.includes("_") || s.includes(".") || s.includes(":") || s.includes("-"))) return true;
  if (/^(field|question|qitem|item|id|code)[_ .:-]/i.test(s)) return true;
  if (/^(first name|last name|birth_date|entry_date|adult_count|minor_count|support_need_level)$/i.test(s)) return true;
  return false;
}

function normalizeReviewDetailLabel(rawLabel, fallbackIndex = 1) {
  const label = String(rawLabel || "").trim();
  const normalizedMap = {
    first_name: "이름",
    last_name: "이름",
    full_name: "이름",
    birth_date: "생년월일",
    entry_date: "입국(또는 시작) 예정일",
    household_count: "함께 이동하는 인원",
    who_is_moving: "함께 이동하는 구성",
    adult_count: "만 18세 이상 인원",
    minor_count: "만 18세 이하 인원",
    minor_ages: "만 18세 이하 나이",
    support_need_level: "희망 지원 강도",
  };
  const keyLike = label.toLowerCase().replace(/\s+/g, "_");
  if (normalizedMap[keyLike]) return normalizedMap[keyLike];
  if (isTechnicalLikeLabel(label)) return `추가 요청 정보 ${fallbackIndex}`;
  return label;
}

function optionLabelForQuestion(question, rawValue) {
  const value = String(rawValue ?? "").trim();
  if (!value) return "";
  const opts = conditionalOptionsByItemId[question?.id] || [];
  const matched = opts.find((o) => String(o?.value ?? "").trim() === value);
  return String(matched?.label || "").trim() || value;
}

function normalizeReviewDetailValue(answerJson, question = null) {
  const aj = answerJson || {};
  if (Array.isArray(aj.values)) {
    const vals = aj.values
      .map((v) => {
        const raw = String(v || "").trim();
        if (!raw) return "";
        return question ? optionLabelForQuestion(question, raw) : raw;
      })
      .filter(Boolean);
    return vals.length ? vals.join(", ") : "—";
  }
  if (typeof aj.value === "boolean") return aj.value ? "예" : "아니요";
  const raw = aj.value == null ? "" : String(aj.value).trim();
  const v = question && raw ? optionLabelForQuestion(question, raw) : raw;
  return v || "—";
}

function buildAnswerJsonWithLabelSnapshot(answerJson, question = null) {
  const aj = answerJson && typeof answerJson === "object" ? { ...answerJson } : {};
  const snapshot = {};

  if (Array.isArray(aj.values)) {
    const rawValues = aj.values.map((v) => String(v ?? "").trim()).filter(Boolean);
    snapshot.values = rawValues;
    snapshot.value_labels = question
      ? rawValues.map((v) => optionLabelForQuestion(question, v))
      : rawValues;
  } else if (aj.value !== undefined && aj.value !== null) {
    const rawValue = String(aj.value).trim();
    snapshot.value = rawValue;
    if (rawValue !== "") {
      snapshot.value_label = question ? optionLabelForQuestion(question, rawValue) : rawValue;
    }
  }

  if (Object.keys(snapshot).length > 0) {
    aj.label_snapshot = snapshot;
  }
  return aj;
}

function buildServiceFlowSubmitPayload() {
  const selectedCategoryRows = categories
    .filter((c) => selectedCategoryIds.includes(c.id))
    .map((c) => ({
      id: c.id,
      title: categoryTitle(c),
      problem_group: resolveProblemGroup(c) || "",
    }));

  const selectedServiceRows = selectedServiceIds
    .map((sid) => {
      const s = serviceItems.find((x) => x.id === sid);
      if (!s) return null;
      const categoryId = selectedCategoryIds.find((cid) =>
        (serviceItemsByCategoryId.get(cid) || []).some((it) => it.id === sid)
      );
      return {
        id: sid,
        category_id: categoryId || "",
        title: serviceTitle(s) || s.name || sid,
        delivery_mode: s.delivery_mode || "general",
      };
    })
    .filter(Boolean);

  const detailedAnswers = [];
  conditionalQuestions.forEach((q) => {
    const aj = conditionalAnswersByItemId[q.id];
    if (!aj || !Object.keys(aj).length) return;
    detailedAnswers.push({
      section: "conditional",
      service_id: q.service_id,
      service_title: q.service_name || "",
      field_id: q.field_id,
      label: q.label || "",
      answer_json: buildAnswerJsonWithLabelSnapshot(aj, q),
    });
  });

  return {
    customer_profile_id: getCustomerMessagingProfileId(),
    selected_categories: selectedCategoryRows,
    selected_services: selectedServiceRows,
    common_info: commonInfo,
    detailed_answers: detailedAnswers,
    intake_submission_ids: [],
  };
}

function renderReview() {
  const root = qs("#sfReviewBody");
  if (!root) return;
  const selectedServices = selectedServiceIds
    .map((sid) => serviceItems.find((x) => x.id === sid))
    .filter(Boolean);
  const selectedServiceNames = selectedServices.map((s) => serviceTitle(s) || s.name || "");
  const deliveryModes = new Set(selectedServices.map((s) => s.delivery_mode || "general"));
  const deliverySummary = summarizeDeliveryModes(deliveryModes) || t(
    "common.service_flow.review_delivery_summary_default",
    "선택한 서비스별로 전달 방식(AI/대면/혼합)이 다를 수 있어요."
  );

  const prefLangMap = {
    ko: "한국어",
    en: "영어",
    mix: "한국어 + 영어",
    other: "기타",
  };
  const budgetMap = {
    low: "비용 최소화 우선",
    mid: "균형형",
    high: "속도/편의 우선",
  };
  const supportMap = {
    self: "대부분 스스로 진행 가능",
    guided: "가이드가 있으면 진행 가능",
    high_touch: "처음부터 많이 도와주길 원함",
  };
  const togetherMoving = (() => {
    const adults = Number.parseInt(commonInfo.adult_count || "0", 10) || 0;
    const minors = Number.parseInt(commonInfo.minor_count || "0", 10) || 0;
    const total = adults + minors;
    const minorAges = Array.isArray(commonInfo.minor_ages) ? commonInfo.minor_ages.filter(Boolean) : [];
    if (total <= 0) return "—";
    const base = `총 ${total}명 (성인 ${adults}명, 미성년 ${minors}명)`;
    if (!minorAges.length) return base;
    return `${base} · 미성년 나이: ${minorAges.join(", ")}`;
  })();

  const nextStepHints = [
    "「이 요청 제출하기」를 누르면 고객님의 요청이 먼저 안전하게 접수됩니다.",
    "접수된 정보는 운영팀(담당자)이 확인하고, 필요한 내용을 검토합니다.",
    "검토가 완료되면 상황에 맞는 견적서를 준비해 이메일과 메시지함으로 보내드립니다.",
  ];
  if (deliveryModes.has("in_person")) {
    nextStepHints.splice(
      1,
      0,
      "대면 지원이 포함된 항목은 지역/일정 가능 여부를 확인한 뒤 안내해 드립니다."
    );
  }

  const parts = [];
  parts.push(`<div class="service-flow__review-layout">`);
  parts.push(
    `<div class="service-flow__review-block service-flow__review-panel service-flow__review-panel--intro"><h3 class="service-flow__review-h">${esc(
      t("common.service_flow.review_understood_title", "제출 전 요청 내용을 확인해 주세요")
    )}</h3><p class="lhai-help">${esc(
      t(
        "common.service_flow.review_understood_lead",
        "제출 전에 한 번에 확인하실 수 있도록 고객님 답변을 깔끔하게 정리했습니다."
      )
    )}</p><p class="lhai-help">${esc(
      "내용이 맞으면 아래에서 요청을 제출해 주세요. 수정이 필요하면 돌아가서 바로 고칠 수 있습니다."
    )}</p></div>`
  );

  const selectedCategoryNames = categories
    .filter((c) => selectedCategoryIds.includes(c.id))
    .map((c) => categoryTitle(c))
    .filter(Boolean);
  parts.push(
    `<div class="service-flow__review-block service-flow__review-panel"><h3 class="service-flow__review-h">${esc(
      "도움이 필요한 영역"
    )}</h3><p>${esc(selectedCategoryNames.join(", ") || "—")}</p></div>`
  );
  parts.push(
    `<div class="service-flow__review-block service-flow__review-panel"><h3 class="service-flow__review-h">${esc(
      "요청 서비스"
    )}</h3><p>${esc(selectedServiceNames.join(", ") || "—")}</p><p class="lhai-help">${esc(deliverySummary)}</p></div>`
  );
  const reviewCustomerId = (commonInfo.customer_username || getSession()?.username || "").trim() || "—";
  parts.push(
    `<div class="service-flow__review-block service-flow__review-panel"><h3 class="service-flow__review-h">기본 정보</h3><dl class="service-flow__review-dl">
      <dt>${esc(t("common.service_flow.review_customer_id", "아이디"))}</dt><dd>${esc(reviewCustomerId)}</dd>
      <dt>이름</dt><dd>${esc(`${commonInfo.profile_first_name || ""} ${commonInfo.profile_last_name || ""}`.trim() || "—")}</dd>
      <dt>생년월일</dt><dd>${esc(commonInfo.profile_birth_date || "—")}</dd>
      <dt>이메일</dt><dd>${esc(commonInfo.profile_email || "—")}</dd>
      <dt>입국(또는 시작) 예정일</dt><dd>${esc(commonInfo.entry_date || "—")}</dd>
      <dt>함께 이동하는 인원</dt><dd>${esc(togetherMoving)}</dd>
      <dt>정착 희망 지역(주)</dt><dd>${esc(commonInfo.target_state || "—")}</dd>
      <dt>선호 언어</dt><dd>${esc(prefLangMap[commonInfo.preferred_language] || commonInfo.preferred_language || "—")}</dd>
      <dt>예산 우선순위</dt><dd>${esc(budgetMap[commonInfo.budget_range] || commonInfo.budget_range || "—")}</dd>
      <dt>희망 지원 강도</dt><dd>${esc(supportMap[commonInfo.support_need_level] || commonInfo.support_need_level || "—")}</dd>
    </dl></div>`
  );
  if (conditionalQuestions.length) {
    const byId = new Map(conditionalQuestions.map((q) => [q.id, q]));
    parts.push(`<div class="service-flow__review-block service-flow__review-panel"><h3 class="service-flow__review-h">추가 세부 정보</h3><dl class="service-flow__review-dl">`);
    let detailIdx = 1;
    Object.entries(conditionalAnswersByItemId).forEach(([id, aj]) => {
      const q = byId.get(id);
      if (!q) return;
      const label = normalizeReviewDetailLabel(q.label, detailIdx++);
      const display = normalizeReviewDetailValue(aj, q);
      parts.push(`<dt>${esc(label)}</dt><dd>${esc(display)}</dd>`);
    });
    parts.push(`</dl></div>`);
  }

  parts.push(`<div class="service-flow__review-block service-flow__review-panel"><h3 class="service-flow__review-h">${esc("서비스 전달 방식 안내")}</h3>
    <p class="lhai-help service-flow__review-section-lead">${esc("각 서비스가 어떤 방식으로 진행되는지 간단히 정리했습니다.")}</p>
    <ul class="service-flow__review-list">`);
  for (const sid of selectedServiceIds) {
    const svc = serviceItems.find((x) => x.id === sid);
    const d = deliveryMeta(svc?.delivery_mode);
    parts.push(`<li class="service-flow__review-service-item">
      <span class="service-flow__badge service-flow__badge--${esc(d.mode)}">${esc(d.badge)}</span>
      <div class="service-flow__review-service-text">
        <strong>${esc(serviceTitle(svc) || sid)}</strong>
        <p class="lhai-help service-flow__review-delivery-label">${esc("진행 방식")}</p>
        <p class="lhai-help service-flow__review-service-explain">${esc(d.explain)}</p>
      </div>
    </li>`);
  }
  parts.push(`</ul></div>`);

  parts.push(
    `<div class="service-flow__review-block service-flow__review-panel service-flow__review-panel--next"><h3 class="service-flow__review-h">${esc(
      t("common.service_flow.review_next_steps_title", "다음 단계 안내")
    )}</h3><p class="lhai-help service-flow__review-section-lead">${esc(
      "제출 후 진행 흐름을 간단히 안내드릴게요."
    )}</p><ul class="service-flow__review-list">` +
      nextStepHints.map((line) => `<li class="lhai-help">${esc(line)}</li>`).join("") +
      `</ul></div>`
  );
  parts.push(`</div>`);

  root.innerHTML = parts.join("");
  updateChrome();
}

async function goNext() {
  setStatus("");
  if (phase === "category") {
    if (!selectedCategoryIds.length) {
      setStatus("해당되는 항목을 모두 선택해 주세요. 여러 개를 선택할 수 있습니다.");
      return;
    }
    await loadServicesAndGo();
    updateProgress();
    return;
  }

  if (phase === "common_info") {
    const info = readCommonInfoFromForm();
    const validationError = validateCommonInfo(info);
    if (validationError) {
      setStatus(validationError);
      return;
    }
    commonInfo = info;
    await mergeRegisteredIdentityFromMeIntoCommonInfo(commonInfo);
    const loaded = await loadServicesForSelectedCategory();
    if (!loaded) return;
    await loadConditionalQuestions([]);
    renderServiceCards();
    phase = "services";
    showOnlyStep("services");
    updateProgress();
    return;
  }

  if (phase === "services") {
    syncCurrentCategorySelectionsFromDom();
    if (servicesCategoryIndex < servicesCategoryOrder.length - 1) {
      servicesCategoryIndex += 1;
      renderServiceCards();
      updateProgress();
      return;
    }
    if (!selectedServiceIds.length) {
      setStatus(t("common.service_flow.pick_service", "서비스를 하나 이상 선택해 주세요."));
      return;
    }
    const missingConditional = validateInlineConditionalRequired();
    if (missingConditional) {
      setStatus(t("common.service_flow.required_missing", "다음 항목을 완료해 주세요: {field}").replace("{field}", missingConditional));
      return;
    }
    await loadConditionalQuestions(selectedServiceIds);
    await mergeRegisteredIdentityFromMeIntoCommonInfo(commonInfo);
    phase = "review";
    showOnlyStep("review");
    renderReview();
    updateProgress();
    return;
  }

  if (phase === "review") {
    if (submittingReview) return;
    submittingReview = true;
    updateChrome();
    setStatus("설문을 접수하는 중입니다...");
    try {
      await mergeRegisteredIdentityFromMeIntoCommonInfo(commonInfo);
      const payload = buildServiceFlowSubmitPayload();
      const result = await surveyCustomerApi.submitServiceFlow(payload);
      const quoteId = result?.quote?.quote_id || "";
      setStatus(
        "설문이 접수되었습니다. 운영팀이 검토한 뒤 안내드립니다. 메시지함과 등록 이메일에서 접수 확인 알림을 확인해 주세요."
      );
      const query = quoteId ? `?pending_quote_id=${encodeURIComponent(quoteId)}` : "";
      window.location.href = `survey-submitted.html${query}`;
    } catch (e) {
      const msg = e && typeof e.message === "string" ? e.message : String(e);
      setStatus(`접수에 실패했습니다. 잠시 후 다시 시도해 주세요. (${msg})`);
      submittingReview = false;
      updateChrome();
    }
  }
}

function goBack() {
  setStatus("");
  if (phase === "common_info") {
    phase = "category";
    showOnlyStep("category");
    updateProgress();
    return;
  }
  if (phase === "services") {
    syncCurrentCategorySelectionsFromDom();
    if (servicesCategoryIndex > 0) {
      servicesCategoryIndex -= 1;
      renderServiceCards();
      updateProgress();
      return;
    }
    phase = "common_info";
    showOnlyStep("common_info");
    void prefillProfileBasicInfo();
    updateProgress();
    return;
  }
  if (phase === "review") {
    phase = "services";
    showOnlyStep("services");
    servicesCategoryIndex = Math.max(0, servicesCategoryOrder.length - 1);
    renderServiceCards();
    updateProgress();
  }
}

function moveServicesCategory(delta) {
  if (phase !== "services") return;
  syncCurrentCategorySelectionsFromDom();
  const nextIdx = servicesCategoryIndex + delta;
  if (nextIdx < 0 || nextIdx >= servicesCategoryOrder.length) return;
  servicesCategoryIndex = nextIdx;
  renderServiceCards();
  updateProgress();
}

async function init() {
  await initCommonI18nAndApplyDom(document);
  qs("#sfBackBtn")?.addEventListener("click", goBack);
  qs("#sfNextBtn")?.addEventListener("click", () => void goNext());
  qs("#sfServicesPrevCategoryBtn")?.addEventListener("click", () => moveServicesCategory(-1));
  qs("#sfServicesNextCategoryBtn")?.addEventListener("click", () => moveServicesCategory(1));
  qs("#sfCommonMinorCount")?.addEventListener("input", renderMinorAgeInputs);
  renderMinorAgeInputs();

  try {
    categories = await serviceCatalogBrowseApi.listCategories();
    await preloadCategoryDeliverySummary();
  } catch (e) {
    setStatus(e?.message || t("common.service_flow.load_categories_error", "Could not load categories."));
    categories = [];
  }
  renderCategories();
  updateCategorySelectedCount();
  showOnlyStep("category");
  updateProgress();
}

void init();
