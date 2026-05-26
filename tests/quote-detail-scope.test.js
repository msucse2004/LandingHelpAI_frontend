import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import test from "node:test";
import assert from "node:assert/strict";

const __dirname = dirname(fileURLToPath(import.meta.url));
const LOGIC_PATH = join(__dirname, "../src/assets/js/pages/quote-detail-scope-logic.js");

async function importFreshLogic() {
  const url = pathToFileURL(LOGIC_PATH);
  url.searchParams.set("t", String(Date.now() + Math.random()));
  return import(url.href);
}

test("detectQuoteScopeContext finds car and phone keywords", async () => {
  const m = await importFreshLogic();
  assert.equal(m.detectQuoteScopeContext([{ title: "자동차 조사/구입" }]).hasCar, true);
  assert.equal(m.detectQuoteScopeContext([{ title: "US phone setup" }]).hasPhone, true);
  assert.equal(m.detectQuoteScopeContext([{ title: "General relocation help" }]).hasCar, false);
});

test("buildQuoteScopeContent adds car-specific excluded items with emphasis", async () => {
  const m = await importFreshLogic();
  const content = m.buildQuoteScopeContent({ hasCar: true, hasPhone: false });
  const excludedIds = content.excluded.map((x) => x.id);
  assert.ok(excludedIds.includes("car_purchase_cost"));
  assert.ok(excludedIds.includes("insurance_tax_registration"));
  assert.ok(!excludedIds.includes("third_party_fees_general"));
  const emphasized = content.excluded.filter((x) => x.emphasis).map((x) => x.id);
  assert.deepEqual(emphasized, ["car_purchase_cost", "insurance_tax_registration"]);
});

test("buildQuoteScopeContent adds phone-specific excluded items with emphasis", async () => {
  const m = await importFreshLogic();
  const content = m.buildQuoteScopeContent({ hasCar: false, hasPhone: true });
  const emphasized = content.excluded.filter((x) => x.emphasis).map((x) => x.id);
  assert.deepEqual(emphasized, ["carrier_fees"]);
});

test("buildQuoteScopeContent uses general third-party line when no context match", async () => {
  const m = await importFreshLogic();
  const content = m.buildQuoteScopeContent({ hasCar: false, hasPhone: false });
  const excludedIds = content.excluded.map((x) => x.id);
  assert.ok(excludedIds.includes("third_party_fees_general"));
  assert.ok(!excludedIds.includes("carrier_fees"));
  assert.ok(!excludedIds.includes("car_purchase_cost"));
});

test("buildQuoteScopeContentFromQuote reads selected_services", async () => {
  const m = await importFreshLogic();
  const quote = {
    request_details: {
      survey_submission: {
        selected_services: [
          { title: "미국 전화번호 개통" },
          { title: "자동차 조사·구입" },
        ],
      },
    },
  };
  const content = m.buildQuoteScopeContentFromQuote(quote);
  assert.equal(content.context.hasCar, true);
  assert.equal(content.context.hasPhone, true);
  assert.ok(content.excluded.some((x) => x.id === "carrier_fees" && x.emphasis));
  assert.ok(content.excluded.some((x) => x.id === "car_purchase_cost" && x.emphasis));
});
