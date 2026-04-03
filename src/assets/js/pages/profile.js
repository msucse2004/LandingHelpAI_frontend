import { loadSidebar } from "../components/sidebar.js";
import { applyI18nToDom } from "../core/i18n-dom.js";
import { getSession, setSession } from "../core/auth.js";
import { getCurrentRoleTierLabelKo, protectCurrentPage } from "../core/guards.js";
import { userCustomerApi } from "../core/api.js";

const profileEmpty = document.getElementById("profileEmpty");
const profileStatus = document.getElementById("profileStatus");
const profileForm = document.getElementById("profileForm");
const passwordForm = document.getElementById("passwordForm");
const usernameInput = document.getElementById("pfUsername");
const firstNameInput = document.getElementById("pfFirstName");
const lastNameInput = document.getElementById("pfLastName");
const birthDateInput = document.getElementById("pfBirthDate");
const genderInput = document.getElementById("pfGender");
const emailInput = document.getElementById("pfEmail");
const currentPasswordInput = document.getElementById("pfCurrentPassword");
const newPasswordInput = document.getElementById("pfNewPassword");
const newPasswordConfirmInput = document.getElementById("pfNewPasswordConfirm");
const profileFeedbackDialog = document.getElementById("profileFeedbackDialog");
const profileFeedbackTitle = document.getElementById("profileFeedbackTitle");
const profileFeedbackBody = document.getElementById("profileFeedbackBody");

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function setStatus(msg) {
  if (profileStatus) profileStatus.textContent = msg || "";
}

/**
 * 기본 정보 저장·비밀번호 변경 등 결과를 모달로 안내합니다.
 * @param {{ ok: boolean; title: string; message?: string }} opts
 */
function showProfileFeedback(opts) {
  const dlg = profileFeedbackDialog;
  const titleEl = profileFeedbackTitle;
  const bodyEl = profileFeedbackBody;
  if (!dlg || !titleEl || !bodyEl || typeof dlg.showModal !== "function") {
    setStatus(opts.message || opts.title || "");
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

function parseName(fullName) {
  const parts = String(fullName || "")
    .trim()
    .split(" ")
    .filter(Boolean);
  if (!parts.length) return { first: "", last: "" };
  return { first: parts[0], last: parts.slice(1).join(" ") };
}

async function main() {
  if (!protectCurrentPage()) return;
  try {
    await loadSidebar("#sidebar", "customer");
  } catch {
    // keep page usable even if sidebar fails
  }
  applyI18nToDom(document);
  const s = getSession();
  if (!s || !profileForm || !passwordForm) {
    profileEmpty?.removeAttribute("hidden");
    setStatus("로그인 세션을 찾지 못했습니다. 다시 로그인해 주세요.");
    return;
  }
  profileEmpty?.setAttribute("hidden", "");
  if (usernameInput) usernameInput.value = s.username || "";
  try {
    const me = await userCustomerApi.getMeBasicInfo();
    const split = parseName(me.full_name || "");
    if (firstNameInput) firstNameInput.value = me.first_name || split.first || "";
    if (lastNameInput) lastNameInput.value = me.last_name || split.last || "";
    if (birthDateInput) birthDateInput.value = me.birth_date ? String(me.birth_date) : "";
    if (genderInput) genderInput.value = me.gender || "";
    if (emailInput) emailInput.value = me.email || s.email || "";
  } catch {
    const split = parseName(s.username || "");
    if (firstNameInput) firstNameInput.value = split.first;
    if (lastNameInput) lastNameInput.value = split.last;
    if (emailInput) emailInput.value = s.email || "";
    if (genderInput) genderInput.value = "";
    setStatus("프로필 API를 읽지 못해 세션 정보로 표시 중입니다.");
  }

  profileForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const first_name = (firstNameInput?.value || "").trim();
    const last_name = (lastNameInput?.value || "").trim();
    const birth_date = birthDateInput?.value || null;
    const gender = (genderInput?.value || "").trim() || null;
    const email = (emailInput?.value || "").trim();
    if (!first_name || !last_name || !email) {
      setStatus("");
      showProfileFeedback({
        ok: false,
        title: "입력 확인",
        message: "이름(First/Last)과 이메일을 모두 입력해 주세요.",
      });
      return;
    }
    try {
      const updated = await userCustomerApi.updateMeBasicInfo({
        first_name,
        last_name,
        birth_date,
        gender,
        email,
      });
      setSession({
        ...s,
        email: updated.email || email,
      });
      setStatus("");
      showProfileFeedback({
        ok: true,
        title: "저장 완료",
        message: `회원 정보가 서버에 저장되었습니다. (권한 티어: ${getCurrentRoleTierLabelKo()})`,
      });
    } catch (err) {
      setStatus("");
      showProfileFeedback({
        ok: false,
        title: "저장 실패",
        message: err?.message || "저장에 실패했습니다. 잠시 후 다시 시도해 주세요.",
      });
    }
  });

  passwordForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const current_password = currentPasswordInput?.value || "";
    const new_password = newPasswordInput?.value || "";
    const new_password_confirm = newPasswordConfirmInput?.value || "";
    if (!current_password || !new_password || !new_password_confirm) {
      setStatus("");
      showProfileFeedback({
        ok: false,
        title: "입력 확인",
        message: "비밀번호 항목을 모두 입력해 주세요.",
      });
      return;
    }
    try {
      await userCustomerApi.changeMyPassword({
        current_password,
        new_password,
        new_password_confirm,
      });
      if (currentPasswordInput) currentPasswordInput.value = "";
      if (newPasswordInput) newPasswordInput.value = "";
      if (newPasswordConfirmInput) newPasswordConfirmInput.value = "";
      setStatus("");
      showProfileFeedback({
        ok: true,
        title: "비밀번호 변경 완료",
        message: "새 비밀번호로 변경되었습니다.",
      });
    } catch (err) {
      setStatus("");
      showProfileFeedback({
        ok: false,
        title: "비밀번호 변경 실패",
        message: err?.message || "비밀번호 변경에 실패했습니다. 현재 비밀번호를 확인해 주세요.",
      });
    }
  });
}

main();
