import { serviceCatalogBrowseApi } from "../core/api.js";
import { t } from "../core/i18n-client.js";
import { initCommonI18nAndApplyDom } from "../core/i18n-dom.js";
import { safeText } from "../core/utils.js";
import { isCatalogRecServiceItemUuidString } from "../lib/catalog-rec-service-item-id.js";

const categoryFilterEl = document.getElementById("categoryFilter");
const serviceListEl = document.getElementById("serviceList");
const statusEl = document.getElementById("serviceStatus");

function setStatus(message) {
  if (statusEl) statusEl.textContent = message;
}

/**
 * @param {Record<string, unknown>} card PublicServiceItemCardRead
 * @param {string} categoryId
 */
function publicCardToServiceRow(card, categoryId) {
  const rawId = String(card.id ?? "").trim();
  const id = isCatalogRecServiceItemUuidString(rawId) ? rawId : "";
  const cap = String(card.delivery_capability || "").toUpperCase();
  const aiSupported = cap === "AI_AGENT" || cap === "BOTH";
  const inPersonOnly = cap === "IN_PERSON";
  return {
    id,
    category_id: categoryId,
    name: String(card.customer_title || card.name || "-").trim(),
    summary: String(card.customer_short_description || card.description || "").trim(),
    help_description: String(card.customer_long_description || card.delivery_type_help_text || "").trim(),
    ai_supported: aiSupported,
    in_person_only: inPersonOnly,
  };
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
      const sid = String(service.id ?? "").trim();
      const uuidOk = Boolean(sid) && isCatalogRecServiceItemUuidString(sid);
      const cta = uuidOk
        ? `<a class="lhai-button lhai-button--primary" href="survey-start.html">${t("common.services.actions.request_quote", "Request Quote")}</a>`
        : `<p class="lhai-help u-mb-0" role="alert">${safeText(
            t(
              "common.services.mapping_repair_needed",
              "이 서비스는 카탈로그 UUID로 아직 연결되지 않았습니다. 관리자에게 서비스 매핑 복구를 요청한 뒤 다시 시도해 주세요."
            )
          )}${sid ? ` <span class="u-text-muted">(${safeText(sid)})</span>` : ""}</p>`;
      return `
      <article class="lhai-card">
        <div class="u-flex-between u-mb-2">
          <h2 class="lhai-card__title u-mb-0">${service.name}</h2>
        </div>
        <div class="u-mb-2">${badgeForService(service, categoryName)}</div>
        <p class="u-text-muted u-mb-2">${service.summary || t("common.services.summary.empty", "Service summary not provided.")}</p>
        <p class="u-text-muted u-mb-4">${t("common.services.help_with.prefix", "Helps with:")} ${service.help_description || t("common.services.help_with.empty", "Workflow support details will be added.")}</p>
        ${cta}
      </article>
      `;
    })
    .join("");
}

function renderCategoryFilter(categories) {
  if (!categoryFilterEl) return;
  categoryFilterEl.innerHTML = [
    `<option value="">${t("common.filters.all_categories", "All categories")}</option>`,
    ...categories.map((category) => `<option value="${category.id}">${category.name}</option>`),
  ].join("");
}

async function loadCatalog(categoryId = "") {
  setStatus(t("common.services.status.loading", "Loading services..."));
  const categories = await serviceCatalogBrowseApi.listCategories();
  const flat = await serviceCatalogBrowseApi.listAllServiceItems();
  const rows = Array.isArray(flat) ? flat : [];
  const primaryCategoryId = String(categories?.[0]?.id || "").trim() || "__lhai_flat_catalog__";
  const filterId = String(categoryId || "").trim();
  const effectiveCategoryId = filterId && categories.some((c) => c.id === filterId) ? filterId : primaryCategoryId;
  const services = rows.map((it) => publicCardToServiceRow(it, effectiveCategoryId));
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
