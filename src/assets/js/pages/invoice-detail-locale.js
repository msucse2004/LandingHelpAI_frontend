/**
 * Invoice detail page — English/Korean fallback strings when runtime StringKey catalog is incomplete.
 * Viewer UI language comes from ``getEffectiveLanguage()``; not survey intake preferred_language.
 *
 * Step 6 migration: keys seeded in ``app/seeds/page_locale_bundles_seed.py``.
 * Status: ``scripts/page-locale-migration-status.json`` (KO local bundle temporary until runtime verified).
 */

import { DEFAULT_LANGUAGE_CODE, normalizeSupportedLanguageCode } from "../core/preferred-language.js";

const KO = {
  "common.header.brand.customer": "Landing Help AI",
  "common.header.messages": "메시지함",
  "common.header.messages_unread_suffix": "읽지 않음",
  "common.header.messages_unread_badge": "새 메시지",
  "common.header.menu.profile": "내 정보",
  "common.header.menu.password": "비밀번호 변경",
  "common.header.menu.logout": "로그아웃",
  "common.sidebar.customer.aria_label": "고객 메뉴",
  "common.sidebar.customer.dashboard": "대시보드",
  "common.sidebar.customer.service_flow": "견적신청",
  "common.sidebar.customer.quote": "견적",
  "common.sidebar.customer.invoice": "청구서",
  "common.sidebar.customer.documents": "문서",
  "common.sidebar.customer.messages": "메시지함",
  "common.sidebar.customer.ai_assistant": "Landing Help AI Agent",
  "common.sidebar.customer.schedule": "일정",
  "common.sidebar.customer.completion": "완료",
  "common.sidebar.placeholder.todo": "사이드바를 불러오는 중입니다…",
  "common.service_flow.delivery.ai_guide.badge": "Landing Help AI Agent",
  "common.service_flow.delivery.in_person.badge": "대면·현장 지원",
  "common.service_flow.delivery.ai_plus_human.badge": "Landing Help AI Agent + 필요 시 사람 도움",
  "common.service_flow.delivery.general.badge": "안내형 서비스",

  "customer.invoice.page_title": "청구서 · 결제",
  "customer.invoice.subtitle":
    "승인하신 견적을 바탕으로 발행된 청구입니다. 아래 내용을 확인한 뒤 결제를 진행해 주세요.",
  "customer.invoice.hero.title_payment_needed": "결제가 필요합니다",
  "customer.invoice.hero.title_paid": "결제가 완료되었습니다",
  "customer.invoice.hero.title_failed": "결제를 다시 시도해 주세요",
  "customer.invoice.hero.title_canceled": "이 청구서는 취소되었습니다",
  "customer.invoice.hero.title_unpayable": "이 청구서는 현재 결제할 수 없습니다",
  "customer.invoice.hero.subtitle_default":
    "승인하신 서비스에 대한 청구서입니다. 아래 내용을 확인한 뒤 결제를 진행해 주세요.",
  "customer.invoice.hero.subtitle_paid":
    "이 청구는 이미 결제가 완료된 상태입니다. 추가 결제 없이 아래 참고 번호로 기록을 확인하실 수 있습니다.",
  "customer.invoice.hero.subtitle_failed":
    "결제 처리 중 문제가 있었습니다. 다시 시도하시거나 메시지함으로 문의해 주세요.",
  "customer.invoice.hero.subtitle_canceled": "이 청구는 더 이상 결제할 수 없습니다. 문의는 메시지함을 이용해 주세요.",
  "customer.invoice.hero.web_only": "결제는 이 웹 화면(브라우저)에서만 진행할 수 있습니다. 앱 외부 링크로 유도되는 결제는 지원하지 않습니다.",
  "customer.invoice.hero.request_label": "서비스 요약",
  "customer.invoice.hero.request_prefix": "Survey request: %s",
  "customer.invoice.hero.billed_services_label": "청구 대상 서비스",
  "customer.invoice.hero.reassurance": "결제 완료 후 서비스 안내가 시작됩니다.",
  "customer.invoice.hero.actions_aria": "청구서 결제 및 문의",
  "customer.invoice.hero.cta.pay": "지금 결제하기",
  "customer.invoice.hero.cta.ask": "질문하기",
  "customer.invoice.hero.cta.messages": "메시지함 보기",
  "customer.invoice.hero.status_paid": "Landing Help AI Agent 안내가 시작됩니다.",
  "customer.invoice.hero.status_unpayable": "자세한 내용은 메시지함에서 문의해 주세요.",
  "customer.invoice.hero.status_unknown": "청구서 상태를 확인할 수 없습니다. 메시지함으로 문의해 주세요.",
  "customer.invoice.hero.service_label": "결제 대상 서비스·패키지",
  "customer.invoice.hero.amount_label": "오늘 결제하실 금액",
  "customer.invoice.hero.amount_label_paid": "청구·결제 금액",
  "customer.invoice.hero.amount_label_canceled": "청구 금액(참고)",
  "customer.invoice.hero.amount_eyebrow": "납부 총액",
  "customer.invoice.hero.amount_eyebrow_paid": "결제 완료 금액",
  "customer.invoice.hero.amount_eyebrow_canceled": "청구 금액(참고)",
  "customer.invoice.section.summary_title": "청구 요약",
  "customer.invoice.section.reference_title": "참고 번호",
  "customer.invoice.reference.hint":
    "문의·고객지원 시 아래 번호를 알려 주시면 빠르게 확인할 수 있습니다.",
  "customer.invoice.details.section_title": "청구서 세부 정보",
  "customer.invoice.details.section_intro":
    "문의·기록 확인용 참고 번호, 일정, 청구·결제 당사자 정보입니다. 결제 전에는 위의 금액 요약과 안내를 먼저 확인해 주세요. 필요할 때만 펼쳐 보셔도 됩니다.",
  "customer.invoice.meta.section_title": "청구서 정보",
  "customer.invoice.meta.block_title": "번호·일정·상태",
  "customer.invoice.meta.section_intro":
    "청구서 번호·날짜·결제 상태 등 본 문서를 식별하는 정보입니다. 납부 일정 확인에 참고해 주세요.",
  "customer.invoice.meta.issue_date": "발행일",
  "customer.invoice.meta.due_date": "납기일",
  "customer.invoice.meta.due_not_set":
    "별도 납기일은 없습니다. 결제 완료 후 서비스 안내가 시작됩니다.",
  "customer.invoice.meta.invoice_number": "청구서 번호",
  "customer.invoice.meta.quote_reference": "관련 견적 참조",
  "customer.invoice.meta.payment_status": "결제 상태",
  "customer.invoice.meta.currency": "통화",
  "customer.invoice.meta.support_hint":
    "문의·고객지원 시 청구서 번호와 견적 참조를 함께 알려 주시면 빠르게 확인할 수 있습니다.",
  "customer.invoice.parties.from_title": "청구·서비스 제공 측",
  "customer.invoice.parties.to_title": "결제·청구 대상 고객",
  "customer.invoice.parties.from_empty": "청구 발행처 상세 정보가 아직 표시되지 않습니다. 메시지함으로 문의해 주세요.",
  "customer.invoice.parties.to_empty":
    "고객 연락처가 이 청구서에 표시되지 않습니다. 견적·신청 시 입력한 정보 또는 메시지함을 확인해 주세요.",
  "customer.invoice.parties.from.legal_name": "상호(법인명)",
  "customer.invoice.parties.from.address": "사업장 주소",
  "customer.invoice.parties.from.email": "이메일",
  "customer.invoice.parties.from.phone": "전화",
  "customer.invoice.parties.from.tax_id": "사업자등록번호·세금 식별",
  "customer.invoice.parties.to.full_name": "고객 성명",
  "customer.invoice.parties.to.company": "회사·단체",
  "customer.invoice.parties.to.email": "고객 이메일",
  "customer.invoice.parties.to.phone": "연락처",
  "customer.invoice.parties.to.address": "청구·연락 주소",
  "customer.invoice.label.invoice_id": "청구서 ID",
  "customer.invoice.label.quote_id": "견적 ID",
  "customer.invoice.label.service": "결제 대상 서비스",
  "customer.invoice.label.amount": "결제하실 금액",
  "customer.invoice.label.status": "상태",
  "customer.invoice.section.scope_title": "청구 범위에 포함되는 내용",
  "customer.invoice.scope.main_title": "청구 대상 서비스",
  "customer.invoice.scope.main_intro":
    "결제하시는 대상은 아래에 정리된 서비스·패키지와 포함 범위입니다. 견적서와 함께 확인해 주세요.",
  "customer.invoice.scope.billed_title": "청구 대상 서비스 및 범위",
  "customer.invoice.scope.description_label": "요약 설명",
  "customer.invoice.scope.note_label": "고객 안내(팀 메모)",
  "customer.invoice.scope.summary_label": "포함 범위 요약",
  "customer.invoice.scope.quote_note":
    "이 청구는 승인·합의된 견적서(%s)를 기준으로 발행되었습니다. 내용이 견적서와 다르게 보이면 메시지함으로 문의해 주세요.",
  "customer.invoice.scope.limitation":
    "본 청구 금액은 위에 기술된 서비스 범위에만 적용됩니다. 추가 범위나 변경이 필요한 경우 별도 견적·계약 및 추가 청구가 필요할 수 있습니다.",
  "customer.invoice.amount.section_title": "금액 요약",
  "customer.invoice.amount.section_intro":
    "선택하신 서비스별 금액과 합계입니다. 오늘 실제로 결제하실 금액은 맨 아래 행을 확인해 주세요.",
  "customer.invoice.amount.row.service_subtotal": "서비스 항목 합계",
  "customer.invoice.amount.row.tax_and_fees": "세금 / 추가 수수료",
  "customer.invoice.amount.table_caption": "포함 범위에 따른 금액 구성 요약",
  "customer.invoice.amount.col_item": "항목",
  "customer.invoice.amount.col_amount": "금액",
  "customer.invoice.amount.row.base": "기본 서비스·패키지",
  "customer.invoice.amount.row.addons": "부가·옵션(추가 항목)",
  "customer.invoice.amount.row.admin_fee": "맞춤 진행 지원비",
  "customer.invoice.amount.row.subtotal_pre_tax": "소계(세금·수수료 제외)",
  "customer.invoice.amount.row.discount": "할인·조정",
  "customer.invoice.amount.row.surcharge": "추가 금액(견적 소계 대비)",
  "customer.invoice.amount.row.tax": "세금·수수료",
  "customer.invoice.amount.row.invoice_total": "청구 총액(본 청구서)",
  "customer.invoice.amount.row.amount_paid": "이미 결제된 금액",
  "customer.invoice.amount.row.current_payable": "오늘 결제하실 금액",
  "customer.invoice.amount.row.balance_remaining": "남은 결제 금액",
  "customer.invoice.amount.surcharge_hint":
    "청구 총액이 견적의 세전 소계·세금 합계보다 큽니다. 견적서에 없는 수수료·조정이 포함되었을 수 있으니 문의 시 알려 주세요.",
  "customer.invoice.scope.intro":
    "아래는 견적·신청 시점에 합의된 범위를 요약한 것입니다. 세부 사항은 견적서·팀 안내와 함께 확인해 주세요.",
  "customer.invoice.scope.empty":
    "선택 서비스 목록이 이 화면에 연결되어 있지 않습니다. 금액은 승인된 견적 기준이며, 상세 범위는 견적서·메시지함을 확인해 주세요.",
  "customer.invoice.services.support.ai_guide": "Landing Help AI Agent 안내 포함",
  "customer.invoice.services.support.in_person": "대면·현장 지원 포함",
  "customer.invoice.services.support.ai_plus_human": "Landing Help AI Agent 안내 + 필요 시 사람 도움",
  "customer.invoice.services.support.general": "안내형 서비스 포함",
  "customer.invoice.services.admin_fee_title": "맞춤 진행 지원비",
  "customer.invoice.services.admin_fee_support": "요청하신 범위에 맞춘 진행 안내 및 메시지 지원",
  "customer.invoice.services.hint.phone": "통신사 실제 요금은 별도입니다.",
  "customer.invoice.services.hint.car": "차량 구매비, 보험료, 세금, 등록비는 별도입니다.",
  "customer.invoice.services.hint.default":
    "표시된 금액은 Landing Help AI의 안내·지원 비용이며, 제3자·현장 비용은 별도일 수 있습니다.",
  "customer.invoice.services.amount_pending": "금액 확인 중",
  "customer.invoice.section.legal_title": "결제 및 계약에 관한 안내",
  "customer.invoice.legal.notice_block_title": "결제 전 꼭 확인해 주세요",
  "customer.invoice.prepay_scope.lede":
    "결제 전에 아래 내용을 확인해 주세요. 이 청구서 금액은 Landing Help AI의 안내·지원 비용이며, 오른쪽에 적은 항목은 고객님이 직접 부담하거나 별도로 진행하시는 비용·절차입니다.",
  "customer.invoice.prepay_scope.context_note_phone":
    "전화·모바일 관련 서비스가 포함되어 있습니다. 통신사에 실제로 청구되는 요금·가입비는 이 청구 금액에 포함되지 않습니다.",
  "customer.invoice.prepay_scope.context_note_car":
    "자동차 관련 서비스가 포함되어 있습니다. 차량 구매비, 보험료, 세금, 등록비는 이 청구 금액에 포함되지 않습니다.",
  "customer.invoice.prepay_scope.context_note_both":
    "전화·모바일과 자동차 관련 서비스가 함께 포함되어 있습니다. 통신사 요금과 차량·등록·보험 관련 비용은 각각 별도입니다.",
  "customer.invoice.prepay_scope.included_title": "이 청구서에 포함되는 것",
  "customer.invoice.prepay_scope.excluded_title": "이 청구서에 포함되지 않는 것",
  "customer.invoice.prepay_scope.included.agent_steps": "Landing Help AI Agent의 단계별 안내",
  "customer.invoice.prepay_scope.included.checklist": "필요한 준비물과 체크리스트 제공",
  "customer.invoice.prepay_scope.included.messages": "메시지함을 통한 질문 지원",
  "customer.invoice.prepay_scope.included.progress_guidance": "요청하신 서비스 범위에 대한 진행 안내",
  "customer.invoice.prepay_scope.excluded.carrier_fees": "통신사 실제 요금 또는 가입비",
  "customer.invoice.prepay_scope.excluded.car_purchase_cost": "자동차 실제 구매 비용",
  "customer.invoice.prepay_scope.excluded.insurance_tax_registration": "보험료, 세금, 등록비",
  "customer.invoice.prepay_scope.excluded.legal_contract": "고객 대신 계약 체결",
  "customer.invoice.prepay_scope.excluded.account_payment": "고객 대신 계정 생성 또는 결제 수행",
  "customer.invoice.prepay_scope.excluded.third_party_outcomes":
    "외부 기관, 통신사, 딜러의 승인 또는 결과 보장",
  "customer.invoice.section.after_title": "결제 이후 진행",
  "customer.invoice.next_steps.title": "결제 후 다음 단계",
  "customer.invoice.next_steps.intro": "결제가 완료되면 Landing Help AI Agent 안내가 시작됩니다.",
  "customer.invoice.next_steps.actions_aria": "결제 및 문의",
  "customer.invoice.next_steps.step.1": "결제 상태가 결제 완료로 변경됩니다.",
  "customer.invoice.next_steps.step.2": "이메일과 메시지함으로 다음 단계 안내가 발송됩니다.",
  "customer.invoice.next_steps.step.3": "Agent가 필요한 준비물과 진행 순서를 안내합니다.",
  "customer.invoice.next_steps.step.4": "질문이 있으면 메시지함에서 계속 문의할 수 있습니다.",
  "customer.invoice.next_steps.intro_paid":
    "결제가 완료되었습니다. Landing Help AI Agent 안내가 이어집니다. 아래 순서를 참고해 주세요.",
  "customer.invoice.pay_button": "지금 결제하기",
  "customer.invoice.action.helper_web_only": "이 버튼으로 진행하는 결제는 이 웹 화면에서만 이루어집니다.",
  "customer.invoice.action.helper_contract": "결제가 완료되면 계약이 성립하고, 합의된 범위에 따라 서비스 진행이 시작됩니다.",
  "customer.invoice.action.secondary_nav_aria": "청구서 관련 추가 작업",
  "customer.invoice.action.help": "도움 요청(메시지함)",
  "customer.invoice.action.view_quote": "관련 견적 보기",
  "customer.invoice.action.view_pdf": "청구서 PDF 보기",
  "customer.invoice.pay_processing": "결제를 준비하는 중입니다…",
  "customer.invoice.pay_success":
    "결제가 완료되었습니다. 메시지함과 문서 센터에서 다음 단계·필수 서류 안내를 확인해 주세요.",
  "customer.invoice.pay_error": "결제 처리 중 문제가 발생했습니다. 잠시 후 다시 시도하거나 메시지함으로 문의해 주세요.",
  "customer.invoice.result_title": "결제 결과",
  "customer.invoice.result_success_detail":
    "결제가 정상적으로 반영되었습니다. 서비스 제공은 계약·결제 완료 후 순차적으로 시작됩니다.",
  "customer.invoice.postpay.section_title": "다음 단계 — 준비 서류 확인",
  "customer.invoice.postpay.lead":
    "결제가 완료되었습니다. 계약이 성립되었고 서비스 준비가 시작되었습니다. 아래에서 안내를 확인한 뒤 바로 이동해 주세요.",
  "customer.invoice.postpay.bullet_payment": "결제가 정상적으로 완료·확인되었습니다.",
  "customer.invoice.postpay.bullet_contract": "위 ‘결제 전 꼭 확인해 주세요’에 적은 범위와 같이, 결제 완료 시 계약이 성립하고 합의된 범위가 적용됩니다.",
  "customer.invoice.postpay.bullet_prep": "선택하신 서비스에 맞춰 준비 및 진행 단계가 시작됩니다.",
  "customer.invoice.postpay.bullet_docs":
    "이제 진행에 필요한 서류 목록을 확인하실 수 있습니다. 결제 전에는 표시되지 않았을 수 있습니다.",
  "customer.invoice.postpay.channels_primary":
    "안내의 중심은 인앱 메시지함과 등록하신 이메일입니다. 같은 내용을 문서 센터에서도 확인해 주세요.",
  "customer.invoice.postpay.docs_count": "지금 확인·제출할 서류 요청은 {n}건입니다.",
  "customer.invoice.postpay.actions_aria": "결제 완료 후 이동할 화면",
  "customer.invoice.postpay.cta_documents": "필수 서류 확인 (문서 센터)",
  "customer.invoice.postpay.cta_messages": "메시지함 열기",
  "customer.invoice.postpay.cta_dashboard": "대시보드 (요약)",
  "customer.invoice.postpay.legal_align":
    "범위·책임 한도는 이 청구서의 ‘결제 전 꼭 확인해 주세요’ 안내와 동일합니다. 세부 서류·일정은 메시지함·이메일로 이어집니다.",
  "customer.invoice.status.SENT": "결제 대기",
  "customer.invoice.status.PENDING": "결제 대기",
  "customer.invoice.status.DRAFT": "작성 중",
  "customer.invoice.status.PAID": "결제 완료",
  "customer.invoice.status.FAILED": "결제 실패",
  "customer.invoice.status.CANCELED": "취소됨",
  "customer.invoice.status.VOID": "결제 불가",
  "customer.invoice.status.EXPIRED": "만료됨",
  "customer.invoice.status._fallback": "확인 필요",
  "customer.invoice.missing_id_title": "청구서를 열 수 없습니다",
  "customer.invoice.missing_id_body":
    "메시지함 또는 이메일에 안내된 청구서 링크(청구서 ID 포함)로 다시 접속해 주세요.",
  "customer.invoice.load_error": "청구서를 불러오지 못했습니다. 연결을 확인한 뒤 다시 시도해 주세요.",
  "customer.invoice.locale_refresh_failed":
    "새 언어로 청구서 내용을 다시 불러오지 못했습니다. 이전 내용을 표시합니다.",
};

