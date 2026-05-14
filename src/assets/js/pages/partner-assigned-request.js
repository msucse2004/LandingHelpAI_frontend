import { applyPartnerBiddingSidebarMessagingHide, loadSidebar } from "../components/sidebar.js";
import { partnerThreadsApi } from "../core/api.js";
import { refreshPartnerModeSession } from "../core/partner-mode-session.js";
import { getCurrentRole } from "../core/auth.js";
import { ROLES } from "../core/config.js";
import { ensureCustomerAccess, protectCurrentPage } from "../core/guards.js";
import { syncHeaderRoleBadge } from "../core/role-header-badge.js";
import { clearShellTopLayerBlockers } from "../core/ui-blockers.js";
import { formatMessageTimestamp } from "../core/utils.js";

const ERR_GENERIC = "정보를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.";
const ERR_403 = "이 신청에 접근할 권한이 없습니다.";
const ERR_404 = "신청 정보를 찾을 수 없습니다.";

/** @param {string} code */
function statusLabelKo(code) {
  const c = String(code || "").trim().toUpperCase();
  const map = {
    NEW_REQUEST: "새 신청",
    IN_PROGRESS: "진행 중",
    WAITING_CUSTOMER: "고객 응답 대기",
    COMPLETED: "완료",
  };
  return map[c] || c || "—";
}

function escHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** @param {unknown} raw */
function genderLabelKo(raw) {
  const g = String(raw ?? "")
    .trim()
    .toLowerCase();
  if (g === "male" || g === "m" || g === "남") return "남성";
  if (g === "female" || g === "f" || g === "여") return "여성";
  if (g === "other" || g === "o" || g === "기타") return "기타";
  if (!g) return "—";
  return String(raw ?? "").trim();
}

/** @param {unknown} raw ISO date (YYYY-MM-DD) */
function dobDisplay(raw) {
  const s = String(raw ?? "").trim();
  return s || "—";
}

