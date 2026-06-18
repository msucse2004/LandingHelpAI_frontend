/**
 * Per-message frontend latency trace (SSE vs fallback vs safety-sync).
 *
 * Enable: LHAI_DEBUG_REALTIME=1 and/or LHAI_DEBUG_LIVE_MESSAGES=1
 */

import { isRealtimeDiagnosticsEnabled, logRealtimeDiagnostics } from "./realtime-diagnostics.js";
import {
  MESSAGES_FALLBACK_POLL_MS_DEGRADED,
  MESSAGES_FALLBACK_POLL_MS_FALLBACK,
  messagesSafetyPollIntervalMs,
} from "./messages-realtime-policy.js";

/** @type {Map<string, Record<string, unknown>>} */
const traces = new Map();
/** @type {Set<string>} */
const sseObservedMessageIds = new Set();
const MAX_TRACES = 400;

export function getMessagesPollingIntervalsForDebug() {
  return {
    fallback_poll_ms_fallback: MESSAGES_FALLBACK_POLL_MS_FALLBACK,
    fallback_poll_ms_disconnected: MESSAGES_FALLBACK_POLL_MS_DEGRADED,
    safety_sync_ms_connected: messagesSafetyPollIntervalMs(),
  };
}

function enabled() {
  return isRealtimeDiagnosticsEnabled();
}

/**
 * @param {string} messageId
 * @returns {Record<string, unknown>}
 */
function ensureTrace(messageId) {
  const mid = String(messageId || "").trim();
  let t = traces.get(mid);
  if (!t) {
    t = { message_id: mid, trace_anchor_ms: Date.now() };
    traces.set(mid, t);
    if (traces.size > MAX_TRACES) {
      const first = traces.keys().next().value;
      if (first) traces.delete(first);
    }
  }
  return t;
}

/**
 * @param {string | null | undefined} messageId
 */
export function recordSseMessageCreated(messageId) {
  if (!enabled()) return;
  const mid = String(messageId || "").trim();
  if (!mid) return;
  sseObservedMessageIds.add(mid);
  const t = ensureTrace(mid);
  const now = Date.now();
  t.sse_event_received_at = now;
  t.event_received_via = "sse";
  if (!t.trace_anchor_ms) t.trace_anchor_ms = now;
  logRealtimeDiagnostics("realtime-latency", "sse_event_received_at", {
    message_id: mid,
    sse_event_received_at: now,
  });
}

/**
 * @param {string | null | undefined} messageId
 */
export function markMessageCreatedHandlerStarted(messageId) {
  if (!enabled()) return;
  const mid = String(messageId || "").trim();
  if (!mid) return;
  const t = ensureTrace(mid);
  t.message_created_handler_started_at = Date.now();
  logRealtimeDiagnostics("realtime-latency", "message_created_handler_started", { message_id: mid });
}

/**
 * @param {string | null | undefined} messageId
 * @param {{ refreshSource?: string }} [opts]
 */
export function markDetailFetchStarted(messageId, opts = {}) {
  if (!enabled()) return;
  const mid = String(messageId || "").trim();
  if (!mid) return;
  const t = ensureTrace(mid);
  const now = Date.now();
  t.detail_fetch_started_at = now;
  const src = String(opts.refreshSource || "").trim();
  if (src) t.refresh_source = src;
  if (!sseObservedMessageIds.has(mid) && src) {
    t.event_received_via = src;
    if (!t.trace_anchor_ms) t.trace_anchor_ms = now;
  }
  logRealtimeDiagnostics("realtime-latency", "detail_fetch_started", {
    message_id: mid,
    refresh_source: src || null,
  });
}

/**
 * @param {string | null | undefined} messageId
 */
export function markDetailFetchFinished(messageId) {
  if (!enabled()) return;
  const mid = String(messageId || "").trim();
  if (!mid) return;
  const t = ensureTrace(mid);
  t.detail_fetch_finished_at = Date.now();
  logRealtimeDiagnostics("realtime-latency", "detail_fetch_finished", { message_id: mid });
}

/**
 * @param {string} messageId
 * @param {{ refreshSource?: string; visibleInDom?: boolean }} [opts]
 */
export function completeMessageLatencyTrace(messageId, opts = {}) {
  if (!enabled()) return;
  const mid = String(messageId || "").trim();
  if (!mid) return;
  const t = traces.get(mid) || ensureTrace(mid);
  const now = Date.now();
  const anchor = Number(t.trace_anchor_ms) || Number(t.sse_event_received_at) || now;
  const via =
    sseObservedMessageIds.has(mid) && t.sse_event_received_at
      ? "sse"
      : String(opts.refreshSource || t.event_received_via || t.refresh_source || "unknown").trim() ||
        "unknown";
  const visible = opts.visibleInDom !== false;
  if (visible) t.message_visible_in_dom_at = now;

  const payload = {
    message_id: mid,
    event_received_via: via,
    refresh_source: String(opts.refreshSource || t.refresh_source || via),
    message_visible_after_ms: Math.max(0, now - anchor),
    sse_event_received_at: t.sse_event_received_at ?? null,
    message_created_handler_started_at: t.message_created_handler_started_at ?? null,
    detail_fetch_started_at: t.detail_fetch_started_at ?? null,
    detail_fetch_finished_at: t.detail_fetch_finished_at ?? null,
    message_visible_in_dom_at: t.message_visible_in_dom_at ?? null,
  };
  if (via !== "sse") {
    payload.note = "message.created SSE event not observed";
  }
  if (t.detail_fetch_started_at && t.detail_fetch_finished_at) {
    payload.detail_fetch_duration_ms = Math.max(
      0,
      Number(t.detail_fetch_finished_at) - Number(t.detail_fetch_started_at),
    );
  }

  // eslint-disable-next-line no-console
  console.info("[LHAI realtime latency]", payload);

  traces.delete(mid);
  if (via === "sse") sseObservedMessageIds.delete(mid);
}

/**
 * After render: complete traces for new message ids that appeared in the thread.
 * @param {string[]} newMessageIds
 * @param {{ refreshSource?: string }} [opts]
 */
export function completeLatencyForNewMessages(newMessageIds, opts = {}) {
  if (!enabled() || !Array.isArray(newMessageIds)) return;
  const src = String(opts.refreshSource || "").trim();
  for (const raw of newMessageIds) {
    const mid = String(raw || "").trim();
    if (!mid) continue;
    const row =
      typeof document !== "undefined"
        ? document.querySelector(`[data-message-id="${CSS.escape(mid)}"]`)
        : null;
    completeMessageLatencyTrace(mid, {
      refreshSource: src,
      visibleInDom: Boolean(row),
    });
  }
}

/**
 * @param {Set<string>} prevIds
 * @param {Array<{ id?: string }>} messages
 * @param {{ refreshSource?: string }} [opts]
 */
export function completeLatencyForMessagesAfterLoad(prevIds, messages, opts = {}) {
  if (!enabled()) return;
  const prev = prevIds instanceof Set ? prevIds : new Set();
  const arr = Array.isArray(messages) ? messages : [];
  const newIds = arr
    .map((m) => String(m?.id || "").trim())
    .filter((id) => id && !prev.has(id));
  completeLatencyForNewMessages(newIds, opts);
}
