import { serviceCatalogAdminApi, surveyBuilderAdminApi } from "../core/api.js";
import { ensureAdminAccess, protectCurrentPage } from "../core/guards.js";
import { loadSidebar } from "../components/sidebar.js";
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

let optionsByItemIdCache = {};

let serviceCodes = { packages: [], modules: [], addons: [] };
let serviceCodesLoaded = false;

function setStatus(selector, message) {
  const el = qs(selector);
  if (el) el.textContent = message;
}

function boolBadge(value, labelTrue = "Active", labelFalse = "Inactive") {
  return value
    ? `<span class="lhai-badge lhai-badge--status-active">${safeText(labelTrue)}</span>`
    : `<span class="lhai-badge">${safeText(labelFalse)}</span>`;
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
    const q = obj.question_code ? String(obj.question_code) : "?";
    const ov = obj.option_value ? String(obj.option_value) : "?";
    return `${q} = ${ov}`;
  }
  try {
    const s = JSON.stringify(obj);
    if (s.length <= 48) return s;
    return s.slice(0, 45) + "...";
  } catch {
    return "-";
  }
}

function renderQuestionnaireList() {
  const tbody = qs("#adminQuestionnaireTable");
  if (!tbody) return;
  if (!questionnaires.length) {
    tbody.innerHTML = "<tr><td colspan='5'>No questionnaires</td></tr>";
    return;
  }

  const versionById = versionByIdAll || {};

  tbody.innerHTML = questionnaires
    .slice()
    .sort((a, b) => String(b.updated_at || "").localeCompare(String(a.updated_at || "")))
    .map((q) => {
      const activeVer = q.active_version_id ? versionById[q.active_version_id] : null;
      const activeVerLabel = activeVer ? `v${activeVer.version_number}` : "-";
      const isSelected = q.id === selectedQuestionnaireId;
      return `
        <tr data-qnr-id="${safeText(q.id)}" class="${isSelected ? "is-selected" : ""}">
          <td><strong>${safeText(q.name)}</strong></td>
          <td><code>${safeText(q.code)}</code></td>
          <td>${safeText(activeVerLabel)}</td>
          <td>${boolBadge(Boolean(q.active), "Active", "Inactive")}</td>
          <td>
            <div class="admin-survey-builder__editor-actions">
              <button type="button" class="lhai-button lhai-button--secondary lhai-button--compact" data-action="select" data-id="${safeText(q.id)}">Select</button>
              <button type="button" class="lhai-button lhai-button--secondary lhai-button--compact" data-action="toggle-active" data-id="${safeText(q.id)}">
                ${q.active ? "Deactivate" : "Activate"}
              </button>
            </div>
          </td>
        </tr>
      `;
    })
    .join("");
}

function fillQuestionnaireEditor(q) {
  qs("#questionnaireEditorId").value = q?.id || "";
  qs("#questionnaireEditorCode").value = q?.code || "";
  qs("#questionnaireEditorName").value = q?.name || "";
  qs("#questionnaireEditorDescription").value = q?.description || "";
  qs("#questionnaireEditorActive").checked = Boolean(q?.active);

  const v = q?.active_version_id ? versions.find((x) => x.id === q.active_version_id) : null;
  qs("#questionnaireActiveVersionDisplay").textContent = v ? `v${v.version_number}` : "-";
}

