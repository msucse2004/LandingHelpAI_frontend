import {
  detectPartnerPageKey,
  mountPartnerShell,
  resolvePartnerPageKey,
  syncPartnerPageState,
} from "../layouts/partner-shell.js";
import { renderPartnerDashboardContentHtml } from "./partner-dashboard-content.js";
import {
  emitPartnerDashboardAuthDebug,
  getCurrentRole,
  getCurrentUserId,
  getSession,
  isAuthenticated,
} from "../core/auth.js";
import { partnerThreadsApi } from "../core/api.js";
import { persistPartnerModeFromDashboard } from "../core/partner-mode-session.js";
import { ROLES } from "../core/config.js";
import { bootAppPageContent } from "../core/app-page-i18n-boot.js";
import { alertPlain } from "../core/app-dialog.js";
import { t } from "../core/i18n-client.js";
import { applyI18nToDom, wireDynamicPageI18nRefresh } from "../core/i18n-dom.js";
import { ensureCustomerAccess, protectCurrentPage } from "../core/guards.js";
import { buildMessagesThreadUrl, initRouter } from "../core/router.js";
import { syncHeaderRoleBadge } from "../core/role-header-badge.js";
import {
  debugDashboard,
  isPartnerDashboardDebugEnabled,
  partnerDashboardResponsePreview,
} from "../core/partner-dashboard-debug.js";
import { clearShellTopLayerBlockers, diagnoseShellTopLayerBlockers } from "../core/ui-blockers.js";
import { formatMessageTimestamp } from "../core/utils.js";
import { buildBiddingDashboardCardHtml, partnerDashboardServiceDisplayName } from "./partner-dashboard-bidding-logic.js";
// Bidding list cards: titles and request_summary_lines come from API viewer-locale fields (no client summary translation).
import { threadListPreviewBody } from "./messages-display-logic.js";

/**
 * Viewer-locale last message preview for partner assigned dashboard cards.
 * @param {Record<string, unknown>} row
 * @returns {string}
 */
function partnerDashboardLastMessagePreview(row) {
  return threadListPreviewBody(
    {
      last_message_body: row.last_message_preview,
      preview: row.last_message_preview,
      last_message_display_body: row.last_message_display_preview,
      last_message_translation_status: row.last_message_translation_status,
      last_message_source_locale: row.last_message_source_locale,
      last_message_display_locale: row.last_message_display_locale,
    },
    t,
  );
}
const PM_ASSIGNED = "ASSIGNED_ONLY";
const PM_BIDDING = "BIDDING_ONLY";

function escHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * API ``partner_mode``·``dashboard_type`` 기준 렌더 분기 (HYBRID/unknown → unsupported).
 * @param {Record<string, unknown>} data
 * @returns {"assigned" | "bidding" | "unsupported"}
 */
function resolvePartnerDashboardBranch(data) {
  if (!data || typeof data !== "object") return "unsupported";
  const pm = String(data.partner_mode ?? "").trim().toUpperCase();
  const dt = String(data.dashboard_type ?? "").trim().toUpperCase();
  if (dt === "UNSUPPORTED") return "unsupported";
  if (pm === PM_ASSIGNED) return "assigned";
  if (pm === PM_BIDDING) return "bidding";
  if (!pm && dt === "ASSIGNED_WORK") return "assigned";
  if (!pm && dt === "BIDDING_WORK") return "bidding";
  return "unsupported";
}

function hideUnsupportedPartnerPanel() {
  const u = document.querySelector("#partnerDashboardUnsupportedPanel");
  if (u instanceof HTMLElement) u.hidden = true;
}

/**
 * @param {"assigned" | "bidding" | "unsupported"} branch
 */
function applyPartnerDashboardDualPanels(branch) {
  const statsA = document.querySelector("#partnerDashStatsAssigned");
  const statsB = document.querySelector("#partnerDashStatsBidding");
  const wrapA = document.querySelector("#partnerTableAssignedWrap");
  const wrapB = document.querySelector("#partnerTableBiddingWrap");
  const root = document.querySelector("#partnerAssignedCardsRoot");

  if (branch === "assigned") {
    setHidden(statsA, true);
    setHidden(wrapA, true);
    setHidden(statsB, false);
    setHidden(wrapB, false);
    setHidden(root, true);
    hideUnsupportedPartnerPanel();
    return;
  }
  if (branch === "bidding") {
    setHidden(statsA, false);
    setHidden(wrapA, false);
    setHidden(statsB, true);
    setHidden(wrapB, true);
    if (root instanceof HTMLElement) root.hidden = true;
    hideUnsupportedPartnerPanel();
    return;
  }
  setHidden(statsA, false);
  setHidden(statsB, false);
  setHidden(wrapA, false);
  setHidden(wrapB, false);
  if (root instanceof HTMLElement) root.hidden = true;
  const u = document.querySelector("#partnerDashboardUnsupportedPanel");
  if (u instanceof HTMLElement) u.hidden = false;
}

/**
 * @param {"assigned" | "bidding" | "unsupported" | "error"} mode
 */
