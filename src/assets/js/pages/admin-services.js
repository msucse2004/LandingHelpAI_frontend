import { serviceCatalogAdminApi } from "../core/api.js";
import { initManageServiceIntakeTab, msiOnServiceContextChanged } from "./admin-service-intake-tab.js";
import { initManageServiceDocumentsTab } from "./admin-service-documents-tab.js";
import { ensureAdminAccess, protectCurrentPage } from "../core/guards.js";
import { loadSidebar } from "../components/sidebar.js";
import { initI18nDomains, t } from "../core/i18n-client.js";
import { applyI18nToDom } from "../core/i18n-dom.js";
import { formatDate, formatMoney, qsa, qs, safeText } from "../core/utils.js";

let categories = [];
let packages = [];
let modulesByPackage = [];
let addonsByPackage = [];

let selectedPackageId = "";
let editorModePackage = "none"; // "none" | "create" | "edit"
let categoryEditorId = "";
let moduleEditorId = "";
let addonEditorId = "";

function setStatus(targetSelector, message) {
  const el = qs(targetSelector);
  if (el) el.textContent = message;
}

function boolBadge(value, labelTrue = "Yes", labelFalse = "No") {
  const text = value ? labelTrue : labelFalse;
  return value ? `<span class="lhai-badge lhai-badge--status-active">${text}</span>` : `<span class="lhai-badge">${text}</span>`;
}

function esc(value) {
  return safeText(value);
}

function suggestedDeliveryCopy(aiCapable, inPersonRequired) {
  if (aiCapable && inPersonRequired) {
    return {
      label: "AI + Optional Human Help",
      help: "This service starts with AI guidance and can include optional human support when needed.",
    };
  }
  if (aiCapable && !inPersonRequired) {
    return {
      label: "AI Guide",
      help: "This service is delivered through AI guidance, checklists, and digital assistance.",
    };
  }
  if (!aiCapable && inPersonRequired) {
    return {
      label: "In-person Support",
      help: "This service requires human or on-site support.",
    };
  }
  return {
    label: "Guided Service",
    help: "We will guide you through the next steps in a clear, practical flow.",
  };
}

function renderCategories() {
  const tbody = qs("#adminCategoryTable");
  if (!tbody) return;
  if (!categories.length) {
    tbody.innerHTML = `<tr><td colspan='3'>${esc(t("common.admin_services.empty.categories", "No categories"))}</td></tr>`;
    return;
  }

  tbody.innerHTML = categories
    .slice()
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
    .map((cat) => {
      const isActive = Boolean(cat.active);
      return `
        <tr data-cat-id="${esc(cat.id)}">
          <td>${esc(cat.name)}</td>
          <td>${isActive ? boolBadge(true, "Active", "Active") : boolBadge(false, "Active", "Inactive")}</td>
          <td>
            <div class="admin-services__row-actions">
              <button type="button" class="lhai-button lhai-button--secondary lhai-button--compact admin-services__mini-btn" data-action="edit" data-id="${esc(cat.id)}">Edit</button>
              <button type="button" class="lhai-button lhai-button--secondary lhai-button--compact admin-services__mini-btn" data-action="toggle-active" data-id="${esc(cat.id)}">
                ${isActive ? "Deactivate" : "Activate"}
              </button>
              <button type="button" class="lhai-button lhai-button--secondary lhai-button--compact admin-services__mini-btn" data-action="archive" data-id="${esc(cat.id)}">Archive</button>
            </div>
          </td>
        </tr>
      `;
    })
    .join("");
}

function fillCategoryEditor(cat) {
  qs("#categoryEditorId").value = cat?.id || "";
  qs("#categoryEditorName").value = cat?.name || "";
  qs("#categoryEditorDescription").value = cat?.description || "";
  qs("#categoryEditorActive").checked = Boolean(cat?.active);
  categoryEditorId = cat?.id || "";
}

function resetCategoryEditor() {
  fillCategoryEditor({
    id: "",
    code: "",
    name: "",
    description: "",
    sort_order: 0,
    active: true,
  });
}

function getCategoryName(categoryId) {
  const cat = categories.find((c) => c.id === categoryId);
  return cat?.name || "Uncategorized";
}

function renderPackages() {
  const tbody = qs("#adminPackageTable");
  if (!tbody) return;
  if (!packages.length) {
    tbody.innerHTML = `<tr><td colspan='9'>${esc(t("common.admin_services.empty.packages", "No packages"))}</td></tr>`;
    return;
  }

  const categoryNameById = Object.fromEntries(categories.map((c) => [c.id, c.name]));

  tbody.innerHTML = packages
    .slice()
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
    .map((pkg) => {
      const isActive = Boolean(pkg.active);
      const isVisible = Boolean(pkg.visible);
      const isSelected = pkg.id === selectedPackageId;
      return `
        <tr data-pkg-id="${esc(pkg.id)}" class="${isSelected ? "is-selected" : ""}">
          <td><strong>${esc(pkg.name)}</strong></td>
          <td>${esc(categoryNameById[pkg.category_id] || "Uncategorized")}</td>
          <td>${boolBadge(Boolean(pkg.ai_supported), "AI", "AI")}</td>
          <td>${boolBadge(Boolean(pkg.in_person_only), "Yes", "No")}</td>
          <td>${isVisible ? boolBadge(true, "Visible", "Visible") : boolBadge(false, "Visible", "Hidden")}</td>
          <td>${isActive ? boolBadge(true, "Active", "Active") : boolBadge(false, "Active", "Inactive")}</td>
          <td>${esc(formatMoney(pkg.base_price ?? 0, pkg.currency || "USD"))}</td>
          <td>${esc(formatDate(pkg.updated_at))}</td>
          <td>
            <div class="admin-services__row-actions">
              <button type="button" class="lhai-button lhai-button--secondary lhai-button--compact admin-services__mini-btn" data-action="edit" data-id="${esc(pkg.id)}">Edit</button>
              <button type="button" class="lhai-button lhai-button--secondary lhai-button--compact admin-services__mini-btn" data-action="toggle-visible" data-id="${esc(pkg.id)}">
                ${isVisible ? "Hide" : "Show"}
              </button>
              <button type="button" class="lhai-button lhai-button--secondary lhai-button--compact admin-services__mini-btn" data-action="toggle-active" data-id="${esc(pkg.id)}">
                ${isActive ? "Deactivate" : "Activate"}
              </button>
              <button type="button" class="lhai-button lhai-button--secondary lhai-button--compact admin-services__mini-btn" data-action="archive" data-id="${esc(pkg.id)}">Archive</button>
            </div>
          </td>
        </tr>
      `;
    })
    .join("");
}

function setTabEnabled(panelId, enabled) {
  const btn = qsa(`#packageEditorTabs .admin-services__tab-btn`).find((b) => b.getAttribute("data-panel") === panelId);
  if (!btn) return;
  btn.disabled = !enabled;
}

function setPackageEditorMode(mode) {
  editorModePackage = mode;
  // modules/addons should be disabled unless a real package is selected
  const canManageModules = mode === "edit" && Boolean(selectedPackageId);
  setTabEnabled("panel-modules", canManageModules);
  setTabEnabled("panel-addons", canManageModules);

  if (!canManageModules) {
    qs("#adminModuleTable").innerHTML = "";
    qs("#adminAddonTable").innerHTML = "";
    moduleEditorId = "";
    addonEditorId = "";
    qs("#moduleEditorId").value = "";
    qs("#addonEditorId").value = "";
    setStatus("#adminModuleStatus", "패키지 선택 후 모듈을 관리하세요.");
    setStatus("#adminAddonStatus", "패키지 선택 후 애드온을 관리하세요.");
  }
}

function fillPackageEditor(pkg) {
  selectedPackageId = pkg?.id || "";
  qs("#packageEditorId").value = selectedPackageId;
  qs("#packageEditorCategoryId").value = pkg?.category_id || "";
  qs("#packageEditorName").value = pkg?.name || "";
  qs("#packageEditorShortDesc").value = pkg?.short_description || "";

  qs("#packageEditorAiSupported").checked = Boolean(pkg?.ai_supported);

  qs("#packageEditorBasePrice").value = pkg?.base_price ?? 0;
  qs("#packageEditorCurrency").value = pkg?.currency || "USD";

  qs("#packageEditorVisible").checked = pkg?.visible !== undefined ? Boolean(pkg?.visible) : true;
  qs("#packageEditorActive").checked = pkg?.active !== undefined ? Boolean(pkg?.active) : true;
}

function resetPackageEditorForCreate() {
  selectedPackageId = "";
  qs("#packageEditorId").value = "";
  qs("#packageEditorName").value = "";
  qs("#packageEditorShortDesc").value = "";

  qs("#packageEditorAiSupported").checked = false;

  qs("#packageEditorBasePrice").value = 0;
  qs("#packageEditorCurrency").value = "USD";

  qs("#packageEditorVisible").checked = true;
  qs("#packageEditorActive").checked = true;

  qs("#adminModuleTable").innerHTML = "";
  qs("#adminAddonTable").innerHTML = "";
  moduleEditorId = "";
  addonEditorId = "";
  qs("#moduleEditorId").value = "";
  qs("#addonEditorId").value = "";
  modulesByPackage = [];
  addonsByPackage = [];
  setTabEnabled("panel-modules", false);
  setTabEnabled("panel-addons", false);
}

function renderModules(mods = []) {
  const tbody = qs("#adminModuleTable");
  if (!tbody) return;
  if (!mods.length) {
    tbody.innerHTML = "<tr><td colspan='7'>No modules</td></tr>";
    return;
  }
  tbody.innerHTML = mods
    .slice()
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
    .map((m, idx) => {
      const isEditing = m.id === moduleEditorId;
      return `
        <tr data-mod-id="${esc(m.id)}" class="${isEditing ? "is-selected" : ""}">
          <td><strong>${esc(m.name)}</strong></td>
          <td>${boolBadge(Boolean(m.required), "Yes", "No")}</td>
          <td>${boolBadge(Boolean(m.ai_capable), "Yes", "No")}</td>
          <td>${boolBadge(Boolean(m.in_person_required), "Yes", "No")}</td>
          <td>${m.active ? boolBadge(true, "Active", "Active") : boolBadge(false, "Active", "Inactive")}</td>
          <td>${idx}</td>
          <td>
            <div class="admin-services__row-actions">
              <button type="button" class="lhai-button lhai-button--secondary lhai-button--compact admin-services__mini-btn" data-action="edit" data-id="${esc(m.id)}">Edit</button>
              <button type="button" class="lhai-button lhai-button--secondary lhai-button--compact admin-services__mini-btn" data-action="toggle-active" data-id="${esc(m.id)}">
                ${m.active ? "Deactivate" : "Activate"}
              </button>
              <button type="button" class="lhai-button lhai-button--secondary lhai-button--compact admin-services__mini-btn" data-action="move-up" data-id="${esc(m.id)}" ${idx === 0 ? "disabled" : ""}>↑</button>
              <button type="button" class="lhai-button lhai-button--secondary lhai-button--compact admin-services__mini-btn" data-action="move-down" data-id="${esc(m.id)}" ${idx === mods.length - 1 ? "disabled" : ""}>↓</button>
            </div>
          </td>
        </tr>
      `;
    })
    .join("");
}

function fillModuleEditor(m) {
  qs("#moduleEditorId").value = m?.id || "";
  qs("#moduleEditorName").value = m?.name || "";
  qs("#moduleEditorDescription").value = m?.description || "";
  qs("#moduleEditorRequired").checked = Boolean(m?.required);
  qs("#moduleEditorAiCapable").checked = Boolean(m?.ai_capable);
  qs("#moduleEditorInPersonRequired").checked = Boolean(m?.in_person_required);
  qs("#moduleEditorActive").checked = Boolean(m?.active);
  moduleEditorId = m?.id || "";
}

function resetModuleEditor() {
  fillModuleEditor({
    id: "",
    name: "",
    description: "",
    required: false,
    ai_capable: false,
    in_person_required: false,
    active: true,
  });
}

function renderAddons(addons = []) {
  const tbody = qs("#adminAddonTable");
  if (!tbody) return;
  if (!addons.length) {
    tbody.innerHTML = "<tr><td colspan='6'>No add-ons</td></tr>";
    return;
  }
  tbody.innerHTML = addons
    .slice()
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
    .map((a, idx) => {
      const isEditing = a.id === addonEditorId;
      return `
        <tr data-addon-id="${esc(a.id)}" class="${isEditing ? "is-selected" : ""}">
          <td><strong>${esc(a.name)}</strong></td>
          <td>${esc(formatMoney(a.extra_price ?? 0, a.currency || "USD"))}</td>
          <td>${a.active ? boolBadge(true, "Active", "Active") : boolBadge(false, "Active", "Inactive")}</td>
          <td>${a.visible ? boolBadge(true, "Visible", "Visible") : boolBadge(false, "Visible", "Hidden")}</td>
          <td>${idx}</td>
          <td>
            <div class="admin-services__row-actions">
              <button type="button" class="lhai-button lhai-button--secondary lhai-button--compact admin-services__mini-btn" data-action="edit" data-id="${esc(a.id)}">Edit</button>
              <button type="button" class="lhai-button lhai-button--secondary lhai-button--compact admin-services__mini-btn" data-action="toggle-active" data-id="${esc(a.id)}">
                ${a.active ? "Deactivate" : "Activate"}
              </button>
              <button type="button" class="lhai-button lhai-button--secondary lhai-button--compact admin-services__mini-btn" data-action="toggle-visible" data-id="${esc(a.id)}">
                ${a.visible ? "Hide" : "Show"}
              </button>
              <button type="button" class="lhai-button lhai-button--secondary lhai-button--compact admin-services__mini-btn" data-action="move-up" data-id="${esc(a.id)}" ${idx === 0 ? "disabled" : ""}>↑</button>
              <button type="button" class="lhai-button lhai-button--secondary lhai-button--compact admin-services__mini-btn" data-action="move-down" data-id="${esc(a.id)}" ${idx === addons.length - 1 ? "disabled" : ""}>↓</button>
            </div>
          </td>
        </tr>
      `;
    })
    .join("");
}

function fillAddonEditor(a) {
  qs("#addonEditorId").value = a?.id || "";
  qs("#addonEditorName").value = a?.name || "";
  qs("#addonEditorDescription").value = a?.description || "";
  qs("#addonEditorExtraPrice").value = a?.extra_price ?? 0;
  qs("#addonEditorCurrency").value = a?.currency || "USD";
  qs("#addonEditorActive").checked = Boolean(a?.active);
  qs("#addonEditorVisible").checked = Boolean(a?.visible);
  addonEditorId = a?.id || "";
}

function resetAddonEditor() {
  fillAddonEditor({
    id: "",
    name: "",
    description: "",
    extra_price: 0,
    currency: "USD",
    active: true,
    visible: true,
  });
}

async function refreshCategories() {
  setStatus("#adminCategoryStatus", "Loading categories...");
  categories = await serviceCatalogAdminApi.listCategories(true);
  renderCategories();
  setStatus("#adminCategoryStatus", `${categories.length} categories`);

  const select = qs("#packageCategoryFilter");
  if (select) {
    const current = select.value;
    select.innerHTML = `<option value="">All categories</option>` + categories.map((c) => `<option value="${esc(c.id)}">${esc(c.name)}</option>`).join("");
    // restore selection
    select.value = current || "";
  }

  const pkgCatSelect = qs("#packageEditorCategoryId");
  if (pkgCatSelect) {
    pkgCatSelect.innerHTML = categories.map((c) => `<option value="${esc(c.id)}">${esc(c.name)}</option>`).join("");
    // keep current selected if possible
    // if value isn't present, fall back to first.
    const current = pkgCatSelect.value;
    if (current && categories.some((c) => c.id === current)) {
      pkgCatSelect.value = current;
    } else if (categories[0]) {
      pkgCatSelect.value = categories[0].id;
    }
  }

  // refresh packages after categories
  await refreshPackages();
}

async function refreshPackages() {
  const filterCatId = qs("#packageCategoryFilter")?.value || "";
  const categoryId = filterCatId ? filterCatId : null;
  setStatus("#adminPackageStatus", "Loading packages...");
  packages = await serviceCatalogAdminApi.listPackages(true, categoryId);
  renderPackages();
  setStatus("#adminPackageStatus", `${packages.length} packages`);

  // if no package selected and there are packages, pick first
  if (!selectedPackageId && packages.length && editorModePackage === "none") {
    await selectPackage(packages[0].id);
  }
}

async function selectPackage(packageId) {
  if (!packageId) return;
  selectedPackageId = packageId;
  editorModePackage = "edit";

  const pkg = await serviceCatalogAdminApi.getPackage(packageId);
  // populate categories dropdown (it may exist but ensure it's loaded)
  const catSelect = qs("#packageEditorCategoryId");
  if (catSelect) {
    catSelect.innerHTML =
      categories.map((c) => `<option value="${esc(c.id)}">${esc(c.name)}</option>`).join("");
    catSelect.value = pkg.category_id;
  }

  fillPackageEditor(pkg);
  setPackageEditorMode("edit");

  // clear editors for modules/addons
  moduleEditorId = "";
  addonEditorId = "";
  qs("#moduleEditorId").value = "";
  qs("#addonEditorId").value = "";
  resetModuleEditor();
  resetAddonEditor();

  await loadModulesAndAddons();
}

async function loadModulesAndAddons() {
  if (!selectedPackageId) return;
  setStatus("#adminModuleStatus", "Loading modules...");
  setStatus("#adminAddonStatus", "Loading add-ons...");
  modulesByPackage = await serviceCatalogAdminApi.listModulesByPackage(selectedPackageId, true);
  addonsByPackage = await serviceCatalogAdminApi.listAddonsByPackage(selectedPackageId, true);
  renderModules(modulesByPackage);
  renderAddons(addonsByPackage);
  setStatus("#adminModuleStatus", `Modules: ${modulesByPackage.length}`);
  setStatus("#adminAddonStatus", `Add-ons: ${addonsByPackage.length}`);
}

async function reorderModuleByIds(newOrderIds) {
  modulesByPackage = await serviceCatalogAdminApi.reorderModules(selectedPackageId, newOrderIds);
  renderModules(modulesByPackage);
  setPackageEditorMode("edit");
}

async function reorderAddonByIds(newOrderIds) {
  addonsByPackage = await serviceCatalogAdminApi.reorderAddons(selectedPackageId, newOrderIds);
  renderAddons(addonsByPackage);
  setPackageEditorMode("edit");
}