function resetQuestionnaireEditorForCreate() {
  fillQuestionnaireEditor({
    id: "",
    code: "",
    name: "",
    description: "",
    active: true,
    active_version_id: null,
  });
  qs("#questionnaireActiveVersionDisplay").textContent = "-";
  setStatus("#questionnaireBasicStatus", "새 Questionnaire를 생성합니다. Code/Name을 입력하세요.");
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
    tbody.innerHTML = "<tr><td colspan='5'>No versions</td></tr>";
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
          <td>${v.published_at ? safeText(formatDate(v.published_at)) : "-"}</td>
          <td>${isActive ? boolBadge(true, "Active", "Active") : boolBadge(false, "Active", "Inactive")}</td>
          <td>
            <div class="admin-survey-builder__editor-actions">
              <button type="button" class="lhai-button lhai-button--secondary lhai-button--compact" data-action="select" data-id="${safeText(v.id)}">Build</button>
            </div>
          </td>
        </tr>
      `;
    })
    .join("");
}

function renderQuestionItems() {
  const tbody = qs("#adminQuestionItemTable");
  if (!tbody) return;
  if (!questionItems.length) {
    tbody.innerHTML = "<tr><td colspan='7'>No questions yet</td></tr>";
    return;
  }

  const sorted = questionItems.slice().sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
  tbody.innerHTML = sorted
    .map((it) => {
      const isSelected = it.id === selectedQuestionItemId;
      return `
        <tr data-item-id="${safeText(it.id)}" class="${isSelected ? "is-selected" : ""}">
          <td>${safeText(it.sort_order ?? 0)}</td>
          <td>${safeText(it.section_code || "")}</td>
          <td><code>${safeText(it.question_code || "")}</code></td>
          <td>${safeText(it.label || "")}</td>
          <td>${it.required ? boolBadge(true, "Yes", "Yes") : boolBadge(false, "No", "No")}</td>
          <td>${it.active ? boolBadge(true, "Active", "Active") : boolBadge(false, "Active", "Inactive")}</td>
          <td>
            <div class="admin-survey-builder__editor-actions">
              <button type="button" class="lhai-button lhai-button--secondary lhai-button--compact" data-action="edit" data-id="${safeText(it.id)}">Edit</button>
              <button type="button" class="lhai-button lhai-button--secondary lhai-button--compact" data-action="toggle-active" data-id="${safeText(it.id)}">
                ${it.active ? "Deactivate" : "Activate"}
              </button>
              <button type="button" class="lhai-button lhai-button--secondary lhai-button--compact" data-action="move-up" data-id="${safeText(it.id)}" ${it.sort_order === 0 ? "disabled" : ""}>↑</button>
              <button type="button" class="lhai-button lhai-button--secondary lhai-button--compact" data-action="move-down" data-id="${safeText(it.id)}" ${it.sort_order === sorted.length - 1 ? "disabled" : ""}>↓</button>
            </div>
          </td>
        </tr>
      `;
    })
    .join("");
}

function fillQuestionItemEditor(item) {
  qs("#questionItemEditorId").value = item?.id || "";
  qs("#questionEditorSectionCode").value = item?.section_code || "";
  qs("#questionEditorOrder").value = item?.sort_order ?? 0;
  qs("#questionEditorQuestionCode").value = item?.question_code || "";
  qs("#questionEditorLabel").value = item?.label || "";
  qs("#questionEditorHelpText").value = item?.help_text || "";
  qs("#questionEditorInputType").value = item?.input_type || "text";
  qs("#questionEditorRequired").checked = Boolean(item?.required);
  qs("#questionEditorPlaceholder").value = item?.placeholder || "";
  qs("#questionEditorConditionalRuleJson").value = jsonToString(item?.conditional_rule_json || {});
  qs("#questionEditorActive").checked = Boolean(item?.active);
  setStatus("#questionnaireBasicStatus", "");

  const conditionalSummary = summarizeCondition(item?.conditional_rule_json || {});
  qs("#questionPreviewConditional").textContent = `Conditional: ${conditionalSummary}`;

  qs("#questionPreviewBody").textContent = `Label: ${item?.label || "-"} | Input: ${item?.input_type || "-"} | Required: ${
    item?.required ? "Yes" : "No"
  } | Placeholder: ${item?.placeholder || "-"}`;
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
  setStatus("#versionActionStatus", "");
}

function setQuestionButtonsState() {
  qs("#newQuestionItemBtn").disabled = !Boolean(selectedVersionId);
}

function renderOptionsTable() {
  const tbody = qs("#adminOptionTable");
  if (!tbody) return;
  if (!selectedQuestionItemId) {
    tbody.innerHTML = "<tr><td colspan='4'>Select a question to manage options</td></tr>";
    return;
  }
  if (!options.length) {
    tbody.innerHTML = "<tr><td colspan='4'>No options yet</td></tr>";
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
              <button type="button" class="lhai-button lhai-button--secondary lhai-button--compact" data-action="edit" data-id="${safeText(opt.id)}">Edit</button>
              <button type="button" class="lhai-button lhai-button--secondary lhai-button--compact" data-action="move-up" data-id="${safeText(opt.id)}" ${idx === 0 ? "disabled" : ""}>↑</button>
              <button type="button" class="lhai-button lhai-button--secondary lhai-button--compact" data-action="move-down" data-id="${safeText(opt.id)}" ${idx === sorted.length - 1 ? "disabled" : ""}>↓</button>
              <button type="button" class="lhai-button lhai-button--secondary lhai-button--compact" data-action="delete" data-id="${safeText(opt.id)}">Delete</button>
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

function renderRulesTable() {
  const tbody = qs("#adminRuleTable");
  if (!tbody) return;
  if (!rules.length) {
    tbody.innerHTML = "<tr><td colspan='5'>No rules yet</td></tr>";
    return;
  }

  const sorted = rules.slice().sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));
  tbody.innerHTML = sorted
    .map((r) => {
      const isSelected = r.id === selectedRuleId;
      return `
        <tr data-rule-id="${safeText(r.id)}" class="${isSelected ? "is-selected" : ""}">
          <td>${safeText(r.priority ?? 0)}</td>
          <td>${r.active ? boolBadge(true, "Active", "Active") : boolBadge(false, "Active", "Inactive")}</td>
          <td><code>${safeText(r.result_type || "")}:${safeText(r.result_code || "")}</code></td>
          <td>${safeText(summarizeCondition(r.condition_json))}</td>
          <td>
            <div class="admin-survey-builder__editor-actions">
              <button type="button" class="lhai-button lhai-button--secondary lhai-button--compact" data-action="edit" data-id="${safeText(r.id)}">Edit</button>
              <button type="button" class="lhai-button lhai-button--secondary lhai-button--compact" data-action="toggle-active" data-id="${safeText(r.id)}">
                ${r.active ? "Deactivate" : "Activate"}
              </button>
              <button type="button" class="lhai-button lhai-button--secondary lhai-button--compact" data-action="move-up" data-id="${safeText(r.id)}" ${sorted.findIndex((x) => x.id === r.id) === 0 ? "disabled" : ""}>↑</button>
              <button type="button" class="lhai-button lhai-button--secondary lhai-button--compact" data-action="move-down" data-id="${safeText(r.id)}" ${sorted.findIndex((x) => x.id === r.id) === sorted.length - 1 ? "disabled" : ""}>↓</button>
            </div>
          </td>
        </tr>
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

  // Condition mode: try to detect our simple structure
  const cond = rule?.condition_json || {};
  if (cond && typeof cond === "object" && cond.type === "question_option_equals") {
    qs("#ruleEditorConditionMode").value = "simple";
    refreshSimpleConditionQuestionOptions();
    const qCode = cond.question_code ? String(cond.question_code) : "";
    const optValue = cond.option_value ? String(cond.option_value) : "";
    // find question item with matching question_code
    const qItem = questionItems.find((it) => it.question_code === qCode);
    if (qItem) {
      qs("#ruleEditorConditionQuestionItemId").value = qItem.id;
      refreshSimpleConditionOptionOptions(qItem.id, optValue);
    } else {
      qs("#ruleEditorConditionMode").value = "advanced";
      const simpleEl = qs(".admin-survey-builder__condition-simple");
      const advEl = qs(".admin-survey-builder__condition-advanced");
      if (simpleEl) simpleEl.hidden = true;
      if (advEl) advEl.hidden = false;
      qs("#ruleEditorConditionJson").value = jsonToString(cond);
    }
  } else {
    qs("#ruleEditorConditionMode").value = "advanced";
    const simpleEl = qs(".admin-survey-builder__condition-simple");
    const advEl = qs(".admin-survey-builder__condition-advanced");
    if (simpleEl) simpleEl.hidden = true;
    if (advEl) advEl.hidden = false;
    qs("#ruleEditorConditionJson").value = jsonToString(cond);
  }

  // Sync UI visibility with condition mode.
  const mode = qs("#ruleEditorConditionMode").value;
  const simpleEl2 = qs(".admin-survey-builder__condition-simple");
  const advEl2 = qs(".admin-survey-builder__condition-advanced");
  if (simpleEl2) simpleEl2.hidden = mode !== "simple";
  if (advEl2) advEl2.hidden = mode !== "advanced";

  setStatus("#ruleActionStatus", "");
}

