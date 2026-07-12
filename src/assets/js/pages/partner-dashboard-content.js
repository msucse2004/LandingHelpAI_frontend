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
        data-i18n-aria-label="partner.dashboard.stats.assigned.aria"
        aria-label="Progress summary"
        hidden
      >
        <article class="lhai-card lhai-partner-dash__stat-card">
          <h2 class="lhai-card__title lhai-partner-dash__stat-title" data-i18n="partner.dashboard.stats.in_progress">In progress</h2>
          <p class="lhai-partner-dash__stat-value" id="partnerStatProgress">—</p>
        </article>
        <article class="lhai-card lhai-partner-dash__stat-card">
          <h2 class="lhai-card__title lhai-partner-dash__stat-title" data-i18n="partner.dashboard.stats.completed">Completed</h2>
          <p class="lhai-partner-dash__stat-value" id="partnerStatDone">—</p>
        </article>
      </section>

      <section
        class="lhai-grid lhai-grid--4 lhai-partner-dash__stats lhai-bidding-dashboard__stats"
        id="partnerDashStatsBidding"
        data-i18n-aria-label="partner.dashboard.stats.bidding.aria"
        aria-label="Bid request pipeline"
        hidden
      >
        <article class="lhai-card lhai-partner-dash__stat-card">
          <h2 class="lhai-card__title lhai-partner-dash__stat-title" data-i18n="partner.dashboard.stats.new_requests">New bid requests</h2>
          <p class="lhai-partner-dash__stat-value" id="partnerStatBiddingOpen">—</p>
        </article>
        <article class="lhai-card lhai-partner-dash__stat-card">
          <h2 class="lhai-card__title lhai-partner-dash__stat-title" data-i18n="partner.dashboard.stats.submitted">Offers submitted</h2>
          <p class="lhai-partner-dash__stat-value" id="partnerStatBiddingSubmitted">—</p>
        </article>
        <article class="lhai-card lhai-partner-dash__stat-card">
          <h2 class="lhai-card__title lhai-partner-dash__stat-title" data-i18n="partner.dashboard.stats.selected">Selected</h2>
          <p class="lhai-partner-dash__stat-value" id="partnerStatBiddingSelected">—</p>
        </article>
        <article class="lhai-card lhai-partner-dash__stat-card">
          <h2 class="lhai-card__title lhai-partner-dash__stat-title" data-i18n="partner.dashboard.stats.closed">Closed</h2>
          <p class="lhai-partner-dash__stat-value" id="partnerStatBiddingClosed">—</p>
        </article>
      </section>

      <section class="lhai-card" id="partner-requests">
        <h2 class="lhai-card__title" id="partnerRequestsSectionTitle" data-i18n="partner.dashboard.section.list">List</h2>
        <p class="u-text-muted lhai-partner-dash__empty" id="partnerDashboardEmpty" role="status" hidden></p>

        <div
          class="lhai-partner-dash__unsupported-panel lhai-bidding-dashboard__unsupported"
          id="partnerDashboardUnsupportedPanel"
          hidden
          role="alert"
        >
          <h3 class="lhai-partner-dash__unsupported-title" id="partnerDashboardUnsupportedTitle" data-i18n="partner.dashboard.unsupported.title">Cannot display dashboard</h3>
          <p class="u-text-muted lhai-partner-dash__unsupported-body" id="partnerDashboardUnsupportedBody"></p>
        </div>

        <div id="partnerTableAssignedWrap" class="lhai-assigned-dashboard">
          <div id="partnerAssignedCardsRoot" class="lhai-partner-dash__assigned-root lhai-assigned-dashboard__list" hidden>
            <section class="lhai-partner-dash__subsection" aria-labelledby="partnerAssignedInProgressHeading">
              <h3 class="lhai-partner-dash__subsection-title" id="partnerAssignedInProgressHeading" data-i18n="partner.dashboard.subsection.in_progress">In progress</h3>
              <p class="u-text-muted lhai-partner-dash__section-empty" id="partnerAssignedInProgressEmpty" hidden></p>
              <div id="partnerAssignedInProgressCards" class="lhai-partner-dash__card-list"></div>
            </section>
            <section class="lhai-partner-dash__subsection lhai-partner-dash__subsection--completed" aria-labelledby="partnerAssignedCompletedHeading">
              <h3 class="lhai-partner-dash__subsection-title" id="partnerAssignedCompletedHeading" data-i18n="partner.dashboard.subsection.completed">Completed</h3>
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
    title: "Partner dashboard",
    titleI18nKey: "partner.dashboard.title",
    titleId: "partnerDashboardTitle",
    subtitleId: "partnerDashboardSubtitle",
    subtitle: "",
    bodyHtml,
  });
}
