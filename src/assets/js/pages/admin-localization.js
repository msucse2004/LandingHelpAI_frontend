/**
 * Admin — Localization: UI strings table, missing translations, Excel import/export.
 *
 * UI Strings tab matches Excel export columns: key + locale text only (no status/domain/category).
 */
import { adminI18nStringsApi } from "../core/api.js";
import { appPageLanguageReady } from "../core/app-page-i18n-boot.js";
import { ensureTierAccess, protectCurrentPage, ROLE_TIER } from "../core/guards.js";
import { applyI18nToDom, wireDynamicPageI18nRefresh } from "../core/i18n-dom.js";
import {
  localizedOption,
  localizedStatus,
  setLocalizedText,
} from "../core/i18n-dynamic.js";
import { loadSidebar } from "../components/sidebar.js";

const LANG_COLUMNS = ["en", "es", "ko", "zh-Hans", "zh-Hant", "ja"];
const CATALOG_TABLE_COLUMN_COUNT = 1 + LANG_COLUMNS.length;
/** Keep each auto-translate HTTP request short enough for proxy timeouts (Ollama polish per item). */
/** TODO(background-jobs): Replace client-side chaining with POST/GET auto-translate-jobs polling — see LandingHelpAI_backend/docs/auto_translate_background_jobs_design.md */
const MISSING_AUTO_TRANSLATE_BATCH_LIMIT = 2;
const MISSING_AUTO_TRANSLATE_MAX_BATCHES = 50;
const AUTO_TRANSLATE_MAX_FAILURE_SAMPLES = 3;
const AUTO_TRANSLATE_TARGET_LANGUAGES = ["es", "ko", "zh-Hans", "zh-Hant", "ja"];

const tabsRoot = document.getElementById("localizationTabs");
const panelsRoot = document.getElementById("localizationPanels");
const pageAlert = document.getElementById("localizationPageAlert");

const filterDomain = document.getElementById("filterDomain");
const filterSearch = document.getElementById("filterSearch");
const filterLanguage = document.getElementById("filterLanguage");
const filterMissingOnly = document.getElementById("filterMissingOnly");
const localizationRefreshBtn = document.getElementById("localizationRefreshBtn");
const localizationFilterResetBtn = document.getElementById("localizationFilterResetBtn");
const localizationLoadStatus = document.getElementById("localizationLoadStatus");
const localizationTableBody = document.getElementById("localizationTableBody");

const missingFilterDomain = document.getElementById("missingFilterDomain");
const missingFilterSearch = document.getElementById("missingFilterSearch");
const missingFilterLanguage = document.getElementById("missingFilterLanguage");
const missingRefreshBtn = document.getElementById("missingRefreshBtn");
const missingAutoTranslateBtn = document.getElementById("missingAutoTranslateBtn");
const missingLoadStatus = document.getElementById("missingLoadStatus");
const missingTableBody = document.getElementById("missingTableBody");

const localizationExportBtn = document.getElementById("localizationExportBtn");
const importFileInput = document.getElementById("importFileInput");
const importClearEmpty = document.getElementById("importClearEmpty");
const importSubmitBtn = document.getElementById("importSubmitBtn");
const importSummary = document.getElementById("importSummary");

const localizationValidationCard = document.getElementById("localizationValidationCard");
const localizationValidationSummary = document.getElementById("localizationValidationSummary");
const localizationValidationPlaceholderAlert = document.getElementById("localizationValidationPlaceholderAlert");
const localizationValidationStatus = document.getElementById("localizationValidationStatus");
const localizationValidationIssuesBody = document.getElementById("localizationValidationIssuesBody");

const localizationCanonicalizationCard = document.getElementById("localizationCanonicalizationCard");
const localizationCanonicalizationDryRunNote = document.getElementById("localizationCanonicalizationDryRunNote");
const localizationCanonicalizationSummary = document.getElementById("localizationCanonicalizationSummary");
const localizationCanonicalizationStatus = document.getElementById("localizationCanonicalizationStatus");
const localizationCanonicalizationErrors = document.getElementById("localizationCanonicalizationErrors");
const localizationCanonicalizationGroupsBody = document.getElementById("localizationCanonicalizationGroupsBody");
const localizationCanonicalizationConflictsBody = document.getElementById("localizationCanonicalizationConflictsBody");

/** @type {string} */
let activePanelId = "panel-ui-strings";

/** @type {Record<string, unknown> | null} */
let cachedValidationResult = null;

/** @type {Record<string, unknown> | null} */
let cachedCanonicalizationResult = null;
/** @type {boolean} */
let cachedCanonicalizationIsPreview = false;

/** @type {{ items: unknown[]; total: number } | null} */
let cachedUiStringsTable = null;
/** @type {{ items: unknown[]; total: number } | null} */
let cachedMissingTable = null;
/** @type {number} */
let missingAutoTranslateRunId = 0;

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function setPageAlert(text, { error = false } = {}) {
  if (!pageAlert) return;
  pageAlert.textContent = text || "";
  pageAlert.classList.toggle("lhai-field-error", Boolean(error) && Boolean(text));
  pageAlert.classList.toggle("lhai-help", !error || !text);
}

function setLocalizedPageAlert(key, fallback, { error = false, params } = {}) {
  setPageAlert(localizedStatus(key, fallback, params), { error });
}

function severityClass(severity) {
  const normalized = String(severity || "").toLowerCase();
  if (normalized === "error") return "admin-localization__severity--error";
  if (normalized === "warning") return "admin-localization__severity--warning";
  return "admin-localization__severity--info";
}

