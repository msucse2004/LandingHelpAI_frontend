/**
 * Service Workflow tab — form controls + payload for service create/update APIs.
 * Wired from admin-services; tab switching lives in admin-service-intake-tab.js.
 */
import { adminApi, serviceCatalogAdminApi } from "../core/api.js";
import { t } from "../core/i18n-client.js";
import { isCatalogRecServiceItemUuidString, isUuid } from "../lib/catalog-rec-service-item-id.js";
import { qs, qsa, safeText as esc } from "../core/utils.js";
import { normalizePartnerTypesFromApi, partnerTypeOptionDisplayText } from "./admin-partner-type-options.js";
import { getSinglePartnerMatchingRuleOptions } from "./workflow-matching-rule-registry.js";
import { getSinglePartnerIntakeBuilderFallbackOptions } from "./workflow-intake-builder-registry.js";

const MSW_WORKFLOW_TYPES = [
  "AI_ONLY_GUIDE",
  "HUMAN_AGENT_MANAGED",
  "SINGLE_PARTNER_APPLICATION",
  "MULTI_PARTNER_QUOTE_AND_SELECT",
];

/** Product default when service has no workflow yet (human-managed; admin opts in to AI-only). */
const MSW_DEFAULT_WORKFLOW_TYPE = "HUMAN_AGENT_MANAGED";

/** 고정 파트너: 이메일(비회원) vs 카탈로그 내 계정 연결 파트너. */
const MSW_FIXED_TARGET_EMAIL = "email";
const MSW_FIXED_TARGET_REGISTERED = "registered_catalog";

/** Last selected type (for radio change → stash previous slice). */
let mswTrackedType = MSW_DEFAULT_WORKFLOW_TYPE;

/** Resolved options from GET /api/admin/partners/types (DB-backed only; no client-side catalog fallback). */
let mswPartnerTypeOptionsResolved = [];
let mswSingleLegacyResponseNotesText = "";
let mswSingleLegacyDefaultPartnerRaw = "";
let mswSingleLegacyRequestTypeRaw = "";
let mswSingleLegacyResponseWasUnstructured = false;

const MSW_SINGLE_POST_WORKFLOW_DEFAULT = {
  step1_after_customer_submission: "SEND_IMMEDIATELY",
  step2_after_partner_response: "NONE",
  step3_customer_follow_up: "NONE",
};

const MSW_SINGLE_POST_WORKFLOW_OPTIONS = {
  step1_after_customer_submission: [
    { value: "SEND_IMMEDIATELY", label: "즉시 파트너에게 전송" },
    { value: "ADMIN_REVIEW_BEFORE_SEND", label: "관리자 검토 후 전송" },
  ],
  step2_after_partner_response: [
    { value: "NONE", label: "추가 조치 없음" },
    { value: "ADMIN_REVIEW", label: "운영팀 검토 후 처리" },
    { value: "AUTO_SHARE_TO_CUSTOMER", label: "고객에게 바로 공유" },
    { value: "CREATE_INTERNAL_TASK", label: "운영팀 후속 작업 생성" },
    { value: "REQUEST_CUSTOMER_SELECTION", label: "고객에게 다음 선택 요청" },
  ],
  step3_customer_follow_up: [
    { value: "NONE", label: "추가 조치 없음" },
    { value: "REQUEST_ADDITIONAL_INFO", label: "고객에게 추가 정보 요청" },
    { value: "REQUEST_CUSTOMER_SELECTION", label: "고객에게 선택 요청" },
    { value: "HANDOFF_TO_ADMIN", label: "운영팀 확인 단계로 전환" },
  ],
};

function mswSinglePostWorkflowLabel(stepKey, value) {
  const opts = MSW_SINGLE_POST_WORKFLOW_OPTIONS[stepKey] || [];
  const raw = String(value || "").trim();
  const hit = opts.find((o) => o.value === raw);
  return hit ? hit.label : raw;
}

function mswSinglePostWorkflowIsAllowed(stepKey, value) {
  const raw = String(value || "").trim();
  if (!raw) return false;
  const opts = MSW_SINGLE_POST_WORKFLOW_OPTIONS[stepKey] || [];
  return opts.some((o) => o.value === raw);
}

function mswSinglePostNormalizeStepValue(stepKey, rawValue) {
  const raw = String(rawValue || "").trim();
  const opts = MSW_SINGLE_POST_WORKFLOW_OPTIONS[stepKey] || [];
  if (opts.some((o) => o.value === raw)) return raw;
  return MSW_SINGLE_POST_WORKFLOW_DEFAULT[stepKey] || "";
}

function mswSetSingleResponseLegacyWarning(msg) {
  const el = qs("#mswSingleResponseLegacyWarn");
  if (!(el instanceof HTMLElement)) return;
  const text = String(msg || "").trim();
  el.hidden = !text;
  el.textContent = text;
}

function mswSetSingleCompatibilityWarnings(lines) {
  const el = qs("#mswSingleCompatibilityWarn");
  if (!(el instanceof HTMLElement)) return;
  const list = Array.isArray(lines)
    ? lines.map((x) => String(x || "").trim()).filter(Boolean)
    : [];
  if (!list.length) {
    el.hidden = true;
    el.innerHTML = "";
    return;
  }
  el.hidden = false;
  el.innerHTML = list.map((x) => `- ${esc(x)}`).join("<br />");
}

function mswParseSinglePostWorkflowFromNotes(rawNotes) {
  const raw = String(rawNotes || "").trim();
  const defaults = { ...MSW_SINGLE_POST_WORKFLOW_DEFAULT };
  if (!raw) {
    return { steps: defaults, legacyPlainText: "", legacyDetected: false };
  }
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return { steps: defaults, legacyPlainText: raw, legacyDetected: true };
    }
    // v2 (current compatibility target): flat 3-key JSON
    const flatV2 = {
      submission_dispatch_mode: String(parsed.submission_dispatch_mode || "").trim(),
      partner_response_mode: String(parsed.partner_response_mode || "").trim(),
      customer_followup_mode: String(parsed.customer_followup_mode || "").trim(),
    };
    if (flatV2.submission_dispatch_mode || flatV2.partner_response_mode || flatV2.customer_followup_mode) {
      return {
        steps: {
          step1_after_customer_submission: mswSinglePostNormalizeStepValue(
            "step1_after_customer_submission",
            flatV2.submission_dispatch_mode
          ),
          step2_after_partner_response: mswSinglePostNormalizeStepValue(
            "step2_after_partner_response",
            flatV2.partner_response_mode
          ),
          step3_customer_follow_up: mswSinglePostNormalizeStepValue(
            "step3_customer_follow_up",
            flatV2.customer_followup_mode
          ),
        },
        legacyPlainText: String(parsed.legacy_plain_text || "").trim(),
        legacyDetected: false,
      };
    }
    // v1 (older in-chat format): nested block
    const p = parsed.post_submission_workflow;
    if (!p || typeof p !== "object" || Array.isArray(p)) {
      return { steps: defaults, legacyPlainText: raw, legacyDetected: true };
    }
    return {
      steps: {
        step1_after_customer_submission: mswSinglePostNormalizeStepValue(
          "step1_after_customer_submission",
          p.step1_after_customer_submission
        ),
        step2_after_partner_response: mswSinglePostNormalizeStepValue(
          "step2_after_partner_response",
          p.step2_after_partner_response
        ),
        step3_customer_follow_up: mswSinglePostNormalizeStepValue("step3_customer_follow_up", p.step3_customer_follow_up),
      },
      legacyPlainText: String(parsed.legacy_plain_text || "").trim(),
      legacyDetected: false,
    };
  } catch {
    return { steps: defaults, legacyPlainText: raw, legacyDetected: true };
  }
}

function mswSinglePostWorkflowFromDom() {
  const rawStep1 = String(mswVal("mswSinglePostStep1", "") || "").trim();
  const rawStep2 = String(mswVal("mswSinglePostStep2", "") || "").trim();
  const rawStep3 = String(mswVal("mswSinglePostStep3", "") || "").trim();
  return {
    step1_after_customer_submission: mswSinglePostNormalizeStepValue(
      "step1_after_customer_submission",
      rawStep1
    ),
    step2_after_partner_response: mswSinglePostNormalizeStepValue("step2_after_partner_response", rawStep2),
    step3_customer_follow_up: mswSinglePostNormalizeStepValue("step3_customer_follow_up", rawStep3),
  };
}

function mswSerializeSinglePostWorkflow(steps, legacyPlainText = "") {
  // Compatibility layer:
  // - backend currently reads `response_handling_notes` string
  // - we store predictable JSON with stable top-level keys
  // - legacy plain text is preserved separately in `single_partner.legacy_response_handling_notes`
  void legacyPlainText;
  return JSON.stringify({
    submission_dispatch_mode: mswSinglePostNormalizeStepValue(
      "step1_after_customer_submission",
      steps.step1_after_customer_submission
    ),
    partner_response_mode: mswSinglePostNormalizeStepValue(
      "step2_after_partner_response",
      steps.step2_after_partner_response
    ),
    customer_followup_mode: mswSinglePostNormalizeStepValue("step3_customer_follow_up", steps.step3_customer_follow_up),
  });
}

function mswPopulateSinglePostWorkflowOptions() {
  const map = [
    ["mswSinglePostStep1", "step1_after_customer_submission"],
    ["mswSinglePostStep2", "step2_after_partner_response"],
    ["mswSinglePostStep3", "step3_customer_follow_up"],
  ];
  for (const [id, key] of map) {
    const el = qs(`#${id}`);
    if (!(el instanceof HTMLSelectElement)) continue;
    const prev = String(el.value || "").trim();
    el.innerHTML = "";
    const ph = document.createElement("option");
    ph.value = "";
    ph.textContent = "선택…";
    el.appendChild(ph);
    for (const o of MSW_SINGLE_POST_WORKFLOW_OPTIONS[key] || []) {
      const op = document.createElement("option");
      op.value = o.value;
      op.textContent = o.label;
      el.appendChild(op);
    }
    const safePrev = mswSinglePostNormalizeStepValue(key, prev);
    el.value = safePrev || "";
  }
}

function mswSingleMatchingRuleOptionsSync() {
  const fromProvider = Array.from(mswMatchingRuleOptionsProvider() || [])
    .map((x) => ({
      value: String(x?.value || "").trim(),
      label: String(x?.label || x?.value || "").trim(),
      description: String(x?.description || "").trim(),
    }))
    .filter((x) => x.value && x.label);
  if (fromProvider.length) return fromProvider;
  return getSinglePartnerMatchingRuleOptions()
    .map((x) => ({
      value: String(x?.value || "").trim(),
      label: String(x?.label || x?.value || "").trim(),
      description: String(x?.description || "").trim(),
    }))
    .filter((x) => x.value && x.label);
}

function mswIsKnownSingleMatchingRule(value) {
  const raw = String(value || "").trim();
  if (!raw) return false;
  return mswSingleMatchingRuleOptionsSync().some((o) => String(o.value || "").trim() === raw);
}

function mswSingleMatchingRuleLabel(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const hit = mswSingleMatchingRuleOptionsSync().find((o) => String(o.value || "").trim() === raw);
  return hit ? String(hit.label || raw) : raw;
}

function mswPopulateSingleMatchingRuleOptions() {
  const el = qs("#mswSingleMatchingRule");
  if (!(el instanceof HTMLSelectElement)) return;
  const prev = String(el.value || "").trim();
  const opts = mswSingleMatchingRuleOptionsSync();
  el.innerHTML = "";
  const ph = document.createElement("option");
  ph.value = "";
  ph.dataset.mswPlaceholder = "1";
  ph.textContent = t("common.admin_services.workflow.matching_rule.placeholder", "선택…");
  el.appendChild(ph);
  for (const o of opts) {
    const value = String(o.value || "").trim();
    if (!value) continue;
    const op = document.createElement("option");
    op.value = value;
    op.dataset.mswStandard = "1";
    if (o.description) op.dataset.description = String(o.description);
    if (o.description) op.title = String(o.description);
    op.textContent = String(o.label || value);
    el.appendChild(op);
  }
  if (prev && [...el.options].some((x) => x.value === prev)) {
    el.value = prev;
  } else {
    el.value = "";
  }
}

function mswAssignSingleMatchingRuleValue(storedRaw) {
  const el = qs("#mswSingleMatchingRule");
  if (!(el instanceof HTMLSelectElement)) return;
  const raw = String(storedRaw || "").trim();
  qsa("#mswSingleMatchingRule option[data-msw-legacy='1']").forEach((n) => n.remove());
  if (!raw) {
    el.value = "";
    return;
  }
  if ([...el.options].some((x) => x.value === raw)) {
    el.value = raw;
    return;
  }
  const leg = document.createElement("option");
  leg.value = raw;
  leg.dataset.mswLegacy = "1";
  leg.textContent = `Unknown / legacy value: ${raw}`;
  el.appendChild(leg);
  el.value = raw;
}

