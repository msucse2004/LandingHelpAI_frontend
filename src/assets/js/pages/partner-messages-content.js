/**
 * Messages inbox content for partner shell (filters hidden by messages.js CSS).
 * @param {{ partner?: boolean }} [opts]
 */
import { renderPartnerPageContentHtml } from "../layouts/partner-page-layout.js";

export function renderPartnerMessagesContentHtml(opts = {}) {
  const partner = opts.partner !== false;
  const subtitle = partner
    ? "고객과의 서비스 대화를 확인하고 회신할 수 있습니다."
    : "고객센터(전역 지원)와 서비스별 대화가 구분되어 표시됩니다. 각 서비스 스레드에서 진행 상황과 담당 방식(AI·운영·시스템)을 확인할 수 있습니다.";

  const bodyHtml = `<section class="lhai-card lhai-message-filters">
        <label class="lhai-field">
          <span class="lhai-label">구분</span>
          <select id="messageCategoryFilter">
            <option value="">전체</option>
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
          <span>읽지 않음만</span>
        </label>
      </section>
      <section class="lhai-grid lhai-grid--2">
        <article class="lhai-card">
          <h2 class="lhai-card__title">대화 목록</h2>
          <p class="u-text-muted lhai-thread-list-hint">고객센터는 계정당 하나이며, 결제·계약이 있는 서비스마다 별도 스레드가 열릴 수 있습니다.</p>
          <div id="messageListContainer" class="lhai-message-list"></div>
        </article>
        <article class="lhai-card">
          <h2 class="lhai-card__title">대화</h2>
          <div id="messageDetailContainer" class="lhai-message-detail lhai-state lhai-state--empty">왼쪽에서 대화를 선택하세요.</div>
        </article>
      </section>`;

  return renderPartnerPageContentHtml({
    title: "메시지함",
    subtitle,
    bodyHtml,
  });
}

/** Customer/admin messages page uses the same structure with default subtitle. */
export function renderCustomerMessagesContentHtml() {
  return renderPartnerMessagesContentHtml({ partner: false });
}
