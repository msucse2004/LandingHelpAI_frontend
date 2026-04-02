/**
 * Required Customer Info tab — service-linked intake (admin-service-intake API).
 */
import { serviceIntakeAdminApi } from "../core/api.js";
import { t } from "../core/i18n-client.js";
import { applyI18nToDom } from "../core/i18n-dom.js";
import { qs, qsa, safeText } from "../core/utils.js";

function esc(v) {
  return safeText(v);
}

/** Friendly input types (stored `input_type` values). */
const MSI_INPUT_TYPES = [
  { value: "text", i18nKey: "common.admin_services.intake.type_text", fallback: "Text" },
  { value: "number", i18nKey: "common.admin_services.intake.type_number", fallback: "Number" },
  { value: "date", i18nKey: "common.admin_services.intake.type_date", fallback: "Date" },
  { value: "textarea", i18nKey: "common.admin_services.intake.type_textarea", fallback: "Textarea" },
  { value: "select", i18nKey: "common.admin_services.intake.type_select", fallback: "Select" },
  { value: "radio", i18nKey: "common.admin_services.intake.type_radio", fallback: "Radio" },
  { value: "checkbox", i18nKey: "common.admin_services.intake.type_checkbox", fallback: "Checkbox" },
  { value: "multi_select", i18nKey: "common.admin_services.intake.type_multi_select", fallback: "Multi-select" },
];

let msiTemplate = null;
let msiFields = [];
/** @type {Set<string>} */
let msiDeletedOptionIds = new Set();
/** @type {{ id: string, label: string, active: boolean }[]} */
let msiDialogChoices = [];
/** When true, loaded visibility is not expressible in the simple builder. */
let msiVisibilityCustomMode = false;
/** Copy of custom rule JSON for save if advanced textarea is cleared by mistake. */
let msiVisibilityCustomSnapshot = null;

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

function msiSortedFields() {
  return [...msiFields].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
}

function msiSwitchTab(which) {
  const detailsBtn = qs("#manageServiceTabDetailsBtn");
  const intakeBtn = qs("#manageServiceTabIntakeBtn");
  const detailsPanel = qs("#manageServiceDetailsPanel");
  const intakePanel = qs("#manageServiceIntakePanel");
  if (!detailsPanel || !intakePanel) return;
  const showIntake = which === "intake";
  if (detailsBtn) {
    detailsBtn.classList.toggle("is-active", !showIntake);
    detailsBtn.setAttribute("aria-selected", showIntake ? "false" : "true");
  }
  if (intakeBtn) {
    intakeBtn.classList.toggle("is-active", showIntake);
    intakeBtn.setAttribute("aria-selected", showIntake ? "true" : "false");
  }
  detailsPanel.hidden = showIntake;
  intakePanel.hidden = !showIntake;
  if (showIntake) void msiRefresh();
}

