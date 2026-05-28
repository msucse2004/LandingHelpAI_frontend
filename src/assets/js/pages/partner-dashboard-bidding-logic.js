/**
 * Partner bidding dashboard list row rendering (unit-testable).
 */

/** @param {Record<string, unknown>} row */
export function biddingTimeLeftLabel(row) {
  const expired = row.is_expired === true || String(row.request_status || "").toUpperCase() === "EXPIRED";
  if (expired) return "Bidding ended";
  const label = String(row.time_left_label || row.remaining_label || "").trim();
  if (label) return label;
  return "—";
}

/** @param {string} code */
export function partnerListStatusBadgeClass(code) {
  const c = String(code || "").trim().toUpperCase();
  if (c === "SELECTED") return "lhai-par-dash-bid__status--selected";
  if (c === "SUBMITTED") return "lhai-par-dash-bid__status--submitted";
  if (
    c === "ENDED" ||
    c === "EXPIRED" ||
    c === "CLOSED" ||
    c === "CANCELLED" ||
    c === "REJECTED"
  ) {
    return "lhai-par-dash-bid__status--ended";
  }
  if (c === "DRAFT") return "lhai-par-dash-bid__status--draft";
  if (c === "NOT_SUBMITTED") return "lhai-par-dash-bid__status--pending";
  return "lhai-par-dash-bid__status--pending";
}

/**
 * @param {Record<string, unknown>} row
 * @param {string} detailHref
 * @param {(s: string) => string} esc
 */
export function buildBiddingDashboardCardHtml(row, detailHref, esc) {
  const bidRequestId = String(row.bid_request_id || "").trim();
  const service = esc(String(row.service_display || row.service_name || "Bidding request"));
  const customer = esc(String(row.customer_display_name || "—"));
  const location = esc(String(row.customer_location || row.location || "—"));
  const timeLeft = esc(biddingTimeLeftLabel(row));
  const statusCode = String(row.partner_status || row.bid_status || "").trim().toUpperCase();
  const statusLabel = esc(String(row.partner_status_label || row.bid_status || "—"));
  const statusCls = partnerListStatusBadgeClass(statusCode);
  const offersCount = Number(row.my_offers_count);
  const offersLabel =
    Number.isFinite(offersCount) && offersCount > 0
      ? `${offersCount} offer${offersCount === 1 ? "" : "s"}`
      : "No offers yet";
  const rankLabel = String(row.rank_label || "").trim();
  const rankHtml = rankLabel
    ? `<p class="lhai-par-dash-bid__rank"><span class="lhai-badge lhai-badge--rank">${esc(rankLabel)}</span></p>`
    : "";
  const lines = Array.isArray(row.request_summary_lines) ? row.request_summary_lines : [];
  const summaryHtml = lines.length
    ? `<ul class="lhai-par-dash-bid__summary">${lines
        .map((line) => `<li>${esc(String(line))}</li>`)
        .join("")}</ul>`
    : `<p class="lhai-par-dash-bid__summary lhai-par-dash-bid__summary--empty u-text-muted">View request details for full intake.</p>`;
  const newBadge = row.is_new_request
    ? '<span class="lhai-badge lhai-badge--accent">New request</span>'
    : "";
  const unread =
    row.has_unread_customer_message === true || Number(row.unread_count) > 0
      ? '<span class="lhai-badge lhai-badge--warn">Unread message</span>'
      : "";
  const carBadge = row.is_car_purchase === true
    ? '<span class="lhai-badge lhai-badge--vehicle">Vehicle</span>'
    : "";

  return `
    <article class="lhai-par-dash-bid__card" data-bid-request-id="${esc(bidRequestId)}">
      <header class="lhai-par-dash-bid__head">
        <div class="lhai-par-dash-bid__head-main">
          <h3 class="lhai-par-dash-bid__title">${service}</h3>
          <div class="lhai-par-dash-bid__badges">${carBadge}${newBadge}${unread}</div>
        </div>
        <p class="lhai-par-dash-bid__meta">${customer} · ${location}</p>
      </header>
      ${summaryHtml}
      <dl class="lhai-par-dash-bid__facts">
        <div><dt>Time left</dt><dd class="lhai-par-dash-bid__time">${timeLeft}</dd></div>
        <div><dt>Status</dt><dd><span class="lhai-par-dash-bid__status ${statusCls}">${statusLabel}</span></dd></div>
        <div><dt>My offers</dt><dd>${esc(offersLabel)}</dd></div>
      </dl>
      ${rankHtml}
      <div class="lhai-par-dash-bid__actions">
        <a class="lhai-button lhai-button--primary" href="${esc(detailHref)}">View request details</a>
      </div>
    </article>`;
}
