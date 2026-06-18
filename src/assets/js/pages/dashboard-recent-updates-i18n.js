/**
 * Dashboard "Recent updates" copy.
 *
 * Localization strategy:
 * - Card chrome ("Recent updates", "Open messages"): static `t()` keys in dashboard.js.
 * - Known system events (`event_code` / `timeline_kind`): static `dashboard.timeline.*` / `dashboard.activity.*` via `t()` (StringTranslation catalog).
 * - API `display_title` / `display_description`: viewer-locale dynamic text from backend (TranslationPipeline + LocalizedContent) — preferred when present; never passed through `t()`.
 *
 * NEXT STEP (backend — not implemented yet):
 * - `DashboardService.get_aggregate()` should accept viewer locale and resolve each recent-update row through TranslationPipeline
 *   (`entity_type` e.g. `dashboard_recent_update` or `message`, `field_key` title/body).
 * - Populate `display_*` on `DashboardRecentUpdateItem`; do not use StringKey for user/API message bodies.
 * - On language change, refetch dashboard aggregate (or a slim recent-updates endpoint) when `display_*` is authoritative.
 */
import { t } from "../core/i18n-client.js";
import { getEffectiveLanguage } from "../core/preferred-language.js";

/** @param {string | undefined} lang */
export function resolveRecentUpdateIntlLocale(lang) {
  const code = String(lang || getEffectiveLanguage() || "en")
    .trim()
    .toLowerCase();
  if (code === "ko" || code.startsWith("ko-")) return "ko-KR";
  if (code === "zh-hant" || code.includes("hant") || code.endsWith("-tw") || code.endsWith("-hk")) {
    return "zh-TW";
  }
  if (code === "zh-hans" || code.startsWith("zh")) return "zh-CN";
  if (code === "ja" || code.startsWith("ja-")) return "ja-JP";
  return "en-US";
}

