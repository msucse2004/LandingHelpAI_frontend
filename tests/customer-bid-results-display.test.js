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

const esc = (s) => String(s);

const enTranslate = (key, fallback) => {
  if (key === "messages.translation.preparing_title") return "Preparing title translation...";
  if (key === "messages.translation.preparing_message") return "Preparing message...";
  return fallback;
};

function crossLocaleCarOffer(overrides = {}) {
  return {
    offer_id: "offer_1",
    bid_id: "bid-1",
    source_locale: "ko",
    display_locale: "en",
    translation_status: "translated",
    vehicle: {
      year: 2022,
      make: "Toyota",
      model: "Camry",
      mileage: 12000,
      accident_history: "사고 이력 없음",
      display_accident_history: "No accident history",
      title_status: "CLEAN",
      display_title_status: "Clean title",
      condition: "USED",
      display_condition: "Used",
    },
    service: {
      message: "이번 주에 인도 가능합니다",
      display_message: "Available this week",
      available_timeline: "2주",
      display_available_timeline: "2 weeks",
      included_services: ["한국어 서비스"],
      display_included_services: ["English service"],
    },
    estimated_total: 22000,
    currency: "USD",
    is_alternative: false,
    match: { match_score: 80, matched_conditions: [], warnings: [] },
    ...overrides,
  };
}

test("English viewer uses display_accident_history not raw Korean label", async () => {
  const m = await importFresh(logicPath);
  const offer = crossLocaleCarOffer();
  assert.equal(m.offerDisplayAccidentHistory(offer, enTranslate), "No accident history");
  const html = m.buildVehicleOfferCardHtml(
    offer,
    { phase: "OPEN", activeSort: "recommended", translate: enTranslate },
    esc,
  );
  assert.match(html, /No accident history/);
  assert.doesNotMatch(html, /사고 이력 없음/);
});

test("English viewer uses display_message not raw Korean partner message", async () => {
  const m = await importFresh(logicPath);
  const offer = crossLocaleCarOffer();
  assert.equal(m.offerDisplayPartnerMessage(offer, enTranslate), "Available this week");
  const html = m.buildVehicleOfferCardHtml(
    offer,
    { phase: "OPEN", activeSort: "recommended", translate: enTranslate },
    esc,
  );
  assert.match(html, /Available this week/);
  assert.doesNotMatch(html, /이번 주에 인도 가능합니다/);
});

test("Korean viewer same locale sees Korean display_message", async () => {
  const m = await importFresh(logicPath);
  const korean = "이번 주에 인도 가능합니다";
  const offer = {
    offer_id: "offer_1",
    bid_id: "bid-1",
    source_locale: "ko",
    display_locale: "ko",
    translation_status: "not_required",
    service: {
      message: korean,
      display_message: korean,
    },
    vehicle: { year: 2022, make: "Toyota", model: "Camry" },
    estimated_total: 22000,
    currency: "USD",
    is_alternative: false,
    match: { match_score: 0, matched_conditions: [], warnings: [] },
  };
  assert.equal(m.offerDisplayPartnerMessage(offer), korean);
  const html = m.buildVehicleOfferCardHtml(offer, { phase: "OPEN", activeSort: "recommended" }, esc);
  assert.match(html, /이번 주에 인도 가능합니다/);
});

test("translation_required_failed shows placeholder not raw Korean", async () => {
  const m = await importFresh(logicPath);
  const offer = crossLocaleCarOffer({
    translation_status: "translation_required_failed",
    display_title: null,
    title: "한국어 제목",
    service: {
      message: "이번 주에 인도 가능합니다",
      display_message: null,
    },
    vehicle: {
      accident_history: "사고 이력 없음",
      display_accident_history: null,
    },
  });
  assert.equal(m.offerDisplayTitle(offer, enTranslate), "Preparing title translation...");
  assert.equal(m.offerDisplayPartnerMessage(offer, enTranslate), "Preparing message...");
  assert.equal(m.offerDisplayAccidentHistory(offer, enTranslate), null);
  const html = m.buildVehicleOfferCardHtml(
    offer,
    { phase: "OPEN", activeSort: "recommended", translate: enTranslate },
    esc,
  );
  assert.match(html, /Preparing message/);
  assert.doesNotMatch(html, /이번 주에 인도 가능합니다/);
  assert.doesNotMatch(html, /사고 이력 없음/);
  const confirm = m.buildCustomerBidSelectConfirmContent("OPEN", offer, {}, enTranslate);
  assert.match(confirm.bodyHtml, /Preparing title translation/);
  assert.doesNotMatch(confirm.bodyHtml, /한국어 제목/);
});

test("vehicle detail modal uses display fields for message and accident", async () => {
  const m = await importFresh(logicPath);
  const offer = crossLocaleCarOffer();
  const html = m.buildVehicleOfferDetailModalHtml(
    offer,
    { phase: "OPEN", activeSort: "recommended", translate: enTranslate },
    esc,
  );
  assert.match(html, /No accident history/);
  assert.match(html, /Available this week/);
  assert.match(html, /English service/);
  assert.doesNotMatch(html, /사고 이력 없음/);
  assert.doesNotMatch(html, /이번 주에 인도 가능합니다/);
});
