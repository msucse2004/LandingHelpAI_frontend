import { documentsApi } from "../core/api.js";
import { ensureCustomerAccess, protectCurrentPage } from "../core/guards.js";
import { patchState } from "../core/state.js";
import { loadSidebar } from "../components/sidebar.js";
import { applyI18nToDom } from "../core/i18n-dom.js";

const customerProfileId = "profile::demo@customer.com";

function qs(selector) {
  return document.querySelector(selector);
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
      (document) => `
      <article class="lhai-doc-item">
        <strong>${document.name}</strong>
        <div class="lhai-doc-meta">
          <span class="lhai-badge">${document.status}</span>
          <span class="lhai-badge">${document.review_status || "-"}</span>
          <span class="lhai-badge">${document.version_label || "v1"}</span>
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
      documents.filter((document) => document.document_type === type)
    );
  });
}

async function initDocumentsPage() {
  if (!protectCurrentPage()) return;
  if (!ensureCustomerAccess()) return;
  await loadSidebar("#sidebar", "customer");
  applyI18nToDom(document);
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
