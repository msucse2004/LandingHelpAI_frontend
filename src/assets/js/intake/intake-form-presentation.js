/**
 * Shared rules for customer intake form rendering (messages thread + admin preview).
 */

/** @param {unknown} title */
export function shouldHideIntakeBlockTitle(title) {
  const s = String(title ?? "").trim();
  if (!s) return true;
  const lower = s.toLowerCase();
  const placeholders = ["new question group", "question group", "질문 그룹", "새 질문 그룹"];
  return placeholders.includes(lower);
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
