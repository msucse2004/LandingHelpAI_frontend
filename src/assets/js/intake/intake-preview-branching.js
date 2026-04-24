/**
 * Client-side intake branching for **admin interactive preview only** — mirrors
 * `app.services.intake_branching` (same visibility ops, `contentBlocksForPrompt` gap logic as
 * backend / customer `prompt.content_blocks`). See `intake-runtime-view.js` for how presentation
 * stays aligned with the message thread.
 */
import { escapeHtml } from "./intake-block-render.js";

/** @typedef {Record<string, unknown>} JsonObj */

function escapeHtmlAttr(s) {
  return escapeHtml(s);
}

/** @param {unknown} v */
function isEmptyNormalized(v) {
  if (v === undefined || v === null) return true;
  if (Array.isArray(v)) return v.length === 0;
  if (typeof v === "string") return v.trim() === "";
  return false;
}

/**
 * @param {Record<string, unknown>} field
 * @param {JsonObj | null | undefined} answerJson
 */
export function answerJsonIsNonempty(field, answerJson) {
  if (!answerJson || typeof answerJson !== "object") return false;
  const it = String(field.input_type || "text").toLowerCase();
  if (it === "multi_select") {
    const vals = answerJson.values;
    return Array.isArray(vals) && vals.length > 0;
  }
  if (it === "checkbox" || it === "boolean") {
    return answerJson.value !== undefined && answerJson.value !== null;
  }
  const v = answerJson.value;
  return v !== undefined && v !== null && String(v).trim() !== "";
}

/**
 * @param {Record<string, unknown>} field
 * @param {JsonObj | null | undefined} answerJson
 */
export function answerValueForRules(field, answerJson) {
  if (!answerJson) return null;
  const it = String(field.input_type || "text").toLowerCase();
  if (it === "multi_select") return answerJson.values;
  return answerJson.value;
}

/** @param {Array<Record<string, unknown>>} fields */
export function buildFieldLookup(fields) {
  /** @type {Record<string, Record<string, unknown>>} */
  const out = {};
  for (const f of fields) {
    const fk = String(f.field_key || "").trim();
    if (fk) out[fk] = f;
  }
  return out;
}

/**
 * @param {Array<Record<string, unknown>>} fields
 * @param {Record<string, JsonObj>} answersByFieldId
 */
export function buildAnswerContext(fields, answersByFieldId) {
  const byId = Object.fromEntries(fields.map((f) => [f.id, f]));
  /** @type {Record<string, unknown>} */
  const ctx = {};
  for (const [fid, payload] of Object.entries(answersByFieldId)) {
    const f = byId[fid];
    if (!f) continue;
    ctx[String(f.field_key)] = answerValueForRules(f, payload);
  }
  return ctx;
}

/**
 * @param {unknown} vis
 * @param {Record<string, Record<string, unknown>>} fieldsById
 */
function normalizeVisibilityRuleForEvaluation(vis, fieldsById) {
  if (!vis || typeof vis !== "object" || Array.isArray(vis)) return vis;
  const v = /** @type {Record<string, unknown>} */ (vis);
  const op = String(v.op || "").toLowerCase();
  if (op === "all" || op === "any") {
    const rules = v.rules;
    if (!Array.isArray(rules)) return v;
    return {
      ...v,
      rules: rules.map((r) => normalizeVisibilityRuleForEvaluation(r, fieldsById)),
    };
  }
  if (v.mode === "when_answer_equals" && v.source_field_id) {
    const sid = String(v.source_field_id);
    const src = fieldsById[sid];
    const fk = src && String(src.field_key || "").trim();
    if (!fk) return {};
    return { op: "equals", field_key: fk, value: String(v.match_value ?? "") };
  }
  return v;
}

/** @param {Record<string, unknown>} rule */
function unwrapWhen(rule) {
  if (!rule) return {};
  if (rule.when && typeof rule.when === "object" && !Array.isArray(rule.when)) {
    return { .../** @type {Record<string, unknown>} */ (rule.when) };
  }
  return { ...rule };
}

/**
 * @param {JsonObj | null | undefined} visibilityRuleJson
 * @param {Record<string, unknown>} ctx
 * @param {Record<string, Record<string, unknown>>} fieldsByKey
 * @param {Record<string, JsonObj>} answersByFieldId
 * @param {Array<Record<string, unknown>>} fields
 */
export function evaluateVisibilityRuleJson(visibilityRuleJson, ctx, fieldsByKey, answersByFieldId, fields) {
  const fieldsById = Object.fromEntries(fields.map((f) => [String(f.id), f]));
  const raw = visibilityRuleJson || {};
  const norm = normalizeVisibilityRuleForEvaluation(raw, fieldsById);
  const rule = unwrapWhen(norm && typeof norm === "object" ? /** @type {Record<string, unknown>} */ (norm) : {});
  if (!rule || Object.keys(rule).length === 0) return true;
  return evaluateRule(rule, ctx, fieldsByKey, answersByFieldId, fields);
}

