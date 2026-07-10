/**
 * Service-driven customer flow:
 * common info → category → service(s) with inline questions → review.
 */
import { serviceCatalogBrowseApi, serviceIntakeCustomerApi, surveyCustomerApi, userCustomerApi } from "../core/api.js";
import { getSession, getAccessToken, getCustomerMessagingProfileId } from "../core/auth.js";
import { t } from "../core/i18n-client.js";
import { alertI18n } from "../core/app-dialog.js";
import { getEffectiveLanguage } from "../core/preferred-language.js";
import { localizedStatus } from "../core/i18n-dynamic.js";
import {
  augmentedPreviewFields,
  buildAnswerContext,
  buildFieldLookup,
  evaluateFieldVisibility,
  orderedActiveBlocks,
  previewFieldFromGroupChild,
} from "../intake/intake-preview-branching.js";
import { isCatalogRecServiceItemUuidString, isLegacyServiceId } from "../lib/catalog-rec-service-item-id.js";
import {
  catalogCardLongDescription,
  catalogCardShortDescription,
  catalogCardTitle,
  catalogCategoryTitle,
  catalogDisplayText,
  catalogFieldNeedsTranslationPlaceholder,
  catalogFieldSameLocale,
} from "./catalog-display-logic.js";
import { qs, safeText, scrollPageToTop } from "../core/utils.js";

const esc = safeText;

/** Default badge + explanation (overridden via `t()` keys `common.service_flow.delivery.{mode}.*`). */
const DELIVERY_FALLBACK = {
  ai_guide: {
    badge: "Landing Help AI Agent",
    explain: "This service is delivered through AI guidance, checklists, and digital assistance.",
  },
  in_person: {
    badge: "In-person support",
    explain: "This service requires human or on-site support.",
  },
  ai_plus_human: {
    badge: "Landing Help AI Agent + optional human help",
    explain: "Starts with AI guidance; optional in-person support is available when needed.",
  },
  general: {
    badge: "Guided service",
    explain: "We guide you through the next steps in a clear, practical flow.",
  },
};

/**
 * @param {string} mode backend UI bucket: ai_guide | in_person | ai_plus_human | general
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

/** 관리자 저장 시 쓰이던 자동 문구 — DB에 남아 있으면 현재 UI 언어 i18n 기본으로 대체 */
const LEGACY_DELIVERY_LABELS_EN = new Set([
  "In-person Support",
  "AI Guide",
  "AI + Optional Human Help",
  "Guided Service",
]);
const LEGACY_DELIVERY_LABELS_KO = new Set([
  "Landing Help AI Agent",
  "대면 지원",
  "Landing Help AI Agent + 선택 대면",
  "안내형 서비스",
]);
const LEGACY_DELIVERY_HELPS_EN = new Set([
  "This service requires human or on-site support.",
  "This service is delivered through AI guidance, checklists, and digital assistance.",
  "This service starts with AI guidance and can include optional human support when needed.",
  "We will guide you through the next steps in a clear, practical flow.",
]);
const LEGACY_DELIVERY_HELPS_KO = new Set([
  "이 서비스는 Landing Help AI Agent, 체크리스트, 디지털 도움으로 진행됩니다.",
  "이 서비스는 담당자 또는 현장 지원이 필요합니다.",
  "Landing Help AI Agent로 시작하며, 필요 시 선택적으로 대면 지원을 받을 수 있습니다.",
  "다음 단계를 명확하고 단순하게 안내해 드립니다.",
]);

function isLegacyEnglishInPersonLabel(raw) {
  const x = String(raw || "").trim().toLowerCase();
  return x === "in-person support" || x === "in-person" || x === "in person support";
}

function isLegacyDeliveryHelp(raw) {
  const x = String(raw || "").trim();
  if (LEGACY_DELIVERY_HELPS_EN.has(x) || LEGACY_DELIVERY_HELPS_KO.has(x)) return true;
  const lower = x.toLowerCase();
  return lower === "this service requires human or on-site support.";
}

function isLegacyDeliveryLabel(raw) {
  const x = String(raw || "").trim();
  return (
    !x ||
    LEGACY_DELIVERY_LABELS_EN.has(x) ||
    LEGACY_DELIVERY_LABELS_KO.has(x) ||
    isLegacyEnglishInPersonLabel(x)
  );
}

/**
 * Prefer viewer-locale ``display_*`` from browse API; fall back to stored fields / i18n.
 * @param {{ delivery_type_label?: string, display_delivery_type_label?: string }} svc
 * @param {{ badge: string, explain: string }} d
 */
function effectiveDeliveryBadge(svc, d) {
  if (catalogFieldNeedsTranslationPlaceholder(svc, "delivery_type_label")) {
    return catalogDisplayText(svc, "delivery_type_label", t, { kind: "title" }) || d.badge;
  }
  const resolved = catalogDisplayText(svc, "delivery_type_label", t, { kind: "title" });
  if (resolved && !isLegacyDeliveryLabel(resolved)) return resolved;
  if (catalogFieldSameLocale(svc, "delivery_type_label")) {
    const raw = String(svc?.delivery_type_label || "").trim();
    if (raw && !isLegacyDeliveryLabel(raw)) return raw;
  }
  return d.badge;
}

/**
 * @param {{ delivery_type_help_text?: string, display_delivery_type_help_text?: string }} svc
 * @param {{ badge: string, explain: string }} d
 */
function effectiveDeliveryHelp(svc, d) {
  if (catalogFieldNeedsTranslationPlaceholder(svc, "delivery_type_help_text")) {
    const pending = catalogDisplayText(svc, "delivery_type_help_text", t, { kind: "body" });
    return pending || d.explain;
  }
  const display = catalogDisplayText(svc, "delivery_type_help_text", t, { kind: "body" });
  if (display && !isLegacyDeliveryHelp(display)) return display;
  const raw = String(svc?.delivery_type_help_text || "").trim();
  if (!raw || isLegacyDeliveryHelp(raw)) return d.explain;
  return raw;
}

/** @param {Record<string, unknown>} svc */
function serviceShortDescription(svc) {
  return catalogCardShortDescription(svc, t);
}

/** @param {Record<string, unknown>} svc */
function serviceLongDescription(svc) {
  return catalogCardLongDescription(svc, t);
}

/** @param {{ delivery_capability?: string, delivery_mode?: string }} svc */
function inferDeliveryCapability(svc) {
  const c = String(svc?.delivery_capability || "").trim().toUpperCase();
  if (c === "AI_AGENT" || c === "IN_PERSON" || c === "BOTH") return c;
  const m = svc?.delivery_mode || "general";
  if (m === "ai_guide") return "AI_AGENT";
  if (m === "in_person") return "IN_PERSON";
  if (m === "ai_plus_human") return "BOTH";
  return "AI_AGENT";
}

