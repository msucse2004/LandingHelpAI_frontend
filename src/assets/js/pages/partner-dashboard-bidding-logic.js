/**
 * Partner bidding dashboard list row rendering (unit-testable).
 */

/** @param {(key: string, fallback: string) => string | null} [translate] */
function tr(translate, key, fallback) {
  return typeof translate === "function" ? translate(key, fallback) : fallback;
}

/** @param {unknown} raw */
function normalizePartnerDisplayStatus(raw) {
  return String(raw ?? "")
    .trim()
    .toLowerCase()
    .replace(/-/g, "_");
}

/** @param {Record<string, unknown> | null | undefined} row */
function partnerServiceTitleCrossLocale(row) {
  const src = String(row?.service_name_source_locale ?? row?.source_locale ?? "")
    .trim()
    .toLowerCase();
  const disp = String(row?.service_name_display_locale ?? row?.display_locale ?? "")
    .trim()
    .toLowerCase();
  return Boolean(src && disp && src !== disp);
}

/**
 * Viewer-locale service title for partner dashboard rows.
 * Prefers ``display_service_name``; never shows raw audit ``service_name`` cross-locale.
 * @param {Record<string, unknown> | null | undefined} row
 * @param {(key: string, fallback: string) => string} [translate]
 * @returns {string}
 */
export function partnerDashboardServiceDisplayName(row, translate = null) {
  const display = String(row?.display_service_name ?? row?.display_name ?? "").trim();
  if (display) return display;

  const preparing = tr(
    translate,
    "messages.translation.preparing_title",
    "Preparing title translation...",
  );

  const status = normalizePartnerDisplayStatus(
    row?.service_name_status ?? row?.display_name_status,
  );
  if (status === "translation_required_failed") {
    return preparing;
  }

  if (partnerServiceTitleCrossLocale(row)) {
    return preparing;
  }

  const audit = String(row?.service_name ?? row?.name ?? "").trim();
  if (audit) {
    return audit;
  }

  if (row?.is_car_purchase === true) {
    return tr(translate, "partner.dashboard.bidding.vehicle_purchase", "Vehicle purchase");
  }
  return tr(translate, "partner.dashboard.bidding.bidding_request", "Bidding request");
}

/**
 * Backend-localized summary lines for partner dashboard cards (no client translation).
 * @param {Record<string, unknown> | null | undefined} row
 * @returns {string[]}
 */
export function partnerDashboardRequestSummaryLines(row) {
  const lines = Array.isArray(row?.request_summary_lines) ? row.request_summary_lines : [];
  return lines.map((line) => String(line ?? "").trim()).filter(Boolean);
}

/** @param {Record<string, unknown>} row @param {(key: string, fallback: string) => string} [translate] */
export function biddingTimeLeftLabel(row, translate = null) {
  const expired = row.is_expired === true || String(row.request_status || "").toUpperCase() === "EXPIRED";
  if (expired) return tr(translate, "partner.dashboard.bidding.time_left_ended", "Bidding ended");
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
 * @param {(key: string, fallback: string) => string} [translate]
 */
export function buildBiddingDashboardCardHtml(row, detailHref, esc, translate = null) {
  const bidRequestId = String(row.bid_request_id || "").trim();
  const service = esc(partnerDashboardServiceDisplayName(row, translate));
  const customer = esc(String(row.customer_display_name || "—"));
  const location = esc(String(row.customer_location || row.location || "—"));
  const timeLeft = esc(biddingTimeLeftLabel(row, translate));
  const statusCode = String(row.partner_status || row.bid_status || "").trim().toUpperCase();
  const statusLabel = esc(String(row.partner_status_label || row.bid_status || "—"));
  const statusCls = partnerListStatusBadgeClass(statusCode);
  const offersCount = Number(row.my_offers_count);
  const offersLabel =
    Number.isFinite(offersCount) && offersCount > 0
      ? offersCount === 1
        ? tr(translate, "partner.dashboard.bidding.offers_count_one", "1 offer")
        : tr(translate, "partner.dashboard.bidding.offers_count", "{count} offers").replace(
            "{count}",
            String(offersCount),
          )
      : tr(translate, "partner.dashboard.bidding.no_offers", "No offers yet");
  const rankLabel = String(row.rank_label || "").trim();
  const rankHtml = rankLabel
    ? `<p class="lhai-par-dash-bid__rank"><span class="lhai-badge lhai-badge--rank">${esc(rankLabel)}</span></p>`
    : "";
  const lines = partnerDashboardRequestSummaryLines(row);
  const summaryHtml = lines.length
    ? `<ul class="lhai-par-dash-bid__summary">${lines
        .map((line) => `<li>${esc(String(line))}</li>`)
        .join("")}</ul>`
    : `<p class="lhai-par-dash-bid__summary lhai-par-dash-bid__summary--empty u-text-muted">${esc(tr(translate, "partner.dashboard.bidding.summary_empty", "View request details for full intake."))}</p>`;
  const newBadge = row.is_new_request
    ? `<span class="lhai-badge lhai-badge--accent">${esc(tr(translate, "partner.dashboard.bidding.badge.new_request", "New request"))}</span>`
    : "";
  const unread =
    row.has_unread_customer_message === true || Number(row.unread_count) > 0
      ? `<span class="lhai-badge lhai-badge--warn">${esc(tr(translate, "partner.dashboard.bidding.badge.unread", "Unread message"))}</span>`
      : "";
  const carBadge = row.is_car_purchase === true
    ? `<span class="lhai-badge lhai-badge--vehicle">${esc(tr(translate, "partner.dashboard.bidding.badge.vehicle", "Vehicle"))}</span>`
    : "";

  const factTimeLeft = esc(tr(translate, "partner.dashboard.bidding.fact.time_left", "Time left"));
  const factStatus = esc(tr(translate, "partner.dashboard.bidding.fact.status", "Status"));
  const factOffers = esc(tr(translate, "partner.dashboard.bidding.fact.my_offers", "My offers"));
  const viewDetails = esc(tr(translate, "partner.dashboard.bidding.view_details", "View request details"));

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
        <div><dt>${factTimeLeft}</dt><dd class="lhai-par-dash-bid__time">${timeLeft}</dd></div>
        <div><dt>${factStatus}</dt><dd><span class="lhai-par-dash-bid__status ${statusCls}">${statusLabel}</span></dd></div>
        <div><dt>${factOffers}</dt><dd>${esc(offersLabel)}</dd></div>
      </dl>
      ${rankHtml}
      <div class="lhai-par-dash-bid__actions">
        <a class="lhai-button lhai-button--primary" href="${esc(detailHref)}">${viewDetails}</a>
      </div>
    </article>`;
}
