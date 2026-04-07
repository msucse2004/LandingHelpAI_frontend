import { quoteApi } from "../core/api.js";
import { getCustomerMessagingProfileId } from "../core/auth.js";
import { ensureCustomerAccess, protectCurrentPage } from "../core/guards.js";
import { patchState } from "../core/state.js";
import { loadSidebar } from "../components/sidebar.js";
import { applyI18nToDom } from "../core/i18n-dom.js";
import { initI18nDomains, mergeFallbackStrings, resetI18nClientState, t } from "../core/i18n-client.js";
import { formatMoney } from "../core/utils.js";
import { formatSurveyAnswerForDisplay } from "../core/survey-answer-display.js";
import { resolveAppHeaderShell, refreshHeaderMailUnreadBadge } from "../core/app-header.js";
import { getQuoteLocaleBundle, resolveQuoteUiLang } from "./quote-detail-locale.js";

function qs(selector) {
  return document.querySelector(selector);
}

function setStatus(message, tone = "default") {
  const status = qs("#quoteActionStatus");
  if (!status) return;
  status.textContent = message || "";
  status.classList.remove("lhai-quote-actions__status--error");
  if (tone === "error") status.classList.add("lhai-quote-actions__status--error");
}

function showDecisionFeedbackLoading(message) {
  const panel = qs("#quoteDecisionFeedback");
  if (!panel) return;
  panel.hidden = false;
  panel.className = "lhai-quote-decision-feedback lhai-quote-decision-feedback--loading";
  panel.innerHTML = "";
  const p = document.createElement("p");
  p.className = "lhai-quote-decision-feedback__body lhai-quote-decision-feedback__body--solo";
  p.textContent = message || t("customer.quote.feedback.processing", "Processing your decision…");
  panel.appendChild(p);
}

function renderDecisionFeedbackPanel(quote) {
  const panel = qs("#quoteDecisionFeedback");
  if (!panel) return;
  const st = (quote?.status || "").toUpperCase();
  panel.innerHTML = "";
  panel.className = "lhai-quote-decision-feedback";

  if (st === "APPROVED") {
    panel.hidden = false;
    panel.classList.add("lhai-quote-decision-feedback--success");
    const title = document.createElement("strong");
    title.className = "lhai-quote-decision-feedback__title";
    title.textContent = t("customer.quote.feedback.approved_title", "Approval complete");
    const p = document.createElement("p");
    p.className = "lhai-quote-decision-feedback__body";
    p.textContent = t(
      "customer.quote.feedback.approved_body",
      "An invoice was created and sent to your in-app messages and registered email. Open it from either place, confirm the amount and due date, and complete payment. After payment, continue with the next steps on your dashboard."
    );
    panel.appendChild(title);
    panel.appendChild(p);
    return;
  }

  if (st === "REJECTED" || st === "EXPIRED") {
    panel.hidden = false;
    panel.classList.add("lhai-quote-decision-feedback--rejected");
    const title = document.createElement("strong");
    title.className = "lhai-quote-decision-feedback__title";
    title.textContent = t("customer.quote.feedback.rejected_title", "Quote declined");
    const p = document.createElement("p");
    p.className = "lhai-quote-decision-feedback__body";
    p.textContent = t(
      "customer.quote.feedback.rejected_body",
      "No charge applies to this quote. Message the team if you would like a different option later."
    );
    panel.appendChild(title);
    panel.appendChild(p);
    return;
  }

  panel.hidden = true;
}

function scrollDecisionFeedbackIntoView() {
  requestAnimationFrame(() => {
    qs("#quoteDecisionFeedback")?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  });
}

/**
 * @param {boolean} busy
 * @param {"approve" | "reject"} which
 * @param {string} [workingLabel]
 */
function setQuoteDecisionButtonsBusy(busy, which, workingLabel) {
  const approveBtn = qs("#approveQuoteBtn");
  const rejectBtn = qs("#rejectQuoteBtn");
  const w = workingLabel || t("customer.quote.feedback.processing_short", "Processing…");
  [approveBtn, rejectBtn].forEach((b) => {
    if (b) b.disabled = !!busy;
  });
  if (approveBtn) {
    const on = Boolean(busy && which === "approve");
    approveBtn.setAttribute("aria-busy", on ? "true" : "false");
    if (on) {
      if (!approveBtn.dataset.lhaiLabelSaved) approveBtn.dataset.lhaiLabelSaved = approveBtn.textContent;
      approveBtn.textContent = w;
    }
  }
  if (rejectBtn) {
    const on = Boolean(busy && which === "reject");
    rejectBtn.setAttribute("aria-busy", on ? "true" : "false");
    if (on) {
      if (!rejectBtn.dataset.lhaiLabelSaved) rejectBtn.dataset.lhaiLabelSaved = rejectBtn.textContent;
      rejectBtn.textContent = w;
    }
  }
}

