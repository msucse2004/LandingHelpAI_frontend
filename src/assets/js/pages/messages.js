import { mountMessagesSidebar } from "../components/sidebar.js";
import { mountCustomerInboxShell } from "../layouts/customer-inbox-shell.js";
import { mountPartnerShell } from "../layouts/partner-shell.js";
import { renderCustomerMessagesContentHtml, renderPartnerMessagesContentHtml } from "./partner-messages-content.js";
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
import { coerceToIsoDateInputValue, effectiveIntakeInputType, intakeLabelFromFieldElement, intakeRequiredFieldError, intakeRequiredFieldErrorForInputType, intakeViewerFieldLabel, isCurrencyUsdInputType, isEffectivelyEmptyIntakeHelpText, normalizeIntakeFormPromptUiPayload, normalizePrefillInputScalar, prefillCandidateOptionLabel, prefillUsesTextInputNotDropdown, renderCurrencyUsdInputControlsHtml, resolveIntakeFieldInitialValue, shouldHideIntakeBlockTitle } from "../intake/intake-form-presentation.js";
import { formatMessageTimestamp, resolveBackendMediaUrl, safeText } from "../core/utils.js";
import { getRealtimeStatus, subscribeRealtimeEvents } from "../core/realtime-client.js";
import { logRealtimeDiagnostics, mountRealtimeDiagnosticBadge } from "../core/realtime-diagnostics.js";
import {
  completeLatencyForMessagesAfterLoad,
  getMessagesPollingIntervalsForDebug,
  markDetailFetchFinished,
  markDetailFetchStarted,
  markMessageCreatedHandlerStarted,
} from "../core/realtime-message-latency.js";
import {
  claimMessageCreatedRealtimeEvent,
  releaseMessageCreatedRealtimeEvent,
} from "../core/messages-realtime-dedupe.js";
import {
  canRunMessagesSafetySyncTick,
  messagesFallbackPollIntervalMs,
  messagesRealtimeLifecycleFromDetail,
  MESSAGES_SAFETY_SYNC_MS_MIN,
  messagesSafetyPollIntervalMs,
  shouldRunMessagesFallbackPoll,
  shouldUseMessagesSafetyPolling,
} from "../core/messages-realtime-policy.js";
import {
  buildCustomerBidResultsHref,
  isBiddingBidUpdatedPayload,
  isBiddingRealtimeSseEvent,
  normalizeBidUpdatedPayload,
  bidUpdatedToastAllowed,
  resolveBiddingEventKind,
  showBidUpdatedToast,
} from "../core/bid-realtime.js";
import { t } from "../core/i18n-client.js";
import { formatLocalizedDataReadout, localizedEnumLabel, localizedStatus } from "../core/i18n-dynamic.js";
import { applyI18nToDom, wireDynamicPageI18nRefresh } from "../core/i18n-dom.js";
import { bootAppPageContent } from "../core/app-page-i18n-boot.js";
import {
  adminThreadDisplayTitle,
  formPromptDisplayLabel,
  intakeUiPayloadNeedsTranslationPlaceholder,
  intakeUiPayloadSameLocale,
  messageIntakeWidgetType,
  logMessageTranslationFailures,
  messageShouldShowViewOriginalToggle,
  messageTranslationNoticeKind,
  messageTranslationPreparingFormLabel,
  messageTranslationRetryLaterLabel,
  messageViewOriginalToggleLabel,
  messageViewerBody,
  messageViewerTitle,
  mergeServiceThreadDisplayFields,
  serviceThreadDisplayName,
  threadListPreviewBody,
  workflowCardViewerBody,
  workflowCardViewerTitle,
} from "./messages-display-logic.js?v=20260710g";
import { bindMessageAiFeedback, buildAiFeedbackHtml } from "./message-ai-feedback.js";
import {
  bindMessageTranslationReport,
  buildMessageTranslationReportHtml,
} from "./message-translation-report.js";
import {
  buildCustomerBidResultsPageHref,
  formatCountdownToExpiry,
  formatMoney,
  formatQuoteRequestUsage,
  formatRelativeTimeKo,
  isCarPurchaseBidListResponse,
  resolveCustomerBidDisplayPhase,
} from "./customer-bid-results-logic.js";
import { formatBidDeadlineForUi } from "../core/bid-deadline-display.js";
import { setInnerHtmlIfChanged } from "../core/page-refresh.js";
import {
  assertServiceItemUuid,
  intakeStartServiceItemIdFromCardJson,
  isCatalogRecServiceItemUuidString,
} from "../lib/catalog-rec-service-item-id.js";
import { loadBiddingNotificationDebugInto } from "./admin-bidding-notification-debug-ui.js";
import { buildIntakeDispatchDiagnosticsHtml } from "./messages-intake-diagnostics-ui.js";

/**
 * Step 13 — visible fallback policy (Messages page):
 * - Message bubbles: prefer display_body; cross-locale failure → placeholder (View original reveals body).
 * - Workflow cards: display_title/display_body only; never card_json or raw title/body cross-locale.
 * - Intake widgets: prefer display_ui_payload; never raw ui_payload labels/options cross-locale.
 * - Thread list preview: last_message_display_body only; wrong-locale failure → preparing preview.
 * - Service thread titles: display_header_title/display_service_name; failure → preparing title.
 * - Same-locale + not_required may show stored source when display_* is absent.
 * - Submit always uses canonical field_id / option value from DOM (not translated labels).
 * - Composer sends only user-typed text (#messageChatInput); never display_body.
 * - View original toggles message body only; intake widgets stay on display_ui_payload.
 */

/** @type {Record<string, string>} */
const MESSAGE_TYPE_LABEL_FALLBACKS = {
  SYSTEM: "System",
  ADMIN: "Admin",
  AI: "AI",
  PAYMENT: "Payment",
  DOCUMENT: "Document",
  CHAT: "Chat",
  TEXT: "Text",
  WORKFLOW_CARD: "Workflow",
};

/** @param {string | null | undefined} rawType */
function messageTypeDisplayLabel(rawType) {
  return localizedEnumLabel("messages.message_type", rawType, MESSAGE_TYPE_LABEL_FALLBACKS);
}

/** Workflow `card_json` state fields — display API values as-is unless backend adds display_* fields. */
/** @param {string | null | undefined} raw */
function workflowCardStateDisplayValue(raw) {
  return String(raw ?? "").trim();
}

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

function isLhaiDebugMessageTranslation() {
  try {
    if (typeof window === "undefined" || !window.localStorage) return false;
    return (
      window.localStorage.getItem("LHAI_DEBUG_MESSAGE_TRANSLATION") === "1" ||
      window.localStorage.getItem("LHAI_DEBUG_CUSTOMER_MESSAGES") === "1"
    );
  } catch {
    return false;
  }
}

function logCustomerMessageTranslationFailures(messages, label) {
  if (!isLhaiDebugMessageTranslation() || operatorInboxMode || partnerInboxMode) return;
  logMessageTranslationFailures(messages, {
    label,
    logFn: (...args) => {
      // eslint-disable-next-line no-console
      console.info(...args);
    },
  });
}

function isMessagesDebugRealtime() {
  try {
    return typeof window !== "undefined" && window.localStorage?.getItem("LHAI_DEBUG_REALTIME") === "1";
  } catch {
    return false;
  }
}

function messagesRtDebug(message, detail) {
  if (!isMessagesDebugRealtime()) return;
  logRealtimeDiagnostics("messages-realtime", String(message || ""), detail ?? null);
}

/**
 * @param {{ refreshSource?: string; reason?: string }} options
 * @returns {"sse" | "fallback-poll" | "safety-sync" | string | null}
 */
