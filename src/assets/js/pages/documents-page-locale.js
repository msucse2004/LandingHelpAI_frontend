/**
 * Fallback strings for customer Documents page (gate + headings + required docs).
 *
 * Local KO/EN overlays merged via ``getDocumentsPageLocaleBundle(getEffectiveLanguage())``.
 * Dynamic API copy uses ``display_*`` fields; enum labels use ``t(key, English)`` in documents.js.
 *
 * Step 6 migration: keys seeded in ``app/seeds/page_locale_bundles_seed.py``.
 * Status: ``scripts/page-locale-migration-status.json`` (KO local bundle temporary until runtime verified).
 */

import { DEFAULT_LANGUAGE_CODE, normalizeSupportedLanguageCode } from "../core/preferred-language.js";

const KO = {
  "customer.documents.page_title": "문서 센터",
  "customer.documents.page_subtitle": "파일을 올리고 검토 상태를 확인하며 발급 문서에 접근합니다.",
  "customer.documents.gate.title": "결제 완료 후 이용 가능",
  "customer.documents.gate.body":
    "운영에서 지정한 필수 서류 요청과 제출 항목은 결제가 완료된 뒤에만 이 페이지에 표시됩니다. 먼저 청구서에서 결제를 마쳐 주세요. 일반 문의는 메시지함을 이용해 주세요.",
  "customer.documents.required.section_title": "필수 서류 (서비스 준비)",
  "customer.documents.required.section_lead":
    "아래 목록은 결제 완료 후 생성된 요청입니다. 항목은 결제된 서비스와 설문에서 알려주신 목적지 주(미국 주) 등에 맞게 정리됩니다. 자세한 안내·알림은 메시지함과 등록 이메일이 우선이며, 이 화면에서 언제든 다시 확인할 수 있습니다.",
  "customer.documents.required.loading": "필수 서류 목록을 불러오는 중입니다…",
  "customer.documents.required.empty":
    "아직 표시할 필수 서류 요청이 없습니다. 결제 직후라면 잠시 후 다시 열어 보시거나, 메시지함·이메일 안내를 확인해 주세요.",
  "customer.documents.required.load_error": "목록을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.",
  "customer.documents.required.link_messages": "메시지함에서 안내 확인 →",
  "customer.documents.required.badge_required": "필수",
  "customer.documents.required.badge_optional": "선택",
  "customer.documents.required.label_why": "필요한 이유",
  "customer.documents.required.label_timing": "제출·준비 시기 안내",
  "customer.documents.required.label_example": "예시·추가 안내",
  "customer.documents.required.label_due": "기한",
  "customer.documents.required.label_status": "진행 상태",
  "customer.documents.required.status.REQUESTED": "확인 대기",
  "customer.documents.required.status.WAIVED": "면제됨",
  "customer.documents.required.status.UPLOADED": "제출됨",
  "customer.documents.required.status.UNDER_REVIEW": "검토 중",
  "customer.documents.required.status.APPROVED": "승인됨",
  "customer.documents.required.status.REJECTED": "반려·재요청",
  "customer.documents.required.status.CANCELLED": "취소됨",
  "customer.documents.upload.status.REQUESTED": "요청됨",
  "customer.documents.upload.status.UPLOADED": "업로드됨",
  "customer.documents.upload.status.UNDER_REVIEW": "검토 중",
  "customer.documents.upload.status.APPROVED": "승인됨",
  "customer.documents.upload.status.REJECTED": "반려됨",
  "customer.documents.upload.section_title": "문서 업로드",
  "customer.documents.upload.file_name_label": "파일 이름",
  "customer.documents.upload.file_name_placeholder": "예: example.pdf",
  "customer.documents.upload.type_label": "구분",
  "customer.documents.upload.type.documents_submitted": "제출 문서",
  "customer.documents.upload.type.consent_documents": "동의서",
  "customer.documents.upload.type.power_of_attorney": "위임장",
  "customer.documents.upload.type.completion_documents": "완료 관련 문서",
  "customer.documents.upload.submit": "업로드 (스텁)",
  "customer.documents.upload.empty_status": "아직 업로드한 파일이 없습니다.",
  "customer.documents.upload.success": "{name} 업로드됨 ({status}).",
  "customer.documents.section.received": "수신 문서",
  "customer.documents.section.submitted": "제출 문서",
  "customer.documents.section.generated": "생성·발급 문서",
  "customer.documents.section.consent": "동의서",
  "customer.documents.section.power_of_attorney": "위임장",
  "customer.documents.section.completion": "완료 관련 문서",
  "customer.documents.section.empty": "이 구역에 문서가 없습니다.",
  "customer.documents.action.view_stub": "보기 (스텁)",
  "customer.documents.action.download_stub": "다운로드 (스텁)",
};

