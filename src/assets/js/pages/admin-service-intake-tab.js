/**
 * Customer Intake Builder tab — ordered blocks (questions, description, dividers) via admin service-intake API.
 * Overview: `LandingHelpAI_backend/docs/customer_intake_builder.md`.
 */
import { initAdminIntakePreview } from "../intake/admin-intake-preview.js";
import {
  VP_UI_MARKER,
  applyDynamicYearMinOptionsToChildren,
  buildAllVehiclePreferenceChildren,
  buildVehiclePreferenceChildrenForCount,
  isVehiclePreferenceBiddingGroup,
  vehiclePreferenceSlotCountFromChildren,
} from "../intake/vehicle-preference-intake.js";
import { adminApi, serviceIntakeAdminApi } from "../core/api.js";
import { msdOnServiceContextChanged, msdRefresh } from "./admin-service-documents-tab.js";
import {
  workflowHydrateForCreate,
  workflowTabActivated,
} from "./admin-service-workflow-tab.js";
import { t } from "../core/i18n-client.js";
import { applyI18nToDom } from "../core/i18n-dom.js";
import { qs, qsa, resolveBackendMediaUrl, safeText } from "../core/utils.js";

function esc(v) {
  return safeText(v);
}

function msiPlainTextPreview(v) {
  const raw = String(v || "");
  if (!raw) return "";
  if (!/[<>]/.test(raw)) return raw.replace(/\s+/g, " ").trim();
  const el = document.createElement("div");
  el.innerHTML = raw;
  return String(el.textContent || "").replace(/\s+/g, " ").trim();
}

/** Friendly input types (stored `input_type` values). */
const MSI_INPUT_TYPES = [
  { value: "text", i18nKey: "common.admin_services.intake.type_text", fallback: "Text" },
  { value: "number", i18nKey: "common.admin_services.intake.type_number", fallback: "Number" },
  {
    value: "currency_usd",
    i18nKey: "common.admin_services.intake.type_currency_usd",
    fallback: "Currency USD",
  },
  { value: "date", i18nKey: "common.admin_services.intake.type_date", fallback: "Date" },
  { value: "textarea", i18nKey: "common.admin_services.intake.type_textarea", fallback: "Textarea" },
  { value: "select", i18nKey: "common.admin_services.intake.type_select", fallback: "Select" },
  { value: "radio", i18nKey: "common.admin_services.intake.type_radio", fallback: "Radio" },
  { value: "checkbox", i18nKey: "common.admin_services.intake.type_checkbox", fallback: "Checkbox" },
  { value: "multi_select", i18nKey: "common.admin_services.intake.type_multi_select", fallback: "Multi-select" },
];

/** @type {{ key: string, label: string, category: string }[]} */
let msiRegistryPrefillFields = [];
/** @type {{ key: string, label: string, category: string }[]} */
let msiRegistryWriteBackFields = [];
let msiRegistryLoadPromise = null;

const MSI_LEGACY_USER_PREFILL_SOURCES = [
  { key: "user.email", label: "user.email" },
  { key: "user.phone", label: "user.phone" },
  { key: "user.display_name", label: "user.display_name" },
  { key: "user.date_of_birth", label: "user.date_of_birth" },
];

const MSI_PREFILL_MODES = ["auto_fill", "dropdown_existing_values", "hide_if_exists", "confirm_existing_value"];

/** Stored on field / question-group child ``visibility_rule_json.partner_visibility``. */
const PARTNER_VISIBILITY_MASKED_UNTIL_ASSIGNED = "MASKED_UNTIL_ASSIGNED";

function msiAdaptPrefillFromStored(raw) {
  const p = raw && typeof raw === "object" ? /** @type {Record<string, unknown>} */ (raw) : {};
  const legacySource = String(p.source || "").trim();
  /** @type {string[]} */
  let sources = [];
  if (Array.isArray(p.sources)) {
    sources = p.sources.map((x) => String(x || "").trim()).filter(Boolean);
  } else if (legacySource) {
    sources = [legacySource];
  }
  let mode = String(p.mode || "").trim();
  if (!MSI_PREFILL_MODES.includes(mode)) {
    const ex = String(p.existing_value_behavior || "prefill_and_show");
    const map = {
      prefill_and_show: "dropdown_existing_values",
      prefill_and_skip: "hide_if_exists",
      confirm_only: "confirm_existing_value",
      ask_always: "auto_fill",
    };
    mode = map[ex] || "dropdown_existing_values";
  }
  const enabled = Boolean(p.enabled) && sources.length > 0;
  return {
    enabled,
    mode: enabled ? mode : "dropdown_existing_values",
    sources: enabled ? sources : [],
    source: sources[0] || "",
    editable: p.editable !== false,
    hide_empty_values: p.hide_empty_values !== false,
    allow_manual_input: p.allow_manual_input !== false,
    existing_value_behavior: String(p.existing_value_behavior || "prefill_and_show"),
    missing_value_behavior: String(p.missing_value_behavior || "ask"),
    write_back: Boolean(p.write_back),
  };
}

function msiAdaptWriteBackFromStored(raw, legacyPrefill) {
  const wb = raw && typeof raw === "object" ? /** @type {Record<string, unknown>} */ (raw) : null;
  const pf = legacyPrefill && typeof legacyPrefill === "object" ? legacyPrefill : {};
  if (wb && ("enabled" in wb || "target" in wb)) {
    return {
      enabled: Boolean(wb.enabled),
      target: String(wb.target || "").trim(),
      overwrite_policy: String(wb.overwrite_policy || "confirm_if_existing").trim() || "confirm_if_existing",
    };
  }
  if (pf.write_back && pf.source) {
    return { enabled: true, target: String(pf.source), overwrite_policy: "confirm_if_existing" };
  }
  return { enabled: false, target: "", overwrite_policy: "confirm_if_existing" };
}

function msiRegistryFieldOptionsHtml(fields, { selected = [], selectLabel = true, multiple = false } = {}) {
  const selSet = new Set((selected || []).map((x) => String(x).trim()).filter(Boolean));
  const mk = (value, label) => {
    const v = String(value || "").trim();
    const selectedAttr = selSet.has(v) ? " selected" : "";
    return `<option value="${esc(v)}"${selectedAttr}>${esc(label || v)}</option>`;
  };
  const parts = [];
  if (selectLabel && !multiple) {
    parts.push(mk("", t("common.admin_services.intake.prefill_placeholder", "— Choose a field —")));
  }
  const legacy = MSI_LEGACY_USER_PREFILL_SOURCES.filter((f) => !fields.some((r) => r.key === f.key));
  if (legacy.length) {
    parts.push(`<optgroup label="${esc(t("common.admin_services.intake.prefill_group_user", "User account"))}">`);
    for (const f of legacy) parts.push(mk(f.key, f.label));
    parts.push("</optgroup>");
  }
  const byCat = new Map();
  for (const f of fields) {
    const cat = f.category || "other";
    if (!byCat.has(cat)) byCat.set(cat, []);
    byCat.get(cat).push(f);
  }
  for (const [cat, rows] of byCat) {
    parts.push(`<optgroup label="${esc(cat)}">`);
    for (const f of rows) parts.push(mk(f.key, `${f.label} (${f.key})`));
    parts.push("</optgroup>");
  }
  return parts.join("");
}

/** Fallback for question-group child rows (single select). */
function msiPrefillSourceOptionsHtml(selectedValue = "", selectLabel = false) {
  const fields = msiRegistryPrefillFields.length ? msiRegistryPrefillFields : [];
  const selected = String(selectedValue || "").trim();
  return msiRegistryFieldOptionsHtml(fields, {
    selected: selected ? [selected] : [],
    selectLabel,
    multiple: false,
  });
}

async function msiLoadCustomerProfileFieldRegistry() {
  if (msiRegistryLoadPromise) return msiRegistryLoadPromise;
  msiRegistryLoadPromise = (async () => {
    const statusEl = qs("#manageServiceIntakePrefillRegistryStatus");
    try {
      const [prefillRes, writeRes] = await Promise.all([
        adminApi.listCustomerProfileFields({ allowed_as_prefill: true }),
        adminApi.listCustomerProfileFields({ allowed_as_write_back: true }),
      ]);
      msiRegistryPrefillFields = (prefillRes?.fields || []).map((f) => ({
        key: f.key,
        label: f.label,
        category: f.category || "other",
      }));
      msiRegistryWriteBackFields = (writeRes?.fields || []).map((f) => ({
        key: f.key,
        label: f.label,
        category: f.category || "other",
      }));
      if (statusEl) {
        statusEl.hidden = true;
        statusEl.textContent = "";
      }
    } catch (err) {
      msiRegistryPrefillFields = [];
      msiRegistryWriteBackFields = [];
      if (statusEl) {
        statusEl.hidden = false;
        statusEl.textContent =
          err && typeof err.message === "string"
            ? err.message
            : t("common.admin_services.intake.prefill_registry_error", "Could not load profile fields; using legacy list.");
      }
    }
    msiRebuildPrefillRegistrySelects();
  })();
  return msiRegistryLoadPromise;
}

function msiRebuildPrefillRegistrySelects() {
  const sourcesSel = qs("#manageServiceIntakePrefillSources");
  const targetSel = qs("#manageServiceIntakeWriteBackTarget");
  const selectedSources = sourcesSel instanceof HTMLSelectElement
    ? Array.from(sourcesSel.selectedOptions).map((o) => o.value)
    : [];
  const selectedTarget = targetSel instanceof HTMLSelectElement ? targetSel.value : "";
  if (sourcesSel instanceof HTMLSelectElement) {
    sourcesSel.innerHTML = msiRegistryFieldOptionsHtml(msiRegistryPrefillFields, {
      selected: selectedSources,
      selectLabel: false,
      multiple: true,
    });
  }
  if (targetSel instanceof HTMLSelectElement) {
    targetSel.innerHTML = msiRegistryFieldOptionsHtml(msiRegistryWriteBackFields, {
      selected: selectedTarget ? [selectedTarget] : [],
      selectLabel: true,
      multiple: false,
    });
  }
}

function msiSyncPrefillSubcontrolsDisabled() {
  const want = qs("#manageServiceIntakePrefillEnabled") instanceof HTMLInputElement && qs("#manageServiceIntakePrefillEnabled").checked;
  const wbWant =
    qs("#manageServiceIntakeWriteBackEnabled") instanceof HTMLInputElement &&
    qs("#manageServiceIntakeWriteBackEnabled").checked;
  for (const id of [
    "manageServiceIntakePrefillMode",
    "manageServiceIntakePrefillSources",
    "manageServiceIntakePrefillHideEmpty",
    "manageServiceIntakePrefillAllowManual",
    "manageServiceIntakePrefillEditable",
    "manageServiceIntakePrefillMissingBehavior",
    "manageServiceIntakeWriteBackEnabled",
    "manageServiceIntakeWriteBackTarget",
    "manageServiceIntakeWriteBackPolicy",
  ]) {
    const el = qs(`#${id}`);
    if (!(el instanceof HTMLInputElement || el instanceof HTMLSelectElement)) continue;
    if (id.startsWith("manageServiceIntakeWriteBack") && id !== "manageServiceIntakeWriteBackEnabled") {
      el.disabled = !wbWant;
    } else if (id === "manageServiceIntakeWriteBackEnabled") {
      el.disabled = false;
    } else {
      el.disabled = !want;
    }
  }
}

function msiApplyPrefillToDialog(prefill, writeBack) {
  const p = msiAdaptPrefillFromStored(prefill);
  const wb = msiAdaptWriteBackFromStored(writeBack, p);
  const eb = qs("#manageServiceIntakePrefillEnabled");
  if (eb instanceof HTMLInputElement) eb.checked = Boolean(p.enabled);
  const modeEl = qs("#manageServiceIntakePrefillMode");
  if (modeEl instanceof HTMLSelectElement) {
    modeEl.value = MSI_PREFILL_MODES.includes(p.mode) ? p.mode : "dropdown_existing_values";
  }
  const sourcesSel = qs("#manageServiceIntakePrefillSources");
  if (sourcesSel instanceof HTMLSelectElement) {
    sourcesSel.innerHTML = msiRegistryFieldOptionsHtml(msiRegistryPrefillFields, {
      selected: p.sources,
      selectLabel: false,
      multiple: true,
    });
  }
  const hideEl = qs("#manageServiceIntakePrefillHideEmpty");
  if (hideEl instanceof HTMLInputElement) hideEl.checked = p.hide_empty_values !== false;
  const manualEl = qs("#manageServiceIntakePrefillAllowManual");
  if (manualEl instanceof HTMLInputElement) manualEl.checked = p.allow_manual_input !== false;
  const ed = qs("#manageServiceIntakePrefillEditable");
  if (ed instanceof HTMLInputElement) ed.checked = p.editable !== false;
  const miss = qs("#manageServiceIntakePrefillMissingBehavior");
  if (miss instanceof HTMLSelectElement) {
    const v = String(p.missing_value_behavior || "ask");
    miss.value = ["ask", "skip", "block_until_available"].includes(v) ? v : "ask";
  }
  const wbEn = qs("#manageServiceIntakeWriteBackEnabled");
  if (wbEn instanceof HTMLInputElement) wbEn.checked = Boolean(wb.enabled);
  const wbTarget = qs("#manageServiceIntakeWriteBackTarget");
  if (wbTarget instanceof HTMLSelectElement) {
    wbTarget.innerHTML = msiRegistryFieldOptionsHtml(msiRegistryWriteBackFields, {
      selected: wb.target ? [wb.target] : [],
      selectLabel: true,
      multiple: false,
    });
  }
  const wbPol = qs("#manageServiceIntakeWriteBackPolicy");
  if (wbPol instanceof HTMLSelectElement) {
    const pol = String(wb.overwrite_policy || "confirm_if_existing");
    wbPol.value = ["empty_only", "overwrite", "confirm_if_existing", "admin_only_overwrite"].includes(pol)
      ? pol
      : "confirm_if_existing";
  }
  msiSyncPrefillSubcontrolsDisabled();
}

function msiReadPrefillFromDialog() {
  const want = qs("#manageServiceIntakePrefillEnabled") instanceof HTMLInputElement && qs("#manageServiceIntakePrefillEnabled").checked;
  const sourcesSel = qs("#manageServiceIntakePrefillSources");
  /** @type {string[]} */
  const sources =
    sourcesSel instanceof HTMLSelectElement
      ? Array.from(sourcesSel.selectedOptions)
          .map((o) => String(o.value || "").trim())
          .filter(Boolean)
      : [];
  const enabled = Boolean(want && sources.length);
  const modeEl = qs("#manageServiceIntakePrefillMode");
  const mode =
    modeEl instanceof HTMLSelectElement && MSI_PREFILL_MODES.includes(modeEl.value)
      ? modeEl.value
      : "dropdown_existing_values";
  const modeToExisting = {
    auto_fill: "prefill_and_show",
    dropdown_existing_values: "prefill_and_show",
    hide_if_exists: "prefill_and_skip",
    confirm_existing_value: "confirm_only",
  };
  const edEl = qs("#manageServiceIntakePrefillEditable");
  const editable = !(edEl instanceof HTMLInputElement) || edEl.checked;
  const prefill = {
    enabled,
    mode: enabled ? mode : "dropdown_existing_values",
    sources: enabled ? sources : [],
    source: sources[0] || "",
    editable,
    hide_empty_values: !(qs("#manageServiceIntakePrefillHideEmpty") instanceof HTMLInputElement) || qs("#manageServiceIntakePrefillHideEmpty").checked,
    allow_manual_input: !(qs("#manageServiceIntakePrefillAllowManual") instanceof HTMLInputElement) || qs("#manageServiceIntakePrefillAllowManual").checked,
    existing_value_behavior: modeToExisting[mode] || "prefill_and_show",
    missing_value_behavior:
      qs("#manageServiceIntakePrefillMissingBehavior") instanceof HTMLSelectElement
        ? qs("#manageServiceIntakePrefillMissingBehavior").value || "ask"
        : "ask",
    write_back: false,
  };
  const wbEn = qs("#manageServiceIntakeWriteBackEnabled") instanceof HTMLInputElement && qs("#manageServiceIntakeWriteBackEnabled").checked;
  const wbTargetEl = qs("#manageServiceIntakeWriteBackTarget");
  const target = wbTargetEl instanceof HTMLSelectElement ? String(wbTargetEl.value || "").trim() : "";
  const write_back = {
    enabled: Boolean(wbEn && target),
    target: wbEn && target ? target : "",
    overwrite_policy:
      qs("#manageServiceIntakeWriteBackPolicy") instanceof HTMLSelectElement
        ? qs("#manageServiceIntakeWriteBackPolicy").value || "confirm_if_existing"
        : "confirm_if_existing",
  };
  return { prefill, write_back };
}

let msiTemplate = null;
let msiFields = [];
/** @type {Array<Record<string, unknown>>} Full template block list (question + content); aligns with API `blocks`. */
let msiBlocks = [];
let msiLastOpenedContentBlockId = "";
/** Deep copy of the open content block when the side editor opens; restored on Cancel / backdrop / ×. */
let msiSideEditorSnapshot = null;
/** Set only by the Save button click handler; blocks accidental API writes on dismiss. */
let msiSideSaveRequested = false;
/** Bumped on Cancel / × / backdrop / block switch so in-flight Save cannot commit after dismiss. */
let msiSideEditorSession = 0;
/** Suppress intake list clicks right after dismiss (avoids ghost clicks on Save / Edit under the cursor). */
let msiSideDismissGuardUntil = 0;
/** Deep copy of the legacy field dialog field when it opens; restored on Cancel / Escape / backdrop. */
let msiFieldDialogSnapshot = null;
/** @type {Set<string>} */
let msiDeletedOptionIds = new Set();
/** @type {{ id: string, label: string, active: boolean }[]} */
let msiDialogChoices = [];
/** When true, loaded visibility is not expressible in the simple builder. */
let msiVisibilityCustomMode = false;
/** Copy of custom rule JSON for save if advanced textarea is cleared by mistake. */
let msiVisibilityCustomSnapshot = null;

/** Rich text (Quill) for content-block body; plain textarea fallback if Quill CDN failed. */
let msiBodyQuill = null;

const MSI_BODY_MAX_LEN = 8000;

function msiNormalizeQuillHtml(html) {
  const raw = String(html || "");
  const collapsed = raw.replace(/\s+/g, "").toLowerCase();
  if (!collapsed || collapsed === "<p><br></p>" || collapsed === "<p></p>") return "";
  return raw;
}

function msiEnsureBodyQuill() {
  if (msiBodyQuill) return msiBodyQuill;
  const Q = typeof window !== "undefined" ? window.Quill : null;
  const host = qs("#manageServiceIntakeSideBodyQuillHost");
  const ta = qs("#manageServiceIntakeSideBody");
  if (!host) return null;
  if (!Q) {
    if (ta instanceof HTMLTextAreaElement) {
      ta.hidden = false;
      ta.removeAttribute("aria-hidden");
    }
    host.hidden = true;
    return null;
  }
  if (ta instanceof HTMLTextAreaElement) {
    ta.hidden = true;
    ta.setAttribute("aria-hidden", "true");
  }
  host.hidden = false;
  msiBodyQuill = new Q(host, {
    theme: "snow",
    placeholder: t("common.admin_services.intake.side_body_placeholder", "본문을 입력하세요…"),
    modules: {
      toolbar: [
        ["bold", "italic", "underline", "strike"],
        [{ list: "ordered" }, { list: "bullet" }],
        [{ color: [] }, { background: [] }],
        ["link", "image"],
        ["clean"],
      ],
    },
  });
  const toolbar = msiBodyQuill.getModule("toolbar");
  if (toolbar && typeof toolbar.addHandler === "function") {
    toolbar.addHandler("image", () => {
      void msiQuillInsertImageFromUpload(msiBodyQuill);
    });
  }
  return msiBodyQuill;
}

