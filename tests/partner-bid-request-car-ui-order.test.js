import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const ROOT = process.cwd();
const CAR_UI = join(ROOT, "src/assets/js/pages/partner-bid-request-car-ui.js");

/** Test E (automated): partner CAR detail render order. */
test("car UI renders brief, intake disclosure, then vehicle offer form", () => {
  const js = readFileSync(CAR_UI, "utf8");
  const stackIdx = js.indexOf("lhai-par-car__request-stack");
  const briefIdx = js.indexOf("renderAiBidRequestBriefCard");
  const disclosureIdx = js.indexOf("renderFullIntakeAnswersDisclosure");
  const offerIdx = js.indexOf("renderVehicleOfferFormHtml");
  assert.ok(stackIdx >= 0, "request stack container");
  assert.ok(briefIdx >= 0 && disclosureIdx >= 0 && offerIdx >= 0, "render helpers");
  assert.ok(briefIdx < disclosureIdx, "brief before disclosure");
  assert.ok(disclosureIdx < offerIdx, "disclosure before offer form");
});

test("car UI removed fixed budget timeline rows from hero summary", () => {
  const js = readFileSync(CAR_UI, "utf8");
  assert.doesNotMatch(js, /<dt>구매 방식<\/dt>/);
  assert.doesNotMatch(js, /<dt>전체 예산<\/dt>/);
  assert.doesNotMatch(js, /<dt>구매 희망 시기<\/dt>/);
});
