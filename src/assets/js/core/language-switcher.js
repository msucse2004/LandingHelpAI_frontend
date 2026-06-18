/**
 * Global UI language dropdown — header topbar or fixed floating fallback.
 * @module core/language-switcher
 */

import { userPreferencesApi } from "./api.js";
import { getAccessToken, isAuthenticated, updateSessionPreferredLanguage } from "./auth.js";
import { TOPBAR_LANGUAGE_SLOT_ID } from "../components/app-header-markup.js";
import { applyLanguageChangeToPage } from "./i18n-dom.js";
import {
  getEffectiveLanguage,
  normalizeLanguageCode,
  populateSupportedLanguageSelect,
  resolveAccountPreferredLanguageCode,
  setSavedLocalLanguage,
} from "./preferred-language.js";

const SWITCHER_ATTR = "data-lhai-language-switcher";
const SWITCHER_SELECT_ID = "lhai-language-switcher-select";
const FLOATING_ROOT_ID = "lhai-language-switcher-floating-root";
const SIGNUP_PREFERRED_LANGUAGE_ID = "preferredLanguage";
const FLOATING_BODY_CLASS = "lhai-has-floating-language-switcher";

let _mounted = false;
let _changeInFlight = false;
let _signupSyncWired = false;
let _languageChangedWired = false;

function existingSwitcher() {
  return document.querySelector(`[${SWITCHER_ATTR}]`);
}

function findHeaderLanguageSlot() {
  const headerRoot = document.querySelector("#lhai-app-header-root");
  if (!headerRoot) return null;
  return (
    headerRoot.querySelector(`#${TOPBAR_LANGUAGE_SLOT_ID}`) ||
    headerRoot.querySelector("[data-lhai-topbar-language-slot]")
  );
}

function switcherInHeaderSlot() {
  const slot = findHeaderLanguageSlot();
  if (!slot) return null;
  return slot.querySelector(`[${SWITCHER_ATTR}]`);
}

function syncGlobalLanguageSelectValue(code) {
  const normalized = resolveAccountPreferredLanguageCode(code);
  const globalSelect = getGlobalLanguageSelect();
  if (globalSelect && globalSelect.value !== normalized) {
    globalSelect.value = normalized;
  }
  const signupSelect = getSignupPreferredLanguageSelect();
  if (signupSelect && signupSelect.value !== normalized) {
    signupSelect.value = normalized;
  }
  return normalized;
}

function buildSwitcherElement({ floating = false } = {}) {
  const wrapper = document.createElement("div");
  wrapper.className = floating
    ? "lhai-language-switcher lhai-language-switcher--floating"
    : "lhai-language-switcher";
  wrapper.setAttribute(SWITCHER_ATTR, "true");

  const select = document.createElement("select");
  select.id = SWITCHER_SELECT_ID;
  select.className = "lhai-language-switcher__select lhai-select";
  select.setAttribute("aria-label", "UI language");
  populateSupportedLanguageSelect(select, getEffectiveLanguage());
  select.addEventListener("change", onLanguageChange);
  wrapper.appendChild(select);
  return wrapper;
}

function showNonBlockingWarning(message) {
  try {
    const host =
      existingSwitcher() ||
      document.getElementById(FLOATING_ROOT_ID) ||
      document.body;
    let el = document.getElementById("lhai-language-switcher-warning");
    if (!el) {
      el = document.createElement("p");
      el.id = "lhai-language-switcher-warning";
      el.className = "lhai-language-switcher__warning";
      el.setAttribute("role", "status");
      host.appendChild(el);
    }
    el.textContent = message;
    window.setTimeout(() => {
      el?.remove();
    }, 6000);
  } catch {
    console.warn("[lhai] language-switcher:", message);
  }
}

async function persistLanguageToServer(code) {
  if (!isAuthenticated() || !getAccessToken()) return true;
  try {
    await userPreferencesApi.patchMyPreferences({ preferred_language_code: code });
    return true;
  } catch (err) {
    const msg =
      err && typeof err.message === "string"
        ? err.message
        : "Language saved locally, but server sync failed.";
    showNonBlockingWarning(msg);
    console.warn("[lhai] language-switcher: preferences PATCH failed", err);
    return false;
  }
}

async function reloadPageI18n(code) {
  try {
    await applyLanguageChangeToPage(code);
    return true;
  } catch (err) {
    console.warn("[lhai] language-switcher: i18n reload failed, soft reloading page", err);
    window.location.reload();
    return false;
  }
}

function getGlobalLanguageSelect() {
  const el = document.getElementById(SWITCHER_SELECT_ID);
  return el instanceof HTMLSelectElement ? el : null;
}

function getSignupPreferredLanguageSelect() {
  const el = document.getElementById(SIGNUP_PREFERRED_LANGUAGE_ID);
  return el instanceof HTMLSelectElement ? el : null;
}

/**
 * Apply a UI language change: localStorage, session (when logged in), server PATCH, i18n DOM.
 * @param {string | null | undefined} rawCode
 * @param {HTMLSelectElement | null | undefined} [sourceSelect]
 * @returns {Promise<string>}
 */
