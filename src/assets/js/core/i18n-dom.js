import { initI18nDomains, t } from "./i18n-client.js";

function applyI18nText(root = document) {
  root.querySelectorAll("[data-i18n]").forEach((el) => {
    const key = el.getAttribute("data-i18n");
    if (!key) return;
    el.textContent = t(key, el.textContent || "");
  });
}

function applyI18nPlaceholder(root = document) {
  root.querySelectorAll("[data-i18n-placeholder]").forEach((el) => {
    const key = el.getAttribute("data-i18n-placeholder");
    if (!key) return;
    el.placeholder = t(key, el.placeholder || "");
  });
}

function applyI18nTitle(root = document) {
  root.querySelectorAll("[data-i18n-title]").forEach((el) => {
    const key = el.getAttribute("data-i18n-title");
    if (!key) return;
    el.title = t(key, el.title || "");
  });
}

function applyI18nAriaLabel(root = document) {
  root.querySelectorAll("[data-i18n-aria-label]").forEach((el) => {
    const key = el.getAttribute("data-i18n-aria-label");
    if (!key) return;
    el.setAttribute("aria-label", t(key, el.getAttribute("aria-label") || ""));
  });
}

export function applyI18nToDom(root = document) {
  applyI18nText(root);
  applyI18nPlaceholder(root);
  applyI18nTitle(root);
  applyI18nAriaLabel(root);
}

/** Load `common` domain once, then apply declarative data-i18n* attributes under `root`. */
export async function initCommonI18nAndApplyDom(root = document) {
  const lang = document.documentElement.lang || "en";
  try {
    await initI18nDomains(["common"], lang);
  } catch {
    // Keep rendering with built-in fallback strings even if i18n API is unavailable.
  }
  applyI18nToDom(root);
}

