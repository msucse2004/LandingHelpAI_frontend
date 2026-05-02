/**
 * Customer Intake Builder — static + interactive preview (local state only; no API).
 */
import { t } from "../core/i18n-client.js";
import { qs } from "../core/utils.js";
import { renderIntakeContentBlocksArray, escapeHtml } from "./intake-block-render.js";
import {
  deliveryBadgeModifierFromLabel,
  deliveryCapabilityBadgeFromFlags,
  previewServiceHeaderSubtitleFromFlags,
} from "./intake-runtime-view.js";
import {
  answerJsonIsNonempty,
  collectPreviewValueJson,
  contentBlocksForPreviewStep,
  findNextUnansweredPreviewStep,
  orderedActiveBlocks,
  orderedActiveFields,
  previewControlsHtml,
  previewFieldFromGroupChild,
} from "./intake-preview-branching.js";
import { shouldHideIntakeBlockTitle } from "./intake-form-presentation.js";

/** @typedef {{ fields: Array<Record<string, unknown>>; blocks: Array<Record<string, unknown>>; templateId?: string | null }} IntakePreviewSnapshot */

/** @returns {{ title: string; badge: string; aiCapable: boolean; inPersonRequired: boolean }} */
function readCustomerHeaderFromDom() {
  const customerTitle = qs("#manageServiceCustomerTitle")?.value?.trim() || "";
  const name = qs("#manageServiceName")?.value?.trim() || "";
  const title = customerTitle || name || "Service";
  const ai = qs("#manageServiceAiCapable")?.checked === true;
  const inPerson = qs("#manageServiceInPersonRequired")?.checked === true;
  const badge = deliveryCapabilityBadgeFromFlags({ aiCapable: ai, inPersonRequired: inPerson });
  return { title, badge, aiCapable: ai, inPersonRequired: inPerson };
}

/**
 * @param {Record<string, unknown>} field
 * @param {Record<string, unknown>} valueJson
 */
function formatAnswerLine(field, valueJson) {
  if (!valueJson || typeof valueJson !== "object") return "—";
  if (valueJson.value === "__skipped__") return t("common.admin_services.intake.preview_skipped", "(skipped)");
  const it = String(field.input_type || "text").toLowerCase();
  if (it === "multi_select" && Array.isArray(valueJson.values)) return valueJson.values.join(", ");
  if (valueJson.value !== undefined && valueJson.value !== null) {
    if (typeof valueJson.value === "boolean") return valueJson.value ? "Yes" : "No";
    return String(valueJson.value);
  }
  return "—";
}

/**
 * @param {IntakePreviewSnapshot} snap
 * @param {string} blockId
 * @param {string} childId
 */
function resolveGroupChildField(snap, blockId, childId) {
  const blocks = snap.blocks || [];
  const b = blocks.find((x) => String(x.id) === String(blockId));
  if (!b) return null;
  const pl = b.payload && typeof b.payload === "object" ? /** @type {Record<string, unknown>} */ (b.payload) : {};
  const kids = Array.isArray(pl.children) ? pl.children : [];
  const ch = kids.find((c) => c && typeof c === "object" && String(/** @type {Record<string, unknown>} */ (c).id) === String(childId));
  return ch ? previewFieldFromGroupChild(/** @type {Record<string, unknown>} */ (ch)) : null;
}

/**
 * @param {IntakePreviewSnapshot} snap
 */
