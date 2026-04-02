import { adminApi } from "../core/api.js";
import { ensureAdminAccess, protectCurrentPage } from "../core/guards.js";
import { safeText } from "../core/utils.js";
import { loadSidebar } from "../components/sidebar.js";

function renderMetrics(summary) {
  const target = document.querySelector("#riskBoardMetrics");
  if (!target) return;
  target.innerHTML = `
    <article class="lhai-card"><h2 class="lhai-card__title">Total Customers</h2><p>${summary.total_customers}</p></article>
    <article class="lhai-card"><h2 class="lhai-card__title">Blocked</h2><p>${summary.blocked_customers}</p></article>
    <article class="lhai-card"><h2 class="lhai-card__title">High Risk</h2><p>${summary.high_risk_customers}</p></article>
  `;
}

function renderRiskList(customers = []) {
  const target = document.querySelector("#riskBoardList");
  if (!target) return;
  if (!customers.length) {
    target.innerHTML = `<div class="lhai-state lhai-state--empty">No risk signals detected.</div>`;
    return;
  }
  target.innerHTML = customers
    .map((customer) => {
      const triggeredSignals = (customer.signals || []).filter((signal) => signal.triggered);
      return `
        <article class="lhai-risk-item">
          <div class="lhai-risk-item__header">
            <strong>${safeText(customer.customer_profile_id)}</strong>
            <span class="lhai-badge">${safeText(customer.risk_level || "unknown")}</span>
          </div>
          <ul class="lhai-list">
            ${
              triggeredSignals.length
                ? triggeredSignals.map((signal) => `<li class="lhai-list__item">${safeText(signal.code)} - ${safeText(signal.detail)}</li>`).join("")
                : "<li class='lhai-list__item'>No triggered exception signal.</li>"
            }
          </ul>
        </article>
      `;
    })
    .join("");
}

async function initAdminRiskBoardPage() {
  if (!protectCurrentPage()) return;
  if (!ensureAdminAccess()) return;
  await loadSidebar("#sidebar", "admin");
  const summary = await adminApi.getRiskSummary();
  renderMetrics(summary);
  renderRiskList(summary.customers || []);
}

export { initAdminRiskBoardPage };

initAdminRiskBoardPage();
