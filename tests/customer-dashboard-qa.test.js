import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

async function importFresh(modulePath) {
  const url = pathToFileURL(modulePath);
  url.searchParams.set("t", String(Date.now() + Math.random()));
  return await import(url.href);
}

const logicPath =
  "c:\\workspace\\LandingHelpAI\\LandingHelpAI_frontend\\src\\assets\\js\\pages\\dashboard-logic.js";

const dashboardHtmlPath =
  "c:\\workspace\\LandingHelpAI\\LandingHelpAI_frontend\\src\\pages\\dashboard.html";

const dashboardCssPath =
  "c:\\workspace\\LandingHelpAI\\LandingHelpAI_frontend\\src\\assets\\css\\pages\\dashboard.css";

function bidFixture(overrides = {}) {
  return {
    exists: true,
    bid_request_id: "br-1",
    thread_id: "thread-1",
    service_request_id: "sr-1",
    status: "OPEN",
    remaining_label: "2 days 22 hours",
    offer_count: 1,
    partner_count: 1,
    selected_offer: null,
    selected_partner: null,
    ...overrides,
  };
}

test("localizeDashboardStatusText maps canonical API payment tokens", async () => {
  const { localizeDashboardStatusText } = await importFresh(logicPath);
  assert.equal(localizeDashboardStatusText("Payment due"), "Payment due");
  assert.equal(localizeDashboardStatusText("Invoice draft"), "Invoice draft");
});

test("Scenario 1 — offers arrived hero, CTA, quote card, nav badge", async () => {
  const m = await importFresh(logicPath);
  const aggregate = { active_car_bid: bidFixture() };
  const hero = m.resolveDashboardActionHero(aggregate);
  assert.equal(hero.title, "Vehicle quotes are arriving");
  assert.equal(hero.primary.label, "Compare quotes");
  assert.match(hero.primary.href, /customer-bid-results\.html/);
  assert.match(hero.primary.href, /service_request_id=sr-1/);

  const quote = m.resolveQuoteBidSummaryModel(aggregate.active_car_bid);
  assert.ok(quote);
  assert.match(quote.title, /1 proposals received/);
  assert.equal(quote.cta.label, "Compare quotes");

  const badge = m.resolveCustomerQuoteNavBadge(aggregate.active_car_bid);
  assert.equal(badge.text, "1");
  assert.equal(badge.hidden, false);
});

test("Scenario 2 — waiting for offers", async () => {
  const m = await importFresh(logicPath);
  const bid = bidFixture({ offer_count: 0, partner_count: 2 });
  const hero = m.resolveDashboardActionHero({ active_car_bid: bid });
  assert.equal(hero.title, "Waiting for proposals");
  assert.equal(hero.primary.label, "View quote status");

  const quote = m.resolveQuoteBidSummaryModel(bid);
  assert.equal(quote.title, m.DASHBOARD_EMPTY.quoteWaitingTitle);
  assert.match(quote.text, /submit proposals/i);
  assert.equal(quote.cta.label, "View quote status");
});

test("Scenario 3 — partner selected takes priority over open offers", async () => {
  const m = await importFresh(logicPath);
  const bid = bidFixture({
    offer_count: 3,
    status: "CUSTOMER_SELECTED",
    selected_offer: { offer_id: "off-9", title: "2024 Sienna" },
    selected_partner: { name: "Partner A" },
  });
  const hero = m.resolveDashboardActionHero({ active_car_bid: bid });
  assert.equal(hero.title, "Partner selection complete");
  assert.equal(hero.primary.label, "Open messages");
  assert.equal(hero.primary.href, "messages.html");

  const badge = m.resolveCustomerQuoteNavBadge(bid);
  assert.equal(badge.text, "Selected");
  assert.equal(badge.selected, true);
});

