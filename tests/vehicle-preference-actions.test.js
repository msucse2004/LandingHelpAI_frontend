import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const VP_JS = join(__dirname, "../src/assets/js/intake/vehicle-preference-intake.js");

test("vehicle preference renders action area with submit and add buttons", () => {
  const src = readFileSync(VP_JS, "utf8");
  assert.match(src, /data-vp-actions/);
  assert.match(src, /data-vp-submit/);
  assert.match(src, /data-vp-add/);
  assert.match(src, /syncVpActions/);
  assert.match(src, /triggerIntakeFormSubmitFromVpRoot/);
  assert.match(src, /data-lhai-intake-submit/);
  assert.match(src, /Submit with 1 vehicle preference/);
  assert.match(src, /Submit with 2 vehicle preferences/);
});

test("vehicle preference submit reuses existing intake handler via click", () => {
  const src = readFileSync(VP_JS, "utf8");
  assert.doesNotMatch(src, /collectVehiclePreferenceGroupAnswers[\s\S]{0,200}submitIntake/);
  assert.match(src, /submitBtn\.click\(\)/);
});
