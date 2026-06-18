/**
 * Profile page content (shell slot). Partner uses shared page wrapper; customer keeps legacy markup.
 * @param {{ pageTitle?: string, partnerShell?: boolean }} [opts]
 */
import { renderPartnerPageContentHtml } from "../layouts/partner-page-layout.js";

export function renderPartnerProfileContentHtml(opts = {}) {
  const pageTitle = opts.pageTitle || "프로필";
  const subtitle = "회원가입 시 입력한 정보를 확인하고 수정할 수 있습니다.";
  const bodyHtml = `<section class="lhai-card">
        <h2 class="lhai-card__title">기본 정보</h2>
        <form id="profileForm" class="lhai-form" novalidate>
          <div class="service-flow__field">
            <label class="lhai-label" for="pfUsername">아이디</label>
            <input class="lhai-input" id="pfUsername" type="text" disabled />
          </div>
          <div class="service-flow__field">
            <label class="lhai-label" for="pfFirstName">First name</label>
            <input class="lhai-input" id="pfFirstName" type="text" maxlength="80" />
          </div>
          <div class="service-flow__field">
            <label class="lhai-label" for="pfLastName">Last name</label>
            <input class="lhai-input" id="pfLastName" type="text" maxlength="80" />
          </div>
          <div class="service-flow__field">
            <label class="lhai-label" for="pfBirthDate">생년월일</label>
            <input class="lhai-input" id="pfBirthDate" type="date" />
          </div>
          <div class="service-flow__field">
            <label class="lhai-label" for="pfGender">성별</label>
            <select class="lhai-select" id="pfGender">
              <option value="">선택</option>
              <option value="male">남성</option>
              <option value="female">여성</option>
              <option value="other">기타</option>
              <option value="unspecified">응답 안 함</option>
            </select>
          </div>
          <div class="service-flow__field">
            <label class="lhai-label" for="pfEmail">이메일</label>
            <input class="lhai-input" id="pfEmail" type="email" maxlength="320" />
          </div>
          <div class="service-flow__field">
            <label class="lhai-label" for="pfPhoneNumber">전화번호</label>
            <input
              class="lhai-input"
              id="pfPhoneNumber"
              type="tel"
              autocomplete="tel"
              maxlength="64"
              inputmode="tel"
              placeholder="예: 010-1234-5678"
            />
          </div>
          <div class="service-flow__field">
            <label class="lhai-label" for="pfPreferredLanguage">선호 언어 (UI)</label>
            <select class="lhai-select" id="pfPreferredLanguage" required aria-describedby="pfPreferredLanguageHint"></select>
            <p class="lhai-help u-mt-2" id="pfPreferredLanguageHint">앱 화면과 안내 문구에 사용할 언어를 선택해 주세요.</p>
          </div>
          <button type="submit" class="lhai-button lhai-button--primary">정보 저장</button>
        </form>
      </section>
      <section class="lhai-card">
        <h2 class="lhai-card__title">비밀번호 변경</h2>
        <form id="passwordForm" class="lhai-form" novalidate>
          <div class="service-flow__field">
            <label class="lhai-label" for="pfCurrentPassword">현재 비밀번호</label>
            <input class="lhai-input" id="pfCurrentPassword" type="password" autocomplete="current-password" />
          </div>
          <div class="service-flow__field">
            <label class="lhai-label" for="pfNewPassword">새 비밀번호</label>
            <input class="lhai-input" id="pfNewPassword" type="password" autocomplete="new-password" />
          </div>
          <div class="service-flow__field">
            <label class="lhai-label" for="pfNewPasswordConfirm">새 비밀번호 확인</label>
            <input class="lhai-input" id="pfNewPasswordConfirm" type="password" autocomplete="new-password" />
          </div>
          <button type="submit" class="lhai-button lhai-button--primary">비밀번호 변경</button>
        </form>
        <p class="lhai-help" id="profileStatus" role="status" aria-live="polite"></p>
        <p class="lhai-help" id="profileEmpty" hidden>로그인 정보가 없습니다. <a href="login.html">로그인</a>하세요.</p>
      </section>`;

  if (opts.partnerShell) {
    return renderPartnerPageContentHtml({
      title: pageTitle,
      subtitle,
      bodyHtml,
    });
  }

  return `<section class="lhai-page-header">
        <div>
          <h1 class="lhai-title">${pageTitle}</h1>
          <p class="lhai-subtitle">${subtitle}</p>
        </div>
      </section>
      ${bodyHtml}`;
}
