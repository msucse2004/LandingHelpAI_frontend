import { authApi } from "../core/api.js";
import { applyAuthLoginResult } from "../core/auth.js";
import { t } from "../core/i18n-client.js";

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
      setStatus(t("common.loading", "Loading…"));
      const result = await authApi.login(payload);
      applyAuthLoginResult(result);
      setStatus(`${result.role} 역할로 로그인했습니다. 이동 중…`);
      const roleKey = String(result.role || "").trim().toLowerCase().replace(/-/g, "_");
      const adminDashboardRoles = new Set(["super_admin", "admin", "supervisor"]);
      let destination = "dashboard.html";
      if (adminDashboardRoles.has(roleKey)) {
        destination = "admin-dashboard.html";
      } else if (roleKey === "partner") {
        destination = "partner-dashboard.html";
      }
      window.location.href = destination;
    } catch (error) {
      setStatus(`로그인 실패: ${error.message}`);
    }
  });
}