/** @param {import("quill").default | null} quill */
async function msiQuillInsertImageFromUpload(quill) {
  if (!quill) return;
  const input = document.createElement("input");
  input.type = "file";
  input.accept = "image/jpeg,image/png,image/gif,image/webp";
  input.onchange = () => {
    void (async () => {
      const file = input.files?.[0];
      if (!file) return;
      const statusEl = qs("#manageServiceIntakeStatus");
      try {
        if (statusEl) statusEl.textContent = t("common.admin_services.intake.side_media_uploading", "업로드 중…");
        const res = await serviceIntakeAdminApi.uploadIntakeContentImage(file);
        const u = res && typeof res.media_url === "string" ? resolveBackendMediaUrl(res.media_url.trim()) : "";
        if (!u) throw new Error("Invalid upload response");
        const range = quill.getSelection(true);
        const index = range && typeof range.index === "number" ? range.index : quill.getLength();
        quill.insertEmbed(index, "image", u, "user");
        quill.setSelection(index + 1, 0, "silent");
        if (statusEl) {
          statusEl.textContent = t(
            "common.admin_services.intake.side_body_image_inserted",
            "Image added to body. Click Save to keep changes."
          );
        }
      } catch (err) {
        const msg = err && typeof err.message === "string" ? err.message : String(err);
        if (statusEl) statusEl.textContent = msg;
        window.alert(msg);
      }
    })();
  };
  input.click();
}

function msiSetSideBodyEditorHtml(html) {
  const q = msiEnsureBodyQuill();
  if (!q) {
    const ta = qs("#manageServiceIntakeSideBody");
    if (ta instanceof HTMLTextAreaElement) ta.value = String(html ?? "");
    return;
  }
  const h = String(html ?? "").trim();
  if (!h) {
    q.setContents([], "silent");
    return;
  }
  // Important: reset editor first so previous block body never bleeds into current block.
  q.setContents([], "silent");
  q.clipboard.dangerouslyPasteHTML(0, h, "silent");
}

function msiGetSideBodyEditorHtml() {
  const q = msiBodyQuill || msiEnsureBodyQuill();
  if (!q) {
    const ta = qs("#manageServiceIntakeSideBody");
    return ta instanceof HTMLTextAreaElement ? ta.value : "";
  }
  return msiNormalizeQuillHtml(q.root.innerHTML);
}

function msiAllowedInputTypeSet() {
  return new Set(MSI_INPUT_TYPES.map((x) => x.value));
}

function msiNormalizeStoredInputType(v) {
  const s = String(v || "text").toLowerCase();
  if (msiAllowedInputTypeSet().has(s)) return s;
  if (s === "email" || s === "phone") return "text";
  if (s === "boolean") return "checkbox";
  return "text";
}

function msiFormatInputTypeLabel(inputType) {
  const s = msiNormalizeStoredInputType(inputType);
  const row = MSI_INPUT_TYPES.find((x) => x.value === s);
  return row ? t(row.i18nKey, row.fallback) : String(inputType || "text");
}

function msiIsChoiceType(inputType) {
  const it = String(inputType || "").toLowerCase();
  return it === "select" || it === "radio" || it === "multi_select";
}

function msiIsSelectType(inputType) {
  return String(inputType || "").toLowerCase() === "select";
}

/** @param {unknown} vis */
function msiVisMaskUntilPartnerAssigned(vis) {
  const v = vis && typeof vis === "object" ? /** @type {Record<string, unknown>} */ (vis) : {};
  return String(v.partner_visibility || "").trim().toUpperCase() === PARTNER_VISIBILITY_MASKED_UNTIL_ASSIGNED;
}

/** @param {Record<string, unknown>} vis */
function msiVisWithMaskUntilPartnerAssigned(vis, enabled) {
  const out = { ...(vis && typeof vis === "object" ? vis : {}) };
  if (enabled) {
    out.partner_visibility = PARTNER_VISIBILITY_MASKED_UNTIL_ASSIGNED;
  } else if (String(out.partner_visibility || "").toUpperCase() === PARTNER_VISIBILITY_MASKED_UNTIL_ASSIGNED) {
    delete out.partner_visibility;
  }
  return out;
}

/** Help text in question-group child rows (description + textarea only; label is under Question label). */
function msiQgChildHelpFieldHtml(helpText) {
  const ht = String(helpText ?? "");
  return `
              <p class="lhai-help u-mt-2">${esc(
                t(
                  "common.admin_services.intake.qgroup_child_help_desc",
                  "도움말 항목: 고객 화면에서 입력 칸 아래에 보이는 짧은 안내 문구입니다. 드롭다운 선택지는 Field type을 Select로 선택한 뒤 아래 Options에 한 줄에 하나씩 입력하세요."
                )
              )}</p>
              <textarea class="lhai-textarea msi-qg-child-help" rows="2" maxlength="2000">${esc(ht)}</textarea>`;
}

function msiQgChildFooterTogglesHtml(required, maskUntilAssigned, showMask = true) {
  const maskToggle = showMask
    ? `
                <label class="admin-services__switch">
                  <input type="checkbox" class="msi-qg-child-mask-until-assigned" ${maskUntilAssigned ? "checked" : ""} />
                  <span class="admin-services__switch-slider" aria-hidden="true"></span>
                  <span class="admin-services__switch-label">${esc(
                    t("common.admin_services.intake.toggle_mask_until_partner", "Mask for partners until assigned")
                  )}</span>
                </label>`
    : "";
  const maskHelp = showMask
    ? `<p class="lhai-help u-mt-1">${esc(
        t(
          "common.admin_services.intake.toggle_mask_until_partner_help",
          "While bidding is open, partners see only the first character of the answer; the rest is shown as asterisks until a partner is selected."
        )
      )}</p>`
    : "";
  return `
              <div class="admin-services__intake-qg-footer-toggles u-mt-2">
                <label class="admin-services__switch">
                  <input type="checkbox" class="msi-qg-child-req" ${required ? "checked" : ""} />
                  <span class="admin-services__switch-slider" aria-hidden="true"></span>
                  <span class="admin-services__switch-label">${esc(t("common.admin_services.intake.qgroup_child_required", "Required"))}</span>
                </label>
                ${maskToggle}
              </div>
              ${maskHelp}`;
}

function msiQgChildOptionsBlockHtml(optLines, inputType) {
  const hidden = !msiIsSelectType(inputType);
  return `
              <div class="msi-qg-child-options-wrap u-mt-2"${hidden ? " hidden" : ""}>
                <label class="lhai-label">${esc(t("common.admin_services.intake.qgroup_child_options", "Options (choice fields only)"))}</label>
                <textarea class="lhai-textarea msi-qg-child-options" rows="3" maxlength="8000" placeholder="value|label">${esc(optLines)}</textarea>
              </div>`;
}

function msiQgSyncChildRowFields(row) {
  if (!(row instanceof HTMLElement)) return;
  const typeEl = row.querySelector(".msi-qg-child-type");
  const wrap = row.querySelector(".msi-qg-child-options-wrap");
  if (typeEl instanceof HTMLSelectElement && wrap instanceof HTMLElement) {
    wrap.hidden = !msiIsSelectType(typeEl.value);
  }
}

function msiQgWireChildRowTypeHandlers(root) {
  const scope = root instanceof HTMLElement ? root : qs("#msiQgChildren");
  if (!scope) return;
  scope.querySelectorAll("[data-qg-child-row]").forEach((row) => {
    if (!(row instanceof HTMLElement)) return;
    msiQgSyncChildRowFields(row);
    const typeEl = row.querySelector(".msi-qg-child-type");
    if (typeEl instanceof HTMLSelectElement && typeEl.dataset.msiQgTypeBound !== "1") {
      typeEl.dataset.msiQgTypeBound = "1";
      typeEl.addEventListener("change", () => msiQgSyncChildRowFields(row));
    }
  });
}

function msiSortedFields() {
  return [...msiFields].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
}

function msiSortedBlocks() {
  return [...msiBlocks].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
}

function msiFieldForQuestionBlock(blockId) {
  return msiFields.find((f) => f.id === blockId) || null;
}

const MSI_CONTENT_BLOCK_TYPES = ["description", "divider", "question_group"];

/** Legacy notice / image / rich_text rows use the same editor and display name. */
const MSI_DESCRIPTION_LIKE_BLOCK_TYPES = new Set(["description", "notice", "image", "rich_text"]);

function msiIsDescriptionLikeBlock(bt) {
  return MSI_DESCRIPTION_LIKE_BLOCK_TYPES.has(String(bt || "").trim().toLowerCase());
}

function msiBlockTypeLabel(bt) {
  const raw = String(bt || "").trim().toLowerCase();
  if (msiIsDescriptionLikeBlock(raw)) {
    return t("common.admin_services.intake.block_type_description", "Description");
  }
  const k = `common.admin_services.intake.block_type_${raw.replace(/-/g, "_")}`;
  const fallbacks = {
    question: "Question",
    question_group: "Questions",
    divider: "Divider",
  };
  return t(k, fallbacks[raw] || raw || "");
}

/** One-line explanation for admins (cards, tooltips, side panel). */
function msiBlockTypeHelp(bt) {
  if (msiIsDescriptionLikeBlock(bt)) {
    return t(
      "common.admin_services.intake.block_type_description_help",
      "Title, rich text (with inline images), and an optional featured image. Use Visibility to show only when a previous answer matches."
    );
  }
  const k = `common.admin_services.intake.block_type_${String(bt || "").replace(/-/g, "_")}_help`;
  const fallbacks = {
    question:
      "Interactive step: collects an answer (text, choices, date, etc.). Use visibility on later blocks to branch on this answer.",
    question_group:
      "Customer questions in one step. Use one field for a single question, or several fields together (e.g. first + last name). Edit all fields inside this block.",
    bidding_question_group:
      "Partner bidding questions for CAR bid requests. Choose vehicle (make, model, …) or global (budget, timeline) scope in the editor.",
    divider:
      "Non-content spacer—separate sections without adding reading load.",
  };
  return t(k, fallbacks[String(bt)] || "");
}

function msiIntakeMaxSortOrder() {
  return msiSortedBlocks().reduce((m, b) => Math.max(m, Number(b.sort_order) || 0), -1);
}

/**
 * Appends a practical starter sequence (intro → image → branch question → conditional notice → follow-up → warning → summary).
 * Uses stable option values for branching (`yes` / `no`).
 */
async function msiApplyPhoneStylePreset() {
  const serviceItemId = qs("#manageServiceId")?.value?.trim();
  if (!serviceItemId) return;
  const existing = msiSortedBlocks();
  if (existing.length > 0) {
    const ok = window.confirm(
      t(
        "common.admin_services.intake.preset_phone_confirm_append",
        "Append the Phone-style starter blocks to the end of this list? Existing blocks stay in place."
      )
    );
    if (!ok) return;
  }
  const statusEl = qs("#manageServiceIntakeStatus");
  const btn = qs("#manageServiceIntakePresetPhoneBtn");
  let order = msiIntakeMaxSortOrder() + 1;
  const T = (key, fb) => t(key, fb);
  try {
    if (btn instanceof HTMLButtonElement) {
      btn.disabled = true;
      btn.setAttribute("aria-busy", "true");
    }
    if (statusEl) statusEl.textContent = t("common.admin_services.intake.preset_working", "Adding starter blocks…");
    const tmpl = await msiEnsureTemplate(serviceItemId);
    if (!tmpl?.id) throw new Error("template");

    await serviceIntakeAdminApi.createBlock(tmpl.id, {
      block_type: "description",
      sort_order: order++,
      payload: {
        title: T("common.admin_services.intake.preset_phone_intro_title", "Before we start"),
        body: T(
          "common.admin_services.intake.preset_phone_intro_body",
          "Briefly explain what you will ask and why. Replace this text with your service-specific intro."
        ),
        caption: "",
        alt_text: "",
        media_url: "",
        media_asset_id: "",
        media_kind: "none",
        media_layout: "default",
        style_variant: "emphasis",
      },
      visibility_rule_json: {},
    });

    await serviceIntakeAdminApi.createBlock(tmpl.id, {
      block_type: "description",
      sort_order: order++,
      payload: {
        title: T("common.admin_services.intake.preset_phone_image_title", "What this looks like"),
        body: "",
        media_url: "",
        media_asset_id: "",
        caption: T(
          "common.admin_services.intake.preset_phone_image_caption",
          "Add an image URL or media asset ID above in Edit."
        ),
        alt_text: T("common.admin_services.intake.preset_phone_image_alt", "Illustration or diagram"),
        media_kind: "image",
        media_layout: "default",
        style_variant: "default",
      },
      visibility_rule_json: {},
    });

    const branchChildId = msiNewLocalId();
    await serviceIntakeAdminApi.createBlock(tmpl.id, {
      block_type: "question_group",
      sort_order: order++,
      payload: msiDefaultStandardQuestionGroupPayload({
        title: T("common.admin_services.intake.preset_phone_q_branch", "Does this situation apply to you?"),
        help_text: T(
          "common.admin_services.intake.preset_phone_q_branch_help",
          "The next notice appears only if the customer chooses Yes—edit Visibility on that block if needed."
        ),
        input_type: "radio",
        required: true,
        children: [
          {
            id: branchChildId,
            label: T("common.admin_services.intake.preset_phone_q_branch", "Does this situation apply to you?"),
            help_text: T(
              "common.admin_services.intake.preset_phone_q_branch_help",
              "The next notice appears only if the customer chooses Yes—edit Visibility on that block if needed."
            ),
            input_type: "radio",
            required: true,
            options: [
              { value: "yes", label: T("common.admin_services.intake.preset_phone_opt_yes", "Yes"), active: true },
              { value: "no", label: T("common.admin_services.intake.preset_phone_opt_no", "No"), active: true },
            ],
          },
        ],
      }),
      visibility_rule_json: {},
    });

    await serviceIntakeAdminApi.createBlock(tmpl.id, {
      block_type: "description",
      sort_order: order++,
      payload: {
        title: T("common.admin_services.intake.preset_phone_cond_notice_title", "Because you chose Yes"),
        body: T(
          "common.admin_services.intake.preset_phone_cond_notice_body",
          "Explain what happens next or what documents to prepare. This block is set to show only when the previous question equals “yes”."
        ),
        caption: "",
        alt_text: "",
        media_url: "",
        media_asset_id: "",
        media_kind: "none",
        media_layout: "default",
        style_variant: "default",
      },
      visibility_rule_json: {
        mode: "when_answer_equals",
        source_field_id: branchChildId,
        match_value: "yes",
      },
    });

    await serviceIntakeAdminApi.createBlock(tmpl.id, {
      block_type: "question_group",
      sort_order: order++,
      payload: msiDefaultStandardQuestionGroupPayload({
        title: T("common.admin_services.intake.preset_phone_q_followup", "Tell us more (optional)"),
        help_text: T(
          "common.admin_services.intake.preset_phone_q_followup_help",
          "A follow-up text question—set Visibility if it should depend on an earlier answer."
        ),
        childLabel: T("common.admin_services.intake.preset_phone_q_followup", "Tell us more (optional)"),
        input_type: "textarea",
        required: false,
      }),
      visibility_rule_json: {},
    });

    await serviceIntakeAdminApi.createBlock(tmpl.id, {
      block_type: "description",
      sort_order: order++,
      payload: {
        title: T("common.admin_services.intake.preset_phone_warn_title", "Important"),
        body: T(
          "common.admin_services.intake.preset_phone_warn_body",
          "Use this for compliance, deadlines, or limits. Style is set to Warning—adjust in Edit if you like."
        ),
        caption: "",
        alt_text: "",
        media_url: "",
        media_asset_id: "",
        media_kind: "none",
        media_layout: "default",
        style_variant: "warning",
      },
      visibility_rule_json: {},
    });

    await serviceIntakeAdminApi.createBlock(tmpl.id, {
      block_type: "description",
      sort_order: order++,
      payload: {
        title: T("common.admin_services.intake.preset_phone_summary_title", "Summary & next steps"),
        body: T(
          "common.admin_services.intake.preset_phone_summary_body",
          "List what happens after submission, turnaround time, or how you will contact them. Customers see this near the end of the flow."
        ),
        caption: "",
        alt_text: "",
        media_url: "",
        media_asset_id: "",
        media_kind: "none",
        media_layout: "default",
        style_variant: "default",
      },
      visibility_rule_json: {},
    });

    await msiRefresh();
    if (statusEl) statusEl.textContent = t("common.admin_services.intake.preset_done", "Starter blocks added. Edit each block to match your service.");
  } catch (err) {
    const msg = err && typeof err.message === "string" ? err.message : String(err);
    if (statusEl) statusEl.textContent = msg;
    window.alert(msg || t("common.admin_services.intake.preset_error", "Could not add starter blocks."));
  } finally {
    if (btn instanceof HTMLButtonElement) {
      btn.disabled = false;
      btn.removeAttribute("aria-busy");
    }
  }
}

const MSI_BIDDING_ADD_BTN_IDS = [];

function msiSyncBiddingAddButtonsVisibility() {
  for (const id of MSI_BIDDING_ADD_BTN_IDS) {
    const el = qs(`#${id}`);
    if (el instanceof HTMLElement) el.hidden = true;
  }
}

function msiWireIntakeBuilderHints() {
  const map = [
    ["#manageServiceIntakeAddDescriptionBtn", "description"],
    ["#manageServiceIntakeAddDividerBtn", "divider"],
    ["#manageServiceIntakeAddQuestionGroupBtn", "question_group"],
  ];
  for (const [sel, bt] of map) {
    const el = qs(sel);
    if (el) el.setAttribute("title", msiBlockTypeHelp(bt));
  }
  const presetBtn = qs("#manageServiceIntakePresetPhoneBtn");
  if (presetBtn) {
    presetBtn.setAttribute(
      "title",
      t(
        "common.admin_services.intake.preset_phone_tooltip",
        "Adds a sample flow: intro, image, branching question, conditional notice, follow-up, warning, and summary. Safe to edit or delete blocks afterward."
      )
    );
  }
}

function msiBlockCardTitle(block) {
  const bt = String(block.block_type || "");
  if (bt === "question") {
    const f = msiFieldForQuestionBlock(block.id);
    return f?.label || f?.field_key || "—";
  }
  const p = /** @type {Record<string, string>} */ (block.payload || {});
  if (bt === "question_group") {
    return String(p.title || "").trim() || msiBlockTypeLabel("question_group");
  }
  const body = msiPlainTextPreview(p.body || "");
  return p.title || (body ? String(body).slice(0, 80) : msiBlockTypeLabel(bt));
}

