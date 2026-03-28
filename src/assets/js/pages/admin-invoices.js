import { invoiceApi } from "../core/api.js";
import { getCurrentRole } from "../core/auth.js";
import { ensureAdminAccess, protectCurrentPage } from "../core/guards.js";
import { loadSidebar } from "../components/sidebar.js";

let selectedInvoiceId = "";

function qs(selector) {
  return document.querySelector(selector);
}

function setStatus(message) {
  const status = qs("#adminInvoiceStatus");
  if (status) status.textContent = message;
}

function renderInvoiceList(invoices) {
  const target = qs("#adminInvoiceList");
  if (!target) return;
  if (!invoices.length) {
    target.innerHTML = "<div class='lhai-state lhai-state--empty'>No invoices yet.</div>";
    return;
  }
  target.innerHTML = invoices
    .map(
      (invoice) => `
      <button class="lhai-list__item" data-invoice-id="${invoice.id}">
        <strong>${invoice.id}</strong><br />
        <span class="u-text-muted">${invoice.service_name || "-"} - ${invoice.status}</span>
      </button>
    `
    )
    .join("");

  target.querySelectorAll("[data-invoice-id]").forEach((button) => {
    button.addEventListener("click", async () => {
      selectedInvoiceId = button.getAttribute("data-invoice-id") || "";
      if (!selectedInvoiceId) return;
      const invoice = await invoiceApi.getDetail(selectedInvoiceId);
      qs("#approvedQuoteId").value = invoice.quote_id || "";
      qs("#invoiceDueDate").value = invoice.due_date || "";
      qs("#invoiceInPersonOnly").value = String(Boolean(invoice.in_person_only));
      qs("#invoiceDraftNotes").value = invoice.draft_notes || "";
      setStatus(`Selected invoice ${invoice.id}`);
    });
  });
}

async function refreshInvoices() {
  const invoices = await invoiceApi.list();
  renderInvoiceList(invoices);
}

async function initAdminInvoicesPage() {
  if (!protectCurrentPage()) return;
  if (!ensureAdminAccess()) return;
  await loadSidebar("#sidebar", "admin");
  const currentRole = getCurrentRole();
  const l3PlusRoles = ["supervisor", "admin", "super_admin"];
  const canUseInPersonDraftStub = l3PlusRoles.includes(currentRole);
  if (!canUseInPersonDraftStub) {
    qs("#saveDraftBtn").disabled = true;
    setStatus("Draft editing stub for in-person-only invoices is limited to L3+ roles.");
  }

  await refreshInvoices();

  qs("#createInvoiceBtn")?.addEventListener("click", async () => {
    const quoteId = qs("#approvedQuoteId").value.trim();
    if (!quoteId) {
      setStatus("Approved quote ID is required.");
      return;
    }
    try {
      const invoice = await invoiceApi.createFromApprovedQuote({
        quote_id: quoteId,
        due_date: qs("#invoiceDueDate").value || null,
        in_person_only: qs("#invoiceInPersonOnly").value === "true",
        draft_notes: qs("#invoiceDraftNotes").value.trim(),
      });
      selectedInvoiceId = invoice.id;
      setStatus(`Invoice created: ${invoice.id}`);
      await refreshInvoices();
    } catch (error) {
      setStatus(`Create failed: ${error.message}`);
    }
  });

  qs("#saveDraftBtn")?.addEventListener("click", async () => {
    if (!canUseInPersonDraftStub) {
      setStatus("L3+ role required for this draft editing stub.");
      return;
    }
    if (!selectedInvoiceId) {
      setStatus("Select an invoice first for draft editing.");
      return;
    }
    try {
      await invoiceApi.updateDraft(selectedInvoiceId, {
        due_date: qs("#invoiceDueDate").value || null,
        draft_notes: qs("#invoiceDraftNotes").value.trim(),
      });
      setStatus("In-person-only draft editing stub saved (L3+ policy to be enforced server-side).");
      await refreshInvoices();
    } catch (error) {
      setStatus(`Draft save failed: ${error.message}`);
    }
  });
}

initAdminInvoicesPage();

export { initAdminInvoicesPage };