/**
 * @param {Record<string, unknown>} rule
 * @param {Record<string, unknown>} ctx
 * @param {Record<string, Record<string, unknown>>} fieldsByKey
 * @param {Record<string, JsonObj>} answersByFieldId
 * @param {Array<Record<string, unknown>>} fields
 */
function evaluateRule(rule, ctx, fieldsByKey, answersByFieldId, fields) {
  const op = String(rule.op || "").trim().toLowerCase();
  if (op === "all") {
    const subs = rule.rules;
    if (!Array.isArray(subs)) return false;
    return subs.every((s) =>
      evaluateRule(s && typeof s === "object" ? /** @type {Record<string, unknown>} */ (s) : {}, ctx, fieldsByKey, answersByFieldId, fields)
    );
  }
  if (op === "any") {
    const subs = rule.rules;
    if (!Array.isArray(subs) || subs.length === 0) return false;
    return subs.some((s) =>
      evaluateRule(s && typeof s === "object" ? /** @type {Record<string, unknown>} */ (s) : {}, ctx, fieldsByKey, answersByFieldId, fields)
    );
  }
  const fk = String(rule.field_key || "").trim();
  const refField = fieldsByKey[fk];

  if (op === "exists") {
    if (!fk || !refField) return false;
    const aid = String(refField.id);
    const ans = answersByFieldId[aid];
    return Boolean(ans && answerJsonIsNonempty(refField, ans));
  }

  if (!fk || !refField) return false;
  const cur = ctx[fk];

  if (op === "equals") {
    return !isEmptyNormalized(cur) && String(cur) === String(rule.value);
  }
  if (op === "not_equals") {
    if (isEmptyNormalized(cur)) return true;
    return String(cur) !== String(rule.value);
  }
  if (op === "in") {
    const allowed = rule.values;
    if (!Array.isArray(allowed)) return false;
    const allowedSet = new Set(allowed.map((x) => String(x)));
    if (Array.isArray(cur)) return cur.some((x) => allowedSet.has(String(x)));
    return allowedSet.has(String(cur));
  }

  return false;
}

/**
 * @param {Record<string, unknown>} block
 * @param {Record<string, unknown>} ctx
 * @param {Record<string, Record<string, unknown>>} fieldsByKey
 * @param {Record<string, JsonObj>} answersByFieldId
 * @param {Array<Record<string, unknown>>} fields
 */
export function evaluateBlockVisibility(block, ctx, fieldsByKey, answersByFieldId, fields) {
  const vis = /** @type {JsonObj | undefined} */ (block.visibility_rule_json);
  return evaluateVisibilityRuleJson(vis, ctx, fieldsByKey, answersByFieldId, fields);
}

/**
 * @param {Record<string, unknown>} field
 * @param {Record<string, unknown>} ctx
 * @param {Record<string, Record<string, unknown>>} fieldsByKey
 * @param {Record<string, JsonObj>} answersByFieldId
 * @param {Array<Record<string, unknown>>} fields
 */
export function evaluateFieldVisibility(field, ctx, fieldsByKey, answersByFieldId, fields) {
  const vis = /** @type {JsonObj | undefined} */ (field.visibility_rule_json);
  return evaluateVisibilityRuleJson(vis, ctx, fieldsByKey, answersByFieldId, fields);
}

/** @param {Array<Record<string, unknown>>} fields */
export function orderedActiveFields(fields) {
  return fields
    .filter((f) => f.active && !f.archived_at)
    .sort((a, b) => (Number(a.sort_order) || 0) - (Number(b.sort_order) || 0) || String(a.field_key || "").localeCompare(String(b.field_key || "")));
}

/** @param {Array<Record<string, unknown>>} blocks */
export function orderedActiveBlocks(blocks) {
  return blocks
    .filter((b) => b.active && !b.archived_at)
    .sort((a, b) => (Number(a.sort_order) || 0) - (Number(b.sort_order) || 0) || String(a.block_key || "").localeCompare(String(b.block_key || "")));
}

/**
 * @param {Array<Record<string, unknown>>} fields
 * @param {Record<string, JsonObj>} answersByFieldId
 */
export function findNextUnansweredField(fields, answersByFieldId) {
  const fieldsByKey = buildFieldLookup(fields);
  const ordered = orderedActiveFields(fields);
  const ctx = buildAnswerContext(fields, answersByFieldId);
  for (const f of ordered) {
    if (!evaluateFieldVisibility(f, ctx, fieldsByKey, answersByFieldId, fields)) continue;
    const ans = answersByFieldId[String(f.id)];
    if (!ans || !answerJsonIsNonempty(f, ans)) return f;
  }
  return null;
}