function msiNewLocalId() {
  const c = typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : "";
  if (c) return c.replace(/[^a-zA-Z0-9._:@/-]/g, "").slice(0, 64);
  return `qg_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

/** @param {Record<string, unknown>} child */
function msiSyntheticFieldFromGroupChild(child) {
  const optsRaw = Array.isArray(child.options) ? child.options : [];
  const options = optsRaw.map((o, i) => {
    const row = o && typeof o === "object" ? /** @type {Record<string, unknown>} */ (o) : {};
    return {
      id: String(row.id || ""),
      field_id: String(child.id || ""),
      value: String(row.value ?? row.label ?? `v${i}`),
      label: String(row.label ?? row.value ?? ""),
      sort_order: Number(row.sort_order ?? i) || i,
      active: row.active !== false,
    };
  });
  return {
    id: String(child.id || ""),
    field_key: String(child.id || ""),
    label: String(child.label || ""),
    help_text: String(child.help_text || ""),
    input_type: String(child.input_type || "text"),
    placeholder: String(child.placeholder || ""),
    required: Boolean(child.required),
    sort_order: 0,
    visibility_rule_json:
      child.visibility_rule_json && typeof child.visibility_rule_json === "object"
        ? { .../** @type {Record<string, unknown>} */ (child.visibility_rule_json) }
        : {},
    default_value: child.default_value != null ? String(child.default_value) : null,
    validation: child.validation && typeof child.validation === "object" ? child.validation : {},
    prefill: {},
    active: true,
    archived_at: null,
    created_at: "",
    updated_at: "",
    options,
  };
}

function msiBlockIndexInSortedBlocks(blockId) {
  const sorted = msiSortedBlocks();
  const idx = sorted.findIndex((b) => String(b.id) === String(blockId));
  return idx < 0 ? sorted.length : idx;
}

/** Fields + question_group child ids that appear earlier than ``blockId`` in the global block list. */
function msiVisibilitySourcesForContentBlock(blockId) {
  const idx = msiBlockIndexInSortedBlocks(blockId);
  const before = msiSortedBlocks().slice(0, idx);
  /** @type {Array<Record<string, unknown>>} */
  const out = [];
  for (const b of before) {
    const bt = String(b.block_type || "");
    if (bt === "question") {
      const f = msiFieldForQuestionBlock(b.id);
      if (f && !f.archived_at) out.push(f);
      continue;
    }
    if (bt !== "question_group") continue;
    const pl = b.payload && typeof b.payload === "object" ? /** @type {Record<string, unknown>} */ (b.payload) : {};
    const kids = Array.isArray(pl.children) ? pl.children : [];
    for (const ch of kids) {
      if (!ch || typeof ch !== "object") continue;
      out.push(msiSyntheticFieldFromGroupChild(/** @type {Record<string, unknown>} */ (ch)));
    }
  }
  return out;
}

/** Resolve visibility “source field” to either a real question field or a ``question_group`` child (synthetic field). */
function msiResolveVisibilitySourceField(sourceId) {
  const sid = String(sourceId || "").trim();
  if (!sid) return null;
  const f = msiFields.find((x) => String(x.id) === sid);
  if (f) return f;
  for (const b of msiSortedBlocks()) {
    if (String(b.block_type || "") !== "question_group") continue;
    const pl = b.payload && typeof b.payload === "object" ? /** @type {Record<string, unknown>} */ (b.payload) : {};
    const kids = Array.isArray(pl.children) ? pl.children : [];
    for (const ch of kids) {
      if (ch && typeof ch === "object" && String(/** @type {Record<string, unknown>} */ (ch).id) === sid) {
        return msiSyntheticFieldFromGroupChild(/** @type {Record<string, unknown>} */ (ch));
      }
    }
  }
  return null;
}

const MSI_QG_CAR_VEHICLE_KEYS = [
  { value: "detail_level", fallback: "Detail level (simple / detailed)" },
  { value: "preference_type", fallback: "Preference type" },
  { value: "vehicle_type", fallback: "Vehicle type" },
  { value: "top_priorities", fallback: "Top priorities" },
  { value: "make", fallback: "Make (brand)" },
  { value: "model", fallback: "Model" },
  { value: "trim", fallback: "Trim" },
  { value: "vehicle_condition", fallback: "Vehicle condition" },
  { value: "year_min", fallback: "Year (min)" },
  { value: "mileage_max", fallback: "Mileage (max)" },
  { value: "budget_max", fallback: "Budget (this vehicle)" },
  { value: "must_have_features", fallback: "Must-have features" },
  { value: "required_options", fallback: "Required options" },
  { value: "color_preference", fallback: "Color preference" },
  { value: "notes", fallback: "Notes" },
];

const MSI_QG_CAR_GLOBAL_KEYS = [
  { value: "budget_max", fallback: "Overall budget max" },
  { value: "cash_purchase", fallback: "Cash purchase" },
  { value: "currency", fallback: "Currency" },
  { value: "desired_timeline", fallback: "Desired timeline" },
  { value: "allow_alternative_offers", fallback: "Allow alternative offers" },
  { value: "location", fallback: "Location" },
];

/** @param {Record<string, unknown>} payload */
function msiQgIsBiddingGroup(payload) {
  return String(payload.group_kind || "").trim().toLowerCase() === "bidding";
}

/** @param {string} scope */
function msiQgCarKeyOptionsHtml(scope, selected) {
  const keys = scope === "global" ? MSI_QG_CAR_GLOBAL_KEYS : MSI_QG_CAR_VEHICLE_KEYS;
  const sel = String(selected || "").trim();
  return keys
    .map((k) => {
      const label = t(`common.admin_services.intake.qgroup_car_key_${k.value}`, k.fallback);
      return `<option value="${esc(k.value)}"${k.value === sel ? " selected" : ""}>${esc(label)}</option>`;
    })
    .join("");
}

/**
 * @param {Record<string, unknown>} child
 * @param {string} bidScope
 */
function msiQgResolveCarKeyFromChild(child, bidScope) {
  const ck = String(child.car_answer_key || "").trim();
  if (ck) return ck;
  const vis = child.visibility_rule_json && typeof child.visibility_rule_json === "object" ? child.visibility_rule_json : {};
  const fromVis = String(/** @type {Record<string, unknown>} */ (vis).car_answer_key || "").trim();
  if (fromVis) return fromVis;
  const keys = bidScope === "global" ? MSI_QG_CAR_GLOBAL_KEYS : MSI_QG_CAR_VEHICLE_KEYS;
  return keys[0]?.value || "make";
}

/**
 * @param {string} bidScope
 * @param {string} carKey
 * @param {number} vehicleIndex
 */
function msiQgBuildBiddingChildVisibility(bidScope, carKey, vehicleIndex) {
  const key = String(carKey || "").trim() || (bidScope === "global" ? "budget_max" : "make");
  if (bidScope === "global") {
    return {
      partner_visibility: "BIDDING_PUBLIC",
      bid_role: "CAR_GLOBAL",
      car_answer_key: key,
    };
  }
  const vIdx = Math.max(1, Math.min(9, vehicleIndex || 1));
  return {
    partner_visibility: "BIDDING_PUBLIC",
    bid_role: "CAR_REQUIREMENT",
    vehicle_request_index: vIdx,
    car_answer_key: key,
  };
}

/** @param {Record<string, unknown>} payload */
/** @param {Record<string, unknown>} payload */
function msiQgNormalizeVehiclePreferencePayload(payload) {
  if (!isVehiclePreferenceBiddingGroup(payload)) return payload;
  const kids = Array.isArray(payload.children) ? payload.children : [];
  const fromKids = vehiclePreferenceSlotCountFromChildren(kids);
  const fromMeta = parseInt(String(payload.vehicle_request_index ?? ""), 10);
  const want = Math.max(1, Math.min(9, Number.isFinite(fromMeta) && fromMeta > 0 ? fromMeta : fromKids || 3));
  const hasVpIds = kids.some((ch) => /^vp[1-9]_/.test(String(ch?.id || "")));
  const hasDetailLevel = kids.some((ch) => {
    const ck = String(ch?.car_answer_key || "").trim();
    const id = String(ch?.id || "");
    return ck === "detail_level" || /^vp\d+_detail_level$/.test(id);
  });
  if (fromKids === want && hasVpIds && hasDetailLevel) {
    return {
      ...payload,
      vehicle_request_index: want,
      vehicle_preference_ui: true,
      children: applyDynamicYearMinOptionsToChildren(kids),
    };
  }
  return {
    ...payload,
    vehicle_request_index: want,
    vehicle_preference_ui: true,
    children: applyDynamicYearMinOptionsToChildren(buildVehiclePreferenceChildrenForCount(want)),
  };
}

function msiQgBiddingGroupSettingsHtml(payload) {
  const bidScope = String(payload.bid_scope || "vehicle").trim() === "global" ? "global" : "vehicle";
  const vIdxRaw = payload.vehicle_request_index;
  let vIdx =
    vIdxRaw === null || vIdxRaw === undefined || vIdxRaw === ""
      ? 1
      : Math.max(1, Math.min(9, parseInt(String(vIdxRaw), 10) || 1));
  if (isVehiclePreferenceBiddingGroup(payload)) {
    const fromKids = vehiclePreferenceSlotCountFromChildren(
      Array.isArray(payload.children) ? payload.children : []
    );
    if (fromKids > 0) vIdx = fromKids;
  }
  return `
    <input type="hidden" id="msiQgGroupKind" value="bidding" />
    <section class="msi-qg-bidding-settings u-mt-2 lhai-card u-p-2">
      <p class="lhai-label u-m-0">${esc(
        t("common.admin_services.intake.qgroup_bidding_settings_title", "Partner bidding (CAR)")
      )}</p>
      <p class="lhai-help u-mt-1">${esc(
        t(
          "common.admin_services.intake.qgroup_bidding_settings_help",
          "All questions in this group are shown together to customers and included in partner bid requests. Map each row to a bid spec field below."
        )
      )}</p>
      <label class="lhai-label u-mt-2" for="msiQgBidScope">${esc(
        t("common.admin_services.intake.qgroup_bid_scope", "Bidding scope")
      )}</label>
      <select class="lhai-select" id="msiQgBidScope">
        <option value="vehicle"${bidScope === "vehicle" ? " selected" : ""}>${esc(
          t("common.admin_services.intake.qgroup_bid_scope_vehicle", "Per vehicle (make, model, mileage, …)")
        )}</option>
        <option value="global"${bidScope === "global" ? " selected" : ""}>${esc(
          t("common.admin_services.intake.qgroup_bid_scope_global", "Global (budget, timeline, …)")
        )}</option>
      </select>
      <div class="msi-qg-vehicle-index-wrap u-mt-2"${bidScope !== "vehicle" ? " hidden" : ""}>
        <label class="lhai-label" for="msiQgVehicleIndex">${esc(
          t("common.admin_services.intake.qgroup_vehicle_index", "Vehicle # (multiple cars)")
        )}</label>
        <p class="lhai-help u-mt-1">${esc(
          t(
            "common.admin_services.intake.qgroup_vehicle_index_vp_help",
            "Number of vehicle preference slots (1–9). The first question in each slot is labeled 첫번째 선호 차량, 두번째 선호차량, …"
          )
        )}</p>
        <input class="lhai-input" id="msiQgVehicleIndex" type="number" min="1" max="9" step="1" value="${esc(String(vIdx))}" />
      </div>
    </section>`;
}

/** @param {string} bidScope */
function msiQgChildCarKeyFieldHtml(bidScope, carKey) {
  return `
              <label class="lhai-label u-mt-2">${esc(
                t("common.admin_services.intake.qgroup_child_car_answer_key", "Maps to bid spec field")
              )}</label>
              <select class="lhai-select msi-qg-child-car-key">${msiQgCarKeyOptionsHtml(bidScope, carKey)}</select>`;
}

/** @param {"vehicle"|"global"} scope */
function msiQgBiddingTemplateSpecs(scope) {
  const pl = scope === "global" ? msiDefaultBiddingGlobalGroupPayload() : msiDefaultBiddingVehicleGroupPayload();
  return (Array.isArray(pl.children) ? pl.children : []).map((ch) => {
    const c = ch && typeof ch === "object" ? /** @type {Record<string, unknown>} */ (ch) : {};
    return {
      label: String(c.label || "").trim(),
      input_type: String(c.input_type || "text"),
      required: Boolean(c.required),
      car_answer_key: String(c.car_answer_key || "").trim(),
    };
  });
}

/** @param {Record<string, unknown>} row */
function msiQgChildRowMatchesTemplateSpec(row, spec) {
  return (
    String(row.label || "").trim() === spec.label &&
    String(row.input_type || "text") === spec.input_type &&
    Boolean(row.required) === spec.required &&
    String(row.car_answer_key || "").trim() === spec.car_answer_key
  );
}

/** @param {Array<Record<string, unknown>>} rows @param {"vehicle"|"global"} scope */
function msiQgChildrenRowsMatchTemplate(rows, scope) {
  const specs = msiQgBiddingTemplateSpecs(scope);
  if (rows.length !== specs.length) return false;
  return rows.every((r, i) => msiQgChildRowMatchesTemplateSpec(r, specs[i]));
}

/** @returns {Array<Record<string, unknown>>} */
function msiQgReadChildrenRowsFromDom() {
  const wrap = qs("#msiQgChildren");
  if (!wrap) return [];
  const meta = msiQgReadBiddingGroupMetaFromDom();
  const bidScope = meta.bid_scope === "global" ? "global" : "vehicle";
  /** @type {Array<Record<string, unknown>>} */
  const out = [];
  for (const row of wrap.querySelectorAll("[data-qg-child-row]")) {
    const labEl = row.querySelector(".msi-qg-child-label");
    const typeEl = row.querySelector(".msi-qg-child-type");
    const reqEl = row.querySelector(".msi-qg-child-req");
    const carKeySel = row.querySelector(".msi-qg-child-car-key");
    const label = labEl instanceof HTMLInputElement ? labEl.value.trim() : "";
    const input_type = typeEl instanceof HTMLSelectElement ? typeEl.value : "text";
    const required = reqEl instanceof HTMLInputElement ? reqEl.checked : false;
    const car_answer_key =
      carKeySel instanceof HTMLSelectElement
        ? String(carKeySel.value || "").trim()
        : "";
    out.push({
      label,
      input_type,
      required,
      car_answer_key: car_answer_key || msiQgResolveCarKeyFromChild({ car_answer_key }, bidScope),
    });
  }
  return out;
}

/** @param {Array<Record<string, unknown>>} rows */
function msiQgShouldApplyTemplateOnScopeChange(rows) {
  if (!rows.length) return true;
  if (msiQgChildrenRowsMatchTemplate(rows, "vehicle")) return true;
  if (msiQgChildrenRowsMatchTemplate(rows, "global")) return true;
  return false;
}

function msiQgSyncBiddingChildCarKeySelects(mount, scope) {
  mount.querySelectorAll("[data-qg-child-row]").forEach((row) => {
    const carKeySel = row.querySelector(".msi-qg-child-car-key");
    if (!(carKeySel instanceof HTMLSelectElement)) return;
    const prev = carKeySel.value;
    carKeySel.innerHTML = msiQgCarKeyOptionsHtml(scope, prev);
    if (prev && Array.from(carKeySel.options).some((o) => o.value === prev)) {
      carKeySel.value = prev;
    }
  });
}

function msiQgBindBiddingGroupSettingsHandlers(mount) {
  const scopeSel = mount.querySelector("#msiQgBidScope");
  const syncCarKeysAndVehicleWrap = () => {
    const scope = scopeSel instanceof HTMLSelectElement && scopeSel.value === "global" ? "global" : "vehicle";
    mount.querySelectorAll(".msi-qg-vehicle-index-wrap").forEach((el) => {
      if (el instanceof HTMLElement) el.hidden = scope !== "vehicle";
    });
    msiQgSyncBiddingChildCarKeySelects(mount, scope);
  };
  scopeSel?.addEventListener("change", () => {
    const newScope = scopeSel instanceof HTMLSelectElement && scopeSel.value === "global" ? "global" : "vehicle";
    const rows = msiQgReadChildrenRowsFromDom();
    if (msiQgShouldApplyTemplateOnScopeChange(rows)) {
      const cur = msiReadQuestionGroupPayloadFromSideDom();
      const tpl = newScope === "global" ? msiDefaultBiddingGlobalGroupPayload() : msiDefaultBiddingVehicleGroupPayload();
      /** @type {Record<string, unknown>} */
      const merged = {
        title: cur.title,
        description: cur.description,
        layout: cur.layout,
        group_kind: "bidding",
        bid_scope: newScope,
        children: msiDeepCloneJson(tpl.children),
      };
      if (newScope === "vehicle") {
        merged.vehicle_request_index =
          typeof cur.vehicle_request_index === "number" ? cur.vehicle_request_index : 1;
      }
      msiRenderQuestionGroupSideEditor(merged);
      return;
    }
    syncCarKeysAndVehicleWrap();
  });
  const vEl = mount.querySelector("#msiQgVehicleIndex");
  vEl?.addEventListener("change", () => {
    if (!(vEl instanceof HTMLInputElement)) return;
    const cur = msiReadQuestionGroupPayloadFromSideDom();
    if (!isVehiclePreferenceBiddingGroup(cur)) return;
    const n = Math.max(1, Math.min(9, parseInt(String(vEl.value || "1"), 10) || 1));
    /** @type {Record<string, unknown>} */
    const merged = {
      ...cur,
      vehicle_preference_ui: true,
      vehicle_request_index: n,
      children: buildVehiclePreferenceChildrenForCount(n),
    };
    msiRenderQuestionGroupSideEditor(merged);
  });
  syncCarKeysAndVehicleWrap();
}

function msiQgReadBiddingGroupMetaFromDom() {
  const kindEl = qs("#msiQgGroupKind");
  const group_kind =
    kindEl instanceof HTMLInputElement && kindEl.value.trim().toLowerCase() === "bidding" ? "bidding" : "standard";
  if (group_kind !== "bidding") {
    return { group_kind: "standard" };
  }
  const scopeEl = qs("#msiQgBidScope");
  const bid_scope = scopeEl instanceof HTMLSelectElement && scopeEl.value === "global" ? "global" : "vehicle";
  let vehicle_request_index = 1;
  if (bid_scope === "vehicle") {
    const vEl = qs("#msiQgVehicleIndex");
    if (vEl instanceof HTMLInputElement) {
      vehicle_request_index = Math.max(1, Math.min(9, parseInt(String(vEl.value || "1"), 10) || 1));
    }
  }
  return { group_kind, bid_scope, vehicle_request_index };
}

/** Block-level visibility for bidding vehicle groups (parser group labels). */
function msiQgBlockVisibilityForBiddingGroup(meta) {
  if (meta.group_kind !== "bidding" || meta.bid_scope !== "vehicle") {
    return {};
  }
  return {
    partner_visibility: "BIDDING_PUBLIC",
    vehicle_request_index: meta.vehicle_request_index ?? 1,
  };
}

/** Standard (non-bidding) questions block; one child = single question step. */
function msiDefaultStandardQuestionGroupPayload(overrides = {}) {
  const title =
    typeof overrides.title === "string" && overrides.title.trim()
      ? overrides.title.trim()
      : t("common.admin_services.intake.qgroup_default_title", "New questions");
  const childLabel = typeof overrides.childLabel === "string" ? overrides.childLabel : "";
  const input_type = typeof overrides.input_type === "string" ? overrides.input_type : "text";
  const required = overrides.required !== undefined ? Boolean(overrides.required) : true;
  /** @type {Array<Record<string, unknown>>} */
  const children = Array.isArray(overrides.children) ? overrides.children : [];
  const baseChild = {
    id: msiNewLocalId(),
    label: childLabel,
    help_text: typeof overrides.help_text === "string" ? overrides.help_text : "",
    input_type,
    placeholder: "",
    required,
    default_value: null,
    validation: {},
    options: Array.isArray(overrides.options) ? overrides.options : [],
    prefill: {},
    visibility_rule_json: {},
  };
  return {
    title,
    description: typeof overrides.description === "string" ? overrides.description : "",
    layout: "stack",
    children: children.length ? children : [baseChild],
  };
}

function msiDefaultBiddingVehicleGroupPayload() {
  const slotCount = 3;
  return {
    title: t("common.admin_services.intake.qgroup_bidding_vehicle_title", "Vehicle preferences (bidding)"),
    description: `${VP_UI_MARKER} Add up to 3 vehicle preferences. Simple or detailed mode; selection-based fields with optional notes.`,
    group_kind: "bidding",
    bid_scope: "vehicle",
    vehicle_request_index: slotCount,
    vehicle_preference_ui: true,
    layout: "stack",
    children: buildVehiclePreferenceChildrenForCount(slotCount),
  };
}

function msiDefaultBiddingGlobalGroupPayload() {
  const mk = () => ({
    id: msiNewLocalId(),
    help_text: "",
    placeholder: "",
    default_value: null,
    validation: {},
    options: [],
    prefill: {},
    visibility_rule_json: {},
  });
  return {
    title: t("common.admin_services.intake.qgroup_bidding_global_title", "Purchase preferences (bidding)"),
    description: t(
      "common.admin_services.intake.qgroup_bidding_global_desc",
      "Overall budget and timeline—included in partner CAR bid requests."
    ),
    group_kind: "bidding",
    bid_scope: "global",
    layout: "stack",
    children: [
      {
        ...mk(),
        label: t("common.admin_services.intake.qgroup_bid_child_budget", "Max budget"),
        input_type: "number",
        required: false,
        car_answer_key: "budget_max",
      },
      {
        ...mk(),
        label: t("common.admin_services.intake.qgroup_bid_child_timeline", "Desired timeline"),
        input_type: "text",
        required: false,
        car_answer_key: "desired_timeline",
      },
    ],
  };
}

function msiQgSyncLayoutSectionVisibility() {
  const layoutWrap = qs("#msiQgLayoutWrap");
  const childrenWrap = qs("#msiQgChildren");
  if (!(layoutWrap instanceof HTMLElement) || !childrenWrap) return;
  const count = childrenWrap.querySelectorAll("[data-qg-child-row]").length;
  layoutWrap.hidden = count < 2;
}

function msiRenderQuestionGroupSideEditor(payload) {
  const mount = qs("#manageServiceIntakeSideQuestionGroupMount");
  if (!(mount instanceof HTMLElement)) return;
  mount.hidden = false;
  let p = payload && typeof payload === "object" ? payload : {};
  if (msiQgIsBiddingGroup(p) && String(p.bid_scope || "vehicle") !== "global") {
    p = msiQgNormalizeVehiclePreferencePayload(p);
  }
  const isBidding = msiQgIsBiddingGroup(p);
  const bidScope = String(p.bid_scope || "vehicle").trim() === "global" ? "global" : "vehicle";
  const title = String(p.title || "").trim();
  const desc = String(p.description || "");
  const layout = String(p.layout || "stack") === "inline_2" ? "inline_2" : "stack";
  const children = Array.isArray(p.children) ? p.children : [];
  const typeOpts = MSI_INPUT_TYPES.map(
    (o) => `<option value="${esc(o.value)}">${esc(t(o.i18nKey, o.fallback))}</option>`
  ).join("");
  const childrenHelp = isBidding
    ? t(
        "common.admin_services.intake.qgroup_bidding_children_help",
        "Each row is one field in the bundle (e.g. make, model, mileage). Pick which bid spec field it maps to."
      )
    : t(
        "common.admin_services.intake.qgroup_children_help",
        "Each row is a customer-facing input. For choice fields, add one option per line as value|label."
      );
  mount.innerHTML = `
    ${isBidding ? msiQgBiddingGroupSettingsHtml(p) : ""}
    <div class="u-mt-2">
      <label class="lhai-label" for="msiQgDescription">${esc(t("common.admin_services.intake.qgroup_description", "Group description (optional)"))}</label>
      <textarea class="lhai-textarea" id="msiQgDescription" rows="3" maxlength="4000">${esc(desc)}</textarea>
    </div>
    <div class="u-mt-2" id="msiQgLayoutWrap"${children.length < 2 ? " hidden" : ""}>
      <label class="lhai-label" for="msiQgLayout">${esc(t("common.admin_services.intake.qgroup_layout", "Layout"))}</label>
      <p class="lhai-help u-mt-1">${esc(
        t(
          "common.admin_services.intake.qgroup_layout_help",
          "Choose how multiple questions appear on one screen. Shown when this group has two or more questions."
        )
      )}</p>
      <select class="lhai-select" id="msiQgLayout">
        <option value="stack"${layout === "stack" ? " selected" : ""}>${esc(t("common.admin_services.intake.qgroup_layout_stack", "Stack (one column)"))}</option>
        <option value="inline_2"${layout === "inline_2" ? " selected" : ""}>${esc(t("common.admin_services.intake.qgroup_layout_inline2", "Inline (2 columns)"))}</option>
      </select>
    </div>
    <div class="u-mt-3">
      <div class="u-flex-between u-gap-2" style="flex-wrap:wrap;align-items:center;">
        <p class="lhai-label u-m-0">${esc(t("common.admin_services.intake.qgroup_children", "Questions in this group"))}</p>
        <button type="button" class="lhai-button lhai-button--secondary lhai-button--compact" id="msiQgAddChild">${esc(
          t("common.admin_services.intake.qgroup_add_child", "+ Add question")
        )}</button>
      </div>
      <p class="lhai-help u-mt-1">${esc(childrenHelp)}</p>
      <div id="msiQgChildren" class="u-mt-2">${children
        .map((ch, idx) => {
          const c = ch && typeof ch === "object" ? /** @type {Record<string, unknown>} */ (ch) : {};
          const id = String(c.id || "");
          const lab = String(c.label || "");
          const ht = String(c.help_text || "");
          const it = String(c.input_type || "text");
          const req = Boolean(c.required);
          const childVis =
            c.visibility_rule_json && typeof c.visibility_rule_json === "object"
              ? /** @type {Record<string, unknown>} */ (c.visibility_rule_json)
              : {};
          const maskUntil = msiVisMaskUntilPartnerAssigned(childVis);
          const carKey = msiQgResolveCarKeyFromChild(c, bidScope);
          const prefill = c.prefill && typeof c.prefill === "object" ? /** @type {Record<string, unknown>} */ (c.prefill) : {};
          const prefillSource = String(prefill.source || "").trim();
          const opts = Array.isArray(c.options) ? c.options : [];
          const optLines = opts
            .map((o) => {
              const row = o && typeof o === "object" ? /** @type {Record<string, unknown>} */ (o) : {};
              const v = String(row.value ?? "");
              const l = String(row.label ?? v);
              return `${esc(v)}|${esc(l)}`;
            })
            .join("\n");
          const prefillBlock = isBidding
            ? ""
            : `
              <label class="lhai-label u-mt-2">${esc(
                t("common.admin_services.intake.qgroup_child_prefill_source", "Prefill from saved custom data (optional)")
              )}</label>
              <select class="lhai-select msi-qg-child-prefill-source">
                ${msiPrefillSourceOptionsHtml(prefillSource, true)}
              </select>`;
          const carKeyBlock = isBidding ? msiQgChildCarKeyFieldHtml(bidScope, carKey) : "";
          return `
            <div class="lhai-card u-p-2 u-mb-2" data-qg-child-row="${idx}">
              <input type="hidden" class="msi-qg-child-id" value="${esc(id)}" />
              <div class="admin-services__row-actions u-mb-2" style="justify-content:flex-end;">
                <button type="button" class="lhai-button lhai-button--secondary lhai-button--compact" data-qg-child-up ${idx === 0 ? "disabled" : ""}>↑</button>
                <button type="button" class="lhai-button lhai-button--secondary lhai-button--compact" data-qg-child-down ${idx >= children.length - 1 ? "disabled" : ""}>↓</button>
                <button type="button" class="lhai-button lhai-button--ghost lhai-button--compact" data-qg-child-remove>${esc(t("common.admin_services.intake.choice_remove", "Remove"))}</button>
              </div>
              <label class="lhai-label">${esc(t("common.admin_services.intake.qgroup_child_label", "Label"))}</label>
              <input class="lhai-input msi-qg-child-label" type="text" maxlength="500" value="${esc(lab)}" />
              ${msiQgChildHelpFieldHtml(ht)}
              <label class="lhai-label u-mt-2">${esc(t("common.admin_services.intake.qgroup_child_type", "Field type"))}</label>
              <select class="lhai-select msi-qg-child-type">${typeOpts}</select>
              ${carKeyBlock}
              ${prefillBlock}
              ${msiQgChildFooterTogglesHtml(req, maskUntil, !isBidding)}
              ${msiQgChildOptionsBlockHtml(optLines, it)}
            </div>`;
        })
        .join("")}</div>
    </div>`;
  mount.querySelectorAll(".msi-qg-child-type").forEach((sel) => {
    if (!(sel instanceof HTMLSelectElement)) return;
    const row = sel.closest("[data-qg-child-row]");
    const idx = row ? Number(row.getAttribute("data-qg-child-row")) : NaN;
    const ch = children[Number.isFinite(idx) ? idx : -1];
    const want = ch && typeof ch === "object" ? String(/** @type {Record<string, unknown>} */ (ch).input_type || "text") : "text";
    sel.value = MSI_INPUT_TYPES.some((x) => x.value === want) ? want : "text";
  });
  mount.querySelector("#msiQgAddChild")?.addEventListener("click", () => {
    msiAppendQuestionGroupChildRow();
  });
  mount.querySelector("#msiQgChildren")?.addEventListener("click", (ev) => {
    const up = ev.target.closest("[data-qg-child-up]");
    const down = ev.target.closest("[data-qg-child-down]");
    const rm = ev.target.closest("[data-qg-child-remove]");
    if (!up && !down && !rm) return;
    const wrap = qs("#msiQgChildren");
    if (!wrap) return;
    const row = (up || down || rm).closest("[data-qg-child-row]");
    if (!row || !row.parentElement) return;
    const idx = Number(row.getAttribute("data-qg-child-row"));
    const rows = Array.from(wrap.querySelectorAll("[data-qg-child-row]"));
    if (rm) {
      row.remove();
      Array.from(wrap.querySelectorAll("[data-qg-child-row]")).forEach((r, i) => r.setAttribute("data-qg-child-row", String(i)));
      msiRerenderQuestionGroupChildRowControls();
      msiQgSyncLayoutSectionVisibility();
      return;
    }
    if (up && idx > 0) {
      const prev = rows[idx - 1];
      wrap.insertBefore(row, prev);
    }
    if (down && idx < rows.length - 1) {
      const nxt = rows[idx + 1];
      wrap.insertBefore(nxt, row);
    }
    msiRerenderQuestionGroupChildRowControls();
  });
  if (isBidding) msiQgBindBiddingGroupSettingsHandlers(mount);
  msiQgSyncLayoutSectionVisibility();
  msiQgWireChildRowTypeHandlers(mount);
}

function msiRerenderQuestionGroupChildRowControls() {
  const wrap = qs("#msiQgChildren");
  if (!wrap) return;
  const rows = Array.from(wrap.querySelectorAll("[data-qg-child-row]"));
  rows.forEach((r, i) => {
    r.setAttribute("data-qg-child-row", String(i));
    const up = r.querySelector("[data-qg-child-up]");
    const down = r.querySelector("[data-qg-child-down]");
    if (up instanceof HTMLButtonElement) up.disabled = i === 0;
    if (down instanceof HTMLButtonElement) down.disabled = i >= rows.length - 1;
  });
}

function msiAppendQuestionGroupChildRow() {
  const wrap = qs("#msiQgChildren");
  if (!wrap) return;
  const isBidding = qs("#msiQgGroupKind") instanceof HTMLInputElement;
  const bidScope =
    qs("#msiQgBidScope") instanceof HTMLSelectElement && qs("#msiQgBidScope").value === "global" ? "global" : "vehicle";
  const idx = wrap.querySelectorAll("[data-qg-child-row]").length;
  const typeOpts = MSI_INPUT_TYPES.map(
    (o) => `<option value="${esc(o.value)}">${esc(t(o.i18nKey, o.fallback))}</option>`
  ).join("");
  const prefillBlock = isBidding
    ? ""
    : `
      <label class="lhai-label u-mt-2">${esc(
        t("common.admin_services.intake.qgroup_child_prefill_source", "Prefill from saved custom data (optional)")
      )}</label>
      <select class="lhai-select msi-qg-child-prefill-source">
        ${msiPrefillSourceOptionsHtml("", true)}
      </select>`;
  const carKeyBlock = isBidding ? msiQgChildCarKeyFieldHtml(bidScope, bidScope === "global" ? "budget_max" : "make") : "";
  wrap.insertAdjacentHTML(
    "beforeend",
    `
    <div class="lhai-card u-p-2 u-mb-2" data-qg-child-row="${idx}">
      <input type="hidden" class="msi-qg-child-id" value="${esc(msiNewLocalId())}" />
      <div class="admin-services__row-actions u-mb-2" style="justify-content:flex-end;">
        <button type="button" class="lhai-button lhai-button--secondary lhai-button--compact" data-qg-child-up disabled>↑</button>
        <button type="button" class="lhai-button lhai-button--secondary lhai-button--compact" data-qg-child-down disabled>↓</button>
        <button type="button" class="lhai-button lhai-button--ghost lhai-button--compact" data-qg-child-remove">${esc(t("common.admin_services.intake.choice_remove", "Remove"))}</button>
      </div>
      <label class="lhai-label">${esc(t("common.admin_services.intake.qgroup_child_label", "Label"))}</label>
      <input class="lhai-input msi-qg-child-label" type="text" maxlength="500" value="" />
      ${msiQgChildHelpFieldHtml("")}
      <label class="lhai-label u-mt-2">${esc(t("common.admin_services.intake.qgroup_child_type", "Field type"))}</label>
      <select class="lhai-select msi-qg-child-type">${typeOpts}</select>
      ${carKeyBlock}
      ${prefillBlock}
      ${msiQgChildFooterTogglesHtml(false, !isBidding)}
      ${msiQgChildOptionsBlockHtml("", "text")}
    </div>`
  );
  msiRerenderQuestionGroupChildRowControls();
  msiQgSyncLayoutSectionVisibility();
  msiQgWireChildRowTypeHandlers(wrap);
}

function msiHideQuestionGroupSideEditor() {
  const mount = qs("#manageServiceIntakeSideQuestionGroupMount");
  if (mount instanceof HTMLElement) {
    mount.hidden = true;
    mount.innerHTML = "";
  }
}

function msiReadQuestionGroupPayloadFromSideDom() {
  const title = qs("#manageServiceIntakeSideTitleInput") instanceof HTMLInputElement ? qs("#manageServiceIntakeSideTitleInput").value.trim() : "";
  const descEl = qs("#msiQgDescription");
  const layoutEl = qs("#msiQgLayout");
  const description = descEl instanceof HTMLTextAreaElement ? descEl.value.trim() : "";
  const wrap = qs("#msiQgChildren");
  const childCount = wrap ? wrap.querySelectorAll("[data-qg-child-row]").length : 0;
  const layout =
    childCount >= 2 && layoutEl instanceof HTMLSelectElement && layoutEl.value === "inline_2" ? "inline_2" : "stack";
  /** @type {Array<Record<string, unknown>>} */
  const children = [];
  if (wrap) {
    const rows = Array.from(wrap.querySelectorAll("[data-qg-child-row]"));
    for (const row of rows) {
      const idEl = row.querySelector(".msi-qg-child-id");
      const labEl = row.querySelector(".msi-qg-child-label");
      const typeEl = row.querySelector(".msi-qg-child-type");
      const reqEl = row.querySelector(".msi-qg-child-req");
      const maskEl = row.querySelector(".msi-qg-child-mask-until-assigned");
      const helpEl = row.querySelector(".msi-qg-child-help");
      const prefillSourceEl = row.querySelector(".msi-qg-child-prefill-source");
      const optEl = row.querySelector(".msi-qg-child-options");
      let id = idEl instanceof HTMLInputElement ? idEl.value.trim() : "";
      if (!id) id = msiNewLocalId();
      const label = labEl instanceof HTMLInputElement ? labEl.value.trim() : "";
      const input_type = typeEl instanceof HTMLSelectElement ? typeEl.value : "text";
      const required = reqEl instanceof HTMLInputElement ? reqEl.checked : false;
      const help_text = helpEl instanceof HTMLTextAreaElement ? helpEl.value.trim() : "";
      const prefillSource = prefillSourceEl instanceof HTMLSelectElement ? String(prefillSourceEl.value || "").trim() : "";
      const optRaw = optEl instanceof HTMLTextAreaElement ? optEl.value : "";
      /** @type {Array<Record<string, unknown>>} */
      const options = [];
      for (const line of optRaw.split("\n")) {
        const t0 = line.trim();
        if (!t0) continue;
        const parts = t0.split("|");
        const value = (parts[0] || "").trim();
        const lab = (parts[1] != null ? parts[1] : parts[0]).trim() || value;
        if (!value) continue;
        options.push({ value, label: lab || value, active: true });
      }
      const groupMeta = msiQgReadBiddingGroupMetaFromDom();
      const carKeySel = row.querySelector(".msi-qg-child-car-key");
      const car_answer_key =
        carKeySel instanceof HTMLSelectElement ? String(carKeySel.value || "").trim() : "";
      let visibility_rule_json = {};
      if (groupMeta.group_kind === "bidding") {
        const vpIdx = /^vp([1-9])_/.exec(id);
        const childVehicleIndex = vpIdx ? parseInt(vpIdx[1], 10) : null;
        visibility_rule_json = msiQgBuildBiddingChildVisibility(
          groupMeta.bid_scope || "vehicle",
          car_answer_key,
          childVehicleIndex ?? groupMeta.vehicle_request_index ?? 1
        );
      } else if (maskEl instanceof HTMLInputElement && maskEl.checked) {
        visibility_rule_json = { partner_visibility: PARTNER_VISIBILITY_MASKED_UNTIL_ASSIGNED };
      }
      const childRow = {
        id,
        label: label || t("common.admin_services.intake.qgroup_untitled_child", "Untitled question"),
        help_text,
        input_type,
        placeholder: "",
        required,
        visibility_rule_json,
        prefill: prefillSource
          ? {
              enabled: true,
              source: prefillSource,
              editable: true,
              write_back: false,
              existing_value_behavior: "prefill_and_show",
              missing_value_behavior: "ask",
            }
          : {},
        default_value: null,
        validation: {},
        options,
      };
      if (groupMeta.group_kind === "bidding" && car_answer_key) {
        childRow.car_answer_key = car_answer_key;
      }
      children.push(childRow);
    }
  }
  const base = { title, description, layout, children };
  const groupMeta = msiQgReadBiddingGroupMetaFromDom();
  if (groupMeta.group_kind === "bidding") {
    const out = {
      ...base,
      group_kind: "bidding",
      bid_scope: groupMeta.bid_scope || "vehicle",
      ...(groupMeta.bid_scope === "vehicle" ? { vehicle_request_index: groupMeta.vehicle_request_index ?? 1 } : {}),
    };
    if (isVehiclePreferenceBiddingGroup(out)) {
      out.vehicle_preference_ui = true;
      if (groupMeta.bid_scope === "vehicle") {
        out.vehicle_request_index = Math.max(
          1,
          Math.min(9, parseInt(String(groupMeta.vehicle_request_index ?? ""), 10) || vehiclePreferenceSlotCountFromChildren(out.children) || 3)
        );
      }
    }
    return out;
  }
  return base;
}

function msiRegenerateQuestionGroupChildIds(payload) {
  let p = {};
  try {
    p = payload && typeof payload === "object" ? JSON.parse(JSON.stringify(payload)) : {};
  } catch {
    p = {};
  }
  const kids = Array.isArray(p.children) ? p.children : [];
  p.children = kids.map((ch) => {
    let c = {};
    try {
      c = ch && typeof ch === "object" ? JSON.parse(JSON.stringify(ch)) : {};
    } catch {
      c = {};
    }
    c.id = msiNewLocalId();
    return c;
  });
  return p;
}

async function msiDuplicateContentBlock(blockId) {
  const block = msiBlocks.find((b) => b.id === blockId);
  const serviceItemId = qs("#manageServiceId")?.value?.trim();
  if (!block || String(block.block_type) === "question" || !serviceItemId) return;
  const statusEl = qs("#manageServiceIntakeStatus");
  try {
    const tmpl = await msiEnsureTemplate(serviceItemId);
    if (!tmpl?.id) throw new Error("template");
    const bt = String(block.block_type || "");
    const pl0 = block.payload && typeof block.payload === "object" ? /** @type {Record<string, unknown>} */ (block.payload) : {};
    const payload = bt === "question_group" ? msiRegenerateQuestionGroupChildIds(pl0) : { ...pl0 };
    const created = await serviceIntakeAdminApi.createBlock(tmpl.id, {
      block_type: bt,
      sort_order: msiIntakeMaxSortOrder() + 1,
      payload,
      visibility_rule_json: block.visibility_rule_json && typeof block.visibility_rule_json === "object" ? block.visibility_rule_json : {},
    });
    await msiRefresh();
    const b = msiBlocks.find((x) => x.id === created.id);
    if (b) msiOpenSideEditor(b);
  } catch (err) {
    const msg = err && typeof err.message === "string" ? err.message : String(err);
    if (statusEl) statusEl.textContent = msg;
    window.alert(msg);
  }
}

export function setServiceEditorTab(which) {
  const detailsBtn = qs("#manageServiceTabDetailsBtn");
  const intakeBtn = qs("#manageServiceTabIntakeBtn");
  const docsBtn = qs("#manageServiceTabDocumentsBtn");
  const workflowBtn = qs("#manageServiceTabWorkflowBtn");
  const detailsPanel = qs("#manageServiceDetailsPanel");
  const intakePanel = qs("#manageServiceIntakePanel");
  const docsPanel = qs("#manageServiceDocumentsPanel");
  const workflowPanel = qs("#manageServiceWorkflowPanel");
  if (!detailsPanel || !intakePanel) return;

  let showDetails = which === "details";
  let showIntake = which === "intake";
  let showDocs = which === "documents" && docsPanel;
  let showWorkflow = which === "workflow" && workflowPanel;
  if (which === "documents" && !docsPanel) {
    showDetails = true;
    showIntake = false;
    showDocs = false;
  }
  if (which === "workflow" && !workflowPanel) {
    showDetails = true;
    showIntake = false;
    showWorkflow = false;
  }

  if (detailsBtn) {
    detailsBtn.classList.toggle("is-active", showDetails);
    detailsBtn.setAttribute("aria-selected", showDetails ? "true" : "false");
  }
  if (intakeBtn) {
    intakeBtn.classList.toggle("is-active", showIntake);
    intakeBtn.setAttribute("aria-selected", showIntake ? "true" : "false");
  }
  if (docsBtn) {
    docsBtn.classList.toggle("is-active", showDocs);
    docsBtn.setAttribute("aria-selected", showDocs ? "true" : "false");
  }
  if (workflowBtn) {
    workflowBtn.classList.toggle("is-active", showWorkflow);
    workflowBtn.setAttribute("aria-selected", showWorkflow ? "true" : "false");
  }

  detailsPanel.hidden = !showDetails;
  intakePanel.hidden = !showIntake;
  if (docsPanel) docsPanel.hidden = !showDocs;
  if (workflowPanel) workflowPanel.hidden = !showWorkflow;

  if (!showIntake) msiCancelSidePanel();

  if (showIntake) {
    msiSyncBiddingAddButtonsVisibility();
    void msiRefresh();
  }
  if (showDocs) void msdRefresh();
  if (showWorkflow) workflowTabActivated();
}

/** @deprecated internal — use setServiceEditorTab */
function msiSwitchTab(which) {
  if (which === "intake") setServiceEditorTab("intake");
  else setServiceEditorTab("details");
}

function msiRenderTechnical() {
  const pre = qs("#manageServiceIntakeTechnicalPre");
  if (!pre) return;
  const payload = {
    template: msiTemplate ? { id: msiTemplate.id, name: msiTemplate.name, active: msiTemplate.active } : null,
    blocks: msiSortedBlocks().map((b) => ({
      id: b.id,
      block_key: b.block_key,
      block_type: b.block_type,
      sort_order: b.sort_order,
    })),
    fields: msiSortedFields().map((f) => ({
      id: f.id,
      field_key: f.field_key,
      label: f.label,
      input_type: f.input_type,
      archived_at: f.archived_at,
      active: f.active,
    })),
  };
  pre.textContent = JSON.stringify(payload, null, 2);
}

/** @returns {{ kind: 'always' } | { kind: 'conditional', source_field_id: string, match_value: string } | { kind: 'custom', raw: Record<string, unknown> }} */
function msiParseVisibilityObject(vis) {
  if (vis == null || typeof vis !== "object" || Array.isArray(vis)) return { kind: "always" };
  const keys = Object.keys(vis);
  if (keys.length === 0) return { kind: "always" };
  const mode = vis.mode ?? vis.type;
  if (
    mode === "when_answer_equals" &&
    typeof vis.source_field_id === "string" &&
    vis.source_field_id.trim() &&
    "match_value" in vis
  ) {
    return {
      kind: "conditional",
      source_field_id: vis.source_field_id.trim(),
      match_value: String(vis.match_value ?? ""),
    };
  }
  if (mode === "always" && keys.length <= 2) return { kind: "always" };
  return { kind: "custom", raw: { ...vis } };
}

function msiFieldIndexInSorted(fieldId) {
  const sorted = msiSortedFields();
  const idx = sorted.findIndex((f) => f.id === fieldId);
  return idx < 0 ? sorted.length : idx;
}

function msiVisibilityCandidateFields(currentFieldId, isNewField) {
  const sorted = msiSortedFields().filter((f) => !f.archived_at);
  if (isNewField) return sorted;
  const idx = msiFieldIndexInSorted(currentFieldId);
  return sorted.slice(0, idx);
}

function msiPopulateVisibilitySourceSelect(currentFieldId, isNewField, selectedId) {
  const sel = qs("#manageServiceIntakeVisibilitySourceField");
  if (!sel || !(sel instanceof HTMLSelectElement)) return;
  const candidates = msiVisibilityCandidateFields(currentFieldId, isNewField);
  const ph = t("common.admin_services.intake.vis_pick_field", "Choose a field…");
  let opts = `<option value="">${esc(ph)}</option>`;
  if (selectedId && !candidates.some((c) => c.id === selectedId)) {
    opts += `<option value="${esc(selectedId)}">${esc(
      t("common.admin_services.intake.vis_unknown_field", "(Unavailable field)")
    )}</option>`;
  }
  opts += candidates.map((f) => `<option value="${esc(f.id)}">${esc(f.label || f.id)}</option>`).join("");
  sel.innerHTML = opts;
  if (selectedId) sel.value = selectedId;
}

function msiRefreshVisibilityMatchControl() {
  const sourceId = qs("#manageServiceIntakeVisibilitySourceField")?.value?.trim() || "";
  const textEl = qs("#manageServiceIntakeVisibilityMatchText");
  const selectEl = qs("#manageServiceIntakeVisibilityMatchSelect");
  const labelEl = qs("#manageServiceIntakeVisibilityMatchLabel");
  if (!textEl || !selectEl) return;
  const src = msiFields.find((f) => f.id === sourceId);
  const useOptions = src && msiIsChoiceType(src.input_type) && Array.isArray(src.options) && src.options.length > 0;
  const activeOpts = (src?.options || []).filter((o) => o.active !== false);
  if (useOptions && activeOpts.length) {
    selectEl.hidden = false;
    textEl.hidden = true;
    selectEl.innerHTML = activeOpts
      .map((o) => `<option value="${esc(o.value)}">${esc(o.label || o.value)}</option>`)
      .join("");
    if (labelEl) {
      labelEl.textContent = t("common.admin_services.intake.vis_match_pick", "Their answer must be");
    }
  } else {
    selectEl.hidden = true;
    textEl.hidden = false;
    selectEl.innerHTML = "";
    if (labelEl) {
      labelEl.textContent = t("common.admin_services.intake.vis_match_value", "Their answer must be");
    }
  }
}

function msiApplyVisibilityToSimpleUi(parsed) {
  const alwaysEl = qs("#manageServiceIntakeVisAlways");
  const condEl = qs("#manageServiceIntakeVisConditional");
  const block = qs("#manageServiceIntakeVisibilityConditionalBlock");
  const editId = qs("#manageServiceIntakeFieldEditId")?.value?.trim() || "";
  if (parsed.kind === "conditional") {
    if (condEl instanceof HTMLInputElement) condEl.checked = true;
    if (alwaysEl instanceof HTMLInputElement) alwaysEl.checked = false;
    if (block) block.hidden = false;
    msiPopulateVisibilitySourceSelect(editId, !editId, parsed.source_field_id);
    msiRefreshVisibilityMatchControl();
    const selectEl = qs("#manageServiceIntakeVisibilityMatchSelect");
    const textEl = qs("#manageServiceIntakeVisibilityMatchText");
    if (selectEl && !selectEl.hidden && selectEl instanceof HTMLSelectElement && selectEl.options.length) {
      const vals = Array.from(selectEl.options).map((o) => o.value);
      if (vals.includes(parsed.match_value)) {
        selectEl.value = parsed.match_value;
        if (textEl instanceof HTMLInputElement) textEl.value = "";
      } else {
        selectEl.hidden = true;
        if (textEl instanceof HTMLInputElement) {
          textEl.hidden = false;
          textEl.value = parsed.match_value;
        }
      }
    } else if (textEl instanceof HTMLInputElement) {
      textEl.hidden = false;
      textEl.value = parsed.match_value;
    }
  } else {
    if (alwaysEl instanceof HTMLInputElement) alwaysEl.checked = true;
    if (condEl instanceof HTMLInputElement) condEl.checked = false;
    if (block) block.hidden = true;
    const textEl = qs("#manageServiceIntakeVisibilityMatchText");
    if (textEl instanceof HTMLInputElement) textEl.value = "";
    const selectEl = qs("#manageServiceIntakeVisibilityMatchSelect");
    if (selectEl instanceof HTMLSelectElement) {
      selectEl.innerHTML = "";
      selectEl.hidden = true;
    }
  }
}

function msiSetVisibilityCustomUi(active, snapshot) {
  msiVisibilityCustomMode = active;
  msiVisibilityCustomSnapshot = snapshot && typeof snapshot === "object" ? { ...snapshot } : null;
  const banner = qs("#manageServiceIntakeVisibilityCustomBanner");
  const fs = qs("#manageServiceIntakeVisibilitySimpleFieldset");
  const adv = qs("#manageServiceIntakeVisibilityJsonAdvanced");
  if (banner) banner.hidden = !active;
  if (fs) {
    if (active) fs.setAttribute("disabled", "disabled");
    else fs.removeAttribute("disabled");
  }
  if (active && snapshot && adv instanceof HTMLTextAreaElement) {
    adv.value = JSON.stringify(snapshot, null, 2);
  } else if (!active && adv instanceof HTMLTextAreaElement) {
    adv.value = "";
  }
}

function msiBuildSimpleVisibilityForSave() {
  const always = qs("#manageServiceIntakeVisAlways")?.checked !== false;
  if (always) return {};
  const sourceId = qs("#manageServiceIntakeVisibilitySourceField")?.value?.trim() || "";
  if (!sourceId) {
    throw new Error(
      t("common.admin_services.intake.vis_need_source", "Choose which field controls visibility, or switch back to “Always show”.")
    );
  }
  const matchSel = qs("#manageServiceIntakeVisibilityMatchSelect");
  const matchText = qs("#manageServiceIntakeVisibilityMatchText");
  let match_value = "";
  if (matchSel && !matchSel.hidden && matchSel instanceof HTMLSelectElement) {
    match_value = matchSel.value;
  } else if (matchText instanceof HTMLInputElement) {
    match_value = matchText.value.trim();
  }
  return {
    mode: "when_answer_equals",
    source_field_id: sourceId,
    match_value,
  };
}

function msiResolveVisibilityRuleForSave() {
  const advEl = qs("#manageServiceIntakeVisibilityJsonAdvanced");
  const advRaw = advEl instanceof HTMLTextAreaElement ? advEl.value.trim() : "";
  if (msiVisibilityCustomMode) {
    if (advRaw) {
      try {
        const parsed = JSON.parse(advRaw);
        if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("object");
        return parsed;
      } catch {
        throw new Error(
          t("common.admin_services.intake.bad_visibility_json", "Visibility rule must be valid JSON object (or leave empty).")
        );
      }
    }
    if (msiVisibilityCustomSnapshot) return { ...msiVisibilityCustomSnapshot };
    return {};
  }
  if (advRaw) {
    try {
      const parsed = JSON.parse(advRaw);
      if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("object");
      return parsed;
    } catch {
      throw new Error(
        t("common.admin_services.intake.bad_visibility_json", "Visibility rule must be valid JSON object (or leave empty).")
      );
    }
  }
  return msiBuildSimpleVisibilityForSave();
}

function msiDeepCloneJson(value) {
  if (value == null) return value;
  try {
    return structuredClone(value);
  } catch {
    return JSON.parse(JSON.stringify(value));
  }
}

function msiCaptureSideEditorSnapshot(block) {
  if (!block?.id) {
    msiSideEditorSnapshot = null;
    return;
  }
  const payload = msiDeepCloneJson(block.payload && typeof block.payload === "object" ? block.payload : {});
  msiSideEditorSnapshot = {
    blockId: String(block.id),
    payload,
    visibility_rule_json: msiDeepCloneJson(
      block.visibility_rule_json && typeof block.visibility_rule_json === "object" ? block.visibility_rule_json : {}
    ),
  };
}

function msiRestoreSideEditorFromSnapshot() {
  if (!msiSideEditorSnapshot) return false;
  const { blockId, payload, visibility_rule_json } = msiSideEditorSnapshot;
  const block = msiBlocks.find((b) => String(b.id) === blockId);
  if (block) {
    block.payload = msiDeepCloneJson(payload);
    block.visibility_rule_json = msiDeepCloneJson(visibility_rule_json);
    msiRenderFieldCards();
  }
  msiSideEditorSnapshot = null;
  return true;
}

function msiClearSideEditorSnapshot() {
  msiSideEditorSnapshot = null;
}

/** Revert in-memory block state from the open-editor snapshot (no API). */
function msiDiscardSideEditorChanges() {
  msiRestoreSideEditorFromSnapshot();
}

function msiArmSideDismissGuard() {
  msiSideDismissGuardUntil = Date.now() + 500;
}

/** Invalidate pending Save and any async ``updateBlock`` started before dismiss. */
function msiInvalidateSideEditorSave() {
  msiSideSaveRequested = false;
  msiSideEditorSession += 1;
}

/** Close side editor without persisting edits (Cancel, ×, backdrop, Escape). */
function msiCancelSidePanel() {
  msiInvalidateSideEditorSave();
  msiArmSideDismissGuard();
  msiCloseSidePanel({ saved: false });
}

function msiCaptureFieldDialogSnapshot(field) {
  if (!field?.id) {
    msiFieldDialogSnapshot = null;
    return;
  }
  msiFieldDialogSnapshot = {
    fieldId: String(field.id),
    field: msiDeepCloneJson(field),
  };
}

function msiRestoreFieldDialogFromSnapshot() {
  if (!msiFieldDialogSnapshot) return;
  const { fieldId, field } = msiFieldDialogSnapshot;
  const idx = msiFields.findIndex((f) => String(f.id) === fieldId);
  if (idx >= 0 && field && typeof field === "object") {
    msiFields[idx] = msiDeepCloneJson(field);
    msiRenderFieldCards();
  }
  msiFieldDialogSnapshot = null;
}

function msiCancelFieldDialog() {
  msiRestoreFieldDialogFromSnapshot();
  msiDeletedOptionIds = new Set();
  const dlg = qs("#manageServiceIntakeFieldDialog");
  if (dlg instanceof HTMLDialogElement) dlg.close();
  msiResetSidePanelEmpty();
}

function msiCloseSidePanel(opts = {}) {
  const saved = Boolean(opts && opts.saved);
  if (!saved) {
    msiDiscardSideEditorChanges();
    msiRenderFieldCards();
  } else {
    msiClearSideEditorSnapshot();
  }
  msiHideQuestionGroupSideEditor();
  const form = qs("#manageServiceIntakeSideForm");
  const empty = qs("#manageServiceIntakeSideEmpty");
  const p = qs("#manageServiceIntakeSidePanel");
  const th = qs("#manageServiceIntakeSideTypeHelp");
  if (form) form.hidden = true;
  if (empty) empty.hidden = false;
  if (th) th.hidden = true;
  if (p) p.hidden = true;
  msiSyncIntakeEditorFocusLayout(false);
}

/** Show empty side hint after load (template exists); form opens when a content block is selected. */
function msiResetSidePanelEmpty() {
  const p = qs("#manageServiceIntakeSidePanel");
  const form = qs("#manageServiceIntakeSideForm");
  const empty = qs("#manageServiceIntakeSideEmpty");
  const th = qs("#manageServiceIntakeSideTypeHelp");
  if (!p || !msiTemplate?.id) return;
  p.hidden = true;
  if (form) form.hidden = true;
  if (empty) empty.hidden = false;
  if (th) th.hidden = true;
  msiSyncIntakeEditorFocusLayout(false);
}

function msiPopulateSideVisibilitySourceSelect(selectedId) {
  const sel = qs("#manageServiceIntakeSideVisibilitySourceField");
  if (!sel || !(sel instanceof HTMLSelectElement)) return;
  const blockId = qs("#manageServiceIntakeSideBlockId")?.value?.trim() || "";
  const candidates = blockId ? msiVisibilitySourcesForContentBlock(blockId) : msiSortedFields().filter((f) => !f.archived_at);
  const ph = t("common.admin_services.intake.vis_pick_field", "Choose a field…");
  let opts = `<option value="">${esc(ph)}</option>`;
  opts += candidates.map((f) => `<option value="${esc(f.id)}">${esc(f.label || f.id)}</option>`).join("");
  sel.innerHTML = opts;
  if (selectedId) sel.value = selectedId;
}

function msiSideRefreshVisibilityMatchControl() {
  const sourceId = qs("#manageServiceIntakeSideVisibilitySourceField")?.value?.trim() || "";
  const textEl = qs("#manageServiceIntakeSideVisibilityMatchText");
  const selectEl = qs("#manageServiceIntakeSideVisibilityMatchSelect");
  const labelEl = qs("#manageServiceIntakeSideVisibilityMatchLabel");
  if (!textEl || !selectEl) return;
  const src = msiResolveVisibilitySourceField(sourceId);
  const useOptions = src && msiIsChoiceType(src.input_type) && Array.isArray(src.options) && src.options.length > 0;
  const activeOpts = (src?.options || []).filter((o) => o.active !== false);
  if (useOptions && activeOpts.length) {
    selectEl.hidden = false;
    textEl.hidden = true;
    selectEl.innerHTML = activeOpts
      .map((o) => `<option value="${esc(o.value)}">${esc(o.label || o.value)}</option>`)
      .join("");
    if (labelEl) {
      labelEl.textContent = t("common.admin_services.intake.vis_match_pick", "Their answer must be");
    }
  } else {
    selectEl.hidden = true;
    textEl.hidden = false;
    selectEl.innerHTML = "";
    if (labelEl) {
      labelEl.textContent = t("common.admin_services.intake.vis_match_value", "Their answer must be");
    }
  }
}

function msiSideSyncVisibilityConditionalBlock() {
  const cond = qs("#manageServiceIntakeSideVisConditional")?.checked;
  const block = qs("#manageServiceIntakeSideVisibilityConditionalBlock");
  if (block) block.hidden = !cond;
  if (cond) {
    msiPopulateSideVisibilitySourceSelect(qs("#manageServiceIntakeSideVisibilitySourceField")?.value || "");
    msiSideRefreshVisibilityMatchControl();
  }
}

function msiSideApplyVisibilityToUi(vis) {
  const parsed = msiParseVisibilityObject(vis);
  const alwaysEl = qs("#manageServiceIntakeSideVisAlways");
  const condEl = qs("#manageServiceIntakeSideVisConditional");
  const block = qs("#manageServiceIntakeSideVisibilityConditionalBlock");
  const adv = qs("#manageServiceIntakeSideVisibilityJsonAdvanced");
  if (adv instanceof HTMLTextAreaElement) adv.value = "";
  if (parsed.kind === "conditional") {
    if (condEl instanceof HTMLInputElement) condEl.checked = true;
    if (alwaysEl instanceof HTMLInputElement) alwaysEl.checked = false;
    if (block) block.hidden = false;
    msiPopulateSideVisibilitySourceSelect(parsed.source_field_id);
    msiSideRefreshVisibilityMatchControl();
    const selectEl = qs("#manageServiceIntakeSideVisibilityMatchSelect");
    const textEl = qs("#manageServiceIntakeSideVisibilityMatchText");
    if (selectEl && !selectEl.hidden && selectEl instanceof HTMLSelectElement && selectEl.options.length) {
      const vals = Array.from(selectEl.options).map((o) => o.value);
      if (vals.includes(parsed.match_value)) {
        selectEl.value = parsed.match_value;
        if (textEl instanceof HTMLInputElement) textEl.value = "";
      } else {
        selectEl.hidden = true;
        if (textEl instanceof HTMLInputElement) {
          textEl.hidden = false;
          textEl.value = parsed.match_value;
        }
      }
    } else if (textEl instanceof HTMLInputElement) {
      textEl.hidden = false;
      textEl.value = parsed.match_value;
    }
  } else if (parsed.kind === "custom" && parsed.raw) {
    if (alwaysEl instanceof HTMLInputElement) alwaysEl.checked = true;
    if (condEl instanceof HTMLInputElement) condEl.checked = false;
    if (block) block.hidden = true;
    if (adv instanceof HTMLTextAreaElement) adv.value = JSON.stringify(parsed.raw, null, 2);
  } else {
    if (alwaysEl instanceof HTMLInputElement) alwaysEl.checked = true;
    if (condEl instanceof HTMLInputElement) condEl.checked = false;
    if (block) block.hidden = true;
  }
}

function msiSideBuildSimpleVisibilityForSave() {
  const always = qs("#manageServiceIntakeSideVisAlways")?.checked !== false;
  if (always) return {};
  const sourceId = qs("#manageServiceIntakeSideVisibilitySourceField")?.value?.trim() || "";
  if (!sourceId) {
    throw new Error(
      t("common.admin_services.intake.vis_need_source", "Choose which field controls visibility, or switch back to “Always show”.")
    );
  }
  const matchSel = qs("#manageServiceIntakeSideVisibilityMatchSelect");
  const matchText = qs("#manageServiceIntakeSideVisibilityMatchText");
  let match_value = "";
  if (matchSel && !matchSel.hidden && matchSel instanceof HTMLSelectElement) {
    match_value = matchSel.value;
  } else if (matchText instanceof HTMLInputElement) {
    match_value = matchText.value.trim();
  }
  return {
    mode: "when_answer_equals",
    source_field_id: sourceId,
    match_value,
  };
}

function msiSideResolveVisibilityForSave() {
  const advEl = qs("#manageServiceIntakeSideVisibilityJsonAdvanced");
  const advRaw = advEl instanceof HTMLTextAreaElement ? advEl.value.trim() : "";
  if (advRaw) {
    try {
      const parsed = JSON.parse(advRaw);
      if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("object");
      return parsed;
    } catch {
      throw new Error(
        t("common.admin_services.intake.bad_visibility_json", "Visibility rule must be valid JSON object (or leave empty).")
      );
    }
  }
  return msiSideBuildSimpleVisibilityForSave();
}

function msiOpenSideEditor(block) {
  const p = qs("#manageServiceIntakeSidePanel");
  const form = qs("#manageServiceIntakeSideForm");
  const empty = qs("#manageServiceIntakeSideEmpty");
  const h = qs("#manageServiceIntakeSideHeading");
  const typeHelp = qs("#manageServiceIntakeSideTypeHelp");
  if (!p || !form || !block) return;
  const formWasOpen = form instanceof HTMLElement && !form.hidden;
  const prevBlockId = qs("#manageServiceIntakeSideBlockId")?.value?.trim() || "";
  const nextBlockId = String(block.id || "").trim();
  const sameBlockOpen = formWasOpen && prevBlockId && prevBlockId === nextBlockId;
  if (formWasOpen && prevBlockId && !sameBlockOpen) {
    msiInvalidateSideEditorSave();
    msiArmSideDismissGuard();
    msiCloseSidePanel({ saved: false });
  }
  msiHideQuestionGroupSideEditor();
  msiLastOpenedContentBlockId = nextBlockId;
  p.hidden = false;
  form.hidden = false;
  if (empty) empty.hidden = true;
  const bt = String(block.block_type || "");
  const isQuestionGroup = bt === "question_group";
  if (h) h.textContent = msiBlockTypeLabel(bt);
  if (typeHelp) {
    typeHelp.textContent = msiBlockTypeHelp(bt);
    typeHelp.hidden = false;
  }
  const bid = qs("#manageServiceIntakeSideBlockId");
  if (bid instanceof HTMLInputElement) bid.value = block.id;
  const pl = msiDeepCloneJson(block.payload && typeof block.payload === "object" ? block.payload : {});
  const titleIn = qs("#manageServiceIntakeSideTitleInput");
  const bodySection = qs("#manageServiceIntakeSideBodySection");
  const media = qs("#manageServiceIntakeSideMediaUrl");
  const asset = qs("#manageServiceIntakeSideAssetId");
  const altIn = qs("#manageServiceIntakeSideAltText");
  const mediaKind = qs("#manageServiceIntakeSideMediaKind");
  const mediaLayout = qs("#manageServiceIntakeSideMediaLayout");
  const cap = qs("#manageServiceIntakeSideCaption");
  const style = qs("#manageServiceIntakeSideStyle");
  const mediaWrap = qs("#manageServiceIntakeSideMediaWrap");
  if (titleIn instanceof HTMLInputElement) titleIn.value = pl.title || "";
  if (bodySection instanceof HTMLElement) bodySection.hidden = bt === "divider" || isQuestionGroup;
  msiSetSideBodyEditorHtml(bt === "divider" || isQuestionGroup ? "" : pl.body || "");
  if (media instanceof HTMLInputElement) media.value = pl.media_url || "";
  const mediaFileIn = qs("#manageServiceIntakeSideMediaFile");
  if (mediaFileIn instanceof HTMLInputElement) mediaFileIn.value = "";
  const uploadStatusEl = qs("#manageServiceIntakeSideMediaUploadStatus");
  if (uploadStatusEl instanceof HTMLElement) {
    uploadStatusEl.hidden = true;
    uploadStatusEl.textContent = "";
  }
  if (asset instanceof HTMLInputElement) asset.value = pl.media_asset_id || "";
  if (altIn instanceof HTMLInputElement) altIn.value = pl.alt_text || "";
  if (mediaKind instanceof HTMLSelectElement) {
    const hasFeatured = Boolean(String(pl.media_url || "").trim() || String(pl.media_asset_id || "").trim());
    mediaKind.value = pl.media_kind || (bt === "image" || hasFeatured ? "image" : "none");
  }
  if (mediaLayout instanceof HTMLSelectElement) mediaLayout.value = pl.media_layout || "default";
  if (cap instanceof HTMLInputElement) cap.value = pl.caption || "";
  if (style instanceof HTMLSelectElement) style.value = pl.style_variant || "default";
  if (mediaWrap) mediaWrap.hidden = bt === "divider" || isQuestionGroup;
  const titleLbl = titleIn?.closest(".admin-services__intake-side-form")?.querySelector('label[for="manageServiceIntakeSideTitleInput"]');
  if (titleLbl instanceof HTMLElement) {
    titleLbl.hidden = bt === "divider";
    if (isQuestionGroup) {
      titleLbl.hidden = false;
      titleLbl.textContent = msiQgIsBiddingGroup(pl)
        ? t("common.admin_services.intake.qgroup_bidding_side_title", "Bidding group title")
        : t("common.admin_services.intake.qgroup_side_title_label", "Group title");
    } else {
      titleLbl.textContent = t("common.admin_services.intake.side_title", "Title (optional)");
    }
  }
  if (titleIn instanceof HTMLElement) titleIn.hidden = bt === "divider";
  if (cap instanceof HTMLElement) cap.hidden = bt === "divider" || isQuestionGroup;
  const capLbl = cap?.previousElementSibling;
  if (capLbl instanceof HTMLElement && capLbl.classList.contains("lhai-label")) capLbl.hidden = bt === "divider" || isQuestionGroup;
  const styleLbl = style?.previousElementSibling;
  if (style instanceof HTMLElement) {
    style.hidden = isQuestionGroup;
  }
  if (styleLbl instanceof HTMLElement && styleLbl.classList.contains("lhai-label")) {
    styleLbl.hidden = isQuestionGroup;
  }
  if (!isQuestionGroup) {
    if (style instanceof HTMLElement) style.hidden = false;
    if (styleLbl instanceof HTMLElement && styleLbl.classList.contains("lhai-label")) styleLbl.hidden = false;
  }
  if (isQuestionGroup) {
    msiRenderQuestionGroupSideEditor(pl);
  }
  msiSideApplyVisibilityToUi(block.visibility_rule_json);
  msiSyncIntakeEditorFocusLayout(true);
  msiCaptureSideEditorSnapshot(block);
}

function msiSyncIntakeEditorFocusLayout(forceOpen) {
  const layout = qs(".admin-services__intake-builder-layout");
  const side = qs("#manageServiceIntakeSidePanel");
  const backdrop = qs("#manageServiceIntakeSideBackdrop");
  const open = Boolean(
    forceOpen ||
      (side instanceof HTMLElement && !side.hidden && qs("#manageServiceIntakeSideForm") instanceof HTMLElement && !qs("#manageServiceIntakeSideForm").hidden)
  );
  if (layout instanceof HTMLElement) {
    layout.classList.toggle("is-side-open", open);
  }
  if (backdrop instanceof HTMLElement) {
    backdrop.hidden = !open;
  }
  if (document.body instanceof HTMLBodyElement) {
    document.body.style.overflow = open ? "hidden" : "";
  }
}

const MSI_MEDIA_ASSET_ID_RE = /^[A-Za-z0-9._:@/-]{1,128}$/;

async function msiSaveSideEditor() {
  if (!msiSideSaveRequested) return;
  const saveSession = msiSideEditorSession;
  msiSideSaveRequested = false;
  const blockId = qs("#manageServiceIntakeSideBlockId")?.value?.trim();
  const block = msiBlocks.find((b) => b.id === blockId);
  if (!blockId || !block || String(block.block_type) === "question") {
    return;
  }
  let visibility_rule_json;
  try {
    visibility_rule_json = msiSideResolveVisibilityForSave();
  } catch (e) {
    window.alert(e && typeof e.message === "string" ? e.message : String(e));
    return;
  }
  const bt = String(block.block_type);
  if (bt === "question_group") {
    const statusEl = qs("#manageServiceIntakeStatus");
    let pl;
    try {
      pl = msiReadQuestionGroupPayloadFromSideDom();
    } catch (e) {
      window.alert(e && typeof e.message === "string" ? e.message : String(e));
      return;
    }
    if (msiQgIsBiddingGroup(pl)) {
      const bidBlockVis = msiQgBlockVisibilityForBiddingGroup({
        group_kind: "bidding",
        bid_scope: pl.bid_scope,
        vehicle_request_index: pl.vehicle_request_index,
      });
      visibility_rule_json = { ...bidBlockVis, ...visibility_rule_json };
    }
    try {
      await serviceIntakeAdminApi.updateBlock(blockId, { payload: pl, visibility_rule_json });
      if (saveSession !== msiSideEditorSession) return;
      msiClearSideEditorSnapshot();
      await msiRefresh();
      if (saveSession !== msiSideEditorSession) return;
      msiCloseSidePanel({ saved: true });
    } catch (err) {
      if (saveSession !== msiSideEditorSession) return;
      const msg = err && typeof err.message === "string" ? err.message : String(err);
      if (statusEl) statusEl.textContent = msg;
      window.alert(msg);
    }
    return;
  }
  const assetRaw = qs("#manageServiceIntakeSideAssetId")?.value?.trim() || "";
  if (assetRaw && !MSI_MEDIA_ASSET_ID_RE.test(assetRaw)) {
    window.alert(
      t(
        "common.admin_services.intake.invalid_asset_id",
        "Media asset ID may only use letters, numbers, and ._:@/- (max 128 characters)."
      )
    );
    return;
  }
  const bodyStr = msiGetSideBodyEditorHtml();
  if (bodyStr.length > MSI_BODY_MAX_LEN) {
    window.alert(
      t(
        "common.admin_services.intake.body_too_long",
        "Body / message must be at most 8000 characters (including HTML)."
      )
    );
    return;
  }
  const pl = {
    title: qs("#manageServiceIntakeSideTitleInput")?.value?.trim() || "",
    body: bodyStr,
    media_url: qs("#manageServiceIntakeSideMediaUrl")?.value?.trim() || "",
    media_asset_id: qs("#manageServiceIntakeSideAssetId")?.value?.trim() || "",
    alt_text: qs("#manageServiceIntakeSideAltText")?.value?.trim() || "",
    media_kind: qs("#manageServiceIntakeSideMediaKind")?.value || "image",
    media_layout: qs("#manageServiceIntakeSideMediaLayout")?.value || "default",
    caption: qs("#manageServiceIntakeSideCaption")?.value?.trim() || "",
    style_variant: qs("#manageServiceIntakeSideStyle")?.value || "default",
  };
  if (bt === "divider") {
    pl.title = "";
    pl.body = "";
    pl.media_url = "";
    pl.media_asset_id = "";
    pl.alt_text = "";
    pl.caption = "";
    pl.media_kind = "none";
    pl.media_layout = "default";
  }
  const statusEl = qs("#manageServiceIntakeStatus");
  try {
    await serviceIntakeAdminApi.updateBlock(blockId, { payload: pl, visibility_rule_json });
    if (saveSession !== msiSideEditorSession) return;
    msiClearSideEditorSnapshot();
    await msiRefresh();
    if (saveSession !== msiSideEditorSession) return;
    msiCloseSidePanel({ saved: true });
  } catch (err) {
    if (saveSession !== msiSideEditorSession) return;
    const msg = err && typeof err.message === "string" ? err.message : String(err);
    if (statusEl) statusEl.textContent = msg;
    window.alert(msg);
  }
}

async function msiAddContentBlock(blockType, options = {}) {
  const serviceItemId = qs("#manageServiceId")?.value?.trim();
  if (!serviceItemId) {
    const statusEl = qs("#manageServiceIntakeStatus");
    if (statusEl) {
      statusEl.textContent = t(
        "common.admin_services.intake.hint_need_saved_service",
        "Save the service first, then you can define the customer intake (fields and options) for this service item in Customer Intake Builder."
      );
    }
    return;
  }
  if (!MSI_CONTENT_BLOCK_TYPES.includes(blockType)) return;
  const statusEl = qs("#manageServiceIntakeStatus");
  try {
    const tmpl = await msiEnsureTemplate(serviceItemId);
    if (!tmpl?.id) throw new Error("template");
    const defaults = {
      description: {
        title: "",
        body: "",
        caption: "",
        alt_text: "",
        media_url: "",
        media_asset_id: "",
        media_kind: "none",
        media_layout: "default",
        style_variant: "default",
      },
      divider: { style_variant: "default" },
      question_group: msiDefaultStandardQuestionGroupPayload(),
    };
    let payload = defaults[blockType] || {};
    if (blockType === "question_group" && options.biddingPayload && typeof options.biddingPayload === "object") {
      payload = options.biddingPayload;
    }
    let visibility_rule_json = {};
    if (msiQgIsBiddingGroup(payload)) {
      visibility_rule_json = msiQgBlockVisibilityForBiddingGroup({
        group_kind: "bidding",
        bid_scope: payload.bid_scope,
        vehicle_request_index: payload.vehicle_request_index,
      });
    }
    const created = await serviceIntakeAdminApi.createBlock(tmpl.id, {
      block_type: blockType,
      // Keep global block order deterministic across all block types.
      sort_order: msiIntakeMaxSortOrder() + 1,
      payload,
      visibility_rule_json,
    });
    await msiRefresh();
    const b = msiBlocks.find((x) => x.id === created.id);
    if (b) msiOpenSideEditor(b);
  } catch (err) {
    const msg = err && typeof err.message === "string" ? err.message : String(err);
    if (statusEl) statusEl.textContent = msg;
    window.alert(msg);
  }
}

async function msiReorderBlock(blockId, dir) {
  const sorted = msiSortedBlocks();
  const idx = sorted.findIndex((b) => b.id === blockId);
  if (idx < 0) return;
  const j = dir === "up" ? idx - 1 : idx + 1;
  if (j < 0 || j >= sorted.length) return;
  const next = sorted.slice();
  const tmp = next[idx];
  next[idx] = next[j];
  next[j] = tmp;
  if (!msiTemplate?.id) return;
  try {
    await serviceIntakeAdminApi.reorderBlocks(
      msiTemplate.id,
      next.map((b) => b.id)
    );
    await msiRefresh();
  } catch (err) {
    const statusEl = qs("#manageServiceIntakeStatus");
    if (statusEl) statusEl.textContent = err?.message || "Reorder failed";
  }
}

function msiRenderFieldCards() {
  const root = qs("#manageServiceIntakeFields");
  if (!root) return;
  const sorted = msiSortedBlocks();
  if (!sorted.length) {
    root.innerHTML = `<div class="lhai-help admin-services__intake-empty">${esc(
      t(
        "common.admin_services.intake.empty_blocks",
        "No blocks yet. Add a question or content block to build the intake flow."
      )
    )}</div>`;
    document.dispatchEvent(new CustomEvent("lhai:admin-intake-fields-changed", { bubbles: true }));
    return;
  }
  const upLabel = t("common.admin_services.editor.reorder.move_up", "Move up");
  const downLabel = t("common.admin_services.editor.reorder.move_down", "Move down");
  root.innerHTML = sorted
    .map((block, idx) => {
      const bt = String(block.block_type || "");
      const typeBadge = msiBlockTypeLabel(bt);
      if (bt === "question") {
        const f = msiFieldForQuestionBlock(block.id);
        if (!f) return "";
        const reqLabel = f.required
          ? t("common.admin_services.intake.req_yes", "Required")
          : t("common.admin_services.intake.req_no", "Optional");
        const ht = f.help_text || "";
        const helpPrev = ht.length > 140 ? `${ht.slice(0, 140)}…` : ht;
        const badges = [
          `<span class="lhai-badge">${esc(t("common.admin_services.intake.badge_legacy_question", "Legacy — convert"))}</span>`,
        ];
        if (f.archived_at) badges.push(`<span class="lhai-badge">${esc(t("common.admin_services.intake.badge_archived", "Archived"))}</span>`);
        if (!f.active) badges.push(`<span class="lhai-badge">${esc(t("common.admin_services.intake.badge_inactive", "Inactive"))}</span>`);
        const archAction = f.archived_at ? "unarchive" : "archive";
        const archText = f.archived_at
          ? t("common.admin_services.intake.restore", "Restore")
          : t("common.admin_services.intake.archive", "Archive");
        const typeLabel = msiFormatInputTypeLabel(f.input_type);
        return `
        <article class="admin-services__intake-card lhai-card admin-services__intake-card--block" data-block-id="${esc(block.id)}" data-block-type="question">
          <div class="admin-services__intake-card-head">
            <div class="admin-services__intake-card-head-text">
              <div class="admin-services__intake-card-type">${esc(typeBadge)}</div>
              <p class="lhai-help admin-services__intake-card-type-help">${esc(
                t(
                  "common.admin_services.intake.legacy_question_help",
                  "Older single-question block. Convert to a Questions block to match the current builder (recommended)."
                )
              )}</p>
              <div class="admin-services__intake-card-title">${esc(f.label || "—")}</div>
              <div class="lhai-help admin-services__intake-card-meta">${esc(typeLabel)} · ${esc(reqLabel)}</div>
            </div>
            <div class="admin-services__intake-card-badges">${badges.join("")}</div>
          </div>
          <p class="lhai-help admin-services__intake-card-help">${esc(helpPrev || "—")}</p>
          <div class="admin-services__row-actions admin-services__intake-card-actions">
            <button type="button" class="lhai-button lhai-button--primary lhai-button--compact" data-msi-action="convert_to_group">${esc(
              t("common.admin_services.intake.convert_to_questions_block", "Convert to Questions")
            )}</button>
            <button type="button" class="lhai-button lhai-button--secondary lhai-button--compact" data-msi-action="edit">${esc(t("common.admin_services.actions.edit", "Edit"))}</button>
            <button type="button" class="lhai-button lhai-button--secondary lhai-button--compact" data-msi-action="duplicate">${esc(t("common.admin_services.intake.duplicate", "Duplicate"))}</button>
            <button type="button" class="lhai-button lhai-button--secondary lhai-button--compact" data-msi-action="up" aria-label="${esc(upLabel)}" ${idx === 0 ? "disabled" : ""}>↑</button>
            <button type="button" class="lhai-button lhai-button--secondary lhai-button--compact" data-msi-action="down" aria-label="${esc(downLabel)}" ${idx === sorted.length - 1 ? "disabled" : ""}>↓</button>
            <button type="button" class="lhai-button lhai-button--secondary lhai-button--compact" data-msi-action="${esc(archAction)}">${esc(archText)}</button>
            <button type="button" class="lhai-button lhai-button--danger lhai-button--compact" data-msi-action="remove">${esc(t("common.admin_services.intake.remove", "Remove"))}</button>
          </div>
        </article>`;
      }
      if (bt === "question_group") {
        const pl = block.payload && typeof block.payload === "object" ? /** @type {Record<string, unknown>} */ (block.payload) : {};
        const isBidding = msiQgIsBiddingGroup(pl);
        const kids = Array.isArray(pl.children) ? pl.children : [];
        const labels = kids
          .map((ch) => (ch && typeof ch === "object" ? String(/** @type {Record<string, unknown>} */ (ch).label || "").trim() : ""))
          .filter(Boolean);
        const sum =
          labels.length === 0
            ? "—"
            : labels.length <= 3
              ? labels.join(", ")
              : `${labels.slice(0, 3).join(", ")} +${labels.length - 3}`;
        const layout = String(pl.layout || "stack") === "inline_2" ? "inline_2" : "stack";
        const inactive = block.active === false;
        const badges = [];
        if (inactive) badges.push(`<span class="lhai-badge">${esc(t("common.admin_services.intake.badge_inactive", "Inactive"))}</span>`);
        if (isBidding) {
          badges.push(
            `<span class="lhai-badge">${esc(t("common.admin_services.intake.badge_bidding_group", "Partner bidding"))}</span>`
          );
        }
        const typeBadgeQg = isBidding
          ? t("common.admin_services.intake.block_type_bidding_question_group", "Bidding question group")
          : typeBadge;
        const typeHelpQg = isBidding
          ? t(
              "common.admin_services.intake.block_type_bidding_question_group_help",
              "A bundle of related questions (e.g. make, model, mileage) sent together to partners in CAR bid requests. Add one group per vehicle or a global preferences group."
            )
          : msiBlockTypeHelp("question_group");
        const metaExtra = isBidding
          ? String(pl.bid_scope || "vehicle") === "global"
            ? t("common.admin_services.intake.qgroup_bid_meta_global", "global bidding")
            : t("common.admin_services.intake.qgroup_bid_meta_vehicle", "vehicle #{n}").replace(
                "{n}",
                String(pl.vehicle_request_index ?? 1)
              )
          : layout;
        return `
        <article class="admin-services__intake-card lhai-card admin-services__intake-card--block${isBidding ? " admin-services__intake-card--bidding-group" : ""}" data-block-id="${esc(block.id)}" data-block-type="question_group">
          <div class="admin-services__intake-card-head">
            <div class="admin-services__intake-card-head-text">
              <div class="admin-services__intake-card-type">${esc(typeBadgeQg)}</div>
              <p class="lhai-help admin-services__intake-card-type-help">${esc(typeHelpQg)}</p>
              <div class="admin-services__intake-card-title">${esc(msiBlockCardTitle(block))}</div>
              <div class="lhai-help admin-services__intake-card-meta">${esc(metaExtra)} · ${esc(
                t("common.admin_services.intake.qgroup_child_count", "{n} questions").replace("{n}", String(kids.length))
              )}</div>
            </div>
            <div class="admin-services__intake-card-badges">${badges.join("")}</div>
          </div>
          <p class="lhai-help admin-services__intake-card-help">${esc(sum)}</p>
          <div class="admin-services__row-actions admin-services__intake-card-actions">
            <button type="button" class="lhai-button lhai-button--secondary lhai-button--compact" data-msi-action="edit">${esc(t("common.admin_services.actions.edit", "Edit"))}</button>
            <button type="button" class="lhai-button lhai-button--secondary lhai-button--compact" data-msi-action="add_child">${esc(
              t("common.admin_services.intake.qgroup_add_child_card", "+ Add question")
            )}</button>
            <button type="button" class="lhai-button lhai-button--secondary lhai-button--compact" data-msi-action="duplicate">${esc(
              t("common.admin_services.intake.duplicate", "Duplicate")
            )}</button>
            <button type="button" class="lhai-button lhai-button--secondary lhai-button--compact" data-msi-action="up" aria-label="${esc(upLabel)}" ${idx === 0 ? "disabled" : ""}>↑</button>
            <button type="button" class="lhai-button lhai-button--secondary lhai-button--compact" data-msi-action="down" aria-label="${esc(downLabel)}" ${idx === sorted.length - 1 ? "disabled" : ""}>↓</button>
            <button type="button" class="lhai-button lhai-button--danger lhai-button--compact" data-msi-action="remove">${esc(t("common.admin_services.intake.remove", "Remove"))}</button>
          </div>
        </article>`;
      }
      const p = /** @type {Record<string, string>} */ (block.payload || {});
      const bodyText = msiPlainTextPreview(p.body || "");
      const sub = bodyText ? (bodyText.length > 120 ? `${bodyText.slice(0, 120)}…` : bodyText) : "—";
      const inactive = block.active === false;
      const badges = [];
      if (inactive) badges.push(`<span class="lhai-badge">${esc(t("common.admin_services.intake.badge_inactive", "Inactive"))}</span>`);
      return `
        <article class="admin-services__intake-card lhai-card admin-services__intake-card--block" data-block-id="${esc(block.id)}" data-block-type="${esc(bt)}">
          <div class="admin-services__intake-card-head">
            <div class="admin-services__intake-card-head-text">
              <div class="admin-services__intake-card-type">${esc(typeBadge)}</div>
              <p class="lhai-help admin-services__intake-card-type-help">${esc(msiBlockTypeHelp(bt))}</p>
              <div class="admin-services__intake-card-title">${esc(msiBlockCardTitle(block))}</div>
              <div class="lhai-help admin-services__intake-card-meta">${esc(p.style_variant || "default")}</div>
            </div>
            <div class="admin-services__intake-card-badges">${badges.join("")}</div>
          </div>
          <p class="lhai-help admin-services__intake-card-help">${esc(sub)}</p>
          <div class="admin-services__row-actions admin-services__intake-card-actions">
            <button type="button" class="lhai-button lhai-button--secondary lhai-button--compact" data-msi-action="edit">${esc(t("common.admin_services.actions.edit", "Edit"))}</button>
            <button type="button" class="lhai-button lhai-button--secondary lhai-button--compact" data-msi-action="up" aria-label="${esc(upLabel)}" ${idx === 0 ? "disabled" : ""}>↑</button>
            <button type="button" class="lhai-button lhai-button--secondary lhai-button--compact" data-msi-action="down" aria-label="${esc(downLabel)}" ${idx === sorted.length - 1 ? "disabled" : ""}>↓</button>
            <button type="button" class="lhai-button lhai-button--danger lhai-button--compact" data-msi-action="remove">${esc(t("common.admin_services.intake.remove", "Remove"))}</button>
          </div>
        </article>`;
    })
    .filter(Boolean)
    .join("");
  document.dispatchEvent(new CustomEvent("lhai:admin-intake-fields-changed", { bubbles: true }));
}

/** Customer Intake Builder에 있는 활성 질문 ``field_key`` (workflow 검증용). */
export function intakeActiveQuestionFieldKeys() {
  const keys = new Set();
  for (const f of msiSortedFields()) {
    if (f.archived_at) continue;
    const fk = String(f.field_key || "").trim();
    if (fk) keys.add(fk);
  }
  for (const b of msiSortedBlocks()) {
    if (String(b.block_type || "") !== "question_group" || b.archived_at || b.active === false) continue;
    const pl = b.payload && typeof b.payload === "object" ? /** @type {Record<string, unknown>} */ (b.payload) : {};
    const kids = Array.isArray(pl.children) ? pl.children : [];
    for (const ch of kids) {
      if (!ch || typeof ch !== "object") continue;
      const row = /** @type {Record<string, unknown>} */ (ch);
      const fk = String(row.field_key || row.id || "").trim();
      if (fk) keys.add(fk);
    }
  }
  return keys;
}

/**
 * Current service intake-builder options for workflow mapping.
 * For now, each service has at most one active template in this editor context.
 * Returned shape is intentionally API-friendly for future backend-backed dropdowns.
 */
export function intakeBuilderOptionsForCurrentService() {
  if (!msiTemplate || !msiTemplate.id) return [];
  return [
    {
      id: String(msiTemplate.id),
      value: String(msiTemplate.id),
      display_name: String(msiTemplate.name || "Customer Intake Builder").trim() || "Customer Intake Builder",
      label: String(msiTemplate.name || "Customer Intake Builder").trim() || "Customer Intake Builder",
      meta: msiTemplate.active === false ? "Inactive template" : "Service template",
    },
  ];
}

function msiUpdateIntakeHint() {
  const hint = qs("#manageServiceIntakeHint");
  const lead = qs("#manageServiceIntakeLead");
  const flowGuide = qs("#manageServiceIntakeFlowGuide");
  const presetRow = qs("#manageServiceIntakePresetPhoneBtn")?.closest(".admin-services__intake-preset-row");
  if (!hint || !lead) return;
  const id = qs("#manageServiceId")?.value?.trim();
  if (!id) {
    hint.hidden = false;
    hint.textContent = t(
      "common.admin_services.intake.hint_need_saved_service",
      "Save the service first, then you can define the customer intake (fields and options) for this service item in Customer Intake Builder."
    );
    lead.hidden = true;
    if (flowGuide) flowGuide.hidden = true;
    if (presetRow) presetRow.hidden = true;
    return;
  }
  hint.hidden = true;
  lead.hidden = false;
  if (flowGuide) flowGuide.hidden = false;
  if (presetRow) presetRow.hidden = false;
}

export async function msiRefresh() {
  const statusEl = qs("#manageServiceIntakeStatus");
  const id = qs("#manageServiceId")?.value?.trim();
  msiUpdateIntakeHint();
  if (!id) {
    msiTemplate = null;
    msiFields = [];
    msiBlocks = [];
    msiRenderFieldCards();
    msiRenderTechnical();
    msiCloseSidePanel();
    if (statusEl) statusEl.textContent = "";
    return;
  }
  try {
    if (statusEl) statusEl.textContent = t("common.admin_services.intake.loading", "Loading…");
    const bundle = await serviceIntakeAdminApi.getEditorBundle(id, {
      include_archived_fields: true,
      include_inactive_fields: true,
      include_inactive_options: true,
    });
    msiTemplate = bundle.template || null;
    msiFields = Array.isArray(bundle.fields) ? bundle.fields : [];
    msiBlocks = Array.isArray(bundle.blocks) ? bundle.blocks : [];
    msiRenderFieldCards();
    msiRenderTechnical();
    msiResetSidePanelEmpty();
    msiSyncBiddingAddButtonsVisibility();
    if (statusEl) statusEl.textContent = "";
  } catch (err) {
    msiTemplate = null;
    msiFields = [];
    msiBlocks = [];
    msiRenderFieldCards();
    msiRenderTechnical();
    msiCloseSidePanel();
    const msg = err && typeof err.message === "string" ? err.message : String(err);
    if (statusEl) statusEl.textContent = msg || t("common.admin_services.intake.load_error", "Could not load intake configuration.");
  }
}

export function msiOnServiceContextChanged() {
  const intakeBtn = qs("#manageServiceTabIntakeBtn");
  const docsBtn = qs("#manageServiceTabDocumentsBtn");
  const id = qs("#manageServiceId")?.value?.trim() || "";
  if (intakeBtn) intakeBtn.disabled = !id;
  if (docsBtn) docsBtn.disabled = !id;
  msiSyncBiddingAddButtonsVisibility();
  msdOnServiceContextChanged();
  msiUpdateIntakeHint();
  if (!id) {
    workflowHydrateForCreate();
    setServiceEditorTab("details");
    msiTemplate = null;
    msiFields = [];
    msiBlocks = [];
    msiRenderFieldCards();
    msiRenderTechnical();
    return;
  }
  if (qs("#manageServiceIntakePanel") && !qs("#manageServiceIntakePanel").hidden) {
    void msiRefresh();
  }
  if (qs("#manageServiceDocumentsPanel") && !qs("#manageServiceDocumentsPanel").hidden) {
    void msdRefresh();
  }
}

function msiToggleOptionsBlockVisibility() {
  const sel = qs("#manageServiceIntakeFieldInputType");
  const block = qs("#manageServiceIntakeOptionsBlock");
  if (!block || !sel) return;
  block.hidden = !msiIsSelectType(sel.value);
}

function msiUpdateBehaviorSubfieldsVisibility() {
  const it = qs("#manageServiceIntakeFieldInputType")?.value || "text";
  const ph = qs("#manageServiceIntakePlaceholderWrap");
  const df = qs("#manageServiceIntakeDefaultWrap");
  const hidePh = ["checkbox", "select", "radio", "multi_select"].includes(it);
  const hideDf = ["checkbox", "select", "radio", "multi_select"].includes(it);
  if (ph) ph.hidden = hidePh;
  if (df) df.hidden = hideDf;
}

function msiPopulateInputTypeSelect() {
  const sel = qs("#manageServiceIntakeFieldInputType");
  if (!sel || !(sel instanceof HTMLSelectElement)) return;
  sel.innerHTML = MSI_INPUT_TYPES.map(
    (o) => `<option value="${esc(o.value)}">${esc(t(o.i18nKey, o.fallback))}</option>`
  ).join("");
}

function msiSyncVisibilityConditionalBlock() {
  const cond = qs("#manageServiceIntakeVisConditional")?.checked;
  const block = qs("#manageServiceIntakeVisibilityConditionalBlock");
  if (block) block.hidden = !cond;
  if (cond) {
    const editId = qs("#manageServiceIntakeFieldEditId")?.value?.trim() || "";
    msiPopulateVisibilitySourceSelect(editId, !editId, qs("#manageServiceIntakeVisibilitySourceField")?.value || "");
    msiRefreshVisibilityMatchControl();
  }
}

function msiRenderChoiceEditors() {
  const list = qs("#manageServiceIntakeChoicesList");
  if (!list) return;
  if (!msiDialogChoices.length) msiDialogChoices = [{ id: "", label: "", active: true }];
  const upLabel = t("common.admin_services.intake.option_move_up", "Move option up");
  const downLabel = t("common.admin_services.intake.option_move_down", "Move option down");
  const n = msiDialogChoices.length;
  list.innerHTML = msiDialogChoices
    .map((row, idx) => {
      const oid = row.id ? ` data-option-id="${esc(row.id)}"` : "";
      const active = row.active !== false;
      return `
        <div class="admin-services__intake-option-card" data-choice-index="${idx}"${oid}>
          <div class="admin-services__intake-option-reorder" role="group" aria-label="${esc(t("common.admin_services.intake.option_reorder_group", "Reorder option"))}">
            <button type="button" class="lhai-button lhai-button--secondary lhai-button--compact" data-msi-choice-up aria-label="${esc(upLabel)}" ${idx === 0 ? "disabled" : ""}>↑</button>
            <button type="button" class="lhai-button lhai-button--secondary lhai-button--compact" data-msi-choice-down aria-label="${esc(downLabel)}" ${idx >= n - 1 ? "disabled" : ""}>↓</button>
          </div>
          <input type="text" class="lhai-input admin-services__intake-choice-label" maxlength="500" value="${esc(row.label)}" placeholder="${esc(t("common.admin_services.intake.choice_label_ph", "Option label"))}" />
          <label class="admin-services__switch admin-services__intake-option-active-switch">
            <input type="checkbox" class="admin-services__intake-choice-active" ${active ? "checked" : ""} />
            <span class="admin-services__switch-slider" aria-hidden="true"></span>
            <span class="admin-services__switch-label">${esc(t("common.admin_services.intake.option_active", "Active"))}</span>
          </label>
          <button type="button" class="lhai-button lhai-button--ghost lhai-button--compact admin-services__intake-choice-remove" data-msi-choice-remove>${esc(
            t("common.admin_services.intake.choice_remove", "Remove")
          )}</button>
        </div>`;
    })
    .join("");
}

function msiReadChoicesFromDomOrdered() {
  const rows = qsa("#manageServiceIntakeChoicesList .admin-services__intake-option-card");
  return rows.map((row) => {
    const input = row.querySelector(".admin-services__intake-choice-label");
    const label = input instanceof HTMLInputElement ? input.value.trim() : "";
    const oid = row.getAttribute("data-option-id") || "";
    const activeCb = row.querySelector(".admin-services__intake-choice-active");
    const active = activeCb instanceof HTMLInputElement ? activeCb.checked : true;
    return { id: oid, label, active };
  });
}

function msiOpenDialog(mode, field) {
  msiCancelSidePanel();
  const dlg = qs("#manageServiceIntakeFieldDialog");
  if (!dlg || !(dlg instanceof HTMLDialogElement)) return;
  msiDeletedOptionIds = new Set();
  msiVisibilityCustomMode = false;
  msiVisibilityCustomSnapshot = null;

  const isEdit = mode === "edit" && field;
  const editIdEl = qs("#manageServiceIntakeFieldEditId");
  if (editIdEl) editIdEl.value = isEdit ? field.id : "";

  qs("#manageServiceIntakeFieldLabel").value = field?.label || "";
  qs("#manageServiceIntakeFieldHelp").value = field?.help_text || "";
  const normType = msiNormalizeStoredInputType(field?.input_type);
  const typeSel = qs("#manageServiceIntakeFieldInputType");
  if (typeSel instanceof HTMLSelectElement) typeSel.value = normType;
  qs("#manageServiceIntakeFieldPlaceholder").value = field?.placeholder || "";
  qs("#manageServiceIntakeFieldDefault").value = field?.default_value ?? "";
  qs("#manageServiceIntakeFieldRequired").checked = Boolean(field?.required);
  const maskEl = qs("#manageServiceIntakeFieldMaskUntilAssigned");
  if (maskEl instanceof HTMLInputElement) {
    maskEl.checked = msiVisMaskUntilPartnerAssigned(field?.visibility_rule_json);
  }
  const activeEl = qs("#manageServiceIntakeFieldActive");
  if (activeEl instanceof HTMLInputElement) activeEl.checked = field ? field.active !== false : true;

  const vis = field?.visibility_rule_json;
  const parsed = msiParseVisibilityObject(vis);
  msiSetVisibilityCustomUi(false, null);
  if (parsed.kind === "custom") {
    msiSetVisibilityCustomUi(true, parsed.raw);
    msiApplyVisibilityToSimpleUi({ kind: "always" });
  } else {
    msiApplyVisibilityToSimpleUi(parsed);
  }

  if (field && Array.isArray(field.options) && field.options.length) {
    msiDialogChoices = field.options.map((o) => ({
      id: o.id || "",
      label: o.label || "",
      active: o.active !== false,
    }));
  } else {
    msiDialogChoices = [{ id: "", label: "", active: true }];
  }

  msiToggleOptionsBlockVisibility();
  msiUpdateBehaviorSubfieldsVisibility();
  msiRenderChoiceEditors();
  msiApplyPrefillToDialog(field?.prefill, field?.write_back);
  void msiLoadCustomerProfileFieldRegistry().then(() => {
    msiApplyPrefillToDialog(field?.prefill, field?.write_back);
  });

  const titleEl = qs("#manageServiceIntakeDialogTitle");
  const subEl = qs("#manageServiceIntakeDialogSubtitle");
  if (titleEl) {
    titleEl.textContent = isEdit
      ? t("common.admin_services.intake.dialog_heading_edit", "Edit Field")
      : t("common.admin_services.intake.dialog_heading_new", "Create New Field");
  }
  if (subEl) {
    subEl.textContent = isEdit
      ? t(
          "common.admin_services.intake.dialog_subtitle_edit",
          "Change the label, behavior, options, or when this field appears."
        )
      : t(
          "common.admin_services.intake.dialog_subtitle_new",
          "Set up a new question customers will answer for this service."
        );
  }

  msiCaptureFieldDialogSnapshot(isEdit ? field : null);
  dlg.showModal();
}

function msiCloseDialog() {
  msiFieldDialogSnapshot = null;
  const dlg = qs("#manageServiceIntakeFieldDialog");
  if (dlg instanceof HTMLDialogElement) dlg.close();
  msiResetSidePanelEmpty();
}

async function msiEnsureTemplate(serviceItemId) {
  if (msiTemplate?.id) return msiTemplate;
  const res = await serviceIntakeAdminApi.ensureTemplate(serviceItemId, {});
  msiTemplate = res.template;
  return msiTemplate;
}

async function msiSaveDialogField() {
  const serviceItemId = qs("#manageServiceId")?.value?.trim();
  if (!serviceItemId) {
    const msg = t(
      "common.admin_services.intake.hint_need_saved_service",
      "Save the service first, then you can define the customer intake (fields and options) for this service item in Customer Intake Builder."
    );
    const statusEl = qs("#manageServiceIntakeStatus");
    if (statusEl) statusEl.textContent = msg;
    window.alert(msg);
    return;
  }
  const label = qs("#manageServiceIntakeFieldLabel")?.value?.trim() || "";
  if (!label) {
    const msg = t("common.admin_services.intake.need_label", "Label shown to customer is required.");
    const statusEl = qs("#manageServiceIntakeStatus");
    if (statusEl) statusEl.textContent = msg;
    window.alert(msg);
    return;
  }

  let visibility_rule_json;
  try {
    visibility_rule_json = msiResolveVisibilityRuleForSave();
  } catch (e) {
    const msg = e && typeof e.message === "string" ? e.message : String(e);
    window.alert(msg);
    return;
  }
  const maskUntilEl = qs("#manageServiceIntakeFieldMaskUntilAssigned");
  visibility_rule_json = msiVisWithMaskUntilPartnerAssigned(
    visibility_rule_json,
    maskUntilEl instanceof HTMLInputElement && maskUntilEl.checked
  );

  const body = {
    label,
    help_text: qs("#manageServiceIntakeFieldHelp")?.value?.trim() || "",
    input_type: qs("#manageServiceIntakeFieldInputType")?.value || "text",
    placeholder: qs("#manageServiceIntakeFieldPlaceholder")?.value?.trim() || "",
    required: Boolean(qs("#manageServiceIntakeFieldRequired")?.checked),
    visibility_rule_json,
    default_value: qs("#manageServiceIntakeFieldDefault")?.value?.trim() || null,
    active: Boolean(qs("#manageServiceIntakeFieldActive")?.checked),
    ...(() => {
      const { prefill, write_back } = msiReadPrefillFromDialog();
      return { prefill, write_back };
    })(),
  };
  const editId = qs("#manageServiceIntakeFieldEditId")?.value?.trim() || "";
  const statusEl = qs("#manageServiceIntakeStatus");
  const saveBtn = qs("#manageServiceIntakeDialogSaveBtn");
  try {
    if (saveBtn instanceof HTMLButtonElement) {
      saveBtn.disabled = true;
      saveBtn.setAttribute("aria-busy", "true");
    }
    const tmpl = await msiEnsureTemplate(serviceItemId);
    if (!tmpl?.id) throw new Error("template");
    let fieldId = editId;
    if (editId) {
      await serviceIntakeAdminApi.updateField(editId, body);
    } else {
      // Question blocks share one ordered timeline with content blocks.
      // Use global max sort_order so new items appear at the end as admins add them.
      const maxOrder = msiIntakeMaxSortOrder();
      const created = await serviceIntakeAdminApi.createField(tmpl.id, { ...body, sort_order: maxOrder + 1 });
      fieldId = created.id;
    }
    if (msiIsChoiceType(body.input_type) && fieldId) {
      for (const oid of msiDeletedOptionIds) {
        try {
          await serviceIntakeAdminApi.deleteOption(oid);
        } catch {
          try {
            await serviceIntakeAdminApi.setOptionActive(oid, false);
          } catch {
            /* ignore */
          }
        }
      }
      const rows = msiReadChoicesFromDomOrdered().filter((r) => r.label);
      const existing = msiFields.find((f) => f.id === fieldId);
      const byId = Object.fromEntries((existing?.options || []).map((o) => [o.id, o]));

      const idOrder = [];
      for (const row of rows) {
        if (row.id && byId[row.id]) {
          const o = byId[row.id];
          const patch = {};
          if (o.label !== row.label) patch.label = row.label;
          if (Boolean(o.active) !== Boolean(row.active)) patch.active = row.active;
          if (Object.keys(patch).length) await serviceIntakeAdminApi.updateOption(row.id, patch);
          idOrder.push(row.id);
        } else if (row.label) {
          const createdOpt = await serviceIntakeAdminApi.createOption(fieldId, {
            label: row.label,
            active: row.active !== false,
          });
          idOrder.push(createdOpt.id);
        }
      }
      if (idOrder.length > 1) {
        await serviceIntakeAdminApi.reorderOptions(fieldId, idOrder);
      }
    }
    msiFieldDialogSnapshot = null;
    msiCloseDialog();
    await msiRefresh();
  } catch (err) {
    const msg = err && typeof err.message === "string" ? err.message : String(err);
    if (statusEl) statusEl.textContent = msg;
    window.alert(msg || t("common.admin_services.intake.save_error", "Could not save this field."));
  } finally {
    if (saveBtn instanceof HTMLButtonElement) {
      saveBtn.disabled = false;
      saveBtn.removeAttribute("aria-busy");
    }
  }
}

async function msiDuplicateField(fieldId) {
  const f = msiFields.find((x) => x.id === fieldId);
  if (!f || !msiTemplate?.id) return;
  const statusEl = qs("#manageServiceIntakeStatus");
  try {
    const maxOrder = msiIntakeMaxSortOrder();
    const copySuffix = t("common.admin_services.intake.copy_suffix", "copy");
    const copyLabel = `${f.label || ""} (${copySuffix})`.trim();
    const options = (f.options || []).map((o) => ({
      value: String(o.value ?? o.id ?? "").trim() || String(o.label || "").trim(),
      label: String(o.label || o.value || "").trim(),
      active: o.active !== false,
    }));
    await serviceIntakeAdminApi.createBlock(msiTemplate.id, {
      block_type: "question_group",
      sort_order: maxOrder + 1,
      payload: msiDefaultStandardQuestionGroupPayload({
        title: copyLabel,
        help_text: f.help_text || "",
        childLabel: copyLabel,
        input_type: f.input_type || "text",
        required: Boolean(f.required),
        options,
        children: [
          {
            id: msiNewLocalId(),
            label: copyLabel,
            help_text: f.help_text || "",
            input_type: f.input_type || "text",
            placeholder: f.placeholder || "",
            required: Boolean(f.required),
            default_value: f.default_value ?? null,
            validation: f.validation && typeof f.validation === "object" ? { ...f.validation } : {},
            options,
            prefill: f.prefill && typeof f.prefill === "object" ? { ...f.prefill } : {},
            visibility_rule_json: {},
          },
        ],
      }),
      visibility_rule_json:
        f.visibility_rule_json && typeof f.visibility_rule_json === "object" ? { ...f.visibility_rule_json } : {},
    });
    await msiRefresh();
  } catch (err) {
    if (statusEl) statusEl.textContent = err?.message || "Duplicate failed";
  }
}

/** Legacy ``question`` block → ``question_group`` (preserves child id for existing answers). */
async function msiConvertLegacyQuestionToGroup(blockId) {
  const f = msiFieldForQuestionBlock(blockId);
  const block = msiBlocks.find((b) => b.id === blockId);
  const tmplId = msiTemplate?.id;
  if (!f || !block || String(block.block_type) !== "question" || !tmplId) return;
  const statusEl = qs("#manageServiceIntakeStatus");
  const options = (f.options || []).map((o, i) => ({
    value: String(o.value ?? "").trim() || String(o.label ?? "").trim() || `opt_${i + 1}`,
    label: String(o.label || o.value || "").trim(),
    active: o.active !== false,
  }));
  try {
    const created = await serviceIntakeAdminApi.createBlock(tmplId, {
      block_type: "question_group",
      sort_order: block.sort_order ?? msiIntakeMaxSortOrder() + 1,
      payload: msiDefaultStandardQuestionGroupPayload({
        title: f.label || t("common.admin_services.intake.qgroup_default_title", "New questions"),
        description: f.help_text || "",
        children: [
          {
            id: f.id,
            label: f.label || "",
            help_text: f.help_text || "",
            input_type: f.input_type || "text",
            placeholder: f.placeholder || "",
            required: Boolean(f.required),
            default_value: f.default_value ?? null,
            validation: f.validation && typeof f.validation === "object" ? { ...f.validation } : {},
            options,
            prefill: f.prefill && typeof f.prefill === "object" ? { ...f.prefill } : {},
            write_back: f.write_back && typeof f.write_back === "object" ? { ...f.write_back } : {},
            visibility_rule_json: {},
          },
        ],
      }),
      visibility_rule_json:
        block.visibility_rule_json && typeof block.visibility_rule_json === "object"
          ? { ...block.visibility_rule_json }
          : {},
    });
    await serviceIntakeAdminApi.deleteBlock(blockId);
    await msiRefresh();
    const b = msiBlocks.find((x) => x.id === created.id);
    if (b) msiOpenSideEditor(b);
    if (statusEl) {
      statusEl.textContent = t(
        "common.admin_services.intake.legacy_question_converted",
        "Converted to a Questions block. You can add more fields in the group if needed."
      );
    }
  } catch (err) {
    const msg = err && typeof err.message === "string" ? err.message : String(err);
    if (statusEl) statusEl.textContent = msg;
    window.alert(msg);
  }
}

export function initManageServiceIntakeTab() {
  const tabsRoot = qs("#manageServiceEditorTabs");
  if (!tabsRoot) return;

  applyI18nToDom(tabsRoot.closest(".admin-services__service-detail-panel") || tabsRoot);
  msiWireIntakeBuilderHints();

  msiPopulateInputTypeSelect();
  void msiLoadCustomerProfileFieldRegistry();
  qs("#manageServiceIntakePrefillEnabled")?.addEventListener("change", () => msiSyncPrefillSubcontrolsDisabled());
  qs("#manageServiceIntakeWriteBackEnabled")?.addEventListener("change", () => msiSyncPrefillSubcontrolsDisabled());

  qsa("#manageServiceEditorTabs [data-service-editor-tab]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const tab = btn.getAttribute("data-service-editor-tab");
      if ((tab === "intake" || tab === "documents") && btn.disabled) return;
      if (tab === "details" || tab === "intake" || tab === "documents" || tab === "workflow") {
        setServiceEditorTab(tab);
      } else {
        setServiceEditorTab("details");
      }
    });
  });

  qs("#manageServiceIntakeAddDescriptionBtn")?.addEventListener("click", () => void msiAddContentBlock("description"));
  qs("#manageServiceIntakeAddDividerBtn")?.addEventListener("click", () => void msiAddContentBlock("divider"));
  qs("#manageServiceIntakeAddQuestionGroupBtn")?.addEventListener("click", () => void msiAddContentBlock("question_group"));
  qs("#manageServiceIntakePresetPhoneBtn")?.addEventListener("click", () => void msiApplyPhoneStylePreset());

  qs("#manageServiceIntakeSideCloseBtn")?.addEventListener("click", (ev) => {
    ev.preventDefault();
    ev.stopPropagation();
    msiCancelSidePanel();
  });
  qs("#manageServiceIntakeSideBackdrop")?.addEventListener("mousedown", (ev) => {
    ev.preventDefault();
    msiArmSideDismissGuard();
  });
  qs("#manageServiceIntakeSideBackdrop")?.addEventListener("click", (ev) => {
    ev.preventDefault();
    ev.stopPropagation();
    msiCancelSidePanel();
  });
  qs("#manageServiceIntakeSideSaveBtn")?.addEventListener("click", (ev) => {
    if (Date.now() < msiSideDismissGuardUntil) {
      ev.preventDefault();
      ev.stopPropagation();
      return;
    }
    ev.preventDefault();
    ev.stopPropagation();
    msiSideSaveRequested = true;
    void msiSaveSideEditor();
  });
  qs("#manageServiceIntakeSideForm")?.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      e.preventDefault();
      msiCancelSidePanel();
      return;
    }
    if (e.key !== "Enter") return;
    if (e.target instanceof HTMLTextAreaElement) return;
    e.preventDefault();
  });
  qs("#manageServiceIntakeSideDeleteBtn")?.addEventListener("click", (ev) => {
    ev.preventDefault();
    ev.stopPropagation();
    msiCancelSidePanel();
  });
  qs("#manageServiceIntakeSidePanel")?.addEventListener("click", (ev) => ev.stopPropagation());

  qsa('input[name="msiSideVisibilityMode"]').forEach((el) => {
    el.addEventListener("change", () => msiSideSyncVisibilityConditionalBlock());
  });
  qs("#manageServiceIntakeSideVisibilitySourceField")?.addEventListener("change", () => msiSideRefreshVisibilityMatchControl());

  qs("#manageServiceIntakeFields")?.addEventListener("click", async (e) => {
    if (Date.now() < msiSideDismissGuardUntil) return;
    const btn = e.target.closest("[data-msi-action]");
    const card = e.target.closest("[data-block-id]");
    if (!btn || !card) return;
    const blockId = card.getAttribute("data-block-id");
    const action = btn.getAttribute("data-msi-action");
    const block = msiBlocks.find((x) => x.id === blockId);
    if (!blockId || !block) return;
    const bt = String(block.block_type || "");
    if (bt === "question") {
      const f = msiFieldForQuestionBlock(blockId);
      if (!f) return;
      if (action === "convert_to_group") {
        await msiConvertLegacyQuestionToGroup(blockId);
        return;
      }
      if (action === "edit") {
        msiOpenDialog("edit", f);
        return;
      }
      if (action === "duplicate") {
        await msiDuplicateField(blockId);
        return;
      }
      if (action === "up") {
        await msiReorderBlock(blockId, "up");
        return;
      }
      if (action === "down") {
        await msiReorderBlock(blockId, "down");
        return;
      }
      if (action === "archive") {
        try {
          await serviceIntakeAdminApi.archiveField(blockId, true);
          await msiRefresh();
        } catch (err) {
          const st = qs("#manageServiceIntakeStatus");
          if (st) st.textContent = err?.message || "";
        }
        return;
      }
      if (action === "unarchive") {
        try {
          await serviceIntakeAdminApi.archiveField(blockId, false);
          await msiRefresh();
        } catch (err) {
          const st = qs("#manageServiceIntakeStatus");
          if (st) st.textContent = err?.message || "";
        }
        return;
      }
      if (action === "remove") {
        try {
          await serviceIntakeAdminApi.deleteField(blockId);
          await msiRefresh();
        } catch (err) {
          const msg = err?.message || "";
          const hint = t(
            "common.admin_services.intake.remove_use_archive",
            "This field cannot be removed while customer answers exist. Use Archive instead."
          );
          window.alert(msg.toLowerCase().includes("answer") || msg.includes("답") ? hint : msg || hint);
        }
      }
      return;
    }
    if (action === "duplicate") {
      await msiDuplicateContentBlock(blockId);
      return;
    }
    if (action === "add_child") {
      if (bt === "question_group") {
        msiOpenSideEditor(block);
        msiAppendQuestionGroupChildRow();
      }
      return;
    }
    if (action === "edit") {
      msiOpenSideEditor(block);
      return;
    }
    if (action === "up") {
      await msiReorderBlock(blockId, "up");
      return;
    }
    if (action === "down") {
      await msiReorderBlock(blockId, "down");
      return;
    }
    if (action === "remove") {
      try {
        await serviceIntakeAdminApi.deleteBlock(blockId);
        msiCloseSidePanel();
        await msiRefresh();
      } catch (err) {
        window.alert(err?.message || "");
      }
    }
  });

  qs("#manageServiceIntakeFieldInputType")?.addEventListener("change", () => {
    msiToggleOptionsBlockVisibility();
    msiUpdateBehaviorSubfieldsVisibility();
    if (!msiIsChoiceType(qs("#manageServiceIntakeFieldInputType").value)) {
      msiDialogChoices = [{ id: "", label: "", active: true }];
    } else if (!msiDialogChoices.length) {
      msiDialogChoices = [{ id: "", label: "", active: true }];
    }
    msiRenderChoiceEditors();
  });

  qs("#manageServiceIntakeAddChoiceBtn")?.addEventListener("click", () => {
    msiDialogChoices = msiReadChoicesFromDomOrdered();
    msiDialogChoices.push({ id: "", label: "", active: true });
    msiRenderChoiceEditors();
  });

  qs("#manageServiceIntakeChoicesList")?.addEventListener("click", (e) => {
    const up = e.target.closest("[data-msi-choice-up]");
    const down = e.target.closest("[data-msi-choice-down]");
    const rm = e.target.closest("[data-msi-choice-remove]");
    if (up || down) {
      msiDialogChoices = msiReadChoicesFromDomOrdered();
      const row = (up || down).closest("[data-choice-index]");
      if (!row) return;
      const idx = Number(row.getAttribute("data-choice-index"));
      if (!Number.isFinite(idx)) return;
      if (up && idx > 0) {
        const t0 = msiDialogChoices[idx - 1];
        msiDialogChoices[idx - 1] = msiDialogChoices[idx];
        msiDialogChoices[idx] = t0;
        msiRenderChoiceEditors();
      }
      if (down && idx < msiDialogChoices.length - 1) {
        const t0 = msiDialogChoices[idx + 1];
        msiDialogChoices[idx + 1] = msiDialogChoices[idx];
        msiDialogChoices[idx] = t0;
        msiRenderChoiceEditors();
      }
      return;
    }
    if (!rm) return;
    const row = rm.closest("[data-choice-index]");
    if (!row) return;
    const idx = Number(row.getAttribute("data-choice-index"));
    const cur = msiReadChoicesFromDomOrdered();
    if (Number.isFinite(idx) && cur[idx]?.id) msiDeletedOptionIds.add(cur[idx].id);
    if (Number.isFinite(idx)) cur.splice(idx, 1);
    msiDialogChoices = cur.length ? cur : [{ id: "", label: "", active: true }];
    msiRenderChoiceEditors();
  });

  qsa('input[name="msiVisibilityMode"]').forEach((el) => {
    el.addEventListener("change", () => msiSyncVisibilityConditionalBlock());
  });

  qs("#manageServiceIntakeVisibilitySourceField")?.addEventListener("change", () => msiRefreshVisibilityMatchControl());

  qs("#manageServiceIntakeVisibilityResetSimpleBtn")?.addEventListener("click", () => {
    msiSetVisibilityCustomUi(false, null);
    const alwaysEl = qs("#manageServiceIntakeVisAlways");
    if (alwaysEl instanceof HTMLInputElement) alwaysEl.checked = true;
    const condEl = qs("#manageServiceIntakeVisConditional");
    if (condEl instanceof HTMLInputElement) condEl.checked = false;
    msiSyncVisibilityConditionalBlock();
    const editId = qs("#manageServiceIntakeFieldEditId")?.value?.trim() || "";
    msiPopulateVisibilitySourceSelect(editId, !editId, "");
  });

  const fieldDlg = qs("#manageServiceIntakeFieldDialog");
  if (fieldDlg instanceof HTMLDialogElement && fieldDlg.dataset.msiCancelWired !== "1") {
    fieldDlg.dataset.msiCancelWired = "1";
    fieldDlg.addEventListener("cancel", (e) => {
      e.preventDefault();
      msiCancelFieldDialog();
    });
  }
  qs("#manageServiceIntakeDialogCancelBtn")?.addEventListener("click", () => msiCancelFieldDialog());
  qs("#manageServiceIntakeDialogSaveBtn")?.addEventListener("click", () => void msiSaveDialogField());
  qs("#manageServiceIntakeFieldForm")?.addEventListener("keydown", (e) => {
    if (e.key !== "Enter") return;
    if (e.target instanceof HTMLTextAreaElement) return;
    if (e.target instanceof HTMLSelectElement) return;
    e.preventDefault();
  });

  qs("#manageServiceIntakeSideMediaFile")?.addEventListener("change", (ev) => {
    const input = ev.target;
    if (!(input instanceof HTMLInputElement) || !input.files?.length) return;
    const file = input.files[0];
    const statusEl = qs("#manageServiceIntakeSideMediaUploadStatus");
    const urlIn = qs("#manageServiceIntakeSideMediaUrl");
    void (async () => {
      try {
        if (statusEl) {
          statusEl.hidden = false;
          statusEl.textContent = t(
            "common.admin_services.intake.side_media_uploading",
            "업로드 중…"
          );
        }
        const res = await serviceIntakeAdminApi.uploadIntakeContentImage(file);
        const u = res && typeof res.media_url === "string" ? res.media_url.trim() : "";
        if (!u) throw new Error("Invalid upload response");
        if (urlIn instanceof HTMLInputElement) urlIn.value = u;
        if (statusEl) {
          statusEl.textContent = t(
            "common.admin_services.intake.side_media_upload_ok",
            "업로드되었습니다. 아래 저장을 눌러 블록에 반영하세요."
          );
        }
      } catch (err) {
        const msg = err && typeof err.message === "string" ? err.message : String(err);
        const prefix = t("common.admin_services.intake.side_media_upload_err_prefix", "업로드 실패");
        const full = `${prefix}: ${msg}`;
        if (statusEl) {
          statusEl.hidden = false;
          statusEl.textContent = full;
        }
        window.alert(full);
      }
    })();
  });

  initAdminIntakePreview(() => ({
    fields: msiFields,
    blocks: msiBlocks,
    templateId: msiTemplate?.id ?? null,
  }));

  document.addEventListener("lhai:admin-workflow-type-changed", () => msiSyncBiddingAddButtonsVisibility());

  msiOnServiceContextChanged();
  msiSyncBiddingAddButtonsVisibility();
  msiSyncIntakeEditorFocusLayout(false);
}