function applyPartnerMainDashboardClasses(mode) {
  const main = document.querySelector("#partnerDashboardMain");
  if (!(main instanceof HTMLElement)) return;
  main.classList.remove("lhai-assigned-dashboard", "lhai-bidding-dashboard", "lhai-partner-dash--unsupported");
  if (mode === "assigned") main.classList.add("lhai-assigned-dashboard");
  else if (mode === "bidding") main.classList.add("lhai-bidding-dashboard");
  else if (mode === "unsupported") main.classList.add("lhai-partner-dash--unsupported");
}

/** @param {Record<string, unknown>} data */
function renderUnsupportedPartnerMode(data) {
  applyPartnerDashboardDualPanels("unsupported");
  applyPartnerMainDashboardClasses("unsupported");

  applyPartnerDashboardTitles("unsupported");
  const secTitle = document.querySelector("#partnerRequestsSectionTitle");
  const emptyEl = document.querySelector("#partnerDashboardEmpty");
  const bodyEl = document.querySelector("#partnerDashboardUnsupportedBody");

  if (secTitle instanceof HTMLElement) {
    secTitle.textContent = t("partner.dashboard.section.notice", "Notice");
  }

  if (emptyEl instanceof HTMLElement) {
    emptyEl.hidden = true;
    emptyEl.textContent = "";
  }

  const raw = String(data.partner_mode ?? "").trim();
  const reason = String(data.unsupported_reason ?? "").trim();
  let body = t(
    "partner.dashboard.error.unsupported_mode",
    "This partner mode is not supported. HYBRID is unavailable — ask an admin to set ASSIGNED_ONLY or BIDDING_ONLY on your profile.",
  );
  if (raw && raw.toUpperCase() !== "HYBRID") {
    body = t(
      "partner.dashboard.error.unsupported_mode_invalid",
      "Saved partner mode ({mode}) is not available. Ask an admin to confirm ASSIGNED_ONLY or BIDDING_ONLY.",
    ).replace("{mode}", raw);
  }
  if (reason && reason !== "invalid_partner_mode") {
    body = `${body} (${reason})`;
  }
  if (bodyEl instanceof HTMLElement) bodyEl.textContent = body;
}

if (typeof window !== "undefined") {
  window.__lhaiPartnerDashboardDebug = {
    isEnabled: () => isPartnerDashboardDebugEnabled(),
    enable: () => {
      try {
        window.localStorage.setItem("LHAI_DEBUG_PARTNER_DASHBOARD", "1");
      } catch {
        /* ignore */
      }
    },
    disable: () => {
      try {
        window.localStorage.removeItem("LHAI_DEBUG_PARTNER_DASHBOARD");
      } catch {
        /* ignore */
      }
    },
  };
}

/**
 * render-complete 직후 DOM·화면 중앙 hit (오버레이 vs 본문 구분용).
 * @param {string} dashboardType
 */
function logPartnerDashboardDomAfterRender(branch) {
  if (!isPartnerDashboardDebugEnabled()) return;
  const run = () => {
    const br = String(branch || "").trim().toLowerCase();
    const statsId =
      br === "bidding" || br === "bidding_work" ? "#partnerDashStatsBidding" : "#partnerDashStatsAssigned";
    const statsRoot = document.querySelector(statsId);
    const statsVisible = statsRoot instanceof HTMLElement && !statsRoot.hidden;
    const statCards = statsVisible ? statsRoot.querySelectorAll("article.lhai-partner-dash__stat-card").length : 0;
    const nA =
      br === "bidding" || br === "bidding_work"
        ? document.querySelectorAll("tr.lhai-bidding-request-card").length
        : document.querySelectorAll(".lhai-assigned-request-card").length;
    const nB = document.querySelectorAll("tr.lhai-bidding-request-card").length;
    const main = document.querySelector("main.lhai-main");
    const allBtns = main ? main.querySelectorAll("a.lhai-button, button.lhai-button") : [];
    const visibleBtns = Array.from(allBtns).filter(
      (n) => n instanceof HTMLElement && !n.hidden && n.offsetParent !== null
    ).length;
    const cx = Math.floor(window.innerWidth / 2);
    const cy = Math.floor(window.innerHeight / 2);
    const hit = document.elementFromPoint(cx, cy);
    /** @type {Record<string, unknown> | null} */
    let hitInfo = null;
    if (hit instanceof Element) {
      const cs = window.getComputedStyle(hit);
      hitInfo = {
        tagName: hit.tagName,
        id: hit.id || null,
        className: (hit.className && String(hit.className).slice(0, 200)) || null,
        zIndex: cs.zIndex,
        pointerEvents: cs.pointerEvents,
      };
    }
    debugDashboard("dom-state", {
      statsCardCount: statCards,
      requestRowCountAssigned: nA,
      requestRowCountBidding: nB,
      visibleButtonsCount: visibleBtns,
      buttonsInMainCount: allBtns.length,
      elementFromPointCenter: hitInfo,
    });
    const mainEl = document.querySelector("main.lhai-main");
    const onDashboardMain =
      mainEl && hit instanceof Node && document.body.contains(hit) ? mainEl.contains(hit) : false;
    const tag = (hit && /** @type {Element} */ (hit).tagName) || "";
    const dialogOpen = tag === "DIALOG" && /** @type {HTMLDialogElement} */ (hit).open;
    const cls = (hit instanceof Element && hit.className && String(hit.className)) || "";
    const looksBackdrop =
      /backdrop|overlay|modal-backdrop|lhai-modal-backdrop/i.test(cls) ||
      (hit instanceof Element && hit.getAttribute("role") === "dialog");
    if (!onDashboardMain || dialogOpen || looksBackdrop) {
      console.warn("[partner-dashboard] center point is blocked by possible overlay", {
        onDashboardMain,
        dialogOpen,
        looksBackdrop,
        hitInfo,
      });
    }
  };
  window.requestAnimationFrame(() => {
    window.setTimeout(run, 0);
  });
}

