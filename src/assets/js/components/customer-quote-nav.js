/**
 * 고객 사이드바 「견적」 메뉴 — 차량 비딩 제안 수 badge 및 bid-results 링크.
 */
import { dashboardApi } from "../core/api.js";
import { getCustomerMessagingProfileId, getCurrentRole } from "../core/auth.js";
import { ROLES } from "../core/config.js";
import { buildCustomerBidResultsPageHref } from "../pages/customer-bid-results-logic.js";
import {
  getActiveCarBid,
  resolveCustomerQuoteNavBadge,
} from "../pages/dashboard-logic.js";

const QUOTE_NAV_SELECTOR = '[data-lhai-nav="customer-quote"]';

/** @param {Record<string, unknown>} bid */
function quoteBidResultsHref(bid) {
  if (!bid) return "quote-detail.html";
  return buildCustomerBidResultsPageHref(bid.service_request_id, bid.thread_id, {
    fallbackHref: "quote-detail.html",
  });
}

/**
 * @param {unknown} aggregate
 * @param {ParentNode} [root]
 */
export function applyCustomerQuoteNavFromAggregate(aggregate, root = document) {
  const link = root.querySelector(QUOTE_NAV_SELECTOR);
  if (!(link instanceof HTMLAnchorElement)) return;

  let badge = link.querySelector(".lhai-nav__badge");
  if (!(badge instanceof HTMLElement)) {
    badge = document.createElement("span");
    badge.className = "lhai-nav__badge";
    badge.hidden = true;
    link.appendChild(badge);
  }

  const bid = getActiveCarBid(aggregate);
  const defaultHref = link.getAttribute("data-default-href") || "quote-detail.html";

  if (!bid) {
    link.href = defaultHref;
    badge.hidden = true;
    badge.textContent = "";
    badge.classList.remove("lhai-nav__badge--selected");
    link.removeAttribute("aria-label");
    return;
  }

  const resultsHref = quoteBidResultsHref(bid);
  link.href = resultsHref || defaultHref;

  const navBadge = resolveCustomerQuoteNavBadge(bid);
  const labelEl = link.querySelector(".lhai-nav__link-text");
  const labelText = (labelEl?.textContent || link.textContent || "견적").replace(/\s+\d+$/, "").trim();

  if (navBadge.selected) {
    badge.hidden = false;
    badge.textContent = navBadge.text;
    badge.classList.add("lhai-nav__badge--selected");
    link.setAttribute("aria-label", `${labelText}, 파트너 선택 완료`);
    return;
  }

  badge.classList.remove("lhai-nav__badge--selected");

  if (!navBadge.hidden && navBadge.text) {
    badge.hidden = false;
    badge.textContent = navBadge.text;
    link.setAttribute("aria-label", `${labelText}, 새 제안 ${navBadge.text}건`);
    return;
  }

  badge.hidden = true;
  badge.textContent = "";
  link.setAttribute("aria-label", labelText);
}

/** @param {ParentNode} [root] */
export async function refreshCustomerQuoteNavBadge(root = document) {
  const role = getCurrentRole();
  if (role === ROLES.PARTNER) return;

  const link = root.querySelector(QUOTE_NAV_SELECTOR);
  if (!link) return;

  try {
    const aggregate = await dashboardApi.getAggregate(getCustomerMessagingProfileId());
    applyCustomerQuoteNavFromAggregate(aggregate, root);
  } catch {
    applyCustomerQuoteNavFromAggregate({}, root);
  }
}

let quoteNavListenersBound = false;

export function bindCustomerQuoteNavRefreshListeners() {
  if (quoteNavListenersBound) return;
  quoteNavListenersBound = true;
  window.addEventListener("lhai:customer-bid-updated", () => {
    void refreshCustomerQuoteNavBadge();
  });
}
