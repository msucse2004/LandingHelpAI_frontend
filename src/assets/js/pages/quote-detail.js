import { quoteApi } from "../core/api.js";
import { getCustomerMessagingProfileId } from "../core/auth.js";
import { ensureCustomerAccess, protectCurrentPage } from "../core/guards.js";
import { patchState } from "../core/state.js";
import { loadSidebar } from "../components/sidebar.js";
import { applyI18nToDom } from "../core/i18n-dom.js";
import { initI18nDomains, mergeFallbackStrings, resetI18nClientState, t } from "../core/i18n-client.js";
import { formatMoney } from "../core/utils.js";
import { resolveAppHeaderShell, refreshHeaderMailUnreadBadge } from "../core/app-header.js";
import { getQuoteLocaleBundle, resolveQuoteUiLang } from "./quote-detail-locale.js";
import { buildQuotePricingBreakdown } from "./quote-detail-pricing-logic.js";
import { buildQuoteScopeContentFromQuote } from "./quote-detail-scope-logic.js";
import { buildQuoteSupportContent } from "./quote-detail-support-logic.js";
import {
  buildRequestSummaryRows,
  requestSummaryHasVisibleRows,
} from "./quote-detail-request-logic.js";
import {
  buildRejectTransitionNote,
  canCustomerDecideOnQuote,
  quoteDecisionModalCostSummary,
} from "./quote-detail-decision-modal.js";
import { isCatalogRecServiceItemUuidString } from "../lib/catalog-rec-service-item-id.js";

function qs(selector) {
  return document.querySelector(selector);
}

let quoteApprovalBoostPollTimer = 0;
let quoteApprovalBoostStopTimer = 0;
let quoteDecisionInFlight = false;
/** @type {HTMLElement | null} */
let quoteDecisionModalTrigger = null;

function stopPostApprovalMessageBoostPolling() {
  if (quoteApprovalBoostPollTimer) {
    window.clearInterval(quoteApprovalBoostPollTimer);
    quoteApprovalBoostPollTimer = 0;
  }
  if (quoteApprovalBoostStopTimer) {
    window.clearTimeout(quoteApprovalBoostStopTimer);
    quoteApprovalBoostStopTimer = 0;
  }
}

/**
 * 견적 승인 직후 짧은 시간만 메시지 알림 동기화를 촘촘하게 수행합니다.
 * - 기본 헤더 폴링(10초)은 유지
 * - 여기서는 2초 간격으로 최대 90초까지 임시 체크
 */
async function startPostApprovalMessageBoostPolling() {
  stopPostApprovalMessageBoostPolling();
  let baseline = 0;
  try {
    baseline = Number(await refreshHeaderMailUnreadBadge()) || 0;
  } catch {
    baseline = 0;
  }
  const startedAt = Date.now();
  quoteApprovalBoostPollTimer = window.setInterval(async () => {
    try {
      const count = Number(await refreshHeaderMailUnreadBadge()) || 0;
      if (count > baseline) {
        setStatus(
          t(
            "customer.quote.transition.invoice_arrived_hint",
            "새 메시지가 도착했습니다. 메시지함에서 청구서 안내를 바로 확인해 주세요."
          ),
          "default"
        );
        stopPostApprovalMessageBoostPolling();
        return;
      }
      if (Date.now() - startedAt >= 90_000) {
        stopPostApprovalMessageBoostPolling();
      }
    } catch {
      // Ignore transient polling failures and keep retrying until timeout.
    }
  }, 2_000);
  quoteApprovalBoostStopTimer = window.setTimeout(() => {
    stopPostApprovalMessageBoostPolling();
  }, 92_000);
}

function setStatus(message, tone = "default") {
  const status = qs("#quoteActionStatus");
  if (!status) return;
  status.textContent = message || "";
  status.classList.remove("lhai-quote-actions__status--error", "lhai-quote-whats-next__action-status--error");
  if (tone === "error") status.classList.add("lhai-quote-whats-next__action-status--error");
}

const QUOTE_APPROVE_BTN_IDS = ["quoteHeroApproveBtn", "quoteFooterApproveBtn"];
const QUOTE_REJECT_BTN_IDS = ["quoteHeroRejectBtn", "quoteFooterRejectBtn"];
const QUOTE_ASK_LINK_IDS = ["quoteHeroAskBtn", "quoteFooterAskBtn"];

function quoteApproveButtons() {
  return QUOTE_APPROVE_BTN_IDS.map((id) => document.getElementById(id)).filter(Boolean);
}

function quoteRejectButtons() {
  return QUOTE_REJECT_BTN_IDS.map((id) => document.getElementById(id)).filter(Boolean);
}