/** @param {Record<string, unknown>} r */
function assignedRowUiStatus(r) {
  const u = String(r.ui_status ?? "")
    .trim()
    .toUpperCase();
  if (u === "COMPLETED") return "COMPLETED";
  const st = String(r.status ?? "")
    .trim()
    .toUpperCase();
  if (st === "COMPLETED") return "COMPLETED";
  return "IN_PROGRESS";
}

/** @param {Record<string, unknown>} r */
function partnerCustomerDisplayFromRow(r) {
  const direct = String(r.customer_display ?? "").trim();
  if (direct) return direct;
  const name = String(r.customer_name ?? "").trim();
  const email = String(r.customer_email ?? "").trim();
  if (name && email) {
    if (name.toLowerCase() === email.toLowerCase()) return email;
    return `${name} (${email})`;
  }
  if (email) return email;
  if (name) return name;
  return t("partner.dashboard.customer_fallback", "Customer");
}

/**
 * @param {Record<string, unknown>} r
 * @param {"IN_PROGRESS" | "COMPLETED"} ui
 */
function renderAssignedRequestCard(r, ui) {
  const tid = String(r.thread_id || "").trim();
  const messagesHref = buildMessagesThreadUrl(tid);
  const detailHref = tid
    ? `partner-assigned-request.html?thread_id=${encodeURIComponent(tid)}`
    : "partner-assigned-request.html";
  const svc = escHtml(partnerDashboardServiceDisplayName(r, t) || "—");
  const cust = escHtml(partnerCustomerDisplayFromRow(r));
  const lastAt = formatMessageTimestamp(r.last_message_at);
  const lastAtHtml = escHtml(lastAt);
  const unreadN = Math.max(0, Number(r.unread_count) || 0);
  const hasUnread = Boolean(r.has_unread_customer_message);
  let unreadBadge = "";
  if (unreadN > 0) {
    const unreadTitle = t("partner.dashboard.unread.title", "Unread messages");
    const unreadAria = t("partner.dashboard.unread.aria", "Unread messages ({count})").replace(
      "{count}",
      String(unreadN),
    );
    unreadBadge = `<span class="lhai-partner-dash__unread-badge" title="${escHtml(unreadTitle)}" aria-label="${escHtml(unreadAria)}">${unreadN}</span>`;
  } else if (hasUnread) {
    const flagTitle = t("partner.dashboard.unread.flag_title", "Unread messages");
    const flagAria = t("partner.dashboard.unread.flag_aria", "Unread messages");
    unreadBadge = `<span class="lhai-partner-dash__unread-badge lhai-partner-dash__unread-badge--flag" title="${escHtml(flagTitle)}" aria-label="${escHtml(flagAria)}">!</span>`;
  }
  const previewText = partnerDashboardLastMessagePreview(r);
  const previewBlock = previewText
    ? `<span class="lhai-partner-dash__preview-q"><q>${escHtml(previewText)}</q></span>`
    : "—";

  const badgeClass = ui === "COMPLETED"
    ? "lhai-partner-dash__status-badge lhai-partner-dash__status-badge--done"
    : "lhai-partner-dash__status-badge lhai-partner-dash__status-badge--progress";
  const badgeText =
    ui === "COMPLETED"
      ? t("partner.dashboard.card.status.done", "Completed")
      : t("partner.dashboard.card.status.in_progress", "In progress");
  const safeId = tid.replace(/[^a-zA-Z0-9_-]/g, "") || "row";
  const titleId = `lhai-pd-svc-${safeId}`;

  const completeBtn =
    ui === "IN_PROGRESS" && tid
      ? `<button type="button" class="lhai-button lhai-button--secondary lhai-partner-dash__complete-btn" data-thread-id="${escHtml(
          tid,
        )}" data-action="complete-assigned">${escHtml(t("partner.dashboard.card.complete_btn", "Mark complete"))}</button>`
      : "";

  const tailSlot =
    completeBtn
      ? ""
      : `<span class="lhai-partner-dash__actions-slot" aria-hidden="true"></span>`;

  const unreadLine =
    unreadN > 0
      ? `<strong>${unreadN}</strong>`
      : hasUnread
        ? `<strong>${escHtml(t("partner.dashboard.card.unread.yes", "Yes"))}</strong>`
        : "<strong>0</strong>";

  const customerLabel = escHtml(t("partner.dashboard.card.customer_label", "Customer:"));
  const lastMsgLabel = escHtml(t("partner.dashboard.card.last_message_label", "Latest message:"));
  const unreadLabel = escHtml(t("partner.dashboard.card.unread_label", "Unread messages:"));
  const previewLabel = escHtml(t("partner.dashboard.card.preview_label", "Last message:"));
  const openMsg = escHtml(t("partner.dashboard.card.open_messages", "Open messages"));
  const viewDetail = escHtml(t("partner.dashboard.card.view_detail", "View details"));

  return `<article class="lhai-partner-dash__request-card lhai-assigned-request-card" aria-labelledby="${titleId}">
    <div class="lhai-partner-dash__request-card__head">
      <h4 class="lhai-partner-dash__request-card__title" id="${titleId}">${svc}</h4>
      <span class="${badgeClass}">${escHtml(badgeText)}</span>
    </div>
    <p class="lhai-partner-dash__request-card__meta"><strong>${customerLabel}</strong> ${cust}</p>
    <div class="lhai-partner-dash__request-card__row">
      <span class="lhai-partner-dash__request-card__meta">${lastMsgLabel} <strong>${lastAtHtml}</strong></span>
      ${unreadBadge}
    </div>
    <p class="lhai-partner-dash__request-card__meta">${unreadLabel} ${unreadLine}</p>
    <p class="lhai-partner-dash__request-card__preview">${previewLabel} ${previewBlock}</p>
    <div class="lhai-partner-dash__actions">
      <a class="lhai-button lhai-button--primary" href="${messagesHref}">${openMsg}</a>
      <a class="lhai-button lhai-button--secondary" href="${detailHref}">${viewDetail}</a>
      ${completeBtn}
      ${tailSlot}
    </div>
  </article>`;
}

