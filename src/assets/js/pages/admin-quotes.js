import { adminApi, quoteApi } from "../core/api.js";
import { ensureAdminAccess, protectCurrentPage } from "../core/guards.js";
import { loadSidebar } from "../components/sidebar.js";
import { applyI18nToDom } from "../core/i18n-dom.js";
import { formatDate, safeText } from "../core/utils.js";

function qs(selector) {
  return document.querySelector(selector);
}

function renderPrepBanner(rows) {
  const el = qs("#adminQuotePrepBanner");
  if (!el) return;
  if (!rows.length) {
    el.hidden = true;
    el.innerHTML = "";
    return;
  }
  el.hidden = false;
  el.innerHTML = `
    <h2 class="lhai-card__title">견적 준비 필요 — 설문 접수 ${rows.length}건</h2>
    <p class="lhai-help">
      관리자 검토 후 견적을 작성하고 <strong>저장</strong>한 다음 <strong>견적 제안</strong>으로 고객에게 보낼 수 있습니다.
    </p>
    <ul class="lhai-admin-quote-prep-banner__list">
      ${rows
        .map((r) => {
          const name = safeText(r.customer_display_name || r.customer_profile_id || "");
          const when = formatDate(r.submitted_at);
          const areas = Array.isArray(r.help_area_titles) ? r.help_area_titles.filter(Boolean).join(", ") : "";
          const n = Number(r.selected_services_count) || 0;
          const qid = String(r.quote_id || "").trim();
          const prepUrl = `admin-quote-prepare.html?id=${encodeURIComponent(qid)}`;
          return `<li>
            ${name} · 접수 ${safeText(when)} · 상태: 견적 준비 필요
            ${areas ? ` · 영역: ${safeText(areas)}` : ""} · 서비스 ${n}개
            · <a class="lhai-admin-quote-prep-banner__prep-link" href="${prepUrl}">초안 작성 화면</a>
          </li>`;
        })
        .join("")}
    </ul>
  `;

}

function renderQuoteList(quotes, pendingIds) {
  const target = qs("#adminQuoteList");
  if (!target) return;
  if (!quotes.length) {
    target.innerHTML = "<div class='lhai-state lhai-state--empty'>No quotes available.</div>";
    return;
  }

  const pend = pendingIds instanceof Set ? pendingIds : new Set();
  target.innerHTML = quotes
    .map(
      (quote) => {
        const submittedAt = formatDate(quote.created_at || quote.updated_at);
        return `
      <button type="button" class="lhai-list__item ${pend.has(quote.id) ? "lhai-list__item--needs-prep" : ""}" data-quote-id="${safeText(quote.id)}">
        <strong>${safeText(quote.customer_display_name || quote.customer_profile_id || "Customer")}</strong><br />
        <span class="u-text-muted">${
          pend.has(quote.id) ? '<span class="lhai-admin-needs-prep-tag">견적 준비 필요</span> · ' : ""
        }접수 ${safeText(submittedAt)} · ${safeText(quote.service_name || "Untitled")} · 상태 ${safeText(quote.status)}</span>
      </button>
    `;
      }
    )
    .join("");

  target.querySelectorAll("[data-quote-id]").forEach((button) => {
    button.addEventListener("click", () => {
      const quoteId = button.getAttribute("data-quote-id");
      if (!quoteId) return;
      window.location.href = `admin-quote-prepare.html?id=${encodeURIComponent(quoteId)}`;
    });
  });
}

async function initAdminQuotesPage() {
  if (!protectCurrentPage()) return;
  if (!ensureAdminAccess()) return;
  await loadSidebar("#sidebar", "admin");
  applyI18nToDom(document);

  const pendingQueue = await quoteApi.listSurveyReviewPending();
  const pendingRows = Array.isArray(pendingQueue) ? pendingQueue : [];
  const pendingIds = new Set(pendingRows.map((r) => r.quote_id).filter(Boolean));
  renderPrepBanner(pendingRows);

  const quotesRaw = await adminApi.listQuotes();
  const quotes = [...quotesRaw].sort((a, b) => {
    const ao = pendingIds.has(a.id) ? 0 : 1;
    const bo = pendingIds.has(b.id) ? 0 : 1;
    return ao - bo;
  });
  renderQuoteList(quotes, pendingIds);

  const params = new URLSearchParams(window.location.search);
  const prepareId = (params.get("prepare") || "").trim();
  if (prepareId && quotes.some((q) => q.id === prepareId)) {
    window.location.href = `admin-quote-prepare.html?id=${encodeURIComponent(prepareId)}`;
  }
}

initAdminQuotesPage();

export { initAdminQuotesPage };
