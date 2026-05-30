import { customerCasesApi, dashboardApi, timelineApi } from "../core/api.js";
import {
  DASHBOARD_EMPTY,
  buildCustomerBidResultsPageHref,
  documentsNeedCustomerAttention,
  getActiveCarBid,
  hasSelectedCarOffer,
  normalizeChecklistSummary,
  resolveActiveCarBidCompareHref,
  resolveDashboardActionHero,
  resolveQuoteBidSummaryModel,
  summarizeDocumentCounts,
} from "./dashboard-logic.js";
import { getCurrentRole, getCustomerMessagingProfileId } from "../core/auth.js";
import { ROLES } from "../core/config.js";
import { ensureCustomerAccess, protectCurrentPage } from "../core/guards.js";
import { patchState } from "../core/state.js";
import { loadSidebar } from "../components/sidebar.js";
import { applyCustomerQuoteNavFromAggregate } from "../components/customer-quote-nav.js";
import { t } from "../core/i18n-client.js";
import { initCommonI18nAndApplyDom } from "../core/i18n-dom.js";

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

function customerCaseStatusLabel(item) {
  const kind = String(item?.case_kind || "");
  if (kind === "messaging") {
    return item.unread ? "새 메시지" : "진행 중";
  }
  const tab = String(item?.queue_tab || "").toLowerCase();
  if (tab === "resolved") return "완료";
  if (tab === "waiting_customer") return "고객 확인 대기";
  if (tab === "action_required") return "운영 확인 중";
  const raw = String(item?.case_status || item?.queue_status || "").trim();
  if (raw) return raw.replace(/_/g, " ");
  return "진행 중";
}

