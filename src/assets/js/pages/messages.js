import { applyPartnerBiddingSidebarMessagingHide, mountMessagesSidebar } from "../components/sidebar.js";
import {
  customerBidsApi,
  customerWorkflowsApi,
  messagesApi,
  partnerThreadsApi,
  serviceCatalogAdminApi,
  serviceIntakeCustomerApi,
  userCustomerApi,
} from "../core/api.js";
import { getCurrentRole, getCustomerMessagingProfileId } from "../core/auth.js";
import { ROLES } from "../core/config.js";
import { ensureCustomerAccess, protectCurrentPage } from "../core/guards.js";
import { refreshPartnerModeSession } from "../core/partner-mode-session.js";
import { canAccessAdminShell } from "../core/role-tiers.js";
import { syncHeaderRoleBadge } from "../core/role-header-badge.js";
import { renderIntakeContentBlocksHtml } from "../intake/intake-block-render.js";
import {
  deliveryBadgeModifierFromLabel,
  deliveryModeBadgeFromThreadMeta,
  renderIntakeThreadContentBlockBubble,
} from "../intake/intake-runtime-view.js";
import { coerceToIsoDateInputValue, effectiveIntakeInputType, shouldHideIntakeBlockTitle } from "../intake/intake-form-presentation.js";
import { formatMessageTimestamp, resolveBackendMediaUrl, safeText } from "../core/utils.js";
import { t } from "../core/i18n-client.js";
import { bindMessageAiFeedback, buildAiFeedbackHtml } from "./message-ai-feedback.js";
import {
  assertServiceItemUuid,
  intakeStartServiceItemIdFromCardJson,
  isCatalogRecServiceItemUuidString,
} from "../lib/catalog-rec-service-item-id.js";
import { buildIntakeDispatchDiagnosticsHtml } from "./messages-intake-diagnostics-ui.js";

/** @param {unknown} s */
function escapeHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function isLhaiDebugCustomerMessages() {
  try {
    return typeof window !== "undefined" && window.localStorage && window.localStorage.getItem("LHAI_DEBUG_CUSTOMER_MESSAGES") === "1";
  } catch {
    return false;
  }
}

function logCustomerMessagesPageThreadLoad() {
  if (!isLhaiDebugCustomerMessages() || operatorInboxMode || partnerInboxMode) return;
  const cp = String(customerProfileId || "").trim();
  const tid = String(selectedThreadId || "").trim();
  // eslint-disable-next-line no-console
  console.info("[LHAI_DEBUG_CUSTOMER_MESSAGES] messages page loadThreadMessages context", {
    customer_profile_id: cp,
    thread_id: tid,
    currentThreadMessages_count: Array.isArray(currentThreadMessages) ? currentThreadMessages.length : 0,
  });
}

function logCustomerMessagesDomAfterRender() {
  if (!isLhaiDebugCustomerMessages() || operatorInboxMode || partnerInboxMode) return;
  const stream = document.querySelector("#messageChatStream");
  const bubbles = stream && stream.querySelectorAll ? stream.querySelectorAll(".lhai-chat-bubble") : [];
  const arr = Array.isArray(currentThreadMessages) ? currentThreadMessages : [];
  const last = arr.length ? arr[arr.length - 1] : null;
  const partnerish = arr.filter((m) => {
    const title = String((m && m.title) || "");
    const b = String((m && m.body) || "");
    return title.includes("파트너 답변") || title.includes("파트너") || b.includes("파트너 답변");
  });
  // eslint-disable-next-line no-console
  console.info("[LHAI_DEBUG_CUSTOMER_MESSAGES] messages page after renderChatBubbles", {
    customer_profile_id: String(customerProfileId || "").trim(),
    thread_id: String(selectedThreadId || "").trim(),
    dom_message_bubble_count: bubbles.length,
    currentThreadMessages_count: arr.length,
    partner_reply_like_count: partnerish.length,
    last_message_title_preview: last ? String(last.title || "").slice(0, 80) : "",
    last_message_body_preview: last ? String(last.body || "").slice(0, 80) : "",
  });
}

/** @type {Set<string>} 인테이크 폼 제출 중인 message id */
const intakePromptSubmitting = new Set();

let customerProfileId = "profile::demo@customer.com";
/** 티어 1~3 운영자 화면: 선택한 스레드의 고객 profile::email */
let threadOwnerProfileId = "";

let selectedThreadId = "";
/** 스레드 메타(백엔드 thread_role; 단일 고객센터 스레드) */
let selectedThreadRole = "";
/** @type {Array<Record<string, unknown>>} */
let currentThreadMessages = [];
/** 백엔드 ``GET .../threads/{id}/detail`` 의 ``workflow`` (없으면 null). 클라이언트에서 상태 추측하지 않음. */
let currentThreadWorkflowSummary = null;
/** 목록에서 선택된 스레드 요약(``service_item_id`` 등); detail 실패 시에도 INTAKE 등에 사용. */
let currentThreadHeaderMeta = null;
/** ``GET .../detail`` 의 ``thread`` 객체(있을 때만). */
let currentThreadDetailThread = null;
let chatSendLocked = false;
/** init 시점에 한 번 설정 — 운영자는 고객센터(온보딩) 스레드만 목록·답장 */
let operatorInboxMode = false;
/** init 시점에 한 번 설정 — 파트너는 partner_threads API만 사용 */
let partnerInboxMode = false;
/** 같은 스레드에서만 유지되는 고객 견적 패널 스냅샷 */
/** @type {{ bid_request_id?: string, status: string, bids: Array<Record<string, unknown>> } | null} */
let customerBidPanelSnapshot = null;
let customerBidPanelAwaitingFetch = false;
/** 스레드 전환 시 초기화 — 같은 스레드 재조회에서는 선택 완료 배너 유지 */
let customerBidPanelBoundThreadId = "";
let customerBidSelectBannerUntil = 0;
let customerBidSelectBannerThreadId = "";
/** @type {string} */
let threadListLoadError = "";
/** @type {{ first_name?: string, last_name?: string, full_name?: string } | null | undefined} */
let cachedMeBasicInfo;
/** @returns {string} optional initial thread id from URL */
function applyMessagesPageQuery() {
  const q = new URLSearchParams(window.location.search);
  const cp = (q.get("customer_profile_id") || q.get("customer") || "").trim();
  const tid = (q.get("thread_id") || q.get("thread") || "").trim();
  if (operatorInboxMode) {
    if (cp) threadOwnerProfileId = cp;
  } else if (!partnerInboxMode && cp) {
    customerProfileId = cp;
  }
  return tid;
}

function isMineDirection(direction) {
  const d = String(direction || "").toUpperCase();
  if (operatorInboxMode || partnerInboxMode) return d === "OUTBOUND";
  return d === "INBOUND";
}

async function loadMeBasicInfoSafe() {
  if (cachedMeBasicInfo !== undefined) return cachedMeBasicInfo;
  if (operatorInboxMode || partnerInboxMode) {
    cachedMeBasicInfo = null;
    return cachedMeBasicInfo;
  }
  try {
    const me = await userCustomerApi.getMeBasicInfo();
    cachedMeBasicInfo = me && typeof me === "object" ? me : null;
  } catch {
    cachedMeBasicInfo = null;
  }
  return cachedMeBasicInfo;
}

/**
 * Backend should provide ``children[].value`` for question_group prefill.
 * As a defensive fallback, hydrate common name fields from ``/api/users/me``.
 * @param {Array<Record<string, unknown>>} messages
 */
async function applyQuestionGroupNamePrefillFallback(messages) {
  if (!Array.isArray(messages) || !messages.length || operatorInboxMode || partnerInboxMode) return;
  const me = await loadMeBasicInfoSafe();
  if (!me || typeof me !== "object") return;
  const first = String(me.first_name || "").trim();
  const last = String(me.last_name || "").trim();
  const full = String(me.full_name || "").trim();
  for (const m of messages) {
    if (!m || typeof m !== "object") continue;
    const up = m.ui_payload && typeof m.ui_payload === "object" ? /** @type {Record<string, unknown>} */ (m.ui_payload) : null;
    if (!up) continue;
    if (String(up.widget_type || "") !== "form_prompt") continue;
    const itRoot = normalizeIntakeInputType(up.input_type);
    if (itRoot !== "question_group" && itRoot !== "intake_multi") continue;
    const stepGroups =
      itRoot === "intake_multi"
        ? (Array.isArray(up.steps) ? /** @type {Array<Record<string, unknown>>} */ (up.steps) : []).filter(
            (st) => st && typeof st === "object" && normalizeIntakeInputType(st.input_type) === "question_group"
          )
        : [up];
    for (const grp of stepGroups) {
      const children = Array.isArray(grp.children) ? /** @type {Array<Record<string, unknown>>} */ (grp.children) : [];
      for (const ch of children) {
        if (!ch || typeof ch !== "object") continue;
        const hasValue = ch.value != null && String(ch.value).trim() !== "";
        if (hasValue) continue;
        const pf = ch.prefill && typeof ch.prefill === "object" ? /** @type {Record<string, unknown>} */ (ch.prefill) : null;
        const src = String((pf && pf.source) || "").trim();
        if (!src) continue;
        if (src === "customer_profile.first_name" && first) ch.value = first;
        else if (src === "customer_profile.last_name" && last) ch.value = last;
        else if (src === "customer_profile.full_name" && full) ch.value = full;
      }
    }
  }
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
      `<a class="lhai-button lhai-button--primary lhai-messages-cta-link" href="${href}">견적 보기</a>`
    );
  }
  if (pdfUrl) {
    parts.push(
      `<a class="lhai-button lhai-button--primary lhai-messages-cta-link" href="${pdfUrl}" target="_blank" rel="noopener">PDF 다운로드/보기 (Download/View PDF)</a>`
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
      `<a class="lhai-button lhai-button--primary lhai-messages-cta-link" href="${href}">청구서 보기</a>`
    );
  }
  if (pdfUrl) {
    parts.push(
      `<a class="lhai-button lhai-button--primary lhai-messages-cta-link" href="${pdfUrl}" target="_blank" rel="noopener">PDF 다운로드/보기 (Download/View PDF)</a>`
    );
  }
  if (!parts.length) return "";
  return `<div class="lhai-quote-proposed-links">${parts.join(" ")}</div>`;
}

/** 결제 완료 안내 — 관련 청구서 버튼만 제공 (문서 센터 버튼 제거). */
function renderPaymentCompletedLinksHtml(message) {
  if (!message || typeof message !== "object") return "";
  if (String(message.event_code || "") !== "payment.completed") return "";

  const invoiceId =
    String(message.linked_invoice_id || "").trim() || extractInvoiceIdFromText(message.body);
  if (!invoiceId) return "";
  const href = `invoice-detail.html?invoice_id=${encodeURIComponent(invoiceId)}`;
  return `<div class="lhai-quote-proposed-links"><a class="lhai-button lhai-button--primary lhai-messages-cta-link" href="${href}">관련 청구서 (Invoice)</a></div>`;
}

/** 정착 일정 고객 공개 알림 — 앱 내 `schedule.html` 버튼 (`linked_schedule_id` 또는 본문 URL) */
function renderScheduleReleasedLinksHtml(message) {
  if (!isScheduleReleasedToCustomerMessage(message)) return "";
  const sid =
    String(message.linked_schedule_id || "").trim() || extractScheduleIdFromText(message.body);
  if (!sid) return "";
  const href = `schedule.html?schedule_id=${encodeURIComponent(sid)}`;
  return `<div class="lhai-quote-proposed-links"><a class="lhai-button lhai-button--primary lhai-messages-cta-link" href="${href}">일정 보기</a></div>`;
}

/** 본문 끝의 "일정 보기:\\nURL" 블록은 버튼과 중복되므로 표시용 본문에서 제거 */
/** @param {Record<string, unknown>} row */
function normalizeThreadRole(row) {
  const r = String(row?.thread_role || "").toUpperCase();
  if (r === "ADMIN" || r === "CUSTOMER_CENTER") return "ADMIN";
  return "SERVICE";
}

/** 스레드 요약의 미읽음 여부(``unread`` 또는 ``unread_count``). */
function threadRowHasUnread(row) {
  if (!row || typeof row !== "object") return false;
  if (Boolean(row.unread)) return true;
  const n = Number(row.unread_count);
  return Number.isFinite(n) && n > 0;
}

/**
 * 운영자 메시지함: ``profile::email`` 등을 한눈에 읽을 수 있는 고객 식별 문자열.
 * @param {string} profileRef
 */
function threadCustomerDisplayLabel(profileRef) {
  const raw = String(profileRef || "").trim();
  if (!raw) return "고객 식별 없음";
  const low = raw.toLowerCase();
  if (low.startsWith("profile::")) {
    const tail = raw.slice(9).trim();
    return tail || raw;
  }
  return raw;
}

/** @param {Array<Record<string, unknown>>} list */
function sortOperatorInboxThreads(list) {
  const rows = Array.isArray(list) ? [...list] : [];
  rows.sort((a, b) => {
    const ua = threadRowHasUnread(a);
    const ub = threadRowHasUnread(b);
    if (ua !== ub) return ua ? -1 : 1;
    const ta = Date.parse(String(a.last_message_at || "")) || 0;
    const tb = Date.parse(String(b.last_message_at || "")) || 0;
    return tb - ta;
  });
  return rows;
}

/** 서비스 스레드 표시용 제목: 카탈로그명 우선, 없으면 API title */
function threadServiceDisplayTitle(row) {
  const cat = String(row?.service_catalog_title || "").trim();
  if (cat) return cat;
  return String(row?.title || "").trim() || "서비스";
}

/** 구매 시점 스냅샷·API 헤더 필드 우선 (목록·상세 공통). */
function serviceThreadDisplayName(row) {
  const fromApi = String(row?.header_title || row?.service_name || row?.service_name_snapshot || "").trim();
  if (fromApi) return fromApi;
  return threadServiceDisplayTitle(row);
}

