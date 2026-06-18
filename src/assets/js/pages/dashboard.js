import { customerCasesApi, dashboardApi, timelineApi } from "../core/api.js";
import {
  DASHBOARD_EMPTY,
  buildCustomerBidResultsPageHref,
  dashboardRuntimeResolveTouches,
  documentsNeedCustomerAttention,
  getActiveCarBid,
  hasSelectedCarOffer,
  localizeCaseQueueStatus,
  localizeDashboardStatusText,
  localizeTimelineStepTitle,
  customerCaseDisplayTitle,
  customerCaseDisplaySubtitle,
  customerCaseDisplayStatusLabel,
  customerCaseStatusLabel,
  normalizeChecklistSummary,
  normalizeTimelineStepStatus,
  resolveActiveCarBidCompareHref,
  resolveDashboardActionHero,
  resolveQuoteBidSummaryModel,
  summarizeDocumentCounts,
  buildMergedRecentUpdates,
} from "./dashboard-logic.js";
import { getCurrentRole, getCustomerMessagingProfileId } from "../core/auth.js";
import { ROLES } from "../core/config.js";
import { ensureCustomerAccess, protectCurrentPage } from "../core/guards.js";
import { patchState } from "../core/state.js";
import { loadSidebar } from "../components/sidebar.js";
import { applyCustomerQuoteNavFromAggregate } from "../components/customer-quote-nav.js";
import { t, flushRuntimeMissingKeysAfterPageApply } from "../core/i18n-client.js";
import { localizedStatus } from "../core/i18n-dynamic.js";
import { appPageLanguageReady } from "../core/app-page-i18n-boot.js";
import { wireDynamicPageI18nRefresh, applyI18nToDom } from "../core/i18n-dom.js";
import { getEffectiveLanguage } from "../core/preferred-language.js";

function qs(selector) {
  return document.querySelector(selector);
}

function escHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function dashMuted(text) {
  return `<p class="lhai-dashboard-compact-empty">${escHtml(text)}</p>`;
}

function cardHead(title, href, linkLabel) {
  const link =
    href && linkLabel
      ? `<a class="lhai-dashboard-card__link" href="${escHtml(href)}">${escHtml(linkLabel)}</a>`
      : "";
  return `<div class="lhai-dashboard-card__head"><h2 class="lhai-card__title">${escHtml(title)}</h2>${link}</div>`;
}

function customerCaseStatusBadgeClass(item) {
  const kind = String(item?.case_kind || "");
  if (kind === "messaging") {
    return item.unread ? "lhai-case-badge--pending_customer" : "lhai-case-badge--open";
  }
  const tab = String(item?.queue_tab || "").toLowerCase();
  if (tab === "resolved") return "lhai-case-badge--resolved";
  if (tab === "waiting_customer") return "lhai-case-badge--pending_customer";
  if (tab === "action_required") return "lhai-case-badge--pending_ops";
  return "lhai-case-badge--open";
}

/** @param {ReturnType<typeof resolveDashboardActionHero>} hero */
function paintDashboardActionHero(hero) {
  const target = qs("#dashboardActionHero");
  if (!target || !hero) return;
  target.className =
    hero.variant === "idle" ? "lhai-dashboard-hero lhai-dashboard-hero--idle" : "lhai-dashboard-hero";
  const badges = (hero.badges || [])
    .map((b) => {
      const cls =
        b.tone === "warning"
          ? "lhai-badge lhai-badge--warning"
          : b.tone === "success"
            ? "lhai-badge lhai-badge--success"
            : "lhai-badge";
      return `<span class="lhai-dashboard-badge ${cls}">${escHtml(b.label)}</span>`;
    })
    .join("");
  const primary = hero.primary
    ? `<a class="lhai-button lhai-button--primary" href="${escHtml(hero.primary.href)}">${escHtml(hero.primary.label)}</a>`
    : "";
  const secondary = hero.secondary
    ? `<a class="lhai-button lhai-button--secondary" href="${escHtml(hero.secondary.href)}">${escHtml(hero.secondary.label)}</a>`
    : "";
  const metaBlock = hero.meta
    ? `<p class="lhai-dashboard-hero__meta-line">${escHtml(hero.meta)}</p>`
    : badges
      ? `<div class="lhai-dashboard-hero__meta">${badges}</div>`
      : "";
  target.innerHTML = `
    <p class="lhai-dashboard-hero__eyebrow">${escHtml(hero.eyebrow)}</p>
    <h2 class="lhai-dashboard-hero__title">${escHtml(hero.title)}</h2>
    <p class="lhai-dashboard-hero__text">${escHtml(hero.text)}</p>
    <div class="lhai-dashboard-hero__actions">${primary}${secondary}</div>
    ${metaBlock}
  `;
}

