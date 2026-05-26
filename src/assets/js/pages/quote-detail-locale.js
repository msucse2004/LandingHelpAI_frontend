/**
 * 견적 확인 페이지: 설문 `preferred_language` 기준 UI 언어 및 API 번역 공백 시 폴백 문자열.
 * mix / other / 미입력 → ko
 */

/** @param {unknown} quote */
export function resolveQuoteUiLang(quote) {
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
  "common.sidebar.customer.ai_assistant": "Landing Help AI Agent",
  "common.sidebar.customer.schedule": "일정",
  "common.sidebar.customer.completion": "완료",
  "common.sidebar.placeholder.todo": "사이드바를 불러오는 중입니다…",
  "common.service_flow.delivery.ai_guide.badge": "Landing Help AI Agent",
  "common.service_flow.delivery.ai_guide.explain":
    "다음 할 일과 진행 단계를 앱에서 순서대로 안내합니다. (운영에서 정한 필수 서류 요청은 결제 완료 후에 별도로 안내됩니다.)",
  "common.service_flow.delivery.in_person.badge": "대면·현장 지원",
  "common.service_flow.delivery.in_person.explain":
    "패키지에 포함된 경우 전화·미팅·방문 등 사람이 직접 조율하는 지원이 포함됩니다. 채팅만으로 끝나지 않습니다.",
  "common.service_flow.delivery.ai_plus_human.badge": "Landing Help AI Agent + 필요 시 사람 도움",
  "common.service_flow.delivery.ai_plus_human.explain":
    "먼저 앱에서 절차를 진행하고, 판단·서명·현장 확인 등이 필요할 때 사람의 도움을 받을 수 있습니다.",
  "common.service_flow.delivery.general.badge": "안내형 서비스",
  "common.service_flow.delivery.general.explain": "이 서비스에 맞는 단계를 쉬운 말로 순서대로 안내합니다.",

  "customer.quote.answer.bool_yes": "예",
  "customer.quote.answer.bool_no": "아니요",

  "customer.quote.page_title": "견적 확인",
  "customer.quote.loading": "견적을 불러오는 중입니다…",
  "customer.quote.empty": "아직 표시할 견적이 없습니다. 팀에서 제안이 오면 이 페이지에 나타납니다.",
  "customer.quote.load_error": "견적을 불러오지 못했습니다. 링크를 확인하거나 잠시 후 다시 시도해 주세요.",

  "customer.quote.hero.title": "견적이 준비되었습니다",
  "customer.quote.hero.subtitle": "요청하신 서비스에 대한 제안 내용을 확인해 주세요.",
  "customer.quote.hero.reassurance":
    "운영팀이 제안한 견적입니다. PDF와 후속 안내는 받은편지함·이메일에서도 확인할 수 있습니다.",
  "customer.quote.hero.service_label": "서비스 / 요청",
  "customer.quote.hero.service_summary_label": "서비스 요약",
  "customer.quote.hero.service_plain": "요청하신 서비스",
  "customer.quote.hero.scope_note": "이 금액에는 아래 견적 항목과 안내 지원이 포함됩니다.",
  "customer.quote.hero.cost_note":
    "아래 견적 항목과 포함·미포함 내용을 확인한 뒤 승인해 주세요.",
  "customer.quote.hero.actions_group": "이 견적에 대한 결정",
  "customer.quote.hero.cta.approve": "견적 승인하기",
  "customer.quote.hero.cta.ask": "질문하기",
  "customer.quote.hero.cta.reject": "견적 거절하기",
  "customer.quote.hero.status_message.approved":
    "견적을 승인했습니다. 메시지함과 이메일에서 청구서·결제 안내를 확인해 주세요.",
  "customer.quote.hero.status_message.rejected":
    "이 견적은 거절 처리되었습니다. 청구되지 않습니다. 다른 옵션이 필요하면 메시지로 문의해 주세요.",
  "customer.quote.hero.status_message.paid":
    "결제가 완료되었습니다. 대시보드와 메시지함에서 다음 단계를 이어가 주세요.",
  "customer.quote.hero.next_proposed":
    "다음: 아래 내용을 검토해 주세요. 문제없으면 승인을 눌러 주세요. 수용하기 어렵다면 거절을 눌러 주세요. 질문은 메시지함에서 팀에 남겨 주세요.",
  "customer.quote.hero.next_approved":
    "승인이 반영되었습니다. 시스템이 청구서를 만들어 메시지함과 이메일로 보냈습니다. 청구서를 연 뒤 안내에 따라 결제를 완료해 주세요.",
  "customer.quote.hero.next_rejected": "이 견적은 거절 처리되었습니다. 다른 옵션이 필요하면 메시지로 문의해 주세요.",
  "customer.quote.hero.next_default": "팀에서 제안이 오면 이곳에 표시됩니다.",

  "customer.quote.cost.primary_label": "제안 금액",
  "customer.quote.cost.eyebrow": "이 제안에 포함된 범위 기준",
  "customer.quote.cost.demo_pill": "샘플 견적",
  "customer.quote.cost.not_set": "팀 확인 후 안내",
  "customer.quote.cost.subtotal": "소계",
  "customer.quote.cost.tax": "예상 세금",
  "customer.quote.cost.total_line": "합계",
  "customer.quote.cost.line_items_hint": "항목 합계는",
  "customer.quote.cost.vs_estimate": "입니다. 위에 표시된 제안 금액이 승인 기준이 됩니다.",
  "customer.quote.cost.note":
    "금액은 합의된 범위를 기준으로 제안되었습니다. 선택 옵션이나 이 제안 밖의 업무는 별도 비용이 될 수 있으며, 청구 전에 팀과 확인합니다. 승인 후 팀이 다음 단계를 확정하기 전까지 청구되지 않습니다.",

  "customer.quote.pricing.title": "견적 항목",
  "customer.quote.pricing.lede": "제안된 각 서비스와 금액이 어떻게 총액에 반영되는지 확인할 수 있습니다.",
  "customer.quote.pricing.empty": "표시할 견적 항목이 없습니다. 메시지함에서 문의해 주세요.",
  "customer.quote.pricing.service_subtotal": "서비스 항목 합계",
  "customer.quote.pricing.final_total": "총 제안 금액",
  "customer.quote.pricing.final_hint": "고객님께 제안된 최종 금액입니다. 승인 시 이 금액을 기준으로 진행됩니다.",
  "customer.quote.pricing.adjustment_note":
    "서비스 항목 합계와 최종 제안 금액이 다를 때는, 차액을 맞춤 진행 지원비 또는 할인 조정 항목으로 위에 표시합니다.",
  "customer.quote.pricing.adjustment.support_title": "맞춤 진행 지원비",
  "customer.quote.pricing.adjustment.support_desc": "요청 범위에 맞춘 추가 안내 및 진행 관리",
  "customer.quote.pricing.adjustment.extra_title": "맞춤 진행 지원비",
  "customer.quote.pricing.adjustment.extra_desc": "서비스 단가 외 추가 안내·범위 조정에 해당하는 금액입니다.",
  "customer.quote.pricing.adjustment.discount_title": "할인",
  "customer.quote.pricing.adjustment.discount_desc": "최종 제안 금액에 반영된 할인 조정입니다.",
  "customer.quote.pricing.service_desc.ai_guide": "앱에서 단계별 안내와 체크리스트를 제공합니다.",
  "customer.quote.pricing.service_desc.in_person": "패키지에 포함된 경우 사람이 직접 조율하는 지원이 포함됩니다.",
  "customer.quote.pricing.service_desc.ai_plus_human": "앱에서 먼저 진행하고, 필요할 때 사람의 도움을 받을 수 있습니다.",
  "customer.quote.pricing.service_desc.general": "이 서비스에 맞는 단계를 쉬운 말로 순서대로 안내합니다.",

  "customer.quote.scope.title": "포함되는 것 / 포함되지 않는 것",
  "customer.quote.scope.lede":
    "이 견적 금액에 무엇이 포함되는지, 무엇은 고객님이 직접 진행·결제하는지 명확히 안내합니다.",
  "customer.quote.scope.aside":
    "아래 ‘포함되지 않는 것’은 고객님이 별도로 직접 결제하거나 최종 확인해야 하는 항목입니다. 견적 금액에 숨겨져 있지 않습니다.",
  "customer.quote.scope.included_title": "포함되는 것",
  "customer.quote.scope.excluded_title": "포함되지 않는 것",
  "customer.quote.scope.included.agent_steps": "Landing Help AI Agent의 단계별 안내",
  "customer.quote.scope.included.checklist": "필요한 준비물과 체크리스트 제공",
  "customer.quote.scope.included.next_steps": "다음 단계 진행 순서 안내",
  "customer.quote.scope.included.messages": "메시지함을 통한 질문 지원",
  "customer.quote.scope.included.info_organization": "고객 요청 범위에 맞춘 정보 정리",
  "customer.quote.scope.excluded.carrier_fees": "통신사 실제 요금 또는 가입비",
  "customer.quote.scope.excluded.car_purchase_cost": "자동차 실제 구매 비용",
  "customer.quote.scope.excluded.insurance_tax_registration": "보험료, 세금, 등록비",
  "customer.quote.scope.excluded.legal_contract": "고객 대신 법적 계약 체결",
  "customer.quote.scope.excluded.account_payment": "고객 대신 계정 생성 또는 결제 수행",
  "customer.quote.scope.excluded.third_party_outcomes": "정부기관·딜러·통신사 결정에 대한 보장",
  "customer.quote.scope.excluded.third_party_fees_general":
    "통신사·딜러·정부기관 등 제3자에 직접 지불하는 비용",

  "customer.quote.request_section.title": "요청 요약",
  "customer.quote.request_section.intro": "이 견적이 고객님이 요청하신 내용과 맞는지 확인해 주세요.",
  "customer.quote.request_section.help_areas": "도움이 필요한 영역",
  "customer.quote.request_section.services_in_quote": "이 견적에 담긴 서비스",
  "customer.quote.request_section.delivery_modes": "선택하신 지원 방식",
  "customer.quote.request_section.schedule_region": "시작 예정 / 희망 지역",
  "customer.quote.request_section.understood": "요청 시 추가로 남긴 답변",
  "customer.quote.request_section.empty_all": "제공된 요청 정보가 없습니다. 내용이 다르면 메시지함에서 문의해 주세요.",

  "customer.quote.ai.section_title": "이 견적의 지원 방식",
  "customer.quote.ai.section_title_agent": "Landing Help AI Agent가 도와드리는 방식",
  "customer.quote.ai.lede":
    "이 견적은 Agent가 다음 단계를 안내하고, 고객님이 직접 진행해야 할 일을 쉽게 확인할 수 있도록 돕는 방식입니다.",
  "customer.quote.ai.lede_in_person":
    "이 견적은 사람이 직접 조율하는 지원이 포함될 수 있습니다. 역할을 나누어 안내해 드립니다.",
  "customer.quote.ai.what_ai_helps": "Agent가 도와드리는 일",
  "customer.quote.ai.what_support_helps": "지원팀이 도와드리는 일",
  "customer.quote.ai.what_you_do": "고객님이 직접 해야 하는 일",
  "customer.quote.ai.when_human": "사람의 도움이 필요한 경우",
  "customer.quote.ai.bullet.agent.1": "다음에 해야 할 일을 순서대로 안내합니다.",
  "customer.quote.ai.bullet.agent.2": "필요한 준비물과 체크리스트를 보여드립니다.",
  "customer.quote.ai.bullet.agent.3": "메시지함에서 질문에 답변합니다.",
  "customer.quote.ai.bullet.you.1": "실제 가입, 결제, 계약 제출은 고객님이 직접 진행합니다.",
  "customer.quote.ai.bullet.you.2": "제출 전 정보와 조건을 고객님이 최종 확인합니다.",
  "customer.quote.ai.bullet.you.3": "외부 기관, 통신사, 딜러와의 실제 계약은 고객님 책임으로 진행됩니다.",
  "customer.quote.ai.bullet.human.1": "안내가 불명확하거나 긴급한 경우 메시지함에서 팀에게 문의할 수 있습니다.",
  "customer.quote.ai.bullet.human.2": "Agent가 해결하기 어려운 예외 상황은 운영팀이 확인할 수 있습니다.",
  "customer.quote.ai.bullet.support.in_person.1": "패키지에 포함된 통화·미팅·현장 지원 일정을 조율해 드립니다.",
  "customer.quote.ai.bullet.support.in_person.2": "단계별로 무엇을 준비하면 되는지 안내합니다.",
  "customer.quote.ai.bullet.support.in_person.3": "메시지함에서 질문에 답변합니다.",
  "customer.quote.ai.bullet.support.ai_plus.1": "먼저 앱에서 절차를 진행하고, 필요할 때 사람의 도움을 연결합니다.",
  "customer.quote.ai.bullet.support.ai_plus.2": "준비물과 다음 단계를 쉽게 확인할 수 있게 보여 드립니다.",
  "customer.quote.ai.bullet.support.general.1": "이 서비스에 맞는 단계를 쉬운 말로 순서대로 안내합니다.",
  "customer.quote.ai.bullet.support.general.2": "필요한 준비물과 체크리스트를 보여 드립니다.",

  "customer.quote.customer_note_title": "팀에서 전하는 메모",

  "customer.quote.whats_next.title": "다음 단계",
  "customer.quote.whats_next.lede":
    "견적을 확인한 뒤 승인하면 청구서와 결제 안내가 발송됩니다.",
  "customer.quote.whats_next.step_confirm_scope": "견적 항목과 포함/미포함 내용을 확인합니다.",
  "customer.quote.whats_next.step_ask": "궁금한 점이 있으면 질문하기를 눌러 메시지를 남깁니다.",
  "customer.quote.whats_next.step_approve": "내용이 맞으면 견적 승인하기를 누릅니다.",
  "customer.quote.whats_next.step_invoice":
    "승인 후 청구서가 생성되고, 결제 안내가 이메일과 메시지함으로 발송됩니다.",
  "customer.quote.whats_next.step_after_payment": "결제 완료 후 Agent 안내와 다음 단계 진행이 시작됩니다.",
  "customer.quote.whats_next.approved_pay":
    "메시지함·이메일의 청구서 링크를 열어 금액·납기를 확인한 뒤 결제를 진행해 주세요.",
  "customer.quote.whats_next.approved_workflow":
    "결제가 확인되면 대시보드와 메시지함에서 Agent 안내와 다음 단계가 시작됩니다.",
  "customer.quote.whats_next.paid_continue": "대시보드와 메시지함에서 Agent 안내와 다음 할 일을 확인해 주세요.",
  "customer.quote.whats_next.paid_help": "다음 단계가 불분명하면 메시지로 문의해 주세요.",
  "customer.quote.whats_next.closed_no_action": "이 견적에 대해 더 하실 작업은 없습니다.",
  "customer.quote.whats_next.closed_reach_out":
    "여전히 지원이 필요하면 범위 조정이나 다른 옵션을 위해 팀에 메시지를 보내 주세요.",
  "customer.quote.whats_next.waiting_proposal":
    "팀에서 제안이 오면 이곳에 표시됩니다. 검토 후 승인·거절을 하시고, 궁금하면 메시지를 이용해 주세요.",

  "customer.quote.footer.status.approved": "견적이 승인되었습니다. 청구서와 결제 안내를 확인해 주세요.",
  "customer.quote.footer.status.rejected": "견적이 거절되었습니다.",
  "customer.quote.footer.status.paid": "결제가 완료되었습니다. 다음 단계 안내를 확인해 주세요.",

  "customer.quote.actions.intro": "아래에서 동작을 선택하세요. 최종 확정은 확인 후에 이루어집니다.",
  "customer.quote.actions.group_label": "이 견적에 대한 결정",
  "customer.quote.actions.approve": "승인",
  "customer.quote.actions.reject": "거절",
  "customer.quote.actions.approve_hint":
    "동의 시 시스템이 청구서를 만들고, 메시지함·이메일로 보낸 뒤 결제를 기다립니다.",
  "customer.quote.actions.reject_hint":
    "당장 이 견적은 중단됩니다. 요금이 청구되지 않습니다. 나중에 다른 옵션을 원하면 메시지로 문의할 수 있습니다.",

  "customer.quote.secondary.summary": "견적 상세(참고용)",
  "customer.quote.secondary.hint": "고객 지원에 연락할 때 사용하세요. 제안 내용 이해에는 필요하지 않습니다.",
  "customer.quote.secondary.ref_id": "참조 ID",
  "customer.quote.secondary.doc_label": "파일상 문서 제목",

  "customer.quote.status.proposed": "제안됨",
  "customer.quote.status.approved": "승인됨",
  "customer.quote.status.rejected": "거절됨",
  "customer.quote.status.draft": "초안",
  "customer.quote.status.expired": "만료",
  "customer.quote.status.paid": "결제 완료",

  "customer.quote.status_strip.proposed": "팀이 제안한 견적입니다. 아래에서 승인 또는 거절을 선택해 주세요.",
  "customer.quote.status_strip.approved":
    "승인이 완료되었습니다. 청구서는 메시지함·이메일에서 확인하시고 결제를 진행해 주세요.",
  "customer.quote.status_strip.rejected": "이 견적은 거절 처리되었습니다.",
  "customer.quote.status_strip.other": "팀에서 제안이 오면 이곳에서 검토하고 응답할 수 있습니다.",

  "customer.quote.transition.approved":
    "견적이 승인되었습니다. 청구서가 생성·발송되었으며, 메시지함과 이메일에서 확인한 뒤 결제해 주세요.",
  "customer.quote.transition.rejected": "견적이 거절 처리되었습니다.",
  "customer.quote.transition.error":
    "견적 상태를 바꾸지 못했습니다. 네트워크·로그인 상태를 확인한 뒤 다시 시도해 주세요.",

  "customer.quote.feedback.processing": "요청을 처리하는 중입니다…",
  "customer.quote.feedback.processing_short": "처리 중…",
  "customer.quote.feedback.approve_submitting": "승인 내용을 서버에 전송하는 중입니다…",
  "customer.quote.feedback.reject_submitting": "거절 내용을 서버에 전송하는 중입니다…",
  "customer.quote.feedback.approved_title": "승인이 완료되었습니다",
  "customer.quote.feedback.approved_body":
    "청구서가 생성되어 인앱 메시지함과 등록 이메일로 발송되었습니다. 메시지 또는 메일의 링크에서 청구서를 연 뒤 금액·납기를 확인하고 결제를 완료해 주세요. 결제가 완료된 뒤에 필요 서류·다음 단계가 메시지함과 문서 센터로 안내됩니다.",
  "customer.quote.feedback.rejected_title": "이 견적은 거절 처리되었습니다",
  "customer.quote.feedback.rejected_body":
    "이 견적에 대한 요금은 청구되지 않습니다. 나중에 다른 옵션이 필요하면 메시지로 문의해 주세요.",

  "customer.quote.modal.cancel": "취소",
  "customer.quote.modal.approve.title": "이 견적을 승인할까요?",
  "customer.quote.modal.approve.service_label": "서비스 요약",
  "customer.quote.modal.approve.total_label": "총 제안 금액",
  "customer.quote.modal.approve.bullet_invoice": "승인 후 청구서와 결제 안내가 발송됩니다.",
  "customer.quote.modal.approve.bullet_agent": "결제 완료 후 Agent 안내가 시작됩니다.",
  "customer.quote.modal.reject.title": "견적을 거절할까요?",
  "customer.quote.modal.reject.intro": "거절하면 이 견적은 더 이상 진행되지 않습니다.",
  "customer.quote.modal.reject.reason_hint": "가능하면 거절 사유를 남겨 주세요.",
  "customer.quote.modal.reject.reason_label": "거절 사유 (선택)",
  "customer.quote.modal.reject.reason_placeholder": "선택 입력 — 예: 일정, 예산, 범위 등",

};

