import { loadSidebar } from "../components/sidebar.js";
import { initCommonI18nAndApplyDom } from "../core/i18n-dom.js";

async function initAdminStaticShell() {
  await initCommonI18nAndApplyDom(document);
  await loadSidebar("#sidebar", "admin");
}

void initAdminStaticShell();