function statusBadgeClass(status) {
  if (status === "APPROVED") return "lhai-badge lhai-badge--risk-low";
  if (status === "REJECTED" || status === "EXPIRED") return "lhai-badge lhai-badge--risk-high";
  if (status === "PROPOSED") return "lhai-badge lhai-badge--risk-medium";
  return "lhai-badge";
}

function customerFacingStatusLabel(status) {
  const s = (status || "").toUpperCase();
  const map = {
    PROPOSED: t("customer.quote.status.proposed", "Proposed"),
    APPROVED: t("customer.quote.status.approved", "Approved"),
    REJECTED: t("customer.quote.status.rejected", "Rejected"),
    DRAFT: t("customer.quote.status.draft", "Draft"),
    EXPIRED: t("customer.quote.status.expired", "Expired"),
  };
  return map[s] || status || "—";
}

function looksLikeUuid(str) {
  const s = String(str || "").trim();
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s);
}

/** 견적서 파일명용: 내부 접미사 제거해 기록용으로만 짧게 */
function customerFacingQuoteRecordTitle(quote) {
  const raw = quote?.title ? String(quote.title).trim() : "";
  if (!raw) return "";
  const suffix = " Landing Help AI 견적서";
  if (raw.endsWith(suffix)) {
    const base = raw.slice(0, -suffix.length).trim();
    return base || raw;
  }
  return raw;
}

/** 설문·서비스명에서 고객이 읽기 쉬운 요청/서비스 한 줄 (UUID·원시 ID는 히어로에 노출하지 않음) */
function heroServiceRequestLabel(quote) {
  const rd = quote?.request_details && typeof quote.request_details === "object" ? quote.request_details : {};
  const survey = rd.survey_submission && typeof rd.survey_submission === "object" ? rd.survey_submission : {};
  const services = Array.isArray(survey.selected_services) ? survey.selected_services : [];
  const titles = services
    .map((s) => {
      if (!s || typeof s !== "object") return "";
      const tit = (s.title || "").toString().trim();
      if (tit) return tit;
      const id = (s.id || "").toString().trim();
      if (id && !looksLikeUuid(id)) return id;
      return "";
    })
    .filter(Boolean);
  if (titles.length) return titles.join(", ");

  const cats = Array.isArray(survey.selected_categories) ? survey.selected_categories : [];
  const catTitles = cats
    .map((c) => {
      if (!c || typeof c !== "object") return "";
      const tit = (c.title || "").toString().trim();
      if (tit) return tit;
      const id = (c.id || "").toString().trim();
      if (id && !looksLikeUuid(id)) return id;
      return "";
    })
    .filter(Boolean);
  if (catTitles.length) return catTitles.join(", ");

  let sn = (quote?.service_name || rd.service_id || "").toString().trim();
  if (/^survey request:\s*/i.test(sn)) {
    sn = sn.replace(/^survey request:\s*/i, "").trim();
  }
  if (looksLikeUuid(sn)) {
    return t("customer.quote.hero.service_plain", "Your requested service");
  }
  return sn || "—";
}

function heroNextCue(quote) {
  const st = (quote?.status || "").toUpperCase();
  if (st === "PROPOSED") {
    return t(
      "customer.quote.hero.next_proposed",
      "Next: review the details below. If everything looks right, tap Approve. If you do not accept it, use Reject. Questions can go in your message thread."
    );
  }
  if (st === "APPROVED") {
    return t(
      "customer.quote.hero.next_approved",
      "This quote is approved. Billing and payment instructions will follow in your messages and email."
    );
  }
  if (st === "REJECTED") {
    return t("customer.quote.hero.next_rejected", "This quote was declined. Message us if you would like a different option.");
  }
  return t("customer.quote.hero.next_default", "When the team sends a proposal, you will see it here.");
}

/** 설문·카탈로그와 동일한 키로 배지 문구 (내부 enum 그대로 노출 방지) */
function deliveryModeCustomerLabel(mode) {
  const raw = (mode || "general").toString().trim().toLowerCase();
  const key = ["ai_guide", "in_person", "ai_plus_human", "general"].includes(raw) ? raw : "general";
  const fallbacks = {
    ai_guide: "Landing Help AI Agent",
    in_person: "In-person support",
    ai_plus_human: "Landing Help AI Agent + optional human help",
    general: "Guided service",
  };
  return t(`common.service_flow.delivery.${key}.badge`, fallbacks[key]);
}

