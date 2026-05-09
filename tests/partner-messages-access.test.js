import test from "node:test";
import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";

class MemoryStorage {
  constructor() {
    this.map = new Map();
  }
  getItem(key) {
    return this.map.has(key) ? this.map.get(key) : null;
  }
  setItem(key, value) {
    this.map.set(key, String(value));
  }
  removeItem(key) {
    this.map.delete(key);
  }
  clear() {
    this.map.clear();
  }
}

function buildJsonResponse(payload, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: () => "application/json" },
    async json() {
      return payload;
    },
    async text() {
      return JSON.stringify(payload);
    },
  };
}

async function importFresh(modulePath) {
  const url = pathToFileURL(modulePath);
  url.searchParams.set("t", String(Date.now() + Math.random()));
  return await import(url.href);
}

function installWindowStub() {
  const localStorage = new MemoryStorage();
  globalThis.window = {
    location: {
      hostname: "localhost",
      port: "8000",
      protocol: "http:",
      pathname: "/src/pages/messages.html",
      href: "messages.html",
    },
    localStorage,
  };
  globalThis.localStorage = localStorage;
  return localStorage;
}

test("PARTNER role passes messages access guard", async () => {
  const storage = installWindowStub();
  storage.setItem("lhai_access_token", "token-partner");
  storage.setItem(
    "lhai_session",
    JSON.stringify({ userId: "u-partner", role: "partner", email: "partner@example.com" })
  );

  const { ensureCustomerAccess } = await importFresh(
    "c:\\workspace\\LandingHelpAI\\LandingHelpAI_frontend\\src\\assets\\js\\core\\guards.js"
  );
  assert.equal(ensureCustomerAccess(), true);
});

test("partnerThreadsApi uses /api/partner/threads endpoints", async () => {
  installWindowStub();
  const calls = [];
  globalThis.fetch = async (url, init = {}) => {
    calls.push({ url: String(url), init });
    if (String(url).endsWith("/api/partner/threads")) {
      return buildJsonResponse([{ thread_id: "t-1", title: "Partner Thread" }]);
    }
    if (String(url).includes("/detail")) {
      return buildJsonResponse({ thread: { thread_id: "t-1" }, workflow: null, messages: [] });
    }
    return buildJsonResponse({ id: "msg-1", body: "hello" });
  };

  const { partnerThreadsApi } = await importFresh(
    "c:\\workspace\\LandingHelpAI\\LandingHelpAI_frontend\\src\\assets\\js\\core\\api.js"
  );

  const threads = await partnerThreadsApi.listThreads();
  assert.equal(Array.isArray(threads), true);
  await partnerThreadsApi.threadDetail("thread-123");
  await partnerThreadsApi.sendMessage("thread-123", "고객에게 안내드립니다.");

  assert.equal(calls.length, 3);
  assert.equal(calls[0].url.endsWith("/api/partner/threads"), true);
  assert.equal(calls[1].url.includes("/api/partner/threads/thread-123/detail"), true);
  assert.equal(calls[2].url.includes("/api/partner/threads/thread-123/messages"), true);
  assert.equal(calls[2].init.method, "POST");
  assert.equal(JSON.parse(calls[2].init.body).body, "고객에게 안내드립니다.");
});
