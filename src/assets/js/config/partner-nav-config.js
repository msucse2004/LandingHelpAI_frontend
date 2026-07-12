/**
 * Partner account navigation — single source of truth (sidebar, header, active state).
 * @module config/partner-nav-config
 */

/** @typedef {"dashboard" | "bid_requests" | "messages" | "profile"} PartnerNavKey */

/**
 * @typedef {Object} PartnerNavItem
 * @property {PartnerNavKey} key
 * @property {string} i18nKey
 * @property {string} fallback English default label for t() / data-i18n
 * @property {string} href Page-relative URL (same directory as other partner pages).
 */

/** All partner pages render these four items in this order (never hide by page or mode). */
export const PARTNER_NAV_ITEMS = /** @type {const} */ ([
  {
    key: "dashboard",
    i18nKey: "partner.nav.dashboard",
    fallback: "Dashboard",
    href: "partner-dashboard.html",
  },
  {
    key: "bid_requests",
    i18nKey: "partner.nav.bid_requests",
    fallback: "Request list",
    href: "partner-dashboard.html#partner-requests",
  },
  {
    key: "messages",
    i18nKey: "partner.nav.messages",
    fallback: "Messages",
    href: "messages.html",
  },
  {
    key: "profile",
    i18nKey: "partner.nav.profile",
    fallback: "Profile",
    href: "profile.html",
  },
]);

/**
 * HTML filename → default nav key (hash on dashboard overrides bid_requests).
 * Detail / list pages map to parent menu keys.
 */
export const PARTNER_PAGE_TO_NAV_KEY = /** @type {Record<string, PartnerNavKey>} */ ({
  "partner-dashboard.html": "dashboard",
  "partner-bid-request.html": "bid_requests",
  "partner-assigned-request.html": "bid_requests",
  "partner-bid-requests.html": "bid_requests",
  "messages.html": "messages",
  "partner-messages.html": "messages",
  "profile.html": "profile",
  "partner-profile.html": "profile",
  "password.html": "profile",
});

/**
 * @param {string} pathname
 */
export function basenameFromPathname(pathname) {
  const raw = String(pathname || "").split("?")[0].split("#")[0];
  const parts = raw.split("/").filter(Boolean);
  return parts.length ? parts[parts.length - 1].toLowerCase() : "";
}

/**
 * Resolve active nav key from pathname (and optional hash).
 * @param {string} pathname
 * @param {string} [hash]
 * @returns {PartnerNavKey}
 */
export function resolvePartnerPageKey(pathname, hash = "") {
  const file = basenameFromPathname(pathname);
  const hashNorm = String(hash || "").trim().toLowerCase();
  const mapped = PARTNER_PAGE_TO_NAV_KEY[file];

  if (file === "partner-dashboard.html") {
    return hashNorm === "#partner-requests" ? "bid_requests" : "dashboard";
  }
  if (mapped) return mapped;
  return "dashboard";
}

/**
 * Active nav key for current or given location.
 * @param {Pick<Location, "pathname" | "hash">} [loc]
 * @returns {PartnerNavKey}
 */
export function pageKeyFromLocation(loc = window.location) {
  return resolvePartnerPageKey(loc.pathname, loc.hash);
}

/** @alias pageKeyFromLocation */
export const detectPartnerPageKey = pageKeyFromLocation;

/**
 * @param {PartnerNavKey} key
 * @returns {PartnerNavItem | undefined}
 */
export function getPartnerNavItem(key) {
  return PARTNER_NAV_ITEMS.find((item) => item.key === key);
}

/**
 * @param {PartnerNavKey} key
 * @returns {string}
 */
export function partnerNavHref(key) {
  return getPartnerNavItem(key)?.href ?? "partner-dashboard.html";
}

/**
 * Sidebar / legacy highlight: basename of href for active comparison.
 * @param {PartnerNavKey} key
 */
export function partnerNavActiveHrefBasename(key) {
  const href = partnerNavHref(key);
  return basenameFromPathname(href.split("#")[0]);
}

/**
 * Header mail icon + account dropdown (partner role).
 * @returns {{ messagesHref: string; profileHref: string; passwordHref: string }}
 */
export function resolvePartnerHeaderLinks() {
  return {
    messagesHref: partnerNavHref("messages"),
    profileHref: partnerNavHref("profile"),
    passwordHref: "password.html",
  };
}

/**
 * Render sidebar nav HTML (no role-based hiding).
 * Uses ``data-i18n`` bindings with English fallbacks; call {@link applyI18nToDom} after insert.
 * @param {(item: PartnerNavItem) => string} [labelFn] optional resolver (e.g. t(item.i18nKey, item.fallback))
 */
export function renderPartnerNavHtml(labelFn) {
  const labelFor =
    typeof labelFn === "function" ? labelFn : (/** @type {PartnerNavItem} */ item) => item.fallback;
  const items = PARTNER_NAV_ITEMS.map(
    (item) =>
      `<a class="lhai-partner-nav__item" data-partner-nav="${item.key}" href="${item.href}" data-i18n="${item.i18nKey}">${labelFor(item)}</a>`
  ).join("");
  const navAriaFallback = labelFor({
    key: "dashboard",
    i18nKey: "partner.nav.aria",
    fallback: "Partner menu",
    href: "",
  });
  return `<nav class="lhai-nav lhai-partner-nav" aria-label="${navAriaFallback}" data-i18n-aria-label="partner.nav.aria">${items}</nav>`;
}
