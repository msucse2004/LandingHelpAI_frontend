import { authApi } from "../core/api.js";
import { setAccessToken, setSession } from "../core/auth.js";

const form = document.getElementById("loginForm");
const statusEl = document.getElementById("loginStatus");

function setStatus(message) {
  if (statusEl) statusEl.textContent = message;
}

if (form) {
  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    const formData = new FormData(form);
    const payload = {
      login_id: String(formData.get("loginId") || "").trim(),
      password: String(formData.get("password") || ""),
    };

    try {
      setStatus("로그인 중…");
      const result = await authApi.login(payload);
      setAccessToken(result.access_token);
      setSession({
        userId: result.user_id,
        role: result.role,
        email: result.email,
        username: result.username || "",
      });
      setStatus(`${result.role} 역할로 로그인했습니다. 이동 중…`);
      const destination = result.role.includes("admin") || result.role === "supervisor"
        ? "admin-dashboard.html"
        : "dashboard.html";
      window.location.href = destination;
    } catch (error) {
      setStatus(`로그인 실패: ${error.message}`);
    }
  });
}