/** @param {Record<string, unknown> | null | undefined} row */
const deliveryModeBadgeLabel = deliveryModeBadgeFromThreadMeta;

function isInPersonServiceThread(row) {
  return String(row?.selected_delivery_mode || "").toUpperCase() === "IN_PERSON";
}

/** SERVICE thread detail: delivery pill next to title (same vocabulary as preview). */
function applyServiceDeliveryBadge(el, label) {
  if (!(el instanceof HTMLElement)) return;
  const t = String(label || "").trim();
  const show = Boolean(t) && t !== "Service";
  el.textContent = show ? t : "";
  el.hidden = !show;
  const mod = deliveryBadgeModifierFromLabel(t);
  el.className = `lhai-service-header__delivery-badge lhai-service-header__delivery-badge--${mod}`;
}

/** 목록 한 줄: `서비스명 · 배지` (예: Phone Setup · AI Agent). */
function serviceThreadListHeadline(row) {
  const name = serviceThreadDisplayName(row);
  const mode = deliveryModeBadgeLabel(row);
  if (mode) return `${name} · ${mode}`;
  return name;
}

/** @param {string} handlerType */
function handlerBadgeLabel(handlerType) {
  const h = String(handlerType || "").toUpperCase();
  if (h === "AI_AGENT") return "AI Agent";
  if (h === "HUMAN_AGENT") return "Human Agent";
  if (h === "SYSTEM") return "System";
  return "";
}

/** 상세 헤더 부제(한국어) — 담당 방식 */
function handlerSubtitleKo(handlerType) {
  const h = String(handlerType || "").toUpperCase();
  if (h === "AI_AGENT") return "담당: AI Agent (제한형 안내)";
  if (h === "HUMAN_AGENT") return "담당: 운영 담당자";
  if (h === "SYSTEM") return "담당: 시스템 알림";
  return "담당: 안내 방식 확인 중";
}

/**
 * @param {Record<string, unknown>} row
 * @param {{ forDetailHeader?: boolean; omitDeliveryBadge?: boolean }} [options]
 */
function threadListBadgesHtml(row, options = {}) {
  const forDetailHeader = Boolean(options.forDetailHeader);
  const omitDeliveryBadge = Boolean(options.omitDeliveryBadge);
  const role = normalizeThreadRole(row);
  const parts = [];
  if (role === "ADMIN") {
    parts.push(`<span class="lhai-thread-badge lhai-thread-badge--admin">고객센터</span>`);
    const h = handlerBadgeLabel(row.handler_type);
    if (h) parts.push(`<span class="lhai-thread-badge lhai-thread-badge--muted">${safeText(h)}</span>`);
  } else {
    const dm = deliveryModeBadgeLabel(row);
    const skipDmPills = omitDeliveryBadge && forDetailHeader;
    if (!skipDmPills && forDetailHeader && dm === "AI Agent") {
      parts.push(`<span class="lhai-thread-badge lhai-thread-badge--ai">${safeText(dm)}</span>`);
    } else if (!skipDmPills && forDetailHeader && dm === "In-Person") {
      parts.push(`<span class="lhai-thread-badge lhai-thread-badge--inperson">${safeText(dm)}</span>`);
    } else if (!dm) {
      const h = handlerBadgeLabel(row.handler_type);
      if (h === "AI Agent") parts.push(`<span class="lhai-thread-badge lhai-thread-badge--ai">${safeText(h)}</span>`);
      else if (h === "Human Agent") parts.push(`<span class="lhai-thread-badge lhai-thread-badge--human">${safeText(h)}</span>`);
      else if (h === "System") parts.push(`<span class="lhai-thread-badge lhai-thread-badge--system">${safeText(h)}</span>`);
      else if (h) parts.push(`<span class="lhai-thread-badge lhai-thread-badge--muted">${safeText(h)}</span>`);
    }
  }
  const st = String(row?.status || "").trim();
  if (st) parts.push(`<span class="lhai-thread-badge lhai-thread-badge--status">${safeText(st)}</span>`);
  return `<div class="lhai-thread-badges">${parts.join("")}</div>`;
}

/** @param {Array<Record<string, unknown>>} threads */
function pickDefaultThreadId(threads) {
  if (!threads.length) return "";
  const admin = threads.find((t) => normalizeThreadRole(t) === "ADMIN");
  if (admin && admin.thread_id) return String(admin.thread_id);
  return String(threads[0].thread_id || "");
}

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

/** @param {Record<string, unknown>} row */
function renderThreadListRow(row) {
  const role = normalizeThreadRole(row);
  const isAdmin = role === "ADMIN";
  const rowUnread = threadRowHasUnread(row);
  const itemCls = [
    "lhai-message-item",
    isAdmin ? "lhai-message-item--admin" : "lhai-message-item--service",
    rowUnread ? "is-unread" : "",
    selectedThreadId === row.thread_id ? "is-active" : "",
  ]
    .filter(Boolean)
    .join(" ");
  const headline = isAdmin ? safeText(row.title) : safeText(serviceThreadListHeadline(row));
  const lastType = String(row.message_type || "").trim();
  const customerIdBlock = operatorInboxMode
    ? `<div class="lhai-message-item__customer-id"><span class="lhai-message-item__customer-id-label">고객</span> ${safeText(threadCustomerDisplayLabel(String(row.customer_profile_id || "")))}</div>`
    : "";
  const unreadPill =
    operatorInboxMode && rowUnread
      ? `<span class="lhai-message-item__unread-pill" title="미읽음">미읽음</span>`
      : "";
  return `
      <article class="${itemCls}" data-thread-id="${safeText(row.thread_id)}" data-thread-role="${safeText(role)}" data-customer-profile-id="${safeText(row.customer_profile_id || "")}">
        <div class="lhai-message-item__meta">
          ${threadListBadgesHtml(row)}
          <span class="lhai-message-item__meta-end">
            ${unreadPill}
            <span class="u-text-muted">${formatMessageTimestamp(row.last_message_at)}</span>
          </span>
        </div>
        ${customerIdBlock}
        <div class="lhai-message-item__title-row">
          <h3 class="lhai-message-item__title">${headline}</h3>
        </div>
        ${lastType ? `<div class="u-text-muted lhai-message-item__last-type">최근 유형 · ${safeText(lastType)}</div>` : ""}
        <p class="u-text-muted lhai-message-item__preview">${safeText(row.preview)}</p>
      </article>
    `;
}

/** 서비스 스레드 표시용: 동일 서비스·배송 방식·카탈로그 조합이 API에서 중복될 때 한 줄만 남깁니다. */
function serviceThreadDedupeKey(row) {
  const raw = String(row?.service_item_id ?? "").trim();
  const itemId = isCatalogRecServiceItemUuidString(raw) ? raw : "";
  const name = serviceThreadDisplayName(row).trim().toLowerCase();
  const dm = String(row?.selected_delivery_mode || "").trim().toUpperCase();
  return `${itemId}||${name}||${dm}`;
}

/** @param {Array<Record<string, unknown>>} threads @param {string} selectedId */
function dedupeThreadsForMessagesList(threads, selectedId) {
  const sid = String(selectedId || "").trim();
  const admin = [];
  const service = [];
  for (const t of threads) {
    if (normalizeThreadRole(t) === "ADMIN") admin.push(t);
    else service.push(t);
  }
  const groups = new Map();
  for (const t of service) {
    const k = serviceThreadDedupeKey(t);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(t);
  }
  const deduped = [];
  for (const arr of groups.values()) {
    const preferred = arr.find((x) => String(x.thread_id) === sid);
    if (preferred) {
      deduped.push(preferred);
      continue;
    }
    arr.sort((a, b) => {
      const ta = Date.parse(String(a.last_message_at || "")) || 0;
      const tb = Date.parse(String(b.last_message_at || "")) || 0;
      return tb - ta;
    });
    deduped.push(arr[0]);
  }
  const openFirst = (st) => (String(st || "OPEN").toUpperCase() === "OPEN" ? 0 : 1);
  const lm = (r) => Date.parse(String(r.last_message_at || "")) || 0;
  deduped.sort((a, b) => {
    const oa = openFirst(a.status);
    const ob = openFirst(b.status);
    if (oa !== ob) return oa - ob;
    return lm(b) - lm(a);
  });
  return [...admin, ...deduped];
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
  const adminRows = threads.filter((t) => normalizeThreadRole(t) === "ADMIN");
  const serviceRows = threads.filter((t) => normalizeThreadRole(t) !== "ADMIN");
  const blocks = [];
  if (adminRows.length) {
    blocks.push(
      `<div class="lhai-thread-list__group" role="group" aria-label="고객센터"><div class="lhai-thread-list__group-label">고객센터 · 전역 지원</div>${adminRows.map(renderThreadListRow).join("")}</div>`
    );
  }
  if (serviceRows.length) {
    blocks.push(
      `<div class="lhai-thread-list__group" role="group" aria-label="서비스별 대화"><div class="lhai-thread-list__group-label">서비스별 대화</div>${serviceRows.map(renderThreadListRow).join("")}</div>`
    );
  }
  container.innerHTML = blocks.length ? blocks.join("") : threads.map(renderThreadListRow).join("");
}

function scrollChatToBottom() {
  const wrap = document.querySelector("#messageChatScroll");
  if (wrap) wrap.scrollTop = wrap.scrollHeight;
}

/** @param {unknown} raw */
function normalizeIntakeInputType(raw) {
  const t = String(raw || "text").toLowerCase();
  if (t === "dropdown") return "select";
  if (t === "question_group") return "question_group";
  if (t === "intake_multi") return "intake_multi";
  return t;
}

/** @param {HTMLElement} formRoot */
function getUiPayloadForFormRoot(formRoot) {
  const mid = formRoot.getAttribute("data-message-id") || "";
  const m = currentThreadMessages.find((x) => String(x.id || "") === mid);
  const up = m && typeof m === "object" && m.ui_payload && typeof m.ui_payload === "object" ? m.ui_payload : null;
  return /** @type {Record<string, unknown> | null} */ (up);
}

/**
 * @param {string} cit
 * @param {Record<string, unknown>} vj
 */
function intakeChildAnswerLooksEmpty(cit, vj) {
  if (!vj || typeof vj !== "object") return true;
  if (cit === "multi_select") {
    const vals = /** @type {{ values?: unknown[] }} */ (vj).values;
    return !Array.isArray(vals) || vals.length === 0;
  }
  if (cit === "radio" || cit === "yes_no" || cit === "select") {
    const v = /** @type {{ value?: unknown }} */ (vj).value;
    return v === undefined || v === null || String(v).trim() === "";
  }
  if (cit === "date") {
    const v = /** @type {{ value?: unknown }} */ (vj).value;
    return v === undefined || v === null || String(v).trim() === "";
  }
  const v = /** @type {{ value?: unknown }} */ (vj).value;
  return v === undefined || v === null || String(v).trim() === "";
}

/**
 * @param {HTMLElement | null} childEl
 * @param {string} cit normalized type
 * @param {boolean} skipChild
 * @returns {{ ok: boolean, valueJson?: Record<string, unknown>, error?: string }}
 */
function collectChildValueJson(childEl, cit, skipChild) {
  if (!(childEl instanceof HTMLElement)) {
    return { ok: false, error: "항목을 찾을 수 없습니다." };
  }
  if (skipChild) {
    if (cit === "multi_select") {
      return { ok: true, valueJson: { values: ["__skipped__"] } };
    }
    return { ok: true, valueJson: { value: "__skipped__" } };
  }
  if (cit === "multi_select") {
    const vals = Array.from(childEl.querySelectorAll(".lhai-chat-form-prompt__cb:checked")).map((c) =>
      String(/** @type {HTMLInputElement} */ (c).value)
    );
    return { ok: true, valueJson: { values: vals } };
  }
  if (cit === "radio" || cit === "yes_no") {
    const sel = childEl.querySelector('.lhai-chat-form-prompt__radio-group input[type="radio"]:checked');
    if (!(sel instanceof HTMLInputElement)) {
      return { ok: false, error: "선택해 주세요." };
    }
    return { ok: true, valueJson: { value: sel.value } };
  }
  if (cit === "select") {
    const sel = childEl.querySelector("select.lhai-chat-form-prompt__select");
    if (!(sel instanceof HTMLSelectElement)) return { ok: false, error: "항목을 찾을 수 없습니다." };
    const v = String(sel.value || "").trim();
    if (!v) return { ok: false, error: "선택해 주세요." };
    return { ok: true, valueJson: { value: v } };
  }
  if (cit === "textarea") {
    const ta = childEl.querySelector("textarea.lhai-chat-form-prompt__textarea");
    if (!(ta instanceof HTMLTextAreaElement)) return { ok: false, error: "입력란을 찾을 수 없습니다." };
    const v = String(ta.value || "").trim();
    return { ok: true, valueJson: { value: v } };
  }
  if (cit === "date") {
    const inp = childEl.querySelector("input.lhai-chat-form-prompt__date");
    if (!(inp instanceof HTMLInputElement)) return { ok: false, error: "날짜 입력을 찾을 수 없습니다." };
    const v = String(inp.value || "").trim();
    if (!v) return { ok: false, error: "날짜를 선택해 주세요." };
    return { ok: true, valueJson: { value: v } };
  }
  const inp = childEl.querySelector("input.lhai-chat-form-prompt__text");
  if (!(inp instanceof HTMLInputElement)) return { ok: false, error: "입력란을 찾을 수 없습니다." };
  const v = String(inp.value || "").trim();
  return { ok: true, valueJson: { value: v } };
}

/**
 * @param {Record<string, unknown>} up
 * @param {string} messageId
 */