const EN = {
  "customer.documents.page_title": "Documents",
  "customer.documents.page_subtitle": "Upload files, track review status, and access issued documents.",
  "customer.documents.gate.title": "Available after payment",
  "customer.documents.gate.body":
    "Required document requests from your service package appear here only after your invoice is paid. Complete payment first. For questions, use Messages.",
  "customer.documents.required.section_title": "Required documents (service preparation)",
  "customer.documents.required.section_lead":
    "These items are created after you pay. They reflect your paid services and the destination U.S. state you provided in the survey where applicable. Messages and your registered email are the primary channels for guidance; use this page anytime to review what is needed.",
  "customer.documents.required.loading": "Loading your required documents…",
  "customer.documents.required.empty":
    "No required document requests are listed yet. If you just paid, check back shortly or follow the guidance in Messages and email.",
  "customer.documents.required.load_error": "Could not load the list. Please try again.",
  "customer.documents.required.link_messages": "Open Messages for guidance →",
  "customer.documents.required.badge_required": "Required",
  "customer.documents.required.badge_optional": "Optional",
  "customer.documents.required.label_why": "Why we need this",
  "customer.documents.required.label_timing": "When to prepare or submit",
  "customer.documents.required.label_example": "Examples / notes",
  "customer.documents.required.label_due": "Due",
  "customer.documents.required.label_status": "Status",
  "customer.documents.required.status.REQUESTED": "Action needed",
  "customer.documents.required.status.WAIVED": "Waived",
  "customer.documents.required.status.UPLOADED": "Submitted",
  "customer.documents.required.status.UNDER_REVIEW": "Under review",
  "customer.documents.required.status.APPROVED": "Approved",
  "customer.documents.required.status.REJECTED": "Rejected / resubmit",
  "customer.documents.required.status.CANCELLED": "Canceled",
  "customer.documents.upload.status.REQUESTED": "Requested",
  "customer.documents.upload.status.UPLOADED": "Uploaded",
  "customer.documents.upload.status.UNDER_REVIEW": "Under review",
  "customer.documents.upload.status.APPROVED": "Approved",
  "customer.documents.upload.status.REJECTED": "Rejected",
  "customer.documents.upload.section_title": "Upload documents",
  "customer.documents.upload.file_name_label": "File name",
  "customer.documents.upload.file_name_placeholder": "e.g. example.pdf",
  "customer.documents.upload.type_label": "Category",
  "customer.documents.upload.type.documents_submitted": "Submitted documents",
  "customer.documents.upload.type.consent_documents": "Consent forms",
  "customer.documents.upload.type.power_of_attorney": "Power of attorney",
  "customer.documents.upload.type.completion_documents": "Completion documents",
  "customer.documents.upload.submit": "Upload (stub)",
  "customer.documents.upload.empty_status": "No files uploaded yet.",
  "customer.documents.upload.success": "Uploaded {name} ({status}).",
  "customer.documents.section.received": "Documents received",
  "customer.documents.section.submitted": "Submitted documents",
  "customer.documents.section.generated": "Generated & issued documents",
  "customer.documents.section.consent": "Consent forms",
  "customer.documents.section.power_of_attorney": "Power of attorney",
  "customer.documents.section.completion": "Completion documents",
  "customer.documents.section.empty": "No documents in this section.",
  "customer.documents.action.view_stub": "View (Stub)",
  "customer.documents.action.download_stub": "Download (Stub)",
};

/** @param {string | null | undefined} lang */
export function getDocumentsPageLocaleBundle(lang) {
  const code = normalizeSupportedLanguageCode(lang) || DEFAULT_LANGUAGE_CODE;
  if (code === "ko") return { ...KO };
  return { ...EN };
}