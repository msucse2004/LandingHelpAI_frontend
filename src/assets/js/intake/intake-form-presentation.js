/**
 * Shared rules for customer intake form rendering (messages thread + admin preview).
 */

export const INTAKE_INPUT_TYPE_CURRENCY_USD = "currency_usd";

const INTAKE_BLOCK_TITLE_PLACEHOLDERS = new Set([
  "new question group",
  "new questions",
  "new question",
  "question group",
  "질문 그룹",
  "새 질문 그룹",
  "새 질문",
]);

/** @param {unknown} raw */
export function isEffectivelyEmptyIntakeHelpText(raw) {
  const s = String(raw ?? "").trim();
  if (!s) return true;
  if (/^[-–—―−]+$/.test(s)) return true;
  return false;
}

/**
 * Strip dropdown ``display_label`` suffix (e.g. ``Bryan - First Name`` → ``Bryan``).
 * @param {unknown} raw
 * @param {Record<string, unknown>} [row]
 */
export function normalizePrefillInputScalar(raw, row = {}) {
  let s = String(raw ?? "").trim();
  if (!s) return "";

  const candidates = Array.isArray(row.prefill_candidates)
    ? /** @type {Array<Record<string, unknown>>} */ (row.prefill_candidates)
    : [];

  for (const c of candidates) {
    const val = String(c.value ?? "").trim();
    const disp = String(c.display_label ?? "").trim();
    if (disp && s === disp && val) return val;
  }

  const suffixLabels = collectIntakePrefillSuffixLabels(row, candidates);
  const lower = s.toLowerCase();
  for (const lab of suffixLabels) {
    const suf = ` - ${lab}`;
    if (s.endsWith(suf)) {
      s = s.slice(0, -suf.length).trim();
      return s;
    }
    const sufLower = suf.toLowerCase();
    if (lower.endsWith(sufLower)) {
      s = s.slice(0, s.length - sufLower.length).trim();
      return s;
    }
  }

  if (s.includes(" - ")) {
    const idx = s.lastIndexOf(" - ");
    if (idx > 0) {
      const left = s.slice(0, idx).trim();
      const right = s.slice(idx + 3).trim();
      if (left && right) {
        const rightLower = right.toLowerCase();
        for (const lab of suffixLabels) {
          if (lab && lab.toLowerCase() === rightLower) return left;
        }
      }
    }
  }

  return s;
}

/**
 * @param {Record<string, unknown>} row
 * @param {Array<Record<string, unknown>>} candidates
 */
function collectIntakePrefillSuffixLabels(row, candidates) {
  /** @type {Set<string>} */
  const suffixLabels = new Set();
  const add = (raw) => {
    const t = String(raw ?? "")
      .trim()
      .replace(/\s*[*＊]+\s*$/g, "")
      .trim();
    if (t) suffixLabels.add(t);
  };

  add(row.label);
  const pf = row.prefill && typeof row.prefill === "object" ? row.prefill : null;
  add(pf && pf.source_label);
  add(row.prefill_source);
  for (const c of candidates) {
    add(c.label);
    const disp = String(c.display_label ?? "").trim();
    const sep = disp.lastIndexOf(" - ");
    if (sep > 0) add(disp.slice(sep + 3));
  }
  return suffixLabels;
}

/** Customer-facing option label for prefill dropdowns (value only, not ``value - source``). */
export function prefillCandidateOptionLabel(candidate) {
  const val = String(candidate?.value ?? "").trim();
  if (val) return val;
  return String(candidate?.label ?? "").trim();
}

/**
 * Normalize stored scalar prefill fields on one intake widget row (mutates ``row``).
 * @param {Record<string, unknown>} row
 */
export function normalizeIntakePromptFieldRow(row) {
  if (!row || typeof row !== "object") return;
  for (const key of ["value", "prefill_value", "prefill_resolved_value"]) {
    if (row[key] == null || String(row[key]).trim() === "") continue;
    row[key] = normalizePrefillInputScalar(row[key], row);
  }
  if (row.default_value != null && String(row.default_value).trim() !== "") {
    row.default_value = normalizePrefillInputScalar(row.default_value, row);
  }
}

/**
 * Walk a ``form_prompt`` ``ui_payload`` and strip display-label suffixes from prefill scalars.
 * @param {Record<string, unknown>} up
 */
export function normalizeIntakeFormPromptUiPayload(up) {
  if (!up || typeof up !== "object") return;
  if (String(up.widget_type || "") !== "form_prompt") return;

  normalizeIntakePromptFieldRow(up);

  const children = Array.isArray(up.children) ? /** @type {Array<Record<string, unknown>>} */ (up.children) : [];
  for (const ch of children) normalizeIntakePromptFieldRow(ch);

  const steps = Array.isArray(up.steps) ? /** @type {Array<Record<string, unknown>>} */ (up.steps) : [];
  for (const st of steps) {
    normalizeIntakePromptFieldRow(st);
    const stChildren = Array.isArray(st.children)
      ? /** @type {Array<Record<string, unknown>>} */ (st.children)
      : [];
    for (const ch of stChildren) normalizeIntakePromptFieldRow(ch);
  }
}

/**
 * Resolved initial scalar for text/select/etc. (messages form_prompt widgets).
 * @param {Record<string, unknown>} row
 */
export function resolveIntakeFieldInitialValue(row) {
  const def = row.default_value != null && row.default_value !== undefined ? String(row.default_value) : "";
  const rawPv = String(row.prefill_resolved_value ?? "").trim();
  const rawVal = row.value != null && String(row.value).trim() !== "" ? String(row.value).trim() : "";
  const rawPrefill = String(row.prefill_value ?? "").trim();
  const combined = rawVal || rawPrefill || rawPv;
  if (combined) return normalizePrefillInputScalar(combined, row);
  const defTrim = def.trim();
  if (defTrim) return normalizePrefillInputScalar(defTrim, row);
  return "";
}

