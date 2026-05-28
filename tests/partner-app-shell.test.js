import test from "node:test";
import assert from "node:assert/strict";

test("renderAppHeaderMarkup includes brand, mail icon, and user menu", async () => {
  const { renderAppHeaderMarkup } = await import("../src/assets/js/components/app-header-markup.js");
  const html = renderAppHeaderMarkup({
    brand: "Landing Help AI",
    profileHref: "profile.html",
    passwordHref: "password.html",
    messagesHref: "messages.html",
    messagesIsCurrent: true,
  });
  assert.ok(html.includes("Landing Help AI"));
  assert.ok(html.includes('id="lhai-header-messages-link"'));
  assert.ok(html.includes('aria-current="page"'));
  assert.ok(html.includes("lhai-user-menu"));
  assert.ok(html.includes("data-lhai-logout"));
});