/**
 * @param {Array<Record<string, unknown>>} orderedBlocks
 * @param {Record<string, Record<string, unknown>>} fieldsById
 * @param {Record<string, unknown>} nextField
 * @param {Record<string, JsonObj>} answersByFieldId
 * @param {Array<Record<string, unknown>>} fields
 */
export function contentBlocksForPrompt(orderedBlocks, fieldsById, nextField, answersByFieldId, fields) {
  const fieldsByKey = buildFieldLookup(fields);
  const ctx = buildAnswerContext(fields, answersByFieldId);
  const nextId = String(nextField.id);
  let nextQIdx = -1;
  for (let i = 0; i < orderedBlocks.length; i++) {
    const b = orderedBlocks[i];
    if (String(b.block_type) === "question" && String(b.id) === nextId) {
      nextQIdx = i;
      break;
    }
  }
  if (nextQIdx < 0) return [];

  let lastQIdx = -1;
  for (let i = 0; i < nextQIdx; i++) {
    const b = orderedBlocks[i];
    if (String(b.block_type) !== "question") continue;
    const f = fieldsById[String(b.id)];
    if (!f) continue;
    const ans = answersByFieldId[String(f.id)];
    if (ans && answerJsonIsNonempty(f, ans)) lastQIdx = i;
  }

  /** @type {Array<Record<string, unknown>>} */
  const out = [];
  for (let j = lastQIdx + 1; j < nextQIdx; j++) {
    const b = orderedBlocks[j];
    if (String(b.block_type) === "question") continue;
    if (!evaluateBlockVisibility(b, ctx, fieldsByKey, answersByFieldId, fields)) continue;
    out.push(b);
  }
  return out;
}

/**
 * @param {Record<string, unknown>} field
 * @param {string} prefix
 * @param {string} [defVal]
 */
export function previewControlsHtml(field, prefix, defVal = "") {
  const mid = prefix.replace(/[^a-zA-Z0-9_-]/g, "_");
  const it = String(field.input_type || "text").toLowerCase();
  const label = String(field.label || "");
  const options = Array.isArray(field.options) ? field.options : [];
  const def = defVal || (field.default_value != null ? String(field.default_value) : "");

  if (it === "textarea") {
    return `<textarea class="admin-intake-preview__input admin-intake-preview__textarea" rows="3" maxlength="8000" aria-label="${escapeHtmlAttr(label)}">${escapeHtml(def)}</textarea>`;
  }
  if (it === "select" || it === "dropdown") {
    const opts = [...options].sort((a, b) => Number(a.sort_order || 0) - Number(b.sort_order || 0));
    const optHtml = opts
      .map((o) => {
        const val = String(o.value ?? "");
        const lab = String(o.label ?? val);
        return `<option value="${escapeHtmlAttr(val)}">${escapeHtml(lab)}</option>`;
      })
      .join("");
    return `<select class="admin-intake-preview__input admin-intake-preview__select" aria-label="${escapeHtmlAttr(label)}">
      <option value="">선택하세요</option>
      ${optHtml}
    </select>`;
  }
  if (it === "radio") {
    const opts = [...options].sort((a, b) => Number(a.sort_order || 0) - Number(b.sort_order || 0));
    const name = `pv-r-${mid}`;
    return `<div class="admin-intake-preview__radio-group" role="radiogroup" aria-label="${escapeHtmlAttr(label)}">
      ${opts
        .map((o, i) => {
          const val = String(o.value ?? "");
          const lab = String(o.label ?? val);
          const id = `${name}-${i}`;
          return `<label class="admin-intake-preview__radio-label" for="${escapeHtmlAttr(id)}">
            <input type="radio" name="${escapeHtmlAttr(name)}" id="${escapeHtmlAttr(id)}" value="${escapeHtmlAttr(val)}" class="admin-intake-preview__radio" />
            <span>${escapeHtml(lab)}</span>
          </label>`;
        })
        .join("")}
    </div>`;
  }
  if (it === "yes_no") {
    const name = `pv-yn-${mid}`;
    return `<div class="admin-intake-preview__radio-group" role="radiogroup" aria-label="${escapeHtmlAttr(label)}">
      <label class="admin-intake-preview__radio-label" for="${escapeHtmlAttr(`${name}-y`)}">
        <input type="radio" name="${escapeHtmlAttr(name)}" id="${escapeHtmlAttr(`${name}-y`)}" value="yes" class="admin-intake-preview__radio" />
        <span>예</span>
      </label>
      <label class="admin-intake-preview__radio-label" for="${escapeHtmlAttr(`${name}-n`)}">
        <input type="radio" name="${escapeHtmlAttr(name)}" id="${escapeHtmlAttr(`${name}-n`)}" value="no" class="admin-intake-preview__radio" />
        <span>아니오</span>
      </label>
    </div>`;
  }
  if (it === "multi_select") {
    const opts = [...options].sort((a, b) => Number(a.sort_order || 0) - Number(b.sort_order || 0));
    return `<div class="admin-intake-preview__checks" role="group" aria-label="${escapeHtmlAttr(label)}">
      ${opts
        .map((o, i) => {
          const val = String(o.value ?? "");
          const lab = String(o.label ?? val);
          const id = `pv-ms-${mid}-${i}`;
          return `<label class="admin-intake-preview__check-label" for="${escapeHtmlAttr(id)}">
            <input type="checkbox" id="${escapeHtmlAttr(id)}" class="admin-intake-preview__cb" value="${escapeHtmlAttr(val)}" />
            <span>${escapeHtml(lab)}</span>
          </label>`;
        })
        .join("")}
    </div>`;
  }
  if (it === "date") {
    return `<input type="date" class="admin-intake-preview__input admin-intake-preview__date" value="${escapeHtmlAttr(def)}" aria-label="${escapeHtmlAttr(label)}" />`;
  }
  if (it === "number") {
    return `<input type="number" class="admin-intake-preview__input admin-intake-preview__number" value="${escapeHtmlAttr(def)}" aria-label="${escapeHtmlAttr(label)}" />`;
  }
  if (it === "checkbox" || it === "boolean") {
    return `<label class="admin-intake-preview__check-label"><input type="checkbox" class="admin-intake-preview__single-cb" ${def === "true" || def === "1" ? "checked" : ""} /> <span>${escapeHtml(label || "Yes / No")}</span></label>`;
  }
  return `<input type="text" class="admin-intake-preview__input admin-intake-preview__text" value="${escapeHtmlAttr(def)}" maxlength="4000" aria-label="${escapeHtmlAttr(label)}" />`;
}

