/**
 * Shared in-app toast dedupe for message.created vs bid.updated / bidding.event.
 *
 * Keys:
 * - message:{message_id}
 * - bid:{bid_request_id}:{event_kind}
 * - action:{thread_id}:{event_kind} — CUSTOMER_SELECTED / BIDDING_STARTED pairs
 */
export const REALTIME_TOAST_DEDUPE_MS = 10_000;

/** SYSTEM timeline + bid.updated often fire together; message toast owns the UX. */
export const BID_MESSAGE_OVERLAP_EVENT_KINDS = new Set([
  "CUSTOMER_SELECTED",
  "BIDDING_STARTED",
]);

/** @type {Map<string, number>} */
const recentToastKeys = new Map();

function pruneDedupeMap(maxAgeMs = REALTIME_TOAST_DEDUPE_MS) {
  const now = Date.now();
  for (const [k, ts] of recentToastKeys) {
    if (now - ts > maxAgeMs) recentToastKeys.delete(k);
  }
}

/**
 * @param {string | null | undefined} messageId
 * @returns {string}
 */
export function toastDedupeKeyMessage(messageId) {
  const mid = String(messageId || "").trim();
  return mid ? `message:${mid}` : "";
}

/**
 * @param {string | null | undefined} bidRequestId
 * @param {string | null | undefined} eventKind
 * @returns {string}
 */
export function toastDedupeKeyBid(bidRequestId, eventKind) {
  const br = String(bidRequestId || "").trim();
  const ek = String(eventKind || "").trim().toUpperCase();
  if (!br) return "";
  return ek ? `bid:${br}:${ek}` : `bid:${br}:`;
}

/**
 * @param {string | null | undefined} threadId
 * @param {string | null | undefined} eventKind
 * @returns {string}
 */
export function toastDedupeKeyAction(threadId, eventKind) {
  const tid = String(threadId || "").trim();
  const ek = String(eventKind || "").trim().toUpperCase();
  return tid && ek ? `action:${tid}:${ek}` : "";
}

/**
 * @param {string | null | undefined} eventCode
 * @returns {string | null}
 */
export function messageEventCodeToActionEventKind(eventCode) {
  const ec = String(eventCode || "").trim();
  const map = {
    "customer.bidding.partner_selected": "CUSTOMER_SELECTED",
    "partner.bidding.quote_selected": "CUSTOMER_SELECTED",
    "intake.bidding.requests_sent": "BIDDING_STARTED",
    "thread.bidding.comparison_entry": "BIDDING_STARTED",
  };
  return map[ec] || null;
}

/**
 * @param {{
 *   messageId?: string | null;
 *   threadId?: string | null;
 *   eventCode?: string | null;
 * }} opts
 * @returns {string[]}
 */
export function buildMessageCreatedToastDedupeKeys(opts) {
  const keys = [];
  const mk = toastDedupeKeyMessage(opts.messageId);
  if (mk) keys.push(mk);
  const actionKind = messageEventCodeToActionEventKind(opts.eventCode);
  const ak = toastDedupeKeyAction(opts.threadId, actionKind);
  if (ak) keys.push(ak);
  return keys;
}

/**
 * @param {{
 *   threadId?: string | null;
 *   bidRequestId?: string | null;
 *   eventKind?: string | null;
 * }} opts
 * @returns {string[]}
 */
export function buildBidUpdatedToastDedupeKeys(opts) {
  const ek = String(opts.eventKind || "").trim().toUpperCase();
  const keys = [];
  const bk = toastDedupeKeyBid(opts.bidRequestId, ek);
  if (bk) keys.push(bk);
  if (ek && BID_MESSAGE_OVERLAP_EVENT_KINDS.has(ek)) {
    const ak = toastDedupeKeyAction(opts.threadId, ek);
    if (ak) keys.push(ak);
  }
  return keys;
}

/**
 * @param {string | null | undefined} eventKind
 * @returns {boolean}
 */
export function bidUpdatedToastAllowed(eventKind) {
  const ek = String(eventKind || "").trim().toUpperCase();
  if (!ek) return true;
  return !BID_MESSAGE_OVERLAP_EVENT_KINDS.has(ek);
}

