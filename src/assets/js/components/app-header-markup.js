/**
 * Shared app topbar HTML (customer · partner · admin shells).
 * @module components/app-header-markup
 */

export const APP_HEADER_MAIL_ICON_SVG = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
  <rect x="2" y="4" width="20" height="16" rx="2" ry="2" />
  <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
</svg>
`.trim();

/** Stable mount target for the global language dropdown (see language-switcher.js). */
export const TOPBAR_LANGUAGE_SLOT_ID = "lhai-topbar-language-slot";

/**
 * @param {{
 *   brand: string,
 *   profileHref: string,
 *   passwordHref: string,
 *   messagesHref: string,
 *   messagesIsCurrent?: boolean,
 * }} shell
 * @returns {string}
 */
export function renderAppHeaderMarkup(shell) {
  const currentAttr = shell.messagesIsCurrent ? ' aria-current="page"' : "";
  return `
<header class="lhai-topbar" role="banner">
  <div class="lhai-brand">${shell.brand}</div>
  <div class="lhai-topbar__right">
    <div class="lhai-topbar__actions" id="lhai-topbar-actions">
      <div class="lhai-topbar__language-slot" id="${TOPBAR_LANGUAGE_SLOT_ID}" data-lhai-topbar-language-slot></div>
      <a class="lhai-topbar-mail" id="lhai-header-messages-link" href="${shell.messagesHref}" data-i18n-title="common.header.messages" data-i18n-aria-label="common.header.messages" title="메시지함" aria-label="메시지함"${currentAttr}>
        ${APP_HEADER_MAIL_ICON_SVG}
        <span id="lhai-header-mail-unread" class="lhai-topbar-mail__badge" role="status" aria-live="polite" hidden></span>
      </a>
      <div class="lhai-user-menu" data-lhai-account-menu>
        <button type="button" class="lhai-user-menu__trigger" aria-expanded="false" aria-haspopup="menu">
          <span id="lhai-header-role-badge" class="lhai-badge" aria-live="polite"></span>
          <span class="lhai-user-menu__chevron" aria-hidden="true">▾</span>
        </button>
        <div class="lhai-user-menu__panel" role="menu" aria-orientation="vertical" hidden>
          <a class="lhai-user-menu__item" role="menuitem" href="${shell.profileHref}" data-i18n="common.header.menu.profile">내 정보</a>
          <a class="lhai-user-menu__item" role="menuitem" href="${shell.passwordHref}" data-i18n="common.header.menu.password">비밀번호 변경</a>
          <button type="button" class="lhai-user-menu__item lhai-user-menu__item--button" role="menuitem" data-lhai-logout data-i18n="common.header.menu.logout">로그아웃</button>
        </div>
      </div>
    </div>
  </div>
</header>
`.trim();
}
