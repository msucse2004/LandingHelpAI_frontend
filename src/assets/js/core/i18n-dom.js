import { overlayAppShellLocaleForLanguage } from "./app-shell-locale.js";
import { overlayDashboardLocaleForLanguage } from "../pages/dashboard-locale.js";
import { overlayAuthPublicLocaleForLanguage } from "./auth-public-locale.js";
import { overlayLocalizationLocaleForLanguage } from "./localization-locale.js";
import {
  captureI18nApplyGeneration,
  flushRuntimeMissingKeysAfterPageApply,
  getLoadedI18nDomains,
  initI18nDomains,
  isI18nApplyGenerationCurrent,
  registerI18nDomains,
  reloadI18nForLanguage,
  t,
} from "./i18n-client.js";
import { getBodyI18nDomains, getPublicPageI18nDomains } from "./public-page-i18n-config.js";
import {
  DEFAULT_LANGUAGE_CODE,
  getEffectiveLanguage,
  normalizeSupportedLanguageCode,
} from "./preferred-language.js";

function readI18nFallback(el, attrName) {
  const explicit = el.getAttribute("data-i18n-default");
  if (explicit != null && explicit !== "") return explicit;
  if (attrName === "data-i18n-placeholder") return el.placeholder || "";
  if (attrName === "data-i18n-title") return el.title || "";
  if (attrName === "data-i18n-aria-label") return el.getAttribute("aria-label") || "";
  return el.textContent || "";
}

function applyI18nText(root = document) {
  root.querySelectorAll("[data-i18n]").forEach((el) => {
    if (el.matches("title[data-i18n]")) return;
    const key = el.getAttribute("data-i18n");
    if (!key) return;
    el.textContent = t(key, readI18nFallback(el, "data-i18n"));
  });
}

function applyI18nDocumentTitle() {
  const titleEl = document.querySelector("title[data-i18n]");
  if (!titleEl) return;
  const key = titleEl.getAttribute("data-i18n");
  if (!key) return;
  const text = t(key, titleEl.textContent || document.title || "");
  titleEl.textContent = text;
  document.title = text;
}

function applyI18nPlaceholder(root = document) {
  root.querySelectorAll("[data-i18n-placeholder]").forEach((el) => {
    const key = el.getAttribute("data-i18n-placeholder");
    if (!key) return;
    el.placeholder = t(key, readI18nFallback(el, "data-i18n-placeholder"));
  });
}

function applyI18nTitle(root = document) {
  root.querySelectorAll("[data-i18n-title]").forEach((el) => {
    const key = el.getAttribute("data-i18n-title");
    if (!key) return;
    el.title = t(key, el.title || "");
  });
}

function applyI18nAriaLabel(root = document) {
  root.querySelectorAll("[data-i18n-aria-label]").forEach((el) => {
    const key = el.getAttribute("data-i18n-aria-label");
    if (!key) return;
    el.setAttribute("aria-label", t(key, el.getAttribute("aria-label") || ""));
  });
}

export function applyI18nToDom(root = document) {
  applyI18nText(root);
  applyI18nPlaceholder(root);
  applyI18nTitle(root);
  applyI18nAriaLabel(root);
  applyI18nDocumentTitle(root);
}

/**
 * Set ``<html lang>`` from a supported UI language code.
 * @param {string | null | undefined} lang
 */
export function applyDocumentLanguageAttributes(lang) {
  const code = normalizeSupportedLanguageCode(lang) || DEFAULT_LANGUAGE_CODE;
  if (typeof document !== "undefined" && document.documentElement) {
    document.documentElement.lang = code;
  }
  return code;
}

function normalizeDomainList(domains) {
  return [...new Set((domains || []).map((d) => String(d).trim().toLowerCase()).filter(Boolean))];
}

const I18N_BINDING_ATTRS = [
  "data-i18n",
  "data-i18n-placeholder",
  "data-i18n-title",
  "data-i18n-aria-label",
];

/**
 * Collect i18n domain prefixes from declarative bindings in the DOM.
 * @param {ParentNode} [root]
 * @returns {string[]}
 */
export function inferI18nDomainsFromDom(root = document) {
  const domains = new Set();
  const selector = I18N_BINDING_ATTRS.map((attr) => `[${attr}]`).join(",");
  root.querySelectorAll(selector).forEach((el) => {
    for (const attr of I18N_BINDING_ATTRS) {
      const key = el.getAttribute(attr);
      if (!key || !String(key).includes(".")) continue;
      domains.add(String(key).split(".")[0].trim().toLowerCase());
    }
  });
  return [...domains];
}

/**
 * Domains required to refresh the current page (loaded, declared, inferred).
 * @param {ParentNode} [root]
 * @returns {string[]}
 */
