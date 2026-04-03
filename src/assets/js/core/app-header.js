/**
 * 앱 상단 헤더(브랜드 · 메시지함 · 계정 메뉴) 단일 포맷.
 * HTML에는 `#lhai-app-header-root`만 두고, 역할·경로에 따라 브랜드/내 정보 링크만 바뀝니다.
 * 마운트 직후: 배지·계정 메뉴·로그아웃 버튼 연결.
 */
import { canAccessAdminShell } from "./role-tiers.js";
import { t } from "./i18n-client.js";
import { applyI18nToDom, initCommonI18nAndApplyDom } from "./i18n-dom.js";
import { syncHeaderRoleBadge } from "./role-header-badge.js";
import { initAccountMenus } from "./admin-user-menu.js";
import { initLogoutButtons } from "./logout-button.js";
import { getAccessToken, getSession } from "./auth.js";

/** app-header만 로드될 때도 구버전 auth.js(export 없음)와 호환되도록 getSession 기반으로 계산합니다. */
function messagingCustomerProfileId() {
  const s = getSession();
  const email = (s?.email || "").trim().toLowerCase();
  if (email) return `profile::${email}`;
  const uid = s?.userId != null ? String(s.userId).trim() : "";
  if (uid) return uid;
  return "profile::demo@customer.com";
}
import { messagesApi } from "./api.js";

const MAIL_ICON_SVG = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
  <rect x="2" y="4" width="20" height="16" rx="2" ry="2" />
  <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
</svg>
`.trim();

/**
 * @returns {{ brand: string, profileHref: string, passwordHref: string, messagesIsCurrent: boolean, adminShell: boolean }}
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
    brand: adminShell
      ? t("common.header.brand.admin", "Landing Help AI 관리")
      : t("common.header.brand.customer", "Landing Help AI"),
    profileHref: adminShell ? "admin-profile.html" : "profile.html",
    passwordHref: adminShell ? "admin-password.html" : "password.html",
    messagesIsCurrent: (window.location.pathname.split("/").pop() || "") === "messages.html",
    adminShell,
  };
}

const HEADER_MAIL_BADGE_POLL_MS = 45_000;
const HEADER_MESSAGES_CHANGED = "lhai:messages-changed";

/**
 * 고객: 읽지 않은 메시지 건수. 운영자 셸: 온보딩 스레드 중 고객 측 미읽음 스레드 수.
 * @returns {Promise<number>}
 */
async function fetchHeaderUnreadMessageCount() {
  if (!getAccessToken()) return 0;
  const { adminShell } = resolveAppHeaderShell();
  try {
    if (adminShell) {
      const threads = await messagesApi.listOperatorOnboardingThreads();
      if (!Array.isArray(threads)) return 0;
      return threads.filter((row) => Boolean(row?.unread)).length;
    }
    const list = await messagesApi.list({
      customerProfileId: messagingCustomerProfileId(),
      unreadOnly: true,
    });
    return Array.isArray(list) ? list.length : 0;
  } catch {
    return 0;
  }
}

function applyHeaderMailUnreadBadge(count) {
  const badge = document.querySelector("#lhai-header-mail-unread");
  const link = document.querySelector("#lhai-header-messages-link");
  if (!badge || !link) return;
  const n = Math.max(0, Number(count) || 0);
  const baseLabel = t("common.header.messages", "메시지함");
  if (n <= 0) {
    badge.hidden = true;
    badge.textContent = "";
    badge.removeAttribute("aria-label");
    link.setAttribute("aria-label", baseLabel);
    link.removeAttribute("title");
    return;
  }
  const shown = n > 99 ? "99+" : String(n);
  badge.hidden = false;
  badge.textContent = shown;
  const unreadHint = t("common.header.messages_unread_suffix", "읽지 않음");
  badge.setAttribute("aria-label", t("common.header.messages_unread_badge", `새 메시지 ${n}건`));
  link.setAttribute("aria-label", `${baseLabel} · ${unreadHint} ${shown}`);
  link.setAttribute("title", `${baseLabel} · ${unreadHint} ${shown}`);
}

export async function refreshHeaderMailUnreadBadge() {
  const count = await fetchHeaderUnreadMessageCount();
  applyHeaderMailUnreadBadge(count);
}

let headerMailBadgePollId = 0;
let headerMailBadgeListenersWired = false;

function startHeaderMailBadgePolling() {
  if (headerMailBadgePollId) return;
  headerMailBadgePollId = window.setInterval(() => {
    void refreshHeaderMailUnreadBadge();
  }, HEADER_MAIL_BADGE_POLL_MS);
}

function wireHeaderMailBadgeListeners() {
  if (headerMailBadgeListenersWired) return;
  headerMailBadgeListenersWired = true;
  window.addEventListener(HEADER_MESSAGES_CHANGED, () => {
    void refreshHeaderMailUnreadBadge();
  });
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") void refreshHeaderMailUnreadBadge();
  });
}

/**
 * @param {string} [rootSelector]
 */
export function mountAppHeader(rootSelector = "#lhai-app-header-root") {
  return mountAppHeaderAsync(rootSelector);
}

async function mountAppHeaderAsync(rootSelector = "#lhai-app-header-root") {
  const root = document.querySelector(rootSelector);
  if (!root) return;

  // i18n API가 느리거나 응답이 없어도 상단바가 비어 보이지 않도록, 먼저 DOM을 채운 뒤 번역을 불러옵니다.
  const { brand, profileHref, passwordHref, messagesIsCurrent } = resolveAppHeaderShell();
  const currentAttr = messagesIsCurrent ? ' aria-current="page"' : "";

  root.innerHTML = `
