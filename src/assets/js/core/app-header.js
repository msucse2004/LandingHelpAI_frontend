/**
 * 앱 상단 헤더(브랜드 · 메시지함 · 계정 메뉴) 단일 포맷.
 * HTML에는 `#lhai-app-header-root`만 두고, 역할·경로에 따라 브랜드/내 정보 링크만 바뀝니다.
 * 마운트 직후: 배지·계정 메뉴·로그아웃 버튼 연결.
 * 미읽음이 증가하면 고객·운영자·파트너 공통으로 ``lhai-message-toast``(청구서 도착 알림과 동일 스타일)를 띄웁니다.
 */
import { canAccessAdminShell } from "./role-tiers.js";
import { t } from "./i18n-client.js";
import { applyI18nToDom, initCommonI18nAndApplyDom } from "./i18n-dom.js";
import { syncHeaderRoleBadge } from "./role-header-badge.js";
import { initAccountMenus } from "./admin-user-menu.js";
import { initLogoutButtons } from "./logout-button.js";
import { getAccessToken, getCurrentRole, getCustomerMessagingProfileId } from "./auth.js";
import { messagesApi, partnerThreadsApi } from "./api.js";
import { startRealtimeClient, subscribeRealtimeEvents, getRealtimeStatus, realtimeDebugLive } from "./realtime-client.js";
import { ROLES } from "./config.js";

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

const HEADER_MAIL_BADGE_POLL_MS = 10_000;
/** SSE 연결 시 배지 폴링(안전망) 주기. */
const HEADER_MAIL_BADGE_POLL_MS_SSE = 15_000;
const HEADER_MESSAGES_CHANGED = "lhai:messages-changed";
/** 직전 폴링·갱신 시점의 미읽음 수(고객·운영자·파트너 공통). 증가 시 토스트 표시. */
let lastHeaderMailUnreadCount = null;

let headerMailBadgePollTimer = null;
let headerMailBadgePollMs = HEADER_MAIL_BADGE_POLL_MS;

const REALTIME_TOAST_DEDUPE_MS = 10_000;
const recentRealtimeMessageToasts = new Map();

/** 폴링 경로 ``showNewMessageArrivalToast``가 realtime 인박스 토스트 직후 중복되지 않도록 합니다. */
let lastRealtimeInboxToastWallMs = 0;
const POLLING_TOAST_AFTER_REALTIME_MS = 15_000;

let headerRealtimeUnsub = null;
let headerRealtimeStatusWired = false;

function pruneRealtimeToastDedupe() {
  const now = Date.now();
  for (const [k, ts] of recentRealtimeMessageToasts) {
    if (now - ts > REALTIME_TOAST_DEDUPE_MS) recentRealtimeMessageToasts.delete(k);
  }
}

/** 최근 창 안에 동일 ``message_id`` 토스트가 있으면 false. 성공 시 슬롯을 잡습니다. */
function tryAcquireRealtimeToastSlot(messageId) {
  if (!messageId) return true;
  pruneRealtimeToastDedupe();
  const t = recentRealtimeMessageToasts.get(messageId);
  if (t != null && Date.now() - t < REALTIME_TOAST_DEDUPE_MS) return false;
  recentRealtimeMessageToasts.set(messageId, Date.now());
  return true;
}

function isMessagesHtmlPage() {
  try {
    const shell = resolveAppHeaderShell();
    if (shell.messagesIsCurrent) return true;
    const p = String(window.location?.pathname || "");
    return p.includes("messages.html");
  } catch {
    return false;
  }
}

function isOwnRealtimeActor(actorTypeRaw) {
  const shell = resolveAppHeaderShell();
  if (shell.adminShell) return false;
  const role = getCurrentRole();
  const a = String(actorTypeRaw || "").trim().toUpperCase();
  if (role === ROLES.PARTNER) return a === "PARTNER";
  return a === "CUSTOMER";
}

function rtDebug(...args) {
  if (!realtimeDebugLive()) return;
  try {
    console.info("[lhai][header-realtime]", ...args);
  } catch {
    /* ignore */
  }
}