export async function applyLanguageChange(rawCode, sourceSelect) {
  if (_changeInFlight) return resolveAccountPreferredLanguageCode(rawCode);

  const code = setSavedLocalLanguage(rawCode);
  if (sourceSelect instanceof HTMLSelectElement) {
    sourceSelect.value = code;
  }
  syncGlobalLanguageSelectValue(code);

  _changeInFlight = true;
  try {
    if (isAuthenticated()) {
      updateSessionPreferredLanguage(code);
    }
    await persistLanguageToServer(code);
    await reloadPageI18n(code);
    return code;
  } finally {
    _changeInFlight = false;
  }
}

async function onLanguageChange(event) {
  const select = event.target;
  if (!(select instanceof HTMLSelectElement)) return;
  await applyLanguageChange(select.value, select);
}

function clearFloatingBodyClass() {
  document.body.classList.remove(FLOATING_BODY_CLASS);
}

function mountInHeader(slot) {
  const switcher = buildSwitcherElement({ floating: false });
  slot.replaceChildren(switcher);
  const floatingRoot = document.getElementById(FLOATING_ROOT_ID);
  if (floatingRoot) floatingRoot.remove();
  clearFloatingBodyClass();
  return switcher;
}

function mountFloating() {
  const slot = findHeaderLanguageSlot();
  if (slot) return mountInHeader(slot);
  let root = document.getElementById(FLOATING_ROOT_ID);
  if (!root) {
    root = document.createElement("div");
    root.id = FLOATING_ROOT_ID;
    document.body.appendChild(root);
  }
  root.replaceChildren(buildSwitcherElement({ floating: true }));
  document.body.classList.add(FLOATING_BODY_CLASS);
  return root.firstElementChild;
}

function removeExistingSwitcher() {
  existingSwitcher()?.remove();
  document.getElementById(FLOATING_ROOT_ID)?.remove();
  clearFloatingBodyClass();
  _mounted = false;
}

/**
 * Mount the global language dropdown once per page.
 * @param {{ preferFloating?: boolean }} [options]
 * @returns {HTMLElement | null}
 */
export function initLanguageSwitcher(options = {}) {
  try {
    const headerSlot = !options.preferFloating ? findHeaderLanguageSlot() : null;
    if (headerSlot) {
      const inSlot = switcherInHeaderSlot();
      if (inSlot) {
        syncGlobalLanguageSelectValue(getEffectiveLanguage());
        _mounted = true;
        return inSlot;
      }
      removeExistingSwitcher();
      const el = mountInHeader(headerSlot);
      _mounted = true;
      return el;
    }

    if (existingSwitcher()) {
      syncGlobalLanguageSelectValue(getEffectiveLanguage());
      _mounted = true;
      return existingSwitcher();
    }

    const el = mountFloating();
    _mounted = true;
    return el instanceof HTMLElement ? el : null;
  } catch (err) {
    console.warn("[lhai] language-switcher init failed", err);
    return null;
  }
}

/**
 * Re-attach in the app header after async topbar render.
 */
export function refreshLanguageSwitcherPlacement() {
  try {
    const headerSlot = findHeaderLanguageSlot();
    if (headerSlot) {
      const inSlot = switcherInHeaderSlot();
      if (inSlot) {
        syncGlobalLanguageSelectValue(getEffectiveLanguage());
        return inSlot;
      }
      removeExistingSwitcher();
      return mountInHeader(headerSlot);
    }
    return initLanguageSwitcher();
  } catch {
    return null;
  }
}

/**
 * Keep floating/header switcher and signup #preferredLanguage in sync.
 * @param {string} code
 */
export function syncSignupPreferredLanguageSelectors(code) {
  const normalized = setSavedLocalLanguage(code);
  syncGlobalLanguageSelectValue(normalized);
  return normalized;
}

/**
 * Two-way sync between floating switcher and signup preferred-language field.
 */
export function wireSignupPreferredLanguageSync() {
  const signupSelect = getSignupPreferredLanguageSelect();
  if (!signupSelect || _signupSyncWired) return;
  _signupSyncWired = true;

  document.addEventListener("lhai:language-changed", (event) => {
    const code = event.detail?.language;
    if (!code || !normalizeLanguageCode(code)) return;
    syncGlobalLanguageSelectValue(code);
  });

  signupSelect.addEventListener("change", () => {
    const code = setSavedLocalLanguage(signupSelect.value);
    signupSelect.value = code;
    const globalSelect = getGlobalLanguageSelect();
    if (globalSelect && globalSelect.value !== code) {
      globalSelect.value = code;
      globalSelect.dispatchEvent(new Event("change"));
      return;
    }
    void applyLanguageChange(code, signupSelect);
  });
}

function wireGlobalLanguageChangedSync() {
  if (_languageChangedWired || typeof document === "undefined") return;
  _languageChangedWired = true;
  document.addEventListener("lhai:language-changed", (event) => {
    const code = event.detail?.language;
    if (!code || !normalizeLanguageCode(code)) return;
    syncGlobalLanguageSelectValue(code);
  });
}

if (typeof document !== "undefined") {
  wireGlobalLanguageChangedSync();

  const bootFallback = () => {
    if (_mounted || existingSwitcher()) return;
    if (document.body.classList.contains("lhai-public-page")) return;
    void initLanguageSwitcher();
  };
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bootFallback, { once: true });
  } else {
    bootFallback();
  }
}
