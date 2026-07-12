/**
 * Partner account shared layout shell (header + sidebar + main content slot).
 * Navigation items: {@link ../config/partner-nav-config.js}.
 * @module layouts/partner-shell
 */

import { mountAppHeader } from "../core/app-header.js";
import { getCurrentRole } from "../core/auth.js";
import { ROLES } from "../core/config.js";
import {
  PARTNER_NAV_ITEMS,
  detectPartnerPageKey,
  pageKeyFromLocation,
  renderPartnerNavHtml,
  resolvePartnerPageKey,
} from "../config/partner-nav-config.js";
import { initI18nDomains, t } from "../core/i18n-client.js";
import { getEffectiveLanguage } from "../core/preferred-language.js";
import { applyI18nToDom } from "../core/i18n-dom.js";

export {
  PARTNER_NAV_ITEMS,
  detectPartnerPageKey,
  pageKeyFromLocation,
  resolvePartnerPageKey,
} from "../config/partner-nav-config.js";

/** @typedef {import("../config/partner-nav-config.js").PartnerNavKey} PartnerPageKey */

/** @deprecated use {@link PARTNER_SHELL_ROOT_ID} */
export const PARTNER_APP_SHELL_ID = "lhai-partner-shell-root";

export const PARTNER_SHELL_ROOT_ID = "lhai-partner-shell-root";

/**
 * Wrap ``#lhai-app-header-root`` + ``#app`` into a single partner app shell (header + body).
 * Safe to call multiple times.
 */
export function ensurePartnerAppShellStructure() {
  if (document.getElementById(PARTNER_SHELL_ROOT_ID)) return;

  const headerRoot = document.getElementById("lhai-app-header-root");
  const app = document.getElementById("app");
  if (!headerRoot || !app || headerRoot.nodeType !== 1 || app.nodeType !== 1) return;

  const parent = headerRoot.parentElement;
  if (!parent) return;

  const shell = document.createElement("div");
  shell.id = PARTNER_SHELL_ROOT_ID;
  shell.className = "lhai-partner-shell-root";

  const headerWrap = document.createElement("div");
  headerWrap.className = "lhai-partner-shell__header";

  const bodyWrap = document.createElement("div");
  bodyWrap.className = "lhai-partner-shell__body";

  parent.insertBefore(shell, headerRoot);
  headerWrap.appendChild(headerRoot);
  bodyWrap.appendChild(app);
  shell.appendChild(headerWrap);
  shell.appendChild(bodyWrap);
}

/**
 * Ensure topbar is present on every partner page (shell-owned, not page-specific).
 */
export async function ensurePartnerHeader() {
  ensurePartnerAppShellStructure();
  await mountAppHeader("#lhai-app-header-root");
}

/**
 * @param {import("../config/partner-nav-config.js").PartnerNavKey} pageKey
 */
export function applyPartnerNavActive(pageKey) {
  const key = pageKey || resolvePartnerPageKey(window.location.pathname, window.location.hash);
  const sidebar = document.querySelector("#sidebar");
  if (!sidebar) return;
  const links = sidebar.querySelectorAll("a.lhai-partner-nav__item, a.lhai-partner-nav__link");
  links.forEach((link) => {
    const itemKey = link.getAttribute("data-partner-nav");
    const isActive = itemKey === key;
    if (isActive) {
      link.setAttribute("aria-current", "page");
      link.classList.add("lhai-partner-nav__item--active");
    } else {
      link.removeAttribute("aria-current");
      link.classList.remove("lhai-partner-nav__item--active", "is-active");
    }
  });
}

/**
 * Sync body dataset and sidebar highlight to the resolved partner page key.
 * @param {import("../config/partner-nav-config.js").PartnerNavKey} [pageKey]
 */
export function syncPartnerPageState(pageKey) {
  const key =
    pageKey || resolvePartnerPageKey(window.location.pathname, window.location.hash);
  document.body.dataset.partnerPage = key;
  applyPartnerNavActive(key);
  return key;
}

let partnerHashNavWired = false;

/**
 * Re-apply partner sidebar labels after UI language change.
 */
export async function refreshPartnerSidebarI18n() {
  const target = document.querySelector("#sidebar");
  if (!(target instanceof HTMLElement) || !target.querySelector(".lhai-partner-nav")) return;
  if (getCurrentRole() !== ROLES.PARTNER) return;

  const lang = getEffectiveLanguage();
  try {
    await initI18nDomains(["common", "partner"], lang);
  } catch {
    /* keep English fallbacks when catalog API is unavailable */
  }
  applyI18nToDom(target);
  applyPartnerNavActive(detectPartnerPageKey());
}

function wirePartnerHashNavActive() {
  if (partnerHashNavWired) return;
  partnerHashNavWired = true;
  window.addEventListener("hashchange", () => {
    if (getCurrentRole() !== ROLES.PARTNER) return;
    const file = (window.location.pathname || "").split("/").pop()?.toLowerCase() || "";
    if (file !== "partner-dashboard.html") return;
    syncPartnerPageState();
  });
}

