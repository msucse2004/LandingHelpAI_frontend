/**
 * Required Documents tab — post-payment document requirements per service (admin-service-documents API).
 */
import { serviceDocumentsAdminApi } from "../core/api.js";
import { t } from "../core/i18n-client.js";
import { applyI18nToDom } from "../core/i18n-dom.js";
import { qs, safeText } from "../core/utils.js";

function esc(v) {
  return safeText(v);
}

/** US states + DC for applicability multi-select. */
const MSD_US_JURISDICTIONS = [
  ["AL", "Alabama"],
  ["AK", "Alaska"],
  ["AZ", "Arizona"],
  ["AR", "Arkansas"],
  ["CA", "California"],
  ["CO", "Colorado"],
  ["CT", "Connecticut"],
  ["DE", "Delaware"],
  ["DC", "D.C."],
  ["FL", "Florida"],
  ["GA", "Georgia"],
  ["HI", "Hawaii"],
  ["ID", "Idaho"],
  ["IL", "Illinois"],
  ["IN", "Indiana"],
  ["IA", "Iowa"],
  ["KS", "Kansas"],
  ["KY", "Kentucky"],
  ["LA", "Louisiana"],
  ["ME", "Maine"],
  ["MD", "Maryland"],
  ["MA", "Massachusetts"],
  ["MI", "Michigan"],
  ["MN", "Minnesota"],
  ["MS", "Mississippi"],
  ["MO", "Missouri"],
  ["MT", "Montana"],
  ["NE", "Nebraska"],
  ["NV", "Nevada"],
  ["NH", "New Hampshire"],
  ["NJ", "New Jersey"],
  ["NM", "New Mexico"],
  ["NY", "New York"],
  ["NC", "North Carolina"],
  ["ND", "North Dakota"],
  ["OH", "Ohio"],
  ["OK", "Oklahoma"],
  ["OR", "Oregon"],
  ["PA", "Pennsylvania"],
  ["RI", "Rhode Island"],
  ["SC", "South Carolina"],
  ["SD", "South Dakota"],
  ["TN", "Tennessee"],
  ["TX", "Texas"],
  ["UT", "Utah"],
  ["VT", "Vermont"],
  ["VA", "Virginia"],
  ["WA", "Washington"],
  ["WV", "West Virginia"],
  ["WI", "Wisconsin"],
  ["WY", "Wyoming"],
];

let msdTemplate = null;
/** @type {any[]} */
let msdItems = [];
let msdStatePickerBuilt = false;

function msdServiceItemId() {
  return qs("#manageServiceId")?.value?.trim() || "";
}

function msdStatusEl() {
  return qs("#manageServiceDocumentsStatus");
}

function msdScopeFromItem(item) {
  if (!item || item.applies_to_all_states !== false) return "all";
  const m = item.state_filter_mode || "ONLY_SELECTED";
  if (m === "ONLY_SELECTED") return "only";
  if (m === "ALL_EXCEPT_SELECTED") return "except";
  return "all";
}

function msdStateSummary(item) {
  if (item.applies_to_all_states) {
    return t("common.admin_services.documents.state_all", "All states");
  }
  const mode = item.state_filter_mode || "ALL_STATES";
  const codes = Array.isArray(item.state_codes_json) ? item.state_codes_json.filter(Boolean).join(", ") : "";
  if (mode === "ONLY_SELECTED") {
    return codes
      ? t("common.admin_services.documents.state_only", "Only: {states}").replace("{states}", esc(codes))
      : t("common.admin_services.documents.state_only_empty", "Selected states (add codes)");
  }
  if (mode === "ALL_EXCEPT_SELECTED") {
    return codes
      ? t("common.admin_services.documents.state_except", "All except: {states}").replace("{states}", esc(codes))
      : t("common.admin_services.documents.state_except_empty", "All states except (add exclusions)");
  }
  return t("common.admin_services.documents.state_all", "All states");
}

function msdSortedNonArchived() {
  return [...msdItems]
    .filter((i) => !i.archived_at)
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || String(a.document_key || "").localeCompare(String(b.document_key || "")));
}