/**
 * @param {Record<string, unknown>} aggregate
 * @param {{ cases?: Array<Record<string, unknown>> }} [context]
 * @returns {ReturnType<typeof resolveDashboardActionHero>}
 */
function renderDashboardActionHero(aggregate, context = {}) {
  const hero = resolveDashboardActionHero(aggregate, context);
  paintDashboardActionHero(hero);
  return hero;
}

function statusItemClass(state) {
  const s = String(state || "").toLowerCase();
  if (s === "success") return "lhai-dashboard-summary-item--success";
  if (s === "warning") return "lhai-dashboard-summary-item--warning";
  if (s === "info") return "lhai-dashboard-summary-item--info";
  return "";
}

/** @param {string} raw */
function compactDashboardStatusText(raw) {
  return localizeDashboardStatusText(raw);
}

/** @param {Record<string, { label?: string, value?: string, state?: string }>} cardByKey */
function statusCardValue(cardByKey, key, fallback = "—") {
  const card = cardByKey[key];
  return compactDashboardStatusText(card?.value || fallback);
}

/** @param {Record<string, unknown>} aggregate */
function buildDashboardStatusSummaryItems(aggregate) {
  const cards = Array.isArray(aggregate?.status_cards) ? aggregate.status_cards : [];
  /** @type {Record<string, { label?: string, value?: string, state?: string }>} */
  const cardByKey = {};
  for (const card of cards) {
    const key = String(card?.key || "").trim();
    if (key) cardByKey[key] = card;
  }

  const bid = getActiveCarBid(aggregate);
  const docs = Array.isArray(aggregate?.document_status) ? aggregate.document_status : [];
  const scheduleRaw = String(aggregate?.schedule_status || cardByKey.schedule?.value || "").trim();

  /** @type {Array<{ key: string, label: string, value: string, state?: string }>} */
  const items = [
    {
      key: "service",
      label: t("dashboard.summary.service", "Service"),
      value: statusCardValue(cardByKey, "service", aggregate?.current_service_status),
      state: cardByKey.service?.state,
    },
  ];

  if (bid && bid.is_expired !== true) {
    const offerCount = Math.max(0, Number(bid.offer_count) || 0);
    const rl = String(bid.remaining_label || "").trim();
    let quoteValue = t("dashboard.summary.quote_accepting", "Accepting quotes");
    let quoteState = "info";
    if (hasSelectedCarOffer(bid)) {
      quoteValue = t("dashboard.summary.partner_selected", "Partner selected");
      quoteState = "success";
    } else if (offerCount > 0) {
      quoteValue = localizedStatus("dashboard.summary.offers_arrived", "{count} proposals received", {
        count: offerCount,
      });
      quoteState = "info";
    } else if (rl) {
      quoteValue = localizedStatus("dashboard.summary.bidding_remaining", "Bidding · {remaining} left", {
        remaining: rl,
      });
    }
    items.push({
      key: "quote",
      label: t("dashboard.summary.quote", "Quote"),
      value: quoteValue,
      state: quoteState,
    });
  } else if (/quote|견적|approval|비딩|bidding/i.test(statusCardValue(cardByKey, "service", ""))) {
    items.push({
      key: "quote",
      label: t("dashboard.summary.quote", "Quote"),
      value: statusCardValue(cardByKey, "service"),
      state: cardByKey.service?.state,
    });
  }

  items.push({
    key: "payment",
    label: t("dashboard.summary.payment", "Payment"),
    value: compactDashboardStatusText(aggregate?.payment_status || cardByKey.payment?.value),
    state: cardByKey.payment?.state,
  });

  let docValue = statusCardValue(cardByKey, "documents");
  let docNeedsAttention = false;
  if (docs.length > 0) {
    const approved = docs.filter((d) => String(d?.status || "").toUpperCase() === "APPROVED").length;
    const pending = docs.filter((d) => {
      const st = String(d?.status || "").toUpperCase();
      return st === "REQUESTED" || st === "REJECTED";
    }).length;
    docNeedsAttention = pending > 0;
    docValue =
      pending > 0
        ? localizedStatus("dashboard.summary.docs_approved_need", "{approved} approved · {count} need review", {
            approved,
            count: pending,
          })
        : approved > 0
          ? localizedStatus("dashboard.summary.docs_approved_only", "{approved} approved", { approved })
          : t("dashboard.summary.docs_registered", "Registered");
  }
  items.push({
    key: "documents",
    label: t("dashboard.summary.documents", "Documents"),
    value: docValue,
    state: cardByKey.documents?.state || (docNeedsAttention ? "warning" : "neutral"),
  });

  items.push({
    key: "schedule",
    label: t("dashboard.summary.schedule", "Schedule"),
    value: compactDashboardStatusText(scheduleRaw || cardByKey.schedule?.value),
    state: cardByKey.schedule?.state,
  });

  return items;
}

