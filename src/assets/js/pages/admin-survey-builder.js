import { serviceCatalogAdminApi, surveyBuilderAdminApi } from "../core/api.js";
import { ensureAdminAccess, protectCurrentPage } from "../core/guards.js";
import { loadSidebar } from "../components/sidebar.js";
import { t } from "../core/i18n-client.js";
import { initCommonI18nAndApplyDom, applyI18nToDom } from "../core/i18n-dom.js";
import { mountTabs } from "../components/admin/tabs.js";
import { formatDate, qs, safeText } from "../core/utils.js";

let questionnaires = [];
let versions = [];
let questionItems = [];
let options = [];
let rules = [];
let versionByIdAll = {};

let selectedQuestionnaireId = "";
let selectedVersionId = "";
let selectedQuestionItemId = "";
let selectedRuleId = "";
/** True while creating a new survey before first save */
let isSurveyCreateMode = false;

/** Last non-custom display-rule mode (used to snapshot JSON when opening Advanced). */
let lastQuestionConditionalMode = "always";

/** Last non-custom rule condition kind (snapshot when opening Custom). */
let lastRuleConditionKind = "answer_equals";

let optionsByItemIdCache = {};

let serviceCodes = { packages: [], modules: [], addons: [] };
let serviceCodesLoaded = false;

/** Backend + seed convention for multi-select “needs” question (see survey-branching). */
const NEED_AREAS_QUESTION_CODE = "need_areas";

const NEED_CATEGORY_OPTIONS = [
  { value: "arrival_setup", label: "Arrival / initial US setup" },
  { value: "housing", label: "Housing" },
  { value: "mobility", label: "Vehicle / mobility" },
  { value: "family_school", label: "Family / school" },
  { value: "admin_business", label: "Admin / business (LLC, etc.)" },
];

function populateNeedCategorySelects() {
  const optsHtml = NEED_CATEGORY_OPTIONS.map(
    (o) => `<option value="${safeText(o.value)}">${safeText(t(`common.survey_builder.need_categories.${o.value}`, o.label))}</option>`
  ).join("");
  const qSel = qs("#questionConditionalNeedCategory");
  if (qSel) {
    qSel.innerHTML = `<option value="">${safeText(t("common.survey_builder.fields.pick_category", "— Select category —"))}</option>${optsHtml}`;
  }
  const rSel = qs("#ruleEditorNeedCategory");
  if (rSel) {
    rSel.innerHTML = `<option value="">${safeText(t("common.survey_builder.fields.pick_category", "— Select category —"))}</option>${optsHtml}`;
  }
}

function setStatus(selector, message) {
  const el = qs(selector);
  if (el) el.textContent = message;
}