function resetRuleEditorForCreate() {
  qs("#ruleEditorId").value = "";
  qs("#ruleEditorPriority").value = rules.length ? rules.length : 0;
  qs("#ruleEditorActive").checked = true;
  qs("#ruleEditorResultType").value = "package";
  refreshRuleResultCodeOptions("package", "");
  qs("#ruleEditorConditionMode").value = "simple";
  refreshSimpleConditionQuestionOptions();
  // defaults
  qs("#ruleEditorConditionQuestionItemId").selectedIndex = 0;
  const firstQ = questionItems[0];
  if (firstQ) refreshSimpleConditionOptionOptions(firstQ.id, "");
  // Sync UI visibility with condition mode.
  const simpleEl = qs(".admin-survey-builder__condition-simple");
  const advEl = qs(".admin-survey-builder__condition-advanced");
  if (simpleEl) simpleEl.hidden = false;
  if (advEl) advEl.hidden = true;
  setStatus("#ruleActionStatus", "새 추천 규칙을 추가합니다.");
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
    .map((it) => `<option value="${safeText(it.id)}">${safeText(it.section_code)} / ${safeText(it.question_code)} - ${safeText(it.label)}</option>`)
    .join("");
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
    .map((opt) => `<option value="${safeText(opt.value)}">${safeText(opt.value)} - ${safeText(opt.label)}</option>`)
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
  setStatus("#adminQuestionnaireStatus", "Loading questionnaires...");
  questionnaires = await surveyBuilderAdminApi.listQuestionnaires(true);

  // Populate active-version display without requiring a second page reload.
  const versionLists = await Promise.all(
    questionnaires.map((q) => surveyBuilderAdminApi.listQuestionnaireVersions(q.id).catch(() => []))
  );
  versionByIdAll = {};
  versionLists.forEach((list) => {
    list.forEach((v) => {
      versionByIdAll[v.id] = v;
    });
  });

  // Keep builder versions in sync for currently selected questionnaire.
  if (selectedQuestionnaireId) {
    const idx = questionnaires.findIndex((q) => q.id === selectedQuestionnaireId);
    versions = idx >= 0 ? versionLists[idx] : [];
  } else {
    versions = [];
  }

  renderQuestionnaireList();
  setStatus("#adminQuestionnaireStatus", `${questionnaires.length} questionnaire(s)`);
}