/** @param {string} code */
function biddingBidStatusLabel(code) {
  const c = String(code || "").trim().toUpperCase();
  const key = `partner.dashboard.bid_status.${c}`;
  const fallbacks = {
    NOT_SUBMITTED: "Offer not submitted",
    SUBMITTED: "Offer submitted",
    SELECTED: "Selected",
    CLOSED: "Closed",
    REJECTED: "Closed",
  };
  return t(key, fallbacks[c] || c || "—");
}

function scrollToHash() {
  const h = (window.location.hash || "").trim();
  if (h === "#partner-requests") {
    document.querySelector("#partner-requests")?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }
}

/** @returns {"assigned" | "bidding" | "unsupported"} */
function detectDashboardBranchFromDom() {
  const main = document.getElementById("partnerDashboardMain");
  if (!(main instanceof HTMLElement)) return "assigned";
  if (main.classList.contains("lhai-bidding-dashboard")) return "bidding";
  if (main.classList.contains("lhai-partner-dash--unsupported")) return "unsupported";
  return "assigned";
}

/**
 * Page title area respects nav key (신청 리스트 vs 대시보드).
 * @param {"assigned" | "bidding" | "unsupported"} branch
 */
function applyPartnerDashboardTitles(branch) {
  const pageKey = resolvePartnerPageKey(window.location.pathname, window.location.hash);
  const titleEl = document.querySelector("#partnerDashboardTitle");
  const subEl = document.querySelector("#partnerDashboardSubtitle");
  const secTitle = document.querySelector("#partnerRequestsSectionTitle");

  if (pageKey === "bid_requests") {
    if (titleEl) {
      titleEl.textContent = t("partner.dashboard.title.bid_requests", "Request list");
    }
    if (subEl) {
      subEl.textContent =
        branch === "bidding"
          ? t(
              "partner.dashboard.subtitle.bid_requests.bidding",
              "Review incoming bid requests and submit offers from the detail page.",
            )
          : t(
              "partner.dashboard.subtitle.bid_requests.assigned",
              "Review assigned customer requests and continue service in messages.",
            );
    }
    if (secTitle) {
      secTitle.textContent = t("partner.dashboard.section.bid_requests", "Request list");
    }
    return;
  }

  if (branch === "assigned") {
    if (titleEl) titleEl.textContent = t("partner.dashboard.title.assigned", "Assigned work dashboard");
    if (subEl) {
      subEl.textContent = t(
        "partner.dashboard.subtitle.assigned",
        "Review assigned customer requests and continue service in messages.",
      );
    }
    if (secTitle) {
      secTitle.textContent = t("partner.dashboard.section.assigned_requests", "Request list");
    }
    return;
  }
  if (branch === "bidding") {
    if (titleEl) titleEl.textContent = t("partner.dashboard.title.bidding", "Bid request dashboard");
    if (subEl) {
      subEl.textContent = t(
        "partner.dashboard.subtitle.bidding",
        "Review incoming bid requests and submit your offers.",
      );
    }
    if (secTitle) {
      secTitle.textContent = t("partner.dashboard.section.bidding_requests", "Bid request list");
    }
    return;
  }
  if (titleEl) titleEl.textContent = t("partner.dashboard.title", "Partner dashboard");
  if (subEl) subEl.textContent = "";
  if (secTitle) secTitle.textContent = t("partner.dashboard.section.list", "List");
}

function onPartnerDashboardHashChange() {
  const file = (window.location.pathname || "").split("/").pop()?.toLowerCase() || "";
  if (file !== "partner-dashboard.html") return;
  syncPartnerPageState();
  applyPartnerDashboardTitles(detectDashboardBranchFromDom());
  scrollToHash();
}

