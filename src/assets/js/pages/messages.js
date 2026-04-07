import { mountMessagesSidebar } from "../components/sidebar.js";
import { messagesApi } from "../core/api.js";
import { getCustomerMessagingProfileId } from "../core/auth.js";
import { ensureCustomerAccess, protectCurrentPage } from "../core/guards.js";
import { canAccessAdminShell } from "../core/role-tiers.js";
import { syncHeaderRoleBadge } from "../core/role-header-badge.js";
import { formatMessageTimestamp, resolveBackendMediaUrl, safeText } from "../core/utils.js";

let customerProfileId = "profile::demo@customer.com";
/** 티어 1~3 운영자 화면: 선택한 스레드의 고객 profile::email */
let threadOwnerProfileId = "";

let selectedThreadId = "";
/** 스레드 메타(백엔드 thread_role; 단일 고객센터 스레드) */
let selectedThreadRole = "";
/** @type {Array<Record<string, unknown>>} */
let currentThreadMessages = [];
let chatSendLocked = false;
/** init 시점에 한 번 설정 — 운영자는 고객센터(온보딩) 스레드만 목록·답장 */
let operatorInboxMode = false;
/** @type {string} */
let threadListLoadError = "";
/** @returns {string} optional initial thread id from URL */
function applyMessagesPageQuery() {
  const q = new URLSearchParams(window.location.search);
  const cp = (q.get("customer_profile_id") || q.get("customer") || "").trim();
  const tid = (q.get("thread_id") || q.get("thread") || "").trim();
  if (operatorInboxMode) {
    if (cp) threadOwnerProfileId = cp;
  } else if (cp) {
    customerProfileId = cp;
  }
  return tid;
}

function isMineDirection(direction) {
  const d = String(direction || "").toUpperCase();
  if (operatorInboxMode) return d === "OUTBOUND";
  return d === "INBOUND";
}