function clearHeaderMailBadgePoll() {
  if (headerMailBadgePollTimer != null) {
    try {
      clearInterval(headerMailBadgePollTimer);
    } catch {
      /* ignore */
    }
    headerMailBadgePollTimer = null;
  }
}

function startHeaderMailBadgePoll() {
  clearHeaderMailBadgePoll();
  headerMailBadgePollTimer = setInterval(() => {
    void refreshHeaderMailUnreadBadgeWithPopup({
      suppressPopup: false,
    });
  }, headerMailBadgePollMs);
}

function setHeaderMailBadgePollIntervalMs(nextMs) {
  const ms = Math.max(5_000, Number(nextMs) || HEADER_MAIL_BADGE_POLL_MS);
  if (headerMailBadgePollMs === ms && headerMailBadgePollTimer != null) return;
  headerMailBadgePollMs = ms;
  startHeaderMailBadgePoll();
}

function onRealtimeStatus(ev) {
  const d = ev?.detail || getRealtimeStatus();
  const life = String(d?.lifecycle || "").trim();
  const connected = !!d?.connected;
  const fallback = !!d?.fallback;
  /** ``lifecycle`` 우선(Step 8), 없으면 기존 플래그로 추론 */
  const sseConnected = life === "connected" || (!life && connected && !fallback);
  if (sseConnected) {
    setHeaderMailBadgePollIntervalMs(HEADER_MAIL_BADGE_POLL_MS_SSE);
    rtDebug("realtime connected, polling reduced", HEADER_MAIL_BADGE_POLL_MS_SSE, "ms", d);
  } else {
    setHeaderMailBadgePollIntervalMs(HEADER_MAIL_BADGE_POLL_MS);
    rtDebug("realtime fallback, polling enabled", life || "(legacy)", HEADER_MAIL_BADGE_POLL_MS, "ms", d);
  }
}

/**
 * realtime 전용 인박스 토스트(폴링 ``showNewMessageArrivalToast``와 구분).
 * 제목·본문·CTA는 Step 5 요구사항 고정 문구(기본값) + i18n 키 확장.
 */
function showRealtimeInboxToast() {
  let root = document.querySelector("#lhai-message-toast-root");
  if (!(root instanceof HTMLElement)) {
    root = document.createElement("div");
    root.id = "lhai-message-toast-root";
    root.className = "lhai-message-toast-root";
    document.body.appendChild(root);
  }
  const title = escapeHtmlForToast(
    t("common.header.realtime_inbox_toast_title", "새 메시지가 도착했습니다"),
  );
  const body = escapeHtmlForToast(
    t("common.header.realtime_inbox_toast_body", "메시지함에서 확인해 주세요."),
  );
  const cta = escapeHtmlForToast(t("common.header.realtime_inbox_toast_cta", "메시지함 열기"));
  const closeLabel = escapeHtmlForToast(t("common.header.message_toast_close", "닫기"));
  const closeAria = escapeHtmlForToast(t("common.header.message_toast_close_aria", "알림 닫기"));
  root.innerHTML = `
    <div class="lhai-message-toast" role="status" aria-live="polite">
      <div class="lhai-message-toast__title">${title}</div>
      <div class="lhai-message-toast__body">${body}</div>
      <a class="lhai-message-toast__cta" href="messages.html">${cta}</a>
      <button type="button" class="lhai-message-toast__close" aria-label="${closeAria}">${closeLabel}</button>
    </div>
  `.trim();
  root.classList.add("is-visible");
  lastRealtimeInboxToastWallMs = Date.now();
  const close = root.querySelector(".lhai-message-toast__close");
  close?.addEventListener("click", () => {
    root?.classList.remove("is-visible");
    window.setTimeout(() => {
      if (root) root.innerHTML = "";
    }, 180);
  });
  window.setTimeout(() => {
    if (!root) return;
    root.classList.remove("is-visible");
    window.setTimeout(() => {
      if (root) root.innerHTML = "";
    }, 180);
  }, 12_000);
}

