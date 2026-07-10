/**
 * Supported UI languages — single source for signup, header switcher, and i18n.
 * ``code`` values match backend ``preferred_language_code`` (BCP-47 style).
 */

/** @typedef {{ code: string, regionCode: string, nativeName: string }} SupportedLanguageOption */

/** @type {readonly SupportedLanguageOption[]} */
export const SUPPORTED_LANGUAGE_OPTIONS = Object.freeze([
  { code: "en", regionCode: "EN", nativeName: "English" },
  { code: "es", regionCode: "ES", nativeName: "Español" },
  { code: "ko", regionCode: "KR", nativeName: "한국어" },
  { code: "zh-Hans", regionCode: "CN", nativeName: "简体中文" },
  { code: "zh-Hant", regionCode: "TW", nativeName: "繁體中文" },
  { code: "ja", regionCode: "JP", nativeName: "日本語" },
]);

const SUPPORTED_CODES = new Set(SUPPORTED_LANGUAGE_OPTIONS.map((item) => item.code));

const OPTION_BY_CODE = new Map(SUPPORTED_LANGUAGE_OPTIONS.map((item) => [item.code, item]));

export const PREFERRED_LANGUAGE_STORAGE_KEY = "lhai_preferred_language";

const SESSION_STORAGE_KEY = "lhai_session";
/** Must match ``auth.js`` ``TOKEN_KEY`` — checked here to avoid a circular import. */
const ACCESS_TOKEN_STORAGE_KEY = "lhai_access_token";

export const DEFAULT_LANGUAGE_CODE = "en";

/**
 * @param {string | null | undefined} raw
 * @returns {string | null}
 */
export function normalizeLanguageCode(raw) {
  const code = String(raw || "").trim();
  if (!code) return null;
  if (SUPPORTED_CODES.has(code)) return code;
  const lower = code.toLowerCase().replace(/_/g, "-");
  if (lower === "zh" || lower === "zh-cn" || lower === "zh-hans") return "zh-Hans";
  if (lower === "zh-tw" || lower === "zh-hk" || lower === "zh-hant") return "zh-Hant";
  return null;
}

/**
 * Back-compat alias for :func:`normalizeLanguageCode`.
 * @param {string | null | undefined} raw
 * @returns {string | null}
 */
export function normalizeSupportedLanguageCode(raw) {
  return normalizeLanguageCode(raw);
}

/**
 * @param {string | null | undefined} code
 * @returns {boolean}
 */
export function isSupportedLanguage(code) {
  return normalizeLanguageCode(code) != null;
}

/**
 * Native label with region hint, e.g. ``EN English``, ``KR 한국어``.
 * @param {string | null | undefined} code
 * @returns {string}
 */
export function getSupportedLanguageDisplayLabel(code) {
  const item = OPTION_BY_CODE.get(String(code || "").trim());
  if (!item) return String(code || "").trim() || DEFAULT_LANGUAGE_CODE;
  return `${item.regionCode} ${item.nativeName}`;
}

/**
 * Fill a ``<select>`` from :data:`SUPPORTED_LANGUAGE_OPTIONS`.
 * @param {HTMLSelectElement | null | undefined} selectEl
 * @param {string | null | undefined} [selectedCode]
 */
export function populateSupportedLanguageSelect(selectEl, selectedCode) {
  if (!(selectEl instanceof HTMLSelectElement)) return;
  const selected = normalizeLanguageCode(selectedCode) || DEFAULT_LANGUAGE_CODE;
  selectEl.replaceChildren(
    ...SUPPORTED_LANGUAGE_OPTIONS.map((item) => {
      const option = document.createElement("option");
      option.value = item.code;
      option.textContent = getSupportedLanguageDisplayLabel(item.code);
      option.selected = item.code === selected;
      return option;
    })
  );
  selectEl.value = selected;
}

/**
 * Normalize account/API language codes; missing or invalid values become ``en``.
 * @param {string | null | undefined} raw
 * @returns {string}
 */
export function resolveAccountPreferredLanguageCode(raw) {
  return normalizeLanguageCode(raw) || DEFAULT_LANGUAGE_CODE;
}

/**
 * @param {string | null | undefined} raw
 * @returns {string | null}
 */
function mapOneBrowserLanguage(raw) {
  const tag = String(raw || "").trim().replace(/_/g, "-");
  if (!tag) return null;

  const direct = normalizeLanguageCode(tag);
  if (direct) return direct;

  const lower = tag.toLowerCase();
  if (lower.startsWith("zh")) {
    if (
      lower.includes("hant") ||
      lower.endsWith("-tw") ||
      lower.endsWith("-hk") ||
      lower.endsWith("-mo")
    ) {
      return "zh-Hant";
    }
    return "zh-Hans";
  }

  const primary = lower.split("-")[0];
  if (primary === "en") return "en";
  if (primary === "es") return "es";
  if (primary === "ko") return "ko";
  if (primary === "ja") return "ja";

  return null;
}

/** @returns {string | null} */
export function mapBrowserLanguageToSupported() {
  if (typeof navigator === "undefined") return null;
  const candidates = navigator.languages?.length ? navigator.languages : [navigator.language];
  for (const raw of candidates) {
    const mapped = mapOneBrowserLanguage(raw);
    if (mapped) return mapped;
  }
  return null;
}

/** @returns {string | null} */
function readRawPreferredLanguageFromSessionObject(session) {
  if (!session || typeof session !== "object") return null;
  const snake = session.preferred_language_code;
  if (snake != null && String(snake).trim() !== "") return String(snake).trim();
  const camel = session.preferredLanguage;
  if (camel != null && String(camel).trim() !== "") return String(camel).trim();
  return null;
}

