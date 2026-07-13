import test from "node:test";
import assert from "node:assert/strict";

import {
  intakeUiPayloadNeedsTranslationPlaceholder,
  intakeUiPayloadSameLocale,
  overlayCanonicalIntakeValues,
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
  messageViewerTitle,
  threadListPreviewBody,
  threadListPreviewIsSystemTemplate,
  workflowCardViewerBody,
  workflowCardViewerTitle,
} from "../src/assets/js/pages/messages-display-logic.js";

test("messageViewerBody prefers display_body over body", () => {
  const text = messageViewerBody({ body: "Hello", display_body: "안녕" });
  assert.equal(text, "안녕");
});

test("messageViewerBody falls back to body when same-locale and display_body missing", () => {
  const text = messageViewerBody({
    body: "Hello",
    display_body: "",
    source_locale: "en",
    display_locale: "en",
    translation_status: "not_required",
  });
  assert.equal(text, "Hello");
});

test("messageViewerBody uses preparing_message when translation unavailable", () => {
  const t = (key, fallback) => `${key}:${fallback}`;
  const text = messageViewerBody(
    {
      body: "자동차 조사/구입",
      display_body: null,
      translation_status: "translation_required_failed",
      source_locale: "ko",
      display_locale: "en",
    },
    { translate: t }
  );
  assert.match(text, /messages\.translation\.preparing_message/);
  assert.doesNotMatch(text, /자동차/);
});

test("Step 10: messageViewerBody does not use not_required to show cross-locale source", () => {
  const t = (key, fallback) => `${key}:${fallback}`;
  const text = messageViewerBody(
    {
      body: "한국어 사용자 메시지",
      display_body: null,
      translation_status: "not_required",
      source_locale: "ko",
      display_locale: "en",
    },
    { translate: t }
  );
  assert.match(text, /messages\.translation\.preparing_message/);
  assert.doesNotMatch(text, /한국어/);
});

test("messageViewerBody uses preparing_message placeholder when translation pending", () => {
  const t = (key, fallback) => `${key}:${fallback}`;
  const text = messageViewerBody(
    {
      body: "자동차 조사/구입",
      display_body: "",
      translation_status: "translation_pending",
      source_locale: "ko",
      display_locale: "en",
    },
    { translate: t }
  );
  assert.match(text, /messages\.translation\.preparing_message/);
});

test("messageViewerBody showOriginal returns body not display", () => {
  const text = messageViewerBody(
    {
      body: "Hello",
      display_body: null,
      translation_status: "translation_required_failed",
      source_locale: "en",
      display_locale: "ko",
    },
    { showOriginal: true }
  );
  assert.equal(text, "Hello");
});

