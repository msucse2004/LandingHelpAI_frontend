import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import test from "node:test";
import assert from "node:assert/strict";

const __dirname = dirname(fileURLToPath(import.meta.url));
const LOGIC_PATH = join(__dirname, "../src/assets/js/intake/intake-form-presentation.js");

async function importFreshLogic() {
  const url = pathToFileURL(LOGIC_PATH);
  url.searchParams.set("t", String(Date.now() + Math.random()));
  return import(url.href);
}

test("normalizePrefillInputScalar strips display_label suffix", async () => {
  const { normalizePrefillInputScalar } = await importFreshLogic();
  const row = {
    label: "First Name",
    prefill_candidates: [{ value: "Bryan", label: "First Name", display_label: "Bryan - First Name" }],
  };
  assert.equal(normalizePrefillInputScalar("Bryan - First Name", row), "Bryan");
  assert.equal(normalizePrefillInputScalar("Bryan", row), "Bryan");
});

test("shouldHideIntakeBlockTitle hides New questions placeholder", async () => {
  const { shouldHideIntakeBlockTitle } = await importFreshLogic();
  assert.equal(shouldHideIntakeBlockTitle("New questions"), true);
  assert.equal(shouldHideIntakeBlockTitle("New questions *"), true);
  assert.equal(shouldHideIntakeBlockTitle("차량 선호"), false);
});

test("isEffectivelyEmptyIntakeHelpText treats lone dash as empty", async () => {
  const { isEffectivelyEmptyIntakeHelpText } = await importFreshLogic();
  assert.equal(isEffectivelyEmptyIntakeHelpText("-"), true);
  assert.equal(isEffectivelyEmptyIntakeHelpText("—"), true);
  assert.equal(isEffectivelyEmptyIntakeHelpText("안내 문구"), false);
});

test("resolveIntakeFieldInitialValue prefers cleaned prefill value", async () => {
  const { resolveIntakeFieldInitialValue } = await importFreshLogic();
  const row = {
    value: "Oh - Last Name",
    label: "Last Name",
    prefill: { enabled: true },
  };
  assert.equal(resolveIntakeFieldInitialValue(row), "Oh");
});

test("normalizePrefillInputScalar strips suffix using candidate label when field label differs", async () => {
  const { normalizePrefillInputScalar } = await importFreshLogic();
  const row = {
    label: "Email Address",
    prefill: { enabled: true, source_label: "Email" },
    prefill_candidates: [{ value: "demo@x.com", label: "Email", display_label: "demo@x.com - Email" }],
  };
  assert.equal(normalizePrefillInputScalar("demo@x.com - Email", row), "demo@x.com");
});

test("prefillUsesTextInputNotDropdown for single text prefill candidate", async () => {
  const { prefillUsesTextInputNotDropdown } = await importFreshLogic();
  assert.equal(
    prefillUsesTextInputNotDropdown({
      input_type: "text",
      prefill_mode: "dropdown_existing_values",
      prefill_candidates: [{ value: "Jane", label: "First Name" }],
    }),
    true
  );
  assert.equal(
    prefillUsesTextInputNotDropdown({
      input_type: "text",
      prefill_mode: "dropdown_existing_values",
      prefill_candidates: [
        { value: "A", label: "One" },
        { value: "B", label: "Two" },
      ],
    }),
    false
  );
  assert.equal(
    prefillUsesTextInputNotDropdown({
      input_type: "select",
      prefill_mode: "dropdown_existing_values",
      prefill_candidates: [{ value: "NC", label: "State" }],
    }),
    false
  );
});

test("prefillCandidateOptionLabel shows stored value only", async () => {
  const { prefillCandidateOptionLabel } = await importFreshLogic();
  assert.equal(
    prefillCandidateOptionLabel({
      value: "Bryan",
      label: "First Name",
      display_label: "Bryan - First Name",
    }),
    "Bryan"
  );
});

test("resolveIntakeFieldInitialValue uses prefill_resolved_value when value empty", async () => {
  const { resolveIntakeFieldInitialValue } = await importFreshLogic();
  const row = {
    label: "First Name",
    prefill_resolved_value: "Bryan - First Name",
    prefill: { enabled: false },
  };
  assert.equal(resolveIntakeFieldInitialValue(row), "Bryan");
});
test("intakeRequiredFieldError includes field label", async () => {
  const { intakeRequiredFieldError, intakeRequiredFieldErrorForInputType, intakeViewerFieldLabel } = await importFreshLogic();
  assert.equal(intakeRequiredFieldError("차량 브랜드", "select"), "「차량 브랜드」을(를) 선택해 주세요.");
  assert.equal(
    intakeRequiredFieldErrorForInputType("차량 구매 총 예산", "currency_usd"),
    "「차량 구매 총 예산」을(를) 입력해 주세요."
  );
  assert.equal(
    intakeViewerFieldLabel({ label: "한국어", display_label: "Current region" }),
    "Current region",
  );
  assert.equal(
    intakeRequiredFieldError({ label: "한국어", display_label: "Current region" }, "select"),
    "Please select 「Current region」.",
  );
});

test("normalizeIntakeFormPromptUiPayload cleans nested question_group children", async () => {
  const { normalizeIntakeFormPromptUiPayload } = await importFreshLogic();
  const up = {
    widget_type: "form_prompt",
    input_type: "intake_multi",
    steps: [
      {
        input_type: "question_group",
        children: [
          {
            label: "First Name",
            value: "Bryan - First Name",
            prefill: { enabled: true },
          },
        ],
      },
    ],
  };
  normalizeIntakeFormPromptUiPayload(up);
  assert.equal(up.steps[0].children[0].value, "Bryan");
});