function upsertVersionByIdAll(versionList) {
  if (!versionList || !Array.isArray(versionList)) return;
  versionList.forEach((v) => {
    if (v?.id) versionByIdAll[v.id] = v;
  });
}

async function loadQuestionnaireContext(questionnaireId) {
  selectedQuestionnaireId = questionnaireId;
  selectedVersionId = "";
  selectedQuestionItemId = "";
  selectedRuleId = "";
  questionItems = [];
  options = [];
  rules = [];
  optionsByItemIdCache = {};

  setStatus("#adminQuestionnaireStatus", "Loading versions...");
  versions = await surveyBuilderAdminApi.listQuestionnaireVersions(questionnaireId);
  renderQuestionnaireList();
  renderVersionsTable();
  renderQuestionItems();
  renderOptionsTable();
  renderRulesTable();
  setVersionActionButtonsState();

  // Try to auto-select active version
  const q = questionnaires.find((x) => x.id === questionnaireId);
  if (q?.active_version_id) {
    selectedVersionId = q.active_version_id;
    renderVersionsTable();
    await loadVersionContext(selectedVersionId);
    setQuestionButtonsState();
    setVersionActionButtonsState();
  } else {
    resetQuestionnaireEditorForCreate();
  }

  fillQuestionnaireEditor(q);
  setStatus("#versionActionStatus", "");
}

