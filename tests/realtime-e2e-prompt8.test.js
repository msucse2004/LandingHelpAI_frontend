/**
 * Prompt 8: automated checks for realtime E2E (nginx, polling, UX policy).
 * Live browser scenarios: see LandingHelpAI_backend/docs/realtime_manual_qa_e2e.md
 */

import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const nginxConfPath = path.join(process.cwd(), "nginx/default.conf");
const policyPath = path.join(process.cwd(), "src/assets/js/core/messages-realtime-policy.js");
const messagesPagePath = path.join(process.cwd(), "src/assets/js/pages/messages.js");

function installMinimalBrowserGlobals() {
  globalThis.window = {
    localStorage: { getItem: () => null, setItem: () => {} },
    dispatchEvent: () => true,
    addEventListener: () => {},
    location: { hostname: "localhost", port: "8000", protocol: "http:" },
  };
  globalThis.document = { visibilityState: "visible" };
}

async function importFresh(modulePath) {
  installMinimalBrowserGlobals();
  const url = pathToFileURL(modulePath);
  url.searchParams.set("t", String(Date.now() + Math.random()));
  return import(url.href);
}

test("Prompt8 scenario6: nginx SSE location before generic /api/", () => {
  const conf = fs.readFileSync(nginxConfPath, "utf8");
  const sseIdx = conf.indexOf("location = /api/realtime/events");
  const apiIdx = conf.indexOf("location /api/");
  assert.ok(sseIdx >= 0, "missing SSE exact location");
  assert.ok(apiIdx >= 0, "missing /api/ location");
  assert.ok(sseIdx < apiIdx, "SSE location must precede /api/");
  assert.match(conf, /proxy_buffering off/);
  assert.match(conf, /proxy_read_timeout 3600s/);
  assert.match(conf, /X-Accel-Buffering "no"/);
  assert.match(
    conf,
    /proxy_pass http:\/\/backend:8000\/api\/realtime\/events/,
  );
});

test("Prompt8 scenario5: safety sync default 12s (was 45s)", async () => {
  const m = await importFresh(policyPath);
  assert.equal(m.messagesSafetyPollIntervalMs(), 12_000);
  assert.ok(m.messagesSafetyPollIntervalMs() <= 15_000);
});

test("Prompt8 scenario5: safety sync only when visible + thread selected", async () => {
  const m = await importFresh(policyPath);
  assert.equal(
    m.canRunMessagesSafetySyncTick({ documentVisible: false, selectedThreadId: "t1" }),
    false,
  );
  assert.equal(
    m.canRunMessagesSafetySyncTick({ documentVisible: true, selectedThreadId: "t1" }),
    true,
  );
});

test("Prompt8 scenario1/3: same-thread plan refreshes detail not list-only", async () => {
  const m = await importFresh(policyPath);
  const plan = m.planMessageCreatedMessagesPageAction({
    selectedThreadId: "t1",
    eventThreadId: "t1",
  });
  assert.equal(plan.sameThread, true);
  assert.equal(plan.refreshThreadMessages, true);
  assert.equal(plan.refreshListOnly, false);
  assert.equal(plan.showPageToast, false);
});

test("Prompt8 scenario4: dashboard toast href includes thread_id", async () => {
  const toastPath = path.join(process.cwd(), "src/assets/js/core/realtime-inbox-toast.js");
  const m = await importFresh(toastPath);
  assert.equal(m.buildMessagesThreadHref("tid-abc"), "messages.html?thread_id=tid-abc");
});

test("Prompt8 scenario7: messages.js defers list sync after bubbles (skipInlineListBadgeSync)", () => {
  const src = fs.readFileSync(messagesPagePath, "utf8");
  assert.match(src, /skipInlineListBadgeSync/);
  assert.match(src, /scheduleMessageCreatedListHeaderSync/);
  assert.match(src, /dispatchHeaderOnMarkRead: false/);
  assert.match(src, /message\.created-retry-800/);
  assert.match(src, /message\.created-retry-2000/);
});

test("Prompt8 scenario3/5: refreshSource safety-sync and sse in messages page", () => {
  const src = fs.readFileSync(messagesPagePath, "utf8");
  assert.match(src, /refreshSource: "sse"/);
  assert.match(src, /refreshSource: "safety-sync"/);
  assert.match(src, /reason: "safety-sync"/);
});