function slugifyCode(raw, fallback = "item") {
  let s = String(raw ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  if (!s) s = fallback;
  if (s.length > 96) s = s.slice(0, 96);
  return s;
}

function uniqueQuestionnaireCode(base) {
  const codes = new Set(questionnaires.map((q) => q.code));
  let c = base || "survey";
  let n = 2;
  while (codes.has(c)) {
    c = `${base}_${n++}`;
  }
  return c;
}

function uniqueQuestionCode(base, excludeItemId) {
  const codes = new Set(
    questionItems.filter((it) => it.id !== excludeItemId).map((it) => it.question_code)
  );
  let c = base || "question";
  let n = 2;
  while (codes.has(c)) {
    c = `${base}_${n++}`;
  }
  return c;
}

function boolBadge(value, labelTrue, labelFalse) {
  const lt = labelTrue !== undefined ? labelTrue : t("common.status.active", "Active");
  const lf = labelFalse !== undefined ? labelFalse : t("common.status.inactive", "Inactive");
  return value
    ? `<span class="lhai-badge lhai-badge--status-active">${safeText(lt)}</span>`
    : `<span class="lhai-badge">${safeText(lf)}</span>`;
}

function jsonToString(value) {
  try {
    return JSON.stringify(value ?? {}, null, 2);
  } catch {
    return "{}";
  }
}

function tryParseJsonObject(text, fallback = {}) {
  const raw = String(text ?? "").trim();
  if (!raw) return fallback;
  try {
    const v = JSON.parse(raw);
    if (v == null || typeof v !== "object" || Array.isArray(v)) return fallback;
    return v;
  } catch (e) {
    throw new Error(`Invalid JSON: ${e?.message || String(e)}`);
  }
}

function summarizeCondition(conditionJson) {
  const obj = conditionJson && typeof conditionJson === "object" ? conditionJson : {};
  if (obj.type === "question_option_equals") {
    const qCode = obj.question_code ? String(obj.question_code) : "";
    const ov = obj.option_value ? String(obj.option_value) : "";
    const item = questionItems.find((it) => it.question_code === qCode);
    const qLabel = item ? item.label || qCode : qCode || "?";
    let valLabel = ov;
    if (item) {
      const cached = optionsByItemIdCache[item.id];
      const found = cached?.find((o) => String(o.value) === ov);
      if (found) valLabel = `${found.label} (${found.value})`;
    }
    return t("common.survey_builder.summarize.answer_equals", "IF {Q} is {V}").replace("{Q}", qLabel).replace("{V}", valLabel || "?");
  }
  if (obj.type === "needs_includes") {
    const ov = String(obj.option_value || "");
    const found = NEED_CATEGORY_OPTIONS.find((x) => x.value === ov);
    const cat = found ? t(`common.survey_builder.need_categories.${ov}`, found.label) : ov;
    return t("common.survey_builder.summarize.need_includes", "IF needs include “{cat}”").replace("{cat}", cat);
  }
  if (obj.type === "always") {
    return t("common.survey_builder.conditional.always", "Always");
  }
  try {
    const s = JSON.stringify(obj);
    if (s.length <= 48) return s;
    return s.slice(0, 45) + "...";
  } catch {
    return "-";
  }
}

function friendlyResultLabel(resultType, resultCode) {
  const rt = String(resultType || "");
  const code = String(resultCode || "");
  const typeLabel =
    rt === "package"
      ? t("common.survey_builder.result_types.package", "Package")
      : rt === "module"
        ? t("common.survey_builder.result_types.module_ai", "AI service (module)")
        : rt === "addon"
          ? t("common.survey_builder.result_types.addon_inperson", "In-person service (add-on)")
          : rt;
  const list = rt === "package" ? serviceCodes.packages : rt === "module" ? serviceCodes.modules : serviceCodes.addons;
  const found = list.find((x) => x.code === code);
  const name = found ? found.label : code;
  return `${typeLabel}: ${name}`;
}

function updateWorkspaceVisibility() {
  const ph = qs("#surveyBuilderPlaceholder");
  const ws = qs("#surveyBuilderWorkspace");
  const show =
    Boolean(selectedQuestionnaireId) ||
    isSurveyCreateMode ||
    Boolean(qs("#questionnaireEditorId")?.value?.trim());
  if (ph) ph.hidden = show;
  if (ws) ws.hidden = !show;
}

function updateWorkspaceChrome() {
  const titleEl = qs("#surveyWorkspaceTitle");
  const meta = qs("#surveyWorkspaceMeta");
  if (!titleEl) return;

  const q = questionnaires.find((x) => x.id === selectedQuestionnaireId);
  if (isSurveyCreateMode || !selectedQuestionnaireId) {
    titleEl.textContent = t("common.survey_builder.workspace.new_title", "New survey");
  } else if (q) {
    titleEl.textContent = q.name || t("common.survey_builder.heading", "Survey Builder (advanced)");
  } else {
    titleEl.textContent = "—";
  }

  if (meta) {
    const chips = [];
    if (selectedVersionId) {
      const v = versions.find((x) => x.id === selectedVersionId);
      if (v) {
        const st = String(v.status || "").toUpperCase();
        chips.push(
          `<span class="lhai-badge lhai-badge--status-active">${safeText(t("common.survey_builder.chips.version", "Version"))} v${safeText(
            v.version_number
          )}</span>`
        );
        chips.push(`<span class="lhai-badge">${safeText(st)}</span>`);
      }
    }
    meta.innerHTML = chips.join(" ");
  }
}

function renderQuestionnaireList() {
  const tbody = qs("#adminQuestionnaireTable");
  if (!tbody) return;
  if (!questionnaires.length) {
    tbody.innerHTML = `<tr><td colspan='5'>${safeText(t("common.survey_builder.empty.questionnaires", "No surveys yet"))}</td></tr>`;
    return;
  }

  const versionById = versionByIdAll || {};

  tbody.innerHTML = questionnaires
    .slice()
    .sort((a, b) => String(b.updated_at || "").localeCompare(String(a.updated_at || "")))
    .map((q) => {
      const activeVer = q.active_version_id ? versionById[q.active_version_id] : null;
      const activeVerLabel = activeVer ? `v${activeVer.version_number}` : "—";
      const isSelected = q.id === selectedQuestionnaireId;
      const updated = q.updated_at ? formatDate(q.updated_at) : "—";
      return `
        <tr data-qnr-id="${safeText(q.id)}" class="admin-survey-builder__q-row ${isSelected ? "is-selected" : ""}" tabindex="0" role="button">
          <td><strong>${safeText(q.name)}</strong></td>
          <td>${boolBadge(Boolean(q.active), t("common.status.active", "Active"), t("common.status.inactive", "Inactive"))}</td>
          <td>${safeText(updated)}</td>
          <td>${safeText(activeVerLabel)}</td>
          <td>
            <div class="admin-survey-builder__editor-actions">
              <button type="button" class="lhai-button lhai-button--primary lhai-button--compact" data-action="select" data-id="${safeText(q.id)}">${safeText(
        t("common.survey_builder.actions.open", "Open")
      )}</button>
              <button type="button" class="lhai-button lhai-button--secondary lhai-button--compact" data-action="toggle-active" data-id="${safeText(q.id)}">
                ${q.active ? t("common.survey_builder.actions.deactivate", "Deactivate") : t("common.survey_builder.actions.activate", "Activate")}
              </button>
            </div>
          </td>
        </tr>
      `;
    })
    .join("");
}

function syncQuestionnaireCodeFieldsFromHidden() {
  const hidden = qs("#questionnaireEditorCode")?.value || "";
  const vis = qs("#questionnaireEditorCodeVisible");
  if (vis && !vis.dataset.userEditing) vis.value = hidden;
}

function updateSurveyBasicsActionLabels() {
  const saveBtn = qs("#saveQuestionnaireBtn");
  const cancelBtn = qs("#clearQuestionnaireBtn");
  const questionnaireId = qs("#questionnaireEditorId")?.value?.trim() || "";
  if (saveBtn) {
    saveBtn.textContent = questionnaireId
      ? t("common.survey_builder.actions.save_survey_changes", "Save changes")
      : t("common.survey_builder.actions.create_survey", "Create survey");
  }
  if (cancelBtn) {
    const discardDraft = !questionnaireId && isSurveyCreateMode;
    cancelBtn.textContent = discardDraft
      ? t("common.survey_builder.actions.discard_new_survey", "Discard")
      : t("common.actions.cancel", "Cancel");
  }
}

function updateQuestionItemActionLabels() {
  const saveBtn = qs("#saveQuestionItemBtn");
  if (!saveBtn) return;
  const hasId = Boolean(qs("#questionItemEditorId")?.value?.trim());
  saveBtn.textContent = hasId
    ? t("common.survey_builder.actions.save_question_changes", "Save changes")
    : t("common.survey_builder.actions.add_question_confirm", "Add question");
}

function updateRuleEditorActionLabels() {
  const saveBtn = qs("#saveRuleBtn");
  if (!saveBtn) return;
  const hasId = Boolean(qs("#ruleEditorId")?.value?.trim());
  saveBtn.textContent = hasId
    ? t("common.survey_builder.actions.save_rule_changes", "Save changes")
    : t("common.survey_builder.actions.add_rule_confirm", "Add rule");
}

function fillQuestionnaireEditor(q) {
  qs("#questionnaireEditorId").value = q?.id || "";
  qs("#questionnaireEditorCode").value = q?.code || "";
  qs("#questionnaireEditorName").value = q?.name || "";
  qs("#questionnaireEditorDescription").value = q?.description || "";
  qs("#questionnaireEditorActive").checked = Boolean(q?.active);
  syncQuestionnaireCodeFieldsFromHidden();

  const v = q?.active_version_id ? versions.find((x) => x.id === q.active_version_id) : null;
  qs("#questionnaireActiveVersionDisplay").textContent = v ? `v${v.version_number}` : "—";

  const heading = qs("#questionnaireEditorHeading");
  if (heading) {
    heading.textContent = q?.id
      ? t("common.survey_builder.headings.edit_survey", "Edit survey")
      : t("common.survey_builder.headings.create_survey", "Create new survey");
  }
  updateSurveyBasicsActionLabels();
}

function resetQuestionnaireEditorForCreate() {
  isSurveyCreateMode = true;
  selectedQuestionnaireId = "";
  selectedVersionId = "";
  selectedQuestionItemId = "";
  selectedRuleId = "";
  questionItems = [];
  options = [];
  rules = [];
  versions = [];
  optionsByItemIdCache = {};

  fillQuestionnaireEditor({
    id: "",
    code: "",
    name: "",
    description: "",
    active: true,
    active_version_id: null,
  });
  qs("#questionnaireActiveVersionDisplay").textContent = "—";
  const heading = qs("#questionnaireEditorHeading");
  if (heading) heading.textContent = t("common.survey_builder.headings.create_survey", "Create new survey");
  setStatus("#questionnaireBasicStatus", t("common.survey_builder.status.create_survey_hint", "Enter a name and save to create your survey."));
  renderQuestionItems();
  renderEmbeddedOptionsTable();
  renderRuleCards();
  renderQuestionnaireList();
  setVersionActionButtonsState();
  setQuestionButtonsState();
  qs("#newRuleBtn").disabled = true;
  updateWorkspaceVisibility();
  updateWorkspaceChrome();
  updateSurveyBasicsActionLabels();
  hideQuestionEditorPanel();
}

function setVersionActionButtonsState() {
  const hasQ = Boolean(selectedQuestionnaireId);
  const hasV = Boolean(selectedVersionId);
  const selectedVersion = versions.find((v) => v.id === selectedVersionId);

  qs("#createVersionBtn").disabled = !hasQ;
  qs("#duplicateVersionBtn").disabled = !(hasQ && hasV);
  qs("#publishVersionBtn").disabled = !(hasQ && hasV);
  const canSetActive = hasQ && hasV && String(selectedVersion?.status || "").toUpperCase() === "PUBLISHED";
  qs("#setActiveVersionBtn").disabled = !canSetActive;
}

function renderVersionsTable() {
  const tbody = qs("#adminVersionTable");
  if (!tbody) return;
  if (!versions.length) {
    tbody.innerHTML = `<tr><td colspan='5'>${safeText(t("common.survey_builder.empty.versions", "No versions"))}</td></tr>`;
    return;
  }

  const activeId = questionnaires.find((q) => q.id === selectedQuestionnaireId)?.active_version_id || "";
  tbody.innerHTML = versions
    .slice()
    .sort((a, b) => a.version_number - b.version_number)
    .map((v) => {
      const isActive = Boolean(activeId && v.id === activeId);
      const isSelected = v.id === selectedVersionId;
      return `
        <tr data-ver-id="${safeText(v.id)}" class="${isSelected ? "is-selected" : ""}">
          <td><strong>${safeText(v.version_number)}</strong></td>
          <td><span class="lhai-badge">${safeText(v.status)}</span></td>
          <td>${v.published_at ? safeText(formatDate(v.published_at)) : "—"}</td>
          <td>${isActive ? boolBadge(true, t("common.survey_builder.status.live", "Live"), t("common.survey_builder.status.live", "Live")) : `<span class="lhai-help">—</span>`}</td>
          <td>
            <div class="admin-survey-builder__editor-actions">
              <button type="button" class="lhai-button lhai-button--secondary lhai-button--compact" data-action="select" data-id="${safeText(v.id)}">${safeText(
        t("common.survey_builder.actions.open_draft", "Open")
      )}</button>
            </div>
          </td>
        </tr>
      `;
    })
    .join("");
}

function renderSurveyPreviewSummary() {
  const ul = qs("#surveyPreviewSummary");
  if (!ul) return;
  if (!questionItems.length) {
    ul.innerHTML = `<li>${safeText(t("common.survey_builder.preview.no_questions", "No questions in this version yet."))}</li>`;
    return;
  }
  const sorted = questionItems.slice().sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
  ul.innerHTML = sorted
    .map((it, idx) => {
      const req = it.required ? ` (${t("common.survey_builder.fields.required", "Required")})` : "";
      return `<li><strong>${idx + 1}.</strong> ${safeText(it.label || "")} <span class="lhai-help">(${safeText(it.input_type || "text")})${req}</span></li>`;
    })
    .join("");
}

function getPriorSelectableQuestions(currentItemId) {
  const sorted = questionItems.slice().sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
  const idx = currentItemId ? sorted.findIndex((x) => x.id === currentItemId) : sorted.length;
  const slice = idx >= 0 ? sorted.slice(0, idx) : sorted;
  return slice.filter((it) => it.input_type === "select" && it.active !== false);
}

function refreshQuestionConditionalQuestionDropdown(currentItemId, selectedQuestionCode) {
  const sel = qs("#questionConditionalQuestionItemId");
  if (!sel) return;
  const priors = getPriorSelectableQuestions(currentItemId);
  sel.innerHTML = "";
  if (!priors.length) {
    sel.innerHTML = `<option value="">${safeText(t("common.survey_builder.conditional.no_prior", "— No earlier choice questions —"))}</option>`;
    return;
  }
  sel.innerHTML = priors
    .map((it) => `<option value="${safeText(it.question_code)}">${safeText(it.label || it.question_code)}</option>`)
    .join("");
  if (selectedQuestionCode) {
    const match = priors.find((p) => p.question_code === selectedQuestionCode);
    if (match) sel.value = match.question_code;
  }
}

async function refreshQuestionConditionalOptionDropdown(questionCode, selectedValue) {
  const sel = qs("#questionConditionalOptionValue");
  if (!sel) return;
  sel.innerHTML = "";
  const item = questionItems.find((it) => it.question_code === questionCode);
  if (!item) {
    sel.innerHTML = `<option value="">—</option>`;
    return;
  }
  const opts = await ensureOptionsCacheForQuestionItem(item.id);
  if (!opts.length) {
    sel.innerHTML = `<option value="">—</option>`;
    return;
  }
  sel.innerHTML = opts
    .slice()
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
    .map((o) => `<option value="${safeText(o.value)}">${safeText(o.label)} (${safeText(o.value)})</option>`)
    .join("");
  if (selectedValue) sel.value = selectedValue;
}

function applyQuestionConditionalUi(mode) {
  const match = qs("#questionConditionalBuilderMatch");
  const need = qs("#questionConditionalBuilderNeed");
  const advDetails = qs("#questionConditionalAdvancedDetails");
  if (match) match.hidden = mode !== "when_answer_equals";
  if (need) need.hidden = mode !== "needs_category";
  if (advDetails) {
    advDetails.open = mode === "custom";
  }
}

function applyConditionalModeFromJson(ruleJson) {
  const obj = ruleJson && typeof ruleJson === "object" ? ruleJson : {};
  const mode = qs("#questionConditionalMode");
  if (!mode) return;

  const currentItemId = qs("#questionItemEditorId")?.value || "";

  if (obj.type === "always" || !obj.type) {
    mode.value = "always";
    applyQuestionConditionalUi("always");
    return;
  }
  if (obj.type === "question_option_equals") {
    mode.value = "when_answer_equals";
    applyQuestionConditionalUi("when_answer_equals");
    const qCode = obj.question_code ? String(obj.question_code) : "";
    refreshQuestionConditionalQuestionDropdown(currentItemId, qCode);
    void refreshQuestionConditionalOptionDropdown(qCode, obj.option_value ? String(obj.option_value) : "");
    return;
  }
  if (obj.type === "needs_includes") {
    const qc = String(obj.question_code || "");
    if (qc === NEED_AREAS_QUESTION_CODE || qc === "need_areas") {
      mode.value = "needs_category";
      applyQuestionConditionalUi("needs_category");
      const cat = qs("#questionConditionalNeedCategory");
      if (cat) cat.value = String(obj.option_value || "");
      return;
    }
  }
  mode.value = "custom";
  applyQuestionConditionalUi("custom");
  qs("#questionEditorConditionalRuleJson").value = jsonToString(obj);
}

function buildQuestionConditionalJsonFromUi(mode) {
  if (mode === "custom") {
    return tryParseJsonObject(qs("#questionEditorConditionalRuleJson")?.value, { type: "always" });
  }
  if (mode === "when_answer_equals") {
    const qCode = qs("#questionConditionalQuestionItemId")?.value || "";
    const optVal = qs("#questionConditionalOptionValue")?.value || "";
    return { type: "question_option_equals", question_code: qCode, option_value: optVal };
  }
  if (mode === "needs_category") {
    const ov = qs("#questionConditionalNeedCategory")?.value || "";
    return { type: "needs_includes", question_code: NEED_AREAS_QUESTION_CODE, option_value: ov };
  }
  return { type: "always" };
}

function buildQuestionConditionalJson() {
  return buildQuestionConditionalJsonFromUi(qs("#questionConditionalMode")?.value || "always");
}

function renderQuestionFlowCards() {
  const container = qs("#questionFlowCards");
  if (!container) return;
  if (!selectedVersionId) {
    container.innerHTML = `<p class="lhai-help">${safeText(
      t("common.survey_builder.empty.pick_version", "Choose a draft version under Preview & publish to add questions.")
    )}</p>`;
    return;
  }
  if (!questionItems.length) {
    container.innerHTML = `<p class="lhai-help">${safeText(t("common.survey_builder.empty.questions", "No questions yet"))}</p>`;
    return;
  }

  const sorted = questionItems.slice().sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
  container.innerHTML = sorted
    .map((it) => {
      const isSelected = it.id === selectedQuestionItemId;
      const typeLabel = safeText(it.input_type || "text");
      const cond = summarizeCondition(it.conditional_rule_json || {});
      return `
        <div class="admin-survey-builder__qcard ${isSelected ? "is-selected" : ""}" data-item-id="${safeText(it.id)}">
          <div class="admin-survey-builder__qcard-head">
            <span class="admin-survey-builder__qcard-order">${(it.sort_order ?? 0) + 1}</span>
            <div class="admin-survey-builder__qcard-main">
              <div class="admin-survey-builder__qcard-title">${safeText(it.label || "")}</div>
              <div class="admin-survey-builder__qcard-meta">
                <span class="lhai-badge">${typeLabel}</span>
                ${it.required ? `<span class="lhai-badge lhai-badge--status-active">${safeText(t("common.survey_builder.badge.required", "Required"))}</span>` : ""}
                ${it.active ? boolBadge(true) : boolBadge(false)}
              </div>
              <div class="admin-survey-builder__qcard-cond">${safeText(t("common.survey_builder.preview.when", "When"))}: ${safeText(cond)}</div>
            </div>
            <div class="admin-survey-builder__qcard-actions">
              <button type="button" class="lhai-button lhai-button--secondary lhai-button--compact" data-action="edit" data-id="${safeText(it.id)}">${safeText(
        t("common.actions.edit", "Edit")
      )}</button>
              <button type="button" class="lhai-button lhai-button--secondary lhai-button--compact" data-action="toggle-active" data-id="${safeText(it.id)}">
                ${it.active ? t("common.survey_builder.actions.deactivate", "Deactivate") : t("common.survey_builder.actions.activate", "Activate")}
              </button>
              <button type="button" class="lhai-button lhai-button--secondary lhai-button--compact" data-action="move-up" data-id="${safeText(it.id)}" ${
                it.sort_order === 0 ? "disabled" : ""
              }>↑</button>
              <button type="button" class="lhai-button lhai-button--secondary lhai-button--compact" data-action="move-down" data-id="${safeText(it.id)}" ${
                it.sort_order === sorted.length - 1 ? "disabled" : ""
              }>↓</button>
            </div>
          </div>
        </div>
      `;
    })
    .join("");
}

function renderQuestionItems() {
  renderQuestionFlowCards();
  renderSurveyPreviewSummary();
}

function hideQuestionEditorPanel() {
  qs("#questionItemEditorPanel")?.setAttribute("hidden", "");
  selectedQuestionItemId = "";
}

function showQuestionEditorPanel() {
  qs("#questionItemEditorPanel")?.removeAttribute("hidden");
}

function toggleEmbeddedOptionsSection() {
  const section = qs("#embeddedOptionsSection");
  const type = qs("#questionEditorInputType")?.value || "text";
  const show = type === "select" && Boolean(selectedQuestionItemId);
  if (section) section.hidden = !show;
}

function fillQuestionItemEditor(item) {
  qs("#questionItemEditorId").value = item?.id || "";
  qs("#questionEditorSectionCode").value = item?.section_code || "basic";
  qs("#questionEditorOrder").value = item?.sort_order ?? 0;
  qs("#questionEditorQuestionCode").value = item?.question_code || "";
  qs("#questionEditorLabel").value = item?.label || "";
  qs("#questionEditorHelpText").value = item?.help_text || "";
  qs("#questionEditorInputType").value = item?.input_type || "text";
  qs("#questionEditorRequired").checked = Boolean(item?.required);
  qs("#questionEditorPlaceholder").value = item?.placeholder || "";
  qs("#questionEditorConditionalRuleJson").value = jsonToString(item?.conditional_rule_json || { type: "always" });
  qs("#questionEditorActive").checked = Boolean(item?.active);
  setStatus("#questionnaireBasicStatus", "");

  applyConditionalModeFromJson(item?.conditional_rule_json || { type: "always" });
  lastQuestionConditionalMode = qs("#questionConditionalMode")?.value || "always";

  const conditionalSummary = summarizeCondition(item?.conditional_rule_json || {});
  qs("#questionPreviewConditional").textContent = `${t("common.survey_builder.preview.when", "When")}: ${conditionalSummary}`;

  qs("#questionPreviewBody").textContent = `${t("common.survey_builder.preview.label", "Label")}: ${item?.label || "—"} | ${t(
    "common.survey_builder.fields.input_type",
    "Answer type"
  )}: ${item?.input_type || "—"} | ${t("common.survey_builder.fields.required", "Required")}: ${
    item?.required ? t("common.survey_builder.bool.yes", "Yes") : t("common.survey_builder.bool.no", "No")
  }`;

  const qh = qs("#questionItemEditorHeading");
  if (qh) {
    qh.textContent = item?.id
      ? t("common.survey_builder.headings.edit_question", "Edit question")
      : t("common.survey_builder.headings.create_question", "New question");
  }
  toggleEmbeddedOptionsSection();
  updateQuestionItemActionLabels();
}

function resetQuestionItemEditorForCreate() {
  fillQuestionItemEditor({
    id: "",
    section_code: "basic",
    sort_order: questionItems.length,
    question_code: "",
    label: "",
    help_text: "",
    input_type: "text",
    placeholder: "",
    required: false,
    conditional_rule_json: { type: "always" },
    active: true,
  });
  qs("#questionConditionalMode").value = "always";
  lastQuestionConditionalMode = "always";
  applyQuestionConditionalUi("always");
  refreshQuestionConditionalQuestionDropdown("", "");
  setStatus("#versionActionStatus", "");
}

function setQuestionButtonsState() {
  qs("#newQuestionItemBtn").disabled = !Boolean(selectedVersionId);
}

function renderEmbeddedOptionsTable() {
  const tbody = qs("#embeddedOptionTable");
  if (!tbody) return;
  if (!selectedQuestionItemId) {
    tbody.innerHTML = `<tr><td colspan='4'>${safeText(t("common.survey_builder.empty.select_question_for_options", "Save the question first to add choices."))}</td></tr>`;
    return;
  }
  if (!options.length) {
    tbody.innerHTML = `<tr><td colspan='4'>${safeText(t("common.survey_builder.empty.options", "No choices yet"))}</td></tr>`;
    return;
  }

  const sorted = options.slice().sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
  tbody.innerHTML = sorted
    .map((opt) => {
      const isEditing = opt.id === qs("#questionOptionEditorId")?.value;
      const idx = sorted.findIndex((x) => x.id === opt.id);
      return `
        <tr data-option-id="${safeText(opt.id)}" class="${isEditing ? "is-selected" : ""}">
          <td>${safeText(opt.sort_order ?? 0)}</td>
          <td><code>${safeText(opt.value || "")}</code></td>
          <td>${safeText(opt.label || "")}</td>
          <td>
            <div class="admin-survey-builder__editor-actions">
              <button type="button" class="lhai-button lhai-button--secondary lhai-button--compact" data-action="edit" data-id="${safeText(opt.id)}">${safeText(
        t("common.actions.edit", "Edit")
      )}</button>
              <button type="button" class="lhai-button lhai-button--secondary lhai-button--compact" data-action="move-up" data-id="${safeText(opt.id)}" ${idx === 0 ? "disabled" : ""}>↑</button>
              <button type="button" class="lhai-button lhai-button--secondary lhai-button--compact" data-action="move-down" data-id="${safeText(opt.id)}" ${
                idx === sorted.length - 1 ? "disabled" : ""
              }>↓</button>
              <button type="button" class="lhai-button lhai-button--secondary lhai-button--compact" data-action="delete" data-id="${safeText(opt.id)}">${safeText(
        t("common.actions.delete", "Delete")
      )}</button>
            </div>
          </td>
        </tr>
      `;
    })
    .join("");
}

function fillOptionEditor(opt) {
  qs("#questionOptionEditorId").value = opt?.id || "";
  qs("#optionEditorOrder").value = opt?.sort_order ?? 0;
  qs("#optionEditorValue").value = opt?.value || "";
  qs("#optionEditorLabel").value = opt?.label || "";
  qs("#deleteOptionBtn").disabled = !Boolean(opt?.id);
}

function resetOptionEditorForCreate() {
  fillOptionEditor({
    id: "",
    sort_order: options.length,
    value: "",
    label: "",
  });
}

function applyRuleConditionUi(kind) {
  const ans = qs("#ruleConditionAnswerBuilder");
  const need = qs("#ruleConditionNeedBuilder");
  const det = qs("#ruleConditionAdvancedDetails");
  if (ans) ans.hidden = kind !== "answer_equals";
  if (need) need.hidden = kind !== "need_includes";
  if (det) det.open = kind === "custom";
}

function renderRuleCards() {
  const container = qs("#adminRuleCards");
  if (!container) return;
  if (!rules.length) {
    container.innerHTML = `<p class="lhai-help">${safeText(t("common.survey_builder.empty.rules", "No rules yet"))}</p>`;
    return;
  }

  const sorted = rules.slice().sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));
  container.innerHTML = sorted
    .map((r) => {
      const isSelected = r.id === selectedRuleId;
      const thenLabel = friendlyResultLabel(r.result_type, r.result_code);
      const ifText = summarizeCondition(r.condition_json);
      const idx = sorted.findIndex((x) => x.id === r.id);
      return `
        <div class="admin-survey-builder__rule-card ${isSelected ? "is-selected" : ""}" data-rule-id="${safeText(r.id)}" role="group">
          <div class="admin-survey-builder__rule-card__body">
            <div class="admin-survey-builder__rule-card__if">
              <span class="admin-survey-builder__rule-card__tag">${safeText(t("common.survey_builder.rule.if_tag", "If"))}</span>
              <span class="admin-survey-builder__rule-card__text">${safeText(ifText)}</span>
            </div>
            <div class="admin-survey-builder__rule-card__then">
              <span class="admin-survey-builder__rule-card__tag">${safeText(t("common.survey_builder.rule.then_tag", "Then"))}</span>
              <span class="admin-survey-builder__rule-card__text">${safeText(thenLabel)}</span>
            </div>
            <div class="admin-survey-builder__rule-card__meta">
              <span class="lhai-help">#${safeText(String(r.priority ?? 0))}</span>
              ${r.active ? boolBadge(true) : boolBadge(false)}
            </div>
          </div>
          <div class="admin-survey-builder__rule-card__actions">
            <button type="button" class="lhai-button lhai-button--secondary lhai-button--compact" data-action="edit" data-id="${safeText(r.id)}">${safeText(
        t("common.actions.edit", "Edit")
      )}</button>
            <button type="button" class="lhai-button lhai-button--secondary lhai-button--compact" data-action="toggle-active" data-id="${safeText(r.id)}">
              ${r.active ? t("common.survey_builder.actions.deactivate", "Deactivate") : t("common.survey_builder.actions.activate", "Activate")}
            </button>
            <button type="button" class="lhai-button lhai-button--secondary lhai-button--compact" data-action="move-up" data-id="${safeText(r.id)}" ${idx === 0 ? "disabled" : ""}>↑</button>
            <button type="button" class="lhai-button lhai-button--secondary lhai-button--compact" data-action="move-down" data-id="${safeText(r.id)}" ${idx === sorted.length - 1 ? "disabled" : ""}>↓</button>
          </div>
        </div>
      `;
    })
    .join("");
}

