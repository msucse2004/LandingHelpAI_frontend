import { getEffectiveLanguage } from "../core/preferred-language.js";
import { getSelectedServicesFromQuote, normalizeDeliveryModeKey } from "./quote-detail-pricing-logic.js";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** @param {unknown} value */
export function isCustomerVisibleText(value) {
  const s = String(value ?? "").trim();
  if (!s) return false;
  if (UUID_RE.test(s)) return false;
  if (/^profile::/i.test(s)) return false;
  if (/^survey request:\s*$/i.test(s)) return false;
  return true;
}

/** @param {unknown} quote */
function surveySnapshotFromQuote(quote) {
  const rd = quote?.request_details && typeof quote.request_details === "object" ? quote.request_details : {};
  const survey = rd.survey_submission && typeof rd.survey_submission === "object" ? rd.survey_submission : {};
  return survey;
}

/** @param {unknown} quote */
function requestDetailsRoot(quote) {
  return quote?.request_details && typeof quote.request_details === "object" ? quote.request_details : {};
}

/**
 * @param {unknown} raw
 * @returns {string}
 */
export function formatCustomerFacingDate(raw) {
  const s = String(raw ?? "").trim();
  if (!s) return "";
  const iso = /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : s;
  try {
    const d = new Date(iso);
    if (!Number.isNaN(d.getTime()) && /^\d{4}-\d{2}-\d{2}$/.test(iso)) {
      return new Intl.DateTimeFormat(getEffectiveLanguage(), { dateStyle: "medium" }).format(d);
    }
  } catch {
    /* keep raw */
  }
  return s;
}

/**
 * @param {Record<string, unknown>} common
 * @param {Record<string, unknown>} schedule
 */
export function buildScheduleRegionLine(common, schedule) {
  /** @type {string[]} */
  const parts = [];

  const entry =
    formatCustomerFacingDate(common.entry_date) ||
    formatCustomerFacingDate(schedule.entry_date) ||
    formatCustomerFacingDate(schedule.target_start_date);
  if (entry) parts.push(entry);

  const city = String(common.target_city || schedule.target_city || "").trim();
  const state = String(common.target_state || "").trim();
  const region = [city, state].filter(isCustomerVisibleText).join(", ");
  if (region) parts.push(region);

  if (!parts.length) return "";
  return parts.join(" · ");
}

/**
 * @param {unknown} quote
 * @returns {{
 *   helpAreas: string[],
 *   services: string[],
 *   deliveryModeKeys: string[],
 *   scheduleRegion: string,
 *   understood: Array<{ label: string, value: string }>,
 * }}
 */
export function buildRequestSummaryRows(quote) {
  const survey = surveySnapshotFromQuote(quote);
  const rd = requestDetailsRoot(quote);
  const common =
    survey.common_info && typeof survey.common_info === "object" ? survey.common_info : {};
  const schedule = rd.schedule && typeof rd.schedule === "object" ? rd.schedule : {};

  const cats = Array.isArray(survey.selected_categories) ? survey.selected_categories : [];
  let helpAreas = cats
    .map((c) => String(c.display_title || c.title || "").trim())
    .filter(isCustomerVisibleText);

  if (!helpAreas.length) {
    const sn = String(quote?.display_service_name || quote?.service_name || "").trim();
    if (/^survey request:\s*/i.test(sn)) {
      const rest = sn.replace(/^survey request:\s*/i, "").trim();
      if (isCustomerVisibleText(rest)) helpAreas = [rest];
    }
  }

  const selectedServices = getSelectedServicesFromQuote(quote);
  const services = selectedServices
    .map((s) => String(s.display_title || s.title || "").trim())
    .filter(isCustomerVisibleText);

  const deliverySeen = new Set();
  /** @type {string[]} */
  const deliveryModeKeys = [];
  for (const s of selectedServices) {
    const key = normalizeDeliveryModeKey(s.delivery_mode);
    if (!deliverySeen.has(key)) {
      deliverySeen.add(key);
      deliveryModeKeys.push(key);
    }
  }

  const scheduleRegion = buildScheduleRegionLine(common, schedule);

  const detailed = Array.isArray(survey.detailed_answers) ? survey.detailed_answers : [];
  /** @type {Array<{ label: string, value: string }>} */
  const understood = [];
  for (const a of detailed) {
    if (!a || typeof a !== "object") continue;
    const label = String(a.label || a.field_id || "")
      .replace(/_/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    const rawVal =
      a.answer_json && typeof a.answer_json === "object"
        ? a.answer_json.display ?? a.answer_json.value ?? a.answer_json.text ?? ""
        : a.answer_json;
    const value = String(rawVal ?? "").trim();
    if (!isCustomerVisibleText(label) || !isCustomerVisibleText(value)) continue;
    if (UUID_RE.test(value)) continue;
    understood.push({ label, value: value.length > 160 ? `${value.slice(0, 159)}…` : value });
    if (understood.length >= 8) break;
  }

  return {
    helpAreas,
    services,
    deliveryModeKeys,
    scheduleRegion,
    understood,
  };
}

/** @param {ReturnType<typeof buildRequestSummaryRows>} rows */
export function requestSummaryHasVisibleRows(rows) {
  return Boolean(
    rows.helpAreas.length ||
      rows.services.length ||
      rows.deliveryModeKeys.length ||
      rows.scheduleRegion ||
      rows.understood.length
  );
}