/** 전달 방식별 고객용 한 줄 설명 (설문 `delivery_mode`와 정렬) */
function deliveryModeCustomerExplain(mode) {
  const raw = (mode || "general").toString().trim().toLowerCase();
  const key = ["ai_guide", "in_person", "ai_plus_human", "general"].includes(raw) ? raw : "general";
  const fallbacks = {
    ai_guide: "Digital steps, checklists, and uploads—so you always know what to do next.",
    in_person: "Includes coordinated human or on-site help where your package says so, not chat-only.",
    ai_plus_human: "Starts in the app; you can bring in a person when something needs a human decision or visit.",
    general: "Plain-language guidance through the steps for this service.",
  };
  return t(`common.service_flow.delivery.${key}.explain`, fallbacks[key]);
}

function normalizeDeliveryModeKey(mode) {
  const raw = (mode || "general").toString().trim().toLowerCase();
  return ["ai_guide", "in_person", "ai_plus_human", "general"].includes(raw) ? raw : "general";
}

function uniqueDeliveryModesFromQuote(quote) {
  const survey = surveySnapshotFromQuote(quote);
  const services = Array.isArray(survey.selected_services) ? survey.selected_services : [];
  const out = [];
  const seen = new Set();
  for (const s of services) {
    if (!s || typeof s !== "object") continue;
    const k = normalizeDeliveryModeKey(s.delivery_mode);
    if (!seen.has(k)) {
      seen.add(k);
      out.push(k);
    }
  }
  return out;
}

function aiHelpBulletsForMode(mode) {
  const m = normalizeDeliveryModeKey(mode);
  const byMode = {
    ai_guide: [
      t(
        "customer.quote.ai.help.ai_guide.1",
        "Shows the next task, what to upload, and what is still missing so the case does not stall."
      ),
      t(
        "customer.quote.ai.help.ai_guide.2",
        "Explains form fields and jargon in plain language while staying inside this quote’s scope."
      ),
    ],
    in_person: [
      t(
        "customer.quote.ai.help.in_person.1",
        "Coordinates scheduled human support—calls, meetings, or visits—when that is part of what you bought."
      ),
      t(
        "customer.quote.ai.help.in_person.2",
        "Keeps the same checklist visible so you see how live help fits between steps."
      ),
    ],
    ai_plus_human: [
      t(
        "customer.quote.ai.help.ai_plus.1",
        "Runs the digital checklist first so routine steps are done before anyone travels or blocks calendar time."
      ),
      t(
        "customer.quote.ai.help.ai_plus.2",
        "Flags when a step should switch to a person—for example signatures, inspections, or exceptions."
      ),
    ],
    general: [
      t(
        "customer.quote.ai.help.general.1",
        "Walks the sequence of tasks for this service in order, with short explanations at each step."
      ),
    ],
  };
  return byMode[m] || byMode.general;
}

function buildCustomerResponsibilityBullets() {
  return [
    t(
      "customer.quote.ai.you.1",
      "You submit your own documents and payments to government or third parties when the process requires it—those fees are usually separate from this quote."
    ),
    t(
      "customer.quote.ai.you.2",
      "You read requests from the team, fix mistakes quickly, and confirm decisions so work can move on."
    ),
  ];
}

function buildHumanEscalationBullets(modes) {
  const set = new Set(modes);
  const out = [];
  const add = (line) => {
    if (line && !out.includes(line)) out.push(line);
  };
  if (set.has("in_person")) {
    add(
      t(
        "customer.quote.ai.human.in_person",
        "Staff may handle on-site coordination, handoffs, or appointments that cannot be done only in the app."
      )
    );
  }
  if (set.has("ai_plus_human")) {
    add(
      t(
        "customer.quote.ai.human.ai_plus",
        "You can ask for a person when a step needs judgment, a wet signature, or someone physically present."
      )
    );
  }
  add(
    t(
      "customer.quote.ai.human.always",
      "Use your message thread with the team if something is unclear, urgent, or not covered by the checklist."
    )
  );
  return out;
}

function mergeUniqueBullets(lists) {
  const out = [];
  for (const list of lists) {
    for (const line of list) {
      if (line && !out.includes(line)) out.push(line);
    }
  }
  return out;
}

function fillBulletList(ul, lines) {
  if (!ul) return;
  ul.innerHTML = "";
  for (const line of lines) {
    const li = document.createElement("li");
    li.textContent = line;
    ul.appendChild(li);
  }
}