function mswAssignSelectValueWithLegacy(selectId, storedRaw) {
  const el = qs(`#${selectId}`);
  if (!(el instanceof HTMLSelectElement)) return;
  const raw = String(storedRaw || "").trim();
  qsa(`#${selectId} option[data-msw-legacy='1']`).forEach((n) => n.remove());
  if (!raw) {
    el.value = "";
    return;
  }
  if ([...el.options].some((x) => x.value === raw)) {
    el.value = raw;
    return;
  }
  const leg = document.createElement("option");
  leg.value = raw;
  leg.dataset.mswLegacy = "1";
  leg.textContent = `Unknown / legacy value: ${raw}`;
  el.appendChild(leg);
  el.value = raw;
}

function mswPartnerTypeOptionsSync() {
  return Array.isArray(mswPartnerTypeOptionsResolved) ? mswPartnerTypeOptionsResolved : [];
}

function mswPartnerTypeAllowedSet() {
  return new Set(mswPartnerTypeOptionsSync().map((o) => String(o.value || "").trim().toUpperCase()).filter(Boolean));
}

function mswPartnerTypeLabel(value) {
  const v = String(value || "").trim().toUpperCase();
  const hit = mswPartnerTypeOptionsSync().find((o) => String(o.value || "").trim().toUpperCase() === v);
  return hit ? String(hit.label || v) : v;
}

/** (Re)build standard options on partner-type selects; keeps placeholder row. */
function mswPopulatePartnerTypeSelectOptions() {
  const opts = mswPartnerTypeOptionsSync();
  const phLabel = t("common.admin_services.workflow.partner_type.placeholder", "선택…");
  for (const sid of ["mswHumanPartnerType", "mswSinglePartnerType", "mswMultiPartnerType"]) {
    const el = qs(`#${sid}`);
    if (!(el instanceof HTMLSelectElement)) continue;
    const prev = String(el.value || "").trim().toUpperCase();
    const hadLegacy = Boolean(el.querySelector("option[data-msw-legacy='1']"));
    const legacyVal = hadLegacy ? prev : "";
    el.innerHTML = "";
    const ph = document.createElement("option");
    ph.value = "";
    ph.dataset.mswPlaceholder = "1";
    ph.textContent = phLabel;
    el.appendChild(ph);
    for (const o of opts) {
      const v = String(o.value || "").trim().toUpperCase();
      if (!v) continue;
      const op = document.createElement("option");
      op.value = v;
      op.dataset.mswStandard = "1";
      op.textContent = partnerTypeOptionDisplayText(o);
      el.appendChild(op);
    }
    if (legacyVal && !mswPartnerTypeAllowedSet().has(legacyVal)) {
      const leg = document.createElement("option");
      leg.value = legacyVal;
      leg.dataset.mswLegacy = "1";
      leg.textContent = `Unknown / legacy value: ${legacyVal}`;
      el.appendChild(leg);
      el.value = legacyVal;
    } else if (mswPartnerTypeAllowedSet().has(prev)) {
      el.value = prev;
    } else {
      el.value = "";
    }
  }
}

/** Apply stored ``partner_type`` to a select (valid value, empty, or legacy extra option). */
function mswAssignPartnerTypeSelectValue(selectId, storedRaw) {
  const el = qs(`#${selectId}`);
  if (!(el instanceof HTMLSelectElement)) return;
  const raw = String(storedRaw || "").trim().toUpperCase();
  qsa(`#${selectId} option[data-msw-legacy='1']`).forEach((n) => n.remove());
  const ph = el.querySelector("option[data-msw-placeholder]");
  if (ph) ph.textContent = t("common.admin_services.workflow.partner_type.placeholder", "선택…");
  if (!raw) {
    el.value = "";
    return;
  }
  const allowed = mswPartnerTypeAllowedSet();
  if (allowed.has(raw)) {
    el.value = raw;
    return;
  }
  const leg = document.createElement("option");
  leg.value = raw;
  leg.dataset.mswLegacy = "1";
  leg.textContent = `Unknown / legacy value: ${raw}`;
  el.appendChild(leg);
  el.value = raw;
}

async function mswRefreshPartnerTypesFromApi() {
  try {
    const data = await adminApi.listPartnerTypes();
    const cleaned = normalizePartnerTypesFromApi(data);
    mswPartnerTypeOptionsResolved = cleaned.length ? cleaned : [];
  } catch {
    mswPartnerTypeOptionsResolved = [];
  }
  mswPopulatePartnerTypeSelectOptions();
  const hp = mswPerTypeConfig.HUMAN_AGENT_MANAGED || {};
  const sp = mswPerTypeConfig.SINGLE_PARTNER_APPLICATION || {};
  const mp = mswPerTypeConfig.MULTI_PARTNER_QUOTE_AND_SELECT || {};
  mswAssignPartnerTypeSelectValue("mswHumanPartnerType", hp.partner_type);
  mswAssignPartnerTypeSelectValue("mswSinglePartnerType", sp.partner_type);
  mswAssignPartnerTypeSelectValue("mswMultiPartnerType", mp.partner_type);
}

/** Per-workflow-type config slices (object shapes match `workflow_config_json` roots). */
const mswPerTypeConfig = {
  AI_ONLY_GUIDE: {},
  HUMAN_AGENT_MANAGED: {},
  SINGLE_PARTNER_APPLICATION: {},
  MULTI_PARTNER_QUOTE_AND_SELECT: {},
};

/** Preserve `message_templates` and unknown keys from server across saves. */
let mswRetainedMessageTemplates = {};
/** ``email_interpretation`` (excluding threshold field filled from DOM on save). */
let mswRetainedEmailInterpretation = {};
let mswPassthroughExtras = {};
/** Intake 질문 ``field_key`` 목록 — Customer Intake Builder와 workflow 검증 연동. */
let mswIntakeFieldKeysProvider = () => new Set();
/** Service-aware Customer Intake Builder options provider for SINGLE partner workflow. */
let mswIntakeBuilderOptionsProvider = () => [];
/**
 * Service-aware matching rule options provider for SINGLE partner workflow.
 * Provider is optional; fallback registry is used when provider returns empty.
 */
let mswMatchingRuleOptionsProvider = () => [];

function mswNormalizeIntakeBuilderOptions(rawList) {
  return Array.from(rawList || [])
    .map((x) => {
      const value = String(x?.value || x?.id || "").trim();
      const label = String(x?.label || x?.display_name || x?.name || value).trim();
      const meta = String(x?.meta || x?.metadata || "").trim();
      return { value, label, meta };
    })
    .filter((x) => x.value && x.label);
}

function mswSingleIntakeBuilderOptionsSync() {
  const fromProvider = mswNormalizeIntakeBuilderOptions(mswIntakeBuilderOptionsProvider() || []);
  if (fromProvider.length) return fromProvider;
  return mswNormalizeIntakeBuilderOptions(getSinglePartnerIntakeBuilderFallbackOptions());
}

function mswIsKnownSingleIntakeBuilder(value) {
  const raw = String(value || "").trim();
  if (!raw) return false;
  return mswSingleIntakeBuilderOptionsSync().some((o) => String(o.value || "").trim() === raw);
}

function mswResolveSingleDefaultPartnerCompatibility(strategy, rawDefaultPartner) {
  const raw = String(rawDefaultPartner || "").trim();
  if (!raw) return { valueForUi: "", legacyRaw: "", warning: "" };
  if (strategy === "fixed") {
    if (mswLooksLikeEmail(raw)) return { valueForUi: raw, legacyRaw: "", warning: "" };
    return {
      valueForUi: raw,
      legacyRaw: raw,
      warning: `legacy default_partner 값 "${raw}"은(는) 이메일 형식이 아닙니다. 저장 전에 Partner email을 확인하세요.`,
    };
  }
  // matching_rule
  if (mswIsKnownSingleMatchingRule(raw)) return { valueForUi: raw, legacyRaw: "", warning: "" };
  return {
    valueForUi: raw,
    legacyRaw: raw,
    warning: `legacy default_partner 값 "${raw}"은(는) 현재 Matching rule 목록에 없습니다. 기존 값을 보존해 표시합니다.`,
  };
}

function mswResolveSingleRequestTypeCompatibility(rawRequestType) {
  const raw = String(rawRequestType || "").trim();
  if (!raw) return { valueForUi: "", legacyRaw: "", warning: "" };
  if (mswIsKnownSingleIntakeBuilder(raw)) return { valueForUi: raw, legacyRaw: "", warning: "" };
  return {
    valueForUi: raw,
    legacyRaw: raw,
    warning: `legacy request_type 값 "${raw}"은(는) 현재 Customer Intake Builder 목록에 없습니다. 기존 값을 보존해 표시합니다.`,
  };
}

function mswSingleIntakeBuilderLabel(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const hit = mswSingleIntakeBuilderOptionsSync().find((o) => String(o.value || "").trim() === raw);
  return hit ? String(hit.label || raw) : raw;
}

function mswPopulateSingleIntakeBuilderOptions() {
  const el = qs("#mswSingleRequestType");
  if (!(el instanceof HTMLSelectElement)) return;
  const prev = String(el.value || "").trim();
  const sp = mswPerTypeConfig.SINGLE_PARTNER_APPLICATION || {};
  const stashIdRaw =
    mswSelectedWorkflowType() === "SINGLE_PARTNER_APPLICATION"
      ? String(sp.intake_builder_id || "").trim() || String(sp.request_type || "").trim()
      : "";
  const restoreCandidate = prev || stashIdRaw;
  const opts = mswSingleIntakeBuilderOptionsSync();
  el.innerHTML = "";
  const ph = document.createElement("option");
  ph.value = "";
  ph.dataset.mswPlaceholder = "1";
  ph.textContent = t("common.admin_services.workflow.intake_builder.placeholder", "선택…");
  el.appendChild(ph);
  for (const o of opts) {
    const value = String(o.value || "").trim();
    if (!value) continue;
    const op = document.createElement("option");
    op.value = value;
    op.dataset.mswStandard = "1";
    op.textContent = o.meta ? `${o.label} (${o.meta})` : o.label;
    el.appendChild(op);
  }
  if (restoreCandidate && [...el.options].some((x) => x.value === restoreCandidate)) {
    el.value = restoreCandidate;
  } else if (restoreCandidate) {
    mswAssignSelectValueWithLegacy("mswSingleRequestType", restoreCandidate);
  } else {
    el.value = "";
  }
}

function mswDeepClone(obj) {
  if (obj === null || typeof obj !== "object") return obj;
  try {
    if (typeof structuredClone === "function") return structuredClone(obj);
  } catch {
    /* ignore */
  }
  try {
    return JSON.parse(JSON.stringify(obj));
  } catch {
    return { ...obj };
  }
}

function mswParseCfg(raw) {
  if (raw == null) return {};
  if (typeof raw === "string") {
    try {
      const p = JSON.parse(raw);
      return typeof p === "object" && p !== null && !Array.isArray(p) ? p : {};
    } catch {
      return {};
    }
  }
  if (typeof raw === "object" && !Array.isArray(raw)) return mswDeepClone(raw);
  return {};
}

function mswNormalizeWorkflowType(v) {
  const s = v == null ? "" : String(v).trim();
  if (!s) return null;
  return MSW_WORKFLOW_TYPES.includes(s) ? s : null;
}

function mswSliceRootKey(type) {
  return {
    AI_ONLY_GUIDE: "ai_guide",
    HUMAN_AGENT_MANAGED: "human_ops",
    SINGLE_PARTNER_APPLICATION: "single_partner",
    MULTI_PARTNER_QUOTE_AND_SELECT: "multi_partner",
  }[type];
}

function mswDefaultSlice(type) {
  switch (type) {
    case "AI_ONLY_GUIDE":
      return {
        system_instruction: "",
        intake_context_notes: "",
        use_intake_fields: [],
        auto_send: false,
        require_admin_review: false,
        allow_customer_follow_up: false,
        completion_mode: "open_ended",
      };
    case "HUMAN_AGENT_MANAGED":
      return {
        assignment_mode: "",
        notify_admin_on_new: false,
        customer_receipt_message: "",
        partner_type: "",
        partner_email: "",
      };
    case "SINGLE_PARTNER_APPLICATION":
      return {
        partner_type: "",
        strategy: "fixed",
        fixed_target_mode: MSW_FIXED_TARGET_REGISTERED,
        default_partner: "",
        matching_rule: "",
        partner_email: "",
        fixed_partner_ids: [],
        intake_builder_id: "",
        request_type: "",
        legacy_response_handling_notes: "",
        response_handling_notes: "",
      };
    case "MULTI_PARTNER_QUOTE_AND_SELECT":
      return {
        partner_type: "",
        request_type: "",
        matching_strategy: "",
        max_requests: 5,
        min_responses: 1,
        timeout_hours: 48,
        ranking_rule: "low_price_first",
        after_has_account: "add_thread",
        after_no_account: "email_summary",
      };
    default:
      return {};
  }
}

