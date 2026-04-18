/**
 * 고객 케이스 기반 메시징 — 목 데이터 및 타입 정의 (API 연동 전).
 *
 * @typedef {'customer' | 'ai' | 'admin' | 'system'} CaseMessageAuthor
 * @typedef {'housing' | 'phone' | 'pickup' | 'documents' | 'other'} CaseServiceKind
 * @typedef {'intake' | 'in_progress' | 'waiting_ops' | 'waiting_you' | 'resolved'} CaseStage
 * @typedef {'open' | 'pending_ops' | 'pending_customer' | 'resolved'} CaseStatusCode
 *
 * @typedef {Object} CaseMessage
 * @property {string} id
 * @property {CaseMessageAuthor} author
 * @property {string} body
 * @property {string} createdAt ISO
 * @property {boolean} [aiEligible] — thumbs UI when author==='ai'
 *
 * @typedef {Object} ServiceCase
 * @property {string} id
 * @property {string} title
 * @property {CaseServiceKind} serviceKind
 * @property {CaseStage} stage
 * @property {CaseStatusCode} status
 * @property {string} statusLabel
 * @property {string} stageLabel
 * @property {string} updatedAt ISO
 * @property {boolean} escalatedToOps — 운영팀 전달됨 배너
 * @property {boolean} needsHumanFollowUp
 * @property {CaseMessage[]} messages
 */

/** @type {ServiceCase[]} */
export const MOCK_CASES = [
  {
    id: "case-housing-001",
    title: "주택 임대 지원",
    serviceKind: "housing",
    stage: "in_progress",
    status: "open",
    statusLabel: "진행 중",
    stageLabel: "서류 안내",
    updatedAt: "2026-04-05T10:00:00.000Z",
    escalatedToOps: false,
    needsHumanFollowUp: false,
    messages: [
      {
        id: "m1",
        author: "system",
        body: "문의가 등록되었습니다. 담당 팀이 확인 중입니다.",
        createdAt: "2026-04-04T09:00:00.000Z",
      },
      {
        id: "m2",
        author: "customer",
        body: "임대 계약서 제출은 앱에서만 가능한가요?",
        createdAt: "2026-04-04T09:05:00.000Z",
      },
      {
        id: "m3",
        author: "ai",
        body: "네, 가능합니다. 문서 센터에서 PDF로 업로드하시면 됩니다. 파일당 20MB 이하로 제한됩니다.",
        createdAt: "2026-04-04T09:06:00.000Z",
        aiEligible: true,
      },
      {
        id: "m4",
        author: "admin",
        body: "안녕하세요. 계약서 초안도 함께 보내주시면 검토해 드리겠습니다.",
        createdAt: "2026-04-04T14:30:00.000Z",
      },
    ],
  },
  {
    id: "case-phone-001",
    title: "미국 전화 개통",
    serviceKind: "phone",
    stage: "waiting_ops",
    status: "pending_ops",
    statusLabel: "운영 확인 중",
    stageLabel: "개통 검토",
    updatedAt: "2026-04-06T08:15:00.000Z",
    escalatedToOps: true,
    needsHumanFollowUp: true,
    messages: [
      {
        id: "p1",
        author: "customer",
        body: "eSIM으로 개통하고 싶고, 입국 다음 날부터 쓰고 싶어요.",
        createdAt: "2026-04-05T11:00:00.000Z",
      },
      {
        id: "p2",
        author: "ai",
        body: "eSIM은 통신사·요금제에 따라 가능 여부가 달라요. 기기 모델명을 알려주시면 호환 여부를 먼저 안내드릴게요.",
        createdAt: "2026-04-05T11:01:00.000Z",
        aiEligible: true,
      },
      {
        id: "p3",
        author: "system",
        body: "요청이 운영팀 큐로 전달되었습니다. 순차적으로 연락드립니다.",
        createdAt: "2026-04-05T11:05:00.000Z",
      },
    ],
  },
  {
    id: "case-pickup-001",
    title: "공항 픽업",
    serviceKind: "pickup",
    stage: "waiting_you",
    status: "pending_customer",
    statusLabel: "고객 확인 대기",
    stageLabel: "일정 확인",
    updatedAt: "2026-04-03T16:00:00.000Z",
    escalatedToOps: false,
    needsHumanFollowUp: false,
    messages: [
      {
        id: "k1",
        author: "admin",
        body: "도착 항공편 번호와 터미널을 알려주시면 픽업 시간을 제안드릴게요.",
        createdAt: "2026-04-03T15:00:00.000Z",
      },
      {
        id: "k2",
        author: "customer",
        body: "KE 085, 터미널은 아직 못 정했어요.",
        createdAt: "2026-04-03T15:40:00.000Z",
      },
    ],
  },
  {
    id: "case-docs-001",
    title: "문서·번역 도움",
    serviceKind: "documents",
    stage: "resolved",
    status: "resolved",
    statusLabel: "완료",
    stageLabel: "종료",
    updatedAt: "2026-04-01T12:00:00.000Z",
    escalatedToOps: false,
    needsHumanFollowUp: false,
    messages: [
      {
        id: "d1",
        author: "customer",
        body: "은행 증명서 영문이 필요합니다.",
        createdAt: "2026-03-30T09:00:00.000Z",
      },
      {
        id: "d2",
        author: "ai",
        body: "문서 센터의 ‘은행 증명서’ 템플릿을 참고해 주세요. 발급 기관이 영문을 직접 제공하면 번역이 줄어듭니다.",
        createdAt: "2026-03-30T09:02:00.000Z",
        aiEligible: true,
      },
      {
        id: "d3",
        author: "system",
        body: "이 문의는 완료 처리되었습니다. 추가 질문이 있으면 새 메시지를 남겨 주세요.",
        createdAt: "2026-04-01T12:00:00.000Z",
      },
    ],
  },
];

/**
 * @param {string} caseId
 * @returns {ServiceCase | null}
 */
export function getMockCaseById(caseId) {
  const id = String(caseId || "").trim();
  return MOCK_CASES.find((c) => c.id === id) || null;
}

export function mockCasesDelay(ms = 280) {
  return new Promise((r) => setTimeout(r, ms));
}
