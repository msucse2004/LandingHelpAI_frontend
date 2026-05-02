/**
 * Single-partner matching rule registry (frontend fallback source).
 * Keep this module small and explicit so UI can reuse it without API dependency.
 */

const SINGLE_PARTNER_MATCHING_RULES = [
  {
    value: "same_state_first_then_expand",
    label: "고객 주 우선 후 확장",
    description: "고객과 같은 주(State)의 파트너를 먼저 찾고, 없으면 범위를 확장합니다.",
  },
  {
    value: "score_priority",
    label: "점수 우선",
    description: "파트너 평점/적합도 점수가 높은 순서로 우선 선택합니다.",
  },
  {
    value: "availability_first",
    label: "가용 일정 우선",
    description: "응답 가능 시간과 일정 가용성이 높은 파트너를 먼저 선택합니다.",
  },
];

function getSinglePartnerMatchingRuleOptions() {
  return SINGLE_PARTNER_MATCHING_RULES.map((x) => ({ ...x }));
}

export { getSinglePartnerMatchingRuleOptions };
