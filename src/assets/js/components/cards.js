import { formatMoney, safeText } from "../core/utils.js";

/**
 * Card metric shape:
 * { label: string, value: string|number, kind?: "money"|"text" }
 */
function renderMetricCards(metrics = [], targetSelector = "[data-cards]") {
  const target = document.querySelector(targetSelector);
  if (!target) return;

  target.innerHTML = metrics
    .map((metric) => {
      const value = metric.kind === "money" ? formatMoney(Number(metric.value || 0)) : safeText(metric.value);
      return `
        <article class="lhai-card">
          <h3 class="lhai-card__title">${metric.label}</h3>
          <p>${value}</p>
        </article>
      `;
    })
    .join("");
}

export { renderMetricCards };
