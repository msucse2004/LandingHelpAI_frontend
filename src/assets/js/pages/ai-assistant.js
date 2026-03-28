import { ensureCustomerAccess, protectCurrentPage } from "../core/guards.js";
import { aiApi } from "../core/api.js";
import { getSession } from "../core/auth.js";
import { safeText } from "../core/utils.js";

const conversation = [];

function renderConversation() {
  const target = document.querySelector("#aiConversation");
  if (!target) return;
  if (!conversation.length) {
    target.innerHTML = `<div class="lhai-state lhai-state--empty">질문을 입력하면 제한형 AI 답변이 여기에 표시됩니다.</div>`;
    return;
  }
  target.innerHTML = conversation
    .map(
      (item) => `
      <article class="lhai-ai-msg ${item.role === "assistant" ? "lhai-ai-msg--assistant" : ""}">
        <strong>${item.role === "assistant" ? "Assistant" : "You"}</strong>
        <p>${safeText(item.text)}</p>
      </article>
    `
    )
    .join("");
}

function renderTrustIndicators(contract) {
  const target = document.querySelector("#aiTrustIndicators");
  if (!target || !contract) return;
  target.innerHTML = `
    <span class="lhai-badge">${contract.internal_guide_based ? "Internal guide based" : "General guidance"}</span>
    <span class="lhai-badge">${contract.web_verified ? "Web verified (support only)" : "Web not verified"}</span>
    <span class="lhai-badge ${contract.review_needed ? "lhai-badge--warning" : "lhai-badge--success"}">${contract.review_needed ? "Review needed" : "Review not needed"}</span>
    <span class="lhai-badge">Scope: ${safeText(contract.allowed_scope || "-")}</span>
  `;
}

async function initAiAssistantPage() {
  if (!protectCurrentPage()) return;
  if (!ensureCustomerAccess()) return;
  const session = getSession();
  const userId = session?.userId || "mock-user-1";
  const customerProfileId = "profile::demo@customer.com";
  const entryDate = "2026-04-15";

  const windowStatus = await aiApi.getContextWindow(entryDate);
  const windowText = windowStatus.available
    ? `AI available. ${windowStatus.reason} (${windowStatus.allowed_from} ~ ${windowStatus.allowed_until})`
    : `AI limited. ${windowStatus.reason} (${windowStatus.allowed_from} ~ ${windowStatus.allowed_until})`;
  const scopeWindow = document.querySelector("#aiScopeWindow");
  if (scopeWindow) scopeWindow.textContent = windowText;

  const history = await aiApi.listInteractions(customerProfileId);
  history
    .slice()
    .reverse()
    .forEach((item) => {
      conversation.push({ role: "user", text: item.prompt });
      conversation.push({ role: "assistant", text: item.answer });
    });
  renderConversation();

  document.querySelector("#aiQuestionForm")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const input = document.querySelector("#aiQuestionInput");
    if (!(input instanceof HTMLTextAreaElement)) return;
    const prompt = input.value.trim();
    if (!prompt) return;

    conversation.push({ role: "user", text: prompt });
    renderConversation();
    input.value = "";

    const response = await aiApi.ask({
      customer_profile_id: customerProfileId,
      user_id: userId,
      prompt,
      requested_service: "Starter Landing Package",
      purchased_service: "Starter Landing Package",
      workflow_stage: "DOCUMENT_REVIEW",
      entry_date: entryDate,
    });
    conversation.push({ role: "assistant", text: response.answer });
    renderConversation();
    renderTrustIndicators(response);
  });

  document.querySelector("#escalateAskAdminBtn")?.addEventListener("click", () => {
    const status = document.querySelector("#aiEscalationStatus");
    if (status) status.textContent = "Admin escalation request recorded (stub).";
  });

  document.querySelector("#escalateInPersonBtn")?.addEventListener("click", () => {
    const status = document.querySelector("#aiEscalationStatus");
    if (status) status.textContent = "In-person help request recorded (stub).";
  });
}

export { initAiAssistantPage };

initAiAssistantPage();
