/**
 * 청구서(고객) 페이지: 견적 선호 언어 기준 UI 및 API 번역 공백 시 폴백.
 */

/** @param {unknown} quote */
export function resolveInvoiceUiLang(quote) {
  const rd = quote?.request_details && typeof quote.request_details === "object" ? quote.request_details : {};
  const survey = rd.survey_submission && typeof rd.survey_submission === "object" ? rd.survey_submission : {};
  const common = survey.common_info && typeof survey.common_info === "object" ? survey.common_info : {};
  const pref = (common.preferred_language || "").toString().trim().toLowerCase();
  if (pref === "en" || pref === "english") return "en";
  return "ko";
}

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
  "common.sidebar.customer.ai_assistant": "AI 안내",
  "common.sidebar.customer.schedule": "일정",
  "common.sidebar.customer.completion": "완료",
  "common.sidebar.placeholder.todo": "사이드바를 불러오는 중입니다…",
  "common.service_flow.delivery.ai_guide.badge": "AI 안내",
  "common.service_flow.delivery.in_person.badge": "대면·현장 지원",
  "common.service_flow.delivery.ai_plus_human.badge": "AI + 필요 시 사람 도움",
  "common.service_flow.delivery.general.badge": "안내형 서비스",

  "customer.invoice.page_title": "청구서 · 결제",
  "customer.invoice.subtitle":
    "승인하신 견적을 바탕으로 발행된 청구입니다. 아래 내용을 확인한 뒤 결제를 진행해 주세요.",
  "customer.invoice.hero.title_payment_needed": "결제가 필요합니다",
  "customer.invoice.hero.title_paid": "결제가 완료되었습니다",
  "customer.invoice.hero.title_failed": "결제를 다시 시도해 주세요",
  "customer.invoice.hero.title_canceled": "이 청구서는 취소되었습니다",
  "customer.invoice.hero.subtitle_default":
    "승인하신 서비스에 대한 청구서입니다. 아래 내용을 확인한 뒤 결제를 진행해 주세요.",
  "customer.invoice.hero.subtitle_paid":
    "이 청구는 이미 결제가 완료된 상태입니다. 추가 결제 없이 아래 참고 번호로 기록을 확인하실 수 있습니다.",
  "customer.invoice.hero.subtitle_failed":
    "결제 처리 중 문제가 있었습니다. 다시 시도하시거나 메시지함으로 문의해 주세요.",
  "customer.invoice.hero.subtitle_canceled": "이 청구는 더 이상 결제할 수 없습니다. 문의는 메시지함을 이용해 주세요.",
  "customer.invoice.hero.web_only": "결제는 이 웹 화면(브라우저)에서만 진행할 수 있습니다. 앱 외부 링크로 유도되는 결제는 지원하지 않습니다.",
  "customer.invoice.hero.service_label": "결제 대상 서비스·패키지",
  "customer.invoice.hero.amount_label": "결제하실 금액",
  "customer.invoice.hero.amount_label_paid": "청구·결제 금액",
  "customer.invoice.hero.amount_label_canceled": "청구 금액(참고)",
  "customer.invoice.hero.amount_eyebrow": "납부 총액",
  "customer.invoice.hero.amount_eyebrow_paid": "결제 완료 금액",
  "customer.invoice.hero.amount_eyebrow_canceled": "청구 금액(참고)",
  "customer.invoice.section.summary_title": "청구 요약",
  "customer.invoice.section.reference_title": "참고 번호",
  "customer.invoice.reference.hint":
    "문의·고객지원 시 아래 번호를 알려 주시면 빠르게 확인할 수 있습니다.",
  "customer.invoice.meta.section_title": "청구서 정보",
  "customer.invoice.meta.section_intro":
    "청구서 번호·날짜·결제 상태 등 본 문서를 식별하는 정보입니다. 납부 일정 확인에 참고해 주세요.",
  "customer.invoice.meta.issue_date": "발행일",
  "customer.invoice.meta.due_date": "납기일",
  "customer.invoice.meta.due_not_set": "별도 안내 없음",
  "customer.invoice.meta.invoice_number": "청구서 번호",
  "customer.invoice.meta.quote_reference": "관련 견적 참조",
  "customer.invoice.meta.payment_status": "결제 상태",
  "customer.invoice.meta.currency": "통화",
  "customer.invoice.meta.support_hint":
    "문의·고객지원 시 청구서 번호와 견적 참조를 함께 알려 주시면 빠르게 확인할 수 있습니다.",
  "customer.invoice.parties.section_title": "누가 청구하고, 누가 결제하나요",
  "customer.invoice.parties.section_intro":
    "아래는 청구를 보내는 쪽(서비스 제공·청구 발행)과 비용을 지불하는 고객(귀하) 정보입니다. 세금·계약 문의 시 함께 확인해 주세요.",
  "customer.invoice.parties.from_title": "청구·서비스 제공 측",
  "customer.invoice.parties.to_title": "결제·청구 대상 (고객)",
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
  "customer.invoice.parties.to.email": "이메일",
  "customer.invoice.parties.to.phone": "연락처",
  "customer.invoice.parties.to.address": "청구·연락 주소",
  "customer.invoice.label.invoice_id": "청구서 ID",
  "customer.invoice.label.quote_id": "견적 ID",
  "customer.invoice.label.service": "결제 대상 서비스",
  "customer.invoice.label.amount": "결제하실 금액",
  "customer.invoice.label.status": "상태",
  "customer.invoice.section.scope_title": "청구 범위에 포함되는 내용",
  "customer.invoice.scope.main_title": "본 청구서가 포함하는 내용",
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
    "위에서 확인하신 포함 범위에 대한 대가가 아래 표로 정리되어 있습니다. 청구 총액은 이 청구서 기준이며, 실제로 송금하실 금액은 맨 아래 ‘지금 결제하실 금액’을 따릅니다.",
  "customer.invoice.amount.table_caption": "포함 범위에 따른 금액 구성 요약",
  "customer.invoice.amount.col_item": "항목",
  "customer.invoice.amount.col_amount": "금액",
  "customer.invoice.amount.row.base": "기본 서비스·패키지",
  "customer.invoice.amount.row.addons": "부가·옵션(추가 항목)",
  "customer.invoice.amount.row.subtotal_pre_tax": "소계(세금·수수료 제외)",
  "customer.invoice.amount.row.discount": "할인·조정",
  "customer.invoice.amount.row.surcharge": "추가 금액(견적 소계 대비)",
  "customer.invoice.amount.row.tax": "세금·수수료",
  "customer.invoice.amount.row.invoice_total": "청구 총액(본 청구서)",
  "customer.invoice.amount.row.amount_paid": "이미 결제된 금액",
  "customer.invoice.amount.row.current_payable": "지금 결제하실 금액",
  "customer.invoice.amount.row.balance_remaining": "남은 결제 금액",
  "customer.invoice.amount.surcharge_hint":
    "청구 총액이 견적의 세전 소계·세금 합계보다 큽니다. 견적서에 없는 수수료·조정이 포함되었을 수 있으니 문의 시 알려 주세요.",
  "customer.invoice.scope.intro":
    "아래는 견적·신청 시점에 합의된 범위를 요약한 것입니다. 세부 사항은 견적서·팀 안내와 함께 확인해 주세요.",
  "customer.invoice.scope.empty":
    "선택 서비스 목록이 이 화면에 연결되어 있지 않습니다. 금액은 승인된 견적 기준이며, 상세 범위는 견적서·메시지함을 확인해 주세요.",
  "customer.invoice.section.legal_title": "결제 및 계약에 관한 안내",
  "customer.invoice.legal.notice_block_title": "계약·청구 범위 안내",
  "customer.invoice.legal.statement":
    "결제는 서비스 진행을 위한 마지막 확인 단계입니다. 결제가 완료되면 계약이 성립하고, 합의된 범위에 따라 서비스 제공이 시작됩니다.",
  "customer.invoice.legal.support_scope":
    "이 청구서는 이 화면에 적힌 서비스·범위에만 해당합니다. 적혀 있지 않은 업무나 결과물은 포함되지 않습니다.",
  "customer.invoice.legal.support_changes":
    "진행 중 범위를 바꾸거나 추가를 원하시면, 별도 견적·추가 청구 또는 별도 계약이 필요할 수 있습니다.",
  "customer.invoice.legal.support_separate_services":
    "추가 서비스나 범위 확대는 이 청구만으로는 포함되지 않으며, 별도 견적과 계약이 필요합니다.",
  "customer.invoice.legal.support_cancellation":
    "취소·환불·일정 변경 등은 당사 정책 및 이용약관(또는 별도로 안내된 조건)에 따릅니다. 구체적인 절차는 메시지함을 통해 확인해 주세요.",
  "customer.invoice.section.after_title": "결제 이후 진행",
  "customer.invoice.after.section_main_title": "결제 후 어떻게 진행되나요",
  "customer.invoice.after.section_intro":
    "결제를 완료하시면 아래 순서로 진행됩니다. 바로 위 ‘계약·청구 범위 안내’에서 안내드린 것처럼, 결제 완료 시 계약이 성립하고 합의된 범위에 따라 서비스가 시작됩니다.",
  "customer.invoice.after.subsection_next_steps": "결제 이후 다음 단계",
  "customer.invoice.after.1": "결제가 정상적으로 확인·반영됩니다.",
  "customer.invoice.after.2": "결제 완료 시점부터 계약이 유효하며, 약속된 범위에 맞춰 진행됩니다.",
  "customer.invoice.after.3":
    "메시지함·등록 이메일과 「문서」센터에서 다음 할 일과 필요 서류 안내를 받으실 수 있습니다. 대시보드에서도 진행 요약을 확인할 수 있습니다.",
  "customer.invoice.after.4": "안내에 따라 준비가 완료되면, 합의된 범위에 따라 서비스 제공이 순서대로 시작됩니다.",
  "customer.invoice.after.5": "진행 중 궁금한 점은 이 앱의 메시지함으로 편하게 문의해 주세요.",
  "customer.invoice.before_pay.section_main_title": "결제를 완료하신 뒤 진행",
  "customer.invoice.before_pay.section_intro":
    "아래는 결제를 마친 뒤의 일반적인 흐름입니다. 구체적인 필수 서류·제출 목록은 결제 완료 후에만 안내됩니다.",
  "customer.invoice.before_pay.subsection_next_steps": "결제 완료 후 예상 단계",
  "customer.invoice.before_pay.after.1": "결제가 정상적으로 확인·반영됩니다.",
  "customer.invoice.before_pay.after.2": "결제 완료 시점부터 계약이 유효하며, 합의된 범위에 따라 서비스가 시작됩니다.",
  "customer.invoice.before_pay.after.3": "이후 단계·일정 안내는 메시지함·이메일 등으로 전달됩니다.",
  "customer.invoice.before_pay.after.4": "팀 안내에 따라 준비가 완료되면, 합의된 범위에 따라 서비스 제공이 순서대로 이어집니다.",
  "customer.invoice.before_pay.after.5": "진행 중 궁금한 점은 이 앱의 메시지함으로 편하게 문의해 주세요.",
  "customer.invoice.pay_button": "웹에서 결제하기",
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
  "customer.invoice.postpay.bullet_contract": "위 ‘계약·청구 범위 안내’와 같이, 결제 완료 시 계약이 성립하고 합의된 범위가 적용됩니다.",
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
    "범위·책임 한도는 이 청구서 상단의 계약·청구 범위 안내와 동일합니다. 세부 서류·일정은 메시지함·이메일로 이어집니다.",
  "customer.invoice.status.SENT": "결제 대기",
  "customer.invoice.status.DRAFT": "작성 중",
  "customer.invoice.status.PAID": "결제 완료",
  "customer.invoice.status.FAILED": "결제 실패",
  "customer.invoice.status.CANCELED": "결제 취소",
  "customer.invoice.status._fallback": "—",
  "customer.invoice.missing_id_title": "청구서를 열 수 없습니다",
  "customer.invoice.missing_id_body":
    "메시지함 또는 이메일에 안내된 청구서 링크(청구서 ID 포함)로 다시 접속해 주세요.",
  "customer.invoice.load_error": "청구서를 불러오지 못했습니다. 연결을 확인한 뒤 다시 시도해 주세요.",
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
  "common.sidebar.customer.ai_assistant": "AI guide",
  "common.sidebar.customer.schedule": "Schedule",
  "common.sidebar.customer.completion": "Completion",
  "common.sidebar.placeholder.todo": "Loading sidebar…",
  "common.service_flow.delivery.ai_guide.badge": "AI guide",
  "common.service_flow.delivery.in_person.badge": "In-person support",
  "common.service_flow.delivery.ai_plus_human.badge": "AI + optional human help",
  "common.service_flow.delivery.general.badge": "Guided service",

  "customer.invoice.page_title": "Invoice & payment",
  "customer.invoice.subtitle":
    "This invoice is based on your approved quote. Please review the details below, then complete payment.",
  "customer.invoice.hero.title_payment_needed": "Payment required",
  "customer.invoice.hero.title_paid": "Payment completed",
  "customer.invoice.hero.title_failed": "Please try payment again",
  "customer.invoice.hero.title_canceled": "This invoice was canceled",
  "customer.invoice.hero.subtitle_default":
    "This is your invoice for the service you approved. Please review the details below, then complete payment.",
  "customer.invoice.hero.subtitle_paid":
    "This invoice is already paid. You can use the reference numbers below if you need them for support.",
  "customer.invoice.hero.subtitle_failed":
    "We could not complete your last payment attempt. Please try again or message the team.",
  "customer.invoice.hero.subtitle_canceled": "This invoice can no longer be paid. Contact us via messages if you need help.",
  "customer.invoice.hero.web_only":
    "Payment is available only on this web page in your browser. We do not ask you to pay through unrelated links or apps.",
  "customer.invoice.hero.service_label": "Service / package",
  "customer.invoice.hero.amount_label": "Amount due",
  "customer.invoice.hero.amount_label_paid": "Invoiced amount",
  "customer.invoice.hero.amount_label_canceled": "Invoice amount (reference)",
  "customer.invoice.hero.amount_eyebrow": "Total due",
  "customer.invoice.hero.amount_eyebrow_paid": "Amount paid",
  "customer.invoice.hero.amount_eyebrow_canceled": "Amount (reference only)",
  "customer.invoice.section.summary_title": "Invoice summary",
  "customer.invoice.section.reference_title": "Reference numbers",
  "customer.invoice.reference.hint":
    "Share these with support if you need help locating this invoice.",
  "customer.invoice.meta.section_title": "Invoice details",
  "customer.invoice.meta.section_intro":
    "Reference numbers, dates, and payment status help you identify this bill and plan payment.",
  "customer.invoice.meta.issue_date": "Issue date",
  "customer.invoice.meta.due_date": "Due date",
  "customer.invoice.meta.due_not_set": "Not specified",
  "customer.invoice.meta.invoice_number": "Invoice number",
  "customer.invoice.meta.quote_reference": "Related quote",
  "customer.invoice.meta.payment_status": "Payment status",
  "customer.invoice.meta.currency": "Currency",
  "customer.invoice.meta.support_hint":
    "When contacting support, share your invoice number and quote reference for faster lookup.",
  "customer.invoice.parties.section_title": "Who is billing you, and who is paying",
  "customer.invoice.parties.section_intro":
    "The organization sending this invoice (service provider) and you as the customer paying the bill. Keep this handy for tax and contract questions.",
  "customer.invoice.parties.from_title": "Billing from",
  "customer.invoice.parties.to_title": "Billing to",
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
  "customer.invoice.parties.to.email": "Email",
  "customer.invoice.parties.to.phone": "Phone",
  "customer.invoice.parties.to.address": "Billing / contact address",
  "customer.invoice.label.invoice_id": "Invoice ID",
  "customer.invoice.label.quote_id": "Quote ID",
  "customer.invoice.label.service": "Service you are paying for",
  "customer.invoice.label.amount": "Amount due",
  "customer.invoice.label.status": "Status",
  "customer.invoice.section.scope_title": "What this bill covers",
  "customer.invoice.scope.main_title": "What this invoice covers",
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
    "The table below breaks down what you are paying for the included scope above. The invoice total is the amount on this document; the figure you should pay right now is “Amount to pay now” at the bottom.",
  "customer.invoice.amount.table_caption": "Summary of how your invoice amount is built",
  "customer.invoice.amount.col_item": "Item",
  "customer.invoice.amount.col_amount": "Amount",
  "customer.invoice.amount.row.base": "Base service / package",
  "customer.invoice.amount.row.addons": "Add-ons / options",
  "customer.invoice.amount.row.subtotal_pre_tax": "Subtotal (before tax & fees)",
  "customer.invoice.amount.row.discount": "Discounts / adjustments",
  "customer.invoice.amount.row.surcharge": "Additional amount (vs. quote subtotal + tax)",
  "customer.invoice.amount.row.tax": "Taxes & fees",
  "customer.invoice.amount.row.invoice_total": "Invoice total (this document)",
  "customer.invoice.amount.row.amount_paid": "Amount already paid",
  "customer.invoice.amount.row.current_payable": "Amount to pay now",
  "customer.invoice.amount.row.balance_remaining": "Remaining balance",
  "customer.invoice.amount.surcharge_hint":
    "The invoice total is higher than the quote subtotal plus tax on file. Additional fees or adjustments may apply—contact us if you need a breakdown.",
  "customer.invoice.scope.intro":
    "The following summarizes the scope agreed when you requested the quote. See your quote and team messages for full detail.",
  "customer.invoice.scope.empty":
    "No linked service list is shown on this page. The amount follows your approved quote—see your quote or messages for detail, or contact us if something looks wrong.",
  "customer.invoice.section.legal_title": "Payment and contract",
  "customer.invoice.legal.notice_block_title": "Contract & billing scope",
  "customer.invoice.legal.statement":
    "Payment is your last confirmation step before work begins. When payment is completed, the contract is formed and service delivery starts under the agreed scope.",
  "customer.invoice.legal.support_scope":
    "This invoice covers only the service and scope described on this page. Anything not written here is not included.",
  "customer.invoice.legal.support_changes":
    "If you change the scope or add requests later, we may need a new quote, additional billing, or a separate contract.",
  "customer.invoice.legal.support_separate_services":
    "Additional services or a wider scope are not covered by this invoice alone; they require a separate quote and agreement.",
  "customer.invoice.legal.support_cancellation":
    "Cancellations, refunds, and schedule changes follow our policies and terms (or any conditions provided separately). For specifics, please contact us via your in-app message thread.",
  "customer.invoice.section.after_title": "After you pay",
  "customer.invoice.after.section_main_title": "What happens after payment",
  "customer.invoice.after.section_intro":
    "After you pay, the steps below describe what happens next. As explained in the contract & billing scope notice above, completing payment forms the contract and service begins under the agreed scope.",
  "customer.invoice.after.subsection_next_steps": "Next steps after payment",
  "customer.invoice.after.1": "Your payment is confirmed and recorded.",
  "customer.invoice.after.2": "From that point, the contract is in effect and work proceeds under the agreed scope.",
  "customer.invoice.after.3":
    "Your in-app inbox, registered email, and the Documents section will carry next steps and required-file guidance. You can also review a summary on your dashboard.",
  "customer.invoice.after.4": "Once those steps are complete, service delivery continues in order under the agreed scope.",
  "customer.invoice.after.5": "If you have questions along the way, message us anytime in the app.",
  "customer.invoice.before_pay.section_main_title": "After you complete payment",
  "customer.invoice.before_pay.section_intro":
    "Below is the usual flow after payment. Required-document requests and upload tasks are provided only after payment succeeds.",
  "customer.invoice.before_pay.subsection_next_steps": "Typical steps after payment",
  "customer.invoice.before_pay.after.1": "Your payment is confirmed and recorded.",
  "customer.invoice.before_pay.after.2": "From that point, the contract is in effect and work begins under the agreed scope.",
  "customer.invoice.before_pay.after.3": "Next steps and scheduling guidance are delivered via messages and email.",
  "customer.invoice.before_pay.after.4": "Once you follow team guidance, service delivery continues in order under the agreed scope.",
  "customer.invoice.before_pay.after.5": "If you have questions along the way, message us anytime in the app.",
  "customer.invoice.pay_button": "Pay on the web",
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
  "customer.invoice.status.DRAFT": "Draft",
  "customer.invoice.status.PAID": "Paid",
  "customer.invoice.status.FAILED": "Payment failed",
  "customer.invoice.status.CANCELED": "Canceled",
  "customer.invoice.status._fallback": "—",
  "customer.invoice.missing_id_title": "Cannot open this invoice",
  "customer.invoice.missing_id_body":
    "Please use the invoice link from your messages or email (it includes your invoice ID).",
  "customer.invoice.load_error": "Could not load the invoice. Check your connection and try again.",
};

/** @param {string} lang */
export function getInvoiceLocaleBundle(lang) {
  const l = (lang || "ko").toString().trim().toLowerCase();
  if (l === "en") return EN;
  return KO;
}