function mswMergeDefaults(type, partial) {
  return { ...mswDefaultSlice(type), ...(partial && typeof partial === "object" ? partial : {}) };
}

/** Pull server subsection for a workflow type (supports alternate root keys). */
function mswExtractServerSliceForType(type, cfg) {
  const root = mswSliceRootKey(type);
  if (!root) return {};
  let slice = cfg[root];
  if (slice && typeof slice === "object") return slice;
  if (type === "HUMAN_AGENT_MANAGED") {
    slice = cfg.human_agent_managed;
    if (slice && typeof slice === "object") return slice;
  }
  if (type === "SINGLE_PARTNER_APPLICATION") {
    slice = cfg.partner_application;
    if (slice && typeof slice === "object") return slice;
  }
  if (type === "MULTI_PARTNER_QUOTE_AND_SELECT") {
    slice = cfg.multi_partner_quote;
    if (slice && typeof slice === "object") return slice;
  }
  return {};
}

function mswSetRadio(name, value) {
  qsa(`input[name="${name}"]`).forEach((r) => {
    if (r instanceof HTMLInputElement) r.checked = r.value === value;
  });
}

function mswSelectedWorkflowType() {
  const el = qs('input[name="mswWorkflowType"]:checked');
  return el?.value || MSW_DEFAULT_WORKFLOW_TYPE;
}

function mswSingleStrategySelected() {
  return qs('input[name="mswSingleStrategy"]:checked')?.value === "matching_rule" ? "matching_rule" : "fixed";
}

function mswSingleStrategyRaw() {
  return String(qs('input[name="mswSingleStrategy"]:checked')?.value || "").trim();
}

function mswLooksLikeEmail(v) {
  const s = String(v || "").trim();
  if (!s) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
}

/**
 * 저장된 ``single_partner`` 슬라이스에서 고정 대상 모드를 추론한다.
 * @param {Record<string, unknown> | null | undefined} slice
 */
function mswInferFixedTargetModeFromSlice(slice) {
  if (!slice || typeof slice !== "object") return MSW_FIXED_TARGET_REGISTERED;
  const explicit = String(slice.fixed_target_mode || "").trim();
  if (explicit === MSW_FIXED_TARGET_REGISTERED || explicit === "registered_partner") {
    return MSW_FIXED_TARGET_REGISTERED;
  }
  if (explicit === MSW_FIXED_TARGET_EMAIL) return MSW_FIXED_TARGET_EMAIL;
  const fps = slice.fixed_partner_ids;
  if (Array.isArray(fps) && fps.some((x) => String(x || "").trim())) return MSW_FIXED_TARGET_REGISTERED;
  const dp = String(slice.default_partner || "").trim();
  const pe = String(slice.partner_email || "").trim();
  const cand = pe || dp;
  if (cand && mswLooksLikeEmail(cand)) return MSW_FIXED_TARGET_EMAIL;
  return MSW_FIXED_TARGET_REGISTERED;
}

function mswSingleFixedTargetModeSelected() {
  const el = qs('input[name="mswSingleFixedTargetMode"]:checked');
  const v = String(el?.value || "").trim();
  return v === MSW_FIXED_TARGET_REGISTERED ? MSW_FIXED_TARGET_REGISTERED : MSW_FIXED_TARGET_EMAIL;
}

let mswFixedPartnerCatalogLoadToken = 0;

/**
 * 파트너 유형에 맞는 카탈로그(계정 연결됨)를 채운다.
 * @param {string} partnerType
 * @param {string} [selectedCatalogPartnerId]
 */
async function mswRefreshFixedPartnerCatalogSelect(partnerType, selectedCatalogPartnerId) {
  const sel = qs("#mswSingleFixedPartnerCatalogSelect");
  if (!(sel instanceof HTMLSelectElement)) return;
  const token = ++mswFixedPartnerCatalogLoadToken;
  const pt = String(partnerType || "").trim();
  sel.innerHTML = "";
  const ph = document.createElement("option");
  ph.value = "";
  ph.textContent = pt ? "불러오는 중…" : "먼저 파트너 유형을 선택하세요.";
  sel.appendChild(ph);
  if (!pt) {
    mswSyncFixedTargetSubPanels();
    return;
  }
  try {
    const rows = await adminApi.listPartners({ partner_type: pt, active_only: true, limit: 500 });
    if (token !== mswFixedPartnerCatalogLoadToken) return;
    const list = Array.isArray(rows) ? rows : [];
    const withAccount = list.filter((p) => p && p.has_account === true);
    sel.innerHTML = "";
    const p0 = document.createElement("option");
    p0.value = "";
    p0.textContent = withAccount.length ? "파트너를 선택…" : "해당 유형에 계정이 연결된 파트너가 없습니다.";
    sel.appendChild(p0);
    for (const p of withAccount) {
      const id = String(p.id || "").trim();
      if (!id) continue;
      const op = document.createElement("option");
      op.value = id;
      const name = String(p.name || "").trim() || id;
      const un = String(p.username || "").trim();
      const em = String(p.email || "").trim();
      const extra = un ? ` (@${un})` : em ? ` (${em})` : "";
      op.textContent = `${name}${extra}`;
      sel.appendChild(op);
    }
    const want = String(selectedCatalogPartnerId || "").trim();
    if (want && [...sel.options].some((o) => o.value === want)) {
      sel.value = want;
    }
  } catch {
    if (token !== mswFixedPartnerCatalogLoadToken) return;
    sel.innerHTML = "";
    const e0 = document.createElement("option");
    e0.value = "";
    e0.textContent = "목록을 불러오지 못했습니다. 네트워크를 확인한 뒤 다시 시도하세요.";
    sel.appendChild(e0);
  }
  mswSyncFixedTargetSubPanels();
  // 목록 채우기·value 복원은 프로그램적으로만 이뤄져 change 이벤트가 없다.
  // workflowHydrateFromService 직후에는 스태시가 빈 파트너로 고정될 수 있으므로 DOM과 검증을 다시 맞춘다.
  if (mswSelectedWorkflowType() === "SINGLE_PARTNER_APPLICATION") {
    mswRefreshPreview();
  }
}

function mswSyncFixedTargetSubPanels() {
  const emailPanel = qs("#mswSingleFixedPartnerEmailPanel");
  const catPanel = qs("#mswSingleFixedPartnerCatalogPanel");
  if (!emailPanel || !catPanel) return;
  const strat = mswSingleStrategySelected();
  if (strat !== "fixed") {
    emailPanel.hidden = false;
    catPanel.hidden = true;
    return;
  }
  const mode = mswSingleFixedTargetModeSelected();
  const partnerTypeChosen = String(mswVal("mswSinglePartnerType", "") || "").trim() !== "";
  emailPanel.hidden = mode !== MSW_FIXED_TARGET_EMAIL;
  // 등록 파트너(계정 연결) 선택 UI는 파트너 유형을 고른 뒤에만 표시
  catPanel.hidden = mode !== MSW_FIXED_TARGET_REGISTERED || !partnerTypeChosen;
}

function mswSingleTargetUiState(strategyRaw) {
  const strategy = String(strategyRaw || "").trim() === "matching_rule" ? "matching_rule" : "fixed";
  const isFixed = strategy === "fixed";
  return {
    strategy,
    isFixed,
    showPartnerEmail: isFixed,
    showMatchingRule: !isFixed,
  };
}

function mswVal(id, fallback = "") {
  const el = qs(`#${id}`);
  if (!el) return fallback;
  if (el instanceof HTMLInputElement && el.type === "checkbox") return el.checked;
  return String(el.value ?? "").trim();
}

function mswPartnerTypeSelectsNeedStructure() {
  const el = qs("#mswSinglePartnerType");
  const humanEl = qs("#mswHumanPartnerType");
  return (
    !(el instanceof HTMLSelectElement) ||
    el.querySelectorAll("option[data-msw-standard='1']").length === 0 ||
    (humanEl instanceof HTMLSelectElement && humanEl.querySelectorAll("option[data-msw-standard='1']").length === 0)
  );
}

function mswSyncSinglePartnerTargetUi() {
  const ui = mswSingleTargetUiState(mswSingleStrategySelected());
  const fixedWrap = qs("#mswSingleFixedPartnerWrap");
  const ruleWrap = qs("#mswSingleMatchingRuleWrap");
  const emailInput = qs("#mswSingleDefaultPartner");
  const ruleSelect = qs("#mswSingleMatchingRule");
  const catSel = qs("#mswSingleFixedPartnerCatalogSelect");
  const partnerTypeChosen = String(mswVal("mswSinglePartnerType", "") || "").trim() !== "";
  if (fixedWrap) fixedWrap.hidden = !ui.showPartnerEmail;
  if (ruleWrap) ruleWrap.hidden = !ui.showMatchingRule;
  if (emailInput instanceof HTMLInputElement) {
    emailInput.disabled = !ui.showPartnerEmail || mswSingleFixedTargetModeSelected() !== MSW_FIXED_TARGET_EMAIL;
  }
  if (catSel instanceof HTMLSelectElement) {
    catSel.disabled =
      !ui.showPartnerEmail ||
      mswSingleFixedTargetModeSelected() !== MSW_FIXED_TARGET_REGISTERED ||
      !partnerTypeChosen;
  }
  qsa('input[name="mswSingleFixedTargetMode"]').forEach((n) => {
    if (n instanceof HTMLInputElement) n.disabled = !ui.showPartnerEmail;
  });
  mswSyncFixedTargetSubPanels();
  if (ruleSelect instanceof HTMLSelectElement) ruleSelect.disabled = !ui.showMatchingRule;
}

