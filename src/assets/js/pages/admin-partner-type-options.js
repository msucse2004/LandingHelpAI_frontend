/**
 * GET /api/admin/partners/types 응답을 관리자 UI(워크플로·회원 초대 등)에서 동일 규칙으로 쓴다.
 * 라벨·허용 코드는 서버(도메인 + DB)가 주는 값만 사용한다.
 */

/**
 * @param {unknown} data API JSON
 * @returns {Array<{ value: string, label: string }>}
 */
export function normalizePartnerTypesFromApi(data) {
  const root = data && typeof data === "object" ? /** @type {{ partner_types?: unknown }} */ (data) : null;
  const raw = root && Array.isArray(root.partner_types) ? root.partner_types : [];
  return raw
    .filter((x) => x && typeof x === "object")
    .map((x) => ({
      value: String(/** @type {{ value?: unknown }} */ (x).value != null ? /** @type {{ value?: unknown }} */ (x).value : "")
        .trim()
        .toUpperCase(),
      label: String(/** @type {{ label?: unknown }} */ (x).label != null ? /** @type {{ label?: unknown }} */ (x).label : "")
        .trim(),
    }))
    .filter((o) => o.value && o.label);
}

/**
 * @param {{ value: string, label: string }} o
 * @returns {string}
 */
export function partnerTypeOptionDisplayText(o) {
  const v = String(o.value || "").trim().toUpperCase();
  const lb = String(o.label || v).trim();
  return `${lb} (${v})`;
}