/** dialog/inert 잔여물 제거 — 즉시 + 다음 프레임·마이크로태스크 한 번 더 */
function schedulePartnerShellModalCleanup() {
  clearShellTopLayerBlockers();
  window.requestAnimationFrame(() => {
    clearShellTopLayerBlockers();
    window.setTimeout(() => clearShellTopLayerBlockers(), 0);
  });
}

/** @param {HTMLElement | null} el @param {boolean} visible */
function setHidden(el, visible) {
  if (!(el instanceof HTMLElement)) return;
  el.hidden = !visible;
}

/**
 * @param {HTMLElement | null} errEl
 * @param {HTMLElement | null} emptyEl
 * @param {HTMLElement | null} assignedWrap
 * @param {HTMLElement | null} biddingWrap
 */
function showDashboardError(errEl, emptyEl, assignedWrap, biddingWrap, msg) {
  debugDashboard("render-error", { message: String(msg || "").slice(0, 240) });
  hideUnsupportedPartnerPanel();
  applyPartnerMainDashboardClasses("error");
  if (errEl instanceof HTMLElement) {
    errEl.hidden = false;
    errEl.textContent = msg;
  }
  if (emptyEl instanceof HTMLElement) emptyEl.hidden = true;
  setHidden(assignedWrap, false);
  setHidden(biddingWrap, false);
  const wa = document.querySelector("#partnerAssignedCardsRoot");
  const wb = document.querySelector("#partnerBiddingListRoot");
  setHidden(wa, false);
  setHidden(wb, false);
}

function clearDashboardError(errEl) {
  if (errEl instanceof HTMLElement) {
    errEl.hidden = true;
    errEl.textContent = "";
  }
}

/** @param {string} message */
function showPartnerDashboardToast(message) {
  const main = document.querySelector("main.lhai-main");
  if (!(main instanceof HTMLElement)) return;
  const el = document.createElement("p");
  el.className = "lhai-partner-dash__toast";
  el.setAttribute("role", "status");
  el.textContent = message;
  const header = main.querySelector(".lhai-page-header");
  if (header && header.parentElement === main) {
    header.insertAdjacentElement("afterend", el);
  } else {
    main.insertBefore(el, main.firstChild);
  }
  window.setTimeout(() => {
    el.remove();
  }, 4500);
}

function ensurePartnerCompleteDialog() {
  const existing = document.getElementById("lhaiPartnerAssignedCompleteDialog");
  if (existing instanceof HTMLDialogElement) return existing;
  const dlg = /** @type {HTMLDialogElement} */ (document.createElement("dialog"));
  dlg.id = "lhaiPartnerAssignedCompleteDialog";
  dlg.className = "lhai-partner-dash__complete-dialog";
  dlg.setAttribute("aria-labelledby", "lhaiPartnerCompleteDialogTitle");
  dlg.innerHTML = `
    <div class="lhai-partner-dash__complete-dialog__inner">
      <h3 class="lhai-partner-dash__complete-dialog__title" id="lhaiPartnerCompleteDialogTitle">${escHtml(t("partner.dashboard.complete_dialog.title", "Mark this request as complete?"))}</h3>
      <p class="lhai-partner-dash__complete-dialog__desc">${escHtml(t("partner.dashboard.complete_dialog.desc", "After completion, this request moves to the completed list. Conversation history is kept."))}</p>
      <div class="lhai-partner-dash__complete-dialog__actions">
        <button type="button" class="lhai-button lhai-button--secondary" data-role="complete-cancel">${escHtml(t("common.cancel", "Cancel"))}</button>
        <button type="button" class="lhai-button lhai-button--primary" data-role="complete-confirm">${escHtml(t("partner.dashboard.complete_dialog.confirm", "Mark complete"))}</button>
      </div>
    </div>
  `;
  document.body.appendChild(dlg);
  return dlg;
}

function wirePartnerCompleteDialogOnce() {
  const dlg = ensurePartnerCompleteDialog();
  if (dlg.dataset.wired === "1") return;
  dlg.dataset.wired = "1";
  const cancel = dlg.querySelector('[data-role="complete-cancel"]');
  const ok = dlg.querySelector('[data-role="complete-confirm"]');
  if (cancel instanceof HTMLButtonElement) {
    cancel.addEventListener("click", () => {
      dlg.close("cancel");
      schedulePartnerShellModalCleanup();
    });
  }
  if (ok instanceof HTMLButtonElement) {
    ok.addEventListener("click", async () => {
      const tid = String(dlg.dataset.pendingThreadId || "").trim();
      if (!tid) return;
      ok.disabled = true;
      try {
        await partnerThreadsApi.completeAssignedRequest(tid);
        dlg.close("confirm");
        schedulePartnerShellModalCleanup();
        const refreshed = await refreshPartnerDashboardInPlace();
        if (refreshed) {
          showPartnerDashboardToast(t("partner.dashboard.toast.completed", "Marked as complete."));
        }
      } catch (e) {
        const msg = e && typeof e.message === "string" ? e.message : String(e);
        alertPlain(
          msg || t("common.dialog.partner.complete_failed", "Could not mark this as complete. Please try again shortly."),
        );
      } finally {
        ok.disabled = false;
      }
    });
  }
}