const EN = {
  "common.header.brand.customer": "Landing Help AI",
  "common.header.messages": "Messages",
  "common.header.messages_unread_suffix": "unread",
  "common.header.messages_unread_badge": "New messages",
  "common.header.menu.profile": "My profile",
  "common.header.menu.password": "Change password",
  "common.header.menu.logout": "Log out",
  "common.sidebar.customer.aria_label": "Customer menu",
  "common.sidebar.customer.dashboard": "Dashboard",
  "common.sidebar.customer.service_flow": "Request a quote",
  "common.sidebar.customer.quote": "Quote",
  "common.sidebar.customer.invoice": "Invoice",
  "common.sidebar.customer.documents": "Documents",
  "common.sidebar.customer.messages": "Messages",
  "common.sidebar.customer.ai_assistant": "Landing Help AI Agent",
  "common.sidebar.customer.schedule": "Schedule",
  "common.sidebar.customer.completion": "Completion",
  "common.sidebar.placeholder.todo": "Loading sidebar…",
  "common.service_flow.delivery.ai_guide.badge": "Landing Help AI Agent",
  "common.service_flow.delivery.ai_guide.explain":
    "Clear next steps in the app. Formal required-document requests are sent only after you complete payment.",
  "common.service_flow.delivery.in_person.badge": "In-person support",
  "common.service_flow.delivery.in_person.explain":
    "Includes coordinated human or on-site help where your package says so, not chat-only.",
  "common.service_flow.delivery.ai_plus_human.badge": "Landing Help AI Agent + optional human help",
  "common.service_flow.delivery.ai_plus_human.explain":
    "Starts in the app; you can bring in a person when something needs a human decision or visit.",
  "common.service_flow.delivery.general.badge": "Guided service",
  "common.service_flow.delivery.general.explain": "Plain-language guidance through the steps for this service.",

  "customer.quote.answer.bool_yes": "Yes",
  "customer.quote.answer.bool_no": "No",

  "customer.quote.page_title": "Review your quote",
  "customer.quote.loading": "Loading your quote…",
  "customer.quote.empty": "No quote is available here yet. When the team sends a proposal, it will appear on this page.",
  "customer.quote.load_error": "We couldn’t load this quote. Check the link or try again later.",

  "customer.quote.hero.title": "Your quote is ready",
  "customer.quote.hero.subtitle": "Please review the proposal for your requested service.",
  "customer.quote.hero.reassurance":
    "This is the proposed quote from our team. The PDF and follow-up details are also available in your inbox and email.",
  "customer.quote.hero.service_label": "Service / request",
  "customer.quote.hero.service_summary_label": "Service summary",
  "customer.quote.hero.service_plain": "Your requested service",
  "customer.quote.hero.scope_note":
    "This amount includes the quote line items below and guided support from Landing Help AI.",
  "customer.quote.hero.cost_note":
    "Review the line items and what is included or not included below, then approve if you accept this proposal.",
  "customer.quote.hero.actions_group": "Decide on this quote",
  "customer.quote.hero.cta.approve": "Approve quote",
  "customer.quote.hero.cta.ask": "Ask a question",
  "customer.quote.hero.cta.reject": "Decline quote",
  "customer.quote.hero.status_message.approved":
    "You approved this quote. Check your messages and email for the invoice and payment steps.",
  "customer.quote.hero.status_message.rejected":
    "You declined this quote. No charge applies. Message the team if you want a different option.",
  "customer.quote.hero.status_message.paid":
    "Payment for this quote is complete. Continue with the next steps on your dashboard and messages.",
  "customer.quote.hero.next_proposed":
    "Next: review the details below. If everything looks right, tap Approve. If you do not accept it, tap Reject. Questions can go in your message thread.",
  "customer.quote.hero.next_approved":
    "Your approval is saved. We created your invoice and sent it to your in-app messages and email. Open the invoice and complete payment as instructed.",
  "customer.quote.hero.next_rejected": "This quote was declined. Message us if you would like a different option.",
  "customer.quote.hero.next_default": "When the team sends a proposal, you will see it here.",

  "customer.quote.cost.primary_label": "Proposed total",
  "customer.quote.cost.eyebrow": "For the scope in this proposal",
  "customer.quote.cost.demo_pill": "Sample quote",
  "customer.quote.cost.not_set": "To be confirmed by the team",
  "customer.quote.cost.subtotal": "Subtotal",
  "customer.quote.cost.tax": "estimated tax",
  "customer.quote.cost.total_line": "total",
  "customer.quote.cost.line_items_hint": "Line items add up to",
  "customer.quote.cost.vs_estimate": " — the proposed total above is what the team is asking you to approve.",
  "customer.quote.cost.note":
    "This amount is proposed for the agreed scope. Optional add-ons or work outside this proposal may cost extra and are confirmed with you before any charge. You are not billed until you approve and the team confirms next steps.",

  "customer.quote.pricing.title": "Quote line items",
  "customer.quote.pricing.lede": "See each service in your proposal and how it contributes to the total.",
  "customer.quote.pricing.empty": "There are no line items to show. Please contact us through your message inbox.",
  "customer.quote.pricing.service_subtotal": "Service items subtotal",
  "customer.quote.pricing.final_total": "Proposed total",
  "customer.quote.pricing.final_hint": "This is the final amount the team is asking you to approve.",
  "customer.quote.pricing.adjustment_note":
    "When the service subtotal and final proposed total differ, the difference is shown above as a custom support fee or discount adjustment.",
  "customer.quote.pricing.adjustment.support_title": "Custom progress support fee",
  "customer.quote.pricing.adjustment.support_desc":
    "Additional guidance and progress management tailored to your request scope.",
  "customer.quote.pricing.adjustment.extra_title": "Custom progress support fee",
  "customer.quote.pricing.adjustment.extra_desc":
    "Covers extra guidance or scope adjustments beyond the listed service prices.",
  "customer.quote.pricing.adjustment.discount_title": "Discount",
  "customer.quote.pricing.adjustment.discount_desc": "A discount applied to your proposed total.",
  "customer.quote.pricing.service_desc.ai_guide": "Step-by-step guidance and checklists in the app for this service.",
  "customer.quote.pricing.service_desc.in_person": "Includes coordinated human support where your package requires it.",
  "customer.quote.pricing.service_desc.ai_plus_human": "Starts in the app; a person can step in when needed.",
  "customer.quote.pricing.service_desc.general": "Plain-language guidance through the steps for this service.",

  "customer.quote.scope.title": "What is included / not included",
  "customer.quote.scope.lede":
    "See what your quote covers and what you handle or pay separately—so there are no surprises.",
  "customer.quote.scope.aside":
    "Items under “Not included” are costs you pay or confirm directly. They are not hidden inside your quote total.",
  "customer.quote.scope.included_title": "Included in this quote",
  "customer.quote.scope.excluded_title": "Not included in this quote",
  "customer.quote.scope.included.agent_steps": "Step-by-step guidance from Landing Help AI Agent",
  "customer.quote.scope.included.checklist": "Checklists and preparation lists for what you need",
  "customer.quote.scope.included.next_steps": "Clear order of what to do next as your case moves forward",
  "customer.quote.scope.included.messages": "Question support through your message inbox",
  "customer.quote.scope.included.info_organization": "Information organized to match your requested scope",
  "customer.quote.scope.excluded.carrier_fees": "Actual carrier plan charges or activation fees",
  "customer.quote.scope.excluded.car_purchase_cost": "The actual purchase price of a vehicle",
  "customer.quote.scope.excluded.insurance_tax_registration": "Insurance premiums, sales tax, and registration fees",
  "customer.quote.scope.excluded.legal_contract": "Signing legal contracts on your behalf",
  "customer.quote.scope.excluded.account_payment": "Creating accounts or making payments for you",
  "customer.quote.scope.excluded.third_party_outcomes": "Guarantees on government, dealer, or carrier decisions",
  "customer.quote.scope.excluded.third_party_fees_general":
    "Fees paid directly to carriers, dealers, government offices, or other third parties",

  "customer.quote.request_section.title": "Your request summary",
  "customer.quote.request_section.intro": "Please confirm this quote matches what you requested.",
  "customer.quote.request_section.help_areas": "Areas where you asked for help",
  "customer.quote.request_section.services_in_quote": "Services in this quote",
  "customer.quote.request_section.delivery_modes": "Support options you chose",
  "customer.quote.request_section.schedule_region": "Start timing / preferred area",
  "customer.quote.request_section.understood": "Additional answers from your request",
  "customer.quote.request_section.empty_all":
    "No request details were saved to display. If something looks wrong, message the team.",

  "customer.quote.ai.section_title": "Support for this quote",
  "customer.quote.ai.section_title_agent": "How Landing Help AI Agent supports you",
  "customer.quote.ai.lede":
    "The agent guides your next steps and makes it easy to see what you need to do yourself.",
  "customer.quote.ai.lede_in_person":
    "This quote may include coordinated human support. Here is who does what.",
  "customer.quote.ai.what_ai_helps": "What the agent helps with",
  "customer.quote.ai.what_support_helps": "What support helps with",
  "customer.quote.ai.what_you_do": "What you do directly",
  "customer.quote.ai.when_human": "When to reach the team",
  "customer.quote.ai.bullet.agent.1": "We guide you through the next steps in order.",
  "customer.quote.ai.bullet.agent.2": "We show checklists and what to prepare.",
  "customer.quote.ai.bullet.agent.3": "We respond to questions in your message inbox.",
  "customer.quote.ai.bullet.you.1": "Sign-ups, payments, and contract submissions are done by you.",
  "customer.quote.ai.bullet.you.2": "You review information and conditions before you submit.",
  "customer.quote.ai.bullet.you.3": "Contracts with carriers, dealers, or agencies remain your responsibility.",
  "customer.quote.ai.bullet.human.1": "If guidance is unclear or urgent, message the team from your inbox.",
  "customer.quote.ai.bullet.human.2": "When the agent cannot handle an exception, the operations team can step in.",
  "customer.quote.ai.bullet.support.in_person.1": "We coordinate calls, meetings, or on-site support included in your package.",
  "customer.quote.ai.bullet.support.in_person.2": "We explain what to prepare at each step.",
  "customer.quote.ai.bullet.support.in_person.3": "We respond to questions in your message inbox.",
  "customer.quote.ai.bullet.support.ai_plus.1": "We start with the digital checklist, then bring in a person when needed.",
  "customer.quote.ai.bullet.support.ai_plus.2": "We show what to prepare and what comes next.",
  "customer.quote.ai.bullet.support.general.1": "We explain the steps for this service in plain language.",
  "customer.quote.ai.bullet.support.general.2": "We show checklists and preparation items.",

  "customer.quote.customer_note_title": "Note from your team",

  "customer.quote.whats_next.title": "Next steps",
  "customer.quote.whats_next.lede":
    "After you review this quote and approve it, an invoice and payment instructions will be sent to you.",
  "customer.quote.whats_next.step_confirm_scope": "Review the quote line items and what is included or not included.",
  "customer.quote.whats_next.step_ask": "If you have questions, tap Ask a question and leave a message.",
  "customer.quote.whats_next.step_approve": "When everything looks right, tap Approve quote.",
  "customer.quote.whats_next.step_invoice":
    "After approval, an invoice is created and payment instructions are sent to your email and message inbox.",
  "customer.quote.whats_next.step_after_payment": "After payment, Agent guidance and the next steps begin.",
  "customer.quote.whats_next.approved_pay":
    "Open the invoice link from your messages or email, confirm the amount and due date, then complete payment.",
  "customer.quote.whats_next.approved_workflow":
    "After payment is confirmed, Agent guidance and your next steps begin from your dashboard and messages.",
  "customer.quote.whats_next.paid_continue":
    "Check your dashboard and message inbox for Agent guidance and the next tasks.",
  "customer.quote.whats_next.paid_help": "Reply in messages if anything about the next steps is unclear.",
  "customer.quote.whats_next.closed_no_action": "You do not need to take further action on this quote.",
  "customer.quote.whats_next.closed_reach_out":
    "If you still need support, message the team to adjust the scope or explore another option.",
  "customer.quote.whats_next.waiting_proposal":
    "When the team sends a proposal, it will appear here. You will then review, approve or reject, and use messages if anything is unclear.",

  "customer.quote.footer.status.approved":
    "This quote is approved. Please check your invoice and payment instructions.",
  "customer.quote.footer.status.rejected": "This quote was declined.",
  "customer.quote.footer.status.paid": "Payment is complete. Please check the next-step guidance.",

  "customer.quote.actions.intro": "Choose an action below. Nothing is final until you confirm.",
  "customer.quote.actions.group_label": "Decide on this quote",
  "customer.quote.actions.approve": "Approve",
  "customer.quote.actions.reject": "Reject",
  "customer.quote.actions.approve_hint":
    "Confirms you accept this proposal. The system will create an invoice and send it via messages and email for payment.",
  "customer.quote.actions.reject_hint":
    "Stops this quote for now. You are not charged. You can message the team later if you want a different option.",

  "customer.quote.secondary.summary": "Quote details (reference only)",
  "customer.quote.secondary.hint":
    "Use these when you contact support. You do not need them to understand your proposal.",
  "customer.quote.secondary.ref_id": "Reference ID",
  "customer.quote.secondary.doc_label": "Document title on file",

  "customer.quote.status.proposed": "Proposed",
  "customer.quote.status.approved": "Approved",
  "customer.quote.status.rejected": "Rejected",
  "customer.quote.status.draft": "Draft",
  "customer.quote.status.expired": "Expired",
  "customer.quote.status.paid": "Paid",

  "customer.quote.status_strip.proposed": "This quote is proposed by the team. Choose Approve or Reject below.",
  "customer.quote.status_strip.approved":
    "Approval is complete. Open your invoice from messages or email and proceed to payment.",
  "customer.quote.status_strip.rejected": "This quote was declined.",
  "customer.quote.status_strip.other": "When the team sends a proposal, you can review and respond here.",

  "customer.quote.transition.approved":
    "Quote approved. Your invoice was created and sent—check messages and email, then complete payment.",
  "customer.quote.transition.rejected": "Quote declined.",
  "customer.quote.transition.error":
    "Could not update the quote. Check your connection and login, then try again.",

  "customer.quote.feedback.processing": "Processing your decision…",
  "customer.quote.feedback.processing_short": "Processing…",
  "customer.quote.feedback.approve_submitting": "Submitting your approval…",
  "customer.quote.feedback.reject_submitting": "Submitting your decision…",
  "customer.quote.feedback.approved_title": "Approval complete",
  "customer.quote.feedback.approved_body":
    "An invoice was created and sent to your in-app messages and registered email. Open it from either place, confirm the amount and due date, and complete payment. Required documents and detailed next steps are provided only after payment, via messages and the Documents page.",
  "customer.quote.feedback.rejected_title": "This quote was declined",
  "customer.quote.feedback.rejected_body":
    "You will not be charged for this quote. Message the team if you would like a different option later.",

  "customer.quote.modal.cancel": "Cancel",
  "customer.quote.modal.approve.title": "Approve this quote?",
  "customer.quote.modal.approve.service_label": "Service summary",
  "customer.quote.modal.approve.total_label": "Proposed total",
  "customer.quote.modal.approve.bullet_invoice":
    "After approval, an invoice and payment instructions will be sent to you.",
  "customer.quote.modal.approve.bullet_agent": "After payment, Agent guidance will begin.",
  "customer.quote.modal.reject.title": "Decline this quote?",
  "customer.quote.modal.reject.intro": "If you decline, this quote will not move forward.",
  "customer.quote.modal.reject.reason_hint": "If you can, please leave a short reason so the team can help.",
  "customer.quote.modal.reject.reason_label": "Reason for declining (optional)",
  "customer.quote.modal.reject.reason_placeholder": "Optional — e.g. timing, budget, or scope",
};

/** @param {string} lang */
export function getQuoteLocaleBundle(lang) {
  const l = (lang || "ko").toString().trim().toLowerCase();
  if (l === "en") return EN;
  return KO;
}
