import { surveyCustomerApi } from "../core/api.js";
import { initCommonI18nAndApplyDom } from "../core/i18n-dom.js";
import { t } from "../core/i18n-client.js";
import { qs, safeText } from "../core/utils.js";
import { isCatalogRecServiceItemUuidString } from "../lib/catalog-rec-service-item-id.js";

function parseSubmissionId() {
  const q = new URLSearchParams(window.location.search);
  return (q.get("submission_id") || q.get("submission") || "").trim();
}

function setStatus(message) {
  const el = qs("#surveyRecStatus");
  if (el) el.textContent = message || "";
}

function renderItems(list) {
  if (!list || !list.length) {
    return `<div class="lhai-help">${safeText(t("common.survey_recommendations.empty_extra_items", "No extra items for your answers."))}</div>`;
  }
  return list
    .map((it) => {
      const exp = it.explanation ? `<div class="lhai-help">${safeText(it.explanation)}</div>` : "";
      return `
        <div class="survey-recommendations__item">
          <div class="survey-recommendations__item-name">${safeText(it.name || "-")}</div>
          ${exp}
        </div>
      `;
    })
    .join("");
}

let recommendedPackages = [];
let recommendedModules = [];
let recommendedAddons = [];

let selectedPackageIds = new Set();
let selectedAddonIds = new Set();

let addonIdsByPackageId = {};
let recommendedAddonById = {};
let addonCheckboxElById = {};

