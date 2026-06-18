import test from "node:test";
import assert from "node:assert/strict";

const modulePath = new URL("../src/assets/js/pages/dashboard-recent-updates-i18n.js", import.meta.url).href;

/** @param {Record<string, string>} bundles */
function mockI18n(bundles) {
  const originals = {};
  return import(modulePath).then(async (mod) => {
    const i18n = await import(new URL("../src/assets/js/core/i18n-client.js", import.meta.url).href);
    const pref = await import(new URL("../src/assets/js/core/preferred-language.js", import.meta.url).href);
    originals.getEffectiveLanguage = pref.getEffectiveLanguage;
    pref.getEffectiveLanguage = () => bundles.lang || "en";
    originals.t = i18n.t;
    i18n.t = (key, fallback) => bundles.strings?.[key] ?? fallback ?? key;
    return { mod, restore: () => {
      pref.getEffectiveLanguage = originals.getEffectiveLanguage;
      i18n.t = originals.t;
    }};
  });
}

test("localizeRecentUpdateRow prefers API display_* over event_code and raw text", async () => {
  const { mod, restore } = await mockI18n({
    lang: "en",
    strings: {
      "dashboard.timeline.survey_received_title": "Should not be used",
      "dashboard.timeline.survey_received_desc": "Should not be used",
    },
  });
  try {
    const row = mod.localizeRecentUpdateRow({
      title: "서비스 문의 접수",
      description: "원문 설명",
      display_title: "Service inquiry received",
      display_description: "We received your inquiry.",
      event_code: "survey.received",
    });
    assert.equal(row.title, "Service inquiry received");
    assert.equal(row.description, "We received your inquiry.");
  } finally {
    restore();
  }
});

test("localizeRecentUpdateRow maps Korean system title to English via event_code", async () => {
  const { mod, restore } = await mockI18n({
    lang: "en",
    strings: {
      "dashboard.timeline.intake_partner_emailed_title": "Delivered to partner",
      "dashboard.timeline.intake_partner_emailed_desc": "Your intake was emailed to the partner.",
    },
  });
  try {
    const row = mod.localizeRecentUpdateRow({
      title: "파트너에게 전달됨",
      description: "인테이크가 접수되어 파트너에게 이메일로 전달되었습니다.",
      event_code: "thread.intake.partner_emailed",
    });
    assert.equal(row.title, "Delivered to partner");
    assert.equal(row.description, "Your intake was emailed to the partner.");
  } finally {
    restore();
  }
});

test("localizeRecentUpdateRow falls back to title fingerprint when event_code missing", async () => {
  const { mod, restore } = await mockI18n({
    lang: "en",
    strings: {
      "dashboard.timeline.intake_completed_title": "Required information submitted",
      "dashboard.timeline.intake_completed_desc": "We are preparing the next step.",
    },
  });
  try {
    const row = mod.localizeRecentUpdateRow({
      title: "필수 정보 입력이 완료되었습니다",
      description: "제출해 주신 내용을 바탕으로 다음 단계를 준비합니다.",
    });
    assert.equal(row.title, "Required information submitted");
    assert.equal(row.description, "We are preparing the next step.");
  } finally {
    restore();
  }
});

test("formatRecentUpdateTimestamp respects effective language locale", async () => {
  const { mod, restore } = await mockI18n({ lang: "en" });
  try {
    const formatted = mod.formatRecentUpdateTimestamp("2026-06-04T14:00:00.000Z", "en");
    assert.match(formatted, /Jun/i);
    assert.doesNotMatch(formatted, /오전|오후/);
  } finally {
    restore();
  }
});

test("buildLocalizedRecentUpdateItems re-localizes backend recent_updates rows", async () => {
  const { mod, restore } = await mockI18n({
    lang: "en",
    strings: {
      "dashboard.timeline.partner_selected_title": "Partner selection complete",
      "dashboard.timeline.partner_selected_desc": "Continue in messages.",
    },
  });
  try {
    const rows = mod.buildLocalizedRecentUpdateItems({
      recent_updates: [
        {
          id: "message:1",
          source: "message",
          title: "메신저 매칭 완료",
          description: "최종적으로 파트너를 선택하였습니다.",
          timestamp: "2026-06-04T14:00:00.000Z",
        },
      ],
    });
    assert.equal(rows.length, 1);
    assert.equal(rows[0].title, "Partner selection complete");
    assert.equal(rows[0].description, "Continue in messages.");
  } finally {
    restore();
  }
});
