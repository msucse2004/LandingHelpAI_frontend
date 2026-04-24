/**
 * Customer Intake Builder tab — ordered blocks (questions + notices/images/rich text/dividers) via admin service-intake API.
 * Overview: `LandingHelpAI_backend/docs/customer_intake_builder.md`.
 */
import { initAdminIntakePreview } from "../intake/admin-intake-preview.js";
import { serviceIntakeAdminApi } from "../core/api.js";
import { msdOnServiceContextChanged, msdRefresh } from "./admin-service-documents-tab.js";
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
/** @type {Array<Record<string, unknown>>} Full template block list (question + content); aligns with API `blocks`. */
let msiBlocks = [];
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
        ["link"],
        ["clean"],
      ],
    },
  });
  return msiBodyQuill;
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

function msiSortedFields() {
  return [...msiFields].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
}

function msiSortedBlocks() {
  return [...msiBlocks].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
}

function msiFieldForQuestionBlock(blockId) {
  return msiFields.find((f) => f.id === blockId) || null;
}

const MSI_CONTENT_BLOCK_TYPES = ["notice", "image", "rich_text", "divider"];

function msiBlockTypeLabel(bt) {
  const k = `common.admin_services.intake.block_type_${String(bt || "").replace(/-/g, "_")}`;
  const fallbacks = {
    question: "Question",
    notice: "Notice",
    image: "Image",
    rich_text: "Rich text",
    divider: "Divider",
  };
  return t(k, fallbacks[String(bt)] || String(bt || ""));
}

