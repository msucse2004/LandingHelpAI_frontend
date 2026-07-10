/**
 * Global in-app toast copy + DOM for message.created (bid toast uses bid-realtime).
 */
import { t } from "./i18n-client.js";
import { ROLES } from "./config.js";
import {
  REALTIME_TOAST_DEDUPE_MS,
  hasRecentRealtimeToastDedupe,
  messageEventCodeToActionEventKind,
  toastDedupeKeyAction,
  touchRealtimeToastDedupe,
  tryAcquireRealtimeMessageToast,
} from "./realtime-toast-dedupe.js";

export { REALTIME_TOAST_DEDUPE_MS as REALTIME_MESSAGE_TOAST_DEDUPE_MS };
export {
  messageEventCodeToActionEventKind,
  reserveMessageActionToastDedupe,
  reserveMessageCreatedToastDedupe,
  tryAcquireRealtimeMessageToast,
} from "./realtime-toast-dedupe.js";

export const POLLING_TOAST_AFTER_REALTIME_MS = 15_000;
let lastRealtimeInboxToastWallMs = 0;

/**
 * @param {string | null | undefined} threadId
 * @returns {string}
 */
export function buildMessagesThreadHref(threadId) {
  const tid = String(threadId || "").trim();
  return tid ? `messages.html?thread_id=${encodeURIComponent(tid)}` : "messages.html";
}

/**
 * @deprecated prefer reserveMessageCreatedToastDedupe({ threadId, eventCode })
 * @param {string | null | undefined} threadId
 */
export function recordRealtimeMessageCreatedForThread(threadId) {
  const keys = ["CUSTOMER_SELECTED", "BIDDING_STARTED"]
    .map((ek) => toastDedupeKeyAction(threadId, ek))
    .filter(Boolean);
  touchRealtimeToastDedupe(keys);
}

/**
 * @deprecated use shouldSuppressBidUpdatedToast
 * @param {string | null | undefined} threadId
 * @returns {boolean}
 */
export function shouldSuppressBidToastForThread(threadId) {
  const tid = String(threadId || "").trim();
  if (!tid) return false;
  return ["CUSTOMER_SELECTED", "BIDDING_STARTED"].some((ek) => {
    const k = toastDedupeKeyAction(tid, ek);
    return Boolean(k && hasRecentRealtimeToastDedupe(k));
  });
}

/** @param {string | null | undefined} messageId */
export function tryAcquireRealtimeMessageToastSlot(messageId) {
  return tryAcquireRealtimeMessageToast({ messageId });
}

export function markRealtimeInboxToastWall() {
  lastRealtimeInboxToastWallMs = Date.now();
}

/** @returns {boolean} */
export function shouldSuppressPollingInboxToast() {
  return Date.now() - lastRealtimeInboxToastWallMs < POLLING_TOAST_AFTER_REALTIME_MS;
}

function escapeHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * @param {string} raw
 * @param {number} maxLen
 */
export function safeToastPreviewLine(raw, maxLen = 72) {
  let text = String(raw || "")
    .replace(/\s+/g, " ")
    .trim();
  if (!text) return "";
  if (text.length > 120 && (text.includes("{") || text.includes("['"))) return "";
  if (text.length > maxLen) text = `${text.slice(0, maxLen - 1)}…`;
  return text;
}

/**
 * @param {Record<string, unknown>} payload
 * @param {Record<string, unknown>} data
 */
export function normalizeRealtimeMessageType(payload, data) {
  const p = payload && typeof payload === "object" ? payload : {};
  const d = data && typeof data === "object" ? data : {};
  const mt = String(p.message_type ?? d.message_type ?? "").trim().toUpperCase();
  const actor = String(p.actor_type ?? d.actor_type ?? "").trim().toUpperCase();
  if (mt === "SYSTEM" || actor === "SYSTEM") return "SYSTEM";
  if (mt === "AI" || actor === "AI") return "AI";
  if (String(p.event_code ?? d.event_code ?? "").trim()) return "SYSTEM";
  return "CHAT";
}

/**
 * @param {{
 *   messageType?: string;
 *   actorType?: string | null;
 *   eventCode?: string;
 *   payload?: Record<string, unknown>;
 *   data?: Record<string, unknown>;
 *   threadId?: string | null;
 *   role?: string | null;
 * }} ctx
 * @returns {{ title: string; body: string; cta: string; href: string }}
 */