function renderValidationSummary(result) {
  if (!(localizationValidationSummary instanceof HTMLElement)) return;
  const checked = Number(result?.checked_rows ?? 0);
  const canonical = Number(result?.canonical_rows ?? 0);
  const duplicateGroups = Number(result?.duplicate_groups ?? 0);
  const placeholderErrors = Number(result?.placeholder_errors ?? 0);
  const warnings = Number(result?.warnings ?? 0);
  const missingByLanguage = result?.missing_by_language && typeof result.missing_by_language === "object"
    ? result.missing_by_language
    : {};

  const stat = (labelKey, labelFallback, value, { error = false } = {}) => `
    <div class="admin-localization__validation-stat${error ? " admin-localization__validation-stat--error" : ""}">
      <span class="admin-localization__validation-stat-label">${escapeHtml(localizedStatus(labelKey, labelFallback))}</span>
      <span class="admin-localization__validation-stat-value">${escapeHtml(String(value.toLocaleString()))}</span>
    </div>
  `;

  const missingItems = LANG_COLUMNS.filter((code) => code !== "en")
    .map((code) => {
      const count = Number(missingByLanguage[code] ?? 0);
      return `<li><code>${escapeHtml(code)}</code>: ${escapeHtml(count.toLocaleString())}</li>`;
    })
    .join("");

  localizationValidationSummary.innerHTML = `
    ${stat("localization.validation.checked_rows", "Checked rows", checked)}
    ${stat("localization.validation.canonical_rows", "Canonical rows", canonical)}
    ${stat("localization.validation.duplicate_groups", "Duplicate groups", duplicateGroups)}
    ${stat("localization.validation.placeholder_errors", "Placeholder errors", placeholderErrors, { error: placeholderErrors > 0 })}
    ${stat("localization.validation.warnings", "Warnings", warnings)}
    <div class="admin-localization__validation-stat">
      <span class="admin-localization__validation-stat-label">${escapeHtml(
        localizedStatus("localization.validation.missing_by_language", "Missing by language")
      )}</span>
      <ul class="admin-localization__validation-missing-list">${missingItems}</ul>
    </div>
  `;
}

function renderValidationIssues(issues) {
  if (!(localizationValidationIssuesBody instanceof HTMLElement)) return;
  localizationValidationIssuesBody.innerHTML = "";
  const list = Array.isArray(issues) ? issues : [];
  if (!list.length) {
    const tr = document.createElement("tr");
    const emptyText = localizedStatus("localization.validation.no_issues", "No issues found.");
    tr.innerHTML = `<td colspan="4" class="lhai-help">${escapeHtml(emptyText)}</td>`;
    localizationValidationIssuesBody.appendChild(tr);
    return;
  }

  for (const issue of list) {
    const tr = document.createElement("tr");
    const severity = String(issue?.severity || "info").toLowerCase();
    const code = String(issue?.code || "");
    if (code === "PLACEHOLDER_MISMATCH" || severity === "error") {
      tr.classList.add("admin-localization__validation-row--error");
    }
    const key = String(issue?.key || "");
    const message = String(issue?.message || "");
    tr.innerHTML = `
      <td><span class="admin-localization__severity ${severityClass(severity)}">${escapeHtml(severity)}</span></td>
      <td><code>${escapeHtml(code)}</code></td>
      <td><code>${escapeHtml(key)}</code></td>
      <td>${escapeHtml(message)}</td>
    `;
    localizationValidationIssuesBody.appendChild(tr);
  }
}

function showValidationResult(result) {
  cachedValidationResult = result && typeof result === "object" ? result : null;
  if (!(localizationValidationCard instanceof HTMLElement)) return;
  localizationValidationCard.hidden = false;

  const placeholderErrors = Number(result?.placeholder_errors ?? 0);
  if (localizationValidationPlaceholderAlert instanceof HTMLElement) {
    if (placeholderErrors > 0) {
      localizationValidationPlaceholderAlert.hidden = false;
      localizationValidationPlaceholderAlert.className =
        "lhai-help u-mb-2 admin-localization__validation-placeholder-alert";
      localizationValidationPlaceholderAlert.textContent = localizedStatus(
        "localization.validation.placeholder_alert",
        "{count} placeholder error(s) found. Fix these before publishing translated copy.",
        { count: placeholderErrors.toLocaleString() }
      );
    } else {
      localizationValidationPlaceholderAlert.hidden = true;
      localizationValidationPlaceholderAlert.textContent = "";
    }
  }

  renderValidationSummary(result);
  renderValidationIssues(result?.issues);

  const issueCount = Array.isArray(result?.issues) ? result.issues.length : 0;
  if (localizationValidationStatus instanceof HTMLElement) {
    setLocalizedText(
      localizationValidationStatus,
      "localization.validation.summary",
      "Validation finished: {issues} issue(s) across {checked} row(s).",
      {
        issues: issueCount.toLocaleString(),
        checked: Number(result?.checked_rows ?? 0).toLocaleString(),
      }
    );
  }
}

function listCellHtml(items) {
  const list = Array.isArray(items) ? items.filter(Boolean) : [];
  if (!list.length) return '<span class="lhai-help">—</span>';
  return list.map((item) => `<code>${escapeHtml(String(item))}</code>`).join("<br>");
}

