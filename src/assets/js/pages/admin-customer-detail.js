import { adminApi, emailLogsApi, messagesApi } from "../core/api.js";
import { ensureAdminAccess, protectCurrentPage } from "../core/guards.js";
import { formatDate, safeText } from "../core/utils.js";

function renderSimpleMap(targetSelector, data = {}) {
  const target = document.querySelector(targetSelector);
  if (!target) return;
  const entries = Object.entries(data);
  if (!entries.length) {
    target.innerHTML = `<div class="lhai-state lhai-state--empty">No data.</div>`;
    return;
  }
  target.innerHTML = `
    <ul class="lhai-list">
      ${entries
        .map(([key, value]) => `<li class="lhai-list__item"><strong>${safeText(key)}</strong>: ${safeText(String(value))}</li>`)
        .join("")}
    </ul>
  `;
}

function renderSimpleList(targetSelector, items = []) {
  const target = document.querySelector(targetSelector);
  if (!target) return;
  if (!items.length) {
    target.innerHTML = `<div class="lhai-state lhai-state--empty">No records.</div>`;
    return;
  }
  target.innerHTML = `
    <ul class="lhai-list">
      ${items
        .map((item) => `<li class="lhai-list__item">${safeText(JSON.stringify(item))}</li>`)
        .join("")}
    </ul>
  `;
}

function renderMessages(messages = []) {
  const target = document.querySelector("#adminCustomerMessages");
  if (!target) return;
  if (!messages.length) {
    target.innerHTML = `<div class="lhai-state lhai-state--empty">No in-app messages.</div>`;
    return;
  }
  target.innerHTML = `
    <ul class="lhai-list">
      ${messages
        .map(
          (message) => `
            <li class="lhai-list__item">
              <strong>${safeText(message.title)}</strong>
              <div><span class="lhai-badge">${safeText(message.message_type)}</span> ${message.unread ? "<span class='lhai-badge lhai-badge--warning'>UNREAD</span>" : ""}</div>
              <p class="u-text-muted">${safeText(message.body)}</p>
              <small class="u-text-muted">${formatDate(message.created_at)} / event: ${safeText(message.event_code || "-")}</small>
            </li>
          `
        )
        .join("")}
    </ul>
  `;
}

function renderEmailLogs(logs = []) {
  const target = document.querySelector("#adminCustomerEmailLogs");
  if (!target) return;
  if (!logs.length) {
    target.innerHTML = `<div class="lhai-state lhai-state--empty">No email logs.</div>`;
    return;
  }
  target.innerHTML = `
    <ul class="lhai-list">
      ${logs
        .map(
          (log) => `
            <li class="lhai-list__item">
              <strong>${safeText(log.subject)}</strong>
              <p class="u-text-muted">${safeText(log.to_email)} / template: ${safeText(log.template_code)}</p>
              <small class="u-text-muted">status: ${safeText(log.status)} / event: ${safeText(log.event_code || "-")} / ${formatDate(log.created_at)}</small>
            </li>
          `
        )
        .join("")}
    </ul>
  `;
}

async function initAdminCustomerDetailPage() {
  if (!protectCurrentPage()) return;
  if (!ensureAdminAccess()) return;
  const customerProfileId = "profile::demo@customer.com";
  const [messages, emailLogs, summary] = await Promise.all([
    messagesApi.list({ customerProfileId }),
    emailLogsApi.list(customerProfileId),
    adminApi.getCustomerOperationsSummary(customerProfileId),
  ]);
  renderMessages(messages);
  renderEmailLogs(emailLogs);
  renderSimpleMap("#adminOpsOverview", summary.overview || {});
  renderSimpleMap("#adminOpsQuoteStatus", summary.quote_status || {});
  renderSimpleMap("#adminOpsInvoicePayment", summary.invoice_payment_status || {});
  renderSimpleMap("#adminOpsDocumentStatus", summary.document_status || {});
  renderSimpleMap("#adminOpsScheduleStatus", summary.schedule_status || {});
  renderSimpleList("#adminOpsRecentMessages", summary.recent_messages || []);
  renderSimpleList("#adminOpsAiEscalation", summary.ai_escalation_history || []);
  renderSimpleList("#adminOpsAuditHistory", summary.audit_history || []);
}

initAdminCustomerDetailPage();
