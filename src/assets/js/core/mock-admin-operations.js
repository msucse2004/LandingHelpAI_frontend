/**
 * 관리자 운영 큐·케이스 워크스페이스 — 목 데이터 (API 연동 전).
 *
 * @typedef {'action_required'|'urgent'|'ai_escalations'|'waiting_customer'|'needs_resolution'|'resolved'} OpsQueueTabId
 * @typedef {'high'|'normal'|'low'} OpsPriority
 * @typedef {'customer'|'ai'|'admin'|'system'} OpsTimelineAuthor
 */

/** @type {{ id: OpsQueueTabId; label: string }[]} */
export const OPS_QUEUE_TABS = [
  { id: "action_required", label: "조치 필요" },
  { id: "urgent", label: "긴급" },
  { id: "ai_escalations", label: "AI 에스컬" },
  { id: "waiting_customer", label: "고객 회신 대기" },
  { id: "needs_resolution", label: "케이스 해결 필요" },
  { id: "resolved", label: "완료" },
];

/**
 * @typedef {Object} OpsQueueItem
 * @property {string} id
 * @property {string} caseId
 * @property {OpsQueueTabId[]} tabs
 * @property {string} customerName
 * @property {string} customerEmail
 * @property {string} caseTitle
 * @property {string} queueSummary
 * @property {OpsPriority} priority
 * @property {string} lastCustomerActivityAt ISO
 * @property {{ ambiguous: boolean; escalation: boolean; humanRequested: boolean }} badges
 */

/** @type {OpsQueueItem[]} */
export const MOCK_QUEUE_ITEMS = [
  {
    id: "qi-housing-1",
    caseId: "case-housing-001",
    tabs: ["action_required"],
    customerName: "김고객",
    customerEmail: "cust@example.com",
    caseTitle: "주택 임대 지원",
    queueSummary: "임대 서류 업로드 경로 확인 요청 — 답변 초안 있음, 운영 확인 필요",
    priority: "normal",
    lastCustomerActivityAt: "2026-04-04T09:05:00.000Z",
    badges: { ambiguous: false, escalation: false, humanRequested: false },
  },
  {
    id: "qi-phone-1",
    caseId: "case-phone-001",
    tabs: ["action_required", "urgent", "ai_escalations", "needs_resolution"],
    customerName: "김고객",
    customerEmail: "cust@example.com",
    caseTitle: "미국 전화 개통",
    queueSummary: "다중 의도(eSIM·유심·픽업) — 트리아지 필요, AI 단일 답변 불충분",
    priority: "high",
    lastCustomerActivityAt: "2026-04-05T11:00:00.000Z",
    badges: { ambiguous: true, escalation: true, humanRequested: true },
  },
  {
    id: "qi-pickup-1",
    caseId: "case-pickup-001",
    tabs: ["waiting_customer"],
    customerName: "이고객",
    customerEmail: "lee@example.com",
    caseTitle: "공항 픽업",
    queueSummary: "항공편·터미널 정보 고객 회신 대기",
    priority: "normal",
    lastCustomerActivityAt: "2026-04-03T15:40:00.000Z",
    badges: { ambiguous: false, escalation: false, humanRequested: false },
  },
  {
    id: "qi-docs-1",
    caseId: "case-docs-001",
    tabs: ["resolved"],
    customerName: "박고객",
    customerEmail: "park@example.com",
    caseTitle: "문서·번역 도움",
    queueSummary: "은행 증명서 안내 완료 — 케이스 종료",
    priority: "low",
    lastCustomerActivityAt: "2026-03-30T09:00:00.000Z",
    badges: { ambiguous: false, escalation: false, humanRequested: false },
  },
];

/**
 * @typedef {Object} OpsTriageCard
 * @property {'normal'|'ambiguous'} mode
 * @property {string[]} known
 * @property {string[]} openQuestions
 * @property {string[]} ambiguities
 */

/**
 * @typedef {Object} OpsCaseWorkspace
 * @property {{ name: string; email: string; profileRef: string }} customer
 * @property {{ title: string; caseStatus: string; queueStatus: string; assignedAdminName: string | null; needsResolution: boolean; ambiguous: boolean }} case
 * @property {OpsTriageCard | null} triage
 * @property {{ body: string; at: string; author: OpsTimelineAuthor }[]} keyMessages
 * @property {string} recommendedNextAction
 * @property {{ id: string; author: string; body: string; at: string }[]} internalNotes
 * @property {{ lockedBy: string | null; lockedUntil: string | null; softClaimBy: string | null }} lock
 */

