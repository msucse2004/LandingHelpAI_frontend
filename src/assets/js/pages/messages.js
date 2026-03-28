import { mountMessagesSidebar } from "../components/sidebar.js";
import { messagesApi } from "../core/api.js";
import { getSession } from "../core/auth.js";
import { ensureCustomerAccess, protectCurrentPage } from "../core/guards.js";
import { syncHeaderRoleBadge } from "../core/role-header-badge.js";
import { formatDate, safeText } from "../core/utils.js";

let customerProfileId = "profile::demo@customer.com";

let selectedThreadId = "";
/** @type {Array<Record<string, unknown>>} */
let currentThreadMessages = [];
let chatSendLocked = false;

/** @returns {string} optional initial thread id from URL */
function applyMessagesPageQuery() {
  const q = new URLSearchParams(window.location.search);
  const cp = (q.get("customer_profile_id") || q.get("customer") || "").trim();
  const tid = (q.get("thread_id") || q.get("thread") || "").trim();
  if (cp) customerProfileId = cp;
  return tid;
}

function isMineDirection(direction) {
  const d = String(direction || "").toUpperCase();
  return d === "INBOUND";
}

function renderThreadList(threads = []) {
  const container = document.querySelector("#messageListContainer");
  if (!container) return;
  if (!threads.length) {
    container.innerHTML = `<div class="lhai-state lhai-state--empty">대화가 없습니다.</div>`;
    return;
  }
  container.innerHTML = threads
    .map(
      (row) => `
      <article class="lhai-message-item ${row.unread ? "is-unread" : ""} ${selectedThreadId === row.thread_id ? "is-active" : ""}" data-thread-id="${safeText(row.thread_id)}">
        <div class="lhai-message-item__meta">
          <span class="lhai-badge">${safeText(row.message_type)}</span>
          <span class="u-text-muted">${formatDate(row.last_message_at)}</span>
        </div>
        <h3>${safeText(row.title)}</h3>
        <p class="u-text-muted lhai-message-item__preview">${safeText(row.preview)}</p>
      </article>
    `
    )
    .join("");
}

function scrollChatToBottom() {
  const wrap = document.querySelector("#messageChatScroll");
  if (wrap) wrap.scrollTop = wrap.scrollHeight;
}

function renderChatBubbles() {
  const stream = document.querySelector("#messageChatStream");
  if (!stream) return;
  if (!currentThreadMessages.length) {
    stream.innerHTML = `<div class="lhai-chat-empty">이 대화에 메시지가 없습니다.</div>`;
    return;
  }
  stream.innerHTML = currentThreadMessages
    .map((m) => {
      const mine = isMineDirection(m.direction);
      const bubbleClass = mine ? "lhai-chat-bubble--me" : "lhai-chat-bubble--them";
      const titleLine =
        !mine && m.title
          ? `<div class="lhai-chat-bubble__title">${safeText(m.title)}</div>`
          : "";
      return `
      <div class="lhai-chat-row ${mine ? "lhai-chat-row--mine" : "lhai-chat-row--them"}">
        <div class="lhai-chat-bubble ${bubbleClass}">
          ${titleLine}
          <p class="lhai-chat-bubble__body">${safeText(m.body)}</p>
          <time class="lhai-chat-bubble__time" datetime="${safeText(m.created_at)}">${formatDate(m.created_at)}</time>
        </div>
      </div>`;
    })
    .join("");
  requestAnimationFrame(() => scrollChatToBottom());
}

function setDetailHeader(title) {
  const el = document.querySelector("#messageChatTitle");
  if (el) el.textContent = title || "대화";
}

function renderMessageDetailShell() {
  const container = document.querySelector("#messageDetailContainer");
  if (!container) return;
  if (!selectedThreadId) {
    container.className = "lhai-message-detail lhai-state lhai-state--empty";
    container.innerHTML = "왼쪽에서 대화를 선택하세요.";
    return;
  }
  container.className = "lhai-message-detail lhai-message-detail--chat";
  container.innerHTML = `
    <div class="lhai-chat-header">
      <h3 id="messageChatTitle" class="lhai-chat-header__title">대화</h3>
    </div>
    <div id="messageChatScroll" class="lhai-chat-scroll" role="log" aria-live="polite">
      <div id="messageChatStream" class="lhai-chat-stream"></div>
    </div>
    <form id="messageChatForm" class="lhai-chat-composer" autocomplete="off">
      <label class="lhai-chat-composer__field">
        <textarea id="messageChatInput" class="lhai-chat-composer__input" rows="2" placeholder="메시지를 입력하세요" maxlength="4000" aria-label="메시지 입력"></textarea>
      </label>
      <button type="submit" class="lhai-button lhai-button--primary lhai-chat-composer__send">보내기</button>
    </form>
  `;
}

