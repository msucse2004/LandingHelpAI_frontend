import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const FRONTEND_ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

function read(relPath) {
  return readFileSync(path.join(FRONTEND_ROOT, relPath), "utf8");
}

const PAGE_JS = read("src/assets/js/pages/admin-message-translations.js");
const PAGE_HTML = read("src/pages/admin-message-translations.html");
const SIDEBAR = read("src/partials/admin-sidebar.html");
const API_JS = read("src/assets/js/core/api.js");

test("admin message translations page wires search and review controls", () => {
  assert.match(PAGE_HTML, /id="lhaiMsgTransMessageId"/);
  assert.match(PAGE_HTML, /id="lhaiMsgTransThreadId"/);
  assert.match(PAGE_HTML, /id="lhaiMsgTransCustomerProfileId"/);
  assert.match(PAGE_HTML, /id="lhaiMsgTransReviewPanel"/);
  assert.match(PAGE_HTML, /id="lhaiMsgTransSaveEdit"/);
  assert.match(PAGE_HTML, /id="lhaiMsgTransApprove"/);
  assert.match(PAGE_HTML, /id="lhaiMsgTransRetry"/);
  assert.match(PAGE_HTML, /id="lhaiMsgTransViewToggle"/);
  assert.match(PAGE_HTML, /id="lhaiMsgTransDebugPanel"/);
});

test("admin message translations html uses localization.message_review i18n keys", () => {
  assert.match(PAGE_HTML, /localization\.message_review\.page_title/);
  assert.match(PAGE_HTML, /localization\.message_review\.save_edit/);
  assert.match(PAGE_HTML, /localization\.message_review\.view_original/);
});

test("admin message translations js uses admin API and message_only scope", () => {
  assert.match(PAGE_JS, /adminMessageTranslationAdminApi/);
  assert.match(PAGE_JS, /const DEFAULT_SCOPE = "message_only"/);
  assert.match(PAGE_JS, /scope: DEFAULT_SCOPE/);
  assert.match(PAGE_JS, /messagesApi\.operatorThreadMessages/);
  assert.match(PAGE_JS, /loadReportedQueue/);
  assert.match(PAGE_JS, /renderDebugPanel/);
});

test("admin message translations js uses t() for runtime strings", () => {
  assert.match(PAGE_JS, /t\("localization\.message_review\.status_saved"/);
  assert.match(PAGE_JS, /t\("localization\.message_review\.error_reason_required"/);
});

test("api exports adminMessageTranslationAdminApi with review endpoints", () => {
  assert.match(API_JS, /const adminMessageTranslationAdminApi = \{/);
  assert.match(API_JS, /\/api\/admin\/translations\/messages\/\$\{encodeURIComponent\(id\)\}/);
  assert.match(API_JS, /adminMessageTranslationAdminApi,/);
});

test("admin sidebar links to message translations page", () => {
  assert.match(SIDEBAR, /href="admin-message-translations\.html"/);
  assert.match(SIDEBAR, /common\.sidebar\.admin\.message_translations/);
});
