import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const VP_JS = join(ROOT, "src/assets/js/intake/vehicle-preference-intake.js");
const PARTNER_JS = join(ROOT, "src/assets/js/pages/partner-bid-request-car-logic.js");

test("vehicle preference templates include simple/detailed mode fields", () => {
  const src = readFileSync(VP_JS, "utf8");
  assert.match(src, /car_answer_key:\s*"detail_level"/);
  assert.match(src, /car_answer_key:\s*"top_priorities"/);
  assert.match(src, /car_answer_key:\s*"must_have_features"/);
  assert.match(src, /data-vp-more-details/);
  assert.match(src, /VP_SIMPLE_FIELDS/);
  assert.match(src, /validateVehiclePreferenceGroup/);
});

test("partner vehicle request helpers support simple and detailed summaries", () => {
  const src = readFileSync(PARTNER_JS, "utf8");
  assert.match(src, /vehicleRequestModeLine/);
  assert.match(src, /vehicleRequestDetailLevel/);
  assert.match(src, /Customer provided simple preferences/);
});
