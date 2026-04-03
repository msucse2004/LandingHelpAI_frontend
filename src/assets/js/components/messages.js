import { formatDate } from "../core/utils.js";

/**
 * Message thread shape:
 * { id: string, subject: string, participants: string[], lastMessageAt: string }
 */
function renderThreads(threads = [], targetSelector = "[data-message-threads]") {
  const target = document.querySelector(targetSelector);
  if (!target) return;

  if (!threads.length) {
    target.innerHTML = "<div class='lhai-state lhai-state--empty'>메시지 스레드가 없습니다.</div>";
    return;
  }

  target.innerHTML = `
    <ul class="lhai-list">
      ${threads
        .map(
          (thread) => `
        <li class="lhai-list__item">
          <strong>${thread.subject}</strong><br />
          <span class="u-text-muted">${thread.participants.join(", ")} - ${formatDate(thread.lastMessageAt)}</span>
        </li>`
        )
        .join("")}
    </ul>
  `;
}

export { renderThreads };
