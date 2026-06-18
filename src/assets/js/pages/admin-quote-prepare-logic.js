function formatMoney(amount, currency = "USD") {
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency }).format(amount);
  } catch {
    return `${amount} ${currency}`;
  }
}

export const DEFAULT_ADMIN_FEE_RATE = 0.04;
export const ADMIN_FEE_LINE_TITLE = "Admin Fee";

export const QUOTE_STATUS_LABELS = {
  DRAFT: "초안",
  PROPOSED: "고객 검토 중",
  ACCEPTED: "고객 수락",
  REJECTED: "고객 거절",
  PAID: "결제 완료",
};

export const PROPOSE_TRANSITION_REASON = "Proposed by admin panel";
export const PROPOSE_TRANSITION_STATUS = "PROPOSED";

export function normalizeQuoteStatus(status) {
  return String(status || "").trim().toUpperCase();
}

export function formatQuoteStatusLabel(status) {
  const key = normalizeQuoteStatus(status);
  return QUOTE_STATUS_LABELS[key] || key || "—";
}

export function getQuoteStatusBadgeModifier(status) {
  const key = normalizeQuoteStatus(status);
  if (key === "DRAFT") return "draft";
  if (key === "PROPOSED") return "proposed";
  if (key === "ACCEPTED") return "accepted";
  if (key === "REJECTED") return "rejected";
  if (key === "PAID") return "paid";
  return "other";
}

export function getQuoteReadonlyWarnMessage(status) {
  const key = normalizeQuoteStatus(status);
  const base =
    "이 견적은 고객에게 이미 전달되었거나 초안 상태가 아니므로 이 화면에서 수정할 수 없습니다.";
  if (key === "PROPOSED") {
    return `${base} 현재 고객이 견적을 검토 중입니다.`;
  }
  if (key === "ACCEPTED") {
    return `${base} 고객이 견적을 수락했습니다. 다음 단계는 견적 목록에서 확인하세요.`;
  }
  if (key === "REJECTED") {
    return `${base} 고객이 견적을 거절했습니다. 필요하면 견적 목록에서 후속 조치를 확인하세요.`;
  }
  if (key === "PAID") {
    return `${base} 결제가 완료된 견적입니다.`;
  }
  if (key && key !== "DRAFT") {
    const label = formatQuoteStatusLabel(status);
    return label !== key ? `${base} (상태: ${label})` : base;
  }
  return "";
}

export function isQuoteDraft(quote) {
  return normalizeQuoteStatus(quote?.status) === "DRAFT";
}

/** @param {Record<string, number>} unitPriceMap */
export function sumServiceUnitPrices(unitPriceMap) {
  const vals = Object.values(unitPriceMap || {});
  const sum = vals.reduce((s, v) => s + Number(v || 0), 0);
  return Math.round(sum * 100) / 100;
}

/** @param {Record<string, unknown>} unitPriceMap */
export function flattenUnitPriceMap(unitPriceMap) {
  if (!unitPriceMap || typeof unitPriceMap !== "object") return {};
  const out = {};
  for (const [key, val] of Object.entries(unitPriceMap)) {
    const id = String(key || "").trim();
    if (!id) continue;
    let n;
    if (val && typeof val === "object" && "amount" in val) {
      n = Number(val.amount);
    } else {
      n = Number(val);
    }
    if (Number.isFinite(n) && n >= 0) out[id] = Math.round(n * 100) / 100;
  }
  return out;
}

export function computeDefaultAdminFee(unitPriceMap) {
  const services = sumServiceUnitPrices(flattenUnitPriceMap(unitPriceMap));
  return Math.round(services * DEFAULT_ADMIN_FEE_RATE * 100) / 100;
}

export function readQuotePricingUnitPrices(quote) {
  const rd = quote?.request_details && typeof quote.request_details === "object" ? quote.request_details : {};
  const qp = rd.quote_pricing && typeof rd.quote_pricing === "object" ? rd.quote_pricing : {};
  const raw = qp.service_unit_prices && typeof qp.service_unit_prices === "object" ? qp.service_unit_prices : {};
  const out = {};
  for (const [key, val] of Object.entries(raw)) {
    const id = String(key || "").trim();
    if (!id) continue;
    const n = Number(val);
    if (Number.isFinite(n) && n >= 0) out[id] = Math.round(n * 100) / 100;
  }
  return out;
}

export function normalizeAdminFee(value, defaultFee = 0) {
  if (value == null || value === "") {
    return Math.round(Math.max(0, Number(defaultFee) || 0) * 100) / 100;
  }
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) {
    return Math.round(Math.max(0, Number(defaultFee) || 0) * 100) / 100;
  }
  return Math.round(n * 100) / 100;
}

export function resolveAdminFeeForEditor(adminFee, unitPriceMap) {
  const defaultFee = computeDefaultAdminFee(unitPriceMap);
  return normalizeAdminFee(adminFee, defaultFee);
}

export function readAdminFeeFromQuote(quote, unitPriceMap = null) {
  const rd = quote?.request_details && typeof quote.request_details === "object" ? quote.request_details : {};
  const qp = rd.quote_pricing && typeof rd.quote_pricing === "object" ? rd.quote_pricing : {};
  const flattened = flattenUnitPriceMap(unitPriceMap);
  const prices =
    unitPriceMap && typeof unitPriceMap === "object" && Object.keys(flattened).length
      ? flattened
      : readQuotePricingUnitPrices(quote);
  if (qp.admin_fee != null) {
    return normalizeAdminFee(qp.admin_fee, 0);
  }
  return computeDefaultAdminFee(prices);
}

