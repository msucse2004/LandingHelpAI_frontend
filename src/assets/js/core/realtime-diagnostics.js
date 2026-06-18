/**
 * Dev-only realtime diagnostics (SSE lifecycle badge + structured console logs).
 *
 * Enable in browser console:
 *   localStorage.setItem("LHAI_DEBUG_REALTIME", "1")
 *   localStorage.setItem("LHAI_DEBUG_LIVE_MESSAGES", "1")
 * See: LandingHelpAI_backend/docs/realtime_sse_debug.md
 */

const BADGE_ID = "lhai-realtime-diagnostic-badge";
const WINDOW_STATUS = "lhai:realtime-status";

let badgeMounted = false;

export function realtimeDebugLive() {
  try {
    return (
      window.localStorage?.getItem("LHAI_DEBUG_REALTIME") === "1" ||
      window.localStorage?.getItem("LHAI_DEBUG_LIVE_MESSAGES") === "1"
    );
  } catch {
    return false;
  }
}

export function isRealtimeDiagnosticsEnabled() {
  return realtimeDebugLive();
}

/**
 * @param {string} lifecycle
 * @returns {string}
 */
export function formatRealtimeLifecycleLabel(lifecycle) {
  const life = String(lifecycle || "").trim() || "disconnected";
  if (life === "connected") return "Realtime: connected";
  if (life === "fallback") return "Realtime: fallback polling";
  if (life === "connecting") return "Realtime: connecting…";
  return "Realtime: disconnected";
}

/**
 * @param {{ lifecycle?: string; connected?: boolean; fallback?: boolean; connecting?: boolean; lastError?: string | null; reconnectAttempt?: number }} [st]
 */
function lifecycleFromStatus(st) {
  if (!st || typeof st !== "object") return "disconnected";
  const life = String(st.lifecycle || "").trim();
  if (life) return life;
  if (st.connected && !st.fallback) return "connected";
  if (st.connecting) return "connecting";
  if (st.fallback) return "fallback";
  return "disconnected";
}

/**
 * @param {{ type?: string; data?: Record<string, unknown> }} [detail]
 * @returns {{ type: string; thread_id: string | null; message_id: string | null }}
 */
export function summarizeRealtimeEventDetail(detail) {
  const data = detail?.data && typeof detail.data === "object" ? detail.data : {};
  const payload =
    data.payload && typeof data.payload === "object"
      ? /** @type {Record<string, unknown>} */ (data.payload)
      : {};
  const threadRaw = data.thread_id ?? payload.thread_id ?? null;
  const messageRaw = data.message_id ?? payload.message_id ?? null;
  return {
    type: String(detail?.type || "").trim(),
    thread_id: threadRaw != null && threadRaw !== "" ? String(threadRaw) : null,
    message_id: messageRaw != null && messageRaw !== "" ? String(messageRaw) : null,
  };
}

/**
 * @param {string} channel
 * @param {string} message
 * @param {Record<string, unknown> | null | undefined} [detail]
 */
export function logRealtimeDiagnostics(channel, message, detail) {
  if (!isRealtimeDiagnosticsEnabled()) return;
  try {
    // eslint-disable-next-line no-console
    console.info(`[lhai][${channel}]`, message, detail ?? "");
  } catch {
    /* ignore */
  }
}

/**
 * @param {{ lifecycle?: string; connected?: boolean; fallback?: boolean; connecting?: boolean; lastError?: string | null; reconnectAttempt?: number }} [st]
 */
function updateDiagnosticBadge(st) {
  const el = document.getElementById(BADGE_ID);
  if (!(el instanceof HTMLElement)) return;
  const life = lifecycleFromStatus(st);
  el.textContent = formatRealtimeLifecycleLabel(life);
  el.dataset.lifecycle = life;
  if (st?.lastError) {
    el.title = `lastError=${st.lastError} reconnect=${st.reconnectAttempt ?? 0}`;
  } else {
    el.removeAttribute("title");
  }
}

/**
 * @param {{ lifecycle?: string; connected?: boolean; fallback?: boolean; connecting?: boolean; lastError?: string | null; reconnectAttempt?: number }} [initialStatus]
 */
export function mountRealtimeDiagnosticBadge(initialStatus) {
  if (typeof document === "undefined" || !isRealtimeDiagnosticsEnabled()) return;
  if (!badgeMounted) {
    badgeMounted = true;
    let el = document.getElementById(BADGE_ID);
    if (!(el instanceof HTMLElement)) {
      el = document.createElement("div");
      el.id = BADGE_ID;
      el.className = "lhai-realtime-diagnostic-badge";
      el.setAttribute("role", "status");
      el.setAttribute("aria-live", "polite");
      document.body.appendChild(el);
    }
    window.addEventListener(WINDOW_STATUS, (ev) => {
      const d = ev?.detail && typeof ev.detail === "object" ? ev.detail : {};
      updateDiagnosticBadge(d);
    });
    logRealtimeDiagnostics("realtime", "diagnostic badge mounted");
  }
  if (initialStatus) updateDiagnosticBadge(initialStatus);
}