function msdRenderList() {
  const root = qs("#manageServiceDocumentsList");
  if (!root) return;

  if (!msdServiceItemId()) {
    root.innerHTML = `<div class="lhai-state lhai-state--empty">${esc(t("common.admin_services.documents.select_service", "Select or create a service first."))}</div>`;
    return;
  }

  const archived = msdItems.filter((i) => i.archived_at);
  const active = msdSortedNonArchived();

  if (!msdItems.length && !msdTemplate) {
    root.innerHTML = `<div class="lhai-state lhai-state--empty">${esc(t("common.admin_services.documents.empty_hint", "No document requirements yet. Use “+ Add Document” to start — a template will be created automatically."))}</div>`;
    return;
  }

  const cards = (rows) =>
    rows
      .map((item) => {
        const reqLabel = item.required
          ? t("common.admin_services.documents.badge_required", "Required")
          : t("common.admin_services.documents.badge_optional", "Optional");
        const reqClass = item.required ? "lhai-badge lhai-badge--status-active" : "lhai-badge";
        const inactive = item.active === false && !item.archived_at;
        const archBadge = item.archived_at
          ? `<span class="lhai-badge">${esc(t("common.admin_services.documents.badge_archived", "Archived"))}</span>`
          : inactive
            ? `<span class="lhai-badge">${esc(t("common.admin_services.documents.badge_inactive", "Inactive"))}</span>`
            : "";
        const timing = (item.timing || "").trim();
        const shortDesc = (item.short_description || "").trim();
        const reason = (item.reason_text || "").trim();
        const canReorder = !item.archived_at;
        return `
      <article class="admin-services__doc-card${item.archived_at ? " admin-services__doc-card--archived" : ""}" data-doc-item-id="${esc(item.id)}">
        <div class="admin-services__doc-card-head">
          <div>
            <h3 class="admin-services__doc-card-title">${esc(item.name || "—")}</h3>
            <div class="admin-services__doc-card-badges u-mt-2">
              <span class="${reqClass}">${esc(reqLabel)}</span>
              ${archBadge}
            </div>
          </div>
        </div>
        ${timing ? `<p class="admin-services__doc-card-meta"><strong>${esc(t("common.admin_services.documents.timing_label", "Timing"))}:</strong> ${esc(timing)}</p>` : ""}
        ${shortDesc ? `<p class="admin-services__doc-card-help lhai-help">${esc(shortDesc)}</p>` : ""}
        ${reason ? `<p class="admin-services__doc-card-meta lhai-help"><strong>${esc(t("common.admin_services.documents.why_label", "Why"))}:</strong> ${esc(reason)}</p>` : ""}
        <p class="admin-services__doc-card-meta lhai-help u-mb-0"><strong>${esc(t("common.admin_services.documents.states_label", "States"))}:</strong> ${msdStateSummary(item)}</p>
        <div class="admin-services__intake-card-actions lhai-row-actions u-mt-3">
          <button type="button" class="lhai-button lhai-button--secondary lhai-button--compact" data-msd-action="edit">${esc(t("common.actions.edit", "Edit"))}</button>
          <button type="button" class="lhai-button lhai-button--secondary lhai-button--compact" data-msd-action="duplicate">${esc(t("common.admin_services.documents.duplicate", "Duplicate"))}</button>
          <button type="button" class="lhai-button lhai-button--secondary lhai-button--compact" data-msd-action="up" ${canReorder ? "" : "disabled"}>${esc(t("common.admin_services.documents.move_up", "Move up"))}</button>
          <button type="button" class="lhai-button lhai-button--secondary lhai-button--compact" data-msd-action="down" ${canReorder ? "" : "disabled"}>${esc(t("common.admin_services.documents.move_down", "Move down"))}</button>
          ${
            item.archived_at
              ? `<button type="button" class="lhai-button lhai-button--secondary lhai-button--compact" data-msd-action="unarchive">${esc(t("common.admin_services.documents.unarchive", "Restore"))}</button>`
              : `<button type="button" class="lhai-button lhai-button--secondary lhai-button--compact" data-msd-action="archive">${esc(t("common.admin_services.documents.archive", "Archive"))}</button>`
          }
        </div>
      </article>`;
      })
      .join("");

  let html = "";
  if (active.length) {
    html += `<h4 class="admin-services__doc-section-title">${esc(t("common.admin_services.documents.section_active", "Document requirements"))}</h4>${cards(active)}`;
  }
  if (archived.length) {
    const sortedArch = [...archived].sort((a, b) => String(b.archived_at || "").localeCompare(String(a.archived_at || "")));
    html += `<h4 class="admin-services__doc-section-title u-mt-4">${esc(t("common.admin_services.documents.section_archived", "Archived"))}</h4>${cards(sortedArch)}`;
  }
  if (!html) {
    html = `<div class="lhai-state lhai-state--empty">${esc(t("common.admin_services.documents.empty_hint", "No document requirements yet."))}</div>`;
  }
  root.innerHTML = html;
}