async function initAdminServicesPage() {
  if (!protectCurrentPage()) return;
  if (!ensureAdminAccess()) return;

  await loadSidebar("#sidebar", "admin");

  const tabsRoot = qs("#packageEditorTabs");
  const panelsRoot = qs(".admin-services__tab-panels");
  mountTabs(tabsRoot, panelsRoot, { defaultPanelId: "panel-basic" });

  resetCategoryEditor();
  resetPackageEditorForCreate();
  resetModuleEditor();
  resetAddonEditor();

  setPackageEditorMode("none");

  await refreshCategories();

  // Category form
  qs("#adminCategoryForm")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const payload = {
      name: qs("#categoryEditorName").value.trim(),
      description: qs("#categoryEditorDescription").value || "",
      active: Boolean(qs("#categoryEditorActive").checked),
    };
    const id = qs("#categoryEditorId").value.trim();
    if (!payload.name) return setStatus("#adminCategoryStatus", t("common.admin_services.validation.category_name_required", "Category name is required."));

    try {
      if (id) {
        await serviceCatalogAdminApi.updateCategory(id, payload);
        setStatus("#adminCategoryStatus", "Category updated.");
      } else {
        await serviceCatalogAdminApi.createCategory(payload);
        setStatus("#adminCategoryStatus", "Category created.");
      }
      await refreshCategories();
      resetCategoryEditor();
    } catch (err) {
      setStatus("#adminCategoryStatus", `Error: ${err?.message || err}`);
    }
  });

  qs("#resetCategoryBtn")?.addEventListener("click", () => {
    resetCategoryEditor();
  });

  // Category actions
  qs("#adminCategoryTable")?.addEventListener("click", async (event) => {
    const btn = event.target.closest("button[data-action]");
    const tr = event.target.closest("tr[data-cat-id]");
    const catId = btn?.getAttribute("data-id") || tr?.getAttribute("data-cat-id");
    const action = btn?.getAttribute("data-action");
    if (!catId) return;

    if (action === "edit") {
      const cat = categories.find((c) => c.id === catId);
      fillCategoryEditor(cat);
    } else if (action === "toggle-active") {
      const cat = categories.find((c) => c.id === catId);
      const nextActive = !Boolean(cat?.active);
      await serviceCatalogAdminApi.updateCategory(catId, { active: nextActive });
      await refreshCategories();
      setStatus("#adminCategoryStatus", `Category ${nextActive ? "activated" : "deactivated"}.`);
    } else if (action === "archive") {
      if (!window.confirm("Archive this category?")) return;
      await serviceCatalogAdminApi.archiveCategory(catId);
      await refreshCategories();
      setStatus("#adminCategoryStatus", "Category archived.");
      if (categoryEditorId === catId) resetCategoryEditor();
    }
  });

  // Package filter and add
  qs("#packageCategoryFilter")?.addEventListener("change", async () => {
    selectedPackageId = "";
    editorModePackage = "none";
    await refreshPackages();
  });

  qs("#addPackageBtn")?.addEventListener("click", async () => {
    editorModePackage = "create";
    selectedPackageId = "";
    setPackageEditorMode("create");
    resetPackageEditorForCreate();
    // set default category from filter
    const catId = qs("#packageCategoryFilter")?.value || (categories[0] ? categories[0].id : "");
    qs("#packageEditorCategoryId").value = catId;
    setStatus("#adminPackageStatus", "Create mode: 입력 후 Basic 탭에서 저장하세요.");
  });

  // Package actions
  qs("#adminPackageTable")?.addEventListener("click", async (event) => {
    const btn = event.target.closest("button[data-action]");
    const action = btn?.getAttribute("data-action");
    const pkgId = btn?.getAttribute("data-id");
    if (!action || !pkgId) return;

    if (action === "edit") {
      await selectPackage(pkgId);
    } else if (action === "toggle-visible") {
      const pkg = packages.find((p) => p.id === pkgId);
      await serviceCatalogAdminApi.setPackageVisibility(pkgId, !Boolean(pkg?.visible));
      await refreshPackages();
    } else if (action === "toggle-active") {
      const pkg = packages.find((p) => p.id === pkgId);
      await serviceCatalogAdminApi.setPackageActivation(pkgId, !Boolean(pkg?.active));
      await refreshPackages();
    } else if (action === "archive") {
      if (!window.confirm("Archive this package?")) return;
      await serviceCatalogAdminApi.archivePackage(pkgId);
      await refreshPackages();
      if (selectedPackageId === pkgId) {
        selectedPackageId = "";
        editorModePackage = "none";
        setPackageEditorMode("none");
      }
    }
  });

  // Package basic editor save (create/edit)
  qs("#adminPackageBasicForm")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const categoryId = qs("#packageEditorCategoryId").value.trim();
    if (!categoryId) return setStatus("#packageEditorSubtitle", "Category is required.");

    const basePayload = {
      category_id: categoryId,
      name: qs("#packageEditorName").value.trim(),
      short_description: qs("#packageEditorShortDesc").value || "",
      ai_supported: Boolean(qs("#packageEditorAiSupported").checked),
      base_price: Number(qs("#packageEditorBasePrice").value || 0),
      currency: qs("#packageEditorCurrency").value.trim() || "USD",
    };
    const createPayload = {
      ...basePayload,
      visible: Boolean(qs("#packageEditorVisible").checked),
      active: Boolean(qs("#packageEditorActive").checked),
    };

    try {
      const pkgId = qs("#packageEditorId").value.trim();
      if (pkgId) {
        await serviceCatalogAdminApi.updatePackage(pkgId, basePayload);
        setStatus("#packageEditorSubtitle", "Package basic updated.");
      } else {
        const created = await serviceCatalogAdminApi.createPackage(createPayload);
        setStatus("#packageEditorSubtitle", "Package created.");
        await selectPackage(created.id);
      }
      await refreshPackages();
    } catch (err) {
      setStatus("#packageEditorSubtitle", `Error: ${err?.message || err}`);
    }
  });

  // Delivery save
  qs("#adminPackageDeliveryForm")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!selectedPackageId) return setStatus("#packageEditorSubtitle", "Select a package first.");
    const payload = {
      ai_supported: Boolean(qs("#packageEditorAiSupported").checked),
    };
    try {
      await serviceCatalogAdminApi.updatePackage(selectedPackageId, payload);
      setStatus("#packageEditorSubtitle", "Delivery updated.");
    } catch (err) {
      setStatus("#packageEditorSubtitle", `Error: ${err?.message || err}`);
    }
  });

  // Pricing save
  qs("#adminPackagePricingForm")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!selectedPackageId) return setStatus("#packageEditorSubtitle", "Select a package first.");
    const payload = {
      base_price: Number(qs("#packageEditorBasePrice").value || 0),
      currency: qs("#packageEditorCurrency").value.trim() || "USD",
    };
    try {
      await serviceCatalogAdminApi.updatePackage(selectedPackageId, payload);
      setStatus("#packageEditorSubtitle", "Pricing updated.");
    } catch (err) {
      setStatus("#packageEditorSubtitle", `Error: ${err?.message || err}`);
    }
  });

  // Visibility/state save
  qs("#adminPackageStateForm")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!selectedPackageId) return setStatus("#packageEditorSubtitle", "Select a package first.");
    try {
      await serviceCatalogAdminApi.setPackageVisibility(selectedPackageId, Boolean(qs("#packageEditorVisible").checked));
      await serviceCatalogAdminApi.setPackageActivation(selectedPackageId, Boolean(qs("#packageEditorActive").checked));
      setStatus("#packageEditorSubtitle", "Visibility/state updated.");
      await refreshPackages();
    } catch (err) {
      setStatus("#packageEditorSubtitle", `Error: ${err?.message || err}`);
    }
  });

  // Archive
  qs("#archivePackageBtn")?.addEventListener("click", async () => {
    if (!selectedPackageId) return setStatus("#packageEditorSubtitle", "Select a package first.");
    if (!window.confirm("Archive this package?")) return;
    await serviceCatalogAdminApi.archivePackage(selectedPackageId);
    setStatus("#packageEditorSubtitle", "Package archived.");
    await refreshPackages();
    selectedPackageId = "";
    editorModePackage = "none";
    setPackageEditorMode("none");
  });

  // Module actions
  qs("#adminModuleTable")?.addEventListener("click", async (event) => {
    const btn = event.target.closest("button[data-action]");
    if (!btn) return;
    const action = btn.getAttribute("data-action");
    const moduleId = btn.getAttribute("data-id");
    if (!action || !moduleId) return;

    const currentIndex = modulesByPackage.findIndex((m) => m.id === moduleId);
    if (action === "edit") {
      const m = modulesByPackage[currentIndex];
      fillModuleEditor(m);
      return;
    }

    if (action === "toggle-active") {
      const m = modulesByPackage[currentIndex];
      await serviceCatalogAdminApi.setModuleActivation(moduleId, !Boolean(m?.active));
      await loadModulesAndAddons();
      return;
    }

    if (action === "move-up" || action === "move-down") {
      if (!selectedPackageId) return;
      const newOrder = modulesByPackage.slice().sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
      const idx = newOrder.findIndex((x) => x.id === moduleId);
      if (idx < 0) return;
      const swapWith = action === "move-up" ? idx - 1 : idx + 1;
      if (swapWith < 0 || swapWith >= newOrder.length) return;
      const tmp = newOrder[idx];
      newOrder[idx] = newOrder[swapWith];
      newOrder[swapWith] = tmp;
      const ids = newOrder.map((x) => x.id);
      await reorderModuleByIds(ids);
    }
  });

  // Module save
  qs("#adminModuleForm")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!selectedPackageId) return setStatus("#adminModuleStatus", "Select a package first.");

    const payloadUpdate = {
      name: qs("#moduleEditorName").value.trim(),
      description: qs("#moduleEditorDescription").value || "",
      required: Boolean(qs("#moduleEditorRequired").checked),
      ai_capable: Boolean(qs("#moduleEditorAiCapable").checked),
      in_person_required: Boolean(qs("#moduleEditorInPersonRequired").checked),
    };
    const active = Boolean(qs("#moduleEditorActive").checked);

    try {
      if (moduleEditorId) {
        await serviceCatalogAdminApi.updateModule(moduleEditorId, payloadUpdate);
        // active is separate endpoint
        await serviceCatalogAdminApi.setModuleActivation(moduleEditorId, active);
      } else {
        const createPayload = {
          package_id: selectedPackageId,
          ...payloadUpdate,
          sort_order: modulesByPackage.length,
          active: active,
        };
        await serviceCatalogAdminApi.createModule(createPayload);
      }
      moduleEditorId = "";
      qs("#moduleEditorId").value = "";
      resetModuleEditor();
      await loadModulesAndAddons();
    } catch (err) {
      setStatus("#adminModuleStatus", `Error: ${err?.message || err}`);
    }
  });

  // Addon actions
  qs("#adminAddonTable")?.addEventListener("click", async (event) => {
    const btn = event.target.closest("button[data-action]");
    if (!btn) return;
    const action = btn.getAttribute("data-action");
    const addonId = btn.getAttribute("data-id");
    if (!action || !addonId) return;

    const currentIndex = addonsByPackage.findIndex((a) => a.id === addonId);
    if (action === "edit") {
      const a = addonsByPackage[currentIndex];
      fillAddonEditor(a);
      return;
    }

    if (action === "toggle-active") {
      const a = addonsByPackage[currentIndex];
      await serviceCatalogAdminApi.setAddonActivation(addonId, !Boolean(a?.active));
      await loadModulesAndAddons();
      return;
    }

    if (action === "toggle-visible") {
      const a = addonsByPackage[currentIndex];
      await serviceCatalogAdminApi.setAddonVisibility(addonId, !Boolean(a?.visible));
      await loadModulesAndAddons();
      return;
    }

    if (action === "move-up" || action === "move-down") {
      const newOrder = addonsByPackage.slice().sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
      const idx = newOrder.findIndex((x) => x.id === addonId);
      if (idx < 0) return;
      const swapWith = action === "move-up" ? idx - 1 : idx + 1;
      if (swapWith < 0 || swapWith >= newOrder.length) return;
      const tmp = newOrder[idx];
      newOrder[idx] = newOrder[swapWith];
      newOrder[swapWith] = tmp;
      const ids = newOrder.map((x) => x.id);
      await reorderAddonByIds(ids);
    }
  });

  // Addon save
  qs("#adminAddonForm")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!selectedPackageId) return setStatus("#adminAddonStatus", "Select a package first.");

    const payloadUpdate = {
      name: qs("#addonEditorName").value.trim(),
      description: qs("#addonEditorDescription").value || "",
      extra_price: Number(qs("#addonEditorExtraPrice").value || 0),
      currency: qs("#addonEditorCurrency").value.trim() || "USD",
    };
    const active = Boolean(qs("#addonEditorActive").checked);
    const visible = Boolean(qs("#addonEditorVisible").checked);

    try {
      if (addonEditorId) {
        await serviceCatalogAdminApi.updateAddon(addonEditorId, payloadUpdate);
        await serviceCatalogAdminApi.setAddonActivation(addonEditorId, active);
        await serviceCatalogAdminApi.setAddonVisibility(addonEditorId, visible);
      } else {
        const createPayload = {
          package_id: selectedPackageId,
          ...payloadUpdate,
          sort_order: addonsByPackage.length,
          active: active,
          visible: visible,
        };
        await serviceCatalogAdminApi.createAddon(createPayload);
      }
      addonEditorId = "";
      qs("#addonEditorId").value = "";
      resetAddonEditor();
      await loadModulesAndAddons();
    } catch (err) {
      setStatus("#adminAddonStatus", `Error: ${err?.message || err}`);
    }
  });

  // Initial refresh: disable modules/addons
  setPackageEditorMode("none");
}

// ---------------------------
// Service-first (Inventory) UI
// ---------------------------

let sf_categories = [];
let sf_packages = [];
let sf_inventoryRows = [];

// i18n cache for this page (filled once during init).
let sfAdminI18n = {};

function sf_applyI18nText(el, key) {
  if (!el) return;
  el.textContent = t(key, el.textContent);
}

function sf_applyI18nPlaceholder(el, key) {
  if (!el) return;
  el.placeholder = t(key, el.placeholder);
}

function sf_applyI18nLabelFor(forId, key) {
  const el = qs(`label[for="${forId}"]`);
  sf_applyI18nText(el, key);
}

function sf_applyI18nOptionText(selectSelector, optionValue, key) {
  const sel = qs(selectSelector);
  if (!sel) return;
  const opt = sel.querySelector(`option[value="${optionValue}"]`);
  if (!opt) return;
  opt.textContent = t(key, opt.textContent);
}

