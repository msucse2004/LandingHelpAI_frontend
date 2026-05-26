import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import test from "node:test";
import assert from "node:assert/strict";

const __dirname = dirname(fileURLToPath(import.meta.url));
const LOGIC_PATH = join(__dirname, "../src/assets/js/pages/quote-detail-support-logic.js");

async function importFreshLogic() {
  const url = pathToFileURL(LOGIC_PATH);
  url.searchParams.set("t", String(Date.now() + Math.random()));
  return import(url.href);
}

test("resolveSupportSectionTitleVariant uses agent title for ai_guide only", async () => {
  const m = await importFreshLogic();
  assert.equal(m.resolveSupportSectionTitleVariant(["ai_guide"]), "agent");
  assert.equal(m.resolveSupportSectionTitleVariant(["in_person"]), "general");
  assert.equal(m.resolveSupportSectionTitleVariant(["ai_guide", "in_person"]), "general");
});

test("buildQuoteSupportContent returns practical fixed bullet ids", async () => {
  const m = await importFreshLogic();
  const content = m.buildQuoteSupportContent(["ai_guide"]);
  assert.deepEqual(content.agentBulletIds, ["agent.1", "agent.2", "agent.3"]);
  assert.deepEqual(content.youBulletIds, ["you.1", "you.2", "you.3"]);
  assert.deepEqual(content.humanBulletIds, ["human.1", "human.2"]);
});

test("buildQuoteSupportContent uses in_person support bullets", async () => {
  const m = await importFreshLogic();
  const content = m.buildQuoteSupportContent(["in_person"]);
  assert.equal(content.contentVariant, "in_person");
  assert.ok(content.agentBulletIds[0].startsWith("support.in_person"));
});

test("buildQuoteSupportContent uses general support bullets for guided-only quotes", async () => {
  const m = await importFreshLogic();
  const content = m.buildQuoteSupportContent(["general"]);
  assert.equal(m.resolveSupportSectionTitleVariant(["general"]), "general");
  assert.equal(content.contentVariant, "general");
  assert.ok(content.agentBulletIds[0].startsWith("support.general"));
});
