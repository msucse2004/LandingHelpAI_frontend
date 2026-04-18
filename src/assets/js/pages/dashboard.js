import { customerCasesApi, dashboardApi, timelineApi } from "../core/api.js";
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

function escHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function dashboardCaseBadgeClass(status) {
  const m = {
    open: "lhai-case-badge--open",
    pending_ops: "lhai-case-badge--pending_ops",
    pending_customer: "lhai-case-badge--pending_customer",
    resolved: "lhai-case-badge--resolved",
  };
  return m[status] || "lhai-case-badge--open";
}

function customerCaseStatusBadgeClass(item) {
  const kind = String(item?.case_kind || "");
  if (kind === "messaging") {
    return item.unread ? "lhai-case-badge--pending_customer" : "lhai-case-badge--open";
  }
  const tab = String(item?.queue_tab || "").toLowerCase();
  if (tab === "resolved") return "lhai-case-badge--resolved";
  if (tab === "waiting_customer") return "lhai-case-badge--pending_customer";
  if (tab === "action_required") return "lhai-case-badge--pending_ops";
  return "lhai-case-badge--open";
}

function customerCaseStatusLabel(item) {
  const kind = String(item?.case_kind || "");
  if (kind === "messaging") {
    return item.unread ? "새 메시지" : "진행 중";
  }
  const tab = String(item?.queue_tab || "").toLowerCase();
  if (tab === "resolved") return "완료";
  if (tab === "waiting_customer") return "고객 확인 대기";
  if (tab === "action_required") return "운영 확인 중";
  const raw = String(item?.case_status || item?.queue_status || "").trim();
  if (raw) return raw.replace(/_/g, " ");
  return "진행 중";
}

function renderDashboardCasesPreview(items) {
  const target = qs("#dashboardCasesPreview");
  if (!target) return;
  const rows = Array.isArray(items) ? [...items] : [];
  rows.sort((a, b) => {
    const ta = a.last_activity_at ? new Date(a.last_activity_at).getTime() : 0;
    const tb = b.last_activity_at ? new Date(b.last_activity_at).getTime() : 0;
    return tb - ta;
  });
  const top = rows.slice(0, 8);
  if (!top.length) {
    target.innerHTML = `<p class="lhai-state lhai-state--empty" style="margin:0;">표시할 문의가 없습니다.</p>`;
    return;
  }
  target.innerHTML = top
    .map((c) => {
      const href = `case-detail.html?case_id=${encodeURIComponent(c.case_id)}`;
      const preview = String(c.subtitle || "").trim();
      const short = preview.length > 72 ? `${preview.slice(0, 72)}…` : preview;
      const label = customerCaseStatusLabel(c);
      const badgeClass = customerCaseStatusBadgeClass(c);
      return `<a class="lhai-case-card" href="${escHtml(href)}">
        <div class="lhai-case-card__head">
          <h3 class="lhai-case-card__title">${escHtml(c.title || "문의")}</h3>
          <span class="lhai-case-badge ${badgeClass}">${escHtml(label)}</span>
        </div>
        <p class="u-text-muted" style="font-size:0.88rem;margin:0;">${escHtml(short || "자세한 내용은 케이스에서 확인하세요.")}</p>
      </a>`;
    })
    .join("");
}

function renderStatusCards(cards = []) {
  const target = qs("#dashboardStatusCards");
  if (!target) return;
  if (!cards.length) {
    target.innerHTML = `<article class='lhai-card'><h2 class='lhai-card__title'>${t("common.dashboard.empty.status_data", "상태 데이터가 없습니다")}</h2></article>`;
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
      <li>${t("common.dashboard.checklist.total_items", "전체 항목")}: <strong>${summary.total}</strong></li>
      <li>${t("common.dashboard.checklist.completed", "완료")}: <strong>${summary.completed}</strong></li>
      <li>${t("common.dashboard.checklist.required_remaining", "남은 필수 항목")}: <strong>${summary.required_remaining}</strong></li>
      <li>${t("common.dashboard.checklist.next_required", "다음 필수")}: <strong>${summary.next_required_item || "-"}</strong></li>
    </ul>
  `;
}

function renderRecentMessages(messages = []) {
  const target = qs("#dashboardRecentMessages");
  if (!target) return;
  if (!messages.length) {
    target.innerHTML = `<div class='lhai-state lhai-state--empty'>${t("common.dashboard.empty.recent_messages", "최근 메시지가 없습니다.")}</div>`;
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
    target.innerHTML = `<div class='lhai-state lhai-state--empty'>${t("common.dashboard.empty.document_status", "문서 상태 정보가 없습니다.")}</div>`;
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
    target.innerHTML = `<div class='lhai-state lhai-state--empty'>${t("common.dashboard.empty.recent_activity", "최근 활동이 없습니다.")}</div>`;
    return;
  }
  target.innerHTML = `<ul class="lhai-list-compact">${activity.map((line) => `<li>${line}</li>`).join("")}</ul>`;
}

function applyDashboardBadgeLabels(aggregate) {
  const servicePrefix = t("common.dashboard.badge.service", "서비스");
  const paymentPrefix = t("common.dashboard.badge.payment", "결제");
  const schedulePrefix = t("common.dashboard.badge.schedule", "일정");
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
  const [dashboardAggregate, timelineItems, checklistSummary, caseItems] = await Promise.all([
    dashboardApi.getAggregate(customerProfileId),
    timelineApi.listByCustomer(customerProfileId),
    dashboardApi.getChecklistSummary(customerProfileId),
    customerCasesApi.list(),
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
    aiButton.setAttribute("href", dashboardAggregate.ai_assistant_quick_link || "messages.html");
  }

  renderStatusCards(dashboardAggregate.status_cards);
  renderTimeline(timelineItems, "#dashboardTimelineContainer");
  renderChecklistSummary(checklistSummary);
  renderRecentMessages(dashboardAggregate.recent_messages);
  renderDocumentStatus(dashboardAggregate.document_status);
  renderRecentActivity(dashboardAggregate.recent_activity);
  renderDashboardCasesPreview(caseItems);

  const state = getState();
  let dashboardSummary = state.dashboardSummary;
  if (!dashboardSummary.paymentStatus) {
    try {
      const stored = JSON.parse(window.localStorage.getItem("lhai_dashboard_summary") || "{}");
      dashboardSummary = { ...dashboardSummary, ...stored };
      if (stored.paymentStatus) {
        qs("#dashboardPaymentStatusBadge").textContent = `${t("common.dashboard.badge.payment", "결제")}: ${stored.paymentStatus}`;
      }
    } catch {
      // ignore malformed storage
    }
  }
}

initDashboardPage();

export { initDashboardPage };
