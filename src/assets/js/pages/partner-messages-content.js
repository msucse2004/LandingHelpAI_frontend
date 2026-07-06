/**
 * Messages inbox content for partner shell (filters hidden by messages.js CSS).
 * @param {{ partner?: boolean }} [opts]
 */
import { renderPartnerPageContentHtml } from "../layouts/partner-page-layout.js";

export function renderPartnerMessagesContentHtml(opts = {}) {
  const partner = opts.partner !== false;

  const bodyHtml = `<section class="lhai-card lhai-message-filters">
        <label class="lhai-field">
          <span class="lhai-label" data-i18n="messages.filters.category_label" data-i18n-default="Type">Type</span>
          <select id="messageCategoryFilter">
            <option value="" data-i18n="messages.filters.all" data-i18n-default="All">All</option>
            <option value="SYSTEM">SYSTEM</option>
            <option value="ADMIN">ADMIN</option>
            <option value="AI">AI</option>
            <option value="PAYMENT">PAYMENT</option>
            <option value="DOCUMENT">DOCUMENT</option>
            <option value="CHAT">CHAT</option>
          </select>
        </label>
        <label class="lhai-checkbox">
          <input id="messageUnreadOnly" type="checkbox" />
          <span data-i18n="messages.filters.unread_only" data-i18n-default="Unread only">Unread only</span>
        </label>
      </section>
      <section class="lhai-grid lhai-grid--2">
        <article class="lhai-card">
          <h2 class="lhai-card__title" data-i18n="messages.list.panel_title" data-i18n-default="Conversations">Conversations</h2>
          <p class="u-text-muted lhai-thread-list-hint" data-i18n="messages.list.hint" data-i18n-default="Each account has one customer center. Separate threads may open for each paid service or contract.">Each account has one customer center. Separate threads may open for each paid service or contract.</p>
          <div id="messageListContainer" class="lhai-message-list"></div>
        </article>
        <article class="lhai-card">
          <h2 class="lhai-card__title" data-i18n="messages.detail.panel_title" data-i18n-default="Conversation">Conversation</h2>
          <div id="messageDetailContainer" class="lhai-message-detail lhai-state lhai-state--empty" data-i18n="messages.detail.select_thread" data-i18n-default="Select a conversation on the left.">Select a conversation on the left.</div>
        </article>
      </section>`;

  return renderPartnerPageContentHtml({
    title: "Messages",
    titleI18nKey: "messages.title",
    subtitle: partner
      ? "Review assigned customer service threads and chat with customers."
      : "Customer center (global) and service conversations are separated. In service threads you can see contract context and handler mode (AI, operations, or system).",
    subtitleI18nKey: partner ? "messages.page.subtitle.partner" : "messages.page.subtitle.customer",
    bodyHtml,
  });
}

/** Customer/admin messages page uses the same structure with default subtitle. */
export function renderCustomerMessagesContentHtml() {
  return renderPartnerMessagesContentHtml({ partner: false });
}
