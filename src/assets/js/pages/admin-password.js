import { protectCurrentPage } from "../core/guards.js";
import { bootAppPageContent } from "../core/app-page-i18n-boot.js";

async function initAdminPasswordPage() {
  if (!protectCurrentPage()) return;
  await bootAppPageContent(["common", "nav", "admin"]);
}

void initAdminPasswordPage();