test("Scenario 4 — in-progress service without car bid", async () => {
  const m = await importFresh(logicPath);
  const aggregate = {
    payment_status: "Paid",
    current_service_status: "In progress",
    status_cards: [{ key: "service", value: "In progress" }],
    next_action: "Review messages and schedule.",
    documents_summary: { approved_count: 2, needs_attention_count: 0, total_count: 2 },
    document_status: [],
    recent_messages: [],
    recent_activity: [],
  };
  const hero = m.resolveDashboardActionHero(aggregate);
  assert.equal(hero.variant, "active");
  assert.equal(hero.title, "Your service is in progress");
  assert.equal(hero.primary.label, "Open messages");
  assert.match(hero.text, /messages and your schedule/i);
});

test("Scenario — idle dashboard after reset (pre-start, no workflow)", async () => {
  const m = await importFresh(logicPath);
  const aggregate = {
    payment_status: "Not billed",
    status_cards: [
      { key: "service", value: "Getting started" },
      { key: "payment", value: "Not billed yet" },
    ],
    next_action: "Submit a service inquiry or open messages to reach the team.",
    documents_summary: { approved_count: 0, needs_attention_count: 0, total_count: 0 },
    document_status: [],
    recent_messages: [],
    recent_updates: [],
  };
  assert.equal(m.isDashboardIdleState(aggregate, { cases: [] }), true);
  const hero = m.resolveDashboardActionHero(aggregate, { cases: [] });
  assert.equal(hero.variant, "idle");
  assert.equal(hero.title, m.DASHBOARD_IDLE_HERO.title);
  assert.equal(hero.primary.label, "Start a service inquiry");
  assert.equal(hero.primary.href, "cases.html");
});

test("Scenario 5 — documents need attention via summary", async () => {
  const m = await importFresh(logicPath);
  const aggregate = {
    documents_summary: { approved_count: 1, needs_attention_count: 2, total_count: 3 },
    document_status: [],
  };
  assert.equal(m.documentsNeedCustomerAttention(aggregate), true);
  const hero = m.resolveDashboardActionHero(aggregate);
  assert.equal(hero.title, "Documents need your review");
  assert.equal(hero.primary.label, "View documents");

  const counts = m.summarizeDocumentCounts(aggregate);
  assert.equal(counts.needsAttention, 2);
  assert.equal(counts.approved, 1);
});

test("Scenario 6 — empty copy has no Empty: prefix", async () => {
  const m = await importFresh(logicPath);
  for (const value of Object.values(m.DASHBOARD_EMPTY)) {
    assert.doesNotMatch(String(value), /^Empty:/i);
    assert.doesNotMatch(String(value), /Empty:/);
  }
  const rows = m.buildMergedRecentUpdates({
    recent_updates: [],
    recent_messages: [],
    recent_activity: [],
  });
  assert.equal(rows.length, 0);
});

test("Scenario 7 — dashboard hides legacy AI quick link", () => {
  const css = readFileSync(dashboardCssPath, "utf8");
  assert.match(css, /#aiQuickLinkBtn/);
  assert.match(css, /display:\s*none/);
  const html = readFileSync(dashboardHtmlPath, "utf8");
  assert.doesNotMatch(html, /aiQuickLinkBtn/);
  assert.doesNotMatch(html, /ai-assistant\.html/);
});

test("Scenario 8 — mobile layout order in HTML and CSS stack", () => {
  const html = readFileSync(dashboardHtmlPath, "utf8");
  const heroPos = html.indexOf("dashboardActionHero");
  const statusPos = html.indexOf("dashboardStatusSummary");
  const quotePos = html.indexOf("dashboardQuoteSummary");
  const progressPos = html.indexOf("dashboardProgressStepper");
  const updatesPos = html.indexOf("dashboardRecentUpdates");
  assert.ok(heroPos < statusPos && statusPos < quotePos);
  assert.ok(quotePos < progressPos && progressPos < updatesPos);

  const css = readFileSync(dashboardCssPath, "utf8");
  assert.match(css, /max-width:\s*960px/);
  assert.match(css, /grid-template-columns:\s*1fr/);
  assert.match(css, /lhai-dashboard-hero__actions.*lhai-button/s);
});
