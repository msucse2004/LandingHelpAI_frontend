/**
 * Admin topbar: toggle dropdown for [data-lhai-admin-menu].
 * 로그아웃은 [data-lhai-logout] — logout-button.js와 함께 로드하세요.
 */

function closeMenu(root) {
  const trigger = root.querySelector(".lhai-user-menu__trigger");
  const panel = root.querySelector(".lhai-user-menu__panel");
  if (!trigger || !panel) return;
  trigger.setAttribute("aria-expanded", "false");
  panel.hidden = true;
}

function openMenu(root) {
  const trigger = root.querySelector(".lhai-user-menu__trigger");
  const panel = root.querySelector(".lhai-user-menu__panel");
  if (!trigger || !panel) return;
  trigger.setAttribute("aria-expanded", "true");
  panel.hidden = false;
}

function isOpen(root) {
  const trigger = root.querySelector(".lhai-user-menu__trigger");
  return trigger?.getAttribute("aria-expanded") === "true";
}

export function initAdminUserMenus(root = document) {
  root.querySelectorAll("[data-lhai-admin-menu]").forEach((menuRoot) => {
    const trigger = menuRoot.querySelector(".lhai-user-menu__trigger");
    const panel = menuRoot.querySelector(".lhai-user-menu__panel");
    if (!trigger || !panel) return;

    trigger.addEventListener("click", (e) => {
      e.stopPropagation();
      document.querySelectorAll("[data-lhai-admin-menu]").forEach((other) => {
        if (other !== menuRoot) closeMenu(other);
      });
      if (isOpen(menuRoot)) closeMenu(menuRoot);
      else openMenu(menuRoot);
    });

    panel.addEventListener("click", (e) => {
      const t = e.target;
      if (t.closest("a[href]") || t.closest("[data-lhai-logout]")) {
        closeMenu(menuRoot);
      }
    });
  });

  document.addEventListener("click", () => {
    document.querySelectorAll("[data-lhai-admin-menu]").forEach(closeMenu);
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      document.querySelectorAll("[data-lhai-admin-menu]").forEach(closeMenu);
    }
  });
}

initAdminUserMenus();
