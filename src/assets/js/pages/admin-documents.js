import { documentsApi } from "../core/api.js";
import { ensureAdminAccess, protectCurrentPage } from "../core/guards.js";
import { loadSidebar } from "../components/sidebar.js";
import { applyI18nToDom } from "../core/i18n-dom.js";

const customerProfileId = "profile::demo@customer.com";
let selectedDocumentId = "";

function qs(selector) {
  return document.querySelector(selector);
}

function setStatus(message) {
  const el = qs("#adminDocumentStatusMessage");
  if (el) el.textContent = message;
}

function renderList(documents) {
  const target = qs("#adminDocumentList");
  if (!target) return;
  if (!documents.length) {
    target.innerHTML = "<div class='lhai-state lhai-state--empty'>No documents in review queue.</div>";
    return;
  }
  target.innerHTML = documents
    .map(
      (document) => `
      <button class="lhai-list__item" data-document-id="${document.id}">
        <strong>${document.name}</strong><br />
        <span class="u-text-muted">${document.document_type} - ${document.status} - ${document.version_label || "v1"}</span>
      </button>
    `
    )
    .join("");

  target.querySelectorAll("[data-document-id]").forEach((button) => {
    button.addEventListener("click", () => {
      selectedDocumentId = button.getAttribute("data-document-id") || "";
      setStatus(`Selected document ${selectedDocumentId}`);
    });
  });
}

async function refresh() {
  const documents = await documentsApi.list(customerProfileId);
  renderList(documents);
}

async function initAdminDocumentsPage() {
  if (!protectCurrentPage()) return;
  if (!ensureAdminAccess()) return;
  await loadSidebar("#sidebar", "admin");
  applyI18nToDom(document);
  await refresh();

  qs("#adminDocumentReviewForm")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!selectedDocumentId) {
      setStatus("Select a document first.");
      return;
    }
    await documentsApi.updateStatus(selectedDocumentId, {
      status: qs("#adminDocStatus").value,
      review_status: String(qs("#adminReviewStatus").value || "pending_review"),
    });
    setStatus("Document status update stub applied.");
    await refresh();
  });

  qs("#adminDocumentRequestForm")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const name = String(qs("#adminRequestName").value || "").trim();
    if (!name) {
      setStatus("Document request name is required.");
      return;
    }
    await documentsApi.createRequest({
      customer_profile_id: customerProfileId,
      document_type: String(qs("#adminRequestType").value || "documents_submitted"),
      name,
    });
    setStatus("Document request creation stub applied.");
    qs("#adminDocumentRequestForm")?.reset();
    await refresh();
  });
}

initAdminDocumentsPage();

export { initAdminDocumentsPage };
