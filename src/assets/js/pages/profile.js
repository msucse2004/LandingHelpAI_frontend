import { loadSidebar } from "../components/sidebar.js";

import { mountPartnerShell } from "../layouts/partner-shell.js";

import { mountCustomerInboxShell } from "../layouts/customer-inbox-shell.js";

import { applyI18nToDom, applyLanguageChangeToPage, wireDynamicPageI18nRefresh } from "../core/i18n-dom.js";
import { bootAppPageContent } from "../core/app-page-i18n-boot.js";
import { localizedStatus } from "../core/i18n-dynamic.js";

import { getSession, setSession, getCurrentRole } from "../core/auth.js";

import { ROLES } from "../core/config.js";

import { getCurrentRoleTierLabelKo, protectCurrentPage } from "../core/guards.js";

import { userCustomerApi, userPreferencesApi } from "../core/api.js";

import {
  getEffectiveLanguage,
  populateSupportedLanguageSelect,
  savePreferredLanguage,
} from "../core/preferred-language.js";

import { renderPartnerProfileContentHtml } from "./partner-profile-content.js";



/** @returns {ReturnType<typeof getProfileFormElements>} */

function getProfileFormElements() {

  return {

    profileEmpty: document.getElementById("profileEmpty"),

    profileStatus: document.getElementById("profileStatus"),

    profileForm: document.getElementById("profileForm"),

    passwordForm: document.getElementById("passwordForm"),

    usernameInput: document.getElementById("pfUsername"),

    firstNameInput: document.getElementById("pfFirstName"),

    lastNameInput: document.getElementById("pfLastName"),

    birthDateInput: document.getElementById("pfBirthDate"),

    genderInput: document.getElementById("pfGender"),

    emailInput: document.getElementById("pfEmail"),

    phoneNumberInput: document.getElementById("pfPhoneNumber"),

    preferredLanguageInput: document.getElementById("pfPreferredLanguage"),

    currentPasswordInput: document.getElementById("pfCurrentPassword"),

    newPasswordInput: document.getElementById("pfNewPassword"),

    newPasswordConfirmInput: document.getElementById("pfNewPasswordConfirm"),

    profileFeedbackDialog: document.getElementById("profileFeedbackDialog"),

    profileFeedbackTitle: document.getElementById("profileFeedbackTitle"),

    profileFeedbackBody: document.getElementById("profileFeedbackBody"),

  };

}



function setStatus(els, msg) {

  if (els.profileStatus) els.profileStatus.textContent = msg || "";

}



/**

 * @param {ReturnType<typeof getProfileFormElements>} els

 * @param {{ ok: boolean; title: string; message?: string }} opts

 */

function showProfileFeedback(els, opts) {

  const dlg = els.profileFeedbackDialog;

  const titleEl = els.profileFeedbackTitle;

  const bodyEl = els.profileFeedbackBody;

  if (!dlg || !titleEl || !bodyEl || typeof dlg.showModal !== "function") {

    const fallback = [opts.title, opts.message].filter(Boolean).join("\n");

    setStatus(els, fallback);

    if (fallback) window.alert(fallback);

    return;

  }

  titleEl.textContent = opts.title || "";

  const msg = (opts.message || "").trim();

  bodyEl.replaceChildren();

  if (msg) {

    const p = document.createElement("p");

    p.textContent = msg;

    bodyEl.appendChild(p);

  }

  dlg.classList.toggle("lhai-dialog--error", !opts.ok);

  dlg.showModal();

}



function phoneDigitsCount(raw) {
  return String(raw || "").replace(/\D/g, "").length;
}

function parseName(fullName) {

  const parts = String(fullName || "")

    .trim()

    .split(" ")

    .filter(Boolean);

  if (!parts.length) return { first: "", last: "" };

  return { first: parts[0], last: parts.slice(1).join(" ") };

}

/** @param {ReturnType<typeof getProfileFormElements>} els @param {Record<string, unknown> | null | undefined} me */
function applyBasicInfoToForm(els, me) {
  if (!me || typeof me !== "object") return;
  const split = parseName(me.full_name || "");
  if (els.firstNameInput) els.firstNameInput.value = String(me.first_name || split.first || "");
  if (els.lastNameInput) els.lastNameInput.value = String(me.last_name || split.last || "");
  if (els.birthDateInput) {
    els.birthDateInput.value = me.birth_date ? String(me.birth_date) : "";
  }
  if (els.genderInput) els.genderInput.value = me.gender ? String(me.gender) : "";
  if (els.emailInput) els.emailInput.value = String(me.email || "");
  if (els.phoneNumberInput) els.phoneNumberInput.value = String(me.phone_number || "");
}



