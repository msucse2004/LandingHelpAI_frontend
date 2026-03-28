/**
 * Checklist item shape:
 * { id: string, label: string, done: boolean, required: boolean }
 */
function renderChecklist(items = [], targetSelector = "[data-checklist]") {
  const target = document.querySelector(targetSelector);
  if (!target) return;

  if (!items.length) {
    target.innerHTML = "<div class='lhai-state lhai-state--empty'>No checklist items yet.</div>";
    return;
  }

  target.innerHTML = `
    <ul class="lhai-list">
      ${items
        .map(
          (item) => `
        <li class="lhai-list__item">
          <input type="checkbox" ${item.done ? "checked" : ""} disabled />
          <span>${item.label}</span>
          ${item.required ? "<span class='lhai-badge lhai-badge--risk-medium'>Required</span>" : ""}
        </li>`
        )
        .join("")}
    </ul>
  `;
}

export { renderChecklist };
