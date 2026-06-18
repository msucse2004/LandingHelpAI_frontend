/**
 * Prompt 10 — messages / toast realtime frontend contract (Node unit tests).
 */
import assert from "node:assert/strict";
import test from "node:test";
import path from "node:path";
import { pathToFileURL } from "node:url";

const jsRoot = path.join(process.cwd(), "src/assets/js");

async function importFresh(modulePath) {
  const url = pathToFileURL(path.join(jsRoot, modulePath));
  url.searchParams.set("t", String(Date.now() + Math.random()));
  return import(url.href);
}

const THREAD_ID = "11111111-1111-1111-1111-111111111111";

function installMinimalBrowserGlobals() {
  globalThis.window = {
    localStorage: { getItem: () => null, setItem: () => {} },
    dispatchEvent: () => true,
    addEventListener: () => {},
    location: { hostname: "localhost", port: "8000", protocol: "http:" },
  };
  globalThis.document = {
    visibilityState: "visible",
    querySelector: () => null,
    body: { appendChild: () => {} },
  };
}

test.before(() => {
  installMinimalBrowserGlobals();
});

// --- 1–2. messages page message.created plan ------------------------------------

test("messages page same thread: refresh stream, no toast", async () => {
  const m = await importFresh("core/messages-realtime-policy.js");
  const plan = m.planMessageCreatedMessagesPageAction({
    selectedThreadId: THREAD_ID,
    eventThreadId: THREAD_ID,
  });
  assert.equal(plan.sameThread, true);
  assert.equal(plan.refreshThreadMessages, true);
  assert.equal(plan.refreshListOnly, false);
  assert.equal(plan.preserveCurrentThreadContent, false);
  assert.equal(plan.showPageToast, false);
});

test("messages page different thread: list refresh only, preserve content", async () => {
  const m = await importFresh("core/messages-realtime-policy.js");
  const plan = m.planMessageCreatedMessagesPageAction({
    selectedThreadId: THREAD_ID,
    eventThreadId: "22222222-2222-2222-2222-222222222222",
  });
  assert.equal(plan.sameThread, false);
  assert.equal(plan.refreshThreadMessages, false);
  assert.equal(plan.refreshListOnly, true);
  assert.equal(plan.preserveCurrentThreadContent, true);
  assert.equal(plan.showPageToast, false);
});

// --- 3–4. non-messages header toast copy ----------------------------------------

test("non-messages CHAT toast copy and deep link", async () => {
  const inbox = await importFresh("core/realtime-inbox-toast.js");
  const copy = inbox.resolveMessageCreatedToastCopy({
    messageType: "CHAT",
    threadId: THREAD_ID,
  });
  assert.match(copy.title, /새 메시지가 도착했습니다/);
  assert.match(copy.cta, /메시지/);
  assert.equal(copy.href, `messages.html?thread_id=${encodeURIComponent(THREAD_ID)}`);
});

test("non-messages SYSTEM toast copy and deep link", async () => {
  const inbox = await importFresh("core/realtime-inbox-toast.js");
  const copy = inbox.resolveMessageCreatedToastCopy({
    messageType: "SYSTEM",
    threadId: THREAD_ID,
  });
  assert.match(copy.title, /새 안내가 도착했습니다/);
  assert.match(copy.cta, /안내/);
  assert.equal(copy.href, `messages.html?thread_id=${encodeURIComponent(THREAD_ID)}`);
});

test("non-messages page allows header message toast", async () => {
  const policy = await importFresh("core/header-realtime-toast-policy.js");
  const d = policy.evaluateHeaderMessageToastDecision({
    isMessagesPage: false,
    isCustomerBidResultsPage: false,
    documentVisible: true,
    isOwnActor: false,
  });
  assert.equal(d.show, true);
  assert.equal(d.suppressReason, null);
});

test("header suppresses toast on messages page", async () => {
  const policy = await importFresh("core/header-realtime-toast-policy.js");
  const d = policy.evaluateHeaderMessageToastDecision({
    isMessagesPage: true,
    documentVisible: true,
    isOwnActor: false,
  });
  assert.equal(d.show, false);
  assert.equal(d.suppressReason, "messages_page");
});

// --- 5. bid.updated on dedicated pages ------------------------------------------

test("dashboard and bid-results suppress header bid toast", async () => {
  const policy = await importFresh("core/header-realtime-toast-policy.js");
  for (const ctx of [
    { isCustomerDashboardPage: true, isCustomerRole: true },
    { isCustomerBidResultsPage: true, isCustomerRole: true },
    { isMessagesPage: true, isCustomerRole: true },
  ]) {
    const d = policy.evaluateHeaderBidToastDecision({
      ...ctx,
      documentVisible: true,
      eventKind: "BID_UPDATED",
    });
    assert.equal(d.show, false);
    assert.ok(d.suppressReason);
  }
});

// --- 6. selection: one user-facing toast ----------------------------------------

test("customer selection: message toast wins over bid toast", async () => {
  const dedupe = await importFresh("core/realtime-toast-dedupe.js");
  const policy = await importFresh("core/header-realtime-toast-policy.js");

  dedupe.reserveMessageActionToastDedupe({
    threadId: THREAD_ID,
    eventCode: "customer.bidding.partner_selected",
  });
  const messageAcquire = dedupe.tryAcquireRealtimeMessageToast({
    messageId: "msg-sel-1",
    threadId: THREAD_ID,
    eventCode: "customer.bidding.partner_selected",
  });
  const bidAcquire = dedupe.tryAcquireBidUpdatedToast({
    threadId: THREAD_ID,
    bidRequestId: "br-1",
    eventKind: "CUSTOMER_SELECTED",
  });
  const bidHeader = policy.evaluateHeaderBidToastDecision({
    isCustomerRole: true,
    documentVisible: true,
    eventKind: "CUSTOMER_SELECTED",
  });
  const counts = policy.countUserFacingToastsForSelectionEvent({
    messageToastShown: messageAcquire,
    bidToastAcquireOk: bidAcquire && bidHeader.show,
    eventKind: "CUSTOMER_SELECTED",
  });
  assert.equal(messageAcquire, true);
  assert.equal(bidAcquire, false);
  assert.equal(bidHeader.show, false);
  assert.equal(counts.userFacingToastCount, 1);
  assert.equal(counts.primary, "message");
});