/**
 * 대시보드 API만 다시 불러와 ASSIGNED/BIDDING UI를 갱신한다 (사이드바 제외).
 * @returns {Promise<boolean>} 성공 시 true
 */
async function refreshPartnerDashboardInPlace() {
  const errEl = document.querySelector("#partnerDashboardError");
  const emptyEl = document.querySelector("#partnerDashboardEmpty");
  const assignedWrap = document.querySelector("#partnerTableAssignedWrap");
  const biddingWrap = document.querySelector("#partnerTableBiddingWrap");
  let data;
  try {
    data = await partnerThreadsApi.dashboard();
  } catch (e) {
    debugDashboard("api-refresh-error", {
      message: e && typeof e.message === "string" ? e.message.slice(0, 400) : String(e).slice(0, 400),
    });
    showDashboardError(
      errEl,
      emptyEl,
      assignedWrap,
      biddingWrap,
      t("partner.dashboard.error.load", "Could not load the dashboard. Please try again in a moment."),
    );
    return false;
  }
  if (!data || typeof data !== "object") {
    showDashboardError(
      errEl,
      emptyEl,
      assignedWrap,
      biddingWrap,
      t("partner.dashboard.error.load", "Could not load the dashboard. Please try again in a moment."),
    );
    return false;
  }
  clearDashboardError(errEl);
  persistPartnerModeFromDashboard(data);
  const branch = resolvePartnerDashboardBranch(data);
  if (branch === "assigned") {
    renderAssignedDashboard(data);
  } else if (branch === "bidding") {
    renderBiddingDashboard(data);
  } else {
    renderUnsupportedPartnerMode(data);
  }
  scrollToHash();
  schedulePartnerShellModalCleanup();
  debugDashboard("render-complete-refresh", { branch, partner_mode: data.partner_mode, dashboard_type: data.dashboard_type });
  logPartnerDashboardDomAfterRender(branch === "assigned" ? "assigned" : branch === "bidding" ? "bidding" : "unsupported");
  return true;
}

/** @type {Record<string, unknown> | null} */
let partnerDashboardPayloadCache = null;
let partnerDashboardLanguageRefetchInFlight = false;

const PARTNER_DASHBOARD_I18N_PREFIXES = ["partner.", "common.", "messages."];

function refreshPartnerDashboardStaticI18n() {
  const root = document.querySelector("#partnerDashboardMain") || document;
  applyI18nToDom(root);
  applyPartnerDashboardTitles(detectDashboardBranchFromDom());
}

async function handlePartnerDashboardLanguageChanged() {
  if (partnerDashboardLanguageRefetchInFlight) return;
  partnerDashboardLanguageRefetchInFlight = true;
  try {
    refreshPartnerDashboardStaticI18n();
    // Refetch so backend returns viewer-locale display_* for the new UI language.
    await refreshPartnerDashboardInPlace();
  } finally {
    partnerDashboardLanguageRefetchInFlight = false;
  }
}

wireDynamicPageI18nRefresh(() => {
  void handlePartnerDashboardLanguageChanged();
}, { languageChangeOnly: true });

wireDynamicPageI18nRefresh(refreshPartnerDashboardStaticI18n, {
  runtimeResolvedOnly: true,
  keyPrefixes: PARTNER_DASHBOARD_I18N_PREFIXES,
});

/** @param {Record<string, unknown>} data */
function renderPartnerDashboardFromPayload(data) {
  partnerDashboardPayloadCache = data;
  const branch = resolvePartnerDashboardBranch(data);
  debugDashboard("render-start", { branch, partner_mode: data.partner_mode, dashboard_type: data.dashboard_type });
  if (branch === "assigned") {
    renderAssignedDashboard(data);
  } else if (branch === "bidding") {
    renderBiddingDashboard(data);
  } else {
    renderUnsupportedPartnerMode(data);
  }
  const reqs = Array.isArray(data.requests) ? data.requests : [];
  debugDashboard("render-stats", {
    branch,
    partner_mode: data.partner_mode,
    stats: data.stats,
  });
  debugDashboard("render-requests", {
    count: reqs.length,
    preview_thread_or_bid_ids: reqs.slice(0, 12).map((r) => {
      if (!r || typeof r !== "object") return null;
      const o = /** @type {Record<string, unknown>} */ (r);
      return o.thread_id != null ? String(o.thread_id).slice(0, 36) : o.bid_request_id != null ? String(o.bid_request_id).slice(0, 36) : null;
    }),
  });
  if (!reqs.length) {
    debugDashboard("render-empty", { branch });
  }
  scrollToHash();
  diagnoseShellTopLayerBlockers("partner-dashboard:render-complete");
  schedulePartnerShellModalCleanup();
  debugDashboard("render-complete", { branch, requests_count: reqs.length });
  logPartnerDashboardDomAfterRender(branch === "assigned" ? "assigned" : branch === "bidding" ? "bidding" : "unsupported");
}

if (typeof window !== "undefined" && !window.__lhaiPartnerDashHashScrollBound) {
  window.__lhaiPartnerDashHashScrollBound = true;
  window.addEventListener("hashchange", onPartnerDashboardHashChange);
}

