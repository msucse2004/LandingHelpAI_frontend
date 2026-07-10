/**
 * Step 14 — regression: wrong-locale source must not render as visible fallback.
 */
import test from "node:test";
import assert from "node:assert/strict";

import {
  formPromptDisplayLabel,
  intakeUiPayloadNeedsTranslationPlaceholder,
  intakeUiPayloadSameLocale,
  messageIntakeWidgetType,
  messageShouldShowViewOriginalToggle,
  messageTranslationPreparingFormLabel,
  messageViewerBody,
  messageViewerTitle,
  serviceThreadDisplayName,
  threadListPreviewBody,
  workflowCardViewerBody,
  workflowCardViewerTitle,
} from "../src/assets/js/pages/messages-display-logic.js";

const KO_BODY = "한국어 사용자 메시지";
const KO_TITLE = "서비스를 시작합니다";
const KO_CARD_JSON_BODY = "카드 본문";
const KO_LABEL = "예산";
const KO_PREVIEW = "한국어 미리보기";

const t = (key, fallback) => `${key}:${fallback}`;

test("Step 14: message with translation_required_failed does not render raw body", () => {
  const text = messageViewerBody(
    {
      body: KO_BODY,
      display_body: null,
      translation_status: "translation_required_failed",
      source_locale: "ko",
      display_locale: "en",
    },
    { translate: t }
  );
  assert.match(text, /messages\.translation\.preparing_message/);
  assert.doesNotMatch(text, /한국어/);
});

test("Step 14: workflow card does not render raw title/body or card_json copy", () => {
  const card = {
    title: KO_TITLE,
    body: KO_BODY,
    display_title: null,
    display_body: null,
    source_locale: "ko",
    display_locale: "en",
    translation_status: "translation_required_failed",
    card_json: { title: KO_TITLE, body: KO_CARD_JSON_BODY },
  };
  const title = workflowCardViewerTitle(card, t);
  const body = workflowCardViewerBody(card, t);
  assert.match(title, /messages\.translation\.preparing_title/);
  assert.match(body, /messages\.translation\.preparing_message/);
  assert.doesNotMatch(title, /서비스/);
  assert.doesNotMatch(body, /한국어|카드/);
});

test("Step 14: form prompt does not render raw ui_payload labels cross-locale", () => {
  const message = {
    ui_payload: { widget_type: "form_prompt", label: KO_LABEL, source_locale: "ko" },
    display_ui_payload: null,
    display_ui_payload_status: "translation_required_failed",
    source_locale: "ko",
    display_ui_payload_locale: "en",
  };
  assert.equal(messageIntakeWidgetType(message), "form_prompt");
  assert.equal(intakeUiPayloadNeedsTranslationPlaceholder(message), true);
  assert.equal(intakeUiPayloadSameLocale(message), false);
  const shellLabel = messageTranslationPreparingFormLabel(t);
  assert.match(shellLabel, /messages\.translation\.preparing_form/);
  assert.doesNotMatch(shellLabel, /예산/);
  const emptyDisplayLabel = formPromptDisplayLabel({ label: "" }, t);
  assert.match(emptyDisplayLabel, /messages\.translation\.preparing_form/);
});

test("Step 14: thread preview does not render raw preview body cross-locale", () => {
  const text = threadListPreviewBody(
    {
      last_message_body: KO_PREVIEW,
      last_message_display_body: null,
      last_message_source_locale: "ko",
      last_message_display_locale: "en",
      last_message_translation_status: "translation_required_failed",
    },
    t
  );
  assert.match(text, /messages\.translation\.preparing_preview/);
  assert.doesNotMatch(text, /한국어/);
});

test("Step 14: service thread title does not render raw header_title cross-locale", () => {
  const title = serviceThreadDisplayName(
    {
      display_header_title: null,
      display_service_name: null,
      header_title: KO_TITLE,
      service_title_status: "translation_required_failed",
      service_title_source_locale: "ko",
      service_title_display_locale: "en",
    },
    "",
    t
  );
  assert.match(title, /messages\.translation\.preparing_title/);
  assert.doesNotMatch(title, /서비스/);
});

test("Step 14: View original still reveals stored body explicitly", () => {
  const message = {
    body: KO_BODY,
    display_body: null,
    translation_status: "translation_required_failed",
    source_locale: "ko",
    display_locale: "en",
  };
  assert.equal(messageShouldShowViewOriginalToggle(message), true);
  const original = messageViewerBody(message, { showOriginal: true });
  assert.equal(original, KO_BODY);
  const visible = messageViewerBody(message, { translate: t });
  assert.notEqual(visible, KO_BODY);
});

test("Step 14: same-locale Korean may display for messages and form labels", () => {
  const body = messageViewerBody({
    body: KO_BODY,
    display_body: null,
    translation_status: "not_required",
    source_locale: "ko",
    display_locale: "ko",
  });
  assert.equal(body, KO_BODY);

  const title = messageViewerTitle({
    title: KO_TITLE,
    display_title: null,
    translation_status: "not_required",
    source_locale: "ko",
    display_locale: "ko",
  });
  assert.equal(title, KO_TITLE);

  const preview = threadListPreviewBody({
    last_message_body: KO_PREVIEW,
    last_message_display_body: null,
    last_message_source_locale: "ko",
    last_message_display_locale: "ko",
    last_message_translation_status: "not_required",
  });
  assert.equal(preview, KO_PREVIEW);

  assert.equal(
    intakeUiPayloadSameLocale({
      source_locale: "ko",
      display_ui_payload_locale: "ko",
    }),
    true
  );
  const label = formPromptDisplayLabel({ label: KO_LABEL }, t);
  assert.equal(label, KO_LABEL);
});
