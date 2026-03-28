import { logout } from "./auth.js";

/**
 * Binds click on elements with [data-lhai-logout] to clear auth and redirect to login.
 */
export function initLogoutButtons(root = document) {
  root.querySelectorAll("[data-lhai-logout]").forEach((el) => {
    el.addEventListener("click", (e) => {
      e.preventDefault();
      logout();
    });
  });
}

initLogoutButtons();