function sf_applyAdminServicesI18n() {
  const sectionTitleEls = qsa("#panel-inventory .admin-services__inventory-right .lhai-section__title");
  // Keep it defensive: page layout might change, so we map by index with checks.
  const invTitle = qs(".lhai-page-header .lhai-title");
  sf_applyI18nText(invTitle, "common.admin_services.page.title");
  sf_applyI18nText(qs(".lhai-page-header .lhai-subtitle"), "common.admin_services.page.subtitle");

  // Top tabs
  sf_applyI18nText(qs('#adminServicesTopTabs button[data-panel="panel-inventory"]'), "common.admin_services.tab.inventory");
  sf_applyI18nText(qs('#adminServicesTopTabs button[data-panel="panel-packages"]'), "common.admin_services.tab.packages");
  sf_applyI18nText(qs('#adminServicesTopTabs button[data-panel="panel-categories"]'), "common.admin_services.tab.categories");
  sf_applyI18nText(qs('#adminServicesTopTabs button[data-panel="panel-hierarchy"]'), "common.admin_services.tab.hierarchy");

  // Inventory toolbar
  sf_applyI18nText(qs('#panel-inventory .admin-services__inventory-toolbar > div > h2.lhai-card__title'), "common.admin_services.inventory.title");
  sf_applyI18nText(qs('#panel-inventory .admin-services__inventory-toolbar > div > p.lhai-help'), "common.admin_services.inventory.subtitle");
  sf_applyI18nLabelFor("inventorySearch", "common.admin_services.toolbar.search");
  sf_applyI18nPlaceholder(qs("#inventorySearch"), "common.admin_services.toolbar.search_placeholder");

  // Filters labels
  sf_applyI18nLabelFor("inventoryFilterType", "common.admin_services.filters.type");
  sf_applyI18nLabelFor("inventoryFilterCategoryId", "common.admin_services.filters.category");
  sf_applyI18nLabelFor("inventoryFilterPackageId", "common.admin_services.filters.package");
  sf_applyI18nLabelFor("inventoryFilterActive", "common.admin_services.filters.active");
  sf_applyI18nLabelFor("inventoryFilterVisible", "common.admin_services.filters.visible");

  // Filter options
  sf_applyI18nOptionText("#inventoryFilterType", "", "common.admin_services.filters.all");
  sf_applyI18nOptionText("#inventoryFilterType", "module", "common.admin_services.filters.type.module");
  sf_applyI18nOptionText("#inventoryFilterType", "addon", "common.admin_services.filters.type.addon");

  sf_applyI18nOptionText("#inventoryFilterActive", "", "common.admin_services.filters.all");
  sf_applyI18nOptionText("#inventoryFilterActive", "true", "common.admin_services.filters.active.active");
  sf_applyI18nOptionText("#inventoryFilterActive", "false", "common.admin_services.filters.active.inactive");

  sf_applyI18nOptionText("#inventoryFilterVisible", "", "common.admin_services.filters.all");
  sf_applyI18nOptionText("#inventoryFilterVisible", "true", "common.admin_services.filters.visible.visible");
  sf_applyI18nOptionText("#inventoryFilterVisible", "false", "common.admin_services.filters.visible.hidden");

  // Inventory action buttons
  sf_applyI18nText(qs("#inventoryAddServiceBtn"), "common.admin_services.actions.add_service");
  sf_applyI18nText(qs("#inventoryAddPackageBtn"), "common.admin_services.actions.add_package");
  sf_applyI18nText(qs("#inventoryAddCategoryBtn"), "common.admin_services.actions.add_category");

  // Inventory table headers
  const invThs = qsa("#adminInventoryTable thead th");
  if (invThs.length >= 7) {
    sf_applyI18nText(invThs[0], "common.admin_services.table.inventory.service");
    sf_applyI18nText(invThs[1], "common.admin_services.table.inventory.type");
    sf_applyI18nText(invThs[2], "common.admin_services.table.inventory.package");
    sf_applyI18nText(invThs[3], "common.admin_services.table.inventory.category");
    sf_applyI18nText(invThs[4], "common.admin_services.table.inventory.active");
    sf_applyI18nText(invThs[5], "common.admin_services.table.inventory.visible");
    sf_applyI18nText(invThs[6], "common.admin_services.table.inventory.actions");
  }

  // Service editor labels & buttons
  sf_applyI18nText(qs("#serviceEditorTitle"), "common.admin_services.editor.service_detail");
  sf_applyI18nLabelFor("serviceEditorName", "common.admin_services.editor.label.service_name");
  sf_applyI18nLabelFor("serviceEditorDescription", "common.admin_services.editor.label.description");
  sf_applyI18nLabelFor("serviceEditorTypeSelect", "common.admin_services.editor.section.type");
  sf_applyI18nText(qs("#serviceEditorTypeNote"), "common.admin_services.editor.type_note");
  sf_applyI18nOptionText("#serviceEditorTypeSelect", "module", "common.admin_services.editor.type.module");
  sf_applyI18nOptionText("#serviceEditorTypeSelect", "addon", "common.admin_services.editor.type.addon");
  sf_applyI18nLabelFor("serviceEditorAiCapable", "common.admin_services.editor.attributes.ai_capable");
  sf_applyI18nLabelFor("serviceEditorInPersonRequired", "common.admin_services.editor.attributes.in_person_required");
  sf_applyI18nLabelFor("serviceEditorExtraPrice", "common.admin_services.editor.attributes.extra_price");
  sf_applyI18nLabelFor("serviceEditorCurrency", "common.admin_services.editor.attributes.currency");
  sf_applyI18nLabelFor("serviceEditorPackageId", "common.admin_services.editor.assignment.package");
  sf_applyI18nLabelFor("serviceEditorCategoryName", "common.admin_services.editor.assignment.category");
  sf_applyI18nLabelFor("serviceEditorActive", "common.admin_services.editor.status.active");
  sf_applyI18nLabelFor("serviceEditorVisible", "common.admin_services.editor.status.visible");

  // Type/support headings (use order inside service editor)
  if (sectionTitleEls.length >= 7) {
    // Basic Info
    sf_applyI18nText(sectionTitleEls[0], "common.admin_services.editor.section.basic_info");
    // Type
    sf_applyI18nText(sectionTitleEls[1], "common.admin_services.editor.section.type_header");
    // Attributes
    sf_applyI18nText(sectionTitleEls[2], "common.admin_services.editor.section.attributes");
    // Assignment
    sf_applyI18nText(sectionTitleEls[3], "common.admin_services.editor.section.assignment");
    // Status
    sf_applyI18nText(sectionTitleEls[4], "common.admin_services.editor.section.status");
    // System Info
    sf_applyI18nText(sectionTitleEls[5], "common.admin_services.editor.section.system_info_title");
    // Danger zone
    sf_applyI18nText(sectionTitleEls[6], "common.admin_services.editor.section.danger_zone_title");
  }

  // Assignment helper (first <p.lhai-help> after Assignment heading)
  if (sectionTitleEls.length >= 4) {
    const assignmentH4 = sectionTitleEls[3];
    const p = assignmentH4?.nextElementSibling;
    sf_applyI18nText(p, "common.admin_services.editor.assignment.helper");
  }

  // Reorder / danger / editor buttons
  sf_applyI18nText(qs("#serviceReorderUpBtn"), "common.admin_services.editor.reorder.move_up");
  sf_applyI18nText(qs("#serviceReorderDownBtn"), "common.admin_services.editor.reorder.move_down");
  sf_applyI18nText(qs("#serviceRemoveLinkBtn"), "common.admin_services.editor.reorder.remove_from_package");
  sf_applyI18nText(qs("#serviceReorderHint"), "common.admin_services.editor.assignment.reorder_hint");

  sf_applyI18nText(qs("#serviceClearSelectionBtn"), "common.admin_services.editor.actions.clear");
  sf_applyI18nText(qs("#serviceEditorPrimaryBtn"), "common.admin_services.editor.actions.create_assign");
  sf_applyI18nText(qs("#serviceArchiveBtn"), "common.admin_services.editor.danger_zone.archive");
  sf_applyI18nText(qs("#serviceDeleteBtn"), "common.admin_services.editor.danger_zone.delete");
  sf_applyI18nText(qs("#serviceDeactivateBtn"), "common.admin_services.editor.actions.deactivate");
  sf_applyI18nText(qs("#serviceHideBtn"), "common.admin_services.editor.actions.hide");
  sf_applyI18nText(qs("#serviceStatusHint"), "common.admin_services.editor.status.hint_safe_actions");

  // System info read-only details
  const sysDetails = qs('#panel-inventory .admin-services__inventory-right details.lhai-state');
  const sysSummary = sysDetails?.querySelector("summary");
  sf_applyI18nText(sysSummary, "common.admin_services.editor.system_info.summary");
  const sysDts = qsa('#panel-inventory .admin-services__inventory-right .lhai-detail-dl__dt');
  if (sysDts.length >= 3) {
    sf_applyI18nText(sysDts[0], "common.admin_services.editor.system_info.id");
    sf_applyI18nText(sysDts[1], "common.admin_services.editor.system_info.code");
    sf_applyI18nText(sysDts[2], "common.admin_services.editor.system_info.slug");
  }

  // Precompute common label strings used in dynamic badges.
  sfAdminI18n = {
    activeTrue: t("common.admin_services.state.active", "Active"),
    activeFalse: t("common.admin_services.state.inactive", "Inactive"),
    visibleTrue: t("common.admin_services.state.visible", "Visible"),
    visibleFalse: t("common.admin_services.state.hidden", "Hidden"),
    typeModule: t("common.admin_services.service_type.module", "module"),
    typeAddon: t("common.admin_services.service_type.addon", "addon"),
    editAction: t("common.admin_services.actions.edit", "Edit"),
  };

  // Packages tab (basic)
  sf_applyI18nText(qs("#panel-packages .lhai-card__title"), "common.admin_services.packages.title");
  sf_applyI18nText(qs("#panel-packages .lhai-help"), "common.admin_services.packages.helper");
  sf_applyI18nText(qs("#adminPackagesComposeStatus"), "common.admin_services.packages.status.select_package");
  sf_applyI18nText(qs("#packageComposeHint"), "common.admin_services.packages.hint");
  sf_applyI18nOptionText("#packageComposeCurrency", "USD", "USD");

  const pkgThs = qsa("#adminPackagesComposeTable thead th");
  if (pkgThs.length >= 6) {
    sf_applyI18nText(pkgThs[0], "common.admin_services.table.packages.composition.package");
    sf_applyI18nText(pkgThs[1], "common.admin_services.table.packages.composition.category");
    sf_applyI18nText(pkgThs[2], "common.admin_services.table.packages.composition.ai_supported");
    sf_applyI18nText(pkgThs[3], "common.admin_services.table.packages.composition.visible");
    sf_applyI18nText(pkgThs[4], "common.admin_services.table.packages.composition.active");
    sf_applyI18nText(pkgThs[5], "common.admin_services.table.packages.composition.included_service_count");
  }

  // Labels inside package editor (right side)
  sf_applyI18nLabelFor("packageComposeName", "common.admin_services.packages.editor.label.package_name");
  sf_applyI18nLabelFor("packageComposeDescription", "common.admin_services.packages.editor.label.description");
  sf_applyI18nLabelFor("packageComposeCategoryId", "common.admin_services.packages.editor.label.category");
  sf_applyI18nLabelFor("packageComposeAiSupported", "common.admin_services.packages.editor.label.ai_supported");
  sf_applyI18nLabelFor("packageComposeBasePrice", "common.admin_services.packages.editor.label.base_price");
  sf_applyI18nLabelFor("packageComposeCurrency", "common.admin_services.packages.editor.label.currency");
  sf_applyI18nLabelFor("packageComposeVisibleChk", "common.admin_services.editor.status.visible");
  sf_applyI18nLabelFor("packageComposeActiveChk", "common.admin_services.editor.status.active");

  sf_applyI18nText(qs("#packageComposeSaveBasicBtn"), "common.admin_services.common.save_basic_info");
  sf_applyI18nText(qs("#packageComposeSaveStatusBtn"), "common.admin_services.common.save_visibility_status");
  sf_applyI18nText(qs("#packageComposeDeactivateBtn"), "common.admin_services.packages.actions.deactivate");
  sf_applyI18nText(qs("#packageComposeArchiveBtn"), "common.admin_services.packages.actions.archive");
  sf_applyI18nText(qs("#packageComposeDeleteBtn"), "common.admin_services.packages.actions.delete_safe");
  sf_applyI18nText(qs("#packageComposeDangerHelp"), "common.admin_services.packages.danger.help");

  sf_applyI18nText(qs("#packageAddModuleBtn"), "common.admin_services.packages.actions.add_module");
  sf_applyI18nText(qs("#packageAddAddonBtn"), "common.admin_services.packages.actions.add_addon");
  sf_applyI18nLabelFor("packageAddModuleSelect", "common.admin_services.packages.editor.label.add_existing_module");
  sf_applyI18nLabelFor("packageAddModuleRequiredChk", "common.admin_services.packages.editor.label.required");
  sf_applyI18nLabelFor("packageAddAddonSelect", "common.admin_services.packages.editor.label.add_existing_addon");

  // Package modules table headers
  const modThs = qsa("#adminPackageModulesTable thead th");
  if (modThs.length >= 8) {
    sf_applyI18nText(modThs[0], "common.admin_services.table.modules.module");
    sf_applyI18nText(modThs[1], "common.admin_services.table.modules.required");
    sf_applyI18nText(modThs[2], "common.admin_services.table.modules.ai");
    sf_applyI18nText(modThs[3], "common.admin_services.table.modules.in_person_required");
    sf_applyI18nText(modThs[4], "common.admin_services.state.active");
    sf_applyI18nText(modThs[5], "common.admin_services.state.visible");
    sf_applyI18nText(modThs[6], "common.admin_services.table.order");
    sf_applyI18nText(modThs[7], "common.admin_services.table.actions");
  }

  // Package addons table headers
  const addThs = qsa("#adminPackageAddonsTable thead th");
  if (addThs.length >= 6) {
    sf_applyI18nText(addThs[0], "common.admin_services.table.addons.addon");
    sf_applyI18nText(addThs[1], "common.admin_services.state.active");
    sf_applyI18nText(addThs[2], "common.admin_services.state.visible");
    sf_applyI18nText(addThs[3], "common.admin_services.editor.attributes.extra_price");
    sf_applyI18nText(addThs[4], "common.admin_services.table.order");
    sf_applyI18nText(addThs[5], "common.admin_services.table.actions");
  }

  // Labels in Categories tab
  sf_applyI18nText(qs("#panel-categories .lhai-card__title"), "common.admin_services.categories.title");
  sf_applyI18nText(qs("#panel-categories > article > p.lhai-help"), "common.admin_services.categories.helper");
  sf_applyI18nText(qs("#adminCategoriesListStatus"), "common.admin_services.categories.status.select_category");
  const catThs = qsa("#adminCategoriesListTable thead th");
  if (catThs.length >= 4) {
    sf_applyI18nText(catThs[0], "common.admin_services.table.categories.category");
    sf_applyI18nText(catThs[1], "common.admin_services.table.categories.package_count");
    sf_applyI18nText(catThs[2], "common.admin_services.table.categories.service_count");
    sf_applyI18nText(catThs[3], "common.admin_services.state.active");
  }

  sf_applyI18nLabelFor("categoryDetailName", "common.admin_services.categories.editor.label.category_name");
  sf_applyI18nText(qs("#categoryDetailSaveBasicBtn"), "common.admin_services.common.save_basic_info");
  sf_applyI18nText(qs("#categoryDetailSaveStatusBtn"), "common.admin_services.common.save_status");
  sf_applyI18nLabelFor("categoryDetailActiveChk", "common.admin_services.state.active");
  sf_applyI18nText(qs("#categoryDangerHelp"), "common.admin_services.categories.danger.delete_safe_help");
  sf_applyI18nText(qs("#categoryPackageCreateHelp"), "common.admin_services.categories.actions.create_package_help");

  const catPackThs = qsa("#categoryPackagesTable thead th");
  if (catPackThs.length >= 2) {
    sf_applyI18nText(catPackThs[0], "common.admin_services.table.categories.packages.package");
    sf_applyI18nText(catPackThs[1], "common.admin_services.table.categories.packages.included_service_count");
  }

  // Category action buttons
  sf_applyI18nText(qs("#categoryArchiveBtn"), "common.admin_services.categories.actions.archive");
  sf_applyI18nText(qs("#categoryDeactivateBtn"), "common.admin_services.categories.actions.deactivate");
  sf_applyI18nText(qs("#categoryDeleteBtn"), "common.admin_services.categories.actions.delete_safe");
  sf_applyI18nText(qs("#categoryPackageCreateBtn"), "common.admin_services.categories.actions.create_package");

  // Add Package form labels
  sf_applyI18nLabelFor("categoryPackageCreateName", "common.admin_services.packages.editor.label.package_name");
  sf_applyI18nLabelFor("categoryPackageCreateDescription", "common.admin_services.packages.editor.label.description");
  sf_applyI18nLabelFor("categoryPackageCreateAiSupported", "common.admin_services.packages.editor.label.ai_supported");
  sf_applyI18nLabelFor("categoryPackageCreateBasePrice", "common.admin_services.packages.editor.label.base_price");
  sf_applyI18nLabelFor("categoryPackageCreateCurrency", "common.admin_services.packages.editor.label.currency");
  sf_applyI18nLabelFor("categoryPackageCreateVisible", "common.admin_services.state.visible");
  sf_applyI18nLabelFor("categoryPackageCreateActive", "common.admin_services.state.active");

  // Manage tab: Category / Package / Service (static HTML + shared action keys)
  sf_applyI18nText(qs("#manageEntityTabs button[data-manage-panel='manage-category-panel']"), "common.admin_services.manage.tab.category");
  sf_applyI18nText(qs("#manageEntityTabs button[data-manage-panel='manage-package-panel']"), "common.admin_services.manage.tab.package");
  sf_applyI18nText(qs("#manageEntityTabs button[data-manage-panel='manage-service-panel']"), "common.admin_services.manage.tab.service");

  sf_applyI18nText(qs("#manage-category-panel > h3"), "common.admin_services.manage.entity.category");
  sf_applyI18nText(qs("#manage-category-panel .admin-services__category-list-head .admin-services__manage-step"), "common.admin_services.manage.category.list_hint");
  sf_applyI18nText(qs("#manageCategoryCreateBtn"), "common.admin_services.manage.actions.new_category");
  sf_applyI18nText(qs("#manageCategoryEditorTitle"), "common.admin_services.manage.category.title_create");
  sf_applyI18nText(qs("#manageCategoryModeHint"), "common.admin_services.manage.mode.create");
  const mcatThs = qsa("#manageCategoryTable thead th");
  if (mcatThs.length >= 2) {
    sf_applyI18nText(mcatThs[0], "common.admin_services.table.manage.name");
    sf_applyI18nText(mcatThs[1], "common.admin_services.state.active");
  }
  sf_applyI18nText(qs("#manageCategoryForm .admin-services__editor-section:nth-of-type(1) .admin-services__editor-section-title"), "common.admin_services.editor.section.basic_info");
  sf_applyI18nLabelFor("manageCategoryName", "common.admin_services.categories.editor.label.category_name");
  sf_applyI18nLabelFor("manageCategoryDescription", "common.admin_services.editor.label.description");
  sf_applyI18nText(qs("#manageCategoryForm .admin-services__editor-section:nth-of-type(2) .admin-services__editor-section-title"), "common.admin_services.manage.section.status");
  sf_applyI18nText(qs("#manageCategoryForm .admin-services__switch-label"), "common.admin_services.state.active");
  sf_applyI18nText(qs("#manageCategoryForm .admin-services__bool-help"), "common.admin_services.manage.category.active_help");
  sf_applyI18nText(qs("#manageCategoryForm .admin-services__editor-section:nth-of-type(3) .admin-services__editor-section-title"), "common.admin_services.manage.section.actions");
  sf_applyI18nText(qs("#manageCategoryCreateSubmitBtn"), "common.actions.create");
  sf_applyI18nText(qs("#manageCategoryCancelCreateBtn"), "common.actions.cancel");
  sf_applyI18nText(qs("#manageCategorySaveSubmitBtn"), "common.actions.save_changes");
  sf_applyI18nText(qs("#manageCategoryCancelEditBtn"), "common.actions.cancel");
  sf_applyI18nText(qs("#manageCategoryDangerZone .admin-services__bool-help"), "common.admin_services.manage.danger.help");
  sf_applyI18nText(qs("#manageCategoryDeleteBtn"), "common.admin_services.manage.category.archive_safe");

  sf_applyI18nText(qs("#manage-package-panel > h3"), "common.admin_services.manage.entity.package");
  sf_applyI18nText(qs("#manage-package-panel .admin-services__package-list-head .admin-services__manage-step"), "common.admin_services.manage.package.list_hint");
  sf_applyI18nText(qs("#managePackageCreateBtn"), "common.admin_services.manage.actions.new_package");
  sf_applyI18nPlaceholder(qs("#managePackageSearch"), "common.admin_services.manage.package.search_placeholder");
  sf_applyI18nOptionText("#managePackageFilterCategory", "", "common.filters.all_categories");
  sf_applyI18nText(qs("#managePackageEditorTitle"), "common.admin_services.manage.package.title_create");
  sf_applyI18nText(qs("#managePackageModeHint"), "common.admin_services.manage.mode.create");
  const mpkgThs = qsa("#managePackageTable thead th");
  if (mpkgThs.length >= 6) {
    sf_applyI18nText(mpkgThs[0], "common.admin_services.table.manage.name");
    sf_applyI18nText(mpkgThs[1], "common.admin_services.filters.category");
    sf_applyI18nText(mpkgThs[2], "common.admin_services.state.active");
    sf_applyI18nText(mpkgThs[3], "common.admin_services.state.visible");
    sf_applyI18nText(mpkgThs[4], "common.admin_services.manage.badge.ai_short");
  }
  const pkgFormSections = qsa("#managePackageForm .admin-services__editor-section-title");
  if (pkgFormSections.length >= 7) {
    sf_applyI18nText(pkgFormSections[0], "common.admin_services.editor.section.basic_info");
    sf_applyI18nText(pkgFormSections[1], "common.admin_services.editor.section.assignment");
    sf_applyI18nText(pkgFormSections[2], "common.admin_services.manage.section.delivery");
    sf_applyI18nText(pkgFormSections[3], "common.admin_services.manage.section.pricing");
    sf_applyI18nText(pkgFormSections[4], "common.admin_services.manage.section.visibility_status");
    sf_applyI18nText(pkgFormSections[5], "common.admin_services.manage.section.composition");
    sf_applyI18nText(pkgFormSections[6], "common.admin_services.manage.section.actions");
  }
  sf_applyI18nLabelFor("managePackageName", "common.admin_services.packages.editor.label.package_name");
  sf_applyI18nLabelFor("managePackageDescription", "common.admin_services.manage.label.short_description");
  sf_applyI18nLabelFor("managePackageLongDescription", "common.admin_services.manage.label.long_description");
  sf_applyI18nLabelFor("managePackageCategoryId", "common.admin_services.filters.category");
  sf_applyI18nText(qs("label[for='managePackageAiSupported'] .admin-services__switch-label"), "common.admin_services.packages.editor.label.ai_supported");
  sf_applyI18nText(qs("#managePackageForm .admin-services__editor-section:nth-of-type(3) .admin-services__bool-help"), "common.admin_services.packages.editor.ai_supported_help");
  sf_applyI18nLabelFor("managePackageBasePrice", "common.admin_services.packages.editor.label.base_price");
  sf_applyI18nLabelFor("managePackageCurrency", "common.admin_services.packages.editor.label.currency");
  sf_applyI18nText(qs("label[for='managePackageVisible'] .admin-services__switch-label"), "common.admin_services.state.visible");
  sf_applyI18nText(qs("#managePackageForm .admin-services__bool-grid .admin-services__bool-control:nth-child(1) .admin-services__bool-help"), "common.admin_services.packages.visible_help");
  sf_applyI18nText(qs("label[for='managePackageActive'] .admin-services__switch-label"), "common.admin_services.state.active");
  sf_applyI18nText(qs("#managePackageForm .admin-services__bool-grid .admin-services__bool-control:nth-child(2) .admin-services__bool-help"), "common.admin_services.packages.active_help");
  sf_applyI18nLabelFor("managePackageAddModuleId", "common.admin_services.packages.editor.label.add_existing_module");
  sf_applyI18nText(qs("#managePackageAddModuleBtn"), "common.admin_services.packages.actions.add_module");
  sf_applyI18nLabelFor("managePackageAddAddonId", "common.admin_services.packages.editor.label.add_existing_addon");
  sf_applyI18nText(qs("#managePackageAddAddonBtn"), "common.admin_services.manage.actions.add_addon");
  const mcompThs = qsa("#managePackageCompositionTable thead th");
  if (mcompThs.length >= 4) {
    sf_applyI18nText(mcompThs[0], "common.admin_services.table.manage.name");
    sf_applyI18nText(mcompThs[1], "common.admin_services.table.inventory.type");
    sf_applyI18nText(mcompThs[2], "common.admin_services.table.modules.required");
    sf_applyI18nText(mcompThs[3], "common.admin_services.table.actions");
  }
  sf_applyI18nText(qs("#managePackageCreateSubmitBtn"), "common.actions.create");
  sf_applyI18nText(qs("#managePackageCancelCreateBtn"), "common.actions.cancel");
  sf_applyI18nText(qs("#managePackageSaveSubmitBtn"), "common.actions.save_changes");
  sf_applyI18nText(qs("#managePackageCancelEditBtn"), "common.actions.cancel");
  sf_applyI18nText(qs("#managePackageDangerZone .admin-services__bool-help"), "common.admin_services.manage.danger.help");
  sf_applyI18nText(qs("#managePackageDeleteBtn"), "common.admin_services.manage.package.archive_safe");

  sf_applyI18nText(qs("#manage-service-panel > h3"), "common.admin_services.manage.entity.service");
  sf_applyI18nText(qs("#manage-service-panel .admin-services__service-list-head .admin-services__manage-step"), "common.admin_services.manage.service.list_hint");
  sf_applyI18nText(qs("#manageServiceCreateBtn"), "common.admin_services.manage.actions.new_service");
  sf_applyI18nOptionText("#manageServiceFilterType", "", "common.admin_services.filters.all");
  sf_applyI18nOptionText("#manageServiceFilterType", "module", "common.admin_services.editor.type.module_ui");
  sf_applyI18nOptionText("#manageServiceFilterType", "addon", "common.admin_services.editor.type.addon_ui");
  sf_applyI18nOptionText("#manageServiceFilterCategory", "", "common.admin_services.filters.all");
  sf_applyI18nOptionText("#manageServiceFilterPackage", "", "common.admin_services.manage.filter.all_packages");
  sf_applyI18nOptionText("#manageServiceFilterActive", "", "common.admin_services.manage.filter.all_status");
  sf_applyI18nOptionText("#manageServiceFilterActive", "active", "common.admin_services.filters.active.active");
  sf_applyI18nOptionText("#manageServiceFilterActive", "inactive", "common.admin_services.filters.active.inactive");
  sf_applyI18nText(qs("#manageServiceEditorTitle"), "common.admin_services.manage.service.title_create");
  sf_applyI18nText(qs("#manageServiceModeHint"), "common.admin_services.manage.mode.create");
  const msvcThs = qsa("#manageServiceTable thead th");
  if (msvcThs.length >= 6) {
    sf_applyI18nText(msvcThs[0], "common.admin_services.table.manage.name");
    sf_applyI18nText(msvcThs[1], "common.admin_services.table.inventory.type");
    sf_applyI18nText(msvcThs[2], "common.admin_services.table.inventory.package");
    sf_applyI18nText(msvcThs[3], "common.admin_services.table.inventory.category");
    sf_applyI18nText(msvcThs[4], "common.admin_services.state.active");
    sf_applyI18nText(msvcThs[5], "common.admin_services.state.visible");
  }
  const svcFormSections = qsa("#manageServiceForm .admin-services__editor-section-title");
  if (svcFormSections.length >= 6) {
    sf_applyI18nText(svcFormSections[0], "common.admin_services.editor.section.basic_info");
    sf_applyI18nText(svcFormSections[1], "common.admin_services.editor.section.type_header");
    sf_applyI18nText(svcFormSections[2], "common.admin_services.editor.section.assignment");
    sf_applyI18nText(svcFormSections[3], "common.admin_services.manage.section.delivery");
    sf_applyI18nText(svcFormSections[4], "common.admin_services.manage.section.pricing_extra");
    sf_applyI18nText(svcFormSections[5], "common.admin_services.manage.section.visibility_status");
  }
  sf_applyI18nLabelFor("manageServiceName", "common.admin_services.editor.label.service_name");
  sf_applyI18nLabelFor("manageServiceDescription", "common.admin_services.editor.label.description");
  sf_applyI18nLabelFor("manageServiceType", "common.admin_services.editor.section.type");
  sf_applyI18nOptionText("#manageServiceType", "module", "common.admin_services.editor.type.module_ui");
  sf_applyI18nOptionText("#manageServiceType", "addon", "common.admin_services.editor.type.addon_ui");
  sf_applyI18nLabelFor("manageServiceCategoryId", "common.admin_services.filters.category");
  sf_applyI18nLabelFor("manageServicePackageId", "common.admin_services.editor.assignment.package");
  sf_applyI18nText(qs("label[for='manageServiceAiCapable'] .admin-services__switch-label"), "common.admin_services.manage.service.ai_capable");
  sf_applyI18nText(qs("#manageServiceForm .admin-services__editor-section:nth-of-type(4) .admin-services__bool-grid .admin-services__bool-control:nth-child(1) .admin-services__bool-help"), "common.admin_services.manage.service.ai_capable_help");
  sf_applyI18nText(qs("label[for='manageServiceInPersonRequired'] .admin-services__switch-label"), "common.admin_services.manage.service.in_person_required");
  sf_applyI18nText(qs("#manageServiceForm .admin-services__editor-section:nth-of-type(4) .admin-services__bool-grid .admin-services__bool-control:nth-child(2) .admin-services__bool-help"), "common.admin_services.manage.service.in_person_help");
  sf_applyI18nLabelFor("manageServiceExtraPrice", "common.admin_services.manage.label.extra_price_addon");
  sf_applyI18nText(qs("label[for='manageServiceVisible'] .admin-services__switch-label"), "common.admin_services.state.visible");
  sf_applyI18nText(qs("#manageServiceForm .admin-services__editor-section:nth-of-type(6) .admin-services__bool-grid .admin-services__bool-control:nth-child(1) .admin-services__bool-help"), "common.admin_services.manage.service.visible_help");
  sf_applyI18nText(qs("label[for='manageServiceActive'] .admin-services__switch-label"), "common.admin_services.state.active");
  sf_applyI18nText(qs("#manageServiceForm .admin-services__editor-section:nth-of-type(6) .admin-services__bool-grid .admin-services__bool-control:nth-child(2) .admin-services__bool-help"), "common.admin_services.manage.service.active_help");
  sf_applyI18nText(qs("#manageServiceForm .admin-services__editor-section:nth-of-type(7) .admin-services__editor-section-title"), "common.admin_services.manage.section.actions");
  sf_applyI18nText(qs("#manageServiceCreateSubmitBtn"), "common.actions.create");
  sf_applyI18nText(qs("#manageServiceCancelCreateBtn"), "common.actions.cancel");
  sf_applyI18nText(qs("#manageServiceSaveSubmitBtn"), "common.actions.save_changes");
  sf_applyI18nText(qs("#manageServiceCancelEditBtn"), "common.actions.cancel");
  sf_applyI18nText(qs("#manageServiceDangerZone .admin-services__bool-help"), "common.admin_services.manage.service.danger_help");
  sf_applyI18nText(qs("#manageServiceArchiveBtn"), "common.admin_services.manage.service.archive");

  // Labels in Hierarchy tab
  sf_applyI18nText(qs("#panel-hierarchy .lhai-card__title"), "common.admin_services.hierarchy.title");
  sf_applyI18nText(qs("#panel-hierarchy > article > p.lhai-help"), "common.admin_services.hierarchy.helper");
  sf_applyI18nText(qs("#adminHierarchyStatus"), "common.loading");
  const hierStatus = qs("#adminHierarchyStatus");
  if (hierStatus && hierStatus.textContent === "로딩 중…") {
    // Fallback if key isn't in bundle.
    sf_applyI18nText(hierStatus, "common.loading");
  }
}
let sf_selectedRow = null; // inventory row (link-based)
let sf_editorMode = "none"; // "none" | "create" | "edit"
let sf_searchDebounceTimer = null;

// Packages tab state (composition management)
let pk_selectedPackageId = "";
let pk_rowsForSelectedPackage = []; // inventory rows (both module/addon) for selected package
let pk_modulesRows = [];
let pk_addonsRows = [];
let pk_allInventoryRows = [];
let pk_packageCountsById = new Map();
let pk_availableModules = [];
let pk_availableAddons = [];

function sf_setText(sel, text) {
  const el = qs(sel);
  if (el) el.textContent = text;
}

function sf_parseBoolOrNull(v) {
  if (v === "" || v === null || v === undefined) return null;
  if (v === "true") return true;
  if (v === "false") return false;
  return null;
}

function sf_boolBadge(value, labelTrue = "Yes", labelFalse = "No") {
  return value ? `<span class="lhai-badge lhai-badge--status-active">${labelTrue}</span>` : `<span class="lhai-badge">${labelFalse}</span>`;
}

function sf_renderInventoryTable(rows) {
  const tbody = qs("#adminInventoryTable");
  if (!tbody) return;

  if (!rows.length) {
    tbody.innerHTML = `<tr><td colspan='7'>${esc(t("common.admin_services.empty.inventory_items", "No service inventory items"))}</td></tr>`;
    return;
  }

  const selectedLinkId = qs("#serviceEditorCurrentLinkId")?.value || "";
  const activeTrue = sfAdminI18n.activeTrue || "Active";
  const activeFalse = sfAdminI18n.activeFalse || "Inactive";
  const visibleTrue = sfAdminI18n.visibleTrue || "Visible";
  const visibleFalse = sfAdminI18n.visibleFalse || "Hidden";
  const typeModuleLabel = sfAdminI18n.typeModule || "module";
  const typeAddonLabel = sfAdminI18n.typeAddon || "addon";

  tbody.innerHTML = rows
    .slice()
    .sort((a, b) => {
      const c = (a.category_name || "").localeCompare(b.category_name || "");
      if (c !== 0) return c;
      const p = (a.package_name || "").localeCompare(b.package_name || "");
      if (p !== 0) return p;
      return (Number(a.sort_order ?? 0) - Number(b.sort_order ?? 0)) || String(a.service_item_id).localeCompare(String(b.service_item_id));
    })
    .map((r) => {
      const isSelected = String(r.package_service_link_id) === selectedLinkId && sf_editorMode !== "create";
      const typeLabel = r.type === "module" ? typeModuleLabel : r.type === "addon" ? typeAddonLabel : esc(r.type || "");
      return `
        <tr class="${isSelected ? "is-selected" : ""}" data-service-item-id="${esc(r.service_item_id)}" data-package-id="${esc(r.package_id)}" data-link-id="${esc(r.package_service_link_id)}">
          <td><strong>${esc(r.name || "-")}</strong><br/><span class="u-text-muted">${esc(r.description || "")}</span></td>
          <td>${typeLabel}</td>
          <td>
            <strong>${esc(r.package_name || "-")}</strong>
            <br/><span class="u-text-muted">${sf_boolBadge(Boolean(r.package_active), activeTrue, activeFalse)} ${sf_boolBadge(Boolean(r.package_visible), visibleTrue, visibleFalse)}</span>
          </td>
          <td>
            <strong>${esc(r.category_name || "-")}</strong>
            <br/><span class="u-text-muted">${sf_boolBadge(Boolean(r.category_active), activeTrue, activeFalse)} ${sf_boolBadge(Boolean(r.category_visible), visibleTrue, visibleFalse)}</span>
          </td>
          <td>${sf_boolBadge(Boolean(r.active), activeTrue, activeFalse)}</td>
          <td>${sf_boolBadge(Boolean(r.visible), visibleTrue, visibleFalse)}</td>
          <td>
            <div class="admin-services__row-actions">
              <button type="button" class="lhai-button lhai-button--secondary lhai-button--compact admin-services__mini-btn" data-action="select">${esc(
                t("common.admin_services.actions.edit", "Edit")
              )}</button>
            </div>
          </td>
        </tr>
      `;
    })
    .join("");
}

function sf_resetEditor() {
  sf_selectedRow = null;
  sf_editorMode = "none";

  qs("#serviceEditorMode")?.setAttribute("value", "none");
  qs("#serviceEditorServiceItemId").value = "";
  qs("#serviceEditorCurrentPackageId").value = "";
  qs("#serviceEditorCurrentLinkId").value = "";

  qs("#serviceEditorName").value = "";
  qs("#serviceEditorDescription").value = "";

  qs("#serviceEditorTypeSelect").value = "module";
  qs("#serviceEditorTypeSelect").disabled = false;
  qs("#serviceEditorTypeNote") && (qs("#serviceEditorTypeNote").hidden = false);

  qs("#serviceEditorAiCapable").checked = false;
  qs("#serviceEditorInPersonRequired").checked = false;

  qs("#serviceEditorAddonPricingBlock") && (qs("#serviceEditorAddonPricingBlock").hidden = true);

  qs("#serviceEditorPackageId").value = sf_packages[0]?.id || "";
  {
    const firstPkg = sf_packages?.find((p) => p.id === qs("#serviceEditorPackageId")?.value);
    const cat = sf_categories?.find((c) => c.id === firstPkg?.category_id);
    qs("#serviceEditorCategoryName").value = cat?.name || "";
  }

  qs("#serviceEditorActive").checked = true;
  qs("#serviceEditorVisible").checked = true;

  qs("#serviceSystemId").textContent = "";
  qs("#serviceSystemCode").textContent = "";
  qs("#serviceSystemSlug").textContent = "";

  // Buttons
  qs("#serviceEditorPrimaryBtn").textContent = t("common.admin_services.editor.actions.create_assign", "Create & Assign");
  qs("#serviceEditorPrimaryBtn").disabled = false;

  qs("#serviceRemoveLinkBtn").disabled = true;
  qs("#serviceReorderUpBtn").disabled = true;
  qs("#serviceReorderDownBtn").disabled = true;

  sf_setText("#serviceEditorSubtitle", t("common.admin_services.editor.subtitle.click_to_edit", "row를 클릭해 편집하세요."));
}

