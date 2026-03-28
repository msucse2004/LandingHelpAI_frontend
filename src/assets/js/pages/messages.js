import { messagesApi } from "../core/api.js";
import { ensureCustomerAccess, protectCurrentPage } from "../core/guards.js";
import { formatDate, safeText } from "../core/utils.js";

let selectedMessageId = "";

function renderMessageList(messages = []) {
  const container = document.querySelector("#messageListContainer");
  if (!container) return;
  if (!messages.length) {
    container.innerHTML = `<div class="lhai-state lhai-state--empty">No messages found.</div>`;
    return;
  }
  container.innerHTML = messages
    .map(
      (message) => `
      <article class="lhai-message-item ${message.unread ? "is-unread" : ""} ${selectedMessageId === message.id ? "is-active" : ""}" data-message-id="${message.id}">
        <div class="lhai-message-item__meta">
          <span class="lhai-badge">${safeText(message.message_type)}</span>
          <span class="u-text-muted">${formatDate(message.created_at)}</span>
        </div>
        <h3>${safeText(message.title)}</h3>
        <p class="u-text-muted">${safeText(message.body)}</p>
      </article>
    `
    )
    .join("");
}

function renderMessageDetail(message) {
  const container = document.querySelector("#messageDetailContainer");
  if (!container) return;
  if (!message) {
    container.className = "lhai-message-detail lhai-state lhai-state--empty";
    container.textContent = "Select a message from the list.";
    return;
  }
  container.className = "lhai-message-detail";
  container.innerHTML = `
    <div class="u-mb-2"><span class="lhai-badge">${safeText(message.message_type)}</span> <span class="u-text-muted">${formatDate(message.created_at)}</span></div>
    <h3 class="u-mb-2">${safeText(message.title)}</h3>
    <p class="u-mb-3">${safeText(message.body)}</p>
    <p class="u-text-muted">Event: ${safeText(message.event_code || "-")}</p>
    <button class="lhai-button lhai-button--secondary u-mt-3" id="markAsReadBtn" ${message.unread ? "" : "disabled"}>
      ${message.unread ? "Mark as read" : "Already read"}
    </button>
  `;
}

async function initMessagesPage() {
  if (!protectCurrentPage()) return;
  if (!ensureCustomerAccess()) return;
  const categoryFilter = document.querySelector("#messageCategoryFilter");
  const unreadOnlyFilter = document.querySelector("#messageUnreadOnly");

  const refresh = async () => {
    const messages = await messagesApi.list({
      category: categoryFilter?.value || "",
      unreadOnly: Boolean(unreadOnlyFilter?.checked),
    });
    if (!selectedMessageId && messages.length) selectedMessageId = messages[0].id;
    const selected = messages.find((message) => message.id === selectedMessageId) || null;
    renderMessageList(messages);
    renderMessageDetail(selected);
  };

  categoryFilter?.addEventListener("change", refresh);
  unreadOnlyFilter?.addEventListener("change", refresh);

  document.querySelector("#messageListContainer")?.addEventListener("click", (event) => {
    const target = event.target.closest("[data-message-id]");
    if (!target) return;
    selectedMessageId = target.getAttribute("data-message-id") || "";
    refresh();
  });

  document.querySelector("#messageDetailContainer")?.addEventListener("click", async (event) => {
    if (!(event.target instanceof HTMLElement) || event.target.id !== "markAsReadBtn" || !selectedMessageId) return;
    await messagesApi.markRead(selectedMessageId, true);
    await refresh();
  });

  await refresh();
}

export { initMessagesPage };

initMessagesPage();
