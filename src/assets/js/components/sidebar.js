import { getCurrentRole } from "../core/auth.js";

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

export { loadSidebar };
