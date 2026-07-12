import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const ROOT = new URL("../src/assets/js/pages/", import.meta.url);

const IMPORTS_FROM_LOGIC = [
  "buildCustomerBidRequestTabs",
  "buildCustomerBidsApiQuery",
  "buildCustomerBidResultsPageHref",
  "buildMessagesThreadHref",
  "renderSelectionConversationBannerHtml",
  "collectDistinctLocations",
  "collectDistinctPartners",
  "collectDistinctProductCategories",
  "CUSTOMER_BID_SORT_OPTIONS",
  "emptyOffersMessage",
  "filterOffersByTab",
  "formatAttributesList",
  "formatBidRequestStatusLabel",
  "customerBidStatusBannerMessage",
  "buildCustomerBidSelectConfirmContent",
  "canSelectCustomerBid",
  "cbrT",
  "formatCountdownToExpiry",
  "formatMoney",
  "formatOfferPartnerName",
  "formatOfferPriceBreakdownLines",
  "formatOfferRankBadge",
  "formatOfferTitle",
  "formatQuoteRequestUsage",
  "formatSortOptionLabel",
  "canRequestNewBidRound",
  "quoteRequestRemaining",
  "isProductOfferListResponse",
  "offerShowsUpdatedBadge",
  "buildOfferThumbImgHtml",
  "wireOfferPhotoImgFallbacks",
  "resolveCustomerBidDisplayPhase",
  "isCustomerBidListPollingPhase",
  "snapshotHasBudgetHint",
  "isVehicleOffer",
  "buildVehicleOfferCardHtml",
  "buildVehicleOfferDetailModalHtml",
  "offerSelectionUiState",
  "offerDisplayDescription",
  "offerDisplayPartnerMessage",
  "offerDisplayAvailability",
];

test("customer-bid-results.js does not import csrf from logic", () => {
  const page = readFileSync(new URL("customer-bid-results.js", ROOT), "utf8");
  assert.doesNotMatch(page, /\bcsrf\b/);
  assert.match(page, /\bcbrT\b/);
});

test("customer-bid-results-logic.js exports all symbols imported by page", async () => {
  const logic = await import(pathToFileURL(new URL("customer-bid-results-logic.js", ROOT).pathname).href);
  const missing = IMPORTS_FROM_LOGIC.filter((name) => logic[name] === undefined);
  assert.deepEqual(missing, [], `missing exports: ${missing.join(", ")}`);
});
