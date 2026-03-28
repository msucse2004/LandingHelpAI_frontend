import { serviceCatalogApi } from "../core/api.js";

const categoryFilterEl = document.getElementById("categoryFilter");
const serviceListEl = document.getElementById("serviceList");
const statusEl = document.getElementById("serviceStatus");

function setStatus(message) {
  if (statusEl) statusEl.textContent = message;
}

function badgeForService(service, categoryName) {
  const badges = [`<span class="lhai-badge">${categoryName}</span>`];
  if (service.ai_supported) badges.push("<span class='lhai-badge lhai-badge--operator'>AI supported</span>");
  if (service.in_person_only) badges.push("<span class='lhai-badge lhai-badge--risk-medium'>In-person only</span>");
  return badges.join(" ");
}

function renderServices(services, categories) {
  if (!serviceListEl) return;
  const categoryNameById = Object.fromEntries(categories.map((category) => [category.id, category.name]));

  if (!services.length) {
    serviceListEl.innerHTML = "<div class='lhai-state lhai-state--empty'>No services available in this category.</div>";
    return;
  }

  serviceListEl.innerHTML = services
    .map((service) => {
      const categoryName = categoryNameById[service.category_id] || "Uncategorized";
      return `
      <article class="lhai-card">
        <div class="u-flex-between u-mb-2">
          <h2 class="lhai-card__title u-mb-0">${service.name}</h2>
        </div>
        <div class="u-mb-2">${badgeForService(service, categoryName)}</div>
        <p class="u-text-muted u-mb-2">${service.summary || "Service summary not provided."}</p>
        <p class="u-text-muted u-mb-4">Helps with: ${service.help_description || "Workflow support details will be added."}</p>
        <a class="lhai-button lhai-button--primary" href="quote-detail.html?service_id=${encodeURIComponent(service.id)}">Request Quote</a>
      </article>
      `;
    })
    .join("");
}

function renderCategoryFilter(categories) {
  if (!categoryFilterEl) return;
  categoryFilterEl.innerHTML = [
    `<option value="">All categories</option>`,
    ...categories.map((category) => `<option value="${category.slug}">${category.name}</option>`),
  ].join("");
}

async function loadCatalog(categorySlug = "") {
  setStatus("Loading services...");
  const [categories, services] = await Promise.all([
    serviceCatalogApi.listCategories(),
    serviceCatalogApi.listServices(categorySlug),
  ]);
  renderCategoryFilter(categories);
  renderServices(services, categories);
  setStatus(`${services.length} service(s) available`);
}

async function initServicesPage() {
  await loadCatalog("");

  if (categoryFilterEl) {
    categoryFilterEl.addEventListener("change", async () => {
      await loadCatalog(categoryFilterEl.value);
    });
  }
}

initServicesPage();

export { initServicesPage };