function renderAiSupportSection(quote) {
  const modes = uniqueDeliveryModesFromQuote(quote);
  const deliveryEl = qs("#quoteAiDeliverySummary");
  const helpUl = qs("#quoteAiHelpList");
  const youUl = qs("#quoteAiYouList");
  const humanUl = qs("#quoteAiHumanList");

  const modeKeysForBullets = modes.length ? modes : ["general"];
  const helpLines = mergeUniqueBullets(modeKeysForBullets.map((m) => aiHelpBulletsForMode(m)));

  fillBulletList(helpUl, helpLines);
  fillBulletList(youUl, buildCustomerResponsibilityBullets());
  fillBulletList(humanUl, buildHumanEscalationBullets(modeKeysForBullets));

  if (deliveryEl) {
    if (!modes.length) {
      deliveryEl.hidden = true;
      deliveryEl.textContent = "";
    } else if (modes.length === 1) {
      deliveryEl.hidden = false;
      const label = deliveryModeCustomerLabel(modes[0]);
      const explain = deliveryModeCustomerExplain(modes[0]);
      deliveryEl.textContent = `${t("customer.quote.ai.delivery_setup", "How this quote is set up")}: ${label} — ${explain}`;
    } else {
      deliveryEl.hidden = false;
      const labels = modes.map((m) => deliveryModeCustomerLabel(m)).join(` ${t("customer.quote.ai.delivery_and", "and")} `);
      deliveryEl.textContent = `${t("customer.quote.ai.delivery_setup", "How this quote is set up")}: ${labels}. ${t(
        "customer.quote.ai.delivery_multi_hint",
        "The bullets below spell out what that means in practice."
      )}`;
    }
  }
}

function formatSurveyAnswerJson(raw) {
  return formatSurveyAnswerForDisplay(raw, {
    yes: t("customer.quote.answer.bool_yes", "예"),
    no: t("customer.quote.answer.bool_no", "아니요"),
  });
}

function truncateForDisplay(s, max) {
  const t0 = (s || "").toString().trim();
  if (!t0) return "";
  if (t0.length <= max) return t0;
  return `${t0.slice(0, max - 1)}…`;
}

function humanizeDetailLabel(answer) {
  if (!answer || typeof answer !== "object") return "";
  const lab = (answer.label || "").toString().trim();
  if (lab) return lab;
  const fid = (answer.field_id || "").toString().trim();
  if (!fid) return "";
  return fid.replace(/_/g, " ").replace(/\s+/g, " ").trim();
}

function surveySnapshotFromQuote(quote) {
  const rd = quote?.request_details && typeof quote.request_details === "object" ? quote.request_details : {};
  const survey = rd.survey_submission && typeof rd.survey_submission === "object" ? rd.survey_submission : {};
  return survey;
}

/**
 * @returns {{ helpAreas: string[], serviceLines: string[], understood: { label: string, value: string }[] }}
 */
function collectRequestSummaryContext(quote) {
  const survey = surveySnapshotFromQuote(quote);
  const cats = Array.isArray(survey.selected_categories) ? survey.selected_categories : [];
  let helpAreas = cats
    .map((c) => {
      if (!c || typeof c !== "object") return "";
      return (c.title || "").toString().trim();
    })
    .filter(Boolean);

  const selectedServices = Array.isArray(survey.selected_services) ? survey.selected_services : [];
  const serviceLines = selectedServices
    .map((s) => {
      if (!s || typeof s !== "object") return "";
      const title = (s.title || "").toString().trim();
      const dm = s.delivery_mode ? String(s.delivery_mode).trim() : "";
      const lineTitle = title || t("customer.quote.request_section.service_untitled", "Your selected service");
      if (!dm) return lineTitle;
      return `${lineTitle} · ${deliveryModeCustomerLabel(dm)}`;
    })
    .filter(Boolean);

  const detailed = Array.isArray(survey.detailed_answers) ? survey.detailed_answers : [];
  const understood = [];
  const maxLines = 8;
  const maxVal = 160;
  for (const a of detailed) {
    if (!a || typeof a !== "object") continue;
    const label = humanizeDetailLabel(a);
    const value = truncateForDisplay(formatSurveyAnswerJson(a.answer_json), maxVal);
    if (!label || !value) continue;
    understood.push({ label, value });
    if (understood.length >= maxLines) break;
  }

  if (!helpAreas.length) {
    const sn = (quote?.service_name || "").toString().trim();
    if (/^survey request:\s*/i.test(sn)) {
      const rest = sn.replace(/^survey request:\s*/i, "").trim();
      if (rest) helpAreas = [rest];
    }
  }

  return { helpAreas, serviceLines, understood };
}

function fillTextList(ul, items, emptyKey, emptyDefault) {
  if (!ul) return;
  ul.innerHTML = "";
  const emptyMsg = t(emptyKey, emptyDefault);
  if (!items || !items.length) {
    const li = document.createElement("li");
    li.className = "lhai-quote-request-block__empty";
    li.textContent = emptyMsg;
    ul.appendChild(li);
    return;
  }
  for (const text of items) {
    const li = document.createElement("li");
    li.textContent = text;
    ul.appendChild(li);
  }
}

