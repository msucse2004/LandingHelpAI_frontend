import { authApi } from "../core/api.js";

const form = document.getElementById("forgotPasswordForm");
const statusEl = document.getElementById("forgotPasswordStatus");

function setStatus(message) {
  if (statusEl) statusEl.textContent = message;
}

if (form) {
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const formData = new FormData(form);
    const email = String(formData.get("email") || "").trim();
    if (!email) {
      setStatus("이메일을 입력해 주세요.");
      return;
    }
    try {
      setStatus("요청 처리 중…");
      const result = await authApi.requestPasswordReset({ email });
      setStatus(result.message || "요청을 접수했습니다. 메일함을 확인해 주세요.");
      form.reset();
    } catch (error) {
      setStatus(error.message || "요청에 실패했습니다. 잠시 후 다시 시도해 주세요.");
    }
  });
}
