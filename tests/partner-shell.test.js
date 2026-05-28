import test from "node:test";
import assert from "node:assert/strict";

/** @type {typeof globalThis} */
const g = globalThis;
g.window = g.window || {
  location: { pathname: "/", hash: "" },
  localStorage: { getItem: () => null, setItem: () => {} },
  addEventListener: () => {},
};
g.window.LHAI_API_BASE_URL = "";

function mockDomElement(id) {
  return {
    id,
    parentElement: /** @type {HTMLElement | null} */ (null),
    nodeType: 1,
    querySelector: () => null,
    querySelectorAll: () => [],
    classList: { add: () => {}, remove: () => {}, contains: () => false },
    appendChild(/** @type {HTMLElement} */ child) {
      child.parentElement = /** @type {HTMLElement} */ (this);
      return child;
    },
    removeAttribute: () => {},
    setAttribute: () => {},
    getAttribute: () => null,
    removeChild: () => {},
    insertAdjacentElement: () => null,
    innerHTML: "",
    hidden: false,
    dataset: {},
    firstChild: null,
  };
}

const bodyEl = mockDomElement("");
const headerRoot = mockDomElement("lhai-app-header-root");
const appEl = mockDomElement("app");
headerRoot.parentElement = bodyEl;
appEl.parentElement = bodyEl;

g.document = g.document || {
  getElementById: (id) => {
    if (id === "lhai-app-header-root") return headerRoot;
    if (id === "app") return appEl;
    if (id === "lhai-partner-shell-root") return null;
    return null;
  },
  querySelector: () => null,
  querySelectorAll: () => [],
  body: bodyEl,
  documentElement: { lang: "ko", dataset: {} },
  addEventListener: () => {},
  createElement: (tag) => mockDomElement(tag),
};

const { PARTNER_NAV_ITEMS, pageKeyFromLocation } = await import(
  "../src/assets/js/config/partner-nav-config.js"
);
const {
  renderPartnerShellMarkup,
  ensurePartnerAppShellStructure,
  PARTNER_SHELL_ROOT_ID,
} = await import("../src/assets/js/layouts/partner-shell.js");
const detectPartnerPageKey = pageKeyFromLocation;

test("PARTNER_NAV_ITEMS has four consistent entries", () => {
  assert.equal(PARTNER_NAV_ITEMS.length, 4);
  const keys = PARTNER_NAV_ITEMS.map((i) => i.key);
  assert.deepEqual(keys, ["dashboard", "bid_requests", "messages", "profile"]);
});

test("detectPartnerPageKey maps dashboard hash to bid_requests", () => {
  const prev = globalThis.window;
  globalThis.window = {
    location: {
      pathname: "/src/pages/partner-dashboard.html",
      hash: "#partner-requests",
    },
  };
  try {
    assert.equal(detectPartnerPageKey(), "bid_requests");
    globalThis.window.location.hash = "";
    assert.equal(detectPartnerPageKey(), "dashboard");
  } finally {
    globalThis.window = prev;
  }
});

test("renderPartnerShellMarkup includes sidebar and content slot", () => {
  const html = renderPartnerShellMarkup({ contentHtml: '<p id="x">hi</p>', mainId: "main1" });
  assert.ok(html.includes('id="sidebar"'));
  assert.ok(html.includes("lhai-partner-shell__sidebar"));
  assert.ok(html.includes("lhai-partner-shell__layout"));
  assert.ok(html.includes('id="main1"'));
  assert.ok(html.includes('id="x"'));
  assert.ok(html.includes("lhai-partner-shell__content"));
});

test("ensurePartnerAppShellStructure creates partner app wrapper once", () => {
  /** @type {ReturnType<typeof mockDomElement> | null} */
  let createdShell = null;
  bodyEl.insertBefore = (node) => {
    if (node.id === PARTNER_SHELL_ROOT_ID) createdShell = node;
    node.parentElement = bodyEl;
    return node;
  };
  g.document.getElementById = (id) => {
    if (id === PARTNER_SHELL_ROOT_ID) return createdShell;
    if (id === "lhai-app-header-root") return headerRoot;
    if (id === "app") return appEl;
    return null;
  };
  ensurePartnerAppShellStructure();
  assert.ok(createdShell);
  assert.equal(createdShell?.className, "lhai-partner-shell-root");
  ensurePartnerAppShellStructure();
  assert.equal(g.document.getElementById(PARTNER_SHELL_ROOT_ID), createdShell);
});

test("detectPartnerPageKey maps bid detail pages", () => {
  const prev = globalThis.window;
  globalThis.window = {
    location: { pathname: "/partner-bid-request.html", hash: "" },
  };
  try {
    assert.equal(detectPartnerPageKey(), "bid_requests");
  } finally {
    globalThis.window = prev;
  }
});
