import test from "node:test";
import assert from "node:assert/strict";

import {
  isSystemTemplateMessage,
  logMessageTranslationFailures,
  messageHasLocalizedDisplay,
  messageShouldShowTranslationPending,
  messageShouldShowTranslationUnavailable,
  messageShouldShowViewOriginalToggle,
  messageTranslationDebugFields,
  messageTranslationNoticeKind,
  messageTranslationPendingLabel,
  messageTranslationStatusPending,
  messageTranslationStatusUnavailable,
  messageTranslationUnavailableLabel,
  messageViewOriginalToggleLabel,
  messageViewerBody,
  threadListPreviewBody,
  threadListPreviewIsSystemTemplate,
} from "../src/assets/js/pages/messages-display-logic.js";

test("messageViewerBody prefers display_body over body", () => {
  const text = messageViewerBody({ body: "Hello", display_body: "안녕" });
  assert.equal(text, "안녕");
});

test("messageViewerBody falls back to body when display_body missing", () => {
  const text = messageViewerBody({ body: "Hello", display_body: "" });
  assert.equal(text, "Hello");
});

test("messageViewerBody showOriginal returns body not display", () => {
  const text = messageViewerBody(
    { body: "Hello", display_body: "안녕" },
    { showOriginal: true }
  );
  assert.equal(text, "Hello");
});

test("messageHasLocalizedDisplay when display differs", () => {
  assert.equal(messageHasLocalizedDisplay({ body: "a", display_body: "b" }), true);
  assert.equal(messageHasLocalizedDisplay({ body: "a", display_body: "a" }), false);
});

test("messageTranslationStatusUnavailable recognizes failure statuses", () => {
  assert.equal(messageTranslationStatusUnavailable("fallback_to_source"), true);
  assert.equal(messageTranslationStatusUnavailable("provider_failed"), true);
  assert.equal(messageTranslationStatusUnavailable("FAILED"), true);
  assert.equal(messageTranslationStatusUnavailable("pending_translation"), false);
  assert.equal(messageTranslationStatusUnavailable("template_resolved"), false);
});

test("system_template messages never show translation unavailable", () => {
  const msg = {
    translation_source: "system_template",
    translation_status: "provider_failed",
    body: "ko",
    display_body: "en",
  };
  assert.equal(isSystemTemplateMessage(msg), true);
  assert.equal(messageShouldShowTranslationUnavailable(msg), false);
  assert.equal(messageTranslationNoticeKind(msg), null);
});

test("provider_failed user messages show translation unavailable", () => {
  const msg = {
    translation_source: "source_fallback",
    translation_status: "provider_failed",
    body: "ko",
    display_body: "ko",
  };
  assert.equal(messageShouldShowTranslationUnavailable(msg), true);
  assert.equal(messageTranslationNoticeKind(msg), "unavailable");
});

test("message detail system template does not show translation unavailable", () => {
  const msg = {
    translation_source: "system_template",
    translation_status: "template_resolved",
    body: "한국어 저장 본문",
    display_body: "English system template body",
  };
  assert.equal(isSystemTemplateMessage(msg), true);
  assert.equal(messageShouldShowTranslationUnavailable(msg), false);
  assert.equal(messageTranslationNoticeKind(msg), null);
  assert.equal(messageViewerBody(msg), "English system template body");
  assert.equal(messageViewerBody(msg, { showOriginal: true }), "한국어 저장 본문");
});

test("thread list system_template preview never surfaces translation unavailable", () => {
  const row = {
    last_message_body: "한국어",
    last_message_display_body: "Quote proposal received body",
    last_message_translation_status: "provider_failed",
    last_message_translation_source: "system_template",
  };
  assert.equal(threadListPreviewIsSystemTemplate(row), true);
  assert.equal(threadListPreviewBody(row), "Quote proposal received body");
  assert.equal(messageShouldShowTranslationUnavailable(row), false);
});

const COMMUNICATION_EVENT_CODES = [
  "quote.proposed",
  "invoice.sent",
  "payment.completed",
  "document.request",
  "schedule.proposed",
  "schedule.released_to_customer",
  "completion.document.sent",
  "survey.received",
];

