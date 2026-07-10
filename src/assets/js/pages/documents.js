import { documentsApi, invoiceApi, requiredDocumentsCustomerApi } from "../core/api.js";
import { getSession } from "../core/auth.js";
import { ensureCustomerAccess, protectCurrentPage } from "../core/guards.js";
import { patchState } from "../core/state.js";
import { loadSidebar } from "../components/sidebar.js";
import { applyDocumentLanguageAttributes, applyI18nToDom, wireDynamicPageI18nRefresh } from "../core/i18n-dom.js";
import { bootAppPageContent } from "../core/app-page-i18n-boot.js";
import { mergeFallbackStrings, reloadI18nForLanguage, t, flushRuntimeMissingKeysAfterPageApply } from "../core/i18n-client.js";
import { getEffectiveLanguage } from "../core/preferred-language.js";
import { formatDate } from "../core/utils.js";
import { getDocumentsPageLocaleBundle } from "./documents-page-locale.js";

const DEMO_PROFILE = "profile::demo@customer.com";

const DOCUMENTS_I18N_DOMAINS = ["common", "nav", "documents"];

/** @type {{ customerProfileId: string, paid: boolean, documents: Array<Record<string, unknown>>, requiredRows: Array<Record<string, unknown>> | null, lastUploadFeedback: { name: string, statusLabel: string } | null }} */
const documentsPageCache = {
  customerProfileId: "",
  paid: false,
  documents: [],
  requiredRows: null,
  lastUploadFeedback: null,
};

/** English sources for upload-list status badges (enum → t fallback). */
const UPLOAD_STATUS_EN = {
  REQUESTED: "Requested",
  UPLOADED: "Uploaded",
  UNDER_REVIEW: "Under review",
  APPROVED: "Approved",
  REJECTED: "Rejected",
};

/** English sources for required-document status badges. */
const REQUIRED_STATUS_EN = {
  REQUESTED: "Action needed",
  WAIVED: "Waived",
  UPLOADED: "Submitted",
  UNDER_REVIEW: "Under review",
  APPROVED: "Approved",
  REJECTED: "Rejected / resubmit",
  CANCELLED: "Canceled",
};

function qs(selector) {
  return document.querySelector(selector);
}

function escHtml(text) {
  const div = document.createElement("div");
  div.textContent = text == null ? "" : String(text);
  return div.innerHTML;
}

function sectionTarget(documentType) {
  return {
    documents_received: "#sectionDocumentsReceived",
    documents_submitted: "#sectionDocumentsSubmitted",
    generated_documents: "#sectionGeneratedDocuments",
    consent_documents: "#sectionConsentDocuments",
    power_of_attorney: "#sectionPowerOfAttorney",
    completion_documents: "#sectionCompletionDocuments",
  }[documentType];
}

function applyDocumentsPageLocaleBundle() {
  const lang = getEffectiveLanguage();
  applyDocumentLanguageAttributes(lang);
  mergeFallbackStrings(getDocumentsPageLocaleBundle(lang));
}

/**
 * @param {string | Record<string, unknown>} statusOrDoc
 * @param {"upload" | "required"} kind
 */
function resolveDocumentStatusLabel(statusOrDoc, kind = "upload") {
  const doc = statusOrDoc && typeof statusOrDoc === "object" ? statusOrDoc : null;
  const fromApi = doc && String(doc.display_status_label || "").trim();
  if (fromApi) return fromApi;

  const rawStatus = doc ? doc.status ?? doc.review_status : statusOrDoc;
  const token = String(rawStatus || "").trim().toUpperCase();
  if (!token) return "—";

  const prefix =
    kind === "required" ? "customer.documents.required.status." : "customer.documents.upload.status.";
  const fallbackMap = kind === "required" ? REQUIRED_STATUS_EN : UPLOAD_STATUS_EN;
  const fallback = fallbackMap[token] || token;
  return t(`${prefix}${token}`, fallback);
}

