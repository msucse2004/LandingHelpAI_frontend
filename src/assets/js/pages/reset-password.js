import { authApi } from "../core/api.js";

const form = document.getElementById("resetPasswordForm");
const statusEl = document.getElementById("resetPasswordStatus");
const tokenInput = document.getElementById("token");

function setStatus(message) {
  if (statusEl) statusEl.textContent = message;
}

const params = new URLSearchParams(window.location.search);
const tokenFromUrl = String(params.get("token") || "").trim();
if (tokenFromUrl && tokenInput) {
  tokenInput.value = tokenFromUrl;
}

if (form) {
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const formData = new FormData(form);
    const token = String(formData.get("token") || "").trim();
    const newPassword = String(formData.get("newPassword") || "");
    const passwordConfirm = String(formData.get("passwordConfirm") || "");

    if (!token) {
      setStatus("재설정 토큰을 입력해 주세요.");
      return;
    }
    if (newPassword !== passwordConfirm) {
      setStatus("새 비밀번호와 확인이 일치하지 않습니다.");
      return;
    }

    try {
      setStatus("변경 중…");
      const result = await authApi.confirmPasswordReset({
        token,
        new_password: newPassword,
        password_confirm: passwordConfirm,
      });
      setStatus(result.message || "비밀번호가 변경되었습니다.");
      setTimeout(() => {
        window.location.href = "login.html";
      }, 1500);
    } catch (error) {
      setStatus(error.message || "비밀번호 변경에 실패했습니다.");
    }
  });
}