// --- 7. duplicate message_id ----------------------------------------------------

test("duplicate message.created: one toast slot and one handled claim", async () => {
  const dedupe = await importFresh("core/realtime-toast-dedupe.js");
  const pageDedupe = await importFresh("core/messages-realtime-dedupe.js");

  pageDedupe.resetMessagesRealtimeDedupeForTests();

  assert.equal(
    dedupe.tryAcquireRealtimeMessageToast({ messageId: "dup-1", threadId: THREAD_ID }),
    true,
  );
  assert.equal(
    dedupe.tryAcquireRealtimeMessageToast({ messageId: "dup-1", threadId: THREAD_ID }),
    false,
  );

  assert.equal(pageDedupe.claimMessageCreatedRealtimeEvent("dup-2"), true);
  assert.equal(pageDedupe.claimMessageCreatedRealtimeEvent("dup-2"), false);
  pageDedupe.releaseMessageCreatedRealtimeEvent("dup-2", true);
  assert.equal(pageDedupe.wasMessageCreatedRealtimeHandled("dup-2"), true);
  assert.equal(pageDedupe.claimMessageCreatedRealtimeEvent("dup-2"), false);
});

// --- 8. SSE disconnected fallback polling ---------------------------------------

test("safety poll interval defaults to 12s when SSE connected", async () => {
  const m = await importFresh("core/messages-realtime-policy.js");
  assert.equal(m.messagesSafetyPollIntervalMs(), 12_000);
  assert.equal(m.MESSAGES_SAFETY_SYNC_MS_DEFAULT, 12_000);
  assert.ok(m.MESSAGES_SAFETY_SYNC_MS_DEFAULT <= 15_000);
});

test("safety poll interval override via localStorage or window", async () => {
  const store = {};
  globalThis.window = {
    localStorage: {
      getItem: (k) => (k in store ? store[k] : null),
      setItem: (k, v) => {
        store[k] = String(v);
      },
      removeItem: (k) => {
        delete store[k];
      },
    },
  };
  const m = await importFresh("core/messages-realtime-policy.js");
  window.localStorage.setItem("LHAI_MESSAGES_SAFETY_SYNC_MS", "15000");
  assert.equal(m.messagesSafetyPollIntervalMs(), 15_000);
  delete store["LHAI_MESSAGES_SAFETY_SYNC_MS"];
  window.LHAI_MESSAGES_SAFETY_SYNC_MS = 14_000;
  assert.equal(m.messagesSafetyPollIntervalMs(), 14_000);
  delete window.LHAI_MESSAGES_SAFETY_SYNC_MS;
});

test("canRunMessagesSafetySyncTick requires visible tab and selected thread", async () => {
  const m = await importFresh("core/messages-realtime-policy.js");
  assert.equal(m.canRunMessagesSafetySyncTick({ documentVisible: false, selectedThreadId: "t1" }), false);
  assert.equal(m.canRunMessagesSafetySyncTick({ documentVisible: true, selectedThreadId: "" }), false);
  assert.equal(m.canRunMessagesSafetySyncTick({ documentVisible: true, selectedThreadId: "t1" }), true);
});

test("polling interval debug snapshot exposes fallback and safety ms", async () => {
  const lat = await importFresh("core/realtime-message-latency.js");
  const snap = lat.getMessagesPollingIntervalsForDebug();
  assert.equal(snap.fallback_poll_ms_fallback, 8_000);
  assert.equal(snap.safety_sync_ms_connected, 12_000);
});

test("fallback polling enabled when SSE disconnected and tab visible", async () => {
  const m = await importFresh("core/messages-realtime-policy.js");
  assert.equal(
    m.shouldRunMessagesFallbackPoll({ lifecycle: "connected" }, { documentVisible: true }),
    false,
  );
  assert.equal(
    m.shouldRunMessagesFallbackPoll({ lifecycle: "fallback" }, { documentVisible: true }),
    true,
  );
  assert.equal(
    m.shouldRunMessagesFallbackPoll({ lifecycle: "disconnected" }, { documentVisible: true }),
    true,
  );
  assert.equal(
    m.shouldRunMessagesFallbackPoll({ lifecycle: "fallback" }, { documentVisible: false }),
    false,
  );
  assert.equal(m.messagesFallbackPollIntervalMs({ lifecycle: "fallback" }), 8_000);
  assert.equal(m.messagesFallbackPollIntervalMs({ lifecycle: "disconnected" }), 10_000);
});

test("realtime-client lifecycle derives connected vs fallback", async () => {
  const client = await importFresh("core/realtime-client.js");
  const st = client.getRealtimeStatus();
  assert.ok(["connected", "connecting", "fallback", "disconnected"].includes(st.lifecycle));
});

test("bid-realtime toast gate blocks CUSTOMER_SELECTED", async () => {
  const bid = await importFresh("core/bid-realtime.js");
  assert.equal(bid.bidUpdatedToastAllowed("CUSTOMER_SELECTED"), false);
  assert.equal(bid.bidUpdatedToastAllowed("BID_UPDATED"), true);
});