async function loadThreadMessages() {
  if (!selectedThreadId) {
    currentThreadMessages = [];
    return;
  }
  currentThreadMessages = await messagesApi.threadMessages(selectedThreadId, { customerProfileId });
  renderChatBubbles();
}

async function refresh() {
  const categoryFilter = document.querySelector("#messageCategoryFilter");
  const unreadOnlyFilter = document.querySelector("#messageUnreadOnly");
  const category = categoryFilter instanceof HTMLSelectElement ? categoryFilter.value : "";
  const unreadOnly = unreadOnlyFilter instanceof HTMLInputElement ? unreadOnlyFilter.checked : false;

  const threads = await messagesApi.listThreads({
    customerProfileId,
    category,
    unreadOnly,
  });
  if (!selectedThreadId && threads.length) {
    selectedThreadId = String(threads[0].thread_id);
  }
  if (selectedThreadId && !threads.some((t) => String(t.thread_id) === selectedThreadId)) {
    selectedThreadId = threads.length ? String(threads[0].thread_id) : "";
  }

  renderThreadList(threads);
  renderMessageDetailShell();
  const threadMeta = threads.find((t) => String(t.thread_id) === selectedThreadId);
  const headerTitle = threadMeta
    ? String(threadMeta.title)
    : selectedThreadId
      ? `[${customerProfileId}] 정착 서비스`
      : "";
  setDetailHeader(headerTitle);
  await loadThreadMessages();
}

/** @param {SubmitEvent} event */
async function onComposerSubmit(event) {
  event.preventDefault();
  if (!selectedThreadId || chatSendLocked) return;
  const input = document.querySelector("#messageChatInput");
  if (!(input instanceof HTMLTextAreaElement)) return;
  const text = input.value.trim();
  if (!text) return;
  input.value = "";
  chatSendLocked = true;
  try {
    await messagesApi.sendThreadMessage(text, { threadId: selectedThreadId, customerProfileId });
    await refresh();
  } catch (err) {
    const msg = err && typeof err.message === "string" ? err.message : "전송에 실패했습니다.";
    window.alert(msg);
  } finally {
    chatSendLocked = false;
    const next = document.querySelector("#messageChatInput");
    if (next instanceof HTMLTextAreaElement) next.focus();
  }
}

async function initMessagesPage() {
  syncHeaderRoleBadge();
  await mountMessagesSidebar();
  if (!protectCurrentPage()) return;
  if (!ensureCustomerAccess()) return;

  const initialThreadId = applyMessagesPageQuery();
  const q = new URLSearchParams(window.location.search);
  const explicitProfile = (q.get("customer_profile_id") || q.get("customer") || "").trim();
  if (!explicitProfile) {
    const email = getSession()?.email;
    if (email && String(email).trim()) {
      customerProfileId = `profile::${String(email).trim().toLowerCase()}`;
    }
  }
  if (initialThreadId) selectedThreadId = initialThreadId;

  const categoryFilter = document.querySelector("#messageCategoryFilter");
  const unreadOnlyFilter = document.querySelector("#messageUnreadOnly");
  categoryFilter?.addEventListener("change", () => refresh());
  unreadOnlyFilter?.addEventListener("change", () => refresh());

  document.querySelector("#messageListContainer")?.addEventListener("click", (event) => {
    const target = event.target.closest("[data-thread-id]");
    if (!(target instanceof HTMLElement)) return;
    selectedThreadId = target.getAttribute("data-thread-id") || "";
    refresh();
  });

  const detail = document.querySelector("#messageDetailContainer");
  detail?.addEventListener("submit", (event) => {
    const form = event.target;
    if (!(form instanceof HTMLFormElement) || form.id !== "messageChatForm") return;
    void onComposerSubmit(event);
  });
  detail?.addEventListener("keydown", (event) => {
    if (!(event.target instanceof HTMLTextAreaElement) || event.target.id !== "messageChatInput") return;
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      event.target.closest("form")?.requestSubmit();
    }
  });

  await refresh();
}

export { initMessagesPage };

initMessagesPage();
