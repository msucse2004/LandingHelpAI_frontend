import { APP_CONFIG } from "./config.js";

const DEFAULT_LANG = "ko";

// language-domain -> strings
const _bundleCache = new Map();
// key -> string
let _stringsByKey = {};

function normalizeLang(lang) {
  const raw = (lang || "").toString().trim();
  if (!raw) return DEFAULT_LANG;
  // <html lang="en-US"> 같은 값도 그대로 전달 가능하지만,
  // 프론트에서는 보통 en/ko 위주라서 소문자만 정리합니다.
  return raw.toString();
}

async function fetchDomainBundle(domain, lang) {
  const cacheKey = `${lang}::${domain}`;
  if (_bundleCache.has(cacheKey)) return _bundleCache.get(cacheKey);

  const url = `${APP_CONFIG.apiBaseUrl}/api/i18n?lang=${encodeURIComponent(lang)}&domain=${encodeURIComponent(domain)}`;
  const res = await fetch(url, { method: "GET" });
  if (!res.ok) throw new Error(`i18n bundle failed (${res.status})`);
  const data = await res.json();

  // data.strings: logical_key -> final_ui_string
  _bundleCache.set(cacheKey, data.strings || {});
  return data.strings || {};
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
    loaded.push(fetchDomainBundle(domain, normalizedLang).catch(() => ({})));
  }

  const bundles = await Promise.all(loaded);
  for (const b of bundles) Object.assign(_stringsByKey, b);
}

/**
 * Translate key. If missing, return fallback or the key itself.
 * @param {string} key
 * @param {string} [fallback]
 */
export function t(key, fallback) {
  const v = _stringsByKey[String(key)];
  if (v === undefined || v === null || v === "") return fallback !== undefined ? fallback : String(key);
  return v;
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

/** 설문 선호 언어 등으로 UI 언어를 바꿀 때, 이전 언어 문자열이 남지 않도록 초기화합니다. */
export function resetI18nClientState() {
  _stringsByKey = {};
  _bundleCache.clear();
}

