import { customerCasesApi } from "../core/api.js";
import { ensureCustomerAccess, protectCurrentPage } from "../core/guards.js";
import { loadSidebar } from "../components/sidebar.js";
import { resolveAppHeaderShell, refreshHeaderMailUnreadBadge } from "../core/app-header.js";
import { bootAppPageContent } from "../core/app-page-i18n-boot.js";
import { applyDocumentLanguageAttributes, applyI18nToDom, wireDynamicPageI18nRefresh } from "../core/i18n-dom.js";
import { flushRuntimeMissingKeysAfterPageApply, reloadI18nForLanguage, t } from "../core/i18n-client.js";
import { getEffectiveLanguage, normalizeSupportedLanguageCode } from "../core/preferred-language.js";
import {
  customerCaseDisplayStatusLabel,
  customerCaseDisplaySubtitle,
  customerCaseDisplayTitle,
  customerCaseStatusBadgeClass,
} from "./dashboard-logic.js";

const CASES_I18N_DOMAINS = ["common", "nav", "dashboard"];

/** @type {Array<Record<string, unknown>>} */
let casesPageCache = [];
let casesViewerLocaleRefetchInFlight = false;

function qs(selector) {
  return document.querySelector(selector);
}

function esc(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function intlLocaleForUiLanguage(lang) {
  const code = normalizeSupportedLanguageCode(lang) || getEffectiveLanguage();
  if (code === "ko") return "ko-KR";
  if (code === "en") return "en-US";
  return code;
}

function formatUpdated(iso) {
  try {
    const d = new Date(iso);
    return d.toLocaleString(intlLocaleForUiLanguage(getEffectiveLanguage()), {
      dateStyle: "medium",
      timeStyle: "short",
    });
  } catch {
    return "—";
  }
}

function applyCasesPageShellI18n() {
  applyDocumentLanguageAttributes(getEffectiveLanguage());
  try {
    document.title = `${t("common.sidebar.customer.cases", "My requests")} - Landing Help AI`;
  } catch {
    /* non-browser */
  }
}

function renderCaseCards(cases) {
  const host = qs("#casesListHost");
  const empty = qs("#casesEmptyState");
  const list = qs("#casesListHost");
  if (!host) return;

  if (!cases.length) {
    if (list) list.hidden = true;
    if (empty) empty.hidden = false;
    host.innerHTML = "";
    return;
  }

  if (empty) empty.hidden = true;
  if (list) list.hidden = false;

  const updatedLabel = t("customer.cases.updated", "Updated");
  const noPreview = t("customer.cases.no_preview", "No summary yet.");

  host.innerHTML = cases
    .map((c) => {
      const href = `case-detail.html?case_id=${encodeURIComponent(String(c.case_id || ""))}`;
      const title = customerCaseDisplayTitle(c);
      const statusLabel = customerCaseDisplayStatusLabel(c);
      const badgeClass = customerCaseStatusBadgeClass(c);
      const subtitle = customerCaseDisplaySubtitle(c);
      const preview = subtitle.length > 72 ? `${subtitle.slice(0, 72)}…` : subtitle;
      const updatedAt = c.last_activity_at ? formatUpdated(c.last_activity_at) : "—";
      return `<a class="lhai-case-card" href="${esc(href)}">
        <div class="lhai-case-card__head">
          <h2 class="lhai-case-card__title">${esc(title)}</h2>
          <span class="lhai-case-badge ${esc(badgeClass)}">${esc(statusLabel)}</span>
        </div>
        <p class="lhai-case-card__meta">${esc(updatedLabel)} ${esc(updatedAt)}</p>
        <p class="u-text-muted u-mt-2" style="font-size:0.9rem;margin:0;">${esc(preview || noPreview)}</p>
      </a>`;
    })
    .join("");
}

function renderCasesPageFromCache() {
  renderCaseCards(casesPageCache);
}

async function refetchCasesForViewerLocale() {
  try {
    const rows = await customerCasesApi.list();
    casesPageCache = Array.isArray(rows)
      ? [...rows].sort((a, b) => {
          const ta = a.last_activity_at ? new Date(a.last_activity_at).getTime() : 0;
          const tb = b.last_activity_at ? new Date(b.last_activity_at).getTime() : 0;
          return tb - ta;
        })
      : [];
    return true;
  } catch {
    return false;
  }
}

async function loadAndRenderCases({ showLoading = true } = {}) {
  const loading = qs("#casesLoadingState");
  const errEl = qs("#casesErrorState");
  const empty = qs("#casesEmptyState");
  const list = qs("#casesListHost");

  if (showLoading && loading) loading.hidden = false;
  if (errEl) errEl.hidden = true;
  if (empty) empty.hidden = true;
  if (list) list.hidden = true;

  const ok = await refetchCasesForViewerLocale();
  if (loading) loading.hidden = true;

  if (!ok) {
    if (errEl) {
      errEl.hidden = false;
      errEl.textContent = t(
        "customer.cases.load_error",
        "Could not load your requests. Check your connection and try again.",
      );
    }
    if (casesPageCache.length) {
      renderCasesPageFromCache();
      if (list) list.hidden = false;
    }
    return;
  }

  renderCasesPageFromCache();
}

function refreshCasesPageStaticFromCache() {
  if (casesViewerLocaleRefetchInFlight) return;
  applyCasesPageShellI18n();
  applyI18nToDom(document);
  renderCasesPageFromCache();
  void flushRuntimeMissingKeysAfterPageApply();
}

async function refreshCasesPageForViewerLanguage() {
  if (casesViewerLocaleRefetchInFlight) return;
  casesViewerLocaleRefetchInFlight = true;
  try {
    applyCasesPageShellI18n();
    try {
      await reloadI18nForLanguage(getEffectiveLanguage(), CASES_I18N_DOMAINS);
    } catch {
      /* keep merged locale bundle fallbacks */
    }
    await refetchCasesForViewerLocale();
    applyI18nToDom(document);
    renderCasesPageFromCache();
    await flushRuntimeMissingKeysAfterPageApply();
  } finally {
    casesViewerLocaleRefetchInFlight = false;
  }
}

wireDynamicPageI18nRefresh(() => {
  void refreshCasesPageForViewerLanguage();
}, { languageChangeOnly: true });

wireDynamicPageI18nRefresh(refreshCasesPageStaticFromCache, {
  runtimeResolvedOnly: true,
  keyPrefixes: ["customer.cases.", "common.sidebar.customer.cases", "dashboard.case_status.", "common.", "nav."],
});

async function initCasesPage() {
  if (!protectCurrentPage()) return;
  if (!ensureCustomerAccess()) return;
  await bootAppPageContent(CASES_I18N_DOMAINS, async () => {
    await loadSidebar("#sidebar", "customer");
    const brandEl = document.querySelector(".lhai-brand");
    if (brandEl) brandEl.textContent = resolveAppHeaderShell().brand;
    void refreshHeaderMailUnreadBadge();
    applyCasesPageShellI18n();
    applyI18nToDom(document);
    await loadAndRenderCases({ showLoading: true });
    await flushRuntimeMissingKeysAfterPageApply();
  });
}

void initCasesPage();
