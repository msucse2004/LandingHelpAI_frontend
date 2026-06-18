import test from "node:test";
import assert from "node:assert/strict";

const events = [];

globalThis.window = {
  location: { hostname: "localhost", port: "8000", protocol: "http:" },
  LHAI_API_BASE_URL: "",
  localStorage: {
    getItem() {
      return null;
    },
  },
  dispatchEvent(event) {
    events.push(event);
    return true;
  },
};

const originalFetch = globalThis.fetch;

const {
  t,
  initI18nDomains,
  resetI18nClientState,
  overlayI18nStrings,
  registerMissingRuntimeKey,
  flushRuntimeMissingKeys,
  mergeResolvedRuntimeValues,
} = await import("../src/assets/js/core/i18n-client.js");

test.beforeEach(() => {
  events.length = 0;
  resetI18nClientState();
  globalThis.fetch = originalFetch;
  try {
    localStorage.removeItem("lhai_preferred_language");
  } catch {
    /* ignore */
  }
});

test("t returns fallback immediately and queues missing key for runtime resolve", async () => {
  localStorage.setItem("lhai_preferred_language", "ko");

  const requests = [];
  globalThis.fetch = async (url, options) => {
    requests.push({ url, options });
    return {
      ok: true,
      async json() {
        return {
          language_code: "ko",
          items: [
            {
              key: "dashboard.hero.title",
              value: "진행 중",
              created_key: true,
              created_en: true,
              translated: true,
              error: null,
            },
          ],
          errors: [],
        };
      },
    };
  };

  assert.equal(t("dashboard.hero.title", "In progress"), "In progress");
  await flushRuntimeMissingKeys();

  assert.equal(requests.length, 1);
  assert.match(requests[0].url, /\/api\/i18n\/runtime\/resolve$/);
  const body = JSON.parse(requests[0].options.body);
  assert.equal(body.language_code, "ko");
  assert.equal(body.items.length, 1);
  assert.equal(body.items[0].key, "dashboard.hero.title");
  assert.equal(body.items[0].source_text, "In progress");
  assert.equal(body.items[0].domain, "dashboard");

  assert.equal(t("dashboard.hero.title", "In progress"), "진행 중");
  assert.equal(events.length, 1);
  assert.equal(events[0].type, "lhai:i18n-runtime-resolved");
  assert.deepEqual(events[0].detail, { language: "ko", keys: ["dashboard.hero.title"] });
});

test("t does not queue when bundle value exists", async () => {
  localStorage.setItem("lhai_preferred_language", "ko");
  overlayI18nStrings({ "dashboard.hero.title": "이미 있음" });

  let fetchCalled = false;
  globalThis.fetch = async () => {
    fetchCalled = true;
    return { ok: true, async json() { return { language_code: "ko", items: [] }; } };
  };

  assert.equal(t("dashboard.hero.title", "In progress"), "이미 있음");
  await flushRuntimeMissingKeys();
  assert.equal(fetchCalled, false);
});

test("t does not queue empty fallback or english-only runtime resolve", async () => {
  localStorage.setItem("lhai_preferred_language", "ko");
  let fetchCalled = false;
  globalThis.fetch = async () => {
    fetchCalled = true;
    return { ok: true, async json() { return { language_code: "ko", items: [] }; } };
  };

  assert.equal(t("dashboard.hero.title"), "dashboard.hero.title");
  assert.equal(t("dashboard.hero.title", ""), "");
  assert.equal(t("dashboard.hero.title", "   "), "   ");
  await flushRuntimeMissingKeys();
  assert.equal(fetchCalled, false);

  resetI18nClientState();
  localStorage.setItem("lhai_preferred_language", "en");
  assert.equal(t("dashboard.hero.title", "In progress"), "In progress");
  await flushRuntimeMissingKeys();
  assert.equal(fetchCalled, false);
});

test("mergeResolvedRuntimeValues skips error items", () => {
  localStorage.setItem("lhai_preferred_language", "zh-Hans");
  resetI18nClientState();
  overlayI18nStrings({
    "dashboard.hero.partner_selected_title": "合作伙伴筛选已完成",
  });

  mergeResolvedRuntimeValues("zh-Hans", [
    {
      key: "dashboard.hero.partner_selected_title",
      value: "Partner selection complete",
      error: "translation failed",
    },
  ]);

  assert.equal(t("dashboard.hero.partner_selected_title", "Partner selection complete"), "合作伙伴筛选已完成");
});