function renderQuestionGroupControlsHtml(up, messageId) {
  const mid = String(messageId || "msg").replace(/[^a-zA-Z0-9_-]/g, "_");
  const children = Array.isArray(up.children) ? /** @type {Array<Record<string, unknown>>} */ (up.children) : [];
  const layout = String(up.layout || "stack").trim() === "inline_2" ? "inline_2" : "stack";
  const layoutCls = layout === "inline_2" ? "lhai-chat-form-prompt__group--inline-2" : "";
  return `<div class="lhai-chat-form-prompt__group ${layoutCls}" data-lhai-intake-group role="group">
    ${children
      .map((ch, idx) => {
        const cid = String(ch.id || "").trim();
        const lab = String(ch.label || "").trim();
        const help = String(ch.help_text || "").trim();
        const req = Boolean(ch.required);
        const reqHtml = req ? ` <abbr class="lhai-chat-form-prompt__req" title="필수">*</abbr>` : "";
        const cit =
          effectiveIntakeInputType(ch) === "date" ? "date" : normalizeIntakeInputType(ch.input_type);
        const options = Array.isArray(ch.options) ? /** @type {Array<Record<string, unknown>>} */ (ch.options) : [];
        const def = ch.default_value != null && ch.default_value !== undefined ? String(ch.default_value) : "";
        const rawVal = ch.value != null && String(ch.value).trim() !== "" ? String(ch.value).trim() : "";
        const ivRaw = rawVal || def;
        const iv = cit === "date" ? coerceToIsoDateInputValue(ivRaw) || "" : ivRaw;
        const readOnlyAttr = "";
        const selectLocked = "";
        const suff = `${mid}-c${idx}`;
        let inner = "";
        if (cit === "textarea") {
          inner = `<textarea class="lhai-chat-form-prompt__input lhai-chat-form-prompt__textarea" rows="2" maxlength="8000" aria-label="${escapeHtml(lab)}"${readOnlyAttr}>${escapeHtml(iv)}</textarea>`;
        } else if (cit === "select") {
          const opts = [...options].sort((a, b) => Number(a.sort_order || 0) - Number(b.sort_order || 0));
          const optHtml = opts
            .map((o) => {
              const val = String(o.value ?? "");
              const olab = String(o.label ?? val);
              const selMark = val === iv ? " selected" : "";
              return `<option value="${escapeHtml(val)}"${selMark}>${escapeHtml(olab)}</option>`;
            })
            .join("");
          inner = `<select class="lhai-chat-form-prompt__input lhai-chat-form-prompt__select" aria-label="${escapeHtml(lab)}"${selectLocked}>
      <option value="">${escapeHtml("선택하세요")}</option>
      ${optHtml}
    </select>`;
        } else if (cit === "radio") {
          const opts = [...options].sort((a, b) => Number(a.sort_order || 0) - Number(b.sort_order || 0));
          const name = `lhai-intake-r-${suff}`;
          inner = `<div class="lhai-chat-form-prompt__radio-group" role="radiogroup" aria-label="${escapeHtml(lab)}">
      ${opts
        .map((o, i) => {
          const val = String(o.value ?? "");
          const olab = String(o.label ?? val);
          const id = `${name}-${i}`;
          const checked = val === iv ? " checked" : "";
          return `<label class="lhai-chat-form-prompt__radio-label" for="${escapeHtml(id)}">
            <input type="radio" name="${escapeHtml(name)}" id="${escapeHtml(id)}" value="${escapeHtml(val)}" class="lhai-chat-form-prompt__radio"${checked} />
            <span>${escapeHtml(olab)}</span>
          </label>`;
        })
        .join("")}
    </div>`;
        } else if (cit === "yes_no") {
          const name = `lhai-intake-yn-${suff}`;
          inner = `<div class="lhai-chat-form-prompt__radio-group" role="radiogroup" aria-label="${escapeHtml(lab)}">
      <label class="lhai-chat-form-prompt__radio-label" for="${escapeHtml(`${name}-y`)}">
        <input type="radio" name="${escapeHtml(name)}" id="${escapeHtml(`${name}-y`)}" value="yes" class="lhai-chat-form-prompt__radio" />
        <span>${escapeHtml("예")}</span>
      </label>
      <label class="lhai-chat-form-prompt__radio-label" for="${escapeHtml(`${name}-n`)}">
        <input type="radio" name="${escapeHtml(name)}" id="${escapeHtml(`${name}-n`)}" value="no" class="lhai-chat-form-prompt__radio" />
        <span>${escapeHtml("아니오")}</span>
      </label>
    </div>`;
        } else if (cit === "multi_select") {
          const opts = [...options].sort((a, b) => Number(a.sort_order || 0) - Number(b.sort_order || 0));
          inner = `<div class="lhai-chat-form-prompt__checks" role="group" aria-label="${escapeHtml(lab)}">
      ${opts
        .map((o, i) => {
          const val = String(o.value ?? "");
          const olab = String(o.label ?? val);
          const id = `lhai-intake-ms-${suff}-${i}`;
          return `<label class="lhai-chat-form-prompt__check-label" for="${escapeHtml(id)}">
            <input type="checkbox" id="${escapeHtml(id)}" class="lhai-chat-form-prompt__cb" value="${escapeHtml(val)}" />
            <span>${escapeHtml(olab)}</span>
          </label>`;
        })
        .join("")}
    </div>`;
        } else if (cit === "date") {
          inner = `<input type="date" class="lhai-chat-form-prompt__input lhai-chat-form-prompt__date" value="${escapeHtml(iv)}" aria-label="${escapeHtml(lab)}"${readOnlyAttr} />`;
        } else {
          inner = `<input type="text" class="lhai-chat-form-prompt__input lhai-chat-form-prompt__text" value="${escapeHtml(iv)}" maxlength="4000" aria-label="${escapeHtml(lab)}"${readOnlyAttr} />`;
        }
        return `<div class="lhai-chat-form-prompt__group-child" data-child-id="${escapeHtml(cid)}" data-child-input-type="${escapeHtml(cit)}">
    <div class="lhai-chat-form-prompt__child-label">${escapeHtml(lab)}${reqHtml}</div>
    ${help ? `<div class="lhai-chat-form-prompt__child-help u-text-muted">${escapeHtml(help)}</div>` : ""}
    <div class="lhai-chat-form-prompt__child-controls">${inner}</div>
  </div>`;
      })
      .join("")}
  </div>`;
}

/**
 * @param {Record<string, unknown>} up
 * @param {string} messageId
 */
function renderFormPromptControlsHtml(up, messageId) {
  const mid = String(messageId || "msg").replace(/[^a-zA-Z0-9_-]/g, "_");
  const it =
    effectiveIntakeInputType(up) === "date" ? "date" : normalizeIntakeInputType(up.input_type);
  if (it === "question_group") return "";
  const options = Array.isArray(up.options) ? /** @type {Array<Record<string, unknown>>} */ (up.options) : [];
  const def = up.default_value != null && up.default_value !== undefined ? String(up.default_value) : "";
  const prefillBlocked = Boolean(up.prefill_blocked);
  const rawPv = String(up.prefill_resolved_value ?? "").trim();
  const rawVal = up.value != null && String(up.value).trim() !== "" ? String(up.value).trim() : "";
  const pf = up.prefill && typeof up.prefill === "object" ? up.prefill : null;
  const prefillOn = !prefillBlocked && pf && Boolean(pf.enabled);
  const prefillScalar = rawVal || rawPv;
  const usePrefillValue = Boolean(prefillOn && prefillScalar);
  const ivRaw = usePrefillValue ? prefillScalar : def;
  const ivDate = it === "date" ? coerceToIsoDateInputValue(ivRaw) || "" : "";
  const readOnlyAttr =
    usePrefillValue && up.prefill_editable === false ? ' readonly="readonly" aria-readonly="true"' : "";
  const selectLocked = usePrefillValue && up.prefill_editable === false && it === "select" ? " disabled" : "";

  if (it === "textarea") {
    const v = escapeHtml(ivRaw);
    return `<textarea class="lhai-chat-form-prompt__input lhai-chat-form-prompt__textarea" rows="3" maxlength="8000" aria-label="${escapeHtml(String(up.label || ""))}"${readOnlyAttr}>${v}</textarea>`;
  }
  if (it === "select") {
    const opts = [...options].sort((a, b) => Number(a.sort_order || 0) - Number(b.sort_order || 0));
    const optHtml = opts
      .map((o) => {
        const val = String(o.value ?? "");
        const lab = String(o.label ?? val);
        const selMark = usePrefillValue && val === ivRaw ? " selected" : "";
        return `<option value="${escapeHtml(val)}"${selMark}>${escapeHtml(lab)}</option>`;
      })
      .join("");
    return `<select class="lhai-chat-form-prompt__input lhai-chat-form-prompt__select" aria-label="${escapeHtml(String(up.label || ""))}"${selectLocked}>
      <option value="">${escapeHtml("선택하세요")}</option>
      ${optHtml}
    </select>`;
  }
  if (it === "radio") {
    const opts = [...options].sort((a, b) => Number(a.sort_order || 0) - Number(b.sort_order || 0));
    const name = `lhai-intake-r-${mid}`;
    return `<div class="lhai-chat-form-prompt__radio-group" role="radiogroup" aria-label="${escapeHtml(String(up.label || ""))}">
      ${opts
        .map((o, i) => {
          const val = String(o.value ?? "");
          const lab = String(o.label ?? val);
          const id = `${name}-${i}`;
          const checked = usePrefillValue && val === ivRaw ? " checked" : "";
          return `<label class="lhai-chat-form-prompt__radio-label" for="${escapeHtml(id)}">
            <input type="radio" name="${escapeHtml(name)}" id="${escapeHtml(id)}" value="${escapeHtml(val)}" class="lhai-chat-form-prompt__radio"${checked} />
            <span>${escapeHtml(lab)}</span>
          </label>`;
        })
        .join("")}
    </div>`;
  }
  if (it === "yes_no") {
    const name = `lhai-intake-yn-${mid}`;
    return `<div class="lhai-chat-form-prompt__radio-group" role="radiogroup" aria-label="${escapeHtml(String(up.label || ""))}">
      <label class="lhai-chat-form-prompt__radio-label" for="${escapeHtml(`${name}-y`)}">
        <input type="radio" name="${escapeHtml(name)}" id="${escapeHtml(`${name}-y`)}" value="yes" class="lhai-chat-form-prompt__radio" />
        <span>${escapeHtml("예")}</span>
      </label>
      <label class="lhai-chat-form-prompt__radio-label" for="${escapeHtml(`${name}-n`)}">
        <input type="radio" name="${escapeHtml(name)}" id="${escapeHtml(`${name}-n`)}" value="no" class="lhai-chat-form-prompt__radio" />
        <span>${escapeHtml("아니오")}</span>
      </label>
    </div>`;
  }
  if (it === "multi_select") {
    const opts = [...options].sort((a, b) => Number(a.sort_order || 0) - Number(b.sort_order || 0));
    return `<div class="lhai-chat-form-prompt__checks" role="group" aria-label="${escapeHtml(String(up.label || ""))}">
      ${opts
        .map((o, i) => {
          const val = String(o.value ?? "");
          const lab = String(o.label ?? val);
          const id = `lhai-intake-ms-${mid}-${i}`;
          return `<label class="lhai-chat-form-prompt__check-label" for="${escapeHtml(id)}">
            <input type="checkbox" id="${escapeHtml(id)}" class="lhai-chat-form-prompt__cb" value="${escapeHtml(val)}" />
            <span>${escapeHtml(lab)}</span>
          </label>`;
        })
        .join("")}
    </div>`;
  }
  if (it === "date") {
    const v = escapeHtml(ivDate);
    return `<input type="date" class="lhai-chat-form-prompt__input lhai-chat-form-prompt__date" value="${v}" aria-label="${escapeHtml(String(up.label || ""))}"${readOnlyAttr} />`;
  }
  const v = escapeHtml(ivRaw);
  return `<input type="text" class="lhai-chat-form-prompt__input lhai-chat-form-prompt__text" value="${v}" maxlength="4000" aria-label="${escapeHtml(String(up.label || ""))}"${readOnlyAttr} />`;
}

/**
 * @param {HTMLElement} sec
 * @param {Record<string, unknown>} st step row (field_id, input_type, label, prefill, …)
 * @returns {{ ok: boolean, valueJson?: Record<string, unknown>, error?: string }}
 */
function collectScalarPromptFromSection(sec, st) {
  const it =
    effectiveIntakeInputType(st) === "date" ? "date" : normalizeIntakeInputType(st.input_type);
  if (it === "multi_select") {
    const vals = Array.from(sec.querySelectorAll(".lhai-chat-form-prompt__cb:checked")).map((c) =>
      String(/** @type {HTMLInputElement} */ (c).value)
    );
    return { ok: true, valueJson: { values: vals } };
  }
  if (it === "radio" || it === "yes_no") {
    const sel = sec.querySelector('.lhai-chat-form-prompt__radio-group input[type="radio"]:checked');
    if (!(sel instanceof HTMLInputElement)) {
      return { ok: false, error: "선택해 주세요." };
    }
    return { ok: true, valueJson: { value: sel.value } };
  }
  if (it === "select") {
    const sel = sec.querySelector("select.lhai-chat-form-prompt__select");
    if (!(sel instanceof HTMLSelectElement)) return { ok: false, error: "항목을 찾을 수 없습니다." };
    const v = String(sel.value || "").trim();
    if (!v) return { ok: false, error: "선택해 주세요." };
    return { ok: true, valueJson: { value: v } };
  }
  if (it === "textarea") {
    const ta = sec.querySelector("textarea.lhai-chat-form-prompt__textarea");
    if (!(ta instanceof HTMLTextAreaElement)) return { ok: false, error: "입력란을 찾을 수 없습니다." };
    const v = String(ta.value || "").trim();
    return { ok: true, valueJson: { value: v } };
  }
  if (it === "date") {
    const inp = sec.querySelector("input.lhai-chat-form-prompt__date");
    if (!(inp instanceof HTMLInputElement)) return { ok: false, error: "날짜 입력을 찾을 수 없습니다." };
    const v = String(inp.value || "").trim();
    if (!v) return { ok: false, error: "날짜를 선택해 주세요." };
    return { ok: true, valueJson: { value: v } };
  }
  const inp = sec.querySelector("input.lhai-chat-form-prompt__text");
  if (!(inp instanceof HTMLInputElement)) return { ok: false, error: "입력란을 찾을 수 없습니다." };
  const v = String(inp.value || "").trim();
  return { ok: true, valueJson: { value: v } };
}

