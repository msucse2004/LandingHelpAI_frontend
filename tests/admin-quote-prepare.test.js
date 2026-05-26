import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import test from "node:test";
import assert from "node:assert/strict";

const __dirname = dirname(fileURLToPath(import.meta.url));
const LOGIC_PATH = join(__dirname, "../src/assets/js/pages/admin-quote-prepare-logic.js");
const PAGE_JS = join(__dirname, "../src/assets/js/pages/admin-quote-prepare.js");
const PAGE_HTML = join(__dirname, "../src/pages/admin-quote-prepare.html");

async function importFreshLogic() {
  const url = pathToFileURL(LOGIC_PATH);
  url.searchParams.set("t", String(Date.now() + Math.random()));
  return import(url.href);
}

const draftQuote = {
  id: "q-1",
  status: "DRAFT",
  request_details: {
    quote_pricing: { admin_fee: 39.99 },
    survey_submission: {
      common_info: { profile_first_name: "Jane", profile_last_name: "Kim" },
      selected_services: [{ id: "svc-1", title: "Arrival Setup" }],
    },
  },
};

test("validateProposeFields blocks modal when required fields missing", async () => {
  const m = await importFreshLogic();
  const missingName = m.validateProposeFields("", 120);
  assert.deepEqual(missingName.clientErrors, ["서비스/패키지 표시명"]);
  assert.equal(m.shouldOpenProposeConfirmModal(missingName.clientErrors), false);

  const zeroTotal = m.validateProposeFields("Landing Package", 0);
  assert.deepEqual(zeroTotal.clientErrors, ["견적 총액(서비스 + Admin Fee, 0 초과)"]);
  assert.equal(m.shouldOpenProposeConfirmModal(zeroTotal.clientErrors), false);

  const adminFeeOnly = m.validateProposeFields("Landing Package", 39.99);
  assert.deepEqual(adminFeeOnly.clientErrors, []);
  assert.equal(m.shouldOpenProposeConfirmModal(adminFeeOnly.clientErrors), true);

  const ok = m.validateProposeFields("Landing Package", 150);
  assert.deepEqual(ok.clientErrors, []);
  assert.equal(m.shouldOpenProposeConfirmModal(ok.clientErrors), true);
});

test("buildQuoteEditorPayloadFromEditor includes admin fee in total", async () => {
  const m = await importFreshLogic();
  const payload = m.buildQuoteEditorPayloadFromEditor({
    serviceName: "Jane Kim Package",
    unitPriceMap: { "svc-1": 100, "svc-2": 49.995 },
    adminFee: 39.99,
    customerNote: "Welcome note",
    internalNotes: "internal",
  });
  assert.equal(payload.service_name, "Jane Kim Package");
  assert.equal(payload.estimated_cost, 189.99);
  assert.equal(payload.admin_fee, 39.99);
  assert.deepEqual(payload.service_unit_prices, { "svc-1": 100, "svc-2": 49.995 });
  assert.equal(payload.customer_facing_note, "Welcome note");
  assert.equal(payload.internal_notes, "internal");
});

test("buildCustomerPreviewStateFromEditor reflects admin fee line and total", async () => {
  const m = await importFreshLogic();
  const state = m.buildCustomerPreviewStateFromEditor({
    quote: draftQuote,
    selectedServices: [{ id: "svc-1", title: "Arrival Setup" }],
    unitPriceMap: { "svc-1": 200 },
    adminFee: 39.99,
    customerNote: "We included airport pickup tips.",
  });
  assert.match(state.subtitle, /Jane Kim/);
  assert.equal(state.items.length, 2);
  assert.equal(state.items[1].title, "Admin Fee");
  assert.match(state.items[0].priceText, /200/);
  assert.match(state.totalText, /239\.99/);
  assert.equal(state.note, "We included airport pickup tips.");
  assert.equal(state.noteEmpty, false);

  const emptyNote = m.buildCustomerPreviewStateFromEditor({
    quote: draftQuote,
    selectedServices: [{ id: "svc-1", title: "Arrival Setup" }],
    unitPriceMap: { "svc-1": 75.5 },
    adminFee: 39.99,
    customerNote: "   ",
  });
  assert.equal(emptyNote.noteEmpty, true);
  assert.match(emptyNote.totalText, /115\.49/);
});

test("computeQuoteTotal and readAdminFeeFromQuote defaults", async () => {
  const m = await importFreshLogic();
  assert.equal(m.computeQuoteTotal({ a: 10, b: 5 }, 39.99), 54.99);
  assert.equal(m.readAdminFeeFromQuote({ request_details: {} }), 39.99);
  assert.equal(m.readAdminFeeFromQuote(draftQuote), 39.99);
});

test("sumServiceUnitPrices rounds to cents", async () => {
  const m = await importFreshLogic();
  assert.equal(m.sumServiceUnitPrices({ a: 10.005, b: 20.004 }), 30.01);
});

