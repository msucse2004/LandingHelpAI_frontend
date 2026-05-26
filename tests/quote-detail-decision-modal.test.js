import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import test from "node:test";
import assert from "node:assert/strict";

const __dirname = dirname(fileURLToPath(import.meta.url));
const LOGIC_PATH = join(__dirname, "../src/assets/js/pages/quote-detail-decision-modal.js");

async function importFreshLogic() {
  const url = pathToFileURL(LOGIC_PATH);
  url.searchParams.set("t", String(Date.now() + Math.random()));
  return import(url.href);
}

test("canCustomerDecideOnQuote allows PROPOSED only", async () => {
  const m = await importFreshLogic();
  assert.equal(m.canCustomerDecideOnQuote("PROPOSED"), true);
  assert.equal(m.canCustomerDecideOnQuote("APPROVED"), false);
  assert.equal(m.canCustomerDecideOnQuote("ACCEPTED"), false);
});

test("buildRejectTransitionNote includes optional customer reason in note", async () => {
  const m = await importFreshLogic();
  assert.equal(m.buildRejectTransitionNote(""), "Rejected by customer");
  assert.equal(m.buildRejectTransitionNote("  too expensive  "), "Rejected by customer: too expensive");
});
