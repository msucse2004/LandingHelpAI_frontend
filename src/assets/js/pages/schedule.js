import { scheduleApi } from "../core/api.js";
import { loadSidebar } from "../components/sidebar.js";
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
    target.innerHTML = `<div class="lhai-state lhai-state--empty">No proposed schedule.</div>`;
    return;
  }
  target.innerHTML = `
    <p><strong>Status:</strong> ${safeText(schedule.status)}</p>
    <p><strong>Customer Feedback:</strong> ${safeText(schedule.customer_feedback || "None")}</p>
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
    target.innerHTML = `<div class="lhai-state lhai-state--empty">No schedule state.</div>`;
    return;
  }
  target.innerHTML = `
    <ul class="lhai-list">
      <li class="lhai-list__item"><strong>Current state:</strong> ${safeText(schedule.status)}</li>
      <li class="lhai-list__item"><strong>Revision notes:</strong> ${safeText((schedule.revision_notes || []).join(" | ") || "None")}</li>
      <li class="lhai-list__item"><strong>Final confirmed:</strong> ${safeText(JSON.stringify(schedule.final_confirmed_version || {}))}</li>
    </ul>
  `;
}

async function initSchedulePage() {
  if (!protectCurrentPage()) return;
  if (!ensureCustomerAccess()) return;
  await loadSidebar("#sidebar", "customer");

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
    if (!selected?.id) return setFeedbackStatus("No schedule to update.");
    const input = document.querySelector("#customerScheduleFeedbackInput");
    const feedback = input instanceof HTMLTextAreaElement ? input.value.trim() : "";
    if (!feedback) return setFeedbackStatus("Please enter adjustment feedback.");
    await scheduleApi.requestAdjustment(selected.id, feedback);
    setFeedbackStatus("Adjustment request submitted (stub).");
    if (input instanceof HTMLTextAreaElement) input.value = "";
    await refresh();
  });

  await refresh();
}

export { initSchedulePage };

initSchedulePage();
