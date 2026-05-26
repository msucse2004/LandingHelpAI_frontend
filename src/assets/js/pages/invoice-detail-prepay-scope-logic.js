import { getSelectedServicesFromQuote } from "./quote-detail-pricing-logic.js";
import {
  collectServiceTitleText,
  detectQuoteScopeContext,
} from "./quote-detail-scope-logic.js";

/** @type {readonly string[]} */
export const INVOICE_PREPAY_INCLUDED_IDS = [
  "agent_steps",
  "checklist",
  "messages",
  "progress_guidance",
];

/** @type {readonly { id: string, emphasizeWhen: "phone" | "car" | null }[]} */
export const INVOICE_PREPAY_EXCLUDED_ITEMS = [
  { id: "carrier_fees", emphasizeWhen: "phone" },
  { id: "car_purchase_cost", emphasizeWhen: "car" },
  { id: "insurance_tax_registration", emphasizeWhen: "car" },
  { id: "legal_contract", emphasizeWhen: null },
  { id: "account_payment", emphasizeWhen: null },
  { id: "third_party_outcomes", emphasizeWhen: null },
];

/**
 * @param {Record<string, unknown>|null | undefined} quote
 * @param {Record<string, unknown>} [invoice]
 */
export function buildInvoicePrepayScopeContent(quote, invoice = {}) {
  let services = getSelectedServicesFromQuote(quote);
  if (!services.length) {
    const pkg = String(invoice?.service_name || "").trim();
    if (pkg) services = [{ title: pkg }];
  }

  const { hasCar, hasPhone } = detectQuoteScopeContext(services);

  const included = INVOICE_PREPAY_INCLUDED_IDS.map((id) => ({ id }));

  const excluded = INVOICE_PREPAY_EXCLUDED_ITEMS.map((item) => {
    let emphasis = false;
    if (item.emphasizeWhen === "phone" && hasPhone) emphasis = true;
    if (item.emphasizeWhen === "car" && hasCar) emphasis = true;
    return { id: item.id, emphasis };
  });

  return {
    included,
    excluded,
    context: { hasCar, hasPhone },
    serviceText: collectServiceTitleText(services),
  };
}