export function resolveActivePageI18nDomains(root = document) {
  const merged = new Set([
    ...getLoadedI18nDomains(),
    ...getPublicPageI18nDomains(),
    ...getBodyI18nDomains(),
    ...inferI18nDomainsFromDom(root),
    "common",
  ]);
  if (root.querySelector?.("#sidebar")) {
    merged.add("nav");
  }
  return [...merged];
}

/**
 * Reload bundles, re-apply declarative bindings, and notify shell/page listeners.
 * @param {string | null | undefined} lang
 * @param {{ root?: ParentNode, dispatchEvent?: boolean }} [options]
 * @returns {Promise<string>}
 */
export async function applyLanguageChangeToPage(lang, options = {}) {
  const root = options.root || document;
  const domains = resolveActivePageI18nDomains(root);
  const normalizedLang = await reloadI18nForLanguage(lang, domains);
  reapplyI18nAfterLanguageChange(normalizedLang, root, { domains });
  if (options.dispatchEvent !== false) {
    const event = new CustomEvent("lhai:language-changed", { detail: { language: normalizedLang } });
    if (typeof window !== "undefined") {
      window.dispatchEvent(event);
    }
    document.dispatchEvent(event);
  }
  await flushRuntimeMissingKeysAfterPageApply();
  return normalizedLang;
}

function pageHasAuthI18nMarkers(root = document) {
  return Boolean(
    root.querySelector?.(
      "[data-i18n^='auth.'], [data-i18n-placeholder^='auth.'], [data-i18n-title^='auth.'], [data-i18n-aria-label^='auth.']"
    )
  );
}

function shouldApplyAuthPublicLocale(root, domains) {
  const normalized = normalizeDomainList(domains);
  if (normalized.includes("auth")) return true;
  if (normalizeDomainList(getLoadedI18nDomains()).includes("auth")) return true;
  return pageHasAuthI18nMarkers(root);
}

function shouldApplyLocalizationLocale(root, domains) {
  const normalized = normalizeDomainList(domains);
  if (normalized.includes("localization")) return true;
  if (normalizeDomainList(getLoadedI18nDomains()).includes("localization")) return true;
  return Boolean(root.querySelector?.("[data-i18n^='localization.'], [data-i18n-placeholder^='localization.'], [data-i18n-title^='localization.'], [data-i18n-aria-label^='localization.']"));
}

function shouldApplyDashboardLocale(root, domains) {
  const normalized = normalizeDomainList(domains);
  if (normalized.includes("dashboard")) return true;
  if (normalizeDomainList(getLoadedI18nDomains()).includes("dashboard")) return true;
  return Boolean(root.querySelector?.("#dashboardActionHero, #dashboardRecentUpdates, [data-i18n^='dashboard.']"));
}

function applyClientLocaleOverlays(lang, root, options = {}) {
  if (shouldApplyAuthPublicLocale(root, options.domains)) {
    overlayAuthPublicLocaleForLanguage(lang);
  }
  if (shouldApplyLocalizationLocale(root, options.domains)) {
    overlayLocalizationLocaleForLanguage(lang);
  }
  if (shouldApplyAppShellLocale(root, options.domains)) {
    overlayAppShellLocaleForLanguage(lang);
  }
  if (shouldApplyDashboardLocale(root, options.domains)) {
    overlayDashboardLocaleForLanguage(lang);
  }
}

/**
 * Re-apply declarative i18n bindings after the active UI language changes.
 * @param {string | null | undefined} lang
 * @param {ParentNode} [root]
 */
export function reapplyI18nAfterLanguageChange(lang, root = document, options = {}) {
  applyClientLocaleOverlays(lang, root, options);
  applyDocumentLanguageAttributes(lang);
  applyI18nToDom(root);
}

function shouldApplyAppShellLocale(root, domains) {
  const normalized = normalizeDomainList(domains);
  if (normalized.includes("common") || normalized.includes("nav")) return true;
  if (normalizeDomainList(getLoadedI18nDomains()).some((d) => d === "common" || d === "nav")) {
    return true;
  }
  return Boolean(
    root.querySelector?.(
      "#sidebar, #lhai-app-header-root, main [data-i18n^='common.'], [data-i18n^='common.header.'], [data-i18n^='common.sidebar.'], [data-i18n^='common.admin_dashboard.'], [data-i18n^='nav.']"
    )
  );
}

/**
 * @param {string[]} domains
 * @param {string} lang
 * @param {ParentNode} [root]
 */
function applyPublicPageLocaleOverlays(domains, lang, root = document) {
  applyClientLocaleOverlays(lang, root, { domains });
}

/**
 * @param {string[] | null | undefined} keys
 * @param {{ keyPrefix?: string, keyPrefixes?: string[] }} options
 * @returns {boolean}
 */