/** @type {Record<string, OpsCaseWorkspace>} */
export const MOCK_CASE_WORKSPACE = {
  "case-housing-001": {
    customer: { name: "김고객", email: "cust@example.com", profileRef: "profile::cust@example.com" },
    case: {
      title: "주택 임대 지원",
      caseStatus: "open",
      queueStatus: "in_progress",
      assignedAdminName: "박에이전트",
      needsResolution: false,
      ambiguous: false,
    },
    triage: {
      mode: "normal",
      known: ["고객이 앱 내 문서 업로드 가능 여부를 질문함", "AI가 업로드 경로 안내함"],
      openQuestions: ["초안 계약서 검토 필요 여부"],
      ambiguities: [],
    },
    keyMessages: [
      { author: "customer", body: "임대 계약서 제출은 앱에서만 가능한가요?", at: "2026-04-04T09:05:00.000Z" },
      { author: "ai", body: "문서 센터에서 PDF 업로드 가능합니다.", at: "2026-04-04T09:06:00.000Z" },
      { author: "admin", body: "초안도 함께 보내주시면 검토해 드립니다.", at: "2026-04-04T14:30:00.000Z" },
    ],
    recommendedNextAction: "초안 수신 여부 확인 후 체크리스트 항목 갱신",
    internalNotes: [
      { id: "n1", author: "박에이전트", body: "고객 응답 빠름. 금주 내 서류 완료 예상.", at: "2026-04-04T15:00:00.000Z" },
    ],
    lock: { lockedBy: null, lockedUntil: null, softClaimBy: null },
  },
  "case-phone-001": {
    customer: { name: "김고객", email: "cust@example.com", profileRef: "profile::cust@example.com" },
    case: {
      title: "미국 전화 개통",
      caseStatus: "triaging",
      queueStatus: "new",
      assignedAdminName: null,
      needsResolution: true,
      ambiguous: true,
    },
    triage: {
      mode: "ambiguous",
      known: ["eSIM 희망", "입국 다음 날 사용 희망"],
      openQuestions: ["기기 모델·IMEI", "픽업 일정은 별도 케이스로 분리할지"],
      ambiguities: ["동일 메시지에 픽업 일정 문의 포함 — 의도 3개"],
    },
    keyMessages: [
      { author: "customer", body: "eSIM으로 개통하고 싶고, 입국 다음 날부터 쓰고 싶어요.", at: "2026-04-05T11:00:00.000Z" },
      { author: "ai", body: "기기 모델명을 알려주시면 호환 여부를 안내합니다.", at: "2026-04-05T11:01:00.000Z" },
      { author: "system", body: "요청이 운영팀 큐로 전달되었습니다.", at: "2026-04-05T11:05:00.000Z" },
    ],
    recommendedNextAction: "의도 분리 안내 + 기기 정보 요청 회신 작성",
    internalNotes: [],
    lock: { lockedBy: "김운영", lockedUntil: "2026-04-06T12:00:00.000Z", softClaimBy: "김운영" },
  },
  "case-pickup-001": {
    customer: { name: "이고객", email: "lee@example.com", profileRef: "profile::lee@example.com" },
    case: {
      title: "공항 픽업",
      caseStatus: "pending_customer",
      queueStatus: "waiting_customer",
      assignedAdminName: "최에이전트",
      needsResolution: false,
      ambiguous: false,
    },
    triage: {
      mode: "normal",
      known: ["KE 085 편", "터미널 미정"],
      openQuestions: ["터미널", "수하물 수"],
      ambiguities: [],
    },
    keyMessages: [
      { author: "admin", body: "도착 항공편 번호와 터미널을 알려주세요.", at: "2026-04-03T15:00:00.000Z" },
      { author: "customer", body: "KE 085, 터미널은 아직 못 정했어요.", at: "2026-04-03T15:40:00.000Z" },
    ],
    recommendedNextAction: "터미널 확정 유도 또는 임시 픽업 구역 제안",
    internalNotes: [{ id: "n2", author: "최에이전트", body: "고객 타임존 KST", at: "2026-04-03T15:10:00.000Z" }],
    lock: { lockedBy: null, lockedUntil: null, softClaimBy: null },
  },
  "case-docs-001": {
    customer: { name: "박고객", email: "park@example.com", profileRef: "profile::park@example.com" },
    case: {
      title: "문서·번역 도움",
      caseStatus: "resolved",
      queueStatus: "done",
      assignedAdminName: "박에이전트",
      needsResolution: false,
      ambiguous: false,
    },
    triage: {
      mode: "normal",
      known: ["은행 증명서 영문 필요"],
      openQuestions: [],
      ambiguities: [],
    },
    keyMessages: [
      { author: "customer", body: "은행 증명서 영문이 필요합니다.", at: "2026-03-30T09:00:00.000Z" },
      { author: "ai", body: "문서 센터 템플릿을 참고해 주세요.", at: "2026-03-30T09:02:00.000Z" },
    ],
    recommendedNextAction: "— (종료)",
    internalNotes: [],
    lock: { lockedBy: null, lockedUntil: null, softClaimBy: null },
  },
};

