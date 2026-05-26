import { buildInvoiceServiceRows } from "./invoice-detail-services-logic.js";
import { roundMoney2 } from "./quote-detail-pricing-logic.js";

export const AMOUNT_SUMMARY_TOLERANCE = 0.02;

/** @param {number} a @param {number} b */
export function amountsClose(a, b, tolerance = AMOUNT_SUMMARY_TOLERANCE) {
  return Math.abs(roundMoney2(a) - roundMoney2(b)) <= tolerance;
}

/**
 * billing_summary / client summary — 금액은 변경하지 않고 표시 행만 구성.
 *
 * @param {Record<string, unknown>} invoice
 * @param {Record<string, unknown>|null | undefined} quote
 * @param {{
 *   currency: string,
 *   base_service_amount: number,
 *   add_ons_amount: number,
 *   discounts_amount: number,
 *   admin_fee_amount: number,
 *   surcharges_amount: number,
 *   taxes_and_fees_amount: number,
 *   subtotal_excluding_tax: number,
 *   invoice_total: number,
 *   amount_already_paid: number,
 *   current_payable_amount: number,
 *   reconciliation_note: string,
 * }} billingSummary
 */
export function buildInvoiceAmountSummaryDisplay(invoice, quote, billingSummary) {
  const sum = billingSummary;
  const st = String(invoice?.status || "").toUpperCase();
  const built = buildInvoiceServiceRows(invoice, quote);

  /** @type {Array<{ label: string, amount: number, rowClass: string, negative?: boolean }>} */
  const bodyRows = [];
  let serviceSubtotal = 0;

  for (const row of built.rows) {
    const amount = roundMoney2(row.amount);
    if (row.type === "admin_fee") {
      bodyRows.push({
        label: "__admin_fee__",
        amount,
        rowClass: "lhai-invoice-amount-summary__row--line",
      });
      continue;
    }
    serviceSubtotal = roundMoney2(serviceSubtotal + amount);
    const negative = amount < -AMOUNT_SUMMARY_TOLERANCE;
    bodyRows.push({
      label: row.title,
      amount: negative ? Math.abs(amount) : amount,
      rowClass: negative
        ? "lhai-invoice-amount-summary__row--discount"
        : "lhai-invoice-amount-summary__row--line",
      negative,
    });
  }

  if (!bodyRows.length) {
    const pkg = String(invoice?.service_name || "").trim();
    const svcAmt = roundMoney2((sum.base_service_amount || 0) + (sum.add_ons_amount || 0));
    if (pkg) {
      const negative = svcAmt < -AMOUNT_SUMMARY_TOLERANCE;
      bodyRows.push({
        label: pkg,
        amount: negative ? Math.abs(svcAmt) : svcAmt,
        rowClass: negative
          ? "lhai-invoice-amount-summary__row--discount"
          : "lhai-invoice-amount-summary__row--line",
        negative,
      });
      serviceSubtotal = negative ? 0 : svcAmt;
    }
    if (sum.admin_fee_amount > 0.005) {
      bodyRows.push({
        label: "__admin_fee__",
        amount: roundMoney2(sum.admin_fee_amount),
        rowClass: "lhai-invoice-amount-summary__row--line",
      });
    }
  }

  const serviceLineCount = bodyRows.filter((r) => r.label !== "__admin_fee__").length;
  const showServiceSubtotal = serviceLineCount >= 2;

  const invoiceTotal = roundMoney2(sum.invoice_total);
  const payable = roundMoney2(sum.current_payable_amount);
  const paid = roundMoney2(sum.amount_already_paid);
  const tax = roundMoney2(sum.taxes_and_fees_amount);
  const discount = roundMoney2(sum.discounts_amount);
  const surcharge = roundMoney2(sum.surcharges_amount);

  const samePayableAsTotal =
    amountsClose(invoiceTotal, payable) && paid <= AMOUNT_SUMMARY_TOLERANCE && st !== "PAID";
  const showSplitTotals =
    !samePayableAsTotal &&
    (paid > AMOUNT_SUMMARY_TOLERANCE || !amountsClose(invoiceTotal, payable));

  /** @type {Array<{ labelKey: string, amount: number, rowClass: string, negative?: boolean, emphasize?: boolean }>} */
  const footRows = [];

  if (showServiceSubtotal) {
    footRows.push({
      labelKey: "service_subtotal",
      amount: serviceSubtotal,
      rowClass: "lhai-invoice-amount-summary__row--subtotal",
    });
  }

  footRows.push({
    labelKey: "tax_and_fees",
    amount: tax,
    rowClass: "lhai-invoice-amount-summary__row--tax",
  });

  if (discount > AMOUNT_SUMMARY_TOLERANCE) {
    footRows.push({
      labelKey: "discount",
      amount: discount,
      negative: true,
      rowClass: "lhai-invoice-amount-summary__row--discount",
    });
  }

  if (surcharge > AMOUNT_SUMMARY_TOLERANCE) {
    footRows.push({
      labelKey: "surcharge",
      amount: surcharge,
      rowClass: "lhai-invoice-amount-summary__row--surcharge",
    });
  }

  if (showSplitTotals) {
    footRows.push({
      labelKey: "invoice_total",
      amount: invoiceTotal,
      rowClass: "lhai-invoice-amount-summary__row--total",
    });
    if (paid > AMOUNT_SUMMARY_TOLERANCE) {
      footRows.push({
        labelKey: "amount_paid",
        amount: paid,
        rowClass: "lhai-invoice-amount-summary__row--paid",
      });
    }
  }

  const payableLabelKey = st === "PAID" ? "balance_remaining" : "current_payable";
  footRows.push({
    labelKey: payableLabelKey,
    amount: payable,
    rowClass: "lhai-invoice-amount-summary__row--payable lhai-invoice-amount-summary__row--final",
    emphasize: true,
  });

  return {
    currency: sum.currency,
    bodyRows,
    footRows,
    samePayableAsTotal,
    footnote: String(sum.reconciliation_note || "").trim() || null,
    showSurchargeHint: surcharge > AMOUNT_SUMMARY_TOLERANCE,
  };
}
