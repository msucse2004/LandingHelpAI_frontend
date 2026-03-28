import { formatDate } from "../core/utils.js";

/**
 * Timeline item shape:
 * { id: string, title: string, dueDate: string, status: "done"|"in_progress"|"pending" }
 */
function renderTimeline(items = [], targetSelector = "[data-timeline]") {
  const target = document.querySelector(targetSelector);
  if (!target) return;

  if (!items.length) {
    target.innerHTML = "<div class='lhai-state lhai-state--empty'>No timeline items yet.</div>";
    return;
  }

  target.innerHTML = `
    <ul class="lhai-list">
      ${items
        .map(
          (item) => `
        <li class="lhai-list__item">
          <strong>${item.title}</strong><br />
          <span class="u-text-muted">${formatDate(item.dueDate)} - ${item.status}</span>
        </li>`
        )
        .join("")}
    </ul>
  `;
}

export { renderTimeline };