function renderCanonicalizationSummary(result) {
  if (!(localizationCanonicalizationSummary instanceof HTMLElement)) return;
  const scanned = Number(result?.scanned_keys ?? 0);
  const duplicateGroups = Number(result?.duplicate_groups ?? 0);
  const canonicalKeys = Number(result?.canonical_keys_created ?? 0);
  const aliases = Number(result?.aliases_created ?? 0);
  const merged = Number(result?.translations_merged ?? 0);
  const conflicts = Array.isArray(result?.conflicts) ? result.conflicts.length : 0;
  const errors = Array.isArray(result?.errors) ? result.errors.length : 0;

  const stat = (labelKey, labelFallback, value, { error = false } = {}) => `
    <div class="admin-localization__validation-stat${error ? " admin-localization__validation-stat--error" : ""}">
      <span class="admin-localization__validation-stat-label">${escapeHtml(localizedStatus(labelKey, labelFallback))}</span>
      <span class="admin-localization__validation-stat-value">${escapeHtml(String(value.toLocaleString()))}</span>
    </div>
  `;

  localizationCanonicalizationSummary.innerHTML = `
    ${stat("localization.canonicalization.scanned_keys", "Scanned keys", scanned)}
    ${stat("localization.validation.duplicate_groups", "Duplicate groups", duplicateGroups)}
    ${stat("localization.canonicalization.canonical_keys", "Canonical keys", canonicalKeys)}
    ${stat("localization.canonicalization.aliases", "Aliases", aliases)}
    ${stat("localization.canonicalization.translations_merged", "Translations merged", merged)}
    ${stat("localization.canonicalization.conflicts", "Conflicts", conflicts, { error: conflicts > 0 })}
    ${stat("localization.canonicalization.errors", "Errors", errors, { error: errors > 0 })}
  `;
}

function renderCanonicalizationGroups(groups) {
  if (!(localizationCanonicalizationGroupsBody instanceof HTMLElement)) return;
  localizationCanonicalizationGroupsBody.innerHTML = "";
  const list = Array.isArray(groups) ? groups : [];
  if (!list.length) {
    const tr = document.createElement("tr");
    const emptyText = localizedStatus("localization.canonicalization.no_groups", "No duplicate groups found.");
    tr.innerHTML = `<td colspan="5" class="lhai-help">${escapeHtml(emptyText)}</td>`;
    localizationCanonicalizationGroupsBody.appendChild(tr);
    return;
  }

  for (const group of list) {
    const tr = document.createElement("tr");
    const canonicalKey = String(group?.canonical_key || "");
    const sourceText = String(group?.source_text || "");
    tr.innerHTML = `
      <td><code>${escapeHtml(canonicalKey)}</code></td>
      <td title="${escapeHtml(sourceText)}">${escapeHtml(sourceText)}</td>
      <td>${listCellHtml(group?.duplicate_keys)}</td>
      <td>${listCellHtml(group?.aliases_to_create)}</td>
      <td>${listCellHtml(group?.translations_to_merge)}</td>
    `;
    localizationCanonicalizationGroupsBody.appendChild(tr);
  }
}

function renderCanonicalizationConflicts(conflicts) {
  if (!(localizationCanonicalizationConflictsBody instanceof HTMLElement)) return;
  localizationCanonicalizationConflictsBody.innerHTML = "";
  const list = Array.isArray(conflicts) ? conflicts : [];
  if (!list.length) {
    const tr = document.createElement("tr");
    const emptyText = localizedStatus("localization.canonicalization.no_conflicts", "No merge conflicts.");
    tr.innerHTML = `<td colspan="5" class="lhai-help">${escapeHtml(emptyText)}</td>`;
    localizationCanonicalizationConflictsBody.appendChild(tr);
    return;
  }

  for (const conflict of list) {
    const tr = document.createElement("tr");
    if (Array.isArray(conflict?.rejected_keys) && conflict.rejected_keys.length) {
      tr.classList.add("admin-localization__validation-row--error");
    }
    const rejectedKeys = Array.isArray(conflict?.rejected_keys) ? conflict.rejected_keys : [];
    const rejectedValues = Array.isArray(conflict?.rejected_values) ? conflict.rejected_values : [];
    const rejectedParts = rejectedKeys.map((key, index) => {
      const value = rejectedValues[index] != null ? String(rejectedValues[index]) : "";
      return value ? `${key}: ${value}` : String(key);
    });
    tr.innerHTML = `
      <td><code>${escapeHtml(String(conflict?.canonical_key || ""))}</code></td>
      <td><code>${escapeHtml(String(conflict?.language_code || ""))}</code></td>
      <td><code>${escapeHtml(String(conflict?.chosen_key || ""))}</code></td>
      <td>${escapeHtml(String(conflict?.chosen_value || ""))}</td>
      <td>${listCellHtml(rejectedParts)}</td>
    `;
    localizationCanonicalizationConflictsBody.appendChild(tr);
  }
}