function renderStaticPreview(snap) {
  const el = qs("#adminIntakePreviewStaticBody");
  if (!el) return;
  const fields = orderedActiveFields(snap.fields || []);
  const blocks = orderedActiveBlocks(snap.blocks || []);
  const fieldsById = Object.fromEntries(fields.map((f) => [String(f.id), f]));
  const parts = [];

  for (const b of blocks) {
    const bt = String(b.block_type || "");
    if (bt === "question") {
      const f = fieldsById[String(b.id)];
      if (!f) continue;
      const vis = {
        ...(f.visibility_rule_json && typeof f.visibility_rule_json === "object" ? f.visibility_rule_json : {}),
        ...(b.visibility_rule_json && typeof b.visibility_rule_json === "object" ? b.visibility_rule_json : {}),
      };
      const hasVis = Object.keys(vis).length > 0;
      const badge = hasVis
        ? `<span class="admin-intake-preview__pill">${escapeHtml(t("common.admin_services.intake.preview_badge_conditional", "Conditional"))}</span>`
        : "";
      const opts = Array.isArray(f.options) ? f.options : [];
      const optLines =
        opts.length > 0
          ? `<ul class="admin-intake-preview__option-list">${opts
              .map((o) => `<li>${escapeHtml(String(o.label ?? o.value ?? ""))}</li>`)
              .join("")}</ul>`
          : "";
      parts.push(`<article class="admin-intake-preview__card admin-intake-preview__card--question">
        <div class="admin-intake-preview__card-head">
          <span class="admin-intake-preview__type-tag">${escapeHtml(t("common.admin_services.intake.block_type_question", "Question"))}</span>
          ${badge}
        </div>
        <h4 class="admin-intake-preview__q-title">${escapeHtml(String(f.label || ""))}</h4>
        ${f.required ? `<p class="admin-intake-preview__req-mark">${escapeHtml(t("common.admin_services.intake.req_yes", "Required"))}</p>` : ""}
        ${f.help_text ? `<p class="admin-intake-preview__help">${escapeHtml(String(f.help_text))}</p>` : ""}
        <p class="admin-intake-preview__meta">${escapeHtml(String(f.input_type || "text"))}</p>
        ${optLines}
      </article>`);
    } else if (bt === "question_group") {
      const payload = b.payload && typeof b.payload === "object" ? /** @type {Record<string, unknown>} */ (b.payload) : {};
      const vis = b.visibility_rule_json && typeof b.visibility_rule_json === "object" ? b.visibility_rule_json : {};
      const hasVis = Object.keys(vis).length > 0;
      const badge = hasVis
        ? `<span class="admin-intake-preview__pill">${escapeHtml(t("common.admin_services.intake.preview_badge_conditional", "Conditional"))}</span>`
        : "";
      const kids = Array.isArray(payload.children) ? payload.children : [];
      const layout = String(payload.layout || "stack") === "inline_2" ? "admin-intake-preview__qgroup--inline2" : "admin-intake-preview__qgroup--stack";
      const childCards = kids
        .map((ch) => {
          if (!ch || typeof ch !== "object") return "";
          const cf = previewFieldFromGroupChild(/** @type {Record<string, unknown>} */ (ch));
          const o = Array.isArray(cf.options) ? cf.options : [];
          const optLines =
            o.length > 0
              ? `<ul class="admin-intake-preview__option-list">${o
                  .map((x) => `<li>${escapeHtml(String(x.label ?? x.value ?? ""))}</li>`)
                  .join("")}</ul>`
              : "";
          return `<div class="admin-intake-preview__qgroup-child">
            <h5 class="admin-intake-preview__qgroup-child-title">${escapeHtml(String(cf.label || ""))}</h5>
            ${cf.required ? `<p class="admin-intake-preview__req-mark">${escapeHtml(t("common.admin_services.intake.req_yes", "Required"))}</p>` : ""}
            ${cf.help_text ? `<p class="admin-intake-preview__help">${escapeHtml(String(cf.help_text))}</p>` : ""}
            <p class="admin-intake-preview__meta">${escapeHtml(String(cf.input_type || "text"))}</p>
            ${optLines}
          </div>`;
        })
        .filter(Boolean)
        .join("");
      const gTitle = String(payload.title || "").trim();
      const gTitleHtml = shouldHideIntakeBlockTitle(gTitle)
        ? ""
        : `<h4 class="admin-intake-preview__q-title">${escapeHtml(gTitle)}</h4>`;
      parts.push(`<article class="admin-intake-preview__card admin-intake-preview__card--question admin-intake-preview__qgroup">
        <div class="admin-intake-preview__card-head">
          <span class="admin-intake-preview__type-tag">${escapeHtml(t("common.admin_services.intake.block_type_question_group", "Question group"))}</span>
          ${badge}
        </div>
        ${gTitleHtml}
        ${payload.description ? `<p class="admin-intake-preview__help">${escapeHtml(String(payload.description))}</p>` : ""}
        <div class="${layout}">${childCards}</div>
      </article>`);
    } else {
      const payload = b.payload && typeof b.payload === "object" ? b.payload : {};
      const single = renderIntakeContentBlocksArray(
        [{ block_type: bt, payload }],
        { ariaLabel: t("common.admin_services.intake.preview_content_aria", "Content block") }
      );
      parts.push(`<div class="admin-intake-preview__card admin-intake-preview__card--content">${single}</div>`);
    }
  }

  if (!parts.length) {
    el.innerHTML = `<p class="lhai-help">${escapeHtml(
      t("common.admin_services.intake.preview_empty", "No active blocks to preview. Add questions or content blocks first.")
    )}</p>`;
    return;
  }

  el.innerHTML = `<div class="admin-intake-preview__static-stack">${parts.join("")}</div>
    <p class="lhai-help admin-intake-preview__static-note">${escapeHtml(
      t(
        "common.admin_services.intake.preview_static_note",
        "Static view lists every active block in order. Use Interactive preview to test visibility rules."
      )
    )}</p>`;
}