function fillRuleEditor(rule) {
  qs("#ruleEditorId").value = rule?.id || "";
  qs("#ruleEditorPriority").value = rule?.priority ?? 0;
  qs("#ruleEditorActive").checked = Boolean(rule?.active);

  const resultType = rule?.result_type || "package";
  qs("#ruleEditorResultType").value = resultType;
  refreshRuleResultCodeOptions(resultType, rule?.result_code || "");

  const cond = rule?.condition_json || {};
  if (cond && typeof cond === "object" && cond.type === "question_option_equals") {
    qs("#ruleEditorConditionKind").value = "answer_equals";
    refreshSimpleConditionQuestionOptions();
    const qCode = cond.question_code ? String(cond.question_code) : "";
    const optValue = cond.option_value ? String(cond.option_value) : "";
    const qItem = questionItems.find((it) => it.question_code === qCode);
    if (qItem) {
      qs("#ruleEditorConditionQuestionItemId").value = qItem.id;
      refreshSimpleConditionOptionOptions(qItem.id, optValue);
      applyRuleConditionUi("answer_equals");
    } else {
      qs("#ruleEditorConditionKind").value = "custom";
      qs("#ruleEditorConditionJson").value = jsonToString(cond);
      applyRuleConditionUi("custom");
    }
  } else if (cond && typeof cond === "object" && cond.type === "needs_includes") {
    const qc = String(cond.question_code || "");
    if (qc === NEED_AREAS_QUESTION_CODE || qc === "need_areas") {
      qs("#ruleEditorConditionKind").value = "need_includes";
      const sel = qs("#ruleEditorNeedCategory");
      if (sel) sel.value = String(cond.option_value || "");
      applyRuleConditionUi("need_includes");
    } else {
      qs("#ruleEditorConditionKind").value = "custom";
      qs("#ruleEditorConditionJson").value = jsonToString(cond);
      applyRuleConditionUi("custom");
    }
  } else {
    qs("#ruleEditorConditionKind").value = "custom";
    qs("#ruleEditorConditionJson").value = jsonToString(cond);
    applyRuleConditionUi("custom");
  }

  setStatus("#ruleActionStatus", "");

  const rh = qs("#ruleEditorHeading");
  if (rh) {
    rh.textContent = rule?.id
      ? t("common.survey_builder.headings.edit_rule", "Edit rule")
      : t("common.survey_builder.headings.create_rule", "New rule");
  }
  lastRuleConditionKind = qs("#ruleEditorConditionKind")?.value || "answer_equals";
  updateRuleEditorActionLabels();
}

