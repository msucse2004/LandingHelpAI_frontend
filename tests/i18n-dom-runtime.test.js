import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const FRONTEND_ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

function read(relPath) {
  return readFileSync(path.join(FRONTEND_ROOT, relPath), "utf8");
}

test("i18n-dom wires runtime resolved listener and dynamic refresh", () => {
  const dom = read("src/assets/js/core/i18n-dom.js");
  assert.match(dom, /ensureRuntimeI18nDomListener/);
  assert.match(dom, /lhai:i18n-runtime-resolved/);
  assert.match(dom, /applyI18nToDom\(root\)/);
  assert.match(dom, /wireDynamicPageI18nRefresh[\s\S]*lhai:i18n-runtime-resolved/);
  assert.match(dom, /lhai:language-changed/);
});

test("app and public page boots install runtime i18n DOM listener", () => {
  const appBoot = read("src/assets/js/core/app-page-i18n-boot.js");
  const publicBoot = read("src/assets/js/core/public-page-language-boot.js");
  assert.match(appBoot, /ensureRuntimeI18nDomListener\(\)/);
  assert.match(publicBoot, /ensureRuntimeI18nDomListener\(\)/);
});

test("runtime DOM listener re-applies without re-fetching language bundles", () => {
  const dom = read("src/assets/js/core/i18n-dom.js");
  const listenerBlock = dom.slice(dom.indexOf("ensureRuntimeI18nDomListener"));
  assert.doesNotMatch(listenerBlock.slice(0, 600), /reloadI18nForLanguage/);
  assert.doesNotMatch(listenerBlock.slice(0, 600), /initI18nDomains/);
});

test("wireDynamicPageI18nRefresh supports keyPrefix filter for runtime resolve", () => {
  const dom = read("src/assets/js/core/i18n-dom.js");
  assert.match(dom, /keyPrefix/);
  assert.match(dom, /keyPrefixes/);
  assert.match(dom, /shouldRefresh/);
  assert.match(dom, /wireDynamicPageI18nRefresh\._entries/);
  assert.match(dom, /wireDynamicPageI18nRefresh\._listenersInstalled/);
});

test("customer dashboard wires runtime i18n refresh from cached view state", () => {
  const page = read("src/assets/js/pages/dashboard.js");
  const logic = read("src/assets/js/pages/dashboard-logic.js");
  assert.match(page, /wireDynamicPageI18nRefresh\(refreshDashboardPageI18n/);
  assert.match(page, /dashboardRuntimeResolveTouches/);
  assert.match(page, /dashboardViewCache/);
  assert.match(page, /renderDashboardPageSections\(aggregate/);
  assert.match(page, /refreshDashboardPageI18n\(\)/);
  assert.match(page, /flushRuntimeMissingKeysAfterPageApply/);
  assert.match(page, /scheduleDashboardRuntimeI18nFlush/);
  assert.match(page, /applyI18nToDom/);
  assert.match(logic, /export function localizeDashboardStatusText/);
  assert.match(logic, /export function localizeTimelineStepTitle/);
  assert.match(logic, /export function localizeCaseQueueStatus/);
});