if (typeof document !== "undefined" && !document.documentElement.dataset.lhaiPartnerDashCompleteBound) {
  document.documentElement.dataset.lhaiPartnerDashCompleteBound = "1";
  document.body.addEventListener("click", (ev) => {
    const t = ev.target;
    if (!(t instanceof Element)) return;
    const btn = t.closest("[data-action='complete-assigned']");
    if (!(btn instanceof HTMLButtonElement)) return;
    const threadId = String(btn.getAttribute("data-thread-id") || "").trim();
    if (!threadId) return;
    ev.preventDefault();
    wirePartnerCompleteDialogOnce();
    const dlg = ensurePartnerCompleteDialog();
    dlg.dataset.pendingThreadId = threadId;
    dlg.showModal();
    schedulePartnerShellModalCleanup();
  });
}

/** @param {Record<string, unknown>} data */
function renderAssignedDashboard(data) {
  applyPartnerDashboardDualPanels("assigned");
  applyPartnerMainDashboardClasses("assigned");

  applyPartnerDashboardTitles("assigned");

  const statProgress = document.querySelector("#partnerStatProgress");
  const statDone = document.querySelector("#partnerStatDone");
  const stats = data.stats && typeof data.stats === "object" ? /** @type {Record<string, number>} */ (data.stats) : {};
  const requests = Array.isArray(data.requests) ? /** @type {Record<string, unknown>[]} */ (data.requests) : [];

  let inProg = Number(stats.in_progress);
  let done = Number(stats.completed);
  if (!Number.isFinite(inProg) || !Number.isFinite(done)) {
    inProg = 0;
    done = 0;
    for (const row of requests) {
      if (!(row && typeof row === "object")) continue;
      if (assignedRowUiStatus(row) === "COMPLETED") done += 1;
      else inProg += 1;
    }
  }
  if (statProgress) statProgress.textContent = String(inProg);
  if (statDone) statDone.textContent = String(done);

  const emptyEl = document.querySelector("#partnerDashboardEmpty");
  const root = document.querySelector("#partnerAssignedCardsRoot");
  const ipEmpty = document.querySelector("#partnerAssignedInProgressEmpty");
  const ipCards = document.querySelector("#partnerAssignedInProgressCards");
  const coEmpty = document.querySelector("#partnerAssignedCompletedEmpty");
  const coCards = document.querySelector("#partnerAssignedCompletedCards");

  if (emptyEl instanceof HTMLElement) {
    emptyEl.hidden = true;
    emptyEl.textContent = "";
  }

  const inProgressRows = [];
  const completedRows = [];
  for (const row of requests) {
    if (!(row && typeof row === "object")) continue;
    if (assignedRowUiStatus(row) === "COMPLETED") completedRows.push(row);
    else inProgressRows.push(row);
  }

  if (ipCards instanceof HTMLElement) {
    ipCards.innerHTML = inProgressRows.map((r) => renderAssignedRequestCard(r, "IN_PROGRESS")).join("");
  }
  if (coCards instanceof HTMLElement) {
    coCards.innerHTML = completedRows.map((r) => renderAssignedRequestCard(r, "COMPLETED")).join("");
  }

  if (ipEmpty instanceof HTMLElement) {
    if (!inProgressRows.length) {
      ipEmpty.hidden = false;
      ipEmpty.textContent = t(
        "partner.dashboard.empty.in_progress",
        "No active service requests. New assignments will appear here.",
      );
    } else {
      ipEmpty.hidden = true;
      ipEmpty.textContent = "";
    }
  }
  if (coEmpty instanceof HTMLElement) {
    if (!completedRows.length) {
      coEmpty.hidden = false;
      coEmpty.textContent = t(
        "partner.dashboard.empty.completed",
        "No completed requests yet. Finished work will appear here after you mark requests complete.",
      );
    } else {
      coEmpty.hidden = true;
      coEmpty.textContent = "";
    }
  }

  setHidden(root, true);
}

/** @param {Record<string, unknown>} data */
function renderBiddingDashboard(data) {
  applyPartnerDashboardDualPanels("bidding");
  applyPartnerMainDashboardClasses("bidding");

  applyPartnerDashboardTitles("bidding");

  /** @type {Record<string, HTMLElement | null>} */
  const statEls = {
    open_bid_requests: document.querySelector("#partnerStatBiddingOpen"),
    submitted_bids: document.querySelector("#partnerStatBiddingSubmitted"),
    selected_bids: document.querySelector("#partnerStatBiddingSelected"),
    closed_bids: document.querySelector("#partnerStatBiddingClosed"),
  };

  const stats = data.stats && typeof data.stats === "object" ? /** @type {Record<string, number>} */ (data.stats) : {};
  const keys = ["open_bid_requests", "submitted_bids", "selected_bids", "closed_bids"];
  for (const k of keys) {
    const el = statEls[k];
    if (el) el.textContent = String(stats[k] ?? 0);
  }

  const emptyEl = document.querySelector("#partnerDashboardEmpty");
  const listRoot = document.querySelector("#partnerBiddingListRoot");

  const requests = Array.isArray(data.requests) ? data.requests : [];

  if (!requests.length) {
    if (emptyEl instanceof HTMLElement) {
      emptyEl.hidden = false;
      emptyEl.textContent = t("partner.dashboard.empty.bidding", "No new bid requests yet.");
    }
    setHidden(listRoot, false);
    if (listRoot instanceof HTMLElement) listRoot.innerHTML = "";
    return;
  }

  if (emptyEl instanceof HTMLElement) emptyEl.hidden = true;
  setHidden(listRoot, true);

  if (listRoot instanceof HTMLElement) {
    listRoot.innerHTML = requests
      .map((row) => {
        /** @type {Record<string, unknown>} */
        const r = row && typeof row === "object" ? row : {};
        const bidRequestId = String(r.bid_request_id || "").trim();
        const qs = new URLSearchParams();
        const expRaw = r.expires_at;
        if (expRaw != null && String(expRaw).trim() !== "") {
          qs.set("expires_at", String(expRaw).trim());
        }
        const reqSt = String(r.request_status || "").trim();
        if (reqSt) qs.set("request_status", reqSt);
        const expQ = qs.toString() ? `?${qs.toString()}` : "";
        const detailHref = `partner-bid-request.html${expQ}#/partner/bid-requests/${encodeURIComponent(bidRequestId)}`;
        return buildBiddingDashboardCardHtml(r, detailHref, escHtml, t);
      })
      .join("");
  }
}