function msdEnsureStatePickerBuilt() {
  const mount = qs("#manageServiceDocumentStatePicker");
  if (!mount || msdStatePickerBuilt) return;
  mount.innerHTML = MSD_US_JURISDICTIONS.map(
    ([code, name]) => `
    <label class="admin-services__msd-state-chip">
      <input type="checkbox" name="msdStatePick" value="${esc(code)}" data-msd-state-code="${esc(code)}" />
      <span><strong>${esc(code)}</strong> ${esc(name)}</span>
    </label>`
  ).join("");
  msdStatePickerBuilt = true;
}

function msdGetStateScope() {
  const r = qs("input[name='msdStateScope']:checked");
  const v = r?.value || "all";
  if (v === "only" || v === "except") return v;
  return "all";
}

function msdSetStateScope(scope) {
  const id = scope === "only" ? "msdScopeOnly" : scope === "except" ? "msdScopeExcept" : "msdScopeAll";
  const el = qs(`#${id}`);
  if (el) {
    el.checked = true;
  }
  msdUpdateStatePickerWrap();
}

function msdGetSelectedStateCodes() {
  const mount = qs("#manageServiceDocumentStatePicker");
  if (!mount) return [];
  return [...mount.querySelectorAll("input[type=checkbox][name='msdStatePick']:checked")]
    .map((x) => String(x.value || "").trim().toUpperCase())
    .filter(Boolean);
}

function msdSetSelectedStateCodes(codes) {
  const want = new Set((codes || []).map((c) => String(c).trim().toUpperCase()).filter(Boolean));
  const mount = qs("#manageServiceDocumentStatePicker");
  if (!mount) return;
  mount.querySelectorAll("input[type=checkbox][name='msdStatePick']").forEach((cb) => {
    cb.checked = want.has(String(cb.value || "").toUpperCase());
  });
}

function msdUpdateStatePickerWrap() {
  const wrap = qs("#manageServiceDocumentStatePickerWrap");
  if (!wrap) return;
  const scope = msdGetStateScope();
  wrap.hidden = scope === "all";
  const label = qs("#manageServiceDocumentPickerLabel");
  if (label) {
    label.textContent =
      scope === "only"
        ? t("common.admin_services.documents.picker_only_title", "Select states where this applies")
        : scope === "except"
          ? t("common.admin_services.documents.picker_except_title", "Select states to exclude")
          : t("common.admin_services.documents.picker_label", "Select states");
  }
}

function msdSetRequiredSegment(isRequired) {
  const cb = qs("#manageServiceDocumentRequired");
  if (cb) cb.checked = Boolean(isRequired);
  const reqBtn = qs("#msdSegRequired");
  const optBtn = qs("#msdSegOptional");
  if (reqBtn) {
    reqBtn.classList.toggle("is-active", isRequired);
    reqBtn.setAttribute("aria-pressed", isRequired ? "true" : "false");
  }
  if (optBtn) {
    optBtn.classList.toggle("is-active", !isRequired);
    optBtn.setAttribute("aria-pressed", !isRequired ? "true" : "false");
  }
}