function sf_fillEditorFromRow(row) {
  sf_selectedRow = row;
  sf_editorMode = "edit";
  qs("#serviceEditorMode").setAttribute("value", "edit");
  qs("#serviceEditorServiceItemId").value = row.service_item_id || "";
  qs("#serviceEditorCurrentPackageId").value = row.package_id || "";
  qs("#serviceEditorCurrentLinkId").value = row.package_service_link_id || "";

  qs("#serviceEditorName").value = row.name || "";
  qs("#serviceEditorDescription").value = row.description || "";

  qs("#serviceEditorTypeSelect").value = row.type || "module";
  qs("#serviceEditorTypeSelect").disabled = true;

  qs("#serviceEditorTypeNote") && (qs("#serviceEditorTypeNote").hidden = true);

  qs("#serviceEditorAiCapable").checked = Boolean(row.ai_capable);
  qs("#serviceEditorInPersonRequired").checked = Boolean(row.in_person_required);

  const isAddon = row.type === "addon";
  qs("#serviceEditorAddonPricingBlock").hidden = !isAddon;
  if (isAddon) {
    qs("#serviceEditorExtraPrice").value = Number(row.extra_price ?? 0);
    qs("#serviceEditorCurrency").value = row.currency || "USD";
  }

  qs("#serviceEditorPackageId").value = row.package_id || "";
  qs("#serviceEditorCategoryName").value = row.category_name || "";

  qs("#serviceEditorActive").checked = Boolean(row.active);
  qs("#serviceEditorVisible").checked = Boolean(row.visible);

  qs("#serviceSystemId").textContent = row.service_item_id || "";
  qs("#serviceSystemCode").textContent = row.code || "";
  qs("#serviceSystemSlug").textContent = row.slug || "";

  qs("#serviceEditorPrimaryBtn").textContent = "Save changes";

  qs("#serviceRemoveLinkBtn").disabled = false;
  qs("#serviceReorderUpBtn").disabled = false;
  qs("#serviceReorderDownBtn").disabled = false;

  sf_setText(
    "#serviceEditorSubtitle",
    `${row.type === "module" ? "모듈" : "애드온"} · ${row.package_name || ""} / ${row.category_name || ""}`
  );
}

function sf_beginCreateMode() {
  sf_selectedRow = null;
  sf_editorMode = "create";

  qs("#serviceEditorMode").setAttribute("value", "create");
  qs("#serviceEditorServiceItemId").value = "";
  qs("#serviceEditorCurrentPackageId").value = "";
  qs("#serviceEditorCurrentLinkId").value = "";

  qs("#serviceEditorName").value = "";
  qs("#serviceEditorDescription").value = "";

  qs("#serviceEditorTypeSelect").disabled = false;
  qs("#serviceEditorTypeSelect").value = "module";
  qs("#serviceEditorTypeNote") && (qs("#serviceEditorTypeNote").hidden = false);

  qs("#serviceEditorAiCapable").checked = false;
  qs("#serviceEditorInPersonRequired").checked = false;

  qs("#serviceEditorAddonPricingBlock").hidden = true;

  qs("#serviceEditorPackageId").value = sf_packages[0]?.id || "";
  const firstPkg = sf_packages?.find((p) => p.id === qs("#serviceEditorPackageId")?.value);
  const cat = sf_categories?.find((c) => c.id === firstPkg?.category_id);
  qs("#serviceEditorCategoryName").value = cat?.name || "";

  qs("#serviceEditorActive").checked = true;
  qs("#serviceEditorVisible").checked = true;

  qs("#serviceSystemId").textContent = "";
  qs("#serviceSystemCode").textContent = "";
  qs("#serviceSystemSlug").textContent = "";

  qs("#serviceEditorPrimaryBtn").textContent = t("common.admin_services.editor.actions.create_assign", "Create & Assign");

  qs("#serviceRemoveLinkBtn").disabled = true;
  qs("#serviceReorderUpBtn").disabled = true;
  qs("#serviceReorderDownBtn").disabled = true;

  sf_setText("#serviceEditorSubtitle", t("common.admin_services.editor.subtitle.create_and_assign", "서비스 아이템을 만든 뒤, 패키지에 연결합니다."));
}

function sf_refreshPackageSelectForEditor() {
  const select = qs("#serviceEditorPackageId");
  if (!select) return;
  const options = sf_packages
    .slice()
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
    .map((p) => `<option value="${esc(p.id)}">${esc(p.name)}</option>`)
    .join("");
  select.innerHTML = options;
}

async function sf_loadInventory() {
  const statusEl = qs("#adminInventoryStatus");
  if (statusEl) statusEl.textContent = "Loading inventory…";

  const typeVal = qs("#inventoryFilterType")?.value || "";
  const catId = qs("#inventoryFilterCategoryId")?.value || "";
  const pkgId = qs("#inventoryFilterPackageId")?.value || "";
  const activeVal = sf_parseBoolOrNull(qs("#inventoryFilterActive")?.value || "");
  const visibleVal = sf_parseBoolOrNull(qs("#inventoryFilterVisible")?.value || "");
  const search = (qs("#inventorySearch")?.value || "").trim().toLowerCase();

  const rows = await serviceCatalogAdminApi.listServiceItemInventory({
    type: typeVal || null,
    category_id: catId || null,
    package_id: pkgId || null,
    active: activeVal,
    visible: visibleVal,
  });

  let filtered = Array.isArray(rows) ? rows : [];
  if (search) {
    filtered = filtered.filter((r) => {
      const hay = `${r.name || ""} ${r.description || ""} ${r.category_name || ""} ${r.package_name || ""}`.toLowerCase();
      return hay.includes(search);
    });
  }

  sf_inventoryRows = filtered;
  sf_renderInventoryTable(sf_inventoryRows);

  if (statusEl) statusEl.textContent = `${sf_inventoryRows.length} rows`;
}

async function sf_selectByServiceAndPackage(serviceItemId, packageId) {
  if (!serviceItemId || !packageId) return;
  const row = sf_inventoryRows.find((r) => String(r.service_item_id) === String(serviceItemId) && String(r.package_id) === String(packageId));
  if (row) sf_fillEditorFromRow(row);
}

async function sf_updateReorderButtonState() {
  if (sf_editorMode !== "edit" || !sf_selectedRow) return;
  const pkgId = qs("#serviceEditorCurrentPackageId").value;
  const serviceItemId = qs("#serviceEditorServiceItemId").value;
  if (!pkgId || !serviceItemId) return;

  const rows = await serviceCatalogAdminApi.listServiceItemInventory({ package_id: pkgId, type: null, active: null, visible: null });
  const list = (Array.isArray(rows) ? rows : [])
    .slice()
    .sort((a, b) => (Number(a.sort_order ?? 0) - Number(b.sort_order ?? 0)) || String(a.service_item_id).localeCompare(String(b.service_item_id)));
  const ids = list.map((r) => r.service_item_id);
  const idx = ids.indexOf(serviceItemId);

  const upBtn = qs("#serviceReorderUpBtn");
  const downBtn = qs("#serviceReorderDownBtn");
  if (upBtn) upBtn.disabled = idx <= 0;
  if (downBtn) downBtn.disabled = idx < 0 || idx >= ids.length - 1;
}

async function sf_reorder(dir) {
  if (sf_editorMode !== "edit" || !sf_selectedRow) return;
  const pkgId = qs("#serviceEditorCurrentPackageId").value;
  const serviceItemId = qs("#serviceEditorServiceItemId").value;
  if (!pkgId || !serviceItemId) return;

  const rows = await serviceCatalogAdminApi.listServiceItemInventory({ package_id: pkgId, type: null, active: null, visible: null });
  const list = (Array.isArray(rows) ? rows : [])
    .slice()
    .sort((a, b) => (Number(a.sort_order ?? 0) - Number(b.sort_order ?? 0)) || String(a.service_item_id).localeCompare(String(b.service_item_id)));
  const ids = list.map((r) => r.service_item_id);
  const idx = ids.indexOf(serviceItemId);
  if (idx < 0) return;

  const nextIdx = dir === "up" ? idx - 1 : idx + 1;
  if (nextIdx < 0 || nextIdx >= ids.length) return;

  const nextIds = ids.slice();
  const tmp = nextIds[idx];
  nextIds[idx] = nextIds[nextIdx];
  nextIds[nextIdx] = tmp;

  await serviceCatalogAdminApi.reorderServiceItemsInPackage(pkgId, nextIds);
  await sf_loadInventory();
  await sf_selectByServiceAndPackage(serviceItemId, pkgId);
  await sf_updateReorderButtonState();
}

async function sf_saveEditor() {
  const mode = qs("#serviceEditorMode").getAttribute("value") || "none";
  const name = (qs("#serviceEditorName")?.value || "").trim();
  const desc = qs("#serviceEditorDescription")?.value || "";
  const typeVal = qs("#serviceEditorTypeSelect")?.value || "module";
  const aiCapable = Boolean(qs("#serviceEditorAiCapable")?.checked);
  const inPersonRequired = Boolean(qs("#serviceEditorInPersonRequired")?.checked);
  const active = Boolean(qs("#serviceEditorActive")?.checked);
  const visible = Boolean(qs("#serviceEditorVisible")?.checked);
  const packageId = qs("#serviceEditorPackageId")?.value || "";
  const extraPrice = Number(qs("#serviceEditorExtraPrice")?.value || 0);
  const currency = (qs("#serviceEditorCurrency")?.value || "USD").trim() || "USD";

  if (!name) {
    sf_setText(
      "#serviceEditorSubtitle",
      t("common.admin_services.validation.name_required", "name is required.")
    );
    return;
  }
  if (!packageId && mode !== "none") {
    sf_setText(
      "#serviceEditorSubtitle",
      t("common.admin_services.validation.package_required", "package is required.")
    );
    return;
  }

  const primaryBtn = qs("#serviceEditorPrimaryBtn");
  if (primaryBtn) primaryBtn.disabled = true;
  try {
    if (mode === "create") {
      const created = await serviceCatalogAdminApi.createServiceItem({
        type: typeVal,
        name,
        description: desc,
        ai_capable: aiCapable,
        in_person_required: inPersonRequired,
        extra_price: typeVal === "addon" ? extraPrice : 0,
        currency,
        active,
        visible,
      });
      await serviceCatalogAdminApi.addServiceItemToPackage(packageId, {
        service_item_id: created.id,
        required: false,
        sort_order: null,
      });
      await sf_loadInventory();
      await sf_selectByServiceAndPackage(created.id, packageId);
      await sf_updateReorderButtonState();
    } else if (mode === "edit") {
      const serviceItemId = qs("#serviceEditorServiceItemId").value;
      const currentPackageId = qs("#serviceEditorCurrentPackageId").value;
      if (!serviceItemId) return;

      await serviceCatalogAdminApi.updateServiceItem(serviceItemId, {
        name,
        description: desc,
        ai_capable: aiCapable,
        in_person_required: inPersonRequired,
        active,
        visible,
        extra_price: typeVal === "addon" ? extraPrice : 0,
        currency,
      });

      const targetPackageId = packageId || currentPackageId;
      if (targetPackageId && String(targetPackageId) !== String(currentPackageId)) {
        // Move link
        await serviceCatalogAdminApi.removeServiceItemFromPackage(currentPackageId, serviceItemId);
        await serviceCatalogAdminApi.addServiceItemToPackage(targetPackageId, {
          service_item_id: serviceItemId,
          required: false,
          sort_order: null,
        });
      } else {
        // Required flag is managed in the Packages tab composition editor.
      }

      await sf_loadInventory();
      await sf_selectByServiceAndPackage(serviceItemId, targetPackageId);
      await sf_updateReorderButtonState();
    }
  } catch (err) {
    sf_setText("#serviceEditorSubtitle", `Error: ${err?.message || err}`);
  } finally {
    if (primaryBtn) primaryBtn.disabled = false;
  }
}

async function sf_archiveSelected() {
  const mode = qs("#serviceEditorMode").getAttribute("value") || "none";
  if (mode !== "edit") return;
  const serviceItemId = qs("#serviceEditorServiceItemId").value;
  if (!serviceItemId) return;
  if (!window.confirm(t("common.admin_services.service.confirm.archive", "Archive this service item?"))) return;

  await serviceCatalogAdminApi.archiveServiceItem(serviceItemId);
  await sf_loadInventory();
  sf_resetEditor();
}

async function sf_deleteSelected() {
  const mode = qs("#serviceEditorMode").getAttribute("value") || "none";
  if (mode !== "edit") return;
  const serviceItemId = qs("#serviceEditorServiceItemId").value;
  if (!serviceItemId) return;
  if (!window.confirm(t("common.admin_services.service.confirm.delete_safe", "Safe delete this service item? This may be blocked if linked or historically used."))) return;

  try {
    await serviceCatalogAdminApi.deleteServiceItem(serviceItemId);
    await sf_loadInventory();
    sf_resetEditor();
  } catch (err) {
    sf_setText(
      "#serviceEditorSubtitle",
      `${t("common.admin_services.service.delete_blocked_prefix", "Delete blocked:")} ${err?.message || err}`
    );
  }
}

async function sf_removeLink() {
  if (sf_editorMode !== "edit") return;
  const serviceItemId = qs("#serviceEditorServiceItemId").value;
  const packageId = qs("#serviceEditorCurrentPackageId").value;
  if (!serviceItemId || !packageId) return;
  if (!window.confirm(t("common.admin_services.service.confirm.remove_from_package", "Remove from current package?"))) return;

  await serviceCatalogAdminApi.removeServiceItemFromPackage(packageId, serviceItemId);
  await sf_loadInventory();

  // Try to keep selection: pick first row for same service_item_id
  const next = sf_inventoryRows.find((r) => String(r.service_item_id) === String(serviceItemId));
  if (next) {
    sf_fillEditorFromRow(next);
    await sf_updateReorderButtonState();
  } else {
    sf_resetEditor();
  }
}

async function initAdminServicesServiceFirstPage() {
  if (!protectCurrentPage()) return;
  if (!ensureAdminAccess()) return;

  await loadSidebar("#sidebar", "admin");

  const tabsRoot = qs("#adminServicesTopTabs");
  const panelsRoot = qs("#adminServicesTopPanels");
  mountTabs(tabsRoot, panelsRoot, { defaultPanelId: "panel-inventory" });

  // i18n: admin-services uses common domain.
  const lang = document.documentElement.lang || "ko";
  await initI18nDomains(["common"], lang);
  applyI18nToDom(document);
  sf_applyAdminServicesI18n();

  sf_categories = await serviceCatalogAdminApi.listCategories(true);
  sf_packages = await serviceCatalogAdminApi.listPackages(true, null);

  // Filter selects
  const catSel = qs("#inventoryFilterCategoryId");
  if (catSel) {
    catSel.innerHTML = `<option value="">${t("common.admin_services.filters.all", "All")}</option>` + sf_categories.map((c) => `<option value="${esc(c.id)}">${esc(c.name)}</option>`).join("");
  }
  const pkgSel = qs("#inventoryFilterPackageId");
  if (pkgSel) {
    pkgSel.innerHTML = `<option value="">${t("common.admin_services.filters.all", "All")}</option>` + sf_packages.map((p) => `<option value="${esc(p.id)}">${esc(p.name)}</option>`).join("");
  }
  sf_refreshPackageSelectForEditor();

  // Categories filter change => update packages filter
  qs("#inventoryFilterCategoryId")?.addEventListener("change", async () => {
    const nextCatId = qs("#inventoryFilterCategoryId").value || "";
    if (pkgSel) {
      const list = sf_packages.filter((p) => !nextCatId || String(p.category_id) === String(nextCatId));
      pkgSel.innerHTML = `<option value="">${t("common.admin_services.filters.all", "All")}</option>` + list.map((p) => `<option value="${esc(p.id)}">${esc(p.name)}</option>`).join("");
      if (!list.some((p) => p.id === pkgSel.value)) pkgSel.value = "";
    }
    await sf_loadInventory();
  });

  // Filter change reload
  const reloadOnChange = async () => {
    await sf_loadInventory();
  };
  ["#inventoryFilterType", "#inventoryFilterActive", "#inventoryFilterVisible", "#inventoryFilterPackageId"].forEach((id) => {
    qs(id)?.addEventListener("change", reloadOnChange);
  });

  // Search debounce
  qs("#inventorySearch")?.addEventListener("input", () => {
    if (sf_searchDebounceTimer) clearTimeout(sf_searchDebounceTimer);
    sf_searchDebounceTimer = setTimeout(() => sf_loadInventory(), 300);
  });

  // Row selection
  qs("#adminInventoryTable")?.addEventListener("click", async (e) => {
    const btn = e.target.closest("button[data-action]");
    const tr = e.target.closest("tr[data-service-item-id]");
    if (!tr) return;
    const row = sf_inventoryRows.find((r) => String(r.service_item_id) === String(tr.dataset.serviceItemId) && String(r.package_id) === String(tr.dataset.packageId) && String(r.package_service_link_id) === String(tr.dataset.linkId));
    if (!row) return;
    sf_fillEditorFromRow(row);
    await sf_updateReorderButtonState();
  });

  // Editor actions
  qs("#inventoryAddServiceBtn")?.addEventListener("click", () => sf_beginCreateMode());
  qs("#serviceClearSelectionBtn")?.addEventListener("click", () => sf_resetEditor());
  qs("#serviceEditorPrimaryBtn")?.addEventListener("click", () => sf_saveEditor());
  qs("#serviceArchiveBtn")?.addEventListener("click", () => sf_archiveSelected());
  qs("#serviceDeleteBtn")?.addEventListener("click", () => sf_deleteSelected());
  qs("#serviceDeactivateBtn")?.addEventListener("click", async () => {
    if (sf_editorMode !== "edit") return;
    const serviceItemId = qs("#serviceEditorServiceItemId")?.value || "";
    if (!serviceItemId) return;
    await serviceCatalogAdminApi.setServiceItemActivation(serviceItemId, false);
    await sf_loadInventory();
    await sf_selectByServiceAndPackage(serviceItemId, qs("#serviceEditorCurrentPackageId")?.value || "");
  });
  qs("#serviceHideBtn")?.addEventListener("click", async () => {
    if (sf_editorMode !== "edit") return;
    const serviceItemId = qs("#serviceEditorServiceItemId")?.value || "";
    if (!serviceItemId) return;
    await serviceCatalogAdminApi.setServiceItemVisibility(serviceItemId, false);
    await sf_loadInventory();
    await sf_selectByServiceAndPackage(serviceItemId, qs("#serviceEditorCurrentPackageId")?.value || "");
  });
  qs("#serviceRemoveLinkBtn")?.addEventListener("click", () => sf_removeLink());
  qs("#serviceReorderUpBtn")?.addEventListener("click", () => sf_reorder("up"));
  qs("#serviceReorderDownBtn")?.addEventListener("click", () => sf_reorder("down"));

  qs("#serviceEditorTypeSelect")?.addEventListener("change", () => {
    const typeVal = qs("#serviceEditorTypeSelect").value;
    qs("#serviceEditorAddonPricingBlock").hidden = typeVal !== "addon";
  });

  // Category display is derived from selected package.
  qs("#serviceEditorPackageId")?.addEventListener("change", () => {
    const pkgId = qs("#serviceEditorPackageId")?.value || "";
    const pkg = (sf_packages || []).find((p) => String(p.id) === String(pkgId));
    const cat = (sf_categories || []).find((c) => String(c.id) === String(pkg?.category_id));
    if (qs("#serviceEditorCategoryName")) qs("#serviceEditorCategoryName").value = cat?.name || "";
  });

  qs("#inventoryAddPackageBtn")?.addEventListener("click", () => {
    // Switch to packages panel
    const btn = qs('#adminServicesTopTabs button[data-panel="panel-packages"]');
    if (btn) btn.click();
  });
  qs("#inventoryAddCategoryBtn")?.addEventListener("click", () => {
    const btn = qs('#adminServicesTopTabs button[data-panel="panel-categories"]');
    if (btn) btn.click();
  });

  // Packages tab (composition) init
  await pk_initPackagesTab();

  // Categories tab init
  await pk_initCategoriesTab();

  // Hierarchy tab initial render
  await sf_renderHierarchyTab();
}

function sf_renderPackageCategoryOptions() {
  const sel = qs("#packageCreateCategoryId");
  if (!sel) return;
  sel.innerHTML = sf_categories.map((c) => `<option value="${esc(c.id)}">${esc(c.name)}</option>`).join("");
  if (!sel.value && sf_categories[0]) sel.value = sf_categories[0].id;
}

async function sf_renderCategoriesTab() {
  const tbody = qs("#adminCategoriesTable");
  if (!tbody) return;
  const list = (sf_categories || []).slice().sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
  if (!list.length) {
    tbody.innerHTML = `<tr><td colspan='3'>${esc(t("common.admin_services.empty.categories", "No categories"))}</td></tr>`;
    return;
  }
  const activeTrue = sfAdminI18n.activeTrue || "Active";
  const activeFalse = sfAdminI18n.activeFalse || "Inactive";
  const visibleTrue = sfAdminI18n.visibleTrue || "Visible";
  const visibleFalse = sfAdminI18n.visibleFalse || "Hidden";
  tbody.innerHTML = list
    .map((c) => {
      const isActive = Boolean(c.active);
      const isVisible = c.visible === undefined ? true : Boolean(c.visible);
      return `
        <tr data-cat-id="${esc(c.id)}">
          <td><strong>${esc(c.name)}</strong></td>
          <td>${sf_boolBadge(isActive, activeTrue, activeFalse)} ${sf_boolBadge(isVisible, visibleTrue, visibleFalse)}</td>
          <td>
            <div class="admin-services__row-actions">
              <button type="button" class="lhai-button lhai-button--secondary lhai-button--compact admin-services__mini-btn" data-action="edit">${esc(
                t("common.admin_services.actions.edit", "Edit")
              )}</button>
              <button type="button" class="lhai-button lhai-button--secondary lhai-button--compact admin-services__mini-btn" data-action="archive">${esc(
                t("common.admin_services.categories.actions.archive", "Archive")
              )}</button>
            </div>
          </td>
        </tr>
      `;
    })
    .join("");

  tbody.onclick = null;
  tbody.addEventListener("click", async (e) => {
    const btn = e.target.closest("button[data-action]");
    const tr = e.target.closest("tr[data-cat-id]");
    if (!btn || !tr) return;
    const id = tr.getAttribute("data-cat-id");
    const action = btn.getAttribute("data-action");
    const cat = sf_categories.find((x) => x.id === id);
    if (!cat) return;
    if (action === "edit") {
      qs("#categoryEditorId").value = cat.id;
      qs("#categoryCreateName").value = cat.name || "";
      qs("#categoryCreateDescription").value = cat.description || "";
      qs("#categoryCreateActive").checked = Boolean(cat.active);
      qs("#categoryCreateVisible").checked = cat.visible === undefined ? true : Boolean(cat.visible);
      qs("#categoryCreateSortOrder").value = cat.sort_order ?? 0;
    } else if (action === "archive") {
      if (!window.confirm("Archive this category?")) return;
      await serviceCatalogAdminApi.archiveCategory(id);
      sf_categories = await serviceCatalogAdminApi.listCategories(true);
      await sf_renderCategoriesTab();
      await sf_loadInventory();
      sf_renderPackageCategoryOptions();
    }
  });
}

function pk_setPackagesEditorEnabled(enabled) {
  const root = qs("#packageComposeSelectedId");
  // root is hidden input; use other controls for disabling.
  const ids = [
    "#packageComposeName",
    "#packageComposeDescription",
    "#packageComposeCategoryId",
    "#packageComposeAiSupported",
    "#packageComposeBasePrice",
    "#packageComposeCurrency",
    "#packageComposeVisibleChk",
    "#packageComposeActiveChk",
    "#packageComposeSaveBasicBtn",
    "#packageComposeSaveStatusBtn",
    "#packageComposeDeactivateBtn",
    "#packageComposeArchiveBtn",
    "#packageComposeDeleteBtn",
    "#packageAddModuleSelect",
    "#packageAddModuleRequiredChk",
    "#packageAddModuleBtn",
    "#packageAddAddonSelect",
    "#packageAddAddonBtn",
  ];
  ids.forEach((sel) => {
    const el = qs(sel);
    if (!el) return;
    if (el.type === "checkbox") el.disabled = !enabled;
    else el.disabled = !enabled;
  });
}