function wireHeaderRealtimeHandlers() {
  if (headerRealtimeUnsub) {
    try {
      headerRealtimeUnsub();
    } catch {
      /* ignore */
    }
    headerRealtimeUnsub = null;
  }

  headerRealtimeUnsub = subscribeRealtimeEvents((event) => {
    void (async () => {
      const type = String(event?.type || "").trim();
      const data = event?.data && typeof event.data === "object" ? event.data : {};
      const payload = data.payload && typeof data.payload === "object" ? data.payload : {};
      const messageId = data.message_id ?? payload.message_id ?? null;
      const actorType = payload.actor_type ?? data.actor_type ?? null;
      const threadRaw = data.thread_id ?? payload.thread_id ?? null;
      const threadId = threadRaw != null && threadRaw !== "" ? String(threadRaw) : null;

      rtDebug("event received", {
        type,
        messageId,
        actorType,
        threadId,
      });

      // unread.changed: 배지만 갱신(토스트는 message.created 전용 — messages.html 포함).
      if (type === "message.created" || type === "unread.changed") {
        rtDebug("badge refresh", type, "reason: realtime event → suppressPopup true");
        await refreshHeaderMailUnreadBadgeWithPopup({ suppressPopup: true });
      } else if (type === "thread.updated") {
        rtDebug("badge refresh", type, "reason: thread.updated (optional) → suppressPopup true");
        await refreshHeaderMailUnreadBadgeWithPopup({ suppressPopup: true });
      }

      if (type !== "message.created") return;

      if (isMessagesHtmlPage()) {
        rtDebug("toast suppressed reason: messages page", { messageId });
        return;
      }
      if (typeof document !== "undefined" && document.visibilityState !== "visible") {
        rtDebug("toast suppressed reason: document not visible", { messageId });
        return;
      }
      if (isOwnRealtimeActor(actorType)) {
        rtDebug("toast suppressed reason: own actor", { actorType });
        return;
      }
      if (!tryAcquireRealtimeToastSlot(messageId)) {
        rtDebug("toast suppressed reason: duplicate", { messageId });
        return;
      }

      rtDebug("toast shown", { messageId, actorType });
      showRealtimeInboxToast();
    })();
  });

  if (!headerRealtimeStatusWired) {
    headerRealtimeStatusWired = true;
    window.addEventListener("lhai:realtime-status", onRealtimeStatus);
  }
  onRealtimeStatus({ detail: getRealtimeStatus() });
}

/**
 * 고객: 스레드별 ``unread_count`` 합(미읽음 메시지 수에 가깝게). 파트너: 파트너 스레드 목록 기준 미읽음 합산.
 * @returns {Promise<number>}
 */