async function loadVersionContext(versionId) {
  const preservedQuestionItemId = selectedQuestionItemId;
  const preservedRuleId = selectedRuleId;

  selectedVersionId = versionId;
  optionsByItemIdCache = {};

  questionItems = await surveyBuilderAdminApi.listQuestionItems(versionId);
  rules = await surveyBuilderAdminApi.listRecommendationRules(versionId, false);

  renderQuestionItems();
  renderRulesTable();
  refreshSimpleConditionQuestionOptions();

  await ensureServiceCodesLoaded();

  // Restore question + options editor if possible.
  if (preservedQuestionItemId && questionItems.some((x) => x.id === preservedQuestionItemId)) {
    await selectQuestionItem(preservedQuestionItemId);
  } else {
    selectedQuestionItemId = "";
    options = [];
    renderOptionsTable();
    resetOptionEditorForCreate();
  }

  // Restore rule editor if possible.
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
}

function setRuleResultTypeFromSelection() {
  const resultType = qs("#ruleEditorResultType")?.value || "package";
  refreshRuleResultCodeOptions(resultType, qs("#ruleEditorResultCode")?.value || "");
}

async function selectQuestionItem(itemId) {
  selectedQuestionItemId = itemId;
  const item = questionItems.find((x) => x.id === itemId);
  fillQuestionItemEditor(item);
  // load options for this item
  options = await ensureOptionsCacheForQuestionItem(itemId);
  renderOptionsTable();
  resetOptionEditorForCreate();

  // also refresh rule simple option dropdown if it targets the same question item
  const selectedQInRule = qs("#ruleEditorConditionQuestionItemId")?.value;
  if (selectedQInRule === itemId) {
    refreshSimpleConditionOptionOptions(itemId, qs("#ruleEditorConditionOptionValue")?.value || "");
  }
}