function readUploadFormPreserve() {
  const nameEl = qs("#uploadName");
  const typeEl = qs("#uploadType");
  return {
    name: nameEl instanceof HTMLInputElement ? nameEl.value : "",
    type: typeEl instanceof HTMLSelectElement ? typeEl.value : "",
  };
}

/** @param {{ name?: string, type?: string } | null} preserve */
function restoreUploadFormPreserve(preserve) {
  if (!preserve) return;
  const nameEl = qs("#uploadName");
  const typeEl = qs("#uploadType");
  if (nameEl instanceof HTMLInputElement) nameEl.value = preserve.name || "";
  if (typeEl instanceof HTMLSelectElement && preserve.type) typeEl.value = preserve.type;
}

function applyUploadStatusLine() {
  const statusEl = qs("#documentUploadStatus");
  if (!(statusEl instanceof HTMLElement)) return;
  const fb = documentsPageCache.lastUploadFeedback;
  if (fb) {
    statusEl.textContent = t("customer.documents.upload.success", "Uploaded {name} ({status}).")
      .replace("{name}", String(fb.name || ""))
      .replace("{status}", String(fb.statusLabel || ""));
    return;
  }
  statusEl.textContent = t("customer.documents.upload.empty_status", "No files uploaded yet.");
}

function renderSection(documentType, documents) {
  const selector = sectionTarget(documentType);
  if (!selector) return;
  const target = qs(selector);
  if (!target) return;
  if (!documents.length) {
    target.innerHTML = `<div class="lhai-state lhai-state--empty">${escHtml(
      t("customer.documents.section.empty", "No documents in this section."),
    )}</div>`;
    return;
  }
  target.innerHTML = documents
    .map(
      (doc) => `
      <article class="lhai-doc-item">
        <strong>${escHtml(doc.name)}</strong>
        <div class="lhai-doc-meta">
          <span class="lhai-badge">${escHtml(resolveDocumentStatusLabel(doc, "upload"))}</span>
          <span class="lhai-badge">${escHtml(
            resolveDocumentStatusLabel(
              { status: doc.review_status, display_status_label: doc.display_review_status_label },
              "upload",
            ),
          )}</span>
          <span class="lhai-badge">${escHtml(doc.version_label || "v1")}</span>
        </div>
        <div class="u-flex u-gap-2">
          <button class="lhai-button lhai-button--secondary" type="button">${escHtml(
            t("customer.documents.action.view_stub", "View (Stub)"),
          )}</button>
          <button class="lhai-button lhai-button--secondary" type="button">${escHtml(
            t("customer.documents.action.download_stub", "Download (Stub)"),
          )}</button>
        </div>
      </article>
    `,
    )
    .join("");
}

function renderAllSections(documents) {
  const types = [
    "documents_received",
    "documents_submitted",
    "generated_documents",
    "consent_documents",
    "power_of_attorney",
    "completion_documents",
  ];
  types.forEach((type) => {
    renderSection(type, documents.filter((d) => d.document_type === type));
  });
}

/**
 * @param {Array<Record<string, unknown>>} rows
 */