function pk_renderPackageListRows() {
  const tbody = qs("#adminPackagesComposeTable");
  if (!tbody) return;

  const list = (sf_packages || []).slice().sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
  if (!list.length) {
    tbody.innerHTML = `<tr><td colspan='6'>${esc(t("common.admin_services.empty.packages", "No packages"))}</td></tr>`;
    return;
  }

  const categoryNameById = Object.fromEntries((sf_categories || []).map((c) => [c.id, c.name]));
  const activeTrue = sfAdminI18n.activeTrue || "Active";
  const activeFalse = sfAdminI18n.activeFalse || "Inactive";
  const visibleTrue = sfAdminI18n.visibleTrue || "Visible";
  const visibleFalse = sfAdminI18n.visibleFalse || "Hidden";

  tbody.innerHTML = list
    .map((p) => {
      const isSelected = String(p.id) === String(pk_selectedPackageId);
      const count = pk_packageCountsById.get(p.id) || 0;
      return `
        <tr class="${isSelected ? "is-selected" : ""}" data-pkg-id="${esc(p.id)}">
          <td><strong>${esc(p.name || "-")}</strong></td>
          <td>${esc(categoryNameById[p.category_id] || t("common.admin_services.misc.uncategorized", "Uncategorized"))}</td>
          <td>${sf_boolBadge(Boolean(p.ai_supported), "AI", "AI")}</td>
          <td>${sf_boolBadge(Boolean(p.visible), visibleTrue, visibleFalse)}</td>
          <td>${sf_boolBadge(Boolean(p.active), activeTrue, activeFalse)}</td>
          <td>${esc(count)}</td>
        </tr>
      `;
    })
    .join("");
}

function pk_renderAddModuleSelect() {
  const sel = qs("#packageAddModuleSelect");
  if (!sel) return;
  const includedIds = new Set(pk_modulesRows.map((r) => r.service_item_id));
  const activeTrue = sfAdminI18n.activeTrue || "Active";
  const activeFalse = sfAdminI18n.activeFalse || "Inactive";
  const visibleTrue = sfAdminI18n.visibleTrue || "Visible";
  const visibleFalse = sfAdminI18n.visibleFalse || "Hidden";

  const options = (pk_availableModules || [])
    .filter((si) => !includedIds.has(si.id))
    .map((si) => {
      const label = si.name || si.code || si.id;
      const status = [];
      if (si.active !== undefined) status.push(si.active ? activeTrue : activeFalse);
      if (si.visible !== undefined) status.push(si.visible ? visibleTrue : visibleFalse);
      const statusText = status.length ? ` (${status.join(", ")})` : "";
      return `<option value="${esc(si.id)}">${esc(label)}${esc(statusText)}</option>`;
    })
    .join("");

  sel.innerHTML =
    options ||
    `<option value=''>${esc(t("common.admin_services.empty.no_available_modules", "No available modules"))}</option>`;
}

function pk_renderAddAddonSelect() {
  const sel = qs("#packageAddAddonSelect");
  if (!sel) return;
  const includedIds = new Set(pk_addonsRows.map((r) => r.service_item_id));
  const activeTrue = sfAdminI18n.activeTrue || "Active";
  const activeFalse = sfAdminI18n.activeFalse || "Inactive";
  const visibleTrue = sfAdminI18n.visibleTrue || "Visible";
  const visibleFalse = sfAdminI18n.visibleFalse || "Hidden";

  const options = (pk_availableAddons || [])
    .filter((si) => !includedIds.has(si.id))
    .map((si) => {
      const label = si.name || si.code || si.id;
      const status = [];
      if (si.active !== undefined) status.push(si.active ? activeTrue : activeFalse);
      if (si.visible !== undefined) status.push(si.visible ? visibleTrue : visibleFalse);
      const statusText = status.length ? ` (${status.join(", ")})` : "";
      return `<option value="${esc(si.id)}">${esc(label)}${esc(statusText)}</option>`;
    })
    .join("");

  sel.innerHTML =
    options ||
    `<option value=''>${esc(t("common.admin_services.empty.no_available_addons", "No available add-ons"))}</option>`;
}

function pk_renderModulesTable() {
  const tbody = qs("#adminPackageModulesTable");
  if (!tbody) return;

  const activeTrue = sfAdminI18n.activeTrue || "Active";
  const activeFalse = sfAdminI18n.activeFalse || "Inactive";
  const visibleTrue = sfAdminI18n.visibleTrue || "Visible";
  const visibleFalse = sfAdminI18n.visibleFalse || "Hidden";
  const removeText = t("common.admin_services.actions.remove", "Remove");

  if (!pk_modulesRows.length) {
    tbody.innerHTML = `<tr><td colspan='8'>${esc(t("common.admin_services.empty.no_modules_included", "No modules included"))}</td></tr>`;
    return;
  }

  tbody.innerHTML = pk_modulesRows
    .slice()
    .sort((a, b) => (Number(a.sort_order ?? 0) - Number(b.sort_order ?? 0)) || String(a.service_item_id).localeCompare(String(b.service_item_id)))
    .map((r, idx) => {
      const requiredChecked = Boolean(r.required);
      const upDisabled = idx === 0;
      const downDisabled = idx === pk_modulesRows.length - 1;
      return `
        <tr data-service-item-id="${esc(r.service_item_id)}">
          <td><strong>${esc(r.name || "-")}</strong><br/><span class="u-text-muted">${esc(r.description || "")}</span></td>
          <td>
            <input type="checkbox" ${requiredChecked ? "checked" : ""} data-required-checkbox data-service-item-id="${esc(r.service_item_id)}" />
          </td>
          <td>${sf_boolBadge(Boolean(r.ai_capable), "Yes", "No")}</td>
          <td>${sf_boolBadge(Boolean(r.in_person_required), "Yes", "No")}</td>
          <td>${r.active ? sf_boolBadge(true, activeTrue, activeTrue) : sf_boolBadge(false, activeTrue, activeFalse)}</td>
          <td>${r.visible ? sf_boolBadge(true, visibleTrue, visibleTrue) : sf_boolBadge(false, visibleTrue, visibleFalse)}</td>
          <td>${esc(idx + 1)}</td>
          <td>
            <div class="admin-services__row-actions">
              <button type="button" class="lhai-button lhai-button--secondary lhai-button--compact admin-services__mini-btn" data-action="move-up" data-service-item-id="${esc(r.service_item_id)}" ${upDisabled ? "disabled" : ""}>↑</button>
              <button type="button" class="lhai-button lhai-button--secondary lhai-button--compact admin-services__mini-btn" type="button" data-action="move-down" data-service-item-id="${esc(r.service_item_id)}" ${downDisabled ? "disabled" : ""}>↓</button>
              <button type="button" class="lhai-button lhai-button--danger lhai-button--compact admin-services__mini-btn" data-action="remove" data-service-item-id="${esc(r.service_item_id)}">${esc(
                removeText
              )}</button>
            </div>
          </td>
        </tr>
      `;
    })
    .join("");
}

function pk_renderAddonsTable() {
  const tbody = qs("#adminPackageAddonsTable");
  if (!tbody) return;

  const activeTrue = sfAdminI18n.activeTrue || "Active";
  const activeFalse = sfAdminI18n.activeFalse || "Inactive";
  const visibleTrue = sfAdminI18n.visibleTrue || "Visible";
  const visibleFalse = sfAdminI18n.visibleFalse || "Hidden";
  const removeText = t("common.admin_services.actions.remove", "Remove");

  if (!pk_addonsRows.length) {
    tbody.innerHTML = `<tr><td colspan='6'>${esc(t("common.admin_services.empty.no_addons_included", "No add-ons included"))}</td></tr>`;
    return;
  }

  tbody.innerHTML = pk_addonsRows
    .slice()
    .sort((a, b) => (Number(a.sort_order ?? 0) - Number(b.sort_order ?? 0)) || String(a.service_item_id).localeCompare(String(b.service_item_id)))
    .map((r, idx) => {
      const upDisabled = idx === 0;
      const downDisabled = idx === pk_addonsRows.length - 1;
      const price = r.extra_price !== undefined ? formatMoney(Number(r.extra_price ?? 0), r.currency || "USD") : "-";
      return `
        <tr data-service-item-id="${esc(r.service_item_id)}">
          <td><strong>${esc(r.name || "-")}</strong><br/><span class="u-text-muted">${esc(r.description || "")}</span></td>
          <td>${r.active ? sf_boolBadge(true, activeTrue, activeTrue) : sf_boolBadge(false, activeTrue, activeFalse)}</td>
          <td>${r.visible ? sf_boolBadge(true, visibleTrue, visibleTrue) : sf_boolBadge(false, visibleTrue, visibleFalse)}</td>
          <td>${esc(price)}</td>
          <td>${esc(idx + 1)}</td>
          <td>
            <div class="admin-services__row-actions">
              <button type="button" class="lhai-button lhai-button--secondary lhai-button--compact admin-services__mini-btn" data-action="move-up" data-service-item-id="${esc(r.service_item_id)}" ${upDisabled ? "disabled" : ""}>↑</button>
              <button type="button" class="lhai-button lhai-button--secondary lhai-button--compact admin-services__mini-btn" data-action="move-down" data-service-item-id="${esc(r.service_item_id)}" ${downDisabled ? "disabled" : ""}>↓</button>
              <button type="button" class="lhai-button lhai-button--danger lhai-button--compact admin-services__mini-btn" data-action="remove" data-service-item-id="${esc(r.service_item_id)}">${esc(
                removeText
              )}</button>
            </div>
          </td>
        </tr>
      `;
    })
    .join("");
}

async function pk_refreshSelectedPackageDetail() {
  const status = qs("#adminPackagesComposeStatus");
  if (status) status.textContent = t("common.admin_services.packages.composition.loading", "Loading package composition…");

  const pkgId = pk_selectedPackageId;
  if (!pkgId) {
    pk_setPackagesEditorEnabled(false);
    if (status) status.textContent = t("common.admin_services.packages.status.select_package", "패키지를 선택하세요.");
    qs("#adminPackageModulesTable").innerHTML = "";
    qs("#adminPackageAddonsTable").innerHTML = "";
    return;
  }

  const pkg = (sf_packages || []).find((p) => p.id === pkgId);

  // Load current linked services for this package (both module/addon)
  const rows = await serviceCatalogAdminApi.listServiceItemInventory({ package_id: pkgId, type: null, active: null, visible: null });
  const allRows = Array.isArray(rows) ? rows : [];
  pk_rowsForSelectedPackage = allRows.slice().sort((a, b) => (Number(a.sort_order ?? 0) - Number(b.sort_order ?? 0)) || String(a.service_item_id).localeCompare(String(b.service_item_id)));

  pk_modulesRows = pk_rowsForSelectedPackage.filter((r) => r.type === "module").slice().sort((a, b) => Number(a.sort_order ?? 0) - Number(b.sort_order ?? 0));
  pk_addonsRows = pk_rowsForSelectedPackage.filter((r) => r.type === "addon").slice().sort((a, b) => Number(a.sort_order ?? 0) - Number(b.sort_order ?? 0));

  // Fill package editor
  qs("#packageComposeSelectedId").value = pkgId;
  qs("#packageComposeName").value = pkg?.name || "";
  qs("#packageComposeDescription").value = pkg?.short_description || pkg?.description || "";
  qs("#packageComposeCategoryId").value = pkg?.category_id || "";
  qs("#packageComposeAiSupported").checked = pkg?.ai_supported !== undefined ? Boolean(pkg.ai_supported) : false;
  qs("#packageComposeBasePrice").value = pkg?.base_price ?? 0;
  qs("#packageComposeCurrency").value = (pkg?.currency || "USD").trim();
  qs("#packageComposeVisibleChk").checked = pkg?.visible !== undefined ? Boolean(pkg.visible) : true;
  qs("#packageComposeActiveChk").checked = pkg?.active !== undefined ? Boolean(pkg.active) : true;

  pk_setPackagesEditorEnabled(true);
  pk_renderAddModuleSelect();
  pk_renderAddonsTableOrderAndSelects();
  pk_renderModulesTable();
  pk_renderAddonsTable();

  const deleteBtn = qs("#packageComposeDeleteBtn");
  const dangerHelp = qs("#packageComposeDangerHelp");
  const hasLinkedServices = (pk_rowsForSelectedPackage || []).length > 0;
  if (deleteBtn) deleteBtn.disabled = hasLinkedServices;
  if (dangerHelp) {
    dangerHelp.textContent = hasLinkedServices
      ? t(
          "common.admin_services.packages.danger.blocked_by_links",
          "이 패키지에는 연결된 서비스가 있어 안전 삭제가 차단됩니다. Remove from package 또는 Archive/Deactivate를 사용하세요."
        )
      : t(
          "common.admin_services.packages.danger.delete_possible",
          "연결된 서비스가 없으면 안전 삭제(Delete)가 가능합니다."
        );
  }

  if (status) {
    const selectedTpl = t("common.admin_services.packages.status.selected", "선택됨: {name}");
    const nameVal = pkg?.name || pkgId;
    status.textContent = selectedTpl.includes("{name}") ? selectedTpl.replace("{name}", nameVal) : `${selectedTpl} ${nameVal}`;
  }
}

// Helper to render addon select after modules/addons rows are updated
function pk_renderAddonsTableOrderAndSelects() {
  pk_renderAddAddonSelect();
}

async function pk_reorderSelectedTypeWithinPackage({ type, serviceItemId, direction }) {
  // We reorder the global service-links order by swapping two adjacent items
  // inside the chosen type group, while keeping other items in between intact.
  const pkgId = pk_selectedPackageId;
  if (!pkgId) return;

  const globalIds = pk_rowsForSelectedPackage.map((r) => r.service_item_id);
  const groupRows = type === "module" ? pk_modulesRows : pk_addonsRows;
  const groupIds = groupRows.map((r) => r.service_item_id);
  const idx = groupIds.indexOf(serviceItemId);
  if (idx < 0) return;

  const swapWithIdx = direction === "up" ? idx - 1 : idx + 1;
  if (swapWithIdx < 0 || swapWithIdx >= groupIds.length) return;

  const idA = groupIds[idx];
  const idB = groupIds[swapWithIdx];
  const posA = globalIds.indexOf(idA);
  const posB = globalIds.indexOf(idB);
  if (posA < 0 || posB < 0) return;

  const nextIds = globalIds.slice();
  nextIds[posA] = idB;
  nextIds[posB] = idA;

  await serviceCatalogAdminApi.reorderServiceItemsInPackage(pkgId, nextIds);
  await pk_refreshSelectedPackageDetail();
}

async function pk_removeServiceItemFromSelectedPackage(serviceItemId) {
  const pkgId = pk_selectedPackageId;
  if (!pkgId) return;
  if (!window.confirm(t("common.admin_services.service.confirm.remove_from_package", "Remove this service item from package?"))) return;
  await serviceCatalogAdminApi.removeServiceItemFromPackage(pkgId, serviceItemId);
  // Update counts and detail
  await pk_refreshAllPackageCounts();
  await pk_refreshSelectedPackageDetail();
}

async function pk_addServiceItemToSelectedPackage({ type, serviceItemId, required }) {
  const pkgId = pk_selectedPackageId;
  if (!pkgId) return;
  if (!serviceItemId) return;

  await serviceCatalogAdminApi.addServiceItemToPackage(pkgId, {
    service_item_id: serviceItemId,
    required: type === "module" ? Boolean(required) : false,
    sort_order: null,
  });

  await pk_refreshAllPackageCounts();
  await pk_refreshSelectedPackageDetail();
}

async function pk_refreshAllPackageCounts() {
  // Reload counts based on full inventory for all packages.
  const rows = await serviceCatalogAdminApi.listServiceItemInventory({ type: null, category_id: null, package_id: null, active: null, visible: null });
  const list = Array.isArray(rows) ? rows : [];
  pk_allInventoryRows = list;
  pk_packageCountsById = new Map();
  for (const r of list) {
    const pid = r.package_id;
    if (!pid) continue;
    pk_packageCountsById.set(pid, (pk_packageCountsById.get(pid) || 0) + 1);
  }
}

async function pk_initPackagesTab() {
  // Ensure editor DOM exists.
  if (!qs("#adminPackagesComposeTable")) return;

  pk_selectedPackageId = "";
  pk_setPackagesEditorEnabled(false);

  // Load available service items (used for “add existing” dropdowns)
  pk_availableModules = await serviceCatalogAdminApi.listServiceItems("module", null, null, true);
  pk_availableAddons = await serviceCatalogAdminApi.listServiceItems("addon", null, null, true);

  // Load counts for all packages from inventory
  await pk_refreshAllPackageCounts();

  // Render package list
  pk_renderPackageListRows();

  // Render category select for package editor
  const composeCatSel = qs("#packageComposeCategoryId");
  if (composeCatSel) {
    composeCatSel.innerHTML = (sf_categories || []).map((c) => `<option value="${esc(c.id)}">${esc(c.name)}</option>`).join("");
  }

  // Row selection
  qs("#adminPackagesComposeTable")?.addEventListener("click", async (e) => {
    const tr = e.target.closest("tr[data-pkg-id]");
    if (!tr) return;
    pk_selectedPackageId = tr.getAttribute("data-pkg-id") || "";
    // update selection + detail
    pk_renderPackageListRows();
    await pk_refreshSelectedPackageDetail();
  });

  // Editor actions
  qs("#packageComposeSaveBasicBtn")?.addEventListener("click", async () => {
    const pkgId = pk_selectedPackageId;
    if (!pkgId) return;
    const name = (qs("#packageComposeName")?.value || "").trim();
    if (!name) return alert(t("common.admin_services.validation.package_name_required", "Package name is required."));
    const description = qs("#packageComposeDescription")?.value || "";
    const categoryId = qs("#packageComposeCategoryId")?.value || "";
    const aiSupported = Boolean(qs("#packageComposeAiSupported")?.checked);
    const basePrice = Number(qs("#packageComposeBasePrice")?.value || 0);
    const currency = (qs("#packageComposeCurrency")?.value || "USD").trim() || "USD";
    await serviceCatalogAdminApi.updatePackage(pkgId, {
      name,
      short_description: description,
      category_id: categoryId,
      ai_supported: aiSupported,
      base_price: basePrice,
      currency,
    });
    sf_packages = await serviceCatalogAdminApi.listPackages(true, null);
    await pk_refreshAllPackageCounts();
    pk_renderPackageListRows();
    await pk_refreshSelectedPackageDetail();
  });

  qs("#packageComposeSaveStatusBtn")?.addEventListener("click", async () => {
    const pkgId = pk_selectedPackageId;
    if (!pkgId) return;
    const visible = Boolean(qs("#packageComposeVisibleChk")?.checked);
    const active = Boolean(qs("#packageComposeActiveChk")?.checked);
    await serviceCatalogAdminApi.setPackageVisibility(pkgId, visible);
    await serviceCatalogAdminApi.setPackageActivation(pkgId, active);
    sf_packages = await serviceCatalogAdminApi.listPackages(true, null);
    await pk_refreshAllPackageCounts();
    pk_renderPackageListRows();
    await pk_refreshSelectedPackageDetail();
  });

  qs("#packageComposeDeactivateBtn")?.addEventListener("click", async () => {
    const pkgId = pk_selectedPackageId;
    if (!pkgId) return;
    if (!window.confirm(t("common.admin_services.packages.confirm.deactivate", "Deactivate this package?"))) return;
    await serviceCatalogAdminApi.setPackageActivation(pkgId, false);
    sf_packages = await serviceCatalogAdminApi.listPackages(true, null);
    await pk_refreshAllPackageCounts();
    pk_renderPackageListRows();
    await pk_refreshSelectedPackageDetail();
  });

  qs("#packageComposeArchiveBtn")?.addEventListener("click", async () => {
    const pkgId = pk_selectedPackageId;
    if (!pkgId) return;
    if (!window.confirm(t("common.admin_services.packages.confirm.archive", "Archive this package?"))) return;
    await serviceCatalogAdminApi.archivePackage(pkgId);
    sf_packages = await serviceCatalogAdminApi.listPackages(true, null);
    await pk_refreshAllPackageCounts();
    pk_renderPackageListRows();
    await pk_refreshSelectedPackageDetail();
  });

  qs("#packageComposeDeleteBtn")?.addEventListener("click", async () => {
    const pkgId = pk_selectedPackageId;
    if (!pkgId) return;
    if (!window.confirm(t("common.admin_services.packages.confirm.delete_safe", "Safe delete this package?"))) return;
    try {
      await serviceCatalogAdminApi.deletePackageIfSafe(pkgId);
      sf_packages = await serviceCatalogAdminApi.listPackages(true, null);
      await pk_refreshAllPackageCounts();
      pk_selectedPackageId = (sf_packages || [])[0]?.id || "";
      pk_renderPackageListRows();
      await pk_refreshSelectedPackageDetail();
    } catch (err) {
      const help = qs("#packageComposeDangerHelp");
      if (help) help.textContent = `${t("common.admin_services.packages.danger.delete_blocked_prefix", "Delete blocked:")} ${err?.message || err}`;
    }
  });

  qs("#packageAddModuleBtn")?.addEventListener("click", async () => {
    const pkgId = pk_selectedPackageId;
    if (!pkgId) return;
    const serviceItemId = qs("#packageAddModuleSelect")?.value || "";
    const required = Boolean(qs("#packageAddModuleRequiredChk")?.checked);
    await pk_addServiceItemToSelectedPackage({ type: "module", serviceItemId, required });
  });

  qs("#packageAddAddonBtn")?.addEventListener("click", async () => {
    const pkgId = pk_selectedPackageId;
    if (!pkgId) return;
    const serviceItemId = qs("#packageAddAddonSelect")?.value || "";
    await pk_addServiceItemToSelectedPackage({ type: "addon", serviceItemId, required: false });
  });

  // Module table: required toggle + reorder/remove
  qs("#adminPackageModulesTable")?.addEventListener("change", async (e) => {
    const target = e.target;
    if (!target || !(target instanceof HTMLElement)) return;
    const isReqCheckbox = target.hasAttribute("data-required-checkbox");
    if (!isReqCheckbox) return;
    const serviceItemId = target.getAttribute("data-service-item-id");
    if (!serviceItemId) return;
    const required = Boolean(target.checked);
    await serviceCatalogAdminApi.setServiceItemRequiredInPackage(pk_selectedPackageId, serviceItemId, required);
    await pk_refreshSelectedPackageDetail();
  });

  qs("#adminPackageModulesTable")?.addEventListener("click", async (e) => {
    const btn = e.target.closest("button[data-action]");
    if (!btn) return;
    const action = btn.getAttribute("data-action");
    const serviceItemId = btn.getAttribute("data-service-item-id");
    if (!serviceItemId) return;
    if (action === "remove") return pk_removeServiceItemFromSelectedPackage(serviceItemId);
    if (action === "move-up") return pk_reorderSelectedTypeWithinPackage({ type: "module", serviceItemId, direction: "up" });
    if (action === "move-down") return pk_reorderSelectedTypeWithinPackage({ type: "module", serviceItemId, direction: "down" });
  });

  // Add-on table: reorder/remove only
  qs("#adminPackageAddonsTable")?.addEventListener("click", async (e) => {
    const btn = e.target.closest("button[data-action]");
    if (!btn) return;
    const action = btn.getAttribute("data-action");
    const serviceItemId = btn.getAttribute("data-service-item-id");
    if (!serviceItemId) return;
    if (action === "remove") return pk_removeServiceItemFromSelectedPackage(serviceItemId);
    if (action === "move-up") return pk_reorderSelectedTypeWithinPackage({ type: "addon", serviceItemId, direction: "up" });
    if (action === "move-down") return pk_reorderSelectedTypeWithinPackage({ type: "addon", serviceItemId, direction: "down" });
  });

  // Select first package by default
  const first = (sf_packages || []).slice().sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))[0];
  if (first) {
    pk_selectedPackageId = first.id;
    pk_renderPackageListRows();
    await pk_refreshSelectedPackageDetail();
  } else {
    pk_setPackagesEditorEnabled(false);
  }
}

