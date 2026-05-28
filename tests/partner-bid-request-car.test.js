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

test("resolveCarPurchaseMode checks service.bidding_mode", async () => {
  const m = await importFresh(logicPath);
  assert.equal(m.resolveCarPurchaseMode({ bidding_mode: "CAR_PURCHASE" }), true);
  assert.equal(m.resolveCarPurchaseMode({ service: { bidding_mode: "CAR_PURCHASE" } }), true);
  assert.equal(m.resolveCarPurchaseMode({ bidding_mode: "GENERAL" }), false);
});

test("resolveCarPurchaseMode uses bidding_config and car_purchase_config", async () => {
  const m = await importFresh(logicPath);
  assert.equal(
    m.resolveCarPurchaseMode({ bidding_mode: "GENERAL", bidding_config: { mode: "CAR_PURCHASE" } }),
    true,
  );
  assert.equal(
    m.resolveCarPurchaseMode({
      bidding_mode: "GENERAL",
      car_purchase_config: { allow_alternative_vehicle_offers: true },
    }),
    true,
  );
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

test("resolveDefaultLinkedRequestIndex uses first vehicle request or 1", async () => {
  const m = await importFresh(logicPath);
  assert.equal(m.resolveDefaultLinkedRequestIndex([]), 1);
  assert.equal(
    m.resolveDefaultLinkedRequestIndex([{ request_index: 2 }, { request_index: 3 }]),
    2,
  );
});

test("withLinkedRequestIndex fills missing linked_request_index", async () => {
  const m = await importFresh(logicPath);
  const out = m.withLinkedRequestIndex({ make: "BMW" }, [{ request_index: 1, make: "BMW" }]);
  assert.equal(out.linked_request_index, 1);
  assert.equal(out.make, "BMW");
});

test("buildCarSubmitPayload includes linked_request_index on offers", async () => {
  const m = await importFresh(logicPath);
  const payload = m.buildCarSubmitPayload(
    [
      {
        make: "BMW",
        model: "X3",
        year: 2024,
        mileage: 100,
        estimated_total: 45000,
        available_timeline: "2 weeks",
      },
    ],
    "",
    [],
  );
  const row = payload.included_items.offers[0];
  assert.equal(row.linked_request_index, 1);
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

test("offersFromIncludedItems hydrates PRODUCT_OFFER vehicle attributes", async () => {
  const m = await importFresh(logicPath);
  const offers = m.offersFromIncludedItems({
    bid_type: "PRODUCT_OFFER",
    product_category: "vehicle",
    offers: [
      {
        title: "2021 Toyota Camry SE",
        estimated_total: "30099",
        attributes: {
          year: 2021,
          make: "Toyota",
          model: "Camry",
          trim: "SE",
          mileage: 42000,
          vehicle_price: 27800,
        },
      },
    ],
  });
  assert.equal(offers.length, 1);
  assert.equal(offers[0].year, 2021);
  assert.equal(offers[0].trim, "SE");
  assert.equal(offers[0].mileage, 42000);
  assert.equal(offers[0].vehicle_price, 27800);
});

test("validateCarOffersForSubmit requires alternative_reason", async () => {
  const m = await importFresh(logicPath);
  const err = m.validateCarOffersForSubmit(
    [
      {
        year: 2020,
        make: "Honda",
        model: "Odyssey",
        mileage: 12000,
        estimated_total: 30000,
        available_timeline: "2주",
        is_alternative: true,
        alternative_reason: "",
      },
    ],
    { allowAlternatives: true }
  );
  assert.match(err, /대안/);
});

test("buildCarSubmitPayload uses lowest estimated_total", async () => {
  const m = await importFresh(logicPath);
  const payload = m.buildCarSubmitPayload(
    [
      {
        year: 2019,
        make: "A",
        model: "X",
        mileage: 10000,
        estimated_total: 32000,
        available_timeline: "1주",
        currency: "USD",
      },
      {
        year: 2020,
        make: "B",
        model: "Y",
        mileage: 8000,
        estimated_total: 29000,
        available_timeline: "2주",
        currency: "USD",
      },
    ],
    "전체 메시지"
  );
  assert.equal(payload.price_amount, 29000);
  assert.equal(payload.included_items.bid_type, "PRODUCT_OFFER");
  assert.equal(payload.included_items.product_category, "vehicle");
  assert.equal(payload.included_items.offers.length, 2);
  assert.equal(payload.included_items.offers[0].product_category, "vehicle");
  assert.equal(payload.included_items.offers[0].title, "2019 A X");
  assert.equal(payload.included_items.offers[0].attributes.make, "A");
  assert.equal(payload.message_to_customer, "전체 메시지");
});

test("normalizeVehiclePhotosForSubmit puts primary photo first", async () => {
  const m = await importFresh(logicPath);
  const out = m.normalizeVehiclePhotosForSubmit(
    [
      { url: "https://a/1.jpg", is_primary: false },
      { url: "https://a/2.jpg", is_primary: true, asset_id: "bid_offer_photo_x" },
    ],
    0,
  );
  assert.equal(out.length, 2);
  assert.equal(out[0].url, "https://a/2.jpg");
  assert.equal(out[0].is_primary, true);
  assert.equal(out[0].asset_id, "bid_offer_photo_x");
});

test("validateCarOffersForSubmit blocks uploads in progress", async () => {
  const m = await importFresh(logicPath);
  const err = m.validateCarOffersForSubmit(
    [
      {
        year: 2020,
        make: "Honda",
        model: "Civic",
        mileage: 1000,
        estimated_total: 20000,
        available_timeline: "now",
        photos: [{ url: "https://x/y.jpg" }],
      },
    ],
    { allowAlternatives: true, uploadsInProgress: true },
  );
  assert.match(err, /업로드/);
});

test("buildAutoOfferTitle joins year make model trim", async () => {
  const m = await importFresh(logicPath);
  assert.equal(
    m.buildAutoOfferTitle({ year: 2021, make: "Toyota", model: "Camry", trim: "SE" }),
    "2021 Toyota Camry SE"
  );
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

test("validateCarOffersForSubmit accepts many offers", async () => {
  const m = await importFresh(logicPath);
  const base = {
    year: 2022,
    make: "Kia",
    model: "Carnival",
    mileage: 5000,
    estimated_total: 31000,
    available_timeline: "3일",
    is_alternative: false,
  };
  const err = m.validateCarOffersForSubmit([base, base, base, base], { allowAlternatives: true });
  assert.ok(!err);
});

test("resolveCarPurchaseBudgetMax falls back to vehicle_requests", async () => {
  const m = await importFresh(logicPath);
  assert.equal(
    m.resolveCarPurchaseBudgetMax({
      vehicle_requests: [{ budget_max: 30000 }, { budget_max: 35000 }],
    }),
    35000,
  );
});

test("resolveCarDesiredTimeline formats vehicle-level timeline", async () => {
  const m = await importFresh(logicPath);
  assert.equal(
    m.resolveCarDesiredTimeline({ vehicle_requests: [{ desired_timeline: "2_weeks" }] }),
    "2주 이내",
  );
});
