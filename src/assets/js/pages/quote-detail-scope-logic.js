import { getSelectedServicesFromQuote } from "./quote-detail-pricing-logic.js";

const CAR_KEYWORD_RE =
  /(?:자동차|차량|차\s*구|구입\s*조|car|auto|vehicle|automobile|used\s*car|new\s*car|차량\s*구)/i;
const PHONE_KEYWORD_RE =
  /(?:전화|휴대|phone|mobile|cell|통신|번호\s*개|개통|sim|carrier|wireless|telco)/i;

/** @param {Array<Record<string, unknown>>} services */
export function collectServiceTitleText(services) {
  return services
    .map((s) => String(s?.title || s?.id || "").trim())
    .filter(Boolean)
    .join(" ");
}

/** @param {Array<Record<string, unknown>>} services */
export function detectQuoteScopeContext(services) {
  const blob = collectServiceTitleText(services);
  if (!blob) {
    return { hasCar: false, hasPhone: false };
  }
  return {
    hasCar: CAR_KEYWORD_RE.test(blob),
    hasPhone: PHONE_KEYWORD_RE.test(blob),
  };
}

const INCLUDED_BASE = [
  "agent_steps",
  "checklist",
  "next_steps",
  "messages",
  "info_organization",
];

const EXCLUDED_BASE = ["legal_contract", "account_payment", "third_party_outcomes"];

const EXCLUDED_CAR = ["car_purchase_cost", "insurance_tax_registration"];

const EXCLUDED_PHONE = ["carrier_fees"];

/**
 * @param {{ hasCar?: boolean, hasPhone?: boolean }} context
 * @returns {{ included: Array<{ id: string }>, excluded: Array<{ id: string, emphasis?: boolean }>, context: { hasCar: boolean, hasPhone: boolean } }}
 */
export function buildQuoteScopeContent(context = {}) {
  const hasCar = Boolean(context.hasCar);
  const hasPhone = Boolean(context.hasPhone);

  const included = INCLUDED_BASE.map((id) => ({ id }));

  /** @type {Array<{ id: string, emphasis?: boolean }>} */
  const excluded = EXCLUDED_BASE.map((id) => ({ id }));

  if (hasPhone) {
    for (const id of EXCLUDED_PHONE) {
      excluded.push({ id, emphasis: true });
    }
  }
  if (hasCar) {
    for (const id of EXCLUDED_CAR) {
      excluded.push({ id, emphasis: true });
    }
  }

  if (!hasCar && !hasPhone) {
    excluded.push({ id: "third_party_fees_general" });
  }

  return {
    included,
    excluded,
    context: { hasCar, hasPhone },
  };
}

/** @param {Record<string, unknown>} quote */
export function buildQuoteScopeContentFromQuote(quote) {
  const services = getSelectedServicesFromQuote(quote);
  const context = detectQuoteScopeContext(services);
  return buildQuoteScopeContent(context);
}
