import { invoiceApi, paymentApi } from "../core/api.js";
import { ensureCustomerAccess, protectCurrentPage } from "../core/guards.js";
import { patchState } from "../core/state.js";
import { loadSidebar } from "../components/sidebar.js";
import { formatMoney } from "../core/utils.js";

function qs(selector) {
  return document.querySelector(selector);
}

function setMessage(message) {
  const el = qs("#invoiceStatusMessage");
  if (el) el.textContent = message;
}

function statusClass(status) {
  if (status === "PAID") return "lhai-badge lhai-badge--risk-low";
  if (status === "FAILED") return "lhai-badge lhai-badge--risk-high";
  if (status === "CANCELED") return "lhai-badge lhai-badge--risk-medium";
  if (status === "SENT") return "lhai-badge lhai-badge--risk-medium";
  return "lhai-badge";
}

function renderInvoice(invoice) {
  qs("#invoiceId").textContent = invoice.id || "-";
  qs("#invoiceQuoteId").textContent = invoice.quote_id || "-";
  qs("#invoiceServiceName").textContent = invoice.service_name || "-";
  qs("#invoiceAmountDue").textContent = formatMoney(Number(invoice.amount_due || 0), invoice.currency || "USD");
  const statusEl = qs("#invoiceStatus");
  statusEl.textContent = invoice.status || "-";
  statusEl.className = statusClass(invoice.status);
}

function renderPaymentResult(result) {
  const section = qs("#paymentResultSection");
  const message = qs("#paymentResultMessage");
  const summary = qs("#paymentStubSummary");
  if (!section || !message || !summary) return;
  section.style.display = "block";
  message.textContent = result.message || "Payment processed.";
  summary.innerHTML = `
    <ul class="lhai-list">
      <li class="lhai-list__item">Checklist stub: ${result.checklist_stub?.created ? "created" : "n/a"}</li>
      <li class="lhai-list__item">Document request stub: ${result.document_request_stub?.created ? "created" : "n/a"}</li>
      <li class="lhai-list__item">In-app message stub: ${result.in_app_message_stub?.created ? "created" : "n/a"}</li>
      <li class="lhai-list__item">Email logs queued: ${(result.email_logs_stub || []).length}</li>
    </ul>
  `;
}

async function handlePaymentResult(paymentId, mode) {
  let result;
  if (mode === "success") result = await paymentApi.markSuccess(paymentId);
  if (mode === "failure") result = await paymentApi.markFailure(paymentId);
  if (mode === "cancel") result = await paymentApi.markCancel(paymentId);
  if (!result) return;

  renderPaymentResult(result);

  patchState({
    dashboardSummary: {
      paymentStatus: result.payment_status,
      lastInvoiceId: result.invoice_id,
    },
    postPayment: {
      checklistStub: result.checklist_stub,
      documentRequestStub: result.document_request_stub,
      inAppMessageStub: result.in_app_message_stub,
      emailLogsStub: result.email_logs_stub || [],
    },
  });
  window.localStorage.setItem(
    "lhai_dashboard_summary",
    JSON.stringify({
      paymentStatus: result.payment_status,
      lastInvoiceId: result.invoice_id,
    })
  );
}

async function initInvoiceDetailPage() {
  if (!protectCurrentPage()) return;
  if (!ensureCustomerAccess()) return;
  await loadSidebar("#sidebar", "customer");
  const invoiceId = new URLSearchParams(window.location.search).get("invoice_id") || "inv-demo-1";
  const invoice = await invoiceApi.getDetail(invoiceId);
  patchState({ invoice });
  renderInvoice(invoice);

  qs("#payNowBtn")?.addEventListener("click", async () => {
    setMessage("Starting web payment...");
    const start = await paymentApi.startWebPayment({
      invoice_id: invoice.id,
      success_url: `${window.location.origin}/src/pages/invoice-detail.html?invoice_id=${encodeURIComponent(invoice.id)}&payment_id={PAYMENT_ID}&result=success`,
      failure_url: `${window.location.origin}/src/pages/invoice-detail.html?invoice_id=${encodeURIComponent(invoice.id)}&payment_id={PAYMENT_ID}&result=failure`,
      cancel_url: `${window.location.origin}/src/pages/invoice-detail.html?invoice_id=${encodeURIComponent(invoice.id)}&payment_id={PAYMENT_ID}&result=cancel`,
    });

    // Web-only flow: in mock mode we directly mark success for local verification.
    setMessage("Web checkout started. Completing in mock mode...");
    await handlePaymentResult(start.payment_id, "success");
    const refreshed = await invoiceApi.getDetail(invoice.id);
    renderInvoice(refreshed);
    setMessage("Payment completed.");
  });

  qs("#simulateFailureBtn")?.addEventListener("click", async () => {
    await handlePaymentResult(`pay-failure-${Date.now()}`, "failure");
    setMessage("Simulated failure applied.");
  });

  qs("#simulateCancelBtn")?.addEventListener("click", async () => {
    await handlePaymentResult(`pay-cancel-${Date.now()}`, "cancel");
    setMessage("Simulated cancel applied.");
  });
}

initInvoiceDetailPage();

export { initInvoiceDetailPage };
