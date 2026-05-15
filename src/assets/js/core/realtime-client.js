/**
 * In-app SSE client: connects to ``GET /api/realtime/events`` and fans out to subscribers + window events.
 * JWT is passed as ``access_token`` query (native EventSource cannot set Authorization header).
 */
import { getAccessToken } from "./auth.js";
import { resolveApiBaseUrl } from "./config.js";

const EVENT_NAMES = ["message.created", "thread.updated", "unread.changed", "thread.read", "heartbeat"];
const WINDOW_REALTIME = "lhai:realtime-event";
const WINDOW_STATUS = "lhai:realtime-status";

const RECONNECT_MS = [1000, 2000, 5000, 10000, 30000];

/** @type {Set<(detail: object) => void>} */
const subscribers = new Set();

/** @type {{ connected: boolean, connecting: boolean, reconnecting: boolean, reconnectAttempt: number, lastError: string | null, stopped: boolean, fallback: boolean }} */
let status = {
  connected: false,
  connecting: false,
  reconnecting: false,
  reconnectAttempt: 0,
  lastError: null,
  stopped: false,
  fallback: false,
};

/** @type {EventSource | null} */
let source = null;
/** @type {ReturnType<typeof setTimeout> | null} */
let reconnectTimer = null;
/** @type {(() => void) | null} */
let visibilityHandler = null;
let errorLogBudget = 0;
let lastErrorLogTs = 0;

/**
 * UI 폴링 정책용 단일 상태.
 * - ``connected``: SSE 열림
 * - ``connecting``: SSE 연결 시도 중
 * - ``fallback``: SSE 실패·재연결 대기 등(짧은 폴링 허용)
 * - ``disconnected``: 중지됨 또는 아직 연결 시도 전·토큰 없음 등
 */
function deriveRealtimeLifecycle() {
  if (status.stopped) return "disconnected";
  if (status.connected) return "connected";
  if (status.connecting) return "connecting";
  if (status.fallback) return "fallback";
  return "disconnected";
}

function debugRealtime() {
  try {
    return (
      window.localStorage?.getItem("LHAI_DEBUG_REALTIME") === "1" ||
      window.localStorage?.getItem("LHAI_DEBUG_LIVE_MESSAGES") === "1"
    );
  } catch {
    return false;
  }
}

function dlog(...args) {
  if (!debugRealtime()) return;
  // eslint-disable-next-line no-console
  console.info("[lhai realtime]", ...args);
}

function shouldLogError() {
  const now = Date.now();
  if (now - lastErrorLogTs > 30_000) {
    errorLogBudget = 3;
    lastErrorLogTs = now;
  }
  if (errorLogBudget <= 0) return false;
  errorLogBudget -= 1;
  return true;
}

function dispatchStatus() {
  const lifecycle = deriveRealtimeLifecycle();
  dlog("realtime-status", {
    lifecycle,
    connected: status.connected,
    connecting: status.connecting,
    fallback: status.fallback,
    stopped: status.stopped,
    lastError: status.lastError,
  });
  window.dispatchEvent(
    new CustomEvent(WINDOW_STATUS, {
      detail: {
        lifecycle,
        connected: status.connected,
        connecting: status.connecting,
        reconnecting: status.reconnecting,
        reconnectAttempt: status.reconnectAttempt,
        lastError: status.lastError,
        stopped: status.stopped,
        fallback: status.fallback,
      },
    }),
  );
}

function buildSseUrl() {
  const base = String(resolveApiBaseUrl() || "").replace(/\/$/, "");
  const path = "/api/realtime/events";
  const token = getAccessToken();
  const tok = token != null && String(token).trim() !== "" ? String(token).trim() : "";
  const qs = tok ? `?${new URLSearchParams({ access_token: tok }).toString()}` : "";
  if (!base) return `${path}${qs}`;
  return `${base}${path}${qs}`;
}

function notifySubscribers(detail) {
  subscribers.forEach((fn) => {
    try {
      fn(detail);
    } catch (e) {
      if (debugRealtime()) console.error("[lhai realtime] subscriber error", e);
    }
  });
}

function wireNamedEvent(name) {
  if (!source) return;
  source.addEventListener(name, (ev) => {
    let data = {};
    try {
      data = ev.data ? JSON.parse(ev.data) : {};
    } catch {
      data = { _raw: ev.data };
    }
    const detail = {
      type: name,
      id: ev.lastEventId || "",
      data,
    };
    dlog("realtime event received", detail.type, detail.id);
    notifySubscribers(detail);
    window.dispatchEvent(new CustomEvent(WINDOW_REALTIME, { detail }));
  });
}

function clearReconnectTimer() {
  if (reconnectTimer != null) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
}

