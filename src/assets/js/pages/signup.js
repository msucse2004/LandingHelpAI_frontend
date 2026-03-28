import { authApi } from "../core/api.js";

const form = document.getElementById("signupForm");
const statusEl = document.getElementById("signupStatus");
const usernameInput = document.getElementById("username");
const usernameFeedback = document.getElementById("usernameFeedback");
const birthDateText = document.getElementById("birthDateText");
const birthDatePicker = document.getElementById("birthDatePicker");
const passwordInput = document.getElementById("password");
const passwordConfirmInput = document.getElementById("passwordConfirm");
const passwordMatchFeedback = document.getElementById("passwordMatchFeedback");
const signupSubmitBtn = document.getElementById("signupSubmitBtn");
const inviteBanner = document.getElementById("inviteBanner");
const inviteBannerBody = document.getElementById("inviteBannerBody");
const emailInput = document.getElementById("email");
const fullNameInput = document.getElementById("fullName");
const genderSelect = document.getElementById("gender");
const roleFieldGroup = document.getElementById("roleFieldGroup");
const roleNameSelect = document.getElementById("roleName");
const roleNameHint = document.getElementById("roleNameHint");
const pageSubtitle = document.querySelector(".lhai-page-header .lhai-subtitle");
const signupResultDialog = document.getElementById("signupResultDialog");
const signupResultTitle = document.getElementById("signupResultTitle");
const signupResultBody = document.getElementById("signupResultBody");
const signupResultLoginLink = document.getElementById("signupResultLoginLink");
const signupResultCloseBtn = document.getElementById("signupResultCloseBtn");

const urlParams = new URLSearchParams(window.location.search);
let activeInviteToken = (urlParams.get("invite") || urlParams.get("invitation_token") || "").trim();
let inviteFlowBlocked = false;

const ROLE_LABEL_KO = {
  customer: "고객",
  agent: "에이전트",
  supervisor: "슈퍼바이저",
  headquarters_staff: "본사 스태프",
  admin: "관리자",
  super_admin: "최고 관리자",
};

const USERNAME_PATTERN = /^[-a-zA-Z0-9_.]+$/;
/** 가입 API 중복 호출 방지(이중 제출·이벤트 리스너 중복 시 인증 메일 반복 발송 방지) */
let signupSubmitInFlight = false;
let usernameCheckTimer = null;
/** Normalized username (lowercase) that last received 서버 «사용 가능» 응답 */
let usernameVerifiedNormalized = null;
let usernameCheckInFlight = false;

function currentUsernameNormalized() {
  return usernameInput ? usernameInput.value.trim().toLowerCase() : "";
}

function refreshSignupSubmitButton() {
  if (!signupSubmitBtn) return;
  const cur = currentUsernameNormalized();
  const canSubmit =
    !usernameCheckInFlight &&
    usernameVerifiedNormalized !== null &&
    cur.length >= 2 &&
    USERNAME_PATTERN.test(cur) &&
    cur === usernameVerifiedNormalized;
  signupSubmitBtn.disabled = !canSubmit;
  signupSubmitBtn.setAttribute("aria-disabled", canSubmit ? "false" : "true");
  updateUsernameStatus();
}

function clearUsernameAvailabilityPass() {
  usernameVerifiedNormalized = null;
  refreshSignupSubmitButton();
}

function setStatus(message) {
  if (statusEl) statusEl.textContent = message;
}

/** 가입 성공 다이얼로그를 닫을 때 로그인 페이지로 이동할지(확인·Esc 등) */
let signupRedirectToLoginOnClose = false;

/**
 * @param {{ title: string, paragraphs: string[], showLoginLink?: boolean, variant?: "success"|"error", devToken?: string | null, redirectToLoginAfterClose?: boolean }} spec
 */