/**
 * @param {Record<string, unknown>} up
 * @param {string} messageId
 */
function renderIntakeMultiControlsHtml(up, messageId) {
  const mid = String(messageId || "msg").replace(/[^a-zA-Z0-9_-]/g, "_");
  const steps = Array.isArray(up.steps) ? /** @type {Array<Record<string, unknown>>} */ (up.steps) : [];
  return steps
    .map((st, si) => {
      const sfid = String(st.field_id || "").trim();
      const suf = `${mid}_s${si}_${sfid.replace(/[^a-zA-Z0-9_-]/g, "_")}`;
      const stIt = normalizeIntakeInputType(st.input_type);
      const title = String(st.label || "").trim();
      const help = String(st.help_text || "").trim();
      const reqMark = Boolean(st.required) ? " *" : "";
      let inner = "";
      if (stIt === "question_group") {
        inner = renderQuestionGroupControlsHtml(st, suf);
      } else {
        inner = renderFormPromptControlsHtml(st, suf);
      }
      const titleLine = shouldHideIntakeBlockTitle(title)
        ? ""
        : `<h4 class="lhai-chat-form-prompt__intake-step-title">${escapeHtml(title)}${escapeHtml(reqMark)}</h4>`;
      return `<section class="lhai-chat-form-prompt__intake-step" data-intake-step-field-id="${escapeHtml(sfid)}" data-intake-step-input-type="${escapeHtml(stIt)}">
    ${titleLine}
    ${help ? `<div class="lhai-chat-form-prompt__help">${escapeHtml(help)}</div>` : ""}
    <div class="lhai-chat-form-prompt__intake-step-controls">${inner}</div>
  </section>`;
    })
    .join("");
}

/**
 * @param {Record<string, unknown>} m
 * @param {Record<string, unknown>} up
 */
function renderFormPromptInteractive(m, up) {
  const mid = String(m.id || "");
  const sessionId = String(up.session_id || "");
  const threadId = String(up.thread_id || selectedThreadId || "");
  const fieldId = String(up.field_id || "");
  const label = String(up.label || "");
  const helpText = String(up.help_text || "").trim();
  const required = Boolean(up.required);
  const it = normalizeIntakeInputType(up.input_type);
  const domInputType = effectiveIntakeInputType(up) === "date" ? "date" : it;
  const reqHtml = required
    ? ` <abbr class="lhai-chat-form-prompt__req" title="필수">*</abbr>`
    : "";

  const blocksHtml = renderIntakeContentBlocksHtml(up);
  const controlsInner =
    it === "intake_multi"
      ? renderIntakeMultiControlsHtml(up, mid)
      : it === "question_group"
        ? renderQuestionGroupControlsHtml(up, mid)
        : renderFormPromptControlsHtml(up, mid);
  const prefillHelper = String(up.helper_text || "").trim();

  const labelLine =
    it === "question_group" && shouldHideIntakeBlockTitle(label)
      ? ""
      : `<div class="lhai-chat-form-prompt__label">${escapeHtml(label)}${reqHtml}</div>`;

  if (Boolean(up.prefill_blocked)) {
    const msg =
      String(up.prefill_block_message || "").trim() ||
      "이 단계를 진행하려면 프로필에 필요한 정보가 먼저 채워져 있어야 합니다. 설정에서 입력한 뒤 다시 시도해 주세요.";
    return `${blocksHtml}<div class="lhai-chat-form-prompt lhai-chat-form-prompt--blocked" data-lhai-intake-form data-message-id="${escapeHtml(mid)}" data-session-id="${escapeHtml(sessionId)}" data-thread-id="${escapeHtml(threadId)}" data-field-id="${escapeHtml(fieldId)}" data-input-type="${escapeHtml(domInputType)}">
    ${labelLine}
    ${helpText ? `<div class="lhai-chat-form-prompt__help">${escapeHtml(helpText)}</div>` : ""}
    <p class="lhai-chat-form-prompt__error" role="alert">${escapeHtml(msg)}</p>
  </div>`;
  }

  return `${blocksHtml}<div class="lhai-chat-form-prompt" data-lhai-intake-form data-message-id="${escapeHtml(mid)}" data-session-id="${escapeHtml(sessionId)}" data-thread-id="${escapeHtml(threadId)}" data-field-id="${escapeHtml(fieldId)}" data-input-type="${escapeHtml(domInputType)}">
    ${labelLine}
    ${helpText ? `<div class="lhai-chat-form-prompt__help">${escapeHtml(helpText)}</div>` : ""}
    ${prefillHelper ? `<div class="lhai-chat-form-prompt__help lhai-chat-form-prompt__help--prefill">${escapeHtml(prefillHelper)}</div>` : ""}
    <div class="lhai-chat-form-prompt__controls">${controlsInner}</div>
    <div class="lhai-chat-form-prompt__error" role="alert" hidden></div>
    <div class="lhai-chat-form-prompt__actions">
      <button type="button" class="lhai-button lhai-button--primary lhai-chat-form-prompt__submit" data-lhai-intake-submit>${escapeHtml("제출")}</button>
      ${!required && it !== "intake_multi" ? `<button type="button" class="lhai-button lhai-button--secondary lhai-chat-form-prompt__skip" data-lhai-intake-skip>${escapeHtml("건너뛰기")}</button>` : ""}
    </div>
  </div>`;
}

/** @param {Record<string, unknown>} up */
function renderFormPromptOperatorReadonly(up) {
  const label = String(up.label || "");
  const helpText = String(up.help_text || "").trim();
  const it = normalizeIntakeInputType(up.input_type);
  const blocksHtml = renderIntakeContentBlocksHtml(up);
  const children = Array.isArray(up.children) ? /** @type {Array<Record<string, unknown>>} */ (up.children) : [];
  const steps = Array.isArray(up.steps) ? /** @type {Array<Record<string, unknown>>} */ (up.steps) : [];
  const groupMeta =
    it === "question_group" && children.length
      ? `<p class="u-text-muted lhai-chat-form-prompt__meta">${escapeHtml(`하위 질문 ${children.length}개`)}</p>`
      : "";
  const multiMeta =
    it === "intake_multi" && steps.length
      ? `<p class="u-text-muted lhai-chat-form-prompt__meta">${escapeHtml(`통합 단계 ${steps.length}개`)}</p>`
      : "";
  return `${blocksHtml}<div class="lhai-chat-form-prompt lhai-chat-form-prompt--readonly">
    <div class="lhai-chat-form-prompt__label">${escapeHtml(label)}</div>
    ${helpText ? `<div class="lhai-chat-form-prompt__help">${escapeHtml(helpText)}</div>` : ""}
    <p class="lhai-chat-form-prompt__readonly-note u-text-muted">${escapeHtml("운영 보기에서는 인테이크 응답을 제출할 수 없습니다.")}</p>
    <p class="u-text-muted lhai-chat-form-prompt__meta">${escapeHtml(`입력 유형: ${it}`)}</p>
    ${groupMeta}
    ${multiMeta}
  </div>`;
}

/** @param {HTMLElement} container */
function setIntakeFormError(container, text) {
  const el = container.querySelector(".lhai-chat-form-prompt__error");
  if (!(el instanceof HTMLElement)) return;
  const t = String(text || "").trim();
  if (!t) {
    el.hidden = true;
    el.textContent = "";
    return;
  }
  el.hidden = false;
  el.textContent = t;
}

/** @param {HTMLElement} container @param {boolean} on */
function setIntakeFormLoading(container, on) {
  container.classList.toggle("is-lhai-intake-loading", on);
  container.setAttribute("aria-busy", on ? "true" : "false");
  container.querySelectorAll("button,input,select,textarea").forEach((n) => {
    if (n instanceof HTMLElement) n.toggleAttribute("disabled", on);
  });
}

/**
 * @param {HTMLElement} container
 * @param {string} inputType
 * @param {boolean} skip
 * @returns {{ ok: boolean, valueJson?: Record<string, unknown>, error?: string }}
 */
function collectIntakeValueJson(container, inputType, skip) {
  if (skip) {
    const itSkip = normalizeIntakeInputType(inputType);
    if (itSkip === "intake_multi") {
      return { ok: false, error: "통합 인테이크는 건너뛸 수 없습니다." };
    }
    if (itSkip === "question_group") {
      return { ok: true, valueJson: { group_skipped: true } };
    }
    if (itSkip === "multi_select") {
      return { ok: true, valueJson: { values: ["__skipped__"] } };
    }
    return { ok: true, valueJson: { value: "__skipped__" } };
  }
  const it = normalizeIntakeInputType(inputType);
  if (it === "intake_multi") {
    const up = getUiPayloadForFormRoot(container);
    const steps = Array.isArray(up?.steps) ? /** @type {Array<Record<string, unknown>>} */ (up.steps) : [];
    /** @type {Array<{ field_id: string, value_json: Record<string, unknown> }>} */
    const batch_updates = [];
    for (const st of steps) {
      const sfid = String(st.field_id || "").trim();
      if (!sfid) continue;
      const sec = /** @type {HTMLElement | null} */ (container.querySelector(`[data-intake-step-field-id="${sfid}"]`));
      if (!(sec instanceof HTMLElement)) {
        return { ok: false, error: "입력 단계를 찾을 수 없습니다." };
      }
      const stIt = normalizeIntakeInputType(st.input_type);
      if (stIt === "question_group") {
        const children = Array.isArray(st.children) ? /** @type {Array<Record<string, unknown>>} */ (st.children) : [];
        /** @type {Record<string, Record<string, unknown>>} */
        const group_answers = {};
        for (const ch of children) {
          const cid = String(ch.id || "").trim();
          if (!cid) continue;
          const cel = sec.querySelector(`.lhai-chat-form-prompt__group-child[data-child-id="${cid}"]`);
          const cit =
            effectiveIntakeInputType(ch) === "date" ? "date" : normalizeIntakeInputType(ch.input_type);
          const sub = collectChildValueJson(cel, cit, false);
          if (!sub.ok) return { ok: false, error: sub.error || "입력을 확인해 주세요." };
          group_answers[cid] = /** @type {Record<string, unknown>} */ (sub.valueJson || {});
        }
        batch_updates.push({ field_id: sfid, value_json: { group_answers } });
      } else {
        const sub = collectScalarPromptFromSection(sec, st);
        if (!sub.ok) return { ok: false, error: sub.error || "입력을 확인해 주세요." };
        batch_updates.push({ field_id: sfid, value_json: /** @type {Record<string, unknown>} */ (sub.valueJson || {}) });
      }
    }
    return { ok: true, batchUpdates: batch_updates };
  }
  if (it === "question_group") {
    const up = getUiPayloadForFormRoot(container);
    const children = Array.isArray(up?.children) ? /** @type {Array<Record<string, unknown>>} */ (up.children) : [];
    /** @type {Record<string, Record<string, unknown>>} */
    const group_answers = {};
    for (const ch of children) {
      const cid = String(ch.id || "").trim();
      if (!cid) continue;
      const cel = container.querySelector(`.lhai-chat-form-prompt__group-child[data-child-id="${cid}"]`);
      const cit =
        effectiveIntakeInputType(ch) === "date" ? "date" : normalizeIntakeInputType(ch.input_type);
      const sub = collectChildValueJson(cel, cit, false);
      if (!sub.ok) return { ok: false, error: sub.error || "입력을 확인해 주세요." };
      group_answers[cid] = /** @type {Record<string, unknown>} */ (sub.valueJson || {});
    }
    return { ok: true, valueJson: { group_answers } };
  }
  if (it === "multi_select") {
    const vals = Array.from(container.querySelectorAll(".lhai-chat-form-prompt__cb:checked")).map((c) =>
      String(/** @type {HTMLInputElement} */ (c).value)
    );
    return { ok: true, valueJson: { values: vals } };
  }
  if (it === "radio" || it === "yes_no") {
    const sel = container.querySelector('.lhai-chat-form-prompt__radio-group input[type="radio"]:checked');
    if (!(sel instanceof HTMLInputElement)) {
      return { ok: false, error: "선택해 주세요." };
    }
    return { ok: true, valueJson: { value: sel.value } };
  }
  if (it === "select") {
    const sel = container.querySelector("select.lhai-chat-form-prompt__select");
    if (!(sel instanceof HTMLSelectElement)) return { ok: false, error: "항목을 찾을 수 없습니다." };
    const v = String(sel.value || "").trim();
    if (!v) return { ok: false, error: "선택해 주세요." };
    return { ok: true, valueJson: { value: v } };
  }
  if (it === "textarea") {
    const ta = container.querySelector("textarea.lhai-chat-form-prompt__textarea");
    if (!(ta instanceof HTMLTextAreaElement)) return { ok: false, error: "입력란을 찾을 수 없습니다." };
    const v = String(ta.value || "").trim();
    return { ok: true, valueJson: { value: v } };
  }
  if (it === "date") {
    const inp = container.querySelector("input.lhai-chat-form-prompt__date");
    if (!(inp instanceof HTMLInputElement)) return { ok: false, error: "날짜 입력을 찾을 수 없습니다." };
    const v = String(inp.value || "").trim();
    if (!v) return { ok: false, error: "날짜를 선택해 주세요." };
    return { ok: true, valueJson: { value: v } };
  }
  const inp = container.querySelector("input.lhai-chat-form-prompt__text");
  if (!(inp instanceof HTMLInputElement)) return { ok: false, error: "입력란을 찾을 수 없습니다." };
  const v = String(inp.value || "").trim();
  return { ok: true, valueJson: { value: v } };
}

/**
 * @param {HTMLElement} formRoot
 * @param {boolean} skip
 */