export function computeQuoteTotal(unitPriceMap, adminFee) {
  const services = sumServiceUnitPrices(unitPriceMap);
  const fee = normalizeAdminFee(adminFee, 0);
  return Math.round((services + fee) * 100) / 100;
}

export function validateProposeFields(serviceName, quoteTotalSum) {
  const trimmedName = String(serviceName || "").trim();
  const numericSum = Number(quoteTotalSum);
  const clientErrors = [];
  if (!trimmedName) clientErrors.push("서비스/패키지 표시명");
  if (!(numericSum > 0)) clientErrors.push("견적 총액(서비스 + Admin Fee, 0 초과)");
  return {
    serviceName: trimmedName,
    lineSum: Number.isFinite(numericSum) ? numericSum : 0,
    clientErrors,
  };
}

export function shouldOpenProposeConfirmModal(clientErrors) {
  return Array.isArray(clientErrors) && clientErrors.length === 0;
}

/**
 * @param {{
 *   serviceName?: string,
 *   unitPriceMap?: Record<string, number>,
 *   adminFee?: number,
 *   customerNote?: string,
 *   internalNotes?: string,
 * }} editor
 */
export function buildQuoteEditorPayloadFromEditor(editor) {
  const unitPriceMap = editor?.unitPriceMap && typeof editor.unitPriceMap === "object" ? editor.unitPriceMap : {};
  const adminFee = resolveAdminFeeForEditor(editor?.adminFee, unitPriceMap);
  return {
    service_name: String(editor?.serviceName || "").trim(),
    estimated_cost: computeQuoteTotal(unitPriceMap, adminFee),
    service_unit_prices: unitPriceMap,
    admin_fee: adminFee,
    internal_notes: editor?.internalNotes || "",
    customer_facing_note: editor?.customerNote || "",
  };
}

export function customerDisplayNameFromQuote(quote) {
  const rd = quote?.request_details && typeof quote.request_details === "object" ? quote.request_details : {};
  const survey = rd.survey_submission && typeof rd.survey_submission === "object" ? rd.survey_submission : {};
  const common = survey.common_info && typeof survey.common_info === "object" ? survey.common_info : {};
  return [common.profile_first_name, common.profile_last_name].filter(Boolean).join(" ").trim();
}

/**
 * @param {{
 *   quote: Record<string, unknown>,
 *   selectedServices?: Array<Record<string, unknown>>,
 *   unitPriceMap?: Record<string, number>,
 *   adminFee?: number,
 *   customerNote?: string,
 * }} input
 */
export function buildCustomerPreviewStateFromEditor(input) {
  const quote = input?.quote && typeof input.quote === "object" ? input.quote : {};
  const selectedServices = Array.isArray(input?.selectedServices) ? input.selectedServices : [];
  const unitPriceMap = input?.unitPriceMap && typeof input.unitPriceMap === "object" ? input.unitPriceMap : {};
  const adminFee = resolveAdminFeeForEditor(input?.adminFee, unitPriceMap);
  const noteRaw = String(input?.customerNote || "").trim();
  const name = customerDisplayNameFromQuote(quote);
  const subtitle = name ? `${name}님을 위한 Landing Help AI 견적서` : "고객님을 위한 Landing Help AI 견적서";
  const items = selectedServices
    .filter((s) => s && typeof s === "object")
    .map((s) => {
      const sid = String(s.id || "").trim();
      const amount = Number(unitPriceMap[sid] ?? 0);
      return {
        title: String(s.title || s.id || "서비스").trim(),
        priceText: formatMoney(Math.round(amount * 100) / 100, "USD"),
      };
    });
  if (adminFee > 0) {
    items.push({
      title: ADMIN_FEE_LINE_TITLE,
      priceText: formatMoney(adminFee, "USD"),
    });
  }
  const total = computeQuoteTotal(unitPriceMap, adminFee);
  return {
    subtitle,
    items,
    totalText: formatMoney(total, "USD"),
    note: noteRaw,
    noteEmpty: !noteRaw,
  };
}

export function hasSurveySubmission(quote) {
  const rd = quote?.request_details && typeof quote.request_details === "object" ? quote.request_details : {};
  const survey = rd.survey_submission;
  return !!(survey && typeof survey === "object");
}

export function getSelectedServicesFromQuote(quote) {
  const rd = quote?.request_details && typeof quote.request_details === "object" ? quote.request_details : {};
  const survey = rd.survey_submission;
  if (!survey || typeof survey !== "object") return [];
  const services = survey.selected_services;
  return Array.isArray(services) ? services : [];
}

export function getReadonlyEditorPolicy(status) {
  const isDraft = normalizeQuoteStatus(status) === "DRAFT";
  return {
    isDraft,
    disableInputs: !isDraft,
    disableButtons: !isDraft,
    showWarning: !isDraft,
    warningMessage: getQuoteReadonlyWarnMessage(status),
    proposeLinkEnabled: true,
  };
}

/**
 * @param {{
 *   qid: string,
 *   buildPayload: () => Record<string, unknown>,
 *   quoteApi: {
 *     update: (id: string, payload: Record<string, unknown>) => Promise<unknown>,
 *     transition: (id: string, status: string, reason: string) => Promise<unknown>,
 *     getDetail: (id: string) => Promise<unknown>,
 *   },
 * }} args
 */
export async function proposeQuoteToCustomer({ qid, buildPayload, quoteApi }) {
  await quoteApi.update(qid, buildPayload());
  await quoteApi.transition(qid, PROPOSE_TRANSITION_STATUS, PROPOSE_TRANSITION_REASON);
  return quoteApi.getDetail(qid);
}
