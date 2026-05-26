/** @param {unknown} status */
export function canCustomerDecideOnQuote(status) {
  const s = String(status || "").toUpperCase();
  if (s === "ACCEPTED") return false;
  return s === "PROPOSED";
}

/** @param {unknown} userReason */
export function buildRejectTransitionNote(userReason) {
  const reason = String(userReason || "").trim();
  if (!reason) return "Rejected by customer";
  return `Rejected by customer: ${reason}`;
}

/**
 * @param {unknown} quote
 * @param {(quote: unknown) => { mainText: string }} formatQuoteCostDisplay
 * @param {(quote: unknown) => string} heroServiceRequestLabel
 */
export function quoteDecisionModalCostSummary(quote, formatQuoteCostDisplay, heroServiceRequestLabel) {
  const serviceSummary =
    typeof heroServiceRequestLabel === "function" ? heroServiceRequestLabel(quote) : "—";
  const cost = typeof formatQuoteCostDisplay === "function" ? formatQuoteCostDisplay(quote) : null;
  const totalText = cost && cost.mainText ? cost.mainText : "—";
  return { serviceSummary, totalText };
}
