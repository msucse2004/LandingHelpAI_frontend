import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const FRONTEND_ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

function read(relPath) {
  return readFileSync(path.join(FRONTEND_ROOT, relPath), "utf8");
}

const REPORT_JS = read("src/assets/js/pages/message-translation-report.js");
const MESSAGES_JS = read("src/assets/js/pages/messages.js");
const API_JS = read("src/assets/js/core/api.js");

test("message translation report module uses i18n key and API", () => {
  assert.match(REPORT_JS, /messages\.actions\.report_translation/);
  assert.match(REPORT_JS, /messagesApi\.reportTranslation/);
  assert.match(REPORT_JS, /messageHasLocalizedDisplay/);
});

test("messages page renders report translation action in chat bubbles", () => {
  assert.match(MESSAGES_JS, /buildMessageTranslationReportHtml/);
  assert.match(MESSAGES_JS, /bindMessageTranslationReport/);
});

test("messages api exposes reportTranslation endpoint", () => {
  assert.match(API_JS, /report-translation/);
  assert.match(API_JS, /async reportTranslation\(/);
});

test("admin message translations api lists reported queue", () => {
  assert.match(API_JS, /listReported/);
  assert.match(API_JS, /\/api\/admin\/translations\/messages\/reported/);
});