async function runIntakePromptSubmit(formRoot, skip) {
  const mid = formRoot.getAttribute("data-message-id") || "";
  if (!mid || intakePromptSubmitting.has(mid)) return;
  const sessionId = formRoot.getAttribute("data-session-id") || "";
  const threadId = formRoot.getAttribute("data-thread-id") || "";
  const fieldId = formRoot.getAttribute("data-field-id") || "";
  const inputType = formRoot.getAttribute("data-input-type") || "text";
  const requiredAttr = formRoot.querySelector(".lhai-chat-form-prompt__req");

  setIntakeFormError(formRoot, "");
  const collected = collectIntakeValueJson(formRoot, inputType, skip);
  if (!collected.ok) {
    setIntakeFormError(formRoot, collected.error || "입력을 확인해 주세요.");
    return;
  }
  const valueJson = /** @type {Record<string, unknown> | undefined} */ (collected.valueJson);
  const batchUpdates = /** @type {Array<{ field_id: string, value_json: Record<string, unknown> }> | undefined} */ (
    collected.batchUpdates
  );

  if (!skip && normalizeIntakeInputType(inputType) === "intake_multi") {
    const up = getUiPayloadForFormRoot(formRoot);
    const steps = Array.isArray(up?.steps) ? /** @type {Array<Record<string, unknown>>} */ (up.steps) : [];
    for (const st of steps) {
      const sfid = String(st.field_id || "").trim();
      const sec = /** @type {HTMLElement | null} */ (formRoot.querySelector(`[data-intake-step-field-id="${sfid}"]`));
      if (!(sec instanceof HTMLElement)) {
        setIntakeFormError(formRoot, "입력 단계를 찾을 수 없습니다.");
        return;
      }
      const stIt = normalizeIntakeInputType(st.input_type);
      if (stIt === "question_group") {
        const children = Array.isArray(st.children) ? /** @type {Array<Record<string, unknown>>} */ (st.children) : [];
        for (const ch of children) {
          if (!ch || typeof ch !== "object" || !ch.required) continue;
          const cid = String(ch.id || "").trim();
          const childEl = sec.querySelector(`.lhai-chat-form-prompt__group-child[data-child-id="${cid}"]`);
          const cit =
            effectiveIntakeInputType(ch) === "date" ? "date" : normalizeIntakeInputType(ch.input_type);
          const sub = collectChildValueJson(childEl, cit, false);
          if (!sub.ok) {
            setIntakeFormError(formRoot, sub.error || "입력을 확인해 주세요.");
            return;
          }
          const vj = /** @type {Record<string, unknown>} */ (sub.valueJson || {});
          if (intakeChildAnswerLooksEmpty(cit, vj)) {
            setIntakeFormError(formRoot, "필수 하위 항목을 모두 입력해 주세요.");
            return;
          }
        }
      } else if (st.required) {
        const sub = collectScalarPromptFromSection(sec, st);
        if (!sub.ok) {
          setIntakeFormError(formRoot, sub.error || "입력을 확인해 주세요.");
          return;
        }
        const vj = /** @type {Record<string, unknown>} */ (sub.valueJson || {});
        const effStIt =
          effectiveIntakeInputType(st) === "date" ? "date" : stIt;
        if (effStIt === "multi_select") {
          const vals = vj.values;
          if (!Array.isArray(vals) || vals.length === 0) {
            setIntakeFormError(formRoot, "하나 이상 선택해 주세요.");
            return;
          }
        } else if (effStIt !== "radio" && effStIt !== "yes_no" && effStIt !== "select" && effStIt !== "date") {
          const v = vj.value;
          if (v === undefined || v === null || String(v).trim() === "") {
            setIntakeFormError(formRoot, "필수 항목입니다.");
            return;
          }
        }
      }
    }
  }

  if (!skip && normalizeIntakeInputType(inputType) === "question_group") {
    const up = getUiPayloadForFormRoot(formRoot);
    const children = Array.isArray(up?.children) ? /** @type {Array<Record<string, unknown>>} */ (up.children) : [];
    for (const ch of children) {
      if (!ch || typeof ch !== "object" || !ch.required) continue;
      const cid = String(ch.id || "").trim();
      const childEl = formRoot.querySelector(`.lhai-chat-form-prompt__group-child[data-child-id="${cid}"]`);
      const cit =
        effectiveIntakeInputType(ch) === "date" ? "date" : normalizeIntakeInputType(ch.input_type);
      const sub = collectChildValueJson(childEl, cit, false);
      if (!sub.ok) {
        setIntakeFormError(formRoot, sub.error || "입력을 확인해 주세요.");
        return;
      }
      const vj = /** @type {Record<string, unknown>} */ (sub.valueJson || {});
      if (intakeChildAnswerLooksEmpty(cit, vj)) {
        setIntakeFormError(formRoot, "필수 하위 항목을 모두 입력해 주세요.");
        return;
      }
    }
  }
  if (requiredAttr && !skip && normalizeIntakeInputType(inputType) !== "intake_multi") {
    const it = normalizeIntakeInputType(inputType);
    if (it === "multi_select") {
      const vals = /** @type {{ values?: unknown[] }} */ (valueJson || {}).values;
      if (!Array.isArray(vals) || vals.length === 0) {
        setIntakeFormError(formRoot, "하나 이상 선택해 주세요.");
        return;
      }
    } else if (it !== "radio" && it !== "yes_no" && it !== "select" && it !== "date" && it !== "question_group") {
      const v = /** @type {{ value?: unknown }} */ (valueJson || {}).value;
      if (v === undefined || v === null || String(v).trim() === "") {
        setIntakeFormError(formRoot, "필수 항목입니다.");
        return;
      }
    }
  }

  const cp = operatorInboxMode ? threadOwnerProfileId : customerProfileId;
  if (!String(cp || "").trim() || !String(threadId || "").trim() || !String(sessionId || "").trim()) {
    setIntakeFormError(formRoot, "세션 정보가 부족합니다. 페이지를 새로고침해 주세요.");
    return;
  }

  intakePromptSubmitting.add(mid);
  setIntakeFormLoading(formRoot, true);
  try {
    if (batchUpdates && batchUpdates.length) {
      await messagesApi.submitIntakeThreadPromptAnswer(threadId, sessionId, {
        customerProfileId: cp,
        fieldId,
        batchUpdates,
      });
    } else {
      await messagesApi.submitIntakeThreadPromptAnswer(threadId, sessionId, {
        customerProfileId: cp,
        fieldId,
        valueJson: /** @type {Record<string, unknown>} */ (valueJson || {}),
      });
    }
    await loadThreadMessages();
  } catch (err) {
    const msg = err && typeof err.message === "string" ? err.message : "제출에 실패했습니다.";
    setIntakeFormError(formRoot, msg);
  } finally {
    intakePromptSubmitting.delete(mid);
    setIntakeFormLoading(formRoot, false);
  }
}

/** 워크플로 카드 JSON에서 snake_case / camelCase 혼재 필드를 안전히 읽습니다. */
function pickWorkflowStr(obj, ...keys) {
  if (!obj || typeof obj !== "object") return "";
  for (const k of keys) {
    if (!k) continue;
    const v = /** @type {Record<string, unknown>} */ (obj)[k];
    if (v != null && String(v).trim()) return String(v).trim();
  }
  return "";
}

/** @param {Record<string, unknown>} m */
function mergeWorkflowCardJson(m) {
  const raw = m && typeof m === "object" && m.card_json && typeof m.card_json === "object" ? m.card_json : {};
  return /** @type {Record<string, unknown>} */ ({ ...raw });
}

/** @param {unknown} val */
function formatWorkflowPrice(val) {
  if (val === null || val === undefined || val === "") return "";
  const n = Number(val);
  if (Number.isFinite(n)) return n.toLocaleString("ko-KR");
  return String(val);
}

/** @param {unknown} publicResponse */
function renderWorkflowPublicResponseBlock(publicResponse) {
  if (publicResponse == null || publicResponse === "") return "";
  const text =
    typeof publicResponse === "object" ? JSON.stringify(publicResponse, null, 2) : String(publicResponse);
  if (!String(text).trim()) return "";
  return `<div class="lhai-workflow-card__extra">
    <div class="lhai-workflow-card__extra-label u-text-muted">회신 상세</div>
    <pre class="lhai-workflow-card__json" tabindex="0">${escapeHtml(text)}</pre>
  </div>`;
}

/**
 * WORKFLOW_CARD — ``title``/``body``/``card_json``는 API 그대로 사용(상태 추측 없음).
 * @param {Record<string, unknown>} m
 * @param {Record<string, unknown> | null} up
 */
function renderWorkflowCardBubble(m, up) {
  const readOnly = operatorInboxMode;
  const cj = mergeWorkflowCardJson(m);
  const ct = String(m.card_type || (up && up.card_type) || cj.card_type || "")
    .trim()
    .toUpperCase() || "WORKFLOW";
  const sk = String(m.workflow_step_key || (up && up.workflow_step_key) || cj.workflow_step_key || "").trim();
  const title = String(m.title || "").trim();
  const body = String(m.body || "").trim();
  const wfId = String(
    m.workflow_instance_id ||
      (up && up.workflow_instance_id) ||
      pickWorkflowStr(cj, "workflow_instance_id", "workflowInstanceId") ||
      ""
  ).trim();

  const badge = `<span class="lhai-workflow-card__badge">${escapeHtml(ct)}</span>`;
  const step = sk ? `<div class="lhai-workflow-card__step">${escapeHtml(sk)}</div>` : "";
  const statusLine = String(cj.status || "").trim();
  const custLine = String(cj.customer_status || cj.intake_state || "").trim();
  const stepLine = String(cj.current_step || "").trim();
  const stateParts = [];
  if (statusLine) stateParts.push(`상태: ${statusLine}`);
  if (custLine) stateParts.push(`고객 단계: ${custLine}`);
  if (stepLine && stepLine !== sk) stateParts.push(`단계: ${stepLine}`);
  const stateRow =
    stateParts.length > 0
      ? `<div class="lhai-workflow-card__state-row" role="status">${escapeHtml(stateParts.join(" · "))}</div>`
      : "";

  let actionsHtml = "";
  if (!readOnly) {
    if (ct === "INTAKE_START") {
      const instC = pickWorkflowStr(cj, "service_instance_id", "serviceInstanceId");
      const itemC = intakeStartServiceItemIdFromCardJson(cj);
      if (itemC) {
        actionsHtml = `<div class="lhai-workflow-card__actions">
        <button type="button" class="lhai-button lhai-button--primary lhai-workflow-card__action" data-lhai-wf-action="intake_start" data-service-instance="${escapeHtml(
          instC
        )}" data-service-item-id="${escapeHtml(itemC)}">답변 시작하기</button>
      </div>`;
      }
    } else if (ct === "EMAIL_PARTNER_RESPONSE") {
      const oid = String(cj.partner_offer_id || cj.offer_id || "").trim();
      if (oid && wfId) {
        actionsHtml = `<div class="lhai-workflow-card__actions">
          <button type="button" class="lhai-button lhai-button--primary lhai-workflow-card__action" data-lhai-wf-action="select_offer" data-wf-id="${escapeHtml(wfId)}" data-offer-id="${escapeHtml(oid)}">이 견적 선택하기</button>
        </div>`;
      }
    } else if (ct === "OFFER_SELECTION") {
      const offers = Array.isArray(cj.offers) ? cj.offers : [];
      if (offers.length && wfId) {
        const rows = offers
          .map((o) => {
            if (!o || typeof o !== "object") return "";
            const row = /** @type {Record<string, unknown>} */ (o);
            const oid = String(row.offer_id || "").trim();
            if (!oid) return "";
            const pname = escapeHtml(String(row.partner_name || "Partner"));
            const sum = escapeHtml(String(row.summary || "").slice(0, 500));
            const priceRaw = formatWorkflowPrice(row.price);
            const priceEl =
              priceRaw !== ""
                ? `<span class="lhai-workflow-card__offer-price">${escapeHtml(priceRaw)}</span>`
                : "";
            return `<li class="lhai-workflow-card__offer">
              <div class="lhai-workflow-card__offer-head"><strong>${pname}</strong>${priceEl}</div>
              <div class="lhai-workflow-card__offer-summary u-text-muted">${sum}</div>
              <button type="button" class="lhai-button lhai-button--secondary lhai-workflow-card__action" data-lhai-wf-action="select_offer" data-wf-id="${escapeHtml(wfId)}" data-offer-id="${escapeHtml(oid)}">이 견적 선택하기</button>
            </li>`;
          })
          .filter(Boolean)
          .join("");
        if (rows) actionsHtml = `<ul class="lhai-workflow-card__offers">${rows}</ul>`;
      }
    }
  }

  const emailExtra = ct === "EMAIL_PARTNER_RESPONSE" ? renderWorkflowPublicResponseBlock(cj.public_response) : "";

  return `<div class="lhai-workflow-card" data-lhai-workflow-card-type="${escapeHtml(ct)}">
    <div class="lhai-workflow-card__header">${badge}${step}</div>
    ${stateRow}
    ${title ? `<div class="lhai-workflow-card__title">${escapeHtml(title)}</div>` : ""}
    ${body ? `<div class="lhai-workflow-card__body">${escapeHtml(body)}</div>` : ""}
    ${emailExtra}
    ${actionsHtml}
  </div>`;
}

/**
 * @param {HTMLButtonElement} btn
 */
