import test from "node:test";
import assert from "node:assert/strict";

const STORAGE_KEY = "lhai_preferred_language";
const SESSION_KEY = "lhai_session";
const TOKEN_KEY = "lhai_access_token";

function resetStorage() {
  globalThis.window = {
    localStorage: {
      _data: {},
      getItem(key) {
        return this._data[key] ?? null;
      },
      setItem(key, value) {
        this._data[key] = String(value);
      },
      removeItem(key) {
        delete this._data[key];
      },
    },
    document: {
      createElement(tag) {
        if (tag === "option") {
          return { value: "", textContent: "", selected: false };
        }
        return {};
      },
    },
  };
  globalThis.navigator = { language: "en-US", languages: ["en-US", "en"] };
  globalThis.HTMLSelectElement = function HTMLSelectElement() {};
}

resetStorage();

const mod = await import("../src/assets/js/core/preferred-language.js");

test("SUPPORTED_LANGUAGE_OPTIONS lists six locales with region and native names", () => {
  assert.deepEqual(
    mod.SUPPORTED_LANGUAGE_OPTIONS.map((item) => item.code),
    ["en", "es", "ko", "zh-Hans", "zh-Hant", "ja"]
  );
  assert.equal(mod.getSupportedLanguageDisplayLabel("en"), "EN English");
  assert.equal(mod.getSupportedLanguageDisplayLabel("ko"), "KR 한국어");
  assert.equal(mod.getSupportedLanguageDisplayLabel("zh-Hant"), "TW 繁體中文");
});

test("normalizeLanguageCode and legacy alias accept seeded codes only", () => {
  assert.equal(mod.normalizeLanguageCode("ko"), "ko");
  assert.equal(mod.normalizeLanguageCode("zh-Hans"), "zh-Hans");
  assert.equal(mod.normalizeLanguageCode("fr"), null);
  assert.equal(mod.normalizeSupportedLanguageCode("ja"), "ja");
  assert.equal(mod.isSupportedLanguage("zh-Hant"), true);
  assert.equal(mod.isSupportedLanguage("de"), false);
});

test("mapBrowserLanguageToSupported maps zh variants", () => {
  globalThis.navigator = { language: "zh-TW", languages: ["zh-TW"] };
  assert.equal(mod.mapBrowserLanguageToSupported(), "zh-Hant");
  globalThis.navigator = { language: "zh-CN", languages: ["zh-CN"] };
  assert.equal(mod.mapBrowserLanguageToSupported(), "zh-Hans");
});

test("resolveAccountPreferredLanguageCode defaults missing or invalid to en", () => {
  assert.equal(mod.resolveAccountPreferredLanguageCode(null), "en");
  assert.equal(mod.resolveAccountPreferredLanguageCode(undefined), "en");
  assert.equal(mod.resolveAccountPreferredLanguageCode("ko"), "ko");
  assert.equal(mod.resolveAccountPreferredLanguageCode("fr"), "en");
});

test("applyLoginPreferredLanguage uses server response only", () => {
  resetStorage();
  window.localStorage.setItem(STORAGE_KEY, "ko");
  assert.equal(mod.applyLoginPreferredLanguage("en"), "en");
  assert.equal(mod.applyLoginPreferredLanguage("ja"), "ja");
  assert.equal(mod.resolveLoginPreferredLanguageCode("ja"), "ja");
  assert.equal(mod.applyLoginPreferredLanguage(null), "en");
});

test("setSavedLocalLanguage and setSessionLanguage persist validated codes", () => {
  resetStorage();
  assert.equal(mod.setSavedLocalLanguage("zh-Hant"), "zh-Hant");
  assert.equal(window.localStorage.getItem(STORAGE_KEY), "zh-Hant");
  assert.equal(mod.savePreferredLanguage("xx"), "en");

  window.localStorage.setItem(
    SESSION_KEY,
    JSON.stringify({ userId: "u1", preferred_language_code: "en" })
  );
  assert.equal(mod.setSessionLanguage("zh-Hans"), "zh-Hans");
  const session = JSON.parse(window.localStorage.getItem(SESSION_KEY));
  assert.equal(session.preferred_language_code, "zh-Hans");
  assert.equal(session.preferredLanguage, undefined);
});

// --- Step 11: language preference flow integration tests (mock storage only) ---

test("integration_01_logged_out_no_localStorage_returns_en", () => {
  resetStorage();
  assert.equal(mod.getEffectiveLanguage(), "en");
  assert.equal(mod.getSavedPreferredLanguage(), null);
});

test("integration_02_logged_out_localStorage_ko_returns_ko", () => {
  resetStorage();
  window.localStorage.setItem(STORAGE_KEY, "ko");
  assert.equal(mod.getEffectiveLanguage(), "ko");
  assert.equal(mod.getSavedPreferredLanguage(), "ko");
});

test("integration_03_invalid_localStorage_language_returns_en", () => {
  resetStorage();
  window.localStorage.setItem(STORAGE_KEY, "xx");
  assert.equal(mod.getEffectiveLanguage(), "en");
  assert.equal(mod.getSavedPreferredLanguage(), null);
});

