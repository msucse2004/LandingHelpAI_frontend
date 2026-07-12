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
  assert.equal(m.resolveCustomerBidDisplayPhase("EXPIRED", future), "EXPIRED");
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

test("buildCustomerBidsApiQuery maps product filters", async () => {
  const m = await importFresh(logicPath);
  const q = m.buildCustomerBidsApiQuery({
    sort: "photo_first",
    hasPhotos: true,
    budgetOnly: true,
    productCategory: "vehicle",
    partner: "uuid-1",
    location: "Raleigh",
  });
  assert.equal(q.sort, "photo_first");
  assert.equal(q.has_photos, true);
  assert.equal(q.budget_only, true);
  assert.equal(q.product_category, "vehicle");
  assert.equal(q.partner, "uuid-1");
  assert.equal(q.location, "Raleigh");
});

test("formatOfferRankBadge shows rank total in English", async () => {
  const m = await importFresh(logicPath);
  const badge = m.formatOfferRankBadge(
    { rank: 1, rank_total: 12, rank_basis: "recommended" },
    "recommended",
  );
  assert.equal(badge, "Recommended #1 of 12");
});

test("formatBidRequestStatusLabel uses code-based English fallbacks", async () => {
  const m = await importFresh(logicPath);
  assert.equal(m.formatBidRequestStatusLabel("OPEN"), "Bidding in progress");
  assert.equal(m.formatBidRequestStatusLabel("EXPIRED"), "Bidding ended");
  assert.equal(m.formatBidRequestStatusLabel("CUSTOMER_SELECTED"), "Offer selected");
});

test("buildOfferThumbImgHtml includes fallback data attribute when thumb differs from full", async () => {
  const m = await importFresh(logicPath);
  const esc = (s) => String(s);
  const html = m.buildOfferThumbImgHtml(
    {
      photos: [
        {
          url: "/uploads/bid-offers/2026/05/a.jpg",
          thumbnail_url: "/uploads/bid-offers/2026/05/thumbs/a.jpg",
        },
      ],
    },
    esc,
  );
  assert.match(html, /data-cbr-photo-fallback=/);
  assert.match(html, /\/uploads\/bid-offers\/2026\/05\/a\.jpg/);
});

test("offerThumbnailUrl prefers thumbnail_url", async () => {
  const m = await importFresh(logicPath);
  assert.equal(m.offerThumbnailUrl({ thumbnail_url: "https://x/t.jpg" }), "https://x/t.jpg");
  assert.equal(
    m.offerThumbnailUrl({ photos: [{ url: "https://x/p.jpg" }] }),
    "https://x/p.jpg",
  );
});

test("resolveOfferMediaUrl leaves absolute URLs unchanged", async () => {
  const m = await importFresh(logicPath);
  assert.equal(m.resolveOfferMediaUrl("https://cdn.example/a.jpg"), "https://cdn.example/a.jpg");
});

test("collectOfferPhotos resolves relative upload paths", async () => {
  const m = await importFresh(logicPath);
  const photos = m.collectOfferPhotos({
    photos: [{ url: "/uploads/bid-offers/2026/05/abc.jpg", thumbnail_url: "/uploads/bid-offers/2026/05/thumbs/abc.jpg" }],
  });
  assert.equal(photos.length, 1);
  assert.match(photos[0].url, /\/uploads\/bid-offers\/2026\/05\/abc\.jpg$/);
  assert.match(photos[0].thumbnail_url, /thumbs\/abc\.jpg$/);
});

