import assert from "node:assert/strict";
import test from "node:test";
import path from "node:path";
import { pathToFileURL } from "node:url";

const logicPath = path.join(
  process.cwd(),
  "src/assets/js/core/realtime-toast-dedupe.js",
);

async function importFresh(modulePath) {
  const url = pathToFileURL(modulePath);
  url.searchParams.set("t", String(Date.now() + Math.random()));
  return import(url.href);
}

test("toast dedupe keys format", async () => {
  const m = await importFresh(logicPath);
  assert.equal(m.toastDedupeKeyMessage("mid-1"), "message:mid-1");
  assert.equal(m.toastDedupeKeyBid("br-1", "BID_UPDATED"), "bid:br-1:BID_UPDATED");
  assert.equal(m.toastDedupeKeyAction("tid-1", "CUSTOMER_SELECTED"), "action:tid-1:CUSTOMER_SELECTED");
});

test("bidUpdatedToastAllowed blocks overlap kinds", async () => {
  const m = await importFresh(logicPath);
  assert.equal(m.bidUpdatedToastAllowed("CUSTOMER_SELECTED"), false);
  assert.equal(m.bidUpdatedToastAllowed("BIDDING_STARTED"), false);
  assert.equal(m.bidUpdatedToastAllowed("BID_UPDATED"), true);
});

test("action reserve blocks bid toast acquire", async () => {
  const m = await importFresh(logicPath);
  m.reserveMessageActionToastDedupe({
    threadId: "tid-a",
    eventCode: "customer.bidding.partner_selected",
  });
  assert.equal(
    m.tryAcquireBidUpdatedToast({
      threadId: "tid-a",
      bidRequestId: "br-1",
      eventKind: "CUSTOMER_SELECTED",
    }),
    false,
  );
  assert.equal(
    m.tryAcquireBidUpdatedToast({
      threadId: "tid-a",
      bidRequestId: "br-1",
      eventKind: "BID_UPDATED",
    }),
    true,
  );
});

test("message id dedupe is independent of action reserve", async () => {
  const m = await importFresh(logicPath);
  m.reserveMessageActionToastDedupe({
    threadId: "tid-b",
    eventCode: "intake.bidding.requests_sent",
  });
  assert.equal(
    m.tryAcquireRealtimeMessageToast({
      messageId: "msg-1",
      threadId: "tid-b",
      eventCode: "intake.bidding.requests_sent",
    }),
    true,
  );
  assert.equal(
    m.tryAcquireRealtimeMessageToast({
      messageId: "msg-1",
      threadId: "tid-b",
      eventCode: "intake.bidding.requests_sent",
    }),
    false,
  );
});
