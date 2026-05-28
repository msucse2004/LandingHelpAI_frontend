import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const ROOT = process.cwd();
const MOD = join(ROOT, "src/assets/js/pages/partner-bid-request-intake-display.js");

test("intake display exports briefing and disclosure renderers", async () => {
  const mod = await import(`file:///${MOD.replace(/\\/g, "/")}`);
  assert.equal(typeof mod.renderAiBidRequestBriefCard, "function");
  assert.equal(typeof mod.renderFullIntakeAnswersDisclosure, "function");

  const fallback = mod.renderAiBidRequestBriefCard(null);
  assert.match(fallback, /고객 요청 브리핑을 생성하지 못했습니다/);

  const fallbackOllama = mod.renderAiBidRequestBriefCard({
    provider: "fallback",
    fallback_used: true,
    _internal: { error_kind: "ollama_unavailable" },
  });
  assert.match(fallbackOllama, /Ollama/);

  const brief = mod.renderAiBidRequestBriefCard({
    brief_title: "BMW 중고차 구매 요청",
    one_line_summary: "Morrisville, NC · $25,000 예산",
    key_points: [{ label: "예산", value: "약 $25,000" }],
    missing_or_unclear: ["구체적인 모델은 제공되지 않았습니다."],
    partner_guidance: "예산에 맞는 BMW 중고차를 제안하세요.",
  });
  assert.match(brief, /BMW 중고차 구매 요청/);
  assert.match(brief, /핵심 조건/);
  assert.match(brief, /확인 필요/);
  assert.match(brief, /파트너 안내/);

  const disclosure = mod.renderFullIntakeAnswersDisclosure([
    { label: "전체 예산", value: "25000", display_value: "$25,000" },
  ]);
  assert.match(disclosure, /전체 인테이크 답변 보기/);
  assert.match(disclosure, /lhai-par-bid__intake-q/);
  const section = mod.renderFullIntakeAnswersDisclosure([
    { label: "Vehicle preferences", kind: "section", value: "", display_value: "" },
    { label: "Brand", value: "BMW", display_value: "BMW" },
  ]);
  assert.match(section, /lhai-par-bid__intake-section-title/);
  assert.match(section, /Vehicle preferences/);
  assert.match(disclosure, /전체 예산/);
  assert.match(disclosure, /\$25,000/);
  assert.doesNotMatch(disclosure, /__skipped__/);

  const empty = mod.renderFullIntakeAnswersDisclosure([]);
  assert.match(empty, /파트너에게 공개된 인테이크 답변이 없습니다/);
});

test("car UI uses new render order", () => {
  const js = readFileSync(join(ROOT, "src/assets/js/pages/partner-bid-request-car-ui.js"), "utf8");
  assert.match(js, /renderAiBidRequestBriefCard/);
  assert.match(js, /renderFullIntakeAnswersDisclosure/);
  assert.match(js, /renderVehicleOfferFormHtml/);
  assert.doesNotMatch(js, /구매 방식/);
  assert.match(js, /견적 요청/);
  assert.match(js, /내 견적/);
  assert.match(js, /partnerBidRequestRoundLabel/);
});
