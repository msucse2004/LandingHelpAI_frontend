import test from "node:test";
import assert from "node:assert/strict";

/** @type {typeof globalThis} */
const g = globalThis;
g.window = g.window || { location: { pathname: "/", hash: "" }, localStorage: { getItem: () => null, setItem: () => {} } };
g.window.LHAI_API_BASE_URL = "";

const {
  PARTNER_NAV_ITEMS,
  pageKeyFromLocation,
  partnerNavHref,
  resolvePartnerHeaderLinks,
  resolvePartnerPageKey,
  renderPartnerNavHtml,
} = await import("../src/assets/js/config/partner-nav-config.js");

test("PARTNER_NAV_ITEMS always includes messages in fixed order", () => {
  assert.deepEqual(
    PARTNER_NAV_ITEMS.map((i) => i.key),
    ["dashboard", "bid_requests", "messages", "profile"]
  );
  assert.equal(PARTNER_NAV_ITEMS.find((i) => i.key === "messages")?.label, "메시지함");
});

test("renderPartnerNavHtml includes all four links", () => {
  const html = renderPartnerNavHtml();
  assert.ok(html.includes('data-partner-nav="messages"'));
  assert.ok(html.includes("lhai-partner-nav__item"));
  assert.ok(html.includes("메시지함"));
  assert.ok(html.includes('data-partner-nav="profile"'));
});

test("detail pages map to bid_requests active key", () => {
  g.window.location = { pathname: "/partner-bid-request.html", hash: "" };
  assert.equal(pageKeyFromLocation(), "bid_requests");
  g.window.location = { pathname: "/partner-assigned-request.html", hash: "" };
  assert.equal(pageKeyFromLocation(), "bid_requests");
});

test("dashboard hash selects bid_requests", () => {
  g.window.location = { pathname: "/partner-dashboard.html", hash: "#partner-requests" };
  assert.equal(pageKeyFromLocation(), "bid_requests");
  g.window.location = { pathname: "/partner-dashboard.html", hash: "" };
  assert.equal(pageKeyFromLocation(), "dashboard");
});

test("resolvePartnerPageKey maps full paths and aliases", () => {
  assert.equal(
    resolvePartnerPageKey("/src/pages/partner-dashboard.html", ""),
    "dashboard"
  );
  assert.equal(
    resolvePartnerPageKey("/src/pages/partner-dashboard.html", "#partner-requests"),
    "bid_requests"
  );
  assert.equal(resolvePartnerPageKey("/src/pages/partner-bid-request.html"), "bid_requests");
  assert.equal(resolvePartnerPageKey("/src/pages/partner-profile.html"), "profile");
  assert.equal(resolvePartnerPageKey("/src/pages/profile.html"), "profile");
  assert.equal(resolvePartnerPageKey("/src/pages/messages.html"), "messages");
  assert.equal(resolvePartnerPageKey("/src/pages/partner-messages.html"), "messages");
});

test("resolvePartnerHeaderLinks matches nav config", () => {
  const links = resolvePartnerHeaderLinks();
  assert.equal(links.messagesHref, partnerNavHref("messages"));
  assert.equal(links.profileHref, partnerNavHref("profile"));
});
