import { ensureCustomerAccess, protectCurrentPage } from "../core/guards.js";
import { loadSidebar } from "../components/sidebar.js";
import { resolveAppHeaderShell, refreshHeaderMailUnreadBadge } from "../core/app-header.js";
import { getMockCaseById, mockCasesDelay } from "../core/mock-cases.js";

function qs(selector) {
  return document.querySelector(selector);
}

function esc(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** @type {import('../core/mock-cases.js').ServiceCase | null} */
let liveCase = null;

/** @type {Record<string, { vote: 'up'|'down', reason?: string }>} */
const feedbackByMessageId = {};

const AUTHOR_LABELS = {
  customer: "고객",
  ai: "AI 응답",
  admin: "운영 답변",
  system: "시스템 안내",
};

const REASONS = [
  { id: "inaccurate", label: "내용이 부정확해요" },
  { id: "misunderstood", label: "의도를 잘 못 알아들었어요" },
  { id: "needs_human", label: "사람 도움이 필요해요" },
  { id: "unresolved", label: "아직 해결이 안 됐어요" },
];

function badgeClass(status) {
  const m = {
    open: "lhai-case-badge--open",
    pending_ops: "lhai-case-badge--pending_ops",
    pending_customer: "lhai-case-badge--pending_customer",
    resolved: "lhai-case-badge--resolved",
  };
  return m[status] || "lhai-case-badge--open";
}

function formatTime(iso) {
  try {
    return new Date(iso).toLocaleString("ko-KR", { dateStyle: "short", timeStyle: "short" });
  } catch {
    return "";
  }
}

function renderFeedbackUI(messageId) {
  const fb = feedbackByMessageId[messageId];
  const upSel = fb?.vote === "up" ? " is-selected" : "";
  const downSel = fb?.vote === "down" ? " is-selected" : "";
  const reasonsOpen = fb?.vote === "down" ? " is-open" : "";
  const reasonChips = REASONS.map(
    (r) =>
      `<button type="button" class="lhai-case-reasons__chip" data-msg-id="${esc(messageId)}" data-reason="${esc(r.id)}">${esc(r.label)}</button>`
  ).join("");
  const showEscalate = fb?.vote === "down" && fb?.reason === "needs_human";
  const escalateHtml = showEscalate
    ? `<div class="lhai-case-escalate-cta" role="status">
        <strong>운영 담당자 연결</strong>
        <p class="lhai-help u-mt-1" style="margin:0;">아래 버튼을 누르면 요청이 운영 큐로 올라갑니다(데모).</p>
        <button type="button" class="lhai-button lhai-button--primary u-mt-2" data-escalate="${esc(messageId)}">운영팀에 에스컬레이션</button>
      </div>`
    : "";
  return `
    <div class="lhai-case-ai-feedback" data-feedback-for="${esc(messageId)}">
      <span class="lhai-help" style="margin:0;">도움이 되었나요?</span>
      <button type="button" class="lhai-case-ai-feedback__btn${upSel}" data-vote="up" data-msg-id="${esc(messageId)}">👍</button>
      <button type="button" class="lhai-case-ai-feedback__btn${downSel}" data-vote="down" data-msg-id="${esc(messageId)}">👎</button>
      <div class="lhai-case-reasons${reasonsOpen}" data-reasons-for="${esc(messageId)}">
        ${reasonChips}
      </div>
      ${escalateHtml}
    </div>
  `;
}

function renderMessageBubble(msg) {
  const label = AUTHOR_LABELS[msg.author] || msg.author;
  const rowClass = msg.author === "customer" ? "lhai-case-msg-row lhai-case-msg-row--customer" : "lhai-case-msg-row";
  const bubbleClass =
    msg.author === "customer"
      ? "lhai-case-bubble lhai-case-bubble--customer"
      : msg.author === "ai"
        ? "lhai-case-bubble lhai-case-bubble--ai"
        : msg.author === "admin"
          ? "lhai-case-bubble lhai-case-bubble--admin"
          : "lhai-case-bubble lhai-case-bubble--system";

  const feedbackBlock =
    msg.author === "ai" && msg.aiEligible !== false ? renderFeedbackUI(msg.id) : "";

  return `
    <div class="${rowClass}">
      <div class="${bubbleClass}">
        <span class="lhai-case-msg-label">${esc(label)}</span>
        <div class="lhai-case-msg-body">${esc(msg.body).replace(/\n/g, "<br/>")}</div>
        <time class="lhai-case-msg-time">${esc(formatTime(msg.createdAt))}</time>
        ${feedbackBlock}
      </div>
    </div>
  `;
}

function renderTimeline() {
  const stream = qs("#caseChatStream");
  if (!stream || !liveCase) return;
  stream.innerHTML = liveCase.messages.map((m) => renderMessageBubble(m)).join("");
  const scroll = qs("#caseChatScroll");
  if (scroll) scroll.scrollTop = scroll.scrollHeight;
}

/** 스트림 innerHTML 갱신에도 유지되도록 스크롤 컨테이너에 단일 위임 */
function attachCaseChatDelegation() {
  const scroll = qs("#caseChatScroll");
  if (!scroll || scroll.dataset.lhaiCaseDelegation === "1") return;
  scroll.dataset.lhaiCaseDelegation = "1";
  scroll.addEventListener("click", (e) => {
    const t = /** @type {HTMLElement} */ (e.target);
    const voteBtn = t.closest("[data-vote]");
    if (voteBtn) {
      const msgId = voteBtn.getAttribute("data-msg-id") || "";
      const vote = voteBtn.getAttribute("data-vote");
      if (!msgId || (vote !== "up" && vote !== "down")) return;
      const prev = feedbackByMessageId[msgId] || {};
      feedbackByMessageId[msgId] = {
        vote,
        reason: vote === "up" ? undefined : prev.reason,
      };
      renderTimeline();
      return;
    }
    const reasonBtn = t.closest("[data-reason]");
    if (reasonBtn) {
      const msgId = reasonBtn.getAttribute("data-msg-id") || "";
      const reason = reasonBtn.getAttribute("data-reason") || "";
      if (!msgId) return;
      feedbackByMessageId[msgId] = { vote: "down", reason };
      renderTimeline();
      return;
    }
    const escBtn = t.closest("[data-escalate]");
    if (escBtn && liveCase) {
      liveCase.escalatedToOps = true;
      liveCase.messages.push({
        id: `local-${Date.now()}`,
        author: "system",
        body: "고객님의 요청을 운영팀 우선 확인 큐로 올렸습니다. 담당자가 곧 이어서 안내드립니다.",
        createdAt: new Date().toISOString(),
      });
      const hint = qs("#caseComposerHint");
      if (hint) hint.textContent = "에스컬레이션이 반영되었습니다.";
      syncHeaderChrome();
      renderTimeline();
    }
  });
}

function syncHeaderChrome() {
  if (!liveCase) return;
  const title = qs("#caseDetailTitle");
  const badge = qs("#caseStatusBadge");
  const stage = qs("#caseStageLine");
  const updated = qs("#caseUpdatedLine");
  const banner = qs("#caseOpsBanner");
  document.title = `${liveCase.title} · 문의 - Landing Help AI`;
  if (title) title.textContent = liveCase.title;
  if (badge) {
    badge.textContent = liveCase.statusLabel;
    badge.className = `lhai-case-badge ${badgeClass(liveCase.status)}`;
  }
  if (stage) stage.textContent = `현재 단계: ${liveCase.stageLabel}`;
  if (updated) updated.textContent = `마지막 업데이트: ${formatTime(liveCase.updatedAt)}`;
  if (banner) banner.hidden = !liveCase.escalatedToOps;
}

const QUICK_SNIPPETS = {
  ops: "[운영팀 전달] 다음 내용을 확인해 주세요:\n",
  human: "[사람 도움 요청] 직접 상담이 필요합니다. 가능한 시간대:\n",
  schedule: "[일정 변경] 희망 일시·사유:\n",
  docs: "[문서 도움] 필요 서류·번역 범위:\n",
};

function bindComposer() {
  const form = qs("#caseComposerForm");
  const input = qs("#caseComposerInput");
  const hint = qs("#caseComposerHint");
  const quick = qs("#caseQuickActions");
  if (!form || !input) return;

  quick?.addEventListener("click", (e) => {
    const btn = /** @type {HTMLElement} */ (e.target).closest("[data-quick]");
    if (!btn) return;
    const k = btn.getAttribute("data-quick");
    if (!k || !QUICK_SNIPPETS[k]) return;
    const cur = input.value.trim();
    input.value = cur ? `${cur}\n\n${QUICK_SNIPPETS[k]}` : QUICK_SNIPPETS[k];
    input.focus();
    if (hint) {
      if (k === "ops") hint.textContent = "운영팀 전달 태그가 포함되었습니다. 내용을 채운 뒤 보내 주세요.";
      else if (k === "human") hint.textContent = "사람 도움 요청이 포함되었습니다.";
      else hint.textContent = "빠른 요청 템플릿을 넣었습니다.";
    }
  });

  form.addEventListener("submit", (ev) => {
    ev.preventDefault();
    if (!liveCase) return;
    const text = input.value.trim();
    if (!text) return;
    liveCase.messages.push({
      id: `local-${Date.now()}`,
      author: "customer",
      body: text,
      createdAt: new Date().toISOString(),
    });
    liveCase.updatedAt = new Date().toISOString();
    input.value = "";
    if (hint) hint.textContent = "메시지가 전송되었습니다(데모: 이 기기에만 반영).";
    if (/운영팀|에스컬|사람 도움|직접 상담/i.test(text)) {
      liveCase.escalatedToOps = true;
    }
    syncHeaderChrome();
    renderTimeline();
  });
}

async function initCaseDetailPage() {
  if (!protectCurrentPage()) return;
  if (!ensureCustomerAccess()) return;

  const params = new URLSearchParams(window.location.search);
  const caseId = (params.get("case_id") || "").trim();

  const loading = qs("#caseDetailLoading");
  const err = qs("#caseDetailError");
  const content = qs("#caseDetailContent");

  await loadSidebar("#sidebar", "customer");
  const brandEl = document.querySelector(".lhai-brand");
  if (brandEl) brandEl.textContent = resolveAppHeaderShell().brand;
  void refreshHeaderMailUnreadBadge();

  if (!caseId) {
    loading.hidden = true;
    err.hidden = false;
    err.textContent = "문의 ID가 없습니다. 내 문의 목록에서 다시 열어 주세요.";
    return;
  }

  try {
    await mockCasesDelay(220);
    const c = getMockCaseById(caseId);
    if (!c) {
      loading.hidden = true;
      err.hidden = false;
      err.textContent = "해당 문의를 찾을 수 없습니다.";
      return;
    }
    liveCase = { ...c, messages: c.messages.map((m) => ({ ...m })) };
    loading.hidden = true;
    content.hidden = false;
    syncHeaderChrome();
    attachCaseChatDelegation();
    renderTimeline();
    bindComposer();
  } catch (e) {
    loading.hidden = true;
    err.hidden = false;
    err.textContent = e && typeof e.message === "string" ? e.message : "불러오지 못했습니다.";
  }
}

void initCaseDetailPage();