function resetRuleEditorForCreate() {
  qs("#ruleEditorId").value = "";
  qs("#ruleEditorPriority").value = rules.length ? rules.length : 0;
  qs("#ruleEditorActive").checked = true;
  qs("#ruleEditorResultType").value = "package";
  refreshRuleResultCodeOptions("package", "");
  qs("#ruleEditorConditionKind").value = "answer_equals";
  refreshSimpleConditionQuestionOptions();
  qs("#ruleEditorConditionQuestionItemId").selectedIndex = 0;
  const firstQ = questionItems[0];
  if (firstQ) refreshSimpleConditionOptionOptions(firstQ.id, "");
  applyRuleConditionUi("answer_equals");
  lastRuleConditionKind = "answer_equals";
  setStatus("#ruleActionStatus", t("common.survey_builder.status.new_rule_hint", "Add a new recommendation rule."));
  const rh = qs("#ruleEditorHeading");
  if (rh) rh.textContent = t("common.survey_builder.headings.create_rule", "New rule");
  updateRuleEditorActionLabels();
}

function refreshRuleResultCodeOptions(resultType, selectedCode = "") {
  const select = qs("#ruleEditorResultCode");
  if (!select) return;
  select.innerHTML = "";
  const list = resultType === "package" ? serviceCodes.packages : resultType === "module" ? serviceCodes.modules : serviceCodes.addons;
  if (!list.length) {
    select.innerHTML = "<option value=''>-</option>";
    return;
  }
  select.innerHTML = list.map((x) => `<option value="${safeText(x.code)}">${safeText(x.label)}</option>`).join("");
  if (selectedCode) select.value = selectedCode;
}