function mswExtractSliceFromDom(type) {
  switch (type) {
    case "AI_ONLY_GUIDE": {
      const notes = mswVal("mswAiIntakeRef", "");
      const completionRaw = mswVal("mswAiCompletionMode", "");
      return {
        system_instruction: mswVal("mswAiRole", ""),
        intake_context_notes: notes,
        use_intake_fields: [],
        auto_send: Boolean(mswVal("mswAiAutoSend", false)),
        require_admin_review: Boolean(mswVal("mswAiAdminReview", false)),
        allow_customer_follow_up: Boolean(mswVal("mswAiCustomerQuestions", false)),
        completion_mode: completionRaw || "open_ended",
      };
    }
    case "HUMAN_AGENT_MANAGED":
      return {
        assignment_mode: mswVal("mswHumanAssignment", ""),
        notify_admin_on_new: Boolean(mswVal("mswHumanAdminNotify", false)),
        customer_receipt_message: String(qs("#mswHumanCustomerMessage")?.value ?? "").trim(),
        partner_type: mswVal("mswHumanPartnerType", ""),
        partner_email: String(mswVal("mswHumanPartnerNotifyEmail", "") || "").trim(),
      };
    case "SINGLE_PARTNER_APPLICATION":
      {
        const strategyRaw = mswSingleStrategyRaw();
        const strategy = strategyRaw === "matching_rule" ? "matching_rule" : strategyRaw === "fixed" ? "fixed" : "";
        const fixedMode = strategy === "fixed" ? mswSingleFixedTargetModeSelected() : MSW_FIXED_TARGET_EMAIL;
        const emailForFixed = mswVal("mswSingleDefaultPartner", "");
        const catalogId = String(mswVal("mswSingleFixedPartnerCatalogSelect", "") || "").trim();
        const ruleVal = mswVal("mswSingleMatchingRule", "");
        const rawStep1 = String(mswVal("mswSinglePostStep1", "") || "").trim();
        const rawStep2 = String(mswVal("mswSinglePostStep2", "") || "").trim();
        const rawStep3 = String(mswVal("mswSinglePostStep3", "") || "").trim();
        return {
          partner_type: mswVal("mswSinglePartnerType", ""),
          strategy,
          fixed_target_mode: strategy === "fixed" ? fixedMode : MSW_FIXED_TARGET_EMAIL,
          default_partner:
            strategy === "matching_rule"
              ? ruleVal
              : fixedMode === MSW_FIXED_TARGET_REGISTERED
                ? catalogId
                : emailForFixed,
          matching_rule: strategy === "matching_rule" ? ruleVal : "",
          partner_email: strategy === "fixed" && fixedMode === MSW_FIXED_TARGET_EMAIL ? emailForFixed : "",
          fixed_partner_ids: strategy === "fixed" && fixedMode === MSW_FIXED_TARGET_REGISTERED && catalogId ? [catalogId] : [],
          // Future-friendly: keep dedicated intake_builder_id while mirroring into request_type.
          intake_builder_id: mswVal("mswSingleRequestType", ""),
          request_type: mswVal("mswSingleRequestType", ""),
          post_submission_workflow: {
            step1_after_customer_submission: rawStep1,
            step2_after_partner_response: rawStep2,
            step3_customer_follow_up: rawStep3,
          },
          legacy_default_partner: mswSingleLegacyDefaultPartnerRaw || "",
          legacy_request_type: mswSingleLegacyRequestTypeRaw || "",
          legacy_response_handling_notes: mswSingleLegacyResponseNotesText || "",
          response_handling_notes: mswSerializeSinglePostWorkflow(mswSinglePostWorkflowFromDom(), mswSingleLegacyResponseNotesText),
        };
      }
    case "MULTI_PARTNER_QUOTE_AND_SELECT": {
      const maxR = Number(mswVal("mswMultiMaxRequests", "5"));
      const minR = Number(mswVal("mswMultiMinResponses", "1"));
      const hrs = Number(mswVal("mswMultiTimeoutHours", "48"));
      return {
        partner_type: mswVal("mswMultiPartnerType", ""),
        request_type: mswVal("mswMultiRequestType", ""),
        matching_strategy: mswVal("mswMultiMatchingStrategy", ""),
        max_requests: Number.isFinite(maxR) ? Math.max(1, Math.min(99, maxR)) : 5,
        min_responses: Number.isFinite(minR) ? Math.max(0, Math.min(99, minR)) : 1,
        timeout_hours: Number.isFinite(hrs) ? Math.max(1, Math.min(720, hrs)) : 48,
        ranking_rule: mswVal("mswMultiRankingRule", "low_price_first") || "low_price_first",
        after_has_account: mswVal("mswMultiAfterHasAccount", "add_thread") || "add_thread",
        after_no_account: mswVal("mswMultiAfterNoAccount", "email_summary") || "email_summary",
      };
    }
    default:
      return {};
  }
}

function mswApplySliceToDom(type, sliceIn) {
  const slice = mswMergeDefaults(type, sliceIn);
  if (type === "AI_ONLY_GUIDE") {
    const elRole = qs("#mswAiRole");
    if (elRole) elRole.value = slice.system_instruction || "";
    const elNotes = qs("#mswAiIntakeRef");
    if (elNotes) {
      let notes = slice.intake_context_notes || "";
      if (!notes && Array.isArray(slice.use_intake_fields) && slice.use_intake_fields.length) {
        notes = slice.use_intake_fields.map(String).join("\n");
      }
      elNotes.value = notes;
    }
    const cAuto = qs("#mswAiAutoSend");
    if (cAuto instanceof HTMLInputElement) cAuto.checked = Boolean(slice.auto_send);
    const cRev = qs("#mswAiAdminReview");
    if (cRev instanceof HTMLInputElement) cRev.checked = Boolean(slice.require_admin_review);
    const cFq = qs("#mswAiCustomerQuestions");
    if (cFq instanceof HTMLInputElement) cFq.checked = Boolean(slice.allow_customer_follow_up);
    const cm = qs("#mswAiCompletionMode");
    if (cm instanceof HTMLSelectElement) {
      const v = slice.completion_mode || "";
      const allowed = ["", "checklist_done", "admin_confirms", "open_ended"];
      cm.value = allowed.includes(v) ? v : "open_ended";
    }
    return;
  }
  if (type === "HUMAN_AGENT_MANAGED") {
    const sel = qs("#mswHumanAssignment");
    if (sel instanceof HTMLSelectElement) {
      const v = slice.assignment_mode || "";
      const allowed = ["", "manual", "round_robin", "pull_queue"];
      sel.value = allowed.includes(v) ? v : "";
    }
    const n = qs("#mswHumanAdminNotify");
    if (n instanceof HTMLInputElement) n.checked = Boolean(slice.notify_admin_on_new);
    if (mswPartnerTypeSelectsNeedStructure()) mswPopulatePartnerTypeSelectOptions();
    mswAssignPartnerTypeSelectValue("mswHumanPartnerType", slice.partner_type || "");
    const pe = qs("#mswHumanPartnerNotifyEmail");
    if (pe instanceof HTMLInputElement) pe.value = String(slice.partner_email || "").trim();
    const msg = qs("#mswHumanCustomerMessage");
    if (msg) msg.value = slice.customer_receipt_message || "";
    return;
  }
  if (type === "SINGLE_PARTNER_APPLICATION") {
    if (mswPartnerTypeSelectsNeedStructure()) mswPopulatePartnerTypeSelectOptions();
    mswPopulateSingleMatchingRuleOptions();
    mswPopulateSingleIntakeBuilderOptions();
    mswPopulateSinglePostWorkflowOptions();
    mswAssignPartnerTypeSelectValue("mswSinglePartnerType", slice.partner_type || "");
    const strategy = slice.strategy === "matching_rule" ? "matching_rule" : "fixed";
    mswSetRadio("mswSingleStrategy", strategy);
    const fixedMode = mswInferFixedTargetModeFromSlice(slice);
    mswSetRadio(
      "mswSingleFixedTargetMode",
      fixedMode === MSW_FIXED_TARGET_REGISTERED ? MSW_FIXED_TARGET_REGISTERED : MSW_FIXED_TARGET_EMAIL
    );
    const compatibilityWarnings = [];
    const defaultCompat = mswResolveSingleDefaultPartnerCompatibility(strategy, slice.default_partner || "");
    mswSingleLegacyDefaultPartnerRaw = String(slice.legacy_default_partner || "").trim() || defaultCompat.legacyRaw || "";
    if (defaultCompat.warning && !(strategy === "fixed" && fixedMode === MSW_FIXED_TARGET_REGISTERED)) {
      compatibilityWarnings.push(defaultCompat.warning);
    }
    const dp = qs("#mswSingleDefaultPartner");
    if (dp) {
      if (strategy === "fixed" && fixedMode === MSW_FIXED_TARGET_REGISTERED) {
        dp.value = "";
      } else {
        dp.value = strategy === "fixed" ? defaultCompat.valueForUi || slice.partner_email || "" : slice.partner_email || "";
      }
    }
    const ruleCompat =
      slice.matching_rule || (strategy === "matching_rule" ? defaultCompat.valueForUi : "");
    mswAssignSingleMatchingRuleValue(ruleCompat);
    const requestRawCompat = String(slice.intake_builder_id || "").trim() || String(slice.request_type || "").trim();
    const requestCompat = mswResolveSingleRequestTypeCompatibility(requestRawCompat);
    mswSingleLegacyRequestTypeRaw = String(slice.legacy_request_type || "").trim() || requestCompat.legacyRaw || "";
    if (requestCompat.warning) compatibilityWarnings.push(requestCompat.warning);
    mswAssignSelectValueWithLegacy("mswSingleRequestType", requestCompat.valueForUi);
    const parsedHandling = mswParseSinglePostWorkflowFromNotes(slice.response_handling_notes || "");
    mswSingleLegacyResponseWasUnstructured = Boolean(parsedHandling.legacyDetected);
    mswSingleLegacyResponseNotesText =
      parsedHandling.legacyPlainText ||
      String(slice.legacy_response_handling_notes || "").trim();
    const s1 = qs("#mswSinglePostStep1");
    if (s1 instanceof HTMLSelectElement) s1.value = parsedHandling.steps.step1_after_customer_submission;
    const s2 = qs("#mswSinglePostStep2");
    if (s2 instanceof HTMLSelectElement) s2.value = parsedHandling.steps.step2_after_partner_response;
    const s3 = qs("#mswSinglePostStep3");
    if (s3 instanceof HTMLSelectElement) s3.value = parsedHandling.steps.step3_customer_follow_up;
    if (parsedHandling.legacyDetected) {
      mswSetSingleResponseLegacyWarning(
        "기존 운영 메모(평문)를 감지했습니다. 저장 시 구조화 JSON으로 전환되며 원문은 legacy_response_handling_notes에 보존됩니다."
      );
    } else if (parsedHandling.legacyPlainText) {
      mswSetSingleResponseLegacyWarning("이 설정에는 legacy 운영 메모가 함께 보존되어 있습니다.");
    } else {
      mswSetSingleResponseLegacyWarning("");
    }
    mswSetSingleCompatibilityWarnings(compatibilityWarnings);
    mswSyncSinglePartnerTargetUi();
    if (strategy === "fixed" && fixedMode === MSW_FIXED_TARGET_REGISTERED) {
      const sidRaw = Array.isArray(slice.fixed_partner_ids) ? slice.fixed_partner_ids[0] : null;
      const savedId = String(sidRaw || slice.default_partner || "").trim();
      void mswRefreshFixedPartnerCatalogSelect(String(slice.partner_type || "").trim(), savedId);
    } else {
      const sel = qs("#mswSingleFixedPartnerCatalogSelect");
      if (sel instanceof HTMLSelectElement) {
        sel.innerHTML = "";
        const o = document.createElement("option");
        o.value = "";
        o.textContent = "「등록 파트너 계정 선택」을 선택하면 목록이 채워집니다.";
        sel.appendChild(o);
      }
    }
    return;
  }
  if (type === "MULTI_PARTNER_QUOTE_AND_SELECT") {
    if (mswPartnerTypeSelectsNeedStructure()) mswPopulatePartnerTypeSelectOptions();
    mswAssignPartnerTypeSelectValue("mswMultiPartnerType", slice.partner_type || "");
    const rt = qs("#mswMultiRequestType");
    if (rt) rt.value = slice.request_type || "";
    const ms = qs("#mswMultiMatchingStrategy");
    if (ms) ms.value = slice.matching_strategy || "";
    const mx = qs("#mswMultiMaxRequests");
    if (mx) mx.value = String(slice.max_requests ?? 5);
    const mn = qs("#mswMultiMinResponses");
    if (mn) mn.value = String(slice.min_responses ?? 1);
    const th = qs("#mswMultiTimeoutHours");
    if (th) th.value = String(slice.timeout_hours ?? 48);
    const rk = qs("#mswMultiRankingRule");
    if (rk instanceof HTMLSelectElement) {
      const v = slice.ranking_rule || "low_price_first";
      const allowed = ["low_price_first", "high_rating_first", "fast_response_first", "manual"];
      rk.value = allowed.includes(v) ? v : "low_price_first";
    }
    const ah = qs("#mswMultiAfterHasAccount");
    if (ah instanceof HTMLSelectElement) ah.value = slice.after_has_account || "add_thread";
    const an = qs("#mswMultiAfterNoAccount");
    if (an instanceof HTMLSelectElement) an.value = slice.after_no_account || "email_summary";
  }
}

function mswFlushCurrentSliceToStash() {
  const cur = mswSelectedWorkflowType();
  mswPerTypeConfig[cur] = mswExtractSliceFromDom(cur);
  mswTrackedType = cur;
}

function mswToggleSections() {
  const type = mswSelectedWorkflowType();
  const map = {
    AI_ONLY_GUIDE: "mswSectionAi",
    HUMAN_AGENT_MANAGED: "mswSectionHuman",
    SINGLE_PARTNER_APPLICATION: "mswSectionSingle",
    MULTI_PARTNER_QUOTE_AND_SELECT: "mswSectionMulti",
  };
  for (const id of ["mswSectionAi", "mswSectionHuman", "mswSectionSingle", "mswSectionMulti"]) {
    const sec = qs(`#${id}`);
    if (sec) sec.hidden = map[type] !== id;
  }
  mswSyncSinglePartnerTargetUi();
}

/** @param {unknown} strategyRaw */
function mswMultiStrategyUsesCustomerState(strategyRaw) {
  const s = String(strategyRaw || "").trim().toLowerCase();
  if (!s) return false;
  if (s.includes("customer_state")) return true;
  if (s.includes("same_state") || s.includes("same state") || s.includes("same-state")) return true;
  if (s.includes("state") && (s.includes("match") || s.includes("geo") || s.includes("지역"))) return true;
  return false;
}

/**
 * @param {Set<string> | Iterable<string>} intakeFieldKeys
 * @returns {{ errors: string[], warnings: string[] }}
 */
