import { loadSidebar } from "../components/sidebar.js";
import { initCommonI18nAndApplyDom } from "../core/i18n-dom.js";

async function initCustomerStaticShell() {
  await initCommonI18nAndApplyDom(document);
  await loadSidebar("#sidebar", "customer");
}

void initCustomerStaticShell();