/**
 * @param {HTMLElement} wrap
 * @param {Record<string, unknown>} field
 */
export function collectPreviewValueJson(wrap, field) {
  const it = String(field.input_type || "text").toLowerCase();
  if (it === "multi_select") {
    const vals = Array.from(wrap.querySelectorAll(".admin-intake-preview__cb:checked")).map((c) => String(/** @type {HTMLInputElement} */ (c).value));
    return { ok: true, valueJson: { values: vals } };
  }
  if (it === "radio" || it === "yes_no") {
    const sel = wrap.querySelector('.admin-intake-preview__radio-group input[type="radio"]:checked');
    if (!(sel instanceof HTMLInputElement)) return { ok: false, error: "선택해 주세요." };
    return { ok: true, valueJson: { value: sel.value } };
  }
  if (it === "select" || it === "dropdown") {
    const sel = wrap.querySelector("select.admin-intake-preview__select");
    if (!(sel instanceof HTMLSelectElement)) return { ok: false, error: "항목을 찾을 수 없습니다." };
    const v = String(sel.value || "").trim();
    if (!v) return { ok: false, error: "선택해 주세요." };
    return { ok: true, valueJson: { value: v } };
  }
  if (it === "textarea") {
    const ta = wrap.querySelector("textarea.admin-intake-preview__textarea");
    if (!(ta instanceof HTMLTextAreaElement)) return { ok: false, error: "입력란을 찾을 수 없습니다." };
    return { ok: true, valueJson: { value: String(ta.value || "").trim() } };
  }
  if (it === "date") {
    const inp = wrap.querySelector("input.admin-intake-preview__date");
    if (!(inp instanceof HTMLInputElement)) return { ok: false, error: "날짜 입력을 찾을 수 없습니다." };
    const v = String(inp.value || "").trim();
    if (!v) return { ok: false, error: "날짜를 선택해 주세요." };
    return { ok: true, valueJson: { value: v } };
  }
  if (it === "number") {
    const inp = wrap.querySelector("input.admin-intake-preview__number");
    if (!(inp instanceof HTMLInputElement)) return { ok: false, error: "숫자 입력을 찾을 수 없습니다." };
    const v = String(inp.value || "").trim();
    return { ok: true, valueJson: { value: v } };
  }
  if (it === "checkbox" || it === "boolean") {
    const cb = wrap.querySelector("input.admin-intake-preview__single-cb");
    if (!(cb instanceof HTMLInputElement)) return { ok: false, error: "입력을 찾을 수 없습니다." };
    return { ok: true, valueJson: { value: cb.checked } };
  }
  const inp = wrap.querySelector("input.admin-intake-preview__text");
  if (!(inp instanceof HTMLInputElement)) return { ok: false, error: "입력란을 찾을 수 없습니다." };
  return { ok: true, valueJson: { value: String(inp.value || "").trim() } };
}