for (const eventCode of COMMUNICATION_EVENT_CODES) {
  test(`thread list preview prefers display_body for ${eventCode} system template`, () => {
    const displayBody = `English template body for ${eventCode}`;
    assert.equal(
      threadListPreviewBody({
        preview: "legacy preview",
        last_message_body: "한국어 저장 본문",
        last_message_display_body: displayBody,
        last_message_translation_source: "system_template",
        last_message_translation_status: "template_resolved",
        event_code: eventCode,
      }),
      displayBody
    );
  });
}

test("pending_translation shows pending notice for user messages", () => {
  const msg = {
    translation_status: "pending_translation",
    body: "ko",
    display_body: "ko",
  };
  assert.equal(messageShouldShowTranslationPending(msg), true);
  assert.equal(messageTranslationNoticeKind(msg), "pending");
});

test("messageShouldShowViewOriginalToggle requires differing non-empty bodies", () => {
  assert.equal(messageShouldShowViewOriginalToggle({ body: "a", display_body: "b" }), true);
  assert.equal(messageShouldShowViewOriginalToggle({ body: "", display_body: "b" }), false);
  assert.equal(messageShouldShowViewOriginalToggle({ body: "a", display_body: "a" }), false);
});

test("messageTranslationPendingLabel uses i18n key", () => {
  const t = (key, fallback) => `${key}:${fallback}`;
  assert.match(messageTranslationPendingLabel(t), /messages\.translation\.pending/);
});

test("threadListPreviewBody uses display for system_template source", () => {
  assert.equal(
    threadListPreviewBody({
      last_message_body: "한국어",
      last_message_display_body: "Hello",
      last_message_translation_status: "provider_failed",
      last_message_translation_source: "system_template",
    }),
    "Hello"
  );
});

test("threadListPreviewBody uses display for template_resolved status without source", () => {
  assert.equal(
    threadListPreviewBody({
      last_message_body: "한국어",
      last_message_display_body: "Quote proposal received body",
      last_message_translation_status: "template_resolved",
    }),
    "Quote proposal received body"
  );
  assert.equal(
    threadListPreviewIsSystemTemplate({
      last_message_translation_status: "template_resolved",
    }),
    true
  );
});

test("messageViewOriginalToggleLabel switches copy", () => {
  const t = (key, fallback) => `${key}:${fallback}`;
  assert.match(messageViewOriginalToggleLabel(false, t), /view_original/);
  assert.match(messageViewOriginalToggleLabel(true, t), /hide_original/);
});

test("threadListPreviewBody prefers last_message_display_body", () => {
  assert.equal(
    threadListPreviewBody({
      preview: "Hello",
      last_message_body: "Hello world",
      last_message_display_body: "안녕하세요",
    }),
    "안녕하세요"
  );
  assert.equal(
    threadListPreviewBody({ last_message_body: "Hello world", preview: "Hello" }),
    "Hello world"
  );
  assert.equal(threadListPreviewBody({ preview: "Hello" }), "Hello");
});

test("threadListPreviewBody uses original when translation unavailable", () => {
  assert.equal(
    threadListPreviewBody({
      last_message_body: "Hello world",
      last_message_display_body: "Hello world",
      last_message_translation_status: "provider_failed",
    }),
    "Hello world"
  );
});

test("messageTranslationDebugFields omits body text and flags unavailable", () => {
  const row = messageTranslationDebugFields({
    id: "msg-1",
    event_code: "survey.completed",
    message_type: "SYSTEM",
    body: "한국어 본문",
    display_body: "한국어 본문",
    source_locale: "ko",
    display_locale: "en",
    translation_status: "provider_failed",
    translation_source: "source_fallback",
    translation_provider: "deepl",
    translation_cache_hit: false,
  });
  assert.equal(row.message_id, "msg-1");
  assert.equal(row.event_code, "survey.completed");
  assert.equal(row.translation_unavailable, true);
  assert.equal(row.body_length, 6);
  assert.equal(JSON.stringify(row).includes("한국어"), false);
});

test("logMessageTranslationFailures logs only unavailable rows", () => {
  const calls = [];
  const failures = logMessageTranslationFailures(
    [
      { id: "a", translation_status: "auto_translated", body: "ok", display_body: "ok" },
      { id: "b", translation_status: "provider_failed", body: "ko", display_body: "ko" },
    ],
    { logFn: (...args) => calls.push(args) }
  );
  assert.equal(failures.length, 1);
  assert.equal(failures[0].message_id, "b");
  assert.equal(calls.length, 1);
});
