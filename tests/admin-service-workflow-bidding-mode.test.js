import test from "node:test";
import assert from "node:assert/strict";

globalThis.window = {
  LHAI_API_BASE_URL: "",
  location: { hostname: "localhost", port: "8000" },
};

const {
  mswResolveBiddingMode,
  mswMergeBiddingPayloadForSave,
  MSW_WORKFLOW_MULTI_PARTNER,
  MSW_PARTNER_TYPE_AUTO_DEALER,
  MSW_BIDDING_MODE_CAR_PURCHASE,
  MSW_BIDDING_MODE_GENERAL,
} = await import("../src/assets/js/pages/admin-service-workflow-tab.js").then((m) => m.__testOnlyBiddingMode);

test("canonical: AUTO_DEALER multi partner → CAR_PURCHASE", () => {
  assert.equal(
    mswResolveBiddingMode(MSW_WORKFLOW_MULTI_PARTNER, MSW_PARTNER_TYPE_AUTO_DEALER),
    MSW_BIDDING_MODE_CAR_PURCHASE
  );
});

test("canonical: other partner type → GENERAL", () => {
  assert.equal(
    mswResolveBiddingMode(MSW_WORKFLOW_MULTI_PARTNER, "PHONE_VENDOR"),
    MSW_BIDDING_MODE_GENERAL
  );
});

test("save payload overwrites server GENERAL when screen is AUTO_DEALER", () => {
  const bidding = mswMergeBiddingPayloadForSave(
    { enabled: true, bid_window_hours: 72 },
    { mode: MSW_BIDDING_MODE_GENERAL, enabled: false },
    MSW_WORKFLOW_MULTI_PARTNER,
    MSW_PARTNER_TYPE_AUTO_DEALER
  );
  assert.equal(bidding.mode, MSW_BIDDING_MODE_CAR_PURCHASE);
  assert.equal(bidding.enabled, true);
});

test("save payload sets GENERAL for non-auto multi partner", () => {
  const bidding = mswMergeBiddingPayloadForSave(
    {},
    { mode: MSW_BIDDING_MODE_CAR_PURCHASE },
    MSW_WORKFLOW_MULTI_PARTNER,
    "GENERAL_PARTNER"
  );
  assert.equal(bidding.mode, MSW_BIDDING_MODE_GENERAL);
});

test("preview resolver matches save payload mode for AUTO_DEALER", () => {
  const workflowType = MSW_WORKFLOW_MULTI_PARTNER;
  const partnerType = MSW_PARTNER_TYPE_AUTO_DEALER;
  const previewMode = mswResolveBiddingMode(workflowType, partnerType);
  const saveMode = mswMergeBiddingPayloadForSave({}, {}, workflowType, partnerType).mode;
  assert.equal(previewMode, MSW_BIDDING_MODE_CAR_PURCHASE);
  assert.equal(saveMode, previewMode);
});

test("preview resolver matches save payload mode for GENERAL_VENDOR", () => {
  const workflowType = MSW_WORKFLOW_MULTI_PARTNER;
  const partnerType = "GENERAL_VENDOR";
  const previewMode = mswResolveBiddingMode(workflowType, partnerType);
  const saveMode = mswMergeBiddingPayloadForSave({}, {}, workflowType, partnerType).mode;
  assert.equal(previewMode, MSW_BIDDING_MODE_GENERAL);
  assert.equal(saveMode, previewMode);
});
