/**
 * Fallback strings for customer Schedule page (dynamic JS render).
 *
 * Step 6 migration: keys seeded in ``app/seeds/page_locale_bundles_seed.py``.
 * Status: ``scripts/page-locale-migration-status.json`` (KO local bundle temporary until runtime verified).
 */

import { DEFAULT_LANGUAGE_CODE, normalizeSupportedLanguageCode } from "../core/preferred-language.js";

const KO = {
  "customer.schedule.status.draft": "초안",
  "customer.schedule.status.proposed": "검토·안내 중",
  "customer.schedule.status.confirmed": "확정",
  "customer.schedule.status.revised": "조정 반영",
  "customer.schedule.status.unknown": "알 수 없음",
  "customer.schedule.delivery.in_person": "방문 지원",
  "customer.schedule.delivery.ai_guide": "Landing Help AI Agent",
  "customer.schedule.delivery.hybrid": "Landing Help AI Agent + 선택적 인력 지원",
  "customer.schedule.summary.empty":
    "표시할 일정이 없습니다. 링크가 올바른지 확인하거나 고객센터로 문의해 주세요.",
  "customer.schedule.summary.version_label": "안내 버전",
  "customer.schedule.summary.released_label": "공개·갱신",
  "customer.schedule.summary.no_release":
    "아직 고객에게 공개된 일정 버전이 없습니다. 아래는 최신 초안 기준 안내일 수 있습니다.",
  "customer.schedule.summary.prev_feedback_label": "이전 조정 요청 요약",
  "customer.schedule.summary.last_updated_label": "최종 수정",
  "customer.schedule.summary.privacy_hint": "가격·내부 검토 정보는 이 화면에 표시되지 않습니다.",
  "customer.schedule.timeline.empty":
    "등록된 서비스 일정이 아직 없습니다. 운영팀이 구성 중이면 잠시 후 다시 확인해 주세요.",
  "customer.schedule.timeline.day_unknown": "일정 (시간 미확인)",
  "customer.schedule.timeline.day_fallback": "일정",
  "customer.schedule.timeline.time_tbd": "시간 협의",
  "customer.schedule.timeline.service_fallback": "서비스",
  "customer.schedule.timeline.doc_link": "문서 센터에서 서류 확인",
  "customer.schedule.calendar.empty": "표시할 일정이 없습니다.",
  "customer.schedule.feedback.load_error":
    "일정을 불러오지 못했습니다. 로그인·권한을 확인하거나 고객센터로 문의해 주세요.",
  "customer.schedule.feedback.no_schedule": "업데이트할 일정이 없습니다.",
  "customer.schedule.feedback.empty_input": "조정 요청 내용을 입력해 주세요.",
  "customer.schedule.feedback.success": "조정 요청이 전달되었습니다. 담당자 확인 후 연락드릴 수 있습니다.",
  "customer.schedule.feedback.error":
    "조정 요청 전송에 실패했습니다. 잠시 후 다시 시도하거나 메시지로 문의해 주세요.",
};

const EN = {
  "customer.schedule.status.draft": "Draft",
  "customer.schedule.status.proposed": "Under review",
  "customer.schedule.status.confirmed": "Confirmed",
  "customer.schedule.status.revised": "Revised",
  "customer.schedule.status.unknown": "Unknown",
  "customer.schedule.delivery.in_person": "In-person support",
  "customer.schedule.delivery.ai_guide": "Landing Help AI Agent",
  "customer.schedule.delivery.hybrid": "Landing Help AI Agent + optional human help",
  "customer.schedule.summary.empty":
    "No schedule to display. Check the link or contact support if you need help.",
  "customer.schedule.summary.version_label": "Version",
  "customer.schedule.summary.released_label": "Released",
  "customer.schedule.summary.no_release":
    "No schedule version has been released to you yet. The information below may reflect the latest draft.",
  "customer.schedule.summary.prev_feedback_label": "Previous change request",
  "customer.schedule.summary.last_updated_label": "Last updated",
  "customer.schedule.summary.privacy_hint": "Pricing and internal review details are not shown on this page.",
  "customer.schedule.timeline.empty":
    "No service appointments are listed yet. If operations is still building your schedule, check back shortly.",
  "customer.schedule.timeline.day_unknown": "Schedule (time pending)",
  "customer.schedule.timeline.day_fallback": "Schedule",
  "customer.schedule.timeline.time_tbd": "Time TBD",
  "customer.schedule.timeline.service_fallback": "Service",
  "customer.schedule.timeline.doc_link": "View documents",
  "customer.schedule.calendar.empty": "No schedule to display.",
  "customer.schedule.feedback.load_error":
    "Could not load your schedule. Check sign-in and permissions, or contact support.",
  "customer.schedule.feedback.no_schedule": "No schedule is available to update.",
  "customer.schedule.feedback.empty_input": "Enter your change request before sending.",
  "customer.schedule.feedback.success":
    "Your change request was sent. A coordinator may reply via messages or update the schedule.",
  "customer.schedule.feedback.error":
    "Could not send your request. Try again shortly or contact us via Messages.",
};

/** @param {string | null | undefined} lang */
export function getSchedulePageLocaleBundle(lang) {
  const code = normalizeSupportedLanguageCode(lang) || DEFAULT_LANGUAGE_CODE;
  if (code === "ko") return { ...KO };
  return { ...EN };
}