function openSignupOutcomeDialog(spec) {
  if (!signupResultDialog || !signupResultTitle || !signupResultBody) return;
  const {
    title,
    paragraphs,
    showLoginLink = false,
    variant = "success",
    devToken = null,
    redirectToLoginAfterClose = false,
  } = spec;
  signupRedirectToLoginOnClose = Boolean(redirectToLoginAfterClose);
  signupResultTitle.textContent = title;
  signupResultBody.replaceChildren();
  for (const line of paragraphs) {
    const p = document.createElement("p");
    p.textContent = line;
    signupResultBody.appendChild(p);
  }
  if (devToken) {
    const pre = document.createElement("pre");
    pre.className = "lhai-dialog__pre";
    pre.textContent = `🛠️ 개발용 인증 토큰: ${devToken}`;
    signupResultBody.appendChild(pre);
  }
  if (signupResultLoginLink) {
    signupResultLoginLink.hidden = !showLoginLink;
  }
  signupResultDialog.classList.toggle("lhai-dialog--error", variant === "error");
  signupResultDialog.showModal();
  queueMicrotask(() => signupResultCloseBtn?.focus());
}

if (signupResultDialog) {
  signupResultDialog.addEventListener("close", () => {
    if (!signupRedirectToLoginOnClose) return;
    signupRedirectToLoginOnClose = false;
    window.location.assign("login.html");
  });
}

function setInputStatus(wrapEl, state) {
  if (!wrapEl) return;
  wrapEl.classList.remove("is-valid", "is-invalid");
  if (state === "valid") wrapEl.classList.add("is-valid");
  else if (state === "invalid") wrapEl.classList.add("is-invalid");
}

function setUsernameFeedback(text, { variant = "neutral" } = {}) {
  if (!usernameFeedback) return;
  usernameFeedback.textContent = text;
  usernameFeedback.classList.remove("lhai-field-error", "lhai-field-success", "lhai-field-hint");
  if (text) {
    if (variant === "error") usernameFeedback.classList.add("lhai-field-error");
    else if (variant === "success") usernameFeedback.classList.add("lhai-field-success");
    else if (variant === "hint") usernameFeedback.classList.add("lhai-field-hint");
  }
  updateUsernameStatus();
}

function updateUsernameStatus() {
  const wrap = document.getElementById("usernameStatusWrap");
  if (!usernameInput || !wrap) return;
  const raw = usernameInput.value.trim();
  if (raw.length < 2) {
    setInputStatus(wrap, "neutral");
    return;
  }
  if (!USERNAME_PATTERN.test(raw)) {
    setInputStatus(wrap, "invalid");
    return;
  }
  if (usernameCheckInFlight) {
    setInputStatus(wrap, "neutral");
    return;
  }
  const cur = raw.toLowerCase();
  if (usernameVerifiedNormalized !== null && cur === usernameVerifiedNormalized) {
    setInputStatus(wrap, "valid");
    return;
  }
  if (usernameFeedback?.classList.contains("lhai-field-error")) {
    setInputStatus(wrap, "invalid");
    return;
  }
  setInputStatus(wrap, "neutral");
}

function updateEmailStatus() {
  const wrap = document.getElementById("emailStatusWrap");
  if (!emailInput || !wrap) return;
  const v = emailInput.value.trim();
  if (v.length === 0) {
    setInputStatus(wrap, "neutral");
    return;
  }
  if (emailInput.validity.valid) setInputStatus(wrap, "valid");
  else setInputStatus(wrap, "invalid");
}

function updateFullNameStatus() {
  const wrap = document.getElementById("fullNameStatusWrap");
  if (!fullNameInput || !wrap) return;
  const v = fullNameInput.value.trim();
  if (v.length === 0) setInputStatus(wrap, "neutral");
  else setInputStatus(wrap, "valid");
}

function updateBirthDateStatus() {
  const wrap = document.getElementById("birthDateStatusWrap");
  if (!wrap) return;
  const raw = (birthDateText?.value || "").trim();
  const pickerVal = birthDatePicker?.value || "";
  const hasAttempt = raw.length > 0 || pickerVal.length > 0;
  const v = getBirthDateValue();
  if (!hasAttempt) {
    setInputStatus(wrap, "neutral");
    return;
  }
  if (!v) {
    setInputStatus(wrap, "invalid");
    return;
  }
  const [by, bmo, bd] = v.split("-").map(Number);
  if (by < 1900) {
    setInputStatus(wrap, "invalid");
    return;
  }
  const chosen = new Date(by, bmo - 1, bd);
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  if (chosen > todayStart) {
    setInputStatus(wrap, "invalid");
    return;
  }
  setInputStatus(wrap, "valid");
}