function renderRequiredDocsCards(rows) {
  return rows
    .map((r) => {
      const required = Boolean(r.required);
      const reqBadge = required
        ? `<span class="lhai-badge lhai-badge--status-active">${escHtml(
            t("customer.documents.required.badge_required", "Required"),
          )}</span>`
        : `<span class="lhai-badge">${escHtml(t("customer.documents.required.badge_optional", "Optional"))}</span>`;
      const name = escHtml(String(r.display_title || r.name || "—"));
      const shortD =
        r.display_description || r.short_description
          ? `<p class="lhai-required-doc-card__prose u-mt-1">${escHtml(
              String(r.display_description || r.short_description),
            )}</p>`
          : "";
      const whyBody = String(r.display_body || r.reason_text || "").trim();
      const why = whyBody
        ? `<p class="lhai-required-doc-card__label">${escHtml(
            t("customer.documents.required.label_why", "Why we need this"),
          )}</p><p class="lhai-required-doc-card__prose">${escHtml(whyBody)}</p>`
        : "";
      const timing = r.timing
        ? `<p class="lhai-required-doc-card__label">${escHtml(
            t("customer.documents.required.label_timing", "When to prepare or submit"),
          )}</p><p class="lhai-required-doc-card__prose">${escHtml(r.timing)}</p>`
        : "";
      const ex = r.example_note
        ? `<p class="lhai-required-doc-card__label">${escHtml(
            t("customer.documents.required.label_example", "Examples / notes"),
          )}</p><p class="lhai-required-doc-card__prose">${escHtml(r.example_note)}</p>`
        : "";
      const due = r.due_at
        ? `<span class="lhai-badge">${escHtml(t("customer.documents.required.label_due", "Due"))}: ${escHtml(
            formatDate(r.due_at),
          )}</span>`
        : "";
      const statusText = resolveDocumentStatusLabel(r, "required");
      const statusBadge = `<span class="lhai-badge" title="${escHtml(
        t("customer.documents.required.label_status", "Status"),
      )}">${escHtml(statusText)}</span>`;
      return `<article class="lhai-required-doc-card">
        <div class="lhai-required-doc-card__title-row">
          <strong>${name}</strong>
          ${reqBadge}
        </div>
        <div class="lhai-required-doc-card__meta">${statusBadge}${due}</div>
        ${shortD}${why}${timing}${ex}
      </article>`;
    })
    .join("");
}

function renderRequiredDocsList(rows) {
  const section = qs("#customerRequiredDocsSection");
  const list = qs("#customerRequiredDocsList");
  const st = qs("#customerRequiredDocsStatus");
  if (!section || !list) return;

  section.hidden = false;
  if (!Array.isArray(rows) || !rows.length) {
    if (st) st.textContent = "";
    list.innerHTML = `<div class="lhai-state lhai-state--empty">${escHtml(
      t(
        "customer.documents.required.empty",
        "No required document requests are listed yet. If you just paid, check back shortly or follow the guidance in Messages and email.",
      ),
    )}</div>`;
    return;
  }
  if (st) st.textContent = "";
  list.innerHTML = renderRequiredDocsCards(rows);
}

async function refetchRequiredDocsForViewerLocale({ showLoading = false, showErrorOnFailure = true } = {}) {
  const customerProfileId = documentsPageCache.customerProfileId;
  if (!documentsPageCache.paid || !customerProfileId) return true;

  const section = qs("#customerRequiredDocsSection");
  const list = qs("#customerRequiredDocsList");
  const st = qs("#customerRequiredDocsStatus");
  if (!section || !list) return true;

  section.hidden = false;
  if (showLoading && st) {
    st.textContent = t("customer.documents.required.loading", "Loading your required documents…");
  }

  try {
    const rows = await requiredDocumentsCustomerApi.list(customerProfileId, {
      acceptLanguage: getEffectiveLanguage(),
    });
    documentsPageCache.requiredRows = Array.isArray(rows) ? rows : [];
    renderRequiredDocsList(documentsPageCache.requiredRows);
    if (st) st.textContent = "";
    return true;
  } catch {
    if (showErrorOnFailure && st) {
      st.textContent = t(
        "customer.documents.required.load_error",
        "Could not load the list. Please try again.",
      );
    }
    if (Array.isArray(documentsPageCache.requiredRows)) {
      renderRequiredDocsList(documentsPageCache.requiredRows);
    } else if (list) {
      list.innerHTML = "";
    }
    return false;
  }
}

/**
 * @param {string} customerProfileId
 */
async function loadAndRenderRequiredDocs(customerProfileId) {
  documentsPageCache.customerProfileId = customerProfileId;
  await refetchRequiredDocsForViewerLocale({ showLoading: true, showErrorOnFailure: true });
}

/**
 * @param {string} profileId
 * @returns {Promise<boolean>}
 */