/** @param {Record<string, unknown>} aggregate */
function renderDashboardStatusSummary(aggregate) {
  const target = qs("#dashboardStatusSummary");
  if (!target) return;
  const items = buildDashboardStatusSummaryItems(aggregate);
  if (!items.length) {
    target.innerHTML = `${cardHead(t("dashboard.card.status_title", "My progress"), "", "")}${dashMuted(DASHBOARD_EMPTY.status)}`;
    return;
  }
  const rows = items
    .map(
      (item) => `
    <div class="lhai-dashboard-summary-item ${statusItemClass(item.state)}">
      <span class="lhai-dashboard-summary-item__label">${escHtml(item.label)}</span>
      <span class="lhai-dashboard-summary-item__value">${escHtml(item.value)}</span>
    </div>`,
    )
    .join("");
  target.innerHTML = `${cardHead(t("dashboard.card.status_title", "My progress"), "messages.html", t("dashboard.link.messages", "Messages"))}<div class="lhai-dashboard-summary-grid" role="list">${rows}</div>`;
}

/** @param {Record<string, unknown>} aggregate */
function renderDashboardQuoteSummary(aggregate) {
  const section = qs("#dashboardQuoteSummary");
  if (!section) return;

  const bid = getActiveCarBid(aggregate);
  if (!bid) {
    section.hidden = true;
    section.innerHTML = "";
    return;
  }

  const model = resolveQuoteBidSummaryModel(bid);
  if (!model) {
    section.hidden = true;
    section.innerHTML = "";
    return;
  }

  section.hidden = false;
  const deadlineHtml = model.deadlineLine
    ? `<p class="lhai-dashboard-quote-card__deadline">${escHtml(model.deadlineLine)}</p>`
    : "";
  section.innerHTML = `
    ${cardHead(t("dashboard.card.quote_compare_title", "Quote comparison"), "", "")}
    <h3 class="lhai-dashboard-quote-card__title">${escHtml(model.title)}</h3>
    <p class="lhai-dashboard-quote-card__text">${escHtml(model.text)}</p>
    ${deadlineHtml}
    <a class="lhai-button lhai-button--primary" href="${escHtml(model.cta.href)}">${escHtml(model.cta.label)}</a>
  `;
}