function workflowComputeValidation(intakeFieldKeys) {
  const errors = [];
  const warnings = [];
  const type = mswSelectedWorkflowType();
  const iter = intakeFieldKeys instanceof Set ? intakeFieldKeys : new Set(Array.from(intakeFieldKeys || []));
  const hasIntakeKey = (k) => iter.has(k);

  if (type === "MULTI_PARTNER_QUOTE_AND_SELECT") {
    const mp = mswPerTypeConfig.MULTI_PARTNER_QUOTE_AND_SELECT || {};
    const pt = String(mp.partner_type || "").trim().toUpperCase();
    const allowed = mswPartnerTypeAllowedSet();
    if (!pt) {
      errors.push(
        "여러 파트너 견적·선택 방식에서는 파트너 유형을 선택해야 합니다. 위의 목록에서 유형을 고르세요."
      );
    } else if (!allowed.has(pt)) {
      errors.push(
        `파트너 유형「${pt}」은 현재 서버에서 불러온 파트너 유형 목록에 없습니다. 파트너(또는 워크플로 규칙)에 등록된 유형이 반영된 뒤 다시 선택해 주세요.`
      );
    }
    const maxR = Number(mp.max_requests);
    const minR = Number(mp.min_responses);
    if (Number.isFinite(maxR) && Number.isFinite(minR) && minR > maxR) {
      errors.push(
        "최소 응답 수는 최대 요청 수보다 많을 수 없습니다. 더 많은 파트너에게내도록 최대 요청 수를 늘리거나, 기다릴 최소 응답 수를 줄여 주세요."
      );
    }
    const matchStr = String(mp.matching_strategy || "").trim();
    if (mswMultiStrategyUsesCustomerState(matchStr)) {
      const ok = hasIntakeKey("customer_state") || hasIntakeKey("shipping_state") || hasIntakeKey("home_state");
      if (!ok) {
        warnings.push(
          "이 workflow는 파트너 매칭에 고객의 주(State)가 필요합니다. Customer Intake Builder에 거주 주를 묻는 질문을 추가해 주세요."
        );
      }
    }
    const rt = String(mp.request_type || "").trim();
    if (!rt) {
      warnings.push(
        "요청 유형(Request type)을 비우면 서버에 기본 견적 코드(QUOTE_REQUEST)로 저장됩니다. 자동차 RFP 등은 AUTO_PURCHASE_RFP처럼 구분 문자열을 넣는 것을 권장합니다."
      );
    }
  }

  if (type === "SINGLE_PARTNER_APPLICATION") {
    const sp = mswPerTypeConfig.SINGLE_PARTNER_APPLICATION || {};
    const r = mswValidateSinglePartnerSlice(sp, {
      partnerTypeAllowedSet: mswPartnerTypeAllowedSet(),
      isKnownMatchingRule: mswIsKnownSingleMatchingRule,
      isKnownIntakeBuilder: mswIsKnownSingleIntakeBuilder,
      looksLikeEmail: mswLooksLikeEmail,
      legacyResponseUnstructured: mswSingleLegacyResponseWasUnstructured,
      isWorkflowStepAllowed: mswSinglePostWorkflowIsAllowed,
    });
    errors.push(...r.errors);
    warnings.push(...r.warnings);
  }

  if (type === "AI_ONLY_GUIDE") {
    const ai = mswPerTypeConfig.AI_ONLY_GUIDE || {};
    if (!Boolean(ai.require_admin_review) && !Boolean(ai.auto_send)) {
      warnings.push(
        "자동 전송과 관리자 검토가 모두 꺼져 있으면, 결제 후 고객에게 무엇을 언제 보낼지 팀 내부에서도 헷갈릴 수 있습니다. 의도한 설정이 맞는지 확인해 주세요."
      );
    }
  }

  const thrEl = qs("#mswEmailAutoPublishThreshold");
  if (thrEl instanceof HTMLInputElement) {
    const raw = String(thrEl.value || "").trim();
    if (raw !== "") {
      const n = Number(raw);
      if (!Number.isFinite(n) || n < 0 || n > 1) {
        errors.push("이메일 자동 반영 기준은 0 이상 1 이하의 숫자(예: 0.85)여야 저장할 수 있습니다.");
      }
    }
  }

  return { errors, warnings };
}

function mswUpdateValidationHost(v) {
  const host = qs("#mswWorkflowValidation");
  if (!(host instanceof HTMLElement)) return;
  const parts = [];
  for (const e of v.errors) {
    parts.push(
      `<div class="admin-services__workflow-validation__item admin-services__workflow-validation__item--error" role="alert">${esc(e)}</div>`
    );
  }
  for (const w of v.warnings) {
    parts.push(`<div class="admin-services__workflow-validation__item admin-services__workflow-validation__item--warn">${esc(w)}</div>`);
  }
  if (!parts.length) {
    host.innerHTML = "";
    host.hidden = true;
    return;
  }
  host.hidden = false;
  host.innerHTML = `<div class="admin-services__workflow-validation__inner">${parts.join("")}</div>`;
}

function mswRankLabel(rank) {
  const rankLabels = {
    low_price_first: t("common.admin_services.workflow.rank.low_price", "낮은 가격 우선"),
    high_rating_first: t("common.admin_services.workflow.rank.high_rating", "높은 평점 우선"),
    fast_response_first: t("common.admin_services.workflow.rank.fast", "빠른 응답 우선"),
    manual: t("common.admin_services.workflow.rank.manual", "관리자 수동 정렬"),
  };
  return rankLabels[rank] || rank || "";
}

/** @param {Set<string> | Iterable<string>} intakeKeys */
function mswSortedIntakeKeysArray(intakeKeys) {
  const arr = intakeKeys instanceof Set ? [...intakeKeys] : Array.from(intakeKeys || []);
  return arr.map(String).map((s) => s.trim()).filter(Boolean).sort();
}

function mswValidateSinglePartnerSlice(sp, deps = {}) {
  const errors = [];
  const warnings = [];
  const partnerTypeAllowedSet = deps.partnerTypeAllowedSet || new Set();
  const isKnownMatchingRule = typeof deps.isKnownMatchingRule === "function" ? deps.isKnownMatchingRule : () => false;
  const isKnownIntakeBuilder = typeof deps.isKnownIntakeBuilder === "function" ? deps.isKnownIntakeBuilder : () => false;
  const looksLikeEmail = typeof deps.looksLikeEmail === "function" ? deps.looksLikeEmail : () => false;
  const legacyResponseUnstructured = Boolean(deps.legacyResponseUnstructured);
  const isWorkflowStepAllowed = typeof deps.isWorkflowStepAllowed === "function" ? deps.isWorkflowStepAllowed : () => false;
  const pt = String(sp?.partner_type || "").trim().toUpperCase();
  if (!pt) {
    errors.push("단일 파트너 신청을 저장하려면 파트너 유형을 선택해 주세요.");
  } else if (!partnerTypeAllowedSet.has(pt)) {
    errors.push(
      `파트너 유형「${pt}」은 현재 서버에서 불러온 파트너 유형 목록에 없습니다. 파트너(또는 워크플로 규칙)에 등록된 유형이 반영된 뒤 다시 선택해 주세요.`
    );
  }
  const strategyRaw = String(sp?.strategy || "").trim();
  if (strategyRaw !== "fixed" && strategyRaw !== "matching_rule") {
    errors.push("파트너 지정 방식을 선택해 주세요.");
  }
  const strat = strategyRaw === "matching_rule" ? "matching_rule" : "fixed";
  const fixedMode = mswInferFixedTargetModeFromSlice(sp);
  const target = String(sp?.default_partner || "").trim();
  const fps = Array.isArray(sp?.fixed_partner_ids)
    ? sp.fixed_partner_ids.map((x) => String(x || "").trim()).filter(Boolean)
    : [];
  const uuidOk = (s) => isUuid(String(s || "").trim());
  if (strat === "fixed") {
    if (fixedMode === MSW_FIXED_TARGET_REGISTERED) {
      const idCandidate = fps[0] || target;
      if (!idCandidate) {
        errors.push("등록 파트너 계정 방식에서는 목록에서 파트너를 선택해야 합니다.");
      } else if (!uuidOk(idCandidate)) {
        errors.push("선택된 파트너가 올바르지 않습니다. 목록에서 다시 선택해 주세요.");
      }
    } else if (!target) {
      errors.push("고정 파트너(이메일) 방식에서는 파트너 이메일이 필요합니다.");
    } else if (!looksLikeEmail(target)) {
      errors.push("파트너 이메일 형식이 올바르지 않습니다.");
    }
  } else {
    if (!target) {
      errors.push("매칭 규칙 방식에서는 파트너 매칭 규칙을 선택해 주세요.");
    } else if (!isKnownMatchingRule(target)) {
      errors.push("선택한 파트너 매칭 규칙이 현재 목록에 없습니다. 다시 선택해 주세요.");
    }
  }
  const post = sp?.post_submission_workflow && typeof sp.post_submission_workflow === "object" ? sp.post_submission_workflow : {};
  const p1 = String(post.step1_after_customer_submission || "").trim();
  const p2 = String(post.step2_after_partner_response || "").trim();
  const p3 = String(post.step3_customer_follow_up || "").trim();
  if (!p1) errors.push("제출 이후 운영 단계의 1단계를 선택해 주세요.");
  if (!p2) errors.push("제출 이후 운영 단계의 2단계를 선택해 주세요.");
  if (!p3) errors.push("제출 이후 운영 단계의 3단계를 선택해 주세요.");
  if (p1 && !isWorkflowStepAllowed("step1_after_customer_submission", p1)) {
    errors.push("1단계 설정 값이 유효하지 않습니다. 다시 선택해 주세요.");
  }
  if (p2 && !isWorkflowStepAllowed("step2_after_partner_response", p2)) {
    errors.push("2단계 설정 값이 유효하지 않습니다. 다시 선택해 주세요.");
  }
  if (p3 && !isWorkflowStepAllowed("step3_customer_follow_up", p3)) {
    errors.push("3단계 설정 값이 유효하지 않습니다. 다시 선택해 주세요.");
  }
  const intakeBuilderId = String(sp?.intake_builder_id || sp?.request_type || "").trim();
  if (!intakeBuilderId) {
    errors.push("고객 Intake Builder를 선택해 주세요.");
  } else if (!isKnownIntakeBuilder(intakeBuilderId)) {
    errors.push("선택한 고객 Intake Builder가 현재 목록에 없습니다. 다시 선택해 주세요.");
  }
  if (legacyResponseUnstructured) {
    warnings.push(
      "기존 response_handling_notes가 레거시 텍스트 형식입니다. 저장 시 단계형 설정으로 변환되므로 1~3단계를 확인해 주세요."
    );
  }
  return { errors, warnings };
}

function mswBuildSinglePartnerPreviewSummary(input) {
  const steps = [];
  steps.push(`파트너 유형: ${input.partnerTypeDisplay || "아직 선택 안 함"}`);
  const strategy = String(input.strategy || "").trim() === "matching_rule" ? "matching_rule" : "fixed";
  const target = String(input.defaultPartner || "").trim();
  const ftm = String(input.fixedTargetMode || "").trim();
  if (strategy === "fixed") {
    if (ftm === MSW_FIXED_TARGET_REGISTERED) {
      const line = String(input.catalogPreviewLine || "").trim();
      steps.push(
        line
          ? `파트너 지정 방식: 고정 — 등록 파트너 계정 (${line})`
          : "파트너 지정 방식: 고정 — 등록 파트너 계정 (미선택)"
      );
    } else {
      steps.push(
        target
          ? `파트너 지정 방식: 고정 파트너에게 전달 (파트너 이메일: ${target})`
          : "파트너 지정 방식: 고정 파트너에게 전달 (파트너 이메일 미입력)"
      );
    }
  } else {
    const ruleLabel = String(input.matchingRuleLabel || target || "").trim();
    steps.push(
      target
        ? `파트너 지정 방식: 매칭 규칙으로 자동 선택 (규칙: ${ruleLabel})`
        : "파트너 지정 방식: 매칭 규칙으로 자동 선택 (규칙 미선택)"
    );
  }
  const intakeLabel = String(input.intakeBuilderLabel || "").trim();
  steps.push(intakeLabel ? `고객 Intake Builder: ${intakeLabel}` : "고객 Intake Builder: 미선택");
  steps.push("운영 흐름: 고객이 intake form을 제출한 뒤 아래 순서로 처리됩니다.");
  steps.push("제출 이후 운영 단계:");
  steps.push(`- 1단계(고객 제출 직후): ${input.step1Label || ""}`);
  steps.push(`- 2단계(파트너 응답 후 처리): ${input.step2Label || ""}`);
  steps.push(`- 3단계(고객 후속 안내): ${input.step3Label || ""}`);
  return steps;
}

