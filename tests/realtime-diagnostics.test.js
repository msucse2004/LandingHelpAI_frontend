import assert from "node:assert/strict";
import test from "node:test";
import path from "node:path";
import { pathToFileURL } from "node:url";

const logicPath = path.join(
  process.cwd(),
  "src/assets/js/core/realtime-diagnostics.js",
);

async function importFresh(modulePath) {
  const url = pathToFileURL(modulePath);
  url.searchParams.set("t", String(Date.now() + Math.random()));
  return import(url.href);
}

test("formatRealtimeLifecycleLabel maps lifecycle states", async () => {
  const m = await importFresh(logicPath);
  assert.equal(m.formatRealtimeLifecycleLabel("connected"), "Realtime: connected");
  assert.equal(m.formatRealtimeLifecycleLabel("fallback"), "Realtime: fallback polling");
  assert.equal(m.formatRealtimeLifecycleLabel("disconnected"), "Realtime: disconnected");
});

test("summarizeRealtimeEventDetail extracts ids from SSE envelope", async () => {
  const m = await importFresh(logicPath);
  const sum = m.summarizeRealtimeEventDetail({
    type: "message.created",
    data: {
      thread_id: "t1",
      message_id: "m1",
      payload: {},
    },
  });
  assert.equal(sum.type, "message.created");
  assert.equal(sum.thread_id, "t1");
  assert.equal(sum.message_id, "m1");
});