async function fetchHeaderUnreadMessageCount() {
  if (!getAccessToken()) return 0;

  const role = getCurrentRole();
  const { adminShell } = resolveAppHeaderShell();

  try {
    if (adminShell) {
      const threads = await messagesApi.listOperatorOnboardingThreads();
      return Array.isArray(threads) ? threads.filter((row) => Boolean(row?.unread)).length : 0;
    }

    if (role === ROLES.PARTNER) {
      const threads = await partnerThreadsApi.listThreads();
      if (!Array.isArray(threads)) return 0;

      return threads.reduce((sum, row) => {
        const n = Number(row?.unread_count ?? row?.partner_unread_count ?? 0);
        if (Number.isFinite(n) && n > 0) return sum + n;
        if (row?.has_unread_customer_message) return sum + 1;
        if (row?.unread) return sum + 1;
        return sum;
      }, 0);
    }

    const threads = await messagesApi.listThreads({
      customerProfileId: getCustomerMessagingProfileId(),
      unreadOnly: true,
    });
    if (!Array.isArray(threads)) return 0;
    return threads.reduce((sum, row) => {
      const n = Number(row?.unread_count ?? 0);
      if (Number.isFinite(n) && n > 0) return sum + n;
      if (row?.unread) return sum + 1;
      return sum;
    }, 0);
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
  return refreshHeaderMailUnreadBadgeWithPopup();
}

function escapeHtmlForToast(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * 견적 승인 후 청구서 안내 등과 동일한 ``lhai-message-toast`` 포맷.
 * 고객·파트너·운영자(관리) 셸 모두에서 미읽음이 늘었을 때 표시합니다.
 */
function showNewMessageArrivalToast(count) {
  let root = document.querySelector("#lhai-message-toast-root");
  if (!(root instanceof HTMLElement)) {
    root = document.createElement("div");
    root.id = "lhai-message-toast-root";
    root.className = "lhai-message-toast-root";
    document.body.appendChild(root);
  }
  const shown = count > 99 ? "99+" : String(Math.max(1, count));
  const title = escapeHtmlForToast(t("common.header.message_toast_title", "새 메시지가 도착했습니다"));
  const body = escapeHtmlForToast(
    t("common.header.message_toast_body", "읽지 않은 메시지 {count}건이 있습니다.").replace(/\{count\}/g, shown)
  );
  const cta = escapeHtmlForToast(t("common.header.message_toast_cta", "메시지함으로 이동"));
  const closeLabel = escapeHtmlForToast(t("common.header.message_toast_close", "닫기"));
  const closeAria = escapeHtmlForToast(t("common.header.message_toast_close_aria", "알림 닫기"));
  root.innerHTML = `
    <div class="lhai-message-toast" role="status" aria-live="polite">
      <div class="lhai-message-toast__title">${title}</div>
      <div class="lhai-message-toast__body">${body}</div>
      <a class="lhai-message-toast__cta" href="messages.html">${cta}</a>
      <button type="button" class="lhai-message-toast__close" aria-label="${closeAria}">${closeLabel}</button>
    </div>
  `.trim();
  root.classList.add("is-visible");
  const close = root.querySelector(".lhai-message-toast__close");
  close?.addEventListener("click", () => {
    root?.classList.remove("is-visible");
    window.setTimeout(() => {
      if (root) root.innerHTML = "";
    }, 180);
  });
  window.setTimeout(() => {
    if (!root) return;
    root.classList.remove("is-visible");
    window.setTimeout(() => {
      if (root) root.innerHTML = "";
    }, 180);
  }, 6000);
}

async function refreshHeaderMailUnreadBadgeWithPopup({ suppressPopup = false } = {}) {
  const prev = lastHeaderMailUnreadCount;
  const count = await fetchHeaderUnreadMessageCount();
  applyHeaderMailUnreadBadge(count);
  if (realtimeDebugLive()) {
    rtDebug("polling count old/new", { old: prev, new: count });
  }
  const isVisible = document.visibilityState === "visible";
  if (
    !suppressPopup &&
    typeof prev === "number" &&
    count > prev &&
    isVisible
  ) {
    if (Date.now() - lastRealtimeInboxToastWallMs < POLLING_TOAST_AFTER_REALTIME_MS) {
      rtDebug("polling toast suppressed reason: recent realtime inbox toast wall", {
        old: prev,
        new: count,
      });
    } else {
      rtDebug("polling toast shown", { old: prev, new: count });
      showNewMessageArrivalToast(count);
    }
  } else if (realtimeDebugLive() && !suppressPopup && typeof prev === "number" && count > prev && !isVisible) {
    rtDebug("polling toast suppressed reason: document not visible", { old: prev, new: count });
  } else if (realtimeDebugLive() && suppressPopup) {
    rtDebug("polling toast skipped: suppressPopup=true", { old: prev, new: count });
  }
  lastHeaderMailUnreadCount = count;
  return count;
}

let headerMailBadgeListenersWired = false;

function wireHeaderMailBadgeListeners() {
  if (headerMailBadgeListenersWired) return;
  headerMailBadgeListenersWired = true;
  window.addEventListener(HEADER_MESSAGES_CHANGED, () => {
    void refreshHeaderMailUnreadBadgeWithPopup({
      suppressPopup: false,
    });
  });
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      void refreshHeaderMailUnreadBadgeWithPopup({
        suppressPopup: false,
      });
    }
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
  wireHeaderRealtimeHandlers();
  void refreshHeaderMailUnreadBadgeWithPopup({ suppressPopup: true });
  if (getAccessToken()) {
    try {
      startRealtimeClient();
    } catch (e) {
      console.error("[lhai] realtime client start failed", e);
    }
  }
}

void mountAppHeaderAsync().catch((err) => {
  console.error("[lhai] app-header mount failed", err);
});