/**
 * @param {Record<string, import("./intake-preview-branching.js").JsonObj>} answersByFieldId
 * @param {Array<Record<string, unknown>>} historyRows
 */
function renderInteractivePreview(snap, answersByFieldId, historyRows) {
  const root = qs("#adminIntakePreviewInteractiveBody");
  if (!root) return;
  const fields = orderedActiveFields(snap.fields || []);
  const orderedBlocks = orderedActiveBlocks(snap.blocks || []);
  const fieldsById = Object.fromEntries(fields.map((f) => [String(f.id), f]));

  const nextStep = findNextUnansweredPreviewStep(orderedBlocks, fieldsById, fields, answersByFieldId);
  const historyHtml =
    historyRows.length === 0
      ? ""
      : `<div class="admin-intake-preview__history" role="log" aria-label="${escapeHtml(
          t("common.admin_services.intake.preview_history", "Answers so far (preview only)")
        )}">
        ${historyRows
          .map(
            (row) => `<div class="admin-intake-preview__history-row">
          <strong>${escapeHtml(String(row.label || ""))}</strong>
          <span class="admin-intake-preview__history-val">${escapeHtml(row.line)}</span>
        </div>`
          )
          .join("")}
      </div>`;

  if (!nextStep) {
    root.innerHTML = `${historyHtml}
      <div class="admin-intake-preview__complete lhai-state lhai-state--success" role="status">
        ${escapeHtml(t("common.admin_services.intake.preview_flow_done", "End of flow (preview). No further questions."))}
      </div>
      <p class="lhai-help">${escapeHtml(
        t("common.admin_services.intake.preview_no_persist", "Nothing is saved — this is a local simulation only.")
      )}</p>`;
    return;
  }

  const cblocks = contentBlocksForPreviewStep(orderedBlocks, fieldsById, nextStep, answersByFieldId, fields);
  const blocksHtml = renderIntakeContentBlocksArray(cblocks, {
    ariaLabel: t("common.admin_services.intake.preview_before_question", "Before this question"),
  });

  if (nextStep.kind === "question") {
    const next = nextStep.field;
    const prefix = `pv-${String(next.id)}`;
    const controls = previewControlsHtml(next, prefix);
    const req = Boolean(next.required);
    const skipBtn = !req
      ? `<button type="button" class="lhai-button lhai-button--secondary" data-admin-intake-preview-skip>${escapeHtml(
          t("common.admin_services.intake.preview_skip", "Skip")
        )}</button>`
      : "";

    root.innerHTML = `${historyHtml}
      ${blocksHtml}
      <div class="admin-intake-preview__form" data-admin-intake-preview-form data-step-kind="question" data-field-id="${escapeHtml(String(next.id))}">
        <div class="admin-intake-preview__form-label">${escapeHtml(String(next.label || ""))}${req ? ` <abbr title="required">*</abbr>` : ""}</div>
        ${next.help_text ? `<div class="admin-intake-preview__form-help">${escapeHtml(String(next.help_text))}</div>` : ""}
        <div class="admin-intake-preview__form-controls">${controls}</div>
        <p class="admin-intake-preview__form-error" data-admin-intake-preview-err hidden role="alert"></p>
        <div class="admin-intake-preview__form-actions">
          <button type="button" class="lhai-button lhai-button--primary" data-admin-intake-preview-submit>${escapeHtml(
            t("common.admin_services.intake.preview_next", "Next")
          )}</button>
          ${skipBtn}
        </div>
      </div>
      <p class="lhai-help u-mt-2">${escapeHtml(
        t("common.admin_services.intake.preview_no_persist", "Nothing is saved — this is a local simulation only.")
      )}</p>`;
    return;
  }

  const pl = nextStep.block.payload && typeof nextStep.block.payload === "object" ? /** @type {Record<string, unknown>} */ (nextStep.block.payload) : {};
  const layout = String(pl.layout || "stack") === "inline_2" ? "admin-intake-preview__qgroup--inline2" : "admin-intake-preview__qgroup--stack";
  const gid = String(nextStep.block.id || "");
  const inner = nextStep.children
    .map((f) => {
      const prefix = `pv-${String(f.id)}`;
      const ctrls = previewControlsHtml(f, prefix);
      const req = Boolean(f.required);
      return `<div class="admin-intake-preview__subfield" data-child-field-id="${escapeHtml(String(f.id))}">
        <div class="admin-intake-preview__form-label">${escapeHtml(String(f.label || ""))}${req ? ` <abbr title="required">*</abbr>` : ""}</div>
        ${f.help_text ? `<div class="admin-intake-preview__form-help">${escapeHtml(String(f.help_text))}</div>` : ""}
        <div class="admin-intake-preview__form-controls">${ctrls}</div>
      </div>`;
    })
    .join("");

  root.innerHTML = `${historyHtml}
    ${blocksHtml}
    <article class="admin-intake-preview__card admin-intake-preview__card--question admin-intake-preview__qgroup u-mt-2">
      <div class="admin-intake-preview__card-head">
        <span class="admin-intake-preview__type-tag">${escapeHtml(t("common.admin_services.intake.block_type_question_group", "Question group"))}</span>
      </div>
      ${shouldHideIntakeBlockTitle(String(pl.title || "").trim()) ? "" : `<h4 class="admin-intake-preview__q-title">${escapeHtml(String(pl.title || ""))}</h4>`}
      ${pl.description ? `<div class="admin-intake-preview__form-help">${escapeHtml(String(pl.description))}</div>` : ""}
      <div class="admin-intake-preview__form" data-admin-intake-preview-form data-step-kind="question_group" data-group-block-id="${escapeHtml(gid)}">
        <div class="${layout}">${inner}</div>
        <p class="admin-intake-preview__form-error" data-admin-intake-preview-err hidden role="alert"></p>
        <div class="admin-intake-preview__form-actions">
          <button type="button" class="lhai-button lhai-button--primary" data-admin-intake-preview-submit>${escapeHtml(
            t("common.admin_services.intake.preview_next", "Next")
          )}</button>
        </div>
      </div>
    </article>
    <p class="lhai-help u-mt-2">${escapeHtml(
      t("common.admin_services.intake.preview_no_persist", "Nothing is saved — this is a local simulation only.")
    )}</p>`;
}

