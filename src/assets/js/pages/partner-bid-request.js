/**
 * BIDDING_ONLY 견적 요청 상세·제출.
 * 라우트: /partner/bid-requests/:id → 해시 `#/partner/bid-requests/<uuid>` 또는 `?bid_request_id=` 호환.
 */
import { applyPartnerBiddingSidebarMessagingHide, loadSidebar } from "../components/sidebar.js";
import { partnerThreadsApi } from "../core/api.js";
import { subscribeRealtimeEvents } from "../core/realtime-client.js";
import {
  isCarPurchaseBidUpdatedPayload,
  isPartnerBidRequestHtmlPage,
  normalizeBidUpdatedPayload,
  showBidUpdatedToast,
} from "../core/bid-realtime.js";
import { getCurrentRole } from "../core/auth.js";
import { ROLES } from "../core/config.js";
import { refreshPartnerModeSession } from "../core/partner-mode-session.js";
import { ensureCustomerAccess, protectCurrentPage } from "../core/guards.js";
import { syncHeaderRoleBadge } from "../core/role-header-badge.js";
import { clearShellTopLayerBlockers } from "../core/ui-blockers.js";
import { formatMessageTimestamp } from "../core/utils.js";
import { isCarPurchaseBiddingMode, resolvePartnerBidEditable } from "./partner-bid-request-car-logic.js";
import { mountCarPurchaseBidUi } from "./partner-bid-request-car-ui.js";