/** One-line explanation for admins (cards, tooltips, side panel). */
function msiBlockTypeHelp(bt) {
  const k = `common.admin_services.intake.block_type_${String(bt || "").replace(/-/g, "_")}_help`;
  const fallbacks = {
    question:
      "Interactive step: collects an answer (text, choices, date, etc.). Use visibility on later blocks to branch on this answer.",
    notice:
      "Short message or callout—good for intros, tips, warnings, or text that should show only when a previous answer matches (Visibility).",
    image:
      "Visual step: diagram, screenshot, or photo. Add a URL or asset ID and alt text for accessibility.",
    rich_text:
      "Longer formatted text—use for summaries, checklists, or final instructions after questions.",
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
      block_type: "notice",
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
      block_type: "image",
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

    const branchField = await serviceIntakeAdminApi.createField(tmpl.id, {
      label: T("common.admin_services.intake.preset_phone_q_branch", "Does this situation apply to you?"),
      help_text: T(
        "common.admin_services.intake.preset_phone_q_branch_help",
        "The next notice appears only if the customer chooses Yes—edit Visibility on that block if needed."
      ),
      input_type: "radio",
      placeholder: "",
      required: true,
      sort_order: order++,
      visibility_rule_json: {},
      default_value: null,
      active: true,
    });

    await serviceIntakeAdminApi.createOption(branchField.id, {
      label: T("common.admin_services.intake.preset_phone_opt_yes", "Yes"),
      value: "yes",
      sort_order: 0,
      active: true,
    });
    await serviceIntakeAdminApi.createOption(branchField.id, {
      label: T("common.admin_services.intake.preset_phone_opt_no", "No"),
      value: "no",
      sort_order: 1,
      active: true,
    });

    await serviceIntakeAdminApi.createBlock(tmpl.id, {
      block_type: "notice",
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
        source_field_id: branchField.id,
        match_value: "yes",
      },
    });

    await serviceIntakeAdminApi.createField(tmpl.id, {
      label: T("common.admin_services.intake.preset_phone_q_followup", "Tell us more (optional)"),
      help_text: T(
        "common.admin_services.intake.preset_phone_q_followup_help",
        "A follow-up text question—set Visibility if it should depend on an earlier answer."
      ),
      input_type: "textarea",
      placeholder: "",
      required: false,
      sort_order: order++,
      visibility_rule_json: {},
      default_value: null,
      active: true,
    });

    await serviceIntakeAdminApi.createBlock(tmpl.id, {
      block_type: "notice",
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
      block_type: "rich_text",
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

function msiWireIntakeBuilderHints() {
  const map = [
    ["#manageServiceIntakeAddQuestionBtn", "question"],
    ["#manageServiceIntakeAddNoticeBtn", "notice"],
    ["#manageServiceIntakeAddImageBtn", "image"],
    ["#manageServiceIntakeAddRichTextBtn", "rich_text"],
    ["#manageServiceIntakeAddDividerBtn", "divider"],
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
  const body = p.body || "";
  return p.title || (body ? String(body).slice(0, 80) : msiBlockTypeLabel(bt));
}

function setServiceEditorTab(which) {
  const detailsBtn = qs("#manageServiceTabDetailsBtn");
  const intakeBtn = qs("#manageServiceTabIntakeBtn");
  const docsBtn = qs("#manageServiceTabDocumentsBtn");
  const detailsPanel = qs("#manageServiceDetailsPanel");
  const intakePanel = qs("#manageServiceIntakePanel");
  const docsPanel = qs("#manageServiceDocumentsPanel");
  if (!detailsPanel || !intakePanel) return;

  let showDetails = which === "details";
  let showIntake = which === "intake";
  let showDocs = which === "documents" && docsPanel;
  if (which === "documents" && !docsPanel) {
    showDetails = true;
    showIntake = false;
    showDocs = false;
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

  detailsPanel.hidden = !showDetails;
  intakePanel.hidden = !showIntake;
  if (docsPanel) docsPanel.hidden = !showDocs;

  if (showIntake) void msiRefresh();
  if (showDocs) void msdRefresh();
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

function msiCloseSidePanel() {
  const form = qs("#manageServiceIntakeSideForm");
  const empty = qs("#manageServiceIntakeSideEmpty");
  const p = qs("#manageServiceIntakeSidePanel");
  const th = qs("#manageServiceIntakeSideTypeHelp");
  if (form) form.hidden = true;
  if (empty) empty.hidden = false;
  if (th) th.hidden = true;
  if (p) p.hidden = true;
}

/** Show empty side hint after load (template exists); form opens when a content block is selected. */
function msiResetSidePanelEmpty() {
  const p = qs("#manageServiceIntakeSidePanel");
  const form = qs("#manageServiceIntakeSideForm");
  const empty = qs("#manageServiceIntakeSideEmpty");
  const th = qs("#manageServiceIntakeSideTypeHelp");
  if (!p || !msiTemplate?.id) return;
  p.hidden = false;
  if (form) form.hidden = true;
  if (empty) empty.hidden = false;
  if (th) th.hidden = true;
}

function msiPopulateSideVisibilitySourceSelect(selectedId) {
  const sel = qs("#manageServiceIntakeSideVisibilitySourceField");
  if (!sel || !(sel instanceof HTMLSelectElement)) return;
  const candidates = msiSortedFields().filter((f) => !f.archived_at);
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
  p.hidden = false;
  form.hidden = false;
  if (empty) empty.hidden = true;
  const bt = String(block.block_type || "");
  if (h) h.textContent = msiBlockTypeLabel(bt);
  if (typeHelp) {
    typeHelp.textContent = msiBlockTypeHelp(bt);
    typeHelp.hidden = false;
  }
  const bid = qs("#manageServiceIntakeSideBlockId");
  if (bid instanceof HTMLInputElement) bid.value = block.id;
  const pl = { ...(block.payload || {}) };
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
  if (bodySection instanceof HTMLElement) bodySection.hidden = bt === "divider";
  msiSetSideBodyEditorHtml(bt === "divider" ? "" : pl.body || "");
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
  if (mediaKind instanceof HTMLSelectElement) mediaKind.value = pl.media_kind || (bt === "image" ? "image" : "none");
  if (mediaLayout instanceof HTMLSelectElement) mediaLayout.value = pl.media_layout || "default";
  if (cap instanceof HTMLInputElement) cap.value = pl.caption || "";
  if (style instanceof HTMLSelectElement) style.value = pl.style_variant || "default";
  if (mediaWrap) mediaWrap.hidden = bt === "divider";
  const titleLbl = titleIn?.closest(".admin-services__intake-side-form")?.querySelector('label[for="manageServiceIntakeSideTitleInput"]');
  if (titleLbl instanceof HTMLElement) titleLbl.hidden = bt === "divider";
  if (titleIn instanceof HTMLElement) titleIn.hidden = bt === "divider";
  if (cap instanceof HTMLElement) cap.hidden = bt === "divider";
  const capLbl = cap?.previousElementSibling;
  if (capLbl instanceof HTMLElement && capLbl.classList.contains("lhai-label")) capLbl.hidden = bt === "divider";
  msiSideApplyVisibilityToUi(block.visibility_rule_json);
}

const MSI_MEDIA_ASSET_ID_RE = /^[A-Za-z0-9._:@/-]{1,128}$/;

async function msiSaveSideEditor() {
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
  const bt = String(block.block_type);
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
    await msiRefresh();
    const updated = msiBlocks.find((b) => b.id === blockId);
    if (updated) msiOpenSideEditor(updated);
  } catch (err) {
    const msg = err && typeof err.message === "string" ? err.message : String(err);
    if (statusEl) statusEl.textContent = msg;
    window.alert(msg);
  }
}

async function msiAddContentBlock(blockType) {
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
      notice: {
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
      image: {
        title: "",
        media_url: "",
        media_asset_id: "",
        caption: "",
        alt_text: "",
        body: "",
        media_kind: "image",
        media_layout: "default",
        style_variant: "default",
      },
      rich_text: {
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
    };
    const created = await serviceIntakeAdminApi.createBlock(tmpl.id, {
      block_type: blockType,
      payload: defaults[blockType] || {},
      visibility_rule_json: {},
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
        const badges = [];
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
              <p class="lhai-help admin-services__intake-card-type-help">${esc(msiBlockTypeHelp("question"))}</p>
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
      }
      const p = /** @type {Record<string, string>} */ (block.payload || {});
      const sub = p.body ? (p.body.length > 120 ? `${p.body.slice(0, 120)}…` : p.body) : "—";
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
  msdOnServiceContextChanged();
  msiUpdateIntakeHint();
  if (!id) {
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
  msiCloseSidePanel();
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
  msiWireIntakeBuilderHints();

  msiPopulateInputTypeSelect();

  qsa("#manageServiceEditorTabs [data-service-editor-tab]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const tab = btn.getAttribute("data-service-editor-tab");
      if ((tab === "intake" || tab === "documents") && btn.disabled) return;
      if (tab === "details" || tab === "intake" || tab === "documents") {
        setServiceEditorTab(tab);
      } else {
        setServiceEditorTab("details");
      }
    });
  });

  qs("#manageServiceIntakeAddQuestionBtn")?.addEventListener("click", async () => {
    const id = qs("#manageServiceId")?.value?.trim();
    if (!id) {
      const statusEl = qs("#manageServiceIntakeStatus");
      if (statusEl) {
        statusEl.textContent = t(
          "common.admin_services.intake.hint_need_saved_service",
          "Save the service first, then you can define the customer intake (fields and options) for this service item in Customer Intake Builder."
        );
      }
      return;
    }
    try {
      await msiEnsureTemplate(id);
      msiOpenDialog("new", null);
    } catch (err) {
      const statusEl = qs("#manageServiceIntakeStatus");
      if (statusEl) statusEl.textContent = err?.message || "";
    }
  });

  qs("#manageServiceIntakeAddNoticeBtn")?.addEventListener("click", () => void msiAddContentBlock("notice"));
  qs("#manageServiceIntakeAddImageBtn")?.addEventListener("click", () => void msiAddContentBlock("image"));
  qs("#manageServiceIntakeAddRichTextBtn")?.addEventListener("click", () => void msiAddContentBlock("rich_text"));
  qs("#manageServiceIntakeAddDividerBtn")?.addEventListener("click", () => void msiAddContentBlock("divider"));
  qs("#manageServiceIntakePresetPhoneBtn")?.addEventListener("click", () => void msiApplyPhoneStylePreset());

  qs("#manageServiceIntakeSideCloseBtn")?.addEventListener("click", () => msiCloseSidePanel());
  qs("#manageServiceIntakeSideSaveBtn")?.addEventListener("click", () => void msiSaveSideEditor());
  qs("#manageServiceIntakeSideDeleteBtn")?.addEventListener("click", async () => {
    const blockId = qs("#manageServiceIntakeSideBlockId")?.value?.trim();
    if (!blockId) return;
    const block = msiBlocks.find((b) => b.id === blockId);
    if (!block || String(block.block_type) === "question") {
      return;
    }
    try {
      await serviceIntakeAdminApi.deleteBlock(blockId);
      msiCloseSidePanel();
      await msiRefresh();
    } catch (err) {
      window.alert(err?.message || "");
    }
  });

  qsa('input[name="msiSideVisibilityMode"]').forEach((el) => {
    el.addEventListener("change", () => msiSideSyncVisibilityConditionalBlock());
  });
  qs("#manageServiceIntakeSideVisibilitySourceField")?.addEventListener("change", () => msiSideRefreshVisibilityMatchControl());

  qs("#manageServiceIntakeFields")?.addEventListener("click", async (e) => {
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

  qs("#manageServiceIntakeDialogCancelBtn")?.addEventListener("click", () => msiCloseDialog());
  qs("#manageServiceIntakeDialogSaveBtn")?.addEventListener("click", () => void msiSaveDialogField());

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

  qs("#manageServiceIntakeFieldForm")?.addEventListener("submit", (e) => {
    e.preventDefault();
    void msiSaveDialogField();
  });

  msiOnServiceContextChanged();
}
