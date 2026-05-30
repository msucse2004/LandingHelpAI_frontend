/**
 * Bid deadline countdown display — server authority; client uses server_now skew.
 */

/** @param {string | null | undefined} iso */
export function parseIsoMs(iso) {
  if (!iso) return null;
  const t = Date.parse(String(iso));
  return Number.isFinite(t) ? t : null;
}

/**
 * @param {Record<string, unknown> | null | undefined} snap
 * @returns {number}
 */
export function resolveServerSkewMs(snap, clientNowMs = Date.now()) {
  if (!snap || typeof snap !== "object") return 0;
  const serverNow = parseIsoMs(snap.server_now);
  if (serverNow == null) return 0;
  return serverNow - clientNowMs;
}

/**
 * @param {Record<string, unknown> | null | undefined} snap
 * @param {number} [clientNowMs]
 * @returns {number | null}
 */
export function remainingSecondsFromDeadline(snap, clientNowMs = Date.now()) {
  if (!snap || typeof snap !== "object") return null;
  if (snap.is_expired === true || snap.bid_request_status === "EXPIRED") return 0;
  const exp = parseIsoMs(snap.expires_at);
  if (exp == null) return null;
  const skew = resolveServerSkewMs(snap, clientNowMs);
  return Math.floor((exp - (clientNowMs + skew)) / 1000);
}

/**
 * @param {string | null | undefined} expiresAtIso
 * @param {number} [nowMs]
 * @returns {string}
 */
export function formatBidDeadlineRemaining(expiresAtIso, nowMs = Date.now()) {
  const exp = parseIsoMs(expiresAtIso);
  if (exp == null) return "—";
  const diffSec = Math.floor((exp - nowMs) / 1000);
  if (diffSec <= 0) return "비딩 종료";
  if (diffSec <= 600) {
    const mins = Math.max(1, Math.ceil(diffSec / 60));
    return `곧 마감됩니다 · ${mins}분 남음`;
  }
  if (diffSec < 3600) {
    const mins = Math.max(1, Math.floor(diffSec / 60));
    return `${mins}분 남음`;
  }
  if (diffSec < 86400) {
    const h = Math.floor(diffSec / 3600);
    const m = Math.floor((diffSec % 3600) / 60);
    return `${h}시간 ${m}분 남음`;
  }
  const d = Math.floor(diffSec / 86400);
  const h = Math.floor((diffSec % 86400) / 3600);
  return `${d}일 ${h}시간 남음`;
}

/** @param {number} diffSec */
function formatDaysHoursRemaining(diffSec) {
  if (diffSec <= 0) return "비딩 종료";
  if (diffSec < 86400) {
    const h = Math.floor(diffSec / 3600);
    const m = Math.floor((diffSec % 3600) / 60);
    return `${h}시간 ${m}분`;
  }
  const d = Math.floor(diffSec / 86400);
  const h = Math.floor((diffSec % 86400) / 3600);
  return `${d}일 ${h}시간`;
}

/** @param {number} diffSec */
function formatCompactHoursMinutes(diffSec) {
  if (diffSec <= 0) return "0m";
  if (diffSec >= 86400) {
    const d = Math.floor(diffSec / 86400);
    const h = Math.floor((diffSec % 86400) / 3600);
    return `${d}d ${h}h`;
  }
  const h = Math.floor(diffSec / 3600);
  const m = Math.floor((diffSec % 3600) / 60);
  if (h <= 0) return `${Math.max(1, m)}m`;
  return `${h}h ${m}m`;
}

/** Prefer server label when API provides it. */
export function formatBidDeadlineForUi(snap, nowMs = Date.now()) {
  if (!snap || typeof snap !== "object") return "—";
  const serverLabel = String(snap.remaining_label || "").trim();
  const exp = snap.expires_at != null ? String(snap.expires_at) : "";
  const skew = resolveServerSkewMs(snap, nowMs);
  const effectiveNow = nowMs + skew;
  if (snap.is_expired === true || snap.bid_request_status === "EXPIRED") return "비딩 종료";
  const rem = remainingSecondsFromDeadline(snap, nowMs);
  if (rem != null && rem <= 0) return "비딩 종료";
  if (serverLabel && serverLabel !== "—") return serverLabel;
  return formatBidDeadlineRemaining(exp, effectiveNow);
}