function refreshSimpleConditionQuestionOptions() {
  const select = qs("#ruleEditorConditionQuestionItemId");
  if (!select) return;
  select.innerHTML = "";
  if (!questionItems.length) {
    select.innerHTML = "<option value=''>-</option>";
    return;
  }
  select.innerHTML = questionItems
    .slice()
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
    .map((it) => `<option value="${safeText(it.id)}">${safeText(it.label || it.question_code)}</option>`)
    .join("");
}

function buildRuleConditionJsonFromKind(kind) {
  if (kind === "custom") {
    return tryParseJsonObject(qs("#ruleEditorConditionJson")?.value, {});
  }
  if (kind === "answer_equals") {
    const qItemId = qs("#ruleEditorConditionQuestionItemId").value;
    const optionValue = qs("#ruleEditorConditionOptionValue").value;
    const item = questionItems.find((x) => x.id === qItemId);
    return {
      type: "question_option_equals",
      question_code: item?.question_code || "",
      option_value: optionValue || "",
    };
  }
  if (kind === "need_includes") {
    return {
      type: "needs_includes",
      question_code: NEED_AREAS_QUESTION_CODE,
      option_value: qs("#ruleEditorNeedCategory").value || "",
    };
  }
  return {};
}

function refreshSimpleConditionOptionOptions(questionItemId, selectedOptionValue = "") {
  const select = qs("#ruleEditorConditionOptionValue");
  if (!select) return;
  select.innerHTML = "";
  if (!questionItemId) {
    select.innerHTML = "<option value=''>-</option>";
    return;
  }
  const opts = optionsByItemIdCache[questionItemId] || [];
  if (!opts.length) {
    select.innerHTML = "<option value=''>-</option>";
    return;
  }
  select.innerHTML = opts
    .slice()
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
    .map((opt) => `<option value="${safeText(opt.value)}">${safeText(opt.label)} (${safeText(opt.value)})</option>`)
    .join("");
  if (selectedOptionValue) select.value = selectedOptionValue;
}

async function ensureOptionsCacheForQuestionItem(questionItemId) {
  if (!questionItemId) return [];
  if (optionsByItemIdCache[questionItemId]) return optionsByItemIdCache[questionItemId];
  const list = await surveyBuilderAdminApi.listQuestionOptions(questionItemId);
  optionsByItemIdCache[questionItemId] = list || [];
  return optionsByItemIdCache[questionItemId];
}

async function ensureServiceCodesLoaded() {
  if (serviceCodesLoaded) return;
  serviceCodesLoaded = true;
  try {
    const pkgs = await serviceCatalogAdminApi.listPackages(true, null);
    serviceCodes.packages = pkgs.map((p) => ({ code: p.code, label: `${p.name} (${p.code})` }));

    const modsLists = await Promise.all(
      pkgs.map((p) => serviceCatalogAdminApi.listModulesByPackage(p.id, true).catch(() => []))
    );
    const addonsLists = await Promise.all(
      pkgs.map((p) => serviceCatalogAdminApi.listAddonsByPackage(p.id, true).catch(() => []))
    );
    serviceCodes.modules = modsLists
      .flat()
      .map((m) => ({ code: m.code, label: `${m.name} (${m.code})` }));
    serviceCodes.addons = addonsLists
      .flat()
      .map((a) => ({ code: a.code, label: `${a.name} (${a.code})` }));
  } catch {
    // keep empty; UI will show '-' options
  }
}

async function refreshQuestionnaireTable() {
  setStatus("#adminQuestionnaireStatus", t("common.survey_builder.status.loading_questionnaires", "Loading questionnaires..."));
  questionnaires = await surveyBuilderAdminApi.listQuestionnaires(true);

  const versionLists = await Promise.all(
    questionnaires.map((q) => surveyBuilderAdminApi.listQuestionnaireVersions(q.id).catch(() => []))
  );
  versionByIdAll = {};
  versionLists.forEach((list) => {
    list.forEach((v) => {
      versionByIdAll[v.id] = v;
    });
  });

  if (selectedQuestionnaireId) {
    const idx = questionnaires.findIndex((q) => q.id === selectedQuestionnaireId);
    versions = idx >= 0 ? versionLists[idx] : [];
  } else {
    versions = [];
  }

  renderQuestionnaireList();
  setStatus(
    "#adminQuestionnaireStatus",
    t("common.survey_builder.status.questionnaire_count", "{count} survey(s)").replace("{count}", String(questionnaires.length))
  );
}

function upsertVersionByIdAll(versionList) {
  if (!versionList || !Array.isArray(versionList)) return;
  versionList.forEach((v) => {
    if (v?.id) versionByIdAll[v.id] = v;
  });
}

async function loadQuestionnaireContext(questionnaireId) {
  isSurveyCreateMode = false;
  selectedQuestionnaireId = questionnaireId;
  selectedVersionId = "";
  selectedQuestionItemId = "";
  selectedRuleId = "";
  questionItems = [];
  options = [];
  rules = [];
  optionsByItemIdCache = {};

  setStatus("#adminQuestionnaireStatus", t("common.survey_builder.status.loading_versions", "Loading versions..."));
  versions = await surveyBuilderAdminApi.listQuestionnaireVersions(questionnaireId);
  renderQuestionnaireList();
  renderVersionsTable();
  renderQuestionItems();
  renderEmbeddedOptionsTable();
  renderRuleCards();
  renderSurveyPreviewSummary();
  setVersionActionButtonsState();
  updateWorkspaceVisibility();
  updateWorkspaceChrome();

  const q = questionnaires.find((x) => x.id === questionnaireId);
  fillQuestionnaireEditor(q);

  if (q?.active_version_id) {
    selectedVersionId = q.active_version_id;
    renderVersionsTable();
    await loadVersionContext(selectedVersionId);
  } else {
    setQuestionButtonsState();
    setVersionActionButtonsState();
    qs("#newRuleBtn").disabled = true;
    hideQuestionEditorPanel();
  }

  setStatus("#versionActionStatus", t("common.survey_builder.status.version_hint", "Select a survey and version to enable actions."));
}

async function loadVersionContext(versionId) {
  const preservedQuestionItemId = selectedQuestionItemId;
  const preservedRuleId = selectedRuleId;

  selectedVersionId = versionId;
  optionsByItemIdCache = {};

  questionItems = await surveyBuilderAdminApi.listQuestionItems(versionId);
  rules = await surveyBuilderAdminApi.listRecommendationRules(versionId, false);

  renderQuestionItems();
  renderRuleCards();
  refreshSimpleConditionQuestionOptions();
  renderSurveyPreviewSummary();

  await ensureServiceCodesLoaded();
  renderRuleCards();

  if (preservedQuestionItemId && questionItems.some((x) => x.id === preservedQuestionItemId)) {
    await selectQuestionItem(preservedQuestionItemId);
  } else {
    selectedQuestionItemId = "";
    options = [];
    renderEmbeddedOptionsTable();
    resetOptionEditorForCreate();
  }

  if (preservedRuleId && rules.some((x) => x.id === preservedRuleId)) {
    await selectRule(preservedRuleId);
  } else {
    selectedRuleId = "";
    resetRuleEditorForCreate();
    if (questionItems[0]) {
      await ensureOptionsCacheForQuestionItem(questionItems[0].id);
      refreshSimpleConditionOptionOptions(questionItems[0].id, "");
    }
  }

  qs("#newRuleBtn").disabled = !selectedVersionId;
  setQuestionButtonsState();
  setVersionActionButtonsState();
  setRuleResultTypeFromSelection();
  updateWorkspaceChrome();
}

function setRuleResultTypeFromSelection() {
  const resultType = qs("#ruleEditorResultType")?.value || "package";
  refreshRuleResultCodeOptions(resultType, qs("#ruleEditorResultCode")?.value || "");
}

async function selectQuestionItem(itemId) {
  selectedQuestionItemId = itemId;
  const item = questionItems.find((x) => x.id === itemId);
  fillQuestionItemEditor(item);
  options = await ensureOptionsCacheForQuestionItem(itemId);
  renderEmbeddedOptionsTable();
  resetOptionEditorForCreate();
  showQuestionEditorPanel();

  const selectedQInRule = qs("#ruleEditorConditionQuestionItemId")?.value;
  if (selectedQInRule === itemId) {
    refreshSimpleConditionOptionOptions(itemId, qs("#ruleEditorConditionOptionValue")?.value || "");
  }
}

async function selectRule(ruleId) {
  selectedRuleId = ruleId;
  const rule = rules.find((x) => x.id === ruleId);
  if (!rule) return;

  fillRuleEditor(rule);

  const cond = rule?.condition_json || {};
  if (qs("#ruleEditorConditionKind").value === "answer_equals" && cond?.type === "question_option_equals") {
    const qCode = cond.question_code ? String(cond.question_code) : "";
    const optValue = cond.option_value ? String(cond.option_value) : "";
    const qItem = questionItems.find((it) => it.question_code === qCode);
    if (qItem) {
      await ensureOptionsCacheForQuestionItem(qItem.id);
      refreshSimpleConditionOptionOptions(qItem.id, optValue);
      qs("#ruleEditorConditionQuestionItemId").value = qItem.id;
    }
  }
}

