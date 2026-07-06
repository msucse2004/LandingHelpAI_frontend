import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const FRONTEND_ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const CONTENT_JS = readFileSync(
  path.join(FRONTEND_ROOT, "src/assets/js/pages/partner-messages-content.js"),
  "utf8"
);

test("messages inbox static shell uses i18n keys for filters and panel titles", () => {
  assert.match(CONTENT_JS, /data-i18n="messages\.filters\.category_label"/);
  assert.match(CONTENT_JS, /data-i18n="messages\.filters\.all"/);
  assert.match(CONTENT_JS, /data-i18n="messages\.filters\.unread_only"/);
  assert.match(CONTENT_JS, /data-i18n="messages\.list\.panel_title"/);
  assert.match(CONTENT_JS, /data-i18n="messages\.list\.hint"/);
  assert.match(CONTENT_JS, /data-i18n="messages\.detail\.panel_title"/);
  assert.match(CONTENT_JS, /data-i18n="messages\.detail\.select_thread"/);
  assert.match(CONTENT_JS, /subtitleI18nKey: partner \? "messages\.page\.subtitle\.partner"/);
  assert.doesNotMatch(CONTENT_JS, /구분|대화 목록|읽지 않/);
});
