/**
 * Step 12 — ``bid.updated`` SSE helpers (partner bidding).
 */

/**
 * @param {{ type?: string, data?: object }} ev
 * @returns {Record<string, unknown>}
 */
export function normalizeBidUpdatedPayload(ev) {
  const data = ev?.data && typeof ev.data === "object" ? /** @type {Record<string, unknown>} */ (ev.data) : {};
  const nested =
    data.payload && typeof data.payload === "object"
      ? /** @type {Record<string, unknown>} */ (data.payload)
      : {};
  const threadId = String(data.thread_id || nested.thread_id || "").trim();
  const bidRequestId = String(nested.bid_request_id || "").trim();
  const serviceType = String(nested.service_type || nested.bidding_mode || "").trim().toUpperCase();
  const workflowInstanceId = String(
    nested.workflow_instance_id || nested.service_request_id || "",
  ).trim();
  return {
    ...nested,
    thread_id: threadId,
    bid_request_id: bidRequestId,
    service_type: serviceType,
    workflow_instance_id: workflowInstanceId,
    service_request_id: workflowInstanceId,
    update_kind: String(nested.update_kind || "").trim().toUpperCase(),
    bid_request_status: String(nested.bid_request_status || "").trim().toUpperCase(),
    cancelled_bid_request_id: String(nested.cancelled_bid_request_id || "").trim(),
    new_bid_request_id: String(nested.new_bid_request_id || "").trim(),
  };
}

/** @param {Record<string, unknown>} payload */
export function isCarPurchaseBidUpdatedPayload(payload) {
  const st = String(payload?.service_type || payload?.bidding_mode || "")
    .trim()
    .toUpperCase();
  return st === "CAR_PURCHASE";
}

/** @param {Record<string, unknown>} payload */
export function isBiddingBidUpdatedPayload(payload) {
  const br = String(payload?.bid_request_id || "").trim();
  const tid = String(payload?.thread_id || "").trim();
  return Boolean(br || tid);
}

/**
 * @param {Record<string, unknown>} payload
 * @param {{ threadId?: string, serviceRequestId?: string, bidRequestId?: string }} scope
 */
export function bidUpdatedMatchesScope(payload, scope) {
  const tid = String(payload.thread_id || "").trim();
  const wid = String(payload.workflow_instance_id || payload.service_request_id || "").trim();
  const evtBr = String(payload.bid_request_id || "").trim();
  const cancelled = String(payload.cancelled_bid_request_id || "").trim();
  const pageBr = String(scope.bidRequestId || "").trim();
  const pageTid = String(scope.threadId || "").trim();
  const pageWid = String(scope.serviceRequestId || "").trim();

  if (pageBr) {
    const brMatch = evtBr === pageBr || cancelled === pageBr;
    if (!brMatch && (evtBr || cancelled)) return false;
  }
  if (pageTid && tid && tid !== pageTid) return false;
  if (pageWid && wid && wid !== pageWid) return false;
  return true;
}

export function isCustomerBidResultsHtmlPage() {
  try {
    const p = String(window.location?.pathname || "");
    return p.includes("customer-bid-results.html");
  } catch {
    return false;
  }
}

export function isPartnerBidRequestHtmlPage() {
  try {
    const p = String(window.location?.pathname || "");
    return p.includes("partner-bid-request.html");
  } catch {
    return false;
  }
}

/** @param {string} serviceRequestId @param {string} threadId */
export function buildCustomerBidResultsHref(serviceRequestId, threadId) {
  const q = new URLSearchParams();
  const wid = String(serviceRequestId || "").trim();
  const tid = String(threadId || "").trim();
  if (wid) q.set("service_request_id", wid);
  if (tid) q.set("thread_id", tid);
  const qs = q.toString();
  return qs ? `customer-bid-results.html?${qs}` : "customer-bid-results.html";
}

export function isCustomerDashboardHtmlPage() {
  try {
    const p = String(window.location?.pathname || "");
    return p.includes("dashboard.html") && !p.includes("partner-dashboard");
  } catch {
    return false;
  }
}

function escapeHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * @param {{ href: string, title?: string, body?: string, cta?: string }} opts
 */
export function showBidUpdatedToast(opts) {
  const href = String(opts.href || "").trim();
  if (!href) return;
  let root = document.querySelector("#lhai-message-toast-root");
  if (!(root instanceof HTMLElement)) {
    root = document.createElement("div");
    root.id = "lhai-message-toast-root";
    root.className = "lhai-message-toast-root";
    document.body.appendChild(root);
  }
  const title = escapeHtml(opts.title || "견적이 업데이트되었습니다");
  const body = escapeHtml(opts.body || "");
  const cta = escapeHtml(opts.cta || "보기");
  root.innerHTML = `
    <div class="lhai-message-toast" role="status" aria-live="polite">
      <div class="lhai-message-toast__title">${title}</div>
      ${body ? `<div class="lhai-message-toast__body">${body}</div>` : ""}
      <a class="lhai-message-toast__cta" href="${escapeHtml(href)}">${cta}</a>
      <button type="button" class="lhai-message-toast__close" aria-label="닫기">닫기</button>
    </div>`;
  const close = root.querySelector(".lhai-message-toast__close");
  close?.addEventListener("click", () => {
    root.classList.remove("is-visible");
    window.setTimeout(() => {
      root.innerHTML = "";
    }, 180);
  });
  root.classList.add("is-visible");
  window.setTimeout(() => {
    root.classList.remove("is-visible");
    window.setTimeout(() => {
      root.innerHTML = "";
    }, 180);
  }, 12_000);
}
