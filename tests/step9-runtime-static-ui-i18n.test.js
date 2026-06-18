/**
 * Step 9 — runtime static UI translation resolver (frontend test matrix).
 * Uses mocked fetch; no live translation providers.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { pathToFileURL, fileURLToPath } from "node:url";
import path from "node:path";

const FRONTEND_ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

const events = [];
const listeners = new Map();

function addListener(type, fn) {
  if (!listeners.has(type)) listeners.set(type, []);
  listeners.get(type).push(fn);
}

function dispatch(type, detail = {}) {
  const event = { type, detail };
  events.push(event);
  for (const fn of listeners.get(type) || []) {
    fn(event);
  }
  return true;
}

function makeMiniDocument() {
  const nodes = [];

  class MiniElement {
    constructor(tagName) {
      this.tagName = String(tagName || "div").toLowerCase();
      this.attributes = new Map();
      this._text = "";
    }

    setAttribute(name, value) {
      this.attributes.set(name, String(value));
    }

    getAttribute(name) {
      return this.attributes.has(name) ? this.attributes.get(name) : null;
    }

    matches(selector) {
      if (selector === "title[data-i18n]") {
        return this.tagName === "title" && this.attributes.has("data-i18n");
      }
      return false;
    }

    get textContent() {
      return this._text;
    }

    set textContent(value) {
      this._text = String(value ?? "");
    }

    get placeholder() {
      return this.attributes.get("placeholder") || "";
    }

    set placeholder(value) {
      this.attributes.set("placeholder", String(value ?? ""));
    }
  }

  const doc = {
    documentElement: { lang: "en" },
    title: "Landing Help AI",
    querySelector(selector) {
      if (selector === "title[data-i18n]") {
        return nodes.find((node) => node.matches("title[data-i18n]")) || null;
      }
      return null;
    },
    querySelectorAll(selector) {
      if (selector === "[data-i18n]") {
        return nodes.filter((node) => node.attributes.has("data-i18n") && !node.matches("title[data-i18n]"));
      }
      if (selector === "[data-i18n-placeholder]") {
        return nodes.filter((node) => node.attributes.has("data-i18n-placeholder"));
      }
      if (selector === "[data-i18n-title]") {
        return nodes.filter((node) => node.attributes.has("data-i18n-title"));
      }
      if (selector === "[data-i18n-aria-label]") {
        return nodes.filter((node) => node.attributes.has("data-i18n-aria-label"));
      }
      return [];
    },
    createElement(tagName) {
      const el = new MiniElement(tagName);
      nodes.push(el);
      return el;
    },
    _nodes: nodes,
  };

  return doc;
}

async function importFresh(relativePath) {
  const abs = path.join(FRONTEND_ROOT, relativePath);
  const url = pathToFileURL(abs);
  url.searchParams.set("t", String(Date.now() + Math.random()));
  return import(url.href);
}

async function loadI18nClient() {
  globalThis.window = {
    location: { hostname: "localhost", port: "8000", protocol: "http:" },
    LHAI_API_BASE_URL: "",
    localStorage: {
      _data: new Map(),
      getItem(key) {
        return this._data.get(key) ?? null;
      },
      setItem(key, value) {
        this._data.set(key, String(value));
      },
      removeItem(key) {
        this._data.delete(key);
      },
    },
    addEventListener: addListener,
    dispatchEvent(event) {
      return dispatch(event.type, event.detail);
    },
  };
  globalThis.document = makeMiniDocument();
  globalThis.localStorage = globalThis.window.localStorage;

  return importFresh("src/assets/js/core/i18n-client.js");
}

test.beforeEach(() => {
  events.length = 0;
  listeners.clear();
});

test("step9-fe-01 t(missingKey, fallback) queues runtime resolve", async () => {
  const { t, resetI18nClientState, flushRuntimeMissingKeys } = await loadI18nClient();
  resetI18nClientState();
  localStorage.setItem("lhai_preferred_language", "ko");

  let fetchCalled = false;
  globalThis.fetch = async () => {
    fetchCalled = true;
    return { ok: true, async json() { return { language_code: "ko", items: [], errors: [] }; } };
  };

  assert.equal(t("dashboard.hero.title", "In progress"), "In progress");
  await flushRuntimeMissingKeys();
  assert.equal(fetchCalled, true);
});

test("step9-fe-02 runtime resolve request contains key and source_text", async () => {
  const { t, resetI18nClientState, flushRuntimeMissingKeys } = await loadI18nClient();
  resetI18nClientState();
  localStorage.setItem("lhai_preferred_language", "ko");

  const captured = [];
  globalThis.fetch = async (url, options) => {
    captured.push({ url, body: JSON.parse(options.body) });
    return {
      ok: true,
      async json() {
        return {
          language_code: "ko",
          items: [{ key: "dashboard.hero.title", value: "진행 중" }],
          errors: [],
        };
      },
    };
  };

  t("dashboard.hero.title", "In progress");
  await flushRuntimeMissingKeys();

  assert.equal(captured.length, 1);
  assert.match(captured[0].url, /\/api\/i18n\/runtime\/resolve$/);
  assert.equal(captured[0].body.items[0].key, "dashboard.hero.title");
  assert.equal(captured[0].body.items[0].source_text, "In progress");
});

test("step9-fe-03 returned translation updates bundle", async () => {
  const { t, resetI18nClientState, flushRuntimeMissingKeys } = await loadI18nClient();
  resetI18nClientState();
  localStorage.setItem("lhai_preferred_language", "ko");

  globalThis.fetch = async () => ({
    ok: true,
    async json() {
      return {
        language_code: "ko",
        items: [{ key: "dashboard.hero.title", value: "진행 중" }],
        errors: [],
      };
    },
  });

  t("dashboard.hero.title", "In progress");
  await flushRuntimeMissingKeys();
  assert.equal(t("dashboard.hero.title", "In progress"), "진행 중");
});

test("step9-fe-04 lhai:i18n-runtime-resolved event fires", async () => {
  const { t, resetI18nClientState, flushRuntimeMissingKeys } = await loadI18nClient();
  resetI18nClientState();
  localStorage.setItem("lhai_preferred_language", "ko");

  globalThis.fetch = async () => ({
    ok: true,
    async json() {
      return {
        language_code: "ko",
        items: [{ key: "dashboard.hero.title", value: "진행 중" }],
        errors: [],
      };
    },
  });

  t("dashboard.hero.title", "In progress");
  await flushRuntimeMissingKeys();

  const runtimeEvents = events.filter((event) => event.type === "lhai:i18n-runtime-resolved");
  assert.equal(runtimeEvents.length, 1);
  assert.deepEqual(runtimeEvents[0].detail, {
    language: "ko",
    keys: ["dashboard.hero.title"],
  });
});

test("step9-fe-05 applyI18nToDom updates visible text after bundle merge", async () => {
  const client = await loadI18nClient();
  const { applyI18nToDom } = await importFresh("src/assets/js/core/i18n-dom.js");
  client.resetI18nClientState();
  localStorage.setItem("lhai_preferred_language", "ko");

  const el = document.createElement("div");
  el.setAttribute("data-i18n", "dashboard.hero.title");
  el.setAttribute("data-i18n-default", "In progress");
  el.textContent = "In progress";

  globalThis.fetch = async () => ({
    ok: true,
    async json() {
      return {
        language_code: "ko",
        items: [{ key: "dashboard.hero.title", value: "진행 중" }],
        errors: [],
      };
    },
  });

  client.t("dashboard.hero.title", "In progress");
  await client.flushRuntimeMissingKeys();
  applyI18nToDom(document);
  assert.equal(el.textContent, "진행 중");
});

test("step9-fe-06 same missing key is not queued repeatedly", async () => {
  const { t, resetI18nClientState, registerMissingRuntimeKey, flushRuntimeMissingKeys } =
    await loadI18nClient();
  resetI18nClientState();
  localStorage.setItem("lhai_preferred_language", "ko");

  const bodies = [];
  globalThis.fetch = async (_url, options) => {
    bodies.push(JSON.parse(options.body));
    return { ok: true, async json() { return { language_code: "ko", items: [], errors: [] }; } };
  };

  registerMissingRuntimeKey("dashboard.hero.title", "Title");
  registerMissingRuntimeKey("dashboard.hero.title", "Title");
  t("dashboard.hero.title", "Title");
  await flushRuntimeMissingKeys();

  assert.equal(bodies.length, 1);
  assert.equal(bodies[0].items.length, 1);
});

test("step9-fe-07 dashboard rerenders after runtime resolve", async () => {
  await loadI18nClient();
  const { wireDynamicPageI18nRefresh } = await importFresh("src/assets/js/core/i18n-dom.js");
  const { dashboardRuntimeResolveTouches } = await importFresh(
    "src/assets/js/pages/dashboard-logic.js"
  );

  let refreshCount = 0;
  wireDynamicPageI18nRefresh(
    () => {
      refreshCount += 1;
    },
    {
      shouldRefresh: (detail) => dashboardRuntimeResolveTouches(detail?.keys),
    }
  );

  dispatch("lhai:i18n-runtime-resolved", {
    language: "ko",
    keys: ["dashboard.hero.title"],
  });
  assert.equal(refreshCount, 1);

  dispatch("lhai:i18n-runtime-resolved", {
    language: "ko",
    keys: ["common.save"],
  });
  assert.equal(refreshCount, 2);

  dispatch("lhai:i18n-runtime-resolved", {
    language: "ko",
    keys: ["nav.home"],
  });
  assert.equal(refreshCount, 3);

  dispatch("lhai:i18n-runtime-resolved", {
    language: "ko",
    keys: ["auth.login.title"],
  });
  assert.equal(refreshCount, 3);
});

test("step9-fe-11 skips suspicious long user content without fetch", async () => {
  const { t, resetI18nClientState, flushRuntimeMissingKeys } = await loadI18nClient();
  resetI18nClientState();
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
