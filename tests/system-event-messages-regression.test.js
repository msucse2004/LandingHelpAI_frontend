/**
 * Step 10 — system event message localization regression (frontend display rules).
 */

import test from "node:test";
import assert from "node:assert/strict";

import {
  isSystemTemplateMessage,
  messageShouldShowTranslationUnavailable,
  messageTranslationNoticeKind,
  messageViewerBody,
  threadListPreviewBody,
  threadListPreviewIsSystemTemplate,
} from "../src/assets/js/pages/messages-display-logic.js";

const SYSTEM_EVENTS = [
  "survey.received",
  "quote.proposed",
  "invoice.sent",
  "payment.completed",
  "document.request",
  "schedule.proposed",
  "schedule.released_to_customer",
  "completion.document.sent",
];

const UGC_PROVIDER_FAILED = {
  message_type: "CHAT",
  translation_source: "source_fallback",
  translation_status: "provider_failed",
  body: "고객이 작성한 한국어",
  display_body: "고객이 작성한 한국어",
};

for (const eventCode of SYSTEM_EVENTS) {
  test(`${eventCode} detail (en viewer) does not show Translation unavailable`, () => {
    const msg = {
      event_code: eventCode,
      message_type: "SYSTEM",
      translation_source: "system_template",
      translation_status: "template_resolved",
      body: "한국어 저장 본문",
      display_body: `English template body for ${eventCode}`,
      display_title: `English template title for ${eventCode}`,
    };
    assert.equal(isSystemTemplateMessage(msg), true);
    assert.equal(messageShouldShowTranslationUnavailable(msg), false);
    assert.equal(messageTranslationNoticeKind(msg), null);
    assert.equal(messageViewerBody(msg), `English template body for ${eventCode}`);
  });

  test(`${eventCode} thread list preview (en viewer) uses display_body`, () => {
    const row = {
      event_code: eventCode,
      last_message_body: "한국어 저장 본문",
      last_message_display_body: `English preview for ${eventCode}`,
      last_message_translation_source: "system_template",
      last_message_translation_status: "template_resolved",
    };
    assert.equal(threadListPreviewIsSystemTemplate(row), true);
    assert.equal(threadListPreviewBody(row), `English preview for ${eventCode}`);
    assert.equal(messageShouldShowTranslationUnavailable(row), false);
  });

  test(`${eventCode} detail (ko viewer) still suppresses unavailable for system_template`, () => {
    const msg = {
      event_code: eventCode,
      translation_source: "system_template",
      translation_status: "template_resolved",
      body: "한국어 저장 본문",
      display_body: "한국어 템플릿 본문",
    };
    assert.equal(messageViewerBody(msg), "한국어 템플릿 본문");
    assert.equal(messageShouldShowTranslationUnavailable(msg), false);
  });
}

test("user-written Korean message still shows Translation unavailable on provider_failed", () => {
  assert.equal(isSystemTemplateMessage(UGC_PROVIDER_FAILED), false);
  assert.equal(messageShouldShowTranslationUnavailable(UGC_PROVIDER_FAILED), true);
  assert.equal(messageTranslationNoticeKind(UGC_PROVIDER_FAILED), "unavailable");
});

test("preferred locale es uses display_body for system template detail", () => {
  const msg = {
    event_code: "quote.proposed",
    translation_source: "system_template",
    translation_status: "template_resolved",
    body: "한국어 저장 본문",
    display_body: "¡Buenas noticias! Nuestro equipo de operaciones ha preparado una propuesta de presupuesto.",
  };
  assert.equal(messageViewerBody(msg), msg.display_body);
  assert.equal(messageShouldShowTranslationUnavailable(msg), false);
});
