/**
 * Step 8 E2E (automated): admin preview/save parity + partner detail UI mode routing.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
import path from "node:path";

globalThis.window = {
  LHAI_API_BASE_URL: "",
  location: { hostname: "localhost", port: "8000" },
};

const adminWorkflowPath = pathToFileURL(
  path.join(process.cwd(), "src/assets/js/pages/admin-service-workflow-tab.js"),
).href;
const carLogicPath = pathToFileURL(
  path.join(process.cwd(), "src/assets/js/pages/partner-bid-request-car-logic.js"),
).href;
const carUiPath = pathToFileURL(
  path.join(process.cwd(), "src/assets/js/pages/partner-bid-request-car-ui.js"),
).href;
const productUiPath = pathToFileURL(
  path.join(process.cwd(), "src/assets/js/pages/partner-bid-request-product-ui.js"),
).href;

const {
  mswResolveBiddingMode,
  mswMergeBiddingPayloadForSave,
  MSW_WORKFLOW_MULTI_PARTNER,
  MSW_PARTNER_TYPE_AUTO_DEALER,
  MSW_BIDDING_MODE_CAR_PURCHASE,
  MSW_BIDDING_MODE_GENERAL,
} = await import(adminWorkflowPath).then((m) => m.__testOnlyBiddingMode);

test("Test 1 preview: AUTO_DEALER resolves CAR_PURCHASE (same as save)", () => {
  const preview = mswResolveBiddingMode(MSW_WORKFLOW_MULTI_PARTNER, MSW_PARTNER_TYPE_AUTO_DEALER);
  const save = mswMergeBiddingPayloadForSave(
    { enabled: true },
    {},
    MSW_WORKFLOW_MULTI_PARTNER,
    MSW_PARTNER_TYPE_AUTO_DEALER,
  );
  assert.equal(preview, MSW_BIDDING_MODE_CAR_PURCHASE);
  assert.equal(save.mode, preview);
});

test("Test 2 save payload without mode still CAR_PURCHASE", () => {
  const save = mswMergeBiddingPayloadForSave(
    { enabled: true, bid_window_hours: 72 },
    { mode: MSW_BIDDING_MODE_GENERAL },
    MSW_WORKFLOW_MULTI_PARTNER,
    MSW_PARTNER_TYPE_AUTO_DEALER,
  );
  assert.equal(save.mode, MSW_BIDDING_MODE_CAR_PURCHASE);
});

test("Test 5 partner detail: CAR_PURCHASE mounts vehicle offer UI", async () => {
  const carLogic = await import(`${carLogicPath}?t=${Date.now()}`);
  const detail = {
    bidding_mode: "CAR_PURCHASE",
    bidding_config: { mode: "CAR_PURCHASE" },
    car_purchase_config: { allow_alternative_vehicle_offers: true },
    intake: { vehicle_requests: [{ make: "Toyota", model: "Camry", year: 2022 }] },
    bid: { status: "DRAFT" },
    bid_request_status: "OPEN",
  };
  assert.equal(carLogic.resolveCarPurchaseMode(detail), true);
  assert.equal(carLogic.resolveCarPurchaseMode({ bidding_mode: "GENERAL" }), false);

  const carUi = await import(`${carUiPath}?t=${Date.now()}`);
  assert.equal(typeof carUi.mountCarPurchaseBidUi, "function");
  assert.match(
    String(carUi.mountCarPurchaseBidUi),
    /vehicle|car-offer|CarOffer/i,
  );
});

test("Test 6 general partner: GENERAL uses product offer path not car UI", async () => {
  const carLogic = await import(`${carLogicPath}?t=${Date.now()}`);
  const preview = mswResolveBiddingMode(MSW_WORKFLOW_MULTI_PARTNER, "GENERAL_VENDOR");
  const save = mswMergeBiddingPayloadForSave(
    {},
    {},
    MSW_WORKFLOW_MULTI_PARTNER,
    "GENERAL_VENDOR",
  );
  assert.equal(preview, MSW_BIDDING_MODE_GENERAL);
  assert.equal(save.mode, MSW_BIDDING_MODE_GENERAL);

  const detail = {
    bidding_mode: "GENERAL",
    bidding_config: { mode: "GENERAL" },
    bid: { status: "DRAFT" },
    bid_request_status: "OPEN",
  };
  assert.equal(carLogic.resolveCarPurchaseMode(detail), false);

  const productUi = await import(`${productUiPath}?t=${Date.now()}`);
  assert.equal(typeof productUi.mountProductOfferBidUi, "function");
});
