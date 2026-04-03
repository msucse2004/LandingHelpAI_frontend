import { scheduleApi } from "../core/api.js";
import { loadSidebar } from "../components/sidebar.js";
import { applyI18nToDom } from "../core/i18n-dom.js";
import { ensureCustomerAccess, protectCurrentPage } from "../core/guards.js";
import { formatDate, safeText } from "../core/utils.js";

function setFeedbackStatus(message) {
  const target = document.querySelector("#customerScheduleFeedbackStatus");
  if (target) target.textContent = message;
}

function renderSummary(schedule) {
  const target = document.querySelector("#customerScheduleSummary");
  if (!target) return;
  if (!schedule) {
    target.innerHTML = `<div class="lhai-state lhai-state--empty">제안된 일정이 없습니다.</div>`;
    return;
  }
  target.innerHTML = `
    <p><strong>상태:</strong> ${safeText(schedule.status)}</p>
    <p><strong>고객 피드백:</strong> ${safeText(schedule.customer_feedback || "없음")}</p>
    <div>
      ${(schedule.proposed_slots || []).map((slot) => `<div class="lhai-schedule-slot">${formatDate(slot)} (${safeText(slot)})</div>`).join("")}
    </div>
  `;
}

function renderReasons(schedule) {
  const target = document.querySelector("#customerScheduleReasons");
  if (!target) return;
  const reasons = schedule?.recommendation_reasons || [];
  target.innerHTML = reasons.length
    ? `<ul class="lhai-list">${reasons.map((reason) => `<li class="lhai-list__item">${safeText(reason)}</li>`).join("")}</ul>`
    : `<div class="lhai-state lhai-state--empty">No recommendation reasons yet.</div>`;
}

function renderState(schedule) {
  const target = document.querySelector("#customerScheduleState");
  if (!target) return;
  if (!schedule) {
    target.innerHTML = `<div class="lhai-state lhai-state--empty">일정 상태 정보가 없습니다.</div>`;
    return;
  }
  target.innerHTML = `
    <ul class="lhai-list">
      <li class="lhai-list__item"><strong>현재 상태:</strong> ${safeText(schedule.status)}</li>
      <li class="lhai-list__item"><strong>수정 메모:</strong> ${safeText((schedule.revision_notes || []).join(" | ") || "없음")}</li>
      <li class="lhai-list__item"><strong>최종 확정:</strong> ${safeText(JSON.stringify(schedule.final_confirmed_version || {}))}</li>
    </ul>
  `;
}

async function initSchedulePage() {
  if (!protectCurrentPage()) return;
  if (!ensureCustomerAccess()) return;
  await loadSidebar("#sidebar", "customer");
  applyI18nToDom(document);

  let selected = null;
  const refresh = async () => {
    const schedules = await scheduleApi.list("profile::demo@customer.com");
    selected = schedules[0] || null;
    renderSummary(selected);
    renderReasons(selected);
    renderState(selected);
  };

  document.querySelector("#customerScheduleFeedbackForm")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!selected?.id) return setFeedbackStatus("업데이트할 일정이 없습니다.");
    const input = document.querySelector("#customerScheduleFeedbackInput");
    const feedback = input instanceof HTMLTextAreaElement ? input.value.trim() : "";
    if (!feedback) return setFeedbackStatus("조정 요청 내용을 입력해 주세요.");
    await scheduleApi.requestAdjustment(selected.id, feedback);
    setFeedbackStatus("조정 요청이 전송되었습니다. (스텁)");
    if (input instanceof HTMLTextAreaElement) input.value = "";
    await refresh();
  });

  await refresh();
}

export { initSchedulePage };

initSchedulePage();
