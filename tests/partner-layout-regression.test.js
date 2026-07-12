/**
 * Partner layout consistency regression (Prompt Set 7).
 * Static + unit checks for header, sidebar, nav active, shell markup, CSS boundaries.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const PAGES_DIR = join(ROOT, "src", "pages");
const CSS_PAGES = join(ROOT, "src", "assets", "css", "pages");
const CSS_SHELL = join(ROOT, "src", "assets", "css", "layouts", "partner-shell.css");

/** @type {typeof globalThis} */
const g = globalThis;
g.window = g.window || {
  location: { pathname: "/", hash: "" },
  localStorage: { getItem: () => null, setItem: () => {} },
  addEventListener: () => {},
};
g.window.LHAI_API_BASE_URL = "";
g.document = g.document || {
  getElementById: () => null,
  querySelector: () => null,
  querySelectorAll: () => [],
  body: { classList: { add: () => {}, remove: () => {} }, dataset: {} },
  documentElement: { lang: "ko", dataset: {} },
  addEventListener: () => {},
  createElement: () => ({ appendChild: () => {}, nodeType: 1 }),
};

const {
  PARTNER_NAV_ITEMS,
  resolvePartnerPageKey,
  renderPartnerNavHtml,
  resolvePartnerHeaderLinks,
} = await import("../src/assets/js/config/partner-nav-config.js");

const { renderPartnerShellMarkup, applyPartnerNavActive, PARTNER_SHELL_ROOT_ID } = await import(
  "../src/assets/js/layouts/partner-shell.js"
);

const { renderAppHeaderMarkup } = await import("../src/assets/js/components/app-header-markup.js");

/** @type {Array<{ id: string, html: string, navKey: string, pathname: string, hash?: string }>} */
const PARTNER_SURFACES = [
  {
    id: "dashboard",
    html: "partner-dashboard.html",
    navKey: "dashboard",
    pathname: "/src/pages/partner-dashboard.html",
    hash: "",
  },
  {
    id: "bid_list",
    html: "partner-dashboard.html",
    navKey: "bid_requests",
    pathname: "/src/pages/partner-dashboard.html",
    hash: "#partner-requests",
  },
  {
    id: "bid_detail",
    html: "partner-bid-request.html",
    navKey: "bid_requests",
    pathname: "/src/pages/partner-bid-request.html",
  },
  {
    id: "assigned_detail",
    html: "partner-assigned-request.html",
    navKey: "bid_requests",
    pathname: "/src/pages/partner-assigned-request.html",
  },
  { id: "profile", html: "profile.html", navKey: "profile", pathname: "/src/pages/profile.html" },
  { id: "messages", html: "messages.html", navKey: "messages", pathname: "/src/pages/messages.html" },
];

