import { documentsApi, quoteApi } from "../core/api.js";
import { ensureCustomerAccess, protectCurrentPage } from "../core/guards.js";
import { patchState } from "../core/state.js";
import { loadSidebar } from "../components/sidebar.js";
import { applyI18nToDom } from "../core/i18n-dom.js";
import { formatMoney } from "../core/utils.js";

function qs(selector) {
  return document.querySelector(selector);
}

function setStatus(message) {
  const status = qs("#quoteActionStatus");
  if (status) status.textContent = message;
}

function renderList(targetSelector, values) {
  const target = qs(targetSelector);
  if (!target) return;
  if (!values || !values.length) {
    target.innerHTML = "<li>-</li>";
    return;
  }
  target.innerHTML = values.map((value) => `<li>${value}</li>`).join("");
}

function statusBadgeClass(status) {
  if (status === "APPROVED") return "lhai-badge lhai-badge--risk-low";
  if (status === "REJECTED" || status === "EXPIRED") return "lhai-badge lhai-badge--risk-high";
  if (status === "PROPOSED") return "lhai-badge lhai-badge--risk-medium";
  return "lhai-badge";
}

function buildRequestSummary(quote) {
  const rd = quote && quote.request_details && typeof quote.request_details === "object" ? quote.request_details : {};
  const survey = rd && rd.survey_submission && typeof rd.survey_submission === "object" ? rd.survey_submission : {};
  const common = survey && survey.common_info && typeof survey.common_info === "object" ? survey.common_info : {};

  const first = common.profile_first_name ? String(common.profile_first_name).trim() : "";
  const last = common.profile_last_name ? String(common.profile_last_name).trim() : "";
  const email = common.profile_email ? String(common.profile_email).trim() : "";
  const name = [first, last].filter(Boolean).join(" ").trim();

  const cats = Array.isArray(survey.selected_categories) ? survey.selected_categories : [];
  const catTitles = cats
    .map((c) => {
      if (!c || typeof c !== "object") return "";
      return (c.title || c.id || "").toString().trim();
    })
    .filter(Boolean);

  const selectedServices = Array.isArray(survey.selected_services) ? survey.selected_services : [];
  const serviceTitles = selectedServices
    .map((s) => {
      if (!s || typeof s !== "object") return "";
      const t = (s.title || s.id || "").toString().trim();
      const delivery = s.delivery_mode ? String(s.delivery_mode).trim() : "";
      return delivery ? `${t} (${delivery})` : t;
    })
    .filter(Boolean);

  const parts = [];
  const requestLabel = quote.title ? String(quote.title).trim() : quote.service_name ? String(quote.service_name).trim() : "";
  if (requestLabel) parts.push(`요청: ${requestLabel}`);
  if (catTitles.length) parts.push(`선택 영역: ${catTitles.join(", ")}`);
  if (serviceTitles.length) parts.push(`선택 서비스: ${serviceTitles.join(", ")}`);
  if (name || email) parts.push(`요청자: ${name || "—"}${email ? ` (${email})` : ""}`);
  return parts.length ? parts.join(" · ") : "요청 정보가 없습니다.";
}

function renderQuote(quote) {
  qs("#quoteId").textContent = quote.id || "-";
  const titleEl = qs("#quoteTitle");
  if (titleEl) {
    titleEl.textContent = quote.title ? String(quote.title) : quote.service_name ? String(quote.service_name) : "-";
  }
  const statusEl = qs("#quoteStatus");
  statusEl.textContent = quote.status || "-";
  statusEl.className = statusBadgeClass(quote.status);
  qs("#quoteServiceName").textContent = quote.service_name || quote.request_details?.service_id || "-";
  qs("#quoteEstimatedCost").textContent = formatMoney(Number(quote.estimated_cost || 0), quote.currency || "USD");
  qs("#quoteAiSupportScope").textContent = quote.ai_support_scope || "-";
  qs("#quoteNextStepGuidance").textContent = quote.next_step_guidance || "-";

  const req = qs("#quoteRequestSummary");
  if (req) req.textContent = buildRequestSummary(quote);

  const noteSection = qs("#quoteCustomerNoteSection");
  const noteEl = qs("#quoteCustomerNote");
  const note = (quote.customer_facing_note || "").toString().trim();
  if (noteSection && noteEl) {
    noteSection.hidden = !note;
    noteEl.textContent = note || "";
  }

  renderList("#quoteIncludedItems", quote.included_items);
  renderList("#quoteExcludedItems", quote.excluded_items);
  renderList("#quotePossibleExtraCosts", quote.possible_extra_costs);

  const allowDecision = quote.status === "PROPOSED";
  qs("#approveQuoteBtn").disabled = !allowDecision;
  qs("#rejectQuoteBtn").disabled = !allowDecision;
  qs("#requestHelpBtn").disabled = !allowDecision;
}

