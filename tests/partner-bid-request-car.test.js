import test from "node:test";
import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";

async function importFresh(modulePath) {
  const url = pathToFileURL(modulePath);
  url.searchParams.set("t", String(Date.now() + Math.random()));
  return await import(url.href);
}

const logicPath =
  "c:\\workspace\\LandingHelpAI\\LandingHelpAI_frontend\\src\\assets\\js\\pages\\partner-bid-request-car-logic.js";

test("isCarPurchaseBiddingMode detects CAR_PURCHASE", async () => {
  const m = await importFresh(logicPath);
  assert.equal(m.isCarPurchaseBiddingMode("CAR_PURCHASE"), true);
  assert.equal(m.isCarPurchaseBiddingMode("GENERAL"), false);
});

test("partnerHasCarPurchaseCapability when caps unknown", async () => {
  const m = await importFresh(logicPath);
  assert.equal(m.partnerHasCarPurchaseCapability(null), true);
  assert.equal(m.partnerHasCarPurchaseCapability(["CAR_PURCHASE"]), true);
  assert.equal(m.partnerHasCarPurchaseCapability(["GENERAL"]), false);
});

test("computeOfferEstimatedTotal sums price parts", async () => {
  const m = await importFresh(logicPath);
  const total = m.computeOfferEstimatedTotal({
    vehicle_price: 25000,
    estimated_tax_fees: 1500,
    dealer_fee: 500,
    partner_service_fee: 300,
    delivery_fee: 200,
  });
  assert.equal(total, 27500);
});

test("createEmptyCarOffer sets linked index and alternative flag", async () => {
  const m = await importFresh(logicPath);
  const alt = m.createEmptyCarOffer({ linkedRequestIndex: 2, isAlternative: true });
  assert.equal(alt.linked_request_index, 2);
  assert.equal(alt.is_alternative, true);
  assert.equal(alt.offer_kind, "ALTERNATIVE");
});

test("offersFromIncludedItems parses CAR dict", async () => {
  const m = await importFresh(logicPath);
  const offers = m.offersFromIncludedItems({
    bid_type: "CAR_PURCHASE",
    offers: [{ make: "Toyota", model: "Sienna", estimated_total: 28000 }],
  });
  assert.equal(offers.length, 1);
  assert.equal(offers[0].make, "Toyota");
});

test("validateCarOffersForSubmit requires alternative_reason", async () => {
  const m = await importFresh(logicPath);
  const err = m.validateCarOffersForSubmit(
    [
      {
        make: "Honda",
        model: "Odyssey",
        estimated_total: 30000,
        available_timeline: "2주",
        is_alternative: true,
        alternative_reason: "",
      },
    ],
    { maxOffers: 3, allowAlternatives: true }
  );
  assert.match(err, /대안/);
});

test("buildCarSubmitPayload uses lowest estimated_total", async () => {
  const m = await importFresh(logicPath);
  const payload = m.buildCarSubmitPayload(
    [
      { make: "A", model: "X", estimated_total: 32000, available_timeline: "1주", currency: "USD" },
      { make: "B", model: "Y", estimated_total: 29000, available_timeline: "2주", currency: "USD" },
    ],
    "전체 메시지"
  );
  assert.equal(payload.price_amount, 29000);
  assert.equal(payload.included_items.bid_type, "CAR_PURCHASE");
  assert.equal(payload.included_items.offers.length, 2);
  assert.equal(payload.message_to_customer, "전체 메시지");
});

test("cloneOffer clears offer_id", async () => {
  const m = await importFresh(logicPath);
  const c = m.cloneOffer({ offer_id: "offer_1", make: "Ford", model: "F-150" });
  assert.equal(c.offer_id, "");
  assert.equal(c.make, "Ford");
});

test("resolvePartnerBidEditable respects expiry and request status", async () => {
  const m = await importFresh(logicPath);
  const past = new Date(Date.now() - 3600000).toISOString();
  assert.equal(
    m.resolvePartnerBidEditable({
      bidStatus: "SUBMITTED",
      expiresAt: past,
      requestStatus: "OPEN",
    }),
    false
  );
  assert.equal(
    m.resolvePartnerBidEditable({
      bidStatus: "SUBMITTED",
      expiresAt: "",
      requestStatus: "CUSTOMER_SELECTED",
    }),
    false
  );
  assert.equal(
    m.resolvePartnerBidEditable({
      bidStatus: "SELECTED",
      expiresAt: "",
      requestStatus: "OPEN",
    }),
    false
  );
});

test("validateCarOffersForSubmit enforces max offers", async () => {
  const m = await importFresh(logicPath);
  const base = {
    make: "Kia",
    model: "Carnival",
    estimated_total: 31000,
    available_timeline: "3일",
    is_alternative: false,
  };
  const err = m.validateCarOffersForSubmit([base, base, base, base], { maxOffers: 3, allowAlternatives: true });
  assert.match(err, /최대 3개/);
});
