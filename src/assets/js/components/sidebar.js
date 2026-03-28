import { getCurrentRole } from "../core/auth.js";
import { canAccessAdminShell } from "../core/role-tiers.js";

function applyRoleBasedNavVisibility(target) {
  const role = getCurrentRole();
  const links = target.querySelectorAll("[data-visible-roles]");
  links.forEach((link) => {
    const allowed = (link.getAttribute("data-visible-roles") || "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean);
    if (!allowed.length) return;
    if (!allowed.includes(role)) {
      link.style.display = "none";
    }
  });
}

async function loadSidebar(targetSelector = "#sidebar", variant = "customer") {
  const target = document.querySelector(targetSelector);
  if (!target) return;

  try {
    const partialFile = variant === "admin" ? "admin-sidebar.html" : "customer-sidebar.html";
    const res = await fetch(`../partials/${partialFile}`);
    if (!res.ok) throw new Error(`Sidebar load failed: ${res.status}`);
    target.innerHTML = await res.text();
    applyRoleBasedNavVisibility(target);
  } catch (e) {
    target.innerHTML = "<div class='lhai-placeholder'>TODO: Sidebar will render here.</div>";
  }
}

const MESSAGES_PAGE_ADMIN_SIDEBAR_HTML = `
  <p class="lhai-label u-mb-2">메뉴</p>
  <nav>
    <ul class="lhai-admin-sidebar-nav">
      <li><a href="admin-dashboard.html">대시보드</a></li>
      <li><a href="admin-users.html">회원·가입 상태</a></li>
      <li><a href="admin-invitations.html">회원 초대 메일</a></li>
      <li><a href="admin-customers.html">고객</a></li>
      <li><a href="admin-quotes.html">견적</a></li>
      <li><a href="admin-invoices.html">인보이스</a></li>
      <li><a href="messages.html" aria-current="page">메시지함</a></li>
    </ul>
  </nav>
`.trim();

/** messages.html: 관리자는 다른 admin 화면과 동일한 왼쪽 메뉴, 그 외는 고객 partial */
async function mountMessagesSidebar() {
  const target = document.querySelector("#sidebar");
  if (!target) return;
  if (canAccessAdminShell()) {
    target.setAttribute("aria-label", "관리 메뉴");
    target.innerHTML = MESSAGES_PAGE_ADMIN_SIDEBAR_HTML;
    return;
  }
  await loadSidebar("#sidebar", "customer");
}

export { loadSidebar, mountMessagesSidebar };