/** @param {unknown} err */
function httpStatusFromError(err) {
  if (err != null && typeof err === "object" && "status" in err) {
    const n = Number(/** @type {{ status?: unknown }} */ (err).status);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

/** @param {unknown} err */
function errorMessageForDetail(err) {
  const st = httpStatusFromError(err);
  if (st === 403) return ERR_403;
  if (st === 404) return ERR_404;
  return ERR_GENERIC;
}

function getThreadIdFromLocation() {
  const q = new URLSearchParams(window.location.search || "");
  const fromQuery = String(q.get("thread_id") || "").trim();
  if (fromQuery) return fromQuery;
  const hash = (window.location.hash || "").replace(/^#/, "");
  if (hash.startsWith("thread_id=")) {
    return decodeURIComponent(hash.slice("thread_id=".length).split("&")[0] || "").trim();
  }
  return "";
}

/**
 * 고객 인테이크 UI/카드는 이 화면에서 렌더하지 않음 (백엔드 필터 + 방어적 스킵).
 * @param {Record<string, unknown>} m
 */
function shouldSkipMessageRow(m) {
  const up = m.ui_payload;
  if (up && typeof up === "object") {
    const wt = String(/** @type {Record<string, unknown>} */ (up).widget_type || "").toLowerCase();
    if (wt === "form_prompt") return true;
    if (wt === "customer_intake_form_card") return true;
    if (wt === "customer_intake_prompt") return true;
  }
  const cj = m.card_json;
  if (cj && typeof cj === "object") {
    const t = String(/** @type {Record<string, unknown>} */ (cj).card_type || "").toLowerCase();
    if (t.includes("intake") && t.includes("customer")) return true;
  }
  return false;
}

/** @param {Record<string, unknown>} m */
function messageRoleLabel(m) {
  const dir = String(m.direction || "").toUpperCase();
  const mt = String(m.message_type || "").toUpperCase();
  if (mt && mt !== "CHAT") return mt;
  if (dir === "INBOUND") return "고객";
  if (dir === "OUTBOUND") return "파트너·시스템";
  return "메시지";
}

/** @param {Record<string, unknown>} m */
function messageBodyText(m) {
  const title = String(m.title || "").trim();
  const body = String(m.body || "").trim();
  if (title && body && title !== body) return `${title}\n\n${body}`;
  return body || title || "—";
}

/**
 * @param {HTMLElement} scrollEl
 * @param {Array<Record<string, unknown>>} messages
 */
function renderMessages(scrollEl, messages) {
  const rows = messages.filter((m) => m && typeof m === "object" && !shouldSkipMessageRow(/** @type {Record<string, unknown>} */ (m)));
  if (!rows.length) {
    scrollEl.innerHTML = `<div class="u-text-muted">아직 표시할 메시지가 없습니다.</div>`;
    return;
  }
  scrollEl.innerHTML = rows
    .map((raw) => {
      const m = /** @type {Record<string, unknown>} */ (raw);
      const meta = `${messageRoleLabel(m)} · ${formatMessageTimestamp(m.created_at)}`;
      const text = escHtml(messageBodyText(m));
      return `<article class="lhai-par-detail__msg"><div class="lhai-par-detail__msg-meta">${escHtml(meta)}</div><p class="lhai-par-detail__msg-body">${text}</p></article>`;
    })
    .join("");
  scrollEl.scrollTop = scrollEl.scrollHeight;
}

/**
 * @param {unknown} detail
 * @param {string} threadId
 */
function applyDetailToDom(detail, threadId) {
  const root = document.querySelector("#partnerAssignedContent");
  const sub = document.querySelector("#partnerAssignedSubtitle");
  if (root instanceof HTMLElement) root.hidden = false;
  if (sub instanceof HTMLElement) {
    sub.hidden = false;
    sub.textContent = `스레드 · ${threadId}`;
  }

  const d = detail && typeof detail === "object" ? /** @type {Record<string, unknown>} */ (detail) : {};
  const thread = d.thread && typeof d.thread === "object" ? /** @type {Record<string, unknown>} */ (d.thread) : {};
  const customer = d.customer && typeof d.customer === "object" ? /** @type {Record<string, unknown>} */ (d.customer) : {};
  const service = d.service && typeof d.service === "object" ? /** @type {Record<string, unknown>} */ (d.service) : {};
  const intake = d.intake && typeof d.intake === "object" ? /** @type {Record<string, unknown>} */ (d.intake) : {};

  const svcName = String(service.name || "—");
  const threadSt = statusLabelKo(/** @type {string} */ (thread.status));
  const submittedAt = formatMessageTimestamp(/** @type {string | undefined} */ (intake.submitted_at));

  const setText = (id, text) => {
    const el = document.querySelector(id);
    if (el) el.textContent = text;
  };

  setText("#partnerAssignedServiceName", svcName);
  setText("#partnerAssignedStatus", threadSt);
  setText("#partnerAssignedSubmittedAt", submittedAt);

  setText("#partnerAssignedCustName", String(customer.name || "—"));
  setText("#partnerAssignedCustEmail", String(customer.email || "—"));
  setText("#partnerAssignedCustDob", dobDisplay(customer.date_of_birth));
  setText("#partnerAssignedCustGender", genderLabelKo(customer.gender));

  setText("#partnerAssignedSvcName", svcName);
  const paid = Boolean(service.paid);
  setText("#partnerAssignedSvcPaid", paid ? "결제 완료" : "미결제");
  setText("#partnerAssignedSvcStatus", statusLabelKo(/** @type {string} */ (service.status)));

  const intakeBody = document.querySelector("#partnerAssignedIntakeBody");
  if (intakeBody) {
    const answers = Array.isArray(intake.answers) ? intake.answers : [];
    if (!answers.length) {
      intakeBody.innerHTML = `<p class="u-text-muted">제출된 인테이크 답변이 없습니다.</p>`;
    } else {
      intakeBody.innerHTML = answers
        .map((row) => {
          const r = row && typeof row === "object" ? /** @type {Record<string, unknown>} */ (row) : {};
          const label = escHtml(String(r.label ?? "—"));
          const value = escHtml(String(r.value ?? "—"));
          return `<div class="lhai-par-detail__intake-item"><p class="lhai-par-detail__intake-q">${label}</p><p class="lhai-par-detail__intake-a">${value}</p></div>`;
        })
        .join("");
    }
  }

  const scrollEl = document.querySelector("#partnerAssignedChatScroll");
  const msgs = Array.isArray(d.messages) ? d.messages : [];
  if (scrollEl instanceof HTMLElement) renderMessages(scrollEl, /** @type {Array<Record<string, unknown>>} */ (msgs));
}

async function initPartnerAssignedRequest() {
  clearShellTopLayerBlockers();
  syncHeaderRoleBadge();
  if (getCurrentRole() !== ROLES.PARTNER) {
    window.location.replace("dashboard.html");
    return;
  }
  if (!protectCurrentPage()) return;
  if (!ensureCustomerAccess()) return;

  await refreshPartnerModeSession(partnerThreadsApi);
  await loadSidebar("#sidebar", "customer");
  applyPartnerBiddingSidebarMessagingHide();

  const threadId = getThreadIdFromLocation();
  const errEl = document.querySelector("#partnerAssignedError");
  const contentEl = document.querySelector("#partnerAssignedContent");

  const showError = (msg) => {
    if (errEl instanceof HTMLElement) {
      errEl.hidden = false;
      errEl.textContent = msg;
    }
    if (contentEl instanceof HTMLElement) contentEl.hidden = true;
  };

  if (!threadId) {
    showError(ERR_404);
    return;
  }

  let detail;
  try {
    detail = await partnerThreadsApi.threadDetail(threadId);
  } catch (e) {
    showError(errorMessageForDetail(e));
    return;
  }

  if (errEl instanceof HTMLElement) {
    errEl.hidden = true;
    errEl.textContent = "";
  }

  applyDetailToDom(detail, threadId);

  const form = document.querySelector("#partnerAssignedChatForm");
  const input = document.querySelector("#partnerAssignedChatInput");
  const sendBtn = document.querySelector("#partnerAssignedSendBtn");
  const sendErr = document.querySelector("#partnerAssignedSendError");

  if (form instanceof HTMLFormElement && input instanceof HTMLTextAreaElement) {
    form.addEventListener("submit", async (ev) => {
      ev.preventDefault();
      const text = input.value.trim();
      if (!text) return;
      if (sendErr instanceof HTMLElement) {
        sendErr.hidden = true;
        sendErr.textContent = "";
      }
      if (sendBtn instanceof HTMLButtonElement) sendBtn.disabled = true;
      try {
        await partnerThreadsApi.sendMessage(threadId, text);
        input.value = "";
        const refreshed = await partnerThreadsApi.threadDetail(threadId);
        const scrollEl = document.querySelector("#partnerAssignedChatScroll");
        const d =
          refreshed && typeof refreshed === "object"
            ? /** @type {Record<string, unknown>} */ (refreshed)
            : {};
        const msgs = Array.isArray(d.messages) ? d.messages : [];
        if (scrollEl instanceof HTMLElement) {
          renderMessages(scrollEl, /** @type {Array<Record<string, unknown>>} */ (msgs));
        }
      } catch (e) {
        const msg = errorMessageForDetail(e);
        if (sendErr instanceof HTMLElement) {
          sendErr.hidden = false;
          sendErr.textContent = msg;
        }
      } finally {
        if (sendBtn instanceof HTMLButtonElement) sendBtn.disabled = false;
      }
    });
  }
  clearShellTopLayerBlockers();
}

void initPartnerAssignedRequest();