function cssEscape(value) {
  try {
    if (typeof CSS !== "undefined" && CSS.escape) return CSS.escape(String(value));
  } catch {
    // ignore
  }
  return String(value).replace(/["\\]/g, "\\$&");
}

/** Selection counts only — no money amounts during survey/recommendation step (pricing confirmed at quote). */
function updateSelectionSummary() {
  const el = qs("#surveyRecPriceSummary");
  if (!el) return;
  const pkgCount = selectedPackageIds.size;
  const addonCount = selectedAddonIds.size;
  el.textContent = t(
    "common.survey_recommendations.selection_summary",
    "Selected: {pkgCount} package(s), {addonCount} add-on(s). Amounts are confirmed on the quote, not here."
  )
    .replace("{pkgCount}", String(pkgCount))
    .replace("{addonCount}", String(addonCount));
}

function renderPackages(rec) {
  const wrap = qs("#surveyRecPackages");
  if (!wrap) return;
  recommendedPackages = rec?.recommended_packages_json?.items || [];
  recommendedModules = rec?.recommended_modules_json?.items || [];
  recommendedAddons = rec?.recommended_addons_json?.items || [];

  if (!recommendedPackages.length) {
    wrap.innerHTML = `<div class="lhai-help">${safeText(
      t("common.survey_recommendations.empty_packages", "Could not load recommendations. Please complete the survey again.")
    )}</div>`;
    return;
  }

  const modulesTitle = safeText(t("common.survey_recommendations.block_modules", "Included modules"));
  const addonsTitle = safeText(t("common.survey_recommendations.block_addons", "Optional add-ons"));
  const noAddons = safeText(t("common.survey_recommendations.no_addons", "No add-ons available for this package."));

  const modulesByPkgId = {};
  recommendedModules.forEach((m) => {
    const pid = m.package_id || "";
    if (!modulesByPkgId[pid]) modulesByPkgId[pid] = [];
    modulesByPkgId[pid].push(m);
  });
  const addonsByPkgId = {};
  recommendedAddons.forEach((a) => {
    const pid = a.package_id || "";
    if (!addonsByPkgId[pid]) addonsByPkgId[pid] = [];
    addonsByPkgId[pid].push(a);
  });

  addonIdsByPackageId = {};
  recommendedAddons.forEach((a) => {
    const pid = a.package_id || "";
    addonIdsByPackageId[pid] = addonIdsByPackageId[pid] || [];
    addonIdsByPackageId[pid].push(a.id);
  });

  recommendedAddonById = Object.fromEntries(recommendedAddons.map((a) => [a.id, a]));

  selectedPackageIds = new Set(
    recommendedPackages.filter((p) => isCatalogRecServiceItemUuidString(p.id)).map((p) => p.id)
  );
  selectedAddonIds = new Set(
    recommendedAddons.filter((a) => isCatalogRecServiceItemUuidString(a.id)).map((a) => a.id)
  );

  wrap.innerHTML = recommendedPackages
    .map((p) => {
      const pkgOk = isCatalogRecServiceItemUuidString(p.id);
      const pkgModules = modulesByPkgId[p.id] || [];
      const pkgAddons = addonsByPkgId[p.id] || [];
      const pkgExp = p.explanation ? `<div class="lhai-help">${safeText(p.explanation)}</div>` : "";
      const pkgMappingWarn = pkgOk
        ? ""
        : `<p class="lhai-help" role="alert">${safeText(
            t(
              "common.survey_recommendations.mapping_repair_package",
              "이 패키지는 카탈로그 UUID로 연결되지 않아 견적 요청에 포함할 수 없습니다. 관리자에게 서비스 매핑 복구를 요청하세요."
            )
          )}</p>`;

      const addonOptions = pkgAddons
        .map((a) => {
          const addonOk = isCatalogRecServiceItemUuidString(a.id);
          const exp = a.explanation ? `<div class="lhai-help">${safeText(a.explanation)}</div>` : "";
          const addonWarn = addonOk
            ? ""
            : `<p class="lhai-help u-mt-1" role="alert">${safeText(
                t(
                  "common.survey_recommendations.mapping_repair_addon",
                  "이 추가 항목은 카탈로그 UUID가 아니어서 선택·전송되지 않습니다."
                )
              )}</p>`;
          return `
            <label class="survey-recommendations__addon-option">
              <div class="survey-recommendations__item-row">
                <div style="display:flex; align-items:flex-start; gap:12px;">
                  <input type="checkbox" class="survey-recommendations__addon-checkbox" data-addon-id="${safeText(a.id)}" ${
                    addonOk ? "checked" : ""
                  } ${addonOk ? "" : "disabled"} />
                  <div>
                    <div class="survey-recommendations__item-name" style="font-weight:900; margin-bottom:2px;">${safeText(a.name || "-")}</div>
                    ${exp}
                    ${addonWarn}
                  </div>
                </div>
              </div>
            </label>
          `;
        })
        .join("");

      return `
        <div class="survey-recommendations__package">
          <div class="survey-recommendations__select-row">
            <input type="checkbox" class="survey-recommendations__package-checkbox survey-recommendations__select-checkbox" data-package-id="${safeText(p.id)}" ${
              pkgOk ? "checked" : ""
            } ${pkgOk ? "" : "disabled"} />
            <div class="survey-recommendations__package-title">${safeText(p.name || p.code || "-")}</div>
          </div>
          ${pkgMappingWarn}
          ${pkgExp}
          <div class="survey-recommendations__grid">
            <div>
              <div class="survey-recommendations__block-title">${modulesTitle}</div>
              <div class="survey-recommendations__items">
                ${renderItems(pkgModules)}
              </div>
            </div>
            <div>
              <div class="survey-recommendations__block-title">${addonsTitle}</div>
              <div class="survey-recommendations__items">
                ${addonOptions || `<div class="lhai-help">${noAddons}</div>`}
              </div>
            </div>
          </div>
        </div>
      `;
    })
    .join("");

  addonCheckboxElById = {};
  recommendedAddons.forEach((a) => {
    addonCheckboxElById[a.id] = wrap.querySelector(`.survey-recommendations__addon-checkbox[data-addon-id="${cssEscape(a.id)}"]`);
  });

  wrap.querySelectorAll(".survey-recommendations__package-checkbox").forEach((cb) => {
    cb.addEventListener("change", () => {
      const pkgId = cb.getAttribute("data-package-id") || "";
      if (!isCatalogRecServiceItemUuidString(pkgId)) return;
      const enabled = cb.checked;
      if (enabled) selectedPackageIds.add(pkgId);
      else selectedPackageIds.delete(pkgId);

      const addonIds = addonIdsByPackageId[pkgId] || [];
      addonIds.forEach((aid) => {
        selectedAddonIds.delete(aid);
        const el = addonCheckboxElById[aid];
        if (el) {
          el.disabled = !enabled || !isCatalogRecServiceItemUuidString(aid);
          el.checked = enabled && isCatalogRecServiceItemUuidString(aid);
          if (enabled && isCatalogRecServiceItemUuidString(aid)) selectedAddonIds.add(aid);
        }
      });

      updateSelectionSummary();
    });
  });

  wrap.querySelectorAll(".survey-recommendations__addon-checkbox").forEach((cb) => {
    cb.addEventListener("change", () => {
      const aid = cb.getAttribute("data-addon-id") || "";
      if (!isCatalogRecServiceItemUuidString(aid)) return;
      if (cb.checked) selectedAddonIds.add(aid);
      else selectedAddonIds.delete(aid);
      updateSelectionSummary();
    });
  });

  updateSelectionSummary();
}

async function init() {
  await initCommonI18nAndApplyDom(document);

  const submissionId = parseSubmissionId();
  if (!submissionId) {
    setStatus(t("common.survey_recommendations.err_no_submission", "Missing submission. Open this page from the survey flow."));
    return;
  }
  setStatus(t("common.survey_recommendations.loading", "Loading recommendations…"));
  try {
    const rec = await surveyCustomerApi.getRecommendations(submissionId);
    renderPackages(rec);
    setStatus("");
  } catch (err) {
    setStatus(
      t("common.survey_recommendations.load_failed", "Could not load recommendations: {message}").replace(
        "{message}",
        err?.message || String(err)
      )
    );
  }

  const form = qs("#surveyRecQuoteForm");
  const backBtn = qs("#surveyRecBackBtn");
  backBtn?.addEventListener("click", () => window.history.back());

  form?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const statusEl = qs("#surveyRecQuoteFormStatus");
    if (statusEl) statusEl.textContent = "";

    const acceptedPackageIds = [...selectedPackageIds].filter((id) => isCatalogRecServiceItemUuidString(id));
    const includedAddonIds = [...selectedAddonIds].filter((id) => isCatalogRecServiceItemUuidString(id));

    if (!acceptedPackageIds.length) {
      setStatus(
        t(
          "common.survey_recommendations.pick_valid_catalog_uuid",
          "카탈로그 UUID가 있는 패키지를 하나 이상 선택하세요. 연결이 안 된 항목은 관리자에게 서비스 매핑 복구를 요청하세요."
        )
      );
      return;
    }

    const full_name = qs("#quoteProfileFullName")?.value?.trim() || "";
    const email = qs("#quoteProfileEmail")?.value?.trim() || "";
    const company_name = qs("#quoteCompanyName")?.value?.trim() || "";
    const phone = qs("#quotePhone")?.value?.trim() || "";
    const target_start_date = qs("#quoteScheduleStart")?.value || "";
    const target_end_date = qs("#quoteScheduleEnd")?.value || "";
    const entry_date = qs("#quoteScheduleEntryDate")?.value || "";
    const country = qs("#quoteCountry")?.value?.trim() || "";
    const preferred_language = qs("#quotePreferredLanguage")?.value || "ko";
    const customer_notes = qs("#quoteCustomerNotes")?.value?.trim() || "";

    if (!full_name || !email || !target_start_date || !country || !preferred_language) {
      if (statusEl) statusEl.textContent = t("common.survey_recommendations.form_required", "Please fill all required fields.");
      return;
    }

    setStatus(t("common.survey_recommendations.saving", "Saving your selection and requesting a quote…"));
    try {
      const selection = await surveyCustomerApi.createServiceSelection(submissionId, {
        accepted_package_ids: acceptedPackageIds,
        included_addon_ids: includedAddonIds,
      });

      const quoteRes = await surveyCustomerApi.submitQuoteFromSelection(selection.id, {
        profile: { full_name, email, company_name, phone },
        schedule: { target_start_date, target_end_date, entry_date },
        context: { country, preferred_language, customer_notes },
      });

      const quoteId = quoteRes?.quote?.quote_id || "";
      if (!quoteId) {
        throw new Error("quote_id not returned");
      }
      window.location.href = `quote-detail.html?quote_id=${encodeURIComponent(quoteId)}`;
    } catch (err) {
      const msg = err?.message || String(err);
      setStatus(t("common.survey_recommendations.quote_failed", "Quote request failed: {message}").replace("{message}", msg));
    }
  });
}

void init();