function showCanonicalizationResult(result, { isPreview = true } = {}) {
  cachedCanonicalizationResult = result && typeof result === "object" ? result : null;
  cachedCanonicalizationIsPreview = Boolean(isPreview);
  if (!(localizationCanonicalizationCard instanceof HTMLElement)) return;
  localizationCanonicalizationCard.hidden = false;

  if (localizationCanonicalizationDryRunNote instanceof HTMLElement) {
    localizationCanonicalizationDryRunNote.hidden = !isPreview;
  }

  renderCanonicalizationSummary(result);
  renderCanonicalizationGroups(isPreview ? result?.groups : cachedCanonicalizationResult?.groups);
  renderCanonicalizationConflicts(result?.conflicts);

  const errors = Array.isArray(result?.errors) ? result.errors.map((item) => String(item)).filter(Boolean) : [];
  if (localizationCanonicalizationErrors instanceof HTMLElement) {
    if (errors.length) {
      localizationCanonicalizationErrors.hidden = false;
      localizationCanonicalizationErrors.textContent = errors.join("\n");
    } else {
      localizationCanonicalizationErrors.hidden = true;
      localizationCanonicalizationErrors.textContent = "";
    }
  }

  if (localizationCanonicalizationStatus instanceof HTMLElement) {
    const duplicateGroups = Number(result?.duplicate_groups ?? 0);
    const aliases = Number(result?.aliases_created ?? 0);
    const merged = Number(result?.translations_merged ?? 0);
    if (isPreview) {
      setLocalizedText(
        localizationCanonicalizationStatus,
        "localization.canonicalization.summary_preview",
        "Preview finished: {groups} duplicate group(s), {aliases} alias(es) planned, {merged} translation merge(s) planned.",
        {
          groups: duplicateGroups.toLocaleString(),
          aliases: aliases.toLocaleString(),
          merged: merged.toLocaleString(),
        }
      );
    } else {
      setLocalizedText(
        localizationCanonicalizationStatus,
        "localization.canonicalization.summary_apply",
        "Cleanup applied: {aliases} alias(es) created, {merged} translation merge(s) completed.",
        {
          aliases: aliases.toLocaleString(),
          merged: merged.toLocaleString(),
        }
      );
    }
  }
}

async function runCanonicalizationPreview({ switchToUiStrings = true } = {}) {
  setPageAlert("");
  if (localizationCanonicalizationCard instanceof HTMLElement) localizationCanonicalizationCard.hidden = false;
  if (localizationCanonicalizationStatus instanceof HTMLElement) {
    setLocalizedText(localizationCanonicalizationStatus, "localization.messages.loading", "Loading...");
  }

  const result = await adminI18nStringsApi.previewCanonicalization();
  showCanonicalizationResult(result, { isPreview: true });
  if (switchToUiStrings && activePanelId !== "panel-ui-strings") {
    activatePanel("panel-ui-strings");
  }
  localizationCanonicalizationCard?.scrollIntoView({ behavior: "smooth", block: "start" });
  return result;
}

async function runCanonicalizationApply({ skipConfirm = false, preview = null } = {}) {
  const plan = preview || cachedCanonicalizationResult;
  if (!skipConfirm) {
    const confirmMessage = plan
      ? localizedStatus(
          "localization.canonicalization.confirm_apply_with_counts",
          "Apply canonical key cleanup for {groups} duplicate group(s)? This will create {canonical} canonical key(s), {aliases} alias(es), and merge {merged} translation(s). Legacy keys are kept; nothing is deleted.",
          {
            groups: Number(plan.duplicate_groups ?? 0).toLocaleString(),
            canonical: Number(plan.canonical_keys_created ?? 0).toLocaleString(),
            aliases: Number(plan.aliases_created ?? 0).toLocaleString(),
            merged: Number(plan.translations_merged ?? 0).toLocaleString(),
          }
        )
      : localizedStatus(
          "localization.canonicalization.confirm_apply",
          "Apply canonical key cleanup? Legacy keys are kept as aliases; nothing is deleted."
        );
    if (!window.confirm(confirmMessage)) return false;
  }

  setPageAlert("");
  if (localizationCanonicalizationStatus instanceof HTMLElement) {
    setLocalizedText(localizationCanonicalizationStatus, "localization.messages.loading", "Loading...");
  }

  const result = await adminI18nStringsApi.applyCanonicalization();
  showCanonicalizationResult(
    {
      ...result,
      groups: Array.isArray(plan?.groups) ? plan.groups : [],
    },
    { isPreview: false }
  );
  setLocalizedPageAlert("localization.canonicalization.apply_completed", "Canonical key cleanup applied.");
  if (activePanelId === "panel-ui-strings") {
    await loadUiStringsTable();
  }
  localizationCanonicalizationCard?.scrollIntoView({ behavior: "smooth", block: "start" });
  return true;
}

async function runValidation({ switchToUiStrings = true } = {}) {
  setPageAlert("");
  if (localizationValidationCard instanceof HTMLElement) localizationValidationCard.hidden = false;
  if (localizationValidationStatus instanceof HTMLElement) {
    setLocalizedText(localizationValidationStatus, "localization.messages.loading", "Loading...");
  }

  const result = await adminI18nStringsApi.validateCatalog();
  showValidationResult(result);
  if (switchToUiStrings && activePanelId !== "panel-ui-strings") {
    activatePanel("panel-ui-strings");
  }
  localizationValidationCard?.scrollIntoView({ behavior: "smooth", block: "start" });
  return result;
}

function translationCellHtml(row, code) {
  const value = String(row?.[code] ?? "").trim();
  if (!value) {
    return '<td class="admin-localization__cell--empty"></td>';
  }
  return `<td class="admin-localization__cell--text" title="${escapeHtml(value)}">${escapeHtml(value)}</td>`;
}

function rowTemplate(row) {
  const tr = document.createElement("tr");
  const duplicateKeys = Array.isArray(row.duplicate_keys) ? row.duplicate_keys : [];
  const keyTitle = duplicateKeys.length
    ? `Canonical key. Merged from: ${duplicateKeys.join(", ")}`
    : String(row.key || "");
  tr.innerHTML = `
    <td class="admin-localization__col-key" title="${escapeHtml(keyTitle)}"><code>${escapeHtml(row.key)}</code></td>
    ${LANG_COLUMNS.map((code) => translationCellHtml(row, code)).join("")}
  `;
  return tr;
}

