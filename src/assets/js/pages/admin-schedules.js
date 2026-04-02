import { scheduleApi } from "../core/api.js";
import { loadSidebar } from "../components/sidebar.js";
import { applyI18nToDom } from "../core/i18n-dom.js";
import { ensureAdminAccess, protectCurrentPage } from "../core/guards.js";
import { formatDate, safeText } from "../core/utils.js";

let selectedScheduleId = "";

function parseCsvValues(value) {
  return String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function setStatus(message) {
  const target = document.querySelector("#adminScheduleStatus");
  if (target) target.textContent = message;
}

function renderScheduleList(items = []) {
  const target = document.querySelector("#adminScheduleList");
  if (!target) return;
  if (!items.length) {
    target.innerHTML = `<div class="lhai-state lhai-state--empty">No schedules yet.</div>`;
    return;
  }
  target.innerHTML = items
    .map(
      (item) => `
      <article class="lhai-schedule-item ${item.id === selectedScheduleId ? "is-active" : ""}" data-schedule-id="${item.id}">
        <strong>${safeText(item.id)}</strong>
        <p class="u-text-muted">status: ${safeText(item.status)} / updated: ${formatDate(item.updated_at)}</p>
        <p>${safeText((item.proposed_slots || []).join(", "))}</p>
      </article>
    `
    )
    .join("");
}

async function initAdminSchedulesPage() {
  if (!protectCurrentPage()) return;
  if (!ensureAdminAccess()) return;
  await loadSidebar("#sidebar", "admin");
  applyI18nToDom(document);

  const customerIdInput = document.querySelector("#scheduleCustomerId");

  const refresh = async () => {
    const customerId = customerIdInput instanceof HTMLInputElement ? customerIdInput.value.trim() : "profile::demo@customer.com";
    const schedules = await scheduleApi.list(customerId);
    if (!selectedScheduleId && schedules.length) selectedScheduleId = schedules[0].id;
    renderScheduleList(schedules);
  };

  document.querySelector("#adminScheduleList")?.addEventListener("click", (event) => {
    const target = event.target.closest("[data-schedule-id]");
    if (!target) return;
    selectedScheduleId = target.getAttribute("data-schedule-id") || "";
    refresh();
  });

  document.querySelector("#adminScheduleForm")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const customerProfileId = customerIdInput instanceof HTMLInputElement ? customerIdInput.value.trim() : "profile::demo@customer.com";
    const slotsInput = document.querySelector("#scheduleSlots");
    const reasonsInput = document.querySelector("#scheduleReasons");
    const slots = parseCsvValues(slotsInput instanceof HTMLTextAreaElement ? slotsInput.value : "");
    const reasons = parseCsvValues(reasonsInput instanceof HTMLTextAreaElement ? reasonsInput.value : "");
    const created = await scheduleApi.createDraft({
      customer_profile_id: customerProfileId,
      proposed_slots: slots,
      notes: "Admin created schedule draft",
      recommendation_reasons: reasons,
    });
    selectedScheduleId = created.id;
    setStatus(`Draft created: ${created.id}`);
    refresh();
  });

  document.querySelector("#reviseScheduleBtn")?.addEventListener("click", async () => {
    if (!selectedScheduleId) return setStatus("Select a schedule first.");
    const slotsInput = document.querySelector("#scheduleSlots");
    const reasonsInput = document.querySelector("#scheduleReasons");
    const noteInput = document.querySelector("#scheduleRevisionNote");
    const revised = await scheduleApi.revise(selectedScheduleId, {
      proposed_slots: parseCsvValues(slotsInput instanceof HTMLTextAreaElement ? slotsInput.value : ""),
      recommendation_reasons: parseCsvValues(reasonsInput instanceof HTMLTextAreaElement ? reasonsInput.value : ""),
      revision_note: noteInput instanceof HTMLInputElement ? noteInput.value.trim() : "",
    });
    setStatus(`Revised: ${revised.id}`);
    refresh();
  });

  document.querySelector("#proposeScheduleBtn")?.addEventListener("click", async () => {
    if (!selectedScheduleId) return setStatus("Select a schedule first.");
    const noteInput = document.querySelector("#scheduleRevisionNote");
    const proposed = await scheduleApi.propose(selectedScheduleId, noteInput instanceof HTMLInputElement ? noteInput.value.trim() : "");
    setStatus(`Proposed: ${proposed.id}`);
    refresh();
  });

  document.querySelector("#confirmScheduleBtn")?.addEventListener("click", async () => {
    if (!selectedScheduleId) return setStatus("Select a schedule first.");
    const noteInput = document.querySelector("#scheduleRevisionNote");
    const confirmed = await scheduleApi.confirm(selectedScheduleId, noteInput instanceof HTMLInputElement ? noteInput.value.trim() : "");
    setStatus(`Confirmed: ${confirmed.id}`);
    refresh();
  });

  await refresh();
}

initAdminSchedulesPage();