function scheduleReconnect() {
  if (status.stopped) return;
  if (typeof document !== "undefined" && document.hidden) {
    dlog("realtime reconnect deferred (document hidden)");
    return;
  }
  clearReconnectTimer();
  const idx = Math.min(status.reconnectAttempt, RECONNECT_MS.length - 1);
  const delay = RECONNECT_MS[idx];
  status.reconnecting = true;
  status.reconnectAttempt += 1;
  status.connected = false;
  status.fallback = true;
  dispatchStatus();
  dlog("realtime reconnect scheduled", delay, "ms attempt=", status.reconnectAttempt);
  reconnectTimer = window.setTimeout(() => {
    reconnectTimer = null;
    openEventSource();
  }, delay);
}

function openEventSource() {
  if (status.stopped) return;
  const token = getAccessToken();
  if (!token || String(token).trim() === "") {
    status.connecting = false;
    status.connected = false;
    status.fallback = true;
    status.lastError = "no_access_token";
    dispatchStatus();
    return;
  }

  clearReconnectTimer();
  if (source) {
    try {
      source.close();
    } catch {
      /* ignore */
    }
    source = null;
  }

  status.connecting = true;
  status.lastError = null;
  dispatchStatus();

  const url = buildSseUrl();
  dlog("realtime connect start", url.split("?")[0]);

  try {
    source = new EventSource(url);
  } catch (e) {
    status.connecting = false;
    status.connected = false;
    status.fallback = true;
    status.lastError = e && typeof e.message === "string" ? e.message : "EventSource_construct_failed";
    if (shouldLogError()) dlog("realtime error", status.lastError);
    scheduleReconnect();
    return;
  }

  source.onopen = () => {
    status.connected = true;
    status.connecting = false;
    status.reconnecting = false;
    status.reconnectAttempt = 0;
    status.fallback = false;
    status.lastError = null;
    dlog("realtime open");
    dispatchStatus();
  };

  source.onerror = () => {
    status.connected = false;
    status.connecting = false;
    status.fallback = true;
    status.lastError = "eventsource_error";
    if (shouldLogError()) dlog("realtime error", status.lastError);
    try {
      source?.close();
    } catch {
      /* ignore */
    }
    source = null;
    dispatchStatus();
    scheduleReconnect();
  };

  EVENT_NAMES.forEach(wireNamedEvent);
}

function ensureVisibilityWiring() {
  if (typeof document === "undefined") return;
  if (visibilityHandler) return;
  visibilityHandler = () => {
    if (document.visibilityState === "visible" && !status.stopped && getAccessToken()) {
      if (!status.connected && !status.connecting && !reconnectTimer) {
        dlog("realtime visibility visible — retry connect");
        status.reconnectAttempt = Math.max(0, status.reconnectAttempt - 1);
        openEventSource();
      }
    }
  };
  document.addEventListener("visibilitychange", visibilityHandler);
}

/**
 * @param {{ baseUrlOverride?: string }} [options] — reserved; URL comes from ``resolveApiBaseUrl()`` + token query.
 */
export function startRealtimeClient(options = {}) {
  void options;
  if (typeof window === "undefined" || typeof EventSource === "undefined") {
    status.fallback = true;
    status.lastError = "no_eventsource";
    dispatchStatus();
    return;
  }
  if (!getAccessToken()) {
    status.fallback = true;
    dispatchStatus();
    return;
  }
  if (source && (source.readyState === 0 || source.readyState === 1)) {
    dlog("realtime connect skip (already connecting or open)");
    return;
  }
  status.stopped = false;
  ensureVisibilityWiring();
  clearReconnectTimer();
  status.reconnectAttempt = 0;
  openEventSource();
}

export function stopRealtimeClient() {
  status.stopped = true;
  clearReconnectTimer();
  if (source) {
    try {
      source.close();
    } catch {
      /* ignore */
    }
    source = null;
  }
  status.connected = false;
  status.connecting = false;
  status.reconnecting = false;
  status.fallback = true;
  dlog("realtime stopped");
  dispatchStatus();
}

/**
 * @param {(detail: { type: string, id: string, data: object }) => void} handler
 * @returns {() => void} unsubscribe
 */
export function subscribeRealtimeEvents(handler) {
  if (typeof handler !== "function") return () => {};
  subscribers.add(handler);
  return () => {
    subscribers.delete(handler);
  };
}

export function getRealtimeStatus() {
  return { ...status, lifecycle: deriveRealtimeLifecycle() };
}

/** ``getRealtimeStatus().lifecycle`` 과 동일. */
export function getRealtimeLifecycle() {
  return deriveRealtimeLifecycle();
}

/** True when ``LHAI_DEBUG_REALTIME`` or ``LHAI_DEBUG_LIVE_MESSAGES`` is set (for header / toast diagnostics). */
export function realtimeDebugLive() {
  return debugRealtime();
}
