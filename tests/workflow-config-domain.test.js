import { test } from "node:test";
import assert from "node:assert/strict";

const {
  BIDDING_MODE_CAR_PURCHASE,
  BIDDING_MODE_GENERAL,
  WT_MULTI_PARTNER_QUOTE_AND_SELECT,
  applyCanonicalBiddingToWorkflowConfig,
  canonicalBiddingMode,
} = await import("../src/assets/js/lib/workflow-config-domain.js");

test("canonical: MULTI + AUTO_DEALER → CAR_PURCHASE", () => {
  const mode = canonicalBiddingMode(WT_MULTI_PARTNER_QUOTE_AND_SELECT, {
    multi_partner: { partner_type: "AUTO_DEALER" },
  });
  assert.equal(mode, BIDDING_MODE_CAR_PURCHASE);
});

test("canonical: MULTI + GENERAL_VENDOR → GENERAL", () => {
  const mode = canonicalBiddingMode(WT_MULTI_PARTNER_QUOTE_AND_SELECT, {
    multi_partner: { partner_type: "GENERAL_VENDOR" },
  });
  assert.equal(mode, BIDDING_MODE_GENERAL);
});

test("applyCanonicalBiddingToWorkflowConfig sets mode on save payload", () => {
  const out = applyCanonicalBiddingToWorkflowConfig(WT_MULTI_PARTNER_QUOTE_AND_SELECT, {
    multi_partner: { partner_type: "AUTO_DEALER" },
    bidding: { enabled: true },
  });
  assert.equal(out.bidding.mode, BIDDING_MODE_CAR_PURCHASE);
});
