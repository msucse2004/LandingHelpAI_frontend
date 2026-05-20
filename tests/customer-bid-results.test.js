import test from "node:test";
import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";

async function importFresh(modulePath) {
  const url = pathToFileURL(modulePath);
  url.searchParams.set("t", String(Date.now() + Math.random()));
  return await import(url.href);
}

const logicPath =
  "c:\\workspace\\LandingHelpAI\\LandingHelpAI_frontend\\src\\assets\\js\\pages\\customer-bid-results-logic.js";

test("isCarPurchaseBidListResponse detects CAR mode", async () => {
  const m = await importFresh(logicPath);
  assert.equal(m.isCarPurchaseBidListResponse({ bidding_mode: "CAR_PURCHASE" }), true);
  assert.equal(m.isCarPurchaseBidListResponse({ offers: [] }), true);
  assert.equal(m.isCarPurchaseBidListResponse({ bids: [] }), false);
});

test("resolveCustomerBidDisplayPhase OPEN vs EXPIRED vs SELECTED", async () => {
  const m = await importFresh(logicPath);
  const future = new Date(Date.now() + 3600_000).toISOString();
  const past = new Date(Date.now() - 3600_000).toISOString();
  assert.equal(m.resolveCustomerBidDisplayPhase("CUSTOMER_SELECTED", future), "CUSTOMER_SELECTED");
  assert.equal(m.resolveCustomerBidDisplayPhase("OPEN", future), "OPEN");
  assert.equal(m.resolveCustomerBidDisplayPhase("OPEN", past), "EXPIRED");
});

test("buildCustomerBidRequestTabs includes alternatives", async () => {
  const m = await importFresh(logicPath);
  const tabs = m.buildCustomerBidRequestTabs([{ request_index: 1, make: "Toyota" }]);
  assert.ok(tabs.some((t) => t.key === "all"));
  assert.ok(tabs.some((t) => t.key === "req-1"));
  assert.ok(tabs.some((t) => t.key === "alternatives"));
});

test("filterOffersByTab alternatives only", async () => {
  const m = await importFresh(logicPath);
  const offers = [
    { offer_id: "a", is_alternative: false, linked_request_index: 1 },
    { offer_id: "b", is_alternative: true, linked_request_index: 1 },
  ];
  const alt = m.filterOffersByTab(offers, "alternatives");
  assert.equal(alt.length, 1);
  assert.equal(alt[0].offer_id, "b");
});

test("buildCustomerBidsApiQuery maps filters", async () => {
  const m = await importFresh(logicPath);
  const q = m.buildCustomerBidsApiQuery({
    sort: "lowest_total",
    budgetOnly: true,
    condition: "USED",
    cleanTitle: true,
    make: "Honda",
  });
  assert.equal(q.sort, "lowest_total");
  assert.equal(q.budget_only, true);
  assert.equal(q.condition, "USED");
  assert.equal(q.clean_title, true);
  assert.equal(q.make, "Honda");
});

test("formatOfferVehicleTitle joins year make model", async () => {
  const m = await importFresh(logicPath);
  const title = m.formatOfferVehicleTitle({
    vehicle: { year: 2022, make: "Toyota", model: "Sienna", trim: "XLE" },
  });
  assert.match(title, /2022/);
  assert.match(title, /Toyota/);
  assert.match(title, /Sienna/);
});

test("offerShowsUpdatedBadge when timestamps close", async () => {
  const m = await importFresh(logicPath);
  const iso = "2026-05-16T12:00:00.000Z";
  assert.equal(m.offerShowsUpdatedBadge(iso, iso), true);
  assert.equal(m.offerShowsUpdatedBadge(iso, "2020-01-01T00:00:00.000Z"), false);
});

test("formatRelativeTimeKo shows minutes ago", async () => {
  const m = await importFresh(logicPath);
  const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
  assert.match(m.formatRelativeTimeKo(fiveMinAgo), /5분 전/);
});

test("buildCustomerBidResultsPageHref encodes params", async () => {
  const m = await importFresh(logicPath);
  const href = m.buildCustomerBidResultsPageHref("wid-1", "tid-2");
  assert.match(href, /service_request_id=wid-1/);
  assert.match(href, /thread_id=tid-2/);
});
