import { mountAppHeader } from "../core/app-header.js";
import { qs } from "../core/utils.js";

/** @deprecated 앱 페이지는 HTML에 `#lhai-app-header-root` + app-header.js 스크립트를 쓰세요. */
async function mountHeader(targetSelector = "[data-header]") {
  const target = qs(targetSelector);
  if (!target) return;
  target.id = "lhai-app-header-root";
  mountAppHeader("#lhai-app-header-root");
}

export { mountHeader };
