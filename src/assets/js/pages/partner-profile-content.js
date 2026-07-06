/**
 * Profile page content (shell slot). Partner uses shared page wrapper; customer keeps legacy markup.
 * @param {{ partnerShell?: boolean }} [opts]
 */
import { renderPartnerPageContentHtml } from "../layouts/partner-page-layout.js";

export function renderPartnerProfileContentHtml(opts = {}) {
  const bodyHtml = `<section class="lhai-card">
        <h2 class="lhai-card__title" data-i18n="common.profile.basic_section_title" data-i18n-default="Basic information">Basic information</h2>
        <form id="profileForm" class="lhai-form" novalidate>
          <div class="service-flow__field">
            <label class="lhai-label" for="pfUsername" data-i18n="auth.signup.username_label" data-i18n-default="Username">Username</label>
            <input class="lhai-input" id="pfUsername" type="text" disabled />
          </div>
          <div class="service-flow__field">
            <label class="lhai-label" for="pfFirstName" data-i18n="common.service_flow.profile_first_name_label" data-i18n-default="First name">First name</label>
            <input class="lhai-input" id="pfFirstName" type="text" maxlength="80" />
          </div>
          <div class="service-flow__field">
            <label class="lhai-label" for="pfLastName" data-i18n="common.service_flow.profile_last_name_label" data-i18n-default="Last name">Last name</label>
            <input class="lhai-input" id="pfLastName" type="text" maxlength="80" />
          </div>
          <div class="service-flow__field">
            <label class="lhai-label" for="pfBirthDate" data-i18n="common.service_flow.profile_birth_date_label" data-i18n-default="Date of birth">Date of birth</label>
            <input class="lhai-input" id="pfBirthDate" type="date" />
          </div>
          <div class="service-flow__field">
            <label class="lhai-label" for="pfGender" data-i18n="auth.signup.gender_label" data-i18n-default="Gender">Gender</label>
            <select class="lhai-select" id="pfGender">
              <option value="" data-i18n="auth.signup.gender_select" data-i18n-default="Select">Select</option>
              <option value="male" data-i18n="auth.signup.gender_male" data-i18n-default="Male">Male</option>
              <option value="female" data-i18n="auth.signup.gender_female" data-i18n-default="Female">Female</option>
              <option value="other" data-i18n="auth.signup.gender_other" data-i18n-default="Other">Other</option>
              <option value="unspecified" data-i18n="auth.signup.gender_unspecified" data-i18n-default="Prefer not to say">Prefer not to say</option>
            </select>
          </div>
          <div class="service-flow__field">
            <label class="lhai-label" for="pfEmail" data-i18n="common.service_flow.profile_email_label" data-i18n-default="Email">Email</label>
            <input class="lhai-input" id="pfEmail" type="email" maxlength="320" />
          </div>
          <div class="service-flow__field">
            <label class="lhai-label" for="pfPhoneNumber" data-i18n="common.labels.phone_number" data-i18n-default="Phone number">Phone number</label>
            <input
              class="lhai-input"
              id="pfPhoneNumber"
              type="tel"
              autocomplete="tel"
              maxlength="64"
              inputmode="tel"
              data-i18n-placeholder="common.profile.phone_placeholder"
              data-i18n-default="e.g. 010-1234-5678"
              placeholder="e.g. 010-1234-5678"
            />
          </div>
          <div class="service-flow__field">
            <label class="lhai-label" for="pfPreferredLanguage" data-i18n="common.labels.preferred_language_ui" data-i18n-default="Preferred language (UI)">Preferred language (UI)</label>
            <select class="lhai-select" id="pfPreferredLanguage" required aria-describedby="pfPreferredLanguageHint"></select>
            <p class="lhai-help u-mt-2" id="pfPreferredLanguageHint" data-i18n="common.service_flow.preferred_language_help" data-i18n-default="Choose the language used for app screens and guidance.">Choose the language used for app screens and guidance.</p>
          </div>
          <button type="submit" class="lhai-button lhai-button--primary" data-i18n="common.profile.save_button" data-i18n-default="Save profile">Save profile</button>
        </form>
      </section>
      <section class="lhai-card">
        <h2 class="lhai-card__title" data-i18n="common.header.menu.password" data-i18n-default="Change password">Change password</h2>
        <form id="passwordForm" class="lhai-form" novalidate>
          <div class="service-flow__field">
            <label class="lhai-label" for="pfCurrentPassword" data-i18n="common.profile.current_password_label" data-i18n-default="Current password">Current password</label>
            <input class="lhai-input" id="pfCurrentPassword" type="password" autocomplete="current-password" />
          </div>
          <div class="service-flow__field">
            <label class="lhai-label" for="pfNewPassword" data-i18n="auth.reset_password.new_password_label" data-i18n-default="New password">New password</label>
            <input class="lhai-input" id="pfNewPassword" type="password" autocomplete="new-password" />
          </div>
          <div class="service-flow__field">
            <label class="lhai-label" for="pfNewPasswordConfirm" data-i18n="auth.reset_password.confirm_password_label" data-i18n-default="Confirm new password">Confirm new password</label>
            <input class="lhai-input" id="pfNewPasswordConfirm" type="password" autocomplete="new-password" />
          </div>
          <button type="submit" class="lhai-button lhai-button--primary" data-i18n="auth.reset_password.submit" data-i18n-default="Change password">Change password</button>
        </form>
        <p class="lhai-help" id="profileStatus" role="status" aria-live="polite"></p>
        <p class="lhai-help" id="profileEmpty" hidden>
          <span data-i18n="common.profile.no_session" data-i18n-default="No login information.">No login information.</span>
          <a href="login.html" data-i18n="auth.reset_password.link_login" data-i18n-default="Sign in">Sign in</a>
        </p>
      </section>`;

  if (opts.partnerShell) {
    return renderPartnerPageContentHtml({
      title: "Profile",
      titleI18nKey: "common.header.menu.profile",
      subtitle: "Review and update the information you entered at sign-up.",
      subtitleI18nKey: "common.profile.subtitle",
      bodyHtml,
    });
  }

  return `<section class="lhai-page-header">
        <div>
          <h1 class="lhai-title" data-i18n="common.header.menu.profile" data-i18n-default="Profile">Profile</h1>
          <p class="lhai-subtitle" data-i18n="common.profile.subtitle" data-i18n-default="Review and update the information you entered at sign-up.">Review and update the information you entered at sign-up.</p>
        </div>
      </section>
      ${bodyHtml}`;
}
