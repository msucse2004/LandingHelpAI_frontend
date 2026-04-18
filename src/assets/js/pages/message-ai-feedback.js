/**
 * AI 메시지 썸 업/다운 — 가벼운 피드백 (약한 감독 신호).
 * 운영자 모드에서는 표시하지 않습니다.
 */
import { messagesApi } from "../core/api.js";
import { getAccessToken } from "../core/auth.js";
import { safeText } from "../core/utils.js";

const REASONS = [
  { code: "inaccurate", label: "부정확해요" },
  { code: "did_not_understand", label: "이해하지 못했어요" },
  { code: "needs_human_help", label: "운영자 도움이 필요해요" },
  { code: "still_not_resolved", label: "아직 해결이 안 됐어요" },
  { code: "other", label: "기타" },
];

function reasonLabel(code) {
  const r = REASONS.find((x) => x.code === code);
  return r ? r.label : code;
}

/**
 * @param {Record<string, unknown>} m
 * @returns {string}
 */
export function buildAiFeedbackHtml(m) {
  if (!m || !m.feedback_eligible) return "";
  const id = String(m.id || "");
  if (!id) return "";
  const fb = m.feedback;
  if (fb && typeof fb === "object") {
    const sent = String(fb.sentiment || "") === "up" ? "👍 도움됨" : "👎 보냄";
    const extra = fb.reason_code ? ` · ${safeText(reasonLabel(String(fb.reason_code)))}` : "";
    return `<div class="lhai-msg-feedback lhai-msg-feedback--done" data-lhai-ai-feedback="1" data-message-id="${safeText(id)}">
      <span class="lhai-msg-feedback__done">${safeText(sent)}${extra}</span>
    </div>`;
  }
  const chips = REASONS.map(
    (r) =>
      `<button type="button" class="lhai-msg-feedback__chip" data-lhai-feedback-reason="${safeText(r.code)}">${safeText(r.label)}</button>`
  ).join("");
  return `<div class="lhai-msg-feedback" data-lhai-ai-feedback="1" data-message-id="${safeText(id)}">
    <div class="lhai-msg-feedback__row">
      <button type="button" class="lhai-msg-feedback__thumb" data-lhai-feedback-action="up" aria-label="도움이 됐어요">👍</button>
      <button type="button" class="lhai-msg-feedback__thumb" data-lhai-feedback-action="down" aria-label="도움이 되지 않았어요">👎</button>
    </div>
    <div class="lhai-msg-feedback__reasons" hidden>
      <span class="lhai-msg-feedback__prompt">어떤 점이 아쉬웠나요?</span>
      <div class="lhai-msg-feedback__chips">${chips}</div>
      <label class="lhai-msg-feedback__other"><span class="lhai-msg-feedback__other-label">기타 메모 (선택)</span>
        <textarea class="lhai-msg-feedback__textarea" rows="2" maxlength="500" aria-label="기타 메모"></textarea>
      </label>
    </div>
    <p class="lhai-msg-feedback__hint">피드백은 품질·운영 신호로만 쓰이며, 자동 학습의 정답으로 취급되지 않습니다.</p>
  </div>`;
}

/**
 * @param {object} opts
 * @param {() => { operatorInboxMode: boolean, customerProfileId: string }} opts.getContext
 */
export function bindMessageAiFeedback(opts) {
  const host = document.querySelector("#messageDetailContainer");
  if (!host || host.dataset.lhaiAiFeedbackBound === "1") return;
  host.dataset.lhaiAiFeedbackBound = "1";

  host.addEventListener("click", async (ev) => {
    const ctx = opts.getContext();
    if (ctx.operatorInboxMode) return;

    const target = ev.target;
    if (!(target instanceof Element)) return;

    const thumb = target.closest("[data-lhai-feedback-action]");
    const chip = target.closest("[data-lhai-feedback-reason]");
    const wrap = target.closest(".lhai-msg-feedback[data-message-id]");
    if (!wrap || wrap.classList.contains("lhai-msg-feedback--done")) return;

    const messageId = wrap.getAttribute("data-message-id");
    if (!messageId) return;

    const cp = String(ctx.customerProfileId || "").trim();
    if (!cp) return;

    if (thumb) {
      const action = thumb.getAttribute("data-lhai-feedback-action");
      if (action === "down") {
        const reasons = wrap.querySelector(".lhai-msg-feedback__reasons");
        if (reasons instanceof HTMLElement) {
          reasons.hidden = !reasons.hidden;
        }
        return;
      }
      if (action === "up") {
        await submitFeedback(wrap, { customerProfileId: cp, messageId, sentiment: "up", reasonCode: null });
      }
      return;
    }

    if (chip) {
      const code = chip.getAttribute("data-lhai-feedback-reason");
      const ta = wrap.querySelector(".lhai-msg-feedback__textarea");
      const otherNote = ta instanceof HTMLTextAreaElement ? ta.value.trim() : "";
      await submitFeedback(wrap, {
        customerProfileId: cp,
        messageId,
        sentiment: "down",
        reasonCode: code || "other",
        otherNote: code === "other" ? otherNote : "",
      });
    }
  });
}

/**
 * @param {HTMLElement} wrap
 * @param {{ customerProfileId: string, messageId: string, sentiment: 'up'|'down', reasonCode: string | null, otherNote?: string }} p
 */
async function submitFeedback(wrap, p) {
  if (!getAccessToken()) {
    window.alert("로그인 후 피드백을 보낼 수 있습니다.");
    return;
  }
  wrap.querySelectorAll("button").forEach((b) => {
    b.setAttribute("disabled", "disabled");
  });
  try {
    const res = await messagesApi.submitAiMessageFeedback(p.messageId, {
      customerProfileId: p.customerProfileId,
      sentiment: p.sentiment,
      reasonCode: p.reasonCode,
      otherNote: p.otherNote || "",
    });
    const esc = res && res.escalation_message_sent === true;
    wrap.classList.add("lhai-msg-feedback--done");
    const label = p.sentiment === "up" ? "👍 도움됨" : "👎 보냄";
    const extra =
      p.sentiment === "down" && p.reasonCode ? ` · ${safeText(reasonLabel(String(p.reasonCode)))}` : "";
    wrap.innerHTML = `<span class="lhai-msg-feedback__done">${safeText(label)}${extra}</span>${
      esc
        ? `<span class="lhai-msg-feedback__esc" role="status">운영자 요청을 같은 대화에 남겼습니다.</span>`
        : ""
    }`;
  } catch (err) {
    const msg = err && typeof err.message === "string" ? err.message : "피드백을 보내지 못했습니다.";
    window.alert(msg);
    wrap.querySelectorAll("button").forEach((b) => b.removeAttribute("disabled"));
  }
}