// ---------------------------
// Categories tab (category-first overview)
// ---------------------------

let pk_selectedCategoryId = "";

function pk_computeCategoryCounts() {
  const categoryById = new Map((sf_categories || []).map((c) => [c.id, c]));
  const packageCountByCategoryId = new Map();
  const serviceCountByCategoryId = new Map();

  for (const p of sf_packages || []) {
    const cid = p.category_id;
    if (!cid) continue;
    packageCountByCategoryId.set(cid, (packageCountByCategoryId.get(cid) || 0) + 1);
  }

  // pk_allInventoryRows contains rows for all packages/services
  for (const r of pk_allInventoryRows || []) {
    const cid = r.category_id;
    if (!cid) continue;
    serviceCountByCategoryId.set(cid, (serviceCountByCategoryId.get(cid) || 0) + 1);
  }

  return { categoryById, packageCountByCategoryId, serviceCountByCategoryId };
}

function pk_renderCategoriesListRows() {
  const tbody = qs("#adminCategoriesListTable");
  if (!tbody) return;

  const { packageCountByCategoryId, serviceCountByCategoryId } = pk_computeCategoryCounts();
  const list = (sf_categories || []).slice().sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));

  if (!list.length) {
    tbody.innerHTML = `<tr><td colspan='4'>${esc(t("common.admin_services.empty.categories", "No categories"))}</td></tr>`;
    return;
  }
  const activeTrue = sfAdminI18n.activeTrue || "Active";
  const activeFalse = sfAdminI18n.activeFalse || "Inactive";

  tbody.innerHTML = list
    .map((cat) => {
      const isSelected = String(cat.id) === String(pk_selectedCategoryId);
      const pkgCount = packageCountByCategoryId.get(cat.id) || 0;
      const svcCount = serviceCountByCategoryId.get(cat.id) || 0;
      return `
        <tr class="${isSelected ? "is-selected" : ""}" data-cat-id="${esc(cat.id)}">
          <td><strong>${esc(cat.name || "-")}</strong></td>
          <td>${esc(pkgCount)}</td>
          <td>${esc(svcCount)}</td>
          <td>${sf_boolBadge(Boolean(cat.active), activeTrue, activeFalse)}</td>
        </tr>
      `;
    })
    .join("");
}

function pk_renderCategoryPackagesTable(categoryId) {
  const tbody = qs("#categoryPackagesTable");
  if (!tbody) return;
  const list = (sf_packages || []).filter((p) => String(p.category_id) === String(categoryId)).slice().sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
  if (!list.length) {
    tbody.innerHTML = `<tr><td colspan='2'>${esc(
      t("common.admin_services.empty.packages_in_category", "No packages in this category")
    )}</td></tr>`;
    return;
  }

  const includedCountByPackageId = new Map();
  for (const r of pk_allInventoryRows || []) {
    if (String(r.category_id) !== String(categoryId)) continue;
    const pid = r.package_id;
    if (!pid) continue;
    includedCountByPackageId.set(pid, (includedCountByPackageId.get(pid) || 0) + 1);
  }

  tbody.innerHTML = list
    .map((p) => {
      const count = includedCountByPackageId.get(p.id) || 0;
      return `
        <tr>
          <td><strong>${esc(p.name || "-")}</strong></td>
          <td>${esc(count)}</td>
        </tr>
      `;
    })
    .join("");
}

function pk_setCategoryDetailFields(cat) {
  const catId = cat?.id || "";
  pk_selectedCategoryId = catId;

  qs("#categoryDetailId").value = catId;
  qs("#categoryDetailName").value = cat?.name || "";
  qs("#categoryDetailActiveChk").checked = cat?.active !== undefined ? Boolean(cat.active) : true;
  qs("#categoryDetailDescription").value = cat?.description || "";

  // Deletion safety guidance
  const { packageCountByCategoryId } = pk_computeCategoryCounts();
  const pkgCount = packageCountByCategoryId.get(catId) || 0;

  const dangerHelp = qs("#categoryDangerHelp");
  const deleteBtn = qs("#categoryDeleteBtn");
  if (pkgCount > 0) {
    if (deleteBtn) deleteBtn.disabled = true;
    if (dangerHelp) dangerHelp.textContent = "이 카테고리는 연결된 패키지가 존재하므로 Delete(safe)는 실패할 수 있습니다. Archive 또는 Deactivate를 사용하세요.";
  } else {
    if (deleteBtn) deleteBtn.disabled = false;
    if (dangerHelp) dangerHelp.textContent = "연결된 패키지가 없으면 안전 삭제(Delete) 가능합니다.";
  }

  // Render package list within category
  pk_renderCategoryPackagesTable(catId);
}

async function pk_refreshCategoryTabCountsAndRender() {
  // Refresh base lists and derived counts (services)
  sf_categories = await serviceCatalogAdminApi.listCategories(true);
  sf_packages = await serviceCatalogAdminApi.listPackages(true, null);
  await pk_refreshAllPackageCounts();
  pk_renderCategoriesListRows();

  // keep selection
  const cat = (sf_categories || []).find((c) => String(c.id) === String(pk_selectedCategoryId)) || (sf_categories || [])[0];
  if (cat) pk_setCategoryDetailFields(cat);
}

async function pk_initCategoriesTab() {
  const listTable = qs("#adminCategoriesListTable");
  if (!listTable) return;

  const status = qs("#adminCategoriesListStatus");
  if (status) status.textContent = t("common.admin_services.categories.composition.loading", "Loading categories…");

  // Ensure category counts are available
  pk_selectedCategoryId = (sf_categories || [])[0]?.id || "";
  pk_renderCategoriesListRows();

  const selected = (sf_categories || []).find((c) => String(c.id) === String(pk_selectedCategoryId)) || (sf_categories || [])[0];
  if (selected) pk_setCategoryDetailFields(selected);

  listTable.onclick = null;
  listTable.addEventListener("click", async (e) => {
    const tr = e.target.closest("tr[data-cat-id]");
    if (!tr) return;
    const cid = tr.getAttribute("data-cat-id");
    const cat = (sf_categories || []).find((c) => c.id === cid);
    if (!cat) return;
    pk_setCategoryDetailFields(cat);
    pk_renderCategoriesListRows();
  });

  qs("#categoryDetailSaveBasicBtn")?.addEventListener("click", async () => {
    const id = qs("#categoryDetailId")?.value || "";
    if (!id) return;
    const name = (qs("#categoryDetailName")?.value || "").trim();
    if (!name) return alert(t("common.admin_services.validation.category_name_required", "Category name is required."));
    const description = (qs("#categoryDetailDescription")?.value || "").trim();
    await serviceCatalogAdminApi.updateCategory(id, { name, description });
    sf_categories = await serviceCatalogAdminApi.listCategories(true);
    await pk_refreshCategoryTabCountsAndRender();
  });

  qs("#categoryDetailSaveStatusBtn")?.addEventListener("click", async () => {
    const id = qs("#categoryDetailId")?.value || "";
    if (!id) return;
    const active = Boolean(qs("#categoryDetailActiveChk")?.checked);
    await serviceCatalogAdminApi.updateCategory(id, { active });
    sf_categories = await serviceCatalogAdminApi.listCategories(true);
    await pk_refreshCategoryTabCountsAndRender();
  });

  qs("#categoryArchiveBtn")?.addEventListener("click", async () => {
    const id = qs("#categoryDetailId")?.value || "";
    if (!id) return;
    if (!window.confirm(t("common.admin_services.categories.confirm.archive", "Archive this category?"))) return;
    await serviceCatalogAdminApi.archiveCategory(id);
    await pk_refreshCategoryTabCountsAndRender();
  });

  qs("#categoryDeactivateBtn")?.addEventListener("click", async () => {
    const id = qs("#categoryDetailId")?.value || "";
    if (!id) return;
    if (!window.confirm(t("common.admin_services.categories.confirm.deactivate", "Deactivate this category (set active=false)?"))) return;
    await serviceCatalogAdminApi.updateCategory(id, { active: false });
    await pk_refreshCategoryTabCountsAndRender();
  });

  qs("#categoryDeleteBtn")?.addEventListener("click", async () => {
    const id = qs("#categoryDetailId")?.value || "";
    if (!id) return;
    if (qs("#categoryDeleteBtn")?.disabled) return;
    if (!window.confirm(t("common.admin_services.categories.confirm.delete_safe", "Safe delete this category?"))) return;
    try {
      await serviceCatalogAdminApi.deleteCategoryIfSafe(id);
      await pk_refreshCategoryTabCountsAndRender();
    } catch (err) {
      const dangerHelp = qs("#categoryDangerHelp");
      if (dangerHelp) {
        dangerHelp.textContent = `${t("common.admin_services.categories.delete_blocked_prefix", "Delete blocked:")} ${err?.message || err}`;
      }
    }
  });

  // Create package inside this category (quick create form)
  qs("#categoryPackageCreateBtn")?.addEventListener("click", async () => {
    const cid = qs("#categoryDetailId")?.value || "";
    if (!cid) return;
    const name = (qs("#categoryPackageCreateName")?.value || "").trim();
    if (!name) return alert(t("common.admin_services.validation.package_name_required", "Package name is required."));
    const ai_supported = Boolean(qs("#categoryPackageCreateAiSupported")?.checked);
    const visible = Boolean(qs("#categoryPackageCreateVisible")?.checked);
    const active = Boolean(qs("#categoryPackageCreateActive")?.checked);
    const description = (qs("#categoryPackageCreateDescription")?.value || "").trim();
    const base_price = Number(qs("#categoryPackageCreateBasePrice")?.value || 0);
    const currency = (qs("#categoryPackageCreateCurrency")?.value || "USD").trim() || "USD";

    await serviceCatalogAdminApi.createPackage({
      category_id: cid,
      name,
      short_description: description,
      long_description: "",
      outcome_description: "",
      ai_supported,
      in_person_only: false,
      self_service_enabled: true,
      base_price,
      currency,
      visible,
      active,
      sort_order: 0,
    });

    await pk_refreshCategoryTabCountsAndRender();
    // Optional: clear input
    qs("#categoryPackageCreateName").value = "";
    qs("#categoryPackageCreateDescription").value = "";
    qs("#categoryPackageCreateBasePrice").value = "0";
    qs("#categoryPackageCreateCurrency").value = "USD";
  });

  if (status) status.textContent = "";
}

function ht_activatePanel(panelId) {
  const tabsRoot = qs("#adminServicesTopTabs");
  if (!tabsRoot) return;
  const btn = qs(`#adminServicesTopTabs button[data-panel="${esc(panelId)}"]`);
  if (btn) btn.click();
}

function ht_moduleAddonBadge(type) {
  if (type === "module") return `<span class="lhai-badge admin-services__badge--module">${t("common.admin_services.service_type.module", "Module")}</span>`;
  if (type === "addon") return `<span class="lhai-badge admin-services__badge--addon">${t("common.admin_services.service_type.addon", "Addon")}</span>`;
  return `<span class="lhai-badge">Service</span>`;
}

function ht_activeBadge(active, activeLabel = "Active", inactiveLabel = "Inactive") {
  return active ? `<span class="lhai-badge lhai-badge--status-active">${activeLabel}</span>` : `<span class="lhai-badge">${inactiveLabel}</span>`;
}

async function ht_selectCategory(categoryId) {
  const cat = (sf_categories || []).find((c) => String(c.id) === String(categoryId));
  if (!cat) return;
  pk_setCategoryDetailFields(cat);
  pk_renderCategoriesListRows();
}

async function ht_selectPackage(packageId) {
  if (!packageId) return;
  pk_selectedPackageId = String(packageId);
  pk_renderPackageListRows();
  await pk_refreshSelectedPackageDetail();
}

async function ht_selectServiceItem(row) {
  if (!row) return;
  // Reset filters for consistent selection.
  qs("#inventoryFilterType") && (qs("#inventoryFilterType").value = "");
  qs("#inventoryFilterCategoryId") && (qs("#inventoryFilterCategoryId").value = "");
  qs("#inventoryFilterPackageId") && (qs("#inventoryFilterPackageId").value = "");
  qs("#inventoryFilterActive") && (qs("#inventoryFilterActive").value = "");
  qs("#inventoryFilterVisible") && (qs("#inventoryFilterVisible").value = "");
  qs("#inventorySearch") && (qs("#inventorySearch").value = "");

  // Reload inventory then select target row.
  await sf_loadInventory();
  const target = sf_inventoryRows.find(
    (r) =>
      String(r.service_item_id) === String(row.service_item_id) &&
      String(r.package_id) === String(row.package_id) &&
      String(r.package_service_link_id) === String(row.package_service_link_id)
  );
  if (target) {
    sf_fillEditorFromRow(target);
    // Re-render to update selected-row highlight state.
    sf_renderInventoryTable(sf_inventoryRows);
    await sf_updateReorderButtonState();
  } else {
    sf_resetEditor();
  }
}

async function sf_renderHierarchyTab() {
  const root = qs("#adminHierarchyRoot");
  const status = qs("#adminHierarchyStatus");
  if (!root) return;
  if (status) status.textContent = t("common.admin_services.hierarchy.loading", "Loading hierarchy…");

  // include inactive/hidden for read-only overview
  const rows = await serviceCatalogAdminApi.listServiceItemInventory({
    active: null,
    visible: null,
    type: null,
    category_id: null,
    package_id: null,
  });
  const list = Array.isArray(rows) ? rows : [];

  // Map: categoryId -> packageId -> service rows
  const categoryMap = new Map();
  for (const r of list) {
    const catId = r.category_id || "unknown";
    const pkgId = r.package_id || "unknown";
    if (!categoryMap.has(catId)) categoryMap.set(catId, new Map());
    const pkgMap = categoryMap.get(catId);
    if (!pkgMap.has(pkgId)) pkgMap.set(pkgId, []);
    pkgMap.get(pkgId).push(r);
  }

  const categoryArray = Array.from(categoryMap.entries())
    .map(([catId, pkgMap]) => {
      const cat = (sf_categories || []).find((c) => String(c.id) === String(catId));
      return {
        catId,
        catName: cat?.name || t("common.admin_services.misc.uncategorized", "Uncategorized"),
        catActive: cat ? Boolean(cat.active) : true,
        pkgMap,
      };
    })
    .sort((a, b) => (a.catName || "").localeCompare(b.catName || ""));

  const html = categoryArray
    .map((cat) => {
      const pkgEntries = Array.from(cat.pkgMap.entries())
        .map(([pkgId, serviceRows]) => {
          const pkg = (sf_packages || []).find((p) => String(p.id) === String(pkgId));
          return {
            pkgId,
            pkgName: pkg?.name || t("common.admin_services.misc.uncategorized_package", "Uncategorized package"),
            pkgActive: pkg ? Boolean(pkg.active) : true,
            serviceRows: serviceRows.slice().sort((a, b) => (Number(a.sort_order ?? 0) - Number(b.sort_order ?? 0)) || String(a.service_item_id).localeCompare(String(b.service_item_id))),
          };
        })
        .sort((a, b) => (a.pkgName || "").localeCompare(b.pkgName || ""));

      const pkgHtml = pkgEntries
        .map((pkg) => {
          const serviceHtml = pkg.serviceRows
            .map((s) => {
              const sActive = Boolean(s.active);
              const sVisible = Boolean(s.visible);
              return `
                <li>
                  <button type="button"
                    class="admin-services__hierarchy-node admin-services__hierarchy-node--service"
                    data-ht-node="service"
                    data-service-item-id="${esc(s.service_item_id)}"
                    data-package-id="${esc(s.package_id)}"
                    data-package-service-link-id="${esc(s.package_service_link_id)}"
                  >
                    ${ht_moduleAddonBadge(s.type)}
                    <span>${esc(s.name || "-")}</span>
                    ${ht_activeBadge(sActive)}
                    ${sVisible ? `<span class="lhai-badge">Visible</span>` : `<span class="lhai-badge">Hidden</span>`}
                  </button>
                </li>
              `;
            })
            .join("");

          return `
            <li>
              <button type="button"
                class="admin-services__hierarchy-node admin-services__hierarchy-node--package"
                data-ht-node="package"
                data-package-id="${esc(pkg.pkgId)}"
              >
                <span>${esc(pkg.pkgName)}</span>
                ${ht_activeBadge(pkg.pkgActive, "Active", "Inactive")}
              </button>
              <ul>${serviceHtml}</ul>
            </li>
          `;
        })
        .join("");

      return `
        <li>
          <button type="button"
            class="admin-services__hierarchy-node admin-services__hierarchy-node--category"
            data-ht-node="category"
            data-category-id="${esc(cat.catId)}"
          >
            <span>${esc(cat.catName)}</span>
            ${ht_activeBadge(cat.catActive, "Active", "Inactive")}
          </button>
          <ul>${pkgHtml}</ul>
        </li>
      `;
    })
    .join("");

  root.innerHTML = html ? `<ul>${html}</ul>` : "<div class='lhai-state lhai-state--empty'>No hierarchy data</div>";
  if (status) status.textContent = "";

  root.onclick = null;
  root.addEventListener("click", async (e) => {
    const node = e.target.closest("button.admin-services__hierarchy-node");
    if (!node) return;
    const nodeType = node.getAttribute("data-ht-node");

    if (nodeType === "category") {
      const catId = node.getAttribute("data-category-id");
      ht_activatePanel("panel-categories");
      await ht_selectCategory(catId);
      return;
    }

    if (nodeType === "package") {
      const pkgId = node.getAttribute("data-package-id");
      ht_activatePanel("panel-packages");
      await ht_selectPackage(pkgId);
      return;
    }

    if (nodeType === "service") {
      const serviceItemId = node.getAttribute("data-service-item-id");
      const pkgId = node.getAttribute("data-package-id");
      const linkId = node.getAttribute("data-package-service-link-id");
      const row = list.find((r) => String(r.service_item_id) === String(serviceItemId) && String(r.package_id) === String(pkgId) && String(r.package_service_link_id) === String(linkId));
      ht_activatePanel("panel-inventory");
      await ht_selectServiceItem(row);
    }
  });
}

// UCD-first replacement UI (Inventory + Manage).
let ucdCategories = [];
let ucdPackages = [];
let ucdServices = [];
let ucdInventory = [];
/** @type {Map<string, Array<Record<string, unknown>>>} package id -> addons from API (DB) */
let ucdAddonsByPackage = new Map();
let dragPayload = null;
let ucdInlineEdit = null; // { type, id, error?, beforeName?, afterName?, updatedAt? }
let ucdConnectorResizeBound = false;
let ucdConnectorResizeRaf = 0;
let ucdSelectedCategoryId = "";
let ucdSelectedPackageId = "";
let ucdPackageSearchQuery = "";
let ucdPackageFilterCategoryId = "";
let ucdSelectedServiceId = "";
let ucdServiceFilterType = "";
let ucdServiceFilterCategoryId = "";
let ucdServiceFilterPackageId = "";
let ucdServiceFilterActive = "";

function ucdCategoryName(id) {
  return ucdCategories.find((c) => String(c.id) === String(id))?.name || "-";
}

function ucdPackageName(id) {
  return ucdPackages.find((p) => String(p.id) === String(id))?.name || "-";
}

function ucdServiceTypeLabel(type) {
  const t = String(type || "").toLowerCase();
  if (t === "addon") return "In-person";
  if (t === "module") return "AI";
  return type || "-";
}

function ucdItemsByType(type) {
  if (type === "category") return ucdCategories;
  if (type === "package") return ucdPackages;
  if (type === "service") return ucdServices;
  return [];
}

function ucdFindName(type, id) {
  return ucdItemsByType(type).find((item) => String(item.id) === String(id))?.name || "";
}

function ucdIsDuplicateName(type, id, name) {
  const normalized = String(name || "").trim().toLowerCase();
  if (!normalized) return false;
  return ucdItemsByType(type).some((item) => String(item.id) !== String(id) && String(item.name || "").trim().toLowerCase() === normalized);
}

function ucdNormalizeList(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.items)) return payload.items;
  if (Array.isArray(payload?.data)) return payload.data;
  return [];
}

function ucdSortByOrderThenId(a, b) {
  const ao = Number(a.sort_order ?? 0);
  const bo = Number(b.sort_order ?? 0);
  if (ao !== bo) return ao - bo;
  return String(a.id).localeCompare(String(b.id));
}

function ucdInitTopTabs() {
  const tabsRoot = qs("#adminServicesTopTabs");
  if (!tabsRoot) return;
  const buttons = qsa(".admin-services__tab-btn[data-panel]", tabsRoot);
  const panelsRoot = qs("#adminServicesTopPanels");
  if (!panelsRoot) return;
  const panels = qsa(".admin-services__tab-panel", panelsRoot);
  const activate = (panelId) => {
    buttons.forEach((b) => {
      const on = b.getAttribute("data-panel") === panelId;
      b.classList.toggle("is-active", on);
      b.setAttribute("aria-selected", on ? "true" : "false");
    });
    panels.forEach((p) => {
      p.hidden = p.id !== panelId;
    });
  };
  buttons.forEach((btn) => {
    btn.addEventListener("click", () => activate(btn.getAttribute("data-panel")));
  });
  activate("panel-inventory");
}

function ucdInitManageTabs() {
  const root = qs("#manageEntityTabs");
  if (!root) return;
  const btns = qsa("[data-manage-panel]", root);
  const panels = qsa(".admin-services__manage-panel");
  const activate = (panelId) => {
    btns.forEach((b) => b.classList.toggle("is-active", b.getAttribute("data-manage-panel") === panelId));
    panels.forEach((p) => {
      p.hidden = p.id !== panelId;
    });
  };
  btns.forEach((btn) => btn.addEventListener("click", () => activate(btn.getAttribute("data-manage-panel"))));
  activate("manage-category-panel");
}

async function ucdSaveInlineName(type, id, nextRaw) {
  const next = String(nextRaw || "").trim();
  if (!next) {
    ucdInlineEdit = { ...(ucdInlineEdit || { type, id }), type, id, error: "이름은 비워둘 수 없습니다." };
    ucdRenderInventory();
    return;
  }

  if (ucdIsDuplicateName(type, id, next)) {
    ucdInlineEdit = { ...(ucdInlineEdit || { type, id }), type, id, error: "같은 타입에서 동일한 이름은 사용할 수 없습니다." };
    ucdRenderInventory();
    return;
  }

  const before = ucdFindName(type, id);
  if (before === next) {
    ucdInlineEdit = null;
    ucdRenderInventory();
    return;
  }

  if (type === "category") await serviceCatalogAdminApi.updateCategory(id, { name: next });
  if (type === "package") await serviceCatalogAdminApi.updatePackage(id, { name: next });
  if (type === "service") await serviceCatalogAdminApi.updateServiceItem(id, { name: next });

  await ucdReload();
  ucdInlineEdit = { type, id, beforeName: before, afterName: next, updatedAt: Date.now() };
  ucdRenderInventory();
  ucdRenderManage();
}

function ucdWarn(msgs) {
  const box = qs("#inventoryWarnings");
  if (!box) return;
  if (!msgs.length) {
    box.hidden = true;
    box.innerHTML = "";
    return;
  }
  box.hidden = false;
  box.innerHTML = `
    <strong>연결 경고</strong>
    <ul>${msgs.map((m) => `<li>${esc(m)}</li>`).join("")}</ul>
  `;
}

