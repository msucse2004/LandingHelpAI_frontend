import { loadSidebar } from "../components/sidebar.js";
import { quoteApi } from "../core/api.js";
import { bootAppPageContent } from "../core/app-page-i18n-boot.js";
import { protectCurrentPage } from "../core/guards.js";
import { applyI18nToDom, wireDynamicPageI18nRefresh } from "../core/i18n-dom.js";
import { t } from "../core/i18n-client.js";
import { formatDate, safeText } from "../core/utils.js";

function qs(selector) {
  return document.querySelector(selector);
}

/** @type {unknown[]} */
let lastSurveyReviewRows = [];

function renderSurveyReviewQueue(rows) {
  const section = qs("#adminSurveyReviewSection");
  const listEl = qs("#adminSurveyReviewList");
  const countEl = qs("#adminPendingQuotePrepCount");
  if (!section || !listEl) return;

  lastSurveyReviewRows = Array.isArray(rows) ? rows : [];

  if (!lastSurveyReviewRows.length) {
    section.hidden = true;
    listEl.innerHTML = "";
    if (countEl) countEl.textContent = "0";
    return;
  }

  section.hidden = false;
  if (countEl) countEl.textContent = String(lastSurveyReviewRows.length);

  const badge = t("common.admin_dashboard.review_badge", "Quote prep needed");
  const statusLabel = t("common.admin_dashboard.review_status_label", "Status");
  const submittedLabel = t("common.admin_dashboard.review_submitted_label", "Submitted");
  const quoteIdLabel = t("common.admin_dashboard.review_quote_id_label", "Quote ID");
  const helpAreasLabel = t("common.admin_dashboard.review_help_areas_label", "Help areas");
  const selectedLabel = t("common.admin_dashboard.review_selected_services_label", "Selected services");
  const prepareBtn = t("common.admin_dashboard.review_prepare_btn", "Prepare quote");
  const defaultState = t(
    "common.admin_dashboard.default_status_label",
    "Awaiting admin review · quote draft needed"
  );

  listEl.innerHTML = lastSurveyReviewRows
    .map((row) => {
      const areas = Array.isArray(row.help_area_titles) ? row.help_area_titles.filter(Boolean) : [];
      const areasText = areas.length ? areas.join(", ") : "—";
      const n = Number(row.selected_services_count) || 0;
      const when = formatDate(row.submitted_at);
      const name = safeText(row.customer_display_name || row.customer_profile_id || "");
      const rawState = safeText(row.status_label || "");
      const state =
        rawState && rawState !== "관리자 검토 대기 · 견적 작성 필요" ? rawState : defaultState;
      const qid = safeText(row.quote_id || "");
      const prepHref = `admin-quote-prepare.html?id=${encodeURIComponent(row.quote_id || "")}`;
      const countText = t("common.admin_dashboard.review_selected_services_count", "{count} selected").replace(
        /\{count\}/g,
        String(n)
      );
      return `
        <article class="lhai-admin-survey-review-card">
          <div>
            <span class="lhai-admin-survey-review-card__badge">${badge}</span>
            <h3 class="lhai-admin-survey-review-card__title">${name}</h3>
            <p class="lhai-admin-survey-review-card__meta">
              <strong>${statusLabel}</strong> ${state}<br />
              <strong>${submittedLabel}</strong> ${safeText(when)} · <strong>${quoteIdLabel}</strong> ${qid}<br />
              <strong>${helpAreasLabel}</strong> ${safeText(areasText)}<br />
              <strong>${selectedLabel}</strong> ${countText}
            </p>
          </div>
          <div>
            <a class="lhai-button lhai-button--primary" href="${prepHref}">${prepareBtn}</a>
          </div>
        </article>
      `;
    })
    .join("");
}

wireDynamicPageI18nRefresh(() => {
  const main = qs("main.lhai-main");
  if (main) applyI18nToDom(main);
  renderSurveyReviewQueue(lastSurveyReviewRows);
}, { keyPrefixes: ["admin.", "common."] });

async function initAdminDashboard() {
  if (!protectCurrentPage()) return;
  await bootAppPageContent(["common", "nav", "admin"], async () => {
  await loadSidebar("#sidebar", "admin");

  const pending = await quoteApi.listSurveyReviewPending();
  renderSurveyReviewQueue(Array.isArray(pending) ? pending : []);
  });
}

void initAdminDashboard();
