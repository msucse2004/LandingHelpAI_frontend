/**
 * Bid deadline countdown display — server authority; client uses server_now skew.
 */

import { getEffectiveLanguage } from "./preferred-language.js";

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

/** @param {(key: string, fallback: string) => string} [translate] */
function resolveTranslate(translate) {
  return typeof translate === "function" ? translate : (_key, fallback) => fallback;
}

/** @param {(key: string, fallback: string) => string} [translate] @param {string} [locale] */
function resolveViewerLocale(translate, locale) {
  const explicit = String(locale || "").trim();
  if (explicit) return explicit.toLowerCase().startsWith("ko") ? "ko" : "en";
  return getEffectiveLanguage() === "ko" ? "ko" : "en";
}

/**
 * @param {number} diffSec
 * @param {"en" | "ko"} locale
 */
function formatDaysHoursForCustomerBanner(diffSec, locale) {
  if (diffSec <= 0) return "";
  if (diffSec < 86400) {
    const h = Math.floor(diffSec / 3600);
    const m = Math.floor((diffSec % 3600) / 60);
    if (locale === "ko") return `${h}시간 ${m}분`;
    return `${h} hr ${m} min`;
  }
  const d = Math.floor(diffSec / 86400);
  const h = Math.floor((diffSec % 86400) / 3600);
  if (locale === "ko") return `${d}일 ${h}시간`;
  const dayWord = d === 1 ? "day" : "days";
  return `${d} ${dayWord} ${h} hr`;
}

/**
 * @param {number} diffSec
 * @param {(key: string, fallback: string) => string} [translate]
 * @param {string} [locale]
 */
export function formatBidDeadlineRemainingFromSeconds(diffSec, translate = null, locale = null) {
  const tr = resolveTranslate(translate);
  const loc = resolveViewerLocale(translate, locale);
  const endedText = tr("customer.bid_results.deadline.ended", "Bidding ended");
  if (diffSec <= 0) return endedText;
  if (diffSec <= 600) {
    const mins = Math.max(1, Math.ceil(diffSec / 60));
    const template = tr(
      "customer.bid_results.deadline.closing_soon",
      "Closing soon · {mins} min left",
    );
    return template.replace(/\{mins\}/g, String(mins));
  }
  if (diffSec < 3600) {
    const mins = Math.max(1, Math.floor(diffSec / 60));
    return loc === "ko" ? `${mins}분 남음` : `${mins} min left`;
  }
  if (diffSec < 86400) {
    const h = Math.floor(diffSec / 3600);
    const m = Math.floor((diffSec % 3600) / 60);
    return loc === "ko" ? `${h}시간 ${m}분 남음` : `${h} hr ${m} min left`;
  }
  const d = Math.floor(diffSec / 86400);
  const h = Math.floor((diffSec % 86400) / 3600);
  if (loc === "ko") return `${d}일 ${h}시간 남음`;
  const dayWord = d === 1 ? "day" : "days";
  return `${d} ${dayWord} ${h} hr left`;
}

/**
 * @param {string | null | undefined} expiresAtIso
 * @param {number} [nowMs]
 * @param {(key: string, fallback: string) => string} [translate]
 * @param {string} [locale]
 */
export function formatBidDeadlineRemaining(expiresAtIso, nowMs = Date.now(), translate = null, locale = null) {
  const exp = parseIsoMs(expiresAtIso);
  if (exp == null) return "—";
  const diffSec = Math.floor((exp - nowMs) / 1000);
  return formatBidDeadlineRemainingFromSeconds(diffSec, translate, locale);
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
export function formatBidDeadlineForUi(snap, nowMs = Date.now(), translate = null, locale = null) {
  const tr = resolveTranslate(translate);
  const endedText = tr("customer.bid_results.deadline.ended", "Bidding ended");
  if (!snap || typeof snap !== "object") return "—";
  const serverLabel = String(snap.remaining_label || "").trim();
  const exp = snap.expires_at != null ? String(snap.expires_at) : "";
  const skew = resolveServerSkewMs(snap, nowMs);
  const effectiveNow = nowMs + skew;
  if (snap.is_expired === true || snap.bid_request_status === "EXPIRED") return endedText;
  const rem = remainingSecondsFromDeadline(snap, nowMs);
  if (rem != null && rem <= 0) return endedText;
  if (serverLabel && serverLabel !== "—") return serverLabel;
  return formatBidDeadlineRemaining(exp, effectiveNow, translate, locale);
}

/**
 * Customer banner: "Bidding deadline: 2 days 4 hr" / "Bidding ended"
 * @param {Record<string, unknown> | null | undefined} snap
 * @param {number} [nowMs]
 * @param {(key: string, fallback: string) => string} [translate]
 * @param {string} [locale]
 */
export function formatCustomerCountdownBanner(snap, nowMs = Date.now(), translate = null, locale = null) {
  const tr = resolveTranslate(translate);
  const endedText = tr("customer.bid_results.deadline.ended", "Bidding ended");
  if (!snap || typeof snap !== "object") return "—";
  if (snap.is_expired === true || snap.bid_request_status === "EXPIRED") return endedText;
  const rem = remainingSecondsFromDeadline(snap, nowMs);
  if (rem == null) return "—";
  if (rem <= 0) return endedText;
  const loc = resolveViewerLocale(translate, locale);
  const time = formatDaysHoursForCustomerBanner(rem, loc);
  const template = tr("customer.bid_results.deadline.banner", "Bidding deadline: {time}");
  return template.replace(/\{time\}/g, time);
}

/**
 * Partner banner: i18n via partner.bid.deadline.* keys.
 * @param {Record<string, unknown> | null | undefined} snap
 * @param {number} [nowMs]
 * @param {(key: string, fallback: string) => string} [translate]
 */
export function formatPartnerCountdownBanner(snap, nowMs = Date.now(), translate = null) {
  const tr = typeof translate === "function" ? translate : (_key, fallback) => fallback;
  const endedText = tr("partner.bid.deadline.ended", "Bidding ended");
  if (!snap || typeof snap !== "object") return "—";
  if (snap.is_expired === true || snap.bid_request_status === "EXPIRED") return endedText;
  const rem = remainingSecondsFromDeadline(snap, nowMs);
  if (rem == null) return "—";
  if (rem <= 0) return endedText;
  const time = formatCompactHoursMinutes(rem);
  const template = tr("partner.bid.deadline.banner", "Submission deadline: {time}");
  return template.replace(/\{time\}/g, time);
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
