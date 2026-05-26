/**
 * 고객 청구서: API status → UX 그룹·CTA (백엔드 status 값 변경 없음).
 */

export const INVOICE_UX_GROUP = {
  PENDING_PAYMENT: "pending_payment",
  PAID: "paid",
  UNPAYABLE: "unpayable",
  UNKNOWN: "unknown",
};

/** @type {ReadonlySet<string>} */
const PAYABLE_STATUSES = new Set(["SENT", "PENDING", "FAILED"]);

/** @type {ReadonlySet<string>} */
const UNPAYABLE_STATUSES = new Set(["PAID", "CANCELED", "DRAFT", "VOID", "EXPIRED"]);

/**
 * @param {unknown} status
 * @returns {string}
 */
export function normalizeInvoiceStatus(status) {
  const u = String(status ?? "").trim().toUpperCase();
  if (u === "CANCELLED") return "CANCELED";
  return u;
}

/**
 * @param {unknown} status
 * @returns {typeof INVOICE_UX_GROUP[keyof typeof INVOICE_UX_GROUP]}
 */
export function resolveInvoiceUxGroup(status) {
  const st = normalizeInvoiceStatus(status);
  if (!st) return INVOICE_UX_GROUP.UNKNOWN;
  if (st === "PAID") return INVOICE_UX_GROUP.PAID;
  if (PAYABLE_STATUSES.has(st)) return INVOICE_UX_GROUP.PENDING_PAYMENT;
  if (UNPAYABLE_STATUSES.has(st)) return INVOICE_UX_GROUP.UNPAYABLE;
  return INVOICE_UX_GROUP.UNKNOWN;
}

/**
 * @param {Record<string, unknown>|null|undefined} invoice
 */
export function getInvoiceActionState(invoice) {
  const rawStatus = String(invoice?.status ?? "").trim();
  const status = normalizeInvoiceStatus(rawStatus);
  const group = resolveInvoiceUxGroup(status);

  const isPendingPayment = group === INVOICE_UX_GROUP.PENDING_PAYMENT;
  const isPaid = group === INVOICE_UX_GROUP.PAID;
  const isUnpayable = group === INVOICE_UX_GROUP.UNPAYABLE;
  const isUnknown = group === INVOICE_UX_GROUP.UNKNOWN;

  return {
    rawStatus,
    status,
    group,
    canPay: isPendingPayment,
    showPay: isPendingPayment,
    showAsk: !isPaid,
    showMessages: isPaid,
    isPendingPayment,
    isPaid,
    isUnpayable,
    isUnknown,
  };
}

/**
 * i18n 키 (locale `customer.invoice.status.*`)
 * @param {unknown} status
 * @returns {string}
 */
export function customerInvoiceStatusLabelKey(status) {
  const st = normalizeInvoiceStatus(status);
  if (!st) return "customer.invoice.status._fallback";
  return `customer.invoice.status.${st}`;
}