function msdWireDialogChrome(mode) {
  const form = qs("#manageServiceDocumentForm");
  const badge = qs("#manageServiceDocumentDialogBadge");
  const heading = qs("#manageServiceDocumentDialogHeading");
  if (form) {
    form.classList.toggle("is-msd-edit", mode === "edit");
  }
  if (badge) {
    badge.textContent =
      mode === "edit"
        ? t("common.admin_services.documents.badge_editing", "Editing")
        : t("common.admin_services.documents.badge_new", "New");
  }
  if (heading) {
    heading.textContent =
      mode === "edit"
        ? t("common.admin_services.documents.heading_edit", "Edit Document Requirement")
        : t("common.admin_services.documents.heading_create", "Create New Document Requirement");
  }
}

function msdOpenDialog(mode, item) {
  msdEnsureStatePickerBuilt();
  const dlg = qs("#manageServiceDocumentDialog");
  if (!dlg) return;
  applyI18nToDom(dlg);

  msdWireDialogChrome(mode === "edit" ? "edit" : "create");

  qs("#manageServiceDocumentEditId").value = mode === "edit" && item ? item.id : "";
  qs("#manageServiceDocumentName").value = item?.name || "";
  qs("#manageServiceDocumentShortDesc").value = item?.short_description || "";
  qs("#manageServiceDocumentReason").value = item?.reason_text || "";
  msdSetRequiredSegment(item?.required !== false);
  qs("#manageServiceDocumentTiming").value = item?.timing || "";
  const formats = Array.isArray(item?.accepted_formats) ? item.accepted_formats.join(", ") : "";
  qs("#manageServiceDocumentFormats").value = formats;
  qs("#manageServiceDocumentExample").value = item?.example_note || "";

  const scope = msdScopeFromItem(item);
  msdSetStateScope(scope);
  const codes = Array.isArray(item?.state_codes_json) ? item.state_codes_json : [];
  msdSetSelectedStateCodes(codes);

  try {
    const cr = item?.condition_rule_json;
    qs("#manageServiceDocumentConditionJson").value = cr && Object.keys(cr).length ? JSON.stringify(cr, null, 2) : "";
  } catch {
    qs("#manageServiceDocumentConditionJson").value = "";
  }

  msdUpdateStatePickerWrap();
  dlg.showModal();
}

function msdCloseDialog() {
  qs("#manageServiceDocumentDialog")?.close();
}

