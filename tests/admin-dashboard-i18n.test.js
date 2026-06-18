import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const FRONTEND_ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

function read(relPath) {
  return readFileSync(path.join(FRONTEND_ROOT, relPath), "utf8");
}

test("admin dashboard HTML binds main content to common.admin_dashboard i18n keys", () => {
  const html = read("src/pages/admin-dashboard.html");
  assert.match(html, /data-i18n="common\.admin_dashboard\.title"/);
  assert.match(html, /data-i18n="common\.admin_dashboard\.quick_links_title"/);
  assert.match(html, /data-i18n="common\.admin_dashboard\.survey_review_title"/);
  assert.match(html, /data-i18n-default="Admin dashboard"/);
});

test("admin localization HTML uses localization.* key convention", () => {
  const html = read("src/pages/admin-localization.html");
  assert.match(html, /data-i18n="localization\.page\.title"/);
  assert.match(html, /data-i18n="localization\.filters\.title"/);
  assert.match(html, /data-i18n="localization\.actions\.refresh"/);
  assert.match(html, /data-lhai-i18n-domains="common,nav,localization"/);
  assert.doesNotMatch(html, /common\.admin_translation_table/);
});

test("i18n boot guards against stale async apply after language switch", () => {
  const client = read("src/assets/js/core/i18n-client.js");
  const dom = read("src/assets/js/core/i18n-dom.js");
  assert.match(client, /captureI18nApplyGeneration/);
  assert.match(client, /isI18nApplyGenerationCurrent/);
  assert.match(dom, /captureI18nApplyGeneration/);
  assert.match(dom, /isI18nApplyGenerationCurrent\(applyGeneration\)/);
});

test("sidebar load does not refetch i18n bundles and refreshes main on language change", () => {
  const sidebar = read("src/assets/js/components/sidebar.js");
  assert.doesNotMatch(sidebar, /initI18nDomains\(\["common", "nav"\]/);
  assert.match(sidebar, /applyI18nToDom\(main\)/);
});

test("admin dashboard JS re-applies main i18n and localizes survey review status", () => {
  const page = read("src/assets/js/pages/admin-dashboard.js");
  assert.match(page, /applyI18nToDom\(main\)/);
  assert.match(page, /default_status_label/);
  assert.match(page, /관리자 검토 대기/);
});
