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

  assert.equal(typeof mod.isMeaninglessBriefingValue, "function");
  assert.equal(typeof mod.filterPartnerIntakeAnswerRows, "function");
  assert.equal(mod.isMeaninglessBriefingValue("__skipped__"), true);
  assert.equal(mod.isMeaninglessBriefingValue(0), false);
  assert.equal(mod.isMeaninglessBriefingValue(false), false);
  assert.equal(mod.isMeaninglessBriefingValue("なし"), true);

  const filtered = mod.filterPartnerIntakeAnswerRows([
    { label: "Model", value: "X5", display_value: "X5" },
    { label: "Trim", value: "__skipped__", display_value: "__skipped__" },
    { label: "Vehicle", kind: "section", value: "", display_value: "" },
  ]);
  assert.equal(filtered.length, 2);

  const fallback = mod.renderAiBidRequestBriefCard(null);
  assert.match(fallback, /고객 요청 브리핑을 생성하지 못했습니다/);

  const fallbackOllama = mod.renderAiBidRequestBriefCard({
    provider: "fallback",
    fallback_used: true,
    _internal: { error_kind: "ollama_unavailable" },
  });
  assert.match(fallbackOllama, /Ollama/);

  const simpleBrief = mod.renderAiBidRequestBriefCard({
    partner_display: {
      headline: "Car purchase intake",
      lines: [
        { label: "Budget", value: "25000" },
        { label: "Brand", value: "BMW" },
      ],
    },
  });
  assert.match(simpleBrief, /Car purchase intake/);
  assert.match(simpleBrief, /lhai-par-bid__brief-kv-list/);
  assert.match(simpleBrief, /Budget: 25000/);
  assert.doesNotMatch(simpleBrief, /핵심 조건/);
  assert.doesNotMatch(simpleBrief, /brief-kp-grid/);

  const brief = mod.renderAiBidRequestBriefCard({
    brief_title: "BMW 중고차 구매 요청",
    one_line_summary: "Morrisville, NC · $25,000 예산",
    key_points: [{ label: "예산", value: "약 $25,000" }],
    missing_or_unclear: ["구체적인 모델은 제공되지 않았습니다."],
    partner_guidance: "예산에 맞는 BMW 중고차를 제안하세요.",
  });
  assert.match(brief, /BMW 중고차 구매 요청/);
  assert.match(brief, /예산: 약 \$25,000/);
  assert.match(brief, /확인 필요/);
  assert.match(brief, /파트너 안내/);
  assert.doesNotMatch(brief, /핵심 조건/);

  const piiBrief = mod.renderAiBidRequestBriefCard({
    brief_title: "Auto purchase",
    key_points: [
      { label: "First Name", value: "Jordan" },
      { label: "차량 상태", value: "중고차" },
      { label: "예산", value: "25000" },
      { label: "선호 브랜드", value: "BMW" },
    ],
  });
  assert.doesNotMatch(piiBrief, /First Name/);
  assert.match(piiBrief, /차량 상태: 중고차/);
  assert.match(piiBrief, /예산: 25000/);

  const genericSummary = mod.renderAiBidRequestBriefCard({
    brief_title: "Car",
    one_line_summary: "Please review the customer's request details below.",
    key_points: [{ label: "Budget", value: "25k" }],
  });
  assert.doesNotMatch(genericSummary, /request details below/);

  const emptyKp = mod.renderAiBidRequestBriefCard({
    brief_title: "Car",
    key_points: [],
    partner_guidance: "Check intake.",
  });
  assert.match(emptyKp, /전체 인테이크 답변을 확인해 주세요/);

  assert.equal(mod.isPersonalOrSensitiveBriefingLabel("First Name"), true);
  assert.equal(mod.isPersonalOrSensitiveBriefingLabel("지역"), false);
  assert.equal(mod.shouldShowBriefKeyPoint({ label: "Phone", value: "555-1234" }), false);

  const disclosure = mod.renderFullIntakeAnswersDisclosure([
    { label: "전체 예산", value: "25000", display_value: "$25,000" },
    { label: "Trim", value: "__skipped__", display_value: "__skipped__" },
  ]);
  assert.match(disclosure, /전체 인테이크 답변 보기/);
  assert.match(disclosure, /lhai-par-bid__intake-q/);
  const localized = mod.renderFullIntakeAnswersDisclosure([
    {
      label: "예산",
      display_label: "Budget",
      value: "25000",
      display_value: "$25,000",
    },
  ]);
  assert.match(localized, /Budget/);
  assert.doesNotMatch(localized, />예산</);
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

