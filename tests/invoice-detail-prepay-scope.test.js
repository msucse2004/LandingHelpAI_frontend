import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import test from "node:test";
import assert from "node:assert/strict";

const __dirname = dirname(fileURLToPath(import.meta.url));
const LOGIC_PATH = join(__dirname, "../src/assets/js/pages/invoice-detail-prepay-scope-logic.js");

async function importFreshLogic() {
  const url = pathToFileURL(LOGIC_PATH);
  url.searchParams.set("t", String(Date.now() + Math.random()));
  return import(url.href);
}

const quotePhoneCar = {
  request_details: {
    survey_submission: {
      selected_services: [
        { id: "1", title: "미국 전화번호 개통" },
        { id: "2", title: "자동차 조사/구입" },
      ],
    },
  },
};

test("buildInvoicePrepayScopeContent emphasizes phone and car excluded rows", async () => {
  const m = await importFreshLogic();
  const c = m.buildInvoicePrepayScopeContent(quotePhoneCar, {});
  assert.equal(c.context.hasPhone, true);
  assert.equal(c.context.hasCar, true);
  const carrier = c.excluded.find((x) => x.id === "carrier_fees");
  const ins = c.excluded.find((x) => x.id === "insurance_tax_registration");
  assert.equal(carrier?.emphasis, true);
  assert.equal(ins?.emphasis, true);
  assert.equal(c.included.length, 4);
  assert.equal(c.excluded.length, 6);
});

test("buildInvoicePrepayScopeContent uses invoice service_name when no quote services", async () => {
  const m = await importFreshLogic();
  const c = m.buildInvoicePrepayScopeContent(null, { service_name: "US mobile phone setup" });
  assert.equal(c.context.hasPhone, true);
  assert.equal(c.context.hasCar, false);
});