function extractQuoteIdFromText(text) {
  const s = String(text || "");
  const m = s.match(/[?&]quote_id=([^&#\s]+)/);
  return m ? decodeURIComponent(m[1]) : "";
}

function extractInvoiceIdFromText(text) {
  const s = String(text || "");
  const m = s.match(/[?&]invoice_id=([^&#\s]+)/);
  return m ? decodeURIComponent(m[1]) : "";
}

function extractScheduleIdFromText(text) {
  const s = String(text || "");
  let m = s.match(/[?&]schedule_id=([^&#\s]+)/);
  if (m) return decodeURIComponent(m[1]);
  m = s.match(/schedule_id=([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})/i);
  return m ? m[1] : "";
}

/** 정착 일정 공개 알림 — `event_code` 또는(구버전·메타 누락 시) 제목 패턴 */
function isScheduleReleasedToCustomerMessage(message) {
  if (!message || typeof message !== "object") return false;
  if (String(message.event_code || "").trim() === "schedule.released_to_customer") return true;
  const t = String(message.title || "");
  return /정착\s*일정/.test(t) && /준비/.test(t);
}

function extractMockStoragePdfUrl(text) {
  const s = String(text || "");
  const m = s.match(/(?:\/api)?\/mock-storage\/[^ \n\r\t]+\.pdf/i);
  return m ? m[0] : "";
}

function renderQuoteProposedLinksHtml(message) {
  if (!message || typeof message !== "object") return "";
  if (String(message.event_code || "") !== "quote.proposed") return "";

  const qid =
    String(message.linked_quote_id || "").trim() || extractQuoteIdFromText(message.body);
  let pdfUrl = String(message.linked_pdf_url || "").trim() || extractMockStoragePdfUrl(message.body);
  if (pdfUrl) pdfUrl = resolveBackendMediaUrl(pdfUrl);
  const parts = [];

  if (qid) {
    const href = `quote-detail.html?quote_id=${encodeURIComponent(qid)}`;
    parts.push(
      `<a class="lhai-button lhai-button--secondary lhai-quote-proposed-link" href="${href}">견적 보기</a>`
    );
  }
  if (pdfUrl) {
    parts.push(
      `<a class="lhai-button lhai-button--secondary lhai-quote-proposed-link" href="${pdfUrl}" target="_blank" rel="noopener">PDF 다운로드/보기 (Download/View PDF)</a>`
    );
  }
  if (!parts.length) return "";
  return `<div class="lhai-quote-proposed-links">${parts.join(" ")}</div>`;
}

function renderInvoiceSentLinksHtml(message) {
  if (!message || typeof message !== "object") return "";
  if (String(message.event_code || "") !== "invoice.sent") return "";

  const invoiceId =
    String(message.linked_invoice_id || "").trim() || extractInvoiceIdFromText(message.body);
  let pdfUrl = String(message.linked_pdf_url || "").trim() || extractMockStoragePdfUrl(message.body);
  if (pdfUrl) pdfUrl = resolveBackendMediaUrl(pdfUrl);
  const parts = [];

  if (invoiceId) {
    const href = `invoice-detail.html?invoice_id=${encodeURIComponent(invoiceId)}`;
    parts.push(
      `<a class="lhai-button lhai-button--secondary lhai-quote-proposed-link" href="${href}">청구서 보기</a>`
    );
  }
  if (pdfUrl) {
    parts.push(
      `<a class="lhai-button lhai-button--secondary lhai-quote-proposed-link" href="${pdfUrl}" target="_blank" rel="noopener">PDF 다운로드/보기 (Download/View PDF)</a>`
    );
  }
  if (!parts.length) return "";
  return `<div class="lhai-quote-proposed-links">${parts.join(" ")}</div>`;
}

/** 결제 완료 후 필수 서류 안내 — 문서 센터를 메시지함에서 바로 열 수 있게 함 */
function renderPaymentCompletedLinksHtml(message) {
  if (!message || typeof message !== "object") return "";
  if (String(message.event_code || "") !== "payment.completed") return "";

  const invoiceId =
    String(message.linked_invoice_id || "").trim() || extractInvoiceIdFromText(message.body);
  const parts = [
    `<a class="lhai-button lhai-button--secondary lhai-quote-proposed-link" href="documents.html">문서 센터 (Documents)</a>`,
  ];
  if (invoiceId) {
    const href = `invoice-detail.html?invoice_id=${encodeURIComponent(invoiceId)}`;
    parts.push(
      `<a class="lhai-button lhai-button--secondary lhai-quote-proposed-link" href="${href}">관련 청구서 (Invoice)</a>`
    );
  }
  return `<div class="lhai-quote-proposed-links">${parts.join(" ")}</div>`;
}

/** 정착 일정 고객 공개 알림 — 앱 내 `schedule.html` 버튼 (`linked_schedule_id` 또는 본문 URL) */
function renderScheduleReleasedLinksHtml(message) {
  if (!isScheduleReleasedToCustomerMessage(message)) return "";
  const sid =
    String(message.linked_schedule_id || "").trim() || extractScheduleIdFromText(message.body);
  if (!sid) return "";
  const href = `schedule.html?schedule_id=${encodeURIComponent(sid)}`;
  return `<div class="lhai-quote-proposed-links"><a class="lhai-button lhai-button--secondary lhai-quote-proposed-link" href="${href}">일정 보기</a></div>`;
}

/** 본문 끝의 "일정 보기:\\nURL" 블록은 버튼과 중복되므로 표시용 본문에서 제거 */
function scheduleReleasedMessageDisplayBody(message) {
  let b = String(message?.body || "");
  if (!isScheduleReleasedToCustomerMessage(message)) return b;
  if (!renderScheduleReleasedLinksHtml(message)) return b;
  const normalized = b.replace(/\r\n/g, "\n");
  return normalized
    .replace(/\n*일정 보기:\s*\n\s*https?:\/\/\S+\s*\n*/g, "\n")
    .replace(/\n*일정 보기:\s*\n\s*[^\n]*schedule_id=[^\n]+\s*\n*/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trimEnd();
}

function renderThreadList(threads = []) {
  const container = document.querySelector("#messageListContainer");
  if (!container) return;
  if (!threads.length) {
    if (threadListLoadError) {
      container.innerHTML = `<div class="lhai-state lhai-state--error" role="alert">${safeText(threadListLoadError)}</div>`;
      return;
    }
    container.innerHTML = `<div class="lhai-state lhai-state--empty">대화가 없습니다.</div>`;
    return;
  }
  container.innerHTML = threads
    .map(
      (row) => `
      <article class="lhai-message-item ${row.unread ? "is-unread" : ""} ${selectedThreadId === row.thread_id ? "is-active" : ""}" data-thread-id="${safeText(row.thread_id)}" data-customer-profile-id="${safeText(row.customer_profile_id || "")}">
        <div class="lhai-message-item__meta">
          <span class="lhai-badge">${safeText(row.message_type)}</span>
          <span class="u-text-muted">${formatMessageTimestamp(row.last_message_at)}</span>
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
          <p class="lhai-chat-bubble__body">${safeText(scheduleReleasedMessageDisplayBody(m))}</p>
          ${mine ? "" : `${renderQuoteProposedLinksHtml(m)}${renderInvoiceSentLinksHtml(m)}${renderPaymentCompletedLinksHtml(m)}${renderScheduleReleasedLinksHtml(m)}`}
          <time class="lhai-chat-bubble__time" datetime="${safeText(m.created_at)}">${formatMessageTimestamp(m.created_at)}</time>
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
  const customerExtras =
    !operatorInboxMode
      ? `<div class="lhai-messages-ai-scope u-text-muted u-mb-2" role="note">
           이 대화는 고객센터입니다. 결제가 완료되면 같은 창에서 Landing Help AI Agent가 질문에 이어질 수 있습니다. 운영자 도움이 필요하면 아래 버튼으로 요청을 남겨 주세요.
         </div>
         <div class="lhai-messages-ai-escalation u-mb-2">
           <button type="button" class="lhai-button lhai-button--secondary" id="lhaiEscalateToOpsBtn">운영자에게 요청</button>
           <button type="button" class="lhai-button lhai-button--secondary" id="lhaiEscalateInPersonBtn">대면 지원 요청</button>
         </div>`
      : "";
  const placeholder = "메시지를 입력하세요";
  const sendLabel = "보내기";

  container.className = "lhai-message-detail lhai-message-detail--chat";
  container.innerHTML = `
    <div class="lhai-chat-header">
      <h3 id="messageChatTitle" class="lhai-chat-header__title">대화</h3>
    </div>
    ${customerExtras}
    <div id="messageChatScroll" class="lhai-chat-scroll" role="log" aria-live="polite">
      <div id="messageChatStream" class="lhai-chat-stream"></div>
    </div>
    <form id="messageChatForm" class="lhai-chat-composer" autocomplete="off">
      <label class="lhai-chat-composer__field">
        <textarea id="messageChatInput" class="lhai-chat-composer__input" rows="2" placeholder="${safeText(placeholder)}" maxlength="4000" aria-label="메시지 입력"></textarea>
      </label>
      <button type="submit" class="lhai-button lhai-button--primary lhai-chat-composer__send">${safeText(sendLabel)}</button>
    </form>
  `;
}

async function loadThreadMessages() {
  if (!selectedThreadId) {
    currentThreadMessages = [];
    return;
  }
  const cp = operatorInboxMode ? threadOwnerProfileId : customerProfileId;
  if (operatorInboxMode && !String(cp || "").trim()) {
    currentThreadMessages = [];
    renderChatBubbles();
    return;
  }
  try {
    currentThreadMessages = operatorInboxMode
      ? await messagesApi.operatorThreadMessages(selectedThreadId, { customerProfileId: cp })
      : await messagesApi.threadMessages(selectedThreadId, { customerProfileId: cp });
  } catch {
    currentThreadMessages = [];
  }

  if (!operatorInboxMode && Array.isArray(currentThreadMessages) && currentThreadMessages.length) {
    const unreadIncoming = currentThreadMessages.filter((m) => {
      const mine = isMineDirection(m?.direction);
      return !mine && Boolean(m?.unread) && Boolean(m?.id);
    });
    if (unreadIncoming.length) {
      await Promise.all(
        unreadIncoming.map(async (m) => {
          try {
            await messagesApi.markRead(String(m.id), true);
            m.unread = false;
          } catch {
            // Ignore per-message read failure and keep page usable.
          }
        })
      );
    }
  }
  renderChatBubbles();
}

async function refresh() {
  threadListLoadError = "";
  const categoryFilter = document.querySelector("#messageCategoryFilter");
  const unreadOnlyFilter = document.querySelector("#messageUnreadOnly");
  const category = categoryFilter instanceof HTMLSelectElement ? categoryFilter.value : "";
  const unreadOnly = unreadOnlyFilter instanceof HTMLInputElement ? unreadOnlyFilter.checked : false;

  let threads;
  try {
    threads = operatorInboxMode
      ? await messagesApi.listOperatorOnboardingThreads()
      : await messagesApi.listThreads({
          customerProfileId,
          category,
          unreadOnly,
        });
  } catch (err) {
    const msg = err && typeof err.message === "string" ? err.message : "";
    threadListLoadError = msg || "대화 목록을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.";
    threads = [];
  }

  if (operatorInboxMode) {
    if (!selectedThreadId && threads.length) {
      const prefer = threadOwnerProfileId
        ? threads.find((t) => String(t.customer_profile_id || "") === threadOwnerProfileId)
        : null;
      const pick = prefer || threads[0];
      selectedThreadId = String(pick.thread_id);
      threadOwnerProfileId = String(pick.customer_profile_id || "");
    }
    if (
      selectedThreadId &&
      !threads.some(
        (t) =>
          String(t.thread_id) === selectedThreadId &&
          String(t.customer_profile_id || "") === String(threadOwnerProfileId || "")
      )
    ) {
      if (threads.length) {
        selectedThreadId = String(threads[0].thread_id);
        threadOwnerProfileId = String(threads[0].customer_profile_id || "");
      } else {
        selectedThreadId = "";
        threadOwnerProfileId = "";
      }
    }
  } else {
    if (!selectedThreadId && threads.length) {
      selectedThreadId = String(threads[0].thread_id);
    }
    if (selectedThreadId && !threads.some((t) => String(t.thread_id) === selectedThreadId)) {
      selectedThreadId = threads.length ? String(threads[0].thread_id) : "";
    }
  }

  const threadMeta = threads.find((t) => {
    if (operatorInboxMode) {
      return (
        String(t.thread_id) === selectedThreadId &&
        String(t.customer_profile_id || "") === String(threadOwnerProfileId || "")
      );
    }
    return String(t.thread_id) === selectedThreadId;
  });
  selectedThreadRole = threadMeta ? String(threadMeta.thread_role || "") : "";
  const headerTitle = threadMeta
    ? String(threadMeta.title)
    : selectedThreadId
      ? operatorInboxMode
        ? "고객센터 대화"
        : `[${customerProfileId}] 정착 서비스`
      : "";

  renderThreadList(threads);
  setDetailHeader(headerTitle);
  renderMessageDetailShell();
  await loadThreadMessages();
  window.dispatchEvent(new CustomEvent("lhai:messages-changed"));
}

async function escalateToCustomerCenter(body) {
  if (operatorInboxMode || !customerProfileId || !selectedThreadId) return;
  try {
    await messagesApi.sendThreadMessage(body, {
      threadId: String(selectedThreadId),
      customerProfileId,
      title: "요청",
    });
    window.alert("이 대화에 요청을 남겼습니다. 운영팀이 같은 스레드에서 답변드립니다.");
    await refresh();
  } catch (err) {
    const msg = err && typeof err.message === "string" ? err.message : "전송에 실패했습니다.";
    window.alert(msg);
  }
}

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
    if (operatorInboxMode) {
      await messagesApi.sendOperatorThreadMessage(text, {
        threadId: selectedThreadId,
        customerProfileId: threadOwnerProfileId,
      });
    } else {
      await messagesApi.sendThreadMessage(text, { threadId: selectedThreadId, customerProfileId });
    }
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
  operatorInboxMode = canAccessAdminShell();
  syncHeaderRoleBadge();
  await mountMessagesSidebar();
  if (!protectCurrentPage()) return;
  if (!ensureCustomerAccess()) return;

  const filtersEl = document.querySelector(".lhai-message-filters");
  if (filtersEl instanceof HTMLElement) {
    filtersEl.style.display = operatorInboxMode ? "none" : "";
  }
  const subtitle = document.querySelector(".lhai-subtitle");
  if (subtitle) {
    subtitle.textContent = operatorInboxMode
      ? "가입 고객의 고객센터 스레드입니다. 고객이 보낸 메시지에 같은 대화창에서 답장할 수 있습니다."
      : "고객센터 대화 한 곳에서 시스템·결제·문서 알림과 운영 답변을 확인할 수 있습니다. 결제가 완료되면 같은 대화에서 Landing Help AI Agent가 이어질 수 있습니다.";
  }

  const initialThreadId = applyMessagesPageQuery();
  const q = new URLSearchParams(window.location.search);
  const explicitProfile = (q.get("customer_profile_id") || q.get("customer") || "").trim();
  if (!operatorInboxMode && !explicitProfile) {
    customerProfileId = getCustomerMessagingProfileId();
  }
  if (initialThreadId) {
    selectedThreadId = initialThreadId;
  }

  const categoryFilter = document.querySelector("#messageCategoryFilter");
  const unreadOnlyFilter = document.querySelector("#messageUnreadOnly");
  categoryFilter?.addEventListener("change", () => refresh());
  unreadOnlyFilter?.addEventListener("change", () => refresh());

  document.querySelector("#messageListContainer")?.addEventListener("click", (event) => {
    const target = event.target.closest("[data-thread-id]");
    if (!(target instanceof HTMLElement)) return;
    selectedThreadId = target.getAttribute("data-thread-id") || "";
    if (operatorInboxMode) {
      threadOwnerProfileId = target.getAttribute("data-customer-profile-id") || "";
    }
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

  detail?.addEventListener("click", (event) => {
    if (event.target.closest("#lhaiEscalateToOpsBtn")) {
      event.preventDefault();
      void escalateToCustomerCenter("[운영자 요청] 운영자의 도움이 필요합니다.");
      return;
    }
    if (event.target.closest("#lhaiEscalateInPersonBtn")) {
      event.preventDefault();
      void escalateToCustomerCenter("[대면 지원 요청] 대면 지원을 요청드립니다.");
    }
  });

  await refresh();
}

export { initMessagesPage };

initMessagesPage();
