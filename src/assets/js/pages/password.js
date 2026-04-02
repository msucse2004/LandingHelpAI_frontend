import { loadSidebar } from "../components/sidebar.js";
import { applyI18nToDom } from "../core/i18n-dom.js";
import { protectCurrentPage } from "../core/guards.js";

async function main() {
  if (!protectCurrentPage()) return;
  await loadSidebar("#sidebar", "customer");
  applyI18nToDom(document);
}

main();
