/**
 * Customer / admin inbox layout (header is global; this is sidebar + main only).
 * @module layouts/customer-inbox-shell
 */

import { loadSidebar, mountMessagesSidebar } from "../components/sidebar.js";
import { canAccessAdminShell } from "../core/role-tiers.js";

/**
 * @param {HTMLElement | string} root
 * @param {string} contentHtml
 * @param {{ variant?: "customer" | "admin" }} [opts]
 */
export async function mountCustomerInboxShell(root, contentHtml, opts = {}) {
  const el = typeof root === "string" ? document.querySelector(root) : root;
  if (!(el instanceof HTMLElement)) return null;
  el.innerHTML = `<div class="lhai-layout">
    <aside class="lhai-sidebar" id="sidebar"></aside>
    <main class="lhai-main">
      <div class="lhai-inbox-shell__content">${contentHtml}</div>
    </main>
  </div>`;
  if (opts.variant === "admin" || canAccessAdminShell()) {
    await mountMessagesSidebar();
  } else {
    await loadSidebar("#sidebar", "customer");
  }
  return el.querySelector(".lhai-inbox-shell__content") || el.querySelector("main");
}
