/**
 * 청구서 세부 정보 표시용 (납기일·참조 번호). API/데이터 구조 변경 없음.
 */

/**
 * @param {string} dueStr
 * @param {(raw: string) => string} formatDate
 * @param {() => string} dueNotSetLabel
 * @returns {{ text: string, muted: boolean }}
 */
export function buildInvoiceDueDateDisplay(dueStr, formatDate, dueNotSetLabel) {
  const raw = String(dueStr || "").trim();
  if (raw) {
    const formatted = formatDate(raw);
    return { text: formatted || raw, muted: false };
  }
  return { text: String(dueNotSetLabel() || "").trim() || "—", muted: true };
}

/**
 * @param {unknown} value
 * @returns {string}
 */
export function invoiceReferenceMonoText(value) {
  return String(value ?? "").trim() || "—";
}