async function cloneVersionAndSelect(prevVersionId) {
  const questionnaireId = selectedQuestionnaireId;
  if (!questionnaireId || !prevVersionId) return;

  setStatus("#versionActionStatus", t("common.survey_builder.status.duplicating", "Duplicating version…"));

  const createdVersion = await surveyBuilderAdminApi.createQuestionnaireVersion(questionnaireId, null);
  const newVersionId = createdVersion.id;

  const prevItems = await surveyBuilderAdminApi.listQuestionItems(prevVersionId);
  const prevItemsSorted = prevItems.slice().sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
  for (const prevItem of prevItemsSorted) {
    const createdItem = await surveyBuilderAdminApi.createQuestionItem(newVersionId, {
      questionnaire_version_id: newVersionId,
      section_code: prevItem.section_code,
      question_code: prevItem.question_code,
      label: prevItem.label,
      help_text: prevItem.help_text || "",
      input_type: prevItem.input_type || "text",
      placeholder: prevItem.placeholder || "",
      required: Boolean(prevItem.required),
      sort_order: prevItem.sort_order ?? 0,
      conditional_rule_json: prevItem.conditional_rule_json || {},
      active: Boolean(prevItem.active),
    });

    const prevOpts = await surveyBuilderAdminApi.listQuestionOptions(prevItem.id);
    const prevOptsSorted = prevOpts.slice().sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
    for (const prevOpt of prevOptsSorted) {
      await surveyBuilderAdminApi.createQuestionOption(createdItem.id, {
        question_item_id: createdItem.id,
        value: prevOpt.value,
        label: prevOpt.label,
        sort_order: prevOpt.sort_order ?? 0,
      });
    }
  }

  const prevRules = await surveyBuilderAdminApi.listRecommendationRules(prevVersionId, false);
  const prevRulesSorted = prevRules.slice().sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));
  for (const prevRule of prevRulesSorted) {
    await surveyBuilderAdminApi.createRecommendationRule(newVersionId, {
      questionnaire_version_id: newVersionId,
      condition_json: prevRule.condition_json || {},
      result_type: prevRule.result_type || "package",
      result_code: prevRule.result_code,
      priority: prevRule.priority ?? 0,
      active: Boolean(prevRule.active),
    });
  }

  setStatus("#versionActionStatus", t("common.survey_builder.status.clone_done", "Reloading…"));
  versions = await surveyBuilderAdminApi.listQuestionnaireVersions(questionnaireId);
  upsertVersionByIdAll(versions);
  selectedVersionId = newVersionId;
  renderVersionsTable();
  await loadVersionContext(newVersionId);
  setVersionActionButtonsState();
}

function computeReorderedIds(currentList, selectedId, desiredIndex) {
  const sorted = currentList.slice().sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
  const ids = sorted.map((x) => x.id);
  const idx = ids.indexOf(selectedId);
  if (idx < 0) return ids;

  const clamped = Math.max(0, Math.min(ids.length - 1, desiredIndex));
  ids.splice(idx, 1);
  ids.splice(clamped, 0, selectedId);
  return ids;
}