/**
 * @param {IntakePreviewSnapshot} snap
 */
function setupInteractiveHandlers(snap) {
  const root = qs("#adminIntakePreviewInteractiveBody");
  if (!root) return;

  const redraw = () => renderInteractivePreview(snap, _previewAnswersByFieldId, _previewHistoryRows);

  const submit = (/** @type {boolean} */ skip) => {
    const form = root.querySelector("[data-admin-intake-preview-form]");
    if (!(form instanceof HTMLElement)) return;
    const errEl = form.querySelector("[data-admin-intake-preview-err]");
    if (errEl instanceof HTMLElement) {
      errEl.hidden = true;
      errEl.textContent = "";
    }
    const stepKind = form.getAttribute("data-step-kind") || "question";

    if (stepKind === "question_group") {
      if (skip) return;
      const blockId = form.getAttribute("data-group-block-id") || "";
      const wraps = Array.from(form.querySelectorAll("[data-child-field-id]"));
      /** @type {Record<string, Record<string, unknown>>} */
      const nextAnswers = { ..._previewAnswersByFieldId };
      /** @type {Array<{ label: string; line: string }>} */
      const newHist = [];
      for (const w of wraps) {
        if (!(w instanceof HTMLElement)) continue;
        const cid = w.getAttribute("data-child-field-id") || "";
        const field = resolveGroupChildField(snap, blockId, cid);
        if (!field) continue;
        const collected = collectPreviewValueJson(w, field);
        if (!collected.ok) {
          if (errEl instanceof HTMLElement) {
            errEl.hidden = false;
            errEl.textContent = `${String(field.label || cid)}: ${collected.error || "—"}`;
          }
          return;
        }
        let vj = /** @type {Record<string, unknown>} */ (collected.valueJson);
        if (!field.required && !answerJsonIsNonempty(field, vj)) {
          vj = { value: "__skipped__" };
        }
        if (field.required && !answerJsonIsNonempty(field, vj)) {
          if (errEl instanceof HTMLElement) {
            errEl.hidden = false;
            errEl.textContent = t("common.admin_services.intake.preview_required", "This field is required.");
          }
          return;
        }
        nextAnswers[cid] = vj;
        newHist.push({ label: String(field.label || cid), line: formatAnswerLine(field, vj) });
      }
      _previewAnswersByFieldId = nextAnswers;
      _previewHistoryRows = [..._previewHistoryRows, ...newHist];
      redraw();
      setupInteractiveHandlers(snap);
      return;
    }

    const fid = form.getAttribute("data-field-id") || "";
    const field = (snap.fields || []).find((x) => String(x.id) === fid);
    if (!field) return;
    if (skip) {
      _previewAnswersByFieldId = { ..._previewAnswersByFieldId, [fid]: { value: "__skipped__" } };
      _previewHistoryRows = [
        ..._previewHistoryRows,
        { label: String(field.label || ""), line: formatAnswerLine(field, { value: "__skipped__" }) },
      ];
      redraw();
      setupInteractiveHandlers(snap);
      return;
    }
    const collected = collectPreviewValueJson(form, field);
    if (!collected.ok) {
      if (errEl instanceof HTMLElement) {
        errEl.hidden = false;
        errEl.textContent = collected.error || "—";
      }
      return;
    }
    const vj = /** @type {Record<string, unknown>} */ (collected.valueJson);
    if (field.required && !answerJsonIsNonempty(field, vj)) {
      if (errEl instanceof HTMLElement) {
        errEl.hidden = false;
        errEl.textContent = t("common.admin_services.intake.preview_required", "This field is required.");
      }
      return;
    }
    _previewAnswersByFieldId = { ..._previewAnswersByFieldId, [fid]: vj };
    _previewHistoryRows = [..._previewHistoryRows, { label: String(field.label || ""), line: formatAnswerLine(field, vj) }];
    redraw();
    setupInteractiveHandlers(snap);
  };

  root.querySelector("[data-admin-intake-preview-submit]")?.addEventListener("click", () => submit(false));
  root.querySelector("[data-admin-intake-preview-skip]")?.addEventListener("click", () => submit(true));
}

