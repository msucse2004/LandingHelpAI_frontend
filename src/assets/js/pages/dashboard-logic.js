/**
 * Customer dashboard — pure logic (QA / unit tests, no DOM).
 */
import { t } from "../core/i18n-client.js";
import { localizedStatus } from "../core/i18n-dynamic.js";
import { buildCustomerBidResultsPageHref } from "./customer-bid-results-logic.js";
import { buildLocalizedRecentUpdateItems } from "./dashboard-recent-updates-i18n.js";

/** Logical-key prefix for customer dashboard-owned static UI strings. */
export const DASHBOARD_I18N_KEY_PREFIX = "dashboard.";

/** Prefixes that require a customer dashboard rerender after runtime static UI resolve. */
export const DASHBOARD_RUNTIME_I18N_PREFIXES = Object.freeze(["dashboard.", "common.", "nav."]);

/**
 * Whether a runtime resolve batch includes keys used by the customer dashboard shell or body.
 * @param {string[] | null | undefined} keys
 * @returns {boolean}
 */
export function dashboardRuntimeResolveTouches(keys) {
  if (!Array.isArray(keys) || !keys.length) return false;
  return keys.some((key) => {
    const logical = String(key || "");
    return DASHBOARD_RUNTIME_I18N_PREFIXES.some((prefix) => logical.startsWith(prefix));
  });
}

/** @param {string} status */
export function normalizeTimelineStepStatus(status) {
  const s = String(status || "").toLowerCase();
  if (s === "done" || s === "completed") return "done";
  if (s === "in_progress" || s === "active") return "in_progress";
  return "pending";
}

/**
 * Map aggregate/API status tokens to static catalog keys (canonical English from backend).
 * @param {unknown} raw
 * @returns {string}
 */
export function localizeDashboardStatusText(raw) {
  const v = String(raw ?? "").trim();
  if (!v) return "—";

  const biddingSuffix = v.match(/\s*·\s*(?:비딩|bidding)\s+(.+)$/iu);
  if (biddingSuffix) {
    const basePart = v.slice(0, biddingSuffix.index).trim();
    const baseLabel = localizeDashboardStatusText(basePart);
    return localizedStatus("dashboard.status.service_with_bidding", "{status} · Bidding {remaining}", {
      status: baseLabel,
      remaining: String(biddingSuffix[1] || "").trim(),
    });
  }

  const exact = {
    "Active — delivery in progress": t("dashboard.status.active_delivery", "In progress"),
    "In progress": t("dashboard.status.active_delivery", "In progress"),
    "Awaiting payment": t("dashboard.status.awaiting_payment", "Awaiting payment"),
    "Quote pending your approval": t("dashboard.status.quote_pending", "Quote review"),
    "Quote approved — billing next": t("dashboard.status.quote_approved", "Quote approved"),
    "Quote in progress": t("dashboard.status.quote_in_progress", "Quote in progress"),
    "Request under review": t("dashboard.status.request_review", "Under review"),
    "Getting started": t("dashboard.status.getting_started", "Getting started"),
    Paid: t("dashboard.status.paid", "Paid"),
    "Payment due": t("dashboard.status.payment_due", "Payment due"),
    "No invoice yet": t("dashboard.status.no_invoice", "Not billed yet"),
    "Not billed": t("dashboard.status.no_invoice", "Not billed yet"),
    "Before payment": t("dashboard.status.before_payment", "Before payment"),
    "Not scheduled": t("dashboard.status.not_scheduled", "Not scheduled"),
    "Not scheduled yet": t("dashboard.status.not_scheduled", "Not scheduled"),
    "After payment": t("dashboard.status.after_payment", "After payment"),
    "After quote approval": t("dashboard.status.after_quote_approval", "After quote approval"),
    "Draft / TBD": t("dashboard.status.draft_tbd", "In preparation"),
    "No documents yet": t("dashboard.status.no_documents", "None"),
    "Invoice draft": t("dashboard.status.invoice_draft", "Invoice draft"),
    DRAFT: t("dashboard.status.draft", "Draft"),
    CONFIRMED: t("dashboard.status.confirmed", "Confirmed"),
    SENT: t("dashboard.status.sent", "Sent"),
  };
  if (exact[v]) return exact[v];

  const approvedNeed = v.match(/^(\d+)\s+approved,\s*(\d+)\s+need attention$/i);
  if (approvedNeed) {
    const a = approvedNeed[1];
    const n = approvedNeed[2];
    return Number(n) > 0
      ? localizedStatus("dashboard.status.docs_approved_need", "{approved} approved · {count} need review", {
          approved: a,
          count: n,
        })
      : localizedStatus("dashboard.status.docs_approved_only", "{approved} approved", { approved: a });
  }

  if (v.length <= 28) return v;
  return `${v.slice(0, 26)}…`;
}

