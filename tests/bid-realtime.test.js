import assert from "node:assert/strict";
import test from "node:test";
import path from "node:path";
import { pathToFileURL } from "node:url";

const logicPath = path.join(
  process.cwd(),
  "src/assets/js/core/bid-realtime.js",
);

async function importFresh(modulePath) {
  const url = pathToFileURL(modulePath);
  url.searchParams.set("t", String(Date.now() + Math.random()));
  return import(url.href);
}

test("normalizeBidUpdatedPayload merges SSE envelope and nested payload", async () => {
  const m = await importFresh(logicPath);
  const p = m.normalizeBidUpdatedPayload({
    type: "bid.updated",
    data: {
      thread_id: "tid-1",
      payload: {
        bid_request_id: "br-1",
        service_type: "CAR_PURCHASE",
        update_kind: "UPDATED",
        workflow_instance_id: "wid-1",
      },
    },
  });
  assert.equal(p.thread_id, "tid-1");
  assert.equal(p.bid_request_id, "br-1");
  assert.equal(p.service_type, "CAR_PURCHASE");
  assert.equal(p.update_kind, "UPDATED");
  assert.equal(p.service_request_id, "wid-1");
});

test("buildCustomerBidResultsHref encodes query", async () => {
  const m = await importFresh(logicPath);
  const href = m.buildCustomerBidResultsHref("wid", "tid");
  assert.match(href, /service_request_id=wid/);
  assert.match(href, /thread_id=tid/);
});
