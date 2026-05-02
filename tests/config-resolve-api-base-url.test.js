import test from "node:test";
import assert from "node:assert/strict";

/** @param {{ hostname: string, port?: string, protocol?: string }} loc */
function setWindowLocation(loc, lhai = "") {
  globalThis.window = {
    LHAI_API_BASE_URL: lhai,
    location: {
      hostname: loc.hostname,
      port: loc.port ?? "",
      protocol: loc.protocol ?? "http:",
    },
  };
}

globalThis.window = {
  LHAI_API_BASE_URL: "",
  location: { hostname: "localhost", port: "8000", protocol: "http:" },
};

const { resolveApiBaseUrl } = await import("../src/assets/js/core/config.js");

test("LHAI_API_BASE_URL explicit: trailing slash stripped", () => {
  setWindowLocation({ hostname: "example.com", port: "", protocol: "https:" }, "https://api.example.com/v1/");
  assert.equal(resolveApiBaseUrl(), "https://api.example.com/v1");
});

test("localhost port 8000 -> same-origin (empty base)", () => {
  setWindowLocation({ hostname: "localhost", port: "8000", protocol: "http:" });
  assert.equal(resolveApiBaseUrl(), "");
});

test("127.0.0.1 default port -> same-origin", () => {
  setWindowLocation({ hostname: "127.0.0.1", port: "", protocol: "http:" });
  assert.equal(resolveApiBaseUrl(), "");
});

test("http localhost:3000 (Live Server) -> backend on :8000", () => {
  setWindowLocation({ hostname: "localhost", port: "3000", protocol: "http:" });
  assert.equal(resolveApiBaseUrl(), "http://localhost:8000");
});

test("https Cloudflare tunnel host -> same-origin (avoid mixed content)", () => {
  setWindowLocation({ hostname: "crew-assuming-affected-mac.trycloudflare.com", port: "", protocol: "https:" });
  assert.equal(resolveApiBaseUrl(), "");
});

test("http LAN host -> backend on :8000", () => {
  setWindowLocation({ hostname: "192.168.1.10", port: "8080", protocol: "http:" });
  assert.equal(resolveApiBaseUrl(), "http://localhost:8000");
});

test("https + explicit LHAI_API_BASE_URL wins over same-origin default", () => {
  setWindowLocation({ hostname: "app.example.com", port: "", protocol: "https:" }, "https://api.example.com");
  assert.equal(resolveApiBaseUrl(), "https://api.example.com");
});