/**
 * Map operational case queue tokens to static UI labels.
 * @param {string} token
 * @returns {string}
 */
export function localizeCaseQueueStatus(token) {
  const normalized = String(token || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_");
  if (!normalized) return "";
  const map = {
    open: () => t("dashboard.case_status.in_progress", "In progress"),
    in_progress: () => t("dashboard.case_status.in_progress", "In progress"),
    action_required: () => t("dashboard.case_status.action_required", "Under review"),
    waiting_customer: () => t("dashboard.case_status.waiting_customer", "Waiting on you"),
    resolved: () => t("dashboard.case_status.resolved", "Resolved"),
    closed: () => t("dashboard.case_status.resolved", "Resolved"),
  };
  return map[normalized]?.() || "";
}

/** @param {Record<string, unknown>} item */
export function customerCaseStatusLabel(item) {
  const kind = String(item?.case_kind || "");
  if (kind === "messaging") {
    return item.unread
      ? t("dashboard.case_status.new_message", "New message")
      : t("dashboard.case_status.in_progress", "In progress");
  }
  const tab = String(item?.queue_tab || "").toLowerCase();
  if (tab === "resolved") return t("dashboard.case_status.resolved", "Resolved");
  if (tab === "waiting_customer") return t("dashboard.case_status.waiting_customer", "Waiting on you");
  if (tab === "action_required") return t("dashboard.case_status.action_required", "Under review");
  const raw = String(item?.case_status || item?.queue_status || "").trim();
  if (raw) {
    const localized = localizeCaseQueueStatus(raw);
    return localized || raw;
  }
  return t("dashboard.case_status.in_progress", "In progress");
}

/** @param {Record<string, unknown>} item */
export function customerCaseDisplayTitle(item) {
  const display = String(item?.display_title ?? "").trim();
  if (display) return display;
  const title = String(item?.title ?? "").trim();
  if (title) return title;
  return t("dashboard.case.default_title", "Inquiry");
}

/** @param {Record<string, unknown>} item */
export function customerCaseDisplaySubtitle(item) {
  const display = String(item?.display_subtitle ?? "").trim();
  if (display) return display;
  return String(item?.subtitle ?? "").trim();
}

/** @param {Record<string, unknown>} item */
export function customerCaseDisplayStatusLabel(item) {
  const display = String(item?.display_status_label ?? "").trim();
  if (display) return display;
  return customerCaseStatusLabel(item);
}

/**
 * Localize known workflow timeline step titles from the API (canonical English titles only).
 * @param {{ title?: string, status?: string }} item
 * @returns {string}
 */
export function localizeTimelineStepTitle(item) {
  const title = String(item?.title || "").trim();
  const st = normalizeTimelineStepStatus(item?.status);
  const byTitle = {
    "service request received": t("dashboard.timeline.request_received", "Request received"),
    "quote review and approval":
      st === "done"
        ? t("dashboard.timeline.quote_approved", "Quote approved")
        : t("dashboard.timeline.quote_review", "Quote review"),
    "invoice payment":
      st === "done"
        ? t("dashboard.timeline.payment_done", "Payment complete")
        : st === "in_progress"
          ? t("dashboard.timeline.payment_in_progress", "Payment in progress")
          : t("dashboard.timeline.payment", "Payment"),
    "schedule and delivery":
      st === "done"
        ? t("dashboard.timeline.schedule_done", "Schedule confirmed")
        : t("dashboard.timeline.schedule_progress", "Schedule & service"),
  };
  const key = title.toLowerCase();
  if (byTitle[key]) return byTitle[key];
  if (title.length <= 24) return title;
  return `${title.slice(0, 22)}…`;
}

/** Customer dashboard empty copy (no developer-only prefixes). */
export const DASHBOARD_EMPTY = {
  get recentUpdates() {
    return t("dashboard.empty.recent_updates", "No new updates yet.");
  },
  get recentMessages() {
    return t("dashboard.empty.recent_messages", "No new messages.");
  },
  get recentActivity() {
    return t("dashboard.empty.recent_activity", "No recent activity.");
  },
  get documents() {
    return t("dashboard.empty.documents", "No documents yet.");
  },
  get checklistNone() {
    return t("dashboard.empty.checklist_none", "No required items yet.");
  },
  get checklistDone() {
    return t("dashboard.empty.checklist_done", "All required items are complete.");
  },
  get quoteWaitingTitle() {
    return t("dashboard.empty.quote_waiting_title", "No quotes have arrived yet");
  },
  get quoteWaitingText() {
    return t(
      "dashboard.empty.quote_waiting_text",
      "When partners submit proposals, you can compare them here."
    );
  },
  get status() {
    return t("dashboard.empty.status", "No progress information yet.");
  },
  get progress() {
    return t("dashboard.empty.progress", "No progress steps yet.");
  },
  get cases() {
    return t("dashboard.empty.cases", "No active inquiries.");
  },
};

/** Pre-start / no active workflow — hero after admin data reset or new customer. */
export const DASHBOARD_IDLE_HERO = {
  get eyebrow() {
    return t("dashboard.idle.hero.eyebrow", "Get started");
  },
  get title() {
    return t("dashboard.idle.hero.title", "No active services right now");
  },
  get text() {
    return t(
      "dashboard.idle.hero.text",
      "Start a service inquiry to see quotes, documents, and messages here."
    );
  },
  get primary() {
    return {
      label: t("dashboard.idle.hero.cta_cases", "Start a service inquiry"),
      href: "cases.html",
    };
  },
  get secondary() {
    return {
      label: t("dashboard.idle.hero.cta_messages", "Open messages"),
      href: "messages.html",
    };
  },
};

/** @returns {Record<string, unknown> | null} */
export function getActiveCarBid(aggregate) {
  const bid = aggregate?.active_car_bid;
  if (!bid || typeof bid !== "object") return null;
  if (bid.exists === false) return null;
  return bid;
}

/** @param {Record<string, unknown>} aggregate */
export function resolveServiceStatusDisplay(aggregate) {
  const cards = Array.isArray(aggregate?.status_cards) ? aggregate.status_cards : [];
  for (const card of cards) {
    if (String(card?.key || "").trim() === "service") {
      return String(card?.value || "").trim();
    }
  }
  return String(aggregate?.current_service_status || "").trim();
}

/** @param {string} value */
export function isPreStartServiceStatus(value) {
  const v = String(value || "").trim();
  if (!v || v === "—") return true;
  const low = v.toLowerCase();
  if (v.includes("시작 전")) return true;
  if (low.includes("getting started")) return true;
  if (v.includes("견적 준비") || v.includes("검토 중")) return true;
  if (low.includes("quote in progress")) return true;
  if (low.includes("request under review")) return true;
  return false;
}

/** @param {Record<string, unknown> | null} bid */
export function hasMeaningfulActiveCarBid(bid) {
  if (!bid || bid.exists === false) return false;
  if (hasSelectedCarOffer(bid)) return true;
  if (Math.max(0, Number(bid.offer_count) || 0) > 0) return true;
  if (bid.is_expired === true) return false;
  const sid = String(bid.service_request_id || "").trim();
  if (!sid) return false;
  const href = resolveActiveCarBidCompareHref(bid);
  return href.includes("customer-bid-results.html");
}

/**
 * No active service workflow (e.g. after dev data reset): pre-start status, no bid, no urgent items.
 * @param {Record<string, unknown>} aggregate
 * @param {{ cases?: Array<Record<string, unknown>> }} [context]
 */
export function isDashboardIdleState(aggregate, context = {}) {
  if (String(aggregate?.payment_status || "").trim() === "Payment due") return false;
  if (documentsNeedCustomerAttention(aggregate)) return false;
  if (hasMeaningfulActiveCarBid(getActiveCarBid(aggregate))) return false;
  const cases = Array.isArray(context.cases) ? context.cases : [];
  if (cases.some((c) => c && c.unread)) return false;
  return isPreStartServiceStatus(resolveServiceStatusDisplay(aggregate));
}

/** @param {Record<string, unknown>} aggregate */
function localizeDashboardNextAction(aggregate) {
  const raw = String(aggregate?.next_action || "").trim();
  const map = {
    "Submit a service inquiry or open messages to reach the team.": t(
      "dashboard.next_action.submit_inquiry",
      "Start a service inquiry or check guidance in your inbox."
    ),
    "Review messages and schedule.": t(
      "dashboard.next_action.review_messages_schedule",
      "Review messages and your schedule."
    ),
    "Review messages, documents, and your schedule for the next steps.": t(
      "dashboard.next_action.review_messages_docs_schedule",
      "Review messages, documents, and your schedule for the next steps."
    ),
    "Open your invoice and complete payment to activate your service.": t(
      "dashboard.next_action.open_invoice_pay",
      "Open your invoice and complete payment to activate your service."
    ),
    "Review the proposed quote and approve it to move to billing.": t(
      "dashboard.next_action.review_quote",
      "Review the proposed quote and approve it to move to billing."
    ),
    "Wait for your invoice in messages, then complete payment.": t(
      "dashboard.next_action.wait_invoice",
      "Wait for your invoice in messages, then complete payment."
    ),
    "Your quote is being prepared; check back soon or use messages for questions.": t(
      "dashboard.next_action.quote_preparing",
      "Your quote is being prepared. Check messages for progress or questions."
    ),
    "Operations is preparing your quote; you will be notified in messages.": t(
      "dashboard.next_action.ops_preparing_quote",
      "Our team is preparing your quote. We will notify you in messages."
    ),
  };
  if (!raw) {
    return t("dashboard.next_action.default", "Check messages and your progress status.");
  }
  return map[raw] || raw;
}

/** @param {Record<string, unknown> | null} bid */
export function hasSelectedCarOffer(bid) {
  if (!bid) return false;
  if (String(bid.selected_offer_id || "").trim()) return true;
  const offer = bid.selected_offer;
  if (offer && typeof offer === "object" && String(offer.offer_id || "").trim()) return true;
  const summary = bid.selected_offer_summary;
  if (summary && typeof summary === "object") return true;
  const st = String(bid.bid_request_status || bid.status || "").trim().toUpperCase();
  return st === "CUSTOMER_SELECTED";
}

/** @param {Record<string, unknown> | null} bid */
export function resolveActiveCarBidCompareHref(bid) {
  if (!bid) {
    return buildCustomerBidResultsPageHref("", "", { fallbackHref: "messages.html" });
  }
  return buildCustomerBidResultsPageHref(bid.service_request_id, bid.thread_id, {
    fallbackHref: "messages.html",
  });
}

/** @param {unknown} aggregateOrDocs */
export function documentsNeedCustomerAttention(aggregateOrDocs) {
  if (aggregateOrDocs && typeof aggregateOrDocs === "object" && !Array.isArray(aggregateOrDocs)) {
    const summary = aggregateOrDocs.documents_summary;
    if (summary && typeof summary === "object") {
      if (Math.max(0, Number(summary.needs_attention_count) || 0) > 0) return true;
    }
    const docs = aggregateOrDocs.document_status;
    return documentsNeedCustomerAttention(Array.isArray(docs) ? docs : []);
  }
  return (Array.isArray(aggregateOrDocs) ? aggregateOrDocs : []).some((doc) => {
    const st = String(doc?.status || "").trim().toUpperCase();
    return st === "REQUESTED" || st === "REJECTED";
  });
}

/** @param {Record<string, unknown> | null} bid */
export function resolveCustomerQuoteNavBadge(bid) {
  if (!bid) {
    return { hidden: true, text: "", selected: false };
  }
  if (hasSelectedCarOffer(bid)) {
    return {
      hidden: false,
      text: t("dashboard.badge.selected", "Selected"),
      selected: true,
    };
  }
  const offerCount = Math.max(0, Number(bid.offer_count) || 0);
  if (offerCount > 0) {
    return {
      hidden: false,
      text: offerCount > 99 ? "99+" : String(offerCount),
      selected: false,
    };
  }
  return { hidden: true, text: "", selected: false };
}

/** @param {Record<string, unknown>} aggregate @param {{ cases?: Array<Record<string, unknown>> }} [context] */
export function resolveDashboardActionHero(aggregate, context = {}) {
  const bid = getActiveCarBid(aggregate);
  const bidHref = resolveActiveCarBidCompareHref(bid);
  const rl = String(bid?.remaining_label || "").trim();
  const rlInText = rl
    ? localizedStatus("dashboard.hero.bid_deadline_remaining", "Bidding closes in {remaining}.", {
        remaining: rl,
      })
    : t("dashboard.hero.bid_deadline_check", "Check the bidding deadline.");
  const offerCount = Math.max(0, Number(bid?.offer_count) || 0);
  const partnerCount = Math.max(0, Number(bid?.partner_count) || 0);
  const cases = Array.isArray(context.cases) ? context.cases : [];
  const hasUnreadMessages = cases.some((c) => c && c.unread);
  const recentMessages = Array.isArray(aggregate?.recent_messages) ? aggregate.recent_messages : [];

  const heroBase = {
    eyebrow: t("dashboard.hero.eyebrow", "What to do next"),
    secondary: null,
    badges: [],
  };
  const openMessagesLabel = t("dashboard.cta.open_messages", "Open messages");

  if (bid && hasSelectedCarOffer(bid)) {
    return {
      ...heroBase,
      variant: "active",
      title: t("dashboard.hero.partner_selected_title", "Partner selection complete"),
      text: t(
        "dashboard.hero.partner_selected_text",
        "Continue the next steps with your selected partner in messages."
      ),
      primary: { label: openMessagesLabel, href: "messages.html" },
      meta: null,
    };
  }

  if (bid && offerCount > 0 && bidHref.includes("customer-bid-results.html")) {
    return {
      ...heroBase,
      variant: "active",
      title: t("dashboard.hero.offers_arrived_title", "Vehicle quotes are arriving"),
      text: localizedStatus(
        "dashboard.hero.offers_arrived_text",
        "Compare vehicle proposals from partners. {deadline}",
        { deadline: rlInText }
      ),
      primary: {
        label: t("dashboard.cta.compare_quotes", "Compare quotes"),
        href: bidHref,
      },
      meta: localizedStatus(
        "dashboard.hero.offers_meta",
        "{offerCount} proposals · {partnerCount} partners · accepting quotes",
        { offerCount, partnerCount }
      ),
    };
  }

  if (bid && offerCount === 0 && bidHref.includes("customer-bid-results.html")) {
    return {
      ...heroBase,
      variant: "active",
      title: t("dashboard.hero.waiting_offers_title", "Waiting for proposals"),
      text: localizedStatus(
        "dashboard.hero.waiting_offers_text",
        "When partners submit proposals, you can compare them here. {deadline}",
        { deadline: rlInText }
      ),
      primary: {
        label: t("dashboard.cta.view_quote_status", "View quote status"),
        href: bidHref,
      },
      meta:
        partnerCount > 0
          ? localizedStatus(
              "dashboard.hero.waiting_meta_partners",
              "{partnerCount} partners · waiting for proposals",
              { partnerCount }
            )
          : t("dashboard.hero.waiting_meta", "Waiting for proposals"),
    };
  }

  const payment = String(aggregate?.payment_status || "").trim();
  if (payment === "Payment due") {
    return {
      ...heroBase,
      variant: "active",
      title: t("dashboard.hero.payment_due_title", "Payment required"),
      text: t(
        "dashboard.hero.payment_due_text",
        "Review your invoice and complete payment to continue your service."
      ),
      primary: {
        label: t("dashboard.cta.view_invoice", "View invoice"),
        href: "messages.html",
      },
      meta: null,
      badges: [{ label: localizeDashboardStatusText(payment), tone: "warning" }],
    };
  }

  if (documentsNeedCustomerAttention(aggregate)) {
    return {
      ...heroBase,
      variant: "active",
      title: t("dashboard.hero.documents_attention_title", "Documents need your review"),
      text: t("dashboard.hero.documents_attention_text", "Some documents need your attention."),
      primary: {
        label: t("dashboard.cta.view_documents", "View documents"),
        href: "documents.html",
      },
      meta: null,
    };
  }

  if (hasUnreadMessages || recentMessages.length > 0) {
    const unreadCase = cases.find((c) => c && c.unread);
    return {
      ...heroBase,
      variant: "active",
      title: hasUnreadMessages
        ? t("dashboard.hero.unread_messages_title", "You have new messages")
        : t("dashboard.hero.check_messages_title", "Check your messages"),
      text: hasUnreadMessages
        ? t(
            "dashboard.hero.unread_messages_text",
            "Review replies and guidance in your inquiry or service conversations."
          )
        : t("dashboard.hero.recent_messages_text", "There are recent inbox updates."),
      primary: unreadCase
        ? {
            label: openMessagesLabel,
            href: `case-detail.html?case_id=${encodeURIComponent(String(unreadCase.case_id))}`,
          }
        : { label: openMessagesLabel, href: "messages.html" },
      meta: null,
      badges: hasUnreadMessages
        ? [{ label: t("dashboard.badge.new_message", "New message"), tone: "warning" }]
        : [],
    };
  }

  if (isDashboardIdleState(aggregate, context)) {
    return {
      ...heroBase,
      variant: "idle",
      eyebrow: DASHBOARD_IDLE_HERO.eyebrow,
      title: DASHBOARD_IDLE_HERO.title,
      text: DASHBOARD_IDLE_HERO.text,
      primary: DASHBOARD_IDLE_HERO.primary,
      secondary: DASHBOARD_IDLE_HERO.secondary,
      meta: null,
    };
  }

  return {
    ...heroBase,
    variant: "active",
    eyebrow: t("dashboard.hero.in_progress_eyebrow", "Progress update"),
    title: t("dashboard.hero.in_progress_title", "Your service is in progress"),
    text: localizeDashboardNextAction(aggregate),
    primary: { label: openMessagesLabel, href: "messages.html" },
    meta: null,
  };
}

/** @param {Record<string, unknown>} bid */
export function resolveQuoteBidSummaryModel(bid) {
  const rl = String(bid.remaining_label || "").trim();
  const deadlineLine = rl
    ? localizedStatus("dashboard.quote.deadline_line", "Bidding closes {remaining}", { remaining: rl })
    : "";
  const resultsHref = resolveActiveCarBidCompareHref(bid);
  const offerCount = Math.max(0, Number(bid.offer_count) || 0);

  if (hasSelectedCarOffer(bid)) {
    return {
      title: t("dashboard.quote.selected_title", "You have a selected proposal"),
      text: t(
        "dashboard.quote.selected_text",
        "Continue the next steps with your selected partner in messages."
      ),
      deadlineLine,
      cta: { label: t("dashboard.cta.open_messages", "Open messages"), href: "messages.html" },
    };
  }

  if (offerCount > 0 && resultsHref.includes("customer-bid-results.html")) {
    return {
      title: localizedStatus("dashboard.quote.offers_count_title", "{count} proposals received", {
        count: offerCount,
      }),
      text: t(
        "dashboard.quote.offers_count_text",
        "Compare vehicle proposals from partners and choose one."
      ),
      deadlineLine,
      cta: {
        label: t("dashboard.cta.compare_quotes", "Compare quotes"),
        href: resultsHref,
      },
    };
  }

  if (resultsHref.includes("customer-bid-results.html")) {
    return {
      title: DASHBOARD_EMPTY.quoteWaitingTitle,
      text: DASHBOARD_EMPTY.quoteWaitingText,
      deadlineLine,
      cta: {
        label: t("dashboard.cta.view_quote_status", "View quote status"),
        href: resultsHref,
      },
    };
  }

  return null;
}

/** @param {Record<string, unknown>} aggregate */
export function normalizeChecklistSummary(aggregate) {
  const summary = aggregate?.checklist_summary;
  if (summary && typeof summary === "object") {
    const total = Number(summary.total_count ?? summary.total) || 0;
    const completed = Number(summary.completed_count ?? summary.completed) || 0;
    const requiredRemaining =
      Number(summary.remaining_required_count ?? summary.required_remaining) || 0;
    return {
      ...summary,
      total,
      completed,
      required_remaining: requiredRemaining,
      total_count: total,
      completed_count: completed,
      remaining_required_count: requiredRemaining,
    };
  }
  return {
    total: 0,
    completed: 0,
    required_remaining: 0,
    next_required_item: "",
    total_count: 0,
    completed_count: 0,
    remaining_required_count: 0,
  };
}

/** @param {Record<string, unknown>} aggregate */
export function summarizeDocumentCounts(aggregate) {
  const summary = aggregate?.documents_summary;
  if (summary && typeof summary === "object") {
    return {
      approved: Math.max(0, Number(summary.approved_count) || 0),
      needsAttention: Math.max(0, Number(summary.needs_attention_count) || 0),
      total: Math.max(0, Number(summary.total_count) || 0),
    };
  }
  const docs = Array.isArray(aggregate?.document_status) ? aggregate.document_status : [];
  let approved = 0;
  let needsAttention = 0;
  for (const doc of docs) {
    const st = String(doc?.status || "").trim().toUpperCase();
    if (st === "APPROVED") approved += 1;
    else if (st === "REQUESTED" || st === "REJECTED") needsAttention += 1;
  }
  return { approved, needsAttention, total: docs.length };
}

/** @param {Record<string, unknown>} aggregate */
export function buildMergedRecentUpdates(aggregate) {
  return buildLocalizedRecentUpdateItems(aggregate);
}

export { buildCustomerBidResultsPageHref };
