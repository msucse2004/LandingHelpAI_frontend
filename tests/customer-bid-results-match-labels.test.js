import test from "node:test";
import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";

async function importFresh(modulePath) {
  const url = pathToFileURL(modulePath);
  url.searchParams.set("t", String(Date.now() + Math.random()));
  return await import(url.href);
}

const logicPath =
  "c:\\workspace\\LandingHelpAI\\LandingHelpAI_frontend\\src\\assets\\js\\pages\\customer-bid-results-logic.js";

const identityTranslate = (_key, fallback) => fallback;

test("English customer sees Within budget not Korean match label", async () => {
  const m = await importFresh(logicPath);
  const offer = {
    match: {
      matched_conditions: ["within_budget", "make_model_match"],
      warnings: [],
    },
  };
  assert.equal(m.formatMatchConditionCode("within_budget", identityTranslate), "Within budget");
  const label = m.offerMatchScoreLabel(offer, identityTranslate);
  assert.match(label, /Within budget/);
  assert.doesNotMatch(label, /예산 이내/);
});

test("English customer sees Alternative offer relation label not Korean", async () => {
  const m = await importFresh(logicPath);
  const offer = { is_alternative: true, linked_request_index: 1 };
  const relation = m.formatOfferRelationLabel(offer, identityTranslate);
  assert.equal(relation, "Alternative offer");
  assert.doesNotMatch(relation, /대안/);
});

test("formatMatchWarningCode maps alternative_vehicle code", async () => {
  const m = await importFresh(logicPath);
  assert.equal(
    m.formatMatchWarningCode("alternative_vehicle", identityTranslate),
    "Alternative vehicle",
  );
});

test("vehicle card price breakdown uses i18n labels not hardcoded only", async () => {
  const m = await importFresh(logicPath);
  const lines = m.formatVehiclePriceBreakdownLines(
    {
      pricing: {
        vehicle_price: 20000,
        dealer_fee: 500,
        estimated_total: 22000,
        currency: "USD",
      },
    },
    identityTranslate,
  );
  assert.ok(lines.some((line) => line.label === "Vehicle price"));
  assert.ok(lines.some((line) => line.label === "Dealer fee"));
  assert.ok(lines.some((line) => line.strong && line.label === "Estimated total"));
});

test("legacy Korean match strings are not echoed when codes are provided", async () => {
  const m = await importFresh(logicPath);
  const offer = {
    match: {
      matched_conditions: ["within_budget"],
      warnings: ["alternative_vehicle"],
    },
  };
  const summary = m.formatMatchCodesList(offer, identityTranslate, { useWarnings: true, limit: 5 });
  assert.deepEqual(summary, ["Alternative vehicle"]);
  assert.doesNotMatch(summary.join(" "), /대안/);
});