function renderRequestSummaryBlock(quote) {
  const helpUl = qs("#quoteRequestHelpAreas");
  const svcUl = qs("#quoteRequestServicesList");
  const understoodWrap = qs("#quoteRequestUnderstoodWrap");
  const understoodUl = qs("#quoteRequestUnderstoodList");

  const { helpAreas, serviceLines, understood } = collectRequestSummaryContext(quote);

  fillTextList(
    helpUl,
    helpAreas,
    "customer.quote.request_section.empty_help",
    "No help area was saved with this request. If this looks wrong, message the team."
  );
  fillTextList(
    svcUl,
    serviceLines,
    "customer.quote.request_section.empty_services",
    "No services were saved with this request. Message the team if the quote does not match what you chose."
  );

  if (understoodWrap && understoodUl) {
    if (!understood.length) {
      understoodWrap.hidden = true;
      understoodUl.innerHTML = "";
    } else {
      understoodWrap.hidden = false;
      understoodUl.innerHTML = "";
      for (const row of understood) {
        const li = document.createElement("li");
        const strong = document.createElement("strong");
        strong.textContent = `${row.label}: `;
        li.appendChild(strong);
        li.appendChild(document.createTextNode(row.value));
        understoodUl.appendChild(li);
      }
    }
  }
}

function formatQuoteCostDisplay(quote) {
  const currency = (quote.currency || "USD").toString().trim() || "USD";
  const est = Number(quote.estimated_cost);
  const hasValidEstimate = Number.isFinite(est) && est > 0;

  const items = Array.isArray(quote.items) ? quote.items : [];
  const subtotal = Number(quote.subtotal);
  const tax = Number(quote.tax_amount);
  const totalAmt = Number(quote.total_amount);

  let mainText = "";
  let pending = false;
  if (hasValidEstimate) {
    mainText = formatMoney(est, currency);
  } else {
    mainText = t("customer.quote.cost.not_set", "To be confirmed by the team");
    pending = true;
  }

  let breakdown = "";
  if (items.length > 0 && Number.isFinite(subtotal) && subtotal > 0.005 && Number.isFinite(tax) && tax > 0.005) {
    const tot = Number.isFinite(totalAmt) && totalAmt > 0 ? totalAmt : Math.round((subtotal + tax) * 100) / 100;
    breakdown = `${t("customer.quote.cost.subtotal", "Subtotal")} ${formatMoney(subtotal, currency)} + ${t("customer.quote.cost.tax", "estimated tax")} ${formatMoney(tax, currency)} → ${t("customer.quote.cost.total_line", "total")} ${formatMoney(tot, currency)}`;
  } else if (
    items.length > 0 &&
    Number.isFinite(totalAmt) &&
    totalAmt > 0.005 &&
    hasValidEstimate &&
    Math.abs(totalAmt - est) > 0.02
  ) {
    breakdown = `${t("customer.quote.cost.line_items_hint", "Line items add up to")} ${formatMoney(totalAmt, currency)}${t(
      "customer.quote.cost.vs_estimate",
      " — the proposed total above is what the team is asking you to approve."
    )}`;
  }

  return { mainText, pending, breakdown };
}

function renderQuoteHero(quote) {
  const titleEl = qs("#quoteHeroTitle");
  const subEl = qs("#quoteHeroSubtitle");
  const statusEl = qs("#quoteHeroStatus");
  const reassuranceEl = qs("#quoteHeroReassurance");
  const svcLabel = qs("#quoteHeroServiceLabel");
  const svcName = qs("#quoteHeroServiceName");
  const costLabel = qs("#quoteHeroCostLabel");
  const costEl = qs("#quoteHeroEstimatedCost");
  const costEyebrow = qs("#quoteHeroCostEyebrow");
  const costBreakdown = qs("#quoteHeroCostBreakdown");
  const costNote = qs("#quoteHeroCostNote");
  const costDemoPill = qs("#quoteCostDemoPill");
  const nextEl = qs("#quoteHeroNextCue");

  if (titleEl) titleEl.textContent = t("customer.quote.hero.title", "Your quote is ready");
  if (subEl) subEl.textContent = t("customer.quote.hero.subtitle", "Please review the proposal for your requested service.");
  if (reassuranceEl) {
    reassuranceEl.textContent = t(
      "customer.quote.hero.reassurance",
      "This is the proposed quote from our team. The PDF and follow-up details are also available in your inbox and email."
    );
  }
  if (svcLabel) svcLabel.textContent = t("customer.quote.hero.service_label", "Service / request");
  if (costLabel) costLabel.textContent = t("customer.quote.cost.primary_label", "Proposed total");
  if (costEyebrow) costEyebrow.textContent = t("customer.quote.cost.eyebrow", "For the scope in this proposal");
  if (svcName) svcName.textContent = heroServiceRequestLabel(quote);

  const { mainText, pending, breakdown } = formatQuoteCostDisplay(quote);
  if (costEl) {
    costEl.textContent = mainText;
    costEl.classList.toggle("lhai-quote-hero__value--cost-pending", pending);
  }
  if (costBreakdown) {
    if (breakdown) {
      costBreakdown.hidden = false;
      costBreakdown.textContent = breakdown;
    } else {
      costBreakdown.hidden = true;
      costBreakdown.textContent = "";
    }
  }
  if (costNote) {
    costNote.textContent = t(
      "customer.quote.cost.note",
      "This amount is proposed for the agreed scope. Optional add-ons or work outside this proposal may cost extra and are confirmed with you before any charge. You are not billed until you approve and the team confirms next steps."
    );
  }
  if (costDemoPill) {
    costDemoPill.hidden = quote.mocked !== true;
  }

  if (nextEl) nextEl.textContent = heroNextCue(quote);

  if (statusEl) {
    statusEl.textContent = customerFacingStatusLabel(quote.status);
    statusEl.className = statusBadgeClass(quote.status);
  }
}

