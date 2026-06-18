import assert from "node:assert/strict";
import test from "node:test";
import path from "node:path";
import { pathToFileURL } from "node:url";

const logicPath = path.join(
  process.cwd(),
  "src/assets/js/core/realtime-inbox-toast.js",
);

function installMinimalBrowserGlobals() {
  globalThis.window = {
    localStorage: { getItem: () => null, setItem: () => {} },
    dispatchEvent: () => true,
    addEventListener: () => {},
    location: { hostname: "localhost", port: "8000", protocol: "http:" },
  };
}

async function importFresh(modulePath) {
  installMinimalBrowserGlobals();
  const url = pathToFileURL(modulePath);
  url.searchParams.set("t", String(Date.now() + Math.random()));
  return import(url.href);
}

test("buildMessagesThreadHref encodes thread_id query", async () => {
  const m = await importFresh(logicPath);
  assert.equal(m.buildMessagesThreadHref("tid-1"), "messages.html?thread_id=tid-1");
  assert.equal(m.buildMessagesThreadHref(""), "messages.html");
});

test("resolveMessageCreatedToastCopy maps CHAT SYSTEM AI", async () => {
  const m = await importFresh(logicPath);
  const chat = m.resolveMessageCreatedToastCopy({
    messageType: "CHAT",
    threadId: "t1",
  });
  assert.match(chat.title, /메시지/);
  assert.match(chat.cta, /메시지/);
  assert.equal(chat.href, "messages.html?thread_id=t1");

  const system = m.resolveMessageCreatedToastCopy({
    messageType: "SYSTEM",
    threadId: "t2",
  });
  assert.match(system.title, /안내/);
  assert.match(system.cta, /안내/);

  const ai = m.resolveMessageCreatedToastCopy({
    messageType: "AI",
    threadId: "t3",
  });
  assert.match(ai.body, /Landing Help AI/);
});

test("tryAcquireRealtimeMessageToastSlot dedupes by message_id", async () => {
  const m = await importFresh(logicPath);
  assert.equal(m.tryAcquireRealtimeMessageToastSlot("mid-1"), true);
  assert.equal(m.tryAcquireRealtimeMessageToastSlot("mid-1"), false);
  assert.equal(m.tryAcquireRealtimeMessageToastSlot("mid-2"), true);
});

test("safeToastPreviewLine truncates and rejects json blobs", async () => {
  const m = await importFresh(logicPath);
  assert.equal(m.safeToastPreviewLine("  hello   world  "), "hello world");
  const longJson = `{"amount":1200,"vin":"x","extra":"${"a".repeat(130)}"}`;
  assert.equal(m.safeToastPreviewLine(longJson), "");
});
