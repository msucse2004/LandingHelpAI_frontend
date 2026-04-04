import { documentsApi, invoiceApi, requiredDocumentsCustomerApi } from "../core/api.js";
import { getSession } from "../core/auth.js";
import { ensureCustomerAccess, protectCurrentPage } from "../core/guards.js";
import { patchState } from "../core/state.js";
import { loadSidebar } from "../components/sidebar.js";
import { applyI18nToDom } from "../core/i18n-dom.js";
import { mergeFallbackStrings, t } from "../core/i18n-client.js";
import { formatDate } from "../core/utils.js";
import { getDocumentsPageLocaleBundle } from "./documents-page-locale.js";

const DEMO_PROFILE = "profile::demo@customer.com";

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

function renderSection(documentType, documents) {
  const selector = sectionTarget(documentType);
  if (!selector) return;
  const target = qs(selector);
  if (!target) return;
  if (!documents.length) {
    target.innerHTML = "<div class='lhai-state lhai-state--empty'>No documents in this section.</div>";
    return;
  }
  target.innerHTML = documents
    .map(
      (doc) => `
      <article class="lhai-doc-item">
        <strong>${escHtml(doc.name)}</strong>
        <div class="lhai-doc-meta">
          <span class="lhai-badge">${escHtml(doc.status)}</span>
          <span class="lhai-badge">${escHtml(doc.review_status || "-")}</span>
          <span class="lhai-badge">${escHtml(doc.version_label || "v1")}</span>
        </div>
        <div class="u-flex u-gap-2">
          <button class="lhai-button lhai-button--secondary" type="button">View (Stub)</button>
          <button class="lhai-button lhai-button--secondary" type="button">Download (Stub)</button>
        </div>
      </article>
    `
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
    renderSection(
      type,
      documents.filter((d) => d.document_type === type)
    );
  });
}

function statusLabelForRequiredDoc(status) {
  const u = String(status || "").toUpperCase();
  const key = `customer.documents.required.status.${u}`;
  const tr = t(key, "");
  if (tr && tr !== key) return tr;
  return u || "—";
}

/**
 * @param {Array<Record<string, unknown>>} rows
 */
function renderRequiredDocsCards(rows) {
  return rows
    .map((r) => {
      const required = Boolean(r.required);
      const reqBadge = required
        ? `<span class="lhai-badge lhai-badge--status-active">${escHtml(t("customer.documents.required.badge_required", ""))}</span>`
        : `<span class="lhai-badge">${escHtml(t("customer.documents.required.badge_optional", ""))}</span>`;
      const shortD = r.short_description
        ? `<p class="lhai-required-doc-card__prose u-mt-1">${escHtml(r.short_description)}</p>`
        : "";
      const why = r.reason_text
        ? `<p class="lhai-required-doc-card__label">${escHtml(t("customer.documents.required.label_why", ""))}</p><p class="lhai-required-doc-card__prose">${escHtml(r.reason_text)}</p>`
        : "";
      const timing = r.timing
        ? `<p class="lhai-required-doc-card__label">${escHtml(t("customer.documents.required.label_timing", ""))}</p><p class="lhai-required-doc-card__prose">${escHtml(r.timing)}</p>`
        : "";
      const ex = r.example_note
        ? `<p class="lhai-required-doc-card__label">${escHtml(t("customer.documents.required.label_example", ""))}</p><p class="lhai-required-doc-card__prose">${escHtml(r.example_note)}</p>`
        : "";
      const due = r.due_at
        ? `<span class="lhai-badge">${escHtml(t("customer.documents.required.label_due", ""))}: ${escHtml(formatDate(r.due_at))}</span>`
        : "";
      const statusBadge = `<span class="lhai-badge" title="${escHtml(t("customer.documents.required.label_status", ""))}">${escHtml(statusLabelForRequiredDoc(r.status))}</span>`;
      return `<article class="lhai-required-doc-card">
        <div class="lhai-required-doc-card__title-row">
          <strong>${escHtml(r.name)}</strong>
          ${reqBadge}
        </div>
        <div class="lhai-required-doc-card__meta">${statusBadge}${due}</div>
        ${shortD}${why}${timing}${ex}
      </article>`;
    })
    .join("");
}

/**
 * @param {string} customerProfileId
 */
async function loadAndRenderRequiredDocs(customerProfileId) {
  const section = qs("#customerRequiredDocsSection");
  const list = qs("#customerRequiredDocsList");
  const st = qs("#customerRequiredDocsStatus");
  if (!section || !list) return;

  section.hidden = false;
  if (st) st.textContent = t("customer.documents.required.loading", "");

  try {
    const rows = await requiredDocumentsCustomerApi.list(customerProfileId);
    if (st) st.textContent = "";
    if (!Array.isArray(rows) || !rows.length) {
      list.innerHTML = `<div class="lhai-state lhai-state--empty">${escHtml(t("customer.documents.required.empty", ""))}</div>`;
      return;
    }
    list.innerHTML = renderRequiredDocsCards(rows);
  } catch {
    if (st) st.textContent = t("customer.documents.required.load_error", "");
    list.innerHTML = "";
  }
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

async function initDocumentsPage() {
  if (!protectCurrentPage()) return;
  if (!ensureCustomerAccess()) return;

  const customerProfileId = resolveCustomerProfileId();

  mergeFallbackStrings(getDocumentsPageLocaleBundle("ko"));
  await loadSidebar("#sidebar", "customer");
  applyI18nToDom(document);

  const gate = qs("#documentsPrePaymentGate");
  const gated = qs("#documentsGatedContent");
  if (gate) gate.hidden = true;
  if (gated) gated.hidden = true;

  const paid = await customerHasPaidInvoice(customerProfileId);

  if (!paid) {
    if (gate) gate.hidden = false;
    if (gated) gated.hidden = true;
    const gt = qs("#documentsGateTitle");
    const gb = qs("#documentsGateBody");
    if (gt) gt.textContent = t("customer.documents.gate.title", "");
    if (gb) gb.textContent = t("customer.documents.gate.body", "");
    return;
  }

  if (gate) gate.hidden = true;
  if (gated) gated.hidden = false;

  await loadAndRenderRequiredDocs(customerProfileId);

  let documents = await documentsApi.list(customerProfileId);
  patchState({ documents });
  renderAllSections(documents);

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
    documents = [uploaded, ...documents];
    patchState({ documents });
    renderAllSections(documents);
    const statusEl = qs("#documentUploadStatus");
    if (statusEl) statusEl.textContent = `Uploaded ${uploaded.name} (${uploaded.status}).`;
    qs("#documentUploadForm")?.reset();
  });
}

initDocumentsPage();

export { initDocumentsPage };
