import { scheduleApi, schedulingAdminApi } from "../core/api.js";
import { loadSidebar } from "../components/sidebar.js";
import { applyI18nToDom } from "../core/i18n-dom.js";
import { ensureAdminAccess, protectCurrentPage } from "../core/guards.js";
import { formatDate, safeText } from "../core/utils.js";

let selectedCustomerProfileId = "";
let selectedScheduleId = "";
/** @type {Array<object>} */
let paidCustomersCache = [];

function escapeAttr(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;");
}

function setStatus(message) {
  const target = document.querySelector("#adminScheduleStatus");
  if (target) target.textContent = message;
}

function scheduleBuilderHref(scheduleId, customerProfileId) {
  const q = new URLSearchParams();
  q.set("schedule_id", scheduleId);
  if (customerProfileId) q.set("customer_profile_id", customerProfileId);
  return `admin-schedule-builder.html?${q.toString()}`;
}

function syncUrlCustomerParam() {
  const url = new URL(window.location.href);
  if (selectedCustomerProfileId) {
    url.searchParams.set("customer_profile_id", selectedCustomerProfileId);
  } else {
    url.searchParams.delete("customer_profile_id");
  }
  window.history.replaceState({}, "", url.toString());
}

function renderPaidCustomers(rows = []) {
  const target = document.querySelector("#paidCustomersList");
  if (!target) return;
  if (!rows.length) {
    target.innerHTML = `<div class="lhai-state lhai-state--empty lhai-state--empty-no-prefix">결제 완료(PAID) 청구서가 있는 고객이 없습니다. 청구서를 결제 처리한 뒤 새로고침해 보세요.</div>`;
    return;
  }
  target.innerHTML = rows
    .map((row) => {
      const cp = safeText(row.customer_profile_id);
      const active = cp === selectedCustomerProfileId ? " is-active" : "";
      return `
      <button type="button" class="lhai-admin-paid-customer${active}" data-customer-profile-id="${escapeAttr(cp)}" role="option" aria-selected="${cp === selectedCustomerProfileId ? "true" : "false"}">
        <span class="lhai-admin-paid-customer__name">${safeText(row.display_label || cp)}</span>
        <span class="lhai-admin-paid-customer__meta">결제 청구 ${Number(row.paid_invoice_count) || 0}건 · ${safeText(row.latest_paid_invoice_id || "").slice(0, 8)}…</span>
      </button>`;
    })
    .join("");
}

function renderScheduleList(items = []) {
  const target = document.querySelector("#adminScheduleList");
  if (!target) return;
  if (!selectedCustomerProfileId) {
    target.innerHTML = "";
    return;
  }
  if (!items.length) {
    target.innerHTML = `<div class="lhai-state lhai-state--empty lhai-state--empty-no-prefix">이 고객에게 아직 일정 초안이 없습니다. 결제 직후 자동 생성되거나, 견적·서비스 연결이 맞는지 확인해 주세요.</div>`;
    return;
  }
  const cp = selectedCustomerProfileId;
  target.innerHTML = items
    .map((item) => {
      const cardCount = Array.isArray(item.items) ? item.items.length : 0;
      return `
      <article class="lhai-schedule-item ${item.id === selectedScheduleId ? "is-active" : ""}" data-schedule-id="${safeText(item.id)}">
        <div class="lhai-schedule-item__row">
          <div>
            <strong>${safeText(item.id)}</strong>
            <p class="u-text-muted">상태 ${safeText(item.status)} · 서비스 카드 ${cardCount}개 · 수정 ${formatDate(item.updated_at)}</p>
          </div>
          <a class="lhai-button lhai-button--primary" href="${scheduleBuilderHref(item.id, cp)}">달력에서 편집</a>
        </div>
      </article>`;
    })
    .join("");
}

async function loadPaidCustomers() {
  setStatus("");
  try {
    const rows = await schedulingAdminApi.listPaidCustomers();
    paidCustomersCache = Array.isArray(rows) ? rows : [];
    renderPaidCustomers(paidCustomersCache);
  } catch (e) {
    const msg = e && typeof e.message === "string" ? e.message : String(e);
    paidCustomersCache = [];
    renderPaidCustomers([]);
    setStatus(`결제 고객 목록을 불러오지 못했습니다: ${msg}`);
  }
}

async function loadSchedulesForCustomer() {
  setStatus("");
  const label = document.querySelector("#selectedCustomerLabel");
  if (!selectedCustomerProfileId) {
    if (label) label.textContent = "고객을 위에서 선택해 주세요.";
    renderScheduleList([]);
    return;
  }
  if (label) {
    label.textContent = `선택: ${selectedCustomerProfileId}`;
  }
  try {
    const schedules = await scheduleApi.list(selectedCustomerProfileId);
    if (!selectedScheduleId && schedules.length) selectedScheduleId = schedules[0].id;
    renderScheduleList(schedules);
  } catch (e) {
    const msg = e && typeof e.message === "string" ? e.message : String(e);
    renderScheduleList([]);
    setStatus(`일정 목록을 불러오지 못했습니다: ${msg}`);
  }
}

async function initAdminSchedulesPage() {
  if (!protectCurrentPage()) return;
  if (!ensureAdminAccess()) return;
  await loadSidebar("#sidebar", "admin");
  applyI18nToDom(document);

  const urlCp = new URLSearchParams(window.location.search).get("customer_profile_id");
  if (urlCp && String(urlCp).trim()) {
    selectedCustomerProfileId = String(urlCp).trim();
  }

  await loadPaidCustomers();
  await loadSchedulesForCustomer();

  document.querySelector("#paidCustomersReloadBtn")?.addEventListener("click", async () => {
    await loadPaidCustomers();
    await loadSchedulesForCustomer();
  });

  document.querySelector("#paidCustomersList")?.addEventListener("click", (event) => {
    const btn = event.target instanceof Element ? event.target.closest("[data-customer-profile-id]") : null;
    if (!btn || !(btn instanceof HTMLElement)) return;
    const cp = btn.getAttribute("data-customer-profile-id") || "";
    if (!cp) return;
    selectedCustomerProfileId = cp;
    selectedScheduleId = "";
    syncUrlCustomerParam();
    renderPaidCustomers(paidCustomersCache);
    loadSchedulesForCustomer();
  });

  document.querySelector("#adminScheduleList")?.addEventListener("click", (event) => {
    if (event.target instanceof Element && event.target.closest("a")) return;
    const row = event.target instanceof Element ? event.target.closest("[data-schedule-id]") : null;
    if (!row) return;
    selectedScheduleId = row.getAttribute("data-schedule-id") || "";
    loadSchedulesForCustomer();
  });
}

initAdminSchedulesPage();