test("intake display hides raw Korean when translation_required_failed", async () => {
  const mod = await import(`file:///${MOD.replace(/\\/g, "/")}`);
  const translate = (key, fallback) => {
    if (key === "messages.translation.preparing_form") return "Preparing form label...";
    if (key === "messages.translation.preparing_message") return "Preparing message...";
    return fallback;
  };
  const label = mod.partnerIntakeAnswerDisplayLabel(
    {
      label: "예산",
      value: "신차",
      display_label: "",
      display_value: "",
      source_locale: "ko",
      display_locale: "en",
      translation_status: "translation_required_failed",
    },
    translate,
  );
  const value = mod.partnerIntakeAnswerDisplayValue(
    {
      label: "예산",
      value: "신차",
      display_label: "",
      display_value: "",
      source_locale: "ko",
      display_locale: "en",
      translation_status: "translation_required_failed",
    },
    translate,
  );
  assert.equal(label, "Preparing form label...");
  assert.equal(value, "Preparing message...");
  assert.doesNotMatch(label, /예산/);
  assert.doesNotMatch(value, /신차/);
});

test("intake display blocks raw fallback on cross-locale missing display", async () => {
  const mod = await import(`file:///${MOD.replace(/\\/g, "/")}`);
  const translate = (key, fallback) => {
    if (key === "messages.translation.preparing_form") return "Preparing form label...";
    if (key === "messages.translation.preparing_message") return "Preparing message...";
    return fallback;
  };
  const row = {
    label: "예산",
    value: "25000",
    display_label: "",
    display_value: "",
    source_locale: "ko",
    display_locale: "en",
    translation_status: "translation_required_failed",
  };
  const label = mod.partnerIntakeAnswerDisplayLabel(row, translate);
  const value = mod.partnerIntakeAnswerDisplayValue(row, translate);
  assert.equal(label, "Preparing form label...");
  assert.equal(value, "Preparing message...");
  assert.doesNotMatch(label, /예산/);
  assert.doesNotMatch(value, /25000/);

  const withoutSourceLocale = { ...row, source_locale: undefined };
  const rawFallbackLabel = mod.partnerIntakeAnswerDisplayLabel(withoutSourceLocale, translate);
  assert.equal(rawFallbackLabel, "Preparing form label...");
});

test("intake display allows same-locale Korean source for ko viewer", async () => {
  const mod = await import(`file:///${MOD.replace(/\\/g, "/")}`);
  const label = mod.partnerIntakeAnswerDisplayLabel({
    label: "예산",
    value: "신차",
    display_label: "예산",
    display_value: "신차",
    source_locale: "ko",
    display_locale: "ko",
    translation_status: "not_required",
  });
  const value = mod.partnerIntakeAnswerDisplayValue({
    label: "예산",
    value: "신차",
    display_label: "예산",
    display_value: "신차",
    source_locale: "ko",
    display_locale: "ko",
    translation_status: "not_required",
  });
  assert.equal(label, "예산");
  assert.equal(value, "신차");
});

test("brief card uses multiline kv list not card grid", async () => {
  const mod = await import(`file:///${join(ROOT, "src/assets/js/pages/partner-bid-request-intake-display.js").replace(/\\/g, "/")}`);
  const html = mod.renderAiBidRequestBriefCard({
    brief_title: "자동차 조사/구입",
    key_points: [
      { label: "차량 상태", value: "중고차 (Pre-owned)" },
      { label: "예산", value: "25000" },
      { label: "선호 브랜드", value: "BMW" },
    ],
  });
  assert.match(html, /lhai-par-bid__brief-kv-list/);
  assert.match(html, /차량 상태: 중고차 \(Pre-owned\)/);
  assert.doesNotMatch(html, /brief-kp-grid/);
  assert.doesNotMatch(html, /First Name/);
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