/** @type {(() => IntakePreviewSnapshot) | null} */
let _getSnapshot = null;

/** @type {Record<string, Record<string, unknown>>} */
let _previewAnswersByFieldId = {};
/** @type {Array<{ label: string; line: string }>} */
let _previewHistoryRows = [];

function resetInteractiveState() {
  _previewAnswersByFieldId = {};
  _previewHistoryRows = [];
  const root = qs("#adminIntakePreviewInteractiveBody");
  if (root) root.innerHTML = "";
}

export function openAdminIntakePreviewDialog() {
  const dlg = qs("#adminIntakePreviewDialog");
  if (!(dlg instanceof HTMLDialogElement) || !_getSnapshot) return;
  const snap = _getSnapshot();
  if (!snap.templateId) {
    window.alert(t("common.admin_services.intake.preview_need_template", "Save the service and load an intake template first."));
    return;
  }
  const header = readCustomerHeaderFromDom();
  const titleEl = qs("#adminIntakePreviewCustomerTitle");
  const badgeEl = qs("#adminIntakePreviewDeliveryBadge");
  const subEl = qs("#adminIntakePreviewSubtitle");
  if (titleEl) titleEl.textContent = header.title;
  if (badgeEl instanceof HTMLElement) {
    const show = Boolean(String(header.badge || "").trim()) && header.badge !== "Service";
    badgeEl.textContent = show ? header.badge : "";
    badgeEl.hidden = !show;
    const mod = deliveryBadgeModifierFromLabel(header.badge);
    badgeEl.className = `lhai-service-header__delivery-badge lhai-service-header__delivery-badge--${mod}`;
  }
  if (subEl instanceof HTMLElement) {
    const sub = previewServiceHeaderSubtitleFromFlags({
      aiCapable: header.aiCapable,
      inPersonRequired: header.inPersonRequired,
    });
    subEl.textContent = sub;
    subEl.hidden = !String(sub || "").trim();
  }

  renderStaticPreview(snap);
  resetInteractiveState();
  renderInteractivePreview(snap, _previewAnswersByFieldId, _previewHistoryRows);
  setupInteractiveHandlers(snap);

  dlg.showModal();
}

