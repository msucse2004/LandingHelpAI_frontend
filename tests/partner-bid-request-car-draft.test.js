import test from "node:test";
import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";

async function importFresh(modulePath) {
  const url = pathToFileURL(modulePath);
  url.searchParams.set("t", String(Date.now() + Math.random()));
  return await import(url.href);
}

const draftPath =
  "c:\\workspace\\LandingHelpAI\\LandingHelpAI_frontend\\src\\assets\\js\\pages\\partner-bid-request-car-draft.js";

test("partner car offer draft persists per bid_request_id", async () => {
  const m = await importFresh(draftPath);
  const bidId = "bid-test-1";
  assert.equal(m.isPartnerCarOfferDraftDirty(bidId), false);

  m.savePartnerCarOfferDraft(bidId, {
    offers: [{ make: "Toyota", model: "Camry" }],
    activeIdx: 0,
    globalMessage: "hello",
    dirty: true,
  });
  assert.equal(m.isPartnerCarOfferDraftDirty(bidId), true);

  const loaded = m.loadPartnerCarOfferDraft(bidId);
  assert.ok(loaded);
  assert.equal(loaded.offers[0].make, "Toyota");
  assert.equal(loaded.globalMessage, "hello");

  m.clearPartnerCarOfferDraft(bidId);
  assert.equal(m.isPartnerCarOfferDraftDirty(bidId), false);
  assert.equal(m.loadPartnerCarOfferDraft(bidId), null);
});

test("partner car offer draft clones nested offers", async () => {
  const m = await importFresh(draftPath);
  const bidId = "bid-test-2";
  m.savePartnerCarOfferDraft(bidId, {
    offers: [{ make: "Honda", photos: [{ url: "https://x.test/a.jpg" }] }],
    activeIdx: 0,
    dirty: true,
  });
  const loaded = m.loadPartnerCarOfferDraft(bidId);
  loaded.offers[0].make = "Changed";
  const again = m.loadPartnerCarOfferDraft(bidId);
  assert.equal(again.offers[0].make, "Honda");
  m.clearPartnerCarOfferDraft(bidId);
});