/**
 * @param {string} key
 * @param {number} [maxAgeMs]
 * @returns {boolean}
 */
export function hasRecentRealtimeToastDedupe(key, maxAgeMs = REALTIME_TOAST_DEDUPE_MS) {
  const k = String(key || "").trim();
  if (!k) return false;
  const ts = recentToastKeys.get(k);
  if (ts == null) return false;
  if (Date.now() - ts > maxAgeMs) {
    recentToastKeys.delete(k);
    return false;
  }
  return true;
}

/**
 * Reserve action:{thread}:{kind} before toast visibility checks (blocks delayed bid toast).
 * @param {{ threadId?: string | null; eventCode?: string | null }} opts
 */
export function reserveMessageActionToastDedupe(opts) {
  const actionKind = messageEventCodeToActionEventKind(opts.eventCode);
  const ak = toastDedupeKeyAction(opts.threadId, actionKind);
  if (ak) touchRealtimeToastDedupe([ak]);
}

/**
 * @param {string[]} keys
 */
export function touchRealtimeToastDedupe(keys) {
  const valid = (Array.isArray(keys) ? keys : []).filter((k) => typeof k === "string" && k.length > 0);
  if (!valid.length) return;
  pruneDedupeMap();
  const now = Date.now();
  for (const k of valid) recentToastKeys.set(k, now);
}

/**
 * @param {string[]} keys
 * @param {{ maxAgeMs?: number }} [opts]
 * @returns {boolean} true when toast may be shown
 */
export function tryAcquireRealtimeToastDedupe(keys, opts = {}) {
  const maxAgeMs = Number(opts.maxAgeMs) > 0 ? Number(opts.maxAgeMs) : REALTIME_TOAST_DEDUPE_MS;
  const valid = (Array.isArray(keys) ? keys : []).filter((k) => typeof k === "string" && k.length > 0);
  if (!valid.length) return true;
  pruneDedupeMap(maxAgeMs);
  for (const k of valid) {
    const ts = recentToastKeys.get(k);
    if (ts != null && Date.now() - ts < maxAgeMs) return false;
  }
  touchRealtimeToastDedupe(valid);
  return true;
}

/**
 * @param {{
 *   messageId?: string | null;
 *   threadId?: string | null;
 *   eventCode?: string | null;
 * }} opts
 * @returns {boolean}
 */
export function tryAcquireRealtimeMessageToast(opts) {
  const keys = [];
  const mk = toastDedupeKeyMessage(opts.messageId);
  if (mk) keys.push(mk);
  if (!keys.length) return true;
  if (!tryAcquireRealtimeToastDedupe(keys)) return false;
  const actionKind = messageEventCodeToActionEventKind(opts.eventCode);
  const ak = toastDedupeKeyAction(opts.threadId, actionKind);
  if (ak && !hasRecentRealtimeToastDedupe(ak)) touchRealtimeToastDedupe([ak]);
  return true;
}

/** @deprecated use reserveMessageActionToastDedupe */
export function reserveMessageCreatedToastDedupe(opts) {
  reserveMessageActionToastDedupe(opts);
}

/**
 * @param {{
 *   threadId?: string | null;
 *   bidRequestId?: string | null;
 *   eventKind?: string | null;
 * }} opts
 * @returns {boolean}
 */
export function shouldSuppressBidUpdatedToast(opts) {
  const ek = String(opts.eventKind || "").trim().toUpperCase();
  if (BID_MESSAGE_OVERLAP_EVENT_KINDS.has(ek)) return true;
  const keys = [
    toastDedupeKeyAction(opts.threadId, ek),
    toastDedupeKeyBid(opts.bidRequestId, ek),
  ].filter(Boolean);
  return keys.some((k) => hasRecentRealtimeToastDedupe(k));
}

/**
 * @param {{
 *   threadId?: string | null;
 *   bidRequestId?: string | null;
 *   eventKind?: string | null;
 * }} opts
 * @returns {boolean}
 */
export function tryAcquireBidUpdatedToast(opts) {
  if (shouldSuppressBidUpdatedToast(opts)) return false;
  return tryAcquireRealtimeToastDedupe(buildBidUpdatedToastDedupeKeys(opts));
}