async function runWorkflowIntakeStart(btn) {
  if (btn.disabled) return;
  const cp = String(customerProfileId || "").trim();
  const tid = String(selectedThreadId || "").trim();
  const meta = /** @type {Record<string, unknown>} */ (
    currentThreadDetailThread && typeof currentThreadDetailThread === "object"
      ? currentThreadDetailThread
      : currentThreadHeaderMeta && typeof currentThreadHeaderMeta === "object"
        ? currentThreadHeaderMeta
        : {}
  );
  /** INTAKE_START 버튼은 카드 렌더 시 ``card_json``에서 읽은 UUID만 ``data-service-item-id``에 넣습니다(스레드 스캔 폴백 없음). */
  const itemFromBtn = String(btn.getAttribute("data-service-item-id") || "").trim();
  const itemId = isCatalogRecServiceItemUuidString(itemFromBtn) ? itemFromBtn : "";
  const instFromBtn = String(btn.getAttribute("data-service-instance") || "").trim();
  const instId = String(
    instFromBtn || pickWorkflowStr(meta, "service_instance_id", "serviceInstanceId") || ""
  ).trim();
  const missing = [];
  if (!cp) missing.push("고객 프로필");
  if (!tid) missing.push("스레드 ID");
  if (missing.length) {
    console.warn("[lhai:intake_start] launch context incomplete", {
      missing,
      selectedThreadId: tid,
      metaKeys: meta && typeof meta === "object" ? Object.keys(meta) : [],
      buttonDataset: { service_item_id: itemFromBtn, service_instance: instFromBtn },
      threadMessageCount: Array.isArray(currentThreadMessages) ? currentThreadMessages.length : 0,
      detailThreadLoaded: Boolean(currentThreadDetailThread),
    });
    window.alert(
      `인테이크를 시작할 수 없습니다. 다음 정보가 없습니다: ${missing.join(", ")}.\n` +
        "메시지함을 새로고침한 뒤 다시 시도해 주세요. 문제가 계속되면 운영팀에 문의해 주세요."
    );
    return;
  }
  try {
    assertServiceItemUuid(itemId);
  } catch {
    window.alert(
      t(
        "common.messages.workflow.mapping_repair_needed",
        "서비스 연결 정보가 누락되었습니다. 관리자에게 서비스 매핑 복구를 요청하세요."
      )
    );
    return;
  }
  if (!instId) {
    window.alert(
      "서비스 인스턴스 정보가 누락되었습니다. 메시지함을 새로고침한 뒤 다시 시도해 주세요. 문제가 계속되면 운영팀에 문의해 주세요."
    );
    return;
  }
  btn.disabled = true;
  try {
    await serviceIntakeCustomerApi.flowStart({
      customer_profile_id: cp,
      thread_id: tid,
      service_instance_id: instId,
      service_item_id: itemId,
    });
    await loadThreadMessages();
    syncWorkflowSummaryStrip();
  } catch (err) {
    const msg = err && typeof err.message === "string" ? err.message : "인테이크를 시작하지 못했습니다.";
    window.alert(msg);
  } finally {
    btn.disabled = false;
  }
}

/**
 * @param {HTMLButtonElement} btn
 * @param {string} workflowInstanceId
 * @param {string} offerId
 */
async function runWorkflowSelectOffer(btn, workflowInstanceId, offerId) {
  if (btn.disabled) return;
  const wf = String(workflowInstanceId || "").trim();
  const oid = String(offerId || "").trim();
  if (!wf || !oid) return;
  btn.disabled = true;
  try {
    await customerWorkflowsApi.postAction(wf, {
      action_type: "SELECT_PARTNER_OFFER",
      payload: { offer_id: oid },
    });
    await loadThreadMessages();
    syncWorkflowSummaryStrip();
  } catch (err) {
    const msg = err && typeof err.message === "string" ? err.message : "선택 처리에 실패했습니다.";
    window.alert(msg);
  } finally {
    btn.disabled = false;
  }
}

function syncWorkflowSummaryStrip() {
  const host = document.querySelector("#messageWorkflowSummary");
  if (!(host instanceof HTMLElement)) return;
  if (operatorInboxMode || !currentThreadWorkflowSummary) {
    host.innerHTML = "";
    host.hidden = true;
    return;
  }
  const w = /** @type {Record<string, unknown>} */ (currentThreadWorkflowSummary);
  const title = String(w.display_title || "").trim();
  const desc = String(w.display_description || "").trim();
  const pa = w.primary_action && typeof w.primary_action === "object" ? /** @type {Record<string, unknown>} */ (w.primary_action) : null;
  const paLabel = pa ? String(pa.label || pa.title || "").trim() : "";
  const paHref = pa ? String(pa.href || pa.url || "").trim() : "";
  const paBtn = paLabel && paHref
    ? `<div class="lhai-thread-workflow-summary__actions u-mt-2">
         <a class="lhai-button lhai-button--primary lhai-messages-cta-link" href="${escapeHtml(paHref)}">${escapeHtml(paLabel)}</a>
       </div>`
    : "";
  if (!title && !desc && !paBtn) {
    host.innerHTML = "";
    host.hidden = true;
    return;
  }
  host.hidden = false;
  host.innerHTML = `
    <div class="lhai-thread-workflow-summary__inner" role="status" aria-live="polite">
      ${title ? `<div class="lhai-thread-workflow-summary__title">${escapeHtml(title)}</div>` : ""}
      ${desc ? `<div class="lhai-thread-workflow-summary__desc u-text-muted">${escapeHtml(desc)}</div>` : ""}
      ${paBtn}
    </div>`;
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
      const up =
        m && typeof m === "object" && m.ui_payload && typeof m.ui_payload === "object"
          ? /** @type {Record<string, unknown>} */ (m.ui_payload)
          : null;
      const wt = up ? String(up.widget_type || "").trim() : "";
      const mt = String(m.message_type || "").trim().toUpperCase();
      const isWorkflowCard = mt === "WORKFLOW_CARD" || wt === "workflow_card";
      const isForm = wt === "form_prompt";
      const isIntakeContent = wt === "intake_content_block";
      const meta =
        m && typeof m === "object" && m.json_metadata && typeof m.json_metadata === "object"
          ? /** @type {Record<string, unknown>} */ (m.json_metadata)
          : null;
      const intakeSummaryKind = String(meta?.kind || "").trim();
      const isPartnerIntakeSummary = intakeSummaryKind === "partner_intake_submission_summary";
      const bubbleClass = [
        mine ? "lhai-chat-bubble--me" : "lhai-chat-bubble--them",
        isForm ? "lhai-chat-bubble--form-prompt" : "",
        isIntakeContent ? "lhai-chat-bubble--intake-content" : "",
        isWorkflowCard ? "lhai-chat-bubble--workflow-card" : "",
      ]
        .filter(Boolean)
        .join(" ");
      const showTitle = !mine && (Boolean(m.title) || isPartnerIntakeSummary) && !isForm && !isIntakeContent && !isWorkflowCard;
      const resolvedTitle = isPartnerIntakeSummary ? "고객 신청서" : String(m.title || "");
      const titleLine = showTitle ? `<div class="lhai-chat-bubble__title">${escapeHtml(resolvedTitle)}</div>` : "";

      let formBlock = "";
      if (isForm && up) {
        formBlock =
          operatorInboxMode ? renderFormPromptOperatorReadonly(up) : renderFormPromptInteractive(m, up);
      } else if (isIntakeContent && up) {
        formBlock = renderIntakeThreadContentBlockBubble(up);
      } else if (isWorkflowCard) {
        formBlock = renderWorkflowCardBubble(m, up);
      }

      const bodyBlock =
        (isForm || isIntakeContent || isWorkflowCard) && (up || isWorkflowCard)
          ? formBlock
          : `<p class="lhai-chat-bubble__body">${escapeHtml(String(scheduleReleasedMessageDisplayBody(m)))}</p>`;

      return `
      <div class="lhai-chat-row ${mine ? "lhai-chat-row--mine" : "lhai-chat-row--them"}">
        <div class="lhai-chat-bubble ${bubbleClass}">
          ${titleLine}
          ${bodyBlock}
          ${mine ? "" : `${renderQuoteProposedLinksHtml(m)}${renderInvoiceSentLinksHtml(m)}${renderPaymentCompletedLinksHtml(m)}${renderScheduleReleasedLinksHtml(m)}`}
          <time class="lhai-chat-bubble__time" datetime="${escapeHtml(String(m.created_at))}">${formatMessageTimestamp(m.created_at)}</time>
          ${!mine ? buildAiFeedbackHtml(m) : ""}
        </div>
      </div>`;
    })
    .join("");
  requestAnimationFrame(() => scrollChatToBottom());
}

function showIntakeDispatchDiagToast(message) {
  let el = document.querySelector("#lhaiIntakeDiagToast");
  if (!(el instanceof HTMLElement)) {
    el = document.createElement("div");
    el.id = "lhaiIntakeDiagToast";
    el.className = "lhai-intake-diag-toast";
    el.setAttribute("role", "status");
    document.body.appendChild(el);
  }
  el.textContent = String(message || "");
  el.classList.add("is-visible");
  const prev = /** @type {number | undefined} */ (el._lhaiHideT);
  if (prev) window.clearTimeout(prev);
  el._lhaiHideT = window.setTimeout(() => {
    el.classList.remove("is-visible");
  }, 2800);
}

function wireIntakeDispatchDiagnosticsPanel() {
  const runBtn = document.querySelector("#lhaiIntakeDispatchDiagRunBtn");
  const body = document.querySelector("#lhaiIntakeDispatchDiagBody");
  const loading = document.querySelector("#lhaiIntakeDispatchDiagLoading");
  if (!(runBtn instanceof HTMLButtonElement) || !(body instanceof HTMLElement)) return;
  const clone = /** @type {HTMLButtonElement} */ (runBtn.cloneNode(true));
  runBtn.replaceWith(clone);
  clone.addEventListener("click", async () => {
    const tid = String(selectedThreadId || "").trim();
    if (!tid) return;
    if (loading instanceof HTMLElement) {
      loading.hidden = false;
      loading.textContent = "불러오는 중…";
    }
    body.innerHTML = "";
    try {
      const data = await serviceCatalogAdminApi.getIntakeDispatchDiagnostics({ threadId: tid });
      body.innerHTML = buildIntakeDispatchDiagnosticsHtml(data);
      const copyBtn = document.querySelector("#lhaiIntakeDiagCopyTidBtn");
      if (copyBtn instanceof HTMLButtonElement) {
        copyBtn.addEventListener("click", async () => {
          let out = "";
          try {
            out = JSON.stringify(data, null, 2);
          } catch {
            out = String(data);
          }
          try {
            await navigator.clipboard.writeText(out);
            showIntakeDispatchDiagToast("진단 전체(JSON)가 복사되었습니다");
          } catch {
            showIntakeDispatchDiagToast("복사에 실패했습니다");
          }
        });
      }
    } catch (e) {
      const msg = e && typeof e.message === "string" ? e.message : String(e);
      body.innerHTML = `<p class="lhai-state lhai-state--error">${escapeHtml(msg)}</p>`;
    } finally {
      if (loading instanceof HTMLElement) loading.hidden = true;
    }
  });
}

const CUSTOMER_BIDDING_WORKFLOW_TYPES = new Set(["PARTNER_BIDDING", "CUSTOMER_SELECTS_PARTNER"]);
const BIDDING_POST_INTRO_TEXT_KO =
  "조건에 맞는 파트너들에게 견적 요청을 보냈습니다. 파트너들의 제안이 도착하면 이곳에서 비교하고 선택할 수 있습니다.";

function workflowTypeUpperFromSummary(wf) {
  return wf && typeof wf === "object" ? String(wf.workflow_type || "").trim().toUpperCase() : "";
}

function isCustomerServiceBiddingThreadContext() {
  if (operatorInboxMode || partnerInboxMode) return false;
  if (getCurrentRole() !== ROLES.CUSTOMER) return false;
  if (normalizeThreadRole(currentThreadHeaderMeta) !== "SERVICE") return false;
  if (!currentThreadWorkflowSummary || typeof currentThreadWorkflowSummary !== "object") return false;
  return CUSTOMER_BIDDING_WORKFLOW_TYPES.has(workflowTypeUpperFromSummary(currentThreadWorkflowSummary));
}

function customerBidServiceRequestId() {
  const w = currentThreadWorkflowSummary;
  if (!w || typeof w !== "object") return "";
  return String(w.workflow_instance_id || "").trim();
}

function shouldLockCustomerComposerForBiddingOnlyPartners() {
  if (!isCustomerServiceBiddingThreadContext()) return false;
  if (customerBidPanelAwaitingFetch) return true;
  const snap = customerBidPanelSnapshot;
  if (!snap || typeof snap !== "object") return true;
  const st = String(snap.status || "").trim().toUpperCase();
  return st !== "CUSTOMER_SELECTED";
}

function syncCustomerComposerBidGate() {
  const form = document.querySelector("#messageChatForm");
  const input = document.querySelector("#messageChatInput");
  const sendBtn = form?.querySelector('button[type="submit"]');
  const note = document.querySelector("#messageBidComposerLockNote");
  const lock = shouldLockCustomerComposerForBiddingOnlyPartners();
  if (!(form instanceof HTMLFormElement) || !(input instanceof HTMLTextAreaElement)) return;
  if (!(sendBtn instanceof HTMLButtonElement)) return;
  if (note instanceof HTMLElement) {
    if (lock) {
      note.hidden = false;
      note.textContent =
        "파트너를 선택하기 전에는 비딩 파트너와의 메시지를 시작할 수 없습니다. 아래 견적 카드에서 한 명을 선택해 주세요.";
    } else {
      note.hidden = true;
      note.textContent = "";
    }
  }
  input.disabled = lock;
  sendBtn.disabled = lock;
  form.classList.toggle("lhai-chat-composer--bid-locked", lock);
}

function formatCustomerBidPriceLine(amount, currency) {
  if (amount == null || amount === "") return "—";
  const n = Number(amount);
  if (Number.isNaN(n)) return "—";
  const cur = String(currency || "USD").trim().toUpperCase() || "USD";
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency: cur }).format(n);
  } catch {
    return `${n} ${cur}`;
  }
}

/** @param {unknown} raw */
function formatCustomerBidIncludedItems(raw) {
  if (raw == null) return "—";
  if (Array.isArray(raw)) {
    const parts = raw.map((x) => String(x ?? "").trim()).filter(Boolean);
    return parts.length ? parts.join(", ") : "—";
  }
  const s = String(raw).trim();
  return s || "—";
}

