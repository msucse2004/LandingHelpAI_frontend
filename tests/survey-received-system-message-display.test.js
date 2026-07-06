/**
 * Step 8 — survey.received / system template message display (frontend).
 */

import test from "node:test";
import assert from "node:assert/strict";

import {
  adminThreadDisplayTitle,
  isSystemTemplateMessage,
  messageShouldShowTranslationUnavailable,
  messageShouldShowViewOriginalToggle,
  messageTranslationNoticeKind,
} from "../src/assets/js/pages/messages-display-logic.js";

const SURVEY_SYSTEM_TEMPLATE_MESSAGE = {
  event_code: "survey.received",
  message_type: "SYSTEM",
  translation_source: "system_template",
  translation_status: "template_resolved",
  body: "안녕하세요.\n\n고객님께서 보내주신 설문(요청)이 정상적으로 접수되었습니다.",
  display_title: "Survey received successfully",
  display_body:
    "Hello.\n\nYour survey/request was received successfully.",
};

const UGC_PROVIDER_FAILED_MESSAGE = {
  message_type: "CHAT",
  translation_source: "source_fallback",
  translation_status: "provider_failed",
  body: "고객이 보낸 한국어 메시지입니다.",
  display_body: "고객이 보낸 한국어 메시지입니다.",
};

test("survey.received system_template message does not show Translation unavailable", () => {
  assert.equal(isSystemTemplateMessage(SURVEY_SYSTEM_TEMPLATE_MESSAGE), true);
  assert.equal(messageShouldShowTranslationUnavailable(SURVEY_SYSTEM_TEMPLATE_MESSAGE), false);
  assert.equal(messageTranslationNoticeKind(SURVEY_SYSTEM_TEMPLATE_MESSAGE), null);
});

test("provider_failed user CHAT message still shows Translation unavailable", () => {
  assert.equal(isSystemTemplateMessage(UGC_PROVIDER_FAILED_MESSAGE), false);
  assert.equal(messageShouldShowTranslationUnavailable(UGC_PROVIDER_FAILED_MESSAGE), true);
  assert.equal(messageTranslationNoticeKind(UGC_PROVIDER_FAILED_MESSAGE), "unavailable");
});

test("View original toggle when display_body differs from stored body", () => {
  assert.equal(messageShouldShowViewOriginalToggle(SURVEY_SYSTEM_TEMPLATE_MESSAGE), true);
  assert.equal(
    messageShouldShowViewOriginalToggle({
      body: "same text",
      display_body: "same text",
      translation_source: "system_template",
    }),
    false
  );
});
