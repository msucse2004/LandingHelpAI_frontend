import { APP_CONFIG } from "./config.js";
import { getEffectiveLanguage, normalizeSupportedLanguageCode } from "./preferred-language.js";

const DEFAULT_LANG = "en";
/** Locales where the catalog may store English as a gap-fill copy of ``en``. */
const LOCALES_STRIP_ENGLISH_GAP_FILL = new Set(["es", "ko", "zh-Hans", "zh-Hant", "ja"]);

const RUNTIME_FLUSH_DEBOUNCE_MS = 80;
const RUNTIME_MAX_BATCH = 100;
const RUNTIME_MAX_SOURCE_LENGTH = 1000;
const RUNTIME_SUSPICIOUS_SOURCE_LENGTH = 500;

// language-domain -> strings
const _bundleCache = new Map();
// key -> string
let _stringsByKey = {};
/** English catalog values used to detect gap-fill copies in non-default locales. */
let _englishReferenceByKey = {};
const _loadedDomains = new Set();
/** Bumped on language reload so stale initPageI18n promises cannot overwrite the DOM. */
let _i18nApplyGeneration = 0;

/** Pending runtime resolve payloads keyed by logical key. */
const missingRuntimeQueue = new Map();
/** Keys queued or awaiting flush (prevents duplicate enqueue). */
const queuedRuntimeKeys = new Set();
/** Keys already submitted to runtime resolve for the current page language session. */
const _submittedRuntimeKeys = new Set();

let _runtimeFlushTimer = null;
let _runtimeFlushInFlight = false;

function normalizeLang(lang) {
  const raw = (lang || "").toString().trim();
  if (!raw) return getEffectiveLanguage();
  return normalizeSupportedLanguageCode(raw) || getEffectiveLanguage();
}

function inferDomainFromKey(key) {
  const logical = String(key || "").trim();
  const dot = logical.indexOf(".");
  return dot > 0 ? logical.slice(0, dot).toLowerCase() : logical.toLowerCase();
}

/**
 * Skip runtime registration for empty, oversized, or paragraph-like user content.
 * @param {unknown} text
 * @returns {boolean}
 */
function shouldSkipRuntimeSourceText(text) {
  const value = String(text ?? "").trim();
  if (!value) return true;
  if (value.length > RUNTIME_MAX_SOURCE_LENGTH) return true;
  if (value.length > RUNTIME_SUSPICIOUS_SOURCE_LENGTH) {
    const newlines = (value.match(/\n/g) || []).length;
    const words = value.split(/\s+/).filter(Boolean).length;
    if (newlines >= 2 || words > 80) return true;
  }
  return false;
}

function clearRuntimeResolveState() {
  missingRuntimeQueue.clear();
  queuedRuntimeKeys.clear();
  _submittedRuntimeKeys.clear();
  if (_runtimeFlushTimer) {
    clearTimeout(_runtimeFlushTimer);
    _runtimeFlushTimer = null;
  }
  _runtimeFlushInFlight = false;
}

function scheduleRuntimeFlush() {
  if (_runtimeFlushTimer) clearTimeout(_runtimeFlushTimer);
  _runtimeFlushTimer = setTimeout(() => {
    _runtimeFlushTimer = null;
    flushRuntimeMissingKeys();
  }, RUNTIME_FLUSH_DEBOUNCE_MS);
}

/**
 * Queue one missing static UI key for batched backend resolution.
 * @param {string} key
 * @param {string} fallback
 */
export function registerMissingRuntimeKey(key, fallback) {
  const logicalKey = String(key || "").trim();
  if (!logicalKey) return;
  if (_submittedRuntimeKeys.has(logicalKey) || queuedRuntimeKeys.has(logicalKey)) return;

  const lang = normalizeLang(getEffectiveLanguage());
  if (lang === DEFAULT_LANG) return;

  const current = _stringsByKey[logicalKey];
  if (current !== undefined && current !== null && String(current).trim() !== "") return;
  if (shouldSkipRuntimeSourceText(fallback)) return;

  missingRuntimeQueue.set(logicalKey, {
    key: logicalKey,
    source_text: String(fallback).trim(),
    domain: inferDomainFromKey(logicalKey),
  });
  queuedRuntimeKeys.add(logicalKey);
  scheduleRuntimeFlush();
}

/**
 * Merge runtime resolve API results into the in-memory bundle and notify listeners.
 * @param {string} language
 * @param {Array<{ key?: string, value?: string }>} items
 */
