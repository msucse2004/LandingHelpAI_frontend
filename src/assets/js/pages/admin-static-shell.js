import { loadSidebar } from "../components/sidebar.js";
import { appPageLanguageReady } from "../core/app-page-i18n-boot.js";

async function initAdminStaticShell() {
  await appPageLanguageReady;
  await loadSidebar("#sidebar", "admin");
}

void initAdminStaticShell();
