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
    remaining_label: "2일 22시간",
    offer_count: 1,
    partner_count: 1,
    selected_offer: null,
    selected_partner: null,
    ...overrides,
  };
}

test("Scenario 1 — offers arrived hero, CTA, quote card, nav badge", async () => {
  const m = await importFresh(logicPath);
  const aggregate = { active_car_bid: bidFixture() };
  const hero = m.resolveDashboardActionHero(aggregate);
  assert.equal(hero.title, "차량 견적이 도착하고 있어요");
  assert.equal(hero.primary.label, "견적 비교하기");
  assert.match(hero.primary.href, /customer-bid-results\.html/);
  assert.match(hero.primary.href, /service_request_id=sr-1/);

  const quote = m.resolveQuoteBidSummaryModel(aggregate.active_car_bid);
  assert.ok(quote);
  assert.match(quote.title, /도착한 제안 1개/);
  assert.equal(quote.cta.label, "견적 비교하기");

  const badge = m.resolveCustomerQuoteNavBadge(aggregate.active_car_bid);
  assert.equal(badge.text, "1");
  assert.equal(badge.hidden, false);
});

test("Scenario 2 — waiting for offers", async () => {
  const m = await importFresh(logicPath);
  const bid = bidFixture({ offer_count: 0, partner_count: 2 });
  const hero = m.resolveDashboardActionHero({ active_car_bid: bid });
  assert.equal(hero.title, "견적을 기다리는 중입니다");
  assert.equal(hero.primary.label, "견적 상태 보기");

  const quote = m.resolveQuoteBidSummaryModel(bid);
  assert.equal(quote.title, m.DASHBOARD_EMPTY.quoteWaitingTitle);
  assert.match(quote.text, /제출하면/);
  assert.equal(quote.cta.label, "견적 상태 보기");
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
  assert.equal(hero.title, "파트너 선택이 완료되었습니다");
  assert.equal(hero.primary.label, "메시지함 열기");
  assert.equal(hero.primary.href, "messages.html");

  const badge = m.resolveCustomerQuoteNavBadge(bid);
  assert.equal(badge.text, "선택됨");
  assert.equal(badge.selected, true);
});

test("Scenario 4 — in-progress service without car bid", async () => {
  const m = await importFresh(logicPath);
  const aggregate = {
    payment_status: "Paid",
    next_action: "Review messages and schedule.",
    documents_summary: { approved_count: 2, needs_attention_count: 0, total_count: 2 },
    document_status: [],
    recent_messages: [],
    recent_activity: [],
  };
  const hero = m.resolveDashboardActionHero(aggregate);
  assert.equal(hero.title, "서비스가 진행 중입니다");
  assert.equal(hero.primary.label, "메시지함 열기");
});

test("Scenario 5 — documents need attention via summary", async () => {
  const m = await importFresh(logicPath);
  const aggregate = {
    documents_summary: { approved_count: 1, needs_attention_count: 2, total_count: 3 },
    document_status: [],
  };
  assert.equal(m.documentsNeedCustomerAttention(aggregate), true);
  const hero = m.resolveDashboardActionHero(aggregate);
  assert.equal(hero.title, "문서 확인이 필요합니다");
  assert.equal(hero.primary.label, "문서 보기");

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