/**
 * API `delivery_mode`와 `delivery_capability`가 어긋나도 배지 색·문구는 capability 기준으로 통일.
 * @param {{ delivery_capability?: string, delivery_mode?: string }} svc
 */
function deliveryUiModeFromCapability(svc) {
  const cap = inferDeliveryCapability(svc || {});
  if (cap === "BOTH") return "ai_plus_human";
  if (cap === "AI_AGENT") return "ai_guide";
  if (cap === "IN_PERSON") return "in_person";
  const m = svc?.delivery_mode || "general";
  return m && DELIVERY_FALLBACK[m] ? m : "general";
}

function safeDeliveryInputName(serviceId) {
  return String(serviceId || "").replace(/[^a-zA-Z0-9_-]/g, "_");
}

function syncAutoDeliveryModesForSelection() {
  for (const sid of selectedServiceIds) {
    const svc = serviceItems.find((x) => x.id === sid);
    if (!svc) continue;
    const cap = inferDeliveryCapability(svc);
    if (cap === "AI_AGENT") selectedDeliveryModeByServiceId[sid] = "AI_AGENT";
    else if (cap === "IN_PERSON") selectedDeliveryModeByServiceId[sid] = "IN_PERSON";
  }
}

function readDeliveryModeRadiosFromDom() {
  const root = qs("#sfServiceList");
  if (!root) return;
  root.querySelectorAll('input[type="radio"][data-sf-delivery]:checked').forEach((inp) => {
    if (!(inp instanceof HTMLInputElement)) return;
    const sid = inp.getAttribute("data-sf-service-id") || "";
    const val = inp.value || "";
    if (sid && (val === "AI_AGENT" || val === "IN_PERSON")) selectedDeliveryModeByServiceId[sid] = val;
  });
}

function validateDeliverySelections() {
  for (const sid of selectedServiceIds) {
    const svc = serviceItems.find((x) => x.id === sid);
    if (!svc) continue;
    const cap = inferDeliveryCapability(svc);
    if (cap !== "BOTH") continue;
    const v = selectedDeliveryModeByServiceId[sid];
    if (v !== "AI_AGENT" && v !== "IN_PERSON") {
      const title = serviceTitle(svc) || svc.name || sid;
      return t(
        "common.service_flow.validation.delivery_mode_required",
        "Choose AI Agent or in-person delivery for: {title}"
      ).replace("{title}", title);
    }
  }
  return "";
}

/** @param {string} mode AI_AGENT | IN_PERSON */
function deliveryChoiceReviewLabel(mode) {
  const m = String(mode || "").toUpperCase();
  if (m === "IN_PERSON") return t("common.service_flow.delivery_choice.in_person", "In-person support");
  return t("common.service_flow.delivery_choice.ai_agent", "AI Agent (digital guide)");
}

function renderDeliveryModePick(s, isChecked) {
  const cap = inferDeliveryCapability(s);
  if (cap !== "BOTH") return "";
  const cur = selectedDeliveryModeByServiceId[s.id] || "";
  if (!isChecked) return "";
  const nm = `sfDeliv_${safeDeliveryInputName(s.id)}`;
  return `
    <div class="service-flow__delivery-pick" role="group" aria-labelledby="${esc(nm)}_legend">
      <p class="lhai-help service-flow__delivery-pick-lead" id="${esc(nm)}_legend">${esc(
    t("common.service_flow.pick_delivery_mode", "Choose how this service should be delivered:")
  )}</p>
      <div class="service-flow__delivery-options">
        <label class="service-flow__radio">
          <input type="radio" data-sf-delivery="1" data-sf-service-id="${esc(s.id)}" name="${esc(nm)}" value="AI_AGENT" ${
    cur === "AI_AGENT" ? "checked" : ""
  } />
          ${esc(t("common.service_flow.delivery_choice.ai_agent", "AI Agent (digital guide)"))}
        </label>
        <label class="service-flow__radio">
          <input type="radio" data-sf-delivery="1" data-sf-service-id="${esc(s.id)}" name="${esc(nm)}" value="IN_PERSON" ${
    cur === "IN_PERSON" ? "checked" : ""
  } />
          ${esc(t("common.service_flow.delivery_choice.in_person", "In-person support"))}
        </label>
      </div>
    </div>`;
}

/** @type {{ id: string, name: string, description?: string, sort_order?: number }[]} */
let categories = [];
/** @type {{ id: string, name: string, description?: string, delivery_mode: string, delivery_capability?: string, type?: string }[]} */
let serviceItems = [];
/** Per selected service item: AI_AGENT | IN_PERSON (required when catalog offers BOTH). */
let selectedDeliveryModeByServiceId = {};
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
  target_city: "",
};

/** phase: 'category' | 'common_info' | 'services' | 'review' */
let phase = "common_info";
let conditionalQuestions = [];
let conditionalAnswersByItemId = {};
let conditionalOptionsByItemId = {};
let conditionalLoadedGroup = "";

let profilePrefillAttempted = false;
let submittingReview = false;

function conditionalQuestionKey(serviceId, fieldId) {
  return `${serviceId}::${fieldId}`;
}

/**
 * Merge Customer Intake Builder visibility on the block row into the field-shaped row (questions + group children).
 * @param {Record<string, unknown>} fieldish
 * @param {Record<string, unknown>} block
 */
function mergeIntakeFieldAndBlockVisibility(fieldish, block) {
  const fVis = fieldish.visibility_rule_json && typeof fieldish.visibility_rule_json === "object" ? fieldish.visibility_rule_json : {};
  const bVis = block.visibility_rule_json && typeof block.visibility_rule_json === "object" ? block.visibility_rule_json : {};
  const fk = Object.keys(fVis).length;
  const bk = Object.keys(bVis).length;
  if (!fk) return { ...fieldish, visibility_rule_json: { ...bVis } };
  if (!bk) return { ...fieldish, visibility_rule_json: { ...fVis } };
  return {
    ...fieldish,
    visibility_rule_json: {
      op: "all",
      rules: [{ ...fVis }, { ...bVis }],
    },
  };
}

/**
 * @param {string} serviceId
 * @param {Array<Record<string, unknown>>} augFields from ``augmentedPreviewFields``
 */
function buildInlineAnswersByFieldIdForService(serviceId, augFields) {
  /** @type {Record<string, Record<string, unknown>>} */
  const out = {};
  for (const f of augFields) {
    const fid = String(f.id || "").trim();
    if (!fid) continue;
    const qid = conditionalQuestionKey(serviceId, fid);
    const aj = conditionalAnswersByItemId[qid];
    if (aj && typeof aj === "object" && Object.keys(aj).length) {
      out[fid] = /** @type {Record<string, unknown>} */ (aj);
    }
  }
  return out;
}

function setStatus(msg) {
  const el = qs("#sfStatus");
  if (el) el.textContent = msg || "";
}