/**
 * Customer banner: "비딩 마감까지 2일 4시간" / "비딩 종료"
 * @param {Record<string, unknown> | null | undefined} snap
 * @param {number} [nowMs]
 */
export function formatCustomerCountdownBanner(snap, nowMs = Date.now()) {
  if (!snap || typeof snap !== "object") return "—";
  if (snap.is_expired === true || snap.bid_request_status === "EXPIRED") return "비딩 종료";
  const rem = remainingSecondsFromDeadline(snap, nowMs);
  if (rem == null) return "—";
  if (rem <= 0) return "비딩 종료";
  return `비딩 마감까지 ${formatDaysHoursRemaining(rem)}`;
}

/**
 * Partner banner: "제출 마감까지 12h 30m" / "비딩이 종료되었습니다"
 * @param {Record<string, unknown> | null | undefined} snap
 * @param {number} [nowMs]
 */
export function formatPartnerCountdownBanner(snap, nowMs = Date.now()) {
  if (!snap || typeof snap !== "object") return "—";
  if (snap.is_expired === true || snap.bid_request_status === "EXPIRED") return "비딩이 종료되었습니다";
  const rem = remainingSecondsFromDeadline(snap, nowMs);
  if (rem == null) return "—";
  if (rem <= 0) return "비딩이 종료되었습니다";
  return `제출 마감까지 ${formatCompactHoursMinutes(rem)}`;
}

/** @param {string | null | undefined} expiresAtIso @param {number} [nowMs] */
export function isBidDeadlinePassed(expiresAtIso, nowMs = Date.now()) {
  const exp = parseIsoMs(expiresAtIso);
  if (exp == null) return false;
  return nowMs >= exp;
}

/**
 * @param {object} opts
 * @param {() => Record<string, unknown> | null | undefined} opts.getDeadline
 * @param {(text: string, expired: boolean) => void} opts.onTick
 * @param {(snap: Record<string, unknown> | null | undefined) => string} opts.formatBanner
 * @param {number} [opts.intervalMs]
 * @returns {() => void}
 */
export function createBidCountdownTicker({ getDeadline, onTick, formatBanner, intervalMs = 1000 }) {
  let lastText = "";
  let lastExpired = false;
  const tick = () => {
    const snap = getDeadline();
    const rem = remainingSecondsFromDeadline(snap);
    const expired =
      snap?.is_expired === true ||
      snap?.bid_request_status === "EXPIRED" ||
      (rem != null && rem <= 0);
    const text = formatBanner(snap);
    if (text === lastText && expired === lastExpired) return;
    lastText = text;
    lastExpired = expired;
    onTick(text, expired);
  };
  tick();
  const id = window.setInterval(tick, intervalMs);
  return () => window.clearInterval(id);
}

/**
 * Build deadline snapshot from API root or nested bid_request / bid_deadline.
 * @param {Record<string, unknown> | null | undefined} payload
 */
export function normalizeDeadlineSnapshot(payload) {
  if (!payload || typeof payload !== "object") return null;
  const nested =
    payload.bid_deadline && typeof payload.bid_deadline === "object"
      ? payload.bid_deadline
      : payload.bid_request && typeof payload.bid_request === "object"
        ? payload.bid_request
        : null;
  const base = nested && typeof nested === "object" ? /** @type {Record<string, unknown>} */ ({ ...nested }) : {};
  if (payload.expires_at != null) base.expires_at = payload.expires_at;
  if (payload.server_now != null) base.server_now = payload.server_now;
  if (payload.remaining_seconds != null) base.remaining_seconds = payload.remaining_seconds;
  if (payload.remaining_label != null) base.remaining_label = payload.remaining_label;
  if (payload.bid_request_status != null) base.bid_request_status = payload.bid_request_status;
  if (payload.is_expired != null) base.is_expired = payload.is_expired;
  if (payload.status != null && base.bid_request_status == null) base.bid_request_status = payload.status;
  return Object.keys(base).length ? base : null;
}