/** @returns {boolean} */
function hasAuthenticatedAccessToken() {
  if (typeof window === "undefined" || !window.localStorage) return false;
  try {
    const token = window.localStorage.getItem(ACCESS_TOKEN_STORAGE_KEY);
    return Boolean(token && String(token).trim());
  } catch {
    return false;
  }
}

/**
 * Validated ``preferred_language_code`` from ``lhai_session`` (or legacy ``preferredLanguage``).
 * @returns {string | null}
 */
export function getSessionLanguage() {
  if (typeof window === "undefined" || !window.localStorage) return null;
  try {
    const raw = window.localStorage.getItem(SESSION_STORAGE_KEY);
    if (!raw) return null;
    const session = JSON.parse(raw);
    return normalizeLanguageCode(readRawPreferredLanguageFromSessionObject(session));
  } catch {
    return null;
  }
}

/**
 * Persist ``preferred_language_code`` on the existing session object in localStorage.
 * @param {string | null | undefined} code
 * @returns {string} normalized code written (or that would be written)
 */
export function setSessionLanguage(code) {
  const normalized = resolveAccountPreferredLanguageCode(code);
  if (typeof window === "undefined" || !window.localStorage) return normalized;
  try {
    const raw = window.localStorage.getItem(SESSION_STORAGE_KEY);
    if (!raw) return normalized;
    const session = JSON.parse(raw);
    if (!session || typeof session !== "object") return normalized;
    session.preferred_language_code = normalized;
    delete session.preferredLanguage;
    window.localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
  } catch {
    /* ignore parse / quota errors */
  }
  return normalized;
}

/**
 * Validated guest/account UI language from ``lhai_preferred_language``.
 * @returns {string | null}
 */
export function getSavedLocalLanguage() {
  if (typeof window === "undefined" || !window.localStorage) return null;
  try {
    return normalizeLanguageCode(window.localStorage.getItem(PREFERRED_LANGUAGE_STORAGE_KEY));
  } catch {
    return null;
  }
}

/**
 * Back-compat alias for :func:`getSavedLocalLanguage`.
 * @returns {string | null}
 */
export function getSavedPreferredLanguage() {
  return getSavedLocalLanguage();
}

/**
 * Persist UI language to ``lhai_preferred_language``.
 * @param {string | null | undefined} code
 * @returns {string}
 */
export function setSavedLocalLanguage(code) {
  const normalized = resolveAccountPreferredLanguageCode(code);
  if (typeof window !== "undefined" && window.localStorage) {
    try {
      window.localStorage.setItem(PREFERRED_LANGUAGE_STORAGE_KEY, normalized);
    } catch {
      /* ignore quota / private mode */
    }
  }
  return normalized;
}

/**
 * Back-compat alias for :func:`setSavedLocalLanguage`.
 * @param {string | null | undefined} code
 * @returns {string}
 */
export function savePreferredLanguage(code) {
  return setSavedLocalLanguage(code);
}

const URL_LANG_QUERY_KEYS = ["lang", "locale"];

/**
 * Read a supported UI language code from ``?lang=`` or ``?locale=`` query params.
 * @param {string | URLSearchParams} [search]
 * @returns {string | null}
 */
export function readUiLanguageFromUrlQuery(search) {
  let params;
  if (search instanceof URLSearchParams) {
    params = search;
  } else if (typeof search === "string") {
    params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  } else if (typeof window !== "undefined") {
    params = new URLSearchParams(window.location.search);
  } else {
    return null;
  }
  for (const key of URL_LANG_QUERY_KEYS) {
    const normalized = normalizeLanguageCode(params.get(key));
    if (normalized) return normalized;
  }
  return null;
}

/**
 * Apply ``?lang=`` / ``?locale=`` from the current URL before page i18n boot (email deep links).
 * @param {string | URLSearchParams} [search]
 * @returns {string | null} applied code, if any
 */
export function applyUiLanguageFromUrlQuery(search) {
  const code = readUiLanguageFromUrlQuery(search);
  if (!code) return null;
  setSavedLocalLanguage(code);
  setSessionLanguage(code);
  return code;
}

/** Back-compat alias for email deep-link / older page bundles. */
export const applyLanguageFromUrlQuery = applyUiLanguageFromUrlQuery;

/**
 * Active UI language after login — server account code only (guest localStorage ignored).
 * @param {string | null | undefined} serverPreferredLanguageCode
 * @returns {string}
 */
export function applyLoginPreferredLanguage(serverPreferredLanguageCode) {
  const normalized = resolveAccountPreferredLanguageCode(serverPreferredLanguageCode);
  setSavedLocalLanguage(normalized);
  return normalized;
}

/**
 * Back-compat alias for :func:`applyLoginPreferredLanguage`.
 * @param {string | null | undefined} loginPreferredLanguageCode
 * @returns {string}
 */
export function resolveLoginPreferredLanguageCode(loginPreferredLanguageCode) {
  return applyLoginPreferredLanguage(loginPreferredLanguageCode);
}

/**
 * Effective UI language (validated supported code only).
 *
 * Logged out:
 * 1) ``lhai_preferred_language`` when valid
 * 2) ``en`` — never browser locale
 *
 * Logged in:
 * 1) session ``preferred_language_code`` when valid
 * 2) ``lhai_preferred_language`` when valid
 * 3) ``en``
 *
 * @returns {string}
 */
export function getEffectiveLanguage() {
  if (hasAuthenticatedAccessToken()) {
    const fromSession = getSessionLanguage();
    if (fromSession) return fromSession;
    const saved = getSavedLocalLanguage();
    if (saved) return saved;
    return DEFAULT_LANGUAGE_CODE;
  }

  const saved = getSavedLocalLanguage();
  if (saved) return saved;

  return DEFAULT_LANGUAGE_CODE;
}
