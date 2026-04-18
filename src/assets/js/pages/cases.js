import { ensureCustomerAccess, protectCurrentPage } from "../core/guards.js";
import { loadSidebar } from "../components/sidebar.js";
import { resolveAppHeaderShell, refreshHeaderMailUnreadBadge } from "../core/app-header.js";
import { MOCK_CASES, mockCasesDelay } from "../core/mock-cases.js";

function qs(selector) {
  return document.querySelector(selector);
}

function esc(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function badgeClass(status) {
  const m = {
    open: "lhai-case-badge--open",
    pending_ops: "lhai-case-badge--pending_ops",
    pending_customer: "lhai-case-badge--pending_customer",
    resolved: "lhai-case-badge--resolved",
  };
  return m[status] || "lhai-case-badge--open";
}

function formatUpdated(iso) {
  try {
    const d = new Date(iso);
    return d.toLocaleString("ko-KR", { dateStyle: "medium", timeStyle: "short" });
  } catch {
    return "—";
  }
}

function renderCaseCards(cases) {
  const host = qs("#casesListHost");
  if (!host) return;
  host.innerHTML = cases
    .map((c) => {
      const href = `case-detail.html?case_id=${encodeURIComponent(c.id)}`;
      const preview = c.messages.length ? c.messages[c.messages.length - 1].body : "";
      const short = preview.length > 72 ? `${preview.slice(0, 72)}…` : preview;
      return `<a class="lhai-case-card" href="${esc(href)}">
        <div class="lhai-case-card__head">
          <h2 class="lhai-case-card__title">${esc(c.title)}</h2>
          <span class="lhai-case-badge ${badgeClass(c.status)}">${esc(c.statusLabel)}</span>
        </div>
        <p class="lhai-case-card__meta">단계: ${esc(c.stageLabel)} · 업데이트 ${esc(formatUpdated(c.updatedAt))}</p>
        <p class="u-text-muted u-mt-2" style="font-size:0.9rem;margin:0;">${esc(short || "메시지가 없습니다.")}</p>
      </a>`;
    })
    .join("");
}

async function initCasesPage() {
  if (!protectCurrentPage()) return;
  if (!ensureCustomerAccess()) return;

  const loading = qs("#casesLoadingState");
  const errEl = qs("#casesErrorState");
  const empty = qs("#casesEmptyState");
  const list = qs("#casesListHost");

  loading.hidden = false;
  errEl.hidden = true;
  empty.hidden = true;
  list.hidden = true;

  await loadSidebar("#sidebar", "customer");
  const brandEl = document.querySelector(".lhai-brand");
  if (brandEl) brandEl.textContent = resolveAppHeaderShell().brand;
  void refreshHeaderMailUnreadBadge();

  try {
    await mockCasesDelay(200);
    const rows = [...MOCK_CASES].sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
    loading.hidden = true;
    if (!rows.length) {
      empty.hidden = false;
      return;
    }
    renderCaseCards(rows);
    list.hidden = false;
  } catch (e) {
    loading.hidden = true;
    errEl.hidden = false;
    errEl.textContent =
      e && typeof e.message === "string" ? e.message : "목록을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.";
  }
}

void initCasesPage();