export function initAdminIntakePreview(getSnapshot) {
  _getSnapshot = getSnapshot;
  qs("#manageServiceIntakePreviewBtn")?.addEventListener("click", () => openAdminIntakePreviewDialog());
  qs("#adminIntakePreviewCloseBtn")?.addEventListener("click", () => {
    const dlg = qs("#adminIntakePreviewDialog");
    if (dlg instanceof HTMLDialogElement) dlg.close();
  });
  qs("#adminIntakePreviewResetBtn")?.addEventListener("click", () => {
    if (!_getSnapshot) return;
    const snap = _getSnapshot();
    _previewAnswersByFieldId = {};
    _previewHistoryRows = [];
    renderInteractivePreview(snap, _previewAnswersByFieldId, _previewHistoryRows);
    setupInteractiveHandlers(snap);
  });

  const tabStatic = qs("#adminIntakePreviewTabStatic");
  const tabInteractive = qs("#adminIntakePreviewTabInteractive");
  const panelStatic = qs("#adminIntakePreviewStaticPanel");
  const panelInteractive = qs("#adminIntakePreviewInteractivePanel");
  const setTab = (/** @type {"static"|"interactive"} */ which) => {
    if (tabStatic && tabInteractive) {
      tabStatic.classList.toggle("is-active", which === "static");
      tabInteractive.classList.toggle("is-active", which === "interactive");
    }
    if (panelStatic) panelStatic.hidden = which !== "static";
    if (panelInteractive) panelInteractive.hidden = which !== "interactive";
  };
  tabStatic?.addEventListener("click", () => setTab("static"));
  tabInteractive?.addEventListener("click", () => setTab("interactive"));

  const dlg = qs("#adminIntakePreviewDialog");
  if (dlg instanceof HTMLDialogElement) {
    let downOnBackdrop = false;
    dlg.addEventListener("mousedown", (e) => {
      downOnBackdrop = e.target === dlg;
    });
    dlg.addEventListener("click", (e) => {
      if (e.target === dlg && downOnBackdrop) dlg.close();
      downOnBackdrop = false;
    });
    dlg.addEventListener("mouseup", () => {
      downOnBackdrop = false;
    });
  }
}
