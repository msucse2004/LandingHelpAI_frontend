/**
 * 고객 대시보드 — 순수 로직 (QA·단위 테스트용, DOM 없음).
 */
import { buildCustomerBidResultsPageHref } from "./customer-bid-results-logic.js";

/** 고객 대시보드 empty 카피 (개발자 문구·「Empty:」 금지) */
export const DASHBOARD_EMPTY = {
  recentUpdates: "아직 새 업데이트가 없습니다.",
  recentMessages: "새 메시지가 없습니다.",
  recentActivity: "최근 활동이 없습니다.",
  documents: "문서가 없습니다.",
  checklistNone: "아직 필요한 항목이 없습니다.",
  checklistDone: "필요한 항목이 모두 완료되었습니다.",
  quoteWaitingTitle: "아직 도착한 견적이 없습니다",
  quoteWaitingText: "파트너가 제안을 제출하면 이곳에서 비교할 수 있습니다.",
  status: "진행 정보가 아직 없습니다.",
  progress: "진행 단계가 아직 없습니다.",
  cases: "진행 중인 문의가 없습니다.",
};

/** @returns {Record<string, unknown> | null} */
export function getActiveCarBid(aggregate) {
  const bid = aggregate?.active_car_bid;
  if (!bid || typeof bid !== "object") return null;
  if (bid.exists === false) return null;
  return bid;
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
    return { hidden: false, text: "선택됨", selected: true };
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
    ? `비딩 마감까지 ${rl} 남았습니다.`
    : "비딩 마감 시간을 확인해 주세요.";
  const offerCount = Math.max(0, Number(bid?.offer_count) || 0);
  const partnerCount = Math.max(0, Number(bid?.partner_count) || 0);
  const cases = Array.isArray(context.cases) ? context.cases : [];
  const hasUnreadMessages = cases.some((c) => c && c.unread);
  const recentMessages = Array.isArray(aggregate?.recent_messages) ? aggregate.recent_messages : [];

  const heroBase = { eyebrow: "지금 할 일", secondary: null, badges: [] };

  if (bid && hasSelectedCarOffer(bid)) {
    return {
      ...heroBase,
      title: "파트너 선택이 완료되었습니다",
      text: "선택한 파트너와 메시지로 다음 단계를 진행하세요.",
      primary: { label: "메시지함 열기", href: "messages.html" },
      meta: null,
    };
  }

  if (bid && offerCount > 0 && bidHref.includes("customer-bid-results.html")) {
    return {
      ...heroBase,
      title: "차량 견적이 도착하고 있어요",
      text: `파트너가 제출한 차량 제안을 비교해 보세요. ${rlInText}`,
      primary: { label: "견적 비교하기", href: bidHref },
      meta: `도착한 제안 ${offerCount}개 · 참여 파트너 ${partnerCount}명 · 견적 접수 중`,
    };
  }

  if (bid && offerCount === 0 && bidHref.includes("customer-bid-results.html")) {
    return {
      ...heroBase,
      title: "견적을 기다리는 중입니다",
      text: `파트너가 제안을 제출하면 이곳에서 비교할 수 있습니다. ${rlInText}`,
      primary: { label: "견적 상태 보기", href: bidHref },
      meta: partnerCount > 0 ? `참여 파트너 ${partnerCount}명 · 제안 대기 중` : "제안 대기 중",
    };
  }

  const payment = String(aggregate?.payment_status || "").trim();
  if (payment === "Payment due") {
    return {
      ...heroBase,
      title: "결제가 필요합니다",
      text: "서비스 진행을 위해 청구서를 확인하고 결제를 완료해 주세요.",
      primary: { label: "청구서 확인하기", href: "messages.html" },
      meta: null,
      badges: [{ label: payment, tone: "warning" }],
    };
  }

  if (documentsNeedCustomerAttention(aggregate)) {
    return {
      ...heroBase,
      title: "문서 확인이 필요합니다",
      text: "확인이 필요한 문서가 있습니다.",
      primary: { label: "문서 보기", href: "documents.html" },
      meta: null,
    };
  }

  if (hasUnreadMessages || recentMessages.length > 0) {
    const unreadCase = cases.find((c) => c && c.unread);
    return {
      ...heroBase,
      title: hasUnreadMessages ? "새 메시지가 있습니다" : "메시지를 확인해 주세요",
      text: hasUnreadMessages
        ? "문의 또는 서비스 대화에서 답변·안내를 확인해 주세요."
        : "최근 메시지함 업데이트가 있습니다.",
      primary: unreadCase
        ? {
            label: "메시지함 열기",
            href: `case-detail.html?case_id=${encodeURIComponent(String(unreadCase.case_id))}`,
          }
        : { label: "메시지함 열기", href: "messages.html" },
      meta: null,
      badges: hasUnreadMessages ? [{ label: "새 메시지", tone: "warning" }] : [],
    };
  }

  return {
    ...heroBase,
    eyebrow: "진행 안내",
    title: "서비스가 진행 중입니다",
    text: String(aggregate?.next_action || "").trim() || "메시지와 진행 상태를 확인해 주세요.",
    primary: { label: "메시지함 열기", href: "messages.html" },
    meta: null,
  };
}

/** @param {Record<string, unknown>} bid */
export function resolveQuoteBidSummaryModel(bid) {
  const rl = String(bid.remaining_label || "").trim();
  const deadlineLine = rl ? `비딩 마감 ${rl}` : "";
  const resultsHref = resolveActiveCarBidCompareHref(bid);
  const offerCount = Math.max(0, Number(bid.offer_count) || 0);

  if (hasSelectedCarOffer(bid)) {
    return {
      title: "선택한 제안이 있습니다",
      text: "선택한 파트너와 메시지로 다음 단계를 진행하세요.",
      deadlineLine,
      cta: { label: "메시지함 열기", href: "messages.html" },
    };
  }

  if (offerCount > 0 && resultsHref.includes("customer-bid-results.html")) {
    return {
      title: `도착한 제안 ${offerCount}개`,
      text: "파트너가 제출한 차량 제안을 비교하고 원하는 제안을 선택할 수 있습니다.",
      deadlineLine,
      cta: { label: "견적 비교하기", href: resultsHref },
    };
  }

  if (resultsHref.includes("customer-bid-results.html")) {
    return {
      title: DASHBOARD_EMPTY.quoteWaitingTitle,
      text: DASHBOARD_EMPTY.quoteWaitingText,
      deadlineLine,
      cta: { label: "견적 상태 보기", href: resultsHref },
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
  const backendRows = Array.isArray(aggregate?.recent_updates) ? aggregate.recent_updates : [];
  if (backendRows.length) {
    return backendRows.slice(0, 3).map((row, index) => ({
      id: String(row?.id || `upd:${index}`),
      title: String(row?.title || "업데이트").trim() || "업데이트",
      description: String(row?.description || "").trim(),
      sortAt: Number.isFinite(new Date(row?.timestamp || 0).getTime())
        ? new Date(row.timestamp).getTime()
        : 0,
      timestamp: String(row?.timestamp || "").trim(),
    }));
  }
  return [];
}

export { buildCustomerBidResultsPageHref };
