/**
 * Partner dashboard main content (injected into partner shell).
 * @module partner-dashboard-content
 */

import { renderPartnerPageContentHtml } from "../layouts/partner-page-layout.js";

/** @returns {string} */
export function renderPartnerDashboardContentHtml() {
  const bodyHtml = `<p class="lhai-help lhai-partner-dash__error" id="partnerDashboardError" role="alert" hidden></p>

      <section
        class="lhai-grid lhai-grid--2 lhai-partner-dash__stats lhai-partner-dash__stats--assigned lhai-assigned-dashboard__stats"
        id="partnerDashStatsAssigned"
        aria-label="진행 요약"
        hidden
      >
        <article class="lhai-card lhai-partner-dash__stat-card">
          <h2 class="lhai-card__title lhai-partner-dash__stat-title">진행중</h2>
          <p class="lhai-partner-dash__stat-value" id="partnerStatProgress">—</p>
        </article>
        <article class="lhai-card lhai-partner-dash__stat-card">
          <h2 class="lhai-card__title lhai-partner-dash__stat-title">완료</h2>
          <p class="lhai-partner-dash__stat-value" id="partnerStatDone">—</p>
        </article>
      </section>

      <section
        class="lhai-grid lhai-grid--4 lhai-partner-dash__stats lhai-bidding-dashboard__stats"
        id="partnerDashStatsBidding"
        aria-label="견적 요청 파이프라인"
        hidden
      >
        <article class="lhai-card lhai-partner-dash__stat-card">
          <h2 class="lhai-card__title lhai-partner-dash__stat-title">새 견적 요청</h2>
          <p class="lhai-partner-dash__stat-value" id="partnerStatBiddingOpen">—</p>
        </article>
        <article class="lhai-card lhai-partner-dash__stat-card">
          <h2 class="lhai-card__title lhai-partner-dash__stat-title">견적 제출 완료</h2>
          <p class="lhai-partner-dash__stat-value" id="partnerStatBiddingSubmitted">—</p>
        </article>
        <article class="lhai-card lhai-partner-dash__stat-card">
          <h2 class="lhai-card__title lhai-partner-dash__stat-title">선택됨</h2>
          <p class="lhai-partner-dash__stat-value" id="partnerStatBiddingSelected">—</p>
        </article>
        <article class="lhai-card lhai-partner-dash__stat-card">
          <h2 class="lhai-card__title lhai-partner-dash__stat-title">종료됨</h2>
          <p class="lhai-partner-dash__stat-value" id="partnerStatBiddingClosed">—</p>
        </article>
      </section>

      <section class="lhai-card" id="partner-requests">
        <h2 class="lhai-card__title" id="partnerRequestsSectionTitle">목록</h2>
        <p class="u-text-muted lhai-partner-dash__empty" id="partnerDashboardEmpty" role="status" hidden></p>

        <div
          class="lhai-partner-dash__unsupported-panel lhai-bidding-dashboard__unsupported"
          id="partnerDashboardUnsupportedPanel"
          hidden
          role="alert"
        >
          <h3 class="lhai-partner-dash__unsupported-title" id="partnerDashboardUnsupportedTitle">대시보드를 표시할 수 없습니다</h3>
          <p class="u-text-muted lhai-partner-dash__unsupported-body" id="partnerDashboardUnsupportedBody"></p>
        </div>

        <div id="partnerTableAssignedWrap" class="lhai-assigned-dashboard">
          <div id="partnerAssignedCardsRoot" class="lhai-partner-dash__assigned-root lhai-assigned-dashboard__list" hidden>
            <section class="lhai-partner-dash__subsection" aria-labelledby="partnerAssignedInProgressHeading">
              <h3 class="lhai-partner-dash__subsection-title" id="partnerAssignedInProgressHeading">진행중</h3>
              <p class="u-text-muted lhai-partner-dash__section-empty" id="partnerAssignedInProgressEmpty" hidden></p>
              <div id="partnerAssignedInProgressCards" class="lhai-partner-dash__card-list"></div>
            </section>
            <section class="lhai-partner-dash__subsection lhai-partner-dash__subsection--completed" aria-labelledby="partnerAssignedCompletedHeading">
              <h3 class="lhai-partner-dash__subsection-title" id="partnerAssignedCompletedHeading">완료</h3>
              <p class="u-text-muted lhai-partner-dash__section-empty" id="partnerAssignedCompletedEmpty" hidden></p>
              <div id="partnerAssignedCompletedCards" class="lhai-partner-dash__card-list"></div>
            </section>
          </div>
        </div>

        <div id="partnerTableBiddingWrap" class="lhai-bidding-dashboard" hidden>
          <div id="partnerBiddingListRoot" class="lhai-par-dash-bid__list" hidden></div>
        </div>
      </section>`;

  return renderPartnerPageContentHtml({
    title: "파트너 대시보드",
    titleId: "partnerDashboardTitle",
    subtitleId: "partnerDashboardSubtitle",
    subtitle: "",
    bodyHtml,
  });
}
