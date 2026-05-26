import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import test from "node:test";
import assert from "node:assert/strict";

const __dirname = dirname(fileURLToPath(import.meta.url));
const LOGIC_PATH = join(__dirname, "../src/assets/js/pages/quote-detail-request-logic.js");

async function importFreshLogic() {
  const url = pathToFileURL(LOGIC_PATH);
  url.searchParams.set("t", String(Date.now() + Math.random()));
  return import(url.href);
}

test("isCustomerVisibleText rejects UUID and profile refs", async () => {
  const m = await importFreshLogic();
  assert.equal(m.isCustomerVisibleText("abc-123"), true);
  assert.equal(m.isCustomerVisibleText("550e8400-e29b-41d4-a716-446655440000"), false);
  assert.equal(m.isCustomerVisibleText("profile::user@example.com"), false);
});

test("buildRequestSummaryRows filters internal ids from services", async () => {
  const m = await importFreshLogic();
  const quote = {
    request_details: {
      survey_submission: {
        selected_categories: [{ title: "정착 지원" }],
        selected_services: [
          { id: "550e8400-e29b-41d4-a716-446655440000", title: "미국 전화번호 개통", delivery_mode: "ai_guide" },
        ],
        common_info: { entry_date: "2026-06-01", target_city: "Austin", target_state: "TX" },
      },
    },
  };
  const rows = m.buildRequestSummaryRows(quote);
  assert.deepEqual(rows.helpAreas, ["정착 지원"]);
  assert.deepEqual(rows.services, ["미국 전화번호 개통"]);
  assert.equal(rows.deliveryModeKeys.length, 1);
  assert.match(rows.scheduleRegion, /Austin/);
});

test("requestSummaryHasVisibleRows is false when everything empty", async () => {
  const m = await importFreshLogic();
  const rows = m.buildRequestSummaryRows({ request_details: { survey_submission: {} } });
  assert.equal(m.requestSummaryHasVisibleRows(rows), false);
});