function renderTableRows(tbody, items) {
  if (!(tbody instanceof HTMLElement)) return;
  tbody.innerHTML = "";
  if (!Array.isArray(items) || items.length === 0) {
    const tr = document.createElement("tr");
    const emptyText = localizedStatus("localization.messages.empty", "No items to display.");
    tr.innerHTML = `<td colspan="${CATALOG_TABLE_COLUMN_COUNT}" class="lhai-help">${escapeHtml(emptyText)}</td>`;
    tbody.appendChild(tr);
    return;
  }
  for (const row of items) {
    tbody.appendChild(rowTemplate(row));
  }
}

function fillDomainSelect(selectEl, domains) {
  if (!(selectEl instanceof HTMLSelectElement)) return;
  const current = String(selectEl.value || "");
  selectEl.replaceChildren(localizedOption("", "localization.filters.all", "All"));
  for (const domain of domains) {
    const opt = document.createElement("option");
    opt.value = domain;
    opt.textContent = domain;
    selectEl.appendChild(opt);
  }
  if (current && domains.includes(current)) {
    selectEl.value = current;
  }
}

function refreshLanguageSelectLabels() {
  if (filterLanguage instanceof HTMLSelectElement && filterLanguage.options[0]) {
    setLocalizedText(filterLanguage.options[0], "localization.filters.all", "All");
  }
  if (missingFilterLanguage instanceof HTMLSelectElement && missingFilterLanguage.options[0]) {
    setLocalizedText(
      missingFilterLanguage.options[0],
      "localization.filters.any_missing",
      "All (any missing)"
    );
  }
}

async function loadDomainOptions() {
  let domains = [];
  try {
    domains = await adminI18nStringsApi.listDomains();
  } catch {
    domains = [
      "common",
      "nav",
      "auth",
      "quote",
      "messages",
      "email",
      "scene",
      "services",
      "survey",
      "dashboard",
      "admin",
      "partner",
      "localization",
      "customer",
      "invoice",
    ];
  }
  fillDomainSelect(filterDomain, domains);
  fillDomainSelect(missingFilterDomain, domains);
  refreshLanguageSelectLabels();
}

async function loadUiStringsTable() {
  setLocalizedText(localizationLoadStatus, "localization.messages.loading", "Loading...");
  setPageAlert("");

  const params = {
    domain: String(filterDomain?.value || "").trim() || undefined,
    search: String(filterSearch?.value || "").trim() || undefined,
    language: String(filterLanguage?.value || "").trim() || undefined,
    missing_only: Boolean(filterMissingOnly?.checked),
    limit: 2000,
    offset: 0,
  };

  try {
    const body = await adminI18nStringsApi.listStrings(params);
    const items = Array.isArray(body?.items) ? body.items : [];
    const total = Number(body?.total ?? items.length);
    cachedUiStringsTable = { items, total };
    renderTableRows(localizationTableBody, items);
    setLocalizedText(
      localizationLoadStatus,
      "localization.messages.status_count",
      "{total} items (showing {shown})",
      { total: total.toLocaleString(), shown: items.length.toLocaleString() }
    );
  } catch (err) {
    cachedUiStringsTable = null;
    renderTableRows(localizationTableBody, []);
    const message =
      err instanceof Error
        ? err.message
        : localizedStatus("localization.messages.list_load_failed", "Failed to load list.");
    if (localizationLoadStatus) localizationLoadStatus.textContent = "";
    setPageAlert(message, { error: true });
  }
}

async function loadMissingTable() {
  setLocalizedText(missingLoadStatus, "localization.messages.loading", "Loading...");

  const params = {
    domain: String(missingFilterDomain?.value || "").trim() || undefined,
    search: String(missingFilterSearch?.value || "").trim() || undefined,
    language: String(missingFilterLanguage?.value || "").trim() || undefined,
    missing_only: true,
    limit: 2000,
    offset: 0,
  };

  try {
    const body = await adminI18nStringsApi.listStrings(params);
    const items = Array.isArray(body?.items) ? body.items : [];
    const total = Number(body?.total ?? items.length);
    cachedMissingTable = { items, total };
    renderTableRows(missingTableBody, items);
    setLocalizedText(
      missingLoadStatus,
      "localization.messages.missing_count",
      "{total} missing (showing {shown})",
      { total: total.toLocaleString(), shown: items.length.toLocaleString() }
    );
  } catch (err) {
    cachedMissingTable = null;
    renderTableRows(missingTableBody, []);
    const message =
      err instanceof Error
        ? err.message
        : localizedStatus("localization.messages.list_load_failed", "Failed to load list.");
    if (missingLoadStatus) missingLoadStatus.textContent = "";
    setPageAlert(message, { error: true });
  }
}

function isMissingAutoTranslateRunActive(runId) {
  return runId === missingAutoTranslateRunId && activePanelId === "panel-missing";
}

/** @typedef {{ key: string; language_code: string; reason: string }} AutoTranslateFailedRecord */

/**
 * @param {string} text
 * @returns {AutoTranslateFailedRecord | null}
 */
function parseFailedItemString(text) {
  const match = /^(.+?) \[([^\]]+)\]:\s*(.+)$/.exec(String(text || "").trim());
  if (!match) return null;
  return {
    key: match[1].trim(),
    language_code: match[2].trim(),
    reason: match[3].trim(),
  };
}

/**
 * @param {AutoTranslateFailedRecord} record
 * @returns {string | null}
 */
function failedRecordId(record) {
  const key = String(record?.key || "").trim();
  const lang = String(record?.language_code || "").trim();
  if (!key || !lang) return null;
  return `${key}|${lang}`;
}

/**
 * @param {unknown} summary
 * @returns {AutoTranslateFailedRecord[]}
 */
