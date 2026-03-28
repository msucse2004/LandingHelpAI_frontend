/**
 * Topbar 계정 메뉴: [data-lhai-account-menu] 트리거 + 패널 토글.
 * 로그아웃은 [data-lhai-logout] — logout-button.js와 함께 로드하세요.
 * 로드 시 헤더 배지(syncHeaderRoleBadge). 상단바 마크업은 app-header.js가 주입합니다.
 */

import { syncHeaderRoleBadge } from "./role-header-badge.js";

const ACCOUNT_MENU_SELECTOR = "[data-lhai-account-menu]";

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

export function initAccountMenus(root = document) {
  root.querySelectorAll(ACCOUNT_MENU_SELECTOR).forEach((menuRoot) => {
    const trigger = menuRoot.querySelector(".lhai-user-menu__trigger");
    const panel = menuRoot.querySelector(".lhai-user-menu__panel");
    if (!trigger || !panel) return;

    trigger.addEventListener("click", (e) => {
      e.stopPropagation();
      document.querySelectorAll(ACCOUNT_MENU_SELECTOR).forEach((other) => {
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
    document.querySelectorAll(ACCOUNT_MENU_SELECTOR).forEach(closeMenu);
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      document.querySelectorAll(ACCOUNT_MENU_SELECTOR).forEach(closeMenu);
    }
  });
}

/** @deprecated Use initAccountMenus */
export const initAdminUserMenus = initAccountMenus;

initAccountMenus();
syncHeaderRoleBadge();
