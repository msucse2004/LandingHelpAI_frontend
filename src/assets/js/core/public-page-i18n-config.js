/**
 * Resolve ``data-i18n-domains`` for public pages (no circular imports with boot/switcher).
 * @module core/public-page-i18n-config
 */

/**
 * @returns {HTMLScriptElement | null}
 */
export function findPublicPageLanguageBootScript() {
  if (typeof document === "undefined") return null;
  const candidates = document.querySelectorAll(
    'script[type="module"][data-i18n-domains], script[type="module"][src*="public-page-language-boot.js"]'
  );
  for (const el of candidates) {
    if (!(el instanceof HTMLScriptElement)) continue;
    const src = el.getAttribute("src") || "";
    if (el.hasAttribute("data-i18n-domains") || src.includes("public-page-language-boot.js")) {
      return el;
    }
  }
  const current = document.currentScript;
  return current instanceof HTMLScriptElement ? current : null;
}

/**
 * @param {HTMLScriptElement | null | undefined} script
 * @returns {string[]}
 */
export function parseI18nDomainsFromBootScript(script) {
  const raw = script?.getAttribute("data-i18n-domains") || "common";
  return raw
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
}

/** @type {string[] | null} */
let _cachedPublicPageDomains = null;

/**
 * Remember domains from the first successful public-page boot (survives later DOM lookups).
 * @param {string[] | null | undefined} domains
 */
export function cachePublicPageI18nDomains(domains) {
  const next = [...new Set((domains || []).map((d) => String(d).trim()).filter(Boolean))];
  if (!next.length) return;
  _cachedPublicPageDomains = next;
}

function readDomainsFromBodyDataset() {
  if (typeof document === "undefined") return [];
  const raw = document.body?.getAttribute("data-lhai-i18n-domains") || "";
  return raw
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
}

/**
 * Domains declared on ``<body data-lhai-i18n-domains>``.
 * @returns {string[]}
 */
export function getBodyI18nDomains() {
  return readDomainsFromBodyDataset();
}

/**
 * Domains declared on the current public page boot script tag.
 * @returns {string[]}
 */
export function getPublicPageI18nDomains() {
  if (_cachedPublicPageDomains?.length) return [..._cachedPublicPageDomains];
  const fromScript = parseI18nDomainsFromBootScript(findPublicPageLanguageBootScript());
  if (fromScript.length) return fromScript;
  const fromBody = readDomainsFromBodyDataset();
  return fromBody.length ? fromBody : ["common"];
}