test("integration_04_login_en_overrides_guest_localStorage_ko", async () => {
  resetStorage();
  window.localStorage.setItem(STORAGE_KEY, "ko");
  const auth = await import("../src/assets/js/core/auth.js");

  auth.applyAuthLoginResult({
    access_token: "test-token",
    user_id: "user-1",
    role: "customer",
    email: "guest@example.com",
    username: "guest",
    preferred_language_code: "en",
  });

  assert.equal(mod.getEffectiveLanguage(), "en");
  assert.equal(window.localStorage.getItem(STORAGE_KEY), "ko");
  const session = JSON.parse(window.localStorage.getItem(SESSION_KEY));
  assert.equal(session.preferred_language_code, "en");
});

test("integration_05_login_ja_stored_in_session", async () => {
  resetStorage();
  const auth = await import("../src/assets/js/core/auth.js");

  auth.applyAuthLoginResult({
    access_token: "test-token",
    user_id: "user-2",
    role: "customer",
    email: "ja@example.com",
    username: "jauser",
    preferred_language_code: "ja",
  });

  const session = JSON.parse(window.localStorage.getItem(SESSION_KEY));
  assert.equal(session.preferred_language_code, "ja");
  assert.equal(mod.getSessionLanguage(), "ja");
  assert.equal(mod.getEffectiveLanguage(), "ja");
});

test("integration_06_logged_in_session_language_priority_over_localStorage", () => {
  resetStorage();
  window.localStorage.setItem(TOKEN_KEY, "test-token");
  window.localStorage.setItem(STORAGE_KEY, "es");
  window.localStorage.setItem(
    SESSION_KEY,
    JSON.stringify({ preferred_language_code: "ja" })
  );

  assert.equal(mod.getEffectiveLanguage(), "ja");
  assert.equal(mod.getSavedPreferredLanguage(), "es");
});

test("integration_07_logged_in_language_switch_updates_session", async () => {
  resetStorage();
  window.localStorage.setItem(TOKEN_KEY, "test-token");
  window.localStorage.setItem(
    SESSION_KEY,
    JSON.stringify({ userId: "user-3", role: "customer", preferred_language_code: "en" })
  );

  const auth = await import("../src/assets/js/core/auth.js");
  assert.equal(auth.updateSessionPreferredLanguage("ko"), true);

  const session = JSON.parse(window.localStorage.getItem(SESSION_KEY));
  assert.equal(session.preferred_language_code, "ko");
  assert.equal(mod.getSessionLanguage(), "ko");
  assert.equal(mod.getEffectiveLanguage(), "ko");
});

test("integration_08_zh_hans_and_zh_hant_are_valid_language_codes", () => {
  resetStorage();

  for (const code of ["zh-Hans", "zh-Hant"]) {
    assert.equal(mod.isSupportedLanguage(code), true);
    assert.equal(mod.normalizeLanguageCode(code), code);
    assert.equal(mod.setSavedLocalLanguage(code), code);
    assert.equal(window.localStorage.getItem(STORAGE_KEY), code);
    assert.equal(mod.getEffectiveLanguage(), code);
    window.localStorage.removeItem(STORAGE_KEY);
  }

  window.localStorage.setItem(TOKEN_KEY, "test-token");
  window.localStorage.setItem(
    SESSION_KEY,
    JSON.stringify({ preferred_language_code: "zh-Hans" })
  );
  assert.equal(mod.getEffectiveLanguage(), "zh-Hans");

  assert.equal(mod.setSessionLanguage("zh-Hant"), "zh-Hant");
  assert.equal(mod.getEffectiveLanguage(), "zh-Hant");
});

test("getEffectiveLanguage when logged out ignores browser locale and stale session", () => {
  resetStorage();
  globalThis.navigator = { language: "ko-KR", languages: ["ko-KR"] };
  assert.equal(mod.getEffectiveLanguage(), "en");

  window.localStorage.setItem(
    SESSION_KEY,
    JSON.stringify({ preferred_language_code: "ja" })
  );
  assert.equal(mod.getEffectiveLanguage(), "en");
});

test("getEffectiveLanguage when logged in accepts legacy session preferredLanguage", () => {
  resetStorage();
  window.localStorage.setItem(TOKEN_KEY, "test-token");
  window.localStorage.setItem(STORAGE_KEY, "ko");
  window.localStorage.setItem(
    SESSION_KEY,
    JSON.stringify({ preferredLanguage: "zh-Hans" })
  );
  assert.equal(mod.getEffectiveLanguage(), "zh-Hans");

  window.localStorage.setItem(
    SESSION_KEY,
    JSON.stringify({ preferred_language_code: "fr" })
  );
  assert.equal(mod.getEffectiveLanguage(), "ko");

  window.localStorage.removeItem(STORAGE_KEY);
  assert.equal(mod.getEffectiveLanguage(), "en");
});
