import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import test from "node:test";
import assert from "node:assert/strict";

const __dirname = dirname(fileURLToPath(import.meta.url));
const LOGIC_PATH = join(__dirname, "../src/assets/js/pages/invoice-detail-services-logic.js");

async function importFreshLogic() {
  const url = pathToFileURL(LOGIC_PATH);
  url.searchParams.set("t", String(Date.now() + Math.random()));
  return import(url.href);
}

const invoice = { currency: "USD", amount_due: 69.97, service_name: "Landing package" };

const quoteWithServices = {
  currency: "USD",
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

test("buildInvoiceServiceRows includes services and admin fee row", async () => {
  const m = await importFreshLogic();
  const { rows, empty } = m.buildInvoiceServiceRows(invoice, quoteWithServices);
  assert.equal(empty, false);
  assert.equal(rows.length, 3);
  assert.equal(rows[0].title, "미국 전화번호 개통");
  assert.equal(rows[0].amount, 9.99);
  assert.equal(rows[0].hintKey, "phone");
  assert.equal(rows[1].hintKey, "car");
  assert.equal(rows[2].type, "admin_fee");
  assert.equal(rows[2].amount, 39.99);
});

test("isAdminFeeLineLabel detects Admin Fee variants", async () => {
  const m = await importFreshLogic();
  assert.equal(m.isAdminFeeLineLabel("Admin Fee"), true);
  assert.equal(m.isAdminFeeLineLabel("Base service"), false);
});

test("customerFriendlyLineLabel never returns Admin Fee text", async () => {
  const m = await importFreshLogic();
  assert.equal(m.customerFriendlyLineLabel("Admin Fee", "My package"), "");
  assert.equal(m.customerFriendlyLineLabel("Base service", "My package"), "My package");
});

test("buildInvoiceServiceRows falls back to invoice service_name when quote missing", async () => {
  const m = await importFreshLogic();
  const { rows, empty } = m.buildInvoiceServiceRows(
    { currency: "USD", amount_due: 50, service_name: "Arrival and Setup" },
    null,
  );
  assert.equal(empty, false);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].title, "Arrival and Setup");
  assert.equal(rows[0].amount, 50);
});

test("buildInvoiceServiceRows empty when no services and no package name", async () => {
  const m = await importFreshLogic();
  const { empty, rows } = m.buildInvoiceServiceRows({ currency: "USD", amount_due: 0, service_name: "" }, null);
  assert.equal(empty, true);
  assert.equal(rows.length, 0);
});