/**
 * Preview UI blocks (실시간 반영).
 * @returns {{ blocks: Array<{ kind: string, text?: string, items?: string[] }> }}
 */
function mswBuildPreviewSections() {
  const type = mswSelectedWorkflowType();
  const keyArr = mswSortedIntakeKeysArray(mswIntakeFieldKeysProvider());
  const hasIntake = keyArr.length > 0;

  const typeLabel = {
    AI_ONLY_GUIDE: t("common.admin_services.workflow.type.ai_only", "AI가 고객에게 안내만 합니다"),
    HUMAN_AGENT_MANAGED: t("common.admin_services.workflow.type.human", "관리자가 직접 처리합니다"),
    SINGLE_PARTNER_APPLICATION: t("common.admin_services.workflow.type.single_partner", "한 명의 파트너에게 신청서를 보냅니다"),
    MULTI_PARTNER_QUOTE_AND_SELECT: t(
      "common.admin_services.workflow.type.multi_partner",
      "여러 파트너에게 견적 요청 후 고객이 선택합니다 (선택 후 메시지·이메일 진행 포함)"
    ),
  }[type] || type;

  /** @type {Array<{ kind: string, text?: string, items?: string[] }>} */
  const blocks = [];
  blocks.push({
    kind: "heading",
    text: t("common.admin_services.workflow.preview.flow_title", "결제 후 고객에게 이렇게 진행됩니다"),
  });
  blocks.push({
    kind: "paragraph",
    text: t("common.admin_services.workflow.preview.flow_selected", "선택한 방식: {type}").replace("{type}", typeLabel),
  });

  const foot = [];

  if (type === "MULTI_PARTNER_QUOTE_AND_SELECT") {
    const steps = [];
    steps.push(
      hasIntake
        ? t(
            "common.admin_services.workflow.preview.step.intake_yes",
            "고객이 서비스 대화에서 추가 질문(인테이크)에 답합니다. 답변은 아래에 나열된 질문 키에 저장됩니다."
          )
        : t(
            "common.admin_services.workflow.preview.step.intake_no",
            "고객이 추가 질문(인테이크)에 답합니다. (Intake Builder에 질문을 추가하면 이 단계에서 화면에 나타납니다.)"
          )
    );
    const match = mswVal("mswMultiMatchingStrategy", "");
    if (mswMultiStrategyUsesCustomerState(match)) {
      steps.push(
        t(
          "common.admin_services.workflow.preview.step.multi_state_first",
          "시스템은 고객과 같은 주(주에 등록된) 파트너를 먼저 찾습니다."
        )
      );
      steps.push(
        t(
          "common.admin_services.workflow.preview.step.multi_state_expand",
          "같은 주에 해당 유형 파트너가 부족하면, 고객 주에 서비스를 제공할 수 있는 다른 후보 파트너도 포함합니다."
        )
      );
    } else {
      steps.push(
        t(
          "common.admin_services.workflow.preview.step.multi_match_generic",
          "시스템이 아래에 적어 둔 매칭 전략에 맞게 후보 파트너를 찾습니다."
        )
      );
      const mt = String(match).trim();
      if (mt) {
        steps.push(
          t("common.admin_services.workflow.preview.step.strategy_detail", "매칭 전략(관리자 메모): {s}").replace("{s}", mt)
        );
      }
    }
    const maxP = Number(mswVal("mswMultiMaxRequests", "5"));
    const minR = Number(mswVal("mswMultiMinResponses", "1"));
    const hours = Number(mswVal("mswMultiTimeoutHours", "48"));
    const maxOk = Number.isFinite(maxP) ? maxP : 5;
    const minOk = Number.isFinite(minR) ? minR : 1;
    const hrsOk = Number.isFinite(hours) ? hours : 48;
    steps.push(
      t("common.admin_services.workflow.preview.step.multi_max_requests", "최대 {n}곳의 파트너에게 견적·회신 요청을 보냅니다.").replace(
        "{n}",
        String(maxOk)
      )
    );
    const rtMulti = mswVal("mswMultiRequestType", "").trim();
    if (rtMulti) {
      steps.push(t("common.admin_services.workflow.preview.step.single_req", "요청 유형 라벨: {r}").replace("{r}", rtMulti));
    }
    steps.push(
      t(
        "common.admin_services.workflow.preview.step.multi_wait",
        "최소 {m}개의 응답이 모이거나, {h}시간이 지나면 결과를 정리해 고객에게 후보를 보여줍니다."
      )
        .replace("{m}", String(minOk))
        .replace("{h}", String(hrsOk))
    );
    const rank = mswVal("mswMultiRankingRule", "low_price_first") || "low_price_first";
    const rk = mswRankLabel(rank);
    steps.push(
      t(
        "common.admin_services.workflow.preview.step.multi_compare",
        "고객은 받은 제안을 비교하고({rule} 기준), 원하는 파트너를 선택합니다."
      ).replace("{rule}", rk || t("common.admin_services.workflow.preview.rule_fallback", "설정한 정렬"))
    );
    const afterAcct = mswVal("mswMultiAfterHasAccount", "add_thread") || "add_thread";
    const afterNo = mswVal("mswMultiAfterNoAccount", "email_summary") || "email_summary";
    if (afterAcct === "add_thread") {
      steps.push(
        t(
          "common.admin_services.workflow.preview.step.multi_in_app",
          "선택된 파트너에게 앱 계정이 있으면, 고객 서비스 메시지방에 초대되어 이후 대화를 이어갑니다."
        )
      );
    }
    if (afterNo === "email_summary") {
      steps.push(
        t(
          "common.admin_services.workflow.preview.step.multi_email",
          "앱 계정이 없는 파트너는 이메일로 후속 견적·조율이 진행되며, 고객에게는 요약 형태로 안내됩니다."
        )
      );
    }
    blocks.push({ kind: "ol", items: steps });
    const pt = mswVal("mswMultiPartnerType", "").trim();
    if (pt) {
      const disp = mswPartnerTypeAllowedSet().has(pt.toUpperCase()) ? `${mswPartnerTypeLabel(pt)} (${pt})` : pt;
      foot.push(t("common.admin_services.workflow.preview.foot.partner_type", "대상 파트너 유형: {p}").replace("{p}", disp));
    }
    const thr = String(qs("#mswEmailAutoPublishThreshold")?.value || "").trim();
    if (thr !== "") {
      foot.push(
        t(
          "common.admin_services.workflow.preview.foot.email_threshold",
          "이메일로 온 파트너 회신은 신뢰도 {v} 이상일 때 자동으로 고객에게 반영될 수 있습니다. (그 미만이면 검토·수동 처리에 가깝게 동작할 수 있습니다.)"
        ).replace("{v}", thr)
      );
    }
    if (hasIntake) {
      foot.push(
        t("common.admin_services.workflow.preview.foot.intake_keys", "연결된 Intake 질문(field_key): {keys}").replace(
          "{keys}",
          keyArr.join(", ")
        )
      );
    }
  } else if (type === "AI_ONLY_GUIDE") {
    const steps = [];
    steps.push(
      hasIntake
        ? t(
            "common.admin_services.workflow.preview.step.intake_yes",
            "고객이 서비스 대화에서 추가 질문(인테이크)에 답합니다. 답변은 아래에 나열된 질문 키에 저장됩니다."
          )
        : t(
            "common.admin_services.workflow.preview.step.intake_no",
            "고객이 추가 질문(인테이크)에 답합니다. (Intake Builder에 질문을 추가하면 이 단계에서 화면에 나타납니다.)"
          )
    );
    steps.push(
      t(
        "common.admin_services.workflow.preview.step.ai_placeholder_customer",
        "[현재 구현] 인테이크 완료 후 고객 스레드에 안내 카드가 올라가지만, 카드 본문은 플레이스홀더입니다. 실제 LLM·자동 안내 생성은 아직 연결되지 않았습니다."
      )
    );
    const role = mswVal("mswAiRole", "").trim();
    if (role) {
      steps.push(
        t("common.admin_services.workflow.preview.step.ai_role_saved_for_future", "(저장되는 역할·맥락: 향후 AI 연결 시 프롬프트에 사용할 수 있습니다 — {r})").replace(
          "{r}",
          role.length > 160 ? `${role.slice(0, 160)}…` : role
        )
      );
    }
    const intakeNotes = mswVal("mswAiIntakeRef", "").trim();
    if (intakeNotes) {
      steps.push(
        t("common.admin_services.workflow.preview.step.ai_intake_notes", "운영팀이 적어 둔 ‘참고 Intake’ 메모는 AI 프롬프트 맥락에 활용될 수 있습니다.")
      );
    }
    const auto = Boolean(mswVal("mswAiAutoSend", false));
    const review = Boolean(mswVal("mswAiAdminReview", false));
    if (auto && review) {
      steps.push(
        t(
          "common.admin_services.workflow.preview.step.ai_send_review_both",
          "생성된 안내는 관리자 검토를 거친 뒤, 승인되면 고객에게 자동으로 전송됩니다."
        )
      );
    } else if (auto && !review) {
      steps.push(
        t(
          "common.admin_services.workflow.preview.step.ai_auto_only",
          "생성된 안내는 별도 검토 없이 고객에게 자동으로 전송됩니다."
        )
      );
    } else if (!auto && review) {
      steps.push(
        t(
          "common.admin_services.workflow.preview.step.ai_review_only",
          "AI가 만든 안내는 관리자가 확인·편집한 뒤 고객에게 전달됩니다. (자동 전송은 꺼져 있습니다.)"
        )
      );
    } else {
      steps.push(
        t(
          "common.admin_services.workflow.preview.step.ai_neither",
          "자동 전송과 관리자 검토가 모두 꺼져 있으면, 실제로 언제·어떻게 보낼지 운영 규칙을 팀에서 정해야 합니다."
        )
      );
    }
    const questions = Boolean(mswVal("mswAiCustomerQuestions", false));
    steps.push(
      questions
        ? t(
            "common.admin_services.workflow.preview.step.ai_customer_q_on",
            "고객은 필요하면 같은 스레드에서 추가 질문을 이어갈 수 있습니다."
          )
        : t(
            "common.admin_services.workflow.preview.step.ai_customer_q_off",
            "고객의 추가 질문은 제한됩니다. (필요하면 나중에 설정을 켤 수 있습니다.)"
          )
    );
    const completion = mswVal("mswAiCompletionMode", "") || "open_ended";
    const completionLabels = {
      checklist_done: t("common.admin_services.workflow.completion.checklist", "체크리스트 완료 시 자동 완료"),
      admin_confirms: t("common.admin_services.workflow.completion.admin", "관리자 확인 후 완료"),
      open_ended: t("common.admin_services.workflow.completion.open", "명시적 완료 없이 진행"),
    };
    steps.push(
      t("common.admin_services.workflow.preview.step.ai_completion", "완료 처리: {c}").replace(
        "{c}",
        completionLabels[completion] || completion
      )
    );
    blocks.push({ kind: "ol", items: steps });
    if (hasIntake) {
      foot.push(
        t("common.admin_services.workflow.preview.foot.intake_keys", "연결된 Intake 질문(field_key): {keys}").replace(
          "{keys}",
          keyArr.join(", ")
        )
      );
    }
  } else if (type === "HUMAN_AGENT_MANAGED") {
    const steps = [];
    steps.push(
      hasIntake
        ? t(
            "common.admin_services.workflow.preview.step.intake_yes",
            "고객이 서비스 대화에서 추가 질문(인테이크)에 답합니다. 답변은 아래에 나열된 질문 키에 저장됩니다."
          )
        : t(
            "common.admin_services.workflow.preview.step.intake_no",
            "고객이 추가 질문(인테이크)에 답합니다. (Intake Builder에 질문을 추가하면 이 단계에서 화면에 나타납니다.)"
          )
    );
    steps.push(
      t(
        "common.admin_services.workflow.preview.step.human_queue",
        "접수 내용은 운영 화면에 쌓이고, 아래에서 고른 방식으로 담당자에게 배정됩니다."
      )
    );
    const assign = mswVal("mswHumanAssignment", "");
    const assignLabels = {
      manual: t("common.admin_services.workflow.assign.manual", "수동 배정"),
      round_robin: t("common.admin_services.workflow.assign.round_robin", "라운드로빈"),
      pull_queue: t("common.admin_services.workflow.assign.pull", "대기열에서 인수"),
    };
    steps.push(
      t("common.admin_services.workflow.preview.step.human_assign", "담당자 배정: {a}").replace(
        "{a}",
        assignLabels[assign] || assign || t("common.admin_services.workflow.preview.not_chosen", "아직 선택 안 함")
      )
    );
    const humanPartnerEm = mswVal("mswHumanPartnerNotifyEmail", "").trim();
    if (humanPartnerEm) {
      steps.push(
        t(
          "common.admin_services.workflow.preview.step.human_partner_email",
          "인테이크 제출 시 파트너(이메일)로 요약 메일: {em}"
        ).replace("{em}", humanPartnerEm)
      );
    }
    if (Boolean(mswVal("mswHumanAdminNotify", false))) {
      steps.push(
        t(
          "common.admin_services.workflow.preview.step.human_notify",
          "새 접수가 생기면 관리자에게 알림을 보냅니다."
        )
      );
    }
    const msg = mswVal("mswHumanCustomerMessage", "").trim();
    if (msg) {
      steps.push(
        t(
          "common.admin_services.workflow.preview.step.human_receipt",
          "고객에게는 접수 직후 안내 문구가 보입니다. (처음 일부: “{snippet}”)"
        ).replace("{snippet}", msg.length > 100 ? `${msg.slice(0, 100)}…` : msg)
      );
    } else {
      steps.push(
        t(
          "common.admin_services.workflow.preview.step.human_receipt_empty",
          "고객 접수 메시지를 비워 두었습니다. 필요하면 한 줄 안내를 적어 주세요."
        )
      );
    }
    steps.push(
      t(
        "common.admin_services.workflow.preview.step.human_ops",
        "이후 일정·문서·견적 등은 담당자가 고객 대화와 운영 도구를 통해 처리합니다."
      )
    );
    blocks.push({ kind: "ol", items: steps });
    if (hasIntake) {
      foot.push(
        t("common.admin_services.workflow.preview.foot.intake_keys", "연결된 Intake 질문(field_key): {keys}").replace(
          "{keys}",
          keyArr.join(", ")
        )
      );
    }
  } else if (type === "SINGLE_PARTNER_APPLICATION") {
    const pt = mswVal("mswSinglePartnerType", "").trim();
    const ptDisp = pt
      ? mswPartnerTypeAllowedSet().has(pt.toUpperCase())
        ? `${mswPartnerTypeLabel(pt)} (${pt})`
        : pt
      : t("common.admin_services.workflow.preview.not_chosen", "아직 선택 안 함");
    const strategy = mswSingleStrategySelected();
    const spSnap = mswPerTypeConfig.SINGLE_PARTNER_APPLICATION || {};
    const fixedMode = mswInferFixedTargetModeFromSlice(spSnap);
    const def = String(spSnap.default_partner || "").trim();
    let catalogPreviewLine = "";
    if (strategy === "fixed" && fixedMode === MSW_FIXED_TARGET_REGISTERED) {
      const sel = qs("#mswSingleFixedPartnerCatalogSelect");
      if (sel instanceof HTMLSelectElement && sel.value) {
        const opt = sel.selectedOptions[0];
        catalogPreviewLine = opt ? String(opt.textContent || "").trim() : "";
      }
    }
    const req = mswVal("mswSingleRequestType", "").trim();
    const builderLabel = req ? mswSingleIntakeBuilderLabel(req) || req : "";
    const post = mswSinglePostWorkflowFromDom();
    const steps = mswBuildSinglePartnerPreviewSummary({
      partnerTypeDisplay: ptDisp,
      strategy,
      defaultPartner: strategy === "fixed" && fixedMode === MSW_FIXED_TARGET_REGISTERED ? "" : def,
      fixedTargetMode: strategy === "fixed" ? fixedMode : MSW_FIXED_TARGET_EMAIL,
      catalogPreviewLine,
      matchingRuleLabel: mswSingleMatchingRuleLabel(def) || def,
      intakeBuilderLabel: builderLabel,
      step1Label: mswSinglePostWorkflowLabel("step1_after_customer_submission", post.step1_after_customer_submission),
      step2Label: mswSinglePostWorkflowLabel("step2_after_partner_response", post.step2_after_partner_response),
      step3Label: mswSinglePostWorkflowLabel("step3_customer_follow_up", post.step3_customer_follow_up),
    });

    const legacyNotices = [];
    if (mswSingleLegacyDefaultPartnerRaw) legacyNotices.push(`legacy default_partner 보존값: ${mswSingleLegacyDefaultPartnerRaw}`);
    if (mswSingleLegacyRequestTypeRaw) legacyNotices.push(`legacy request_type 보존값: ${mswSingleLegacyRequestTypeRaw}`);
    if (mswSingleLegacyResponseNotesText) {
      legacyNotices.push(
        `legacy response_handling_notes 보존값: ${
          mswSingleLegacyResponseNotesText.length > 200
            ? `${mswSingleLegacyResponseNotesText.slice(0, 200)}…`
            : mswSingleLegacyResponseNotesText
        }`
      );
    }
    if (legacyNotices.length) {
      foot.push("Legacy/Fallback notice: 일부 값은 이전 형식 데이터이며 호환 모드로 보존 중입니다.");
      for (const n of legacyNotices) foot.push(`- ${n}`);
    }
    if (hasIntake) {
      foot.push(
        t("common.admin_services.workflow.preview.foot.intake_keys", "연결된 Intake 질문(field_key): {keys}").replace(
          "{keys}",
          keyArr.join(", ")
        )
      );
    }
  }

  if (foot.length) {
    blocks.push({ kind: "footnotes", items: foot });
  }

  return { blocks };
}