/** @param {string} status */
function normalizeTimelineStepStatusLocal(status) {
  return normalizeTimelineStepStatus(status);
}

/** @param {{ title?: string, status?: string }} item */
function compactTimelineStepLabel(item) {
  return localizeTimelineStepTitle(item);
}

/** @param {string} status */
function compactTimelineStepModifier(status) {
  const st = normalizeTimelineStepStatusLocal(status);
  if (st === "done") return "lhai-dashboard-stepper__item--done";
  if (st === "in_progress") return "lhai-dashboard-stepper__item--active";
  return "lhai-dashboard-stepper__item--pending";
}

/** @param {string} status */
function compactTimelineStepMarker(status) {
  const st = normalizeTimelineStepStatusLocal(status);
  if (st === "pending") return "○";
  return "●";
}

/** @param {string} status */
function compactTimelineDetailStatusLabel(status) {
  const st = normalizeTimelineStepStatusLocal(status);
  if (st === "done") return t("dashboard.timeline.status_done", "Done");
  if (st === "in_progress") return t("dashboard.timeline.status_in_progress", "In progress");
  return t("dashboard.timeline.status_pending", "Upcoming");
}

/** @param {Array<{ title?: string, due_date?: string, dueDate?: string, status?: string }>} timelineItems */
function renderCompactProgressStepper(timelineItems = []) {
  const target = qs("#dashboardProgressStepper");
  if (!target) return;
  const list = (Array.isArray(timelineItems) ? timelineItems : []).slice(0, 5);
  if (!list.length) {
    target.innerHTML = `${cardHead(t("dashboard.card.progress_title", "Progress steps"), "schedule.html", t("dashboard.link.schedule", "Schedule"))}${dashMuted(DASHBOARD_EMPTY.progress)}`;
    return;
  }

  const compactSteps = list
    .map(
      (item) => `
    <li class="lhai-dashboard-stepper__item ${compactTimelineStepModifier(item.status)}">
      <span class="lhai-dashboard-stepper__dot" aria-hidden="true">${compactTimelineStepMarker(item.status)}</span>
      <span class="lhai-dashboard-stepper__label">${escHtml(compactTimelineStepLabel(item))}</span>
    </li>`,
    )
    .join("");

  const detailRows = list
    .map((item) => {
      const due = String(item.due_date || item.dueDate || "").trim();
      const duePart = due ? ` · ${escHtml(due)}` : "";
      return `<li><span class="lhai-dashboard-stepper__detail-title">${escHtml(localizeTimelineStepTitle(item))}</span><span class="u-text-muted">${escHtml(compactTimelineDetailStatusLabel(item.status))}${duePart}</span></li>`;
    })
    .join("");

  target.innerHTML = `
    ${cardHead(t("dashboard.card.progress_title", "Progress steps"), "schedule.html", t("dashboard.link.schedule", "Schedule"))}
    <ol class="lhai-dashboard-stepper" aria-label="${escHtml(t("dashboard.card.progress_aria", "Progress summary"))}">${compactSteps}</ol>
    <details class="lhai-dashboard-stepper__more">
      <summary>${escHtml(t("dashboard.link.show_details", "Show details"))}</summary>
      <ul class="lhai-dashboard-stepper__details-list">${detailRows}</ul>
    </details>
  `;
}

