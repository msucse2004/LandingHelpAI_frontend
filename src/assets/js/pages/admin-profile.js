import { getSession, setSession } from "../core/auth.js";
import { userPreferencesApi } from "../core/api.js";
import { getCurrentRoleTierLabelKo, protectCurrentPage } from "../core/guards.js";
import { applyLanguageChangeToPage } from "../core/i18n-dom.js";
import { bootAppPageContent } from "../core/app-page-i18n-boot.js";
import {
  getEffectiveLanguage,
  getSupportedLanguageDisplayLabel,
  populateSupportedLanguageSelect,
  savePreferredLanguage,
} from "../core/preferred-language.js";

const profileDl = document.getElementById("profileDl");
const profileEmpty = document.getElementById("profileEmpty");
const prefForm = document.getElementById("adminProfilePrefForm");
const prefSelect = document.getElementById("adminProfilePreferredLanguage");
const prefStatus = document.getElementById("adminProfilePrefStatus");

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function setPrefStatus(message, { error = false } = {}) {
  if (!prefStatus) return;
  prefStatus.textContent = message || "";
  prefStatus.classList.toggle("lhai-field-error", Boolean(error) && Boolean(message));
  prefStatus.classList.toggle("lhai-help", !error || !message);
}

async function loadPreferredLanguageSelect() {
  if (!(prefSelect instanceof HTMLSelectElement)) return;
  populateSupportedLanguageSelect(prefSelect, getEffectiveLanguage());
  try {
    const prefs = await userPreferencesApi.getMyPreferences();
    if (prefs?.preferred_language_code) {
      populateSupportedLanguageSelect(prefSelect, prefs.preferred_language_code);
    }
  } catch {
    /* session already applied */
  }
}

function renderSessionRows(session) {
  if (!profileDl) return;
  const langCode = session.preferred_language_code || getEffectiveLanguage();
  const rows = [
    ["아이디", session.username || "—"],
    ["이메일", session.email || "—"],
    ["역할", session.role || "—"],
    ["권한 티어", getCurrentRoleTierLabelKo()],
    ["선호 언어 (UI)", getSupportedLanguageDisplayLabel(langCode)],
    ["사용자 ID", session.userId || "—"],
  ];
  profileDl.innerHTML = rows
    .map(
      ([k, v]) =>
        `<div class="lhai-detail-dl__row"><dt class="lhai-detail-dl__dt">${escapeHtml(k)}</dt><dd class="lhai-detail-dl__dd">${escapeHtml(v)}</dd></div>`,
    )
    .join("");
}

async function main() {
  if (!protectCurrentPage()) return;
  await bootAppPageContent(["common", "nav", "admin"], async () => {
  const session = getSession();
  if (!session || !profileDl) {
    profileEmpty?.removeAttribute("hidden");
    return;
  }
  profileEmpty?.setAttribute("hidden", "");
  renderSessionRows(session);
  await loadPreferredLanguageSelect();

  prefForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!(prefSelect instanceof HTMLSelectElement)) return;
    const preferred_language_code = prefSelect.value.trim();
    if (!preferred_language_code) {
      setPrefStatus("선호 언어를 선택해 주세요.", { error: true });
      return;
    }
    const submitBtn = prefForm.querySelector('button[type="submit"]');
    if (submitBtn instanceof HTMLButtonElement) {
      submitBtn.disabled = true;
      submitBtn.setAttribute("aria-busy", "true");
    }
    setPrefStatus("저장 중…");
    try {
      const prefs = await userPreferencesApi.patchMyPreferences({ preferred_language_code });
      const langCode = savePreferredLanguage(prefs?.preferred_language_code || preferred_language_code);
      setSession({ ...session, preferred_language_code: langCode });
      renderSessionRows({ ...session, preferred_language_code: langCode });
      populateSupportedLanguageSelect(prefSelect, langCode);
      await applyLanguageChangeToPage(langCode);
      setPrefStatus("저장했습니다.");
    } catch (err) {
      setPrefStatus(err?.message || "저장에 실패했습니다.", { error: true });
    } finally {
      if (submitBtn instanceof HTMLButtonElement) {
        submitBtn.disabled = false;
        submitBtn.removeAttribute("aria-busy");
      }
    }
  });
  });
}

main();
