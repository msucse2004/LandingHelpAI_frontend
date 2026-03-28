import { quoteApi } from "../core/api.js";
import { ensureCustomerAccess, protectCurrentPage } from "../core/guards.js";
import { patchState } from "../core/state.js";
import { loadSidebar } from "../components/sidebar.js";
import { formatMoney } from "../core/utils.js";

function qs(selector) {
  return document.querySelector(selector);
}

function setStatus(message) {
  const status = qs("#quoteActionStatus");
  if (status) status.textContent = message;
}

function renderList(targetSelector, values) {
  const target = qs(targetSelector);
  if (!target) return;
  if (!values || !values.length) {
    target.innerHTML = "<li>-</li>";
    return;
  }
  target.innerHTML = values.map((value) => `<li>${value}</li>`).join("");
}

function statusBadgeClass(status) {
  if (status === "APPROVED") return "lhai-badge lhai-badge--risk-low";
  if (status === "REJECTED" || status === "EXPIRED") return "lhai-badge lhai-badge--risk-high";
  if (status === "PROPOSED") return "lhai-badge lhai-badge--risk-medium";
  return "lhai-badge";
}

function renderQuote(quote) {
  qs("#quoteId").textContent = quote.id || "-";
  const statusEl = qs("#quoteStatus");
  statusEl.textContent = quote.status || "-";
  statusEl.className = statusBadgeClass(quote.status);
  qs("#quoteServiceName").textContent = quote.service_name || quote.request_details?.service_id || "-";
  qs("#quoteEstimatedCost").textContent = formatMoney(Number(quote.estimated_cost || 0), quote.currency || "USD");
  qs("#quoteAiSupportScope").textContent = quote.ai_support_scope || "-";
  qs("#quoteNextStepGuidance").textContent = quote.next_step_guidance || "-";
  renderList("#quoteIncludedItems", quote.included_items);
  renderList("#quoteExcludedItems", quote.excluded_items);
  renderList("#quotePossibleExtraCosts", quote.possible_extra_costs);

  const allowDecision = quote.status === "PROPOSED";
  qs("#approveQuoteBtn").disabled = !allowDecision;
  qs("#rejectQuoteBtn").disabled = !allowDecision;
  qs("#requestHelpBtn").disabled = !allowDecision;
}

async function initQuoteDetailPage() {
  if (!protectCurrentPage()) return;
  if (!ensureCustomerAccess()) return;
  await loadSidebar("#sidebar", "customer");
  const quoteId = new URLSearchParams(window.location.search).get("quote_id") || "q-demo-1";
  try {
    const quote = await quoteApi.getDetail(quoteId);
    patchState({ quote });
    renderQuote(quote);
    qs("#quoteLoadingState").style.display = "none";
    qs("#quoteContent").style.display = "block";
    setStatus(quote.status === "PROPOSED" ? "You can approve or reject this quote." : "Waiting for quote proposal.");

    qs("#approveQuoteBtn")?.addEventListener("click", async () => {
      const transition = await quoteApi.transition(quote.id, "APPROVED", "Approved by customer");
      setStatus(transition.message || "Quote approved.");
      const refreshed = await quoteApi.getDetail(quote.id);
      renderQuote(refreshed);
    });

    qs("#rejectQuoteBtn")?.addEventListener("click", async () => {
      const transition = await quoteApi.transition(quote.id, "REJECTED", "Rejected by customer");
      setStatus(transition.message || "Quote rejected.");
      const refreshed = await quoteApi.getDetail(quote.id);
      renderQuote(refreshed);
    });

    qs("#requestHelpBtn")?.addEventListener("click", () => {
      // Stub: dedicated help flow to be connected to messages endpoint.
      setStatus("Help request noted. An operator will contact you soon. (stub)");
    });
  } catch {
    qs("#quoteLoadingState").style.display = "none";
    qs("#quoteEmptyState").style.display = "block";
    setStatus("Quote unavailable.");
  }
}

initQuoteDetailPage();

export { initQuoteDetailPage };
