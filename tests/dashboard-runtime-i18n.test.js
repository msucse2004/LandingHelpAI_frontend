import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";

const FRONTEND_ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

function read(relPath) {
  return readFileSync(path.join(FRONTEND_ROOT, relPath), "utf8");
}

async function importFresh(modulePath) {
  const url = pathToFileURL(modulePath);
  url.searchParams.set("t", String(Date.now() + Math.random()));
  return await import(url.href);
}

const logicPath =
  "c:\\workspace\\LandingHelpAI\\LandingHelpAI_frontend\\src\\assets\\js\\pages\\dashboard-logic.js";

test("dashboardRuntimeResolveTouches matches dashboard, common, and nav keys", async () => {
  const {
    dashboardRuntimeResolveTouches,
    DASHBOARD_I18N_KEY_PREFIX,
    DASHBOARD_RUNTIME_I18N_PREFIXES,
  } = await importFresh(logicPath);
  assert.equal(DASHBOARD_I18N_KEY_PREFIX, "dashboard.");
  assert.deepEqual(DASHBOARD_RUNTIME_I18N_PREFIXES, ["dashboard.", "common.", "nav."]);
  assert.equal(
    dashboardRuntimeResolveTouches(["dashboard.hero.title", "common.save"]),
    true
  );
  assert.equal(dashboardRuntimeResolveTouches(["common.save"]), true);
  assert.equal(dashboardRuntimeResolveTouches(["nav.home"]), true);
  assert.equal(dashboardRuntimeResolveTouches(["auth.login.title"]), false);
  assert.equal(dashboardRuntimeResolveTouches([]), false);
});

test("dashboard.html declares data-i18n on static shell labels", () => {
  const html = read("src/pages/dashboard.html");
  assert.match(html, /data-i18n="common\.dashboard\.header\.title"/);
  assert.match(html, /data-i18n="common\.dashboard\.cases\.aria_label"/);
  assert.match(html, /data-i18n-default=/);
  assert.doesNotMatch(html, /[\uac00-\ud7af]/);
});

test("customer dashboard flushes runtime i18n after cached render", () => {
  const page = read("src/assets/js/pages/dashboard.js");
  assert.match(page, /flushRuntimeMissingKeysAfterPageApply/);
  assert.match(page, /scheduleDashboardRuntimeI18nFlush/);
  assert.match(page, /applyI18nToDom/);
  assert.match(page, /renderDashboardPageSections\(dashboardAggregate/);
});

test("service inquiries card prefers API display_* fields over canonical title", () => {
  const page = read("src/assets/js/pages/dashboard.js");
  assert.match(page, /customerCaseDisplayTitle/);
  assert.match(page, /display_title/);
  assert.match(page, /customerCaseDisplayStatusLabel/);
  assert.match(page, /display_status_label/);
  assert.match(page, /from "\.\/dashboard-logic\.js"/);
  assert.doesNotMatch(page, /t\([^)]*c\.title/);
});

test("language change refetches case list without coupling to runtime resolve", () => {
  const page = read("src/assets/js/pages/dashboard.js");
  assert.match(page, /lhai:language-changed/);
  assert.match(page, /refetchDashboardCaseItemsForLanguage/);
  assert.match(page, /dashboardViewCache\.caseItems/);
  assert.match(page, /renderCasesCompact\(/);
  assert.match(page, /dashboardLanguageCaseRefetchPending/);
  assert.match(page, /wireDynamicPageI18nRefresh\(refreshDashboardStaticPageI18n/);
  assert.match(page, /refreshDashboardStaticPageI18n/);
  assert.doesNotMatch(page, /refreshDashboardCasesForViewerLocale/);
});

test("step11 dashboard rerenders after runtime static UI resolve", () => {
  const page = read("src/assets/js/pages/dashboard.js");
  assert.match(page, /wireDynamicPageI18nRefresh\(refreshDashboardStaticPageI18n/);
  assert.match(page, /dashboardRuntimeResolveTouches/);
  assert.match(page, /renderDashboardPageSections/);
  assert.match(page, /scheduleDashboardRuntimeI18nFlush/);
});

test("step11 dashboard refetches case list on language change", () => {
  const page = read("src/assets/js/pages/dashboard.js");
  assert.match(page, /bindDashboardLanguageCaseRefetch/);
  assert.match(page, /handleDashboardLanguageChanged/);
  assert.match(page, /customerCasesApi\.list\(\)/);
  assert.match(page, /renderCasesCompact\(dashboardViewCache\.caseItems\)/);
});