function mswRenderPreviewSectionsHtml(sections) {
  const parts = [];
  for (const b of sections.blocks || []) {
    if (b.kind === "heading" && b.text) {
      parts.push(`<p class="admin-services__workflow-preview-heading">${esc(b.text)}</p>`);
    } else if (b.kind === "paragraph" && b.text) {
      parts.push(`<p class="admin-services__workflow-preview-sub">${esc(b.text)}</p>`);
    } else if (b.kind === "ol" && Array.isArray(b.items) && b.items.length) {
      parts.push(
        `<ol class="admin-services__workflow-preview-steps">${b.items.map((li) => `<li>${esc(li)}</li>`).join("")}</ol>`
      );
    } else if (b.kind === "footnotes" && Array.isArray(b.items) && b.items.length) {
      parts.push(
        `<div class="admin-services__workflow-preview-foot">${b.items.map((line) => `<p>${esc(line)}</p>`).join("")}</div>`
      );
    }
  }
  return parts.join("");
}

function mswRefreshPreview() {
  const out = qs("#mswWorkflowPreview");
  if (!out) return;
  mswFlushCurrentSliceToStash();
  const keys = mswIntakeFieldKeysProvider();
  const v = workflowComputeValidation(keys);
  const sections = mswBuildPreviewSections();
  const mainHtml = mswRenderPreviewSectionsHtml(sections);
  const extra = [];
  for (const w of v.warnings) {
    extra.push(`⚠ ${w}`);
  }
  for (const e of v.errors) {
    extra.push(`저장 시 막힘: ${e}`);
  }
  const extraHtml = extra
    .map((line) => `<p class="admin-services__workflow-preview-line admin-services__workflow-preview-line--warn">${esc(line)}</p>`)
    .join("");
  out.innerHTML = `${mainHtml}${extraHtml}`;
  mswUpdateValidationHost(v);
}

function mswResetFormToDefaults() {
  mswSetRadio("mswWorkflowType", MSW_DEFAULT_WORKFLOW_TYPE);
  mswSetRadio("mswSingleStrategy", "fixed");
  mswSetRadio("mswSingleFixedTargetMode", MSW_FIXED_TARGET_REGISTERED);
  mswSingleLegacyResponseNotesText = "";
  mswSingleLegacyResponseWasUnstructured = false;
  mswSingleLegacyDefaultPartnerRaw = "";
  mswSingleLegacyRequestTypeRaw = "";
  mswSetSingleResponseLegacyWarning("");
  mswSetSingleCompatibilityWarnings([]);

  const defaults = [
    ["mswAiRole", ""],
    ["mswAiIntakeRef", ""],
    ["mswAiAutoSend", false],
    ["mswAiAdminReview", false],
    ["mswAiCustomerQuestions", false],
    ["mswAiCompletionMode", ""],
    ["mswHumanAssignment", ""],
    ["mswHumanAdminNotify", false],
    ["mswHumanPartnerNotifyEmail", ""],
    ["mswHumanCustomerMessage", ""],
    ["mswSinglePartnerType", ""],
    ["mswSingleDefaultPartner", ""],
    ["mswSingleMatchingRule", ""],
    ["mswSingleRequestType", ""],
    ["mswSinglePostStep1", "SEND_IMMEDIATELY"],
    ["mswSinglePostStep2", "NONE"],
    ["mswSinglePostStep3", "NONE"],
    ["mswMultiPartnerType", ""],
    ["mswMultiRequestType", ""],
    ["mswMultiMatchingStrategy", ""],
    ["mswMultiMaxRequests", "5"],
    ["mswMultiMinResponses", "1"],
    ["mswMultiTimeoutHours", "48"],
    ["mswMultiRankingRule", "low_price_first"],
    ["mswMultiAfterHasAccount", "add_thread"],
    ["mswMultiAfterNoAccount", "email_summary"],
    ["mswEmailAutoPublishThreshold", ""],
  ];
  for (const [id, val] of defaults) {
    const el = qs(`#${id}`);
    if (!el) continue;
    if (el instanceof HTMLInputElement && el.type === "checkbox") el.checked = Boolean(val);
    else if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement) {
      el.value = String(val);
    }
  }
  const fcSel = qs("#mswSingleFixedPartnerCatalogSelect");
  if (fcSel instanceof HTMLSelectElement) {
    fcSel.innerHTML = "";
    const o = document.createElement("option");
    o.value = "";
    o.textContent = "「등록 파트너 계정 선택」을 선택하면 목록이 채워집니다.";
    fcSel.appendChild(o);
  }

  mswToggleSections();
  mswSyncSinglePartnerTargetUi();
  mswPopulateSingleIntakeBuilderOptions();
  mswPopulateSinglePostWorkflowOptions();
  mswRefreshPreview();
}

function mswOnWorkflowTypeRadioChange() {
  const oldType = mswTrackedType;
  const newType = mswSelectedWorkflowType();
  if (oldType && MSW_WORKFLOW_TYPES.includes(oldType)) {
    mswPerTypeConfig[oldType] = mswExtractSliceFromDom(oldType);
  }
  mswPerTypeConfig[newType] = mswMergeDefaults(newType, mswPerTypeConfig[newType]);
  mswApplySliceToDom(newType, mswPerTypeConfig[newType]);
  mswTrackedType = newType;
  mswToggleSections();
  mswRefreshPreview();
}

function mswBindPanel() {
  const panel = qs("#manageServiceWorkflowPanel");
  if (!panel || panel.dataset.mswBound === "1") return;
  panel.dataset.mswBound = "1";

  mswPopulatePartnerTypeSelectOptions();
  mswPopulateSingleMatchingRuleOptions();
  mswPopulateSingleIntakeBuilderOptions();
  mswPopulateSinglePostWorkflowOptions();
  void mswRefreshPartnerTypesFromApi();

  const onAny = () => {
    mswToggleSections();
    mswRefreshPreview();
  };

  panel.addEventListener("change", (ev) => {
    const t = ev.target;
    if (t instanceof HTMLInputElement && t.name === "mswWorkflowType") {
      mswOnWorkflowTypeRadioChange();
      return;
    }
    if (t instanceof HTMLInputElement && t.name === "mswSingleStrategy") {
      if (mswSingleStrategySelected() === "fixed" && mswSingleFixedTargetModeSelected() === MSW_FIXED_TARGET_REGISTERED) {
        void mswRefreshFixedPartnerCatalogSelect(
          mswVal("mswSinglePartnerType", ""),
          mswVal("mswSingleFixedPartnerCatalogSelect", "")
        );
      }
      onAny();
      return;
    }
    if (t instanceof HTMLInputElement && t.name === "mswSingleFixedTargetMode") {
      if (mswSingleFixedTargetModeSelected() === MSW_FIXED_TARGET_REGISTERED) {
        void mswRefreshFixedPartnerCatalogSelect(mswVal("mswSinglePartnerType", ""), "");
      }
      onAny();
      return;
    }
    if (t instanceof HTMLSelectElement) {
      const id = t.id;
      if (id === "mswHumanPartnerType" || id === "mswMultiPartnerType") {
        const ptVal = String(t.value || "").trim().toUpperCase();
        if (mswPartnerTypeAllowedSet().has(ptVal)) {
          qsa(`#${id} option[data-msw-legacy='1']`).forEach((n) => n.remove());
        }
      } else if (id === "mswSinglePartnerType") {
        const ptVal = String(t.value || "").trim().toUpperCase();
        if (mswPartnerTypeAllowedSet().has(ptVal)) {
          qsa("#mswSinglePartnerType option[data-msw-legacy='1']").forEach((n) => n.remove());
        }
        if (mswSingleStrategySelected() === "fixed" && mswSingleFixedTargetModeSelected() === MSW_FIXED_TARGET_REGISTERED) {
          void mswRefreshFixedPartnerCatalogSelect(String(t.value || "").trim(), "");
        } else {
          mswSyncFixedTargetSubPanels();
        }
      }
    }
    onAny();
  });
  panel.addEventListener("input", onAny);
}

