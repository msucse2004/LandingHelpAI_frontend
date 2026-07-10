/**
 * Public pages (no app-header): i18n boot + floating language switcher.
 * @module core/public-page-language-boot
 */

import { ensureRuntimeI18nDomListener, initPageI18nAndApplyDom } from "./i18n-dom.js";
import { initLanguageSwitcher } from "./language-switcher.js";
import { installAppDialogI18n } from "./app-dialog.js";
import { cachePublicPageI18nDomains, getPublicPageI18nDomains } from "./public-page-i18n-config.js";
import { applyUiLanguageFromUrlQuery } from "./preferred-language.js";

ensureRuntimeI18nDomListener();
installAppDialogI18n();

export {
  cachePublicPageI18nDomains,
  findPublicPageLanguageBootScript,
  parseI18nDomainsFromBootScript,
  getPublicPageI18nDomains,
} from "./public-page-i18n-config.js";

const domains = getPublicPageI18nDomains();
cachePublicPageI18nDomains(domains);

export const publicPageLanguageReady = (async () => {
  try {
    applyUiLanguageFromUrlQuery();
    await initPageI18nAndApplyDom(domains, document);
  } catch (err) {
    console.warn("[lhai] public-page-language-boot: i18n init failed", err);
  }
  try {
    initLanguageSwitcher({ preferFloating: true });
  } catch (err) {
    console.warn("[lhai] public-page-language-boot: language switcher init failed", err);
  }
})();

await publicPageLanguageReady;