function resolveRealtimeEventCodeToastOverrides(role) {
  const systemCta = t("common.header.realtime_system_toast_cta", "View update");
  const customer = {
    "customer.bidding.partner_selected": {
      title: t("common.header.realtime_partner_selected_title", "Partner selection complete"),
      body: t(
        "common.header.realtime_partner_selected_body",
        "Open Messages to see the next step.",
      ),
      cta: systemCta,
    },
    "thread.intake.completed": {
      title: t("common.header.realtime_intake_completed_title", "Required information submitted"),
      body: t(
        "common.header.realtime_intake_completed_body",
        "We are preparing the next step based on your submission.",
      ),
      cta: systemCta,
    },
    "intake.bidding.requests_sent": {
      title: t("common.header.realtime_bidding_started_title", "Quote request sent"),
      body: t(
        "common.header.realtime_bidding_started_body",
        "Partner proposals will appear in Messages when they arrive.",
      ),
      cta: systemCta,
    },
    "thread.bidding.comparison_entry": {
      title: t("common.header.realtime_bid_comparison_title", "Vehicle quote request started"),
      body: t(
        "common.header.realtime_bid_comparison_body",
        "Review partner proposals on the comparison screen.",
      ),
      cta: systemCta,
    },
    "customer.bidding.new_round_requested": {
      title: t("common.header.realtime_new_bid_round_title", "A new quote round has started"),
      body: t(
        "common.header.realtime_new_bid_round_body",
        "Check Messages for guidance.",
      ),
      cta: systemCta,
    },
  };
  const partner = {
    "partner.bidding.quote_selected": {
      title: t("common.header.realtime_quote_selected_title", "The customer selected your quote"),
      body: t(
        "common.header.realtime_quote_selected_body",
        "Open Messages to continue the conversation.",
      ),
      cta: systemCta,
    },
  };
  const r = String(role || "").trim();
  if (r === ROLES.CUSTOMER) return customer;
  if (r === ROLES.PARTNER) return partner;
  return { ...customer, ...partner };
}

export function resolveMessageCreatedToastCopy(ctx) {
  const payload = ctx.payload && typeof ctx.payload === "object" ? ctx.payload : {};
  const data = ctx.data && typeof ctx.data === "object" ? ctx.data : {};
  const eventCode = String(ctx.eventCode ?? payload.event_code ?? data.event_code ?? "").trim();
  const kind = String(ctx.messageType ?? normalizeRealtimeMessageType(payload, data)).trim().toUpperCase();
  const href = buildMessagesThreadHref(ctx.threadId);

  // Step 13: static title/subtitle via StringKey (t()); dynamic line from SSE preview (UGC).
  // TODO(step-13+): prefer payload.display_preview when backend fans out per-recipient locale.
  const preview = safeToastPreviewLine(
    payload.display_preview ?? payload.preview ?? data.preview ?? data.display_preview ?? payload.title ?? "",
  );

  const eventOverrides = resolveRealtimeEventCodeToastOverrides(ctx.role);

  if (eventCode && eventOverrides[eventCode]) {
    const o = eventOverrides[eventCode];
    return {
      title: o.title,
      body: preview || o.body,
      cta: o.cta,
      href,
    };
  }

  if (kind === "SYSTEM") {
    return {
      title: t("common.header.realtime_system_toast_title", "New service update"),
      body:
        preview ||
        t(
          "common.header.realtime_system_toast_body",
          "Review the latest guidance about your service.",
        ),
      cta: t("common.header.realtime_system_toast_cta", "View update"),
      href,
    };
  }

  if (kind === "AI") {
    return {
      title: t("common.header.realtime_ai_toast_title", "New guidance from Landing Help AI"),
      body:
        preview ||
        t("common.header.realtime_ai_toast_body", "Review the response from Landing Help AI."),
      cta: t("common.header.realtime_ai_toast_cta", "View"),
      href,
    };
  }

  return {
    title: t("common.header.realtime_inbox_toast_title", "New message received"),
    body:
      preview ||
      t("common.header.realtime_inbox_toast_body", "Open Messages to read it."),
    cta: t("common.header.realtime_chat_toast_cta", "View message"),
    href,
  };
}

/**
 * @param {{ title: string; body?: string; href?: string; cta?: string; autoHideMs?: number }} opts
 */
export function showGlobalRealtimeInboxToast(opts) {
  const href = String(opts.href || "messages.html").trim() || "messages.html";
  let root = document.querySelector("#lhai-message-toast-root");
  if (!(root instanceof HTMLElement)) {
    root = document.createElement("div");
    root.id = "lhai-message-toast-root";
    root.className = "lhai-message-toast-root";
    document.body.appendChild(root);
  }
  const title = escapeHtml(opts.title || "");
  const body = opts.body ? escapeHtml(opts.body) : "";
  const cta = escapeHtml(opts.cta || t("common.header.realtime_inbox_toast_cta", "Open Messages"));
  const closeLabel = escapeHtml(t("common.header.message_toast_close", "Close"));
  const closeAria = escapeHtml(t("common.header.message_toast_close_aria", "Close notification"));
  root.innerHTML = `
    <div class="lhai-message-toast" role="status" aria-live="polite">
      <div class="lhai-message-toast__title">${title}</div>
      ${body ? `<div class="lhai-message-toast__body">${body}</div>` : ""}
      <a class="lhai-message-toast__cta" href="${escapeHtml(href)}">${cta}</a>
      <button type="button" class="lhai-message-toast__close" aria-label="${closeAria}">${closeLabel}</button>
    </div>
  `.trim();
  root.classList.add("is-visible");
  markRealtimeInboxToastWall();
  const hideMs = Number(opts.autoHideMs) > 0 ? Number(opts.autoHideMs) : 12_000;
  const close = root.querySelector(".lhai-message-toast__close");
  close?.addEventListener("click", () => {
    root?.classList.remove("is-visible");
    window.setTimeout(() => {
      if (root) root.innerHTML = "";
    }, 180);
  });
  window.setTimeout(() => {
    if (!root) return;
    root.classList.remove("is-visible");
    window.setTimeout(() => {
      if (root) root.innerHTML = "";
    }, 180);
  }, hideMs);
}
