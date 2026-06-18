/**
 * Helpers for localizing dynamic JS UI text (status lines, selects, alerts).
 * Static HTML should use `data-i18n*` attributes and `applyI18nToDom`.
 *
 * Pattern:
 * - `t("key", "English fallback")` for plain strings
 * - `localizedStatus(key, fallback, params)` for messages with `{placeholders}`
 * - `setLocalizedText(el, key, fallback, params)` to update an element
 * - `localizedOption(value, key, fallback)` for translated `<option>` labels (value stays raw)
 *
 * Do not use these helpers for user-generated content or DB identifiers (key/domain codes).
 * Use `localizedEnumLabel` / `formatLocalizedDataReadout` when showing API enum values next to UI labels.
 * @module core/i18n-dynamic
 */

import { t } from "./i18n-client.js";

/**
 * Replace `{name}` tokens in a template. Unknown tokens are left unchanged.
 * @param {string} template
 * @param {Record<string, string | number | null | undefined>} [params]
 * @returns {string}
 */
export function formatMessage(template, params) {
  const src = String(template ?? "");
  if (!params || typeof params !== "object") return src;
  return src.replace(/\{(\w+)\}/g, (match, name) => {
    if (Object.prototype.hasOwnProperty.call(params, name)) {
      const value = params[name];
      return value === undefined || value === null ? "" : String(value);
    }
    return match;
  });
}

/**
 * Resolve an i18n key and apply optional `{placeholder}` interpolation.
 * @param {string} key
 * @param {string} fallback English fallback when the key is missing
 * @param {Record<string, string | number | null | undefined>} [params]
 * @returns {string}
 */
export function localizedStatus(key, fallback, params) {
  const template = t(key, fallback);
  if (!params || !Object.keys(params).length) return template;
  return formatMessage(template, params);
}

/**
 * Set `textContent` on a DOM node from an i18n key (with optional interpolation).
 * @param {Element | null | undefined} el
 * @param {string} key
 * @param {string} fallback
 * @param {Record<string, string | number | null | undefined>} [params]
 */
export function setLocalizedText(el, key, fallback, params) {
  if (!(el instanceof HTMLElement)) return;
  el.textContent = localizedStatus(key, fallback, params);
}

/**
 * Create a `<option>` with a localized label. The `value` is never translated.
 * @param {string} value Raw option value (e.g. `""` for “all”, or a domain code)
 * @param {string} key i18n key for the visible label
 * @param {string} fallback English fallback label
 * @returns {HTMLOptionElement}
 */
export function localizedOption(value, key, fallback) {
  const opt = document.createElement("option");
  opt.value = String(value ?? "");
  opt.textContent = t(key, fallback);
  return opt;
}

/**
 * Map a raw enum/code to a localized **display** label. Unknown values pass through unchanged
 * (raw enum remains visible; never treat arbitrary API text as an i18n key).
 * @param {string} keyPrefix e.g. `"messages.message_type"`
 * @param {string | null | undefined} rawValue
 * @param {Record<string, string>} [fallbacks] English labels for known codes
 * @returns {string}
 */
export function localizedEnumLabel(keyPrefix, rawValue, fallbacks = {}) {
  const code = String(rawValue ?? "").trim();
  if (!code) return "";
  const key = `${keyPrefix}.${code}`;
  const fb = Object.prototype.hasOwnProperty.call(fallbacks, code) ? fallbacks[code] : code;
  const tr = t(key, fb);
  return tr === key ? code : tr;
}

/**
 * Localized UI label + raw API/DB value (label translated; value never passed through `t()`).
 * Supports templates with `{value}` or trailing `:` labels.
 * @param {string} labelKey
 * @param {string} labelFallback
 * @param {string | null | undefined} dataValue
 * @returns {string}
 */
export function formatLocalizedDataReadout(labelKey, labelFallback, dataValue) {
  const value = String(dataValue ?? "").trim();
  if (!value) return "";
  const label = t(labelKey, labelFallback);
  if (label.includes("{value}")) {
    return formatMessage(label, { value });
  }
  const sep = /:\s*$/.test(label) ? " " : ": ";
  return `${label}${sep}${value}`;
}
