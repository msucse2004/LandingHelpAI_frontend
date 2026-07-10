/**
 * Public catalog browse display helpers (strict display_* contract; unit-testable).
 */

import {
  messageTranslationPreparingMessageLabel,
  messageTranslationPreparingTitleLabel,
  messageTranslationStatusUnavailable,
} from "./messages-display-logic.js";

const SAME_LOCALE_STATUSES = new Set(["not_required", "copied_source_same_locale"]);

/**
 * @param {Record<string, unknown> | null | undefined} item
 * @param {string} fieldKey e.g. ``name``, ``customer_title``, ``description``
 */
export function catalogDisplayFieldStatus(item, fieldKey) {
  const key = `display_${fieldKey}_status`;
  return String(item?.[key] ?? "").trim();
}

/**
 * @param {Record<string, unknown> | null | undefined} item
 * @param {string} fieldKey
 */
export function catalogFieldSameLocale(item, fieldKey) {
  return SAME_LOCALE_STATUSES.has(catalogDisplayFieldStatus(item, fieldKey).toLowerCase());
}

/**
 * @param {Record<string, unknown> | null | undefined} item
 * @param {string} fieldKey
 */
export function catalogFieldNeedsTranslationPlaceholder(item, fieldKey) {
  const status = catalogDisplayFieldStatus(item, fieldKey);
  if (messageTranslationStatusUnavailable(status)) {
    return true;
  }
  const displayKey = `display_${fieldKey}`;
  const display = item?.[displayKey];
  if (display != null && String(display).trim()) {
    return false;
  }
  const original = String(item?.[fieldKey] ?? "").trim();
  if (!original) {
    return false;
  }
  if (catalogFieldSameLocale(item, fieldKey)) {
    return false;
  }
  return true;
}

/**
 * @param {Record<string, unknown> | null | undefined} item
 * @param {string} fieldKey
 * @param {(key: string, fallback: string) => string} [translate]
 * @param {{ kind?: "title" | "body" }} [options]
 */
export function catalogDisplayText(item, fieldKey, translate = null, options = {}) {
  const displayKey = `display_${fieldKey}`;
  const display = item?.[displayKey];
  if (display != null && String(display).trim()) {
    return String(display).trim();
  }
  const tr = typeof translate === "function" ? translate : null;
  const kind = options.kind === "body" ? "body" : "title";
  if (catalogFieldNeedsTranslationPlaceholder(item, fieldKey)) {
    if (!tr) return "";
    return kind === "body"
      ? messageTranslationPreparingMessageLabel(tr)
      : messageTranslationPreparingTitleLabel(tr);
  }
  if (catalogFieldSameLocale(item, fieldKey)) {
    return String(item?.[fieldKey] ?? "").trim();
  }
  return "";
}

/**
 * Prefer customer-facing title, then internal name.
 * @param {Record<string, unknown> | null | undefined} item
 * @param {(key: string, fallback: string) => string} [translate]
 */
export function catalogCardTitle(item, translate = null) {
  const customer = catalogDisplayText(item, "customer_title", translate, { kind: "title" });
  if (customer) return customer;
  return catalogDisplayText(item, "name", translate, { kind: "title" });
}

/**
 * @param {Record<string, unknown> | null | undefined} item
 * @param {(key: string, fallback: string) => string} [translate]
 */
export function catalogCardShortDescription(item, translate = null) {
  const customer = catalogDisplayText(item, "customer_short_description", translate, { kind: "body" });
  if (customer) return customer;
  return catalogDisplayText(item, "description", translate, { kind: "body" });
}

/**
 * @param {Record<string, unknown> | null | undefined} item
 * @param {(key: string, fallback: string) => string} [translate]
 */
export function catalogCardLongDescription(item, translate = null) {
  return catalogDisplayText(item, "customer_long_description", translate, { kind: "body" });
}

/**
 * @param {Record<string, unknown> | null | undefined} item
 * @param {(key: string, fallback: string) => string} [translate]
 */
export function catalogCategoryTitle(item, translate = null) {
  const customer = catalogDisplayText(item, "customer_title", translate, { kind: "title" });
  if (customer) return customer;
  return catalogDisplayText(item, "name", translate, { kind: "title" });
}
