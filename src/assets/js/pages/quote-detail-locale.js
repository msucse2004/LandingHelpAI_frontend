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
  "common.sidebar.customer.ai_assistant": "AI 안내",
  "common.sidebar.customer.schedule": "일정",
  "common.sidebar.customer.completion": "완료",
  "common.sidebar.placeholder.todo": "사이드바를 불러오는 중입니다…",
  "common.service_flow.delivery.ai_guide.badge": "AI 안내",
  "common.service_flow.delivery.ai_guide.explain":
    "다음 할 일과 진행 단계를 앱에서 순서대로 안내합니다. (운영에서 정한 필수 서류 요청은 결제 완료 후에 별도로 안내됩니다.)",
  "common.service_flow.delivery.in_person.badge": "대면·현장 지원",
  "common.service_flow.delivery.in_person.explain":
    "패키지에 포함된 경우 전화·미팅·방문 등 사람이 직접 조율하는 지원이 포함됩니다. 채팅만으로 끝나지 않습니다.",
  "common.service_flow.delivery.ai_plus_human.badge": "AI + 필요 시 사람 도움",
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
  "customer.quote.hero.service_plain": "요청하신 서비스",
  "customer.quote.hero.next_proposed":
    "다음: 아래 내용을 검토해 주세요. 문제없으면 승인을 눌러 주세요. 수정이 필요하면 거절하거나 도움 요청을 이용해 주세요.",
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

  "customer.quote.request_section.title": "요청 요약",
  "customer.quote.request_section.intro": "이 견적이 문의하신 내용과 맞는지 확인해 주세요.",
  "customer.quote.request_section.help_areas": "도움이 필요한 영역",
  "customer.quote.request_section.services_in_quote": "이 견적에 담긴 서비스",
  "customer.quote.request_section.understood": "이해한 내용",
  "customer.quote.request_section.service_untitled": "선택하신 서비스",
  "customer.quote.request_section.empty_help":
    "요청에 도움 영역이 저장되지 않았습니다. 내용이 맞지 않으면 도움 요청을 이용해 주세요.",
  "customer.quote.request_section.empty_services":
    "선택한 서비스가 저장되지 않았습니다. 견적이 선택과 다르면 도움 요청을 이용해 주세요.",

  "customer.quote.ai.section_title": "AI와 지원이 어떻게 돕는지",
  "customer.quote.ai.lede": "역할을 나누어 설명합니다. AI가 하는 일, 고객이 직접 해야 할 일, 사람이 개입하는 경우입니다.",
  "customer.quote.ai.what_ai_helps": "AI가 도와주는 일",
  "customer.quote.ai.what_you_do": "직접 진행하실 수 있는 일",
  "customer.quote.ai.when_human": "사람의 도움이 필요할 수 있는 경우",
  "customer.quote.ai.delivery_setup": "이 견적의 제공 방식",
  "customer.quote.ai.delivery_and": "및",
  "customer.quote.ai.delivery_multi_hint": "아래 항목에서 실제로 어떤 의미인지 자세히 적어 두었습니다.",
  "customer.quote.ai.team_note_label": "팀 안내",
  "customer.quote.ai.help.ai_guide.1":
    "다음 할 일과 아직 채워야 할 항목을 보여 주어 진행이 멈추지 않도록 돕습니다.",
  "customer.quote.ai.help.ai_guide.2":
    "양식 용어를 쉬운 말로 설명하되, 이 견적 범위 안에서만 안내합니다.",
  "customer.quote.ai.help.in_person.1":
    "구매하신 내용에 포함된 경우 예약된 사람의 지원—통화, 미팅, 방문 등을 조율합니다.",
  "customer.quote.ai.help.in_person.2": "같은 체크리스트를 유지해 대면 지원이 단계 사이에 어떻게 들어가는지 보여 줍니다.",
  "customer.quote.ai.help.ai_plus.1":
    "일상적인 단계는 먼저 디지털로 처리해, 이동이나 일정 확보가 필요한 일을 앞당기지 않습니다.",
  "customer.quote.ai.help.ai_plus.2":
    "서명, 검사, 예외 처리 등 사람이 필요한 단계를 알려 줍니다.",
  "customer.quote.ai.help.general.1": "이 서비스의 작업 순서를 짧은 설명과 함께 안내합니다.",
  "customer.quote.ai.you.1":
    "관공서·제3자에 제출하는 서류와 비용은 대개 이 견적과 별도이며, 필요 시 직접 진행해 주셔야 합니다.",
  "customer.quote.ai.you.2": "팀 요청을 확인하고, 오류를 빨리 수정하며, 결정을 확정해 주시면 다음 단계로 넘어갑니다.",
  "customer.quote.ai.human.in_person":
    "현장 조율, 인수인계, 약속 잡기 등 앱만으로는 어려운 일은 담당자가 처리할 수 있습니다.",
  "customer.quote.ai.human.ai_plus":
    "판단, 자필 서명, 반드시 현장에 있어야 하는 경우 등에는 사람의 도움을 요청할 수 있습니다.",
  "customer.quote.ai.human.always":
    "체크리스트에 없거나 급하거나 불명확하면 도움 요청이나 기존 메시지 스레드를 이용해 주세요.",

  "customer.quote.customer_note_title": "팀에서 전하는 메모",

  "customer.quote.whats_next.title": "이후 진행",
  "customer.quote.whats_next.lede": "견적을 읽은 뒤 진행하기까지의 간단한 순서입니다.",
  "customer.quote.whats_next.team_label": "팀 안내",
  "customer.quote.whats_next.step_review": "이 페이지에서 요청 요약과 제안 금액을 확인합니다.",
  "customer.quote.whats_next.step_decide": "제안에 동의하면 승인, 아니면 거절을 눌러 주세요.",
  "customer.quote.whats_next.step_if_approved":
    "승인하면 청구서가 자동으로 만들어지고, 인앱 메시지함과 등록 이메일로 청구·결제 안내가 발송됩니다.",
  "customer.quote.whats_next.step_help": "먼저 질문이 있으면 도움 요청을 쓰거나 팀과의 스레드에 남겨 주세요.",
  "customer.quote.whats_next.approved_pay":
    "메시지함·이메일의 청구서 링크를 열어 금액·납기를 확인한 뒤 결제를 진행해 주세요.",
  "customer.quote.whats_next.approved_workflow":
    "결제가 확인되면 팀이 대시보드와 메시지함에서 다음 업무를 안내합니다. 필수 제출 서류 목록은 결제 완료 후에 전달됩니다.",
  "customer.quote.whats_next.approved_help": "일정·금액이 불분명하면 메시지로 회신해 주세요.",
  "customer.quote.whats_next.closed_no_action": "이 견적에 대해 더 하실 작업은 없습니다.",
  "customer.quote.whats_next.closed_reach_out":
    "여전히 지원이 필요하면 범위 조정이나 다른 옵션을 위해 팀에 메시지를 보내 주세요.",
  "customer.quote.whats_next.waiting_proposal":
    "팀에서 제안이 오면 이곳에 표시됩니다. 검토 후 승인·거절을 하시고, 궁금하면 메시지를 이용해 주세요.",

  "customer.quote.actions.intro": "아래에서 동작을 선택하세요. 최종 확정은 확인 후에 이루어집니다.",
  "customer.quote.actions.group_label": "이 견적에 대한 결정",
  "customer.quote.actions.approve": "승인",
  "customer.quote.actions.reject": "거절",
  "customer.quote.actions.help": "도움 요청",
  "customer.quote.actions.approve_hint":
    "동의 시 시스템이 청구서를 만들고, 메시지함·이메일로 보낸 뒤 결제를 기다립니다.",
  "customer.quote.actions.reject_hint":
    "당장 이 견적은 중단됩니다. 요금이 청구되지 않습니다. 나중에 다른 옵션을 원하면 메시지로 문의할 수 있습니다.",
  "customer.quote.actions.help_hint": "결정 전에 운영팀에 질문·요청을 보냅니다. 약속 없이 문의만 가능합니다.",

  "customer.quote.secondary.summary": "견적 상세(참고용)",
  "customer.quote.secondary.hint": "고객 지원에 연락할 때 사용하세요. 제안 내용 이해에는 필요하지 않습니다.",
  "customer.quote.secondary.ref_id": "참조 ID",
  "customer.quote.secondary.doc_label": "파일상 문서 제목",

  "customer.quote.status.proposed": "제안됨",
  "customer.quote.status.approved": "승인됨",
  "customer.quote.status.rejected": "거절됨",
  "customer.quote.status.draft": "초안",
  "customer.quote.status.expired": "만료",

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

  "customer.quote.help_stub":
    "도움 요청을 기록했습니다. 팀이 메시지로 답변합니다. (메시지 연결은 곧 제공 예정입니다.)",
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
  "common.sidebar.customer.ai_assistant": "AI guide",
  "common.sidebar.customer.schedule": "Schedule",
  "common.sidebar.customer.completion": "Completion",
  "common.sidebar.placeholder.todo": "Loading sidebar…",
  "common.service_flow.delivery.ai_guide.badge": "AI guide",
  "common.service_flow.delivery.ai_guide.explain":
    "Clear next steps in the app. Formal required-document requests are sent only after you complete payment.",
  "common.service_flow.delivery.in_person.badge": "In-person support",
  "common.service_flow.delivery.in_person.explain":
    "Includes coordinated human or on-site help where your package says so, not chat-only.",
  "common.service_flow.delivery.ai_plus_human.badge": "AI + optional human help",
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
  "customer.quote.hero.service_plain": "Your requested service",
  "customer.quote.hero.next_proposed":
    "Next: review the details below. If everything looks right, tap Approve. If you need changes, use Reject or Ask for help.",
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

  "customer.quote.request_section.title": "Your request",
  "customer.quote.request_section.intro": "Please confirm this quote matches what you asked for.",
  "customer.quote.request_section.help_areas": "Requested help",
  "customer.quote.request_section.services_in_quote": "Services in this quote",
  "customer.quote.request_section.understood": "What we understood",
  "customer.quote.request_section.service_untitled": "Your selected service",
  "customer.quote.request_section.empty_help":
    "No help area was saved with this request. If this looks wrong, use Ask for help.",
  "customer.quote.request_section.empty_services":
    "No services were saved with this request. Use Ask for help if the quote does not match what you chose.",

  "customer.quote.ai.section_title": "How AI and support work for you",
  "customer.quote.ai.lede": "Practical roles—what the assistant does, what you do, and when a person steps in.",
  "customer.quote.ai.what_ai_helps": "What AI will help with",
  "customer.quote.ai.what_you_do": "What you may need to do directly",
  "customer.quote.ai.when_human": "When human help may be needed",
  "customer.quote.ai.delivery_setup": "How this quote is set up",
  "customer.quote.ai.delivery_and": "and",
  "customer.quote.ai.delivery_multi_hint": "The bullets below spell out what that means in practice.",
  "customer.quote.ai.team_note_label": "Note from your team",
  "customer.quote.ai.help.ai_guide.1":
    "Highlights the next task and what is still missing so the case does not stall.",
  "customer.quote.ai.help.ai_guide.2":
    "Explains form fields and jargon in plain language while staying inside this quote’s scope.",
  "customer.quote.ai.help.in_person.1":
    "Coordinates scheduled human support—calls, meetings, or visits—when that is part of what you bought.",
  "customer.quote.ai.help.in_person.2": "Keeps the same checklist visible so you see how live help fits between steps.",
  "customer.quote.ai.help.ai_plus.1":
    "Runs the digital checklist first so routine steps are done before anyone travels or blocks calendar time.",
  "customer.quote.ai.help.ai_plus.2":
    "Flags when a step should switch to a person—for example signatures, inspections, or exceptions.",
  "customer.quote.ai.help.general.1": "Walks the sequence of tasks for this service in order, with short explanations at each step.",
  "customer.quote.ai.you.1":
    "You submit your own documents and payments to government or third parties when the process requires it—those fees are usually separate from this quote.",
  "customer.quote.ai.you.2": "You read requests from the team, fix mistakes quickly, and confirm decisions so work can move on.",
  "customer.quote.ai.human.in_person":
    "Staff may handle on-site coordination, handoffs, or appointments that cannot be done only in the app.",
  "customer.quote.ai.human.ai_plus":
    "You can ask for a person when a step needs judgment, a wet signature, or someone physically present.",
  "customer.quote.ai.human.always":
    "Use Ask for help or your message thread if something is unclear, urgent, or not covered by the checklist.",

  "customer.quote.customer_note_title": "Note from your team",

  "customer.quote.whats_next.title": "What happens next",
  "customer.quote.whats_next.lede": "A simple path from reading this quote to moving forward.",
  "customer.quote.whats_next.team_label": "Note from your team",
  "customer.quote.whats_next.step_review": "Review your request summary and the proposed amount on this page.",
  "customer.quote.whats_next.step_decide": "Tap Approve if you accept this proposal, or Reject if you do not.",
  "customer.quote.whats_next.step_if_approved":
    "When you approve, the system creates an invoice and sends billing instructions to your messages and email.",
  "customer.quote.whats_next.step_help": "Questions first? Use Ask for help or write in your existing thread with the team.",
  "customer.quote.whats_next.approved_pay":
    "Open the invoice link from your messages or email, confirm the amount and due date, then complete payment.",
  "customer.quote.whats_next.approved_workflow":
    "After payment is confirmed, the team guides next steps via your dashboard and messages. Required document requests appear only after payment.",
  "customer.quote.whats_next.approved_help": "Reply in messages if dates or amounts need clarification.",
  "customer.quote.whats_next.closed_no_action": "You do not need to take further action on this quote.",
  "customer.quote.whats_next.closed_reach_out":
    "If you still need support, message the team to adjust the scope or explore another option.",
  "customer.quote.whats_next.waiting_proposal":
    "When the team sends a proposal, it will appear here. You will then review, approve or reject, and use messages if anything is unclear.",

  "customer.quote.actions.intro": "Choose an action below. Nothing is final until you confirm.",
  "customer.quote.actions.group_label": "Decide on this quote",
  "customer.quote.actions.approve": "Approve",
  "customer.quote.actions.reject": "Reject",
  "customer.quote.actions.help": "Ask for help",
  "customer.quote.actions.approve_hint":
    "Confirms you accept this proposal. The system will create an invoice and send it via messages and email for payment.",
  "customer.quote.actions.reject_hint":
    "Stops this quote for now. You are not charged. You can message the team later if you want a different option.",
  "customer.quote.actions.help_hint": "Sends a question or request to the operations team before you decide—no commitment.",

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

  "customer.quote.help_stub":
    "We noted your request for help. The team will reply in your messages. (Messaging link coming soon.)",
};

/** @param {string} lang */
export function getQuoteLocaleBundle(lang) {
  const l = (lang || "ko").toString().trim().toLowerCase();
  if (l === "en") return EN;
  return KO;
}
