import { initCommonI18nAndApplyDom } from "../core/i18n-dom.js";

async function initIndexPageI18n() {
  await initCommonI18nAndApplyDom(document);
}

void initIndexPageI18n();