function collectFailedItemRecords(summary) {
  if (!Array.isArray(summary?.failed_items)) return [];
  return summary.failed_items
    .map((item) => {
      if (typeof item === "string") {
        return parseFailedItemString(item);
      }
      if (item && typeof item === "object") {
        const key = String(item.key || item.id || "").trim();
        const language_code = String(item.language_code || item.lang || "").trim();
        const reason = String(item.reason || item.error || item.message || "").trim();
        if (!key || !language_code) return null;
        return { key, language_code, reason };
      }
      return null;
    })
    .filter(Boolean);
}

/**
 * @param {AutoTranslateFailedRecord} record
 * @returns {string}
 */
function formatAutoTranslateFailedSummary(record) {
  return localizedStatus(
    "localization.messages.auto_translate_failed_summary",
    "{key} [{language}]: {reason}",
    {
      key: record.key,
      language: record.language_code,
      reason:
        record.reason ||
        localizedStatus("localization.messages.auto_translate_failed", "Auto translate failed."),
    }
  );
}

/**
 * @param {unknown} summary
 * @returns {string[]}
 */
function collectFailedItemsFromSummary(summary) {
  return collectFailedItemRecords(summary).map(formatAutoTranslateFailedSummary);
}

function showAutoTranslateResult({
  totalTranslated,
  totalFailed,
  totalSkipped,
  failedItemRecords,
  silentIfEmpty,
}) {
  const samples = (failedItemRecords || [])
    .slice(0, AUTO_TRANSLATE_MAX_FAILURE_SAMPLES)
    .map(formatAutoTranslateFailedSummary)
    .filter(Boolean);
  const sampleText = samples.length ? ` ${samples.join(" | ")}` : "";

  if (totalTranslated === 0 && totalFailed === 0 && totalSkipped === 0 && silentIfEmpty) {
    return;
  }

  const summaryLine = localizedStatus(
    "localization.messages.auto_translate_finished",
    "Auto translate finished: {filled} filled, {failed} failed.",
    {
      filled: totalTranslated.toLocaleString(),
      failed: totalFailed.toLocaleString(),
    }
  );

  if (totalFailed > 0 || samples.length) {
    setPageAlert(`${summaryLine}${sampleText}`, { error: true });
  } else if (totalTranslated > 0) {
    setPageAlert(summaryLine, { error: false });
  } else if (totalSkipped > 0) {
    setPageAlert(summaryLine, { error: false });
  }
}

function resolveAutoTranslateTargetLanguage() {
  const selected = String(missingFilterLanguage?.value || "").trim();
  if (!selected) {
    return { ok: false, reason: "missing" };
  }
  if (selected === "en") {
    return { ok: false, reason: "english_source" };
  }
  if (!AUTO_TRANSLATE_TARGET_LANGUAGES.includes(selected)) {
    return { ok: false, reason: "unsupported" };
  }
  return { ok: true, language: selected };
}

function showAutoTranslateTargetLanguageError(reason) {
  if (reason === "english_source") {
    setPageAlert(
      localizedStatus(
        "localization.messages.auto_translate_english_source_blocked",
        "English is the source language. Select es, ko, zh-Hans, zh-Hant, or ja as the target."
      ),
      { error: true }
    );
    return;
  }
  setLocalizedPageAlert(
    "localization.messages.select_target_language_before_auto_translate",
    "Please select one target language before auto-translating.",
    { error: true }
  );
}

function setMissingAutoTranslateBtnDisabled(disabled) {
  if (missingAutoTranslateBtn instanceof HTMLButtonElement) {
    missingAutoTranslateBtn.disabled = disabled;
  }
}

async function onMissingAutoTranslateClick() {
  const target = resolveAutoTranslateTargetLanguage();
  if (!target.ok) {
    showAutoTranslateTargetLanguageError(target.reason);
    return;
  }

  missingAutoTranslateRunId += 1;
  const runId = missingAutoTranslateRunId;
  setMissingAutoTranslateBtnDisabled(true);
  try {
    await runAutoTranslateMissingChained({ runId, silentIfEmpty: false });
    if (isMissingAutoTranslateRunActive(runId)) {
      await loadMissingTable();
    }
  } finally {
    if (runId === missingAutoTranslateRunId) {
      setMissingAutoTranslateBtnDisabled(false);
    }
  }
}