function renderQuoteSecondaryDetails(quote) {
  const detailsEl = qs(".lhai-quote-secondary--footer");
  const summaryEl = detailsEl?.querySelector("summary.lhai-quote-secondary__summary");
  const idEl = qs("#quoteId");
  const secondaryTitle = qs("#quoteSecondaryTitle");
  const hintEl = qs(".lhai-quote-secondary--footer .lhai-quote-secondary__hint");
  if (summaryEl) {
    summaryEl.textContent = t("customer.quote.secondary.summary", "Quote details (reference only)");
  }
  if (idEl) idEl.textContent = quote.id || "—";
  if (secondaryTitle) {
    const rec = customerFacingQuoteRecordTitle(quote);
    secondaryTitle.textContent = rec || "—";
  }
  if (hintEl) {
    hintEl.textContent = t(
      "customer.quote.secondary.hint",
      "Use these when you contact support. You do not need them to understand your proposal."
    );
  }
}

function whatsNextProcessSteps(quote) {
  const st = (quote?.status || "").toUpperCase();
  if (st === "PROPOSED") {
    return [
      t("customer.quote.whats_next.step_review", "Review your request summary and the proposed amount on this page."),
      t("customer.quote.whats_next.step_decide", "Tap Approve if you accept this proposal, or Reject if you do not."),
      t(
        "customer.quote.whats_next.step_if_approved",
        "If you approve, an invoice or payment instructions will follow (usually in your messages and email), then your service checklist continues."
      ),
      t(
        "customer.quote.whats_next.step_help",
        "If you have questions before deciding, write to the team in your message thread."
      ),
    ];
  }
  if (st === "APPROVED") {
    return [
      t(
        "customer.quote.whats_next.approved_pay",
        "Check your inbox and in-app messages for the invoice or payment link and any tasks to finish."
      ),
      t(
        "customer.quote.whats_next.approved_workflow",
        "After payment is confirmed, the team will guide the next workflow steps from your dashboard."
      ),
      t("customer.quote.whats_next.approved_help", "Reply in messages if dates, amounts, or documents need clarification."),
    ];
  }
  if (st === "REJECTED" || st === "EXPIRED") {
    return [
      t("customer.quote.whats_next.closed_no_action", "You do not need to take further action on this quote."),
      t(
        "customer.quote.whats_next.closed_reach_out",
        "If you still need support, message the team to adjust the scope or explore another option."
      ),
    ];
  }
  return [
    t(
      "customer.quote.whats_next.waiting_proposal",
      "When the team sends a proposal, it will appear here. You will then review, approve or reject, and use messages if anything is unclear."
    ),
  ];
}

function renderQuoteActionCopy() {
  const intro = qs(".lhai-quote-actions__intro");
  const group = qs("#quoteActionsGroup");
  const approveBtn = qs("#approveQuoteBtn");
  const rejectBtn = qs("#rejectQuoteBtn");
  const approveHint = qs("#approveQuoteHint");
  const rejectHint = qs("#rejectQuoteHint");

  if (group) {
    group.setAttribute("aria-label", t("customer.quote.actions.group_label", "Decide on this quote"));
  }
  if (intro) {
    intro.textContent = t("customer.quote.actions.intro", "Choose an action below. Nothing is final until you confirm.");
  }
  if (approveBtn) {
    delete approveBtn.dataset.lhaiLabelSaved;
    approveBtn.setAttribute("aria-busy", "false");
    approveBtn.textContent = t("customer.quote.actions.approve", "Approve");
  }
  if (rejectBtn) {
    delete rejectBtn.dataset.lhaiLabelSaved;
    rejectBtn.setAttribute("aria-busy", "false");
    rejectBtn.textContent = t("customer.quote.actions.reject", "Reject");
  }
  if (approveHint) {
    approveHint.textContent = t(
      "customer.quote.actions.approve_hint",
      "Tells the team you accept this proposal. They will usually send an invoice or payment steps next, then continue your service."
    );
  }
  if (rejectHint) {
    rejectHint.textContent = t(
      "customer.quote.actions.reject_hint",
      "Stops this quote for now. You are not charged. You can message the team later if you want a different option."
    );
  }
}