async function selectRule(ruleId) {
  selectedRuleId = ruleId;
  const rule = rules.find((x) => x.id === ruleId);
  if (!rule) return;

  // options cache needed for simple condition editor
  // We'll attempt to load the relevant question item's options by condition_json parsing.
  fillRuleEditor(rule);

  // If simple mode, refresh option list (may require async load)
  const cond = rule?.condition_json || {};
  if (qs("#ruleEditorConditionMode").value === "simple" && cond?.type === "question_option_equals") {
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

  setStatus("#versionActionStatus", "Duplicating version (survey structure + rules)...");

  const createdVersion = await surveyBuilderAdminApi.createQuestionnaireVersion(questionnaireId, null);
  const newVersionId = createdVersion.id;

  const prevItems = await surveyBuilderAdminApi.listQuestionItems(prevVersionId);
  // clone items
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

  // clone rules
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

  setStatus("#versionActionStatus", "Clone completed. Reloading context...");
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
  await loadSidebar("#sidebar", "admin");

  const tabsRoot = qs("#surveyBuilderTabs");
  const panelsRoot = qs(".admin-services__tab-panels");
  mountTabs(tabsRoot, panelsRoot, { defaultPanelId: "panel-basic" });

  resetQuestionnaireEditorForCreate();
  setVersionActionButtonsState();
  renderQuestionItems();
  renderOptionsTable();
  renderRulesTable();

  await refreshQuestionnaireTable();

  // Questionnaire list interactions
  qs("#adminQuestionnaireTable")?.addEventListener("click", async (event) => {
    const btn = event.target.closest("button[data-action]");
    if (!btn) return;
    const action = btn.getAttribute("data-action");
    const id = btn.getAttribute("data-id") || "";
    if (!id) return;

    if (action === "select") {
      await loadQuestionnaireContext(id);
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
  });

  // Questionnaire editor create/update
  qs("#questionnaireEditorForm")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!selectedQuestionnaireId && !qs("#questionnaireEditorId").value.trim()) {
      // create new
    }
    const questionnaireId = qs("#questionnaireEditorId").value.trim();

    const payload = {
      code: qs("#questionnaireEditorCode").value.trim(),
      name: qs("#questionnaireEditorName").value.trim(),
      description: qs("#questionnaireEditorDescription").value || "",
      active: Boolean(qs("#questionnaireEditorActive").checked),
    };
    if (!payload.code || !payload.name) {
      setStatus("#questionnaireBasicStatus", "Code/Name은 필수입니다.");
      return;
    }

    try {
      if (questionnaireId) {
        await surveyBuilderAdminApi.updateQuestionnaire(questionnaireId, payload);
        setStatus("#questionnaireBasicStatus", "Questionnaire updated.");
      } else {
        const created = await surveyBuilderAdminApi.createQuestionnaire(payload);
        setStatus("#questionnaireBasicStatus", "Questionnaire created.");
        await refreshQuestionnaireTable();
        await loadQuestionnaireContext(created.id);
      }
      questionnaires = await surveyBuilderAdminApi.listQuestionnaires(true);
      renderQuestionnaireList();
    } catch (err) {
      setStatus("#questionnaireBasicStatus", `Error: ${err?.message || err}`);
    }
  });

  qs("#clearQuestionnaireBtn")?.addEventListener("click", () => {
    resetQuestionnaireEditorForCreate();
  });

  // Versions tab actions
  qs("#createVersionBtn")?.addEventListener("click", async () => {
    if (!selectedQuestionnaireId) return;
    const raw = qs("#createVersionNumber").value;
    const versionNumber = raw === "" || raw == null ? null : Number(raw);
    setStatus("#versionActionStatus", "Creating new version...");
    try {
      const created = await surveyBuilderAdminApi.createQuestionnaireVersion(selectedQuestionnaireId, versionNumber);
      versions = await surveyBuilderAdminApi.listQuestionnaireVersions(selectedQuestionnaireId);
      upsertVersionByIdAll(versions);
      selectedVersionId = created.id;
      renderVersionsTable();
      await loadVersionContext(created.id);
      setVersionActionButtonsState();
      setStatus("#versionActionStatus", `Created version v${created.version_number} (DRAFT).`);
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
    setStatus("#versionActionStatus", "Publishing version...");
    try {
      await surveyBuilderAdminApi.publishQuestionnaireVersion(selectedQuestionnaireId, selectedVersionId);
      versions = await surveyBuilderAdminApi.listQuestionnaireVersions(selectedQuestionnaireId);
      upsertVersionByIdAll(versions);
      renderVersionsTable();
      await loadVersionContext(selectedVersionId);
      setVersionActionButtonsState();
      setStatus("#versionActionStatus", "Published.");
    } catch (err) {
      setStatus("#versionActionStatus", `Error: ${err?.message || err}`);
    }
  });

  qs("#setActiveVersionBtn")?.addEventListener("click", async () => {
    if (!selectedQuestionnaireId || !selectedVersionId) return;
    setStatus("#versionActionStatus", "Setting active version...");
    try {
      await surveyBuilderAdminApi.setActiveQuestionnaireVersion(selectedQuestionnaireId, selectedVersionId);
      questionnaires = await surveyBuilderAdminApi.listQuestionnaires(true);
      const updated = questionnaires.find((x) => x.id === selectedQuestionnaireId);
      fillQuestionnaireEditor(updated);
      setStatus("#versionActionStatus", "Active version updated.");
      renderQuestionnaireList();
      versions = await surveyBuilderAdminApi.listQuestionnaireVersions(selectedQuestionnaireId);
      upsertVersionByIdAll(versions);
      renderVersionsTable();
      setVersionActionButtonsState();
    } catch (err) {
      setStatus("#versionActionStatus", `Error: ${err?.message || err}`);
    }
  });

  // Select version for building
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

  // Questions tab: table actions
  qs("#adminQuestionItemTable")?.addEventListener("click", async (event) => {
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
      return;
    }
  });

  // Add new question item (enter create mode)
  qs("#newQuestionItemBtn")?.addEventListener("click", () => {
    resetQuestionItemEditorForCreate();
    selectedQuestionItemId = "";
    qs("#questionItemEditorId").value = "";
    setStatus("#optionActionStatus", "");
  });

  // Clear question item editor
  qs("#clearQuestionItemBtn")?.addEventListener("click", () => {
    resetQuestionItemEditorForCreate();
  });

  // Save question item (create/edit)
  qs("#questionItemForm")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!selectedVersionId) return;

    const itemId = qs("#questionItemEditorId").value.trim();
    const desiredOrder = Number(qs("#questionEditorOrder").value ?? 0);
    const conditionalRuleJson = tryParseJsonObject(qs("#questionEditorConditionalRuleJson").value, {});

    const payloadBase = {
      section_code: qs("#questionEditorSectionCode").value.trim(),
      question_code: qs("#questionEditorQuestionCode").value.trim(),
      label: qs("#questionEditorLabel").value.trim(),
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

      // Apply order changes for existing items.
      const existing = itemId ? questionItems.find((x) => x.id === itemId) : null;
      if (itemId && existing) {
        const currentSorted = questionItems.slice().sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
        const newIds = computeReorderedIds(currentSorted, itemId, desiredOrder);
        // only reorder if position really changed
        if (newIds.join("|") !== currentSorted.map((x) => x.id).join("|")) {
          await surveyBuilderAdminApi.reorderQuestionItems(selectedVersionId, newIds);
        }
      }

      await loadVersionContext(selectedVersionId);
      if (selectedQuestionItemId) {
        await selectQuestionItem(selectedQuestionItemId);
      }
      setStatus("#versionActionStatus", "Question saved.");
    } catch (err) {
      setStatus("#versionActionStatus", `Error: ${err?.message || err}`);
    }
  });

  // Options tab: table actions
  qs("#adminOptionTable")?.addEventListener("click", async (event) => {
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
      setStatus("#optionActionStatus", "Deleting option...");
      await surveyBuilderAdminApi.deleteQuestionOption(id);
      optionsByItemIdCache = {};
      await loadVersionContext(selectedVersionId);
      // keep same selected question item
      if (selectedQuestionItemId) await selectQuestionItem(selectedQuestionItemId);
      setStatus("#optionActionStatus", "Option deleted.");
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

  // Option editor clear
  qs("#clearOptionBtn")?.addEventListener("click", () => {
    resetOptionEditorForCreate();
    setStatus("#optionActionStatus", "");
  });

  // Option editor delete selected
  qs("#deleteOptionBtn")?.addEventListener("click", async () => {
    const optionId = qs("#questionOptionEditorId").value.trim();
    if (!optionId) return;
    if (!window.confirm("Delete this option?")) return;
    try {
      setStatus("#optionActionStatus", "Deleting option...");
      await surveyBuilderAdminApi.deleteQuestionOption(optionId);
      optionsByItemIdCache = {};
      await selectQuestionItem(selectedQuestionItemId);
      resetOptionEditorForCreate();
      setStatus("#optionActionStatus", "Option deleted.");
    } catch (err) {
      setStatus("#optionActionStatus", `Error: ${err?.message || err}`);
    }
  });

  // Save option create/edit
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
      setStatus("#optionActionStatus", "Value/Label은 필수입니다.");
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

      // Apply order changes by reorder endpoint
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
      setStatus("#optionActionStatus", "Option saved.");
    } catch (err) {
      setStatus("#optionActionStatus", `Error: ${err?.message || err}`);
    }
  });

  // Rule table interactions
  qs("#adminRuleTable")?.addEventListener("click", async (event) => {
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
      renderRulesTable();
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
      renderRulesTable();
      // keep selection
      if (selectedRuleId) await selectRule(selectedRuleId);
      return;
    }
  });

  // New rule
  qs("#newRuleBtn")?.addEventListener("click", () => {
    resetRuleEditorForCreate();
    selectedRuleId = "";
  });

  // Condition simple toggle
  qs("#ruleEditorConditionMode")?.addEventListener("change", async () => {
    const mode = qs("#ruleEditorConditionMode").value;
    const simpleEl = document.querySelector(".admin-survey-builder__condition-simple");
    const advEl = document.querySelector(".admin-survey-builder__condition-advanced");
    if (simpleEl) simpleEl.hidden = mode !== "simple";
    if (advEl) advEl.hidden = mode !== "advanced";
    if (mode === "simple") {
      const qItemId = qs("#ruleEditorConditionQuestionItemId").value;
      if (qItemId) {
        await ensureOptionsCacheForQuestionItem(qItemId);
        refreshSimpleConditionOptionOptions(qItemId, qs("#ruleEditorConditionOptionValue").value || "");
      }
    }
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

  // Rule editor clear
  qs("#clearRuleBtn")?.addEventListener("click", () => {
    resetRuleEditorForCreate();
    selectedRuleId = "";
    setStatus("#ruleActionStatus", "");
  });

  // Save rule create/edit
  qs("#ruleEditorForm")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!selectedVersionId) return;

    const ruleId = qs("#ruleEditorId").value.trim();
    const conditionMode = qs("#ruleEditorConditionMode").value;
    const conditionJson =
      conditionMode === "simple"
        ? (() => {
            const qItemId = qs("#ruleEditorConditionQuestionItemId").value;
            const optionValue = qs("#ruleEditorConditionOptionValue").value;
            const item = questionItems.find((x) => x.id === qItemId);
            return {
              type: "question_option_equals",
              question_code: item?.question_code || "",
              option_value: optionValue || "",
            };
          })()
        : tryParseJsonObject(qs("#ruleEditorConditionJson").value, {});

    const payloadBase = {
      questionnaire_version_id: selectedVersionId,
      condition_json: conditionJson,
      result_type: qs("#ruleEditorResultType").value,
      result_code: qs("#ruleEditorResultCode").value,
      priority: Number(qs("#ruleEditorPriority").value ?? 0),
      active: Boolean(qs("#ruleEditorActive").checked),
    };

    if (!payloadBase.result_code) {
      setStatus("#ruleActionStatus", "result_code를 선택하세요.");
      return;
    }

    try {
      if (ruleId) {
        await surveyBuilderAdminApi.updateRecommendationRule(ruleId, payloadBase);
      } else {
        await surveyBuilderAdminApi.createRecommendationRule(selectedVersionId, payloadBase);
      }
      rules = await surveyBuilderAdminApi.listRecommendationRules(selectedVersionId, false);
      renderRulesTable();
      selectedRuleId = "";
      resetRuleEditorForCreate();
      setStatus("#ruleActionStatus", "Rule saved.");
    } catch (err) {
      setStatus("#ruleActionStatus", `Error: ${err?.message || err}`);
    }
  });

  // Initial state: enable rule question dropdowns only after selecting version
  setStatus("#ruleActionStatus", "");
  qs("#newRuleBtn").disabled = true;
}

initAdminSurveyBuilderPage();

export { initAdminSurveyBuilderPage };
void initAdminSurveyBuilderPage;