async function customerHasPaidInvoice(profileId) {
  try {
    const rows = await invoiceApi.list("PAID", profileId);
    return Array.isArray(rows) && rows.length > 0;
  } catch {
    return false;
  }
}

function resolveCustomerProfileId() {
  const sessionEmail = getSession()?.email;
  if (sessionEmail && String(sessionEmail).trim()) {
    return `profile::${String(sessionEmail).trim().toLowerCase()}`;
  }
  return DEMO_PROFILE;
}

function renderDocumentsPageFromCache() {
  const gate = qs("#documentsPrePaymentGate");
  const gated = qs("#documentsGatedContent");

  if (!documentsPageCache.paid) {
    if (gate) gate.hidden = false;
    if (gated) gated.hidden = true;
    return;
  }

  if (gate) gate.hidden = true;
  if (gated) gated.hidden = false;

  if (Array.isArray(documentsPageCache.requiredRows)) {
    renderRequiredDocsList(documentsPageCache.requiredRows);
  }

  renderAllSections(documentsPageCache.documents);
  applyUploadStatusLine();
}

async function refreshDocumentsPageForViewerLanguage() {
  applyDocumentsPageLocaleBundle();
  try {
    await reloadI18nForLanguage(getEffectiveLanguage(), DOCUMENTS_I18N_DOMAINS);
  } catch {
    /* keep merged locale bundle fallbacks */
  }
  const preserve = readUploadFormPreserve();

  if (documentsPageCache.paid && documentsPageCache.customerProfileId) {
    await refetchRequiredDocsForViewerLocale({ showLoading: false, showErrorOnFailure: true });
  }

  renderDocumentsPageFromCache();
  applyI18nToDom(document);
  restoreUploadFormPreserve(preserve);
  await flushRuntimeMissingKeysAfterPageApply();
}

wireDynamicPageI18nRefresh(() => {
  void refreshDocumentsPageForViewerLanguage();
}, { keyPrefixes: ["documents.", "common."], languageChangeOnly: true });

async function initDocumentsPage() {
  if (!protectCurrentPage()) return;
  if (!ensureCustomerAccess()) return;

  await bootAppPageContent(DOCUMENTS_I18N_DOMAINS, async () => {
    applyDocumentsPageLocaleBundle();
    await loadSidebar("#sidebar", "customer");

    const customerProfileId = resolveCustomerProfileId();
    documentsPageCache.customerProfileId = customerProfileId;

    const gate = qs("#documentsPrePaymentGate");
    const gated = qs("#documentsGatedContent");
    if (gate) gate.hidden = true;
    if (gated) gated.hidden = true;

    const paid = await customerHasPaidInvoice(customerProfileId);
    documentsPageCache.paid = paid;

    if (!paid) {
      renderDocumentsPageFromCache();
      return;
    }

    await loadAndRenderRequiredDocs(customerProfileId);

    const documents = await documentsApi.list(customerProfileId);
    documentsPageCache.documents = Array.isArray(documents) ? documents : [];
    patchState({ documents: documentsPageCache.documents });
    renderDocumentsPageFromCache();

    qs("#documentUploadForm")?.addEventListener("submit", async (event) => {
      event.preventDefault();
      const name = String(qs("#uploadName")?.value || "").trim();
      const documentType = String(qs("#uploadType")?.value || "documents_submitted");
      if (!name) return;
      const uploaded = await documentsApi.upload({
        customer_profile_id: customerProfileId,
        name,
        document_type: documentType,
        version_label: "v1",
        version_number: 1,
      });
      documentsPageCache.documents = [uploaded, ...documentsPageCache.documents];
      patchState({ documents: documentsPageCache.documents });
      renderAllSections(documentsPageCache.documents);
      const statusLabel = resolveDocumentStatusLabel(uploaded, "upload");
      documentsPageCache.lastUploadFeedback = {
        name: String(uploaded.name || name),
        statusLabel,
      };
      applyUploadStatusLine();
      qs("#documentUploadForm")?.reset();
    });
  });
}

initDocumentsPage();

export { initDocumentsPage };
