import test from "node:test";
import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";

async function importFresh(modulePath) {
  const url = pathToFileURL(modulePath);
  url.searchParams.set("t", String(Date.now() + Math.random()));
  return await import(url.href);
}

const modPath =
  "c:\\workspace\\LandingHelpAI\\LandingHelpAI_frontend\\src\\assets\\js\\intake\\vehicle-preference-intake.js";

test("year_min options are built from reference calendar year", async () => {
  const m = await importFresh(modPath);
  const pairs = m.vehiclePreferenceYearMinOptionPairs(2026);
  assert.equal(pairs[0][0], "any");
  assert.equal(pairs[1][0], "2026");
  assert.equal(pairs[1][1], "2026 or newer");
  assert.equal(pairs[pairs.length - 1][0], "2020");
  assert.equal(pairs.length, 8);
});

test("applyDynamicYearMinOptionsToChildren updates year_min rows only", async () => {
  const m = await importFresh(modPath);
  const out = m.applyDynamicYearMinOptionsToChildren(
    [
      { id: "vp1_make", car_answer_key: "make", options: [{ value: "any", label: "Any" }] },
      { id: "vp1_year_min", car_answer_key: "year_min", options: [{ value: "2018", label: "old" }] },
    ],
    2026
  );
  assert.equal(out[0].options[0].value, "any");
  assert.equal(out[1].options[1].value, "2026");
});
