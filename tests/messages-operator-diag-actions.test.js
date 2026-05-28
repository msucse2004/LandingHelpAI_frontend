import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const dir = dirname(fileURLToPath(import.meta.url));
const messagesJs = readFileSync(
  join(dir, "../src/assets/js/pages/messages.js"),
  "utf8"
);

test("operator messages inbox wires diag buttons via delegated data-lhai-action", () => {
  assert.ok(messagesJs.includes('data-lhai-action="load-intake-dispatch-diag"'));
  assert.ok(messagesJs.includes('data-lhai-action="load-bidding-email-diag"'));
  assert.ok(messagesJs.includes("closest(\"[data-lhai-action='load-bidding-email-diag']\")"));
  assert.ok(messagesJs.includes("refreshBiddingNotificationDebugPanel(selectedThreadId, { fromUser: true })"));
  assert.ok(messagesJs.includes("이메일 진단 불러오기"));
});
