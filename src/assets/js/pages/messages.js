import { mountMessagesSidebar } from "../components/sidebar.js";
import { messagesApi } from "../core/api.js";
import { getCustomerMessagingProfileId } from "../core/auth.js";
import { ensureCustomerAccess, protectCurrentPage } from "../core/guards.js";
import { canAccessAdminShell } from "../core/role-tiers.js";
import { syncHeaderRoleBadge } from "../core/role-header-badge.js";
import { formatMessageTimestamp, resolveBackendMediaUrl, safeText } from "../core/utils.js";
import { bindMessageAiFeedback, buildAiFeedbackHtml } from "./message-ai-feedback.js";

/** @param {unknown} s */
function escapeHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
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

/** 결제 완료 안내 — 관련 청구서 버튼만 제공 (문서 센터 버튼 제거). */
function renderPaymentCompletedLinksHtml(message) {
  if (!message || typeof message !== "object") return "";
  if (String(message.event_code || "") !== "payment.completed") return "";

  const invoiceId =
    String(message.linked_invoice_id || "").trim() || extractInvoiceIdFromText(message.body);
  if (!invoiceId) return "";
  const href = `invoice-detail.html?invoice_id=${encodeURIComponent(invoiceId)}`;
  return `<div class="lhai-quote-proposed-links"><a class="lhai-button lhai-button--secondary lhai-quote-proposed-link" href="${href}">관련 청구서 (Invoice)</a></div>`;
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
/** @param {Record<string, unknown>} row */
function normalizeThreadRole(row) {
  const r = String(row?.thread_role || "").toUpperCase();
  if (r === "ADMIN" || r === "CUSTOMER_CENTER") return "ADMIN";
  return "SERVICE";
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

/** 배지/부제용: 백엔드 헤더 또는 enum → 사용자 친화 라벨. */
function deliveryModeBadgeLabel(row) {
  const api = String(row?.header_badge || row?.selected_delivery_mode_label || "").trim();
  if (api) return api;
  const m = String(row?.selected_delivery_mode || "").toUpperCase();
  if (m === "AI_AGENT") return "AI Agent";
  if (m === "IN_PERSON") return "In-Person";
  return "";
}

function isInPersonServiceThread(row) {
  return String(row?.selected_delivery_mode || "").toUpperCase() === "IN_PERSON";
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
 * @param {{ forDetailHeader?: boolean }} [options]
 */
function threadListBadgesHtml(row, options = {}) {
  const forDetailHeader = Boolean(options.forDetailHeader);
  const role = normalizeThreadRole(row);
  const parts = [];
  if (role === "ADMIN") {
    parts.push(`<span class="lhai-thread-badge lhai-thread-badge--admin">고객센터</span>`);
    const h = handlerBadgeLabel(row.handler_type);
    if (h) parts.push(`<span class="lhai-thread-badge lhai-thread-badge--muted">${safeText(h)}</span>`);
  } else {
    const dm = deliveryModeBadgeLabel(row);
    if (forDetailHeader && dm === "AI Agent") {
      parts.push(`<span class="lhai-thread-badge lhai-thread-badge--ai">${safeText(dm)}</span>`);
    } else if (forDetailHeader && dm === "In-Person") {
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
  const itemCls = [
    "lhai-message-item",
    isAdmin ? "lhai-message-item--admin" : "lhai-message-item--service",
    row.unread ? "is-unread" : "",
    selectedThreadId === row.thread_id ? "is-active" : "",
  ]
    .filter(Boolean)
    .join(" ");
  const headline = isAdmin ? safeText(row.title) : safeText(serviceThreadListHeadline(row));
  const lastType = String(row.message_type || "").trim();
  return `
      <article class="${itemCls}" data-thread-id="${safeText(row.thread_id)}" data-thread-role="${safeText(role)}" data-customer-profile-id="${safeText(row.customer_profile_id || "")}">
        <div class="lhai-message-item__meta">
          ${threadListBadgesHtml(row)}
          <span class="u-text-muted">${formatMessageTimestamp(row.last_message_at)}</span>
        </div>
        <div class="lhai-message-item__title-row">
          <h3 class="lhai-message-item__title">${headline}</h3>
        </div>
        ${lastType ? `<div class="u-text-muted lhai-message-item__last-type">최근 유형 · ${safeText(lastType)}</div>` : ""}
        <p class="u-text-muted lhai-message-item__preview">${safeText(row.preview)}</p>
      </article>
    `;
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
  return t;
}

/**
 * @param {Record<string, unknown>} up
 * @param {string} messageId
 */
function renderFormPromptControlsHtml(up, messageId) {
  const mid = String(messageId || "msg").replace(/[^a-zA-Z0-9_-]/g, "_");
  const it = normalizeIntakeInputType(up.input_type);
  const options = Array.isArray(up.options) ? /** @type {Array<Record<string, unknown>>} */ (up.options) : [];
  const def = up.default_value != null && up.default_value !== undefined ? String(up.default_value) : "";

  if (it === "textarea") {
    const v = escapeHtml(def);
    return `<textarea class="lhai-chat-form-prompt__input lhai-chat-form-prompt__textarea" rows="3" maxlength="8000" aria-label="${escapeHtml(String(up.label || ""))}">${v}</textarea>`;
  }
  if (it === "select") {
    const opts = [...options].sort((a, b) => Number(a.sort_order || 0) - Number(b.sort_order || 0));
    const optHtml = opts
      .map((o) => {
        const val = String(o.value ?? "");
        const lab = String(o.label ?? val);
        return `<option value="${escapeHtml(val)}">${escapeHtml(lab)}</option>`;
      })
      .join("");
    return `<select class="lhai-chat-form-prompt__input lhai-chat-form-prompt__select" aria-label="${escapeHtml(String(up.label || ""))}">
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
          return `<label class="lhai-chat-form-prompt__radio-label" for="${escapeHtml(id)}">
            <input type="radio" name="${escapeHtml(name)}" id="${escapeHtml(id)}" value="${escapeHtml(val)}" class="lhai-chat-form-prompt__radio" />
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
    const v = escapeHtml(def);
    return `<input type="date" class="lhai-chat-form-prompt__input lhai-chat-form-prompt__date" value="${v}" aria-label="${escapeHtml(String(up.label || ""))}" />`;
  }
  const v = escapeHtml(def);
  return `<input type="text" class="lhai-chat-form-prompt__input lhai-chat-form-prompt__text" value="${v}" maxlength="4000" aria-label="${escapeHtml(String(up.label || ""))}" />`;
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
  const reqHtml = required
    ? ` <abbr class="lhai-chat-form-prompt__req" title="필수">*</abbr>`
    : "";

  return `<div class="lhai-chat-form-prompt" data-lhai-intake-form data-message-id="${escapeHtml(mid)}" data-session-id="${escapeHtml(sessionId)}" data-thread-id="${escapeHtml(threadId)}" data-field-id="${escapeHtml(fieldId)}" data-input-type="${escapeHtml(it)}">
    <div class="lhai-chat-form-prompt__label">${escapeHtml(label)}${reqHtml}</div>
    ${helpText ? `<div class="lhai-chat-form-prompt__help">${escapeHtml(helpText)}</div>` : ""}
    <div class="lhai-chat-form-prompt__controls">${renderFormPromptControlsHtml(up, mid)}</div>
    <div class="lhai-chat-form-prompt__error" role="alert" hidden></div>
    <div class="lhai-chat-form-prompt__actions">
      <button type="button" class="lhai-button lhai-button--primary lhai-chat-form-prompt__submit" data-lhai-intake-submit>${escapeHtml("제출")}</button>
      ${!required ? `<button type="button" class="lhai-button lhai-button--secondary lhai-chat-form-prompt__skip" data-lhai-intake-skip>${escapeHtml("건너뛰기")}</button>` : ""}
    </div>
  </div>`;
}

/** @param {Record<string, unknown>} up */
function renderFormPromptOperatorReadonly(up) {
  const label = String(up.label || "");
  const helpText = String(up.help_text || "").trim();
  const it = normalizeIntakeInputType(up.input_type);
  return `<div class="lhai-chat-form-prompt lhai-chat-form-prompt--readonly">
    <div class="lhai-chat-form-prompt__label">${escapeHtml(label)}</div>
    ${helpText ? `<div class="lhai-chat-form-prompt__help">${escapeHtml(helpText)}</div>` : ""}
    <p class="lhai-chat-form-prompt__readonly-note u-text-muted">${escapeHtml("운영 보기에서는 인테이크 응답을 제출할 수 없습니다.")}</p>
    <p class="u-text-muted lhai-chat-form-prompt__meta">${escapeHtml(`입력 유형: ${it}`)}</p>
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
    if (itSkip === "multi_select") {
      return { ok: true, valueJson: { values: ["__skipped__"] } };
    }
    return { ok: true, valueJson: { value: "__skipped__" } };
  }
  const it = normalizeIntakeInputType(inputType);
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
  const { valueJson } = collected;
  if (requiredAttr && !skip) {
    const it = normalizeIntakeInputType(inputType);
    if (it === "multi_select") {
      const vals = /** @type {{ values?: unknown[] }} */ (valueJson).values;
      if (!Array.isArray(vals) || vals.length === 0) {
        setIntakeFormError(formRoot, "하나 이상 선택해 주세요.");
        return;
      }
    } else if (it !== "radio" && it !== "yes_no" && it !== "select" && it !== "date") {
      const v = /** @type {{ value?: unknown }} */ (valueJson).value;
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
    await messagesApi.submitIntakeThreadPromptAnswer(threadId, sessionId, {
      customerProfileId: cp,
      fieldId,
      valueJson: /** @type {Record<string, unknown>} */ (valueJson),
    });
    await loadThreadMessages();
  } catch (err) {
    const msg = err && typeof err.message === "string" ? err.message : "제출에 실패했습니다.";
    setIntakeFormError(formRoot, msg);
  } finally {
    intakePromptSubmitting.delete(mid);
    setIntakeFormLoading(formRoot, false);
  }
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
      const isForm = Boolean(up && String(up.widget_type || "").trim() === "form_prompt");
      const bubbleClass = [
        mine ? "lhai-chat-bubble--me" : "lhai-chat-bubble--them",
        isForm ? "lhai-chat-bubble--form-prompt" : "",
      ]
        .filter(Boolean)
        .join(" ");
      const showTitle = !mine && Boolean(m.title) && !isForm;
      const titleLine = showTitle ? `<div class="lhai-chat-bubble__title">${escapeHtml(String(m.title))}</div>` : "";

      let formBlock = "";
      if (isForm && up) {
        formBlock =
          operatorInboxMode ? renderFormPromptOperatorReadonly(up) : renderFormPromptInteractive(m, up);
      }

      const bodyBlock =
        isForm && up
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
  const placeholder = "메시지를 입력하세요";
  const sendLabel = "보내기";

  container.className = "lhai-message-detail lhai-message-detail--chat";
  container.innerHTML = `
    <div class="lhai-chat-header">
      <p id="messageChatEyebrow" class="lhai-chat-header__eyebrow" aria-hidden="true"></p>
      <div id="messageChatHeaderBadges" class="lhai-chat-header__badge-row" aria-label="스레드 유형"></div>
      <h3 id="messageChatTitle" class="lhai-chat-header__title"></h3>
      <p id="messageChatServiceType" class="lhai-chat-header__service-type u-text-muted" hidden></p>
      <p id="messageChatSubtitle" class="lhai-chat-header__subtitle u-text-muted"></p>
    </div>
    ${operatorContextBanner}
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
  syncChatHeader(threadMeta);
}

/** @param {Record<string, unknown> | null | undefined} threadMeta */
function syncChatHeader(threadMeta) {
  const eyebrow = document.querySelector("#messageChatEyebrow");
  const badges = document.querySelector("#messageChatHeaderBadges");
  const subtitle = document.querySelector("#messageChatSubtitle");
  const titleEl = document.querySelector("#messageChatTitle");
  const serviceTypeEl = document.querySelector("#messageChatServiceType");
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
    if (serviceTypeEl instanceof HTMLElement) {
      serviceTypeEl.textContent = "";
      serviceTypeEl.hidden = true;
    }
    return;
  }
  const role = normalizeThreadRole(threadMeta);
  badges.innerHTML = threadListBadgesHtml(threadMeta, { forDetailHeader: true });

  if (operatorInboxMode) {
    eyebrow.textContent = role === "ADMIN" ? "고객센터 (운영 보기)" : "서비스 (운영 보기)";
    eyebrow.hidden = false;
    titleEl.textContent =
      role === "ADMIN" ? String(threadMeta.title || "고객센터") : serviceThreadDisplayName(threadMeta);
    if (serviceTypeEl instanceof HTMLElement) {
      if (role === "ADMIN") {
        serviceTypeEl.hidden = true;
        serviceTypeEl.textContent = "";
      } else {
        const dm = deliveryModeBadgeLabel(threadMeta);
        serviceTypeEl.textContent = dm ? `유형 · ${dm}` : "";
        serviceTypeEl.hidden = !dm;
      }
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

  if (role === "ADMIN") {
    eyebrow.textContent = "고객센터";
    eyebrow.hidden = false;
    titleEl.textContent = String(threadMeta.title || "고객센터");
    if (serviceTypeEl instanceof HTMLElement) {
      serviceTypeEl.hidden = true;
      serviceTypeEl.textContent = "";
    }
    subtitle.textContent = "운영·견적·청구·결제·일반 문의를 위한 채널입니다.";
    return;
  }

  const dm = deliveryModeBadgeLabel(threadMeta);
  eyebrow.textContent = dm ? "" : "서비스";
  eyebrow.hidden = !String(eyebrow.textContent || "").trim();
  titleEl.textContent = serviceThreadDisplayName(threadMeta);
  if (serviceTypeEl instanceof HTMLElement) {
    serviceTypeEl.textContent = dm ? `서비스 유형 · ${dm}` : "";
    serviceTypeEl.hidden = !dm;
  }

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
  selectedThreadRole = threadMeta ? normalizeThreadRole(threadMeta) : "";
  renderThreadList(threads);
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
  const listHint = document.querySelector(".lhai-thread-list-hint");
  if (listHint instanceof HTMLElement) {
    listHint.style.display = operatorInboxMode ? "none" : "";
  }
  const subtitle = document.querySelector(".lhai-subtitle");
  if (subtitle) {
    subtitle.textContent = operatorInboxMode
      ? "고객별 고객센터(ADMIN)와 서비스별(SERVICE) 스레드가 구분되어 표시됩니다. 목록에서 스레드 유형·담당 방식을 확인한 뒤 선택하세요."
      : "고객센터(전역)와 서비스별 대화가 구분되어 있습니다. 서비스 스레드에서는 해당 계약/서비스 맥락의 메시지와 담당 방식(AI·운영·시스템)을 확인할 수 있습니다.";
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