/** @param {string} dateLike @param {string} [lang] */
export function formatRecentUpdateTimestamp(dateLike, lang) {
  if (!dateLike) return "";
  const date = new Date(dateLike);
  if (Number.isNaN(date.getTime())) return "";
  try {
    return new Intl.DateTimeFormat(resolveRecentUpdateIntlLocale(lang), {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(date);
  } catch {
    return "";
  }
}

/** @param {string} text @param {number} [max] */
export function shortenRecentUpdateText(text, max = 96) {
  const v = String(text || "").trim().replace(/\s+/g, " ");
  if (!v) return "";
  return v.length <= max ? v : `${v.slice(0, max - 1)}…`;
}

/** @type {Record<string, { titleKey: string, titleFallback: string, descKey: string, descFallback: string }>} */
const RECENT_UPDATE_EVENT_COPY = {
  "thread.intake.partner_emailed": {
    titleKey: "dashboard.timeline.intake_partner_emailed_title",
    titleFallback: "Delivered to partner",
    descKey: "dashboard.timeline.intake_partner_emailed_desc",
    descFallback: "Your intake was received and emailed to the partner.",
  },
  "thread.intake.completed": {
    titleKey: "dashboard.timeline.intake_completed_title",
    titleFallback: "Required information submitted",
    descKey: "dashboard.timeline.intake_completed_desc",
    descFallback: "We are preparing the next step based on what you submitted.",
  },
  "thread.intake.submission_summary": {
    titleKey: "dashboard.timeline.intake_submitted_title",
    titleFallback: "Application submitted",
    descKey: "dashboard.timeline.intake_submitted_desc",
    descFallback: "Your application was submitted successfully.",
  },
  "thread.intake.started": {
    titleKey: "dashboard.timeline.intake_started_title",
    titleFallback: "Information intake started",
    descKey: "dashboard.timeline.intake_started_desc",
    descFallback: "Please complete the required fields step by step.",
  },
  "thread.intake.partner_pending": {
    titleKey: "dashboard.timeline.partner_pending_title",
    titleFallback: "Waiting for partner assignment",
    descKey: "dashboard.timeline.partner_pending_desc",
    descFallback: "We will notify you in this conversation when a partner is assigned.",
  },
  "thread.intake.partner_assigned_account": {
    titleKey: "dashboard.timeline.partner_assigned_title",
    titleFallback: "Partner assigned",
    descKey: "dashboard.timeline.partner_assigned_desc",
    descFallback: "Your intake was received and a partner was assigned.",
  },
  "thread.intake.partner_joined_customer": {
    titleKey: "dashboard.timeline.partner_joined_title",
    titleFallback: "Partner joined the conversation",
    descKey: "dashboard.timeline.partner_joined_desc",
    descFallback: "Your partner joined this service conversation. You can exchange messages now.",
  },
  "customer.bidding.partner_selected": {
    titleKey: "dashboard.timeline.partner_selected_title",
    titleFallback: "Partner selection complete",
    descKey: "dashboard.timeline.partner_selected_desc",
    descFallback: "Continue the next steps with your selected partner in messages.",
  },
  "intake.bidding.requests_sent": {
    titleKey: "dashboard.timeline.bidding_started_title",
    titleFallback: "Quote requests sent",
    descKey: "dashboard.timeline.bidding_started_desc",
    descFallback: "You will be notified in messages when partner proposals arrive.",
  },
  "thread.bidding.comparison_entry": {
    titleKey: "dashboard.timeline.bid_comparison_title",
    titleFallback: "Vehicle quote request started",
    descKey: "dashboard.timeline.bid_comparison_desc",
    descFallback: "Compare partner proposals on the quote comparison screen.",
  },
  "invoice.sent": {
    titleKey: "dashboard.activity.invoice_sent_title",
    titleFallback: "Invoice sent",
    descKey: "dashboard.activity.invoice_sent_desc",
    descFallback: "You can pay from your inbox.",
  },
  "payment.completed": {
    titleKey: "dashboard.activity.payment_complete_title",
    titleFallback: "Payment complete",
    descKey: "dashboard.activity.payment_complete_desc",
    descFallback: "Your service has moved to the next stage.",
  },
  "survey.received": {
    titleKey: "dashboard.timeline.survey_received_title",
    titleFallback: "Service inquiry received",
    descKey: "dashboard.timeline.survey_received_desc",
    descFallback: "We received your inquiry and will follow up in messages.",
  },
};

/** @type {Record<string, string>} */
const TIMELINE_KIND_TO_EVENT = {
  intake_partner_emailed: "thread.intake.partner_emailed",
  intake_completed: "thread.intake.completed",
  intake_started: "thread.intake.started",
  partner_intake_submission_summary: "thread.intake.submission_summary",
  intake_submission_summary: "thread.intake.submission_summary",
  partner_joined_notice: "thread.intake.partner_joined_customer",
  customer_selected_partner: "customer.bidding.partner_selected",
  intake_partner_pending: "thread.intake.partner_pending",
  intake_partner_assigned_account: "thread.intake.partner_assigned_account",
};

/** @type {Array<{ titles: string[], eventCode: string }>} */
const TITLE_FINGERPRINTS = [
  { titles: ["파트너에게 전달됨", "Delivered to partner"], eventCode: "thread.intake.partner_emailed" },
  {
    titles: ["고객 신청서가 제출되었습니다", "Application submitted", "Customer application submitted"],
    eventCode: "thread.intake.submission_summary",
  },
  {
    titles: ["필수 정보 입력이 완료되었습니다", "Required information submitted"],
    eventCode: "thread.intake.completed",
  },
  {
    titles: ["필수 정보 입력을 시작합니다", "Information intake started"],
    eventCode: "thread.intake.started",
  },
  { titles: ["파트너 배정 대기", "Waiting for partner assignment"], eventCode: "thread.intake.partner_pending" },
  { titles: ["파트너 배정 완료", "Partner assigned"], eventCode: "thread.intake.partner_assigned_account" },
  {
    titles: ["파트너 선택 완료", "Partner selection complete", "Partner selected", "메신저 매칭 완료"],
    eventCode: "customer.bidding.partner_selected",
  },
  {
    titles: ["담당 파트너가 이 서비스 대화에 참여했습니다", "Partner joined the conversation"],
    eventCode: "thread.intake.partner_joined_customer",
  },
];

/**
 * @param {string} eventCode
 * @returns {{ title: string, description: string } | null}
 */
function localizedCopyForEventCode(eventCode) {
  const copy = RECENT_UPDATE_EVENT_COPY[eventCode];
  if (!copy) return null;
  return {
    title: t(copy.titleKey, copy.titleFallback),
    description: t(copy.descKey, copy.descFallback),
  };
}

/**
 * @param {Record<string, unknown>} row
 * @returns {{ title: string, description: string }}
 */
export function localizeRecentUpdateRow(row) {
  const displayTitle = String(row?.display_title ?? "").trim();
  const displayDesc = String(row?.display_description ?? row?.display_body ?? "").trim();
  if (displayTitle || displayDesc) {
    const defaultTitle = t("dashboard.update.default_title", "Update");
    return {
      title: displayTitle || defaultTitle,
      description: shortenRecentUpdateText(displayDesc),
    };
  }

  const rawTitle = String(row?.title || "").trim();
  const rawDesc = String(row?.description || "").trim();
  let eventCode = String(row?.event_code || "").trim();

  if (!eventCode) {
    const timelineKind = String(row?.timeline_kind || "").trim();
    if (timelineKind && TIMELINE_KIND_TO_EVENT[timelineKind]) {
      eventCode = TIMELINE_KIND_TO_EVENT[timelineKind];
    }
  }
  if (!eventCode && rawTitle) {
    const match = TITLE_FINGERPRINTS.find((fp) => fp.titles.some((title) => title === rawTitle));
    if (match) eventCode = match.eventCode;
  }
  if (!eventCode && rawDesc && /최종적으로\s*파트너를\s*선택|partner\s+selection\s+complete/i.test(rawDesc)) {
    eventCode = "customer.bidding.partner_selected";
  }

  const localized = eventCode ? localizedCopyForEventCode(eventCode) : null;
  if (localized) return localized;

  if (String(row?.source || "") === "activity" && rawDesc) {
    const parsed = activityLineToRecentUpdate(rawDesc, 0);
    if (parsed) {
      return { title: parsed.title, description: parsed.description };
    }
  }

  const defaultTitle = t("dashboard.update.default_title", "Update");
  return {
    title: rawTitle || defaultTitle,
    description: shortenRecentUpdateText(rawDesc),
  };
}

/** @param {string} line @param {number} index */
export function activityLineToRecentUpdate(line, index) {
  const raw = String(line || "").trim();
  if (!raw) return null;
  const lower = raw.toLowerCase();
  const sortAt = Date.now() - (index + 1) * 3_600_000;

  if (lower.includes("invoice is paid") || lower.includes("at least one invoice is paid")) {
    return {
      id: `act:paid:${index}`,
      title: t("dashboard.activity.payment_complete_title", "Payment complete"),
      description: t("dashboard.activity.payment_complete_desc", "Your service has moved to the next stage."),
      sortAt,
      timestamp: "",
    };
  }
  if (lower.includes("complete payment")) {
    return {
      id: `act:pay-due:${index}`,
      title: t("dashboard.activity.payment_due_title", "Payment required"),
      description: t("dashboard.activity.payment_due_desc", "Review your invoice and complete payment."),
      sortAt,
      timestamp: "",
    };
  }
  if (lower.includes("latest quote") && lower.includes("proposed")) {
    return {
      id: `act:quote-proposed:${index}`,
      title: t("dashboard.activity.quote_arrived_title", "A quote has arrived"),
      description: t("dashboard.activity.quote_arrived_desc", "Please review the quote details."),
      sortAt,
      timestamp: "",
    };
  }
  if (lower.includes("latest quote") && lower.includes("approved")) {
    return {
      id: `act:quote-approved:${index}`,
      title: t("dashboard.activity.quote_approved_title", "Quote approved"),
      description: t("dashboard.activity.quote_approved_desc", "Waiting for invoice issuance."),
      sortAt,
      timestamp: "",
    };
  }
  if (lower.includes("latest invoice") && lower.includes("sent")) {
    return {
      id: `act:invoice-sent:${index}`,
      title: t("dashboard.activity.invoice_sent_title", "Invoice sent"),
      description: t("dashboard.activity.invoice_sent_desc", "You can pay from your inbox."),
      sortAt,
      timestamp: "",
    };
  }
  if (/bid|bidding|car purchase|vehicle/i.test(raw)) {
    return {
      id: `act:bid:${index}`,
      title: t("dashboard.activity.bid_started_title", "Vehicle quote request started"),
      description: t("dashboard.activity.bid_started_desc", "We will notify you when partner proposals arrive."),
      sortAt,
      timestamp: "",
    };
  }
  if (/intake|required|checklist|survey/i.test(raw)) {
    return {
      id: `act:intake:${index}`,
      title: t("dashboard.activity.intake_done_title", "Required information submitted"),
      description: t("dashboard.activity.intake_done_desc", "Check guidance for the next step."),
      sortAt,
      timestamp: "",
    };
  }

  return {
    id: `act:raw:${index}`,
    title: t("dashboard.activity.generic_title", "Service update"),
    description: shortenRecentUpdateText(raw),
    sortAt,
    timestamp: "",
  };
}

/** @param {{ title?: string, description?: string }} item */
function recentUpdateDedupeKey(item) {
  return `${String(item.title || "").trim()}|${String(item.description || "").trim()}`.toLowerCase();
}

/**
 * @param {Record<string, unknown>} aggregate
 * @returns {Array<{ id: string, title: string, description: string, sortAt: number, timestamp: string }>}
 */
export function buildLocalizedRecentUpdateItems(aggregate) {
  const lang = getEffectiveLanguage();
  const backendRows = Array.isArray(aggregate?.recent_updates) ? aggregate.recent_updates : [];

  if (backendRows.length) {
    return backendRows.slice(0, 3).map((row, index) => {
      const createdAt = row?.timestamp;
      const sortAt = new Date(createdAt || 0).getTime();
      const localized = localizeRecentUpdateRow(row);
      return {
        id: String(row?.id || `upd:${index}`),
        title: localized.title,
        description: localized.description,
        sortAt: Number.isFinite(sortAt) ? sortAt : 0,
        timestamp: formatRecentUpdateTimestamp(createdAt, lang),
      };
    });
  }

  /** @type {Array<{ id: string, title: string, description: string, sortAt: number, timestamp: string }>} */
  const items = [];

  for (const message of Array.isArray(aggregate?.recent_messages) ? aggregate.recent_messages : []) {
    const localized = localizeRecentUpdateRow({
      title: message.title,
      description: message.preview,
      event_code: message.event_code,
      timeline_kind: message.timeline_kind,
      source: "message",
    });
    const createdAt = message.created_at;
    const sortAt = new Date(createdAt || 0).getTime();
    items.push({
      id: `msg:${message.id || localized.title}`,
      title: localized.title,
      description: localized.description,
      sortAt: Number.isFinite(sortAt) ? sortAt : 0,
      timestamp: formatRecentUpdateTimestamp(createdAt, lang),
    });
  }

  const activity = Array.isArray(aggregate?.recent_activity) ? aggregate.recent_activity : [];
  activity.forEach((line, index) => {
    const parsed = activityLineToRecentUpdate(line, index);
    if (parsed) items.push(parsed);
  });

  const seen = new Set();
  return items
    .sort((a, b) => b.sortAt - a.sortAt)
    .filter((item) => {
      const key = recentUpdateDedupeKey(item);
      if (!key || key === "|") return false;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 3);
}
