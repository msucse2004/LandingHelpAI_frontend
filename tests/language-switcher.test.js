import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const FRONTEND_ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const SWITCHER_SRC = path.join(FRONTEND_ROOT, "src/assets/js/core/language-switcher.js");

const SESSION_KEY = "lhai_session";
const TOKEN_KEY = "lhai_access_token";
const STORAGE_KEY = "lhai_preferred_language";

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
  };
}

test("language-switcher source wires logged-in persistence and i18n reload", () => {
  const src = readFileSync(SWITCHER_SRC, "utf8");
  assert.match(src, /setSavedLocalLanguage/);
  assert.match(src, /updateSessionPreferredLanguage/);
  assert.match(src, /patchMyPreferences/);
  assert.match(src, /applyLanguageChangeToPage/);
  assert.match(src, /existingSwitcher\(\)/);
  assert.match(src, /_mounted/);
  assert.match(src, /resolveAccountPreferredLanguageCode/);
});

test("updateSessionPreferredLanguage persists validated language on authenticated session", async () => {
  resetStorage();
  const auth = await import("../src/assets/js/core/auth.js");
  window.localStorage.setItem(TOKEN_KEY, "test-token");
  window.localStorage.setItem(
    SESSION_KEY,
    JSON.stringify({ userId: "u1", role: "customer", email: "a@b.com" })
  );

  assert.equal(auth.updateSessionPreferredLanguage("zh-Hans"), true);
  let session = JSON.parse(window.localStorage.getItem(SESSION_KEY));
  assert.equal(session.preferred_language_code, "zh-Hans");

  assert.equal(auth.updateSessionPreferredLanguage("zh-Hant"), true);
  session = JSON.parse(window.localStorage.getItem(SESSION_KEY));
  assert.equal(session.preferred_language_code, "zh-Hant");
  assert.equal(session.userId, "u1");
});

test("updateSessionPreferredLanguage rejects invalid codes by normalizing to en", async () => {
  resetStorage();
  const auth = await import("../src/assets/js/core/auth.js");
  window.localStorage.setItem(TOKEN_KEY, "test-token");
  window.localStorage.setItem(
    SESSION_KEY,
    JSON.stringify({ userId: "u1", role: "customer" })
  );

  assert.equal(auth.updateSessionPreferredLanguage("fr"), true);
  const session = JSON.parse(window.localStorage.getItem(SESSION_KEY));
  assert.equal(session.preferred_language_code, "en");
});

test("logged-in effective language follows session after simulated switch storage writes", async () => {
  resetStorage();
  const pref = await import("../src/assets/js/core/preferred-language.js");
  window.localStorage.setItem(TOKEN_KEY, "test-token");
  window.localStorage.setItem(STORAGE_KEY, "ko");
  window.localStorage.setItem(
    SESSION_KEY,
    JSON.stringify({ preferred_language_code: "ja" })
  );
  assert.equal(pref.getEffectiveLanguage(), "ja");

  window.localStorage.setItem(
    SESSION_KEY,
    JSON.stringify({ preferred_language_code: "zh-Hans" })
  );
  assert.equal(pref.getEffectiveLanguage(), "zh-Hans");
  assert.equal(window.localStorage.getItem(STORAGE_KEY), "ko");
});
