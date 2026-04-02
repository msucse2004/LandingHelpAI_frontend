import { qs } from "../core/utils.js";

function parsePendingQuoteId() {
  const q = new URLSearchParams(window.location.search);
  return (q.get("pending_quote_id") || "").trim();
}

function init() {
  const pendingQuoteId = parsePendingQuoteId();
  const ref = qs("#surveySubmittedRef");
  if (!ref) return;
  if (!pendingQuoteId) {
    ref.hidden = true;
    return;
  }
  ref.hidden = false;
  ref.textContent = `내 접수 참고 번호: ${pendingQuoteId} (문의 시 알려주시면 빠르게 확인할 수 있어요)`;
}

init();
