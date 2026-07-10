import { mountCustomerInboxShell } from "../layouts/customer-inbox-shell.js";
import { mountPartnerShell } from "../layouts/partner-shell.js";
import { getCurrentRole } from "../core/auth.js";
import { ROLES } from "../core/config.js";
import { applyI18nToDom } from "../core/i18n-dom.js";
import { bootAppPageContent } from "../core/app-page-i18n-boot.js";
import { protectCurrentPage } from "../core/guards.js";
import { renderPartnerPageContentHtml } from "../layouts/partner-page-layout.js";

async function main() {
  if (!protectCurrentPage()) return;
  await bootAppPageContent(["common", "nav", "auth"], async () => {
  const app = document.getElementById("app");
  const contentHtml = renderPartnerPageContentHtml({
    title: "비밀번호 변경",
    subtitle: "계정 보안을 위해 주기적으로 비밀번호를 변경해 주세요.",
    bodyHtml: `<section class="lhai-card"><p class="lhai-help"><a class="lhai-link" href="profile.html">프로필</a>에서 비밀번호를 변경할 수 있습니다.</p></section>`,
  });
  try {
    if (getCurrentRole() === ROLES.PARTNER && app) {
      document.body.classList.add("lhai-partner-shell-pending");
      await mountPartnerShell(app, {
        pageKey: "profile",
        documentTitle: "비밀번호 - Landing Help AI",
        contentHtml,
      });
    } else if (app) {
      await mountCustomerInboxShell(app, contentHtml);
    }
  } catch {
    /* ignore */
  }
  });
}

main();