/**
 * @typedef {Object} OpsTimelineEntry
 * @property {string} id
 * @property {OpsTimelineAuthor} type
 * @property {string} body
 * @property {string} at
 * @property {string} [label]
 */

/** @type {Record<string, OpsTimelineEntry[]>} */
export const MOCK_TIMELINE_FULL = {
  "case-housing-001": [
    { id: "t1", type: "system", label: "케이스 생성", body: "문의가 등록되었습니다.", at: "2026-04-04T09:00:00.000Z" },
    { id: "t2", type: "customer", body: "임대 계약서 제출은 앱에서만 가능한가요?", at: "2026-04-04T09:05:00.000Z" },
    { id: "t3", type: "ai", body: "문서 센터에서 PDF 업로드 가능합니다.", at: "2026-04-04T09:06:00.000Z" },
    { id: "t4", type: "admin", body: "초안도 함께 보내주시면 검토해 드립니다.", at: "2026-04-04T14:30:00.000Z" },
  ],
  "case-phone-001": [
    { id: "p1", type: "customer", body: "eSIM으로 개통… 픽업도 같은 날 되나요?", at: "2026-04-05T11:00:00.000Z" },
    { id: "p2", type: "ai", body: "기기 모델명을 알려주시면…", at: "2026-04-05T11:01:00.000Z" },
    { id: "p3", type: "system", label: "라우팅", body: "운영 큐로 전달됨", at: "2026-04-05T11:05:00.000Z" },
    { id: "p4", type: "system", label: "분류", body: "multi-intent: phone.esim, phone.sim, transport.pickup", at: "2026-04-05T11:05:30.000Z" },
  ],
  "case-pickup-001": [
    { id: "k1", type: "admin", body: "도착 항공편 번호와 터미널을 알려주세요.", at: "2026-04-03T15:00:00.000Z" },
    { id: "k2", type: "customer", body: "KE 085, 터미널은 아직 못 정했어요.", at: "2026-04-03T15:40:00.000Z" },
  ],
  "case-docs-001": [
    { id: "d1", type: "customer", body: "은행 증명서 영문이 필요합니다.", at: "2026-03-30T09:00:00.000Z" },
    { id: "d2", type: "ai", body: "문서 센터 템플릿을 참고해 주세요.", at: "2026-03-30T09:02:00.000Z" },
    { id: "d3", type: "system", label: "종료", body: "케이스 완료 처리", at: "2026-04-01T12:00:00.000Z" },
  ],
};

/**
 * @param {OpsQueueTabId} tabId
 * @returns {OpsQueueItem[]}
 */
export function filterQueueItemsByTab(tabId) {
  return MOCK_QUEUE_ITEMS.filter((q) => q.tabs.includes(tabId));
}

/**
 * @param {string} caseId
 * @returns {OpsCaseWorkspace | null}
 */
export function getMockCaseWorkspace(caseId) {
  return MOCK_CASE_WORKSPACE[caseId] || null;
}

/**
 * @param {string} caseId
 * @returns {OpsTimelineEntry[]}
 */
export function getMockTimeline(caseId) {
  return MOCK_TIMELINE_FULL[caseId] ? [...MOCK_TIMELINE_FULL[caseId]] : [];
}

export function mockOpsDelay(ms = 240) {
  return new Promise((r) => setTimeout(r, ms));
}
