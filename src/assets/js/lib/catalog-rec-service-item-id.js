/**
 * Legacy JSON catalog public ids (``si-``+``mod-*``, ``si-addon-*``) — not ``rec_service_items.id``.
 * @param {unknown} s
 * @returns {boolean}
 */
export function isLegacyCatalogPublicIdString(s) {
  return /^si-(?:mod|addon)-/i.test(String(s || "").trim());
}

/**
 * Same as {@link isLegacyCatalogPublicIdString} — runtime ``service_item_id`` must never use these.
 * @param {unknown} value
 * @returns {boolean}
 */
export function isLegacyServiceId(value) {
  return isLegacyCatalogPublicIdString(value);
}

const UUID_HEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Standard UUID string shape (hex + hyphens). Does not imply rec row validity.
 * @param {unknown} value
 * @returns {boolean}
 */
export function isUuid(value) {
  const t = String(value ?? "").trim();
  if (!t) return false;
  return UUID_HEX.test(t);
}

/**
 * ``rec_service_items.id`` (standard UUID string) for customer intake / workflow cards.
 * Rejects legacy catalog public ids and non-UUID strings.
 * @param {unknown} s
 * @returns {boolean}
 */
export function isCatalogRecServiceItemUuidString(s) {
  const t = String(s || "").trim();
  if (!t) return false;
  return isUuid(t) && !isLegacyServiceId(t);
}

const DEFAULT_ASSERT_MSG =
  "서비스 연결 정보가 올바르지 않습니다. 카탈로그 UUID(rec_service_items.id)만 사용할 수 있습니다.";

/**
 * Throws if the value is not a usable ``rec_service_items.id`` (UUID, not ``si-``+``mod-*`` / ``si-addon-*``).
 * Use before customer/admin requests that send ``service_item_id`` over the network.
 * @param {unknown} value
 * @param {string} [message]
 */
export function assertServiceItemUuid(value, message = DEFAULT_ASSERT_MSG) {
  if (!isCatalogRecServiceItemUuidString(value)) {
    throw new Error(String(message || DEFAULT_ASSERT_MSG));
  }
}

/**
 * 레거시 공용 카탈로그 id 패턴이거나 빈 값이면 요청을 보내지 않도록 즉시 중단한다.
 * @param {unknown} value
 * @param {string} [message]
 */
export function abortIfInvalidServiceItemId(value, message = DEFAULT_ASSERT_MSG) {
  const s = String(value ?? "").trim();
  if (!s || isLegacyServiceId(s) || !isCatalogRecServiceItemUuidString(s)) {
    throw new Error(String(message || DEFAULT_ASSERT_MSG));
  }
}

/**
 * Browse API rows: keep only entries whose ``id`` is a rec UUID (drops non-UUID / vendor demo-pattern rows).
 * @param {unknown} rows
 * @returns {Array<Record<string, unknown>>}
 */
export function filterBrowseCatalogServiceItems(rows) {
  const arr = Array.isArray(rows) ? rows : [];
  return arr.filter((r) => r && typeof r === "object" && isCatalogRecServiceItemUuidString(/** @type {{ id?: unknown }} */ (r).id));
}

/**
 * UI-only display hints — must not be sent on ``/api/surveys/service-flow/submit`` (mutates ``obj``).
 * @param {Record<string, unknown>} obj
 */
function stripServiceNameHintKeysOnly(obj) {
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) return;
  delete obj.service_name_hint;
  delete obj.serviceNameHint;
}

/**
 * POST ``/api/surveys/service-flow/submit`` body: strip legacy ``service_id``; keep only ``selected_services`` rows with rec UUID ``id``;
 * drop ``detailed_answers`` rows whose ``service_id`` is not a rec UUID.
 * @param {unknown} raw
 * @returns {Record<string, unknown>}
 */
export function sanitizeServiceFlowSubmitPayloadForNetwork(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error("Invalid service flow payload.");
  }
  /** @type {Record<string, unknown>} */
  const base = JSON.parse(JSON.stringify(raw));
  delete base.service_id;
  stripServiceNameHintKeysOnly(base);

  const sel = Array.isArray(base.selected_services) ? base.selected_services : [];
  base.selected_services = sel
    .filter((row) => row && typeof row === "object")
    .map((row) => {
      /** @type {Record<string, unknown>} */
      const r = { .../** @type {Record<string, unknown>} */ (row) };
      stripServiceNameHintKeysOnly(r);
      const id = String(r.id ?? "").trim();
      if (!isCatalogRecServiceItemUuidString(id)) return null;
      r.id = id;
      return r;
    })
    .filter(Boolean);

  const detailed = Array.isArray(base.detailed_answers) ? base.detailed_answers : [];
  base.detailed_answers = detailed
    .filter((row) => row && typeof row === "object")
    .map((row) => {
      /** @type {Record<string, unknown>} */
      const r = { .../** @type {Record<string, unknown>} */ (row) };
      const sid = String(r.service_id ?? "").trim();
      if (sid && !isCatalogRecServiceItemUuidString(sid)) {
        delete r.service_id;
      }
      return r;
    });

  return base;
}

/**
 * INTAKE_START ``card_json``: **only** ``service_item_id`` (snake_case) is read — no legacy key fallbacks.
 * @param {Record<string, unknown> | null | undefined} cj
 * @returns {string} rec UUID or ""
 */
export function intakeStartServiceItemIdFromCardJson(cj) {
  if (!cj || typeof cj !== "object") return "";
  const t = String(/** @type {Record<string, unknown>} */ (cj).service_item_id ?? "").trim();
  return isCatalogRecServiceItemUuidString(t) ? t : "";
}

/**
 * Workflow ``card_json``: prefers ``service_item_id`` (rec UUID); may read legacy keys only for non–INTAKE_START tooling.
 * @param {Record<string, unknown> | null | undefined} cj
 * @returns {string} canonical uuid or ""
 */
export function pickCatalogUuidFromWorkflowCardJson(cj) {
  if (!cj || typeof cj !== "object") return "";
  /** @type {Record<string, unknown>} */
  const o = cj;
  const keys = [
    "service_item_id",
    "serviceItemId",
    "rec_service_item_id",
    "recServiceItemId",
    "catalog_service_item_id",
    "catalogServiceItemId",
  ];
  for (const k of keys) {
    const v = o[k];
    if (v == null || !String(v).trim()) continue;
    const t = String(v).trim();
    if (isCatalogRecServiceItemUuidString(t)) return t;
  }
  return "";
}
