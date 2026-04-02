import { loadSidebar } from "../components/sidebar.js";
import { quoteApi } from "../core/api.js";
import { protectCurrentPage } from "../core/guards.js";
import { initCommonI18nAndApplyDom } from "../core/i18n-dom.js";
import { formatDate, safeText } from "../core/utils.js";

function qs(selector) {
  return document.querySelector(selector);
}

function renderSurveyReviewQueue(rows) {
  const section = qs("#adminSurveyReviewSection");
  const listEl = qs("#adminSurveyReviewList");
  const countEl = qs("#adminPendingQuotePrepCount");
  if (!section || !listEl) return;

  if (!rows.length) {
    section.hidden = true;
    listEl.innerHTML = "";
    if (countEl) countEl.textContent = "0";
    return;
  }

  section.hidden = false;
  if (countEl) countEl.textContent = String(rows.length);

  listEl.innerHTML = rows
    .map((row) => {
      const areas = Array.isArray(row.help_area_titles) ? row.help_area_titles.filter(Boolean) : [];
      const areasText = areas.length ? areas.join(", ") : "—";
      const n = Number(row.selected_services_count) || 0;
      const when = formatDate(row.submitted_at);
      const name = safeText(row.customer_display_name || row.customer_profile_id || "");
      const state = safeText(row.status_label || "관리자 검토 대기 · 견적 작성 필요");
      const qid = safeText(row.quote_id || "");
      const prepHref = `admin-quote-prepare.html?id=${encodeURIComponent(row.quote_id || "")}`;
      return `
        <article class="lhai-admin-survey-review-card">
          <div>
            <span class="lhai-admin-survey-review-card__badge">견적 준비 필요</span>
            <h3 class="lhai-admin-survey-review-card__title">${name}</h3>
            <p class="lhai-admin-survey-review-card__meta">
              <strong>상태</strong> ${state}<br />
              <strong>접수</strong> ${safeText(when)} · <strong>견적 ID</strong> ${qid}<br />
              <strong>도움 영역</strong> ${safeText(areasText)}<br />
              <strong>선택 서비스</strong> ${n}개
            </p>
          </div>
          <div>
            <a class="lhai-button lhai-button--primary" href="${prepHref}">견적 준비하기</a>
          </div>
        </article>
      `;
    })
    .join("");
}

async function initAdminDashboard() {
  if (!protectCurrentPage()) return;
  await initCommonI18nAndApplyDom(document);
  await loadSidebar("#sidebar", "admin");

  const pending = await quoteApi.listSurveyReviewPending();
  renderSurveyReviewQueue(Array.isArray(pending) ? pending : []);
}

void initAdminDashboard();