export function mergeResolvedRuntimeValues(language, items) {
  if (!Array.isArray(items) || !items.length) return;

  const keys = [];
  for (const item of items) {
    if (!item || !item.key) continue;
    if (item.error) continue;
    const logicalKey = String(item.key);
    _submittedRuntimeKeys.add(logicalKey);
    queuedRuntimeKeys.delete(logicalKey);
    missingRuntimeQueue.delete(logicalKey);

    const value = item.value;
    if (value === undefined || value === null || String(value).trim() === "") continue;

    const text = String(value);
    _stringsByKey[logicalKey] = text;
    const domain = logicalKey.includes(".") ? logicalKey.split(".", 1)[0] : "";
    if (domain) {
      const cacheKey = `${language}::${domain}`;
      if (_bundleCache.has(cacheKey)) {
        const cached = { ..._bundleCache.get(cacheKey) };
        cached[logicalKey] = text;
        _bundleCache.set(cacheKey, cached);
      }
    }
    keys.push(logicalKey);
  }

  if (!keys.length || typeof window === "undefined") return;

  window.dispatchEvent(
    new CustomEvent("lhai:i18n-runtime-resolved", {
      detail: { language, keys },
    })
  );
}

/**
 * POST queued missing keys to ``/api/i18n/runtime/resolve`` (debounced by ``registerMissingRuntimeKey``).
 * @returns {Promise<void>}
 */
export async function flushRuntimeMissingKeys() {
  if (_runtimeFlushInFlight) return;
  if (missingRuntimeQueue.size === 0) return;

  const lang = normalizeLang(getEffectiveLanguage());
  if (lang === DEFAULT_LANG) {
    clearRuntimeResolveState();
    return;
  }

  const batch = [...missingRuntimeQueue.values()].slice(0, RUNTIME_MAX_BATCH);
  for (const item of batch) {
    missingRuntimeQueue.delete(item.key);
  }
  if (!batch.length) return;

  _runtimeFlushInFlight = true;
  try {
    const url = `${APP_CONFIG.apiBaseUrl}/api/i18n/runtime/resolve`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        language_code: lang,
        items: batch,
      }),
    });

    if (!res.ok) {
      for (const item of batch) {
        _submittedRuntimeKeys.add(item.key);
        queuedRuntimeKeys.delete(item.key);
      }
      return;
    }

    const data = await res.json();
    mergeResolvedRuntimeValues(data.language_code || lang, data.items || []);
  } catch {
    for (const item of batch) {
      _submittedRuntimeKeys.add(item.key);
      queuedRuntimeKeys.delete(item.key);
    }
  } finally {
    _runtimeFlushInFlight = false;
    if (missingRuntimeQueue.size > 0) scheduleRuntimeFlush();
  }
}

function stripEnglishGapFillCopies(strings, enReference) {
  if (!strings || !enReference) return strings || {};
  const out = { ...strings };
  for (const [key, value] of Object.entries(out)) {
    const enValue = enReference[key];
    if (enValue && value === enValue) {
      delete out[key];
    }
  }
  return out;
}

async function fetchDomainBundle(domain, lang) {
  const normalizedLang = normalizeLang(lang);
  const cacheKey = `${normalizedLang}::${domain}`;
  if (_bundleCache.has(cacheKey)) return _bundleCache.get(cacheKey);

  const url = `${APP_CONFIG.apiBaseUrl}/api/i18n?lang=${encodeURIComponent(normalizedLang)}&domain=${encodeURIComponent(domain)}`;
  const res = await fetch(url, { method: "GET" });
  if (!res.ok) throw new Error(`i18n bundle failed (${res.status})`);
  const data = await res.json();

  let strings = { ...(data.strings || {}) };
  if (
    normalizedLang !== DEFAULT_LANG &&
    LOCALES_STRIP_ENGLISH_GAP_FILL.has(normalizedLang)
  ) {
    const enReference = await fetchDomainBundle(domain, DEFAULT_LANG);
    Object.assign(_englishReferenceByKey, enReference);
    strings = stripEnglishGapFillCopies(strings, enReference);
  } else if (normalizedLang === DEFAULT_LANG) {
    Object.assign(_englishReferenceByKey, strings);
  }

  _bundleCache.set(cacheKey, strings);
  return strings;
}

/**
 * Load one or more i18n domains, then use `t(key)`.
 * @param {string[]} domains
 * @param {string} lang
 */