test("non-DRAFT readonly policy disables inputs/buttons but keeps list link usable", async () => {
  const m = await importFreshLogic();
  const proposed = m.getReadonlyEditorPolicy("PROPOSED");
  assert.equal(proposed.isDraft, false);
  assert.equal(proposed.disableInputs, true);
  assert.equal(proposed.disableButtons, true);
  assert.equal(proposed.showWarning, true);
  assert.match(proposed.warningMessage, /수정할 수 없습니다/);
  assert.equal(proposed.proposeLinkEnabled, true);

  const draft = m.getReadonlyEditorPolicy("DRAFT");
  assert.equal(draft.isDraft, true);
  assert.equal(draft.disableInputs, false);
  assert.equal(draft.showWarning, false);
});

test("formatQuoteStatusLabel maps known statuses for badge display", async () => {
  const m = await importFreshLogic();
  assert.equal(m.formatQuoteStatusLabel("draft"), "초안");
  assert.equal(m.formatQuoteStatusLabel("PROPOSED"), "고객 검토 중");
  assert.equal(m.formatQuoteStatusLabel("UNKNOWN_X"), "UNKNOWN_X");
});

test("proposeQuoteToCustomer calls update then transition then getDetail", async () => {
  const m = await importFreshLogic();
  const calls = [];
  const quoteApi = {
    update: async (id, payload) => {
      calls.push(["update", id, payload]);
    },
    transition: async (id, status, reason) => {
      calls.push(["transition", id, status, reason]);
    },
    getDetail: async (id) => {
      calls.push(["getDetail", id]);
      return { id, status: "PROPOSED" };
    },
  };
  const payload = {
    service_name: "Pkg",
    estimated_cost: 138.99,
    service_unit_prices: { a: 99 },
    admin_fee: 39.99,
  };
  const result = await m.proposeQuoteToCustomer({
    qid: "q-99",
    buildPayload: () => payload,
    quoteApi,
  });
  assert.deepEqual(calls[0], ["update", "q-99", payload]);
  assert.deepEqual(calls[1], ["transition", "q-99", "PROPOSED", "Proposed by admin panel"]);
  assert.deepEqual(calls[2], ["getDetail", "q-99"]);
  assert.equal(result.status, "PROPOSED");
});

test("empty or missing survey_submission helpers do not throw", async () => {
  const m = await importFreshLogic();
  assert.equal(m.hasSurveySubmission({ request_details: {} }), false);
  assert.deepEqual(m.getSelectedServicesFromQuote({ request_details: {} }), []);
  assert.deepEqual(m.getSelectedServicesFromQuote({ request_details: { survey_submission: { selected_services: [] } } }), []);
  const previewOnlyFee = m.buildCustomerPreviewStateFromEditor({
    quote: { request_details: {} },
    selectedServices: [],
    unitPriceMap: {},
    adminFee: 39.99,
    customerNote: "",
  });
  assert.equal(previewOnlyFee.items.length, 1);
  assert.equal(previewOnlyFee.items[0].title, "Admin Fee");
});

test("smoke: draft UI anchors exist in HTML", () => {
  const html = readFileSync(PAGE_HTML, "utf8");
  assert.match(html, /id="qpRequestBody"/);
  assert.match(html, /id="qpSelectedServicePriceEditor"/);
  assert.match(html, /id="qpCustomerTotalHero"/);
  assert.match(html, /id="qpSelectedServiceTotal"/);
  assert.match(html, /id="qpCustomerPreview"/);
  assert.match(html, /id="qpProposeBtn"/);
  assert.match(html, /id="qpProposeConfirmDialog"/);
  assert.match(html, /id="qpProposeLink"/);
  assert.match(html, /id="qpEditorWarn"/);
});

test("smoke: page JS wires validation, modal, admin fee, and readonly helpers", () => {
  const js = readFileSync(PAGE_JS, "utf8");
  assert.match(js, /admin-quote-prepare-logic\.js/);
  assert.match(js, /validateProposeClientFields/);
  assert.match(js, /openProposeConfirmModal/);
  assert.match(js, /closeProposeConfirmModal/);
  assert.match(js, /proposeQuoteToCustomer/);
  assert.match(js, /applyQuoteEditorReadonlyState/);
  assert.match(js, /renderRequestSummaryCard/);
  assert.match(js, /qpAdminFee/);
  assert.match(js, /getAdminFeeFromInput/);
  assert.doesNotMatch(js, /qpProposeLink[\s\S]{0,80}setAttribute\("disabled"/);
});

test("smoke: propose click validates before opening modal", () => {
  const js = readFileSync(PAGE_JS, "utf8");
  const handler = js.match(/proposeBtn\?\.addEventListener\("click"[\s\S]*?openProposeConfirmModal\(quote, selectedServices\)/);
  assert.ok(handler, "propose click handler should open modal after validation");
  assert.match(handler[0], /validateProposeClientFields/);
  assert.match(handler[0], /clientErrors\.length/);
});
