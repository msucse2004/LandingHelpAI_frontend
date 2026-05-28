import test from "node:test";
import assert from "node:assert/strict";

const { renderPartnerPageContentHtml } = await import(
  "../src/assets/js/layouts/partner-page-layout.js"
);

test("renderPartnerPageContentHtml wraps header and body sections", () => {
  const html = renderPartnerPageContentHtml({
    title: "프로필",
    subtitle: "설명",
    bodyHtml: '<section class="lhai-card">form</section>',
  });
  assert.ok(html.includes("lhai-partner-page"));
  assert.ok(html.includes("lhai-partner-page__header"));
  assert.ok(html.includes("lhai-partner-page__body"));
  assert.ok(html.includes("<h1 class=\"lhai-title\">프로필</h1>"));
  assert.ok(html.includes("lhai-card"));
});