function runtimeKeysMatchPrefixFilter(keys, options = {}) {
  const normalizedKeys = Array.isArray(keys) ? keys : [];
  if (options.keyPrefixes?.length) {
    const prefixes = options.keyPrefixes.map((p) => String(p));
    return normalizedKeys.some((key) =>
      prefixes.some((prefix) => String(key || "").startsWith(prefix))
    );
  }
  if (options.keyPrefix) {
    const prefix = String(options.keyPrefix);
    return normalizedKeys.some((key) => String(key || "").startsWith(prefix));
  }
  return true;
}

/**
 * @param {{ keyPrefix?: string, keyPrefixes?: string[], shouldRefresh?: (detail: object) => boolean }} options
 * @param {{ language?: string, keys?: string[] }} detail
 * @param {string[] | undefined} keys
 * @returns {boolean}
 */
function shouldRunDynamicI18nRefresh(options, detail, keys) {
  if (options.keyPrefix || options.keyPrefixes?.length) {
    if (!runtimeKeysMatchPrefixFilter(keys, options)) return false;
  }
  if (typeof options.shouldRefresh === "function" && !options.shouldRefresh(detail)) {
    return false;
  }
  return true;
}

/**
 * Re-run a page render callback when the UI language changes or runtime keys resolve.
 * @param {() => void} callback
 * @param {{
 *   keyPrefix?: string,
 *   keyPrefixes?: string[],
 *   shouldRefresh?: (detail: { language?: string, keys?: string[] }) => boolean,
 *   languageChangeOnly?: boolean,
 *   runtimeResolvedOnly?: boolean,
 * }} [options]
 */
export function wireDynamicPageI18nRefresh(callback, options = {}) {
  if (typeof window === "undefined" || typeof callback !== "function") return;
  if (!wireDynamicPageI18nRefresh._entries) {
    wireDynamicPageI18nRefresh._entries = new Map();
  }
  if (wireDynamicPageI18nRefresh._entries.has(callback)) return;
  wireDynamicPageI18nRefresh._entries.set(callback, options);

  const run = (cb) => {
    try {
      cb();
    } catch (err) {
      console.warn("[lhai] dynamic i18n refresh failed", err);
    }
  };

  if (wireDynamicPageI18nRefresh._listenersInstalled) return;
  wireDynamicPageI18nRefresh._listenersInstalled = true;

  window.addEventListener("lhai:language-changed", () => {
    for (const [cb, entryOptions] of wireDynamicPageI18nRefresh._entries.entries()) {
      if (entryOptions.runtimeResolvedOnly) continue;
      run(cb);
    }
  });

  window.addEventListener("lhai:i18n-runtime-resolved", (event) => {
    const detail = event?.detail || {};
    const keys = detail.keys;
    for (const [cb, entryOptions] of wireDynamicPageI18nRefresh._entries.entries()) {
      if (entryOptions.languageChangeOnly) continue;
      if (!shouldRunDynamicI18nRefresh(entryOptions, detail, keys)) continue;
      run(cb);
    }
  });
}

let _runtimeI18nDomListenerInstalled = false;

/**
 * Re-apply declarative ``data-i18n*`` bindings after runtime catalog keys resolve.
 * Safe to call multiple times; installs one shared window listener.
 * @param {ParentNode} [root]
 */
export function ensureRuntimeI18nDomListener(root = document) {
  if (_runtimeI18nDomListenerInstalled || typeof window === "undefined") return;
  _runtimeI18nDomListenerInstalled = true;
  window.addEventListener("lhai:i18n-runtime-resolved", () => {
    try {
      applyI18nToDom(root);
    } catch (err) {
      console.warn("[lhai] runtime i18n DOM re-apply failed", err);
    }
  });
}

/**
 * Load one or more i18n domains, then apply declarative data-i18n* attributes under `root`.
 * On API failure, elements keep their existing text / placeholder / title / aria-label.
 */
export async function initPageI18nAndApplyDom(domains = ["common"], root = document) {
  ensureRuntimeI18nDomListener(root);
  const applyGeneration = captureI18nApplyGeneration();
  const lang = getEffectiveLanguage();
  const unique = normalizeDomainList([
    ...(domains || ["common"]),
    ...inferI18nDomainsFromDom(root),
    ...(root.querySelector?.("#sidebar") ? ["nav"] : []),
  ]);
  registerI18nDomains(unique);
  try {
    await initI18nDomains(unique, lang);
  } catch {
    // Keep rendering with built-in fallback strings even if i18n API is unavailable.
  }
  if (!isI18nApplyGenerationCurrent(applyGeneration)) return;
  const activeLang = getEffectiveLanguage();
  applyPublicPageLocaleOverlays(unique, activeLang, root);
  applyDocumentLanguageAttributes(activeLang);
  applyI18nToDom(root);
  await flushRuntimeMissingKeysAfterPageApply();
}

/** Load `common` domain once, then apply declarative data-i18n* attributes under `root`. */
export async function initCommonI18nAndApplyDom(root = document) {
  await initPageI18nAndApplyDom(["common"], root);
}

