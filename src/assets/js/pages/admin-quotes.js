import { adminApi } from "../core/api.js";
import { ensureAdminAccess, protectCurrentPage } from "../core/guards.js";
import { getState, patchState } from "../core/state.js";
import { quoteApi } from "../core/api.js";
import { loadSidebar } from "../components/sidebar.js";

let selectedQuoteId = "";

function qs(selector) {
  return document.querySelector(selector);
}

function setStatus(message) {
  const status = qs("#adminQuoteStatus");
  if (status) status.textContent = message;
}

function toLines(text) {
  return String(text || "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

function renderQuoteList(quotes) {
  const target = qs("#adminQuoteList");
  if (!target) return;
  if (!quotes.length) {
    target.innerHTML = "<div class='lhai-state lhai-state--empty'>No quotes available.</div>";
    return;
  }

  target.innerHTML = quotes
    .map(
      (quote) => `
      <button class="lhai-list__item" data-quote-id="${quote.id}">
        <strong>${quote.id}</strong><br />
        <span class="u-text-muted">${quote.service_name || "Untitled"} - ${quote.status}</span>
      </button>
    `
    )
    .join("");

  target.querySelectorAll("[data-quote-id]").forEach((button) => {
    button.addEventListener("click", async () => {
      const quoteId = button.getAttribute("data-quote-id");
      if (!quoteId) return;
      await selectQuote(quoteId);
    });
  });
}

function fillForm(quote) {
  qs("#serviceName").value = quote.service_name || "";
  qs("#includedItems").value = (quote.included_items || []).join("\n");
  qs("#excludedItems").value = (quote.excluded_items || []).join("\n");
  qs("#estimatedCost").value = quote.estimated_cost || 0;
  qs("#aiSupportScope").value = quote.ai_support_scope || "";
  qs("#possibleExtraCosts").value = (quote.possible_extra_costs || []).join("\n");
  qs("#nextStepGuidance").value = quote.next_step_guidance || "";
}

async function selectQuote(quoteId) {
  selectedQuoteId = quoteId;
  const quote = await quoteApi.getDetail(quoteId);
  fillForm(quote);
  setStatus(`Editing ${quote.id} (${quote.status})`);
}

async function initAdminQuotesPage() {
  if (!protectCurrentPage()) return;
  if (!ensureAdminAccess()) return;
  await loadSidebar("#sidebar", "admin");
  const quotes = await adminApi.listQuotes();
  const current = getState();
  patchState({ admin: { ...current.admin, quotes } });
  renderQuoteList(quotes);

  if (quotes[0]) {
    await selectQuote(quotes[0].id);
  }

  qs("#adminQuoteForm")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!selectedQuoteId) {
      setStatus("Select a quote first.");
      return;
    }
    const payload = {
      service_name: qs("#serviceName").value.trim(),
      included_items: toLines(qs("#includedItems").value),
      excluded_items: toLines(qs("#excludedItems").value),
      estimated_cost: Number(qs("#estimatedCost").value || 0),
      ai_support_scope: qs("#aiSupportScope").value.trim(),
      possible_extra_costs: toLines(qs("#possibleExtraCosts").value),
      next_step_guidance: qs("#nextStepGuidance").value.trim(),
    };

    await quoteApi.update(selectedQuoteId, payload);
    setStatus(`Saved quote draft ${selectedQuoteId}.`);
  });

  qs("#proposeQuoteBtn")?.addEventListener("click", async () => {
    if (!selectedQuoteId) {
      setStatus("Select a quote first.");
      return;
    }
    const transition = await quoteApi.transition(selectedQuoteId, "PROPOSED", "Proposed by admin panel");
    setStatus(transition.message || `Quote ${selectedQuoteId} proposed.`);
    const refreshed = await adminApi.listQuotes();
    const latestState = getState();
    patchState({ admin: { ...latestState.admin, quotes: refreshed } });
    renderQuoteList(refreshed);
    await selectQuote(selectedQuoteId);
  });
}

initAdminQuotesPage();

export { initAdminQuotesPage };
