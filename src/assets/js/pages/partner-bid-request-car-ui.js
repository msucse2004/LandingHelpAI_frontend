/**
 * @deprecated CAR_PURCHASE 전용 UI — generic PRODUCT_OFFER UI로 위임합니다.
 */
import { mountProductOfferBidUi } from "./partner-bid-request-product-ui.js";

/** @param {HTMLElement} root @param {Parameters<typeof mountProductOfferBidUi>[1]} ctx */
export function mountCarPurchaseBidUi(root, ctx) {
  mountProductOfferBidUi(root, ctx);
}