function categoryTitle(category) {
  const title = catalogCategoryTitle(category, t);
  if (title) {
    if (/^[a-z0-9_-]+$/i.test(title) || title.includes("pkg-") || title.includes("cat-")) {
      return t("common.service_flow.unknown_category", "Selected area");
    }
    return title;
  }
  return t("common.service_flow.unknown_category", "Selected area");
}

function serviceTitle(serviceItem) {
  const title = catalogCardTitle(serviceItem, t);
  if (title) {
    if (/^[a-z0-9_-]+$/i.test(title) || title.includes("addon-") || title.includes("module-")) {
      return t("common.service_flow.unknown_service", "Selected service");
    }
    return title;
  }
  return t("common.service_flow.unknown_service", "Selected service");
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
      "This category includes both AI Guide and in-person support services."
    );
  }
  if (hasAiOnly && !hasInPersonOnly && !hasHybrid && !hasGeneral) {
    return t("common.service_flow.category_ai_only_short", "Mostly AI-guided services in this area.");
  }
  if (hasInPersonOnly && !hasAiOnly && !hasHybrid && !hasGeneral) {
    return t("common.service_flow.category_inperson_only_short", "Mostly in-person support services in this area.");
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
      badge: t("common.service_flow.category_mixed_badge", "AI + optional in-person"),
      explain: t(
        "common.service_flow.category_mixed_explain",
        "This area may mix different delivery modes. Review each service card before selecting."
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
        const modes = new Set(items.map((x) => deliveryUiModeFromCapability(x)));
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
  if (phase === "common_info") return 1;
  if (phase === "category") return 2;
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
    label.textContent = localizedStatus("common.service_flow.progress_label", "Step {current} of {total}", {
      current: n,
      total,
    });
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
  scrollPageToTop();
}

function updateChrome() {
  const back = qs("#sfBackBtn");
  if (back) {
    back.disabled = phase === "common_info" || submittingReview;
    back.textContent = phase === "review"
      ? t("common.service_flow.btn_back_edit", "Back to edit")
      : t("common.service_flow.btn_back", "Back");
  }
  const next = qs("#sfNextBtn");
  if (next) {
    next.disabled = (phase === "category" && selectedCategoryIds.length < 1) || submittingReview;
    if (phase === "review") {
      next.textContent = submittingReview
        ? t("common.service_flow.btn_submitting_request", "Submitting request…")
        : t("common.service_flow.btn_submit_request", "Submit request");
    } else if (phase === "services" && servicesCategoryIndex < servicesCategoryOrder.length - 1) {
      next.textContent = t("common.service_flow.btn_next_category", "Next category");
    } else {
      next.textContent = t("common.service_flow.btn_next", "Next");
    }
  }
}

function updateCategorySelectedCount() {
  const el = qs("#sfCategorySelectedCount");
  if (!el) return;
  const n = selectedCategoryIds.length;
  el.textContent =
    n > 0
      ? localizedStatus("common.service_flow.category_selected_count_dynamic", "{count} selected", { count: n })
      : t("common.service_flow.category_selected_count", "0 selected");
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
        "This is your account email. Submissions and admin views use this address."
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
      ${selectedCategoryIds.includes(c.id) ? `<span class="service-flow__category-selected-pill">✓ ${esc(t("common.service_flow.category_selected_pill", "Selected"))}</span>` : ""}
      <span class="service-flow__category-card-title">${esc(categoryTitle(c))}</span>
      <span class="service-flow__badge service-flow__badge--${esc(categoryDeliveryMetaById.get(c.id)?.mode || "general")}">${esc(
        categoryDeliveryMetaById.get(c.id)?.badge || deliveryMeta("general").badge
      )}</span>
      ${(() => {
        const subtitle = catalogDisplayText(c, "customer_subtitle", t, { kind: "body" });
        const help = catalogDisplayText(c, "customer_help_text", t, { kind: "body" });
        return `${subtitle ? `<span class="lhai-help service-flow__category-card-desc">${esc(subtitle)}</span>` : ""}${
          help ? `<span class="lhai-help service-flow__category-card-desc">${esc(help)}</span>` : ""
        }`;
      })()}
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
      /** @type {Record<string, Record<string, unknown>>} */
      const fieldsById = Object.fromEntries(fields.map((f) => [String(f.id), f]));
      const blocks = orderedActiveBlocks(bundle.blocks || []);
      const augFields = augmentedPreviewFields(fields, blocks);
      const svcName = serviceTitle(svc) || svc.name || "";
      const svcMode = deliveryUiModeFromCapability(svc);

      for (const b of blocks) {
        const bt = String(b.block_type || "");
        const bSort = Number(b.sort_order ?? 0) || 0;
        if (bt === "question") {
          const raw = fieldsById[String(b.id)];
          if (!raw || raw.archived_at) continue;
          const merged = mergeIntakeFieldAndBlockVisibility(/** @type {Record<string, unknown>} */ (raw), b);
          const qid = conditionalQuestionKey(svc.id, merged.id);
          const options = (bundle.options_by_field_id?.[merged.id] || [])
            .filter((o) => o.active !== false)
            .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
          conditionalQuestions.push({
            id: qid,
            service_id: svc.id,
            service_name: svcName,
            delivery_mode: svcMode,
            field_id: merged.id,
            intake_field_key: String(merged.field_key || merged.id || "").trim() || String(merged.id || ""),
            label: merged.label || "",
            help_text: merged.help_text || "",
            input_type: merged.input_type || "text",
            placeholder: merged.placeholder || "",
            required: Boolean(merged.required),
            sort_order: merged.sort_order ?? bSort,
            visibility_rule_json: merged.visibility_rule_json || {},
            intake_question_shape: "field",
          });
          conditionalOptionsByItemId[qid] = options;
          if (prevAnswers[qid]) conditionalAnswersByItemId[qid] = prevAnswers[qid];
        } else if (bt === "question_group") {
          const pl = b.payload && typeof b.payload === "object" ? /** @type {Record<string, unknown>} */ (b.payload) : {};
          const gTitle = String(pl.title || "").trim();
          const kids = Array.isArray(pl.children) ? pl.children : [];
          let i = 0;
          for (const ch of kids) {
            if (!ch || typeof ch !== "object") continue;
            const baseChild = previewFieldFromGroupChild(/** @type {Record<string, unknown>} */ (ch));
            const mergedChild = mergeIntakeFieldAndBlockVisibility(baseChild, b);
            const cid = String(mergedChild.id || "").trim();
            if (!cid) continue;
            const qid = conditionalQuestionKey(svc.id, cid);
            const optRaw = Array.isArray(mergedChild.options) ? mergedChild.options : [];
            const options = optRaw
              .filter((o) => o && typeof o === "object")
              .map((o, idx) => {
                const row = /** @type {Record<string, unknown>} */ (o);
                return {
                  id: String(row.id || row.value || idx),
                  field_id: cid,
                  value: String(row.value ?? row.label ?? `v${idx}`),
                  label: String(row.label ?? row.value ?? ""),
                  sort_order: Number(row.sort_order ?? idx) || idx,
                  active: row.active !== false,
                };
              })
              .filter((o) => String(o.value || "").trim());
            const labelBase = String(mergedChild.label || "").trim();
            const questionFallback = t("common.service_flow.question_label_fallback", "Question");
            const label = gTitle ? `${gTitle} — ${labelBase || questionFallback}` : labelBase || questionFallback;
            conditionalQuestions.push({
              id: qid,
              service_id: svc.id,
              service_name: svcName,
              delivery_mode: svcMode,
              field_id: cid,
              intake_field_key: String(mergedChild.field_key || cid).trim() || cid,
              label,
              help_text: String(mergedChild.help_text || ""),
              input_type: mergedChild.input_type || "text",
              placeholder: String(mergedChild.placeholder || ""),
              required: Boolean(mergedChild.required),
              sort_order: bSort + i * 0.001,
              visibility_rule_json: mergedChild.visibility_rule_json || {},
              intake_question_shape: "question_group_child",
              question_group_block_id: String(b.id || ""),
              question_group_title: gTitle,
            });
            conditionalOptionsByItemId[qid] = options;
            if (prevAnswers[qid]) conditionalAnswersByItemId[qid] = prevAnswers[qid];
            i += 1;
          }
        }
      }
    }
  } catch {
    conditionalQuestions = [];
  }
}

