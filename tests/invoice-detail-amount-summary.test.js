import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import test from "node:test";
import assert from "node:assert/strict";

const __dirname = dirname(fileURLToPath(import.meta.url));
const LOGIC_PATH = join(__dirname, "../src/assets/js/pages/invoice-detail-amount-summary-logic.js");

async function importFreshLogic() {
  const url = pathToFileURL(LOGIC_PATH);
  url.searchParams.set("t", String(Date.now() + Math.random()));
  return import(url.href);
}

const invoiceSent = {
  status: "SENT",
  currency: "USD",
  amount_due: 69.97,
  service_name: "Landing package",
};

const quote = {
  currency: "USD",
  tax_amount: 0,
  items: [],
  request_details: {
    quote_pricing: {
      service_unit_prices: { "svc-phone": 9.99, "svc-car": 19.99 },
      admin_fee: 39.99,
    },
    survey_submission: {
      selected_services: [
        { id: "svc-phone", title: "미국 전화번호 개통", delivery_mode: "ai_guide" },
        { id: "svc-car", title: "자동차 조사/구입", delivery_mode: "ai_guide" },
      ],
    },
  },
};

const billingSame = {
  currency: "USD",
  base_service_amount: 9.99,
  add_ons_amount: 19.99,
  admin_fee_amount: 39.99,
  discounts_amount: 0,
  surcharges_amount: 0,
  taxes_and_fees_amount: 0,
  subtotal_excluding_tax: 69.97,
  invoice_total: 69.97,
  amount_already_paid: 0,
  current_payable_amount: 69.97,
  reconciliation_note: "",
};

test("same total and payable omits duplicate invoice total footer row", async () => {
  const m = await importFreshLogic();
  const d = m.buildInvoiceAmountSummaryDisplay(invoiceSent, quote, billingSame);
  assert.equal(d.samePayableAsTotal, true);
  assert.ok(d.bodyRows.some((r) => r.label === "미국 전화번호 개통"));
  assert.ok(d.bodyRows.some((r) => r.label === "__admin_fee__"));
  assert.equal(
    d.footRows.some((r) => r.labelKey === "invoice_total"),
    false,
  );
  const finalRow = d.footRows.find((r) => r.labelKey === "current_payable");
  assert.equal(finalRow?.amount, 69.97);
  assert.ok(finalRow?.emphasize);
});

test("split totals show invoice total and amount paid", async () => {
  const m = await importFreshLogic();
  const billingSplit = {
    ...billingSame,
    invoice_total: 100,
    amount_already_paid: 30,
    current_payable_amount: 70,
  };
  const d = m.buildInvoiceAmountSummaryDisplay(invoiceSent, quote, billingSplit);
  assert.equal(d.samePayableAsTotal, false);
  assert.ok(d.footRows.some((r) => r.labelKey === "invoice_total"));
  assert.ok(d.footRows.some((r) => r.labelKey === "amount_paid"));
  assert.equal(d.footRows.find((r) => r.labelKey === "current_payable")?.amount, 70);
});

test("body rows use service names not Admin Fee literal", async () => {
  const m = await importFreshLogic();
  const d = m.buildInvoiceAmountSummaryDisplay(invoiceSent, quote, billingSame);
  const labels = d.bodyRows.map((r) => r.label).join(" ");
  assert.ok(!/\bAdmin Fee\b/i.test(labels));
  assert.ok(labels.includes("__admin_fee__"));
});