const EN = {
  "common.header.brand.customer": "Landing Help AI",
  "common.header.messages": "Messages",
  "common.header.messages_unread_suffix": "unread",
  "common.header.messages_unread_badge": "New messages",
  "common.header.menu.profile": "Profile",
  "common.header.menu.password": "Change password",
  "common.header.menu.logout": "Log out",
  "common.sidebar.customer.aria_label": "Customer menu",
  "common.sidebar.customer.dashboard": "Dashboard",
  "common.sidebar.customer.service_flow": "Request quote",
  "common.sidebar.customer.quote": "Quote",
  "common.sidebar.customer.invoice": "Invoice",
  "common.sidebar.customer.documents": "Documents",
  "common.sidebar.customer.messages": "Messages",
  "common.sidebar.customer.ai_assistant": "Landing Help AI Agent",
  "common.sidebar.customer.schedule": "Schedule",
  "common.sidebar.customer.completion": "Completion",
  "common.sidebar.placeholder.todo": "Loading sidebar…",
  "common.service_flow.delivery.ai_guide.badge": "Landing Help AI Agent",
  "common.service_flow.delivery.in_person.badge": "In-person support",
  "common.service_flow.delivery.ai_plus_human.badge": "Landing Help AI Agent + optional human help",
  "common.service_flow.delivery.general.badge": "Guided service",

  "customer.invoice.page_title": "Invoice & payment",
  "customer.invoice.subtitle":
    "This invoice is based on your approved quote. Please review the details below, then complete payment.",
  "customer.invoice.hero.title_payment_needed": "Payment required",
  "customer.invoice.hero.title_paid": "Payment completed",
  "customer.invoice.hero.title_failed": "Please try payment again",
  "customer.invoice.hero.title_canceled": "This invoice was canceled",
  "customer.invoice.hero.title_unpayable": "This invoice cannot be paid right now",
  "customer.invoice.hero.subtitle_default":
    "This is your invoice for the service you approved. Please review the details below, then complete payment.",
  "customer.invoice.hero.subtitle_paid":
    "This invoice is already paid. You can use the reference numbers below if you need them for support.",
  "customer.invoice.hero.subtitle_failed":
    "We could not complete your last payment attempt. Please try again or message the team.",
  "customer.invoice.hero.subtitle_canceled": "This invoice can no longer be paid. Contact us via messages if you need help.",
  "customer.invoice.hero.web_only":
    "Payment is available only on this web page in your browser. We do not ask you to pay through unrelated links or apps.",
  "customer.invoice.hero.request_label": "Request summary",
  "customer.invoice.hero.request_prefix": "Survey request: %s",
  "customer.invoice.hero.billed_services_label": "Services on this invoice",
  "customer.invoice.hero.reassurance": "After payment, service guidance begins.",
  "customer.invoice.hero.actions_aria": "Invoice payment and support",
  "customer.invoice.hero.cta.pay": "Pay now",
  "customer.invoice.hero.cta.ask": "Ask a question",
  "customer.invoice.hero.cta.messages": "Open messages",
  "customer.invoice.hero.status_paid": "Landing Help AI Agent guidance has started.",
  "customer.invoice.hero.status_unpayable": "Please contact us in your message inbox for details.",
  "customer.invoice.hero.status_unknown": "We could not confirm this invoice status. Please message us for help.",
  "customer.invoice.hero.service_label": "Service / package",
  "customer.invoice.hero.amount_label": "Amount to pay today",
  "customer.invoice.hero.amount_label_paid": "Invoiced amount",
  "customer.invoice.hero.amount_label_canceled": "Invoice amount (reference)",
  "customer.invoice.hero.amount_eyebrow": "Total due",
  "customer.invoice.hero.amount_eyebrow_paid": "Amount paid",
  "customer.invoice.hero.amount_eyebrow_canceled": "Amount (reference only)",
  "customer.invoice.section.summary_title": "Invoice summary",
  "customer.invoice.section.reference_title": "Reference numbers",
  "customer.invoice.reference.hint":
    "Share these with support if you need help locating this invoice.",
  "customer.invoice.details.section_title": "Invoice reference details",
  "customer.invoice.details.section_intro":
    "Reference numbers, dates, and billing parties for support and your records. Review the amount summary and notices above before paying. Expand when you need these details.",
  "customer.invoice.meta.section_title": "Invoice details",
  "customer.invoice.meta.block_title": "Numbers, dates & status",
  "customer.invoice.meta.section_intro":
    "Reference numbers, dates, and payment status help you identify this bill and plan payment.",
  "customer.invoice.meta.issue_date": "Issue date",
  "customer.invoice.meta.due_date": "Due date",
  "customer.invoice.meta.due_not_set":
    "No separate due date. After payment, service guidance begins.",
  "customer.invoice.meta.invoice_number": "Invoice number",
  "customer.invoice.meta.quote_reference": "Related quote",
  "customer.invoice.meta.payment_status": "Payment status",
  "customer.invoice.meta.currency": "Currency",
  "customer.invoice.meta.support_hint":
    "When contacting support, share your invoice number and quote reference for faster lookup.",
  "customer.invoice.parties.from_title": "Service provider (billing from)",
  "customer.invoice.parties.to_title": "Customer (billing to)",
  "customer.invoice.parties.from_empty": "Billing party details are not shown yet. Please message us if you need them.",
  "customer.invoice.parties.to_empty":
    "No customer contact details are shown on this invoice. Check your quote request or messages.",
  "customer.invoice.parties.from.legal_name": "Legal name",
  "customer.invoice.parties.from.address": "Registered address",
  "customer.invoice.parties.from.email": "Email",
  "customer.invoice.parties.from.phone": "Phone",
  "customer.invoice.parties.from.tax_id": "Business / tax ID",
  "customer.invoice.parties.to.full_name": "Customer name",
  "customer.invoice.parties.to.company": "Company / organization",
  "customer.invoice.parties.to.email": "Customer email",
  "customer.invoice.parties.to.phone": "Phone",
  "customer.invoice.parties.to.address": "Billing / contact address",
  "customer.invoice.label.invoice_id": "Invoice ID",
  "customer.invoice.label.quote_id": "Quote ID",
  "customer.invoice.label.service": "Service you are paying for",
  "customer.invoice.label.amount": "Amount due",
  "customer.invoice.label.status": "Status",
  "customer.invoice.section.scope_title": "What this bill covers",
  "customer.invoice.scope.main_title": "Services on this invoice",
  "customer.invoice.scope.main_intro":
    "You are paying for the service or package and included scope described below. Please review this together with your approved quote.",
  "customer.invoice.scope.billed_title": "Billed service and scope",
  "customer.invoice.scope.description_label": "Summary description",
  "customer.invoice.scope.note_label": "Note from your team",
  "customer.invoice.scope.summary_label": "Included scope summary",
  "customer.invoice.scope.quote_note":
    "This invoice is based on your agreed quote (%s). If anything looks different from the quote, please message us.",
  "customer.invoice.scope.limitation":
    "This charge applies only to the service scope described above. Additional scope or changes may require a separate agreement and additional billing.",
  "customer.invoice.amount.section_title": "Billing summary",
  "customer.invoice.amount.section_intro":
    "Amounts for each service you selected, then totals below. The amount you pay today is in the final row.",
  "customer.invoice.amount.row.service_subtotal": "Service items subtotal",
  "customer.invoice.amount.row.tax_and_fees": "Tax / additional fees",
  "customer.invoice.amount.table_caption": "Summary of how your invoice amount is built",
  "customer.invoice.amount.col_item": "Item",
  "customer.invoice.amount.col_amount": "Amount",
  "customer.invoice.amount.row.base": "Base service / package",
  "customer.invoice.amount.row.addons": "Add-ons / options",
  "customer.invoice.amount.row.admin_fee": "Custom coordination support fee",
  "customer.invoice.amount.row.subtotal_pre_tax": "Subtotal (before tax & fees)",
  "customer.invoice.amount.row.discount": "Discounts / adjustments",
  "customer.invoice.amount.row.surcharge": "Additional amount (vs. quote subtotal + tax)",
  "customer.invoice.amount.row.tax": "Taxes & fees",
  "customer.invoice.amount.row.invoice_total": "Invoice total (this document)",
  "customer.invoice.amount.row.amount_paid": "Amount already paid",
  "customer.invoice.amount.row.current_payable": "Amount to pay today",
  "customer.invoice.amount.row.balance_remaining": "Remaining balance",
  "customer.invoice.amount.surcharge_hint":
    "The invoice total is higher than the quote subtotal plus tax on file. Additional fees or adjustments may apply—contact us if you need a breakdown.",
  "customer.invoice.scope.intro":
    "The following summarizes the scope agreed when you requested the quote. See your quote and team messages for full detail.",
  "customer.invoice.scope.empty":
    "No linked service list is shown on this page. The amount follows your approved quote—see your quote or messages for detail, or contact us if something looks wrong.",
  "customer.invoice.services.support.ai_guide": "Includes Landing Help AI Agent guidance",
  "customer.invoice.services.support.in_person": "Includes in-person support",
  "customer.invoice.services.support.ai_plus_human": "Includes Agent guidance + optional human help",
  "customer.invoice.services.support.general": "Includes guided service support",
  "customer.invoice.services.admin_fee_title": "Custom support fee",
  "customer.invoice.services.admin_fee_support":
    "Progress guidance and message support tailored to your request",
  "customer.invoice.services.hint.phone": "Actual carrier charges are billed separately.",
  "customer.invoice.services.hint.car":
    "Vehicle purchase price, insurance, tax, and registration fees are separate.",
  "customer.invoice.services.hint.default":
    "Amounts shown are for Landing Help AI guidance and support; third-party or on-site costs may be separate.",
  "customer.invoice.services.amount_pending": "Amount pending",
  "customer.invoice.section.legal_title": "Payment and contract",
  "customer.invoice.legal.notice_block_title": "Please review before paying",
  "customer.invoice.prepay_scope.lede":
    "Before you pay, please read the sections below. This invoice is for Landing Help AI guidance and support; items on the right are costs or steps you handle or pay separately.",
  "customer.invoice.prepay_scope.context_note_phone":
    "Your services include phone or mobile setup. Actual carrier charges and activation fees are not part of this invoice amount.",
  "customer.invoice.prepay_scope.context_note_car":
    "Your services include vehicle-related help. Purchase price, insurance, tax, and registration fees are not part of this invoice amount.",
  "customer.invoice.prepay_scope.context_note_both":
    "Your services include both phone/mobile and vehicle-related help. Carrier charges and vehicle-related costs are separate from this invoice.",
  "customer.invoice.prepay_scope.included_title": "Included in this invoice",
  "customer.invoice.prepay_scope.excluded_title": "Not included in this invoice",
  "customer.invoice.prepay_scope.included.agent_steps": "Step-by-step guidance from Landing Help AI Agent",
  "customer.invoice.prepay_scope.included.checklist": "Checklists and lists of what to prepare",
  "customer.invoice.prepay_scope.included.messages": "Question support through your message inbox",
  "customer.invoice.prepay_scope.included.progress_guidance": "Progress guidance within the service scope you requested",
  "customer.invoice.prepay_scope.excluded.carrier_fees": "Actual carrier plan charges or activation fees",
  "customer.invoice.prepay_scope.excluded.car_purchase_cost": "The actual purchase price of a vehicle",
  "customer.invoice.prepay_scope.excluded.insurance_tax_registration": "Insurance premiums, sales tax, and registration fees",
  "customer.invoice.prepay_scope.excluded.legal_contract": "Signing contracts on your behalf",
  "customer.invoice.prepay_scope.excluded.account_payment": "Creating accounts or making payments for you",
  "customer.invoice.prepay_scope.excluded.third_party_outcomes":
    "Guarantees of approvals or outcomes from agencies, carriers, or dealers",
  "customer.invoice.section.after_title": "After you pay",
  "customer.invoice.next_steps.title": "Next steps after payment",
  "customer.invoice.next_steps.intro": "After payment, Landing Help AI Agent guidance begins.",
  "customer.invoice.next_steps.actions_aria": "Payment and support",
  "customer.invoice.next_steps.step.1": "Your payment status updates to paid.",
  "customer.invoice.next_steps.step.2": "Next-step guidance is sent to your email and message inbox.",
  "customer.invoice.next_steps.step.3": "The Agent guides you through what to prepare and what to do next.",
  "customer.invoice.next_steps.step.4": "You can keep asking questions in your message inbox.",
  "customer.invoice.next_steps.intro_paid":
    "Your payment is complete. Agent guidance continues—see the steps below.",
  "customer.invoice.pay_button": "Pay now",
  "customer.invoice.action.helper_web_only": "Payment from this button is web-only on this site.",
  "customer.invoice.action.helper_contract": "Completing payment forms the contract and starts the agreed service workflow.",
  "customer.invoice.action.secondary_nav_aria": "Additional invoice actions",
  "customer.invoice.action.help": "Ask for help (messages)",
  "customer.invoice.action.view_quote": "View related quote",
  "customer.invoice.action.view_pdf": "View invoice PDF",
  "customer.invoice.pay_processing": "Preparing checkout…",
  "customer.invoice.pay_success":
    "Payment completed. Check Messages and the Documents page for required files and next steps.",
  "customer.invoice.pay_error": "We could not complete payment. Please try again or message the team.",
  "customer.invoice.result_title": "Payment result",
  "customer.invoice.result_success_detail":
    "Your payment was recorded. Service will proceed in order after contract and payment are complete.",
  "customer.invoice.postpay.section_title": "Next — review required documents",
  "customer.invoice.postpay.lead":
    "Your payment is complete. Your agreement is in effect and service preparation has started. Review the guidance below, then continue in the app.",
  "customer.invoice.postpay.bullet_payment": "Your payment has been completed and confirmed.",
  "customer.invoice.postpay.bullet_contract":
    "As in the Contract & billing scope notice above, completing payment forms the contract and the agreed scope applies.",
  "customer.invoice.postpay.bullet_prep": "We are starting preparation and next steps for the services you selected.",
  "customer.invoice.postpay.bullet_docs":
    "Required documents for your case can now be reviewed. They were not shown before payment by design.",
  "customer.invoice.postpay.channels_primary":
    "Your in-app message inbox and the email on your account are the main channels for follow-up. Please also open Documents for the checklist.",
  "customer.invoice.postpay.docs_count": "You have {n} document request(s) to review or submit.",
  "customer.invoice.postpay.actions_aria": "Where to go after payment",
  "customer.invoice.postpay.cta_documents": "View required documents",
  "customer.invoice.postpay.cta_messages": "Open inbox / messages",
  "customer.invoice.postpay.cta_dashboard": "Dashboard (summary)",
  "customer.invoice.postpay.legal_align":
    "Scope and limits match the Contract & billing scope notice on this invoice. Details for files and timing continue in messages and email.",
  "customer.invoice.status.SENT": "Awaiting payment",
  "customer.invoice.status.PENDING": "Awaiting payment",
  "customer.invoice.status.DRAFT": "Draft",
  "customer.invoice.status.PAID": "Paid",
  "customer.invoice.status.FAILED": "Payment failed",
  "customer.invoice.status.CANCELED": "Canceled",
  "customer.invoice.status.VOID": "Not payable",
  "customer.invoice.status.EXPIRED": "Expired",
  "customer.invoice.status._fallback": "Needs review",
  "customer.invoice.missing_id_title": "Cannot open this invoice",
  "customer.invoice.missing_id_body":
    "Please use the invoice link from your messages or email (it includes your invoice ID).",
  "customer.invoice.load_error": "Could not load the invoice. Check your connection and try again.",
  "customer.invoice.locale_refresh_failed":
    "Could not refresh invoice details for the new language. Showing the previous version.",
};

/** English sources for ``t(key, fallback)`` while StringKey catalog catches up. */
export function invoicePageEnglishFallback(key) {
  return EN[key] ?? "";
}

/** @param {string | null | undefined} lang */
export function getInvoiceLocaleBundle(lang) {
  const code = normalizeSupportedLanguageCode(lang) || DEFAULT_LANGUAGE_CODE;
  if (code === "ko") return { ...KO };
  return { ...EN };
}