export async function initI18nDomains(domains, lang) {
  const normalizedLang = normalizeLang(lang || DEFAULT_LANG);
  const toLoad = (domains || []).map((d) => String(d).trim().toLowerCase()).filter(Boolean);

  const loaded = [];
  for (const domain of toLoad) {
    _loadedDomains.add(domain);
    loaded.push(fetchDomainBundle(domain, normalizedLang).catch(() => ({})));
  }

  const bundles = await Promise.all(loaded);
  for (const b of bundles) Object.assign(_stringsByKey, b);
}

function isEnglishPassthroughForLocale(lang, key, value) {
  if (!value || lang === DEFAULT_LANG) return false;
  const en = _englishReferenceByKey[key];
  return Boolean(en && value === en);
}

/**
 * Translate key. If missing, return fallback or the key itself.
 * Missing keys with a non-empty fallback are queued for runtime backend resolution.
 * @param {string} key
 * @param {string} [fallback]
 */
export function t(key, fallback) {
  const lang = normalizeLang(getEffectiveLanguage());
  const logicalKey = String(key);
  let value = _stringsByKey[logicalKey];
  if (isEnglishPassthroughForLocale(lang, logicalKey, value)) {
    value = undefined;
  }
  if (value === undefined || value === null || value === "") {
    if (fallback !== undefined && fallback !== null && !shouldSkipRuntimeSourceText(fallback)) {
      registerMissingRuntimeKey(logicalKey, fallback);
    }
    return fallback !== undefined ? fallback : logicalKey;
  }
  return value;
}

/**
 * API 번역이 비어 있을 때 견적 등 페이지 전용 폴백을 채웁니다.
 * 이미 값이 있으면 덮어쓰지 않습니다.
 * @param {Record<string, string>} strings
 */
export function mergeFallbackStrings(strings) {
  if (!strings || typeof strings !== "object") return;
  for (const [k, v] of Object.entries(strings)) {
    if (v === undefined || v === null || v === "") continue;
    const key = String(k);
    const cur = _stringsByKey[key];
    if (cur === undefined || cur === null || cur === "") {
      _stringsByKey[key] = v;
    }
  }
}

/**
 * Overwrite in-memory strings (used after API reload so public-page locale overlays apply).
 * @param {Record<string, string>} strings
 */
export function overlayI18nStrings(strings) {
  if (!strings || typeof strings !== "object") return;
  Object.assign(_stringsByKey, strings);
}

/** 설문 선호 언어 등으로 UI 언어를 바꿀 때, 이전 언어 문자열이 남지 않도록 초기화합니다. */
export function resetI18nClientState() {
  _stringsByKey = {};
  _englishReferenceByKey = {};
  _bundleCache.clear();
  _i18nApplyGeneration += 1;
  clearRuntimeResolveState();
}

/** Snapshot generation before async i18n work; skip DOM apply when it no longer matches. */
export function captureI18nApplyGeneration() {
  return _i18nApplyGeneration;
}

/** @param {number} generation */
export function isI18nApplyGenerationCurrent(generation) {
  return generation === _i18nApplyGeneration;
}

/** Reload domains that were fetched earlier in this page session, then merge into ``t()``. */
export async function reloadI18nForLanguage(lang, domains) {
  const declared = (domains && domains.length ? domains : getLoadedI18nDomains()).map((d) =>
    String(d).trim().toLowerCase()
  ).filter(Boolean);
  const toLoad = [...new Set([...declared, ...getLoadedI18nDomains()])];
  const normalizedLang = normalizeLang(lang);
  resetI18nClientState();
  for (const domain of toLoad) {
    _loadedDomains.add(domain);
  }
  await initI18nDomains(toLoad.length ? toLoad : ["common"], normalizedLang);
  return normalizedLang;
}

/** Domains registered during this page session (for language-switch reload). */
export function getLoadedI18nDomains() {
  return _loadedDomains.size ? [..._loadedDomains] : ["common"];
}

/** Register domains expected on this page without fetching yet. */
export function registerI18nDomains(domains) {
  for (const domain of domains || []) {
    const d = String(domain).trim().toLowerCase();
    if (d) _loadedDomains.add(d);
  }
}

/**
 * Queue missing keys from the current page, then resolve via the runtime API.
 * @returns {Promise<void>}
 */
export async function flushRuntimeMissingKeysAfterPageApply() {
  const lang = normalizeLang(getEffectiveLanguage());
  if (lang === DEFAULT_LANG) return;
  await flushRuntimeMissingKeys();
  if (missingRuntimeQueue.size > 0) {
    await flushRuntimeMissingKeys();
  }
}