/** @param {Record<string, unknown>} aggregate */
function renderRecentUpdates(aggregate) {
  const target = qs("#dashboardRecentUpdates");
  if (!target) return;

  const rows = buildMergedRecentUpdates(aggregate);
  if (!rows.length) {
    target.innerHTML = `${cardHead(t("dashboard.card.recent_updates_title", "Recent updates"), "messages.html", t("dashboard.link.open_messages", "Open messages"))}${dashMuted(DASHBOARD_EMPTY.recentUpdates)}`;
    return;
  }

  const html = rows
    .map((row) => {
      const timeHtml = row.timestamp
        ? `<time class="lhai-dashboard-update__time" datetime="">${escHtml(row.timestamp)}</time>`
        : "";
      return `
    <li class="lhai-dashboard-update">
      <div class="lhai-dashboard-update__head">
        <strong class="lhai-dashboard-update__title">${escHtml(row.title)}</strong>
        ${timeHtml}
      </div>
      ${row.description ? `<p class="lhai-dashboard-update__desc">${escHtml(row.description)}</p>` : ""}
    </li>`;
    })
    .join("");

  target.innerHTML = `${cardHead(t("dashboard.card.recent_updates_title", "Recent updates"), "messages.html", t("dashboard.link.open_messages", "Open messages"))}<ul class="lhai-dashboard-updates-list">${html}</ul>`;
}

/** @param {Record<string, unknown>} [aggregate] */
function renderDocumentsCompact(aggregate = {}) {
  const target = qs("#dashboardDocumentsCompact");
  if (!target) return;
  const { approved, needsAttention, total } = summarizeDocumentCounts(aggregate);
  const statLine = localizedStatus(
    "dashboard.documents.stat_line",
    "{approved} approved · {needsAttention} need review",
    { approved, needsAttention }
  );
  const hint =
    total === 0 ? `<p class="lhai-dashboard-compact-hint">${escHtml(DASHBOARD_EMPTY.documents)}</p>` : "";
  target.innerHTML = `
    ${cardHead(t("dashboard.card.documents_title", "Documents"), "documents.html", t("dashboard.link.view_documents", "View documents"))}
    <p class="lhai-dashboard-compact-stat">${escHtml(statLine)}</p>
    ${hint}
  `;
}

/** @param {Record<string, unknown>} [summary] */
function renderChecklistCompact(summary) {
  const target = qs("#dashboardChecklistCompact");
  if (!target) return;
  const total = Number(summary?.total) || 0;
  const completed = Number(summary?.completed) || 0;
  const requiredLeft = Number(summary?.required_remaining) || 0;
  const statLine = localizedStatus(
    "dashboard.checklist.stat_line",
    "{completed} done · {requiredLeft} required left",
    { completed, requiredLeft }
  );

  let hint = "";
  if (total === 0) {
    hint = DASHBOARD_EMPTY.checklistNone;
  } else if (requiredLeft === 0) {
    hint = DASHBOARD_EMPTY.checklistDone;
  }

  target.innerHTML = `
    ${cardHead(t("dashboard.card.checklist_title", "Checklist"), "", "")}
    <p class="lhai-dashboard-compact-stat">${escHtml(statLine)}</p>
    ${hint ? `<p class="lhai-dashboard-compact-hint">${escHtml(hint)}</p>` : ""}
  `;
}

function renderCasesCompact(items) {
  const target = qs("#dashboardCasesCompact");
  if (!target) return;
  const rows = Array.isArray(items) ? [...items] : [];
  rows.sort((a, b) => {
    const ta = a.last_activity_at ? new Date(a.last_activity_at).getTime() : 0;
    const tb = b.last_activity_at ? new Date(b.last_activity_at).getTime() : 0;
    return tb - ta;
  });
  const top = rows.slice(0, 4);
  if (!top.length) {
    target.innerHTML = `${cardHead(t("dashboard.card.cases_title", "Service inquiries"), "cases.html", t("dashboard.link.start_inquiry", "Start inquiry"))}${dashMuted(DASHBOARD_EMPTY.cases)}`;
    return;
  }
  const html = top
    .map((c) => {
      const href = `case-detail.html?case_id=${encodeURIComponent(c.case_id)}`;
      const title = customerCaseDisplayTitle(c);
      const label = customerCaseDisplayStatusLabel(c);
      const badgeClass = customerCaseStatusBadgeClass(c);
      return `<li><a href="${escHtml(href)}"><span class="lhai-dashboard-case-list__title">${escHtml(title)}</span><span class="lhai-case-badge ${badgeClass}">${escHtml(label)}</span></a></li>`;
    })
    .join("");
  target.innerHTML = `${cardHead(t("dashboard.card.cases_title", "Service inquiries"), "cases.html", t("dashboard.link.view_all_cases", "View all"))}<ul class="lhai-dashboard-case-list">${html}</ul>`;
}

