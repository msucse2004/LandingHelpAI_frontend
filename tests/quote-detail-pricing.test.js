import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import test from "node:test";
import assert from "node:assert/strict";

const __dirname = dirname(fileURLToPath(import.meta.url));
const LOGIC_PATH = join(__dirname, "../src/assets/js/pages/quote-detail-pricing-logic.js");

async function importFreshLogic() {
  const url = pathToFileURL(LOGIC_PATH);
  url.searchParams.set("t", String(Date.now() + Math.random()));
  return import(url.href);
}

const baseQuote = {
  currency: "USD",
  estimated_cost: 69.97,
  items: [],
  request_details: {
    quote_pricing: {
      service_unit_prices: { "svc-phone": 9.99, "svc-car": 19.99 },
      admin_fee: 39.99,
    },
    survey_submission: {
      selected_services: [
        { id: "svc-phone", title: "US phone setup", delivery_mode: "ai_guide" },
        { id: "svc-car", title: "Car research & purchase", delivery_mode: "ai_guide" },
      ],
    },
  },
};

test("buildQuotePricingBreakdown shows adjustment when estimated exceeds service subtotal", async () => {
  const m = await importFreshLogic();
  const breakdown = m.buildQuotePricingBreakdown(baseQuote);
  assert.equal(breakdown.empty, false);
  assert.equal(breakdown.serviceLines.length, 2);
  assert.equal(breakdown.serviceSubtotal, 29.98);
  assert.equal(breakdown.estimatedTotal, 69.97);
  assert.equal(breakdown.amountsMatch, false);
  assert.ok(breakdown.adjustmentLine);
  assert.equal(breakdown.adjustmentLine.kind, "support_fee");
  assert.equal(breakdown.adjustmentLine.amount, 39.99);
  assert.equal(breakdown.adjustmentLine.matchesAdminFee, true);
});

test("buildQuotePricingBreakdown hides adjustment when totals match", async () => {
  const m = await importFreshLogic();
  const quote = {
    ...baseQuote,
    estimated_cost: 29.98,
    request_details: {
      ...baseQuote.request_details,
      quote_pricing: {
        service_unit_prices: { "svc-phone": 9.99, "svc-car": 19.99 },
        admin_fee: 0,
      },
    },
  };
  const breakdown = m.buildQuotePricingBreakdown(quote);
  assert.equal(breakdown.amountsMatch, true);
  assert.equal(breakdown.adjustmentLine, null);
  assert.equal(breakdown.showAdjustmentNote, false);
});

test("buildQuotePricingBreakdown returns empty when selected_services missing", async () => {
  const m = await importFreshLogic();
  const quote = {
    ...baseQuote,
    request_details: {
      quote_pricing: baseQuote.request_details.quote_pricing,
      survey_submission: { selected_services: [] },
    },
  };
  const breakdown = m.buildQuotePricingBreakdown(quote);
  assert.equal(breakdown.empty, true);
  assert.deepEqual(breakdown.serviceLines, []);
});

test("resolveServiceLineAmount falls back to quote items", async () => {
  const m = await importFreshLogic();
  const amount = m.resolveServiceLineAmount(
    "item-1",
    {},
    [{ service_item_id: "item-1", line_total: 12.5, quantity: 1, unit_price: 12.5 }]
  );
  assert.equal(amount, 12.5);
});

test("buildQuotePricingBreakdown shows discount adjustment for negative delta", async () => {
  const m = await importFreshLogic();
  const quote = {
    ...baseQuote,
    estimated_cost: 24.98,
    request_details: {
      ...baseQuote.request_details,
      quote_pricing: {
        service_unit_prices: { "svc-phone": 9.99, "svc-car": 19.99 },
        admin_fee: 0,
      },
    },
  };
  const breakdown = m.buildQuotePricingBreakdown(quote);
  assert.equal(breakdown.adjustmentLine.kind, "discount");
  assert.equal(breakdown.adjustmentLine.amount, 5);
});
