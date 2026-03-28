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

function renderMessageThreadsForAdmin(threads = [], customerProfileId) {
  const target = document.querySelector("#adminCustomerMessages");
  if (!target) return;
  if (!threads.length) {
    target.innerHTML = `<div class="lhai-state lhai-state--empty">인앱 메시지 스레드가 없습니다.</div>
      <p class="u-mt-2"><a class="lhai-button lhai-button--secondary" href="messages.html?customer_profile_id=${encodeURIComponent(customerProfileId)}">메시지함 열기</a></p>`;
    return;
  }
  const base = `messages.html?customer_profile_id=${encodeURIComponent(customerProfileId)}`;
  target.innerHTML = `
    <ul class="lhai-list">
      ${threads
        .map(
          (row) => `
            <li class="lhai-list__item">
              <a href="${base}&thread_id=${encodeURIComponent(String(row.thread_id))}"><strong>${safeText(row.title)}</strong></a>
              <div class="u-mt-1"><span class="lhai-badge">${safeText(row.message_type)}</span> ${row.unread ? "<span class='lhai-badge lhai-badge--warning'>미읽음</span>" : ""}</div>
              <p class="u-text-muted">${safeText(row.preview)}</p>
              <small class="u-text-muted">${formatDate(row.last_message_at)}</small>
            </li>
          `
        )
        .join("")}
    </ul>
    <p class="u-mt-2"><a class="lhai-button lhai-button--secondary" href="${base}">전체 메시지함</a></p>
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
  const [threads, emailLogs, summary] = await Promise.all([
    messagesApi.listThreads({ customerProfileId }),
    emailLogsApi.list(customerProfileId),
    adminApi.getCustomerOperationsSummary(customerProfileId),
  ]);
  renderMessageThreadsForAdmin(threads, customerProfileId);
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