function removeLegacyDashboardAiButton() {
  const legacyAiBtn = qs("#aiQuickLinkBtn");
  if (legacyAiBtn) legacyAiBtn.remove();
}

/** @param {string} title */
function updateDashboardHeaderSubtitle(title) {
  const subtitle = qs("#dashboardHeaderSubtitle");
  if (subtitle instanceof HTMLElement) {
    subtitle.textContent = title;
  }
}

/**
 * active_car_bid 변경 시 — Hero / 상태 / 견적 카드 / 사이드바 badge만 갱신.
 * @param {Record<string, unknown>} aggregate
 * @param {{ cases?: Array<Record<string, unknown>> }} [context]
 */
function refreshDashboardBidSections(aggregate, context = {}) {
  const hero = renderDashboardActionHero(aggregate, context);
  renderDashboardStatusSummary(aggregate);
  renderDashboardQuoteSummary(aggregate);
  applyCustomerQuoteNavFromAggregate(aggregate, document);
  updateDashboardHeaderSubtitle(hero.title);
}

/**
 * 대시보드 본문 섹션 렌더 (Prompt 12 순서).
 * @param {Record<string, unknown>} aggregate
 * @param {{ timelineItems?: Array<unknown>, checklist?: Record<string, unknown>, caseItems?: Array<Record<string, unknown>> }} sections
 */
function renderDashboardPageSections(aggregate, sections = {}) {
  const timelineItems = Array.isArray(sections.timelineItems) ? sections.timelineItems : [];
  const checklist = sections.checklist ?? normalizeChecklistSummary(aggregate);
  const caseItems = Array.isArray(sections.caseItems) ? sections.caseItems : [];

  removeLegacyDashboardAiButton();

  const hero = renderDashboardActionHero(aggregate, { cases: caseItems });
  renderDashboardStatusSummary(aggregate);
  renderDashboardQuoteSummary(aggregate);
  renderCompactProgressStepper(timelineItems);
  renderRecentUpdates(aggregate);
  renderDocumentsCompact(aggregate);
  renderChecklistCompact(checklist);
  renderCasesCompact(caseItems);

  updateDashboardHeaderSubtitle(hero.title);
  applyCustomerQuoteNavFromAggregate(aggregate, document);
}

function syncDashboardBrowserStorageFromAggregate(aggregate) {
  const pay = String(aggregate?.payment_status || "").trim();
  try {
    window.localStorage.setItem("lhai_dashboard_summary", JSON.stringify({ paymentStatus: pay, lastInvoiceId: "" }));
    if (pay !== "Paid" && pay !== "Payment due") {
      window.localStorage.removeItem("lhai_latest_invoice_id");
    }
  } catch {
    /* ignore */
  }
}

let dashboardDevResetStorageBound = false;
function bindDashboardCrossTabRefreshAfterDevReset() {
  if (dashboardDevResetStorageBound) return;
  dashboardDevResetStorageBound = true;
  window.addEventListener("storage", (e) => {
    if (e.key !== "lhai_dev_data_reset_at") return;
    window.location.reload();
  });
}

function renderDashboardError() {
  paintDashboardActionHero({
    eyebrow: t("dashboard.error.eyebrow", "Notice"),
    title: t("dashboard.error.title", "Could not load dashboard"),
    text: t("dashboard.error.text", "Please try again in a moment."),
    primary: { label: t("dashboard.error.refresh", "Refresh"), href: "dashboard.html" },
    secondary: null,
    badges: [],
    meta: null,
  });
  renderDashboardStatusSummary({});
  renderDashboardQuoteSummary({});
  renderCompactProgressStepper([]);
  renderRecentUpdates({});
  renderDocumentsCompact({ documents_summary: { approved_count: 0, needs_attention_count: 0, total_count: 0 } });
  renderChecklistCompact({ total: 0, completed: 0, required_remaining: 0, next_required_item: "" });
  renderCasesCompact([]);
}

