/**
 * 앱 상단 헤더(브랜드 · 메시지함 · 계정 메뉴) 단일 포맷.
 * HTML에는 `#lhai-app-header-root`만 두고, 역할·경로에 따라 브랜드/내 정보 링크만 바뀝니다.
 * 계정 표시는 admin-user-menu 로드 후 syncHeaderRoleBadge()가 채웁니다.
 */
import { canAccessAdminShell } from "./role-tiers.js";

const MAIL_ICON_SVG = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
  <rect x="2" y="4" width="20" height="16" rx="2" ry="2" />
  <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
</svg>
`.trim();

/**
 * @returns {{ brand: string, profileHref: string, passwordHref: string, messagesIsCurrent: boolean }}
 */
export function resolveAppHeaderShell() {
  const path = window.location.pathname.split("/").pop() || "";
  const override = document.body?.getAttribute("data-lhai-shell")?.trim().toLowerCase();

  let adminShell = false;
  if (override === "admin") {
    adminShell = true;
  } else if (override === "customer") {
    adminShell = false;
  } else {
    const isAdminFilename = path.startsWith("admin-");
    const isMessages = path === "messages.html";
    const adminOnMessages = isMessages && canAccessAdminShell();
    adminShell = isAdminFilename || adminOnMessages;
  }

  return {
    brand: adminShell ? "Landing Help AI Admin" : "Landing Help AI",
    profileHref: adminShell ? "admin-profile.html" : "profile.html",
    passwordHref: adminShell ? "admin-password.html" : "password.html",
    messagesIsCurrent: (window.location.pathname.split("/").pop() || "") === "messages.html",
  };
}

/**
 * @param {string} [rootSelector]
 */
export function mountAppHeader(rootSelector = "#lhai-app-header-root") {
  const root = document.querySelector(rootSelector);
  if (!root) return;

  const { brand, profileHref, passwordHref, messagesIsCurrent } = resolveAppHeaderShell();
  const currentAttr = messagesIsCurrent ? ' aria-current="page"' : "";

  root.innerHTML = `
<header class="lhai-topbar" role="banner">
  <div class="lhai-brand">${brand}</div>
  <div class="lhai-topbar__right">
    <a class="lhai-topbar-mail" href="messages.html" title="메시지함" aria-label="메시지함"${currentAttr}>
      ${MAIL_ICON_SVG}
    </a>
    <div class="lhai-user-menu" data-lhai-account-menu>
      <button type="button" class="lhai-user-menu__trigger" aria-expanded="false" aria-haspopup="menu">
        <span id="lhai-header-role-badge" class="lhai-badge" aria-live="polite"></span>
        <span class="lhai-user-menu__chevron" aria-hidden="true">▾</span>
      </button>
      <div class="lhai-user-menu__panel" role="menu" aria-orientation="vertical" hidden>
        <a class="lhai-user-menu__item" role="menuitem" href="${profileHref}">내 정보</a>
        <a class="lhai-user-menu__item" role="menuitem" href="${passwordHref}">비밀번호 변경</a>
        <button type="button" class="lhai-user-menu__item lhai-user-menu__item--button" role="menuitem" data-lhai-logout>로그아웃</button>
      </div>
    </div>
  </div>
</header>
`.trim();
}

mountAppHeader();