async function runAutoTranslateMissingChained({
  runId,
  silentIfEmpty = false,
  batchLimit = MISSING_AUTO_TRANSLATE_BATCH_LIMIT,
  maxBatches = MISSING_AUTO_TRANSLATE_MAX_BATCHES,
} = {}) {
  const activeRunId = runId ?? ++missingAutoTranslateRunId;
  const domain = String(missingFilterDomain?.value || "").trim() || undefined;
  const target = resolveAutoTranslateTargetLanguage();
  if (!target.ok) {
    showAutoTranslateTargetLanguageError(target.reason);
    if (missingLoadStatus) missingLoadStatus.textContent = "";
    return { translated: 0, failed: 0, skipped: 0, errors: [], failedItems: [] };
  }
  const targetLanguageCodes = [target.language];

  let totalTranslated = 0;
  let totalFailed = 0;
  let remainingSkipped = 0;
  const errorMessages = [];
  const failedItemRecords = [];
  const failedItemIds = new Set();

  setLocalizedText(
    missingLoadStatus,
    "localization.messages.auto_translate_started",
    "Auto translation started..."
  );
  setPageAlert("");

  for (let batch = 0; batch < maxBatches; batch += 1) {
    if (!isMissingAutoTranslateRunActive(activeRunId)) {
      return {
        translated: totalTranslated,
        failed: totalFailed,
        skipped: remainingSkipped,
        errors: errorMessages,
        failedItems: failedItemRecords,
      };
    }

    setLocalizedText(
      missingLoadStatus,
      "localization.messages.auto_translate_batch",
      "Auto translating batch {batch}...",
      { batch: batch + 1 }
    );

    let summary;
    try {
      summary = await adminI18nStringsApi.autoTranslateMissing({
        domain,
        targetLanguageCodes,
        limit: batchLimit,
        publish: false,
      });
    } catch (err) {
      console.error("[admin-localization] auto-translate batch failed", {
        batch: batch + 1,
        domain,
        targetLanguageCodes,
        err,
      });
      setLocalizedPageAlert(
        "localization.messages.auto_translate_failed",
        "Auto translate failed.",
        { error: true }
      );
      if (missingLoadStatus) missingLoadStatus.textContent = "";
      return {
        translated: totalTranslated,
        failed: totalFailed,
        skipped: remainingSkipped,
        errors: errorMessages,
        failedItems: failedItemRecords,
      };
    }

    const requested = Number(summary?.requested ?? 0);
    const translated = Number(summary?.translated ?? 0);
    const failed = Number(summary?.failed ?? 0);
    const skipped = Number(summary?.skipped ?? 0);
    const batchFailedRecords = collectFailedItemRecords(summary);
    const batchFailedItems = batchFailedRecords.map(formatAutoTranslateFailedSummary);
    let repeatedFailure = false;

    totalTranslated += translated;
    totalFailed += failed;
    remainingSkipped = skipped;
    errorMessages.push(...batchFailedItems);
    failedItemRecords.push(...batchFailedRecords);

    for (const record of batchFailedRecords) {
      const itemId = failedRecordId(record);
      if (!itemId) continue;
      if (failedItemIds.has(itemId)) {
        repeatedFailure = true;
      }
      failedItemIds.add(itemId);
    }

    if (translated > 0 && isMissingAutoTranslateRunActive(activeRunId)) {
      await loadMissingTable();
    }

    if (requested <= 0) {
      break;
    }

    if (translated <= 0 && failed <= 0) {
      break;
    }

    if (translated <= 0 && failed > 0) {
      break;
    }

    if (repeatedFailure) {
      break;
    }
  }

  if (!isMissingAutoTranslateRunActive(activeRunId)) {
    return {
      translated: totalTranslated,
      failed: totalFailed,
      skipped: remainingSkipped,
      errors: errorMessages,
      failedItems: failedItemRecords,
    };
  }

  showAutoTranslateResult({
    totalTranslated,
    totalFailed,
    totalSkipped: remainingSkipped,
    failedItemRecords,
    silentIfEmpty,
  });
  if (missingLoadStatus) {
    if (totalTranslated === 0 && totalFailed === 0 && silentIfEmpty) {
      missingLoadStatus.textContent = "";
    } else if (totalTranslated > 0 || totalFailed > 0) {
      missingLoadStatus.textContent = "";
    }
  }

  return {
    translated: totalTranslated,
    failed: totalFailed,
    skipped: remainingSkipped,
    errors: errorMessages,
    failedItems: failedItemRecords,
  };
}

function activatePanel(panelId) {
  if (activePanelId === "panel-missing" && panelId !== "panel-missing") {
    missingAutoTranslateRunId += 1;
    setMissingAutoTranslateBtnDisabled(false);
  }
  activePanelId = panelId;
  const tabButtons = tabsRoot ? Array.from(tabsRoot.querySelectorAll("[data-panel]")) : [];
  tabButtons.forEach((btn) => {
    const pid = btn.getAttribute("data-panel");
    const isActive = pid === panelId;
    btn.classList.toggle("is-active", isActive);
    btn.setAttribute("aria-selected", isActive ? "true" : "false");
  });

  const panels = panelsRoot
    ? Array.from(panelsRoot.querySelectorAll(".admin-localization__tab-panel"))
    : [];
  panels.forEach((panel) => {
    const shouldShow = panel.id === panelId;
    if (shouldShow) {
      panel.removeAttribute("hidden");
    } else {
      panel.setAttribute("hidden", "hidden");
    }
  });

  if (panelId === "panel-ui-strings") {
    void loadUiStringsTable();
  } else if (panelId === "panel-missing") {
    void loadMissingTable();
  }
}

function resetUiFilters() {
  if (filterDomain instanceof HTMLSelectElement) filterDomain.value = "";
  if (filterSearch instanceof HTMLInputElement) filterSearch.value = "";
  if (filterLanguage instanceof HTMLSelectElement) filterLanguage.value = "";
  if (filterMissingOnly instanceof HTMLInputElement) filterMissingOnly.checked = false;
}

async function runExport() {
  setPageAlert("");
  try {
    await adminI18nStringsApi.exportExcel();
    setLocalizedPageAlert("localization.messages.export_downloaded", "Excel export downloaded.");
  } catch (err) {
    const message =
      err instanceof Error
        ? err.message
        : localizedStatus("localization.messages.export_failed", "Export failed.");
    setPageAlert(message, { error: true });
  }
}

function showImportSummary(summary) {
  if (!(importSummary instanceof HTMLElement)) return;
  if (!summary || typeof summary !== "object") {
    importSummary.hidden = true;
    importSummary.textContent = "";
    return;
  }
  importSummary.hidden = false;
  importSummary.textContent = JSON.stringify(summary, null, 2);
}

