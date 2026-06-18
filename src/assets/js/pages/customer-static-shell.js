import { loadSidebar } from "../components/sidebar.js";
import { appPageLanguageReady } from "../core/app-page-i18n-boot.js";

async function initCustomerStaticShell() {
  await appPageLanguageReady;
  await loadSidebar("#sidebar", "customer");
}

void initCustomerStaticShell();