test("registerMissingRuntimeKey deduplicates repeated missing lookups", async () => {
  localStorage.setItem("lhai_preferred_language", "ko");

  const bodies = [];
  globalThis.fetch = async (_url, options) => {
    bodies.push(JSON.parse(options.body));
    return {
      ok: true,
      async json() {
        return { language_code: "ko", items: [], errors: [] };
      },
    };
  };

  registerMissingRuntimeKey("dashboard.hero.title", "Title");
  registerMissingRuntimeKey("dashboard.hero.title", "Title");
  t("dashboard.hero.title", "Title");
  await flushRuntimeMissingKeys();

  assert.equal(bodies.length, 1);
  assert.equal(bodies[0].items.length, 1);
});

test("should skip suspicious long user-generated source text", async () => {
  localStorage.setItem("lhai_preferred_language", "ko");
  let fetchCalled = false;
  globalThis.fetch = async () => {
    fetchCalled = true;
    return { ok: true, async json() { return { language_code: "ko", items: [] }; } };
  };

  const longParagraph = `${"word ".repeat(90)}\n\nSecond paragraph.`;
  t("dashboard.hero.body", longParagraph);
  await flushRuntimeMissingKeys();
  assert.equal(fetchCalled, false);
});

test("mergeResolvedRuntimeValues updates bundle without duplicate fetch loop", async () => {
  localStorage.setItem("lhai_preferred_language", "ko");

  mergeResolvedRuntimeValues("ko", [{ key: "dashboard.cta.open_messages", value: "메시지 열기" }]);
  assert.equal(t("dashboard.cta.open_messages", "Open messages"), "메시지 열기");

  let fetchCalled = false;
  globalThis.fetch = async () => {
    fetchCalled = true;
    return { ok: true, async json() { return { language_code: "ko", items: [] }; } };
  };

  t("dashboard.cta.open_messages", "Open messages");
  await flushRuntimeMissingKeys();
  assert.equal(fetchCalled, false);
});

test("ko bundle strips English gap-fill copies and queues runtime resolve", async () => {
  localStorage.setItem("lhai_preferred_language", "ko");

  globalThis.fetch = async (url) => {
    if (String(url).includes("lang=ko")) {
      return {
        ok: true,
        async json() {
          return {
            strings: {
              "dashboard.card.cases_title": "Service inquiries",
              "dashboard.card.status_title": "내 진행 상태",
            },
          };
        },
      };
    }
    if (String(url).includes("lang=en")) {
      return {
        ok: true,
        async json() {
          return {
            strings: {
              "dashboard.card.cases_title": "Service inquiries",
              "dashboard.card.status_title": "My progress",
            },
          };
        },
      };
    }
    throw new Error(`unexpected fetch: ${url}`);
  };

  resetI18nClientState();
  await initI18nDomains(["dashboard"], "ko");

  assert.equal(t("dashboard.card.cases_title", "Service inquiries"), "Service inquiries");
  assert.equal(t("dashboard.card.status_title", "My progress"), "내 진행 상태");

  const resolveBodies = [];
  globalThis.fetch = async (url, options) => {
    if (options?.method === "POST") {
      resolveBodies.push(JSON.parse(options.body));
      return { ok: true, async json() { return { language_code: "ko", items: [] }; } };
    }
    throw new Error(`unexpected fetch: ${url}`);
  };

  await flushRuntimeMissingKeys();
  assert.equal(resolveBodies.length, 1);
  assert.equal(resolveBodies[0].language_code, "ko");
  assert.equal(resolveBodies[0].items.length, 1);
  assert.equal(resolveBodies[0].items[0].key, "dashboard.card.cases_title");
  assert.equal(resolveBodies[0].items[0].source_text, "Service inquiries");
});

test("en bundle keeps catalog values without gap-fill strip", async () => {
  localStorage.setItem("lhai_preferred_language", "en");

  globalThis.fetch = async (url) => {
    if (String(url).includes("lang=en")) {
      return {
        ok: true,
        async json() {
          return { strings: { "common.save": "Save" } };
        },
      };
    }
    throw new Error(`unexpected fetch: ${url}`);
  };

  resetI18nClientState();
  await initI18nDomains(["common"], "en");

  assert.equal(t("common.save", "Save"), "Save");

  let fetchCalled = false;
  globalThis.fetch = async () => {
    fetchCalled = true;
    return { ok: true, async json() { return { language_code: "en", items: [] }; } };
  };
  await flushRuntimeMissingKeys();
  assert.equal(fetchCalled, false);
});

test("resetI18nClientState clears runtime queue state", async () => {
  localStorage.setItem("lhai_preferred_language", "ko");
  registerMissingRuntimeKey("dashboard.hero.title", "Title");

  resetI18nClientState();

  let fetchCalled = false;
  globalThis.fetch = async () => {
    fetchCalled = true;
    return { ok: true, async json() { return { language_code: "ko", items: [] }; } };
  };

  await flushRuntimeMissingKeys();
  assert.equal(fetchCalled, false);
});