function isConditionalQuestionVisible(question) {
  const rule = question?.visibility_rule_json;
  if (!rule || typeof rule !== "object" || Array.isArray(rule) || Object.keys(rule).length === 0) return true;

  // Legacy service-flow conditional shape (pre–Customer Intake Builder branching).
  if (rule.mode === "when_answer_equals") {
    const sourceFieldId = String(rule.source_field_id || "").trim();
    if (!sourceFieldId) return true;
    const sourceKey = conditionalQuestionKey(question.service_id, sourceFieldId);
    const sourceAnswer = conditionalAnswersByItemId[sourceKey];
    if (!sourceAnswer) return false;
    const expected = String(rule.match_value ?? "");
    if (Array.isArray(sourceAnswer.values)) return sourceAnswer.values.map(String).includes(expected);
    return String(sourceAnswer.value ?? "") === expected;
  }

  // Customer Intake Builder branching (`op` / nested `when`, …) — mirror admin preview + backend intake_branching.
  const sid = String(question.service_id || "").trim();
  if (!sid) return true;

  const allForService = conditionalQuestions.filter((q) => String(q.service_id) === sid);
  const templateFields = allForService
    .filter((q) => String(q.intake_question_shape || "field") === "field")
    .map((q) => ({
      id: q.field_id,
      field_key: String(q.intake_field_key || q.field_id || "").trim() || String(q.field_id || ""),
      label: q.label,
      help_text: q.help_text,
      input_type: q.input_type,
      placeholder: q.placeholder,
      required: q.required,
      sort_order: q.sort_order,
      visibility_rule_json: q.visibility_rule_json || {},
      active: true,
      archived_at: null,
    }));

  const blocksForAug = [];
  for (const q of allForService) {
    if (String(q.intake_question_shape || "field") !== "question_group_child") continue;
    const bid = String(q.question_group_block_id || "").trim();
    if (!bid) continue;
    const title = String(q.question_group_title || "").trim();
    const baseLabel = q.label.includes(" — ") ? q.label.split(" — ").slice(1).join(" — ") : q.label;
    const childId = String(q.field_id || "").trim();
    blocksForAug.push({
      id: bid,
      block_key: bid,
      block_type: "question_group",
      sort_order: q.sort_order ?? 0,
      active: true,
      archived_at: null,
      visibility_rule_json: {},
      payload: {
        title,
        description: "",
        layout: "stack",
        children: [
          {
            id: childId,
            label: baseLabel,
            help_text: q.help_text,
            input_type: q.input_type,
            placeholder: q.placeholder,
            required: q.required,
            options: (conditionalOptionsByItemId[q.id] || []).map((o) => ({
              value: o.value,
              label: o.label,
              sort_order: o.sort_order,
            })),
          },
        ],
      },
    });
  }

  const aug = augmentedPreviewFields(templateFields, blocksForAug);
  const fieldsByKey = buildFieldLookup(aug);
  const answersByFieldId = buildInlineAnswersByFieldIdForService(sid, aug);
  const ctx = buildAnswerContext(aug, answersByFieldId);
  const fShape = {
    id: question.field_id,
    field_key: String(question.intake_field_key || question.field_id || "").trim() || String(question.field_id || ""),
    label: question.label,
    help_text: question.help_text,
    input_type: question.input_type,
    placeholder: question.placeholder,
    required: question.required,
    sort_order: question.sort_order,
    visibility_rule_json: question.visibility_rule_json || {},
    active: true,
    archived_at: null,
  };
  return evaluateFieldVisibility(fShape, ctx, fieldsByKey, answersByFieldId, aug);
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
        t("common.service_flow.inline_questions_lead", "Additional questions required for this service.")
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
      const ageLabel = localizedStatus(
        "common.service_flow.minor_age_label",
        "Age for minor {index}",
        { index: i + 1 },
      );
      const agePlaceholder = t("common.service_flow.minor_age_placeholder", "e.g. 7");
      return `
        <div class="service-flow__field">
          <label class="lhai-label" for="sfCommonMinorAge_${i}">${esc(ageLabel)}</label>
          <input class="lhai-input" id="sfCommonMinorAge_${i}" type="number" min="0" max="17" step="1" value="${esc(v)}" placeholder="${esc(agePlaceholder)}" />
        </div>
      `;
    })
    .join("");
}

function resolveSurveyPreferredLanguageFromAccount() {
  return getEffectiveLanguage() || "en";
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
  const targetCity = (qs("#sfCommonTargetCity")?.value || "").trim();
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
    target_city: targetCity,
    preferred_language: resolveSurveyPreferredLanguageFromAccount(),
  };
}

/** @typedef {{ key: string, labelKey: string, params?: Record<string, unknown> }} CommonInfoIssue */

/** @type {Record<string, string>} */
const COMMON_INFO_FOCUS_BY_KEY = {
  profile_first: "#sfProfileFirstName",
  profile_last: "#sfProfileLastName",
  profile_birth: "#sfProfileBirthDate",
  profile_email: "#sfProfileEmail",
  entry_date: "#sfCommonEntryDate",
  adult_count: "#sfCommonAdultCount",
  minor_count: "#sfCommonMinorCount",
  minor_ages: "#sfCommonMinorAgesList",
  target_state: "#sfCommonTargetState",
  target_city: "#sfCommonTargetCity",
};

