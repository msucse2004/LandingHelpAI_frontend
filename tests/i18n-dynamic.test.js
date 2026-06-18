import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const FRONTEND_ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

function read(relPath) {
  return readFileSync(path.join(FRONTEND_ROOT, relPath), "utf8");
}

globalThis.window = {
  location: { hostname: "localhost", port: "8000", protocol: "http:" },
  LHAI_API_BASE_URL: "",
  document: {
    createElement(tag) {
      if (tag === "option") {
        return { value: "", textContent: "", selected: false };
      }
      return { textContent: "" };
    },
  },
};
globalThis.HTMLElement = class HTMLElement {};

const { formatMessage, localizedStatus, setLocalizedText, localizedOption } = await import(
  "../src/assets/js/core/i18n-dynamic.js"
);
const { overlayI18nStrings } = await import("../src/assets/js/core/i18n-client.js");

test("formatMessage replaces known placeholders and leaves unknown tokens", () => {
  assert.equal(formatMessage("Hello {name}", { name: "Ada" }), "Hello Ada");
  assert.equal(formatMessage("{total} items (showing {shown})", { total: "10", shown: "5" }), "10 items (showing 5)");
  assert.equal(formatMessage("Keep {unknown}", { count: 1 }), "Keep {unknown}");
  assert.equal(formatMessage("No params"), "No params");
});

test("localizedStatus uses t() and interpolates params", () => {
  overlayI18nStrings({
    "test.status": "{count} selected",
  });
  assert.equal(localizedStatus("test.status", "{count} picked", { count: 3 }), "3 selected");
  assert.equal(localizedStatus("test.missing", "Plain English"), "Plain English");
});

test("setLocalizedText writes localized text to an element", () => {
  const el = new HTMLElement();
  el.textContent = "";
  overlayI18nStrings({ "test.line": "Loading..." });
  setLocalizedText(el, "test.line", "Loading...");
  assert.equal(el.textContent, "Loading...");
});

test("localizedOption keeps raw value and localizes label", () => {
  overlayI18nStrings({ "test.all": "All" });
  const opt = localizedOption("", "test.all", "All");
  assert.equal(opt.value, "");
  assert.equal(opt.textContent, "All");
});

test("i18n-dynamic module exports standard dynamic localization helpers", () => {
  const source = read("src/assets/js/core/i18n-dynamic.js");
  assert.match(source, /export function formatMessage/);
  assert.match(source, /export function localizedStatus/);
  assert.match(source, /export function setLocalizedText/);
  assert.match(source, /export function localizedOption/);
});

test("admin-localization.js uses i18n-dynamic helpers instead of inline interpolate", () => {
  const page = read("src/assets/js/pages/admin-localization.js");
  assert.match(page, /from "\.\.\/core\/i18n-dynamic\.js"/);
  assert.match(page, /localizedStatus/);
  assert.match(page, /setLocalizedText/);
  assert.match(page, /localizedOption/);
  assert.doesNotMatch(page, /function interpolate/);
  assert.doesNotMatch(page, /[가-힣]/);
});