function renderWhatsNextSection(quote) {
  const ol = qs("#quoteWhatsNextSteps");
  if (ol) {
    ol.innerHTML = "";
    for (const line of whatsNextProcessSteps(quote)) {
      const li = document.createElement("li");
      li.textContent = line;
      ol.appendChild(li);
    }
  }
}

function renderQuote(quote) {
  renderQuoteHero(quote);
  renderRequestSummaryBlock(quote);
  renderAiSupportSection(quote);

  const noteTitle = qs("#quoteCustomerNoteTitle");
  if (noteTitle) {
    noteTitle.textContent = t("customer.quote.customer_note_title", "Note from your team");
  }
  const noteSection = qs("#quoteCustomerNoteSection");
  const noteEl = qs("#quoteCustomerNote");
  const note = (quote.customer_facing_note || "").toString().trim();
  if (noteSection && noteEl) {
    noteSection.hidden = !note;
    noteEl.textContent = note || "";
  }

  renderWhatsNextSection(quote);
  renderQuoteActionCopy();

  const allowDecision = quote.status === "PROPOSED";
  const approveBtnEl = qs("#approveQuoteBtn");
  const rejectBtnEl = qs("#rejectQuoteBtn");
  if (approveBtnEl) approveBtnEl.disabled = !allowDecision;
  if (rejectBtnEl) rejectBtnEl.disabled = !allowDecision;

  renderQuoteSecondaryDetails(quote);
  renderDecisionFeedbackPanel(quote);
}

/**
 * URL·localStorage에 유효한 id가 없거나 404인 경우, 현재 세션 고객의 최신 비초안 견적을 고릅니다.
 * (사이드바 "견적"은 quote_id 없이 열리며, 오래된 localStorage id로 404가 나던 문제 완화)
 */
async function fetchLatestCustomerQuoteDetail() {
  const profileId = getCustomerMessagingProfileId();
  try {
    const rows = await quoteApi.list("", profileId);
    const visible = (Array.isArray(rows) ? rows : []).filter(
      (q) => String(q?.status || "").toUpperCase() !== "DRAFT"
    );
    visible.sort((a, b) => {
      const ta = new Date(a?.updated_at || 0).getTime();
      const tb = new Date(b?.updated_at || 0).getTime();
      return tb - ta;
    });
    const pick = visible[0];
    if (!pick?.id) return null;
    return await quoteApi.getDetail(String(pick.id));
  } catch {
    return null;
  }
}

function applyQuotePageShell() {
  const titleEl = qs("#quotePageTitle");
  if (titleEl) titleEl.textContent = t("customer.quote.page_title", "Review your quote");
  try {
    document.title = `${t("customer.quote.page_title", "Review your quote")} - Landing Help AI`;
  } catch {
    /* non-browser */
  }
  const load = qs("#quoteLoadingState");
  if (load) load.textContent = t("customer.quote.loading", "Loading your quote…");
  const empty = qs("#quoteEmptyState");
  if (empty) {
    empty.textContent = t(
      "customer.quote.empty",
      "No quote is available here yet. When the team sends a proposal, it will appear on this page."
    );
  }
}