/** @type {Record<string, [string, string]>} */
const COMMON_INFO_VALIDATION_I18N = {
  profile_first: ["common.service_flow.validation.profile_first", "First name"],
  profile_last: ["common.service_flow.validation.profile_last", "Last name"],
  profile_birth: ["common.service_flow.validation.profile_birth", "Date of birth"],
  profile_email: ["common.service_flow.validation.profile_email", "Email"],
  profile_email_format: ["common.service_flow.validation.profile_email_format", "Email (check the format)"],
  adult_count_number: ["common.service_flow.validation.adult_count_number", "People aged 18 and over (enter a number)"],
  adult_count_min: ["common.service_flow.validation.adult_count_min", "People aged 18 and over (0 or greater)"],
  minor_count_number: ["common.service_flow.validation.minor_count_number", "People under 18 (enter a number)"],
  minor_count_min: ["common.service_flow.validation.minor_count_min", "People under 18 (0 or greater)"],
  household_total: ["common.service_flow.validation.household_total", "Travel party (at least 1 person total)"],
  minor_ages_all: ["common.service_flow.validation.minor_ages_all", "Age for each person under 18 (all required)"],
  minor_age_invalid: ["common.service_flow.validation.minor_age_invalid", "Age for minor {index} (0–17)"],
  entry_date: ["common.service_flow.validation.entry_date", "Planned entry (or start) date"],
  target_state: ["common.service_flow.validation.target_state", "Preferred state"],
  target_city: ["common.service_flow.validation.target_city", "Preferred city"],
};

/** @param {CommonInfoIssue} issue */
function commonInfoIssueLabel(issue) {
  const spec = COMMON_INFO_VALIDATION_I18N[issue.labelKey];
  if (!spec) return issue.labelKey;
  const [key, fallback] = spec;
  if (issue.params && Object.keys(issue.params).length) {
    return localizedStatus(key, fallback, issue.params);
  }
  return t(key, fallback);
}

/**
 * @param {Record<string, unknown>} info from readCommonInfoFromForm
 * @returns {CommonInfoIssue[]}
 */
function validateCommonInfoIssues(info) {
  /** @type {CommonInfoIssue[]} */
  const issues = [];

  const fn = String(info.profile_first_name || "").trim();
  const ln = String(info.profile_last_name || "").trim();
  if (!fn) issues.push({ key: "profile_first", labelKey: "profile_first" });
  if (!ln) issues.push({ key: "profile_last", labelKey: "profile_last" });
  if (!String(info.profile_birth_date || "").trim()) {
    issues.push({ key: "profile_birth", labelKey: "profile_birth" });
  }
  const em = String(info.profile_email || "").trim();
  if (!em) issues.push({ key: "profile_email", labelKey: "profile_email" });
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em)) {
    issues.push({ key: "profile_email", labelKey: "profile_email_format" });
  }

  const adultRaw = info.adult_count;
  const minorRaw = info.minor_count;
  const adults = Number.parseInt(String(adultRaw ?? "").trim() || "0", 10);
  const minors = Number.parseInt(String(minorRaw ?? "").trim() || "0", 10);
  const adultStr = String(adultRaw ?? "").trim();
  const minorStr = String(minorRaw ?? "").trim();

  if (adultStr !== "" && Number.isNaN(adults)) {
    issues.push({ key: "adult_count", labelKey: "adult_count_number" });
  } else if (Number.isNaN(adults) || adults < 0) {
    issues.push({ key: "adult_count", labelKey: "adult_count_min" });
  }
  if (minorStr !== "" && Number.isNaN(minors)) {
    issues.push({ key: "minor_count", labelKey: "minor_count_number" });
  } else if (Number.isNaN(minors) || minors < 0) {
    issues.push({ key: "minor_count", labelKey: "minor_count_min" });
  }
  if (!Number.isNaN(adults) && !Number.isNaN(minors) && adults + minors <= 0) {
    issues.push({ key: "adult_count", labelKey: "household_total" });
  }

  if (!Number.isNaN(minors) && minors > 0) {
    const ages = Array.isArray(info.minor_ages) ? info.minor_ages : [];
    if (ages.length !== minors) {
      issues.push({ key: "minor_ages", labelKey: "minor_ages_all" });
    } else {
      for (let i = 0; i < ages.length; i++) {
        const n = Number.parseInt(String(ages[i] || ""), 10);
        if (Number.isNaN(n) || n < 0 || n >= 18) {
          issues.push({ key: "minor_ages", labelKey: "minor_age_invalid", params: { index: i + 1 } });
          break;
        }
      }
    }
  }

  if (!String(info.entry_date || "").trim()) {
    issues.push({ key: "entry_date", labelKey: "entry_date" });
  }
  if (!String(info.target_state || "").trim()) {
    issues.push({ key: "target_state", labelKey: "target_state" });
  }
  if (!String(info.target_city || "").trim()) {
    issues.push({ key: "target_city", labelKey: "target_city" });
  }

  return issues;
}

/** @param {CommonInfoIssue[]} issues */
function focusFirstCommonInfoIssue(issues) {
  for (const iss of issues) {
    const sel = COMMON_INFO_FOCUS_BY_KEY[iss.key];
    if (!sel) continue;
    const el = qs(sel);
    if (el instanceof HTMLElement) {
      const focusable =
        el instanceof HTMLInputElement ||
        el instanceof HTMLSelectElement ||
        el instanceof HTMLTextAreaElement ||
        el instanceof HTMLButtonElement
          ? el
          : /** @type {HTMLElement | null} */ (el.querySelector("input, select, textarea"));
      if (focusable instanceof HTMLElement) {
        focusable.focus();
        focusable.scrollIntoView({ block: "center", behavior: "smooth" });
      } else {
        el.scrollIntoView({ block: "center", behavior: "smooth" });
      }
      return;
    }
  }
}

