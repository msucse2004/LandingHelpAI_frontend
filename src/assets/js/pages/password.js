import { loadSidebar } from "../components/sidebar.js";
import { protectCurrentPage } from "../core/guards.js";

async function main() {
  if (!protectCurrentPage()) return;
  await loadSidebar("#sidebar", "customer");
}

main();