/** @param {Record<string, unknown>} aggregate @param {Array<unknown>} timelineItems @param {Record<string, unknown>} checklist @param {Array<unknown>} caseItems */
function renderDashboardView(aggregate, timelineItems, checklist, caseItems) {
  renderDashboardPageSections(aggregate, { timelineItems, checklist, caseItems });
}

let dashboardBidUpdateListenerBound = false;

/** @type {{ aggregate: Record<string, unknown>; timelineItems: unknown[]; checklistSummary: Record<string, unknown>; caseItems: Array<Record<string, unknown>> } | null} */
let dashboardViewCache = null;
/** @type {string | null} */
let dashboardCasesViewerLocale = null;
let dashboardLanguageCaseRefetchPending = false;
let dashboardLanguageCaseRefetchBound = false;

function setDashboardViewCache(aggregate, sections = {}) {
  dashboardViewCache = {
    aggregate: aggregate ?? {},
    timelineItems: Array.isArray(sections.timelineItems) ? sections.timelineItems : [],
    checklistSummary: sections.checklist ?? normalizeChecklistSummary(aggregate ?? {}),
    caseItems: Array.isArray(sections.caseItems) ? sections.caseItems : [],
  };
  dashboardCasesViewerLocale = getEffectiveLanguage();
}

/** Rerender cached dashboard sections for static UI keys (no case API refetch). */
function refreshDashboardStaticPageI18n() {
  if (!dashboardViewCache) return;
  if (dashboardLanguageCaseRefetchPending) return;
  const { aggregate, timelineItems, checklistSummary, caseItems } = dashboardViewCache;
  renderDashboardPageSections(aggregate, {
    timelineItems,
    checklist: checklistSummary,
    caseItems,
  });
  const dashboardRoot = document.querySelector(".lhai-dashboard");
  if (dashboardRoot) {
    applyI18nToDom(dashboardRoot);
  }
  scheduleDashboardRuntimeI18nFlush();
}

async function refetchDashboardCaseItemsForLanguage() {
  if (!dashboardViewCache) return;
  dashboardCasesViewerLocale = getEffectiveLanguage();
  try {
    const caseItems = await customerCasesApi.list();
    dashboardViewCache.caseItems = Array.isArray(caseItems) ? caseItems : [];
  } catch {
    /* keep cached case rows */
  }
}

async function handleDashboardLanguageChanged() {
  if (!dashboardViewCache) return;
  dashboardLanguageCaseRefetchPending = true;
  try {
    await refetchDashboardCaseItemsForLanguage();
  } finally {
    dashboardLanguageCaseRefetchPending = false;
  }
  if (!dashboardViewCache) return;
  renderCasesCompact(dashboardViewCache.caseItems);
  refreshDashboardStaticPageI18n();
}

function bindDashboardLanguageCaseRefetch() {
  if (dashboardLanguageCaseRefetchBound) return;
  dashboardLanguageCaseRefetchBound = true;
  window.addEventListener("lhai:language-changed", () => {
    void handleDashboardLanguageChanged();
  });
}

function refreshDashboardPageI18n() {
  refreshDashboardStaticPageI18n();
}

function scheduleDashboardRuntimeI18nFlush() {
  void flushRuntimeMissingKeysAfterPageApply();
}

bindDashboardLanguageCaseRefetch();

wireDynamicPageI18nRefresh(refreshDashboardStaticPageI18n, {
  shouldRefresh: (detail) => dashboardRuntimeResolveTouches(detail?.keys),
});

