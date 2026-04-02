import { dashboardApi, timelineApi } from "../core/api.js";
import { getSession } from "../core/auth.js";
import { ensureCustomerAccess, protectCurrentPage } from "../core/guards.js";
import { getState, patchState } from "../core/state.js";
import { loadSidebar } from "../components/sidebar.js";
import { renderTimeline } from "../components/timeline.js";
import { t } from "../core/i18n-client.js";
import { initCommonI18nAndApplyDom } from "../core/i18n-dom.js";

function qs(selector) {
  return document.querySelector(selector);
}

function renderStatusCards(cards = []) {
  const target = qs("#dashboardStatusCards");
  if (!target) return;
  if (!cards.length) {
    target.innerHTML = `<article class='lhai-card'><h2 class='lhai-card__title'>${t("common.dashboard.empty.status_data", "No status data")}</h2></article>`;
    return;
  }

  target.innerHTML = cards
    .map(
      (card) => `
      <article class="lhai-card">
        <h2 class="lhai-card__title">${card.label}</h2>
        <p class="lhai-metric-value">${card.value}</p>
      </article>
    `
    )
    .join("");
}

function renderChecklistSummary(summary) {
  const target = qs("#dashboardChecklistSummary");
  if (!target) return;
  target.innerHTML = `
    <ul class="lhai-list-compact">
      <li>${t("common.dashboard.checklist.total_items", "Total items")}: <strong>${summary.total}</strong></li>
      <li>${t("common.dashboard.checklist.completed", "Completed")}: <strong>${summary.completed}</strong></li>
      <li>${t("common.dashboard.checklist.required_remaining", "Required remaining")}: <strong>${summary.required_remaining}</strong></li>
      <li>${t("common.dashboard.checklist.next_required", "Next required")}: <strong>${summary.next_required_item || "-"}</strong></li>
    </ul>
  `;
}

function renderRecentMessages(messages = []) {
  const target = qs("#dashboardRecentMessages");
  if (!target) return;
  if (!messages.length) {
    target.innerHTML = `<div class='lhai-state lhai-state--empty'>${t("common.dashboard.empty.recent_messages", "No recent messages.")}</div>`;
    return;
  }
  target.innerHTML = `
    <ul class="lhai-list-compact">
      ${messages
        .map(
          (message) => `
        <li>
          <strong>${message.title}</strong><br />
          <span class="u-text-muted">${message.preview}</span>
        </li>`
        )
        .join("")}
    </ul>
  `;
}

function renderDocumentStatus(documents = []) {
  const target = qs("#dashboardDocumentStatus");
  if (!target) return;
  if (!documents.length) {
    target.innerHTML = `<div class='lhai-state lhai-state--empty'>${t("common.dashboard.empty.document_status", "No document status available.")}</div>`;
    return;
  }
  target.innerHTML = `
    <ul class="lhai-list-compact">
      ${documents
        .map(
          (document) => `
        <li>
          <strong>${document.name}</strong><br />
          <span class="u-text-muted">${document.status} - ${document.updated_at}</span>
        </li>`
        )
        .join("")}
    </ul>
  `;
}

function renderRecentActivity(activity = []) {
  const target = qs("#dashboardRecentActivity");
  if (!target) return;
  if (!activity.length) {
    target.innerHTML = `<div class='lhai-state lhai-state--empty'>${t("common.dashboard.empty.recent_activity", "No recent activity.")}</div>`;
    return;
  }
  target.innerHTML = `<ul class="lhai-list-compact">${activity.map((line) => `<li>${line}</li>`).join("")}</ul>`;
}

function applyDashboardBadgeLabels(aggregate) {
  const servicePrefix = t("common.dashboard.badge.service", "Service");
  const paymentPrefix = t("common.dashboard.badge.payment", "Payment");
  const schedulePrefix = t("common.dashboard.badge.schedule", "Schedule");
  qs("#dashboardServiceStatusBadge").textContent = `${servicePrefix}: ${aggregate.current_service_status}`;
  qs("#dashboardPaymentStatusBadge").textContent = `${paymentPrefix}: ${aggregate.payment_status}`;
  qs("#dashboardScheduleStatusBadge").textContent = `${schedulePrefix}: ${aggregate.schedule_status}`;
}

async function initDashboardPage() {
  if (!protectCurrentPage()) return;
  if (!ensureCustomerAccess()) return;
  await initCommonI18nAndApplyDom(document);

  await loadSidebar("#sidebar", "customer");

  const sessionEmail = getSession()?.email;
  const customerProfileId =
    sessionEmail && String(sessionEmail).trim()
      ? `profile::${String(sessionEmail).trim().toLowerCase()}`
      : "profile::demo@customer.com";
  const [dashboardAggregate, timelineItems, checklistSummary] = await Promise.all([
    dashboardApi.getAggregate(customerProfileId),
    timelineApi.listByCustomer(customerProfileId),
    dashboardApi.getChecklistSummary(customerProfileId),
  ]);

  patchState({
    customer: { id: customerProfileId },
    timeline: timelineItems,
    checklist: [],
  });

  qs("#dashboardNextAction").textContent = dashboardAggregate.next_action;
  applyDashboardBadgeLabels(dashboardAggregate);
  const aiButton = qs("#aiQuickLinkBtn");
  if (aiButton) {
    aiButton.setAttribute("href", dashboardAggregate.ai_assistant_quick_link || "ai-assistant.html");
  }

  renderStatusCards(dashboardAggregate.status_cards);
  renderTimeline(timelineItems, "#dashboardTimelineContainer");
  renderChecklistSummary(checklistSummary);
  renderRecentMessages(dashboardAggregate.recent_messages);
  renderDocumentStatus(dashboardAggregate.document_status);
  renderRecentActivity(dashboardAggregate.recent_activity);

  const state = getState();
  let dashboardSummary = state.dashboardSummary;
  if (!dashboardSummary.paymentStatus) {
    try {
      const stored = JSON.parse(window.localStorage.getItem("lhai_dashboard_summary") || "{}");
      dashboardSummary = { ...dashboardSummary, ...stored };
      if (stored.paymentStatus) {
        qs("#dashboardPaymentStatusBadge").textContent = `${t("common.dashboard.badge.payment", "Payment")}: ${stored.paymentStatus}`;
      }
    } catch {
      // ignore malformed storage
    }
  }
}

initDashboardPage();

export { initDashboardPage };