async function initPartnerDashboard() {
  diagnoseShellTopLayerBlockers("partner-dashboard:init-start");
  schedulePartnerShellModalCleanup();
  syncHeaderRoleBadge();

  emitPartnerDashboardAuthDebug("auth-check-start", {});
  const role = getCurrentRole();
  emitPartnerDashboardAuthDebug("auth-check-result", {
    role,
    hasAccessToken: isAuthenticated(),
    hasUserId: Boolean(getCurrentUserId()),
    sessionEmailFieldPresent: Boolean((getSession()?.email || "").toString().trim()),
    isPartnerRole: role === ROLES.PARTNER,
  });

  if (role !== ROLES.PARTNER) {
    window.location.replace("dashboard.html");
    return;
  }
  if (!protectCurrentPage()) return;
  if (!ensureCustomerAccess()) return;

  await bootAppPageContent(["common", "nav", "partner"], async () => {
  const pageKey = resolvePartnerPageKey(window.location.pathname, window.location.hash);
  await mountPartnerShell("#app", {
    pageKey,
    documentTitle:
      pageKey === "bid_requests"
        ? t("partner.dashboard.doc_title_bid_requests", "Request list — Landing Help AI")
        : t("partner.dashboard.doc_title", "Partner dashboard — Landing Help AI"),
    contentHtml: renderPartnerDashboardContentHtml(),
    mainExtraClass: "lhai-partner-dash",
    mainId: "partnerDashboardMain",
  });

  const errEl = document.querySelector("#partnerDashboardError");
  const emptyEl = document.querySelector("#partnerDashboardEmpty");
  const assignedWrap = document.querySelector("#partnerTableAssignedWrap");
  const biddingWrap = document.querySelector("#partnerTableBiddingWrap");

  let data;
  try {
    diagnoseShellTopLayerBlockers("partner-dashboard:api-before");
    debugDashboard("api-request-start", { path: "/api/partner/dashboard" });
    data = await partnerThreadsApi.dashboard();
    diagnoseShellTopLayerBlockers("partner-dashboard:api-success");
    debugDashboard("api-request-success", partnerDashboardResponsePreview(data));
  } catch (e) {
    diagnoseShellTopLayerBlockers("partner-dashboard:api-error");
    debugDashboard("api-request-error", {
      message: e && typeof e.message === "string" ? e.message.slice(0, 400) : String(e).slice(0, 400),
    });
    showDashboardError(
      errEl,
      emptyEl,
      assignedWrap,
      biddingWrap,
      t("partner.dashboard.error.load", "Could not load the dashboard. Please try again in a moment."),
    );
    debugDashboard("render-complete", { path: "error-no-data" });
    logPartnerDashboardDomAfterRender("");
    schedulePartnerShellModalCleanup();
    return;
  }

  clearDashboardError(errEl);

  if (!data || typeof data !== "object") {
    debugDashboard("api-request-error", { reason: "invalid_or_empty_json" });
    showDashboardError(
      errEl,
      emptyEl,
      assignedWrap,
      biddingWrap,
      t("partner.dashboard.error.load", "Could not load the dashboard. Please try again in a moment."),
    );
    debugDashboard("render-complete", { path: "invalid-payload" });
    logPartnerDashboardDomAfterRender("");
    schedulePartnerShellModalCleanup();
    return;
  }

  persistPartnerModeFromDashboard(data);

  renderPartnerDashboardFromPayload(data);
  });
}

// 브라우저 콘솔: window.__lhaiDiagnoseTopLayer("manual-check") | window.__lhaiPartnerDashboardDebug.enable()
diagnoseShellTopLayerBlockers("partner-dashboard:module-load");
debugDashboard("module-load", { href: window.location.href });
initRouter();

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => {
    diagnoseShellTopLayerBlockers("partner-dashboard:dom-content-loaded");
    debugDashboard("dom-ready", { readyState: document.readyState });
  });
} else {
  diagnoseShellTopLayerBlockers("partner-dashboard:dom-content-loaded");
  debugDashboard("dom-ready", { readyState: document.readyState });
}

void initPartnerDashboard();
