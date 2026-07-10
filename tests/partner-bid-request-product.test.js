import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
import path from "node:path";

const logicPath = pathToFileURL(
  path.join(process.cwd(), "src/assets/js/pages/partner-bid-request-product-logic.js"),
).href;

async function importFresh() {
  const q = `?t=${Date.now()}-${Math.random()}`;
  return import(`${logicPath}${q}`);
}

test("validateProductOffersForSubmit requires title and total", async () => {
  const m = await importFresh();
  const err = m.validateProductOffersForSubmit(
    [{ offer_id: "offer_1", title: "", estimated_total: "" }],
    {},
  );
  assert.equal(err?.code, "title_required");
});

test("buildProductSubmitPayload shapes PRODUCT_OFFER included_items", async () => {
  const m = await importFresh();
  const payload = m.buildProductSubmitPayload(
    [
      {
        offer_id: "offer_1",
        title: "Widget A",
        estimated_total: "100",
        currency: "USD",
        photos: [{ url: "https://example.com/a.jpg", thumbnail_url: "https://example.com/a-t.jpg" }],
        attributes_json: '{"condition":"new"}',
      },
    ],
    { messageToCustomer: "Hello" },
  );
  assert.equal(payload.included_items.bid_type, "PRODUCT_OFFER");
  assert.equal(payload.included_items.offers[0].title, "Widget A");
  assert.equal(payload.included_items.offers[0].attributes.condition, "new");
  assert.equal(payload.message_to_customer, "Hello");
});

test("formatRankSummaryLabel uses API label_ko", async () => {
  const m = await importFresh();
  const label = m.formatRankSummaryLabel({
    label_ko: "추천순 기준 2위 / 9개",
    best_rank: 2,
    total_offers: 9,
  });
  assert.match(label, /내 제안 현재 순위: 추천순 기준 2위 \/ 9개/);
});

test("endedStateMessage distinguishes EXPIRED and CANCELLED", async () => {
  const m = await importFresh(logicPath);
  assert.match(m.endedStateMessage({ status: "DRAFT" }, "EXPIRED"), /can no longer edit offers/i);
  assert.match(m.endedStateMessage({ status: "DRAFT" }, "CANCELLED"), /new bidding round/i);
});

test("resolvePartnerBidEditable blocks EXPIRED request", async () => {
  const m = await importFresh();
  assert.equal(
    m.resolvePartnerBidEditable({
      bidStatus: "SUBMITTED",
      requestStatus: "EXPIRED",
      expiresAt: new Date(Date.now() - 3600000).toISOString(),
    }),
    false,
  );
});
