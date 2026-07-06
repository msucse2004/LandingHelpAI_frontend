/**
 * Shared i18n boot for logged-in app pages (customer · partner · admin shells).
 * @module core/app-page-i18n-boot
 */

import { canAccessAdminShell } from "./role-tiers.js";
import { ensureRuntimeI18nDomListener, initPageI18nAndApplyDom, inferI18nDomainsFromDom } from "./i18n-dom.js";
import { getBodyI18nDomains } from "./public-page-i18n-config.js";
import {
  getSessionLanguage,
  resolveAccountPreferredLanguageCode,
  setSavedLocalLanguage,
} from "./preferred-language.js";

ensureRuntimeI18nDomListener();

/** @type {Promise<void> | null} */
let _bootPromise = null;

function isAdminAppPage() {
  const override = document.body?.getAttribute("data-lhai-shell")?.trim().toLowerCase();
  if (override === "admin") return true;
  if (override === "customer") return false;
  const path = (window.location.pathname.split("/").pop() || "").toLowerCase();
  if (path.startsWith("admin-")) return true;
  if (path === "messages.html") return canAccessAdminShell();
  return false;
}

/**
 * Domains required for the current app page shell and declarative bindings.
 * @param {ParentNode} [root]
 * @returns {string[]}
 */
export function resolveAppPageI18nDomains(root = document) {
  const declared = getBodyI18nDomains();
  if (declared.length) return [...new Set(declared)];
  const inferred = inferI18nDomainsFromDom(root);
  const base = ["common", "nav"];
  if (isAdminAppPage()) base.push("admin");
  return [...new Set([...base, ...inferred])];
}

/**
 * When a logged-in session lacks ``preferred_language_code`` (legacy session) or
 * local UI language differs from the account preference, hydrate from the server
 * before the first i18n bundle load.
 */
async function hydrateAuthenticatedLanguagePreference() {
  if (typeof window === "undefined" || !window.localStorage) return;
  let token = "";
  try {
    token = String(window.localStorage.getItem("lhai_access_token") || "").trim();
  } catch {
    return;
  }
  if (!token) return;

  const sessionLang = getSessionLanguage();
  if (sessionLang) {
    setSavedLocalLanguage(sessionLang);
    return;
  }

  try {
    const [{ userPreferencesApi }, auth] = await Promise.all([
      import("./api.js"),
      import("./auth.js"),
    ]);
    const prefs = await userPreferencesApi.getMyPreferences();
    const code = resolveAccountPreferredLanguageCode(prefs?.preferred_language_code);
    setSavedLocalLanguage(code);
    auth.updateSessionPreferredLanguage(code);
  } catch (err) {
    console.warn("[lhai] authenticated language preference hydrate skipped", err);
  }
}

/**
 * Load bundles for the app shell once, then apply declarative bindings.
 * @param {ParentNode} [root]
 * @returns {Promise<void>}
 */
export function initAppPageI18n(root = document) {
  if (!_bootPromise) {
    _bootPromise = (async () => {
      await hydrateAuthenticatedLanguagePreference();
      await initPageI18nAndApplyDom(resolveAppPageI18nDomains(root), root);
    })().catch((err) => {
      _bootPromise = null;
      throw err;
    });
  }
  return _bootPromise;
}

/** Await before rendering shell UI that depends on ``t()`` (header, sidebar, page). */
export const appPageLanguageReady = initAppPageI18n();