function resolveMessagesRefreshSource(options = {}) {
  const explicit = String(options.refreshSource || "").trim();
  if (explicit) return explicit;
  const reason = String(options.reason || "").trim();
  if (reason === "fallback-poll") return "fallback-poll";
  if (reason === "safety-sync") return "safety-sync";
  if (reason.startsWith("message.created")) return "sse";
  return reason || null;
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
  logCustomerMessageTranslationFailures(arr, "messages_page_after_render");
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
/** @type {Record<string, unknown> | null} */
let customerBidPanelSnapshot = null;
/** @type {Array<Record<string, unknown>>} */
let cachedThreadsForUi = [];
/** @type {ReturnType<typeof setInterval> | null} */
let customerBidCountdownTimer = null;

function stopCustomerBidCountdownTimer() {
  if (customerBidCountdownTimer != null) {
    clearInterval(customerBidCountdownTimer);
    customerBidCountdownTimer = null;
  }
}

function startCustomerBidCountdownTimer() {
  stopCustomerBidCountdownTimer();
  const tick = () => {
    const el = document.querySelector("#messageCarBidCountdown");
    const snap = customerBidPanelSnapshot;
    if (!(el instanceof HTMLElement) || !snap) return;
    el.textContent = formatBidDeadlineForUi(snap);
  };
  customerBidCountdownTimer = window.setInterval(tick, 60000);
  tick();
}
let customerBidPanelAwaitingFetch = false;
/** 스레드 전환 시 초기화 — 같은 스레드 재조회에서는 선택 완료 배너 유지 */
let customerBidPanelBoundThreadId = "";
let customerBidSelectBannerUntil = 0;
let customerBidSelectBannerThreadId = "";
/** @type {string} */
let threadListLoadError = "";
/** 첫 목록 로드 직후 ``thread_id`` URL 파라미터가 목록에 없을 때 한 번만 ``console.warn`` */
let messagesUrlRequestedThreadId = "";

/** @param {unknown} a @param {unknown} b */
function threadIdEquals(a, b) {
  return String(a ?? "").trim().toLowerCase() === String(b ?? "").trim().toLowerCase();
}

/** @type {{ first_name?: string, last_name?: string, full_name?: string } | null | undefined} */
let cachedMeBasicInfo;
/** @returns {string} optional initial thread id from URL (``thread_id`` / ``thread``) for deep-link selection */
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
  const first = me && typeof me === "object" ? String(me.first_name || "").trim() : "";
  const last = me && typeof me === "object" ? String(me.last_name || "").trim() : "";
  const full = me && typeof me === "object" ? String(me.full_name || "").trim() : "";
  for (const m of messages) {
    if (!m || typeof m !== "object") continue;
    // Prefill values belong on the canonical stored payload (not display_* labels).
    const up = m.ui_payload && typeof m.ui_payload === "object" ? /** @type {Record<string, unknown>} */ (m.ui_payload) : null;
    if (!up) continue;
    if (String(up.widget_type || "") !== "form_prompt") continue;
    normalizeIntakeFormPromptUiPayload(up);
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
      `<a class="lhai-button lhai-button--primary lhai-messages-cta-link" href="${href}">${escapeHtml(t("messages.actions.view_quote", "View quote"))}</a>`
    );
  }
  if (pdfUrl) {
    parts.push(
      `<a class="lhai-button lhai-button--primary lhai-messages-cta-link" href="${pdfUrl}" target="_blank" rel="noopener">${escapeHtml(t("messages.actions.download_view_pdf", "Download/View PDF"))}</a>`
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
      `<a class="lhai-button lhai-button--primary lhai-messages-cta-link" href="${href}">${escapeHtml(t("messages.actions.view_invoice", "View invoice"))}</a>`
    );
  }
  if (pdfUrl) {
    parts.push(
      `<a class="lhai-button lhai-button--primary lhai-messages-cta-link" href="${pdfUrl}" target="_blank" rel="noopener">${escapeHtml(t("messages.actions.download_view_pdf", "Download/View PDF"))}</a>`
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
  return `<div class="lhai-quote-proposed-links"><a class="lhai-button lhai-button--primary lhai-messages-cta-link" href="${href}">${escapeHtml(t("messages.actions.related_invoice", "Related invoice"))}</a></div>`;
}

/** 정착 일정 고객 공개 알림 — 앱 내 `schedule.html` 버튼 (`linked_schedule_id` 또는 본문 URL) */
function renderScheduleReleasedLinksHtml(message) {
  if (!isScheduleReleasedToCustomerMessage(message)) return "";
  const sid =
    String(message.linked_schedule_id || "").trim() || extractScheduleIdFromText(message.body);
  if (!sid) return "";
  const href = `schedule.html?schedule_id=${encodeURIComponent(sid)}`;
  return `<div class="lhai-quote-proposed-links"><a class="lhai-button lhai-button--primary lhai-messages-cta-link" href="${href}">${escapeHtml(t("messages.actions.view_schedule", "View schedule"))}</a></div>`;
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
  if (!raw) return t("messages.thread.no_customer_id", "No customer ID");
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

/** 목록 한 줄: `서비스명 · 배지` (예: Phone Setup · AI Agent). */
function serviceThreadListHeadline(row) {
  const name = serviceThreadDisplayName(row, "", t) || t("messages.thread.default_service", "Service");
  const mode = deliveryModeBadgeLabel(row);
  if (mode) return `${name} · ${mode}`;
  return name;
}

/** @param {Record<string, unknown> | null | undefined} threadMeta */
function effectiveThreadHeaderMeta(threadMeta) {
  const base =
    threadMeta && typeof threadMeta === "object"
      ? threadMeta
      : currentThreadHeaderMeta && typeof currentThreadHeaderMeta === "object"
        ? currentThreadHeaderMeta
        : {};
  return mergeServiceThreadDisplayFields(base, currentThreadDetailThread);
}

/** Detail API may return fresher ``display_*`` than the list row — merge and re-sync header. */
function reconcileThreadHeaderMetaAfterDetailLoad() {
  if (!selectedThreadId) return;
  const merged = effectiveThreadHeaderMeta(currentThreadHeaderMeta);
  currentThreadHeaderMeta = /** @type {Record<string, unknown>} */ ({ ...merged });
  syncChatHeader(currentThreadHeaderMeta);
}

/** @param {Record<string, unknown> | null | undefined} row */
const deliveryModeBadgeLabel = deliveryModeBadgeFromThreadMeta;

function isInPersonServiceThread(row) {
  return String(row?.selected_delivery_mode || "").toUpperCase() === "IN_PERSON";
}

/** SERVICE thread detail: delivery pill next to title (same vocabulary as preview). */
function applyServiceDeliveryBadge(el, label) {
  if (!(el instanceof HTMLElement)) return;
  const text = String(label || "").trim();
  const show = Boolean(text) && text !== "Service";
  el.textContent = show ? text : "";
  el.hidden = !show;
  const mod = deliveryBadgeModifierFromLabel(text);
  el.className = `lhai-service-header__delivery-badge lhai-service-header__delivery-badge--${mod}`;
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
  if (h === "AI_AGENT") return t("messages.handler.subtitle.ai_agent", "Handler: AI Agent (limited guidance)");
  if (h === "HUMAN_AGENT") return t("messages.handler.subtitle.human_agent", "Handler: operations team");
  if (h === "SYSTEM") return t("messages.handler.subtitle.system", "Handler: system notification");
  return t("messages.handler.subtitle.unknown", "Handler: confirming guidance mode");
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
    parts.push(`<span class="lhai-thread-badge lhai-thread-badge--admin">${escapeHtml(t("messages.thread.customer_center", "Customer center"))}</span>`);
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

/** @type {Set<string>} */
const showOriginalMessageIds = new Set();

function messageViewerText(message) {
  const id = String(message?.id || "").trim();
  const original = scheduleReleasedMessageDisplayBody(message);
  const showingOriginal = Boolean(id && showOriginalMessageIds.has(id));
  return messageViewerBody(message, {
    showOriginal: showingOriginal,
    originalBody: original,
    translate: (key, fallback) => t(key, fallback),
  });
}

function messageTranslationNoticeHtml(message) {
  const kind = messageTranslationNoticeKind(message);
  if (kind === "unavailable") {
    return `<p class="lhai-chat-bubble__translation-unavailable u-text-muted">${escapeHtml(
      messageTranslationRetryLaterLabel((key, fallback) => t(key, fallback))
    )}</p>`;
  }
  if (kind === "pending") {
    return "";
  }
  return "";
}

function messageViewOriginalToggleHtml(message) {
  if (!messageShouldShowViewOriginalToggle(message)) {
    return "";
  }
  const msgId = String(message?.id || "").trim();
  const showingOriginal = Boolean(msgId && showOriginalMessageIds.has(msgId));
  const label = messageViewOriginalToggleLabel(showingOriginal, (key, fallback) => t(key, fallback));
  return `<button type="button" class="lhai-chat-bubble__view-original" data-message-id="${escapeHtml(msgId)}" aria-pressed="${showingOriginal ? "true" : "false"}">${escapeHtml(label)}</button>`;
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
    threadIdEquals(selectedThreadId, row.thread_id) ? "is-active" : "",
  ]
    .filter(Boolean)
    .join(" ");
  const headline = isAdmin ? safeText(adminThreadDisplayTitle(row, t)) : safeText(serviceThreadListHeadline(row));
  const lastType = String(row.message_type || "").trim();
  const customerIdBlock = operatorInboxMode
    ? `<div class="lhai-message-item__customer-id"><span class="lhai-message-item__customer-id-label">${escapeHtml(t("messages.thread.customer_label", "Customer"))}</span> ${safeText(threadCustomerDisplayLabel(String(row.customer_profile_id || "")))}</div>`
    : "";
  const unreadPill =
    operatorInboxMode && rowUnread
      ? `<span class="lhai-message-item__unread-pill" title="${escapeHtml(t("messages.thread.unread_title", "Unread"))}">${escapeHtml(t("messages.thread.unread", "Unread"))}</span>`
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
        ${lastType ? `<div class="u-text-muted lhai-message-item__last-type">${escapeHtml(formatLocalizedDataReadout("messages.thread.recent_type", "Recent type: {value}", messageTypeDisplayLabel(lastType)))}</div>` : ""}
        <p class="u-text-muted lhai-message-item__preview">${escapeHtml(threadListPreviewBody(row, (key, fallback) => t(key, fallback)))}</p>
      </article>
    `;
}

/** 서비스 스레드 표시용: 동일 서비스·배송 방식·카탈로그 조합이 API에서 중복될 때 한 줄만 남깁니다. */
function serviceThreadDedupeKey(row) {
  const raw = String(row?.service_item_id ?? "").trim();
  const itemId = isCatalogRecServiceItemUuidString(raw) ? raw : "";
  const name = serviceThreadDisplayName(row, "", t).trim().toLowerCase();
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
    const preferred = arr.find((x) => threadIdEquals(x.thread_id, sid));
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
    container.innerHTML = `<div class="lhai-state lhai-state--empty">${escapeHtml(t("messages.list.empty", "No conversations yet."))}</div>`;
    return;
  }
  const adminRows = threads.filter((t) => normalizeThreadRole(t) === "ADMIN");
  const serviceRows = threads.filter((t) => normalizeThreadRole(t) !== "ADMIN");
  const blocks = [];
  if (adminRows.length) {
    blocks.push(
      `<div class="lhai-thread-list__group" role="group" aria-label="${escapeHtml(t("messages.list.group.admin_aria", "Customer center"))}"><div class="lhai-thread-list__group-label">${escapeHtml(t("messages.list.group.admin_label", "Customer center · Global support"))}</div>${adminRows.map(renderThreadListRow).join("")}</div>`
    );
  }
  if (serviceRows.length) {
    blocks.push(
      `<div class="lhai-thread-list__group" role="group" aria-label="${escapeHtml(t("messages.list.group.service_aria", "Service conversations"))}"><div class="lhai-thread-list__group-label">${escapeHtml(t("messages.list.group.service_label", "Service conversations"))}</div>${serviceRows.map(renderThreadListRow).join("")}</div>`
    );
  }
  container.innerHTML = blocks.length ? blocks.join("") : threads.map(renderThreadListRow).join("");
}

/** @param {HTMLElement} wrap @param {number} [thresholdPx] */
function isChatScrollNearBottom(wrap, thresholdPx = 120) {
  if (!(wrap instanceof HTMLElement)) return true;
  const { scrollTop, scrollHeight, clientHeight } = wrap;
  return scrollHeight - scrollTop - clientHeight <= thresholdPx;
}

function scrollChatToBottom() {
  const wrap = document.querySelector("#messageChatScroll");
  if (wrap) wrap.scrollTop = wrap.scrollHeight;
}

/** 현재 thread 기준 하단 미확인 신규 메시지 수(위로 스크롤한 상태에서 realtime 도착). */
let chatNewMessagesBelowCount = 0;
let chatScrollStateThreadId = "";
let chatScrollListenersWired = false;

function resetChatNewMessagesBelowState() {
  chatNewMessagesBelowCount = 0;
  updateChatNewMessagesBelowIndicator();
}

function updateChatNewMessagesBelowIndicator() {
  const btn = document.querySelector("#messageChatNewBelow");
  if (!(btn instanceof HTMLButtonElement)) return;
  const n = Math.max(0, Number(chatNewMessagesBelowCount) || 0);
  if (n <= 0) {
    btn.hidden = true;
    btn.setAttribute("aria-hidden", "true");
    return;
  }
  const label =
    n === 1
      ? t("messages.chat.new_below_one", "1 new message")
      : localizedStatus("messages.chat.new_below_many", "{count} new messages", { count: n });
  btn.textContent = label;
  btn.hidden = false;
  btn.setAttribute("aria-hidden", "false");
}

function ensureChatScrollRealtimeUxWired() {
  if (chatScrollListenersWired) return;
  chatScrollListenersWired = true;
  document.addEventListener("click", (event) => {
    const btn = event.target instanceof Element ? event.target.closest("#messageChatNewBelow") : null;
    if (!(btn instanceof HTMLButtonElement)) return;
    event.preventDefault();
    resetChatNewMessagesBelowState();
    scrollChatToBottom();
  });
  document.addEventListener(
    "scroll",
    (event) => {
      const wrap = event.target;
      if (!(wrap instanceof HTMLElement) || wrap.id !== "messageChatScroll") return;
      if (isChatScrollNearBottom(wrap)) resetChatNewMessagesBelowState();
    },
    true,
  );
}

function syncChatScrollThreadContext() {
  const tid = String(selectedThreadId || "").trim();
  if (tid === chatScrollStateThreadId) return;
  chatScrollStateThreadId = tid;
  resetChatNewMessagesBelowState();
}

/** @param {unknown} raw */
function normalizeIntakeInputType(raw) {
  const t = String(raw || "text").toLowerCase();
  if (t === "dropdown") return "select";
  if (t === "question_group") return "question_group";
  if (t === "intake_multi") return "intake_multi";
  return t;
}

/**
 * Deep-clone a plain JSON-like object (intake ui_payload shapes).
 * @param {unknown} value
 * @returns {any}
 */
function cloneIntakePayloadJson(value) {
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return null;
  }
}

/** Scalar keys copied from canonical ``ui_payload`` onto display copy (never labels). */
const INTAKE_CANONICAL_VALUE_KEYS = [
  "value",
  "prefill_value",
  "prefill_resolved_value",
  "default_value",
  "is_prefilled",
  "prefill_blocked",
  "prefill_editable",
  "allow_manual_input",
  "prompt_submitted",
];

/**
 * @param {Record<string, unknown>} target
 * @param {Record<string, unknown> | null | undefined} source
 */
function overlayIntakeCanonicalScalars(target, source) {
  if (!target || typeof target !== "object" || !source || typeof source !== "object") return;
  for (const key of INTAKE_CANONICAL_VALUE_KEYS) {
    if (Object.prototype.hasOwnProperty.call(source, key)) {
      target[key] = source[key];
    }
  }
}

/**
 * Copy answer/prefill scalars from canonical ``ui_payload`` onto a display clone.
 * Labels stay from ``display_ui_payload``; ids/values stay canonical.
 * @param {Record<string, unknown>} display
 * @param {Record<string, unknown> | null | undefined} canonical
 */
function overlayCanonicalIntakeValues(display, canonical) {
  if (!display || typeof display !== "object" || !canonical || typeof canonical !== "object") return;
  overlayIntakeCanonicalScalars(display, canonical);

  const dChildren = Array.isArray(display.children) ? display.children : [];
  const cChildren = Array.isArray(canonical.children) ? canonical.children : [];
  for (let i = 0; i < dChildren.length; i += 1) {
    const dCh = dChildren[i];
    const cCh = cChildren[i];
    if (dCh && typeof dCh === "object" && cCh && typeof cCh === "object") {
      overlayIntakeCanonicalScalars(
        /** @type {Record<string, unknown>} */ (dCh),
        /** @type {Record<string, unknown>} */ (cCh)
      );
    }
  }

  const dSteps = Array.isArray(display.steps) ? display.steps : [];
  const cSteps = Array.isArray(canonical.steps) ? canonical.steps : [];
  for (let i = 0; i < dSteps.length; i += 1) {
    const dSt = dSteps[i];
    const cSt = cSteps[i];
    if (!dSt || typeof dSt !== "object" || !cSt || typeof cSt !== "object") continue;
    overlayIntakeCanonicalScalars(
      /** @type {Record<string, unknown>} */ (dSt),
      /** @type {Record<string, unknown>} */ (cSt)
    );
    const dSc = Array.isArray(dSt.children) ? dSt.children : [];
    const cSc = Array.isArray(cSt.children) ? cSt.children : [];
    for (let j = 0; j < dSc.length; j += 1) {
      const dCh = dSc[j];
      const cCh = cSc[j];
      if (dCh && typeof dCh === "object" && cCh && typeof cCh === "object") {
        overlayIntakeCanonicalScalars(
          /** @type {Record<string, unknown>} */ (dCh),
          /** @type {Record<string, unknown>} */ (cCh)
        );
      }
    }
  }
}

/**
 * Prefer viewer-locale ``display_ui_payload``; never show raw labels cross-locale on failure.
 * Returns a deep copy so render/normalize never mutates API message objects.
 * @param {Record<string, unknown> | null | undefined} m
 * @returns {Record<string, unknown> | null}
 */
function resolveMessageUiPayloadForDisplay(m) {
  if (!m || typeof m !== "object") return null;
  if (intakeUiPayloadNeedsTranslationPlaceholder(m)) {
    return null;
  }
  let preferred =
    m.display_ui_payload && typeof m.display_ui_payload === "object"
      ? m.display_ui_payload
      : null;
  if (!preferred && intakeUiPayloadSameLocale(m)) {
    preferred =
      m.ui_payload && typeof m.ui_payload === "object"
        ? /** @type {Record<string, unknown>} */ (m.ui_payload)
        : null;
  }
  if (!preferred) return null;
  const copy = cloneIntakePayloadJson(preferred);
  if (!copy || typeof copy !== "object") return null;
  const canonical =
    m.ui_payload && typeof m.ui_payload === "object"
      ? /** @type {Record<string, unknown>} */ (m.ui_payload)
      : null;
  if (canonical && preferred !== canonical) {
    overlayCanonicalIntakeValues(/** @type {Record<string, unknown>} */ (copy), canonical);
  }
  if (String(copy.widget_type || "") === "form_prompt") {
    normalizeIntakeFormPromptUiPayload(/** @type {Record<string, unknown>} */ (copy));
  }
  return /** @type {Record<string, unknown>} */ (copy);
}

/** Placeholder when intake ``display_ui_payload`` is unavailable for the viewer locale. */
function renderIntakeFormPreparingPlaceholder() {
  const label = messageTranslationPreparingFormLabel((key, fallback) => t(key, fallback));
  return `<div class="lhai-chat-form-prompt lhai-chat-form-prompt--preparing" role="status">
    <p class="lhai-chat-form-prompt__label">${escapeHtml(label)}</p>
  </div>`;
}

/**
 * Canonical stored widget payload for submit/identity (never display_*).
 * @param {Record<string, unknown> | null | undefined} m
 * @returns {Record<string, unknown> | null}
 */
function resolveMessageUiPayloadCanonical(m) {
  if (!m || typeof m !== "object") return null;
  if (m.ui_payload && typeof m.ui_payload === "object") {
    return /** @type {Record<string, unknown>} */ (m.ui_payload);
  }
  return null;
}

/** @param {HTMLElement} formRoot */
function getUiPayloadForFormRoot(formRoot) {
  const mid = formRoot.getAttribute("data-message-id") || "";
  const m = currentThreadMessages.find((x) => String(x.id || "") === mid);
  return resolveMessageUiPayloadForDisplay(
    m && typeof m === "object" ? /** @type {Record<string, unknown>} */ (m) : null
  );
}

/**
 * Canonical payload for submit paths that need field_id / option value structure.
 * @param {HTMLElement} formRoot
 */
function getCanonicalUiPayloadForFormRoot(formRoot) {
  const mid = formRoot.getAttribute("data-message-id") || "";
  const m = currentThreadMessages.find((x) => String(x.id || "") === mid);
  return resolveMessageUiPayloadCanonical(
    m && typeof m === "object" ? /** @type {Record<string, unknown>} */ (m) : null
  );
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

const PREFILL_MANUAL_VALUE = "__prefill_manual__";

/** @param {Record<string, unknown>} row */
function usesPrefillCandidatesDropdown(row) {
  if (Boolean(row.prefill_blocked)) return false;
  if (prefillUsesTextInputNotDropdown(row)) return false;
  const mode = String(row.prefill_mode || row.prefill_use_dropdown ? "dropdown_existing_values" : "");
  if (mode !== "dropdown_existing_values" && !row.prefill_use_dropdown) return false;
  const list = Array.isArray(row.prefill_candidates) ? row.prefill_candidates : [];
  return list.length > 0;
}

/** @param {Record<string, unknown>} row */
function usesPrefillConfirm(row) {
  if (Boolean(row.prefill_blocked)) return false;
  const mode = String(row.prefill_mode || "");
  if (mode !== "confirm_existing_value" && !row.prefill_use_confirm) return false;
  const pv = String(row.prefill_value ?? row.prefill_resolved_value ?? row.value ?? "").trim();
  return Boolean(pv);
}

/**
 * @param {Record<string, unknown>} row
 * @param {string} suffix
 * @param {string} ariaLabel
 */
function renderPrefillCandidatesDropdownHtml(row, suffix, ariaLabel) {
  const candidates = Array.isArray(row.prefill_candidates)
    ? /** @type {Array<Record<string, unknown>>} */ (row.prefill_candidates)
    : [];
  const allowManual = row.allow_manual_input !== false;
  const selectedRaw = String(row.prefill_value ?? row.value ?? "").trim();
  const selected = normalizePrefillInputScalar(selectedRaw, row);
  const optHtml = candidates
    .map((c) => {
      const val = String(c.value ?? "");
      const lab = prefillCandidateOptionLabel(c);
      const src = String(c.source || "");
      const selMark = selected && val === selected ? " selected" : "";
      return `<option value="${escapeHtml(val)}" data-prefill-source="${escapeHtml(src)}"${selMark}>${escapeHtml(lab)}</option>`;
    })
    .join("");
  const manualOpt = allowManual
    ? `<option value="${escapeHtml(PREFILL_MANUAL_VALUE)}">${escapeHtml(t("messages.intake.prefill.enter_manually", "Enter manually"))}</option>`
    : "";
  const manualHidden = allowManual ? " hidden" : "";
  return `<div class="lhai-chat-form-prompt__prefill-dropdown" data-lhai-prefill-dropdown>
    <select class="lhai-chat-form-prompt__input lhai-chat-form-prompt__select lhai-chat-form-prompt__prefill-select" aria-label="${escapeHtml(ariaLabel)}" data-lhai-prefill-select>
      <option value="">${escapeHtml(t("messages.intake.select_placeholder", "Please select"))}</option>
      ${optHtml}
      ${manualOpt}
    </select>
    <input type="text" class="lhai-chat-form-prompt__input lhai-chat-form-prompt__text lhai-chat-form-prompt__prefill-manual"${manualHidden} maxlength="4000" placeholder="${escapeHtml(t("messages.intake.prefill.manual_placeholder", "Enter value"))}" aria-label="${escapeHtml(ariaLabel)}" />
  </div>`;
}

/**
 * @param {Record<string, unknown>} row
 * @param {string} suffix
 * @param {string} ariaLabel
 */
function renderPrefillConfirmHtml(row, suffix, ariaLabel) {
  const pvRaw = String(row.prefill_value ?? row.prefill_resolved_value ?? "").trim();
  const pv = normalizePrefillInputScalar(pvRaw, row);
  const plab = String(row.prefill?.source_label || row.prefill_source || "").trim();
  const display = plab ? `${pv} (${plab})` : pv;
  const name = `lhai-intake-pf-confirm-${suffix}`;
  return `<div class="lhai-chat-form-prompt__prefill-confirm" data-lhai-prefill-confirm data-prefill-value="${escapeHtml(pv)}" data-prefill-source="${escapeHtml(String(row.prefill_source || ""))}">
    <p class="lhai-chat-form-prompt__prefill-confirm-text">${escapeHtml(t("messages.intake.prefill.saved_value", "Saved value"))}: <strong>${escapeHtml(display)}</strong></p>
    <div class="lhai-chat-form-prompt__radio-group" role="radiogroup" aria-label="${escapeHtml(ariaLabel)}">
      <label class="lhai-chat-form-prompt__radio-label" for="${escapeHtml(`${name}-y`)}">
        <input type="radio" name="${escapeHtml(name)}" id="${escapeHtml(`${name}-y`)}" value="yes" class="lhai-chat-form-prompt__radio lhai-chat-form-prompt__prefill-confirm-radio" checked />
        <span>${escapeHtml(t("messages.intake.prefill.confirm_yes", "That's correct"))}</span>
      </label>
      <label class="lhai-chat-form-prompt__radio-label" for="${escapeHtml(`${name}-n`)}">
        <input type="radio" name="${escapeHtml(name)}" id="${escapeHtml(`${name}-n`)}" value="no" class="lhai-chat-form-prompt__radio lhai-chat-form-prompt__prefill-confirm-radio" />
        <span>${escapeHtml(t("messages.intake.prefill.change_value", "Use a different value"))}</span>
      </label>
    </div>
    <div class="lhai-chat-form-prompt__prefill-confirm-alt" hidden>
      <input type="text" class="lhai-chat-form-prompt__input lhai-chat-form-prompt__text lhai-chat-form-prompt__prefill-confirm-alt-input" maxlength="4000" aria-label="${escapeHtml(ariaLabel)}" />
    </div>
  </div>`;
}

/** @param {HTMLElement} root */
function togglePrefillManualInput(root) {
  const wrap = root.querySelector("[data-lhai-prefill-dropdown]");
  if (!(wrap instanceof HTMLElement)) return;
  const sel = wrap.querySelector(".lhai-chat-form-prompt__prefill-select");
  const manual = wrap.querySelector(".lhai-chat-form-prompt__prefill-manual");
  if (!(sel instanceof HTMLSelectElement) || !(manual instanceof HTMLInputElement)) return;
  const isManual = String(sel.value || "") === PREFILL_MANUAL_VALUE;
  manual.hidden = !isManual;
  manual.required = isManual;
  if (!isManual) manual.value = "";
}

/** @param {HTMLElement} root */
function togglePrefillConfirmAlt(root) {
  const wrap = root.querySelector("[data-lhai-prefill-confirm]");
  if (!(wrap instanceof HTMLElement)) return;
  const alt = wrap.querySelector(".lhai-chat-form-prompt__prefill-confirm-alt");
  const no = wrap.querySelector('.lhai-chat-form-prompt__prefill-confirm-radio[value="no"]');
  if (!(alt instanceof HTMLElement) || !(no instanceof HTMLInputElement)) return;
  alt.hidden = !no.checked;
}

/**
 * @param {HTMLElement | null} sec
 * @param {unknown} [fieldLabel]
 * @returns {{ ok: boolean, valueJson?: Record<string, unknown>, error?: string }}
 */
function collectPrefillCandidatesFromSection(sec, fieldRowOrLabel = "") {
  const fieldLabel = intakeLabelFromFieldElement(sec instanceof HTMLElement ? sec : null, fieldRowOrLabel);
  if (!(sec instanceof HTMLElement)) {
    return { ok: false, error: t("messages.intake.error.input_not_found", "Could not find the input field.") };
  }
  const sel = sec.querySelector(".lhai-chat-form-prompt__prefill-select");
  if (!(sel instanceof HTMLSelectElement)) {
    return { ok: false, error: t("messages.intake.error.select_not_found", "Could not find the selection field.") };
  }
  const v = String(sel.value || "").trim();
  if (!v) return { ok: false, error: intakeRequiredFieldError(fieldLabel, "select") };
  if (v === PREFILL_MANUAL_VALUE) {
    const manual = sec.querySelector(".lhai-chat-form-prompt__prefill-manual");
    if (!(manual instanceof HTMLInputElement)) {
      return { ok: false, error: t("messages.intake.error.manual_input_not_found", "Could not find the manual input field.") };
    }
    const mv = String(manual.value || "").trim();
    if (!mv) return { ok: false, error: intakeRequiredFieldError(fieldLabel, "input") };
    return { ok: true, valueJson: { value: mv } };
  }
  const opt = sel.selectedOptions[0];
  const src = opt ? String(opt.getAttribute("data-prefill-source") || "").trim() : "";
  const out = { value: v };
  if (src) out._prefill_source = src;
  return { ok: true, valueJson: out };
}

/**
 * @param {HTMLElement | null} sec
 * @param {unknown} [fieldLabel]
 * @returns {{ ok: boolean, valueJson?: Record<string, unknown>, error?: string }}
 */
function collectPrefillConfirmFromSection(sec, fieldRowOrLabel = "") {
  const fieldLabel = intakeLabelFromFieldElement(sec instanceof HTMLElement ? sec : null, fieldRowOrLabel);
  if (!(sec instanceof HTMLElement)) {
    return { ok: false, error: t("messages.intake.error.confirm_not_found", "Could not find the confirmation field.") };
  }
  const wrap = sec.querySelector("[data-lhai-prefill-confirm]");
  if (!(wrap instanceof HTMLElement)) {
    return { ok: false, error: t("messages.intake.error.confirm_not_found", "Could not find the confirmation field.") };
  }
  const yes = wrap.querySelector('.lhai-chat-form-prompt__prefill-confirm-radio[value="yes"]');
  if (!(yes instanceof HTMLInputElement) || !yes.checked) {
    const alt = wrap.querySelector(".lhai-chat-form-prompt__prefill-confirm-alt-input");
    if (!(alt instanceof HTMLInputElement)) {
      return { ok: false, error: intakeRequiredFieldError(fieldLabel, "input") };
    }
    const mv = String(alt.value || "").trim();
    if (!mv) return { ok: false, error: intakeRequiredFieldError(fieldLabel, "input") };
    return { ok: true, valueJson: { value: mv } };
  }
  const pv = String(wrap.getAttribute("data-prefill-value") || "").trim();
  const src = String(wrap.getAttribute("data-prefill-source") || "").trim();
  if (!pv) return { ok: false, error: t("messages.intake.error.no_saved_value", "No saved value found.") };
  const out = { value: pv };
  if (src) out._prefill_source = src;
  return { ok: true, valueJson: out };
}

/**
 * @param {HTMLElement | null} childEl
 * @param {string} cit normalized type
 * @param {boolean} skipChild
 * @param {unknown} [fieldLabel]
 * @returns {{ ok: boolean, valueJson?: Record<string, unknown>, error?: string }}
 */
function collectChildValueJson(childEl, cit, skipChild, fieldRowOrLabel = "") {
  const fieldLabel = intakeLabelFromFieldElement(
    childEl instanceof HTMLElement ? childEl : null,
    fieldRowOrLabel,
  );
  if (!(childEl instanceof HTMLElement)) {
    return { ok: false, error: t("messages.intake.error.field_not_found", "Could not find the field.") };
  }
  if (childEl.querySelector("[data-lhai-prefill-dropdown]")) {
    return collectPrefillCandidatesFromSection(childEl, fieldLabel);
  }
  if (childEl.querySelector("[data-lhai-prefill-confirm]")) {
    return collectPrefillConfirmFromSection(childEl, fieldLabel);
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
      return { ok: false, error: intakeRequiredFieldError(fieldLabel, "select") };
    }
    return { ok: true, valueJson: { value: sel.value } };
  }
  if (cit === "select") {
    const sel = childEl.querySelector("select.lhai-chat-form-prompt__select");
    if (!(sel instanceof HTMLSelectElement)) return { ok: false, error: t("messages.intake.error.field_not_found", "Could not find the field.") };
    const v = String(sel.value || "").trim();
    if (!v) return { ok: false, error: intakeRequiredFieldError(fieldLabel, "select") };
    return { ok: true, valueJson: { value: v } };
  }
  if (cit === "textarea") {
    const ta = childEl.querySelector("textarea.lhai-chat-form-prompt__textarea");
    if (!(ta instanceof HTMLTextAreaElement)) return { ok: false, error: t("messages.intake.error.input_not_found", "Could not find the input field.") };
    const v = String(ta.value || "").trim();
    return { ok: true, valueJson: { value: v } };
  }
  if (cit === "date") {
    const inp = childEl.querySelector("input.lhai-chat-form-prompt__date");
    if (!(inp instanceof HTMLInputElement)) return { ok: false, error: t("messages.intake.error.date_not_found", "Could not find the date input.") };
    const v = String(inp.value || "").trim();
    if (!v) return { ok: false, error: intakeRequiredFieldError(fieldLabel, "date") };
    return { ok: true, valueJson: { value: v } };
  }
  if (isCurrencyUsdInputType(cit)) {
    const inp = childEl.querySelector('input[type="number"].lhai-chat-form-prompt__currency-usd, .lhai-intake-currency-usd input[type="number"]');
    if (!(inp instanceof HTMLInputElement)) return { ok: false, error: t("messages.intake.error.amount_not_found", "Could not find the amount field.") };
    const v = String(inp.value || "").trim();
    if (!v) return { ok: false, error: intakeRequiredFieldError(fieldLabel, "input") };
    const n = Number(v);
    if (!Number.isFinite(n) || n < 0) return { ok: false, error: t("messages.intake.error.invalid_amount", "Please enter a valid amount.") };
    return { ok: true, valueJson: { value: v, currency: "USD" } };
  }
  if (cit === "number") {
    const inp = childEl.querySelector("input.lhai-chat-form-prompt__number");
    if (!(inp instanceof HTMLInputElement)) return { ok: false, error: t("messages.intake.error.input_not_found", "Could not find the input field.") };
    const v = String(inp.value || "").trim();
    return { ok: true, valueJson: { value: v } };
  }
  const inp = childEl.querySelector("input.lhai-chat-form-prompt__text");
  if (!(inp instanceof HTMLInputElement)) return { ok: false, error: t("messages.intake.error.input_not_found", "Could not find the input field.") };
  const v = String(inp.value || "").trim();
  return { ok: true, valueJson: { value: v } };
}

/**
 * @param {Record<string, unknown>} up
 * @param {string} messageId
 * @param {boolean} [submitted]
 */
function renderQuestionGroupControlsHtml(up, messageId, submitted = false) {
  const mid = String(messageId || "msg").replace(/[^a-zA-Z0-9_-]/g, "_");
  const children = Array.isArray(up.children) ? /** @type {Array<Record<string, unknown>>} */ (up.children) : [];
  const layout = String(up.layout || "stack").trim() === "inline_2" ? "inline_2" : "stack";
  const layoutCls = layout === "inline_2" ? "lhai-chat-form-prompt__group--inline-2" : "";
  return `<div class="lhai-chat-form-prompt__group ${layoutCls}" data-lhai-intake-group role="group">
    ${children
      .map((ch, idx) => {
        const cid = String(ch.id || "").trim();
        const lab = intakeViewerFieldLabel(ch);
        const help = String(ch.help_text || "").trim();
        const req = Boolean(ch.required);
        const reqHtml = req ? ` <abbr class="lhai-chat-form-prompt__req" title="${escapeHtml(t("messages.intake.required", "Required"))}">*</abbr>` : "";
        const cit =
          effectiveIntakeInputType(ch) === "date" ? "date" : normalizeIntakeInputType(ch.input_type);
        const options = Array.isArray(ch.options) ? /** @type {Array<Record<string, unknown>>} */ (ch.options) : [];
        const ivRawBase = resolveIntakeFieldInitialValue(ch);
        const iv = cit === "date" ? coerceToIsoDateInputValue(ivRawBase) || "" : ivRawBase;
        const readOnlyAttr = submitted
          ? ' readonly="readonly" aria-readonly="true" disabled'
          : "";
        const selectLocked = submitted ? " disabled" : "";
        const dis = intakeFormPromptDisabledAttr(submitted);
        const suff = `${mid}-c${idx}`;
        let inner = "";
        if (usesPrefillCandidatesDropdown(ch)) {
          inner = renderPrefillCandidatesDropdownHtml(ch, suff, lab);
        } else if (usesPrefillConfirm(ch)) {
          inner = renderPrefillConfirmHtml(ch, suff, lab);
        } else if (cit === "textarea") {
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
      <option value="">${escapeHtml(t("messages.intake.select_placeholder", "Please select"))}</option>
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
            <input type="radio" name="${escapeHtml(name)}" id="${escapeHtml(id)}" value="${escapeHtml(val)}" class="lhai-chat-form-prompt__radio"${checked}${dis} />
            <span>${escapeHtml(olab)}</span>
          </label>`;
        })
        .join("")}
    </div>`;
        } else if (cit === "yes_no") {
          const name = `lhai-intake-yn-${suff}`;
          const yesChecked = iv === "yes" ? " checked" : "";
          const noChecked = iv === "no" ? " checked" : "";
          inner = `<div class="lhai-chat-form-prompt__radio-group" role="radiogroup" aria-label="${escapeHtml(lab)}">
      <label class="lhai-chat-form-prompt__radio-label" for="${escapeHtml(`${name}-y`)}">
        <input type="radio" name="${escapeHtml(name)}" id="${escapeHtml(`${name}-y`)}" value="yes" class="lhai-chat-form-prompt__radio"${yesChecked}${dis} />
        <span>${escapeHtml(t("messages.intake.yes", "Yes"))}</span>
      </label>
      <label class="lhai-chat-form-prompt__radio-label" for="${escapeHtml(`${name}-n`)}">
        <input type="radio" name="${escapeHtml(name)}" id="${escapeHtml(`${name}-n`)}" value="no" class="lhai-chat-form-prompt__radio"${noChecked}${dis} />
        <span>${escapeHtml(t("messages.intake.no", "No"))}</span>
      </label>
    </div>`;
        } else if (cit === "multi_select") {
          const opts = [...options].sort((a, b) => Number(a.sort_order || 0) - Number(b.sort_order || 0));
          const selectedSet = new Set(
            String(iv || "")
              .split(",")
              .map((s) => s.trim())
              .filter(Boolean)
          );
          inner = `<div class="lhai-chat-form-prompt__checks" role="group" aria-label="${escapeHtml(lab)}">
      ${opts
        .map((o, i) => {
          const val = String(o.value ?? "");
          const olab = String(o.label ?? val);
          const id = `lhai-intake-ms-${suff}-${i}`;
          const checked = selectedSet.has(val) ? " checked" : "";
          return `<label class="lhai-chat-form-prompt__check-label" for="${escapeHtml(id)}">
            <input type="checkbox" id="${escapeHtml(id)}" class="lhai-chat-form-prompt__cb" value="${escapeHtml(val)}"${checked}${dis} />
            <span>${escapeHtml(olab)}</span>
          </label>`;
        })
        .join("")}
    </div>`;
        } else if (cit === "date") {
          inner = `<input type="date" class="lhai-chat-form-prompt__input lhai-chat-form-prompt__date" value="${escapeHtml(iv)}" aria-label="${escapeHtml(lab)}"${readOnlyAttr} />`;
        } else if (isCurrencyUsdInputType(cit)) {
          inner = renderCurrencyUsdInputControlsHtml({
            valueEsc: escapeHtml(iv),
            ariaLabelAttrEsc: ` aria-label="${escapeHtml(lab)}"`,
            readOnlyAttr,
            inputClass: "lhai-chat-form-prompt__input lhai-chat-form-prompt__currency-usd",
          });
        } else if (cit === "number") {
          inner = `<input type="number" class="lhai-chat-form-prompt__input lhai-chat-form-prompt__number" inputmode="decimal" step="any" value="${escapeHtml(iv)}" aria-label="${escapeHtml(lab)}"${readOnlyAttr} />`;
        } else {
          inner = `<input type="text" class="lhai-chat-form-prompt__input lhai-chat-form-prompt__text" value="${escapeHtml(iv)}" maxlength="4000" aria-label="${escapeHtml(lab)}"${readOnlyAttr} />`;
        }
        return `<div class="lhai-chat-form-prompt__group-child" data-child-id="${escapeHtml(cid)}" data-child-input-type="${escapeHtml(cit)}">
    <div class="lhai-chat-form-prompt__child-label">${escapeHtml(lab)}${reqHtml}</div>
    ${!isEffectivelyEmptyIntakeHelpText(help) ? `<div class="lhai-chat-form-prompt__child-help u-text-muted">${escapeHtml(help)}</div>` : ""}
    <div class="lhai-chat-form-prompt__child-controls">${inner}</div>
  </div>`;
      })
      .join("")}
  </div>`;
}

function intakeFormPromptIsSubmitted(up) {
  return Boolean(up && typeof up === "object" && up.prompt_submitted);
}

/** @param {boolean} submitted */
function intakeFormPromptDisabledAttr(submitted) {
  return submitted ? " disabled" : "";
}

/**
 * @param {Record<string, unknown>} up
 * @param {string} messageId
 * @param {boolean} [submitted]
 */
function renderFormPromptControlsHtml(up, messageId, submitted = false) {
  const mid = String(messageId || "msg").replace(/[^a-zA-Z0-9_-]/g, "_");
  const it =
    effectiveIntakeInputType(up) === "date" ? "date" : normalizeIntakeInputType(up.input_type);
  if (it === "question_group") return "";
  if (usesPrefillCandidatesDropdown(up)) {
    return renderPrefillCandidatesDropdownHtml(up, mid, String(up.label || ""));
  }
  if (usesPrefillConfirm(up)) {
    return renderPrefillConfirmHtml(up, mid, String(up.label || ""));
  }
  const options = Array.isArray(up.options) ? /** @type {Array<Record<string, unknown>>} */ (up.options) : [];
  const def = up.default_value != null && up.default_value !== undefined ? String(up.default_value) : "";
  const prefillBlocked = Boolean(up.prefill_blocked);
  const rawPv = String(up.prefill_resolved_value ?? "").trim();
  const rawVal = up.value != null && String(up.value).trim() !== "" ? String(up.value).trim() : "";
  const pf = up.prefill && typeof up.prefill === "object" ? up.prefill : null;
  const prefillOn = !prefillBlocked && pf && Boolean(pf.enabled);
  const prefillScalar = rawVal || String(up.prefill_value ?? "").trim() || rawPv;
  const usePrefillValue = Boolean((prefillOn && prefillScalar) || rawVal || rawPv);
  const ivRaw = usePrefillValue ? resolveIntakeFieldInitialValue(up) : def;
  const ivDate = it === "date" ? coerceToIsoDateInputValue(ivRaw) || "" : "";
  const readOnlyAttr =
    submitted || (usePrefillValue && up.prefill_editable === false)
      ? ' readonly="readonly" aria-readonly="true" disabled'
      : intakeFormPromptDisabledAttr(submitted);
  const selectLocked =
    submitted || (usePrefillValue && up.prefill_editable === false && it === "select") ? " disabled" : "";

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
      <option value="">${escapeHtml(t("messages.intake.select_placeholder", "Please select"))}</option>
      ${optHtml}
    </select>`;
  }
  if (it === "radio") {
    const opts = [...options].sort((a, b) => Number(a.sort_order || 0) - Number(b.sort_order || 0));
    const name = `lhai-intake-r-${mid}`;
    const dis = intakeFormPromptDisabledAttr(submitted);
    return `<div class="lhai-chat-form-prompt__radio-group" role="radiogroup" aria-label="${escapeHtml(String(up.label || ""))}">
      ${opts
        .map((o, i) => {
          const val = String(o.value ?? "");
          const lab = String(o.label ?? val);
          const id = `${name}-${i}`;
          const checked = usePrefillValue && val === ivRaw ? " checked" : "";
          return `<label class="lhai-chat-form-prompt__radio-label" for="${escapeHtml(id)}">
            <input type="radio" name="${escapeHtml(name)}" id="${escapeHtml(id)}" value="${escapeHtml(val)}" class="lhai-chat-form-prompt__radio"${checked}${dis} />
            <span>${escapeHtml(lab)}</span>
          </label>`;
        })
        .join("")}
    </div>`;
  }
  if (it === "yes_no") {
    const name = `lhai-intake-yn-${mid}`;
    const dis = intakeFormPromptDisabledAttr(submitted);
    const yesChecked = ivRaw === "yes" ? " checked" : "";
    const noChecked = ivRaw === "no" ? " checked" : "";
    return `<div class="lhai-chat-form-prompt__radio-group" role="radiogroup" aria-label="${escapeHtml(String(up.label || ""))}">
      <label class="lhai-chat-form-prompt__radio-label" for="${escapeHtml(`${name}-y`)}">
        <input type="radio" name="${escapeHtml(name)}" id="${escapeHtml(`${name}-y`)}" value="yes" class="lhai-chat-form-prompt__radio"${yesChecked}${dis} />
        <span>${escapeHtml(t("messages.intake.yes", "Yes"))}</span>
      </label>
      <label class="lhai-chat-form-prompt__radio-label" for="${escapeHtml(`${name}-n`)}">
        <input type="radio" name="${escapeHtml(name)}" id="${escapeHtml(`${name}-n`)}" value="no" class="lhai-chat-form-prompt__radio"${noChecked}${dis} />
        <span>${escapeHtml(t("messages.intake.no", "No"))}</span>
      </label>
    </div>`;
  }
  if (it === "multi_select") {
    const opts = [...options].sort((a, b) => Number(a.sort_order || 0) - Number(b.sort_order || 0));
    const selectedSet = new Set(
      String(ivRaw || "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
    );
    return `<div class="lhai-chat-form-prompt__checks" role="group" aria-label="${escapeHtml(String(up.label || ""))}">
      ${opts
        .map((o, i) => {
          const val = String(o.value ?? "");
          const lab = String(o.label ?? val);
          const id = `lhai-intake-ms-${mid}-${i}`;
          const checked = selectedSet.has(val) ? " checked" : "";
          const dis = intakeFormPromptDisabledAttr(submitted);
          return `<label class="lhai-chat-form-prompt__check-label" for="${escapeHtml(id)}">
            <input type="checkbox" id="${escapeHtml(id)}" class="lhai-chat-form-prompt__cb" value="${escapeHtml(val)}"${checked}${dis} />
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
  if (isCurrencyUsdInputType(it)) {
    return renderCurrencyUsdInputControlsHtml({
      valueEsc: escapeHtml(ivRaw),
      ariaLabelAttrEsc: ` aria-label="${escapeHtml(String(up.label || ""))}"`,
      readOnlyAttr,
      inputClass: "lhai-chat-form-prompt__input lhai-chat-form-prompt__currency-usd",
    });
  }
  if (it === "number") {
    const v = escapeHtml(ivRaw);
    return `<input type="number" class="lhai-chat-form-prompt__input lhai-chat-form-prompt__number" inputmode="decimal" step="any" value="${v}" aria-label="${escapeHtml(String(up.label || ""))}"${readOnlyAttr} />`;
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
  const fieldLabel = intakeLabelFromFieldElement(sec instanceof HTMLElement ? sec : null, st);
  if (sec instanceof HTMLElement && sec.querySelector("[data-lhai-prefill-dropdown]")) {
    return collectPrefillCandidatesFromSection(sec, fieldLabel);
  }
  if (sec instanceof HTMLElement && sec.querySelector("[data-lhai-prefill-confirm]")) {
    return collectPrefillConfirmFromSection(sec, fieldLabel);
  }
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
      return { ok: false, error: intakeRequiredFieldError(fieldLabel, "select") };
    }
    return { ok: true, valueJson: { value: sel.value } };
  }
  if (it === "select") {
    const sel = sec.querySelector("select.lhai-chat-form-prompt__select");
    if (!(sel instanceof HTMLSelectElement)) return { ok: false, error: t("messages.intake.error.field_not_found", "Could not find the field.") };
    const v = String(sel.value || "").trim();
    if (!v) return { ok: false, error: intakeRequiredFieldError(fieldLabel, "select") };
    return { ok: true, valueJson: { value: v } };
  }
  if (it === "textarea") {
    const ta = sec.querySelector("textarea.lhai-chat-form-prompt__textarea");
    if (!(ta instanceof HTMLTextAreaElement)) return { ok: false, error: t("messages.intake.error.input_not_found", "Could not find the input field.") };
    const v = String(ta.value || "").trim();
    return { ok: true, valueJson: { value: v } };
  }
  if (it === "date") {
    const inp = sec.querySelector("input.lhai-chat-form-prompt__date");
    if (!(inp instanceof HTMLInputElement)) return { ok: false, error: t("messages.intake.error.date_not_found", "Could not find the date input.") };
    const v = String(inp.value || "").trim();
    if (!v) return { ok: false, error: intakeRequiredFieldError(fieldLabel, "date") };
    return { ok: true, valueJson: { value: v } };
  }
  if (isCurrencyUsdInputType(it)) {
    const inp = sec.querySelector('input[type="number"].lhai-chat-form-prompt__currency-usd, .lhai-intake-currency-usd input[type="number"]');
    if (!(inp instanceof HTMLInputElement)) return { ok: false, error: t("messages.intake.error.amount_not_found", "Could not find the amount field.") };
    const v = String(inp.value || "").trim();
    if (!v) return { ok: false, error: intakeRequiredFieldError(fieldLabel, "input") };
    const n = Number(v);
    if (!Number.isFinite(n) || n < 0) return { ok: false, error: t("messages.intake.error.invalid_amount", "Please enter a valid amount.") };
    return { ok: true, valueJson: { value: v, currency: "USD" } };
  }
  if (it === "number") {
    const inp = sec.querySelector("input.lhai-chat-form-prompt__number");
    if (!(inp instanceof HTMLInputElement)) return { ok: false, error: t("messages.intake.error.input_not_found", "Could not find the input field.") };
    const v = String(inp.value || "").trim();
    return { ok: true, valueJson: { value: v } };
  }
  const inp = sec.querySelector("input.lhai-chat-form-prompt__text");
  if (!(inp instanceof HTMLInputElement)) return { ok: false, error: t("messages.intake.error.input_not_found", "Could not find the input field.") };
  const v = String(inp.value || "").trim();
  return { ok: true, valueJson: { value: v } };
}

/**
 * @param {Record<string, unknown>} up
 * @param {string} messageId
 * @param {boolean} [submitted]
 */
function renderIntakeMultiControlsHtml(up, messageId, submitted = false) {
  const mid = String(messageId || "msg").replace(/[^a-zA-Z0-9_-]/g, "_");
  const steps = Array.isArray(up.steps) ? /** @type {Array<Record<string, unknown>>} */ (up.steps) : [];
  return steps
    .map((st, si) => {
      const sfid = String(st.field_id || "").trim();
      const suf = `${mid}_s${si}_${sfid.replace(/[^a-zA-Z0-9_-]/g, "_")}`;
      const stIt = normalizeIntakeInputType(st.input_type);
      const title = intakeViewerFieldLabel(st);
      const help = String(st.help_text || "").trim();
      const reqMark = Boolean(st.required) ? " *" : "";
      let inner = "";
      if (stIt === "question_group") {
        inner = renderQuestionGroupControlsHtml(st, suf, submitted);
      } else {
        inner = renderFormPromptControlsHtml(st, suf, submitted);
      }
      const titleLine = shouldHideIntakeBlockTitle(title)
        ? ""
        : `<h4 class="lhai-chat-form-prompt__intake-step-title">${escapeHtml(title)}${escapeHtml(reqMark)}</h4>`;
      return `<section class="lhai-chat-form-prompt__intake-step" data-intake-step-field-id="${escapeHtml(sfid)}" data-intake-step-input-type="${escapeHtml(stIt)}">
    ${titleLine}
    ${!isEffectivelyEmptyIntakeHelpText(help) ? `<div class="lhai-chat-form-prompt__help">${escapeHtml(help)}</div>` : ""}
    <div class="lhai-chat-form-prompt__intake-step-controls">${inner}</div>
  </section>`;
    })
    .join("");
}

/**
 * @param {Record<string, unknown>} m
 * @param {Record<string, unknown>} up Display payload (labels); already a safe copy.
 */
function renderFormPromptInteractive(m, up) {
  // ``up`` is a display clone from resolveMessageUiPayloadForDisplay — do not touch m.ui_payload.
  const mid = String(m.id || "");
  const sessionId = String(up.session_id || "");
  const threadId = String(up.thread_id || selectedThreadId || "");
  // Prefer canonical field_id from stored ui_payload for submit identity.
  const canonical = resolveMessageUiPayloadCanonical(
    m && typeof m === "object" ? /** @type {Record<string, unknown>} */ (m) : null
  );
  const fieldId = String((canonical && canonical.field_id) || up.field_id || "");
  const label = formPromptDisplayLabel(up, (key, fallback) => t(key, fallback));
  const helpText = String(up.help_text || "").trim();
  const required = Boolean(up.required);
  const it = normalizeIntakeInputType(up.input_type);
  const domInputType = effectiveIntakeInputType(up) === "date" ? "date" : it;
  const reqHtml = required
    ? ` <abbr class="lhai-chat-form-prompt__req" title="${escapeHtml(t("messages.intake.required", "Required"))}">*</abbr>`
    : "";
  const submitted = intakeFormPromptIsSubmitted(up);

  const blocksHtml = renderIntakeContentBlocksHtml(up);
  const controlsInner =
    it === "intake_multi"
      ? renderIntakeMultiControlsHtml(up, mid, submitted)
      : it === "question_group"
        ? renderQuestionGroupControlsHtml(up, mid, submitted)
        : renderFormPromptControlsHtml(up, mid, submitted);
  const prefillHelper = String(up.helper_text || "").trim();

  const labelLine =
    it === "question_group" && shouldHideIntakeBlockTitle(label)
      ? ""
      : `<div class="lhai-chat-form-prompt__label">${escapeHtml(label)}${reqHtml}</div>`;

  if (Boolean(up.prefill_blocked)) {
    const msg =
      String(up.prefill_block_message || "").trim() ||
      t(
        "messages.intake.error.profile_required",
        "Profile information must be filled in before continuing. Update your settings and try again."
      );
    return `${blocksHtml}<div class="lhai-chat-form-prompt lhai-chat-form-prompt--blocked" data-lhai-intake-form data-message-id="${escapeHtml(mid)}" data-session-id="${escapeHtml(sessionId)}" data-thread-id="${escapeHtml(threadId)}" data-field-id="${escapeHtml(fieldId)}" data-input-type="${escapeHtml(domInputType)}">
    ${labelLine}
    ${!isEffectivelyEmptyIntakeHelpText(helpText) ? `<div class="lhai-chat-form-prompt__help">${escapeHtml(helpText)}</div>` : ""}
    <p class="lhai-chat-form-prompt__error" role="alert">${escapeHtml(msg)}</p>
  </div>`;
  }

  return `${blocksHtml}<div class="lhai-chat-form-prompt${submitted ? " lhai-chat-form-prompt--submitted" : ""}" data-lhai-intake-form data-message-id="${escapeHtml(mid)}" data-session-id="${escapeHtml(sessionId)}" data-thread-id="${escapeHtml(threadId)}" data-field-id="${escapeHtml(fieldId)}" data-input-type="${escapeHtml(domInputType)}"${submitted ? ' data-lhai-intake-submitted="1"' : ""}>
    ${labelLine}
    ${!isEffectivelyEmptyIntakeHelpText(helpText) ? `<div class="lhai-chat-form-prompt__help">${escapeHtml(helpText)}</div>` : ""}
    ${prefillHelper ? `<div class="lhai-chat-form-prompt__help lhai-chat-form-prompt__help--prefill">${escapeHtml(prefillHelper)}</div>` : ""}
    <div class="lhai-chat-form-prompt__controls">${controlsInner}</div>
    <div class="lhai-chat-form-prompt__error" role="alert" hidden></div>
    ${
      submitted
        ? ""
        : `<div class="lhai-chat-form-prompt__actions">
      <button type="button" class="lhai-button lhai-button--primary lhai-chat-form-prompt__submit" data-lhai-intake-submit>${escapeHtml(t("messages.intake.submit", "Submit"))}</button>
      ${!required && it !== "intake_multi" ? `<button type="button" class="lhai-button lhai-button--secondary lhai-chat-form-prompt__skip" data-lhai-intake-skip>${escapeHtml(t("messages.intake.skip", "Skip"))}</button>` : ""}
    </div>`
    }
  </div>`;
}

/** @param {Record<string, unknown>} up */
function renderFormPromptOperatorReadonly(up) {
  const label = formPromptDisplayLabel(up, (key, fallback) => t(key, fallback));
  const helpText = String(up.help_text || "").trim();
  const it = normalizeIntakeInputType(up.input_type);
  const blocksHtml = renderIntakeContentBlocksHtml(up);
  const children = Array.isArray(up.children) ? /** @type {Array<Record<string, unknown>>} */ (up.children) : [];
  const steps = Array.isArray(up.steps) ? /** @type {Array<Record<string, unknown>>} */ (up.steps) : [];
  const groupMeta =
    it === "question_group" && children.length
      ? `<p class="u-text-muted lhai-chat-form-prompt__meta">${escapeHtml(localizedStatus("messages.intake.meta.sub_questions", "{count} sub-questions", { count: children.length }))}</p>`
      : "";
  const multiMeta =
    it === "intake_multi" && steps.length
      ? `<p class="u-text-muted lhai-chat-form-prompt__meta">${escapeHtml(localizedStatus("messages.intake.meta.combined_steps", "{count} combined steps", { count: steps.length }))}</p>`
      : "";
  return `${blocksHtml}<div class="lhai-chat-form-prompt lhai-chat-form-prompt--readonly">
    <div class="lhai-chat-form-prompt__label">${escapeHtml(label)}</div>
    ${!isEffectivelyEmptyIntakeHelpText(helpText) ? `<div class="lhai-chat-form-prompt__help">${escapeHtml(helpText)}</div>` : ""}
    <p class="lhai-chat-form-prompt__readonly-note u-text-muted">${escapeHtml(t("messages.intake.readonly_note", "Intake responses cannot be submitted in operator view."))}</p>
    <p class="u-text-muted lhai-chat-form-prompt__meta">${escapeHtml(formatLocalizedDataReadout("messages.intake.meta.input_type", "Input type: {value}", String(it || "").trim()))}</p>
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
      return { ok: false, error: t("messages.intake.error.intake_multi_skip", "Combined intake cannot be skipped.") };
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
    // Prefer canonical step field_ids for submit; display payload only for labels/structure fallback.
    const canonical = getCanonicalUiPayloadForFormRoot(container);
    const display = getUiPayloadForFormRoot(container);
    const steps = Array.isArray(canonical?.steps)
      ? /** @type {Array<Record<string, unknown>>} */ (canonical.steps)
      : Array.isArray(display?.steps)
        ? /** @type {Array<Record<string, unknown>>} */ (display.steps)
        : [];
    /** @type {Array<{ field_id: string, value_json: Record<string, unknown> }>} */
    const batch_updates = [];
    for (const st of steps) {
      const sfid = String(st.field_id || "").trim();
      if (!sfid) continue;
      const sec = /** @type {HTMLElement | null} */ (container.querySelector(`[data-intake-step-field-id="${sfid}"]`));
      if (!(sec instanceof HTMLElement)) {
        return { ok: false, error: t("messages.intake.error.step_not_found", "Could not find the input step.") };
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
          const sub = collectChildValueJson(cel, cit, false, ch);
          if (!sub.ok) return { ok: false, error: sub.error || t("messages.intake.error.check_input", "Please check your input.") };
          group_answers[cid] = /** @type {Record<string, unknown>} */ (sub.valueJson || {});
        }
        batch_updates.push({ field_id: sfid, value_json: { group_answers } });
      } else {
        const sub = collectScalarPromptFromSection(sec, st);
        if (!sub.ok) return { ok: false, error: sub.error || t("messages.intake.error.check_input", "Please check your input.") };
        batch_updates.push({ field_id: sfid, value_json: /** @type {Record<string, unknown>} */ (sub.valueJson || {}) });
      }
    }
    return { ok: true, batchUpdates: batch_updates };
  }
  if (it === "question_group") {
    const canonical = getCanonicalUiPayloadForFormRoot(container);
    const display = getUiPayloadForFormRoot(container);
    const children = Array.isArray(canonical?.children)
      ? /** @type {Array<Record<string, unknown>>} */ (canonical.children)
      : Array.isArray(display?.children)
        ? /** @type {Array<Record<string, unknown>>} */ (display.children)
        : [];
    /** @type {Record<string, Record<string, unknown>>} */
    const group_answers = {};
    for (const ch of children) {
      const cid = String(ch.id || "").trim();
      if (!cid) continue;
      const cel = container.querySelector(`.lhai-chat-form-prompt__group-child[data-child-id="${cid}"]`);
      const cit =
        effectiveIntakeInputType(ch) === "date" ? "date" : normalizeIntakeInputType(ch.input_type);
      const sub = collectChildValueJson(cel, cit, false, ch);
      if (!sub.ok) return { ok: false, error: sub.error || t("messages.intake.error.check_input", "Please check your input.") };
      group_answers[cid] = /** @type {Record<string, unknown>} */ (sub.valueJson || {});
    }
    return { ok: true, valueJson: { group_answers } };
  }
  if (container.querySelector("[data-lhai-prefill-dropdown]")) {
    const upRoot = getUiPayloadForFormRoot(container);
    return collectPrefillCandidatesFromSection(container, upRoot);
  }
  if (container.querySelector("[data-lhai-prefill-confirm]")) {
    const upRoot = getUiPayloadForFormRoot(container);
    return collectPrefillConfirmFromSection(container, upRoot);
  }
  const upRoot = getUiPayloadForFormRoot(container);
  const rootLabel = intakeViewerFieldLabel(upRoot);
  if (it === "multi_select") {
    const vals = Array.from(container.querySelectorAll(".lhai-chat-form-prompt__cb:checked")).map((c) =>
      String(/** @type {HTMLInputElement} */ (c).value)
    );
    return { ok: true, valueJson: { values: vals } };
  }
  if (it === "radio" || it === "yes_no") {
    const sel = container.querySelector('.lhai-chat-form-prompt__radio-group input[type="radio"]:checked');
    if (!(sel instanceof HTMLInputElement)) {
      return { ok: false, error: intakeRequiredFieldError(rootLabel, "select") };
    }
    return { ok: true, valueJson: { value: sel.value } };
  }
  if (it === "select") {
    const sel = container.querySelector("select.lhai-chat-form-prompt__select");
    if (!(sel instanceof HTMLSelectElement)) return { ok: false, error: t("messages.intake.error.field_not_found", "Could not find the field.") };
    const v = String(sel.value || "").trim();
    if (!v) return { ok: false, error: intakeRequiredFieldError(rootLabel, "select") };
    return { ok: true, valueJson: { value: v } };
  }
  if (it === "textarea") {
    const ta = container.querySelector("textarea.lhai-chat-form-prompt__textarea");
    if (!(ta instanceof HTMLTextAreaElement)) return { ok: false, error: t("messages.intake.error.input_not_found", "Could not find the input field.") };
    const v = String(ta.value || "").trim();
    return { ok: true, valueJson: { value: v } };
  }
  if (it === "date") {
    const inp = container.querySelector("input.lhai-chat-form-prompt__date");
    if (!(inp instanceof HTMLInputElement)) return { ok: false, error: t("messages.intake.error.date_not_found", "Could not find the date input.") };
    const v = String(inp.value || "").trim();
    if (!v) return { ok: false, error: intakeRequiredFieldError(rootLabel, "date") };
    return { ok: true, valueJson: { value: v } };
  }
  const inp = container.querySelector("input.lhai-chat-form-prompt__text");
  if (!(inp instanceof HTMLInputElement)) return { ok: false, error: t("messages.intake.error.input_not_found", "Could not find the input field.") };
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
  if (formRoot.hasAttribute("data-lhai-intake-submitted")) return;
  const sessionId = formRoot.getAttribute("data-session-id") || "";
  const threadId = formRoot.getAttribute("data-thread-id") || "";
  const fieldId = formRoot.getAttribute("data-field-id") || "";
  const inputType = formRoot.getAttribute("data-input-type") || "text";
  const requiredAttr = formRoot.querySelector(".lhai-chat-form-prompt__req");

  setIntakeFormError(formRoot, "");
  const collected = collectIntakeValueJson(formRoot, inputType, skip);
  if (!collected.ok) {
    setIntakeFormError(formRoot, collected.error || t("messages.intake.error.check_input", "Please check your input."));
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
        setIntakeFormError(formRoot, t("messages.intake.error.step_not_found", "Could not find the input step."));
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
          const sub = collectChildValueJson(childEl, cit, false, ch);
          if (!sub.ok) {
            setIntakeFormError(formRoot, sub.error || t("messages.intake.error.check_input", "Please check your input."));
            return;
          }
          const vj = /** @type {Record<string, unknown>} */ (sub.valueJson || {});
          if (intakeChildAnswerLooksEmpty(cit, vj)) {
            setIntakeFormError(formRoot, intakeRequiredFieldErrorForInputType(ch, cit));
            return;
          }
        }
      } else if (st.required) {
        const sub = collectScalarPromptFromSection(sec, st);
        if (!sub.ok) {
          setIntakeFormError(formRoot, sub.error || t("messages.intake.error.check_input", "Please check your input."));
          return;
        }
        const vj = /** @type {Record<string, unknown>} */ (sub.valueJson || {});
        const effStIt =
          effectiveIntakeInputType(st) === "date" ? "date" : stIt;
        if (effStIt === "multi_select") {
          const vals = vj.values;
          if (!Array.isArray(vals) || vals.length === 0) {
            setIntakeFormError(formRoot, intakeRequiredFieldError(st, "multi"));
            return;
          }
        } else if (effStIt !== "radio" && effStIt !== "yes_no" && effStIt !== "select" && effStIt !== "date") {
          const v = vj.value;
          if (v === undefined || v === null || String(v).trim() === "") {
            setIntakeFormError(formRoot, intakeRequiredFieldErrorForInputType(st, effStIt));
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
      const sub = collectChildValueJson(childEl, cit, false, ch);
      if (!sub.ok) {
        setIntakeFormError(formRoot, sub.error || t("messages.intake.error.check_input", "Please check your input."));
        return;
      }
      const vj = /** @type {Record<string, unknown>} */ (sub.valueJson || {});
      if (intakeChildAnswerLooksEmpty(cit, vj)) {
        setIntakeFormError(formRoot, intakeRequiredFieldErrorForInputType(ch, cit));
        return;
      }
    }
  }
  if (requiredAttr && !skip && normalizeIntakeInputType(inputType) !== "intake_multi") {
    const up = getUiPayloadForFormRoot(formRoot);
    const it = normalizeIntakeInputType(inputType);
    if (it === "multi_select") {
      const vals = /** @type {{ values?: unknown[] }} */ (valueJson || {}).values;
      if (!Array.isArray(vals) || vals.length === 0) {
        setIntakeFormError(formRoot, intakeRequiredFieldError(up, "multi"));
        return;
      }
    } else if (it !== "radio" && it !== "yes_no" && it !== "select" && it !== "date" && it !== "question_group") {
      const v = /** @type {{ value?: unknown }} */ (valueJson || {}).value;
      if (v === undefined || v === null || String(v).trim() === "") {
        setIntakeFormError(formRoot, intakeRequiredFieldErrorForInputType(up, it));
        return;
      }
    }
  }

  const cp = operatorInboxMode ? threadOwnerProfileId : customerProfileId;
  if (!String(cp || "").trim() || !String(threadId || "").trim() || !String(sessionId || "").trim()) {
    setIntakeFormError(formRoot, t("messages.intake.error.session_insufficient", "Session information is incomplete. Please refresh the page."));
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
    const msg = err && typeof err.message === "string" ? err.message : t("messages.intake.error.submit_failed", "Submission failed.");
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
    <div class="lhai-workflow-card__extra-label u-text-muted">${escapeHtml(t("messages.workflow.response_detail", "Response details"))}</div>
    <pre class="lhai-workflow-card__json" tabindex="0">${escapeHtml(text)}</pre>
  </div>`;
}

/**
 * WORKFLOW_CARD — visible title/body from ``display_*`` only; ``card_json`` is actions/state.
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
  const title = workflowCardViewerTitle(m, t);
  const body = workflowCardViewerBody(m, t);
  // Visible copy only from API display_* (never card_json.title/body or raw m.title/m.body cross-locale).
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
  if (statusLine) {
    stateParts.push(
      formatLocalizedDataReadout(
        "messages.workflow.state_status",
        "Status: {value}",
        workflowCardStateDisplayValue(statusLine)
      )
    );
  }
  if (custLine) {
    stateParts.push(
      formatLocalizedDataReadout(
        "messages.workflow.state_customer",
        "Customer step: {value}",
        workflowCardStateDisplayValue(custLine)
      )
    );
  }
  if (stepLine && stepLine !== sk) {
    stateParts.push(
      formatLocalizedDataReadout(
        "messages.workflow.state_step",
        "Step: {value}",
        workflowCardStateDisplayValue(stepLine)
      )
    );
  }
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
        )}" data-service-item-id="${escapeHtml(itemC)}">${escapeHtml(t("messages.workflow.start_answers", "Start answering"))}</button>
      </div>`;
      }
    } else if (ct === "EMAIL_PARTNER_RESPONSE") {
      const oid = String(cj.partner_offer_id || cj.offer_id || "").trim();
      if (oid && wfId) {
        actionsHtml = `<div class="lhai-workflow-card__actions">
          <button type="button" class="lhai-button lhai-button--primary lhai-workflow-card__action" data-lhai-wf-action="select_offer" data-wf-id="${escapeHtml(wfId)}" data-offer-id="${escapeHtml(oid)}">${escapeHtml(t("messages.workflow.select_offer", "Select this quote"))}</button>
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
              <button type="button" class="lhai-button lhai-button--secondary lhai-workflow-card__action" data-lhai-wf-action="select_offer" data-wf-id="${escapeHtml(wfId)}" data-offer-id="${escapeHtml(oid)}">${escapeHtml(t("messages.workflow.select_offer", "Select this quote"))}</button>
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
  if (!cp) missing.push(t("messages.alert.missing.customer_profile", "Customer profile"));
  if (!tid) missing.push(t("messages.alert.missing.thread_id", "Thread ID"));
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
      localizedStatus(
        "messages.alert.intake_start_missing",
        "Cannot start intake. Missing: {items}.\nRefresh the inbox and try again. If the problem continues, contact support.",
        { items: missing.join(", ") }
      )
    );
    return;
  }
  try {
    assertServiceItemUuid(itemId);
  } catch {
    window.alert(
      t(
        "common.messages.workflow.mapping_repair_needed",
        "Service mapping information is missing. Ask an administrator to repair the service mapping."
      )
    );
    return;
  }
  if (!instId) {
    window.alert(
      t(
        "messages.alert.service_instance_missing",
        "Service instance information is missing. Refresh the inbox and try again. If the problem continues, contact support."
      )
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
    const msg = err && typeof err.message === "string" ? err.message : t("messages.alert.intake_start_failed", "Could not start intake.");
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
    const msg = err && typeof err.message === "string" ? err.message : t("messages.alert.select_failed", "Selection failed.");
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

function renderChatBubbles(options = {}) {
  const stream = document.querySelector("#messageChatStream");
  if (!stream) return;
  const scrollIfNearBottom = Boolean(options.scrollIfNearBottom);
  const forceScrollToBottom = Boolean(options.forceScrollToBottom);
  const wrap = document.querySelector("#messageChatScroll");
  const stickToBottom =
    forceScrollToBottom ||
    !scrollIfNearBottom ||
    (wrap instanceof HTMLElement && isChatScrollNearBottom(wrap));
  if (!currentThreadMessages.length) {
    stream.innerHTML = `<div class="lhai-chat-empty">${escapeHtml(t("messages.chat.empty", "No messages in this conversation."))}</div>`;
    requestAnimationFrame(() => {
      if (stickToBottom) scrollChatToBottom();
    });
    return;
  }
  stream.innerHTML = currentThreadMessages
    .map((m) => {
      const mine = isMineDirection(m.direction);
      const up = resolveMessageUiPayloadForDisplay(
        m && typeof m === "object" ? /** @type {Record<string, unknown>} */ (m) : null
      );
      const wt = messageIntakeWidgetType(
        m && typeof m === "object" ? /** @type {Record<string, unknown>} */ (m) : null
      );
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
      const isBidComparisonEntry = intakeSummaryKind === "bid_comparison_entry";
      const bubbleClass = [
        mine ? "lhai-chat-bubble--me" : "lhai-chat-bubble--them",
        isForm ? "lhai-chat-bubble--form-prompt" : "",
        isIntakeContent ? "lhai-chat-bubble--intake-content" : "",
        isWorkflowCard ? "lhai-chat-bubble--workflow-card" : "",
        isBidComparisonEntry ? "lhai-chat-bubble--bid-entry" : "",
      ]
        .filter(Boolean)
        .join(" ");
      const resolvedTitle = isPartnerIntakeSummary
        ? t("messages.bubble.partner_intake_title", "Customer application")
        : messageViewerTitle(m, { translate: (key, fallback) => t(key, fallback) });
      const showTitle =
        !mine &&
        (Boolean(resolvedTitle) || isPartnerIntakeSummary) &&
        !isForm &&
        !isIntakeContent &&
        !isWorkflowCard &&
        !isBidComparisonEntry;
      const titleLine = showTitle ? `<div class="lhai-chat-bubble__title">${escapeHtml(resolvedTitle)}</div>` : "";

      let formBlock = "";
      if (isForm && up) {
        formBlock =
          operatorInboxMode ? renderFormPromptOperatorReadonly(up) : renderFormPromptInteractive(m, up);
      } else if (isForm) {
        formBlock = renderIntakeFormPreparingPlaceholder();
      } else if (isIntakeContent && up) {
        formBlock = renderIntakeThreadContentBlockBubble(up);
      } else if (isIntakeContent) {
        formBlock = renderIntakeFormPreparingPlaceholder();
      } else if (isWorkflowCard) {
        formBlock = renderWorkflowCardBubble(m, up);
      } else if (isBidComparisonEntry && meta) {
        formBlock = renderBidComparisonEntryBubbleHtml(meta);
      }

      const msgId = String(m.id || "").trim();
      const viewerBody = messageViewerText(m);
      const viewOriginalToggle = messageViewOriginalToggleHtml(m);
      const reportTranslationAction = buildMessageTranslationReportHtml(m);
      const translationUnavailable = messageTranslationNoticeHtml(m);
      const usesStructuredBubble = isForm || isIntakeContent || isWorkflowCard || isBidComparisonEntry;
      const bodyBlock = usesStructuredBubble
          ? formBlock
          : `<p class="lhai-chat-bubble__body">${escapeHtml(String(viewerBody))}</p>${translationUnavailable}${viewOriginalToggle}${reportTranslationAction}`;
      return `
      <div class="lhai-chat-row ${mine ? "lhai-chat-row--mine" : "lhai-chat-row--them"}"${msgId ? ` data-message-id="${escapeHtml(msgId)}"` : ""}>
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
  requestAnimationFrame(() => {
    if (stickToBottom) scrollChatToBottom();
  });
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

async function refreshBiddingNotificationDebugPanel(threadId, opts = {}) {
  const fromUser = Boolean(opts.fromUser);
  const wrap = document.querySelector("#lhaiBiddingNotifyDebugBody");
  if (!(wrap instanceof HTMLElement)) return;
  const tid = String(threadId || selectedThreadId || "").trim();
  const loading = document.querySelector("#lhaiBiddingNotifyDebugLoading");
  const runBtn = document.querySelector("#lhaiBiddingNotifyDebugRunBtn");
  if (!tid) {
    wrap.innerHTML = `<p class="u-text-muted">${escapeHtml(t("messages.diag.select_thread_for_email", "Select a thread to load bidding-start email diagnostics."))}</p>`;
    if (fromUser) showIntakeDispatchDiagToast(t("messages.diag.select_thread", "Please select a thread first."));
    return;
  }
  if (runBtn instanceof HTMLButtonElement) runBtn.disabled = true;
  if (loading instanceof HTMLElement) {
    loading.hidden = false;
    loading.textContent = t("messages.loading", "Loading…");
  }
  try {
    await loadBiddingNotificationDebugInto(wrap, {
      threadId: tid,
      fetchThreadDebug: (id) => serviceCatalogAdminApi.getThreadBiddingDispatchDebug(id),
      fetchBidDebug: (id) => serviceCatalogAdminApi.getBidRequestNotificationDebug(id),
    });
    const refreshedAt = new Date().toLocaleString("ko-KR");
    const stamp = wrap.querySelector(".lhai-bid-notify-debug__refreshed-at");
    if (stamp instanceof HTMLElement) {
      stamp.textContent = localizedStatus("messages.diag.last_refreshed", "Last refreshed: {time}", { time: refreshedAt });
    } else {
      wrap.insertAdjacentHTML(
        "beforeend",
        `<p class="lhai-help lhai-bid-notify-debug__refreshed-at u-mt-2">${escapeHtml(localizedStatus("messages.diag.last_refreshed", "Last refreshed: {time}", { time: refreshedAt }))}</p>`
      );
    }
    if (fromUser) {
      const hasErr = wrap.querySelector(".lhai-state--error");
      showIntakeDispatchDiagToast(
        hasErr ? t("messages.diag.email_load_failed", "Could not load email diagnostics.") : t("messages.diag.email_loaded", "Bidding-start email diagnostics loaded.")
      );
    }
  } finally {
    if (runBtn instanceof HTMLButtonElement) runBtn.disabled = false;
    if (loading instanceof HTMLElement) loading.hidden = true;
  }
}

async function runIntakeDispatchDiagnosticsLoad() {
  const tid = String(selectedThreadId || "").trim();
  const body = document.querySelector("#lhaiIntakeDispatchDiagBody");
  const loading = document.querySelector("#lhaiIntakeDispatchDiagLoading");
  const runBtn = document.querySelector("#lhaiIntakeDispatchDiagRunBtn");
  if (!tid) {
    showIntakeDispatchDiagToast(t("messages.diag.select_thread", "Please select a thread first."));
    return;
  }
  if (!(body instanceof HTMLElement)) return;
  if (runBtn instanceof HTMLButtonElement) runBtn.disabled = true;
  if (loading instanceof HTMLElement) {
    loading.hidden = false;
    loading.textContent = t("messages.loading", "Loading…");
  }
  body.innerHTML = "";
  try {
    const data = await serviceCatalogAdminApi.getIntakeDispatchDiagnostics({ threadId: tid });
    body.innerHTML = buildIntakeDispatchDiagnosticsHtml(data);
    const copyBtn = document.querySelector("#lhaiIntakeDiagCopyTidBtn");
    if (copyBtn instanceof HTMLButtonElement) {
      const copyClone = /** @type {HTMLButtonElement} */ (copyBtn.cloneNode(true));
      copyBtn.replaceWith(copyClone);
      copyClone.addEventListener("click", async () => {
        let out = "";
        try {
          out = JSON.stringify(data, null, 2);
        } catch {
          out = String(data);
        }
        try {
          await navigator.clipboard.writeText(out);
          showIntakeDispatchDiagToast(t("messages.diag.json_copied", "Full diagnostics JSON copied."));
        } catch {
          showIntakeDispatchDiagToast(t("messages.diag.copy_failed", "Copy failed."));
        }
      });
    }
    showIntakeDispatchDiagToast(t("messages.diag.partner_loaded", "Partner assignment diagnostics loaded."));
  } catch (e) {
    const msg = e && typeof e.message === "string" ? e.message : String(e);
    body.innerHTML = `<p class="lhai-state lhai-state--error">${escapeHtml(msg)}</p>`;
    showIntakeDispatchDiagToast(t("messages.diag.load_failed", "Could not load diagnostics."));
  } finally {
    if (runBtn instanceof HTMLButtonElement) runBtn.disabled = false;
    if (loading instanceof HTMLElement) loading.hidden = true;
  }
}

const CUSTOMER_BIDDING_WORKFLOW_TYPES = new Set(["PARTNER_BIDDING", "CUSTOMER_SELECTS_PARTNER"]);
const BIDDING_POST_INTRO_TEXT_KO = () =>
  t(
    "messages.bidding.intro",
    "We sent quote requests to matching partners. When proposals arrive, you can compare and choose one here."
  );

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
      note.textContent = t(
        "messages.bidding.composer_lock",
        "You cannot message bidding partners until you select one below from the quote cards."
      );
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
  const name = String(bid.partner_display_name || "").trim() || t("messages.bidding.partner_default", "Partner");
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
    ? `<div class="lhai-customer-bid-card__actions"><button type="button" class="lhai-button lhai-button--primary" data-lhai-select-bid="${escapeHtml(bidId)}">${escapeHtml(t("messages.bidding.select_partner", "Select this partner"))}</button></div>`
    : isClosed
      ? `<p class="lhai-customer-bid-card__state u-text-muted">${escapeHtml(t("messages.bidding.partner_selected", "This partner is selected."))}</p>`
      : `<p class="lhai-customer-bid-card__state u-text-muted">${escapeHtml(t("messages.bidding.not_selectable", "Cannot select."))}</p>`;
  const msgBody = pmsg ? escapeHtml(pmsg).replace(/\n/g, "<br />") : "—";
  return `
    <article class="${cardClass}">
      <div class="lhai-customer-bid-card__name">${escapeHtml(name)}</div>
      <dl class="lhai-customer-bid-card__dl">
        <div><dt>${escapeHtml(t("messages.bidding.price_label", "Price"))}</dt><dd>${escapeHtml(priceLine)}</dd></div>
        <div><dt>${escapeHtml(t("messages.bidding.eta_label", "Estimated turnaround"))}</dt><dd>${escapeHtml(eta)}</dd></div>
        <div><dt>${escapeHtml(t("messages.bidding.included_label", "Included items"))}</dt><dd>${escapeHtml(included)}</dd></div>
      </dl>
      <div class="lhai-customer-bid-card__partner-msg">
        <div class="lhai-customer-bid-card__partner-msg-label">${escapeHtml(t("messages.bidding.partner_message_label", "Partner message"))}</div>
        <div class="lhai-customer-bid-card__partner-msg-body">${msgBody}</div>
      </div>
      ${btn}
    </article>`;
}

/** @param {Record<string, unknown>} snap */
function renderCustomerSelectedOfferCardHtml(snap) {
  const sel =
    snap.selected_offer_summary && typeof snap.selected_offer_summary === "object"
      ? /** @type {Record<string, unknown>} */ (snap.selected_offer_summary)
      : null;
  const title = sel
    ? String(sel.title || sel.vehicle_title || t("messages.bidding.selected_offer_default", "Selected offer")).trim()
    : t("messages.bidding.selected_offer_default", "Selected offer");
  const total = sel ? formatMoney(sel.estimated_total, String(sel.currency || "USD")) : "—";
  const partner = sel ? String(sel.partner_name || "").trim() : "";
  const thumb = sel ? String(sel.thumbnail_url || "").trim() : "";
  const wid = customerBidServiceRequestId();
  const href = buildCustomerBidResultsPageHref(wid, selectedThreadId);
  const thumbHtml = thumb
    ? `<img class="lhai-messages-selected-offer__thumb" src="${escapeHtml(thumb)}" alt="" loading="lazy" />`
    : `<div class="lhai-messages-selected-offer__thumb lhai-messages-selected-offer__thumb--empty" aria-hidden="true"></div>`;
  return `
    <div class="lhai-messages-selected-offer" role="region" aria-label="${escapeHtml(t("messages.bidding.selected_offer_default", "Selected offer"))}">
      ${thumbHtml}
      <div class="lhai-messages-selected-offer__body">
        <p class="lhai-messages-selected-offer__title">${escapeHtml(title)}</p>
        <p class="lhai-messages-selected-offer__meta">${escapeHtml(total)}${partner ? ` · ${escapeHtml(partner)}` : ""}</p>
        <p class="lhai-messages-selected-offer__hint">${escapeHtml(t("messages.bidding.selected_offer_hint", "Your selected partner has been added to this conversation."))}</p>
        <div class="lhai-messages-car-bid-banner__actions">
          <button type="button" class="lhai-button lhai-button--secondary" data-lhai-focus-composer>${escapeHtml(t("messages.bidding.open_conversation", "Open conversation"))}</button>
          <a class="lhai-button lhai-button--ghost" href="${escapeHtml(href)}">${escapeHtml(t("messages.bidding.view_offer_details", "View offer details"))}</a>
        </div>
      </div>
    </div>`;
}

/** @param {Record<string, unknown>} snap */
function renderCustomerCarBidBannerHtml(snap) {
  const wid = customerBidServiceRequestId();
  const href = buildCustomerBidResultsPageHref(wid, selectedThreadId);
  const phase = resolveCustomerBidDisplayPhase(
    String(snap.status || "OPEN"),
    snap.expires_at != null ? String(snap.expires_at) : ""
  );
  const offerCount =
    snap.offer_count != null
      ? Number(snap.offer_count)
      : Array.isArray(snap.offers)
        ? snap.offers.length
        : 0;
  const recent = formatRelativeTimeKo(snap.recent_updated_at != null ? String(snap.recent_updated_at) : "");
  const countdown = formatBidDeadlineForUi(snap);

  if (phase === "CUSTOMER_SELECTED") {
    return `
      <div class="lhai-messages-car-bid-banner lhai-messages-car-bid-banner--selected" role="region" aria-label="${escapeHtml(t("messages.bidding.partner_selected_aria", "Partner selected"))}">
        <p class="lhai-messages-car-bid-banner__title">${escapeHtml(t("messages.bidding.partner_selected_title", "Partner selected"))}</p>
        ${renderCustomerSelectedOfferCardHtml(snap)}
      </div>`;
  }

  if (phase === "EXPIRED") {
    return `
      <div class="lhai-messages-car-bid-banner lhai-messages-car-bid-banner--expired" role="region" aria-label="${escapeHtml(t("messages.bidding.car.expired_aria", "Bidding ended"))}">
        <p class="lhai-messages-car-bid-banner__title">${escapeHtml(t("messages.bidding.car.expired_title", "Bidding has ended."))}</p>
        <p class="lhai-messages-car-bid-banner__desc">${escapeHtml(t("messages.bidding.car.expired_desc", "Please select one of the proposals received so far."))}</p>
        <div class="lhai-messages-car-bid-banner__actions">
          <a class="lhai-button lhai-button--primary" href="${escapeHtml(href)}">${escapeHtml(t("messages.bidding.car.select_offer", "Choose a proposal"))}</a>
        </div>
      </div>`;
  }

  return `
    <div class="lhai-messages-car-bid-banner" role="region" aria-label="${escapeHtml(t("messages.bidding.car.in_progress_aria", "Car purchase quotes"))}">
      <p class="lhai-messages-car-bid-banner__title">${escapeHtml(t("messages.bidding.car.in_progress_title", "Car purchase quotes in progress"))}</p>
      <dl class="lhai-messages-car-bid-banner__stats">
        <div><dt>${escapeHtml(t("messages.bidding.car.offers_received", "Proposals received"))}</dt><dd>${escapeHtml(String(offerCount))}</dd></div>
        <div><dt>${escapeHtml(t("messages.bidding.car.recent_update", "Latest update"))}</dt><dd>${escapeHtml(recent)}</dd></div>
        <div><dt>${escapeHtml(t("messages.bidding.car.deadline", "Time until bidding closes"))}</dt><dd id="messageCarBidCountdown">${escapeHtml(countdown)}</dd></div>
      </dl>
      <div class="lhai-messages-car-bid-banner__actions">
        <a class="lhai-button lhai-button--primary" href="${escapeHtml(href)}">${escapeHtml(t("messages.bidding.car.compare", "Compare quotes"))}</a>
      </div>
    </div>`;
}

/** @param {Record<string, unknown>} meta */
function renderBidComparisonEntryBubbleHtml(meta) {
  const wid = customerBidServiceRequestId() || String(meta.service_request_id || "").trim();
  const href = buildCustomerBidResultsPageHref(wid, selectedThreadId);
  return `
    <div class="lhai-chat-bubble lhai-chat-bubble--bid-entry">
      <div class="lhai-chat-bubble__title">${escapeHtml(t("messages.bidding.car.entry_title", "Car quote request started"))}</div>
      <p class="lhai-chat-bubble__body">${escapeHtml(t("messages.bidding.car.entry_body", "When partners submit quotes, you can review them on the compare-quotes screen."))}</p>
      <p class="lhai-messages-bid-entry__cta">
        <a class="lhai-button lhai-button--primary" href="${escapeHtml(href)}">${escapeHtml(t("messages.bidding.car.open_compare", "Open compare-quotes screen"))}</a>
      </p>
    </div>`;
}

function renderCustomerBidPanelInnerHtml() {
  const snap = customerBidPanelSnapshot;
  const intro = `<p class="lhai-customer-bid-panel__intro">${escapeHtml(BIDDING_POST_INTRO_TEXT_KO())}</p>`;
  const head = `<div class="lhai-customer-bid-panel__head"><h3 class="lhai-customer-bid-panel__title">${escapeHtml(t("messages.bidding.panel_title", "Partner quotes"))}</h3></div>`;
  const showFlash =
    Boolean(customerBidSelectBannerThreadId) &&
    customerBidSelectBannerThreadId === selectedThreadId &&
    Date.now() < customerBidSelectBannerUntil;
  const flash = showFlash
    ? `<div class="lhai-customer-bid-panel__flash" role="status">${escapeHtml(t("messages.bidding.select_complete", "Partner selected"))}</div>`
    : "";
  if (!snap || typeof snap !== "object") {
    return `${head}${intro}${flash}<p class="lhai-state lhai-state--error">${escapeHtml(t("messages.bidding.load_failed", "Could not load quote information."))}</p>`;
  }
  const status = String(snap.status || "OPEN").trim().toUpperCase();
  const bids = Array.isArray(snap.bids) ? snap.bids : [];
  const doneLine =
    status === "CUSTOMER_SELECTED"
      ? `<p class="lhai-customer-bid-panel__selected-msg">${escapeHtml(t("messages.bidding.already_selected", "You have already completed your selection."))}</p>`
      : "";
  const empty =
    status === "OPEN" && bids.length === 0
      ? `<p class="lhai-customer-bid-panel__empty">${escapeHtml(t("messages.bidding.empty", "No quotes have arrived yet. They will appear here when partners submit."))}</p>`
      : "";
  const cards = bids.map((b) => renderCustomerBidCardHtml(b, status)).join("");
  return `${head}${intro}${flash}${doneLine}${empty}<div class="lhai-customer-bid-panel__cards">${cards}</div>`;
}

/** @param {string} message */
function renderCustomerBidPanelErrorHtml(message) {
  const intro = `<p class="lhai-customer-bid-panel__intro">${escapeHtml(BIDDING_POST_INTRO_TEXT_KO())}</p>`;
  const head = `<div class="lhai-customer-bid-panel__head"><h3 class="lhai-customer-bid-panel__title">${escapeHtml(t("messages.bidding.panel_title", "Partner quotes"))}</h3></div>`;
  return `${head}${intro}<p class="lhai-state lhai-state--error">${escapeHtml(message)}</p>`;
}

function hideCustomerBiddingUi() {
  const banner = document.querySelector("#messageCarBidBanner");
  const panel = document.querySelector("#messageBidResultsPanel");
  if (banner instanceof HTMLElement) {
    banner.hidden = true;
    banner.innerHTML = "";
  }
  if (panel instanceof HTMLElement) {
    panel.hidden = true;
    panel.innerHTML = "";
  }
  customerBidPanelSnapshot = null;
  customerBidPanelAwaitingFetch = false;
  stopCustomerBidCountdownTimer();
}

async function refreshCustomerBidPanel() {
  const banner = document.querySelector("#messageCarBidBanner");
  const panel = document.querySelector("#messageBidResultsPanel");

  if (customerBidPanelBoundThreadId !== selectedThreadId) {
    customerBidPanelBoundThreadId = selectedThreadId;
    customerBidSelectBannerUntil = 0;
    customerBidSelectBannerThreadId = "";
    customerBidPanelSnapshot = null;
  }

  if (!isCustomerServiceBiddingThreadContext()) {
    hideCustomerBiddingUi();
    syncCustomerComposerBidGate();
    return;
  }

  const wid = customerBidServiceRequestId();
  if (!wid) {
    hideCustomerBiddingUi();
    syncCustomerComposerBidGate();
    return;
  }

  customerBidPanelAwaitingFetch = true;
  syncCustomerComposerBidGate();

  let rawBidSnapshot = null;
  try {
    rawBidSnapshot = await customerBidsApi.listByServiceRequest(wid);
  } catch (err) {
    const msg = err && typeof err.message === "string" ? err.message : t("messages.bidding.load_failed", "Could not load quote information.");
    customerBidPanelSnapshot = null;
    if (banner instanceof HTMLElement) {
      banner.hidden = false;
      setInnerHtmlIfChanged(
        banner,
        `<p class="lhai-state lhai-state--error">${escapeHtml(msg)}</p>`,
      );
    }
    if (panel instanceof HTMLElement) panel.hidden = true;
    customerBidPanelAwaitingFetch = false;
    syncCustomerComposerBidGate();
    return;
  }

  customerBidPanelSnapshot =
    rawBidSnapshot && typeof rawBidSnapshot === "object"
      ? {
          bid_request_id: String(rawBidSnapshot.bid_request_id || ""),
          status: String(rawBidSnapshot.status || "OPEN").trim().toUpperCase(),
          bidding_mode: rawBidSnapshot.bidding_mode != null ? String(rawBidSnapshot.bidding_mode) : "",
          bids: Array.isArray(rawBidSnapshot.bids) ? rawBidSnapshot.bids : [],
          offers: Array.isArray(rawBidSnapshot.offers)
            ? rawBidSnapshot.offers
            : rawBidSnapshot.offers === null
              ? null
              : [],
          expires_at: rawBidSnapshot.expires_at != null ? String(rawBidSnapshot.expires_at) : "",
          is_expired: rawBidSnapshot.is_expired === true,
          remaining_label: rawBidSnapshot.remaining_label != null ? String(rawBidSnapshot.remaining_label) : "",
          bid_deadline:
            rawBidSnapshot.bid_deadline && typeof rawBidSnapshot.bid_deadline === "object"
              ? rawBidSnapshot.bid_deadline
              : null,
          offer_count: rawBidSnapshot.offer_count,
          partner_count: rawBidSnapshot.partner_count,
          recent_updated_at:
            rawBidSnapshot.recent_updated_at != null ? String(rawBidSnapshot.recent_updated_at) : "",
          quote_request_usage: rawBidSnapshot.quote_request_usage,
          customer_vehicle_requests: rawBidSnapshot.customer_vehicle_requests,
          selected_offer_summary: rawBidSnapshot.selected_offer_summary,
        }
      : null;
  customerBidPanelAwaitingFetch = false;

  const bidSnapshot =
    customerBidPanelSnapshot && typeof customerBidPanelSnapshot === "object"
      ? /** @type {Record<string, unknown>} */ (customerBidPanelSnapshot)
      : null;
  if (!bidSnapshot) {
    hideCustomerBiddingUi();
    syncCustomerComposerBidGate();
    return;
  }

  paintCustomerBidPanelFromSnapshot(bidSnapshot);
  syncCustomerComposerBidGate();
}

/** @param {Record<string, unknown>} bidSnapshot */
function paintCustomerBidPanelFromSnapshot(bidSnapshot) {
  const banner = document.querySelector("#messageCarBidBanner");
  const panel = document.querySelector("#messageBidResultsPanel");
  const phase = resolveCustomerBidDisplayPhase(
    String(bidSnapshot.status || "OPEN"),
    bidSnapshot.expires_at != null ? String(bidSnapshot.expires_at) : "",
  );
  const isCar = isCarPurchaseBidListResponse(customerBidPanelSnapshot);
  if (phase === "CUSTOMER_SELECTED" && banner instanceof HTMLElement) {
    banner.hidden = false;
    setInnerHtmlIfChanged(
      banner,
      isCar
        ? renderCustomerCarBidBannerHtml(bidSnapshot)
        : `<div class="lhai-messages-car-bid-banner lhai-messages-car-bid-banner--selected">${renderCustomerSelectedOfferCardHtml(bidSnapshot)}</div>`,
    );
    if (panel instanceof HTMLElement) {
      panel.hidden = true;
      if (panel.innerHTML !== "") panel.innerHTML = "";
    }
  } else if (isCar && banner instanceof HTMLElement) {
    banner.hidden = false;
    setInnerHtmlIfChanged(banner, renderCustomerCarBidBannerHtml(bidSnapshot));
    startCustomerBidCountdownTimer();
    if (panel instanceof HTMLElement) {
      panel.hidden = true;
      if (panel.innerHTML !== "") panel.innerHTML = "";
    }
  } else if (panel instanceof HTMLElement) {
    if (banner instanceof HTMLElement) {
      banner.hidden = true;
      if (banner.innerHTML !== "") banner.innerHTML = "";
    }
    panel.hidden = false;
    setInnerHtmlIfChanged(panel, renderCustomerBidPanelInnerHtml());
  }
}

function repaintCustomerBidPanelFromSnapshot() {
  if (!isCustomerServiceBiddingThreadContext()) return;
  const bidSnapshot =
    customerBidPanelSnapshot && typeof customerBidPanelSnapshot === "object"
      ? /** @type {Record<string, unknown>} */ (customerBidPanelSnapshot)
      : null;
  if (!bidSnapshot) return;
  paintCustomerBidPanelFromSnapshot(bidSnapshot);
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
    const msg = err && typeof err.message === "string" ? err.message : t("messages.alert.select_failed", "Selection failed.");
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
    container.innerHTML = escapeHtml(t("messages.detail.select_thread", "Select a conversation on the left."));
    return;
  }
  const isAdminChannel = threadMeta
    ? normalizeThreadRole(threadMeta) === "ADMIN"
    : String(selectedThreadRole || "").toUpperCase() === "ADMIN";
  const operatorContextBanner =
    operatorInboxMode && threadMeta
      ? isAdminChannel
        ? `<div class="lhai-thread-detail-banner lhai-messages-ai-scope u-mb-2" role="region" aria-label="${escapeHtml(t("messages.banner.operator.aria", "Operator notice"))}">
             ${escapeHtml(t("messages.banner.operator.admin", "Operator view: Customer center (global support) thread. Reply to account-wide inquiries and guidance."))}
           </div>`
        : `<div class="lhai-thread-detail-banner lhai-thread-detail-banner--service lhai-messages-ai-scope u-mb-2" role="region" aria-label="${escapeHtml(t("messages.banner.operator.aria", "Operator notice"))}">
             ${escapeHtml(t("messages.banner.operator.service", "Operator view: Service-only thread. Reply within this service contract and progress scope."))}
           </div>`
      : "";
  const showIntakeDiag =
    Boolean(operatorInboxMode && threadMeta && normalizeThreadRole(threadMeta) === "SERVICE");
  const intakeDiagBlock = showIntakeDiag
    ? `<section class="lhai-card lhai-intake-diag-panel u-mb-2" id="lhaiIntakeDispatchDiagWrap" aria-labelledby="lhaiIntakeDiagHeading">
        <div class="lhai-intake-diag-panel__head" style="display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:0.5rem">
          <h3 id="lhaiIntakeDiagHeading" class="lhai-card__title" style="margin:0;font-size:1rem">${escapeHtml(t("messages.diag.partner_assignment_title", "Partner assignment diagnostics"))}</h3>
          <button type="button" class="lhai-button lhai-button--secondary" id="lhaiIntakeDispatchDiagRunBtn" data-lhai-action="load-intake-dispatch-diag">${escapeHtml(t("messages.diag.load", "Load diagnostics"))}</button>
        </div>
        <p class="lhai-help u-mt-1" id="lhaiIntakeDispatchDiagLoading" hidden>${escapeHtml(t("messages.loading", "Loading…"))}</p>
        <div id="lhaiIntakeDispatchDiagBody" class="lhai-intake-diag-body u-mt-2"></div>
      </section>
      <section class="lhai-card lhai-intake-diag-panel u-mb-2" id="lhaiBiddingNotifyDebugWrap" aria-labelledby="lhaiBiddingNotifyDebugHeading">
        <div class="lhai-intake-diag-panel__head" style="display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:0.5rem">
          <h3 id="lhaiBiddingNotifyDebugHeading" class="lhai-card__title" style="margin:0;font-size:1rem">${escapeHtml(t("messages.diag.bidding_email_title", "Bidding-start email diagnostics"))}</h3>
          <button type="button" class="lhai-button lhai-button--secondary" id="lhaiBiddingNotifyDebugRunBtn" data-lhai-action="load-bidding-email-diag">${escapeHtml(t("messages.diag.load_email", "Load email diagnostics"))}</button>
        </div>
        <p class="lhai-help u-mt-1">${escapeHtml(t("messages.diag.bidding_email_help", "Calls the API with your admin session (not a direct URL). Verifies whether partner bidding-started emails were sent after intake submission."))}</p>
        <p class="lhai-help u-mt-1" id="lhaiBiddingNotifyDebugLoading" hidden>${escapeHtml(t("messages.loading", "Loading…"))}</p>
        <div id="lhaiBiddingNotifyDebugBody" class="lhai-intake-diag-body u-mt-2"></div>
      </section>`
    : "";
  const customerExtras =
    !operatorInboxMode && isAdminChannel
      ? `<div class="lhai-thread-detail-banner lhai-messages-ai-scope u-mb-2" role="region" aria-label="${escapeHtml(t("messages.banner.channel.aria", "Channel notice"))}">
           ${escapeHtml(t("messages.banner.channel.admin", "This thread is for Customer center (operations support) only. Post account or general progress inquiries here. For service-specific progress or AI guidance, use the matching service conversation in the list on the left."))}
         </div>
         <div class="lhai-messages-ai-escalation u-mb-2">
           <button type="button" class="lhai-button lhai-button--secondary" id="lhaiEscalateToOpsBtn">${escapeHtml(t("messages.escalate.to_ops", "Request operator help"))}</button>
           <button type="button" class="lhai-button lhai-button--secondary" id="lhaiEscalateInPersonBtn">${escapeHtml(t("messages.escalate.in_person", "Request in-person support"))}</button>
         </div>`
      : !operatorInboxMode
        ? `<div class="lhai-thread-detail-banner lhai-thread-detail-banner--service lhai-messages-ai-scope u-mb-2" role="region" aria-label="${escapeHtml(t("messages.banner.channel.aria", "Channel notice"))}">
             ${escapeHtml(t("messages.banner.channel.service", "This conversation is limited to your selected service. Messages about schedule, deliverables, and this service scope are answered most accurately here. For account-wide, quote, or billing questions, use the Customer center thread in the list on the left."))}
             <div class="lhai-messages-service-actions">
               <button type="button" class="lhai-button lhai-button--secondary" id="lhaiEscalateServiceToAdminBtn">${escapeHtml(t("messages.escalate.to_customer_center", "Request link to customer center"))}</button>
             </div>
           </div>`
        : "";
  const placeholder = partnerInboxMode
    ? t("messages.compose.partner", "Type a message to send to the customer…")
    : t("messages.compose", "Type a message…");
  const sendLabel = t("messages.send", "Send");

  container.className = "lhai-message-detail lhai-message-detail--chat";
  container.innerHTML = `
    <div class="lhai-chat-header">
      <p id="messageChatEyebrow" class="lhai-chat-header__eyebrow" aria-hidden="true"></p>
      <div id="messageChatHeaderBadges" class="lhai-chat-header__badge-row" aria-label="${escapeHtml(t("messages.header.thread_type_aria", "Thread type"))}"></div>
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
    <section id="messageCarBidBanner" class="lhai-messages-car-bid-banner-wrap u-mb-2" hidden aria-label="${escapeHtml(t("messages.bidding.car.banner_aria", "Car purchase quote notice"))}"></section>
    <section id="messageBidResultsPanel" class="lhai-customer-bid-panel u-mb-2" hidden aria-label="${escapeHtml(t("messages.bidding.panel_aria", "Partner quote comparison"))}"></section>
    <div id="messageChatScroll" class="lhai-chat-scroll" role="log" aria-live="polite">
      <div id="messageChatStream" class="lhai-chat-stream"></div>
      <button type="button" id="messageChatNewBelow" class="lhai-chat-new-below" hidden aria-hidden="true">
        ${safeText(t("messages.chat.new_below_one", "1 new message"))}
      </button>
    </div>
    <p id="messageBidComposerLockNote" class="lhai-chat-composer__bid-lock-note u-text-muted u-mb-1" hidden></p>
    <form id="messageChatForm" class="lhai-chat-composer" autocomplete="off">
      <label class="lhai-chat-composer__field">
        <textarea id="messageChatInput" class="lhai-chat-composer__input" rows="2" data-i18n-placeholder="messages.compose" placeholder="${safeText(placeholder)}" maxlength="4000" data-i18n-aria-label="messages.compose" aria-label="${escapeHtml(t("messages.compose", "Type a message…"))}"></textarea>
      </label>
      <button type="submit" class="lhai-button lhai-button--primary lhai-chat-composer__send">${safeText(sendLabel)}</button>
    </form>
  `;
  applyI18nToDom(container);
  syncChatHeader(threadMeta);
  if (showIntakeDiag) {
    void refreshBiddingNotificationDebugPanel(selectedThreadId);
  }
}

/** @param {Record<string, unknown> | null | undefined} threadMeta */
function syncChatHeader(threadMeta) {
  const meta = effectiveThreadHeaderMeta(threadMeta);
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
  if (!meta || !selectedThreadId) {
    eyebrow.textContent = "";
    eyebrow.hidden = false;
    badges.innerHTML = "";
    subtitle.textContent = "";
    titleEl.textContent = "";
    applyServiceDeliveryBadge(deliveryBadgeEl instanceof HTMLElement ? deliveryBadgeEl : null, "");
    return;
  }
  const role = normalizeThreadRole(meta);
  const detailBadgeOpts = { forDetailHeader: true, omitDeliveryBadge: role !== "ADMIN" };

  if (operatorInboxMode) {
    badges.innerHTML = threadListBadgesHtml(meta, detailBadgeOpts);
    eyebrow.textContent = role === "ADMIN" ? t("messages.header.operator.admin_eyebrow", "Customer center (operator view)") : t("messages.header.operator.service_eyebrow", "Service (operator view)");
    eyebrow.hidden = false;
    if (role === "ADMIN") {
      titleEl.textContent = adminThreadDisplayTitle(meta, t);
      applyServiceDeliveryBadge(deliveryBadgeEl instanceof HTMLElement ? deliveryBadgeEl : null, "");
    } else {
      titleEl.textContent = serviceThreadDisplayName(meta, "", t);
      applyServiceDeliveryBadge(deliveryBadgeEl instanceof HTMLElement ? deliveryBadgeEl : null, deliveryModeBadgeLabel(meta));
    }
    if (role === "ADMIN") {
      subtitle.textContent = t("messages.header.operator.admin_subtitle", "Thread for account-wide customer inquiries and guidance.");
    } else if (isInPersonServiceThread(meta)) {
      const summary = String(meta.agent_assignment_summary || "").trim();
      const nameOnly = String(meta.assigned_agent_name || "").trim();
      if (summary) subtitle.textContent = summary;
      else if (nameOnly) subtitle.textContent = localizedStatus("messages.header.agent_assigned", "Assigned agent: {name}", { name: nameOnly });
      else subtitle.textContent = t("messages.header.agent_pending", "Waiting for agent assignment.");
    } else {
      subtitle.textContent = t("messages.header.operator.service_subtitle", "Thread for a specific service contract and progress.");
    }
    return;
  }

  if (partnerInboxMode) {
    badges.innerHTML = "";
    eyebrow.textContent = t("messages.header.partner.eyebrow", "Partner inbox");
    eyebrow.hidden = false;
    titleEl.textContent = serviceThreadDisplayName(meta, "", t);
    applyServiceDeliveryBadge(deliveryBadgeEl instanceof HTMLElement ? deliveryBadgeEl : null, "");
    subtitle.textContent = t("messages.header.partner.subtitle", "Review assigned customer service threads and chat with customers.");
    return;
  }

  badges.innerHTML = threadListBadgesHtml(meta, detailBadgeOpts);

  if (role === "ADMIN") {
    eyebrow.textContent = t("messages.thread.customer_center", "Customer center");
    eyebrow.hidden = false;
    titleEl.textContent = adminThreadDisplayTitle(meta, t);
    applyServiceDeliveryBadge(deliveryBadgeEl instanceof HTMLElement ? deliveryBadgeEl : null, "");
    subtitle.textContent = t("messages.header.customer.admin_subtitle", "Channel for operations, quotes, billing, payments, and general inquiries.");
    return;
  }

  const dm = deliveryModeBadgeLabel(meta);
  eyebrow.textContent = dm ? "" : t("messages.header.customer.service_eyebrow", "Service");
  eyebrow.hidden = !String(eyebrow.textContent || "").trim();
  titleEl.textContent = serviceThreadDisplayName(meta, "", t);
  applyServiceDeliveryBadge(deliveryBadgeEl instanceof HTMLElement ? deliveryBadgeEl : null, dm);

  if (isInPersonServiceThread(meta)) {
    const summary = String(meta.agent_assignment_summary || "").trim();
    const nameOnly = String(meta.assigned_agent_name || "").trim();
    if (summary) subtitle.textContent = summary;
    else if (nameOnly) subtitle.textContent = localizedStatus("messages.header.agent_assigned", "Assigned agent: {name}", { name: nameOnly });
    else subtitle.textContent = t("messages.header.agent_pending", "Waiting for agent assignment.");
  } else {
    subtitle.textContent =
      dm === "AI Agent"
        ? t("messages.header.customer.ai_agent_subtitle", "This service is guided by AI Agent within a limited scope.")
        : handlerSubtitleKo(meta.handler_type);
  }
}

/** 폴백 폴링에서 DOM 재렌더를 줄이기 위한 스레드 메시지 시그니처. */
function threadMessagesListSignature(msgs) {
  if (!Array.isArray(msgs)) return "null";
  let unreadN = 0;
  for (const m of msgs) {
    if (m && typeof m === "object" && m.unread) unreadN += 1;
  }
  const n = msgs.length;
  const last = n ? msgs[n - 1] : null;
  return `${n}:${String(last?.id || "")}:${String(last?.created_at || "")}:${unreadN}`;
}

async function loadThreadMessages(options = {}) {
  const realtime = Boolean(options.realtime);
  const dispatchHeaderOnMarkRead = Boolean(options.dispatchHeaderOnMarkRead);
  const skipInlineListBadgeSync = Boolean(options.skipInlineListBadgeSync);
  const silentIfUnchanged = Boolean(options.silentIfUnchanged);
  const refreshSource = resolveMessagesRefreshSource(options);
  const traceMessageId = String(options.traceMessageId || "").trim();
  syncChatScrollThreadContext();
  const prevMessages = Array.isArray(currentThreadMessages) ? currentThreadMessages : [];
  const prevMessageIdSet = new Set(
    prevMessages.map((m) => String(m?.id || "").trim()).filter(Boolean),
  );
  if (traceMessageId) {
    markDetailFetchStarted(traceMessageId, { refreshSource: refreshSource || "sse" });
  }
  let savedComposer = options.savedComposer;
  if (savedComposer == null && realtime) {
    const ta = document.querySelector("#messageChatInput");
    if (ta instanceof HTMLTextAreaElement) {
      savedComposer = ta.value;
      messagesRtDebug("composer snapshot for realtime refresh", { chars: String(savedComposer.length) });
    }
  }

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
  let markedReadCount = 0;
  const prevSig =
    silentIfUnchanged && selectedThreadId ? threadMessagesListSignature(currentThreadMessages) : "";
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
          logCustomerMessageTranslationFailures(detail.messages, "messages_page_thread_detail");
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

  if (!operatorInboxMode) {
    reconcileThreadHeaderMetaAfterDetailLoad();
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
            markedReadCount += 1;
          } catch {
            // Ignore per-message read failure and keep page usable.
          }
        })
      );
    }
  }
  const sigUnchanged =
    silentIfUnchanged &&
    prevSig &&
    prevSig === threadMessagesListSignature(currentThreadMessages);
  /* Partner/operator: thread-level unread is cleared on detail fetch; message rows may be
   * unchanged so the signature matches and we must not return before list/header badge sync. */
  if (sigUnchanged && !partnerInboxMode && !operatorInboxMode) {
    messagesRtDebug("fallback tick skipped unchanged thread messages", {
      refresh_source: refreshSource,
      polling_intervals: getMessagesPollingIntervalsForDebug(),
    });
    await refreshCustomerBidPanel();
    return;
  }
  messagesRtDebug("markRead count", {
    markedReadCount,
    customerPath: !operatorInboxMode && !partnerInboxMode,
  });
  const listBadgeSyncReason =
    partnerInboxMode && selectedThreadId
      ? "partner-thread-read"
      : !operatorInboxMode && !partnerInboxMode && markedReadCount > 0
        ? "customer-mark-read"
        : "";

  if (listBadgeSyncReason && !skipInlineListBadgeSync) {
    await refreshThreadListOnly({ syncHeader: true, reloadCurrentMessages: false, reason: listBadgeSyncReason });
    window.dispatchEvent(
      new CustomEvent("lhai:messages-changed", {
        detail: { reason: listBadgeSyncReason, thread_id: String(selectedThreadId || "").trim() },
      }),
    );
  }

  if (realtime && selectedThreadId) {
    const wrap = document.querySelector("#messageChatScroll");
    const nearBottom = !(wrap instanceof HTMLElement) || isChatScrollNearBottom(wrap);
    const incomingNew = (Array.isArray(currentThreadMessages) ? currentThreadMessages : []).filter(
      (m) => {
        const id = String(m?.id || "").trim();
        return id && !prevMessageIdSet.has(id);
      },
    );
    if (incomingNew.length && !nearBottom) {
      chatNewMessagesBelowCount += incomingNew.length;
      renderChatBubbles({ scrollIfNearBottom: false });
      updateChatNewMessagesBelowIndicator();
    } else {
      if (incomingNew.length) resetChatNewMessagesBelowState();
      renderChatBubbles({ scrollIfNearBottom: true, forceScrollToBottom: Boolean(incomingNew.length) });
    }
  } else {
    renderChatBubbles({});
  }
  if (savedComposer != null) {
    const ta2 = document.querySelector("#messageChatInput");
    if (ta2 instanceof HTMLTextAreaElement) {
      ta2.value = savedComposer;
      messagesRtDebug("composer restored after realtime refresh");
    }
  }
  if (traceMessageId) {
    markDetailFetchFinished(traceMessageId);
  }
  if (refreshSource) {
    completeLatencyForMessagesAfterLoad(prevMessageIdSet, currentThreadMessages, {
      refreshSource,
    });
  }
  if (dispatchHeaderOnMarkRead) {
    const alreadySynced = Boolean(listBadgeSyncReason);
    const isStaffInbox = partnerInboxMode || operatorInboxMode;
    const shouldDispatch = isStaffInbox ? !alreadySynced || operatorInboxMode : false;
    if (shouldDispatch) {
      window.dispatchEvent(
        new CustomEvent("lhai:messages-changed", {
          detail: { reason: "realtime-thread-read", thread_id: String(selectedThreadId || "").trim() },
        }),
      );
    }
  }
  logCustomerMessagesDomAfterRender();
  syncWorkflowSummaryStrip();
  await refreshCustomerBidPanel();
}

async function fetchThreadsListForMessagesPage() {
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
    threadListLoadError = msg || t("messages.list.load_failed", "Could not load conversations. Please try again shortly.");
    threads = [];
  }

  if (operatorInboxMode && Array.isArray(threads) && threads.length) {
    threads = sortOperatorInboxThreads(threads);
  }
  return threads;
}

function reconcileMessagesPageSelectionAfterListFetch(threads) {
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
          threadIdEquals(t.thread_id, selectedThreadId) &&
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
    if (selectedThreadId && threads.length) {
      const rowMatch = threads.find((t) => threadIdEquals(t.thread_id, selectedThreadId));
      if (rowMatch) {
        selectedThreadId = String(rowMatch.thread_id || "").trim();
      }
    }
    if (!selectedThreadId && threads.length) {
      selectedThreadId = pickDefaultThreadId(threads);
    }
    if (selectedThreadId && !threads.some((t) => threadIdEquals(t.thread_id, selectedThreadId))) {
      selectedThreadId = threads.length ? pickDefaultThreadId(threads) : "";
    }
  }
  const urlTid = String(messagesUrlRequestedThreadId || "").trim();
  if (urlTid) {
    const found = threads.some((t) => threadIdEquals(t.thread_id, urlTid));
    if (!found) {
      try {
        // eslint-disable-next-line no-console
        console.warn("[lhai][messages] thread_id query not in loaded thread list; using default selection.", {
          thread_id: urlTid,
          operatorInboxMode,
          partnerInboxMode,
          thread_count: Array.isArray(threads) ? threads.length : 0,
        });
      } catch {
        /* ignore */
      }
    }
    messagesUrlRequestedThreadId = "";
  }
}

function findThreadMetaInList(threads) {
  return threads.find((t) => {
    if (operatorInboxMode) {
      return (
        threadIdEquals(t.thread_id, selectedThreadId) &&
        String(t.customer_profile_id || "") === String(threadOwnerProfileId || "")
      );
    }
    return threadIdEquals(t.thread_id, selectedThreadId);
  });
}

function threadHasMessageId(messageId) {
  if (!messageId) return true;
  const arr = Array.isArray(currentThreadMessages) ? currentThreadMessages : [];
  return arr.some((m) => String(m?.id || "") === String(messageId));
}

let messagesFallbackPollTimer = null;
let messagesFallbackPollIntervalActive = 0;
const MESSAGES_FALLBACK_POLL_MS_DEFAULT = 8_000;
let messagesSafetyPollTimer = null;
let messagesSafetyPollIntervalActive = 0;
let messagesRealtimeUnsub = null;
let messagesRealtimeStatusBound = false;
let messagesPageVisibilityBound = false;
/** ``"run"`` | ``"stop"`` | ``"safety"`` — 디버그 로그 스팸 방지 */
let messagesLastFallbackPollDesired = null;
let messagesLanguageRefetchInFlight = false;

function ensureMessagesPageVisibilityBinding() {
  if (typeof document === "undefined" || messagesPageVisibilityBound) return;
  messagesPageVisibilityBound = true;
  document.addEventListener("visibilitychange", () => {
    messagesRtDebug("messages page visibility", { state: document.visibilityState });
    onMessagesRealtimeStatus({ detail: getRealtimeStatus() });
  });
}

/**
 * @param {number} [intervalMs]
 */
function startMessagesFallbackPolling(intervalMs) {
  const ms = Math.max(5_000, Number(intervalMs) || MESSAGES_FALLBACK_POLL_MS_DEFAULT);
  if (messagesFallbackPollTimer != null && messagesFallbackPollIntervalActive === ms) return;
  stopMessagesFallbackPolling();
  messagesFallbackPollIntervalActive = ms;
  messagesRtDebug("fallback polling start", { interval_ms: ms });
  messagesFallbackPollTimer = window.setInterval(() => {
    void (async () => {
      messagesRtDebug("fallback tick", { thread_id: selectedThreadId });
      await refreshThreadListOnly({
        syncHeader: true,
        reloadCurrentMessages: true,
        reason: "fallback-poll",
      });
    })();
  }, ms);
}

function stopMessagesFallbackPolling() {
  if (messagesFallbackPollTimer == null) return;
  window.clearInterval(messagesFallbackPollTimer);
  messagesFallbackPollTimer = null;
  messagesFallbackPollIntervalActive = 0;
  messagesRtDebug("fallback stopped");
}

function stopMessagesSafetyPolling() {
  if (messagesSafetyPollTimer == null) return;
  window.clearInterval(messagesSafetyPollTimer);
  messagesSafetyPollTimer = null;
  messagesSafetyPollIntervalActive = 0;
  messagesRtDebug("safety polling stop");
}

/**
 * SSE connected 전용: 누락된 message.created 보정(정상 수신 시 SSE가 즉시 refresh). 폴백 폴링과 별도.
 * @param {number} [intervalMs]
 */
function startMessagesSafetyPolling(intervalMs) {
  const ms = Math.max(
    MESSAGES_SAFETY_SYNC_MS_MIN,
    Number(intervalMs) || messagesSafetyPollIntervalMs(),
  );
  if (messagesSafetyPollTimer != null && messagesSafetyPollIntervalActive === ms) {
    return;
  }
  stopMessagesSafetyPolling();
  messagesSafetyPollIntervalActive = ms;
  messagesRtDebug("safety polling start", { interval_ms: ms, purpose: "missed-sse-backstop" });
  messagesSafetyPollTimer = window.setInterval(() => {
    void (async () => {
      const tid = String(selectedThreadId || "").trim();
      if (
        !canRunMessagesSafetySyncTick({
          selectedThreadId: tid,
          documentVisible: typeof document !== "undefined" && document.visibilityState === "visible",
        })
      ) {
        if (typeof document !== "undefined" && document.visibilityState !== "visible") {
          messagesRtDebug("safety tick skipped: document not visible");
        } else {
          messagesRtDebug("safety tick skipped: no selectedThreadId");
        }
        return;
      }
      const nBefore = Array.isArray(currentThreadMessages) ? currentThreadMessages.length : 0;
      messagesRtDebug("safety tick", { thread_id: tid, message_count_before: nBefore });
      await loadThreadMessages({
        realtime: true,
        silentIfUnchanged: true,
        reason: "safety-sync",
        refreshSource: "safety-sync",
      });
      const nAfter = Array.isArray(currentThreadMessages) ? currentThreadMessages.length : 0;
      messagesRtDebug("current thread refreshed (safety-sync)", {
        thread_id: tid,
        message_count_before: nBefore,
        message_count_after: nAfter,
      });
      await refreshThreadListOnly({
        syncHeader: true,
        reloadCurrentMessages: false,
        reason: "safety-sync",
      });
    })();
  }, ms);
}

function onMessagesRealtimeStatus(ev) {
  const d = ev?.detail || getRealtimeStatus();
  const life = messagesRealtimeLifecycleFromDetail(d);
  const connected = !!d?.connected;
  const fallback = !!d?.fallback;
  const sseConnected = life === "connected" || (!life && connected && !fallback);
  const runFallback = shouldRunMessagesFallbackPoll(d);

  const pollMs = messagesFallbackPollIntervalMs(d);
  messagesRtDebug("realtime-status", {
    lifecycle: life,
    sse_connected: sseConnected,
    fallback_poll: runFallback,
    fallback_interval_ms: runFallback ? pollMs : null,
  });

  if (shouldUseMessagesSafetyPolling(d)) {
    stopMessagesFallbackPolling();
    if (messagesLastFallbackPollDesired !== "safety") {
      const safetyMs = messagesSafetyPollIntervalMs();
      messagesRtDebug("realtime connected — fallback poll stopped, safety polling on", {
        safety_interval_ms: safetyMs,
        polling_intervals: getMessagesPollingIntervalsForDebug(),
      });
      messagesLastFallbackPollDesired = "safety";
    }
    startMessagesSafetyPolling(messagesSafetyPollIntervalMs());
  } else {
    stopMessagesSafetyPolling();
    if (runFallback) {
      if (messagesLastFallbackPollDesired !== "run") {
        messagesRtDebug("realtime degraded — safety off, fallback polling on", { lifecycle: life });
        messagesLastFallbackPollDesired = "run";
      }
      startMessagesFallbackPolling(pollMs);
    } else {
      stopMessagesFallbackPolling();
      if (messagesLastFallbackPollDesired !== "stop") {
        messagesRtDebug("realtime polling off (hidden tab or stopped)", { lifecycle: life });
        messagesLastFallbackPollDesired = "stop";
      }
    }
  }
}

/**
 * 목록·헤더 메타만 갱신(채팅 셸 전체는 다시 그리지 않음). ``reloadCurrentMessages`` 시 현재 스레드 메시지만 ``loadThreadMessages`` 로 동기화.
 * @param {{ syncHeader?: boolean; reloadCurrentMessages?: boolean; reason?: string }} [options]
 */
async function refreshThreadListOnly(options = {}) {
  const syncHeader = options.syncHeader !== false;
  const reloadCurrentMessages = Boolean(options.reloadCurrentMessages);
  messagesRtDebug("list refresh start", { reason: options.reason || "" });
  const threads = await fetchThreadsListForMessagesPage();
  const threadsForUi = operatorInboxMode ? threads : dedupeThreadsForMessagesList(threads, selectedThreadId);
  cachedThreadsForUi = threadsForUi;
  renderThreadList(threadsForUi);
  if (syncHeader && selectedThreadId) {
    const threadMeta = findThreadMetaInList(threads);
    if (threadMeta && typeof threadMeta === "object") {
      currentThreadHeaderMeta = /** @type {Record<string, unknown>} */ ({ ...threadMeta });
      selectedThreadRole = normalizeThreadRole(threadMeta);
      syncChatHeader(currentThreadHeaderMeta);
    }
  }
  if (reloadCurrentMessages && selectedThreadId) {
    messagesRtDebug("detail refresh start (fallback poll)", { thread_id: selectedThreadId });
    await loadThreadMessages({
      realtime: true,
      dispatchHeaderOnMarkRead: true,
      silentIfUnchanged: options.reason === "fallback-poll",
      reason: options.reason,
      refreshSource: resolveMessagesRefreshSource({ reason: options.reason }),
    });
    messagesRtDebug("detail refresh done (fallback poll)");
  }
  messagesRtDebug("list refresh done", { reason: options.reason || "" });
}

/**
 * Same-thread ``message.created``: thread list/header sync after bubbles (non-blocking).
 * @param {string} reason
 * @param {string} threadId
 */
function scheduleMessageCreatedListHeaderSync(reason, threadId) {
  void (async () => {
    try {
      messagesRtDebug("list/header sync start (deferred after bubbles)", {
        reason,
        thread_id: threadId,
      });
      await refreshThreadListOnly({ syncHeader: true, reloadCurrentMessages: false, reason });
      if (threadId) {
        window.dispatchEvent(
          new CustomEvent("lhai:messages-changed", {
            detail: { reason, thread_id: threadId },
          }),
        );
      }
      messagesRtDebug("list/header sync done (deferred)", { reason, thread_id: threadId });
    } catch (err) {
      messagesRtDebug("list/header sync failed (bubbles already rendered)", {
        reason,
        thread_id: threadId,
        error: String(err?.message || err),
      });
    }
  })();
}

async function handleMessageCreatedRealtime({ threadId, messageId, sameThread, sel }) {
  /** CHAT / AI / SYSTEM — ``message.created`` 단일 이벤트; 타입별 분기 없음. */
  if (messageId) {
    markMessageCreatedHandlerStarted(messageId);
  }
  /** A: detail fetch + bubble render first; B–D: list/header deferred (void). */
  const runSameThreadDetailFirst = async (reason) => {
    await loadThreadMessages({
      realtime: true,
      dispatchHeaderOnMarkRead: false,
      skipInlineListBadgeSync: true,
      reason,
      refreshSource: "sse",
      traceMessageId: messageId || undefined,
    });
    scheduleMessageCreatedListHeaderSync(reason, sel);
    return threadHasMessageId(messageId);
  };

  if (sameThread) {
    const nBefore = Array.isArray(currentThreadMessages) ? currentThreadMessages.length : 0;
    messagesRtDebug("detail refresh start (same thread, bubbles first)", {
      message_count_before: nBefore,
      refresh_source: "sse",
      message_id: messageId || null,
    });
    let visible = await runSameThreadDetailFirst("message.created");
    const nAfter = Array.isArray(currentThreadMessages) ? currentThreadMessages.length : 0;
    messagesRtDebug("current thread refreshed (bubbles)", {
      reason: "message.created",
      message_count_before: nBefore,
      message_count_after: nAfter,
      message_id_visible: visible,
    });
    if (!messageId || visible) {
      return;
    }
    messagesRtDebug("message.created retry scheduled", {
      message_id: messageId,
      delay_ms: 800,
      attempt: 1,
    });
    console.info("[lhai][messages-realtime] message.created not visible after refresh, scheduling retry", messageId);
    await new Promise((r) => setTimeout(r, 800));
    if (String(selectedThreadId || "").trim() !== sel) {
      messagesRtDebug("message.created retry aborted (thread switched)", { message_id: messageId, attempt: 1 });
      return;
    }
    visible = await runSameThreadDetailFirst("message.created-retry-800");
    messagesRtDebug("message.created retry result", {
      message_id: messageId,
      attempt: 1,
      delay_ms: 800,
      message_id_visible: visible,
    });
    if (!messageId || visible) {
      return;
    }
    messagesRtDebug("message.created retry scheduled", {
      message_id: messageId,
      delay_ms: 2000,
      attempt: 2,
    });
    console.info("[lhai][messages-realtime] message.created not visible after refresh, scheduling retry", messageId);
    await new Promise((r) => setTimeout(r, 2000));
    if (String(selectedThreadId || "").trim() !== sel) {
      messagesRtDebug("message.created retry aborted (thread switched)", { message_id: messageId, attempt: 2 });
      return;
    }
    const visibleFinal = await runSameThreadDetailFirst("message.created-retry-2000");
    messagesRtDebug("message.created retry result", {
      message_id: messageId,
      attempt: 2,
      delay_ms: 2000,
      message_id_visible: visibleFinal,
    });
    return;
  }
  /* 다른 thread: 목록·unread 배지만 갱신. 현재 대화는 유지. messages.html에서는 토스트 없음(app-header 동일 정책). */
  messagesRtDebug("list refresh start (other thread)");
  await refreshThreadListOnly({ syncHeader: true, reloadCurrentMessages: false, reason: "message.created-other" });
  messagesRtDebug("list refresh done");
}

async function handleMessagesRealtimeEvent(detail) {
  const type = String(detail?.type || "").trim();
  const data = detail?.data && typeof detail.data === "object" ? detail.data : {};
  const payload = data.payload && typeof data.payload === "object" ? data.payload : {};
  const threadId = String(data.thread_id || payload.thread_id || "").trim();
  const messageId = String(data.message_id || payload.message_id || "").trim();
  const sel = String(selectedThreadId || "").trim();
  const sameThread = Boolean(threadId && sel && threadId === sel);
  const msgCountBefore = Array.isArray(currentThreadMessages) ? currentThreadMessages.length : 0;
  messagesRtDebug("event received", {
    type,
    thread_id: threadId,
    message_id: messageId,
    selected_thread_id: sel,
    same_thread: sameThread,
    will_refresh_detail: sameThread,
    will_refresh_list_only: Boolean(threadId && !sameThread),
    message_count_before: msgCountBefore,
  });

  if (type === "message.created") {
    const mid = messageId;
    if (mid && !claimMessageCreatedRealtimeEvent(mid)) {
      messagesRtDebug("message.created skipped (duplicate event)", { message_id: mid });
      return;
    }
    let handled = false;
    try {
      await handleMessageCreatedRealtime({ threadId, messageId: mid, sameThread, sel });
      handled = true;
    } finally {
      releaseMessageCreatedRealtimeEvent(mid, handled);
    }
    return;
  }

  if (isBiddingRealtimeSseEvent({ type })) {
    const bidPayload = normalizeBidUpdatedPayload({ type, data });
    if (!isBiddingBidUpdatedPayload(bidPayload)) return;
    const wfId = String(
      bidPayload.workflow_instance_id || bidPayload.service_request_id || "",
    ).trim();
    const evtThreadId = String(bidPayload.thread_id || threadId || "").trim();
    const ourWid = customerBidServiceRequestId();
    const matchThread = sameThread || Boolean(evtThreadId && selectedThreadId && evtThreadId === selectedThreadId);
    const matchWf = Boolean(wfId && ourWid && wfId === ourWid);
    if (matchThread || matchWf) {
      messagesRtDebug("bid.updated — refresh bid banner only (no stream reload)");
      await refreshCustomerBidPanel();
    } else if (
      typeof document !== "undefined" &&
      document.visibilityState === "visible" &&
      bidUpdatedToastAllowed(resolveBiddingEventKind(bidPayload))
    ) {
      const href = buildCustomerBidResultsHref(wfId, evtThreadId);
      const eventKind = resolveBiddingEventKind(bidPayload);
      showBidUpdatedToast({
        title: t("messages.alert.quote_updated", "Quote updated."),
        cta: t("messages.actions.view_quote", "View quote"),
        href,
        threadId: evtThreadId,
        bidRequestId: bidPayload.bid_request_id,
        eventKind,
      });
    }
    window.dispatchEvent(
      new CustomEvent("lhai:customer-bid-updated", {
        detail: { thread_id: evtThreadId, workflow_instance_id: wfId },
      })
    );
    return;
  }

  if (type === "unread.changed" || type === "thread.updated") {
    messagesRtDebug("list refresh start", { type });
    await refreshThreadListOnly({ syncHeader: true, reloadCurrentMessages: false, reason: type });
    messagesRtDebug("list refresh done", { type });
  }
}

function wireMessagesPageRealtime() {
  mountRealtimeDiagnosticBadge(getRealtimeStatus());
  ensureChatScrollRealtimeUxWired();
  if (messagesRealtimeUnsub) {
    try {
      messagesRealtimeUnsub();
    } catch {
      /* ignore */
    }
    messagesRealtimeUnsub = null;
  }
  messagesRealtimeUnsub = subscribeRealtimeEvents(handleMessagesRealtimeEvent);
  if (!messagesRealtimeStatusBound) {
    messagesRealtimeStatusBound = true;
    window.addEventListener("lhai:realtime-status", onMessagesRealtimeStatus);
  }
  ensureMessagesPageVisibilityBinding();
  onMessagesRealtimeStatus({ detail: getRealtimeStatus() });
}

function updateMessagesPageSubtitle() {
  const subtitle = document.querySelector(".lhai-subtitle");
  if (!subtitle) return;
  subtitle.textContent = operatorInboxMode
    ? t(
        "messages.page.subtitle.operator",
        "Customer-center (ADMIN) and service (SERVICE) threads are shown separately by customer. Check thread type and handler mode in the list, then select one."
      )
    : partnerInboxMode
      ? t("messages.page.subtitle.partner", "Review assigned customer service threads and chat with customers.")
      : t(
          "messages.page.subtitle.customer",
          "Customer center (global) and service conversations are separated. In service threads you can see contract context and handler mode (AI, operations, or system)."
        );
}

function readMessagesDetailPreserveState() {
  const scroll = document.querySelector("#messageChatScroll");
  const input = document.querySelector("#messageChatInput");
  const workflow = document.querySelector("#messageWorkflowSummary");
  return {
    intakeDiagHtml: document.querySelector("#lhaiIntakeDispatchDiagBody")?.innerHTML ?? null,
    biddingDbgHtml: document.querySelector("#lhaiBiddingNotifyDebugBody")?.innerHTML ?? null,
    workflowHtml: workflow?.innerHTML ?? null,
    workflowHidden: workflow?.hidden ?? true,
    scrollTop: scroll instanceof HTMLElement ? scroll.scrollTop : 0,
    inputValue: input instanceof HTMLTextAreaElement ? input.value : "",
  };
}

/** @param {ReturnType<typeof readMessagesDetailPreserveState>} preserve */
function restoreMessagesDetailPreserveState(preserve) {
  if (!preserve) return;
  const intakeBody = document.querySelector("#lhaiIntakeDispatchDiagBody");
  if (intakeBody && preserve.intakeDiagHtml != null) intakeBody.innerHTML = preserve.intakeDiagHtml;
  const biddingBody = document.querySelector("#lhaiBiddingNotifyDebugBody");
  if (biddingBody && preserve.biddingDbgHtml != null) biddingBody.innerHTML = preserve.biddingDbgHtml;
  const workflow = document.querySelector("#messageWorkflowSummary");
  if (workflow && preserve.workflowHtml != null) {
    workflow.innerHTML = preserve.workflowHtml;
    workflow.hidden = preserve.workflowHidden;
  }
  const input = document.querySelector("#messageChatInput");
  if (input instanceof HTMLTextAreaElement) {
    input.value = preserve.inputValue;
  }
  const scroll = document.querySelector("#messageChatScroll");
  if (scroll instanceof HTMLElement) scroll.scrollTop = preserve.scrollTop;
}

function refreshMessagesPageStaticI18n() {
  if (messagesLanguageRefetchInFlight) return;
  applyI18nToDom(document);
  updateMessagesPageSubtitle();

  if (cachedThreadsForUi.length) {
    renderThreadList(cachedThreadsForUi);
  }

  if (!selectedThreadId) {
    renderMessageDetailShell(null);
    return;
  }

  const preserve = readMessagesDetailPreserveState();
  renderMessageDetailShell(currentThreadHeaderMeta);
  if (preserve) restoreMessagesDetailPreserveState(preserve);
  renderChatBubbles({ scrollIfNearBottom: false });
  repaintCustomerBidPanelFromSnapshot();
  syncCustomerComposerBidGate();
}

async function refreshMessagesPageOnLanguageChanged() {
  if (messagesLanguageRefetchInFlight) return;
  messagesLanguageRefetchInFlight = true;
  try {
    applyI18nToDom(document);
    updateMessagesPageSubtitle();

    const preserve = readMessagesDetailPreserveState();

    let threads = [];
    try {
      threads = await fetchThreadsListForMessagesPage();
      const threadsForUi = operatorInboxMode ? threads : dedupeThreadsForMessagesList(threads, selectedThreadId);
      cachedThreadsForUi = threadsForUi;
      renderThreadList(threadsForUi);
      if (selectedThreadId) {
        const threadMeta = findThreadMetaInList(threads);
        if (threadMeta && typeof threadMeta === "object") {
          currentThreadHeaderMeta = /** @type {Record<string, unknown>} */ ({ ...threadMeta });
          selectedThreadRole = normalizeThreadRole(threadMeta);
        }
      }
    } catch (err) {
      if (cachedThreadsForUi.length) {
        renderThreadList(cachedThreadsForUi);
      }
      console.warn("[lhai][messages] thread list language refetch failed", err);
    }

    if (!selectedThreadId) {
      renderMessageDetailShell(null);
      return;
    }

    renderMessageDetailShell(currentThreadHeaderMeta);
    syncChatHeader(currentThreadHeaderMeta);

    try {
      // Refetch so backend returns display_* / display_ui_payload for the new viewer locale.
      // Do not translate ui_payload on the client.
      await loadThreadMessages({
        reason: "language-changed",
        skipInlineListBadgeSync: true,
        savedComposer: preserve?.inputValue ?? "",
      });
    } catch (err) {
      console.warn("[lhai][messages] thread messages language refetch failed", err);
      renderChatBubbles({ scrollIfNearBottom: false });
    }

    if (preserve) {
      restoreMessagesDetailPreserveState(preserve);
    }
    repaintCustomerBidPanelFromSnapshot();
    syncCustomerComposerBidGate();
  } finally {
    messagesLanguageRefetchInFlight = false;
  }
}

wireDynamicPageI18nRefresh(() => {
  void refreshMessagesPageOnLanguageChanged();
});

wireDynamicPageI18nRefresh(refreshMessagesPageStaticI18n, {
  runtimeResolvedOnly: true,
  keyPrefixes: ["messages.", "common."],
});

async function refresh() {
  const threads = await fetchThreadsListForMessagesPage();
  reconcileMessagesPageSelectionAfterListFetch(threads);
  const threadMeta = findThreadMetaInList(threads);
  currentThreadHeaderMeta =
    threadMeta && typeof threadMeta === "object"
      ? /** @type {Record<string, unknown>} */ ({ ...threadMeta })
      : null;
  selectedThreadRole = threadMeta ? normalizeThreadRole(threadMeta) : "";
  const threadsForUi = operatorInboxMode ? threads : dedupeThreadsForMessagesList(threads, selectedThreadId);
  cachedThreadsForUi = threadsForUi;
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
    window.alert(t("messages.alert.request_submitted", "Your request was posted in this conversation. The operations team will reply in the same thread."));
    await refresh();
  } catch (err) {
    const msg = err && typeof err.message === "string" ? err.message : t("messages.alert.send_failed", "Send failed.");
    window.alert(msg);
  }
}

/** SERVICE 스레드에서 고객센터(ADMIN)로 연결만 기록 — 스레드는 합치지 않음. */
async function escalateServiceThreadToAdminChannel() {
  if (operatorInboxMode || !customerProfileId || !selectedThreadId) return;
  if (String(selectedThreadRole || "").toUpperCase() !== "SERVICE") return;
  const memo = window.prompt(
    t(
      "messages.alert.admin_link_prompt",
      "Optional note to add on the customer-center thread. Leave blank to record the link request only."
    ),
    "",
  );
  if (memo === null) return;
  try {
    await messagesApi.escalateServiceThreadToAdmin(String(selectedThreadId), {
      customerProfileId,
      note: String(memo).trim(),
    });
    window.alert(
      t(
        "messages.alert.admin_link_submitted",
        "Your link request was posted on the customer-center thread. Open the Customer center conversation in the list on the left."
      )
    );
    await refresh();
  } catch (err) {
    const msg = err && typeof err.message === "string" ? err.message : t("messages.alert.request_failed", "Request failed.");
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
    const msg = err && typeof err.message === "string" ? err.message : t("messages.alert.send_failed", "Send failed.");
    window.alert(msg);
  } finally {
    chatSendLocked = false;
    const next = document.querySelector("#messageChatInput");
    if (next instanceof HTMLTextAreaElement) next.focus();
  }
}

async function mountMessagesPageShell() {
  const app = document.getElementById("app");
  if (!(app instanceof HTMLElement)) {
    await mountMessagesSidebar();
    return;
  }
  if (partnerInboxMode) {
    document.body.classList.add("lhai-partner-shell-pending");
    await mountPartnerShell(app, {
      pageKey: "messages",
      documentTitle: t("messages.page.document_title", "Messages - Landing Help AI"),
      contentHtml: renderPartnerMessagesContentHtml({ partner: true }),
      mainExtraClass: "lhai-partner-messages",
    });
    return;
  }
  const contentHtml = renderCustomerMessagesContentHtml();
  if (operatorInboxMode) {
    await mountCustomerInboxShell(app, contentHtml, { variant: "admin" });
  } else {
    await mountCustomerInboxShell(app, contentHtml);
  }
}

async function initMessagesPage() {
  if (!protectCurrentPage()) return;
  if (!ensureCustomerAccess()) return;

  operatorInboxMode = canAccessAdminShell();
  partnerInboxMode = !operatorInboxMode && getCurrentRole() === ROLES.PARTNER;

  await bootAppPageContent(["common", "nav", "messages"], async () => {
    syncHeaderRoleBadge();
    try {
      await mountMessagesPageShell();
    } catch {
      try {
        await mountMessagesSidebar();
      } catch {
        /* ignore */
      }
    }
  });

  if (partnerInboxMode) {
    await refreshPartnerModeSession(partnerThreadsApi);
  }

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
    updateMessagesPageSubtitle();
  }

  const initialThreadId = applyMessagesPageQuery();
  messagesUrlRequestedThreadId = String(initialThreadId || "").trim();
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

  detail?.addEventListener("change", (event) => {
    const t = event.target;
    if (t instanceof HTMLSelectElement && t.classList.contains("lhai-chat-form-prompt__prefill-select")) {
      const root = t.closest("[data-lhai-prefill-dropdown]");
      if (root instanceof HTMLElement) togglePrefillManualInput(root);
      return;
    }
    if (t instanceof HTMLInputElement && t.classList.contains("lhai-chat-form-prompt__prefill-confirm-radio")) {
      const root = t.closest("[data-lhai-prefill-confirm]");
      if (root instanceof HTMLElement) togglePrefillConfirmAlt(root);
    }
  });

  detail?.addEventListener("click", (event) => {
    const t = event.target;
    const viewOriginalBtn = t instanceof Element ? t.closest(".lhai-chat-bubble__view-original") : null;
    if (viewOriginalBtn instanceof HTMLButtonElement) {
      event.preventDefault();
      const mid = String(viewOriginalBtn.getAttribute("data-message-id") || "").trim();
      if (mid) {
        if (showOriginalMessageIds.has(mid)) showOriginalMessageIds.delete(mid);
        else showOriginalMessageIds.add(mid);
        renderChatBubbles({ scrollIfNearBottom: false });
      }
      return;
    }
    const focusComposer = t instanceof Element ? t.closest("[data-lhai-focus-composer]") : null;
    if (focusComposer instanceof HTMLButtonElement) {
      event.preventDefault();
      const input = document.querySelector("#messageChatInput");
      if (input instanceof HTMLTextAreaElement) {
        input.focus();
        input.scrollIntoView({ block: "nearest", behavior: "smooth" });
      }
      return;
    }
    const bidSel = t instanceof Element ? t.closest("[data-lhai-select-bid]") : null;
    if (bidSel instanceof HTMLButtonElement) {
      event.preventDefault();
      void handleCustomerSelectBidClick(bidSel);
      return;
    }
    if (t instanceof Element && t.closest("[data-lhai-intake-submit]")) {
      const root = t.closest("[data-lhai-intake-form]");
      if (root instanceof HTMLElement) {
        if (root.hasAttribute("data-lhai-intake-submitted")) return;
        void runIntakePromptSubmit(root, false);
      }
      return;
    }
    if (t instanceof Element && t.closest("[data-lhai-intake-skip]")) {
      const root = t.closest("[data-lhai-intake-form]");
      if (root instanceof HTMLElement) {
        if (root.hasAttribute("data-lhai-intake-submitted")) return;
        void runIntakePromptSubmit(root, true);
      }
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
    const intakeDiagBtn =
      t instanceof Element ? t.closest("[data-lhai-action='load-intake-dispatch-diag']") : null;
    if (intakeDiagBtn instanceof HTMLButtonElement) {
      event.preventDefault();
      void runIntakeDispatchDiagnosticsLoad();
      return;
    }
    const bidEmailDiagBtn =
      t instanceof Element ? t.closest("[data-lhai-action='load-bidding-email-diag']") : null;
    if (bidEmailDiagBtn instanceof HTMLButtonElement) {
      event.preventDefault();
      void refreshBiddingNotificationDebugPanel(selectedThreadId, { fromUser: true });
      return;
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

  wireMessagesPageRealtime();

  bindMessageAiFeedback({
    getContext: () => ({
      operatorInboxMode,
      customerProfileId: operatorInboxMode ? threadOwnerProfileId : customerProfileId,
    }),
  });

  bindMessageTranslationReport({
    getContext: () => ({ operatorInboxMode }),
  });
}

export { initMessagesPage };

initMessagesPage();