test("emptyOffersMessage OPEN vs EXPIRED in English", async () => {
  const m = await importFresh(logicPath);
  assert.match(m.emptyOffersMessage("OPEN", 0), /preparing offers/i);
  assert.match(m.emptyOffersMessage("EXPIRED", 0), /new bidding round/i);
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

test("formatRelativeTime shows minutes ago in English", async () => {
  const m = await importFresh(logicPath);
  const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
  assert.match(m.formatRelativeTime(fiveMinAgo), /5 min ago/);
});

test("buildCustomerBidResultsPageHref encodes params", async () => {
  const m = await importFresh(logicPath);
  const href = m.buildCustomerBidResultsPageHref("wid-1", "tid-2");
  assert.match(href, /service_request_id=wid-1/);
  assert.match(href, /thread_id=tid-2/);
});

test("buildCustomerBidResultsPageHref thread_id only", async () => {
  const m = await importFresh(logicPath);
  const href = m.buildCustomerBidResultsPageHref("", "tid-only");
  assert.equal(href, "customer-bid-results.html?thread_id=tid-only");
  assert.doesNotMatch(href, /service_request_id=/);
});

test("buildCustomerBidResultsPageHref falls back when ids missing", async () => {
  const m = await importFresh(logicPath);
  assert.equal(m.buildCustomerBidResultsPageHref("", ""), "messages.html");
  assert.equal(
    m.buildCustomerBidResultsPageHref("", "", { fallbackHref: "quote-detail.html" }),
    "quote-detail.html",
  );
});

test("renderSelectionConversationBannerHtml includes Open conversation", async () => {
  const m = await importFresh(logicPath);
  const html = m.renderSelectionConversationBannerHtml(
    "thread-uuid",
    { title: "Widget Pro", estimated_total: "99" },
    { partner_name: "Acme" },
  );
  assert.match(html, /added to the conversation/i);
  assert.match(html, /Open conversation/);
  assert.match(html, /thread_id=/);
});

test("customerBidStatusBannerMessage for EXPIRED and CLOSED", async () => {
  const m = await importFresh(logicPath);
  assert.match(m.customerBidStatusBannerMessage("EXPIRED"), /Bidding has ended/i);
  assert.match(m.customerBidStatusBannerMessage("CLOSED"), /bidding round has ended/i);
  assert.equal(m.canSelectCustomerBid("OPEN"), true);
  assert.equal(m.canSelectCustomerBid("EXPIRED"), true);
});

test("buildCustomerBidSelectConfirmContent EXPIRED vs OPEN", async () => {
  const m = await importFresh(logicPath);
  const vehicleOffer = {
    title: "2022 Sienna",
    product_category: "vehicle",
    estimated_total: 28000,
    currency: "USD",
  };
  const expired = m.buildCustomerBidSelectConfirmContent("EXPIRED", vehicleOffer, {});
  assert.equal(expired.modalTitle, "Select this offer?");
  assert.match(expired.bodyHtml, /bidding round has ended/i);
  assert.match(expired.bodyHtml, /sold to another buyer first/i);
  assert.equal(expired.submitLabel, "Select and contact partner");
  const open = m.buildCustomerBidSelectConfirmContent("OPEN", vehicleOffer, {
    expires_at: new Date(Date.now() + 3600_000).toISOString(),
  });
  assert.equal(open.modalTitle, "Confirm offer selection");
  assert.match(open.bodyHtml, /sold to another buyer first/i);
  assert.match(open.warnText, /left until bidding closes/i);

  const productOffer = { title: "Phone plan", product_category: "service", estimated_total: 99 };
  const openProduct = m.buildCustomerBidSelectConfirmContent("OPEN", productOffer, {});
  assert.doesNotMatch(openProduct.bodyHtml, /sold to another buyer first/i);
});

test("resolveCustomerBidActions prefers API flags", async () => {
  const m = await importFresh(logicPath);
  const actions = m.resolveCustomerBidActions({
    bid_request_status: "EXPIRED",
    can_select_existing_offers: true,
    can_partner_submit: false,
    can_request_new_round: true,
  });
  assert.equal(actions.can_select_existing_offers, true);
  assert.equal(actions.can_partner_submit, false);
  assert.equal(actions.can_request_new_round, true);
});

test("vehicle offer card shows minor and major accident labels", async () => {
  const m = await importFresh(logicPath);
  const html = m.buildVehicleOfferCardHtml(
    {
      offer_id: "o1",
      bid_id: "b1",
      title: "2020 Camry",
      partner_name: "Dealer",
      estimated_total: 20000,
      currency: "USD",
      vehicle: { accident_history: "Minor accident reported" },
    },
    { phase: "OPEN", activeSort: "recommended", snap: { status: "OPEN" } },
    (s) => String(s),
  );
  assert.match(html, /Minor accident reported/);
  const majorHtml = m.buildVehicleOfferCardHtml(
    {
      offer_id: "o2",
      bid_id: "b2",
      title: "2018 SUV",
      partner_name: "Dealer",
      estimated_total: 18000,
      currency: "USD",
      vehicle: { accident_history: "Major accident reported" },
    },
    { phase: "OPEN", activeSort: "recommended", snap: { status: "OPEN" } },
    (s) => String(s),
  );
  assert.match(majorHtml, /Major accident reported/);
});

test("isVehicleOffer detects vehicle category and block", async () => {
  const m = await importFresh(logicPath);
  assert.equal(m.isVehicleOffer({ product_category: "vehicle" }), true);
  assert.equal(m.isVehicleOffer({ vehicle: { make: "Toyota" } }), true);
  assert.equal(m.isVehicleOffer({ title: "Widget", product_category: "electronics" }), false);
});

test("formatOfferRankBadgeEn Recommended #2 of 9", async () => {
  const m = await importFresh(logicPath);
  const badge = m.formatOfferRankBadgeEn(
    { rank: 2, rank_total: 9, rank_basis: "recommended" },
    "recommended",
  );
  assert.equal(badge, "Recommended #2 of 9");
});

test("formatVehiclePriceBreakdownLines includes vehicle and fees", async () => {
  const m = await importFresh(logicPath);
  const lines = m.formatVehiclePriceBreakdownLines({
    currency: "USD",
    estimated_total: 32000,
    pricing: {
      vehicle_price: 28000,
      estimated_tax_registration: 1500,
      dealer_fee: 500,
      partner_service_fee: 300,
      delivery_fee: 200,
    },
  });
  const labels = lines.map((l) => l.label);
  assert.ok(labels.includes("Vehicle price"));
  assert.ok(labels.includes("Tax & fees"));
  assert.ok(labels.includes("Estimated total"));
});

test("offerSelectionUiState hides select when CUSTOMER_SELECTED", async () => {
  const m = await importFresh(logicPath);
  const offer = { bid_id: "b1", offer_id: "o1" };
  const open = m.offerSelectionUiState("OPEN", offer, { snap: { status: "OPEN" } });
  assert.equal(open.showSelectButton, true);
  const picked = m.offerSelectionUiState("CUSTOMER_SELECTED", offer, {
    selectedBidId: "b1",
    selectedOfferId: "o1",
    snap: { status: "CUSTOMER_SELECTED" },
  });
  assert.equal(picked.isSelected, true);
  assert.equal(picked.showSelectButton, false);
  const other = m.offerSelectionUiState("CUSTOMER_SELECTED", { bid_id: "b2", offer_id: "o2" }, {
    selectedBidId: "b1",
    selectedOfferId: "o1",
  });
  assert.equal(other.dimmed, true);
  assert.equal(other.showSelectButton, false);
});

test("buildVehicleOfferCardHtml includes rank and expired badge", async () => {
  const m = await importFresh(logicPath);
  const esc = (s) => String(s);
  const html = m.buildVehicleOfferCardHtml(
    {
      offer_id: "o1",
      bid_id: "b1",
      product_category: "vehicle",
      title: "2021 Toyota Camry SE",
      partner_name: "Acme Motors",
      estimated_total: 28000,
      currency: "USD",
      rank: 2,
      rank_total: 9,
      vehicle: { mileage: 12000, title_status: "CLEAN", accident_history: "NONE" },
      location: "Raleigh, NC",
      available_timeline: "2 weeks",
      message_to_customer: "Available now",
    },
    { phase: "EXPIRED", activeSort: "recommended", snap: { status: "EXPIRED" } },
    esc,
  );
  assert.match(html, /Recommended #2 of 9/);
  assert.match(html, /availability needs confirmation/i);
  assert.match(html, /Select this offer/);
  assert.match(html, /View details/);
});

test("quoteRequestRemaining and canRequestNewBidRound", async () => {
  const m = await importFresh(logicPath);
  const usage = { max_quote_requests: 3, used_quote_requests: 2, remaining_quote_requests: 1 };
  assert.equal(m.quoteRequestRemaining(usage), 1);
  const future = new Date(Date.now() + 3600_000).toISOString();
  assert.equal(
    m.canRequestNewBidRound({
      status: "OPEN",
      expires_at: future,
      quote_request_usage: usage,
    }),
    true,
  );
  assert.equal(
    m.canRequestNewBidRound({
      status: "CUSTOMER_SELECTED",
      expires_at: future,
      quote_request_usage: usage,
    }),
    false,
  );
  assert.equal(
    m.canRequestNewBidRound({
      status: "OPEN",
      expires_at: future,
      quote_request_usage: { max_quote_requests: 3, used_quote_requests: 3, remaining_quote_requests: 0 },
    }),
    false,
  );
});
