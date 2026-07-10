import test from "node:test";
import assert from "node:assert/strict";

import {
  messageTranslationPreparingFormLabel,
  messageTranslationPreparingMessageLabel,
  messageTranslationPreparingPreviewLabel,
  messageTranslationPreparingTitleLabel,
  messageTranslationRequiredFailedLabel,
  messageTranslationRetryLaterLabel,
} from "../src/assets/js/pages/messages-display-logic.js";

/** Step 11: helpers must call t(key, English source) — no locale hardcoding in messages.js. */
function captureTranslate(key, fallback) {
  return `${key}::${fallback}`;
}

const STEP11_PLACEHOLDERS = [
  {
    helper: messageTranslationPreparingTitleLabel,
    key: "messages.translation.preparing_title",
    en: "Preparing title translation...",
  },
  {
    helper: messageTranslationPreparingMessageLabel,
    key: "messages.translation.preparing_message",
    en: "Preparing message translation...",
  },
  {
    helper: messageTranslationPreparingFormLabel,
    key: "messages.translation.preparing_form",
    en: "This form is being prepared in your language.",
  },
  {
    helper: messageTranslationPreparingPreviewLabel,
    key: "messages.translation.preparing_preview",
    en: "Preparing preview translation...",
  },
  {
    helper: messageTranslationRetryLaterLabel,
    key: "messages.translation.retry_later",
    en: "Please refresh shortly. If this continues, contact support.",
  },
  {
    helper: messageTranslationRequiredFailedLabel,
    key: "messages.translation.required_failed",
    en: "Translation is required but not ready yet.",
  },
];

for (const { helper, key, en } of STEP11_PLACEHOLDERS) {
  test(`Step 11: ${key} uses English fallback via translate()`, () => {
    assert.equal(helper(captureTranslate), `${key}::${en}`);
    assert.doesNotMatch(en, /[\u3131-\uD79D]/, "fallback must not embed Korean copy");
  });
}
