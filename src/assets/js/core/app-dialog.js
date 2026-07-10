/**
 * Native alert/confirm helpers that resolve copy via viewer UI language (``t()`` / ``localizedStatus``).
 * Install early via :func:`installAppDialogI18n` so ``window.alert`` / ``window.confirm`` respect i18n.
 * @module core/app-dialog
 */

import { t } from "./i18n-client.js";
import { localizedStatus } from "./i18n-dynamic.js";

/** @type {((message?: string) => void) | null} */
let _nativeAlert = null;
/** @type {((message?: string) => boolean) | null} */
let _nativeConfirm = null;
let _installed = false;

function bindNativeDialogs() {
  if (typeof window === "undefined") return;
  if (!_nativeAlert) _nativeAlert = window.alert.bind(window);
  if (!_nativeConfirm) _nativeConfirm = window.confirm.bind(window);
}

/**
 * @param {string | { key: string, fallback?: string, params?: Record<string, unknown> }} message
 * @returns {string}
 */
export function resolveDialogText(message) {
  if (message && typeof message === "object" && typeof message.key === "string") {
    const { key, fallback = "", params } = message;
    if (params && typeof params === "object" && Object.keys(params).length) {
      return localizedStatus(key, fallback, params);
    }
    return t(key, fallback);
  }
  return String(message ?? "");
}

/**
 * @param {string} key
 * @param {string} englishFallback
 * @param {Record<string, unknown>} [params]
 */
export function alertI18n(key, englishFallback, params) {
  bindNativeDialogs();
  const text = resolveDialogText({ key, fallback: englishFallback, params });
  (_nativeAlert || window.alert.bind(window))(text);
}

/** Dynamic or already-resolved text (API errors, ``t()`` result). */
export function alertPlain(text) {
  bindNativeDialogs();
  (_nativeAlert || window.alert.bind(window))(String(text ?? ""));
}

/**
 * Show an API/server message when present; otherwise a localized fallback.
 * @param {unknown} errOrMessage
 * @param {string} fallbackKey
 * @param {string} fallbackEn
 */
export function alertApiOrFallback(errOrMessage, fallbackKey, fallbackEn) {
  let msg = "";
  if (errOrMessage && typeof errOrMessage === "object" && "message" in errOrMessage) {
    const raw = /** @type {{ message?: unknown }} */ (errOrMessage).message;
    if (typeof raw === "string") msg = raw.trim();
  } else if (typeof errOrMessage === "string") {
    msg = errOrMessage.trim();
  }
  alertPlain(msg || t(fallbackKey, fallbackEn));
}

/**
 * @param {string} key
 * @param {string} englishFallback
 * @param {Record<string, unknown>} [params]
 * @returns {boolean}
 */
export function confirmI18n(key, englishFallback, params) {
  bindNativeDialogs();
  const text = resolveDialogText({ key, fallback: englishFallback, params });
  return (_nativeConfirm || window.confirm.bind(window))(text);
}

/** @param {string} text */
export function confirmPlain(text) {
  bindNativeDialogs();
  return (_nativeConfirm || window.confirm.bind(window))(String(text ?? ""));
}

/** Patch global native dialogs once (idempotent). */
export function installAppDialogI18n() {
  if (_installed || typeof window === "undefined") return;
  _installed = true;
  bindNativeDialogs();
  const nativeAlert = _nativeAlert;
  const nativeConfirm = _nativeConfirm;
  if (!nativeAlert || !nativeConfirm) return;

  window.alert = function lhaiAlert(message) {
    nativeAlert(resolveDialogText(message));
  };
  window.confirm = function lhaiConfirm(message) {
    return nativeConfirm(resolveDialogText(message));
  };

  window.lhaiAlert = alertI18n;
  window.lhaiAlertPlain = alertPlain;
  window.lhaiConfirm = confirmI18n;
  window.lhaiConfirmPlain = confirmPlain;
}