function updateGenderStatus() {
  const wrap = document.getElementById("genderStatusWrap");
  if (!genderSelect || !wrap) return;
  setInputStatus(wrap, genderSelect.value ? "valid" : "neutral");
}

function updatePasswordStatus() {
  const wrap = document.getElementById("passwordStatusWrap");
  if (!passwordInput || !wrap) return;
  const v = passwordInput.value;
  if (v.length === 0) setInputStatus(wrap, "neutral");
  else if (v.length >= 4) setInputStatus(wrap, "valid");
  else setInputStatus(wrap, "invalid");
}

function updatePasswordConfirmStatus() {
  const wrap = document.getElementById("passwordConfirmStatusWrap");
  if (!passwordConfirmInput || !passwordInput || !wrap) return;
  const primary = passwordInput.value;
  const confirm = passwordConfirmInput.value;
  if (confirm.length === 0) {
    setInputStatus(wrap, "neutral");
    return;
  }
  if (primary.length >= 4 && primary === confirm) setInputStatus(wrap, "valid");
  else setInputStatus(wrap, "invalid");
}

function normalizeBirthDigits(text) {
  const trimmed = String(text || "").trim();
  const digits = trimmed.replace(/\D/g, "");
  if (digits.length === 8) {
    return `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6, 8)}`;
  }
  const m = trimmed.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  return `${String(y).padStart(4, "0")}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function isValidCalendarDate(ymd) {
  const parts = ymd.split("-").map(Number);
  if (parts.length !== 3 || parts.some((n) => Number.isNaN(n))) return false;
  const [y, mo, d] = parts;
  const dt = new Date(y, mo - 1, d);
  return dt.getFullYear() === y && dt.getMonth() === mo - 1 && dt.getDate() === d;
}

function getBirthDateValue() {
  const fromPicker = birthDatePicker && birthDatePicker.value ? birthDatePicker.value.trim() : "";
  if (fromPicker && isValidCalendarDate(fromPicker)) return fromPicker;
  const norm = birthDateText ? normalizeBirthDigits(birthDateText.value) : null;
  if (norm && isValidCalendarDate(norm)) return norm;
  return "";
}

function syncTextToPicker() {
  if (!birthDateText || !birthDatePicker) return;
  const norm = normalizeBirthDigits(birthDateText.value);
  if (norm && isValidCalendarDate(norm)) {
    birthDatePicker.value = norm;
    birthDateText.value = norm;
  }
}

function syncPickerToText() {
  if (!birthDateText || !birthDatePicker) return;
  if (birthDatePicker.value) {
    birthDateText.value = birthDatePicker.value;
  }
}

function updatePasswordMatchFeedback() {
  if (!passwordMatchFeedback) return;
  const primary = passwordInput ? passwordInput.value : "";
  const confirm = passwordConfirmInput ? passwordConfirmInput.value : "";
  passwordMatchFeedback.classList.remove("lhai-field-error", "lhai-field-success", "lhai-field-hint");
  if (confirm.length === 0) {
    passwordMatchFeedback.textContent = "";
    updatePasswordConfirmStatus();
    return;
  }
  if (primary.length < 4) {
    passwordMatchFeedback.textContent = "먼저 위 칸에 비밀번호를 4자 이상 입력해 주세요.";
    passwordMatchFeedback.classList.add("lhai-field-hint");
    updatePasswordConfirmStatus();
    return;
  }
  if (primary === confirm) {
    passwordMatchFeedback.textContent = "처음 입력한 비밀번호와 동일합니다.";
    passwordMatchFeedback.classList.add("lhai-field-success");
    updatePasswordConfirmStatus();
    return;
  }
  passwordMatchFeedback.textContent = "처음 입력한 비밀번호와 다릅니다. 동일하게 입력해 주세요.";
  passwordMatchFeedback.classList.add("lhai-field-error");
  updatePasswordConfirmStatus();
}

if (passwordInput && passwordConfirmInput) {
  passwordInput.addEventListener("input", () => {
    updatePasswordStatus();
    updatePasswordMatchFeedback();
  });
  passwordConfirmInput.addEventListener("input", updatePasswordMatchFeedback);
}

if (birthDateText && birthDatePicker) {
  const today = new Date();
  const ty = today.getFullYear();
  const tm = String(today.getMonth() + 1).padStart(2, "0");
  const td = String(today.getDate()).padStart(2, "0");
  birthDatePicker.max = `${ty}-${tm}-${td}`;

  birthDateText.addEventListener("input", () => {
    let v = birthDateText.value.replace(/[^\d-]/g, "");
    if (v.length > 10) v = v.slice(0, 10);
    birthDateText.value = v;
    updateBirthDateStatus();
  });
  birthDateText.addEventListener("blur", () => {
    syncTextToPicker();
    updateBirthDateStatus();
  });
  birthDatePicker.addEventListener("change", () => {
    syncPickerToText();
    updateBirthDateStatus();
  });
  birthDatePicker.addEventListener("input", () => {
    syncPickerToText();
    updateBirthDateStatus();
  });
}

if (emailInput) {
  emailInput.addEventListener("input", updateEmailStatus);
  emailInput.addEventListener("blur", updateEmailStatus);
}

if (fullNameInput) {
  fullNameInput.addEventListener("input", updateFullNameStatus);
  fullNameInput.addEventListener("blur", updateFullNameStatus);
}

if (genderSelect) {
  genderSelect.addEventListener("change", updateGenderStatus);
}

async function runUsernameCheck() {
  if (!usernameInput) return;
  const raw = usernameInput.value.trim();
  if (raw.length < 2) {
    clearUsernameAvailabilityPass();
    setUsernameFeedback("아이디는 2자 이상이어야 합니다. 입력을 마치면 사용 가능 여부를 확인합니다.", {
      variant: "hint",
    });
    return;
  }
  if (!USERNAME_PATTERN.test(raw)) {
    clearUsernameAvailabilityPass();
    setUsernameFeedback("아이디는 영문, 숫자, . _ - 만 사용할 수 있습니다.", { variant: "error" });
    return;
  }

  usernameCheckInFlight = true;
  refreshSignupSubmitButton();
  setUsernameFeedback("아이디 중복 여부 확인 중…", { variant: "hint" });
  try {
    const result = await authApi.checkUsernameAvailable(raw);
    if (usernameInput.value.trim() !== raw) {
      return;
    }
    if (result.error) {
      clearUsernameAvailabilityPass();
      const corsHint = result.likelyCorsOrOffline
        ? " 백엔드가 실행 중인지, 그리고 이 페이지를 연 주소(포트)가 백엔드 CORS_ORIGINS에 허용돼 있는지 확인해 주세요."
        : "";
      setUsernameFeedback(`서버에 연결할 수 없어 중복 여부를 확인하지 못했습니다.${corsHint}`, {
        variant: "error",
      });
      return;
    }
    if (result.skipped) {
      clearUsernameAvailabilityPass();
      setUsernameFeedback("");
      return;
    }
    if (result.available === false) {
      clearUsernameAvailabilityPass();
      setUsernameFeedback("이미 사용 중인 아이디입니다. 다른 아이디를 입력해 주세요.", { variant: "error" });
      return;
    }
    const norm = String(result.username || raw).trim().toLowerCase();
    usernameVerifiedNormalized = norm;
    setUsernameFeedback("사용 가능한 아이디입니다.", { variant: "success" });
  } finally {
    usernameCheckInFlight = false;
    refreshSignupSubmitButton();
  }
}

if (usernameInput) {
  usernameInput.addEventListener("input", () => {
    clearTimeout(usernameCheckTimer);
    const raw = usernameInput.value.trim();
    refreshSignupSubmitButton();
    if (raw.length < 2) {
      clearUsernameAvailabilityPass();
      setUsernameFeedback("아이디는 2자 이상이어야 합니다. 입력을 마치면 사용 가능 여부를 확인합니다.", {
        variant: "hint",
      });
      return;
    }
    if (!USERNAME_PATTERN.test(raw)) {
      clearUsernameAvailabilityPass();
      setUsernameFeedback("아이디는 영문, 숫자, . _ - 만 사용할 수 있습니다.", { variant: "error" });
      return;
    }
    setUsernameFeedback("잠시 후 서버에서 중복 여부를 확인합니다…", { variant: "hint" });
    usernameCheckTimer = setTimeout(runUsernameCheck, 450);
  });

  usernameInput.addEventListener("blur", () => {
    clearTimeout(usernameCheckTimer);
    const raw = usernameInput.value.trim();
    if (raw.length >= 2 && USERNAME_PATTERN.test(raw)) {
      void runUsernameCheck();
    }
  });
}

async function initInviteFlow() {
  if (!activeInviteToken) return;
  inviteBanner?.removeAttribute("hidden");
  if (inviteBannerBody) inviteBannerBody.textContent = "초대 정보를 확인하는 중…";
  try {
    const p = await authApi.invitationPreview(activeInviteToken);
    if (!p.valid) {
      inviteFlowBlocked = true;
      signupSubmitBtn && (signupSubmitBtn.disabled = true);
      const reasons = { not_found: "잘못된 링크", used: "이미 사용된 초대", expired: "만료됨" };
      if (inviteBannerBody) {
        inviteBannerBody.textContent = `이 초대 링크로는 가입할 수 없습니다 (${reasons[p.reason] || p.reason || "오류"}). 관리자에게 새 초대 메일을 요청하세요.`;
      }
      inviteBanner?.classList.add("lhai-card--alert");
      return;
    }
    if (emailInput) {
      emailInput.value = p.email || "";
      emailInput.readOnly = true;
      emailInput.setAttribute("aria-readonly", "true");
    }
    if (roleNameSelect) {
      roleNameSelect.innerHTML = "";
      const opt = document.createElement("option");
      opt.value = p.role_name || "customer";
      opt.textContent = `${p.role_name} (${ROLE_LABEL_KO[p.role_name] || p.role_name})`;
      opt.selected = true;
      roleNameSelect.appendChild(opt);
      roleNameSelect.disabled = true;
      roleNameSelect.setAttribute("aria-disabled", "true");
    }
    if (roleNameHint) {
      roleNameHint.textContent = "역할은 초대에 따라 자동으로 설정됩니다. 변경할 수 없습니다.";
    }
    roleFieldGroup?.removeAttribute("hidden");
    if (inviteBannerBody) {
      inviteBannerBody.innerHTML = `초대된 역할: <strong>${ROLE_LABEL_KO[p.role_name] || p.role_name}</strong> (${p.role_name}). 이메일은 초대와 동일해야 합니다. 가입 제출 후 <strong>등록 이메일로 인증 메일</strong>이 오니, 링크로 인증을 마친 뒤 로그인할 수 있습니다. (초대 메일과는 별도입니다.)`;
    }
    if (pageSubtitle) {
      pageSubtitle.textContent =
        "관리자 초대로 가입합니다. 아이디 중복 확인 후 가입을 마치면, 보안을 위해 본인 이메일 인증(별도 메일)을 완료한 다음 로그인하세요.";
    }
  } catch (e) {
    activeInviteToken = "";
    inviteFlowBlocked = true;
    signupSubmitBtn && (signupSubmitBtn.disabled = true);
    if (inviteBannerBody) {
      inviteBannerBody.textContent = `초대 정보를 불러오지 못했습니다. ${e.message || e}`;
    }
    inviteBanner?.classList.add("lhai-card--alert");
  }
}

if (form) {
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (signupSubmitInFlight) {
      return;
    }
    const formData = new FormData(form);

    if (inviteFlowBlocked) {
      setStatus("초대 링크가 유효하지 않아 가입을 진행할 수 없습니다.");
      return;
    }

    const birthDate = getBirthDateValue();
    const gender = String(formData.get("gender") || "").trim();
    if (!birthDate) {
      setStatus("생년월일을 숫자(YYYY-MM-DD 또는 8자리)로 입력하거나 달력에서 선택해 주세요.");
      return;
    }
    const [by, bmo, bd] = birthDate.split("-").map(Number);
    if (by < 1900) {
      setStatus("생년월일의 연도는 1900년 이후여야 합니다.");
      return;
    }
    const chosen = new Date(by, bmo - 1, bd);
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    if (chosen > todayStart) {
      setStatus("생년월일은 오늘 이후일 수 없습니다.");
      return;
    }
    if (!gender) {
      setStatus("성별을 선택해 주세요.");
      return;
    }

    const password = String(formData.get("password") || "");
    const passwordConfirm = String(formData.get("passwordConfirm") || "");
    if (password.length < 4) {
      setStatus("비밀번호는 4자 이상이어야 합니다.");
      return;
    }
    if (password !== passwordConfirm) {
      setStatus("비밀번호 확인이 처음 입력한 비밀번호와 일치하지 않습니다.");
      updatePasswordMatchFeedback();
      passwordConfirmInput?.focus();
      return;
    }

    const payload = {
      username: String(formData.get("username") || "").trim(),
      full_name: String(formData.get("fullName") || "").trim(),
      email: String(formData.get("email") || "").trim(),
      password,
      password_confirm: passwordConfirm,
      birth_date: birthDate,
      gender,
      role_name: activeInviteToken ? String(formData.get("roleName") || "customer") : "customer",
    };
    if (activeInviteToken) {
      payload.invitation_token = activeInviteToken;
    }

    const usernameNorm = payload.username.toLowerCase();
    if (
      usernameVerifiedNormalized !== usernameNorm ||
      !USERNAME_PATTERN.test(payload.username) ||
      payload.username.length < 2
    ) {
      setStatus("아이디 사용 가능 여부를 서버에서 확인한 뒤 다시 시도해 주세요.");
      refreshSignupSubmitButton();
      return;
    }

    if (payload.username.length >= 2 && USERNAME_PATTERN.test(payload.username)) {
      const check = await authApi.checkUsernameAvailable(payload.username);
      if (check.available === false) {
        clearUsernameAvailabilityPass();
        setStatus("이미 사용 중인 아이디입니다. 아이디를 바꾼 뒤 다시 시도해 주세요.");
        setUsernameFeedback("이미 사용 중인 아이디입니다. 다른 아이디를 입력해 주세요.", { variant: "error" });
        return;
      }
      if (check.error) {
        clearUsernameAvailabilityPass();
        setStatus("아이디 중복 확인에 실패했습니다. 네트워크·API 주소를 확인한 뒤 다시 시도해 주세요.");
        setUsernameFeedback("서버에 연결할 수 없어 중복 여부를 확인하지 못했습니다.", { variant: "error" });
        return;
      }
    }

    signupSubmitInFlight = true;
    if (signupSubmitBtn) {
      signupSubmitBtn.disabled = true;
      signupSubmitBtn.setAttribute("aria-busy", "true");
    }
    try {
      setStatus("가입 처리 중…");
      const result = await authApi.signup(payload);
      setStatus("");

      const invited = Boolean(activeInviteToken);
      const mocked = Boolean(result.mocked);

      if (mocked) {
        openSignupOutcomeDialog({
          title: "⚠️ 서버와 연결되지 않았습니다",
          paragraphs: [
            "🧪 지금 보이는 결과는 연습용(데모) 화면이며, 실제 계정은 만들어지지 않았습니다.",
            "🔧 API 주소(필요 시 window.LHAI_API_BASE_URL), CORS 설정, 백엔드 실행 여부를 확인한 뒤 다시 시도해 주세요.",
          ],
          showLoginLink: false,
          variant: "error",
        });
      } else if (result.verification_email_sent) {
        openSignupOutcomeDialog({
          title: invited ? "🎉 초대 가입 — 이메일 인증을 완료해 주세요" : "🎉 환영합니다, 가입을 마쳤습니다",
          paragraphs: invited
            ? [
                "✨ 초대에 따라 역할과 이메일이 적용되었습니다. 로그인하기 전에 이메일 인증 한 단계가 남아 있습니다.",
                "📧 방금 입력하신 이메일로 인증 메일을 보냈습니다. 초대 메일과는 별도이며, 링크를 눌러 인증을 마쳐 주세요.",
                "💡 받은편지함과 스팸·프로모션함을 함께 확인해 주세요. 인증이 끝난 뒤 로그인 페이지에서 아이디와 비밀번호로 들어오시면 됩니다.",
              ]
            : [
                "✨ Landing Help AI에 합류해 주셔서 정말 감사합니다. 이제 회원으로서 서비스를 이용하실 수 있는 첫걸음을 떼셨어요.",
                "📧 가입하신 이메일로 인증 메일을 보내 두었어요. 메일 안의 링크를 한 번만 눌러 주시면 확인이 끝나고, 그다음부터 로그인하실 수 있습니다.",
                "💡 메일이 잠시 안 보여도 괜찮아요. 받은편지함과 스팸·프로모션함을 함께 봐 주시고, 그래도 없으면 몇 분 뒤에 다시 확인해 보세요.",
              ],
          showLoginLink: true,
          variant: "success",
          redirectToLoginAfterClose: true,
        });
      } else {
        openSignupOutcomeDialog({
          title: invited ? "🎉 초대 가입 — 이메일 인증이 필요합니다" : "🎉 환영합니다, 가입을 마쳤습니다",
          paragraphs: invited
            ? [
                "✨ 초대로 계정이 준비되었습니다. 이 환경에서는 인증 메일이 자동으로 오지 않을 수 있어요. 인증을 마친 뒤에만 로그인할 수 있습니다.",
                "ℹ️ 서버 로그나 관리자 안내에 따라 인증 링크를 확인하거나, 아래 개발용 토큰이 있으면 그 절차로 인증해 주세요.",
                "💬 문제가 있으면 관리자에게 문의해 주세요.",
              ]
            : [
                "🎊 회원 가입을 축하드려요. 입력하신 정보로 계정이 준비되었습니다.",
                "ℹ️ 이 환경에서는 확인용 이메일이 자동으로 오지 않을 수 있어요. 로그인 전 이메일 인증이 필요하면 관리자 안내를 따라 주시거나, 아래 개발용 안내가 있으면 그 절차를 이용해 주세요.",
                "💬 문의나 추가 안내가 필요하시면 언제든지 관리자에게 편하게 연락하실 수 있어요.",
              ],
          showLoginLink: true,
          variant: "success",
          devToken: result.email_verification_token || null,
          redirectToLoginAfterClose: true,
        });
      }
    } catch (error) {
      setStatus("");
      openSignupOutcomeDialog({
        title: "😔 가입을 완료할 수 없습니다",
        paragraphs: [
          `❗ ${String(error?.message || error || "알 수 없는 오류가 발생했습니다.")}`,
          "📝 입력 값을 다시 확인하시거나, 잠시 후 다시 시도해 주세요. 문제가 계속되면 관리자에게 문의해 주세요.",
        ],
        showLoginLink: false,
        variant: "error",
      });
    } finally {
      signupSubmitInFlight = false;
      if (signupSubmitBtn) {
        signupSubmitBtn.removeAttribute("aria-busy");
      }
      refreshSignupSubmitButton();
    }
  });
}

function refreshSignupFieldStatuses() {
  updateUsernameStatus();
  updateEmailStatus();
  updateFullNameStatus();
  updateBirthDateStatus();
  updateGenderStatus();
  updatePasswordStatus();
  updatePasswordConfirmStatus();
}

void (async () => {
  await initInviteFlow();
  refreshSignupSubmitButton();
  refreshSignupFieldStatuses();
})();