async function ucdReload() {
  const [cats, pkgs, services, inv] = await Promise.all([
    serviceCatalogAdminApi.listCategories(),
    serviceCatalogAdminApi.listPackages(),
    serviceCatalogAdminApi.listServiceItems(),
    serviceCatalogAdminApi.listServiceItemInventory(),
  ]);
  ucdCategories = ucdNormalizeList(cats).slice().sort(ucdSortByOrderThenId);
  ucdPackages = ucdNormalizeList(pkgs).slice().sort(ucdSortByOrderThenId);
  ucdServices = ucdNormalizeList(services);
  ucdInventory = ucdNormalizeList(inv);

  ucdAddonsByPackage = new Map();
  if (ucdPackages.length) {
    const addonLists = await Promise.all(
      ucdPackages.map((p) =>
        serviceCatalogAdminApi.listAddonsByPackage(p.id, true).catch(() => [])
      )
    );
    ucdPackages.forEach((p, i) => {
      const list = ucdNormalizeList(addonLists[i]).slice().sort(ucdSortByOrderThenId);
      ucdAddonsByPackage.set(String(p.id), list);
    });
  }
}

function ucdServiceLinksByPackage() {
  const map = new Map();
  for (const row of ucdInventory) {
    const key = String(row.package_id || "");
    if (!key) continue;
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(row);
  }
  // Some backend/mocks may not return inventory rows even when service has package_id.
  if (map.size === 0) {
    for (const svc of ucdServices) {
      const key = String(svc.package_id || "");
      if (!key) continue;
      if (!map.has(key)) map.set(key, []);
      map.get(key).push({
        package_id: key,
        service_item_id: svc.id,
        sort_order: Number(svc.sort_order ?? 0),
      });
    }
  }
  return map;
}

function ucdValidateDrop(childType, parentType) {
  return (
    (childType === "package" && parentType === "category") ||
    (childType === "service" && parentType === "package") ||
    (childType === "inperson" && parentType === "service")
  );
}

async function ucdHandleDrop(targetType, targetId) {
  if (!dragPayload) return;
  const { type, id } = dragPayload;
  if (!ucdValidateDrop(type, targetType)) return;

  if (type === "package" && targetType === "category") {
    await serviceCatalogAdminApi.updatePackage(id, { category_id: targetId });
  } else if (type === "service" && targetType === "package") {
    const toRemove = ucdInventory.filter((r) => String(r.service_item_id) === String(id));
    for (const row of toRemove) {
      if (row.package_id && row.service_item_id) {
        await serviceCatalogAdminApi.removeServiceItemFromPackage(row.package_id, row.service_item_id);
      }
    }
    await serviceCatalogAdminApi.addServiceItemToPackage(targetId, { service_item_id: id, required: false });
  } else if (type === "inperson" && targetType === "service") {
    await serviceCatalogAdminApi.updateServiceItem(targetId, { in_person_required: true });
  }

  await ucdReload();
  ucdRenderInventory();
  ucdRenderManage();
}

function ucdTypeDesc(type, item) {
  if (type === "category") return item.description || "서비스 묶음의 최상위 분류입니다.";
  if (type === "package") return item.short_description || item.description || "카테고리 안에서 고객에게 제공되는 패키지입니다.";
  if (type === "service") return item.description || "AI 기반 안내·체크리스트 등 디지털 서비스 항목입니다.";
  return item.description || "현장 방문 또는 대면이 필요한 서비스 항목입니다.";
}

function ucdCard(type, item, title, depth, childrenHtml = "", connectorMeta = null) {
  const kindLabel =
    type === "service" || type === "inperson"
      ? `<div class="admin-services__tree-card-kind">${type === "service" ? "AI Service" : "In-person Service"}</div>`
      : "";
  const connectorAttrs = connectorMeta
    ? ` data-node-id="${esc(connectorMeta.nodeId)}" data-parent-id="${esc(connectorMeta.parentId || "")}" data-node-type="${esc(connectorMeta.nodeType || "")}"`
    : "";
  const isEditing = Boolean(
    ucdInlineEdit &&
      String(ucdInlineEdit.type) === String(type) &&
      String(ucdInlineEdit.id) === String(item.id) &&
      type !== "inperson"
  );
  const hasRecentDiff = Boolean(
    !isEditing &&
      ucdInlineEdit &&
      String(ucdInlineEdit.type) === String(type) &&
      String(ucdInlineEdit.id) === String(item.id) &&
      ucdInlineEdit.beforeName &&
      ucdInlineEdit.afterName &&
      Date.now() - Number(ucdInlineEdit.updatedAt || 0) < 8000
  );
  return `
    <div class="admin-services__tree-card admin-services__tree-card--${type}" data-ucd-depth="${depth}"
      data-card-type="${type}" data-card-id="${esc(item.id)}" draggable="${isEditing ? "false" : "true"}"${connectorAttrs}>
      <div class="admin-services__tree-card-body" data-ucd-depth="${depth}">
        ${kindLabel}
        ${
          isEditing
            ? `
            <div class="admin-services__inline-edit">
              <input type="text" class="lhai-input admin-services__inline-input"
                data-inline-input="true" data-card-type="${type}" data-card-id="${esc(item.id)}" value="${esc(title)}" />
              <div class="admin-services__row-actions">
                <button type="button" class="lhai-button lhai-button--primary lhai-button--compact"
                  data-inline-save="true" data-card-type="${type}" data-card-id="${esc(item.id)}">${esc(t("common.actions.save", "Save"))}</button>
                <button type="button" class="lhai-button lhai-button--secondary lhai-button--compact"
                  data-inline-cancel="true" data-card-type="${type}" data-card-id="${esc(item.id)}">${esc(t("common.actions.cancel", "Cancel"))}</button>
              </div>
              ${ucdInlineEdit?.error ? `<div class="admin-services__inline-error">${esc(ucdInlineEdit.error)}</div>` : ""}
            </div>
          `
            : `
            <button type="button" class="admin-services__tree-card-title"
              data-start-inline-edit="true" data-card-type="${type}" data-card-id="${esc(item.id)}">${esc(title)}</button>
            ${
              hasRecentDiff
                ? `<div class="admin-services__inline-diff"><span class="admin-services__inline-diff-before">${esc(ucdInlineEdit.beforeName)}</span> → <span class="admin-services__inline-diff-after">${esc(ucdInlineEdit.afterName)}</span></div>`
                : ""
            }
          `
        }
        <div class="admin-services__tree-card-desc">${esc(ucdTypeDesc(type, item))}</div>
      </div>
      ${childrenHtml ? `<div class="admin-services__tree-card-children">${childrenHtml}</div>` : ""}
    </div>
  `;
}

function ucdRenderInventory() {
  const root = qs("#inventoryTreeRoot");
  if (!root) return;
  const linksByPkg = ucdServiceLinksByPackage();
  const linkedServiceIds = new Set(
    Array.from(linksByPkg.values())
      .flat()
      .map((r) => String(r.service_item_id))
  );

  const warnings = [];
  for (const cat of ucdCategories) {
    const hasPkg = ucdPackages.some((p) => String(p.category_id) === String(cat.id));
    if (!hasPkg) warnings.push(`Category "${cat.name}"에 연결된 Package가 없습니다.`);
  }
  for (const pkg of ucdPackages) {
    const rows = linksByPkg.get(String(pkg.id)) || [];
    if (!rows.length) warnings.push(`Package "${pkg.name}"에 연결된 AI Service가 없습니다.`);
    if (!pkg.category_id) warnings.push(`Package "${pkg.name}"가 Category에 연결되지 않았습니다.`);
  }
  for (const svc of ucdServices) {
    if (!linkedServiceIds.has(String(svc.id))) warnings.push(`AI Service "${svc.name}"가 어떤 Package에도 연결되지 않았습니다.`);
  }
  ucdWarn(warnings);

  function ucdBuildLeaves(pkg) {
    const rows = (linksByPkg.get(String(pkg.id)) || []).sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
    const invCodes = new Set(rows.map((r) => String(r.code || "")));
    const leaves = [];
    for (const invRow of rows) {
      const rowType = String(invRow.type || "").toLowerCase();
      if (rowType === "addon") {
        leaves.push({
          type: "inperson",
          item: { ...invRow, id: invRow.service_item_id },
          title: invRow.name,
        });
        continue;
      }
      leaves.push({
        type: "service",
        item: { ...invRow, id: invRow.service_item_id },
        title: invRow.name,
      });
      if (invRow.in_person_required) {
        leaves.push({
          type: "inperson",
          item: { id: `in-${invRow.service_item_id}`, description: "현장 방문이 필요한 서비스 조건입니다." },
          title: "In-person Service",
        });
      }
    }
    for (const ad of ucdAddonsByPackage.get(String(pkg.id)) || []) {
      const code = String(ad.code || "");
      if (code && invCodes.has(code)) continue;
      leaves.push({
        type: "inperson",
        item: {
          id: ad.id,
          description: ad.description || "현장 서비스 또는 옵션입니다.",
        },
        title: ad.name,
      });
    }
    return leaves;
  }

  function ucdRenderLeafRows(leaves, pkg) {
    return leaves
      .map((leaf, idx) => {
        const nodeId = `leaf:${pkg.id}:${idx}:${leaf.item?.id || "unknown"}`;
        const parentId = `pkg:${pkg.id}`;
        return `
          <div class="admin-services__tree-child-row">
            <div class="admin-services__tree-child-branch"></div>
            <div class="admin-services__tree-child-node">${ucdCard(leaf.type, leaf.item, leaf.title, 3, "", { nodeId, parentId, nodeType: leaf.type })}</div>
          </div>
        `;
      })
      .join("");
  }

  function ucdRenderPackageLevel(pkg) {
    const leaves = ucdBuildLeaves(pkg);
    const hasChildren = leaves.length > 0;
    const pkgNodeId = `pkg:${pkg.id}`;
    const pkgCard = ucdCard("package", pkg, pkg.name, 2, "", {
      nodeId: pkgNodeId,
      parentId: `cat:${pkg.category_id || "none"}`,
      nodeType: "package",
    });
    const childrenHtml = hasChildren ? ucdRenderLeafRows(leaves, pkg) : "";
    return `
      <div class="admin-services__tree-level admin-services__tree-level--package ${hasChildren ? "has-children" : "no-children"}">
        <div class="admin-services__tree-parent">${pkgCard}</div>
        <div class="admin-services__tree-connector-col">
          <span class="admin-services__tree-connector-bridge"></span>
        </div>
        <div class="admin-services__tree-children ${hasChildren ? "has-children" : "no-children"}">
          ${childrenHtml}
        </div>
      </div>
    `;
  }

  const categoryHtml = ucdCategories
    .map((cat) => {
      const catPkgs = ucdPackages.filter((p) => String(p.category_id) === String(cat.id));
      const catNodeId = `cat:${cat.id}`;
      const catCard = ucdCard("category", cat, cat.name, 1, "", {
        nodeId: catNodeId,
        parentId: "",
        nodeType: "category",
      });
      const hasChildren = catPkgs.length > 0;
      const packageRowsHtml = catPkgs
        .map((pkg) => {
          return `
            <div class="admin-services__tree-child-row">
              <div class="admin-services__tree-child-branch"></div>
              <div class="admin-services__tree-child-node">${ucdRenderPackageLevel(pkg)}</div>
            </div>
          `;
        })
        .join("");

      return `
        <div class="admin-services__tree-level admin-services__tree-level--category ${hasChildren ? "has-children" : "no-children"}">
          <div class="admin-services__tree-parent">${catCard}</div>
          <div class="admin-services__tree-connector-col">
            <span class="admin-services__tree-connector-bridge"></span>
          </div>
          <div class="admin-services__tree-children ${hasChildren ? "has-children" : "no-children"}">
            ${packageRowsHtml}
          </div>
        </div>
      `;
    })
    .join("");

  root.innerHTML = categoryHtml
    ? `<div class="admin-services__tree-hierarchy">${categoryHtml}</div><svg class="admin-services__tree-connector-svg" data-tree-connector-svg="true" aria-hidden="true"></svg>`
    : `<div class="lhai-state lhai-state--empty">데이터가 없습니다.</div>`;

  ucdRenderInventoryConnectors(root);
  if (!ucdConnectorResizeBound) {
    window.addEventListener("resize", () => {
      if (ucdConnectorResizeRaf) cancelAnimationFrame(ucdConnectorResizeRaf);
      ucdConnectorResizeRaf = requestAnimationFrame(() => {
        const rr = qs("#inventoryTreeRoot");
        if (rr) ucdRenderInventoryConnectors(rr);
      });
    });
    ucdConnectorResizeBound = true;
  }

  root.querySelectorAll(".admin-services__tree-card").forEach((el) => {
    el.addEventListener("dragstart", () => {
      const type = el.getAttribute("data-card-type");
      const id = el.getAttribute("data-card-id");
      if (!type || !id) return;
      dragPayload = { type, id };
    });
    el.addEventListener("dragover", (e) => {
      const targetType = el.getAttribute("data-card-type");
      if (dragPayload && targetType && ucdValidateDrop(dragPayload.type, targetType)) e.preventDefault();
    });
    el.addEventListener("drop", async (e) => {
      e.preventDefault();
      const targetType = el.getAttribute("data-card-type");
      const targetId = el.getAttribute("data-card-id");
      if (!targetType || !targetId) return;
      await ucdHandleDrop(targetType, targetId);
      dragPayload = null;
    });
    el.addEventListener("dragend", () => {
      dragPayload = null;
    });
  });

  root.querySelectorAll("[data-start-inline-edit='true']").forEach((btn) => {
    btn.addEventListener("click", () => {
      const type = btn.getAttribute("data-card-type");
      const id = btn.getAttribute("data-card-id");
      if (!type || !id || type === "inperson") return;
      ucdInlineEdit = { type, id, error: "" };
      ucdRenderInventory();
      const input = qs(`[data-inline-input='true'][data-card-type='${type}'][data-card-id='${id}']`, root);
      input?.focus();
      input?.select();
    });
  });

  root.querySelectorAll("[data-inline-cancel='true']").forEach((btn) => {
    btn.addEventListener("click", () => {
      ucdInlineEdit = null;
      ucdRenderInventory();
    });
  });

  root.querySelectorAll("[data-inline-save='true']").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const type = btn.getAttribute("data-card-type");
      const id = btn.getAttribute("data-card-id");
      if (!type || !id) return;
      const input = qs(`[data-inline-input='true'][data-card-type='${type}'][data-card-id='${id}']`, root);
      await ucdSaveInlineName(type, id, input?.value || "");
    });
  });

  root.querySelectorAll("[data-inline-input='true']").forEach((input) => {
    input.addEventListener("keydown", async (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        ucdInlineEdit = null;
        ucdRenderInventory();
        return;
      }
      if (e.key !== "Enter") return;
      e.preventDefault();
      const type = input.getAttribute("data-card-type");
      const id = input.getAttribute("data-card-id");
      if (!type || !id) return;
      await ucdSaveInlineName(type, id, input.value || "");
    });
  });
}

function ucdRenderInventoryConnectors(root) {
  const svg = qs("[data-tree-connector-svg='true']", root);
  if (!svg) return;
  const cards = qsa(".admin-services__tree-card[data-node-id]", root);
  if (!cards.length) {
    svg.innerHTML = "";
    return;
  }

  const rootRect = root.getBoundingClientRect();
  const byNodeId = new Map();
  cards.forEach((card) => {
    const nodeId = card.getAttribute("data-node-id");
    if (nodeId) byNodeId.set(nodeId, card);
  });

  const width = Math.max(root.scrollWidth, root.clientWidth);
  const height = Math.max(root.scrollHeight, root.clientHeight);
  svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
  svg.setAttribute("width", `${width}`);
  svg.setAttribute("height", `${height}`);

  const stroke = "rgba(148, 163, 184, 0.88)";
  const paths = [];
  cards.forEach((child) => {
    const parentId = child.getAttribute("data-parent-id");
    if (!parentId) return;
    const parent = byNodeId.get(parentId);
    if (!parent) return;
    const pr = parent.getBoundingClientRect();
    const cr = child.getBoundingClientRect();
    const x1 = pr.right - rootRect.left;
    const y1 = pr.top + pr.height / 2 - rootRect.top;
    const x2 = cr.left - rootRect.left;
    const y2 = cr.top + cr.height / 2 - rootRect.top;
    const midX = x1 + Math.max(16, (x2 - x1) / 2);
    const d = `M ${x1} ${y1} L ${midX} ${y1} L ${midX} ${y2} L ${x2} ${y2}`;
    paths.push(`<path d="${d}" fill="none" stroke="${stroke}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />`);
  });
  svg.innerHTML = paths.join("");
}

function ucdRenderManage() {
  const catBody = qs("#manageCategoryTable");
  const pkgBody = qs("#managePackageTable");
  const svcBody = qs("#manageServiceTable");
  if (!catBody || !pkgBody || !svcBody) return;

  catBody.innerHTML = ucdCategories
    .map((c) => {
      const selected = String(ucdSelectedCategoryId) === String(c.id) ? "is-selected" : "";
      return `<tr data-id="${esc(c.id)}" class="${selected}"><td>${esc(c.name)}</td><td>${boolBadge(Boolean(c.active), "Y", "N")}</td></tr>`;
    })
    .join("");
  const filteredPackages = ucdPackages.filter((p) => {
    const byCategory = !ucdPackageFilterCategoryId || String(p.category_id) === String(ucdPackageFilterCategoryId);
    const q = String(ucdPackageSearchQuery || "").trim().toLowerCase();
    const byQuery = !q || String(p.name || "").toLowerCase().includes(q);
    return byCategory && byQuery;
  });
  pkgBody.innerHTML = filteredPackages
    .map((p) => {
      const selected = String(ucdSelectedPackageId) === String(p.id) ? "is-selected" : "";
      return `<tr data-id="${esc(p.id)}" class="${selected}">
        <td>${esc(p.name)}</td>
        <td>${esc(ucdCategoryName(p.category_id))}</td>
        <td>${boolBadge(Boolean(p.active), "Y", "N")}</td>
        <td>${boolBadge(Boolean(p.visible), "Y", "N")}</td>
        <td>${boolBadge(Boolean(p.ai_supported), "Y", "N")}</td>
      </tr>`;
    })
    .join("");
  const svcRows = ucdServices.map((s) => {
    const firstLink = ucdInventory.find((r) => String(r.service_item_id) === String(s.id));
    return {
      ...s,
      package_id: firstLink?.package_id || "",
      package_name: firstLink?.package_name || ucdPackageName(firstLink?.package_id || ""),
      category_id: firstLink?.category_id || "",
      category_name: firstLink?.category_name || ucdCategoryName(firstLink?.category_id || ""),
    };
  });
  const filteredServices = svcRows.filter((s) => {
    if (ucdServiceFilterType && String(s.type || "") !== String(ucdServiceFilterType)) return false;
    if (ucdServiceFilterCategoryId && String(s.category_id || "") !== String(ucdServiceFilterCategoryId)) return false;
    if (ucdServiceFilterPackageId && String(s.package_id || "") !== String(ucdServiceFilterPackageId)) return false;
    if (ucdServiceFilterActive === "active" && !Boolean(s.active)) return false;
    if (ucdServiceFilterActive === "inactive" && Boolean(s.active)) return false;
    return true;
  });
  svcBody.innerHTML = filteredServices
    .map((s) => {
      const selected = String(ucdSelectedServiceId) === String(s.id) ? "is-selected" : "";
      return `<tr data-id="${esc(s.id)}" class="${selected}">
        <td>${esc(s.name)}</td>
        <td>${esc(ucdServiceTypeLabel(s.type || "-"))}</td>
        <td>${esc(s.package_name || "-")}</td>
        <td>${esc(s.category_name || "-")}</td>
        <td>${boolBadge(Boolean(s.active), "Y", "N")}</td>
        <td>${boolBadge(Boolean(s.visible), "Y", "N")}</td>
      </tr>`;
    })
    .join("");

  const catSel = qs("#managePackageCategoryId");
  const svcPkgSel = qs("#manageServicePackageId");
  const pkgFilterSel = qs("#managePackageFilterCategory");
  const pkgSearch = qs("#managePackageSearch");
  const svcTypeFilterSel = qs("#manageServiceFilterType");
  const svcCategoryFilterSel = qs("#manageServiceFilterCategory");
  const svcPackageFilterSel = qs("#manageServiceFilterPackage");
  const svcActiveFilterSel = qs("#manageServiceFilterActive");
  const svcCategorySel = qs("#manageServiceCategoryId");
  const addModuleSel = qs("#managePackageAddModuleId");
  const addAddonSel = qs("#managePackageAddAddonId");
  const compositionBody = qs("#managePackageCompositionTable");
  if (catSel) catSel.innerHTML = `<option value="">선택</option>${ucdCategories.map((c) => `<option value="${esc(c.id)}">${esc(c.name)}</option>`).join("")}`;
  if (svcPkgSel) svcPkgSel.innerHTML = `<option value="">선택</option>${ucdPackages.map((p) => `<option value="${esc(p.id)}">${esc(p.name)}</option>`).join("")}`;
  if (svcCategorySel) svcCategorySel.innerHTML = `<option value="">선택</option>${ucdCategories.map((c) => `<option value="${esc(c.id)}">${esc(c.name)}</option>`).join("")}`;
  if (pkgFilterSel) {
    pkgFilterSel.innerHTML = `<option value="">All categories</option>${ucdCategories.map((c) => `<option value="${esc(c.id)}">${esc(c.name)}</option>`).join("")}`;
    pkgFilterSel.value = ucdPackageFilterCategoryId || "";
  }
  if (pkgSearch) pkgSearch.value = ucdPackageSearchQuery || "";
  if (svcTypeFilterSel) svcTypeFilterSel.value = ucdServiceFilterType || "";
  if (svcCategoryFilterSel) {
    svcCategoryFilterSel.innerHTML = `<option value="">All categories</option>${ucdCategories.map((c) => `<option value="${esc(c.id)}">${esc(c.name)}</option>`).join("")}`;
    svcCategoryFilterSel.value = ucdServiceFilterCategoryId || "";
  }
  if (svcPackageFilterSel) {
    svcPackageFilterSel.innerHTML = `<option value="">All packages</option>${ucdPackages.map((p) => `<option value="${esc(p.id)}">${esc(p.name)}</option>`).join("")}`;
    svcPackageFilterSel.value = ucdServiceFilterPackageId || "";
  }
  if (svcActiveFilterSel) svcActiveFilterSel.value = ucdServiceFilterActive || "";

  // Keep service editor synced with selected service after table/select re-render.
  if (ucdSelectedServiceId) {
    ucdApplyServiceSelectionToForm(ucdSelectedServiceId);
  }

  const modules = ucdServices.filter((s) => String(s.type || "").toLowerCase() === "module");
  const addons = ucdServices.filter((s) => String(s.type || "").toLowerCase() === "addon");
  if (addModuleSel) {
    addModuleSel.innerHTML = `<option value="">Select module</option>${modules.map((m) => `<option value="${esc(m.id)}">${esc(m.name)}</option>`).join("")}`;
  }
  if (addAddonSel) {
    addAddonSel.innerHTML = `<option value="">Select add-on</option>${addons.map((a) => `<option value="${esc(a.id)}">${esc(a.name)}</option>`).join("")}`;
  }
  if (compositionBody) {
    const selectedPkgId = qs("#managePackageId")?.value || ucdSelectedPackageId || "";
    const rows = ucdInventory.filter((r) => String(r.package_id) === String(selectedPkgId));
    compositionBody.innerHTML = rows.length
      ? rows
          .map((r) => `<tr>
            <td>${esc(r.name || "-")}</td>
            <td>${esc(r.type || "-")}</td>
            <td>${boolBadge(Boolean(r.required), "Y", "N")}</td>
            <td><button type="button" class="lhai-button lhai-button--secondary lhai-button--compact" data-remove-package-item="${esc(r.service_item_id)}">Remove</button></td>
          </tr>`)
          .join("")
      : `<tr><td colspan="4">No composition items.</td></tr>`;
  }
}

function ucdBuildServiceLinkMap(serviceId) {
  const links = ucdInventory.filter((r) => String(r.service_item_id) === String(serviceId));
  const primary = links[0] || null;
  return {
    categoryId: primary?.category_id || "",
    packageId: primary?.package_id || "",
  };
}

