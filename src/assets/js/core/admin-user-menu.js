/**
 * Topbar 계정 메뉴: [data-lhai-account-menu] 트리거 + 패널 토글.
 * 로그아웃은 [data-lhai-logout] — logout-button.js와 함께 로드하세요.
 * 헤더는 app-header.js가 비동기로 주입하므로, 마운트 후 initAccountMenus(#lhai-app-header-root)를 다시 호출해야 트리거에 리스너가 붙습니다.
 */

const ACCOUNT_MENU_SELECTOR = "[data-lhai-account-menu]";

let globalDismissListenersBound = false;

function ensureGlobalAccountMenuDismissListeners() {
  if (globalDismissListenersBound) return;
  globalDismissListenersBound = true;
  document.addEventListener("click", () => {
    document.querySelectorAll(ACCOUNT_MENU_SELECTOR).forEach(closeMenu);
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      document.querySelectorAll(ACCOUNT_MENU_SELECTOR).forEach(closeMenu);
    }
  });
}

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
  ensureGlobalAccountMenuDismissListeners();

  root.querySelectorAll(ACCOUNT_MENU_SELECTOR).forEach((menuRoot) => {
    if (menuRoot.dataset.lhaiAccountMenuBound === "1") return;
    const trigger = menuRoot.querySelector(".lhai-user-menu__trigger");
    const panel = menuRoot.querySelector(".lhai-user-menu__panel");
    if (!trigger || !panel) return;

    menuRoot.dataset.lhaiAccountMenuBound = "1";

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
}

/** @deprecated Use initAccountMenus */
export const initAdminUserMenus = initAccountMenus;

initAccountMenus();