async function initQuoteDetailPage() {
  if (!protectCurrentPage()) return;
  if (!ensureCustomerAccess()) return;

  const params = new URLSearchParams(window.location.search);
  const quoteIdFromUrl =
    (params.get("quote_id") || params.get("quoteId") || params.get("id") || params.get("qid") || params.get("pending_quote_id") || "").trim();
  const quoteIdFromStore = window.localStorage.getItem("lhai_latest_quote_id") || "";

  let quote = null;
  if (quoteIdFromUrl) {
    try {
      quote = await quoteApi.getDetail(quoteIdFromUrl);
    } catch {
      quote = null;
    }
  } else {
    const storeId = (quoteIdFromStore || "").trim();
    if (storeId) {
      try {
        quote = await quoteApi.getDetail(storeId);
      } catch {
        window.localStorage.removeItem("lhai_latest_quote_id");
        quote = null;
      }
    }
  }

  if (!quote) {
    quote = await fetchLatestCustomerQuoteDetail();
  }

  const uiLang = quote ? resolveQuoteUiLang(quote) : "ko";
  document.documentElement.lang = uiLang === "en" ? "en" : "ko";

  resetI18nClientState();
  try {
    await initI18nDomains(["common", "quote"], uiLang);
  } catch {
    /* 폴백 번들만 사용 */
  }
  mergeFallbackStrings(getQuoteLocaleBundle(uiLang));

  await loadSidebar("#sidebar", "customer");
  applyI18nToDom(document);

  const brandEl = document.querySelector(".lhai-brand");
  if (brandEl) brandEl.textContent = resolveAppHeaderShell().brand;
  void refreshHeaderMailUnreadBadge();

  applyQuotePageShell();

  if (!quote) {
    const loadEl = qs("#quoteLoadingState");
    const emptyEl = qs("#quoteEmptyState");
    if (loadEl) loadEl.style.display = "none";
    if (emptyEl) emptyEl.style.display = "block";
    setStatus(t("customer.quote.load_error", "We couldn’t load this quote. Check the link or try again later."));
    return;
  }

  patchState({ quote });
  renderQuote(quote);
  if (quote.id) window.localStorage.setItem("lhai_latest_quote_id", quote.id);
  const loadEl = qs("#quoteLoadingState");
  const contentEl = qs("#quoteContent");
  if (loadEl) loadEl.style.display = "none";
  if (contentEl) contentEl.style.display = "block";
  {
    const st0 = (quote.status || "").toUpperCase();
    let stripKey = "customer.quote.status_strip.other";
    let stripFb = "When the team sends a proposal, you can review and respond here.";
    if (st0 === "PROPOSED") {
      stripKey = "customer.quote.status_strip.proposed";
      stripFb = "This quote is proposed by the team. Choose Approve or Reject below.";
    } else if (st0 === "APPROVED") {
      stripKey = "customer.quote.status_strip.approved";
      stripFb = "Approval is complete. Open your invoice from messages or email and proceed to payment.";
    } else if (st0 === "REJECTED" || st0 === "EXPIRED") {
      stripKey = "customer.quote.status_strip.rejected";
      stripFb = "This quote was declined.";
    }
    setStatus(t(stripKey, stripFb), "default");
  }

  qs("#approveQuoteBtn")?.addEventListener("click", async () => {
    try {
      showDecisionFeedbackLoading(
        t("customer.quote.feedback.approve_submitting", "Submitting your approval…")
      );
      setQuoteDecisionButtonsBusy(true, "approve");
      if (quote.mocked) {
        quote = { ...quote, status: "APPROVED" };
        patchState({ quote });
        setStatus(
          t(
            "customer.quote.transition.approved",
            "Quote approved. Your invoice was created and sent—check messages and email, then complete payment."
          ),
          "default"
        );
        renderQuote(quote);
        scrollDecisionFeedbackIntoView();
        return;
      }
      const transition = await quoteApi.transition(quote.id, "APPROVED", "Approved by customer");
      setStatus(
        transition.message ||
          t(
            "customer.quote.transition.approved",
            "Quote approved. Your invoice was created and sent—check messages and email, then complete payment."
          ),
        "default"
      );
      try {
        const refreshed = await quoteApi.getDetail(quote.id);
        quote = refreshed;
        patchState({ quote });
        renderQuote(refreshed);
      } catch {
        const toSt = String(transition.to_status ?? transition.toStatus ?? "APPROVED").toUpperCase();
        quote = { ...quote, status: toSt };
        patchState({ quote });
        renderQuote(quote);
      }
      scrollDecisionFeedbackIntoView();
    } catch (e) {
      const msg = e && typeof e.message === "string" ? e.message : String(e);
      setStatus(msg || t("customer.quote.transition.error", "Could not update the quote. Please try again."), "error");
      renderQuote(quote);
    }
  });

  qs("#rejectQuoteBtn")?.addEventListener("click", async () => {
    try {
      showDecisionFeedbackLoading(t("customer.quote.feedback.reject_submitting", "Submitting your decision…"));
      setQuoteDecisionButtonsBusy(true, "reject");
      if (quote.mocked) {
        quote = { ...quote, status: "REJECTED" };
        patchState({ quote });
        setStatus(t("customer.quote.transition.rejected", "Quote declined."), "default");
        renderQuote(quote);
        scrollDecisionFeedbackIntoView();
        return;
      }
      const transition = await quoteApi.transition(quote.id, "REJECTED", "Rejected by customer");
      setStatus(transition.message || t("customer.quote.transition.rejected", "Quote declined."), "default");
      try {
        const refreshed = await quoteApi.getDetail(quote.id);
        quote = refreshed;
        patchState({ quote });
        renderQuote(refreshed);
      } catch {
        const toSt = String(transition.to_status ?? transition.toStatus ?? "REJECTED").toUpperCase();
        quote = { ...quote, status: toSt };
        patchState({ quote });
        renderQuote(quote);
      }
      scrollDecisionFeedbackIntoView();
    } catch (e) {
      const msg = e && typeof e.message === "string" ? e.message : String(e);
      setStatus(msg || t("customer.quote.transition.error", "Could not update the quote. Please try again."), "error");
      renderQuote(quote);
    }
  });

}

void initQuoteDetailPage().catch((err) => {
  console.error("[lhai] quote-detail init failed:", err);
});

export { initQuoteDetailPage };