function msdParseFormats(text) {
  return String(text || "")
    .split(/[,;]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function msdParseConditionJson() {
  const raw = qs("#manageServiceDocumentConditionJson")?.value?.trim() || "";
  if (!raw) return {};
  try {
    const o = JSON.parse(raw);
    return o && typeof o === "object" && !Array.isArray(o) ? o : {};
  } catch {
    throw new Error(
      t("common.admin_services.documents.invalid_condition_json", "Extra condition must be valid JSON object or empty.")
    );
  }
}

async function msdSaveDialog() {
  const sid = msdServiceItemId();
  const st = msdStatusEl();
  const name = qs("#manageServiceDocumentName")?.value?.trim() || "";
  if (!name) {
    if (st) st.textContent = t("common.admin_services.documents.name_required", "Name is required.");
    return;
  }

  const scope = msdGetStateScope();
  const stateCodes = msdGetSelectedStateCodes();
  if (scope !== "all" && stateCodes.length === 0) {
    if (st) {
      st.textContent = t(
        "common.admin_services.documents.states_required",
        "Select at least one state, or choose “All states.”"
      );
    }
    return;
  }

  let condition_rule_json;
  try {
    condition_rule_json = msdParseConditionJson();
  } catch (e) {
    if (st) st.textContent = e.message || "";
    return;
  }

  const appliesAll = scope === "all";
  const state_filter_mode = appliesAll ? "ALL_STATES" : scope === "only" ? "ONLY_SELECTED" : "ALL_EXCEPT_SELECTED";

  const payload = {
    name,
    short_description: qs("#manageServiceDocumentShortDesc")?.value?.trim() || "",
    reason_text: qs("#manageServiceDocumentReason")?.value?.trim() || "",
    required: Boolean(qs("#manageServiceDocumentRequired")?.checked),
    timing: qs("#manageServiceDocumentTiming")?.value?.trim() || "",
    accepted_formats: msdParseFormats(qs("#manageServiceDocumentFormats")?.value),
    example_note: qs("#manageServiceDocumentExample")?.value?.trim() || "",
    applies_to_all_states: appliesAll,
    state_filter_mode,
    state_codes_json: appliesAll ? [] : stateCodes,
    condition_rule_json,
  };

  const editId = qs("#manageServiceDocumentEditId")?.value?.trim() || "";
  if (st) st.textContent = "";
  try {
    await serviceDocumentsAdminApi.ensureTemplate(sid, {});
    if (editId) {
      await serviceDocumentsAdminApi.updateItem(sid, editId, payload);
    } else {
      await serviceDocumentsAdminApi.createItem(sid, payload);
    }
    msdCloseDialog();
    await msdRefresh();
  } catch (err) {
    const msg = err && typeof err.message === "string" ? err.message : String(err);
    if (st) st.textContent = msg || t("common.admin_services.documents.save_error", "Could not save.");
  }
}

async function msdReorderOne(itemId, direction) {
  const sid = msdServiceItemId();
  const st = msdStatusEl();
  const order = msdSortedNonArchived().map((x) => x.id);
  const idx = order.indexOf(itemId);
  if (idx < 0) return;
  const j = direction === "up" ? idx - 1 : idx + 1;
  if (j < 0 || j >= order.length) return;
  const next = [...order];
  [next[idx], next[j]] = [next[j], next[idx]];
  try {
    if (st) st.textContent = "";
    await serviceDocumentsAdminApi.reorderItems(sid, next);
    await msdRefresh();
  } catch (err) {
    const msg = err && typeof err.message === "string" ? err.message : String(err);
    if (st) st.textContent = msg || "";
  }
}

export async function msdRefresh() {
  const sid = msdServiceItemId();
  const st = msdStatusEl();
  if (!sid) {
    msdTemplate = null;
    msdItems = [];
    msdRenderList();
    return;
  }
  try {
    if (st) st.textContent = "";
    const bundle = await serviceDocumentsAdminApi.getEditorBundle(sid, {
      include_archived_items: true,
      include_inactive_items: true,
    });
    msdTemplate = bundle.template || null;
    msdItems = Array.isArray(bundle.items) ? bundle.items : [];
    msdRenderList();
  } catch (err) {
    msdTemplate = null;
    msdItems = [];
    msdRenderList();
    const msg = err && typeof err.message === "string" ? err.message : String(err);
    if (st) st.textContent = msg || t("common.admin_services.documents.load_error", "Could not load required documents.");
  }
}

export function msdOnServiceContextChanged() {
  const id = msdServiceItemId();
  if (!id) {
    msdTemplate = null;
    msdItems = [];
    msdRenderList();
    const st = msdStatusEl();
    if (st) st.textContent = "";
    return;
  }
  if (qs("#manageServiceDocumentsPanel") && !qs("#manageServiceDocumentsPanel").hidden) {
    void msdRefresh();
  }
}

export function initManageServiceDocumentsTab() {
  const panel = qs("#manageServiceDocumentsPanel")?.closest(".admin-services__service-detail-panel");
  if (panel) applyI18nToDom(panel);

  msdEnsureStatePickerBuilt();

  const form = qs("#manageServiceDocumentForm");
  form?.addEventListener("change", (e) => {
    if (e.target?.matches?.("input[name='msdStateScope']")) {
      msdUpdateStatePickerWrap();
    }
  });

  qs("#msdSegRequired")?.addEventListener("click", () => msdSetRequiredSegment(true));
  qs("#msdSegOptional")?.addEventListener("click", () => msdSetRequiredSegment(false));

  qs("#manageServiceDocumentStateSelectAll")?.addEventListener("click", () => {
    qs("#manageServiceDocumentStatePicker")?.querySelectorAll("input[type=checkbox][name='msdStatePick']").forEach((cb) => {
      cb.checked = true;
    });
  });
  qs("#manageServiceDocumentStateClear")?.addEventListener("click", () => {
    qs("#manageServiceDocumentStatePicker")?.querySelectorAll("input[type=checkbox][name='msdStatePick']").forEach((cb) => {
      cb.checked = false;
    });
  });

  qs("#manageServiceDocumentDialogCancelBtn")?.addEventListener("click", () => msdCloseDialog());
  qs("#manageServiceDocumentDialogSaveBtn")?.addEventListener("click", () => void msdSaveDialog());
  qs("#manageServiceDocumentForm")?.addEventListener("submit", (e) => {
    e.preventDefault();
    void msdSaveDialog();
  });

  qs("#manageServiceDocumentsAddBtn")?.addEventListener("click", async () => {
    const sid = msdServiceItemId();
    if (!sid) return;
    const st = msdStatusEl();
    try {
      if (st) st.textContent = "";
      await serviceDocumentsAdminApi.ensureTemplate(sid, {});
      msdOpenDialog("new", null);
    } catch (err) {
      const msg = err && typeof err.message === "string" ? err.message : String(err);
      if (st) st.textContent = msg || "";
    }
  });

  qs("#manageServiceDocumentsList")?.addEventListener("click", async (e) => {
    const btn = e.target.closest("[data-msd-action]");
    const card = e.target.closest("[data-doc-item-id]");
    if (!btn || !card) return;
    const itemId = card.getAttribute("data-doc-item-id");
    const action = btn.getAttribute("data-msd-action");
    const item = msdItems.find((x) => x.id === itemId);
    if (!itemId || !item) return;
    const sid = msdServiceItemId();
    const st = msdStatusEl();

    if (action === "edit") {
      msdOpenDialog("edit", item);
      return;
    }
    if (action === "duplicate") {
      try {
        if (st) st.textContent = "";
        await serviceDocumentsAdminApi.ensureTemplate(sid, {});
        const copyName = `${item.name || "Document"} (${t("common.admin_services.documents.copy_suffix", "copy")})`;
        await serviceDocumentsAdminApi.createItem(sid, {
          name: copyName.slice(0, 300),
          short_description: item.short_description || "",
          reason_text: item.reason_text || "",
          required: item.required !== false,
          timing: item.timing || "",
          accepted_formats: Array.isArray(item.accepted_formats) ? [...item.accepted_formats] : [],
          example_note: item.example_note || "",
          applies_to_all_states: item.applies_to_all_states !== false,
          state_filter_mode: item.state_filter_mode || "ALL_STATES",
          state_codes_json: Array.isArray(item.state_codes_json) ? [...item.state_codes_json] : [],
          condition_rule_json: item.condition_rule_json && typeof item.condition_rule_json === "object" ? { ...item.condition_rule_json } : {},
          active: true,
        });
        await msdRefresh();
      } catch (err) {
        const msg = err && typeof err.message === "string" ? err.message : String(err);
        if (st) st.textContent = msg || "";
      }
      return;
    }
    if (action === "up") {
      await msdReorderOne(itemId, "up");
      return;
    }
    if (action === "down") {
      await msdReorderOne(itemId, "down");
      return;
    }
    if (action === "archive") {
      try {
        if (st) st.textContent = "";
        await serviceDocumentsAdminApi.archiveItem(sid, itemId, true);
        await msdRefresh();
      } catch (err) {
        const msg = err && typeof err.message === "string" ? err.message : String(err);
        if (st) st.textContent = msg || "";
      }
      return;
    }
    if (action === "unarchive") {
      try {
        if (st) st.textContent = "";
        await serviceDocumentsAdminApi.archiveItem(sid, itemId, false);
        await msdRefresh();
      } catch (err) {
        const msg = err && typeof err.message === "string" ? err.message : String(err);
        if (st) st.textContent = msg || "";
      }
    }
  });

  msdRenderList();
}
