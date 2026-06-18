/**
 * Per-page dedupe for message.created handler on messages.html (in-memory, session scoped).
 */

const MESSAGES_RT_MESSAGE_DEDUPE_MS = 120_000;
/** @type {Map<string, number>} */
const handledMessageIds = new Map();
/** @type {Set<string>} */
const inFlightLocks = new Set();

function pruneHandled() {
  const now = Date.now();
  for (const [id, ts] of handledMessageIds) {
    if (now - ts > MESSAGES_RT_MESSAGE_DEDUPE_MS) handledMessageIds.delete(id);
  }
}

/**
 * @param {string} messageId
 * @returns {boolean}
 */
export function claimMessageCreatedRealtimeEvent(messageId) {
  const mid = String(messageId || "").trim();
  if (!mid) return true;
  pruneHandled();
  if (handledMessageIds.has(mid)) return false;
  if (inFlightLocks.has(mid)) return false;
  inFlightLocks.add(mid);
  return true;
}

/**
 * @param {string} messageId
 * @param {boolean} handled
 */
export function releaseMessageCreatedRealtimeEvent(messageId, handled) {
  const mid = String(messageId || "").trim();
  if (!mid) return;
  inFlightLocks.delete(mid);
  if (handled) handledMessageIds.set(mid, Date.now());
}

/** Test-only reset. */
export function resetMessagesRealtimeDedupeForTests() {
  handledMessageIds.clear();
  inFlightLocks.clear();
}

/**
 * @param {string} messageId
 * @returns {boolean}
 */
export function wasMessageCreatedRealtimeHandled(messageId) {
  const mid = String(messageId || "").trim();
  return Boolean(mid && handledMessageIds.has(mid));
}
