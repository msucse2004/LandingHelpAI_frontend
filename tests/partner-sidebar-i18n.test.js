import test from "node:test";
import assert from "node:assert/strict";

/** @type {typeof globalThis} */
const g = globalThis;
g.window = g.window || {
  location: { pathname: "/", hash: "" },
  localStorage: { getItem: () => null, setItem: () => {} },
  addEventListener: () => {},
  dispatchEvent: () => true,
};
g.window.LHAI_API_BASE_URL = "";
g.document = g.document || {
  querySelector: () => null,
  querySelectorAll: () => [],
};

const { overlayI18nStrings, resetI18nClientState, t } = await import(
  "../src/assets/js/core/i18n-client.js"
);
const { applyI18nToDom } = await import("../src/assets/js/core/i18n-dom.js");
const { PARTNER_NAV_ITEMS, renderPartnerNavHtml } = await import(
  "../src/assets/js/config/partner-nav-config.js"
);

const EN_LABELS = ["Dashboard", "Request list", "Messages", "Profile"];
const KO_LABELS = ["대시보드", "신청 리스트", "메시지함", "프로필"];

function makeSidebarRoot(html) {
  const textNodes = new Map();
  const ariaNodes = new Map();
  const parser = {
    innerHTML: html,
    querySelectorAll(selector) {
      if (selector === "[data-i18n]") {
        return PARTNER_NAV_ITEMS.map((item) => ({
          getAttribute(attr) {
            if (attr === "data-i18n") return item.i18nKey;
            return null;
          },
          get textContent() {
            return textNodes.get(item.i18nKey) ?? item.fallback;
          },
          set textContent(value) {
            textNodes.set(item.i18nKey, value);
          },
        }));
      }
      if (selector === "[data-i18n-aria-label]") {
        return [
          {
            getAttribute(attr) {
              if (attr === "data-i18n-aria-label") return "partner.nav.aria";
              if (attr === "aria-label") return ariaNodes.get("aria") ?? "Partner menu";
              return null;
            },
            setAttribute(attr, value) {
              if (attr === "aria-label") ariaNodes.set("aria", value);
            },
          },
        ];
      }
      return [];
    },
  };
  return { root: /** @type {ParentNode} */ (parser), textNodes, ariaNodes };
}

test.beforeEach(() => {
  resetI18nClientState();
});

test("PARTNER_NAV_ITEMS use English fallbacks and partner.nav i18n keys", () => {
  assert.deepEqual(
    PARTNER_NAV_ITEMS.map((item) => item.i18nKey),
    [
      "partner.nav.dashboard",
      "partner.nav.bid_requests",
      "partner.nav.messages",
      "partner.nav.profile",
    ]
  );
  assert.deepEqual(PARTNER_NAV_ITEMS.map((item) => item.fallback), EN_LABELS);
  for (const item of PARTNER_NAV_ITEMS) {
    assert.ok(!/[가-힣]/.test(item.fallback), `${item.key} fallback must be English`);
  }
});

test("renderPartnerNavHtml defaults to English labels, not Korean", () => {
  const html = renderPartnerNavHtml();
  for (const label of EN_LABELS) {
    assert.ok(html.includes(label), `expected English label ${label}`);
  }
  for (const label of KO_LABELS) {
    assert.ok(!html.includes(label), `must not embed Korean label ${label}`);
  }
  assert.ok(html.includes('data-i18n="partner.nav.dashboard"'));
  assert.ok(html.includes('data-i18n-aria-label="partner.nav.aria"'));
});

test("getEffectiveLanguage en keeps English sidebar labels via t() fallbacks", () => {
  for (const item of PARTNER_NAV_ITEMS) {
    assert.equal(t(item.i18nKey, item.fallback), item.fallback);
  }
  assert.equal(t("partner.nav.aria", "Partner menu"), "Partner menu");
});

test("getEffectiveLanguage ko uses StringTranslation overlays for sidebar labels", () => {
  overlayI18nStrings({
    "partner.nav.dashboard": "대시보드",
    "partner.nav.bid_requests": "신청 리스트",
    "partner.nav.messages": "메시지함",
    "partner.nav.profile": "프로필",
    "partner.nav.aria": "파트너 메뉴",
  });
  assert.deepEqual(
    PARTNER_NAV_ITEMS.map((item) => t(item.i18nKey, item.fallback)),
    KO_LABELS
  );
  assert.equal(t("partner.nav.aria", "Partner menu"), "파트너 메뉴");

  const { root, textNodes, ariaNodes } = makeSidebarRoot(renderPartnerNavHtml());
  applyI18nToDom(root);
  assert.deepEqual(
    PARTNER_NAV_ITEMS.map((item) => textNodes.get(item.i18nKey)),
    KO_LABELS
  );
  assert.equal(ariaNodes.get("aria"), "파트너 메뉴");
});
