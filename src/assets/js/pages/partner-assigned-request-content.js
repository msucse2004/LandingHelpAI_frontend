import { partnerNavHref } from "../config/partner-nav-config.js";
import { renderPartnerPageContentHtml } from "../layouts/partner-page-layout.js";

/** Partner assigned request detail page content (shell slot). */
export function renderPartnerAssignedRequestContentHtml() {
  const listHref = partnerNavHref("bid_requests");
  const eyebrowHtml = `<p class="lhai-partner-page__back"><a class="lhai-link" href="${listHref}" data-i18n="partner.assigned.back_to_list">← Back to request list</a></p>`;

  const bodyHtml = `<p class="lhai-help lhai-par-detail__error" id="partnerAssignedError" role="alert" hidden></p>

      <div id="partnerAssignedContent" hidden>
        <section class="lhai-card lhai-par-detail__hero" data-i18n-aria-label="partner.assigned.hero.aria" aria-label="Summary">
          <div class="lhai-par-detail__hero-grid">
            <div>
              <h2 class="lhai-card__title lhai-par-detail__hero-label" data-i18n="partner.assigned.hero.service_name">Service</h2>
              <p class="lhai-par-detail__hero-value" id="partnerAssignedServiceName">—</p>
            </div>
            <div>
              <h2 class="lhai-card__title lhai-par-detail__hero-label" data-i18n="partner.assigned.hero.status">Status</h2>
              <p class="lhai-par-detail__hero-value" id="partnerAssignedStatus">—</p>
            </div>
            <div>
              <h2 class="lhai-card__title lhai-par-detail__hero-label" data-i18n="partner.assigned.hero.submitted_at">Submitted</h2>
              <p class="lhai-par-detail__hero-value" id="partnerAssignedSubmittedAt">—</p>
            </div>
          </div>
        </section>

        <section class="lhai-card" aria-labelledby="partnerAssignedCustomerHeading">
          <h2 class="lhai-card__title" id="partnerAssignedCustomerHeading" data-i18n="partner.assigned.customer_heading">Customer profile</h2>
          <dl class="lhai-par-detail__dl">
            <div><dt data-i18n="partner.assigned.field.name">Name</dt><dd id="partnerAssignedCustName">—</dd></div>
            <div><dt data-i18n="partner.assigned.field.email">Email</dt><dd id="partnerAssignedCustEmail">—</dd></div>
            <div><dt data-i18n="partner.assigned.field.dob">Date of birth</dt><dd id="partnerAssignedCustDob">—</dd></div>
            <div><dt data-i18n="partner.assigned.field.gender">Gender</dt><dd id="partnerAssignedCustGender">—</dd></div>
          </dl>
        </section>

        <section class="lhai-card" aria-labelledby="partnerAssignedServiceHeading">
          <h2 class="lhai-card__title" id="partnerAssignedServiceHeading" data-i18n="partner.assigned.service_heading">Service information</h2>
          <dl class="lhai-par-detail__dl">
            <div><dt data-i18n="partner.assigned.field.service_name">Service</dt><dd id="partnerAssignedSvcName">—</dd></div>
            <div><dt data-i18n="partner.assigned.field.payment_status">Payment status</dt><dd id="partnerAssignedSvcPaid">—</dd></div>
            <div><dt data-i18n="partner.assigned.field.current_status">Current status</dt><dd id="partnerAssignedSvcStatus">—</dd></div>
          </dl>
        </section>

        <section class="lhai-card" aria-labelledby="partnerAssignedIntakeHeading">
          <h2 class="lhai-card__title" id="partnerAssignedIntakeHeading" data-i18n="partner.assigned.intake_heading">Intake answers</h2>
          <div id="partnerAssignedIntakeBody" class="lhai-par-detail__intake"></div>
        </section>

        <section class="lhai-card" aria-labelledby="partnerAssignedChatHeading">
          <h2 class="lhai-card__title" id="partnerAssignedChatHeading" data-i18n="partner.assigned.chat_heading">Messages with customer</h2>
          <p class="u-text-muted lhai-par-detail__chat-hint" data-i18n="partner.assigned.chat_hint">Messages in this thread are visible to the customer and assigned partner.</p>
          <div class="lhai-par-detail__chat-scroll" id="partnerAssignedChatScroll" role="log" aria-live="polite"></div>
          <form class="lhai-par-detail__composer" id="partnerAssignedChatForm" autocomplete="off">
            <label class="u-sr-only" for="partnerAssignedChatInput" data-i18n="partner.assigned.chat.input_label">Message</label>
            <textarea id="partnerAssignedChatInput" class="lhai-par-detail__textarea" rows="3" data-i18n-placeholder="partner.assigned.chat.input_placeholder" placeholder="Type a message…" required></textarea>
            <div class="lhai-par-detail__composer-actions">
              <button type="submit" class="lhai-button lhai-button--primary" id="partnerAssignedSendBtn" data-i18n="partner.assigned.chat.send">Send</button>
            </div>
          </form>
          <p class="lhai-help lhai-par-detail__send-error" id="partnerAssignedSendError" role="alert" hidden></p>
        </section>
      </div>`;

  return renderPartnerPageContentHtml({
    title: "Assigned request detail",
    titleI18nKey: "partner.assigned.page_title",
    titleId: "partnerAssignedPageTitle",
    subtitleId: "partnerAssignedSubtitle",
    subtitle: "",
    eyebrowHtml,
    bodyHtml,
    pageClass: "lhai-partner-page--detail",
  });
}
