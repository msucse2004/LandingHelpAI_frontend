import { loadSidebar } from "../components/sidebar.js";
import { getSession } from "../core/auth.js";
import { getCurrentRoleTierLabelKo, protectCurrentPage } from "../core/guards.js";

const profileDl = document.getElementById("profileDl");
const profileEmpty = document.getElementById("profileEmpty");

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

async function main() {
  if (!protectCurrentPage()) return;
  await loadSidebar("#sidebar", "customer");
  const s = getSession();
  if (!s || !profileDl) {
    profileEmpty?.removeAttribute("hidden");
    return;
  }
  profileEmpty?.setAttribute("hidden", "");
  const rows = [
    ["아이디", s.username || "—"],
    ["이메일", s.email || "—"],
    ["역할", s.role || "—"],
    ["권한 티어", getCurrentRoleTierLabelKo()],
    ["사용자 ID", s.userId || "—"],
  ];
  profileDl.innerHTML = rows
    .map(
      ([k, v]) =>
        `<div class="lhai-detail-dl__row"><dt class="lhai-detail-dl__dt">${escapeHtml(k)}</dt><dd class="lhai-detail-dl__dd">${escapeHtml(v)}</dd></div>`,
    )
    .join("");
}

main();