/**
 * @param {Record<string, unknown>} bid
 * @param {string} requestStatus
 */
function renderCustomerBidCardHtml(bid, requestStatus) {
  const bidId = String(bid.bid_id || "").trim();
  const name = String(bid.partner_display_name || "").trim() || "파트너";
  const priceLine = formatCustomerBidPriceLine(bid.price_amount, bid.price_currency);
  const eta = String(bid.estimated_time || "").trim() || "—";
  const included = formatCustomerBidIncludedItems(bid.included_items);
  const pmsg = String(bid.message_to_customer || "").trim();
  const st = String(requestStatus || "").trim().toUpperCase();
  const isClosed = st === "CUSTOMER_SELECTED";
  const showSelect = st === "OPEN" && Boolean(bidId);
  const cardClass = ["lhai-customer-bid-card", isClosed ? "lhai-customer-bid-card--selected" : ""]
    .filter(Boolean)
    .join(" ");
  const btn = showSelect
    ? `<div class="lhai-customer-bid-card__actions"><button type="button" class="lhai-button lhai-button--primary" data-lhai-select-bid="${escapeHtml(bidId)}">이 파트너 선택</button></div>`
    : isClosed
      ? `<p class="lhai-customer-bid-card__state u-text-muted">선택된 파트너입니다.</p>`
      : `<p class="lhai-customer-bid-card__state u-text-muted">선택할 수 없습니다.</p>`;
  const msgBody = pmsg ? escapeHtml(pmsg).replace(/\n/g, "<br />") : "—";
  return `
    <article class="${cardClass}">
      <div class="lhai-customer-bid-card__name">${escapeHtml(name)}</div>
      <dl class="lhai-customer-bid-card__dl">
        <div><dt>가격</dt><dd>${escapeHtml(priceLine)}</dd></div>
        <div><dt>예상 처리 시간</dt><dd>${escapeHtml(eta)}</dd></div>
        <div><dt>포함 항목</dt><dd>${escapeHtml(included)}</dd></div>
      </dl>
      <div class="lhai-customer-bid-card__partner-msg">
        <div class="lhai-customer-bid-card__partner-msg-label">파트너 메시지</div>
        <div class="lhai-customer-bid-card__partner-msg-body">${msgBody}</div>
      </div>
      ${btn}
    </article>`;
}

function renderCustomerBidPanelInnerHtml() {
  const snap = customerBidPanelSnapshot;
  const intro = `<p class="lhai-customer-bid-panel__intro">${escapeHtml(BIDDING_POST_INTRO_TEXT_KO)}</p>`;
  const head = `<div class="lhai-customer-bid-panel__head"><h3 class="lhai-customer-bid-panel__title">파트너 견적</h3></div>`;
  const showFlash =
    Boolean(customerBidSelectBannerThreadId) &&
    customerBidSelectBannerThreadId === selectedThreadId &&
    Date.now() < customerBidSelectBannerUntil;
  const flash = showFlash
    ? `<div class="lhai-customer-bid-panel__flash" role="status">파트너 선택 완료</div>`
    : "";
  if (!snap || typeof snap !== "object") {
    return `${head}${intro}${flash}<p class="lhai-state lhai-state--error">견적 정보를 불러오지 못했습니다.</p>`;
  }
  const status = String(snap.status || "OPEN").trim().toUpperCase();
  const bids = Array.isArray(snap.bids) ? snap.bids : [];
  const doneLine =
    status === "CUSTOMER_SELECTED"
      ? `<p class="lhai-customer-bid-panel__selected-msg">이미 선택 완료되었습니다.</p>`
      : "";
  const empty =
    status === "OPEN" && bids.length === 0
      ? `<p class="lhai-customer-bid-panel__empty">아직 도착한 견적이 없습니다. 파트너가 견적을 제출하면 이곳에 표시됩니다.</p>`
      : "";
  const cards = bids.map((b) => renderCustomerBidCardHtml(b, status)).join("");
  return `${head}${intro}${flash}${doneLine}${empty}<div class="lhai-customer-bid-panel__cards">${cards}</div>`;
}

/** @param {string} message */
function renderCustomerBidPanelErrorHtml(message) {
  const intro = `<p class="lhai-customer-bid-panel__intro">${escapeHtml(BIDDING_POST_INTRO_TEXT_KO)}</p>`;
  const head = `<div class="lhai-customer-bid-panel__head"><h3 class="lhai-customer-bid-panel__title">파트너 견적</h3></div>`;
  return `${head}${intro}<p class="lhai-state lhai-state--error">${escapeHtml(message)}</p>`;
}

async function refreshCustomerBidPanel() {
  const panel = document.querySelector("#messageBidResultsPanel");
  if (!(panel instanceof HTMLElement)) return;

  if (customerBidPanelBoundThreadId !== selectedThreadId) {
    customerBidPanelBoundThreadId = selectedThreadId;
    customerBidSelectBannerUntil = 0;
    customerBidSelectBannerThreadId = "";
    customerBidPanelSnapshot = null;
  }

  if (!isCustomerServiceBiddingThreadContext()) {
    panel.hidden = true;
    panel.innerHTML = "";
    customerBidPanelSnapshot = null;
    customerBidPanelAwaitingFetch = false;
    syncCustomerComposerBidGate();
    return;
  }

  const wid = customerBidServiceRequestId();
  if (!wid) {
    panel.hidden = true;
    panel.innerHTML = "";
    customerBidPanelSnapshot = null;
    customerBidPanelAwaitingFetch = false;
    syncCustomerComposerBidGate();
    return;
  }

  panel.hidden = false;
  customerBidPanelAwaitingFetch = true;
  syncCustomerComposerBidGate();

  let snap = null;
  try {
    snap = await customerBidsApi.listByServiceRequest(wid);
  } catch (err) {
    const msg = err && typeof err.message === "string" ? err.message : "견적 정보를 불러오지 못했습니다.";
    customerBidPanelSnapshot = null;
    panel.innerHTML = renderCustomerBidPanelErrorHtml(msg);
    customerBidPanelAwaitingFetch = false;
    syncCustomerComposerBidGate();
    return;
  }

  customerBidPanelSnapshot =
    snap && typeof snap === "object"
      ? {
          bid_request_id: String(snap.bid_request_id || ""),
          status: String(snap.status || "OPEN").trim().toUpperCase(),
          bids: Array.isArray(snap.bids) ? snap.bids : [],
        }
      : null;
  customerBidPanelAwaitingFetch = false;
  panel.innerHTML = renderCustomerBidPanelInnerHtml();
  syncCustomerComposerBidGate();
}

/** @param {HTMLButtonElement} btn */
async function handleCustomerSelectBidClick(btn) {
  if (!isCustomerServiceBiddingThreadContext()) return;
  const bidId = String(btn.getAttribute("data-lhai-select-bid") || "").trim();
  if (!bidId || btn.disabled) return;
  const panel = document.querySelector("#messageBidResultsPanel");
  const allSelect = panel?.querySelectorAll("[data-lhai-select-bid]");
  allSelect?.forEach((el) => {
    if (el instanceof HTMLButtonElement) el.disabled = true;
  });
  try {
    await customerBidsApi.selectBid(bidId);
    customerBidSelectBannerThreadId = selectedThreadId;
    customerBidSelectBannerUntil = Date.now() + 20000;
    await loadThreadMessages();
  } catch (err) {
    const msg = err && typeof err.message === "string" ? err.message : "선택 처리에 실패했습니다.";
    window.alert(msg);
    allSelect?.forEach((el) => {
      if (el instanceof HTMLButtonElement) el.disabled = false;
    });
  }
}

/** @param {Record<string, unknown> | null | undefined} threadMeta */
function renderMessageDetailShell(threadMeta) {
  const container = document.querySelector("#messageDetailContainer");
  if (!container) return;
  if (!selectedThreadId) {
    container.className = "lhai-message-detail lhai-state lhai-state--empty";
    container.innerHTML = "왼쪽에서 대화를 선택하세요.";
    return;
  }
  const isAdminChannel = threadMeta
    ? normalizeThreadRole(threadMeta) === "ADMIN"
    : String(selectedThreadRole || "").toUpperCase() === "ADMIN";
  const operatorContextBanner =
    operatorInboxMode && threadMeta
      ? isAdminChannel
        ? `<div class="lhai-thread-detail-banner lhai-messages-ai-scope u-mb-2" role="region" aria-label="운영 안내">
             운영 화면: <strong>고객센터(전역 지원)</strong> 스레드입니다. 계정 단위 문의·안내에 회신합니다.
           </div>`
        : `<div class="lhai-thread-detail-banner lhai-thread-detail-banner--service lhai-messages-ai-scope u-mb-2" role="region" aria-label="운영 안내">
             운영 화면: <strong>서비스 전용</strong> 스레드입니다. 해당 서비스 계약·진행 범위의 문의에 회신합니다.
           </div>`
      : "";
  const showIntakeDiag =
    Boolean(operatorInboxMode && threadMeta && normalizeThreadRole(threadMeta) === "SERVICE");
  const intakeDiagBlock = showIntakeDiag
    ? `<section class="lhai-card lhai-intake-diag-panel u-mb-2" id="lhaiIntakeDispatchDiagWrap" aria-labelledby="lhaiIntakeDiagHeading">
        <div class="lhai-intake-diag-panel__head" style="display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:0.5rem">
          <h3 id="lhaiIntakeDiagHeading" class="lhai-card__title" style="margin:0;font-size:1rem">파트너 배정 진단</h3>
          <button type="button" class="lhai-button lhai-button--secondary" id="lhaiIntakeDispatchDiagRunBtn">진단 불러오기</button>
        </div>
        <p class="lhai-help u-mt-1" id="lhaiIntakeDispatchDiagLoading" hidden>불러오는 중…</p>
        <div id="lhaiIntakeDispatchDiagBody" class="lhai-intake-diag-body u-mt-2"></div>
      </section>`
    : "";
  const customerExtras =
    !operatorInboxMode && isAdminChannel
      ? `<div class="lhai-thread-detail-banner lhai-messages-ai-scope u-mb-2" role="region" aria-label="채널 안내">
           이 스레드는 <strong>고객센터(운영 지원)</strong> 전용입니다. 계정 또는 진행 일반 문의를 남겨 주세요.
           서비스별 진행·AI 안내는 왼쪽 목록의 <strong>해당 서비스</strong> 대화를 이용해 주세요.
         </div>
         <div class="lhai-messages-ai-escalation u-mb-2">
           <button type="button" class="lhai-button lhai-button--secondary" id="lhaiEscalateToOpsBtn">운영자에게 요청</button>
           <button type="button" class="lhai-button lhai-button--secondary" id="lhaiEscalateInPersonBtn">대면 지원 요청</button>
         </div>`
      : !operatorInboxMode
        ? `<div class="lhai-thread-detail-banner lhai-thread-detail-banner--service lhai-messages-ai-scope u-mb-2" role="region" aria-label="채널 안내">
             이 대화는 <strong>선택하신 서비스</strong>에 한정됩니다. 진행 일정·산출물·해당 서비스 범위의 내용만 남겨 주시면 더 정확히 안내됩니다.
             계정 전체·견적·청구 등 일반 문의는 왼쪽 목록의 <strong>고객센터</strong> 스레드를 이용해 주세요.
             <div class="lhai-messages-service-actions">
               <button type="button" class="lhai-button lhai-button--secondary" id="lhaiEscalateServiceToAdminBtn">고객센터로 연결 요청</button>
             </div>
           </div>`
        : "";
  const placeholder = partnerInboxMode ? "고객에게 보낼 메시지를 입력하세요." : "메시지를 입력하세요";
  const sendLabel = "보내기";

  container.className = "lhai-message-detail lhai-message-detail--chat";
  container.innerHTML = `
    <div class="lhai-chat-header">
      <p id="messageChatEyebrow" class="lhai-chat-header__eyebrow" aria-hidden="true"></p>
      <div id="messageChatHeaderBadges" class="lhai-chat-header__badge-row" aria-label="스레드 유형"></div>
      <div class="lhai-service-header__primary" id="messageChatServicePrimary">
        <h3 id="messageChatTitle" class="lhai-service-header__title"></h3>
        <span id="messageChatDeliveryBadge" class="lhai-service-header__delivery-badge" hidden></span>
      </div>
      <p id="messageChatSubtitle" class="lhai-chat-header__subtitle lhai-service-header__meta u-text-muted"></p>
    </div>
    ${operatorContextBanner}
    ${intakeDiagBlock}
    ${customerExtras}
    <div id="messageWorkflowSummary" class="lhai-thread-workflow-summary" hidden></div>
    <section id="messageBidResultsPanel" class="lhai-customer-bid-panel u-mb-2" hidden aria-label="파트너 견적 비교"></section>
    <div id="messageChatScroll" class="lhai-chat-scroll" role="log" aria-live="polite">
      <div id="messageChatStream" class="lhai-chat-stream"></div>
    </div>
    <p id="messageBidComposerLockNote" class="lhai-chat-composer__bid-lock-note u-text-muted u-mb-1" hidden></p>
    <form id="messageChatForm" class="lhai-chat-composer" autocomplete="off">
      <label class="lhai-chat-composer__field">
        <textarea id="messageChatInput" class="lhai-chat-composer__input" rows="2" placeholder="${safeText(placeholder)}" maxlength="4000" aria-label="메시지 입력"></textarea>
      </label>
      <button type="submit" class="lhai-button lhai-button--primary lhai-chat-composer__send">${safeText(sendLabel)}</button>
    </form>
  `;
  syncChatHeader(threadMeta);
  if (showIntakeDiag) {
    wireIntakeDispatchDiagnosticsPanel();
  }
}

