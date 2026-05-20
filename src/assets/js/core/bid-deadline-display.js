/**
 * Bid deadline countdown display (Step 14) — UI only; server validates submit/select.
 */

/** @param {string | null | undefined} iso */
export function parseIsoMs(iso) {
  if (!iso) return null;
  const t = Date.parse(String(iso));
  return Number.isFinite(t) ? t : null;
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

/** @param {string | null | undefined} expiresAtIso @param {number} [nowMs] */
export function isBidDeadlinePassed(expiresAtIso, nowMs = Date.now()) {
  const exp = parseIsoMs(expiresAtIso);
  if (exp == null) return false;
  return nowMs >= exp;
}

/** Prefer server label when API provides it. */
export function formatBidDeadlineForUi(snap, nowMs = Date.now()) {
  if (!snap || typeof snap !== "object") return "—";
  const serverLabel = String(snap.remaining_label || "").trim();
  const exp = snap.expires_at != null ? String(snap.expires_at) : "";
  if (snap.is_expired === true) return "비딩 종료";
  if (serverLabel && serverLabel !== "—") return serverLabel;
  return formatBidDeadlineRemaining(exp, nowMs);
}