function quoteAskLinks() {
  return QUOTE_ASK_LINK_IDS.map((id) => document.getElementById(id)).filter(Boolean);
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
  const st = normalizeQuoteStatus(quote?.status);
  panel.innerHTML = "";
  panel.className = "lhai-quote-decision-feedback";

  if (st === "APPROVED" || st === "PAID") {
    if (st === "PAID") {
      panel.hidden = true;
      return;
    }
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
function quoteDecisionButtonEls() {
  return [...quoteApproveButtons(), ...quoteRejectButtons()];
}

function setQuoteDecisionButtonsBusy(busy, which, workingLabel) {
  quoteDecisionInFlight = !!busy;
  setQuoteDecisionModalButtonsBusy(busy);
  const approveBtns = quoteApproveButtons();
  const rejectBtns = quoteRejectButtons();
  const w = workingLabel || t("customer.quote.feedback.processing_short", "Processing…");
  quoteDecisionButtonEls().forEach((b) => {
    if (!busy) {
      if (b.dataset.lhaiLabelSaved) {
        b.textContent = b.dataset.lhaiLabelSaved;
        delete b.dataset.lhaiLabelSaved;
      }
      b.setAttribute("aria-busy", "false");
    }
    b.disabled = !!busy;
  });
  for (const approveBtn of approveBtns) {
    const on = Boolean(busy && which === "approve");
    approveBtn.setAttribute("aria-busy", on ? "true" : "false");
    if (on) {
      if (!approveBtn.dataset.lhaiLabelSaved) approveBtn.dataset.lhaiLabelSaved = approveBtn.textContent;
      approveBtn.textContent = w;
    }
  }
  for (const rejectBtn of rejectBtns) {
    const on = Boolean(busy && which === "reject");
    rejectBtn.setAttribute("aria-busy", on ? "true" : "false");
    if (on) {
      if (!rejectBtn.dataset.lhaiLabelSaved) rejectBtn.dataset.lhaiLabelSaved = rejectBtn.textContent;
      rejectBtn.textContent = w;
    }
  }
}

function setQuoteDecisionModalButtonsBusy(busy) {
  for (const id of [
    "quoteApproveModalConfirm",
    "quoteApproveModalCancel",
    "quoteRejectModalConfirm",
    "quoteRejectModalCancel",
  ]) {
    const el = document.getElementById(id);
    if (el) el.disabled = !!busy;
  }
  const reasonEl = document.getElementById("quoteRejectModalReason");
  if (reasonEl) reasonEl.disabled = !!busy;
}

function closeQuoteDecisionModals() {
  const approveDlg = document.getElementById("quoteApproveConfirmDialog");
  const rejectDlg = document.getElementById("quoteRejectConfirmDialog");
  if (approveDlg instanceof HTMLDialogElement && approveDlg.open) approveDlg.close();
  if (rejectDlg instanceof HTMLDialogElement && rejectDlg.open) rejectDlg.close();
}

function restoreQuoteDecisionModalFocus() {
  if (quoteDecisionModalTrigger && typeof quoteDecisionModalTrigger.focus === "function") {
    quoteDecisionModalTrigger.focus();
  }
  quoteDecisionModalTrigger = null;
}

function fillApproveModalBullets(ul) {
  if (!ul) return;
  ul.innerHTML = "";
  const lines = [
    t(
      "customer.quote.modal.approve.bullet_invoice",
      "After approval, an invoice and payment instructions will be sent to you."
    ),
    t(
      "customer.quote.modal.approve.bullet_agent",
      "After payment, Agent guidance will begin."
    ),
  ];
  for (const line of lines) {
    const li = document.createElement("li");
    li.textContent = line;
    ul.appendChild(li);
  }
}

/** @param {unknown} quote */
function populateApproveConfirmModal(quote) {
  const { serviceSummary, totalText } = quoteDecisionModalCostSummary(
    quote,
    formatQuoteCostDisplay,
    heroServiceRequestLabel
  );
  const titleEl = qs("#quoteApproveModalTitle");
  const svcLabel = qs("#quoteApproveModalServiceLabel");
  const totalLabel = qs("#quoteApproveModalTotalLabel");
  const svcEl = qs("#quoteApproveModalService");
  const totalEl = qs("#quoteApproveModalTotal");
  const cancelBtn = qs("#quoteApproveModalCancel");
  const confirmBtn = qs("#quoteApproveModalConfirm");

  if (titleEl) {
    titleEl.textContent = t("customer.quote.modal.approve.title", "Approve this quote?");
  }
  if (svcLabel) {
    svcLabel.textContent = t("customer.quote.modal.approve.service_label", "Service summary");
  }
  if (totalLabel) {
    totalLabel.textContent = t("customer.quote.modal.approve.total_label", "Proposed total");
  }
  if (svcEl) svcEl.textContent = serviceSummary;
  if (totalEl) totalEl.textContent = totalText;
  if (cancelBtn) cancelBtn.textContent = t("customer.quote.modal.cancel", "Cancel");
  if (confirmBtn) confirmBtn.textContent = quoteCtaApproveLabel();
  fillApproveModalBullets(qs("#quoteApproveModalBullets"));
}

/** @param {unknown} quote */
function populateRejectConfirmModal(quote) {
  void quote;
  const titleEl = qs("#quoteRejectModalTitle");
  const introEl = qs("#quoteRejectModalIntro");
  const hintEl = qs("#quoteRejectModalHint");
  const reasonLabel = qs("#quoteRejectModalReasonLabel");
  const reasonEl = qs("#quoteRejectModalReason");
  const cancelBtn = qs("#quoteRejectModalCancel");
  const confirmBtn = qs("#quoteRejectModalConfirm");

  if (titleEl) titleEl.textContent = t("customer.quote.modal.reject.title", "Decline this quote?");
  if (introEl) {
    introEl.textContent = t(
      "customer.quote.modal.reject.intro",
      "If you decline, this quote will not move forward."
    );
  }
  if (hintEl) {
    hintEl.textContent = t(
      "customer.quote.modal.reject.reason_hint",
      "If you can, please leave a short reason so the team can help."
    );
  }
  if (reasonLabel) {
    reasonLabel.textContent = t(
      "customer.quote.modal.reject.reason_label",
      "Reason for declining (optional)"
    );
  }
  if (reasonEl) {
    reasonEl.placeholder = t(
      "customer.quote.modal.reject.reason_placeholder",
      "Optional — e.g. timing, budget, or scope"
    );
    reasonEl.value = "";
    reasonEl.disabled = false;
  }
  if (cancelBtn) cancelBtn.textContent = t("customer.quote.modal.cancel", "Cancel");
  if (confirmBtn) confirmBtn.textContent = quoteCtaRejectLabel();
}

/**
 * @param {unknown} quote
 * @param {EventTarget | null} triggerEl
 */
function openApproveConfirmModal(quote, triggerEl) {
  if (!canCustomerDecideOnQuote(quote?.status) || quoteDecisionInFlight) return;
  const dialog = document.getElementById("quoteApproveConfirmDialog");
  if (!(dialog instanceof HTMLDialogElement)) return;
  quoteDecisionModalTrigger = triggerEl instanceof HTMLElement ? triggerEl : null;
  populateApproveConfirmModal(quote);
  dialog.showModal();
  qs("#quoteApproveModalCancel")?.focus();
}

/**
 * @param {unknown} quote
 * @param {EventTarget | null} triggerEl
 */
function openRejectConfirmModal(quote, triggerEl) {
  if (!canCustomerDecideOnQuote(quote?.status) || quoteDecisionInFlight) return;
  const dialog = document.getElementById("quoteRejectConfirmDialog");
  if (!(dialog instanceof HTMLDialogElement)) return;
  quoteDecisionModalTrigger = triggerEl instanceof HTMLElement ? triggerEl : null;
  populateRejectConfirmModal(quote);
  dialog.showModal();
  qs("#quoteRejectModalCancel")?.focus();
}

/**
 * @param {() => unknown} getQuote
 * @param {() => Promise<void>} runApprove
 * @param {(note: string) => Promise<void>} runReject
 */
function wireQuoteDecisionModals(getQuote, runApprove, runReject) {
  const approveDlg = document.getElementById("quoteApproveConfirmDialog");
  const rejectDlg = document.getElementById("quoteRejectConfirmDialog");

  qs("#quoteApproveModalCancel")?.addEventListener("click", () => {
    if (approveDlg instanceof HTMLDialogElement) approveDlg.close();
    restoreQuoteDecisionModalFocus();
  });
  qs("#quoteRejectModalCancel")?.addEventListener("click", () => {
    if (rejectDlg instanceof HTMLDialogElement) rejectDlg.close();
    restoreQuoteDecisionModalFocus();
  });

  if (approveDlg instanceof HTMLDialogElement) {
    approveDlg.addEventListener("cancel", () => {
      restoreQuoteDecisionModalFocus();
    });
  }
  if (rejectDlg instanceof HTMLDialogElement) {
    rejectDlg.addEventListener("cancel", () => {
      restoreQuoteDecisionModalFocus();
    });
  }

  qs("#quoteApproveModalConfirm")?.addEventListener("click", () => {
    if (quoteDecisionInFlight) return;
    const q = getQuote();
    if (!canCustomerDecideOnQuote(q?.status)) return;
    if (approveDlg instanceof HTMLDialogElement) approveDlg.close();
    restoreQuoteDecisionModalFocus();
    void runApprove();
  });

  qs("#quoteRejectModalConfirm")?.addEventListener("click", () => {
    if (quoteDecisionInFlight) return;
    const q = getQuote();
    if (!canCustomerDecideOnQuote(q?.status)) return;
    const reasonEl = document.getElementById("quoteRejectModalReason");
    const note = buildRejectTransitionNote(reasonEl?.value);
    if (rejectDlg instanceof HTMLDialogElement) rejectDlg.close();
    restoreQuoteDecisionModalFocus();
    void runReject(note);
  });
}

/** API·레거시 표기 정규화 (ACCEPTED → APPROVED 등) */
function normalizeQuoteStatus(status) {
  const s = (status || "").toUpperCase();
  if (s === "ACCEPTED") return "APPROVED";
  return s;
}

function statusBadgeClass(status) {
  const s = normalizeQuoteStatus(status);
  if (s === "APPROVED" || s === "PAID") return "lhai-badge lhai-badge--risk-low";
  if (s === "REJECTED" || s === "EXPIRED") return "lhai-badge lhai-badge--risk-high";
  if (s === "PROPOSED") return "lhai-badge lhai-badge--risk-medium";
  return "lhai-badge";
}

function customerFacingStatusLabel(status) {
  const s = normalizeQuoteStatus(status);
  const map = {
    PROPOSED: t("customer.quote.status.proposed", "Proposed"),
    APPROVED: t("customer.quote.status.approved", "Approved"),
    REJECTED: t("customer.quote.status.rejected", "Rejected"),
    DRAFT: t("customer.quote.status.draft", "Draft"),
    EXPIRED: t("customer.quote.status.expired", "Expired"),
    PAID: t("customer.quote.status.paid", "Paid"),
  };
  return map[s] || status || "—";
}

/** @param {string} quoteId */
function buildQuoteMessagesHref(quoteId) {
  const q = new URLSearchParams();
  const id = String(quoteId || "").trim();
  if (id) q.set("quote_id", id);
  const qs = q.toString();
  return qs ? `messages.html?${qs}` : "messages.html";
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

  const rawItem = String(rd.service_item_id || "").trim();
  const fromUuid = isCatalogRecServiceItemUuidString(rawItem) ? rawItem : "";
  let sn = (quote?.service_name || fromUuid || "").toString().trim();
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

const QUOTE_SUPPORT_BULLET_FALLBACKS = {
  "agent.1": "We guide you through the next steps in order.",
  "agent.2": "We show checklists and what to prepare.",
  "agent.3": "We respond to questions in your message inbox.",
  "you.1": "Sign-ups, payments, and contract submissions are done by you.",
  "you.2": "You review information and conditions before you submit.",
  "you.3": "Contracts with carriers, dealers, or agencies remain your responsibility.",
  "human.1": "If guidance is unclear or urgent, message the team from your inbox.",
  "human.2": "When the agent cannot handle an exception, the operations team can step in.",
  "support.in_person.1": "We coordinate calls, meetings, or on-site support included in your package.",
  "support.in_person.2": "We explain what to prepare at each step.",
  "support.in_person.3": "We respond to questions in your message inbox.",
  "support.ai_plus.1": "We start with the digital checklist, then bring in a person when needed.",
  "support.ai_plus.2": "We show what to prepare and what comes next.",
  "support.general.1": "We explain the steps for this service in plain language.",
  "support.general.2": "We show checklists and preparation items.",
};

function supportBulletText(bulletId) {
  return t(`customer.quote.ai.bullet.${bulletId}`, QUOTE_SUPPORT_BULLET_FALLBACKS[bulletId] || bulletId);
}

function supportSectionTitle(content) {
  if (content.titleVariant === "agent") {
    return t("customer.quote.ai.section_title_agent", "How Landing Help AI Agent supports you");
  }
  return t("customer.quote.ai.section_title", "Support for this quote");
}

function supportSectionLede(content) {
  if (content.contentVariant === "in_person") {
    return t(
      "customer.quote.ai.lede_in_person",
      "This quote includes coordinated human support. Roles are split so you know who does what."
    );
  }
  return t(
    "customer.quote.ai.lede",
    "The agent guides your next steps and makes it easy to see what you need to do yourself."
  );
}

function supportAgentColumnHeading(content) {
  if (content.contentVariant === "in_person") {
    return t("customer.quote.ai.what_support_helps", "What support helps with");
  }
  return t("customer.quote.ai.what_ai_helps", "What the agent helps with");
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

function renderSupportDeliveryBadges(container, modeKeys) {
  if (!container) return;
  container.innerHTML = "";
  if (!modeKeys.length) {
    container.hidden = true;
    return;
  }
  container.hidden = false;
  for (const mode of modeKeys) {
    const span = document.createElement("span");
    span.className = "lhai-quote-ai__badge";
    span.textContent = deliveryModeCustomerLabel(mode);
    container.appendChild(span);
  }
}

function renderAiSupportSection(quote) {
  const headingEl = qs("#quoteAiHeading");
  const ledeEl = qs("#quoteAiLede");
  const badgesEl = qs("#quoteAiDeliveryBadges");
  const helpHead = qs("#quoteAiHelpSubhead");
  const youHead = qs("#quoteAiYouSubhead");
  const humanHead = qs("#quoteAiHumanSubhead");
  const helpUl = qs("#quoteAiHelpList");
  const youUl = qs("#quoteAiYouList");
  const humanUl = qs("#quoteAiHumanList");

  const modes = uniqueDeliveryModesFromQuote(quote);
  const content = buildQuoteSupportContent(modes);
  if (headingEl) headingEl.textContent = supportSectionTitle(content);
  if (ledeEl) ledeEl.textContent = supportSectionLede(content);
  if (helpHead) helpHead.textContent = supportAgentColumnHeading(content);
  if (youHead) {
    youHead.textContent = t("customer.quote.ai.what_you_do", "What you do directly");
  }
  if (humanHead) {
    humanHead.textContent = t("customer.quote.ai.when_human", "When to reach the team");
  }

  renderSupportDeliveryBadges(badgesEl, content.deliveryModeKeys);

  fillBulletList(helpUl, content.agentBulletIds.map(supportBulletText));
  fillBulletList(youUl, content.youBulletIds.map(supportBulletText));
  fillBulletList(humanUl, content.humanBulletIds.map(supportBulletText));
}

function surveySnapshotFromQuote(quote) {
  const rd = quote?.request_details && typeof quote.request_details === "object" ? quote.request_details : {};
  const survey = rd.survey_submission && typeof rd.survey_submission === "object" ? rd.survey_submission : {};
  return survey;
}

/**
 * @param {HTMLElement | null} ul
 * @param {string[]} items
 */
function fillRequestSummaryList(ul, items) {
  if (!ul) return;
  ul.innerHTML = "";
  for (const text of items) {
    const li = document.createElement("li");
    li.textContent = text;
    ul.appendChild(li);
  }
}

function renderRequestSummaryBlock(quote) {
  const titleEl = qs("#quoteRequestBlockTitle");
  const introEl = qs("#quoteRequestBlockIntro");
  const emptyEl = qs("#quoteRequestEmpty");
  const gridEl = qs("#quoteRequestGrid");
  const helpCard = qs("#quoteRequestHelpCard");
  const svcCard = qs("#quoteRequestServicesCard");
  const deliveryCard = qs("#quoteRequestDeliveryCard");
  const scheduleCard = qs("#quoteRequestScheduleCard");
  const helpUl = qs("#quoteRequestHelpAreas");
  const svcUl = qs("#quoteRequestServicesList");
  const deliveryUl = qs("#quoteRequestDeliveryList");
  const scheduleValue = qs("#quoteRequestScheduleValue");
  const understoodWrap = qs("#quoteRequestUnderstoodWrap");
  const understoodUl = qs("#quoteRequestUnderstoodList");
  const deliveryLabel = qs("#quoteRequestDeliveryLabel");
  const scheduleLabel = qs("#quoteRequestScheduleLabel");

  if (titleEl) titleEl.textContent = t("customer.quote.request_section.title", "Your request summary");
  if (introEl) {
    introEl.textContent = t(
      "customer.quote.request_section.intro",
      "Please confirm this quote matches what you requested."
    );
  }
  if (deliveryLabel) {
    deliveryLabel.textContent = t("customer.quote.request_section.delivery_modes", "Support options you chose");
  }
  if (scheduleLabel) {
    scheduleLabel.textContent = t(
      "customer.quote.request_section.schedule_region",
      "Start timing / preferred area"
    );
  }
  const understoodTitle = qs("#quoteRequestUnderstoodTitle");
  if (understoodTitle) {
    understoodTitle.textContent = t(
      "customer.quote.request_section.understood",
      "Additional answers from your request"
    );
  }

  const rows = buildRequestSummaryRows(quote);
  const hasRows = requestSummaryHasVisibleRows(rows);

  if (emptyEl) {
    emptyEl.innerHTML = "";
    if (!hasRows) {
      emptyEl.hidden = false;
      const p = document.createElement("p");
      p.textContent = t(
        "customer.quote.request_section.empty_all",
        "No request details were saved to display. If something looks wrong, message the team."
      );
      const link = document.createElement("a");
      link.href = buildQuoteMessagesHref(quote?.id);
      link.className = "lhai-quote-request-block__empty-link";
      link.textContent = t("customer.quote.hero.cta.ask", "Ask a question");
      emptyEl.appendChild(p);
      emptyEl.appendChild(link);
    } else {
      emptyEl.hidden = true;
    }
  }

  if (gridEl) gridEl.hidden = !hasRows;

  if (helpCard) helpCard.hidden = !rows.helpAreas.length;
  fillRequestSummaryList(helpUl, rows.helpAreas);

  if (svcCard) svcCard.hidden = !rows.services.length;
  fillRequestSummaryList(svcUl, rows.services);

  const deliveryLabels = rows.deliveryModeKeys.map((k) => deliveryModeCustomerLabel(k));
  if (deliveryCard) deliveryCard.hidden = !deliveryLabels.length;
  fillRequestSummaryList(deliveryUl, deliveryLabels);

  if (scheduleCard) scheduleCard.hidden = !rows.scheduleRegion;
  if (scheduleValue) scheduleValue.textContent = rows.scheduleRegion || "";

  if (understoodWrap && understoodUl) {
    if (!rows.understood.length) {
      understoodWrap.hidden = true;
      understoodUl.innerHTML = "";
    } else {
      understoodWrap.hidden = false;
      understoodUl.innerHTML = "";
      for (const row of rows.understood) {
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

function quoteCtaApproveLabel() {
  return t("customer.quote.hero.cta.approve", "Approve quote");
}

function quoteCtaRejectLabel() {
  return t("customer.quote.hero.cta.reject", "Decline quote");
}

function quoteCtaAskLabel() {
  return t("customer.quote.hero.cta.ask", "Ask a question");
}

function footerStatusMessageForQuote(quote) {
  const st = normalizeQuoteStatus(quote?.status);
  if (st === "APPROVED") {
    return t(
      "customer.quote.footer.status.approved",
      "This quote is approved. Please check your invoice and payment instructions."
    );
  }
  if (st === "REJECTED" || st === "EXPIRED") {
    return t("customer.quote.footer.status.rejected", "This quote was declined.");
  }
  if (st === "PAID") {
    return t(
      "customer.quote.footer.status.paid",
      "Payment is complete. Please check the next-step guidance."
    );
  }
  return "";
}

function heroStatusMessageForQuote(quote) {
  const st = normalizeQuoteStatus(quote?.status);
  if (st === "APPROVED") {
    return {
      show: true,
      className: "lhai-quote-hero__status-message lhai-quote-hero__status-message--approved",
      text: t(
        "customer.quote.footer.status.approved",
        "This quote is approved. Please check your invoice and payment instructions."
      ),
    };
  }
  if (st === "REJECTED" || st === "EXPIRED") {
    return {
      show: true,
      className: "lhai-quote-hero__status-message lhai-quote-hero__status-message--rejected",
      text: t("customer.quote.footer.status.rejected", "This quote was declined."),
    };
  }
  if (st === "PAID") {
    return {
      show: true,
      className: "lhai-quote-hero__status-message lhai-quote-hero__status-message--paid",
      text: t(
        "customer.quote.footer.status.paid",
        "Payment is complete. Please check the next-step guidance."
      ),
    };
  }
  return { show: false, className: "lhai-quote-hero__status-message", text: "" };
}

function renderQuoteHeroActions(quote) {
  const st = normalizeQuoteStatus(quote?.status);
  const allowDecision = st === "PROPOSED";
  const actionsWrap = qs("#quoteHeroActions");
  const footerGroup = qs("#quoteFooterCtaGroup");
  const footerStatusEl = qs("#quoteFooterStatusMessage");
  const footerStatusText = footerStatusMessageForQuote(quote);
  const statusMsgEl = qs("#quoteHeroStatusMessage");
  const statusMsg = heroStatusMessageForQuote(quote);
  const messagesHref = buildQuoteMessagesHref(quote?.id);

  if (actionsWrap) {
    actionsWrap.setAttribute("aria-label", t("customer.quote.hero.actions_group", "Decide on this quote"));
    actionsWrap.hidden = !allowDecision;
  }
  if (footerGroup) {
    footerGroup.hidden = !allowDecision;
    footerGroup.setAttribute("aria-label", t("customer.quote.hero.actions_group", "Decide on this quote"));
  }
  if (footerStatusEl) {
    if (allowDecision || !footerStatusText) {
      footerStatusEl.hidden = true;
      footerStatusEl.textContent = "";
    } else {
      footerStatusEl.hidden = false;
      footerStatusEl.textContent = footerStatusText;
    }
  }

  for (const approveBtn of quoteApproveButtons()) {
    delete approveBtn.dataset.lhaiLabelSaved;
    approveBtn.setAttribute("aria-busy", "false");
    approveBtn.textContent = quoteCtaApproveLabel();
    approveBtn.disabled = !allowDecision;
  }
  for (const rejectBtn of quoteRejectButtons()) {
    delete rejectBtn.dataset.lhaiLabelSaved;
    rejectBtn.setAttribute("aria-busy", "false");
    rejectBtn.textContent = quoteCtaRejectLabel();
    rejectBtn.disabled = !allowDecision;
  }
  for (const askLink of quoteAskLinks()) {
    askLink.textContent = quoteCtaAskLabel();
    askLink.href = messagesHref;
    askLink.hidden = false;
  }
  if (statusMsgEl) {
    if (statusMsg.show) {
      statusMsgEl.hidden = false;
      statusMsgEl.className = statusMsg.className;
      statusMsgEl.textContent = statusMsg.text;
    } else {
      statusMsgEl.hidden = true;
      statusMsgEl.textContent = "";
      statusMsgEl.className = "lhai-quote-hero__status-message";
    }
  }
}

function renderQuoteHero(quote) {
  const titleEl = qs("#quoteHeroTitle");
  const subEl = qs("#quoteHeroSubtitle");
  const statusEl = qs("#quoteHeroStatus");
  const scopeNoteEl = qs("#quoteHeroScopeNote");
  const svcLabel = qs("#quoteHeroServiceLabel");
  const svcName = qs("#quoteHeroServiceName");
  const costLabel = qs("#quoteHeroCostLabel");
  const costEl = qs("#quoteHeroEstimatedCost");
  const costBreakdown = qs("#quoteHeroCostBreakdown");
  const costNote = qs("#quoteHeroCostNote");
  const costDemoPill = qs("#quoteCostDemoPill");

  if (titleEl) titleEl.textContent = t("customer.quote.hero.title", "Your quote is ready");
  if (subEl) subEl.textContent = t("customer.quote.hero.subtitle", "Please review the proposal for your requested service.");
  if (scopeNoteEl) {
    scopeNoteEl.textContent = t(
      "customer.quote.hero.scope_note",
      "This amount includes the quote line items below and guided support from Landing Help AI."
    );
  }
  if (svcLabel) svcLabel.textContent = t("customer.quote.hero.service_summary_label", "Service summary");
  if (costLabel) costLabel.textContent = t("customer.quote.cost.primary_label", "Proposed total");
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
      "customer.quote.hero.cost_note",
      "Review the line items and what is included or not included below, then approve if you accept this proposal."
    );
  }
  if (costDemoPill) {
    costDemoPill.hidden = quote.mocked !== true;
  }

  if (statusEl) {
    statusEl.textContent = customerFacingStatusLabel(quote.status);
    statusEl.className = `${statusBadgeClass(quote.status)} lhai-quote-hero__badge`;
  }

}

function pricingServiceShortDescription(deliveryModeKey) {
  const key = deliveryModeKey || "general";
  const fallbacks = {
    ai_guide: "Step-by-step guidance and checklists in the app for this service.",
    in_person: "Includes coordinated human support where your package requires it.",
    ai_plus_human: "Starts in the app; a person can step in when needed.",
    general: "Plain-language guidance through the steps for this service.",
  };
  return t(`customer.quote.pricing.service_desc.${key}`, fallbacks[key] || fallbacks.general);
}

function pricingAdjustmentCopy(adjustmentLine) {
  if (!adjustmentLine) return { title: "", description: "" };
  if (adjustmentLine.kind === "discount") {
    return {
      title: t("customer.quote.pricing.adjustment.discount_title", "Discount"),
      description: t(
        "customer.quote.pricing.adjustment.discount_desc",
        "A discount was applied to your proposed total."
      ),
    };
  }
  if (adjustmentLine.matchesAdminFee) {
    return {
      title: t("customer.quote.pricing.adjustment.support_title", "Custom progress support fee"),
      description: t(
        "customer.quote.pricing.adjustment.support_desc",
        "Additional guidance and progress management tailored to your request scope."
      ),
    };
  }
  return {
    title: t("customer.quote.pricing.adjustment.extra_title", "Custom progress support fee"),
    description: t(
      "customer.quote.pricing.adjustment.extra_desc",
      "Covers extra guidance or scope adjustments beyond the listed service prices."
    ),
  };
}

/**
 * @param {HTMLElement | null} listEl
 * @param {string} title
 * @param {string} deliveryLabel
 * @param {string} description
 * @param {string} amountText
 * @param {string} [rowModifier]
 */
function appendQuotePricingRow(listEl, title, deliveryLabel, description, amountText, rowModifier = "") {
  if (!listEl) return;
  const article = document.createElement("article");
  article.className = rowModifier
    ? `lhai-quote-pricing__row ${rowModifier}`
    : "lhai-quote-pricing__row";

  const main = document.createElement("div");
  main.className = "lhai-quote-pricing__row-main";

  const h3 = document.createElement("h3");
  h3.className = "lhai-quote-pricing__row-title";
  h3.textContent = title;
  main.appendChild(h3);

  if (deliveryLabel) {
    const delivery = document.createElement("p");
    delivery.className = "lhai-quote-pricing__row-delivery";
    delivery.textContent = deliveryLabel;
    main.appendChild(delivery);
  }

  if (description) {
    const desc = document.createElement("p");
    desc.className = "lhai-quote-pricing__row-desc";
    desc.textContent = description;
    main.appendChild(desc);
  }

  const amount = document.createElement("p");
  amount.className = "lhai-quote-pricing__row-amount";
  amount.textContent = amountText;

  article.appendChild(main);
  article.appendChild(amount);
  listEl.appendChild(article);
}

function renderQuotePricingSection(quote) {
  const titleEl = qs("#quotePricingTitle");
  const ledeEl = qs("#quotePricingLede");
  const emptyEl = qs("#quotePricingEmpty");
  const listEl = qs("#quotePricingList");
  const footerEl = qs("#quotePricingFooter");
  const subtotalAmount = qs("#quotePricingServiceSubtotalAmount");
  const finalAmount = qs("#quotePricingFinalTotalAmount");
  const adjustmentNote = qs("#quotePricingAdjustmentNote");
  const heroCostBreakdown = qs("#quoteHeroCostBreakdown");

  if (titleEl) titleEl.textContent = t("customer.quote.pricing.title", "Quote line items");
  if (ledeEl) {
    ledeEl.textContent = t(
      "customer.quote.pricing.lede",
      "Each service in your proposal and how it contributes to the total."
    );
  }
  const subtotalLabel = qs("#quotePricingServiceSubtotalLabel");
  if (subtotalLabel) {
    subtotalLabel.textContent = t("customer.quote.pricing.service_subtotal", "Service items subtotal");
  }
  const finalLabel = qs("#quotePricingFinalTotalLabel");
  if (finalLabel) {
    finalLabel.textContent = t("customer.quote.pricing.final_total", "Proposed total");
  }
  const finalHint = qs("#quotePricingFinalHint");
  if (finalHint) {
    finalHint.textContent = t(
      "customer.quote.pricing.final_hint",
      "This is the final amount the team is asking you to approve."
    );
  }

  const breakdown = buildQuotePricingBreakdown(quote);
  const { currency } = breakdown;

  if (emptyEl) {
    emptyEl.innerHTML = "";
    if (breakdown.empty) {
      emptyEl.hidden = false;
      const p = document.createElement("p");
      p.textContent = t(
        "customer.quote.pricing.empty",
        "There are no line items to show. Please contact us through your message inbox."
      );
      const link = document.createElement("a");
      link.href = buildQuoteMessagesHref(quote?.id);
      link.className = "lhai-quote-pricing__empty-link";
      link.textContent = t("customer.quote.hero.cta.ask", "Ask a question");
      emptyEl.appendChild(p);
      emptyEl.appendChild(link);
    } else {
      emptyEl.hidden = true;
    }
  }

  if (listEl) {
    listEl.innerHTML = "";
    if (!breakdown.empty) {
      listEl.hidden = false;
      for (const line of breakdown.serviceLines) {
        appendQuotePricingRow(
          listEl,
          line.title,
          deliveryModeCustomerLabel(line.deliveryModeKey),
          pricingServiceShortDescription(line.deliveryModeKey),
          formatMoney(line.amount, currency)
        );
      }
      if (breakdown.adjustmentLine) {
        const adj = pricingAdjustmentCopy(breakdown.adjustmentLine);
        const modifier =
          breakdown.adjustmentLine.kind === "discount"
            ? "lhai-quote-pricing__row--discount"
            : "lhai-quote-pricing__row--adjustment";
        const amountPrefix = breakdown.adjustmentLine.kind === "discount" ? "−" : "";
        appendQuotePricingRow(
          listEl,
          adj.title,
          "",
          adj.description,
          `${amountPrefix}${formatMoney(breakdown.adjustmentLine.amount, currency)}`,
          modifier
        );
      }
    } else {
      listEl.hidden = true;
    }
  }

  if (footerEl) {
    footerEl.hidden = breakdown.empty;
  }
  if (subtotalAmount && !breakdown.empty) {
    subtotalAmount.textContent = formatMoney(breakdown.serviceSubtotal, currency);
  }
  if (finalAmount && !breakdown.empty) {
    finalAmount.textContent = formatMoney(breakdown.estimatedTotal, currency);
  }

  if (adjustmentNote) {
    if (breakdown.showAdjustmentNote) {
      adjustmentNote.hidden = false;
      adjustmentNote.textContent = t(
        "customer.quote.pricing.adjustment_note",
        "When the service subtotal and final proposed total differ, the difference is shown as a custom support fee or discount adjustment above."
      );
    } else {
      adjustmentNote.hidden = true;
      adjustmentNote.textContent = "";
    }
  }

  if (heroCostBreakdown && !breakdown.empty) {
    heroCostBreakdown.hidden = true;
    heroCostBreakdown.textContent = "";
  }
}

const QUOTE_SCOPE_INCLUDED_FALLBACKS = {
  agent_steps: "Step-by-step guidance from Landing Help AI Agent",
  checklist: "Checklists and preparation lists for what you need",
  next_steps: "Clear order of what to do next as your case moves forward",
  messages: "Question support through your message inbox",
  info_organization: "Information organized to match your requested scope",
};

const QUOTE_SCOPE_EXCLUDED_FALLBACKS = {
  carrier_fees: "Actual carrier plan charges or activation fees",
  car_purchase_cost: "The actual purchase price of a vehicle",
  insurance_tax_registration: "Insurance premiums, sales tax, and registration fees",
  legal_contract: "Signing legal contracts on your behalf",
  account_payment: "Creating accounts or making payments for you",
  third_party_outcomes: "Guarantees on government, dealer, or carrier decisions",
  third_party_fees_general:
    "Fees paid directly to carriers, dealers, government offices, or other third parties",
};

function scopeItemLabel(kind, id) {
  const fallbacks =
    kind === "included" ? QUOTE_SCOPE_INCLUDED_FALLBACKS : QUOTE_SCOPE_EXCLUDED_FALLBACKS;
  return t(`customer.quote.scope.${kind}.${id}`, fallbacks[id] || id);
}

/**
 * @param {HTMLElement | null} ul
 * @param {Array<{ id: string, emphasis?: boolean }>} items
 * @param {"included" | "excluded"} kind
 */
function fillQuoteScopeList(ul, items, kind) {
  if (!ul) return;
  ul.innerHTML = "";
  for (const item of items) {
    const li = document.createElement("li");
    if (item.emphasis) li.classList.add("lhai-quote-scope__list-item--emphasis");
    li.textContent = scopeItemLabel(kind, item.id);
    ul.appendChild(li);
  }
}

function renderQuoteScopeSection(quote) {
  const titleEl = qs("#quoteScopeTitle");
  const ledeEl = qs("#quoteScopeLede");
  const asideEl = qs("#quoteScopeAside");
  const includedTitle = qs("#quoteScopeIncludedTitle");
  const excludedTitle = qs("#quoteScopeExcludedTitle");
  const includedList = qs("#quoteScopeIncludedList");
  const excludedList = qs("#quoteScopeExcludedList");

  if (titleEl) titleEl.textContent = t("customer.quote.scope.title", "What is included");
  if (ledeEl) {
    ledeEl.textContent = t(
      "customer.quote.scope.lede",
      "A clear view of what this quote covers and what stays with you to decide or pay separately."
    );
  }
  if (asideEl) {
    asideEl.textContent = t(
      "customer.quote.scope.aside",
      "The items on the right are costs you pay or confirm directly—they are not hidden inside your quote total."
    );
  }
  if (includedTitle) {
    includedTitle.textContent = t("customer.quote.scope.included_title", "Included in this quote");
  }
  if (excludedTitle) {
    excludedTitle.textContent = t("customer.quote.scope.excluded_title", "Not included in this quote");
  }

  const content = buildQuoteScopeContentFromQuote(quote);
  fillQuoteScopeList(includedList, content.included, "included");
  fillQuoteScopeList(excludedList, content.excluded, "excluded");
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
  const st = normalizeQuoteStatus(quote?.status);
  if (st === "PROPOSED") {
    return [
      t(
        "customer.quote.whats_next.step_confirm_scope",
        "Review the quote line items and what is included or not included."
      ),
      t(
        "customer.quote.whats_next.step_ask",
        "If you have questions, tap Ask a question and leave a message."
      ),
      t(
        "customer.quote.whats_next.step_approve",
        "When everything looks right, tap Approve quote."
      ),
      t(
        "customer.quote.whats_next.step_invoice",
        "After approval, an invoice is created and payment instructions are sent to your email and message inbox."
      ),
      t(
        "customer.quote.whats_next.step_after_payment",
        "After payment, Agent guidance and the next steps begin."
      ),
    ];
  }
  if (st === "APPROVED") {
    return [
      t(
        "customer.quote.whats_next.approved_pay",
        "Open the invoice link from your messages or email, confirm the amount and due date, then complete payment."
      ),
      t(
        "customer.quote.whats_next.approved_workflow",
        "After payment is confirmed, Agent guidance and your next steps begin from your dashboard and messages."
      ),
    ];
  }
  if (st === "PAID") {
    return [
      t(
        "customer.quote.whats_next.paid_continue",
        "Check your dashboard and message inbox for Agent guidance and the next tasks."
      ),
      t(
        "customer.quote.whats_next.paid_help",
        "Reply in messages if anything about the next steps is unclear."
      ),
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

function renderWhatsNextSection(quote) {
  const headingEl = qs("#quoteWhatsNextHeading");
  const ledeEl = qs("#quoteWhatsNextLede");
  const ol = qs("#quoteWhatsNextSteps");
  if (headingEl) {
    headingEl.textContent = t("customer.quote.whats_next.title", "Next steps");
  }
  if (ledeEl) {
    ledeEl.textContent = t(
      "customer.quote.whats_next.lede",
      "After you review this quote and approve it, an invoice and payment instructions will be sent to you."
    );
  }
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
  setQuoteDecisionButtonsBusy(false, "approve");
  renderQuoteHero(quote);
  renderQuotePricingSection(quote);
  renderQuoteScopeSection(quote);
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

  renderQuoteHeroActions(quote);

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
  window.addEventListener("beforeunload", () => {
    stopPostApprovalMessageBoostPolling();
  });

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
    const st0 = normalizeQuoteStatus(quote.status);
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

  async function runApproveQuoteDecision() {
    if (!canCustomerDecideOnQuote(quote?.status) || quoteDecisionInFlight) return;
    closeQuoteDecisionModals();
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
        await startPostApprovalMessageBoostPolling();
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
      await startPostApprovalMessageBoostPolling();
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
      setQuoteDecisionButtonsBusy(false, "approve");
      renderQuote(quote);
    }
  }

  async function runRejectQuoteDecision(rejectNote = "Rejected by customer") {
    if (!canCustomerDecideOnQuote(quote?.status) || quoteDecisionInFlight) return;
    closeQuoteDecisionModals();
    const transitionNote =
      typeof rejectNote === "string" && rejectNote.trim()
        ? rejectNote.trim()
        : buildRejectTransitionNote("");
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
      const transition = await quoteApi.transition(quote.id, "REJECTED", transitionNote);
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
      setQuoteDecisionButtonsBusy(false, "reject");
      renderQuote(quote);
    }
  }

  wireQuoteDecisionModals(
    () => quote,
    () => runApproveQuoteDecision(),
    (note) => runRejectQuoteDecision(note)
  );

  for (const id of QUOTE_APPROVE_BTN_IDS) {
    document.getElementById(id)?.addEventListener("click", (ev) => {
      openApproveConfirmModal(quote, ev.currentTarget);
    });
  }
  for (const id of QUOTE_REJECT_BTN_IDS) {
    document.getElementById(id)?.addEventListener("click", (ev) => {
      openRejectConfirmModal(quote, ev.currentTarget);
    });
  }

}

void initQuoteDetailPage().catch((err) => {
  console.error("[lhai] quote-detail init failed:", err);
});

export { initQuoteDetailPage };