/** @param {Record<string, unknown> | null | undefined} threadMeta */
function syncChatHeader(threadMeta) {
  const eyebrow = document.querySelector("#messageChatEyebrow");
  const badges = document.querySelector("#messageChatHeaderBadges");
  const subtitle = document.querySelector("#messageChatSubtitle");
  const titleEl = document.querySelector("#messageChatTitle");
  const deliveryBadgeEl = document.querySelector("#messageChatDeliveryBadge");
  if (
    !(eyebrow instanceof HTMLElement) ||
    !(badges instanceof HTMLElement) ||
    !(subtitle instanceof HTMLElement) ||
    !(titleEl instanceof HTMLElement)
  ) {
    return;
  }
  if (!threadMeta || !selectedThreadId) {
    eyebrow.textContent = "";
    eyebrow.hidden = false;
    badges.innerHTML = "";
    subtitle.textContent = "";
    titleEl.textContent = "";
    applyServiceDeliveryBadge(deliveryBadgeEl instanceof HTMLElement ? deliveryBadgeEl : null, "");
    return;
  }
  const role = normalizeThreadRole(threadMeta);
  const detailBadgeOpts = { forDetailHeader: true, omitDeliveryBadge: role !== "ADMIN" };

  if (operatorInboxMode) {
    badges.innerHTML = threadListBadgesHtml(threadMeta, detailBadgeOpts);
    eyebrow.textContent = role === "ADMIN" ? "고객센터 (운영 보기)" : "서비스 (운영 보기)";
    eyebrow.hidden = false;
    if (role === "ADMIN") {
      titleEl.textContent = String(threadMeta.title || "고객센터");
      applyServiceDeliveryBadge(deliveryBadgeEl instanceof HTMLElement ? deliveryBadgeEl : null, "");
    } else {
      titleEl.textContent = serviceThreadDisplayName(threadMeta);
      applyServiceDeliveryBadge(deliveryBadgeEl instanceof HTMLElement ? deliveryBadgeEl : null, deliveryModeBadgeLabel(threadMeta));
    }
    if (role === "ADMIN") {
      subtitle.textContent = "고객의 계정 단위 문의·안내를 다루는 스레드입니다.";
    } else if (isInPersonServiceThread(threadMeta)) {
      const summary = String(threadMeta.agent_assignment_summary || "").trim();
      const nameOnly = String(threadMeta.assigned_agent_name || "").trim();
      if (summary) subtitle.textContent = summary;
      else if (nameOnly) subtitle.textContent = `담당 Agent: ${nameOnly}`;
      else subtitle.textContent = "담당 배정 대기 중입니다.";
    } else {
      subtitle.textContent = "고객의 특정 서비스 계약·진행을 다루는 스레드입니다.";
    }
    return;
  }

  if (partnerInboxMode) {
    badges.innerHTML = "";
    eyebrow.textContent = "파트너 메시지함";
    eyebrow.hidden = false;
    titleEl.textContent = serviceThreadDisplayName(threadMeta);
    applyServiceDeliveryBadge(deliveryBadgeEl instanceof HTMLElement ? deliveryBadgeEl : null, "");
    subtitle.textContent = "배정된 고객 서비스 thread를 확인하고 고객과 대화할 수 있습니다.";
    return;
  }

  badges.innerHTML = threadListBadgesHtml(threadMeta, detailBadgeOpts);

  if (role === "ADMIN") {
    eyebrow.textContent = "고객센터";
    eyebrow.hidden = false;
    titleEl.textContent = String(threadMeta.title || "고객센터");
    applyServiceDeliveryBadge(deliveryBadgeEl instanceof HTMLElement ? deliveryBadgeEl : null, "");
    subtitle.textContent = "운영·견적·청구·결제·일반 문의를 위한 채널입니다.";
    return;
  }

  const dm = deliveryModeBadgeLabel(threadMeta);
  eyebrow.textContent = dm ? "" : "서비스";
  eyebrow.hidden = !String(eyebrow.textContent || "").trim();
  titleEl.textContent = serviceThreadDisplayName(threadMeta);
  applyServiceDeliveryBadge(deliveryBadgeEl instanceof HTMLElement ? deliveryBadgeEl : null, dm);

  if (isInPersonServiceThread(threadMeta)) {
    const summary = String(threadMeta.agent_assignment_summary || "").trim();
    const nameOnly = String(threadMeta.assigned_agent_name || "").trim();
    if (summary) subtitle.textContent = summary;
    else if (nameOnly) subtitle.textContent = `담당 Agent: ${nameOnly}`;
    else subtitle.textContent = "담당 배정 대기 중입니다.";
  } else {
    subtitle.textContent =
      dm === "AI Agent"
        ? "이 서비스는 AI Agent가 제한된 범위에서 안내합니다."
        : handlerSubtitleKo(threadMeta.handler_type);
  }
}

async function loadThreadMessages() {
  if (!selectedThreadId) {
    currentThreadMessages = [];
    currentThreadWorkflowSummary = null;
    currentThreadDetailThread = null;
    await refreshCustomerBidPanel();
    return;
  }
  logCustomerMessagesPageThreadLoad();
  currentThreadWorkflowSummary = null;
  currentThreadDetailThread = null;
  const cp = operatorInboxMode ? threadOwnerProfileId : customerProfileId;
  if (operatorInboxMode && !String(cp || "").trim()) {
    currentThreadMessages = [];
    renderChatBubbles();
    syncWorkflowSummaryStrip();
    await refreshCustomerBidPanel();
    return;
  }
  try {
    if (operatorInboxMode) {
      currentThreadMessages = await messagesApi.operatorThreadMessages(selectedThreadId, {
        customerProfileId: cp,
      });
    } else if (partnerInboxMode) {
      const detail = await partnerThreadsApi.threadDetail(selectedThreadId);
      if (detail && typeof detail === "object" && Array.isArray(detail.messages)) {
        currentThreadMessages = detail.messages;
        const wf = detail.workflow;
        currentThreadWorkflowSummary =
          wf && typeof wf === "object" ? /** @type {Record<string, unknown>} */ (wf) : null;
        const th = detail.thread;
        currentThreadDetailThread =
          th && typeof th === "object" ? /** @type {Record<string, unknown>} */ (th) : null;
      } else {
        currentThreadMessages = [];
      }
    } else {
      let detailOk = false;
      try {
        const detail = await messagesApi.threadDetail(selectedThreadId, { customerProfileId: cp });
        if (detail && typeof detail === "object" && Array.isArray(detail.messages)) {
          currentThreadMessages = detail.messages;
          const wf = detail.workflow;
          currentThreadWorkflowSummary =
            wf && typeof wf === "object" ? /** @type {Record<string, unknown>} */ (wf) : null;
          const th = detail.thread;
          currentThreadDetailThread =
            th && typeof th === "object" ? /** @type {Record<string, unknown>} */ (th) : null;
          detailOk = true;
          if (isLhaiDebugCustomerMessages()) {
            const ids = detail.messages.map((m) => String((m && m.id) || ""));
            // eslint-disable-next-line no-console
            console.info("[LHAI_DEBUG_CUSTOMER_MESSAGES] messages page threadDetail ok", {
              customer_profile_id: String(cp || "").trim(),
              thread_id: String(selectedThreadId || "").trim(),
              messages_count: detail.messages.length,
              message_ids: ids,
            });
          }
        }
      } catch {
        detailOk = false;
      }
      if (!detailOk) {
        currentThreadWorkflowSummary = null;
        currentThreadDetailThread = null;
        currentThreadMessages = await messagesApi.threadMessages(selectedThreadId, {
          customerProfileId: cp,
        });
      }
    }
  } catch {
    currentThreadMessages = [];
    currentThreadWorkflowSummary = null;
    currentThreadDetailThread = null;
  }

  if (!operatorInboxMode && !partnerInboxMode && Array.isArray(currentThreadMessages) && currentThreadMessages.length) {
    await applyQuestionGroupNamePrefillFallback(currentThreadMessages);
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
  logCustomerMessagesDomAfterRender();
  syncWorkflowSummaryStrip();
  await refreshCustomerBidPanel();
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
      : partnerInboxMode
        ? await partnerThreadsApi.listThreads()
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

  if (operatorInboxMode && Array.isArray(threads) && threads.length) {
    threads = sortOperatorInboxThreads(threads);
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
      selectedThreadId = pickDefaultThreadId(threads);
    }
    if (selectedThreadId && !threads.some((t) => String(t.thread_id) === selectedThreadId)) {
      selectedThreadId = threads.length ? pickDefaultThreadId(threads) : "";
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
  currentThreadHeaderMeta =
    threadMeta && typeof threadMeta === "object"
      ? /** @type {Record<string, unknown>} */ ({ ...threadMeta })
      : null;
  selectedThreadRole = threadMeta ? normalizeThreadRole(threadMeta) : "";
  const threadsForUi = operatorInboxMode ? threads : dedupeThreadsForMessagesList(threads, selectedThreadId);
  renderThreadList(threadsForUi);
  renderMessageDetailShell(threadMeta);
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

/** SERVICE 스레드에서 고객센터(ADMIN)로 연결만 기록 — 스레드는 합치지 않음. */
async function escalateServiceThreadToAdminChannel() {
  if (operatorInboxMode || !customerProfileId || !selectedThreadId) return;
  if (String(selectedThreadRole || "").toUpperCase() !== "SERVICE") return;
  const memo = window.prompt(
    "고객센터 스레드에 함께 남길 메모(선택). 비우면 연결 요청만 기록됩니다.",
    "",
  );
  if (memo === null) return;
  try {
    await messagesApi.escalateServiceThreadToAdmin(String(selectedThreadId), {
      customerProfileId,
      note: String(memo).trim(),
    });
    window.alert(
      "고객센터 스레드에 연결 요청을 남겼습니다. 왼쪽 목록의 「고객센터」 대화에서 확인할 수 있습니다."
    );
    await refresh();
  } catch (err) {
    const msg = err && typeof err.message === "string" ? err.message : "요청에 실패했습니다.";
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
    } else if (partnerInboxMode) {
      await partnerThreadsApi.sendMessage(selectedThreadId, text);
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
  partnerInboxMode = !operatorInboxMode && getCurrentRole() === ROLES.PARTNER;
  syncHeaderRoleBadge();
  await mountMessagesSidebar();
  if (partnerInboxMode) {
    await refreshPartnerModeSession(partnerThreadsApi);
    applyPartnerBiddingSidebarMessagingHide();
  }
  if (!protectCurrentPage()) return;
  if (!ensureCustomerAccess()) return;

  const filtersEl = document.querySelector(".lhai-message-filters");
  if (filtersEl instanceof HTMLElement) {
    filtersEl.style.display = operatorInboxMode || partnerInboxMode ? "none" : "";
  }
  const listHint = document.querySelector(".lhai-thread-list-hint");
  if (listHint instanceof HTMLElement) {
    listHint.style.display = operatorInboxMode || partnerInboxMode ? "none" : "";
  }
  const subtitle = document.querySelector(".lhai-subtitle");
  if (subtitle) {
    subtitle.textContent = operatorInboxMode
      ? "고객별 고객센터(ADMIN)와 서비스별(SERVICE) 스레드가 구분되어 표시됩니다. 목록에서 스레드 유형·담당 방식을 확인한 뒤 선택하세요."
      : partnerInboxMode
        ? "배정된 고객 서비스 thread를 확인하고 고객과 대화할 수 있습니다."
        : "고객센터(전역)와 서비스별 대화가 구분되어 있습니다. 서비스 스레드에서는 해당 계약/서비스 맥락의 메시지와 담당 방식(AI·운영·시스템)을 확인할 수 있습니다.";
  }

  const initialThreadId = applyMessagesPageQuery();
  const q = new URLSearchParams(window.location.search);
  const explicitProfile = (q.get("customer_profile_id") || q.get("customer") || "").trim();
  if (!operatorInboxMode && !partnerInboxMode && !explicitProfile) {
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
    const tr = target.getAttribute("data-thread-role") || "";
    selectedThreadRole = tr;
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
    const t = event.target;
    const bidSel = t instanceof Element ? t.closest("[data-lhai-select-bid]") : null;
    if (bidSel instanceof HTMLButtonElement) {
      event.preventDefault();
      void handleCustomerSelectBidClick(bidSel);
      return;
    }
    if (t instanceof Element && t.closest("[data-lhai-intake-submit]")) {
      const root = t.closest("[data-lhai-intake-form]");
      if (root instanceof HTMLElement) void runIntakePromptSubmit(root, false);
      return;
    }
    if (t instanceof Element && t.closest("[data-lhai-intake-skip]")) {
      const root = t.closest("[data-lhai-intake-form]");
      if (root instanceof HTMLElement) void runIntakePromptSubmit(root, true);
      return;
    }
    const wfBtn = t instanceof Element ? t.closest("[data-lhai-wf-action]") : null;
    if (wfBtn instanceof HTMLButtonElement) {
      const act = String(wfBtn.getAttribute("data-lhai-wf-action") || "").trim();
      if (act === "intake_start") {
        event.preventDefault();
        void runWorkflowIntakeStart(wfBtn);
        return;
      }
      if (act === "select_offer") {
        event.preventDefault();
        const wid = String(wfBtn.getAttribute("data-wf-id") || "").trim();
        const oid = String(wfBtn.getAttribute("data-offer-id") || "").trim();
        void runWorkflowSelectOffer(wfBtn, wid, oid);
        return;
      }
    }
    if (event.target.closest("#lhaiEscalateToOpsBtn")) {
      event.preventDefault();
      void escalateToCustomerCenter("[운영자 요청] 운영자의 도움이 필요합니다.");
      return;
    }
    if (event.target.closest("#lhaiEscalateInPersonBtn")) {
      event.preventDefault();
      void escalateToCustomerCenter("[대면 지원 요청] 대면 지원을 요청드립니다.");
      return;
    }
    if (event.target.closest("#lhaiEscalateServiceToAdminBtn")) {
      event.preventDefault();
      void escalateServiceThreadToAdminChannel();
    }
  });

  await refresh();

  bindMessageAiFeedback({
    getContext: () => ({
      operatorInboxMode,
      customerProfileId: operatorInboxMode ? threadOwnerProfileId : customerProfileId,
    }),
  });
}

export { initMessagesPage };

initMessagesPage();
