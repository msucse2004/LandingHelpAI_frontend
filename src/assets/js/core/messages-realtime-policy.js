/**
 * Pure policy helpers for messages.html realtime (SSE + fallback polling).
 */

/** @param {Record<string, unknown>} d */
export function messagesRealtimeLifecycleFromDetail(d) {
  const life = String(d?.lifecycle || "").trim();
  if (life) return life;
  if (d?.connected && !d?.fallback) return "connected";
  if (d?.connecting) return "connecting";
  if (d?.fallback) return "fallback";
  return "disconnected";
}

/**
 * @param {Record<string, unknown>} d
 * @param {{ documentVisible?: boolean }} [opts]
 */
export function shouldRunMessagesFallbackPoll(d, opts = {}) {
  const life = messagesRealtimeLifecycleFromDetail(d);
  if (life === "connected") return false;
  const visible =
    opts.documentVisible !== undefined
      ? opts.documentVisible
      : typeof document !== "undefined" && document.visibilityState === "visible";
  if (!visible) return false;
  return life === "fallback" || life === "disconnected" || life === "connecting";
}

/** Fallback when SSE is not connected (primary path while degraded). Tune after server load review. */
export const MESSAGES_FALLBACK_POLL_MS_FALLBACK = 8_000;
export const MESSAGES_FALLBACK_POLL_MS_DEGRADED = 10_000;
const MESSAGES_FALLBACK_POLL_MS_MIN = 5_000;
const MESSAGES_FALLBACK_POLL_MS_MAX = 60_000;

function _readPositiveIntFromStorage(key) {
  if (typeof window === "undefined" || !window.localStorage) return null;
  const n = Number(window.localStorage.getItem(key));
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.floor(n);
}

function _readPositiveIntFromWindow(prop) {
  if (typeof window === "undefined") return null;
  const n = Number(/** @type {Record<string, unknown>} */ (window)[prop]);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.floor(n);
}

/**
 * Override: ``localStorage LHAI_MESSAGES_FALLBACK_POLL_MS`` (applies to all degraded lifecycles).
 * @param {Record<string, unknown>} d
 */
export function messagesFallbackPollIntervalMs(d) {
  const override =
    _readPositiveIntFromStorage("LHAI_MESSAGES_FALLBACK_POLL_MS") ??
    _readPositiveIntFromWindow("LHAI_MESSAGES_FALLBACK_POLL_MS");
  if (override != null) {
    return Math.min(MESSAGES_FALLBACK_POLL_MS_MAX, Math.max(MESSAGES_FALLBACK_POLL_MS_MIN, override));
  }
  const life = messagesRealtimeLifecycleFromDetail(d);
  if (life === "fallback") return MESSAGES_FALLBACK_POLL_MS_FALLBACK;
  return MESSAGES_FALLBACK_POLL_MS_DEGRADED;
}

/**
 * @param {{
 *   selectedThreadId?: string | null;
 *   eventThreadId?: string | null;
 * }} ctx
 */
export function planMessageCreatedMessagesPageAction(ctx) {
  const sel = String(ctx.selectedThreadId || "").trim();
  const tid = String(ctx.eventThreadId || "").trim();
  const sameThread = Boolean(tid && sel && tid === sel);
  return {
    sameThread,
    /** Same thread: reload stream via loadThreadMessages(realtime). */
    refreshThreadMessages: sameThread,
    /** Other thread: list + badge only; keep open thread bubbles. */
    refreshListOnly: Boolean(tid && !sameThread),
    preserveCurrentThreadContent: Boolean(sel && (!tid || !sameThread)),
    showPageToast: false,
  };
}

/**
 * @param {{
 *   lifecycle?: string;
 *   connected?: boolean;
 *   fallback?: boolean;
 * }} status
 */
export function shouldUseMessagesSafetyPolling(status) {
  const life = messagesRealtimeLifecycleFromDetail(status);
  return life === "connected";
}

/**
 * SSE connected: missed ``message.created`` backstop only (live events refresh immediately via SSE).
 * Was 45s; reduced for early ops (12–15s target).
 */
export const MESSAGES_SAFETY_SYNC_MS_DEFAULT = 12_000;
export const MESSAGES_SAFETY_SYNC_MS_MIN = 8_000;
export const MESSAGES_SAFETY_SYNC_MS_MAX = 60_000;

/**
 * SSE connected safety-sync interval.
 * Override: ``localStorage.setItem("LHAI_MESSAGES_SAFETY_SYNC_MS", "15000")``
 * or ``window.LHAI_MESSAGES_SAFETY_SYNC_MS = 15000`` (dev console).
 * @returns {number}
 */
export function messagesSafetyPollIntervalMs() {
  const override =
    _readPositiveIntFromStorage("LHAI_MESSAGES_SAFETY_SYNC_MS") ??
    _readPositiveIntFromWindow("LHAI_MESSAGES_SAFETY_SYNC_MS");
  if (override != null) {
    return Math.min(
      MESSAGES_SAFETY_SYNC_MS_MAX,
      Math.max(MESSAGES_SAFETY_SYNC_MS_MIN, override),
    );
  }
  return MESSAGES_SAFETY_SYNC_MS_DEFAULT;
}

/**
 * Safety sync runs only for the open thread while the tab is visible (limits server load).
 * @param {{ selectedThreadId?: string | null; documentVisible?: boolean }} [ctx]
 */
export function canRunMessagesSafetySyncTick(ctx = {}) {
  const visible =
    ctx.documentVisible !== undefined
      ? ctx.documentVisible
      : typeof document !== "undefined" && document.visibilityState === "visible";
  if (!visible) return false;
  return Boolean(String(ctx.selectedThreadId || "").trim());
}
