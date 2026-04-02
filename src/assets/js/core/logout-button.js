import { logout } from "./auth.js";

/**
 * Binds click on elements with [data-lhai-logout] to clear auth and redirect to login.
 * 헤더의 로그아웃 버튼은 app-header.js가 비동기로 넣으므로, 마운트 후 initLogoutButtons(root)를 한 번 더 호출해야 합니다.
 */
export function initLogoutButtons(root = document) {
  root.querySelectorAll("[data-lhai-logout]").forEach((el) => {
    if (el.dataset.lhaiLogoutBound === "1") return;
    el.dataset.lhaiLogoutBound = "1";
    el.addEventListener("click", (e) => {
      e.preventDefault();
      logout();
    });
  });
}

initLogoutButtons();