function msiRenderTechnical() {
  const pre = qs("#manageServiceIntakeTechnicalPre");
  if (!pre) return;
  const payload = {
    template: msiTemplate ? { id: msiTemplate.id, name: msiTemplate.name, active: msiTemplate.active } : null,
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

function msiRenderFieldCards() {
  const root = qs("#manageServiceIntakeFields");
  if (!root) return;
  const sorted = msiSortedFields();
  if (!sorted.length) {
    root.innerHTML = `<div class="lhai-help admin-services__intake-empty">${esc(
      t("common.admin_services.intake.empty", "No fields yet. Use “+ Add Field” to define what you need from customers before delivery.")
    )}</div>`;
    return;
  }
  const upLabel = t("common.admin_services.editor.reorder.move_up", "Move up");
  const downLabel = t("common.admin_services.editor.reorder.move_down", "Move down");
  root.innerHTML = sorted
    .map((f, idx) => {
      const reqLabel = f.required
        ? t("common.admin_services.intake.req_yes", "Required")
        : t("common.admin_services.intake.req_no", "Optional");
      const ht = f.help_text || "";
      const helpPrev = ht.length > 140 ? `${ht.slice(0, 140)}…` : ht;
      const badges = [];
      if (f.archived_at) badges.push(`<span class="lhai-badge">${esc(t("common.admin_services.intake.badge_archived", "Archived"))}</span>`);
      if (!f.active) badges.push(`<span class="lhai-badge">${esc(t("common.admin_services.intake.badge_inactive", "Inactive"))}</span>`);
      const archAction = f.archived_at ? "unarchive" : "archive";
      const archText = f.archived_at
        ? t("common.admin_services.intake.restore", "Restore")
        : t("common.admin_services.intake.archive", "Archive");
      const typeLabel = msiFormatInputTypeLabel(f.input_type);
      return `
        <article class="admin-services__intake-card lhai-card" data-field-id="${esc(f.id)}">
          <div class="admin-services__intake-card-head">
            <div class="admin-services__intake-card-head-text">
              <div class="admin-services__intake-card-title">${esc(f.label || "—")}</div>
              <div class="lhai-help admin-services__intake-card-meta">${esc(typeLabel)} · ${esc(reqLabel)}</div>
            </div>
            <div class="admin-services__intake-card-badges">${badges.join("")}</div>
          </div>
          <p class="lhai-help admin-services__intake-card-help">${esc(helpPrev || "—")}</p>
          <div class="admin-services__row-actions admin-services__intake-card-actions">
            <button type="button" class="lhai-button lhai-button--secondary lhai-button--compact" data-msi-action="edit">${esc(t("common.admin_services.actions.edit", "Edit"))}</button>
            <button type="button" class="lhai-button lhai-button--secondary lhai-button--compact" data-msi-action="duplicate">${esc(t("common.admin_services.intake.duplicate", "Duplicate"))}</button>
            <button type="button" class="lhai-button lhai-button--secondary lhai-button--compact" data-msi-action="up" aria-label="${esc(upLabel)}" ${idx === 0 ? "disabled" : ""}>↑</button>
            <button type="button" class="lhai-button lhai-button--secondary lhai-button--compact" data-msi-action="down" aria-label="${esc(downLabel)}" ${idx === sorted.length - 1 ? "disabled" : ""}>↓</button>
            <button type="button" class="lhai-button lhai-button--secondary lhai-button--compact" data-msi-action="${esc(archAction)}">${esc(archText)}</button>
            <button type="button" class="lhai-button lhai-button--danger lhai-button--compact" data-msi-action="remove">${esc(t("common.admin_services.intake.remove", "Remove"))}</button>
          </div>
        </article>`;
    })
    .join("");
}

function msiUpdateIntakeHint() {
  const hint = qs("#manageServiceIntakeHint");
  const lead = qs("#manageServiceIntakeLead");
  if (!hint || !lead) return;
  const id = qs("#manageServiceId")?.value?.trim();
  if (!id) {
    hint.hidden = false;
    hint.textContent = t(
      "common.admin_services.intake.hint_need_saved_service",
      "Save the service first, then you can define required customer information for this service item."
    );
    lead.hidden = true;
    return;
  }
  hint.hidden = true;
  lead.hidden = false;
}

export async function msiRefresh() {
  const statusEl = qs("#manageServiceIntakeStatus");
  const id = qs("#manageServiceId")?.value?.trim();
  msiUpdateIntakeHint();
  if (!id) {
    msiTemplate = null;
    msiFields = [];
    msiRenderFieldCards();
    msiRenderTechnical();
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
    msiRenderFieldCards();
    msiRenderTechnical();
    if (statusEl) statusEl.textContent = "";
  } catch (err) {
    msiTemplate = null;
    msiFields = [];
    msiRenderFieldCards();
    msiRenderTechnical();
    const msg = err && typeof err.message === "string" ? err.message : String(err);
    if (statusEl) statusEl.textContent = msg || t("common.admin_services.intake.load_error", "Could not load intake configuration.");
  }
}

export function msiOnServiceContextChanged() {
  const intakeBtn = qs("#manageServiceTabIntakeBtn");
  const id = qs("#manageServiceId")?.value?.trim() || "";
  if (intakeBtn) intakeBtn.disabled = !id;
  msiUpdateIntakeHint();
  if (!id) {
    msiSwitchTab("details");
    msiTemplate = null;
    msiFields = [];
    msiRenderFieldCards();
    msiRenderTechnical();
    return;
  }
  if (qs("#manageServiceIntakePanel") && !qs("#manageServiceIntakePanel").hidden) {
    void msiRefresh();
  }
}

function msiToggleOptionsBlockVisibility() {
  const sel = qs("#manageServiceIntakeFieldInputType");
  const block = qs("#manageServiceIntakeOptionsBlock");
  if (!block || !sel) return;
  block.hidden = !msiIsChoiceType(sel.value);
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

  dlg.showModal();
}

function msiCloseDialog() {
  const dlg = qs("#manageServiceIntakeFieldDialog");
  if (dlg instanceof HTMLDialogElement) dlg.close();
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
      "Save the service first, then you can define required customer information for this service item."
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

  const body = {
    label,
    help_text: qs("#manageServiceIntakeFieldHelp")?.value?.trim() || "",
    input_type: qs("#manageServiceIntakeFieldInputType")?.value || "text",
    placeholder: qs("#manageServiceIntakeFieldPlaceholder")?.value?.trim() || "",
    required: Boolean(qs("#manageServiceIntakeFieldRequired")?.checked),
    visibility_rule_json,
    default_value: qs("#manageServiceIntakeFieldDefault")?.value?.trim() || null,
    active: Boolean(qs("#manageServiceIntakeFieldActive")?.checked),
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
      const maxOrder = msiSortedFields().reduce((m, f) => Math.max(m, f.sort_order ?? 0), -1);
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

async function msiReorderField(fieldId, dir) {
  const sorted = msiSortedFields();
  const idx = sorted.findIndex((f) => f.id === fieldId);
  if (idx < 0) return;
  const j = dir === "up" ? idx - 1 : idx + 1;
  if (j < 0 || j >= sorted.length) return;
  const next = sorted.slice();
  const tmp = next[idx];
  next[idx] = next[j];
  next[j] = tmp;
  if (!msiTemplate?.id) return;
  try {
    await serviceIntakeAdminApi.reorderFields(
      msiTemplate.id,
      next.map((f) => f.id)
    );
    await msiRefresh();
  } catch (err) {
    const statusEl = qs("#manageServiceIntakeStatus");
    if (statusEl) statusEl.textContent = err?.message || "Reorder failed";
  }
}

async function msiDuplicateField(fieldId) {
  const f = msiFields.find((x) => x.id === fieldId);
  if (!f || !msiTemplate?.id) return;
  const statusEl = qs("#manageServiceIntakeStatus");
  try {
    const sorted = msiSortedFields();
    const maxOrder = sorted.reduce((m, x) => Math.max(m, x.sort_order ?? 0), -1);
    const copySuffix = t("common.admin_services.intake.copy_suffix", "copy");
    const copyLabel = `${f.label || ""} (${copySuffix})`.trim();
    const created = await serviceIntakeAdminApi.createField(msiTemplate.id, {
      label: copyLabel,
      help_text: f.help_text || "",
      input_type: f.input_type || "text",
      placeholder: f.placeholder || "",
      required: Boolean(f.required),
      sort_order: maxOrder + 1,
      visibility_rule_json: f.visibility_rule_json && typeof f.visibility_rule_json === "object" ? { ...f.visibility_rule_json } : {},
      default_value: f.default_value ?? null,
      active: true,
    });
    if (msiIsChoiceType(f.input_type) && Array.isArray(f.options)) {
      for (const o of f.options) {
        if (o.label) await serviceIntakeAdminApi.createOption(created.id, { label: o.label, active: o.active !== false });
      }
    }
    await msiRefresh();
  } catch (err) {
    if (statusEl) statusEl.textContent = err?.message || "Duplicate failed";
  }
}

export function initManageServiceIntakeTab() {
  const tabsRoot = qs("#manageServiceEditorTabs");
  if (!tabsRoot) return;

  applyI18nToDom(tabsRoot.closest(".admin-services__service-detail-panel") || tabsRoot);

  msiPopulateInputTypeSelect();

  qsa("#manageServiceEditorTabs [data-service-editor-tab]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const tab = btn.getAttribute("data-service-editor-tab");
      if (tab === "intake" && btn.disabled) return;
      msiSwitchTab(tab === "intake" ? "intake" : "details");
    });
  });

  qs("#manageServiceIntakeAddFieldBtn")?.addEventListener("click", async () => {
    const id = qs("#manageServiceId")?.value?.trim();
    if (!id) return;
    try {
      await msiEnsureTemplate(id);
      msiOpenDialog("new", null);
    } catch (err) {
      const statusEl = qs("#manageServiceIntakeStatus");
      if (statusEl) statusEl.textContent = err?.message || "";
    }
  });

  qs("#manageServiceIntakeFields")?.addEventListener("click", async (e) => {
    const btn = e.target.closest("[data-msi-action]");
    const card = e.target.closest("[data-field-id]");
    if (!btn || !card) return;
    const fieldId = card.getAttribute("data-field-id");
    const action = btn.getAttribute("data-msi-action");
    const f = msiFields.find((x) => x.id === fieldId);
    if (!fieldId || !f) return;
    if (action === "edit") {
      msiOpenDialog("edit", f);
      return;
    }
    if (action === "duplicate") {
      await msiDuplicateField(fieldId);
      return;
    }
    if (action === "up") {
      await msiReorderField(fieldId, "up");
      return;
    }
    if (action === "down") {
      await msiReorderField(fieldId, "down");
      return;
    }
    if (action === "archive") {
      try {
        await serviceIntakeAdminApi.archiveField(fieldId, true);
        await msiRefresh();
      } catch (err) {
        const st = qs("#manageServiceIntakeStatus");
        if (st) st.textContent = err?.message || "";
      }
      return;
    }
    if (action === "unarchive") {
      try {
        await serviceIntakeAdminApi.archiveField(fieldId, false);
        await msiRefresh();
      } catch (err) {
        const st = qs("#manageServiceIntakeStatus");
        if (st) st.textContent = err?.message || "";
      }
      return;
    }
    if (action === "remove") {
      try {
        await serviceIntakeAdminApi.deleteField(fieldId);
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

  qs("#manageServiceIntakeDialogCancelBtn")?.addEventListener("click", () => msiCloseDialog());
  qs("#manageServiceIntakeDialogSaveBtn")?.addEventListener("click", () => void msiSaveDialogField());
  qs("#manageServiceIntakeFieldForm")?.addEventListener("submit", (e) => {
    e.preventDefault();
    void msiSaveDialogField();
  });

  msiOnServiceContextChanged();
}
