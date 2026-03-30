import { surveyCustomerApi } from "../core/api.js";
import { qs, safeText, formatMoney } from "../core/utils.js";

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
    return `<div class="lhai-help">선택한 답변에 따라 추가 항목이 없어요.</div>`;
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

function updatePriceSummary() {
  const el = qs("#surveyRecPriceSummary");
  if (!el) return;
  const total = [...selectedAddonIds].reduce((sum, aid) => {
    const a = recommendedAddonById[aid];
    if (!a) return sum;
    const price = typeof a.extra_price === "number" ? a.extra_price : 0;
    return sum + price;
  }, 0);
  const cur = "USD";
  const formatted = total ? formatMoney(total, cur) : "0";
  const pkgCount = selectedPackageIds.size;
  const addonCount = selectedAddonIds.size;
  el.textContent = `선택한 애드온 ${addonCount}개 기준 예상 추가 비용: ${formatted}. (패키지 ${pkgCount}개)`;
}

function renderPackages(rec) {
  const wrap = qs("#surveyRecPackages");
  if (!wrap) return;
  recommendedPackages = rec?.recommended_packages_json?.items || [];
  recommendedModules = rec?.recommended_modules_json?.items || [];
  recommendedAddons = rec?.recommended_addons_json?.items || [];

  if (!recommendedPackages.length) {
    wrap.innerHTML = `<div class="lhai-help">추천 결과를 가져오지 못했어요. 답변을 다시 진행해 주세요.</div>`;
    return;
  }

  // Indexes for fast lookups.
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

  // Default: accept all recommended packages + all recommended add-ons.
  selectedPackageIds = new Set(recommendedPackages.map((p) => p.id));
  selectedAddonIds = new Set(recommendedAddons.map((a) => a.id));

  // Render packages + selection controls.
  wrap.innerHTML = recommendedPackages
    .map((p) => {
      const pkgModules = modulesByPkgId[p.id] || [];
      const pkgAddons = addonsByPkgId[p.id] || [];
      const pkgExp = p.explanation ? `<div class="lhai-help">${safeText(p.explanation)}</div>` : "";

      const addonOptions = pkgAddons
        .map((a) => {
          const price = typeof a.extra_price === "number" ? formatMoney(a.extra_price, a.currency || "USD") : "";
          const priceEl = price ? `<div class="survey-recommendations__addon-price">추가 비용: ${safeText(price)}</div>` : "";
          const exp = a.explanation ? `<div class="lhai-help">${safeText(a.explanation)}</div>` : "";
          return `
            <label class="survey-recommendations__addon-option">
              <div class="survey-recommendations__item-row">
                <div style="display:flex; align-items:flex-start; gap:12px;">
                  <input type="checkbox" class="survey-recommendations__addon-checkbox" data-addon-id="${safeText(a.id)}" checked />
                  <div>
                    <div class="survey-recommendations__item-name" style="font-weight:900; margin-bottom:2px;">${safeText(a.name || "-")}</div>
                    ${priceEl}
                    ${exp}
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
            <input type="checkbox" class="survey-recommendations__package-checkbox survey-recommendations__select-checkbox" data-package-id="${safeText(p.id)}" checked />
            <div class="survey-recommendations__package-title">${safeText(p.name || p.code || "-")}</div>
          </div>
          ${pkgExp}
          <div class="survey-recommendations__grid">
            <div>
              <div class="survey-recommendations__block-title">포함된 모듈</div>
              <div class="survey-recommendations__items">
                ${renderItems(pkgModules)}
              </div>
            </div>
            <div>
              <div class="survey-recommendations__block-title">선택 애드온</div>
              <div class="survey-recommendations__items">
                ${addonOptions || `<div class="lhai-help">선택 가능한 애드온이 없습니다.</div>`}
              </div>
            </div>
          </div>
        </div>
      `;
    })
    .join("");

  // Cache checkbox elements.
  addonCheckboxElById = {};
  recommendedAddons.forEach((a) => {
    addonCheckboxElById[a.id] = wrap.querySelector(`.survey-recommendations__addon-checkbox[data-addon-id="${cssEscape(a.id)}"]`);
  });

  // Bind events.
  wrap.querySelectorAll(".survey-recommendations__package-checkbox").forEach((cb) => {
    cb.addEventListener("change", () => {
      const pkgId = cb.getAttribute("data-package-id") || "";
      const enabled = cb.checked;
      if (enabled) selectedPackageIds.add(pkgId);
      else selectedPackageIds.delete(pkgId);

      const addonIds = addonIdsByPackageId[pkgId] || [];
      addonIds.forEach((aid) => {
        selectedAddonIds.delete(aid);
        const el = addonCheckboxElById[aid];
        if (el) {
          el.disabled = !enabled;
          el.checked = enabled;
          if (enabled) selectedAddonIds.add(aid);
        }
      });

      updatePriceSummary();
    });
  });

  wrap.querySelectorAll(".survey-recommendations__addon-checkbox").forEach((cb) => {
    cb.addEventListener("change", () => {
      const aid = cb.getAttribute("data-addon-id") || "";
      if (cb.checked) selectedAddonIds.add(aid);
      else selectedAddonIds.delete(aid);
      updatePriceSummary();
    });
  });

  updatePriceSummary();
}

async function init() {
  const submissionId = parseSubmissionId();
  if (!submissionId) {
    setStatus("submission_id가 없습니다.");
    return;
  }
  setStatus("추천 결과를 불러오는 중...");
  try {
    const rec = await surveyCustomerApi.getRecommendations(submissionId);
    renderPackages(rec);
    setStatus("");
  } catch (err) {
    setStatus(`추천 결과 로딩 실패: ${err?.message || err}`);
  }

  const form = qs("#surveyRecQuoteForm");
  const backBtn = qs("#surveyRecBackBtn");
  backBtn?.addEventListener("click", () => window.history.back());

  form?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const statusEl = qs("#surveyRecQuoteFormStatus");
    if (statusEl) statusEl.textContent = "";

    if (!selectedPackageIds.size) {
      setStatus("패키지를 최소 1개 선택해주세요.");
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
      if (statusEl) statusEl.textContent = "필수 항목을 모두 입력해주세요.";
      return;
    }

    const accepted_package_ids = [...selectedPackageIds];
    const included_addon_ids = [...selectedAddonIds];

    setStatus("선택을 저장하고 견적을 요청하는 중...");
    try {
      const selection = await surveyCustomerApi.createServiceSelection(submissionId, {
        accepted_package_ids,
        included_addon_ids,
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
      setStatus(`견적 요청 실패: ${msg}`);
    }
  });
}

init();