async function loadServicesForSelectedCategory() {
  try {
    serviceItemsByCategoryId.clear();
    selectedServiceIdsByCategoryId.clear();
    const all = [];
    for (const categoryId of selectedCategoryIds) {
      const perCategory = await serviceCatalogBrowseApi.listServiceItems(categoryId);
      const rows = (Array.isArray(perCategory) ? perCategory : []).filter(
        (x) => x && isCatalogRecServiceItemUuidString(x.id)
      );
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
  const allowed = new Set(selectedServiceIds);
  Object.keys(selectedDeliveryModeByServiceId).forEach((k) => {
    if (!allowed.has(k)) delete selectedDeliveryModeByServiceId[k];
  });
  syncAutoDeliveryModesForSelection();
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
  if (idxEl) {
    idxEl.textContent = total
      ? localizedStatus("common.service_flow.services_area_index", "Area {current} / {total}", {
          current: n,
          total,
        })
      : t("common.service_flow.services_area_index_empty", "Area 0 / 0");
  }

  const category = currentServicesCategory();
  if (titleEl) titleEl.textContent = category ? categoryTitle(category) : t("common.service_flow.unknown_category", "Selected area");

  if (descEl) {
    const subtitle = catalogDisplayText(category, "customer_subtitle", t, { kind: "body" });
    descEl.hidden = !subtitle;
    descEl.textContent = subtitle;
  }
  if (helpEl) {
    const help = catalogDisplayText(category, "customer_help_text", t, { kind: "body" });
    helpEl.hidden = !help;
    helpEl.textContent = help;
  }

  const canGoPrev = total > 1 && servicesCategoryIndex > 0;
  const canGoNext = total > 1 && servicesCategoryIndex < total - 1;
  if (prevBtn) {
    prevBtn.hidden = !canGoPrev;
    prevBtn.disabled = !canGoPrev;
  }
  if (nextBtn) {
    nextBtn.hidden = !canGoNext;
    nextBtn.disabled = !canGoNext;
  }
  const navGroup = prevBtn?.closest(".service-flow__services-substep-nav");
  if (navGroup instanceof HTMLElement) {
    navGroup.hidden = !canGoPrev && !canGoNext;
  }
}

function renderMixedDeliveryNote(list = []) {
  const el = qs("#sfMixedDeliveryNote");
  if (!el) return;
  const modes = [...new Set(list.map((s) => deliveryUiModeFromCapability(s)))];
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
  const selected = new Set(selectedServiceIdsByCategoryId.get(categoryId) || []);
  root.innerHTML = list
    .map((s) => {
      const d = deliveryMeta(deliveryUiModeFromCapability(s));
      const isChecked = selected.has(s.id);
      return `
      <label class="service-flow__service-card">
        <input type="checkbox" class="service-flow__service-check" name="sfSvc" value="${esc(s.id)}" />
        <span class="service-flow__service-card-body">
          <span class="service-flow__service-name">${esc(serviceTitle(s) || s.name || "")}</span>
          <span class="service-flow__badge service-flow__badge--${esc(d.mode)}">${esc(effectiveDeliveryBadge(s, d))}</span>
          <span class="lhai-help service-flow__badge-explainer">${esc(effectiveDeliveryHelp(s, d))}</span>
          ${(() => {
            const shortDesc = serviceShortDescription(s);
            const longDesc = serviceLongDescription(s);
            const shortHtml = shortDesc
              ? `<span class="lhai-help service-flow__service-desc">${esc(shortDesc)}</span>`
              : "";
            const longHtml = longDesc
              ? `<span class="lhai-help service-flow__service-desc">${esc(longDesc)}</span>`
              : "";
            return `${shortHtml}${longHtml}`;
          })()}
          ${renderDeliveryModePick(s, isChecked)}
          ${renderInlineConditionalQuestions(s.id)}
        </span>
      </label>`;
    })
    .join("");

  root.querySelectorAll('input[name="sfSvc"]').forEach((inp) => {
    if (inp instanceof HTMLInputElement) inp.checked = selected.has(inp.value);
    inp.addEventListener("change", () => {
      const checkedInCurrent = Array.from(root.querySelectorAll('input[name="sfSvc"]:checked')).map((x) => x.value);
      selectedServiceIdsByCategoryId.set(categoryId, checkedInCurrent);
      rebuildSelectedServiceIds();
      readDeliveryModeRadiosFromDom();
      clearConditionalAnswersForUnselectedServices();
      renderServiceCards();
    });
  });

  root.querySelectorAll('input[type="radio"][data-sf-delivery]').forEach((inp) => {
    inp.addEventListener("change", () => {
      readDeliveryModeRadiosFromDom();
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
    return q.label || t("common.service_flow.required_question", "Required follow-up question");
  }
  return "";
}

function isTechnicalLikeLabel(text) {
  const s = String(text || "").trim();
  if (!s) return true;
  if (s.length > 64 && /[_:-]/.test(s)) return true;
  if (/^[a-z0-9_.:-]+$/i.test(s) && (s.includes("_") || s.includes(".") || s.includes(":") || s.includes("-"))) return true;
  if (/^(field|question|qitem|item|id|code)[_ .:-]/i.test(s)) return true;
  if (/^(first name|last name|birth_date|entry_date|adult_count|minor_count|support_need_level|budget_range)$/i.test(s))
    return true;
  return false;
}

/** @type {Record<string, [string, string]>} */
const REVIEW_DETAIL_LABEL_I18N = {
  first_name: ["common.service_flow.review.field.name", "Name"],
  last_name: ["common.service_flow.review.field.name", "Name"],
  full_name: ["common.service_flow.review.field.name", "Name"],
  birth_date: ["common.service_flow.profile_birth_date_label", "Date of birth"],
  entry_date: ["common.service_flow.entry_date_label", "Planned entry (or start) date"],
  household_count: ["common.service_flow.review.field.household", "People moving together"],
  who_is_moving: ["common.service_flow.review.field.household_composition", "Who is moving"],
  adult_count: ["common.service_flow.adult_count_label", "People aged 18 and over"],
  minor_count: ["common.service_flow.minor_count_label", "People under 18"],
  minor_ages: ["common.service_flow.minor_ages_label", "Ages of people under 18"],
  support_need_level: ["common.service_flow.review.field.support_need", "Preferred support level"],
  budget_range: ["common.service_flow.review.field.budget", "Budget priority"],
};

function normalizeReviewDetailLabel(rawLabel, fallbackIndex = 1) {
  const label = String(rawLabel || "").trim();
  const keyLike = label.toLowerCase().replace(/\s+/g, "_");
  const spec = REVIEW_DETAIL_LABEL_I18N[keyLike];
  if (spec) return t(spec[0], spec[1]);
  if (isTechnicalLikeLabel(label)) {
    return localizedStatus(
      "common.service_flow.review.extra_field_fallback",
      "Additional details {index}",
      { index: fallbackIndex },
    );
  }
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
  if (typeof aj.value === "boolean") {
    return aj.value
      ? t("common.service_flow.review.boolean_yes", "Yes")
      : t("common.service_flow.review.boolean_no", "No");
  }
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

function validateSelectedServiceIdsForSubmit() {
  for (const sid of selectedServiceIds) {
    const tId = String(sid || "").trim();
    if (!tId || isLegacyServiceId(tId) || !isCatalogRecServiceItemUuidString(tId)) {
      return t(
        "common.service_flow.invalid_service_item_id",
        "The service identifier is invalid. Reselect the category, then choose a service."
      );
    }
  }
  return "";
}

function buildServiceFlowSubmitPayload() {
  // selected_services[].id must be rec_service_items.id (UUID) from GET /api/service-catalog/browse/...
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
      const cap = inferDeliveryCapability(s);
      let sdm = selectedDeliveryModeByServiceId[sid];
      if (cap === "AI_AGENT") sdm = "AI_AGENT";
      else if (cap === "IN_PERSON") sdm = "IN_PERSON";
      return {
        id: sid,
        category_id: categoryId || "",
        title: serviceTitle(s) || s.name || sid,
        delivery_mode: deliveryUiModeFromCapability(s),
        selected_delivery_mode: sdm || null,
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
    common_info: {
      ...commonInfo,
      preferred_language: resolveSurveyPreferredLanguageFromAccount(),
    },
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
  const deliveryModes = new Set(selectedServices.map((s) => deliveryUiModeFromCapability(s)));
  const deliverySummary = summarizeDeliveryModes(deliveryModes) || t(
    "common.service_flow.review_delivery_summary_default",
    "Delivery mode (AI, in-person, or mixed) may differ per selected service."
  );

  const togetherMoving = (() => {
    const adults = Number.parseInt(commonInfo.adult_count || "0", 10) || 0;
    const minors = Number.parseInt(commonInfo.minor_count || "0", 10) || 0;
    const total = adults + minors;
    const minorAges = Array.isArray(commonInfo.minor_ages) ? commonInfo.minor_ages.filter(Boolean) : [];
    if (total <= 0) return "—";
    const base = localizedStatus(
      "common.service_flow.review.household_summary",
      "Total {total} (adults {adults}, minors {minors})",
      { total, adults, minors },
    );
    if (!minorAges.length) return base;
    return localizedStatus(
      "common.service_flow.review.household_with_ages",
      "{base} · Minor ages: {ages}",
      { base, ages: minorAges.join(", ") },
    );
  })();

  const nextStepHints = [
    t(
      "common.service_flow.review_next_hint_submit_click",
      "When you click Submit, your request is received securely first.",
    ),
    t(
      "common.service_flow.review_next_hint_ops_review",
      "Our team reviews your submission and checks the details.",
    ),
    t(
      "common.service_flow.review_next_hint_quote_sent",
      "When review is complete, we prepare a quote and send it to your email and inbox.",
    ),
  ];
  if (deliveryModes.has("in_person")) {
    nextStepHints.splice(
      1,
      0,
      t(
        "common.service_flow.review_next_hint_in_person",
        "For in-person services, we confirm location and schedule availability before follow-up.",
      ),
    );
  }

  const parts = [];
  parts.push(`<div class="service-flow__review-layout">`);
  parts.push(
    `<div class="service-flow__review-block service-flow__review-panel service-flow__review-panel--intro"><h3 class="service-flow__review-h">${esc(
      t("common.service_flow.review_understood_title", "Review your request before submitting")
    )}</h3><p class="lhai-help">${esc(
      t(
        "common.service_flow.review_understood_lead",
        "We organized your answers so you can review everything in one place before submitting."
      )
    )}</p><p class="lhai-help">${esc(
      t(
        "common.service_flow.review_confirm_submit",
        "If everything looks correct, submit your request below. You can go back to edit anything.",
      )
    )}</p></div>`
  );

  const selectedCategoryNames = categories
    .filter((c) => selectedCategoryIds.includes(c.id))
    .map((c) => categoryTitle(c))
    .filter(Boolean);
  parts.push(
    `<div class="service-flow__review-block service-flow__review-panel"><h3 class="service-flow__review-h">${esc(
      t("common.service_flow.review.section.help_areas", "Areas where you need help")
    )}</h3><p>${esc(selectedCategoryNames.join(", ") || "—")}</p></div>`
  );
  parts.push(
    `<div class="service-flow__review-block service-flow__review-panel"><h3 class="service-flow__review-h">${esc(
      t("common.service_flow.review.section.services", "Requested services")
    )}</h3><p>${esc(selectedServiceNames.join(", ") || "—")}</p><p class="lhai-help">${esc(deliverySummary)}</p></div>`
  );
  const reviewCustomerId = (commonInfo.customer_username || getSession()?.username || "").trim() || "—";
  parts.push(
    `<div class="service-flow__review-block service-flow__review-panel"><h3 class="service-flow__review-h">${esc(
      t("common.service_flow.review.section.basic_info", "Basic information")
    )}</h3><dl class="service-flow__review-dl">
      <dt>${esc(t("common.service_flow.review_customer_id", "Username"))}</dt><dd>${esc(reviewCustomerId)}</dd>
      <dt>${esc(t("common.service_flow.review.field.name", "Name"))}</dt><dd>${esc(`${commonInfo.profile_first_name || ""} ${commonInfo.profile_last_name || ""}`.trim() || "—")}</dd>
      <dt>${esc(t("common.service_flow.profile_birth_date_label", "Date of birth"))}</dt><dd>${esc(commonInfo.profile_birth_date || "—")}</dd>
      <dt>${esc(t("common.service_flow.profile_email_label", "Email"))}</dt><dd>${esc(commonInfo.profile_email || "—")}</dd>
      <dt>${esc(t("common.service_flow.entry_date_label", "Planned entry (or start) date"))}</dt><dd>${esc(commonInfo.entry_date || "—")}</dd>
      <dt>${esc(t("common.service_flow.review.field.household", "People moving together"))}</dt><dd>${esc(togetherMoving)}</dd>
      <dt>${esc(t("common.service_flow.target_state_label", "Preferred state"))}</dt><dd>${esc(commonInfo.target_state || "—")}</dd>
      <dt>${esc(t("common.service_flow.target_city_label", "Preferred city"))}</dt><dd>${esc(commonInfo.target_city || "—")}</dd>
    </dl></div>`
  );
  if (conditionalQuestions.length) {
    const byId = new Map(conditionalQuestions.map((q) => [q.id, q]));
    parts.push(`<div class="service-flow__review-block service-flow__review-panel"><h3 class="service-flow__review-h">${esc(
      t("common.service_flow.review.section.extra_details", "Additional details")
    )}</h3><dl class="service-flow__review-dl">`);
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

  parts.push(`<div class="service-flow__review-block service-flow__review-panel"><h3 class="service-flow__review-h">${esc(
    t("common.service_flow.review.section.delivery", "How each service will be delivered")
  )}</h3>
    <p class="lhai-help service-flow__review-section-lead">${esc(
      t(
        "common.service_flow.review.section.delivery_lead",
        "A short summary of how each selected service will be delivered.",
      )
    )}</p>
    <ul class="service-flow__review-list">`);
  for (const sid of selectedServiceIds) {
    const svc = serviceItems.find((x) => x.id === sid);
    const cap = inferDeliveryCapability(svc || {});
    let modeKey = deliveryUiModeFromCapability(svc || {});
    let choiceLabel = "";
    if (cap === "BOTH") {
      const picked = selectedDeliveryModeByServiceId[sid] || "";
      choiceLabel = deliveryChoiceReviewLabel(picked);
      modeKey = picked === "IN_PERSON" ? "in_person" : "ai_guide";
    } else if (cap === "AI_AGENT") {
      choiceLabel = deliveryChoiceReviewLabel("AI_AGENT");
      modeKey = "ai_guide";
    } else if (cap === "IN_PERSON") {
      choiceLabel = deliveryChoiceReviewLabel("IN_PERSON");
      modeKey = "in_person";
    }
    const d = deliveryMeta(modeKey);
    parts.push(`<li class="service-flow__review-service-item">
      <span class="service-flow__badge service-flow__badge--${esc(d.mode)}">${esc(d.badge)}</span>
      <div class="service-flow__review-service-text">
        <strong>${esc(serviceTitle(svc) || sid)}</strong>
        <p class="lhai-help service-flow__review-delivery-label">${esc(
          t("common.service_flow.review_your_delivery_choice", "Your delivery choice")
        )}</p>
        <p class="lhai-help service-flow__review-service-explain">${esc(choiceLabel || d.explain)}</p>
      </div>
    </li>`);
  }
  parts.push(`</ul></div>`);

  parts.push(
    `<div class="service-flow__review-block service-flow__review-panel service-flow__review-panel--next"><h3 class="service-flow__review-h">${esc(
      t("common.service_flow.review_next_steps_title", "What happens next")
    )}</h3><p class="lhai-help service-flow__review-section-lead">${esc(
      t(
        "common.service_flow.review_next_steps_lead",
        "Here is what happens after you submit.",
      )
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
  if (phase === "common_info") {
    const info = readCommonInfoFromForm();
    const issues = validateCommonInfoIssues(info);
    if (issues.length) {
      const bullets = issues.map((issue) => `• ${commonInfoIssueLabel(issue)}`).join("\n");
      const statusLine = issues.map((x) => commonInfoIssueLabel(x)).join(" · ");
      setStatus(statusLine);
      if (issues.length === 1) {
        alertI18n(
          "common.dialog.validation_required_one",
          "Please complete the required field:\n\n{bullets}",
          { bullets },
        );
      } else {
        alertI18n(
          "common.dialog.validation_required_many",
          "Please complete the required fields:\n\n{bullets}",
          { bullets },
        );
      }
      focusFirstCommonInfoIssue(issues);
      return;
    }
    commonInfo = info;
    await mergeRegisteredIdentityFromMeIntoCommonInfo(commonInfo);
    phase = "category";
    showOnlyStep("category");
    updateProgress();
    return;
  }

  if (phase === "category") {
    if (!selectedCategoryIds.length) {
      setStatus(
        t(
          "common.service_flow.pick_category",
          "Select at least one area that applies. You may select more than one.",
        ),
      );
      return;
    }
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
      scrollPageToTop();
      return;
    }
    if (!selectedServiceIds.length) {
      setStatus(t("common.service_flow.pick_service", "Select at least one service."));
      return;
    }
    readDeliveryModeRadiosFromDom();
    const deliveryErr = validateDeliverySelections();
    if (deliveryErr) {
      setStatus(deliveryErr);
      return;
    }
    const missingConditional = validateInlineConditionalRequired();
    if (missingConditional) {
      setStatus(t("common.service_flow.required_missing", "Complete the following: {field}").replace("{field}", missingConditional));
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
    setStatus(t("common.service_flow.status_submitting", "Submitting your request…"));
    try {
      await mergeRegisteredIdentityFromMeIntoCommonInfo(commonInfo);
      const idErr = validateSelectedServiceIdsForSubmit();
      if (idErr) {
        setStatus(idErr);
        submittingReview = false;
        updateChrome();
        return;
      }
      const payload = buildServiceFlowSubmitPayload();
      await surveyCustomerApi.submitServiceFlow(payload);
      setStatus(
        t(
          "common.service_flow.submit_success",
          "Your request was received. Our team will review it and follow up. Check your inbox and registered email for confirmation.",
        ),
      );
      const lang = encodeURIComponent(getEffectiveLanguage());
      window.location.href = `survey-submitted.html?lang=${lang}`;
    } catch (e) {
      const msg = e && typeof e.message === "string" ? e.message : String(e);
      setStatus(
        localizedStatus(
          "common.service_flow.submit_failed",
          "Could not submit your request. Please try again shortly. ({message})",
          { message: msg },
        ),
      );
      submittingReview = false;
      updateChrome();
    }
  }
}

function goBack() {
  setStatus("");
  if (phase === "category") {
    phase = "common_info";
    showOnlyStep("common_info");
    void prefillProfileBasicInfo();
    updateProgress();
    return;
  }
  if (phase === "services") {
    syncCurrentCategorySelectionsFromDom();
    if (servicesCategoryIndex > 0) {
      servicesCategoryIndex -= 1;
      renderServiceCards();
      updateProgress();
      scrollPageToTop();
      return;
    }
    phase = "category";
    showOnlyStep("category");
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
  scrollPageToTop();
}

async function init() {
  qs("#sfBackBtn")?.addEventListener("click", goBack);
  qs("#sfNextBtn")?.addEventListener("click", () => void goNext());
  qs("#sfCommonInfoForm")?.addEventListener("submit", (e) => {
    e.preventDefault();
    void goNext();
  });
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
  await prefillProfileBasicInfo();
  showOnlyStep("common_info");
  updateProgress();

  document.addEventListener("lhai:language-changed", () => {
    void (async () => {
      updateProgress();
      updateChrome();
      updateCategorySelectedCount();
      try {
        // Re-fetch browse catalog so display_* fields match the new viewer locale.
        if (phase === "category" || phase === "services" || phase === "review") {
          const cats = await serviceCatalogBrowseApi.listCategories();
          categories = Array.isArray(cats) ? cats : [];
        }
        if ((phase === "services" || phase === "review") && selectedCategoryIds.length) {
          const keepSelected = selectedServiceIds.slice();
          selectedServiceIds = keepSelected;
          await loadServicesForSelectedCategory();
          // Restore selection after reload (loadServices clears per-category maps carefully).
          for (const [cid, rows] of serviceItemsByCategoryId.entries()) {
            const valid = new Set((rows || []).map((x) => x.id).filter(Boolean));
            selectedServiceIdsByCategoryId.set(
              cid,
              keepSelected.filter((id) => valid.has(id))
            );
          }
          rebuildSelectedServiceIds();
        }
        if (phase === "category") {
          await preloadCategoryDeliverySummary();
          renderCategories();
        } else if (phase === "services") renderServiceCards();
        else if (phase === "review") renderReview();
        else if (phase === "common_info") renderMinorAgeInputs();
      } catch {
        if (phase === "category") renderCategories();
        else if (phase === "services") renderServiceCards();
        else if (phase === "review") renderReview();
        else if (phase === "common_info") renderMinorAgeInputs();
      }
    })();
  });
}

void init();
