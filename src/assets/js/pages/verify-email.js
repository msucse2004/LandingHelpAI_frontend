import { authApi } from "../core/api.js";

const form = document.getElementById("verifyEmailForm");
const statusEl = document.getElementById("verifyStatus");
const tokenInput = document.getElementById("token");

const params = new URLSearchParams(window.location.search);
const tokenFromUrl = params.get("token");
if (tokenInput && tokenFromUrl) {
  tokenInput.value = tokenFromUrl;
}

function setStatus(message) {
  if (statusEl) statusEl.textContent = message;
}

if (form) {
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const formData = new FormData(form);
    const token = String(formData.get("token") || "").trim();
    if (!token) {
      setStatus("토큰을 입력하세요.");
      return;
    }

    try {
      setStatus("인증 처리 중…");
      const result = await authApi.verifyEmail({ token });
      if (result.verified) {
        setStatus(
          "인증이 완료되어 정식 회원으로 등록되었습니다. 로그인 페이지에서 아이디와 비밀번호로 로그인하세요."
        );
      } else {
        setStatus("인증에 실패했습니다.");
      }
    } catch (error) {
      setStatus(`인증 실패: ${error.message}`);
    }
  });
}
