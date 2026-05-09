import { getCurrentRole } from "../core/auth.js";
import { adminDevApi } from "../core/api.js";
import { canAccessAdminShell } from "../core/role-tiers.js";
import { initI18nDomains, t } from "../core/i18n-client.js";
import { applyI18nToDom } from "../core/i18n-dom.js";

function basename(pathname) {
  const raw = String(pathname || "").split("?")[0].split("#")[0];
  const parts = raw.split("/").filter(Boolean);
  return parts.length ? parts[parts.length - 1].toLowerCase() : "";
}

function resolveSidebarActiveHref(currentFile, variant) {
  const adminMap = {
    "admin-user-detail.html": "admin-users.html",
    "admin-schedule-builder.html": "admin-schedules.html",
    "admin-customer-detail.html": "admin-customers.html",
    "admin-profile.html": "admin-dashboard.html",
    "admin-password.html": "admin-dashboard.html",
    "messages.html": "admin-dashboard.html",
  };
  const customerMap = {
    "profile.html": "dashboard.html",
    "password.html": "dashboard.html",
    "survey-recommendations.html": "survey-start.html",
    "survey-start.html": "survey-start.html",
    "survey-branching.html": "survey-start.html",
    "services.html": "dashboard.html",
    "index.html": "dashboard.html",
    "app.html": "dashboard.html",
    "messages.html": "messages.html",
    "cases.html": "cases.html",
    "case-detail.html": "cases.html",
  };
  if (variant === "admin") return adminMap[currentFile] || currentFile;
  return customerMap[currentFile] || currentFile;
}

function applyActiveNavHighlight(target, variant) {
  const current = basename(window.location.pathname);
  const expected = resolveSidebarActiveHref(current, variant);
  const links = target.querySelectorAll("a[href]");
  let hasActive = false;
  links.forEach((link) => {
    const hrefBase = basename(link.getAttribute("href") || "");
    const isActive = hrefBase === expected;
    if (isActive) {
      link.setAttribute("aria-current", "page");
      link.classList.add("is-active");
      hasActive = true;
    } else {
      link.removeAttribute("aria-current");
      link.classList.remove("is-active");
    }
  });
  if (!hasActive && links.length) {
    const firstVisible = Array.from(links).find((el) => el.style.display !== "none");
    const fallback = firstVisible || links[0];
    fallback.setAttribute("aria-current", "page");
    fallback.classList.add("is-active");
  }
}

function applyRoleBasedNavVisibility(target) {
  const role = getCurrentRole();
  const links = target.querySelectorAll("[data-visible-roles]");
  links.forEach((link) => {
    const allowed = (link.getAttribute("data-visible-roles") || "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean);
    if (!allowed.length) return;
    if (!allowed.includes(role)) {
      link.style.display = "none";
    }
  });
}

function bindAdminDevResetQuotesInvoices(sidebarRoot) {
  const btn = sidebarRoot.querySelector("#lhaiDevResetQuotesInvoices");
  if (!btn) return;
  btn.addEventListener("click", async () => {
    const ok = window.confirm(
      "개발용: 저장소(DB 또는 메모리)의 모든 견적·청구서·일정(스케줄 초안·카드·릴리스 기록)·문서, 각 계정 메시지함의 인앱 메시지(및 DB 사용 시 메시지 스레드), 운영 큐(운영 케이스·내부 메모·라우팅/배정·케이스 요약·메시징 파이프라인 잡 큐)를 삭제합니다. 복구할 수 없습니다. 진행할까요?"
    );
    if (!ok) return;
    btn.disabled = true;
    try {
      const result = await adminDevApi.resetQuotesAndInvoices();
      const sch = result.schedules_deleted != null ? result.schedules_deleted : "—";
      const docs = result.documents_deleted != null ? result.documents_deleted : "—";
      const msg = result.messages_deleted != null ? result.messages_deleted : "—";
      const thr = result.message_threads_deleted != null ? result.message_threads_deleted : "—";
      const thrPart =
        thr !== "—" && Number(thr) > 0 ? `, 메시지 스레드 ${thr}건` : "";
      const opCases = result.operational_cases_deleted != null ? result.operational_cases_deleted : 0;
      const opPipe = result.operational_pipeline_rows_deleted != null ? result.operational_pipeline_rows_deleted : 0;
      const opJobs = result.messaging_jobs_cleared != null ? result.messaging_jobs_cleared : 0;
      const opPart =
        Number(opCases) + Number(opPipe) + Number(opJobs) > 0
          ? `, 운영케이스 ${opCases}건·파이프라인 보조행 ${opPipe}건·메시징잡 ${opJobs}건`
          : "";
      try {
        window.localStorage.setItem("lhai_dev_data_reset_at", String(Date.now()));
      } catch {
        /* ignore */
      }
      window.alert(
        `삭제 완료: 견적 ${result.quotes_deleted}건, 청구서 ${result.invoices_deleted}건, 일정 ${sch}건, 문서 ${docs}건, 메시지 ${msg}건${thrPart}${opPart}. 고객 대시보드 등 열린 탭은 자동으로 새로고침됩니다. 그렇지 않으면 수동으로 새로고침하세요.`
      );
    } catch (err) {
      const msg = err && typeof err.message === "string" ? err.message : String(err);
      window.alert(`실패: ${msg}`);
    } finally {
      btn.disabled = false;
    }
  });
}

async function loadSidebar(targetSelector = "#sidebar", variant = "customer") {
  const target = document.querySelector(targetSelector);
  if (!target) return;

  try {
    const partialFile = variant === "admin" ? "admin-sidebar.html" : "customer-sidebar.html";
    const res = await fetch(`../partials/${partialFile}`);
    if (!res.ok) throw new Error(`Sidebar load failed: ${res.status}`);
    target.innerHTML = await res.text();
    const lang = document.documentElement.lang || "ko";
    await initI18nDomains(["common"], lang);
    applyI18nToDom(target);
    applyRoleBasedNavVisibility(target);
    applyActiveNavHighlight(target, variant);
    if (variant === "admin") {
      bindAdminDevResetQuotesInvoices(target);
    }
  } catch (e) {
    target.innerHTML = `<div class='lhai-placeholder'>${t("common.sidebar.placeholder.todo", "사이드바를 불러오는 중입니다…")}</div>`;
  }
}

/** messages.html: 관리자는 다른 admin 화면과 동일한 왼쪽 메뉴, 그 외는 고객 partial */
async function mountMessagesSidebar() {
  // PARTNER는 admin 셸 대상이 아니므로 customer sidebar를 사용한다.
  const variant = canAccessAdminShell() ? "admin" : "customer";
  await loadSidebar("#sidebar", variant);
}

export { loadSidebar, mountMessagesSidebar };