/**
 * Load workflow fields from a service row (edit mode).
 * Prefer calling after ``msiRefresh()`` so the intake builder dropdown can list the active service template id/label (not only the fallback registry row).
 * @param {Record<string, unknown>} svc
 */
export function workflowHydrateFromService(svc) {
  if (!svc || typeof svc !== "object") return;
  const cfg = mswParseCfg(svc.workflow_config_json);
  const knownRoots = new Set([
    "message_templates",
    "ai_guide",
    "human_ops",
    "human_agent_managed",
    "single_partner",
    "partner_application",
    "multi_partner",
    "multi_partner_quote",
    "email_interpretation",
  ]);
  mswPassthroughExtras = {};
  for (const k of Object.keys(cfg)) {
    if (!knownRoots.has(k)) mswPassthroughExtras[k] = cfg[k];
  }
  mswRetainedEmailInterpretation =
    cfg.email_interpretation && typeof cfg.email_interpretation === "object" && !Array.isArray(cfg.email_interpretation)
      ? mswDeepClone(cfg.email_interpretation)
      : {};
  const thrIn = qs("#mswEmailAutoPublishThreshold");
  if (thrIn instanceof HTMLInputElement) {
    const v = mswRetainedEmailInterpretation.auto_publish_confidence_threshold;
    thrIn.value = v != null && v !== "" && Number.isFinite(Number(v)) ? String(v) : "";
  }
  mswRetainedMessageTemplates =
    cfg.message_templates && typeof cfg.message_templates === "object" && !Array.isArray(cfg.message_templates)
      ? mswDeepClone(cfg.message_templates)
      : {};

  for (const wt of MSW_WORKFLOW_TYPES) {
    const serverSlice = mswExtractServerSliceForType(wt, cfg);
    mswPerTypeConfig[wt] = mswMergeDefaults(wt, serverSlice);
  }

  const declared = mswNormalizeWorkflowType(svc.workflow_type);
  const effectiveType = declared || MSW_DEFAULT_WORKFLOW_TYPE;

  mswSetRadio("mswWorkflowType", effectiveType);
  mswTrackedType = effectiveType;
  mswApplySliceToDom(effectiveType, mswPerTypeConfig[effectiveType]);
  mswPerTypeConfig[effectiveType] = mswMergeDefaults(effectiveType, mswExtractSliceFromDom(effectiveType));

  mswToggleSections();
  mswRefreshPreview();
}

/** New service / cleared selection — defaults + empty stash. */
export function workflowHydrateForCreate() {
  mswPassthroughExtras = {};
  mswRetainedEmailInterpretation = {};
  mswRetainedMessageTemplates = {};
  const thrIn = qs("#mswEmailAutoPublishThreshold");
  if (thrIn instanceof HTMLInputElement) thrIn.value = "";
  for (const wt of MSW_WORKFLOW_TYPES) {
    mswPerTypeConfig[wt] = mswDefaultSlice(wt);
  }
  mswResetFormToDefaults();
  mswTrackedType = MSW_DEFAULT_WORKFLOW_TYPE;
  for (const wt of MSW_WORKFLOW_TYPES) {
    mswPerTypeConfig[wt] = mswMergeDefaults(wt, mswExtractSliceFromDom(wt));
  }
}

/**
 * Fields to merge into service create/update payload.
 * @returns {{ workflow_type: string, workflow_config_json: Record<string, unknown> }}
 */
export function workflowGetPayload() {
  mswFlushCurrentSliceToStash();
  const workflow_type = mswSelectedWorkflowType();
  const out = {
    ...mswPassthroughExtras,
    message_templates: mswDeepClone(mswRetainedMessageTemplates),
    ai_guide: mswDeepClone(mswPerTypeConfig.AI_ONLY_GUIDE),
    human_ops: mswDeepClone(mswPerTypeConfig.HUMAN_AGENT_MANAGED),
    single_partner: mswDeepClone(mswPerTypeConfig.SINGLE_PARTNER_APPLICATION),
    multi_partner: mswDeepClone(mswPerTypeConfig.MULTI_PARTNER_QUOTE_AND_SELECT),
  };
  const ei = mswDeepClone(mswRetainedEmailInterpretation);
  const thrEl = qs("#mswEmailAutoPublishThreshold");
  if (thrEl instanceof HTMLInputElement) {
    const raw = String(thrEl.value || "").trim();
    if (raw !== "") {
      const n = Number(raw);
      if (Number.isFinite(n)) {
        ei.auto_publish_confidence_threshold = Math.max(0, Math.min(1, n));
      }
    }
  }
  if (Object.keys(ei).length) {
    out.email_interpretation = ei;
  }
  return { workflow_type, workflow_config_json: out };
}

/** Called when the Service Workflow tab becomes visible (refresh layout-dependent copy). */
export function workflowTabActivated() {
  mswToggleSections();
  mswRefreshPreview();
  void workflowRefreshDbStatusPanel();
}

function mswDiagCopyTemplate() {
  const origin = typeof window !== "undefined" && window.location && window.location.origin ? window.location.origin : "";
  return `${origin}/api/admin/intake-dispatch-diagnostics?thread_id=&session_id=`;
}

/**
 * 하단 DB 상태 패널: 활성 ``service_workflow_config`` 및 파트너 규칙을 서버에서 다시 읽어 표시한다.
 */
export async function workflowRefreshDbStatusPanel() {
  const panel = qs("#mswWorkflowDbPanel");
  const body = qs("#mswWorkflowDbPanelBody");
  const warn = qs("#mswWorkflowDbPanelWarn");
  const loading = qs("#mswWorkflowDbPanelLoading");
  const codeEl = qs("#mswWorkflowDbDiagUrl");
  const sid = (qs("#manageServiceId")?.value || "").trim();
  if (!panel || !body) return;
  if (codeEl) codeEl.textContent = "/api/admin/intake-dispatch-diagnostics?thread_id=&session_id=";
  if (!sid) {
    panel.hidden = true;
    return;
  }
  if (!isCatalogRecServiceItemUuidString(sid)) {
    panel.hidden = false;
    if (loading) loading.hidden = true;
    body.innerHTML = `<p class="lhai-help">${esc(
      t(
        "common.admin_services.workflow.db.need_rec_uuid",
        "워크플로 DB 상태는 rec_service_items.id(UUID)인 서비스에서만 조회됩니다. 목록에서 서비스를 다시 선택하세요."
      )
    )}</p>`;
    return;
  }
  panel.hidden = false;
  if (warn) {
    warn.hidden = true;
    warn.textContent = "";
  }
  if (loading) loading.hidden = false;
  body.innerHTML = "";
  try {
    const data = await serviceCatalogAdminApi.getServiceItemWorkflowDbState(sid);
    if (!data || data.database_available === false) {
      body.innerHTML = `<p class="lhai-help">${esc(
        t(
          "common.admin_services.workflow.db.no_sql",
          "DB 워크플로 상태는 SQL 백엔드가 켜진 환경에서만 조회됩니다."
        )
      )}</p>`;
      return;
    }
    const cfg = data.active_workflow_config;
    if (!cfg) {
      body.innerHTML = `<p class="lhai-help">${esc(
        t(
          "common.admin_services.workflow.db.no_active_config",
          "활성 service_workflow_config 가 없습니다. 아래에서 워크플로를 저장하면 생성됩니다."
        )
      )}</p>`;
      return;
    }
    const rows = [
      ["workflow_config_id", cfg.workflow_config_id],
      ["workflow_type", cfg.workflow_type],
      ["version", String(cfg.version)],
      ["is_active", String(cfg.is_active)],
      ["partner_rule_count", String(data.partner_rule_count ?? 0)],
    ];
    let html = '<dl class="admin-services__workflow-db-dl">';
    for (const [k, v] of rows) {
      html += `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`;
    }
    html += "</dl>";
    const rules = Array.isArray(data.partner_rules) ? data.partner_rules : [];
    if (rules.length) {
      html +=
        '<p class="lhai-label u-mt-2">' +
        esc(t("common.admin_services.workflow.db.rules_heading", "Partner rules (active)")) +
        "</p>";
      html += '<div style="overflow-x:auto"><table class="lhai-table admin-services__workflow-db-table"><thead><tr>';
      const cols = ["route_type", "partner_email", "partner_account_id", "service_partner_id", "delivery_channel", "priority"];
      html += `<th>#</th>`;
      for (const c of cols) html += `<th>${esc(c)}</th>`;
      html += "</tr></thead><tbody>";
      rules.forEach((r, i) => {
        html += "<tr>";
        html += `<td>${i + 1}</td>`;
        for (const c of cols) html += `<td>${esc(r[c])}</td>`;
        html += "</tr>";
      });
      html += "</tbody></table></div>";
    }
    body.innerHTML = html;
    const prc = Number(data.partner_rule_count);
    if (warn && (!Number.isFinite(prc) || prc === 0)) {
      warn.hidden = false;
      warn.textContent = t(
        "common.admin_services.workflow.db.no_partner_rules",
        "현재 active workflow에 partner rule이 없습니다. 고객이 intake를 제출해도 파트너를 찾을 수 없습니다."
      );
    }
  } catch (e) {
    const msg = e && typeof e.message === "string" ? e.message : String(e);
    body.innerHTML = `<p class="lhai-help">${esc(msg)}</p>`;
  } finally {
    if (loading) loading.hidden = true;
  }
}

/** Intake 탭에서 필드 목록이 바뀐 뒤 workflow 미리보기·검증만 다시 그립니다. */
export function workflowExternalRefresh() {
  mswPopulateSingleIntakeBuilderOptions();
  mswRefreshPreview();
}

/**
 * 저장 직전 호출. ``intakeFieldKeys``는 Customer Intake 질문의 ``field_key`` 집합.
 * @param {Set<string> | Iterable<string> | null | undefined} intakeFieldKeys
 */
export function workflowValidateForSave(intakeFieldKeys) {
  mswFlushCurrentSliceToStash();
  const keys = intakeFieldKeys instanceof Set ? intakeFieldKeys : new Set(Array.from(intakeFieldKeys || []));
  return workflowComputeValidation(keys);
}

/** @param {() => Set<string>} fn */
export function workflowSetIntakeFieldKeysProvider(fn) {
  mswIntakeFieldKeysProvider = typeof fn === "function" ? fn : () => new Set();
}

/**
 * Intake Builder option provider.
 * Accepts either current UI shape `{ value, label, meta? }`
 * or API-friendly shape `{ id, display_name, metadata? }`.
 * @param {() => Array<Record<string, unknown>>} fn
 */
export function workflowSetIntakeBuilderOptionsProvider(fn) {
  mswIntakeBuilderOptionsProvider = typeof fn === "function" ? fn : () => [];
  mswPopulateSingleIntakeBuilderOptions();
}

/** @param {() => Array<{value:string,label:string,description?:string}>} fn */
export function workflowSetMatchingRuleOptionsProvider(fn) {
  mswMatchingRuleOptionsProvider = typeof fn === "function" ? fn : () => [];
  mswPopulateSingleMatchingRuleOptions();
}

export function initManageServiceWorkflowTab() {
  mswBindPanel();
  mswToggleSections();
  mswRefreshPreview();
  qs("#mswWorkflowDbCopyDiagApiBtn")?.addEventListener("click", async () => {
    const text = mswDiagCopyTemplate();
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      /* ignore */
    }
  });
}

export const __testOnlySinglePartner = {
  mswSingleTargetUiState,
  mswLooksLikeEmail,
  mswParseSinglePostWorkflowFromNotes,
  mswSerializeSinglePostWorkflow,
  mswValidateSinglePartnerSlice,
  mswBuildSinglePartnerPreviewSummary,
  mswInferFixedTargetModeFromSlice,
  MSW_FIXED_TARGET_EMAIL,
  MSW_FIXED_TARGET_REGISTERED,
};