/**
 * Load partner-only sidebar into ``#sidebar`` (always {@link PARTNER_NAV_ITEMS}).
 * @param {PartnerPageKey} [activeKey]
 */
export async function loadPartnerSidebar(activeKey) {
  const target = document.querySelector("#sidebar");
  if (!target) return;

  const lang = getEffectiveLanguage();
  await initI18nDomains(["common", "partner"], lang);
  target.innerHTML = renderPartnerNavHtml((item) => t(item.i18nKey, item.fallback));
  applyI18nToDom(target);
  applyPartnerNavActive(activeKey || detectPartnerPageKey());
  wirePartnerHashNavActive();
}

/**
 * @param {{
 *   contentHtml?: string,
 *   mainExtraClass?: string,
 *   mainId?: string,
 * }} options
 */
export function renderPartnerShellMarkup(options = {}) {
  const contentHtml = options.contentHtml ?? "";
  const mainExtra = String(options.mainExtraClass || "").trim();
  const mainId = String(options.mainId || "").trim();
  const mainClasses = ["lhai-main", "lhai-partner-shell__main", mainExtra].filter(Boolean).join(" ");
  const mainIdAttr = mainId ? ` id="${mainId}"` : "";
  return `<div class="lhai-partner-shell__layout">
    <aside class="lhai-partner-shell__sidebar" id="sidebar"></aside>
    <main class="${mainClasses}"${mainIdAttr}>
      <div class="lhai-partner-shell__content">${contentHtml}</div>
    </main>
  </div>`;
}

/** @alias renderPartnerShellMarkup */
export function renderPartnerShell(options = {}) {
  return renderPartnerShellMarkup(options);
}

/**
 * @param {HTMLElement | string} root
 * @param {{
 *   pageKey?: PartnerPageKey,
 *   pageTitle?: string,
 *   documentTitle?: string,
 *   contentHtml?: string,
 *   mainExtraClass?: string,
 *   mainId?: string,
 * }} [options]
 */
export async function mountPartnerShell(root, options = {}) {
  const pageKey =
    options.pageKey ||
    resolvePartnerPageKey(window.location.pathname, window.location.hash);
  const el =
    typeof root === "string" ? document.querySelector(root) : root instanceof HTMLElement ? root : null;

  await ensurePartnerHeader();

  document.body.classList.add("lhai-partner-shell");
  document.body.classList.remove("lhai-partner-shell-pending");
  syncPartnerPageState(pageKey);

  if (options.documentTitle) {
    document.title = options.documentTitle;
  }

  if (el) {
    el.innerHTML = renderPartnerShellMarkup({
      contentHtml: options.contentHtml ?? "",
      mainExtraClass: options.mainExtraClass,
      mainId: options.mainId,
    });
    el.removeAttribute("aria-busy");
    await loadPartnerSidebar(pageKey);
    const slot = el.querySelector(".lhai-partner-shell__content");
    if (options.pageTitle && slot) {
      const titleEl = slot.querySelector(".lhai-page-header .lhai-title, .lhai-title");
      if (titleEl instanceof HTMLElement) titleEl.textContent = options.pageTitle;
    }
    return slot instanceof HTMLElement ? slot : el.querySelector("main");
  }

  await initPartnerShellOnExistingDom(options);
  return document.querySelector(".lhai-partner-shell__content") || document.querySelector(".lhai-main");
}

async function initPartnerShellOnExistingDom(options = {}) {
  const pageKey =
    options.pageKey ||
    resolvePartnerPageKey(window.location.pathname, window.location.hash);
  await ensurePartnerHeader();
  document.body.classList.add("lhai-partner-shell");
  document.body.classList.remove("lhai-partner-shell-pending");
  syncPartnerPageState(pageKey);

  const main = document.querySelector(options.mainSelector || ".lhai-main");
  if (main instanceof HTMLElement) {
    main.classList.add("lhai-partner-shell__main");
    if (!main.querySelector(".lhai-partner-shell__content")) {
      const wrap = document.createElement("div");
      wrap.className = "lhai-partner-shell__content";
      while (main.firstChild) wrap.appendChild(main.firstChild);
      main.appendChild(wrap);
    }
    if (options.mainExtraClass) {
      options.mainExtraClass
        .split(/\s+/)
        .filter(Boolean)
        .forEach((c) => main.classList.add(c));
    }
  }

  if (options.pageTitle && main) {
    const titleEl = main.querySelector(".lhai-page-header .lhai-title, .lhai-title");
    if (titleEl instanceof HTMLElement) titleEl.textContent = options.pageTitle;
  }

  await loadPartnerSidebar(pageKey);
}

/**
 * @param {Parameters<typeof mountPartnerShell>[1]} [options]
 */
export async function initPartnerShell(options = {}) {
  const app = document.getElementById("app");
  if (app) {
    return mountPartnerShell(app, options);
  }
  return initPartnerShellOnExistingDom(options);
}

/** @deprecated No-op; all partner pages show full {@link PARTNER_NAV_ITEMS}. */
export function applyPartnerBiddingSidebarMessagingHide() {}