/** @param {unknown} raw */
export function isCurrencyUsdInputType(raw) {
  return String(raw ?? "").trim().toLowerCase() === INTAKE_INPUT_TYPE_CURRENCY_USD;
}

/**
 * USD amount input (stored value is numeric string in answer JSON).
 * @param {{ valueEsc: string, ariaLabelAttrEsc: string, readOnlyAttr?: string, inputClass: string, wrapClass?: string }} opts
 */
export function renderCurrencyUsdInputControlsHtml(opts) {
  const wrap = opts.wrapClass || "lhai-intake-currency-usd";
  const ro = opts.readOnlyAttr || "";
  return `<div class="${wrap}" data-intake-currency="USD">
    <span class="${wrap}__prefix" aria-hidden="true">USD $</span>
    <input type="number" class="${opts.inputClass} ${wrap}__input" inputmode="decimal" min="0" step="0.01" value="${opts.valueEsc}"${opts.ariaLabelAttrEsc}${ro} />
  </div>`;
}

/** @param {unknown} title */
export function shouldHideIntakeBlockTitle(title) {
  const s = String(title ?? "").trim();
  if (!s) return true;
  const normalized = s
    .replace(/\s*[*＊]+\s*$/g, "")
    .trim()
    .toLowerCase();
  return INTAKE_BLOCK_TITLE_PLACEHOLDERS.has(normalized);
}

/** @param {unknown} s */
function normalizeLabelForDateMatch(s) {
  let t = String(s ?? "")
    .trim()
    .toLowerCase();
  for (const ch of ["*", "＊", "·", "•", ":"]) {
    t = t.split(ch).join(" ");
  }
  return t.replace(/\s+/g, " ").trim();
}

/**
 * Prefill / label / field_key 힌트로 생년월일 등 날짜 필드를 text로 두어도 달력 입력으로 표시합니다.
 * @param {Record<string, unknown>} row
 */
export function effectiveIntakeInputType(row) {
  const raw = String(row?.input_type ?? "text").trim().toLowerCase();
  if (raw === "date") return "date";
  const pf = row?.prefill && typeof row.prefill === "object" ? row.prefill : null;
  const pre = pf ? String(pf.source || "").trim().toLowerCase() : "";
  if (pre === "user.date_of_birth" || pre.endsWith("date_of_birth")) return "date";
  const fk = String(row?.field_key || "").trim().toLowerCase();
  if (fk === "user.date_of_birth" || fk.includes("birth_date") || fk.includes("date_of_birth")) return "date";
  const lab = normalizeLabelForDateMatch(row?.label);
  const ph = normalizeLabelForDateMatch(row?.placeholder);
  const hay = `${lab} ${ph}`.trim();
  if (hay.includes("생년월일")) return "date";
  if (lab === "date of birth" || lab === "birth date" || lab === "dob") return "date";
  if (lab.startsWith("date of birth")) return "date";
  if (/\b(birthday|birth)\b/.test(hay)) return "date";
  return raw;
}

/** @param {unknown} raw */
export function coerceToIsoDateInputValue(raw) {
  const s = String(raw ?? "").trim();
  if (!s) return "";
  const iso = s.match(/^(\d{4}-\d{2}-\d{2})/);
  if (iso) return iso[1];
  const mdy = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (mdy) {
    const mm = String(mdy[1]).padStart(2, "0");
    const dd = String(mdy[2]).padStart(2, "0");
    return `${mdy[3]}-${mm}-${dd}`;
  }
  const dmy = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (dmy) {
    const dd = String(dmy[1]).padStart(2, "0");
    const mm = String(dmy[2]).padStart(2, "0");
    return `${dmy[3]}-${mm}-${dd}`;
  }
  return "";
}

/** @param {unknown} raw */
export function intakeFieldDisplayLabel(raw) {
  return String(raw ?? "")
    .trim()
    .replace(/\s*[*＊]+\s*$/g, "")
    .trim();
}

/** @param {string} cit normalized intake input type */
export function intakeRequiredErrorKindForInputType(cit) {
  const t = String(cit || "text").trim().toLowerCase();
  if (t === "select" || t === "radio" || t === "yes_no") return "select";
  if (t === "date") return "date";
  if (t === "multi_select") return "multi";
  return "input";
}

/**
 * Required-field validation copy with the field label when available.
 * @param {unknown} label
 * @param {"select"|"input"|"date"|"multi"} [kind]
 */
export function intakeRequiredFieldError(label, kind = "input") {
  const lab = intakeFieldDisplayLabel(label);
  if (!lab) {
    if (kind === "select") return "선택해 주세요.";
    if (kind === "date") return "날짜를 선택해 주세요.";
    if (kind === "multi") return "하나 이상 선택해 주세요.";
    return "필수 항목입니다.";
  }
  if (kind === "select") return `「${lab}」을(를) 선택해 주세요.`;
  if (kind === "date") return `「${lab}」 날짜를 선택해 주세요.`;
  if (kind === "multi") return `「${lab}」에서 하나 이상 선택해 주세요.`;
  return `「${lab}」을(를) 입력해 주세요.`;
}

/** @param {unknown} label @param {string} cit normalized input type */
export function intakeRequiredFieldErrorForInputType(label, cit) {
  return intakeRequiredFieldError(label, intakeRequiredErrorKindForInputType(cit));
}