/** @param {ReturnType<typeof resolveDashboardActionHero>} hero */
function paintDashboardActionHero(hero) {
  const target = qs("#dashboardActionHero");
  if (!target || !hero) return;
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
  const v = String(raw || "").trim();
  if (!v) return "—";
  const exact = {
    "Active — delivery in progress": "진행 중",
    "Awaiting payment": "결제 대기",
    "Quote pending your approval": "견적 검토",
    "Quote approved — billing next": "견적 승인",
    "Quote in progress": "견적 준비",
    "Request under review": "검토 중",
    "Getting started": "시작 전",
    Paid: "완료",
    "Payment due": "결제 필요",
    "No invoice yet": "청구 전",
    "Before payment": "결제 전",
    "Not scheduled": "미정",
    "Not scheduled yet": "미정",
    "After payment": "결제 후",
    "After quote approval": "견적 승인 후",
    "Draft / TBD": "준비 중",
    "No documents yet": "없음",
    DRAFT: "초안",
    CONFIRMED: "확정",
    SENT: "발송됨",
  };
  if (exact[v]) return exact[v];
  const approvedNeed = v.match(/^(\d+)\s+approved,\s*(\d+)\s+need attention$/i);
  if (approvedNeed) {
    const a = approvedNeed[1];
    const n = approvedNeed[2];
    return Number(n) > 0 ? `${a}개 승인 · ${n}건 확인` : `${a}개 승인됨`;
  }
  const stripped = v.replace(/\s*·\s*비딩\s+.+$/u, "").trim();
  if (stripped.length <= 28) return stripped;
  return `${stripped.slice(0, 26)}…`;
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
      label: "서비스",
      value: statusCardValue(cardByKey, "service", aggregate?.current_service_status),
      state: cardByKey.service?.state,
    },
  ];

  if (bid && bid.is_expired !== true) {
    const offerCount = Math.max(0, Number(bid.offer_count) || 0);
    const rl = String(bid.remaining_label || "").trim();
    let quoteValue = "견적 접수 중";
    let quoteState = "info";
    if (hasSelectedCarOffer(bid)) {
      quoteValue = "파트너 선택됨";
      quoteState = "success";
    } else if (offerCount > 0) {
      quoteValue = `제안 ${offerCount}개 도착`;
      quoteState = "info";
    } else if (rl) {
      quoteValue = rl.includes("남음") ? `비딩 ${rl}` : `비딩 ${rl} 남음`;
    }
    items.push({ key: "quote", label: "견적", value: quoteValue, state: quoteState });
  } else if (/quote|견적|approval|비딩/i.test(statusCardValue(cardByKey, "service", ""))) {
    items.push({
      key: "quote",
      label: "견적",
      value: statusCardValue(cardByKey, "service"),
      state: cardByKey.service?.state,
    });
  }

  items.push({
    key: "payment",
    label: "결제",
    value: compactDashboardStatusText(aggregate?.payment_status || cardByKey.payment?.value),
    state: cardByKey.payment?.state,
  });

  let docValue = statusCardValue(cardByKey, "documents");
  if (docs.length > 0) {
    const approved = docs.filter((d) => String(d?.status || "").toUpperCase() === "APPROVED").length;
    const pending = docs.filter((d) => {
      const st = String(d?.status || "").toUpperCase();
      return st === "REQUESTED" || st === "REJECTED";
    }).length;
    docValue = pending > 0 ? `${approved}개 승인 · ${pending}건 확인` : approved > 0 ? `${approved}개 승인됨` : "등록됨";
  }
  items.push({
    key: "documents",
    label: "문서",
    value: docValue,
    state: cardByKey.documents?.state || (docValue.includes("확인") ? "warning" : "neutral"),
  });

  items.push({
    key: "schedule",
    label: "일정",
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
    target.innerHTML = `${cardHead("내 진행 상태", "", "")}${dashMuted(DASHBOARD_EMPTY.status)}`;
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
  target.innerHTML = `${cardHead("내 진행 상태", "messages.html", "메시지함")}<div class="lhai-dashboard-summary-grid" role="list">${rows}</div>`;
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
    ${cardHead("견적 비교", "", "")}
    <h3 class="lhai-dashboard-quote-card__title">${escHtml(model.title)}</h3>
    <p class="lhai-dashboard-quote-card__text">${escHtml(model.text)}</p>
    ${deadlineHtml}
    <a class="lhai-button lhai-button--primary" href="${escHtml(model.cta.href)}">${escHtml(model.cta.label)}</a>
  `;
}

/** @param {string} status */
function normalizeTimelineStepStatus(status) {
  const s = String(status || "").toLowerCase();
  if (s === "done" || s === "completed") return "done";
  if (s === "in_progress" || s === "active") return "in_progress";
  return "pending";
}

/** @param {{ title?: string, status?: string }} item */
function compactTimelineStepLabel(item) {
  const title = String(item.title || "").trim();
  const st = normalizeTimelineStepStatus(item.status);
  const byTitle = {
    "service request received": "요청 접수",
    "quote review and approval": st === "done" ? "견적 승인" : "견적 검토",
    "invoice payment": st === "done" ? "결제 완료" : st === "in_progress" ? "결제 진행" : "결제",
    "schedule and delivery": st === "done" ? "일정 확정" : "일정/서비스 진행",
  };
  const key = title.toLowerCase();
  if (byTitle[key]) return byTitle[key];
  if (title.length <= 24) return title;
  return `${title.slice(0, 22)}…`;
}

/** @param {string} status */
function compactTimelineStepModifier(status) {
  const st = normalizeTimelineStepStatus(status);
  if (st === "done") return "lhai-dashboard-stepper__item--done";
  if (st === "in_progress") return "lhai-dashboard-stepper__item--active";
  return "lhai-dashboard-stepper__item--pending";
}

/** @param {string} status */
function compactTimelineStepMarker(status) {
  const st = normalizeTimelineStepStatus(status);
  if (st === "pending") return "○";
  return "●";
}

/** @param {string} status */
function compactTimelineDetailStatusLabel(status) {
  const st = normalizeTimelineStepStatus(status);
  if (st === "done") return "완료";
  if (st === "in_progress") return "진행 중";
  return "예정";
}

/** @param {Array<{ title?: string, due_date?: string, dueDate?: string, status?: string }>} timelineItems */
function renderCompactProgressStepper(timelineItems = []) {
  const target = qs("#dashboardProgressStepper");
  if (!target) return;
  const list = (Array.isArray(timelineItems) ? timelineItems : []).slice(0, 5);
  if (!list.length) {
    target.innerHTML = `${cardHead("진행 단계", "schedule.html", "일정")}${dashMuted(DASHBOARD_EMPTY.progress)}`;
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
      return `<li><span class="lhai-dashboard-stepper__detail-title">${escHtml(item.title || "")}</span><span class="u-text-muted">${escHtml(compactTimelineDetailStatusLabel(item.status))}${duePart}</span></li>`;
    })
    .join("");

  target.innerHTML = `
    ${cardHead("진행 단계", "schedule.html", "일정")}
    <ol class="lhai-dashboard-stepper" aria-label="진행 단계 요약">${compactSteps}</ol>
    <details class="lhai-dashboard-stepper__more">
      <summary>자세히 보기</summary>
      <ul class="lhai-dashboard-stepper__details-list">${detailRows}</ul>
    </details>
  `;
}

/** @param {string} dateLike */
function formatRecentUpdateTimestamp(dateLike) {
  if (!dateLike) return "";
  const date = new Date(dateLike);
  if (Number.isNaN(date.getTime())) return "";
  try {
    return new Intl.DateTimeFormat("ko-KR", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(date);
  } catch {
    return "";
  }
}

/** @param {string} text */
function shortenUpdateText(text, max = 96) {
  const v = String(text || "").trim().replace(/\s+/g, " ");
  if (!v) return "";
  return v.length <= max ? v : `${v.slice(0, max - 1)}…`;
}

/** @param {string} line @param {number} index */
function activityLineToRecentUpdate(line, index) {
  const raw = String(line || "").trim();
  if (!raw) return null;
  const lower = raw.toLowerCase();
  const sortAt = Date.now() - (index + 1) * 3_600_000;

  if (lower.includes("invoice is paid") || lower.includes("at least one invoice is paid")) {
    return {
      id: `act:paid:${index}`,
      title: "결제가 완료되었습니다",
      description: "서비스 진행 단계로 이동했습니다.",
      sortAt,
      timestamp: "",
    };
  }
  if (lower.includes("complete payment")) {
    return {
      id: `act:pay-due:${index}`,
      title: "결제가 필요합니다",
      description: "청구서를 확인하고 결제를 완료해 주세요.",
      sortAt,
      timestamp: "",
    };
  }
  if (lower.includes("latest quote") && lower.includes("proposed")) {
    return {
      id: `act:quote-proposed:${index}`,
      title: "견적이 도착했습니다",
      description: "견적 내용을 검토해 주세요.",
      sortAt,
      timestamp: "",
    };
  }
  if (lower.includes("latest quote") && lower.includes("approved")) {
    return {
      id: `act:quote-approved:${index}`,
      title: "견적이 승인되었습니다",
      description: "청구서 발행을 기다려 주세요.",
      sortAt,
      timestamp: "",
    };
  }
  if (lower.includes("latest invoice") && lower.includes("sent")) {
    return {
      id: `act:invoice-sent:${index}`,
      title: "청구서가 발송되었습니다",
      description: "메시지함에서 결제를 진행할 수 있습니다.",
      sortAt,
      timestamp: "",
    };
  }
  if (/bid|bidding|car purchase|vehicle/i.test(raw)) {
    return {
      id: `act:bid:${index}`,
      title: "자동차 견적 요청이 시작되었습니다",
      description: "파트너 제안이 도착하면 알려 드립니다.",
      sortAt,
      timestamp: "",
    };
  }
  if (/intake|required|checklist|survey/i.test(raw)) {
    return {
      id: `act:intake:${index}`,
      title: "필수 정보 입력이 완료되었습니다",
      description: "다음 단계 안내를 확인해 주세요.",
      sortAt,
      timestamp: "",
    };
  }

  return {
    id: `act:raw:${index}`,
    title: "서비스 업데이트",
    description: shortenUpdateText(raw),
    sortAt,
    timestamp: "",
  };
}

/** @param {{ title?: string, description?: string }} item */
function recentUpdateDedupeKey(item) {
  return `${String(item.title || "").trim()}|${String(item.description || "").trim()}`.toLowerCase();
}

/** @param {Record<string, unknown>} aggregate */
function buildMergedRecentUpdates(aggregate) {
  const backendRows = Array.isArray(aggregate?.recent_updates) ? aggregate.recent_updates : [];
  if (backendRows.length) {
    return backendRows.slice(0, 3).map((row, index) => {
      const createdAt = row?.timestamp;
      const sortAt = new Date(createdAt || 0).getTime();
      return {
        id: String(row?.id || `upd:${index}`),
        title: String(row?.title || "업데이트").trim() || "업데이트",
        description: shortenUpdateText(row?.description),
        sortAt: Number.isFinite(sortAt) ? sortAt : 0,
        timestamp: formatRecentUpdateTimestamp(createdAt),
      };
    });
  }

  /** @type {Array<{ id: string, title: string, description: string, sortAt: number, timestamp: string }>} */
  const items = [];

  for (const message of Array.isArray(aggregate?.recent_messages) ? aggregate.recent_messages : []) {
    const title = String(message.title || "메시지").trim();
    const description = shortenUpdateText(message.preview);
    const createdAt = message.created_at;
    const sortAt = new Date(createdAt || 0).getTime();
    items.push({
      id: `msg:${message.id || title}`,
      title,
      description,
      sortAt: Number.isFinite(sortAt) ? sortAt : 0,
      timestamp: formatRecentUpdateTimestamp(createdAt),
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

/** @param {Record<string, unknown>} aggregate */
function renderRecentUpdates(aggregate) {
  const target = qs("#dashboardRecentUpdates");
  if (!target) return;

  const rows = buildMergedRecentUpdates(aggregate);
  if (!rows.length) {
    target.innerHTML = `${cardHead("최근 업데이트", "messages.html", "메시지함 열기")}${dashMuted(DASHBOARD_EMPTY.recentUpdates)}`;
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

  target.innerHTML = `${cardHead("최근 업데이트", "messages.html", "메시지함 열기")}<ul class="lhai-dashboard-updates-list">${html}</ul>`;
}

/** @param {Record<string, unknown>} [aggregate] */
function renderDocumentsCompact(aggregate = {}) {
  const target = qs("#dashboardDocumentsCompact");
  if (!target) return;
  const { approved, needsAttention, total } = summarizeDocumentCounts(aggregate);
  const statLine = `승인됨 ${approved}개 · 확인 필요 ${needsAttention}개`;
  const hint =
    total === 0 ? `<p class="lhai-dashboard-compact-hint">${escHtml(DASHBOARD_EMPTY.documents)}</p>` : "";
  target.innerHTML = `
    ${cardHead("문서", "documents.html", "문서 보기")}
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
  const statLine = `완료 ${completed}개 · 남은 필수 ${requiredLeft}개`;

  let hint = "";
  if (total === 0) {
    hint = DASHBOARD_EMPTY.checklistNone;
  } else if (requiredLeft === 0) {
    hint = DASHBOARD_EMPTY.checklistDone;
  }

  target.innerHTML = `
    ${cardHead("체크리스트", "", "")}
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
    target.innerHTML = `${cardHead("서비스 문의", "cases.html", "문의 시작")}${dashMuted(DASHBOARD_EMPTY.cases)}`;
    return;
  }
  const html = top
    .map((c) => {
      const href = `case-detail.html?case_id=${encodeURIComponent(c.case_id)}`;
      const label = customerCaseStatusLabel(c);
      const badgeClass = customerCaseStatusBadgeClass(c);
      return `<li><a href="${escHtml(href)}"><span class="lhai-dashboard-case-list__title">${escHtml(c.title || "문의")}</span><span class="lhai-case-badge ${badgeClass}">${escHtml(label)}</span></a></li>`;
    })
    .join("");
  target.innerHTML = `${cardHead("서비스 문의", "cases.html", "전체 보기")}<ul class="lhai-dashboard-case-list">${html}</ul>`;
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
    eyebrow: "안내",
    title: "대시보드를 불러오지 못했습니다",
    text: t("common.dashboard.load_error", "잠시 후 다시 시도해 주세요."),
    primary: { label: "새로고침", href: "dashboard.html" },
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

function bindDashboardBidUpdateListener(customerProfileId, getContext) {
  if (dashboardBidUpdateListenerBound) return;
  dashboardBidUpdateListenerBound = true;

  window.addEventListener("lhai:customer-bid-updated", () => {
    void (async () => {
      try {
        const aggregate = await dashboardApi.getAggregate(customerProfileId);
        const ctx = typeof getContext === "function" ? await getContext() : {};
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
  await initCommonI18nAndApplyDom(document);
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
    renderDashboardError();
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

  removeLegacyDashboardAiButton();
  const hero = renderDashboardActionHero(dashboardAggregate, { cases: caseItems });
  renderDashboardStatusSummary(dashboardAggregate);
  renderDashboardQuoteSummary(dashboardAggregate);
  renderCompactProgressStepper(timelineItems);
  renderRecentUpdates(dashboardAggregate);
  renderDocumentsCompact(dashboardAggregate);
  renderChecklistCompact(checklistSummary);
  renderCasesCompact(caseItems);
  updateDashboardHeaderSubtitle(hero.title);
  applyCustomerQuoteNavFromAggregate(dashboardAggregate, document);

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
  DASHBOARD_EMPTY,
};