async function mountProfilePageShell() {

  const app = document.getElementById("app");

  if (!(app instanceof HTMLElement)) return;

  const isPartner = getCurrentRole() === ROLES.PARTNER;

  const contentHtml = renderPartnerProfileContentHtml({
    partnerShell: isPartner,
  });

  if (isPartner) {

    document.body.classList.add("lhai-partner-shell-pending");

    await mountPartnerShell(app, {
      pageKey: "profile",
      documentTitle: "Profile - Landing Help AI",
      contentHtml,
      mainExtraClass: "lhai-partner-profile",
    });

  } else {

    await mountCustomerInboxShell(app, contentHtml);

  }

}



async function refreshProfilePageStaticI18n() {
  const root = document.getElementById("app") || document;
  applyI18nToDom(root);
}

wireDynamicPageI18nRefresh(refreshProfilePageStaticI18n);

async function main() {

  if (!protectCurrentPage()) return;

  await bootAppPageContent(["common", "nav", "auth"], async () => {

  try {

    await mountProfilePageShell();

  } catch {

    /* keep page usable even if shell fails */

  }

  const els = getProfileFormElements();

  const s = getSession();

  if (!s || !els.profileForm || !els.passwordForm) {

    els.profileEmpty?.removeAttribute("hidden");

    setStatus(els, localizedStatus("common.profile.no_session", "No login information. Please sign in again."));

    return;

  }

  els.profileEmpty?.setAttribute("hidden", "");

  if (els.usernameInput) els.usernameInput.value = s.username || "";

  if (els.phoneNumberInput && getCurrentRole() !== ROLES.PARTNER) {
    els.phoneNumberInput.required = true;
  }

  if (els.preferredLanguageInput) {
    populateSupportedLanguageSelect(els.preferredLanguageInput, getEffectiveLanguage());
    try {
      const prefs = await userPreferencesApi.getMyPreferences();
      if (prefs?.preferred_language_code) {
        populateSupportedLanguageSelect(els.preferredLanguageInput, prefs.preferred_language_code);
      }
    } catch {
      /* session / guest storage already applied */
    }
  }

  try {

    const me = await userCustomerApi.getMeBasicInfo();

    applyBasicInfoToForm(els, me);

    if (els.emailInput && !els.emailInput.value) els.emailInput.value = s.email || "";

  } catch {

    const split = parseName(s.username || "");

    if (els.firstNameInput) els.firstNameInput.value = split.first;

    if (els.lastNameInput) els.lastNameInput.value = split.last;

    if (els.emailInput) els.emailInput.value = s.email || "";

    if (els.genderInput) els.genderInput.value = "";

    setStatus(els, localizedStatus("common.profile.load_fallback", "Could not load profile from the server. Showing session data."));

  }



  els.profileForm.addEventListener("submit", async (e) => {

    e.preventDefault();

    const first_name = (els.firstNameInput?.value || "").trim();

    const last_name = (els.lastNameInput?.value || "").trim();

    const birth_date = els.birthDateInput?.value || null;

    const gender = (els.genderInput?.value || "").trim() || null;

    const email = (els.emailInput?.value || "").trim();

    const phone_number = (els.phoneNumberInput?.value || "").trim();

    const preferred_language_code = (els.preferredLanguageInput?.value || "").trim();

    const isCustomer = getCurrentRole() !== ROLES.PARTNER;

    if (!first_name || !last_name || !email) {

      setStatus(els, "");

      showProfileFeedback(els, {

        ok: false,

        title: localizedStatus("common.profile.validation_title", "Check your input"),

        message: localizedStatus(
          "common.profile.validation_name_email",
          "Please enter first name, last name, and email."
        ),

      });

      return;

    }

    if (!preferred_language_code) {

      setStatus(els, "");

      showProfileFeedback(els, {

        ok: false,

        title: localizedStatus("common.profile.validation_title", "Check your input"),

        message: localizedStatus(
          "common.profile.validation_preferred_language",
          "Please select a preferred UI language."
        ),

      });

      els.preferredLanguageInput?.focus();

      return;

    }

    if (isCustomer && phoneDigitsCount(phone_number) < 7) {

      setStatus(els, "");

      showProfileFeedback(els, {

        ok: false,

        title: localizedStatus("common.profile.validation_title", "Check your input"),

        message: localizedStatus(
          "common.profile.validation_phone",
          "Please enter a valid phone number (at least 7 digits)."
        ),

      });

      els.phoneNumberInput?.focus();

      return;

    }

    if (!isCustomer && phone_number && phoneDigitsCount(phone_number) < 7) {

      setStatus(els, "");

      showProfileFeedback(els, {

        ok: false,

        title: localizedStatus("common.profile.validation_title", "Check your input"),

        message: localizedStatus(
          "common.profile.validation_phone",
          "Please enter a valid phone number (at least 7 digits)."
        ),

      });

      els.phoneNumberInput?.focus();

      return;

    }

    const submitBtn =
      els.profileForm instanceof HTMLFormElement
        ? els.profileForm.querySelector('button[type="submit"]')
        : null;

    if (submitBtn instanceof HTMLButtonElement) {
      submitBtn.disabled = true;
      submitBtn.setAttribute("aria-busy", "true");
    }

    try {

      const updated = await userCustomerApi.updateMeBasicInfo({

        first_name,

        last_name,

        birth_date,

        gender,

        email,

        phone_number: phone_number || null,

      });

      applyBasicInfoToForm(els, updated);

      const prefsResult = await userPreferencesApi.patchMyPreferences({
        preferred_language_code,
      });
      const langCode = savePreferredLanguage(
        prefsResult?.preferred_language_code || preferred_language_code
      );
      setSession({
        ...getSession(),
        email: updated.email || email,
        preferred_language_code: langCode,
      });
      await applyLanguageChangeToPage(langCode);

      try {
        const fresh = await userCustomerApi.getMeBasicInfo();
        applyBasicInfoToForm(els, fresh);
      } catch {
        /* PATCH response already applied */
      }

      setStatus(els, localizedStatus("common.profile.saved_status", "Saved."));

      showProfileFeedback(els, {

        ok: true,

        title: localizedStatus("common.profile.saved_title", "Saved"),

        message: localizedStatus(
          "common.profile.saved_message",
          "Your profile was saved. (Role tier: {tier})",
          { tier: getCurrentRoleTierLabelKo() }
        ),

      });

    } catch (err) {

      setStatus(els, "");

      showProfileFeedback(els, {

        ok: false,

        title: localizedStatus("common.profile.save_failed_title", "Save failed"),

        message:
          err?.message ||
          localizedStatus(
            "common.profile.save_failed_message",
            "Could not save your profile. Please try again shortly."
          ),

      });

    } finally {

      if (submitBtn instanceof HTMLButtonElement) {

        submitBtn.disabled = false;

        submitBtn.removeAttribute("aria-busy");

      }

    }

  });



  els.passwordForm.addEventListener("submit", async (e) => {

    e.preventDefault();

    const current_password = els.currentPasswordInput?.value || "";

    const new_password = els.newPasswordInput?.value || "";

    const new_password_confirm = els.newPasswordConfirmInput?.value || "";

    if (!current_password || !new_password || !new_password_confirm) {

      setStatus(els, "");

      showProfileFeedback(els, {

        ok: false,

        title: localizedStatus("common.profile.validation_title", "Check your input"),

        message: localizedStatus(
          "common.profile.password_validation",
          "Please fill in all password fields."
        ),

      });

      return;

    }

    try {

      await userCustomerApi.changeMyPassword({

        current_password,

        new_password,

        new_password_confirm,

      });

      if (els.currentPasswordInput) els.currentPasswordInput.value = "";

      if (els.newPasswordInput) els.newPasswordInput.value = "";

      if (els.newPasswordConfirmInput) els.newPasswordConfirmInput.value = "";

      setStatus(els, "");

      showProfileFeedback(els, {

        ok: true,

        title: localizedStatus("common.profile.password_changed_title", "Password updated"),

        message: localizedStatus(
          "common.profile.password_changed_message",
          "Your password has been changed."
        ),

      });

    } catch (err) {

      setStatus(els, "");

      showProfileFeedback(els, {

        ok: false,

        title: localizedStatus("common.profile.password_failed_title", "Password change failed"),

        message:
          err?.message ||
          localizedStatus(
            "common.profile.password_failed_message",
            "Could not change your password. Check your current password and try again."
          ),

      });

    }

  });

  });

}



main();

