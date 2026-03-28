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
const roleNameSelect = document.getElementById("roleName");
const roleNameHint = document.getElementById("roleNameHint");
const pageSubtitle = document.querySelector(".lhai-page-header .lhai-subtitle");

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

const USERNAME_PATTERN = /^[a-zA-Z0-9._-]+$/;
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
}

function clearUsernameAvailabilityPass() {
  usernameVerifiedNormalized = null;
  refreshSignupSubmitButton();
}

function setStatus(message) {
  if (statusEl) statusEl.textContent = message;
}

function setUsernameFeedback(text, { variant = "neutral" } = {}) {
  if (!usernameFeedback) return;
  usernameFeedback.textContent = text;
  usernameFeedback.classList.remove("lhai-field-error", "lhai-field-success", "lhai-field-hint");
  if (!text) return;
  if (variant === "error") usernameFeedback.classList.add("lhai-field-error");
  else if (variant === "success") usernameFeedback.classList.add("lhai-field-success");
  else if (variant === "hint") usernameFeedback.classList.add("lhai-field-hint");
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
    return;
  }
  if (primary.length < 4) {
    passwordMatchFeedback.textContent = "먼저 위 칸에 비밀번호를 4자 이상 입력해 주세요.";
    passwordMatchFeedback.classList.add("lhai-field-hint");
    return;
  }
  if (primary === confirm) {
    passwordMatchFeedback.textContent = "처음 입력한 비밀번호와 동일합니다.";
    passwordMatchFeedback.classList.add("lhai-field-success");
    return;
  }
  passwordMatchFeedback.textContent = "처음 입력한 비밀번호와 다릅니다. 동일하게 입력해 주세요.";
  passwordMatchFeedback.classList.add("lhai-field-error");
}

if (passwordInput && passwordConfirmInput) {
  passwordInput.addEventListener("input", updatePasswordMatchFeedback);
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
  });
  birthDateText.addEventListener("blur", syncTextToPicker);
  birthDatePicker.addEventListener("change", syncPickerToText);
  birthDatePicker.addEventListener("input", syncPickerToText);
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
    if (inviteBannerBody) {
      inviteBannerBody.innerHTML = `초대된 역할: <strong>${ROLE_LABEL_KO[p.role_name] || p.role_name}</strong> (${p.role_name}). 이메일은 초대와 동일해야 합니다. 가입이 끝나면 <strong>이메일 인증</strong>을 완료해야 로그인할 수 있습니다.`;
    }
    if (pageSubtitle) {
      pageSubtitle.textContent =
        "관리자 초대로 가입합니다. 아이디 중복 확인 후 가입하고, 인증 메일의 링크로 이메일을 확인하세요.";
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
      role_name: String(formData.get("roleName") || "customer"),
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

    try {
      setStatus("가입 처리 중…");
      const result = await authApi.signup(payload);
      const baseMsg = result.message || "가입이 처리되었습니다.";
      const tokenHint =
        result.verification_email_sent === false && result.email_verification_token
          ? ` (개발용 인증 토큰: ${result.email_verification_token})`
          : "";
      const mockWarn = result.mocked
        ? " 주의: 서버에 연결하지 못해 데모 응답만 표시되었습니다. 관리 목록에는 나타나지 않습니다. API 주소·CORS·백엔드 기동을 확인하세요."
        : "";
      setStatus(`${baseMsg} 아이디: ${result.username || payload.username}.${tokenHint}${mockWarn}`);
    } catch (error) {
      setStatus(`가입 실패: ${error.message}`);
    }
  });
}

void (async () => {
  await initInviteFlow();
  refreshSignupSubmitButton();
})();
