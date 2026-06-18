/**
 * Global header toast decisions (message.created vs bid.updated) — pure, testable.
 */
import { bidUpdatedToastAllowed } from "./realtime-toast-dedupe.js";

/**
 * @param {{
 *   isMessagesPage?: boolean;
 *   isCustomerBidResultsPage?: boolean;
 *   documentVisible?: boolean;
 *   isOwnActor?: boolean;
 * }} ctx
 * @returns {{ show: boolean; suppressReason: string | null }}
 */
export function evaluateHeaderMessageToastDecision(ctx) {
  if (ctx.isMessagesPage) {
    return { show: false, suppressReason: "messages_page" };
  }
  if (ctx.isCustomerBidResultsPage) {
    return { show: false, suppressReason: "bid_results_page" };
  }
  if (ctx.documentVisible === false) {
    return { show: false, suppressReason: "document_not_visible" };
  }
  if (ctx.isOwnActor) {
    return { show: false, suppressReason: "own_actor" };
  }
  return { show: true, suppressReason: null };
}

/**
 * @param {{
 *   isMessagesPage?: boolean;
 *   isCustomerBidResultsPage?: boolean;
 *   isCustomerDashboardPage?: boolean;
 *   isCustomerRole?: boolean;
 *   documentVisible?: boolean;
 *   eventKind?: string | null;
 * }} ctx
 * @returns {{ show: boolean; suppressReason: string | null }}
 */
export function evaluateHeaderBidToastDecision(ctx) {
  if (!ctx.isCustomerRole) {
    return { show: false, suppressReason: "not_customer_role" };
  }
  const onDedicatedPage =
    Boolean(ctx.isMessagesPage) ||
    Boolean(ctx.isCustomerBidResultsPage) ||
    Boolean(ctx.isCustomerDashboardPage);
  if (onDedicatedPage) {
    return { show: false, suppressReason: "dedicated_bid_page" };
  }
  const ek = String(ctx.eventKind || "").trim().toUpperCase();
  if (!bidUpdatedToastAllowed(ek)) {
    return { show: false, suppressReason: "message_toast_owns_selection" };
  }
  if (ctx.documentVisible === false) {
    return { show: false, suppressReason: "document_not_visible" };
  }
  return { show: true, suppressReason: null };
}

/**
 * @param {{
 *   messageToastShown?: boolean;
 *   bidToastAcquireOk?: boolean;
 *   eventKind?: string | null;
 * }} ctx
 * @returns {{ userFacingToastCount: number; primary: "message" | "bid" | null }}
 */
export function countUserFacingToastsForSelectionEvent(ctx) {
  const ek = String(ctx.eventKind || "").trim().toUpperCase();
  const messageShown = Boolean(ctx.messageToastShown);
  const bidAllowed = bidUpdatedToastAllowed(ek);
  const bidShown = bidAllowed && Boolean(ctx.bidToastAcquireOk);
  let count = 0;
  let primary = null;
  if (messageShown) {
    count += 1;
    primary = "message";
  }
  if (bidShown) {
    count += 1;
    primary = primary || "bid";
  }
  return { userFacingToastCount: count, primary };
}