async function loadProposedQuotePdfIfExists(quote) {
  const section = qs("#quotePdfSection");
  const link = qs("#quotePdfDownloadLink");
  if (!section || !link) return;

  // Only Proposed quotes have PDF artifacts in this workflow.
  if (!quote || quote.status !== "PROPOSED") {
    section.hidden = true;
    return;
  }

  const customerProfileId = quote.customer_profile_id || "";
  if (!customerProfileId) return;

  try {
    const docs = await documentsApi.list(customerProfileId);
    const list = Array.isArray(docs) ? docs : [];
    const qid = String(quote.id || "").trim();

    const match = list.find((d) => {
      if (!d || typeof d !== "object") return false;
      const typeOk = d.document_type === "quote_proposed_pdfs";
      if (!typeOk) return false;
      const name = String(d.name || "");
      const fileUrl = String(d.file_url || "");
      return (qid && name.includes(qid)) || (qid && fileUrl.includes(qid));
    });

    if (match && match.file_url) {
      section.hidden = false;
      link.href = match.file_url;
    }
  } catch {
    // If document center is not available, keep section hidden.
    section.hidden = true;
  }
}

async function initQuoteDetailPage() {
  if (!protectCurrentPage()) return;
  if (!ensureCustomerAccess()) return;
  await loadSidebar("#sidebar", "customer");
  applyI18nToDom(document);
  const params = new URLSearchParams(window.location.search);
  const quoteIdFromUrl =
    (params.get("quote_id") || params.get("quoteId") || params.get("id") || params.get("qid") || params.get("pending_quote_id") || "").trim();
  const quoteIdFromStore = window.localStorage.getItem("lhai_latest_quote_id") || "";
  const quoteId = quoteIdFromUrl || quoteIdFromStore || "q-demo-1";
  try {
    const quote = await quoteApi.getDetail(quoteId);
    patchState({ quote });
    renderQuote(quote);
    if (quote && quote.id) window.localStorage.setItem("lhai_latest_quote_id", quote.id);
    qs("#quoteLoadingState").style.display = "none";
    qs("#quoteContent").style.display = "block";
    setStatus(quote.status === "PROPOSED" ? "이 견적은 운영팀이 제안(Propose)한 상태입니다. 승인/거절을 선택해 주세요." : "운영팀이 제안(Propose)하면 이 화면에서 확인할 수 있어요.");

    await loadProposedQuotePdfIfExists(quote);

    qs("#approveQuoteBtn")?.addEventListener("click", async () => {
      const transition = await quoteApi.transition(quote.id, "APPROVED", "Approved by customer");
      setStatus(transition.message || "Quote approved.");
      const refreshed = await quoteApi.getDetail(quote.id);
      renderQuote(refreshed);
    });

    qs("#rejectQuoteBtn")?.addEventListener("click", async () => {
      const transition = await quoteApi.transition(quote.id, "REJECTED", "Rejected by customer");
      setStatus(transition.message || "Quote rejected.");
      const refreshed = await quoteApi.getDetail(quote.id);
      renderQuote(refreshed);
    });

    qs("#requestHelpBtn")?.addEventListener("click", () => {
      // Stub: dedicated help flow to be connected to messages endpoint.
      setStatus("도움 요청을 남겼습니다. 운영팀이 곧 안내드릴게요. (stub)");
    });
  } catch {
    qs("#quoteLoadingState").style.display = "none";
    qs("#quoteEmptyState").style.display = "block";
    setStatus("견적을 불러오지 못했습니다.");
  }
}

initQuoteDetailPage();

export { initQuoteDetailPage };