function bindDashboardBidUpdateListener(customerProfileId, getContext) {
  if (dashboardBidUpdateListenerBound) return;
  dashboardBidUpdateListenerBound = true;

  window.addEventListener("lhai:customer-bid-updated", () => {
    void (async () => {
      try {
        const aggregate = await dashboardApi.getAggregate(customerProfileId);
        const ctx = typeof getContext === "function" ? await getContext() : {};
        if (dashboardViewCache) {
          dashboardViewCache.aggregate = aggregate;
          if (Array.isArray(ctx.cases)) {
            dashboardViewCache.caseItems = ctx.cases;
          }
        }
        refreshDashboardBidSections(aggregate, ctx);
      } catch {
        /* ignore */
      }
    })();
  });
}

async function initDashboardPage() {
  if (getCurrentRole() === ROLES.PARTNER) {
    window.location.replace("partner-dashboard.html");
    return;
  }
  if (!protectCurrentPage()) return;
  if (!ensureCustomerAccess()) return;
  bindDashboardCrossTabRefreshAfterDevReset();
  await appPageLanguageReady;
  await loadSidebar("#sidebar", "customer");

  const customerProfileId = getCustomerMessagingProfileId();
  /** @type {Record<string, unknown>} */
  let dashboardAggregate;
  /** @type {Array<unknown>} */
  let timelineItems;
  /** @type {Record<string, unknown>} */
  let checklistSummary;
  /** @type {Array<Record<string, unknown>>} */
  let caseItems;

  try {
    [dashboardAggregate, timelineItems, caseItems] = await Promise.all([
      dashboardApi.getAggregate(customerProfileId),
      timelineApi.listByCustomer(customerProfileId),
      customerCasesApi.list(),
    ]);
    checklistSummary = normalizeChecklistSummary(dashboardAggregate);
  } catch {
    setDashboardViewCache({}, { timelineItems: [], checklist: {}, caseItems: [] });
    renderDashboardError();
    refreshDashboardPageI18n();
    scheduleDashboardRuntimeI18nFlush();
    return;
  }

  patchState({
    customer: { id: customerProfileId },
    timeline: timelineItems,
    checklist: [],
    dashboardSummary: {
      paymentStatus: String(dashboardAggregate.payment_status || ""),
      lastInvoiceId: "",
    },
  });

  syncDashboardBrowserStorageFromAggregate(dashboardAggregate);

  setDashboardViewCache(dashboardAggregate, {
    timelineItems,
    checklist: checklistSummary,
    caseItems,
  });
  renderDashboardPageSections(dashboardAggregate, {
    timelineItems,
    checklist: checklistSummary,
    caseItems,
  });
  refreshDashboardPageI18n();
  scheduleDashboardRuntimeI18nFlush();

  bindDashboardBidUpdateListener(customerProfileId, async () => ({
    cases: await customerCasesApi.list(),
  }));
}

initDashboardPage();

export {
  initDashboardPage,
  renderDashboardView,
  renderDashboardPageSections,
  refreshDashboardBidSections,
  refreshDashboardPageI18n,
  renderDashboardActionHero,
  resolveDashboardActionHero,
  renderDashboardStatusSummary,
  buildDashboardStatusSummaryItems,
  renderDashboardQuoteSummary,
  resolveQuoteBidSummaryModel,
  renderCompactProgressStepper,
  renderRecentUpdates,
  buildMergedRecentUpdates,
  renderDocumentsCompact,
  renderChecklistCompact,
  summarizeDocumentCounts,
  normalizeChecklistSummary,
  resolveActiveCarBidCompareHref,
  buildCustomerBidResultsPageHref,
  documentsNeedCustomerAttention,
  getActiveCarBid,
  hasSelectedCarOffer,
  localizeDashboardStatusText,
  localizeTimelineStepTitle,
  customerCaseDisplayTitle,
  customerCaseDisplaySubtitle,
  customerCaseDisplayStatusLabel,
  customerCaseStatusLabel,
  DASHBOARD_EMPTY,
};