const SHELL_FORBIDDEN_IN_PAGE_CSS = [
  /\.lhai-partner-shell__header\s*\{/,
  /\.lhai-partner-shell__sidebar\s*\{/,
  /\.lhai-partner-shell__main\s*\{/,
  /#lhai-app-header-root\s*\{/,
  /\.lhai-topbar\s*\{[^}]*display\s*:\s*none/,
  /\.lhai-partner-nav__item[^}]*display\s*:\s*none/,
];

const PAGE_CSS_FILES = [
  "partner-dashboard.css",
  "partner-bid-request.css",
  "partner-assigned-request.css",
  "partner-profile.css",
  "partner-messages.css",
  "partner-bid-requests.css",
];

function readPageHtml(name) {
  const path = join(PAGES_DIR, name);
  assert.ok(existsSync(path), `missing page: ${name}`);
  return readFileSync(path, "utf8");
}

test("1. partner pages include header root, shell CSS, and header scripts", () => {
  const requiredHtml = [
    "partner-dashboard.html",
    "partner-bid-request.html",
    "partner-assigned-request.html",
    "profile.html",
    "messages.html",
  ];
  for (const file of requiredHtml) {
    const html = readPageHtml(file);
    assert.match(html, /id="lhai-app-header-root"/, `${file}: header root`);
    assert.match(html, /layouts\/partner-shell\.css/, `${file}: partner-shell.css`);
    assert.match(html, /app-header\.js/, `${file}: app-header.js`);
    assert.match(html, /logout-button\.js/, `${file}: logout-button.js`);
    assert.match(html, /admin-user-menu\.js/, `${file}: admin-user-menu.js`);
  }
});

test("2. sidebar nav — four items on every surface (incl. messages)", () => {
  const html = renderPartnerNavHtml();
  const labels = ["Dashboard", "Request list", "Messages", "Profile"];
  for (const label of labels) {
    assert.ok(html.includes(label), `nav must include ${label}`);
  }
  assert.equal((html.match(/lhai-partner-nav__item/g) || []).length, 4);
  assert.ok(!html.includes("lhai-partner-nav__link"), "legacy __link class removed");
  assert.ok(!html.includes("대시보드"), "nav must not hardcode Korean labels");
});

test("3. active menu keys for all partner routes", () => {
  for (const surface of PARTNER_SURFACES) {
    const key = resolvePartnerPageKey(surface.pathname, surface.hash || "");
    assert.equal(
      key,
      surface.navKey,
      `${surface.id}: ${surface.pathname}${surface.hash || ""}`
    );
  }
});

test("4. shell markup has sidebar, main, content (single layout)", () => {
  const markup = renderPartnerShellMarkup({ contentHtml: "<p id='t'>x</p>", mainId: "m1" });
  assert.ok(markup.includes("lhai-partner-shell__layout"));
  assert.ok(markup.includes('class="lhai-partner-shell__sidebar"'));
  assert.ok(markup.includes('class="lhai-main lhai-partner-shell__main"'));
  assert.ok(markup.includes("lhai-partner-shell__content"));
  assert.ok(!markup.includes('class="lhai-sidebar"'), "generic lhai-sidebar class not used");
});

test("5. header markup includes brand, mail icon, user menu", () => {
  const html = renderAppHeaderMarkup({
    brand: "Landing Help AI",
    profileHref: "profile.html",
    passwordHref: "password.html",
    messagesHref: "messages.html",
    messagesIsCurrent: false,
  });
  assert.ok(html.includes("Landing Help AI"));
  assert.ok(html.includes("lhai-topbar-mail"));
  assert.ok(html.includes("lhai-user-menu"));
  assert.ok(html.includes("lhai-header-role-badge"));
});

test("6. partner header links use nav config", () => {
  const links = resolvePartnerHeaderLinks();
  assert.equal(links.messagesHref, "messages.html");
  assert.equal(links.profileHref, "profile.html");
});

test("7. applyPartnerNavActive sets only one --active item", () => {
  const items = PARTNER_NAV_ITEMS.map(
    (item, i) => {
      const el = {
        nodeType: 1,
        getAttribute: (n) => (n === "data-partner-nav" ? item.key : null),
        classList: {
          _c: new Set(),
          add(...cls) {
            cls.forEach((c) => this._c.add(c));
          },
          remove(...cls) {
            cls.forEach((c) => this._c.delete(c));
          },
          contains(c) {
            return this._c.has(c);
          },
        },
        setAttribute: () => {},
        removeAttribute: () => {},
      };
      return el;
    }
  );
  const sidebar = {
    querySelectorAll: (sel) => {
      if (sel.includes("lhai-partner-nav__item")) return items;
      return [];
    },
  };
  g.document.querySelector = (sel) => (sel === "#sidebar" ? sidebar : null);

  applyPartnerNavActive("messages");
  const active = items.filter((el) => el.classList.contains("lhai-partner-nav__item--active"));
  assert.equal(active.length, 1);
  assert.equal(active[0].getAttribute("data-partner-nav"), "messages");
});

test("8. page CSS must not override partner shell layout", () => {
  for (const file of PAGE_CSS_FILES) {
    const path = join(CSS_PAGES, file);
    if (!existsSync(path)) continue;
    const css = readFileSync(path, "utf8");
    for (const pattern of SHELL_FORBIDDEN_IN_PAGE_CSS) {
      assert.equal(
        pattern.test(css),
        false,
        `${file} must not override shell (${pattern})`
      );
    }
  }
});

test("9. partner-shell.css defines layout tokens and mobile grid", () => {
  const css = readFileSync(CSS_SHELL, "utf8");
  assert.ok(css.includes("--lhai-partner-sidebar-width"));
  assert.ok(css.includes("--lhai-partner-header-height"));
  assert.ok(css.includes("--lhai-partner-content-padding"));
  assert.ok(css.includes(".lhai-partner-shell__header"));
  assert.ok(css.includes(".lhai-partner-shell__sidebar"));
  assert.ok(css.includes(".lhai-partner-nav__item--active"));
  assert.ok(css.includes("@media (max-width: 900px)"));
});

test("10. shell root id used for header+app wrap", () => {
  assert.equal(PARTNER_SHELL_ROOT_ID, "lhai-partner-shell-root");
});

test("11. no duplicate PARTNER_NAV definition outside config", async () => {
  const configSrc = readFileSync(
    join(ROOT, "src", "assets", "js", "config", "partner-nav-config.js"),
    "utf8"
  );
  assert.ok(configSrc.includes("export const PARTNER_NAV_ITEMS"));
  const shellSrc = readFileSync(join(ROOT, "src", "assets", "js", "layouts", "partner-shell.js"), "utf8");
  assert.ok(!shellSrc.includes("label: \"메시지함\""), "nav labels only in config");
});