test("messageShouldShowViewOriginalToggle when cross-locale translation failed", () => {
  assert.equal(
    messageShouldShowViewOriginalToggle({
      body: "한국어",
      display_body: null,
      source_locale: "ko",
      display_locale: "en",
      translation_status: "translation_required_failed",
    }),
    true
  );
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
  assert.match(messageTranslationPendingLabel(t), /messages\.translation\.preparing_message/);
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

test("workflowCardViewerTitle prefers display_title", () => {
  const title = workflowCardViewerTitle({
    display_title: "Starting your service",
    title: "서비스를 시작합니다",
    source_locale: "ko",
    display_locale: "en",
  });
  assert.equal(title, "Starting your service");
});

test("workflowCardViewerTitle uses placeholder for cross-locale missing display", () => {
  const tr = (key, fb) => (key === "messages.translation.preparing_title" ? "Preparing title…" : fb);
  const title = workflowCardViewerTitle(
    {
      title: "서비스를 시작합니다",
      source_locale: "ko",
      display_locale: "en",
      translation_status: "translation_required_failed",
    },
    tr
  );
  assert.equal(title, "Preparing title…");
  assert.ok(!title.includes("서비스"));
});

test("workflowCardViewerBody never falls back to stored body cross-locale", () => {
  const tr = (key, fb) =>
    key === "messages.translation.preparing_message" ? "Preparing message…" : fb;
  const body = workflowCardViewerBody(
    {
      body: "한국어 본문",
      card_json: { title: "카드 제목", body: "카드 본문" },
      source_locale: "ko",
      display_locale: "en",
      translation_status: "translation_required_failed",
    },
    tr
  );
  assert.equal(body, "Preparing message…");
  assert.ok(!body.includes("한국어"));
  assert.ok(!body.includes("카드"));
});

test("messageViewerTitle prefers display_title over title", () => {
  const title = messageViewerTitle({
    title: "한국어 제목",
    display_title: "English title",
    source_locale: "ko",
    display_locale: "en",
  });
  assert.equal(title, "English title");
});

test("messageViewerTitle uses preparing_title when translation failed cross-locale", () => {
  const tr = (key, fb) => (key === "messages.translation.preparing_title" ? "Preparing title…" : fb);
  const title = messageViewerTitle(
    {
      title: "한국어 제목",
      display_title: null,
      source_locale: "ko",
      display_locale: "en",
      translation_status: "translation_required_failed",
    },
    { translate: tr }
  );
  assert.equal(title, "Preparing title…");
  assert.ok(!title.includes("한국어"));
});

test("messageViewerTitle allows same-locale stored title when not_required", () => {
  const title = messageViewerTitle({
    title: "Same locale title",
    display_title: "",
    source_locale: "ko",
    display_locale: "ko",
    translation_status: "not_required",
  });
  assert.equal(title, "Same locale title");
});

test("workflowCardViewerBody allows stored body for same-locale viewer", () => {
  const body = workflowCardViewerBody({
    body: "한국어 본문",
    source_locale: "ko",
    display_locale: "ko",
    translation_status: "translation_required_failed",
  });
  assert.equal(body, "한국어 본문");
});

test("intakeUiPayloadNeedsTranslationPlaceholder when display_ui_payload failed", () => {
  assert.equal(
    intakeUiPayloadNeedsTranslationPlaceholder({
      ui_payload: { widget_type: "form_prompt", label: "예산", source_locale: "ko" },
      display_ui_payload: null,
      display_ui_payload_status: "translation_required_failed",
      source_locale: "ko",
      display_ui_payload_locale: "en",
    }),
    true
  );
});

test("intakeUiPayloadSameLocale allows original for ko viewer", () => {
  assert.equal(
    intakeUiPayloadSameLocale({
      source_locale: "ko",
      display_ui_payload_locale: "ko",
    }),
    true
  );
});

test("threadListPreviewBody prefers last_message_display_body", () => {
  assert.equal(
    threadListPreviewBody({
      preview: "Hello",
      last_message_body: "Hello world",
      last_message_display_body: "안녕하세요",
      last_message_source_locale: "en",
      last_message_display_locale: "ko",
    }),
    "안녕하세요"
  );
});

test("threadListPreviewBody allows same-locale source preview", () => {
  assert.equal(
    threadListPreviewBody({
      last_message_body: "Same locale body",
      last_message_display_body: "Same locale body",
      last_message_source_locale: "ko",
      last_message_display_locale: "ko",
      last_message_translation_status: "not_required",
    }),
    "Same locale body"
  );
});

test("threadListPreviewBody does not show Korean preview when translation fails", () => {
  const tr = (key, fb) => fb;
  const text = threadListPreviewBody(
    {
      last_message_body: "한국어 미리보기",
      last_message_display_body: null,
      last_message_source_locale: "ko",
      last_message_display_locale: "en",
      last_message_translation_status: "translation_required_failed",
    },
    tr
  );
  assert.equal(text, "Preparing preview translation...");
  assert.doesNotMatch(text, /한국어/);
});

test("Step 9: threadListPreviewBody does not use not_required to show cross-locale source", () => {
  const tr = (key, fb) => fb;
  const text = threadListPreviewBody(
    {
      last_message_body: "한국어 미리보기",
      last_message_display_body: null,
      last_message_source_locale: "ko",
      last_message_display_locale: "en",
      last_message_translation_status: "not_required",
    },
    tr
  );
  assert.equal(text, "Preparing preview translation...");
  assert.doesNotMatch(text, /한국어/);
});

test("threadListPreviewBody uses preparing_preview when translation unavailable", () => {
  const t = (key, fallback) => `${key}:${fallback}`;
  assert.match(
    threadListPreviewBody(
      {
        last_message_body: "Hello world",
        last_message_display_body: null,
        last_message_source_locale: "en",
        last_message_display_locale: "ko",
        last_message_translation_status: "provider_failed",
      },
      t
    ),
    /messages\.translation\.preparing_preview/
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

test("overlayCanonicalIntakeValues keeps display answers when canonical value is null", () => {
  const display = {
    widget_type: "form_prompt",
    input_type: "intake_multi",
    steps: [
      {
        field_id: "g1",
        input_type: "question_group",
        children: [
          { id: "f-budget", label: "Budget", value: "30000" },
          { id: "f-brand", label: "Brand", value: "GMC" },
        ],
      },
    ],
    prompt_submitted: true,
  };
  const canonical = {
    widget_type: "form_prompt",
    input_type: "intake_multi",
    steps: [
      {
        field_id: "g1",
        input_type: "question_group",
        children: [
          { id: "f-budget", label: "예산", value: null },
          { id: "f-brand", label: "브랜드", value: null },
        ],
      },
    ],
  };
  overlayCanonicalIntakeValues(display, canonical);
  assert.equal(display.steps[0].children[0].value, "30000");
  assert.equal(display.steps[0].children[1].value, "GMC");
  assert.equal(display.prompt_submitted, true);
});