<header class="lhai-topbar" role="banner">
  <div class="lhai-brand">${brand}</div>
  <div class="lhai-topbar__right">
    <a class="lhai-topbar-mail" id="lhai-header-messages-link" href="messages.html" data-i18n-title="common.header.messages" data-i18n-aria-label="common.header.messages" title="메시지함" aria-label="메시지함"${currentAttr}>
      ${MAIL_ICON_SVG}
      <span id="lhai-header-mail-unread" class="lhai-topbar-mail__badge" role="status" aria-live="polite" hidden></span>
    </a>
    <div class="lhai-user-menu" data-lhai-account-menu>
      <button type="button" class="lhai-user-menu__trigger" aria-expanded="false" aria-haspopup="menu">
        <span id="lhai-header-role-badge" class="lhai-badge" aria-live="polite"></span>
        <span class="lhai-user-menu__chevron" aria-hidden="true">▾</span>
      </button>
      <div class="lhai-user-menu__panel" role="menu" aria-orientation="vertical" hidden>
        <a class="lhai-user-menu__item" role="menuitem" href="${profileHref}" data-i18n="common.header.menu.profile">내 정보</a>
        <a class="lhai-user-menu__item" role="menuitem" href="${passwordHref}" data-i18n="common.header.menu.password">비밀번호 변경</a>
        <button type="button" class="lhai-user-menu__item lhai-user-menu__item--button" role="menuitem" data-lhai-logout data-i18n="common.header.menu.logout">로그아웃</button>
      </div>
    </div>
  </div>
</header>
`.trim();

  try {
    await initCommonI18nAndApplyDom(document);
    applyI18nToDom(root);
    const brandEl = root.querySelector(".lhai-brand");
    if (brandEl) brandEl.textContent = resolveAppHeaderShell().brand;
  } catch {
    // 번역 로드 실패 시에도 위에서 넣은 기본 문구·연결로 동작 유지
  }

  // 헤더가 비동기로 그려지므로, 배지·계정 메뉴는 마운트 직후에만 확실히 연결됨
  syncHeaderRoleBadge();
  initAccountMenus(root);
  initLogoutButtons(root);
  wireHeaderMailBadgeListeners();
  void refreshHeaderMailUnreadBadge();
  startHeaderMailBadgePolling();
}

void mountAppHeaderAsync().catch((err) => {
  console.error("[lhai] app-header mount failed", err);
});
