import { partnerNavHref } from "../config/partner-nav-config.js";
import { renderPartnerPageContentHtml } from "../layouts/partner-page-layout.js";

/** Partner bid request detail page content (shell slot). */
export function renderPartnerBidRequestContentHtml() {
  const listHref = partnerNavHref("bid_requests");
  const eyebrowHtml = `<p class="lhai-partner-page__back"><a class="lhai-link" href="${listHref}" data-i18n="partner.bid.back_to_list">← Back to request list</a></p>`;

  const bodyHtml = `<div class="lhai-par-bid__error-panel" id="partnerBidError" role="alert" hidden></div>
      <div class="lhai-par-bid__loading-panel" id="partnerBidLoading" aria-live="polite">
        <p class="lhai-par-bid__loading-text" data-i18n="partner.bid.loading">Loading…</p>
      </div>
      <div id="partnerBidMain" hidden>
        <div id="partnerBidCountdownBanner" class="lhai-par-bid__countdown" hidden role="status"></div>
        <div id="partnerBidCarRoot" hidden></div>
        <div id="partnerBidProductRoot" hidden></div>
      </div>`;

  return renderPartnerPageContentHtml({
    title: "Bid request",
    titleI18nKey: "partner.bid.shell_title",
    titleId: "partnerBidPageTitle",
    subtitleId: "partnerBidPageSubtitle",
    subtitle: "",
    eyebrowHtml,
    bodyHtml,
    pageClass: "lhai-partner-page--detail",
  });
}
