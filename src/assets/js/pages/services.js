import { serviceCatalogApi } from "../core/api.js";
import { t } from "../core/i18n-client.js";
import { initCommonI18nAndApplyDom } from "../core/i18n-dom.js";

const categoryFilterEl = document.getElementById("categoryFilter");
const serviceListEl = document.getElementById("serviceList");
const statusEl = document.getElementById("serviceStatus");

function setStatus(message) {
  if (statusEl) statusEl.textContent = message;
}

function badgeForService(service, categoryName) {
  const badges = [`<span class="lhai-badge">${categoryName}</span>`];
  if (service.ai_supported) badges.push(`<span class='lhai-badge lhai-badge--operator'>${t("common.services.badge.ai_supported", "AI supported")}</span>`);
  if (service.in_person_only) badges.push(`<span class='lhai-badge lhai-badge--risk-medium'>${t("common.services.badge.in_person_only", "In-person only")}</span>`);
  return badges.join(" ");
}

function renderServices(services, categories) {
  if (!serviceListEl) return;
  const categoryNameById = Object.fromEntries(categories.map((category) => [category.id, category.name]));

  if (!services.length) {
    serviceListEl.innerHTML = `<div class='lhai-state lhai-state--empty'>${t("common.services.empty.by_category", "No services available in this category.")}</div>`;
    return;
  }

  serviceListEl.innerHTML = services
    .map((service) => {
      const categoryName = categoryNameById[service.category_id] || t("common.services.misc.uncategorized", "Uncategorized");
      return `
      <article class="lhai-card">
        <div class="u-flex-between u-mb-2">
          <h2 class="lhai-card__title u-mb-0">${service.name}</h2>
        </div>
        <div class="u-mb-2">${badgeForService(service, categoryName)}</div>
        <p class="u-text-muted u-mb-2">${service.summary || t("common.services.summary.empty", "Service summary not provided.")}</p>
        <p class="u-text-muted u-mb-4">${t("common.services.help_with.prefix", "Helps with:")} ${service.help_description || t("common.services.help_with.empty", "Workflow support details will be added.")}</p>
        <a class="lhai-button lhai-button--primary" href="quote-detail.html?service_id=${encodeURIComponent(service.id)}">${t("common.services.actions.request_quote", "Request Quote")}</a>
      </article>
      `;
    })
    .join("");
}

function renderCategoryFilter(categories) {
  if (!categoryFilterEl) return;
  categoryFilterEl.innerHTML = [
    `<option value="">${t("common.filters.all_categories", "All categories")}</option>`,
    ...categories.map((category) => `<option value="${category.slug}">${category.name}</option>`),
  ].join("");
}

async function loadCatalog(categorySlug = "") {
  setStatus(t("common.services.status.loading", "Loading services..."));
  const [categories, services] = await Promise.all([
    serviceCatalogApi.listCategories(),
    serviceCatalogApi.listServices(categorySlug),
  ]);
  renderCategoryFilter(categories);
  renderServices(services, categories);
  setStatus(t("common.services.status.available_count", "{count} service(s) available").replace("{count}", String(services.length)));
}

async function initServicesPage() {
  await initCommonI18nAndApplyDom(document);
  await loadCatalog("");

  if (categoryFilterEl) {
    categoryFilterEl.addEventListener("change", async () => {
      await loadCatalog(categoryFilterEl.value);
    });
  }
}

initServicesPage();

export { initServicesPage };
