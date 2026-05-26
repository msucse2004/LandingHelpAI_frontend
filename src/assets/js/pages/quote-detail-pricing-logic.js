import { sumServiceUnitPrices } from "./admin-quote-prepare-logic.js";

export const PRICING_AMOUNT_TOLERANCE = 0.02;

export function roundMoney2(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100) / 100;
}

export function amountsDiffer(a, b, tolerance = PRICING_AMOUNT_TOLERANCE) {
  return Math.abs(roundMoney2(a) - roundMoney2(b)) > tolerance;
}

/** @param {unknown} quote */
export function readQuotePricingMeta(quote) {
  const rd = quote?.request_details && typeof quote.request_details === "object" ? quote.request_details : {};
  const qp = rd.quote_pricing && typeof rd.quote_pricing === "object" ? rd.quote_pricing : {};
  const rawPrices = qp.service_unit_prices && typeof qp.service_unit_prices === "object" ? qp.service_unit_prices : {};
  const serviceUnitPrices = {};
  for (const [key, val] of Object.entries(rawPrices)) {
    const id = String(key || "").trim();
    if (!id) continue;
    const n = Number(val);
    if (Number.isFinite(n) && n >= 0) serviceUnitPrices[id] = roundMoney2(n);
  }
  let adminFee = null;
  if (qp.admin_fee != null && qp.admin_fee !== "") {
    const n = Number(qp.admin_fee);
    if (Number.isFinite(n) && n >= 0) adminFee = roundMoney2(n);
  }
  return { serviceUnitPrices, adminFee };
}

/** @param {unknown} quote */
export function getSelectedServicesFromQuote(quote) {
  const rd = quote?.request_details && typeof quote.request_details === "object" ? quote.request_details : {};
  const survey = rd.survey_submission && typeof rd.survey_submission === "object" ? rd.survey_submission : {};
  const services = survey.selected_services;
  return Array.isArray(services) ? services.filter((s) => s && typeof s === "object") : [];
}

/**
 * @param {string} serviceId
 * @param {Record<string, number>} unitPrices
 * @param {Array<Record<string, unknown>> | undefined} items
 */
export function resolveServiceLineAmount(serviceId, unitPrices, items) {
  const sid = String(serviceId || "").trim();
  if (sid && unitPrices[sid] != null) {
    return roundMoney2(Number(unitPrices[sid]) || 0);
  }
  if (Array.isArray(items)) {
    for (const item of items) {
      if (!item || typeof item !== "object") continue;
      if (String(item.service_item_id || "").trim() !== sid) continue;
      const lineTotal = Number(item.line_total);
      if (Number.isFinite(lineTotal) && lineTotal >= 0) return roundMoney2(lineTotal);
      const qty = Number(item.quantity);
      const unit = Number(item.unit_price);
      if (Number.isFinite(qty) && Number.isFinite(unit) && qty > 0 && unit >= 0) {
        return roundMoney2(qty * unit);
      }
    }
  }
  return 0;
}

export function normalizeDeliveryModeKey(mode) {
  const raw = (mode || "general").toString().trim().toLowerCase();
  return ["ai_guide", "in_person", "ai_plus_human", "general"].includes(raw) ? raw : "general";
}

/**
 * 표시용 breakdown (서버 estimated_cost는 변경하지 않음).
 * @param {Record<string, unknown>} quote
 */
export function buildQuotePricingBreakdown(quote) {
  const selectedServices = getSelectedServicesFromQuote(quote);
  const { serviceUnitPrices, adminFee } = readQuotePricingMeta(quote);
  const currency = String(quote?.currency || "USD").trim() || "USD";
  const estimatedTotal = roundMoney2(Number(quote?.estimated_cost) || 0);
  const items = Array.isArray(quote?.items) ? quote.items : [];

  if (!selectedServices.length) {
    return {
      empty: true,
      currency,
      serviceLines: [],
      adjustmentLine: null,
      serviceSubtotal: 0,
      estimatedTotal,
      amountsMatch: true,
      showAdjustmentNote: false,
    };
  }

  const serviceLines = selectedServices.map((service) => {
    const id = String(service.id || "").trim();
    const title = String(service.title || service.id || "Service").trim() || "Service";
    const deliveryModeKey = normalizeDeliveryModeKey(service.delivery_mode);
    return {
      type: "service",
      id,
      title,
      deliveryModeKey,
      amount: resolveServiceLineAmount(id, serviceUnitPrices, items),
    };
  });

  const serviceSubtotal = sumServiceUnitPrices(serviceUnitPrices);
  const delta = roundMoney2(estimatedTotal - serviceSubtotal);
  const hasDelta = amountsDiffer(estimatedTotal, serviceSubtotal);

  /** @type {{ type: string, kind: string, amount: number, matchesAdminFee: boolean } | null} */
  let adjustmentLine = null;
  if (hasDelta) {
    if (delta > 0) {
      const matchesAdminFee = adminFee != null && !amountsDiffer(delta, adminFee);
      adjustmentLine = {
        type: "adjustment",
        kind: "support_fee",
        amount: delta,
        matchesAdminFee,
      };
    } else if (delta < 0) {
      adjustmentLine = {
        type: "adjustment",
        kind: "discount",
        amount: Math.abs(delta),
        matchesAdminFee: false,
      };
    }
  }

  return {
    empty: false,
    currency,
    serviceLines,
    adjustmentLine,
    serviceSubtotal,
    estimatedTotal,
    amountsMatch: !hasDelta,
    showAdjustmentNote: hasDelta,
  };
}
