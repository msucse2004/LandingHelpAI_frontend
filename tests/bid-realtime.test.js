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

test("bidUpdatedMatchesScope filters partner bid_request_id", async () => {
  const m = await importFresh(logicPath);
  assert.equal(
    m.bidUpdatedMatchesScope(
      { bid_request_id: "br-1", thread_id: "t1" },
      { bidRequestId: "br-1" },
    ),
    true,
  );
  assert.equal(
    m.bidUpdatedMatchesScope(
      { bid_request_id: "br-2", cancelled_bid_request_id: "br-1", thread_id: "t1" },
      { bidRequestId: "br-1" },
    ),
    true,
  );
  assert.equal(
    m.bidUpdatedMatchesScope(
      { bid_request_id: "br-2", thread_id: "t1" },
      { bidRequestId: "br-1" },
    ),
    false,
  );
});

test("isBiddingBidUpdatedPayload requires bid or thread id", async () => {
  const m = await importFresh(logicPath);
  assert.equal(m.isBiddingBidUpdatedPayload({ bid_request_id: "x" }), true);
  assert.equal(m.isBiddingBidUpdatedPayload({ thread_id: "t" }), true);
  assert.equal(m.isBiddingBidUpdatedPayload({ update_kind: "X" }), false);
});