async function initAdminSurveyBuilderPage() {
  if (!protectCurrentPage()) return;
  if (!ensureAdminAccess()) return;
  const isExplicitlyEnabled = new URLSearchParams(window.location.search).get("enable_survey_builder") === "1";
  if (!isExplicitlyEnabled) {
    // Survey Builder is removed from the admin workflow.
    window.location.replace("admin-services.html");
    return;
  }
  await loadSidebar("#sidebar", "admin");
  await initCommonI18nAndApplyDom(document);
  populateNeedCategorySelects();

  const tabsRoot = qs("#surveyBuilderTabs");
  const panelsRoot = qs(".admin-services__tab-panels");
  mountTabs(tabsRoot, panelsRoot, { defaultPanelId: "panel-basics" });

  qs("#surveyBuilderPlaceholder")?.removeAttribute("hidden");
  qs("#surveyBuilderWorkspace")?.setAttribute("hidden", "");

  isSurveyCreateMode = false;
  selectedQuestionnaireId = "";
  qs("#questionnaireEditorId").value = "";
  fillQuestionnaireEditor({
    id: "",
    code: "",
    name: "",
    description: "",
    active: true,
    active_version_id: null,
  });
  updateWorkspaceVisibility();

  setVersionActionButtonsState();
  renderQuestionItems();
  renderEmbeddedOptionsTable();
  renderRuleCards();

  await refreshQuestionnaireTable();

  updateQuestionItemActionLabels();
  updateRuleEditorActionLabels();

  qs("#newSurveyBtn")?.addEventListener("click", () => {
    resetQuestionnaireEditorForCreate();
    applyI18nToDom(document);
    updateSurveyBasicsActionLabels();
  });

  qs("#toggleQuestionnaireAdvancedBtn")?.addEventListener("click", () => {
    const adv = qs("#questionnaireCodeAdvanced");
    if (!adv) return;
    const show = adv.hidden;
    adv.hidden = !show;
    if (show) {
      syncQuestionnaireCodeFieldsFromHidden();
      qs("#questionnaireEditorCodeVisible")?.focus();
    }
  });

  qs("#questionnaireEditorCodeVisible")?.addEventListener("input", () => {
    const vis = qs("#questionnaireEditorCodeVisible");
    qs("#questionnaireEditorCode").value = vis?.value?.trim() || "";
  });

  qs("#adminQuestionnaireTable")?.addEventListener("click", async (event) => {
    const btn = event.target.closest("button[data-action]");
    if (btn) {
      const action = btn.getAttribute("data-action");
      const id = btn.getAttribute("data-id") || "";
      if (!id) return;

      if (action === "select") {
        await loadQuestionnaireContext(id);
        applyI18nToDom(document);
      } else if (action === "toggle-active") {
        const q = questionnaires.find((x) => x.id === id);
        const next = !Boolean(q?.active);
        await surveyBuilderAdminApi.setQuestionnaireActivation(id, next);
        await refreshQuestionnaireTable();
        if (selectedQuestionnaireId === id) {
          const updated = await surveyBuilderAdminApi.getQuestionnaire(id);
          fillQuestionnaireEditor(updated);
        }
      }
      return;
    }
    const row = event.target.closest("tr[data-qnr-id]");
    if (row) {
      const id = row.getAttribute("data-qnr-id") || "";
      if (id) {
        await loadQuestionnaireContext(id);
        applyI18nToDom(document);
      }
    }
  });

  qs("#questionnaireEditorForm")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const questionnaireId = qs("#questionnaireEditorId").value.trim();

    const name = qs("#questionnaireEditorName").value.trim();
    const advVisible = qs("#questionnaireCodeAdvanced") && !qs("#questionnaireCodeAdvanced").hidden;
    let code = qs("#questionnaireEditorCode").value.trim();
    if (!code || (!questionnaireId && !advVisible)) {
      code = uniqueQuestionnaireCode(slugifyCode(name, "survey"));
    }
    qs("#questionnaireEditorCode").value = code;

    const payload = {
      code,
      name,
      description: qs("#questionnaireEditorDescription").value || "",
      active: Boolean(qs("#questionnaireEditorActive").checked),
    };
    if (!payload.name) {
      setStatus("#questionnaireBasicStatus", t("common.survey_builder.status.name_required", "Survey name is required."));
      return;
    }

    try {
      if (questionnaireId) {
        await surveyBuilderAdminApi.updateQuestionnaire(questionnaireId, payload);
        setStatus("#questionnaireBasicStatus", t("common.survey_builder.status.survey_updated", "Survey saved."));
        updateSurveyBasicsActionLabels();
      } else {
        const created = await surveyBuilderAdminApi.createQuestionnaire(payload);
        setStatus("#questionnaireBasicStatus", t("common.survey_builder.status.survey_created", "Survey created."));
        isSurveyCreateMode = false;
        await refreshQuestionnaireTable();
        await loadQuestionnaireContext(created.id);
      }
      questionnaires = await surveyBuilderAdminApi.listQuestionnaires(true);
      renderQuestionnaireList();
      updateWorkspaceChrome();
    } catch (err) {
      setStatus("#questionnaireBasicStatus", `Error: ${err?.message || err}`);
    }
  });

  qs("#clearQuestionnaireBtn")?.addEventListener("click", () => {
    if (isSurveyCreateMode || !qs("#questionnaireEditorId").value.trim()) {
      isSurveyCreateMode = false;
      selectedQuestionnaireId = "";
      qs("#questionnaireEditorId").value = "";
      updateWorkspaceVisibility();
      updateWorkspaceChrome();
      void refreshQuestionnaireTable();
      return;
    }
    const q = questionnaires.find((x) => x.id === selectedQuestionnaireId);
    if (q) fillQuestionnaireEditor(q);
  });

  qs("#createVersionBtn")?.addEventListener("click", async () => {
    if (!selectedQuestionnaireId) return;
    const raw = qs("#createVersionNumber").value;
    const versionNumber = raw === "" || raw == null ? null : Number(raw);
    setStatus("#versionActionStatus", t("common.survey_builder.status.creating_version", "Creating version…"));
    try {
      const created = await surveyBuilderAdminApi.createQuestionnaireVersion(selectedQuestionnaireId, versionNumber);
      versions = await surveyBuilderAdminApi.listQuestionnaireVersions(selectedQuestionnaireId);
      upsertVersionByIdAll(versions);
      selectedVersionId = created.id;
      renderVersionsTable();
      await loadVersionContext(created.id);
      setVersionActionButtonsState();
      setStatus("#versionActionStatus", t("common.survey_builder.status.version_created", "Draft version created."));
    } catch (err) {
      setStatus("#versionActionStatus", `Error: ${err?.message || err}`);
    }
  });

  qs("#duplicateVersionBtn")?.addEventListener("click", async () => {
    if (!selectedVersionId) return;
    await cloneVersionAndSelect(selectedVersionId);
  });

  qs("#publishVersionBtn")?.addEventListener("click", async () => {
    if (!selectedQuestionnaireId || !selectedVersionId) return;
    setStatus("#versionActionStatus", t("common.survey_builder.status.publishing", "Publishing…"));
    try {
      await surveyBuilderAdminApi.publishQuestionnaireVersion(selectedQuestionnaireId, selectedVersionId);
      versions = await surveyBuilderAdminApi.listQuestionnaireVersions(selectedQuestionnaireId);
      upsertVersionByIdAll(versions);
      renderVersionsTable();
      await loadVersionContext(selectedVersionId);
      setVersionActionButtonsState();
      setStatus("#versionActionStatus", t("common.survey_builder.status.published", "Published."));
    } catch (err) {
      setStatus("#versionActionStatus", `Error: ${err?.message || err}`);
    }
  });

  qs("#setActiveVersionBtn")?.addEventListener("click", async () => {
    if (!selectedQuestionnaireId || !selectedVersionId) return;
    setStatus("#versionActionStatus", t("common.survey_builder.status.setting_active", "Updating live version…"));
    try {
      await surveyBuilderAdminApi.setActiveQuestionnaireVersion(selectedQuestionnaireId, selectedVersionId);
      questionnaires = await surveyBuilderAdminApi.listQuestionnaires(true);
      const updated = questionnaires.find((x) => x.id === selectedQuestionnaireId);
      fillQuestionnaireEditor(updated);
      setStatus("#versionActionStatus", t("common.survey_builder.status.active_set", "Live version updated."));
      renderQuestionnaireList();
      versions = await surveyBuilderAdminApi.listQuestionnaireVersions(selectedQuestionnaireId);
      upsertVersionByIdAll(versions);
      renderVersionsTable();
      setVersionActionButtonsState();
    } catch (err) {
      setStatus("#versionActionStatus", `Error: ${err?.message || err}`);
    }
  });

  qs("#adminVersionTable")?.addEventListener("click", async (event) => {
    const btn = event.target.closest("button[data-action]");
    if (!btn) return;
    const action = btn.getAttribute("data-action");
    const id = btn.getAttribute("data-id") || "";
    if (action === "select" && id) {
      selectedVersionId = id;
      setStatus("#versionActionStatus", "");
      await loadVersionContext(id);
      renderVersionsTable();
      setVersionActionButtonsState();
    }
  });

  qs("#questionFlowCards")?.addEventListener("click", async (event) => {
    const btn = event.target.closest("button[data-action]");
    if (!btn) return;
    const action = btn.getAttribute("data-action");
    const id = btn.getAttribute("data-id") || "";
    if (!id) return;
    const currentList = questionItems.slice().sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));

    if (action === "edit") {
      await selectQuestionItem(id);
      resetOptionEditorForCreate();
      setStatus("#optionActionStatus", "");
      return;
    }

    if (action === "toggle-active") {
      const item = questionItems.find((x) => x.id === id);
      await surveyBuilderAdminApi.setQuestionItemActivation(id, !Boolean(item?.active));
      await loadVersionContext(selectedVersionId);
      return;
    }

    if (action === "move-up" || action === "move-down") {
      const sorted = currentList;
      const idx = sorted.findIndex((x) => x.id === id);
      if (idx < 0) return;
      const targetIdx = action === "move-up" ? idx - 1 : idx + 1;
      if (targetIdx < 0 || targetIdx >= sorted.length) return;
      const ids = sorted.map((x) => x.id);
      const tmp = ids[idx];
      ids[idx] = ids[targetIdx];
      ids[targetIdx] = tmp;
      await surveyBuilderAdminApi.reorderQuestionItems(selectedVersionId, ids);
      await loadVersionContext(selectedVersionId);
      setQuestionButtonsState();
    }
  });

  qs("#questionConditionalMode")?.addEventListener("change", async () => {
    const mode = qs("#questionConditionalMode").value;
    if (mode === "custom") {
      qs("#questionEditorConditionalRuleJson").value = jsonToString(buildQuestionConditionalJsonFromUi(lastQuestionConditionalMode));
    }
    applyQuestionConditionalUi(mode);
    if (mode === "when_answer_equals") {
      refreshQuestionConditionalQuestionDropdown(qs("#questionItemEditorId")?.value || "", "");
      const qCode = qs("#questionConditionalQuestionItemId")?.value || "";
      await refreshQuestionConditionalOptionDropdown(qCode, "");
    }
    lastQuestionConditionalMode = mode === "custom" ? lastQuestionConditionalMode : mode;
  });

  qs("#questionConditionalQuestionItemId")?.addEventListener("change", async () => {
    const qCode = qs("#questionConditionalQuestionItemId")?.value || "";
    await refreshQuestionConditionalOptionDropdown(qCode, "");
  });

  qs("#questionEditorInputType")?.addEventListener("change", () => {
    toggleEmbeddedOptionsSection();
  });

  qs("#newQuestionItemBtn")?.addEventListener("click", () => {
    resetQuestionItemEditorForCreate();
    selectedQuestionItemId = "";
    qs("#questionItemEditorId").value = "";
    showQuestionEditorPanel();
    setStatus("#optionActionStatus", "");
    refreshQuestionConditionalQuestionDropdown("", "");
  });

  qs("#clearQuestionItemBtn")?.addEventListener("click", () => {
    resetQuestionItemEditorForCreate();
    hideQuestionEditorPanel();
  });

  qs("#questionItemForm")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!selectedVersionId) return;

    const itemId = qs("#questionItemEditorId").value.trim();
    const desiredOrder = Number(qs("#questionEditorOrder").value ?? 0);
    const conditionalRuleJson = buildQuestionConditionalJson();
    if (
      conditionalRuleJson?.type === "question_option_equals" &&
      (!conditionalRuleJson.question_code || String(conditionalRuleJson.option_value ?? "").length === 0)
    ) {
      setStatus(
        "#versionActionStatus",
        t("common.survey_builder.status.conditional_incomplete", "Choose a previous question and a matching choice, or switch to Always show.")
      );
      return;
    }
    if (
      conditionalRuleJson?.type === "needs_includes" &&
      (!conditionalRuleJson.option_value || String(conditionalRuleJson.option_value).trim().length === 0)
    ) {
      setStatus(
        "#versionActionStatus",
        t("common.survey_builder.status.need_category_required", "Select a need category, or switch to Always show.")
      );
      return;
    }

    let questionCode = qs("#questionEditorQuestionCode").value.trim();
    const label = qs("#questionEditorLabel").value.trim();
    if (!questionCode) {
      questionCode = uniqueQuestionCode(slugifyCode(label, "question"), itemId || null);
    }
    qs("#questionEditorQuestionCode").value = questionCode;

    const payloadBase = {
      section_code: qs("#questionEditorSectionCode").value.trim() || "basic",
      question_code: questionCode,
      label,
      help_text: qs("#questionEditorHelpText").value || "",
      input_type: qs("#questionEditorInputType").value || "text",
      placeholder: qs("#questionEditorPlaceholder").value || "",
      required: Boolean(qs("#questionEditorRequired").checked),
      conditional_rule_json: conditionalRuleJson,
      active: Boolean(qs("#questionEditorActive").checked),
    };

    try {
      if (itemId) {
        await surveyBuilderAdminApi.updateQuestionItem(itemId, payloadBase);
      } else {
        const sortOrder = Number.isFinite(desiredOrder) ? desiredOrder : questionItems.length;
        const createPayload = {
          questionnaire_version_id: selectedVersionId,
          ...payloadBase,
          sort_order: sortOrder,
          active: Boolean(qs("#questionEditorActive").checked),
        };
        const created = await surveyBuilderAdminApi.createQuestionItem(selectedVersionId, createPayload);
        selectedQuestionItemId = created.id;
        questionItems = await surveyBuilderAdminApi.listQuestionItems(selectedVersionId);
      }

      const existing = itemId ? questionItems.find((x) => x.id === itemId) : null;
      if (itemId && existing) {
        const currentSorted = questionItems.slice().sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
        const newIds = computeReorderedIds(currentSorted, itemId, desiredOrder);
        if (newIds.join("|") !== currentSorted.map((x) => x.id).join("|")) {
          await surveyBuilderAdminApi.reorderQuestionItems(selectedVersionId, newIds);
        }
      }

      await loadVersionContext(selectedVersionId);
      if (selectedQuestionItemId) {
        await selectQuestionItem(selectedQuestionItemId);
      }
      setStatus("#versionActionStatus", t("common.survey_builder.status.question_saved", "Question saved."));
    } catch (err) {
      setStatus("#versionActionStatus", `Error: ${err?.message || err}`);
    }
  });

  qs("#embeddedOptionTable")?.addEventListener("click", async (event) => {
    const btn = event.target.closest("button[data-action]");
    if (!btn) return;
    const action = btn.getAttribute("data-action");
    const id = btn.getAttribute("data-id") || "";
    if (!id) return;

    if (!selectedQuestionItemId) return;

    const sorted = options.slice().sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
    const idx = sorted.findIndex((x) => x.id === id);

    if (action === "edit") {
      const opt = sorted.find((x) => x.id === id);
      fillOptionEditor(opt);
      return;
    }

    if (action === "delete") {
      setStatus("#optionActionStatus", t("common.survey_builder.status.deleting_option", "Deleting…"));
      await surveyBuilderAdminApi.deleteQuestionOption(id);
      optionsByItemIdCache = {};
      await loadVersionContext(selectedVersionId);
      if (selectedQuestionItemId) await selectQuestionItem(selectedQuestionItemId);
      setStatus("#optionActionStatus", t("common.survey_builder.status.option_deleted", "Choice removed."));
      return;
    }

    if (action === "move-up" || action === "move-down") {
      const targetIdx = action === "move-up" ? idx - 1 : idx + 1;
      if (idx < 0 || targetIdx < 0 || targetIdx >= sorted.length) return;
      const ids = sorted.map((x) => x.id);
      const tmp = ids[idx];
      ids[idx] = ids[targetIdx];
      ids[targetIdx] = tmp;
      await surveyBuilderAdminApi.reorderQuestionOptions(selectedQuestionItemId, ids);
      optionsByItemIdCache = {};
      await selectQuestionItem(selectedQuestionItemId);
    }
  });

  qs("#clearOptionBtn")?.addEventListener("click", () => {
    resetOptionEditorForCreate();
    setStatus("#optionActionStatus", "");
  });

  qs("#deleteOptionBtn")?.addEventListener("click", async () => {
    const optionId = qs("#questionOptionEditorId").value.trim();
    if (!optionId) return;
    if (!window.confirm(t("common.survey_builder.confirm.delete_option", "Delete this option?"))) return;
    try {
      setStatus("#optionActionStatus", "Deleting option...");
      await surveyBuilderAdminApi.deleteQuestionOption(optionId);
      optionsByItemIdCache = {};
      await selectQuestionItem(selectedQuestionItemId);
      resetOptionEditorForCreate();
      setStatus("#optionActionStatus", t("common.survey_builder.status.option_deleted", "Choice removed."));
    } catch (err) {
      setStatus("#optionActionStatus", `Error: ${err?.message || err}`);
    }
  });

  qs("#questionOptionForm")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!selectedQuestionItemId) return;

    const optionId = qs("#questionOptionEditorId").value.trim();
    const desiredOrder = Number(qs("#optionEditorOrder").value ?? 0);
    const payloadBase = {
      value: qs("#optionEditorValue").value.trim(),
      label: qs("#optionEditorLabel").value.trim(),
    };

    if (!payloadBase.value || !payloadBase.label) {
      setStatus("#optionActionStatus", t("common.survey_builder.status.option_value_required", "Value and label are required."));
      return;
    }

    try {
      let createdOptionId = optionId || "";
      if (optionId) {
        await surveyBuilderAdminApi.updateQuestionOption(optionId, payloadBase);
      } else {
        const sortOrder = Number.isFinite(desiredOrder) ? desiredOrder : options.length;
        const created = await surveyBuilderAdminApi.createQuestionOption(selectedQuestionItemId, {
          question_item_id: selectedQuestionItemId,
          ...payloadBase,
          sort_order: sortOrder,
        });
        createdOptionId = created?.id || "";
      }

      optionsByItemIdCache = {};
      const refreshed = await surveyBuilderAdminApi.listQuestionOptions(selectedQuestionItemId);
      const sorted = refreshed.slice().sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
      const currentIds = sorted.map((x) => x.id);

      const targetId = createdOptionId;
      if (targetId) {
        const idx = currentIds.indexOf(targetId);
        const reorderIndex = Number.isFinite(desiredOrder) ? desiredOrder : currentIds.length - 1;
        const clamped = Math.max(0, Math.min(currentIds.length - 1, reorderIndex));
        if (idx >= 0 && idx !== clamped) {
          const newIds = currentIds.slice();
          newIds.splice(idx, 1);
          newIds.splice(clamped, 0, targetId);
          await surveyBuilderAdminApi.reorderQuestionOptions(selectedQuestionItemId, newIds);
        }
      }

      await selectQuestionItem(selectedQuestionItemId);
      resetOptionEditorForCreate();
      setStatus("#optionActionStatus", t("common.survey_builder.status.option_saved", "Choice saved."));
    } catch (err) {
      setStatus("#optionActionStatus", `Error: ${err?.message || err}`);
    }
  });

  qs("#adminRuleCards")?.addEventListener("click", async (event) => {
    const btn = event.target.closest("button[data-action]");
    if (!btn) return;
    const action = btn.getAttribute("data-action");
    const id = btn.getAttribute("data-id") || "";
    if (!id) return;

    const versionId = selectedVersionId;
    if (!versionId) return;

    const sorted = rules.slice().sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));
    const idx = sorted.findIndex((x) => x.id === id);

    if (action === "edit") {
      await selectRule(id);
      qs("#ruleEditorId").value = id;
      selectedRuleId = id;
      qs("#newRuleBtn").disabled = false;
      return;
    }

    if (action === "toggle-active") {
      const rule = rules.find((x) => x.id === id);
      await surveyBuilderAdminApi.setRecommendationRuleActivation(id, !Boolean(rule?.active));
      rules = await surveyBuilderAdminApi.listRecommendationRules(versionId, false);
      renderRuleCards();
      return;
    }

    if (action === "move-up" || action === "move-down") {
      const targetIdx = action === "move-up" ? idx - 1 : idx + 1;
      if (idx < 0 || targetIdx < 0 || targetIdx >= sorted.length) return;
      const newOrderIds = sorted.map((x) => x.id);
      const tmp = newOrderIds[idx];
      newOrderIds[idx] = newOrderIds[targetIdx];
      newOrderIds[targetIdx] = tmp;
      await surveyBuilderAdminApi.reorderRecommendationRules(versionId, newOrderIds);
      rules = await surveyBuilderAdminApi.listRecommendationRules(versionId, false);
      renderRuleCards();
      if (selectedRuleId) await selectRule(selectedRuleId);
    }
  });

  qs("#newRuleBtn")?.addEventListener("click", () => {
    resetRuleEditorForCreate();
    selectedRuleId = "";
  });

  qs("#ruleEditorConditionKind")?.addEventListener("change", async () => {
    const kind = qs("#ruleEditorConditionKind").value;
    if (kind === "custom") {
      qs("#ruleEditorConditionJson").value = jsonToString(buildRuleConditionJsonFromKind(lastRuleConditionKind));
    }
    applyRuleConditionUi(kind);
    if (kind === "answer_equals") {
      const qItemId = qs("#ruleEditorConditionQuestionItemId").value;
      if (qItemId) {
        await ensureOptionsCacheForQuestionItem(qItemId);
        refreshSimpleConditionOptionOptions(qItemId, qs("#ruleEditorConditionOptionValue").value || "");
      }
    }
    lastRuleConditionKind = kind === "custom" ? lastRuleConditionKind : kind;
  });

  qs("#ruleEditorConditionQuestionItemId")?.addEventListener("change", async () => {
    const qItemId = qs("#ruleEditorConditionQuestionItemId").value;
    await ensureOptionsCacheForQuestionItem(qItemId);
    refreshSimpleConditionOptionOptions(qItemId, "");
  });

  qs("#ruleEditorResultType")?.addEventListener("change", () => {
    const rt = qs("#ruleEditorResultType").value;
    refreshRuleResultCodeOptions(rt, "");
  });

  qs("#clearRuleBtn")?.addEventListener("click", () => {
    resetRuleEditorForCreate();
    selectedRuleId = "";
    setStatus("#ruleActionStatus", "");
  });

  qs("#ruleEditorForm")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!selectedVersionId) return;

    const ruleId = qs("#ruleEditorId").value.trim();
    const kind = qs("#ruleEditorConditionKind").value;
    const conditionJson = buildRuleConditionJsonFromKind(kind);

    if (kind === "answer_equals" && (!conditionJson.question_code || String(conditionJson.option_value ?? "").length === 0)) {
      setStatus("#ruleActionStatus", t("common.survey_builder.status.rule_answer_incomplete", "Choose a question and a matching choice."));
      return;
    }
    if (kind === "need_includes" && !String(conditionJson.option_value ?? "").trim()) {
      setStatus("#ruleActionStatus", t("common.survey_builder.status.rule_need_incomplete", "Select a need category."));
      return;
    }

    const payloadBase = {
      questionnaire_version_id: selectedVersionId,
      condition_json: conditionJson,
      result_type: qs("#ruleEditorResultType").value,
      result_code: qs("#ruleEditorResultCode").value,
      priority: Number(qs("#ruleEditorPriority").value ?? 0),
      active: Boolean(qs("#ruleEditorActive").checked),
    };

    if (!payloadBase.result_code) {
      setStatus("#ruleActionStatus", t("common.survey_builder.status.pick_result", "Choose a catalog item to recommend."));
      return;
    }

    try {
      if (ruleId) {
        await surveyBuilderAdminApi.updateRecommendationRule(ruleId, payloadBase);
      } else {
        await surveyBuilderAdminApi.createRecommendationRule(selectedVersionId, payloadBase);
      }
      rules = await surveyBuilderAdminApi.listRecommendationRules(selectedVersionId, false);
      renderRuleCards();
      selectedRuleId = "";
      resetRuleEditorForCreate();
      setStatus("#ruleActionStatus", t("common.survey_builder.status.rule_saved", "Rule saved."));
    } catch (err) {
      setStatus("#ruleActionStatus", `Error: ${err?.message || err}`);
    }
  });

  setStatus("#ruleActionStatus", "");
  qs("#newRuleBtn").disabled = true;
}

initAdminSurveyBuilderPage();

export { initAdminSurveyBuilderPage };
