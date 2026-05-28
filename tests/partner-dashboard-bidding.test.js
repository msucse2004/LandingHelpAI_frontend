import test from "node:test";
import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";

async function importFresh(modulePath) {
  const url = pathToFileURL(modulePath);
  url.searchParams.set("t", String(Date.now() + Math.random()));
  return await import(url.href);
}

const logicPath =
  "c:\\workspace\\LandingHelpAI\\LandingHelpAI_frontend\\src\\assets\\js\\pages\\partner-dashboard-bidding-logic.js";

test("biddingTimeLeftLabel shows ended when expired", async () => {
  const m = await importFresh(logicPath);
  assert.equal(m.biddingTimeLeftLabel({ is_expired: true, remaining_label: "12h left" }), "Bidding ended");
  assert.equal(m.biddingTimeLeftLabel({ remaining_label: "12h 30m left" }), "12h 30m left");
});

test("partnerListStatusBadgeClass maps dashboard status codes", async () => {
  const m = await importFresh(logicPath);
  assert.equal(m.partnerListStatusBadgeClass("NOT_SUBMITTED"), "lhai-par-dash-bid__status--pending");
  assert.equal(m.partnerListStatusBadgeClass("SUBMITTED"), "lhai-par-dash-bid__status--submitted");
  assert.equal(m.partnerListStatusBadgeClass("SELECTED"), "lhai-par-dash-bid__status--selected");
  assert.equal(m.partnerListStatusBadgeClass("ENDED"), "lhai-par-dash-bid__status--ended");
  assert.equal(m.partnerListStatusBadgeClass("EXPIRED"), "lhai-par-dash-bid__status--ended");
});

test("buildBiddingDashboardCardHtml includes summary and rank", async () => {
  const m = await importFresh(logicPath);
  const esc = (s) => String(s);
  const html = m.buildBiddingDashboardCardHtml(
    {
      bid_request_id: "uuid-1",
      service_display: "Vehicle purchase",
      is_car_purchase: true,
      customer_display_name: "Kim**",
      customer_location: "NC · Raleigh",
      request_summary_lines: ["Budget: up to $35,000", "Vehicle: 2021 Toyota Camry"],
      time_left_label: "23h 10m left",
      partner_status: "SUBMITTED",
      partner_status_label: "Submitted",
      my_offers_count: 2,
      rank_label: "Recommended #2 of 9",
    },
    "partner-bid-request.html#/partner/bid-requests/uuid-1",
    esc,
  );
  assert.match(html, /Vehicle purchase/);
  assert.match(html, /Budget: up to/);
  assert.match(html, /Recommended #2 of 9/);
  assert.match(html, /2 offers/);
  assert.match(html, /View request details/);
  assert.match(html, /lhai-par-dash-bid__status--submitted/);
});

test("buildBiddingDashboardCardHtml uses pending badge for Not submitted", async () => {
  const m = await importFresh(logicPath);
  const esc = (s) => String(s);
  const html = m.buildBiddingDashboardCardHtml(
    {
      bid_request_id: "uuid-2",
      service_display: "Vehicle purchase",
      partner_status: "NOT_SUBMITTED",
      partner_status_label: "Not submitted",
      time_left_label: "48h left",
    },
    "partner-bid-request.html",
    esc,
  );
  assert.match(html, /lhai-par-dash-bid__status--pending/);
  assert.match(html, />Not submitted</);
});
