/**
 * Smoke: question group + bidding bundle editor in Customer Intake Builder.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import assert from "node:assert/strict";

const __dirname = dirname(fileURLToPath(import.meta.url));
const TAB_JS = join(__dirname, "../src/assets/js/pages/admin-service-intake-tab.js");
const HTML = join(__dirname, "../src/pages/admin-services.html");

test("bidding question groups use group-level UI, not per-child bidding checkboxes", () => {
  const src = readFileSync(TAB_JS, "utf8");
  assert.match(src, /msiQgIsBiddingGroup/);
  assert.match(src, /group_kind.*bidding/);
  assert.match(src, /msiDefaultBiddingVehicleGroupPayload/);
  assert.match(src, /msiQgBuildBiddingChildVisibility/);
  assert.doesNotMatch(src, /msi-qg-child-bidding/);
  assert.doesNotMatch(src, /msiQgChildBiddingUiHtml/);
});

test("intake toolbar uses Questions block only (no standalone Question add)", () => {
  const html = readFileSync(HTML, "utf8");
  const js = readFileSync(TAB_JS, "utf8");
  assert.match(html, /manageServiceIntakeAddQuestionGroupBtn/);
  assert.match(html, /add_questions/);
  assert.doesNotMatch(html, /manageServiceIntakeAddQuestionBtn/);
  assert.match(js, /msiDefaultStandardQuestionGroupPayload/);
  assert.match(js, /msiConvertLegacyQuestionToGroup/);
  assert.doesNotMatch(js, /manageServiceIntakeAddQuestionBtn/);
});

test("side editor saves only via Save; Cancel and backdrop discard", () => {
  const src = readFileSync(TAB_JS, "utf8");
  assert.match(src, /msiCaptureSideEditorSnapshot/);
  assert.match(src, /msiCancelSidePanel/);
  assert.match(src, /msiArmSideDismissGuard/);
  assert.match(src, /msiSideDismissGuardUntil/);
  assert.match(src, /manageServiceIntakeSideDeleteBtn.*msiCancelSidePanel/);
  assert.match(src, /manageServiceIntakeSideBackdrop[\s\S]{0,400}?msiCancelSidePanel/);
  assert.doesNotMatch(src, /manageServiceIntakeFieldForm[\s\S]{0,120}?addEventListener\("submit"/);
});

test("legacy field dialog does not auto-save on Enter; Cancel restores snapshot", () => {
  const src = readFileSync(TAB_JS, "utf8");
  assert.match(src, /msiCaptureFieldDialogSnapshot/);
  assert.match(src, /msiCancelFieldDialog/);
  assert.match(src, /msiRestoreFieldDialogFromSnapshot/);
  assert.match(src, /manageServiceIntakeDialogCancelBtn.*msiCancelFieldDialog/);
  assert.match(src, /addEventListener\("cancel"[\s\S]{0,120}?msiCancelFieldDialog/);
});

test("MSI_INPUT_TYPES includes Currency USD for question group fields", () => {
  const js = readFileSync(TAB_JS, "utf8");
  assert.match(js, /value:\s*"currency_usd"/);
  assert.match(js, /fallback:\s*"Currency USD"/);
});

test("bidding add-block toolbar is disabled (product-offer bidding uses standard intake)", () => {
  const js = readFileSync(TAB_JS, "utf8");
  const wf = readFileSync(join(__dirname, "../src/assets/js/pages/admin-service-workflow-tab.js"), "utf8");
  const html = readFileSync(HTML, "utf8");
  assert.match(wf, /workflowIntakeBiddingAddBlocksEnabled/);
  assert.equal(wf.includes("return false"), true);
  assert.doesNotMatch(html, /manageServiceIntakeAddBiddingGroupBtn/);
  assert.match(js, /MSI_BIDDING_ADD_BTN_IDS = \[\]/);
});

test("legacy vehicle preference helpers remain for saved admin templates only", () => {
  const js = readFileSync(TAB_JS, "utf8");
  assert.match(js, /vehicle-preference-intake\.js/);
  assert.match(js, /vehicle_preference_ui:\s*true/);
  assert.match(js, /buildAllVehiclePreferenceChildren/);
  const vp = readFileSync(join(__dirname, "../src/assets/js/intake/vehicle-preference-intake.js"), "utf8");
  assert.match(vp, /fieldDef\("preference_type"/);
  assert.match(vp, /buildVehiclePreferenceChildrenForCount/);
  assert.match(vp, /첫번째 선호 차량/);
  assert.match(js, /buildVehiclePreferenceChildrenForCount/);
});

test("bidding question group editor remains for legacy saved blocks", () => {
  const js = readFileSync(TAB_JS, "utf8");
  const html = readFileSync(HTML, "utf8");
  assert.match(js, /msiQgIsBiddingGroup/);
  assert.match(js, /msiQgBiddingGroupSettingsHtml/);
  assert.doesNotMatch(html, /manageServiceIntakeAddBiddingGroupBtn/);
  assert.doesNotMatch(js, /manageServiceIntakeAddBiddingGroupBtn/);
});