async function runImport() {
  setPageAlert("");
  const file = importFileInput?.files?.[0];
  if (!file) {
    setLocalizedPageAlert("localization.messages.import_select_file", "Select a .xlsx file to import.", {
      error: true,
    });
    return;
  }
  const name = String(file.name || "").toLowerCase();
  if (!name.endsWith(".xlsx")) {
    setLocalizedPageAlert(
      "localization.messages.import_only_xlsx",
      "Only .xlsx files are supported.",
      { error: true }
    );
    return;
  }

  if (importSubmitBtn instanceof HTMLButtonElement) importSubmitBtn.disabled = true;
  try {
    const summary = await adminI18nStringsApi.importExcel(file, {
      clearEmptyTranslations: Boolean(importClearEmpty?.checked),
    });
    showImportSummary(summary);
    const errors = Array.isArray(summary?.errors) ? summary.errors : [];
    if (errors.length) {
      setLocalizedPageAlert(
        "localization.messages.import_ok_with_errors",
        "Import finished with {count} error(s). See summary.",
        { error: true, params: { count: String(errors.length) } }
      );
    } else {
      setLocalizedPageAlert("localization.messages.import_completed", "Import completed.");
    }
    if (activePanelId === "panel-ui-strings") {
      await loadUiStringsTable();
    } else if (activePanelId === "panel-missing") {
      await loadMissingTable();
    }
  } catch (err) {
    showImportSummary(null);
    const message =
      err instanceof Error
        ? err.message
        : localizedStatus("localization.messages.import_failed", "Import failed.");
    setPageAlert(message, { error: true });
  } finally {
    if (importSubmitBtn instanceof HTMLButtonElement) importSubmitBtn.disabled = false;
  }
}

function bindEvents() {
  if (tabsRoot) {
    tabsRoot.querySelectorAll("[data-panel]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const panelId = btn.getAttribute("data-panel");
        if (!panelId) return;
        activatePanel(panelId);
      });
    });
  }

  localizationRefreshBtn?.addEventListener("click", () => {
    void loadUiStringsTable();
  });
  localizationFilterResetBtn?.addEventListener("click", () => {
    resetUiFilters();
    void loadUiStringsTable();
  });

  for (const el of [filterDomain, filterLanguage, filterMissingOnly]) {
    el?.addEventListener("change", () => {
      if (activePanelId === "panel-ui-strings") void loadUiStringsTable();
    });
  }
  filterSearch?.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && activePanelId === "panel-ui-strings") {
      void loadUiStringsTable();
    }
  });

  missingRefreshBtn?.addEventListener("click", () => {
    void loadMissingTable();
  });
  missingAutoTranslateBtn?.addEventListener("click", () => {
    void onMissingAutoTranslateClick();
  });
  for (const el of [missingFilterDomain, missingFilterLanguage]) {
    el?.addEventListener("change", () => {
      if (activePanelId === "panel-missing") void loadMissingTable();
    });
  }
  missingFilterSearch?.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && activePanelId === "panel-missing") {
      void loadMissingTable();
    }
  });

  localizationExportBtn?.addEventListener("click", () => {
    void runExport();
  });
  importSubmitBtn?.addEventListener("click", () => {
    void runImport();
  });
}

function rerenderUiStringsTableFromCache() {
  if (!cachedUiStringsTable) return;
  const { items, total } = cachedUiStringsTable;
  renderTableRows(localizationTableBody, items);
  setLocalizedText(
    localizationLoadStatus,
    "localization.messages.status_count",
    "{total} items (showing {shown})",
    { total: total.toLocaleString(), shown: items.length.toLocaleString() }
  );
}

function rerenderMissingTableFromCache() {
  if (!cachedMissingTable) return;
  const { items, total } = cachedMissingTable;
  renderTableRows(missingTableBody, items);
  setLocalizedText(
    missingLoadStatus,
    "localization.messages.missing_count",
    "{total} missing (showing {shown})",
    { total: total.toLocaleString(), shown: items.length.toLocaleString() }
  );
}

function refreshLocalizationPageI18n() {
  const main = document.getElementById("main");
  if (main) applyI18nToDom(main);
  refreshLanguageSelectLabels();
  const domains = [];
  if (filterDomain instanceof HTMLSelectElement) {
    for (let i = 1; i < filterDomain.options.length; i += 1) {
      const value = filterDomain.options[i]?.value;
      if (value) domains.push(value);
    }
  }
  if (domains.length) {
    fillDomainSelect(filterDomain, domains);
    fillDomainSelect(missingFilterDomain, domains);
  }
  if (activePanelId === "panel-ui-strings") {
    rerenderUiStringsTableFromCache();
    if (cachedValidationResult) {
      renderValidationSummary(cachedValidationResult);
      renderValidationIssues(cachedValidationResult.issues);
    }
    if (cachedCanonicalizationResult) {
      renderCanonicalizationSummary(cachedCanonicalizationResult);
      renderCanonicalizationGroups(cachedCanonicalizationResult.groups);
      renderCanonicalizationConflicts(cachedCanonicalizationResult.conflicts);
    }
  } else if (activePanelId === "panel-missing") {
    rerenderMissingTableFromCache();
  }
}

wireDynamicPageI18nRefresh(() => {
  refreshLocalizationPageI18n();
});

async function initAdminLocalizationPage() {
  if (!protectCurrentPage()) return;
  if (!ensureTierAccess(ROLE_TIER.TWO)) {
    window.location.href = "dashboard.html";
    return;
  }
  await appPageLanguageReady;
  await loadSidebar("#sidebar", "admin");
  const main = document.getElementById("main");
  if (main) applyI18nToDom(main);
  await loadDomainOptions();
  bindEvents();
  activatePanel("panel-ui-strings");
}

void initAdminLocalizationPage();
