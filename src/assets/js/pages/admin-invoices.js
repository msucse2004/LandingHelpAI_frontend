import { invoiceApi } from "../core/api.js";
import { ensureAdminAccess, protectCurrentPage } from "../core/guards.js";
import { loadSidebar } from "../components/sidebar.js";
import { applyI18nToDom } from "../core/i18n-dom.js";
import { formatDate, formatMoney, safeText } from "../core/utils.js";

/** @type {Array<Record<string, unknown>>} */
let invoicesCache = [];

const INVOICE_STATUS_FILTER_VALUES = new Set(["", "DRAFT", "SENT", "PAID", "FAILED", "CANCELED"]);

function normalizeStatusFilterParam(raw) {
  const s = String(raw || "").trim().toUpperCase();
  if (!s) return "";
  return INVOICE_STATUS_FILTER_VALUES.has(s) ? s : "";
}

function qs(selector) {
  return document.querySelector(selector);
}

function syncInvoiceListUrlStatus(statusFilter) {
  try {
    const u = new URL(window.location.href);
    if (statusFilter) u.searchParams.set("status", statusFilter);
    else u.searchParams.delete("status");
    window.history.replaceState({}, "", u);
  } catch {
    /* non-browser */
  }
}

/** 견적 목록과 동일: 청구 대상 표시명 (billing_to → profile::) */
function invoiceListCustomerTitle(inv) {
  const bt = inv && typeof inv.billing_to === "object" && inv.billing_to ? inv.billing_to : {};
  const name = String(bt.full_name || "").trim();
  if (name) return name;
  const cp = String(inv.customer_profile_id || "").trim();
  if (cp.toLowerCase().startsWith("profile::")) {
    const rest = cp.slice("profile::".length).trim();
    return rest || "고객";
  }
  return cp || "고객";
}

function renderInvoiceList(invoices, emptyMessage) {
  invoicesCache = Array.isArray(invoices) ? invoices : [];
  const target = qs("#adminInvoiceList");
  if (!target) return;
  if (!invoicesCache.length) {
    const msg = emptyMessage || "표시할 청구서가 없습니다.";
    target.innerHTML = `<div class="lhai-state">${safeText(msg)}</div>`;
    return;
  }
  target.innerHTML = invoicesCache
    .map((invoice) => {
      const id = String(invoice.id || "").trim();
      const title = safeText(invoiceListCustomerTitle(invoice));
      const issued = formatDate(invoice.created_at || invoice.updated_at);
      const svc = safeText(invoice.service_name || "—");
      const st = safeText(String(invoice.status || ""));
      const cur = String(invoice.currency || "USD").trim() || "USD";
      const amt = formatMoney(Number(invoice.amount_due || 0), cur);
      return `
      <button type="button" class="lhai-list__item" data-invoice-id="${safeText(id)}">
        <strong>${title}</strong><br />
        <span class="u-text-muted">발행 ${safeText(issued)} · ${svc} · ${amt} · 청구서 ${safeText(id)} · 상태 ${st}</span>
      </button>`;
    })
    .join("");

  target.querySelectorAll("[data-invoice-id]").forEach((button) => {
    button.addEventListener("click", () => {
      const invoiceId = button.getAttribute("data-invoice-id") || "";
      if (!invoiceId) return;
      window.location.href = `invoice-detail.html?invoice_id=${encodeURIComponent(invoiceId)}`;
    });
  });
}

async function loadInvoicesForAdmin(statusFilter) {
  const raw = await invoiceApi.list(statusFilter);
  const rows = Array.isArray(raw) ? raw : [];
  rows.sort((a, b) => {
    const ta = new Date(a.created_at || a.updated_at || 0).getTime();
    const tb = new Date(b.created_at || b.updated_at || 0).getTime();
    return tb - ta;
  });
  return rows;
}

async function initAdminInvoicesPage() {
  if (!protectCurrentPage()) return;
  if (!ensureAdminAccess()) return;
  await loadSidebar("#sidebar", "admin");
  applyI18nToDom(document);

  const params = new URLSearchParams(window.location.search);
  const initialStatus = normalizeStatusFilterParam(params.get("status"));
  const statusSelect = qs("#adminInvoiceStatusFilter");
  if (statusSelect instanceof HTMLSelectElement) {
    statusSelect.value = initialStatus || "";
  }

  const emptyMsg = initialStatus
    ? `상태가 «${initialStatus}»인 청구서가 없습니다. 필터를 바꿔 보세요.`
    : "표시할 청구서가 없습니다.";

  if (statusSelect instanceof HTMLSelectElement) {
    statusSelect.addEventListener("change", async () => {
      const st = normalizeStatusFilterParam(statusSelect.value);
      statusSelect.value = st || "";
      syncInvoiceListUrlStatus(st);
      const listEl = qs("#adminInvoiceList");
      if (listEl) listEl.innerHTML = "<div class=\"lhai-state\">불러오는 중…</div>";
      const rows = await loadInvoicesForAdmin(st);
      const msg = st ? `상태가 «${st}»인 청구서가 없습니다. 필터를 바꿔 보세요.` : "표시할 청구서가 없습니다.";
      renderInvoiceList(rows, msg);
    });
  }

  let rows = await loadInvoicesForAdmin(initialStatus);
  renderInvoiceList(rows, emptyMsg);
}

initAdminInvoicesPage();

export { initAdminInvoicesPage };