function ucdPopulateServicePackageOptions(categoryId = "", packageId = "") {
  const pkgSel = qs("#manageServicePackageId");
  if (!pkgSel) return;
  const filtered = ucdPackages.filter((p) => !categoryId || String(p.category_id) === String(categoryId));
  pkgSel.innerHTML = `<option value="">선택</option>${filtered.map((p) => `<option value="${esc(p.id)}">${esc(p.name)}</option>`).join("")}`;
  if (packageId && filtered.some((p) => String(p.id) === String(packageId))) {
    pkgSel.value = String(packageId);
  } else {
    pkgSel.value = "";
  }
}

function ucdApplyServiceSelectionToForm(serviceId) {
  const svc = ucdServices.find((s) => String(s.id) === String(serviceId));
  if (!svc) return;
  const catSel = qs("#manageServiceCategoryId");
  const map = ucdBuildServiceLinkMap(serviceId);
  if (catSel) catSel.value = map.categoryId || "";
  ucdPopulateServicePackageOptions(map.categoryId, map.packageId);
  qs("#manageServiceId").value = svc.id;
  qs("#manageServiceName").value = svc.name || "";
  qs("#manageServiceDescription").value = svc.description || "";
  qs("#manageServiceCustomerTitle").value = svc.customer_title || "";
  qs("#manageServiceCustomerShortDescription").value = svc.customer_short_description || "";
  qs("#manageServiceCustomerLongDescription").value = svc.customer_long_description || "";
  qs("#manageServiceDeliveryTypeLabel").value = svc.delivery_type_label || "";
  qs("#manageServiceDeliveryTypeHelpText").value = svc.delivery_type_help_text || "";
  qs("#manageServiceType").value = svc.type || "module";
  qs("#manageServiceAiCapable").checked = Boolean(svc.ai_capable);
  qs("#manageServiceInPersonRequired").checked = Boolean(svc.in_person_required);
  qs("#manageServiceExtraPrice").value = svc.extra_price ?? 0;
  qs("#manageServiceActive").checked = Boolean(svc.active);
  qs("#manageServiceVisible").checked = Boolean(svc.visible);
  msiOnServiceContextChanged();
}

function ucdSetManageMode(entity, mode, targetName = "") {
  const hint = qs(`#manage${entity}ModeHint`);
  if (!hint) return;
  if (entity === "Category") {
    const title = qs("#manageCategoryEditorTitle");
    const createActions = qs("#manageCategoryActionsCreate");
    const editActions = qs("#manageCategoryActionsEdit");
    const danger = qs("#manageCategoryDangerZone");
    const isEdit = mode === "edit";
    if (title) title.textContent = isEdit ? "Edit Category" : "Create New Category";
    if (createActions) createActions.hidden = isEdit;
    if (editActions) editActions.hidden = !isEdit;
    if (danger) danger.hidden = !isEdit;
  }
  if (entity === "Package") {
    const title = qs("#managePackageEditorTitle");
    const createActions = qs("#managePackageActionsCreate");
    const editActions = qs("#managePackageActionsEdit");
    const danger = qs("#managePackageDangerZone");
    const isEdit = mode === "edit";
    if (title) title.textContent = isEdit ? "Edit Package" : "Create New Package";
    if (createActions) createActions.hidden = isEdit;
    if (editActions) editActions.hidden = !isEdit;
    if (danger) danger.hidden = !isEdit;
  }
  if (entity === "Service") {
    const title = qs("#manageServiceEditorTitle");
    const createActions = qs("#manageServiceActionsCreate");
    const editActions = qs("#manageServiceActionsEdit");
    const danger = qs("#manageServiceDangerZone");
    const isEdit = mode === "edit";
    if (title) title.textContent = isEdit ? "Edit Service" : "Create New Service";
    if (createActions) createActions.hidden = isEdit;
    if (editActions) editActions.hidden = !isEdit;
    if (danger) danger.hidden = !isEdit;
  }
  if (mode === "edit") {
    hint.textContent = `편집 모드: "${targetName || "선택 항목"}" 을(를) 수정 중입니다.`;
    return;
  }
  hint.textContent = "신규 생성 모드입니다.";
}

function ucdBindManageEvents() {
  qs("#manageCategoryTable")?.addEventListener("click", (e) => {
    const tr = e.target.closest("tr[data-id]");
    if (!tr) return;
    const cat = ucdCategories.find((c) => String(c.id) === String(tr.getAttribute("data-id")));
    if (!cat) return;
    ucdSelectedCategoryId = cat.id;
    qs("#manageCategoryId").value = cat.id;
    qs("#manageCategoryName").value = cat.name || "";
    qs("#manageCategoryDescription").value = cat.description || "";
    qs("#manageCategoryCustomerTitle").value = cat.customer_title || "";
    qs("#manageCategoryCustomerSubtitle").value = cat.customer_subtitle || "";
    qs("#manageCategoryCustomerHelpText").value = cat.customer_help_text || "";
    qs("#manageCategoryActive").checked = Boolean(cat.active);
    ucdRenderManage();
    ucdSetManageMode("Category", "edit", cat.name || "");
  });
  qs("#managePackageTable")?.addEventListener("click", (e) => {
    const tr = e.target.closest("tr[data-id]");
    if (!tr) return;
    const pkg = ucdPackages.find((p) => String(p.id) === String(tr.getAttribute("data-id")));
    if (!pkg) return;
    ucdSelectedPackageId = pkg.id;
    qs("#managePackageId").value = pkg.id;
    qs("#managePackageName").value = pkg.name || "";
    qs("#managePackageDescription").value = pkg.short_description || "";
    qs("#managePackageLongDescription").value = pkg.long_description || "";
    qs("#managePackageCategoryId").value = pkg.category_id || "";
    qs("#managePackageAiSupported").checked = Boolean(pkg.ai_supported);
    qs("#managePackageBasePrice").value = pkg.base_price ?? 0;
    qs("#managePackageCurrency").value = pkg.currency || "USD";
    qs("#managePackageActive").checked = Boolean(pkg.active);
    qs("#managePackageVisible").checked = Boolean(pkg.visible);
    ucdRenderManage();
    ucdSetManageMode("Package", "edit", pkg.name || "");
  });
  qs("#manageServiceTable")?.addEventListener("click", (e) => {
    const tr = e.target.closest("tr[data-id]");
    if (!tr) return;
    const svc = ucdServices.find((s) => String(s.id) === String(tr.getAttribute("data-id")));
    if (!svc) return;
    ucdSelectedServiceId = svc.id;
    ucdRenderManage();
    ucdApplyServiceSelectionToForm(svc.id);
    ucdSetManageMode("Service", "edit", svc.name || "");
  });

  qs("#manageCategoryForm")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const id = qs("#manageCategoryId").value;
    const payload = {
      name: qs("#manageCategoryName").value.trim(),
      description: qs("#manageCategoryDescription").value.trim(),
      customer_title: qs("#manageCategoryCustomerTitle").value.trim(),
      customer_subtitle: qs("#manageCategoryCustomerSubtitle").value.trim(),
      customer_help_text: qs("#manageCategoryCustomerHelpText").value.trim(),
      active: qs("#manageCategoryActive").checked,
    };
    if (!payload.customer_title) payload.customer_title = payload.name;
    if (!payload.name) return;
    if (id) await serviceCatalogAdminApi.updateCategory(id, payload);
    else await serviceCatalogAdminApi.createCategory(payload);
    await ucdReload(); ucdRenderInventory(); ucdRenderManage();
  });
  qs("#managePackageForm")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const id = qs("#managePackageId").value;
    const payload = {
      name: qs("#managePackageName").value.trim(),
      short_description: qs("#managePackageDescription").value.trim(),
      long_description: qs("#managePackageLongDescription").value.trim(),
      category_id: qs("#managePackageCategoryId").value || null,
      ai_supported: qs("#managePackageAiSupported").checked,
      base_price: Number(qs("#managePackageBasePrice").value || 0),
      currency: qs("#managePackageCurrency").value || "USD",
      active: qs("#managePackageActive").checked,
      visible: qs("#managePackageVisible").checked,
    };
    if (!payload.name) return;
    if (id) await serviceCatalogAdminApi.updatePackage(id, payload);
    else await serviceCatalogAdminApi.createPackage(payload);
    await ucdReload(); ucdRenderInventory(); ucdRenderManage();
  });
  qs("#manageServiceForm")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const id = qs("#manageServiceId").value;
    const aiCapable = qs("#manageServiceAiCapable").checked;
    const inPersonRequired = qs("#manageServiceInPersonRequired").checked;
    const deliveryFallback = suggestedDeliveryCopy(aiCapable, inPersonRequired);
    const servicePayload = {
      name: qs("#manageServiceName").value.trim(),
      description: qs("#manageServiceDescription").value.trim(),
      customer_title: qs("#manageServiceCustomerTitle").value.trim(),
      customer_short_description: qs("#manageServiceCustomerShortDescription").value.trim(),
      customer_long_description: qs("#manageServiceCustomerLongDescription").value.trim(),
      delivery_type_label: qs("#manageServiceDeliveryTypeLabel").value.trim(),
      delivery_type_help_text: qs("#manageServiceDeliveryTypeHelpText").value.trim(),
      type: qs("#manageServiceType").value,
      ai_capable: aiCapable,
      in_person_required: inPersonRequired,
      extra_price: Number(qs("#manageServiceExtraPrice").value || 0),
      active: qs("#manageServiceActive").checked,
      visible: qs("#manageServiceVisible").checked,
    };
    if (!servicePayload.customer_title) servicePayload.customer_title = servicePayload.name;
    if (!servicePayload.customer_short_description) {
      servicePayload.customer_short_description = servicePayload.description;
    }
    if (!servicePayload.delivery_type_label) {
      servicePayload.delivery_type_label = deliveryFallback.label;
    }
    if (!servicePayload.delivery_type_help_text) {
      servicePayload.delivery_type_help_text = deliveryFallback.help;
    }
    if (!servicePayload.name) return;
    const targetPackageId = qs("#manageServicePackageId").value;
    let serviceId = id;
    if (id) await serviceCatalogAdminApi.updateServiceItem(id, servicePayload);
    else {
      const created = await serviceCatalogAdminApi.createServiceItem(servicePayload);
      serviceId = created?.id;
    }
    if (serviceId) {
      const rows = ucdInventory.filter((r) => String(r.service_item_id) === String(serviceId));
      for (const row of rows) {
        if (row.package_id && row.service_item_id) await serviceCatalogAdminApi.removeServiceItemFromPackage(row.package_id, row.service_item_id);
      }
      if (targetPackageId) await serviceCatalogAdminApi.addServiceItemToPackage(targetPackageId, { service_item_id: serviceId, required: false });
    }
    if (serviceId) ucdSelectedServiceId = serviceId;
    await ucdReload(); ucdRenderInventory(); ucdRenderManage();
    msiOnServiceContextChanged();
  });

  qs("#manageCategoryCreateBtn")?.addEventListener("click", () => {
    ucdSelectedCategoryId = "";
    qs("#manageCategoryId").value = ""; qs("#manageCategoryName").value = ""; qs("#manageCategoryDescription").value = ""; qs("#manageCategoryCustomerTitle").value = "";
    qs("#manageCategoryCustomerSubtitle").value = ""; qs("#manageCategoryCustomerHelpText").value = ""; qs("#manageCategoryActive").checked = true;
    ucdRenderManage();
    ucdSetManageMode("Category", "create");
  });
  qs("#manageCategoryCancelCreateBtn")?.addEventListener("click", () => {
    ucdSelectedCategoryId = "";
    qs("#manageCategoryId").value = ""; qs("#manageCategoryName").value = ""; qs("#manageCategoryDescription").value = ""; qs("#manageCategoryCustomerTitle").value = "";
    qs("#manageCategoryCustomerSubtitle").value = ""; qs("#manageCategoryCustomerHelpText").value = ""; qs("#manageCategoryActive").checked = true;
    ucdRenderManage();
    ucdSetManageMode("Category", "create");
  });
  qs("#manageCategoryCancelEditBtn")?.addEventListener("click", () => {
    ucdSelectedCategoryId = "";
    qs("#manageCategoryId").value = ""; qs("#manageCategoryName").value = ""; qs("#manageCategoryDescription").value = ""; qs("#manageCategoryCustomerTitle").value = "";
    qs("#manageCategoryCustomerSubtitle").value = ""; qs("#manageCategoryCustomerHelpText").value = ""; qs("#manageCategoryActive").checked = true;
    ucdRenderManage();
    ucdSetManageMode("Category", "create");
  });
  qs("#managePackageCreateBtn")?.addEventListener("click", () => {
    ucdSelectedPackageId = "";
    qs("#managePackageId").value = ""; qs("#managePackageName").value = ""; qs("#managePackageDescription").value = ""; qs("#managePackageCategoryId").value = "";
    qs("#managePackageLongDescription").value = "";
    qs("#managePackageAiSupported").checked = false; qs("#managePackageBasePrice").value = "0"; qs("#managePackageCurrency").value = "USD";
    qs("#managePackageActive").checked = true; qs("#managePackageVisible").checked = true;
    ucdRenderManage();
    ucdSetManageMode("Package", "create");
  });
  qs("#managePackageCancelCreateBtn")?.addEventListener("click", () => {
    ucdSelectedPackageId = "";
    qs("#managePackageId").value = ""; qs("#managePackageName").value = ""; qs("#managePackageDescription").value = ""; qs("#managePackageCategoryId").value = "";
    qs("#managePackageLongDescription").value = "";
    qs("#managePackageAiSupported").checked = false; qs("#managePackageBasePrice").value = "0"; qs("#managePackageCurrency").value = "USD";
    qs("#managePackageActive").checked = true; qs("#managePackageVisible").checked = true;
    ucdRenderManage();
    ucdSetManageMode("Package", "create");
  });
  qs("#managePackageCancelEditBtn")?.addEventListener("click", () => {
    ucdSelectedPackageId = "";
    qs("#managePackageId").value = ""; qs("#managePackageName").value = ""; qs("#managePackageDescription").value = ""; qs("#managePackageCategoryId").value = "";
    qs("#managePackageLongDescription").value = "";
    qs("#managePackageAiSupported").checked = false; qs("#managePackageBasePrice").value = "0"; qs("#managePackageCurrency").value = "USD";
    qs("#managePackageActive").checked = true; qs("#managePackageVisible").checked = true;
    ucdRenderManage();
    ucdSetManageMode("Package", "create");
  });

  qs("#managePackageSearch")?.addEventListener("input", (e) => {
    ucdPackageSearchQuery = e.target.value || "";
    ucdRenderManage();
  });
  qs("#managePackageFilterCategory")?.addEventListener("change", (e) => {
    ucdPackageFilterCategoryId = e.target.value || "";
    ucdRenderManage();
  });

  qs("#managePackageAddModuleBtn")?.addEventListener("click", async () => {
    const pkgId = qs("#managePackageId")?.value || "";
    const moduleId = qs("#managePackageAddModuleId")?.value || "";
    if (!pkgId || !moduleId) return;
    await serviceCatalogAdminApi.addServiceItemToPackage(pkgId, { service_item_id: moduleId, required: true });
    await ucdReload(); ucdRenderInventory(); ucdRenderManage();
    ucdSetManageMode("Package", "edit", qs("#managePackageName")?.value || "");
  });
  qs("#managePackageAddAddonBtn")?.addEventListener("click", async () => {
    const pkgId = qs("#managePackageId")?.value || "";
    const addonId = qs("#managePackageAddAddonId")?.value || "";
    if (!pkgId || !addonId) return;
    await serviceCatalogAdminApi.addServiceItemToPackage(pkgId, { service_item_id: addonId, required: false });
    await ucdReload(); ucdRenderInventory(); ucdRenderManage();
    ucdSetManageMode("Package", "edit", qs("#managePackageName")?.value || "");
  });
  qs("#managePackageCompositionTable")?.addEventListener("click", async (e) => {
    const btn = e.target.closest("[data-remove-package-item]");
    if (!btn) return;
    const pkgId = qs("#managePackageId")?.value || "";
    const sid = btn.getAttribute("data-remove-package-item") || "";
    if (!pkgId || !sid) return;
    await serviceCatalogAdminApi.removeServiceItemFromPackage(pkgId, sid);
    await ucdReload(); ucdRenderInventory(); ucdRenderManage();
    ucdSetManageMode("Package", "edit", qs("#managePackageName")?.value || "");
  });
  qs("#manageServiceCreateBtn")?.addEventListener("click", () => {
    ucdSelectedServiceId = "";
    qs("#manageServiceId").value = ""; qs("#manageServiceName").value = ""; qs("#manageServiceDescription").value = ""; qs("#manageServiceType").value = "module";
    qs("#manageServiceCustomerTitle").value = ""; qs("#manageServiceCustomerShortDescription").value = ""; qs("#manageServiceCustomerLongDescription").value = "";
    qs("#manageServiceDeliveryTypeLabel").value = ""; qs("#manageServiceDeliveryTypeHelpText").value = "";
    qs("#manageServiceCategoryId").value = ""; qs("#manageServicePackageId").value = ""; qs("#manageServiceAiCapable").checked = false; qs("#manageServiceInPersonRequired").checked = false;
    qs("#manageServiceExtraPrice").value = "0"; qs("#manageServiceActive").checked = true; qs("#manageServiceVisible").checked = true;
    ucdRenderManage();
    ucdSetManageMode("Service", "create");
    msiOnServiceContextChanged();
  });
  qs("#manageServiceCancelCreateBtn")?.addEventListener("click", () => {
    ucdSelectedServiceId = "";
    qs("#manageServiceId").value = ""; qs("#manageServiceName").value = ""; qs("#manageServiceDescription").value = ""; qs("#manageServiceType").value = "module";
    qs("#manageServiceCustomerTitle").value = ""; qs("#manageServiceCustomerShortDescription").value = ""; qs("#manageServiceCustomerLongDescription").value = "";
    qs("#manageServiceDeliveryTypeLabel").value = ""; qs("#manageServiceDeliveryTypeHelpText").value = "";
    qs("#manageServiceCategoryId").value = ""; qs("#manageServicePackageId").value = ""; qs("#manageServiceAiCapable").checked = false; qs("#manageServiceInPersonRequired").checked = false;
    qs("#manageServiceExtraPrice").value = "0"; qs("#manageServiceActive").checked = true; qs("#manageServiceVisible").checked = true;
    ucdRenderManage();
    ucdSetManageMode("Service", "create");
    msiOnServiceContextChanged();
  });
  qs("#manageServiceCancelEditBtn")?.addEventListener("click", () => {
    ucdSelectedServiceId = "";
    qs("#manageServiceId").value = ""; qs("#manageServiceName").value = ""; qs("#manageServiceDescription").value = ""; qs("#manageServiceType").value = "module";
    qs("#manageServiceCustomerTitle").value = ""; qs("#manageServiceCustomerShortDescription").value = ""; qs("#manageServiceCustomerLongDescription").value = "";
    qs("#manageServiceDeliveryTypeLabel").value = ""; qs("#manageServiceDeliveryTypeHelpText").value = "";
    qs("#manageServiceCategoryId").value = ""; qs("#manageServicePackageId").value = ""; qs("#manageServiceAiCapable").checked = false; qs("#manageServiceInPersonRequired").checked = false;
    qs("#manageServiceExtraPrice").value = "0"; qs("#manageServiceActive").checked = true; qs("#manageServiceVisible").checked = true;
    ucdRenderManage();
    ucdSetManageMode("Service", "create");
    msiOnServiceContextChanged();
  });

  const syncDeliveryCopySuggestions = () => {
    const aiCapable = Boolean(qs("#manageServiceAiCapable")?.checked);
    const inPersonRequired = Boolean(qs("#manageServiceInPersonRequired")?.checked);
    const suggestion = suggestedDeliveryCopy(aiCapable, inPersonRequired);
    const labelInput = qs("#manageServiceDeliveryTypeLabel");
    const helpInput = qs("#manageServiceDeliveryTypeHelpText");
    if (labelInput && !String(labelInput.value || "").trim()) {
      labelInput.value = suggestion.label;
    }
    if (helpInput && !String(helpInput.value || "").trim()) {
      helpInput.value = suggestion.help;
    }
  };
  qs("#manageServiceAiCapable")?.addEventListener("change", syncDeliveryCopySuggestions);
  qs("#manageServiceInPersonRequired")?.addEventListener("change", syncDeliveryCopySuggestions);

  qs("#manageServiceCategoryId")?.addEventListener("change", () => {
    const catId = qs("#manageServiceCategoryId")?.value || "";
    const current = qs("#manageServicePackageId")?.value || "";
    ucdPopulateServicePackageOptions(catId, current);
  });

  qs("#manageServiceFilterType")?.addEventListener("change", (e) => {
    ucdServiceFilterType = e.target.value || "";
    ucdRenderManage();
  });
  qs("#manageServiceFilterCategory")?.addEventListener("change", (e) => {
    ucdServiceFilterCategoryId = e.target.value || "";
    ucdRenderManage();
  });
  qs("#manageServiceFilterPackage")?.addEventListener("change", (e) => {
    ucdServiceFilterPackageId = e.target.value || "";
    ucdRenderManage();
  });
  qs("#manageServiceFilterActive")?.addEventListener("change", (e) => {
    ucdServiceFilterActive = e.target.value || "";
    ucdRenderManage();
  });

  qs("#manageCategoryDeleteBtn")?.addEventListener("click", async () => {
    const id = qs("#manageCategoryId").value; if (!id) return;
    await serviceCatalogAdminApi.deleteCategoryIfSafe(id); ucdSelectedCategoryId = ""; await ucdReload(); ucdRenderInventory(); ucdRenderManage(); ucdSetManageMode("Category", "create");
  });
  qs("#managePackageDeleteBtn")?.addEventListener("click", async () => {
    const id = qs("#managePackageId").value; if (!id) return;
    await serviceCatalogAdminApi.deletePackageIfSafe(id); ucdSelectedPackageId = ""; await ucdReload(); ucdRenderInventory(); ucdRenderManage(); ucdSetManageMode("Package", "create");
  });
  qs("#manageServiceArchiveBtn")?.addEventListener("click", async () => {
    const id = qs("#manageServiceId").value; if (!id) return;
    await serviceCatalogAdminApi.archiveServiceItem(id); ucdSelectedServiceId = ""; await ucdReload(); ucdRenderInventory(); ucdRenderManage(); ucdSetManageMode("Service", "create");
    msiOnServiceContextChanged();
  });

  ucdSetManageMode("Category", "create");
  ucdSetManageMode("Package", "create");
  ucdSetManageMode("Service", "create");
}

async function initAdminServicesUcdPage() {
  const tabsRoot = qs("#adminServicesTopTabs");
  if (!tabsRoot) return false;
  if (!protectCurrentPage()) return false;
  if (!ensureAdminAccess()) return false;
  await loadSidebar("#sidebar", "admin");
  const lang = document.documentElement.lang || "ko";
  await initI18nDomains(["common"], lang);
  applyI18nToDom(document);
  void tabsRoot;
  ucdInitTopTabs();
  ucdInitManageTabs();
  await ucdReload();
  ucdRenderInventory();
  ucdRenderManage();
  ucdBindManageEvents();
  initManageServiceIntakeTab();
  initManageServiceDocumentsTab();
  return true;
}

// Decide which UI to initialize.
const hasUcdUi = Boolean(qs("#panel-manage") && qs("#inventoryTreeRoot"));
if (hasUcdUi) {
  initAdminServicesUcdPage();
} else {
  const hasNewServiceFirstUi = Boolean(qs("#adminServicesTopTabs"));
  if (hasNewServiceFirstUi) {
    initAdminServicesServiceFirstPage();
  } else {
    initAdminServicesPage();
  }
}

export { initAdminServicesPage, initAdminServicesServiceFirstPage, initAdminServicesUcdPage };
void initAdminServicesPage;