/** @param {unknown} err */
function httpStatusFromError(err) {
  if (err != null && typeof err === "object" && "status" in err) {
    const n = Number(/** @type {{ status?: unknown }} */ (err).status);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function escHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** 해시·경로·쿼리에서 bid_request UUID 추출 */
function getBidRequestIdFromLocation() {
  const q = new URLSearchParams(window.location.search).get("bid_request_id");
  if (q && String(q).trim()) return String(q).trim();

  let rawHash = (window.location.hash || "").replace(/^#/, "").trim();
  while (rawHash.startsWith("/")) rawHash = rawHash.slice(1);
  const m = /^partner\/bid-requests\/([^/?#]+)/i.exec(rawHash);
  if (m) return decodeURIComponent(m[1]).trim();

  try {
    const path = window.location.pathname.replace(/\/+$/, "");
    const parts = path.split("/").filter(Boolean);
    const i = parts.findIndex((p) => p.toLowerCase() === "bid-requests");
    if (i >= 0 && parts[i + 1]) return decodeURIComponent(parts[i + 1]).trim();
  } catch {
    /* ignore */
  }
  return "";
}

/** 대시보드에서 넘긴 마감 시각(ISO 등). 상세 API에 없음 */
function getExpiresAtFromQuery() {
  const v = new URLSearchParams(window.location.search).get("expires_at");
  return v && String(v).trim() ? String(v).trim() : "";
}

/** 대시보드에서 넘긴 bid_request.status (OPEN | CUSTOMER_SELECTED | CLOSED) */
function getRequestStatusFromQuery() {
  const v = new URLSearchParams(window.location.search).get("request_status");
  return v && String(v).trim() ? String(v).trim().toUpperCase() : "OPEN";
}

/** @param {string} bidStatus */
function requestStatusHeroLabel(bidStatus) {
  const b = String(bidStatus || "").trim().toUpperCase();
  if (b === "SELECTED") return "고객 선택 완료";
  if (b === "CLOSED") return "종료됨";
  if (b === "SUBMITTED") return "견적 제출 완료 · 대기 중";
  if (b === "NOT_SUBMITTED") return "견적 미제출 · 진행 중";
  return b || "—";
}

/** @param {Record<string, unknown>} bid */
function normalizeBidStatus(bid) {
  return String(bid?.status ?? "").trim().toUpperCase();
}

/** @param {unknown} items */
function includedItemsToText(items) {
  if (items == null) return "";
  if (Array.isArray(items)) return items.map((x) => String(x ?? "").trim()).filter(Boolean).join("\n");
  return String(items).trim();
}

/**
 * GENERAL bidding — 기존 단순 견적 폼.
 * @param {Record<string, unknown>} data
 * @param {{ expiresAtQuery: string, requestStatusQuery: string }} ctx
 */
function renderLegacyBidRequest(data, ctx) {
  const legacyRoot = document.querySelector("#partnerBidLegacyRoot");
  const carRoot = document.querySelector("#partnerBidCarRoot");
  const sharedHero = document.querySelector("#partnerBidSharedHero");
  if (legacyRoot instanceof HTMLElement) legacyRoot.hidden = false;
  if (carRoot instanceof HTMLElement) {
    carRoot.hidden = true;
    carRoot.innerHTML = "";
  }
  if (sharedHero instanceof HTMLElement) sharedHero.hidden = false;

  applyLegacyDetailToDom(data, ctx);
}

/**
 * CAR_PURCHASE — 자동차 견적 UI.
 * @param {Record<string, unknown>} data
 * @param {object} mountCtx
 */
function renderCarPurchaseBidRequest(data, mountCtx) {
  const legacyRoot = document.querySelector("#partnerBidLegacyRoot");
  const carRoot = document.querySelector("#partnerBidCarRoot");
  const sharedHero = document.querySelector("#partnerBidSharedHero");
  if (legacyRoot instanceof HTMLElement) legacyRoot.hidden = true;
  if (sharedHero instanceof HTMLElement) sharedHero.hidden = true;
  if (!(carRoot instanceof HTMLElement)) return;

  carRoot.hidden = false;
  const svc =
    data.service && typeof data.service === "object"
      ? /** @type {Record<string, unknown>} */ (data.service)
      : {};
  const svcName = String(svc.name || "자동차 구매 견적");
  setText("#partnerBidPageTitle", svcName);
  setText("#partnerBidPageSubtitle", `요청 ID · ${String(data.bid_request_id || "").trim() || "—"}`);
  setText("#partnerBidRequestStatus", requestStatusHeroLabel(normalizeBidStatus(
    data.bid && typeof data.bid === "object" ? data.bid : {}
  )));

  mountCarPurchaseBidUi(carRoot, mountCtx);
}

/** @param {Record<string, unknown>} data @param {{ expiresAtQuery: string, requestStatusQuery: string }} ctx */
function applyLegacyDetailToDom(data, ctx) {
  const svc =
    data.service && typeof data.service === "object"
      ? /** @type {Record<string, unknown>} */ (data.service)
      : {};
  const cust =
    data.customer_summary && typeof data.customer_summary === "object"
      ? /** @type {Record<string, unknown>} */ (data.customer_summary)
      : {};
  const intake =
    data.intake && typeof data.intake === "object" ? /** @type {Record<string, unknown>} */ (data.intake) : {};
  const bid =
    data.bid && typeof data.bid === "object" ? /** @type {Record<string, unknown>} */ (data.bid) : {};

  const bidStatus = normalizeBidStatus(bid);
  const isEditable = resolvePartnerBidEditable({
    bidStatus,
    expiresAt: ctx.expiresAtQuery,
    requestStatus: ctx.requestStatusQuery,
  });
  const isSelected = bidStatus === "SELECTED";
  const isTerminalClosed = bidStatus === "CLOSED" || bidStatus === "REJECTED";

  const svcName = String(svc.name || "—");
  setText("#partnerBidSvcName", svcName);
  setText("#partnerBidPageTitle", svcName !== "—" ? svcName : "견적 요청");
  setText("#partnerBidPageSubtitle", `요청 ID · ${String(data.bid_request_id || "").trim() || "—"}`);

  setText("#partnerBidRequestStatus", requestStatusHeroLabel(bidStatus));

  const expHint = ctx.expiresAtQuery;
  setText("#partnerBidExpires", expHint ? formatMessageTimestamp(expHint) : "—");

  setText("#partnerBidCustName", String(cust.display_name || "—"));
  setText("#partnerBidCustLoc", String(cust.location || "—"));
  setText("#partnerBidIntakeSubmitted", formatMessageTimestamp(intake.submitted_at));

  const intakeBody = document.querySelector("#partnerBidIntakeBody");
  const answers = Array.isArray(intake.answers) ? intake.answers : [];
  if (intakeBody) {
    if (!answers.length) {
      intakeBody.innerHTML = `<p class="u-text-muted">인테이크 답변이 없습니다.</p>`;
    } else {
      intakeBody.innerHTML = answers
        .map((row) => {
          const r = row && typeof row === "object" ? /** @type {Record<string, unknown>} */ (row) : {};
          const label = escHtml(String(r.label ?? "—"));
          const value = escHtml(String(r.value ?? "—"));
          return `<div class="lhai-par-detail__intake-item"><p class="lhai-par-detail__intake-q">${label}</p><p class="lhai-par-detail__intake-a">${value}</p></div>`;
        })
        .join("");
    }
  }

  const formSection = document.querySelector("#partnerBidFormSection");
  const form = document.querySelector("#partnerBidForm");
  const selectedBanner = document.querySelector("#partnerBidSelectedBanner");
  const closedBanner = document.querySelector("#partnerBidClosedBanner");
  const msgGate = document.querySelector("#partnerBidMsgGate");
  const submitBtn = document.querySelector("#partnerBidSubmitBtn");

  if (selectedBanner instanceof HTMLElement) selectedBanner.hidden = !isSelected;
  if (closedBanner instanceof HTMLElement) closedBanner.hidden = !isTerminalClosed || isSelected;

  if (formSection instanceof HTMLElement) {
    formSection.hidden = !isEditable;
    const fh = formSection.querySelector("h2");
    if (fh) fh.textContent = "견적 입력";
  }

  if (form instanceof HTMLElement) form.hidden = !isEditable;
  if (msgGate instanceof HTMLElement) msgGate.hidden = !isEditable;

  const priceEl = document.querySelector("#partnerBidPrice");
  const curEl = document.querySelector("#partnerBidCurrency");
  const etaEl = document.querySelector("#partnerBidEta");
  const incEl = document.querySelector("#partnerBidIncluded");
  const msgEl = document.querySelector("#partnerBidMessage");

  if (priceEl instanceof HTMLInputElement) {
    const pa = bid.price_amount;
    priceEl.value =
      pa != null && pa !== "" && Number.isFinite(Number(pa)) ? String(pa) : "";
    priceEl.disabled = !isEditable;
  }
  if (curEl instanceof HTMLSelectElement) {
    const c = String(bid.price_currency || "USD").trim().toUpperCase().slice(0, 3);
    curEl.value = ["USD", "KRW", "EUR"].includes(c) ? c : "USD";
    curEl.disabled = !isEditable;
  }
  if (etaEl instanceof HTMLInputElement) {
    etaEl.value = String(bid.estimated_time || "");
    etaEl.disabled = !isEditable;
  }
  if (incEl instanceof HTMLTextAreaElement) {
    incEl.value = includedItemsToText(bid.included_items);
    incEl.disabled = !isEditable;
  }
  if (msgEl instanceof HTMLTextAreaElement) {
    msgEl.value = String(bid.message_to_customer || "");
    msgEl.disabled = !isEditable;
  }

  if (submitBtn instanceof HTMLButtonElement) {
    submitBtn.textContent = bidStatus === "SUBMITTED" ? "견적 수정 제출" : "견적 제출";
    submitBtn.disabled = !isEditable;
  }
}

function setText(sel, text) {
  const el = document.querySelector(sel);
  if (el) el.textContent = text;
}

/** @param {Record<string, unknown>} payload */
function validateBidForm(payload) {
  const price = Number(payload.price_amount);
  if (!Number.isFinite(price) || price <= 0) return "가격은 0보다 커야 합니다.";
  const eta = String(payload.estimated_time ?? "").trim();
  if (!eta) return "예상 처리 시간을 입력해 주세요.";
  const inc = String(payload.included_items ?? "").trim();
  if (!inc) return "포함 항목을 입력해 주세요.";
  return "";
}

async function init() {
  clearShellTopLayerBlockers();
  syncHeaderRoleBadge();
  if (getCurrentRole() !== ROLES.PARTNER) {
    window.location.replace("dashboard.html");
    return;
  }
  if (!protectCurrentPage()) return;
  if (!ensureCustomerAccess()) return;

  await refreshPartnerModeSession(partnerThreadsApi);
  await loadSidebar("#sidebar", "customer");
  applyPartnerBiddingSidebarMessagingHide();

  const bidRequestId = getBidRequestIdFromLocation();
  const expiresAtQuery = getExpiresAtFromQuery();
  const requestStatusQuery = getRequestStatusFromQuery();
  const loadingEl = document.querySelector("#partnerBidLoading");
  const mainEl = document.querySelector("#partnerBidMain");
  const errEl = document.querySelector("#partnerBidError");

  const showLoadErr = (msg) => {
    if (loadingEl instanceof HTMLElement) loadingEl.hidden = true;
    if (mainEl instanceof HTMLElement) mainEl.hidden = true;
    if (errEl instanceof HTMLElement) {
      errEl.hidden = false;
      errEl.textContent = msg;
    }
  };

  if (!bidRequestId) {
    showLoadErr("견적 요청 ID가 없습니다. 대시보드에서 다시 열어 주세요.");
    return;
  }

  let detail;
  try {
    detail = await partnerThreadsApi.bidRequestDetail(bidRequestId);
  } catch (err) {
    const st = httpStatusFromError(err);
    if (st === 403) showLoadErr("이 견적 요청을 볼 권한이 없습니다.");
    else if (st === 404) showLoadErr("견적 요청을 찾을 수 없습니다.");
    else showLoadErr(err instanceof Error ? err.message : "불러오지 못했습니다.");
    return;
  }

  if (!detail || typeof detail !== "object") {
    showLoadErr("응답 형식이 올바르지 않습니다.");
    return;
  }

  if (loadingEl instanceof HTMLElement) loadingEl.hidden = true;
  if (mainEl instanceof HTMLElement) mainEl.hidden = false;
  if (errEl instanceof HTMLElement) {
    errEl.hidden = true;
    errEl.textContent = "";
  }

  /** @type {Record<string, unknown>} */
  let latestDetail = /** @type {Record<string, unknown>} */ (detail);

  const bidRequestBlock =
    detail.bid_request && typeof detail.bid_request === "object"
      ? /** @type {Record<string, unknown>} */ (detail.bid_request)
      : null;
  const expiresAtEffective =
    bidRequestBlock?.expires_at != null
      ? String(bidRequestBlock.expires_at)
      : expiresAtQuery;
  const pageCtx = { expiresAtQuery: expiresAtEffective, requestStatusQuery };

  /** @param {Record<string, unknown>} data */
  function renderBidRequestView(data) {
    const brBlock =
      data.bid_request && typeof data.bid_request === "object"
        ? /** @type {Record<string, unknown>} */ (data.bid_request)
        : bidRequestBlock;
    const expEff =
      brBlock?.expires_at != null ? String(brBlock.expires_at) : expiresAtEffective;
    if (isCarPurchaseBiddingMode(data.bidding_mode)) {
      renderCarPurchaseBidRequest(data, {
        data,
        expiresAtQuery: expEff,
        requestStatusQuery,
        bidRequestBlock: brBlock,
        onDetailUpdate: (next) => {
          latestDetail = /** @type {Record<string, unknown>} */ (next);
          renderBidRequestView(latestDetail);
        },
        submitFn: (payload) => partnerThreadsApi.submitBidRequest(bidRequestId, payload),
      });
    } else {
      renderLegacyBidRequest(data, pageCtx);
    }
  }

  renderBidRequestView(latestDetail);

  subscribeRealtimeEvents((ev) => {
    const type = String(ev?.type || "").trim();
    if (type !== "bid.updated") return;
    const payload = normalizeBidUpdatedPayload(ev);
    if (!isCarPurchaseBidUpdatedPayload(payload)) return;
    const evtBr = String(payload.bid_request_id || "").trim();
    const evtTid = String(payload.thread_id || "").trim();
    if (evtBr && evtBr !== bidRequestId) return;
    void (async () => {
      try {
        const next = await partnerThreadsApi.bidRequestDetail(bidRequestId);
        latestDetail = /** @type {Record<string, unknown>} */ (next);
        renderBidRequestView(latestDetail);
      } catch {
        /* ignore reload errors */
      }
    })();
    if (
      isPartnerBidRequestHtmlPage() &&
      typeof document !== "undefined" &&
      document.visibilityState === "visible"
    ) {
      const href = `${window.location.pathname}${window.location.search}${window.location.hash}`;
      showBidUpdatedToast({
        title: "비딩 정보가 업데이트되었습니다.",
        cta: "확인",
        href,
      });
    }
  });

  const showError = (msg) => {
    window.alert(msg);
  };

  const openMsgBtn = document.querySelector("#partnerBidOpenMessagesBtn");
  if (openMsgBtn instanceof HTMLButtonElement) {
    openMsgBtn.addEventListener("click", () => {
      const tid = String(latestDetail.thread_id || "").trim();
      if (!tid) {
        showError("연결된 고객 대화방을 찾을 수 없습니다.");
        return;
      }
      window.location.href = `partner-assigned-request.html?thread_id=${encodeURIComponent(tid)}`;
    });
  }

  const form = document.querySelector("#partnerBidForm");
  const formErr = document.querySelector("#partnerBidFormError");

  if (form instanceof HTMLFormElement) {
    form.addEventListener("submit", async (ev) => {
      ev.preventDefault();
      if (isCarPurchaseBiddingMode(latestDetail.bidding_mode)) return;

      if (formErr instanceof HTMLElement) {
        formErr.hidden = true;
        formErr.textContent = "";
      }

      const fd = new FormData(form);
      const priceRaw = fd.get("price_amount");
      const msgRaw = String(fd.get("message_to_customer") ?? "").trim();
      const payload = {
        price_amount: Number(priceRaw),
        price_currency: String(fd.get("price_currency") ?? "USD").trim().toUpperCase().slice(0, 3),
        estimated_time: String(fd.get("estimated_time") ?? "").trim(),
        included_items: String(fd.get("included_items") ?? "").trim(),
        message_to_customer: msgRaw === "" ? null : msgRaw,
      };

      const verr = validateBidForm(payload);
      if (verr) {
        if (formErr instanceof HTMLElement) {
          formErr.hidden = false;
          formErr.textContent = verr;
        }
        return;
      }

      const submitBtnEl = document.querySelector("#partnerBidSubmitBtn");
      if (submitBtnEl instanceof HTMLButtonElement) submitBtnEl.disabled = true;

      try {
        const next = await partnerThreadsApi.submitBidRequest(bidRequestId, payload);
        latestDetail = /** @type {Record<string, unknown>} */ (next);
        renderBidRequestView(latestDetail);
        window.alert("견적이 저장되었습니다.");
      } catch (err) {
        const msg =
          err instanceof Error ? err.message : typeof err === "string" ? err : "제출에 실패했습니다.";
        if (formErr instanceof HTMLElement) {
          formErr.hidden = false;
          formErr.textContent = msg;
        }
      } finally {
        const btn = document.querySelector("#partnerBidSubmitBtn");
        const bRaw =
          latestDetail.bid && typeof latestDetail.bid === "object"
            ? /** @type {Record<string, unknown>} */ (latestDetail.bid)
            : {};
        const bs = normalizeBidStatus(bRaw);
        if (btn instanceof HTMLButtonElement) {
          btn.disabled = !resolvePartnerBidEditable({
            bidStatus: bs,
            expiresAt: expiresAtQuery,
            requestStatus: requestStatusQuery,
          });
        }
      }
    });
  }

  window.addEventListener("hashchange", () => {
    const next = getBidRequestIdFromLocation();
    if (next && next !== bidRequestId) window.location.reload();
  });
  clearShellTopLayerBlockers();
}

void init();
