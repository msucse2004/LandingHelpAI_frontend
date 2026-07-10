import {
  getSelectedServicesFromQuote,
  normalizeDeliveryModeKey,
  readQuotePricingMeta,
  resolveServiceLineAmount,
  roundMoney2,
} from "./quote-detail-pricing-logic.js";

const CAR_KEYWORD_RE =
  /(?:자동차|차량|차\s*구|구입\s*조|car|auto|vehicle|automobile|used\s*car|new\s*car|차량\s*구)/i;
const PHONE_KEYWORD_RE =
  /(?:전화|휴대|phone|mobile|cell|통신|번호\s*개|개통|sim|carrier|wireless|telco)/i;

const ADMIN_FEE_LABEL_RE = /^(admin\s*fee|administration\s*fee|admin\s*fee\s*adjustment)$/i;
const GENERIC_LINE_LABEL_RE =
  /^(base\s*service|basic\s*service|service\s*package|package|add[-\s]?on|addon|option|부가|옵션|기본\s*서비스|패키지)/i;

export function looksLikeUuid(str) {
  const s = String(str || "").trim();
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s);
}

/** @param {string} text */
export function isAdminFeeLineLabel(text) {
  const s = String(text || "").trim();
  if (!s) return false;
  return ADMIN_FEE_LABEL_RE.test(s) || /\badmin\s*fee\b/i.test(s);
}

/**
 * @param {string} serviceTitle
 * @returns {"phone" | "car" | "default"}
 */
export function detectServiceRowHint(serviceTitle) {
  const t = String(serviceTitle || "").trim();
  if (!t) return "default";
  if (PHONE_KEYWORD_RE.test(t)) return "phone";
  if (CAR_KEYWORD_RE.test(t)) return "car";
  return "default";
}

/**
 * @param {string} description
 * @param {string} [packageName]
 */
export function customerFriendlyLineLabel(description, packageName = "") {
  const raw = String(description || "").trim();
  if (!raw) return "";
  if (isAdminFeeLineLabel(raw)) return "";
  const pkg = String(packageName || "").trim();
  if (GENERIC_LINE_LABEL_RE.test(raw) && pkg) return pkg;
  if (/\badmin\s*fee\b/i.test(raw)) return "";
  return raw.replace(/\badmin\s*fee\b/gi, "").trim() || raw;
}

/**
 * @param {Array<Record<string, unknown>>} services
 * @param {string} serviceItemId
 */
function matchServiceTitleById(services, serviceItemId) {
  const sid = String(serviceItemId || "").trim();
  if (!sid) return "";
  for (const s of services) {
    if (!s || typeof s !== "object") continue;
    if (String(s.id || "").trim() !== sid) continue;
    const tit = String(s.display_title || s.title || "").trim();
    if (tit && !looksLikeUuid(tit)) return tit;
  }
  return "";
}

/**
 * @param {Array<Record<string, unknown>>} items
 * @param {string} serviceItemId
 */
function resolveTitleFromItems(serviceItemId, items) {
  const sid = String(serviceItemId || "").trim();
  if (!sid || !Array.isArray(items)) return "";
  for (const it of items) {
    if (!it || typeof it !== "object") continue;
    if (String(it.service_item_id || "").trim() !== sid) continue;
    const d = customerFriendlyLineLabel(String(it.display_description || it.description || "").trim());
    if (d) return d;
  }
  return "";
}

/**
 * @param {Record<string, unknown>} invoice
 * @param {Record<string, unknown>|null | undefined} quote
 */
export function buildInvoiceServiceRows(invoice, quote) {
  const currency = String(invoice?.currency || quote?.currency || "USD").trim().toUpperCase() || "USD";
  /** @type {Array<{ type: string, title: string, deliveryModeKey: string, amount: number, hintKey: string }>} */
  const rows = [];

  if (quote && typeof quote === "object") {
    const services = getSelectedServicesFromQuote(quote);
    const { serviceUnitPrices, adminFee } = readQuotePricingMeta(quote);
    const items = Array.isArray(quote.items) ? quote.items : [];
    const pkg = String(invoice?.display_service_name || invoice?.service_name || "").trim();

    for (const s of services) {
      const id = String(s.id || "").trim();
      let title = String(s.display_title || s.title || "").trim();
      if (!title || looksLikeUuid(title)) {
        title = matchServiceTitleById(services, id) || resolveTitleFromItems(id, items);
      }
      if (!title || looksLikeUuid(title)) {
        title = pkg || "";
      }
      if (!title) continue;

      rows.push({
        type: "service",
        title,
        deliveryModeKey: normalizeDeliveryModeKey(s.delivery_mode),
        amount: resolveServiceLineAmount(id, serviceUnitPrices, items),
        hintKey: detectServiceRowHint(title),
      });
    }

    if (adminFee != null && adminFee > 0.005) {
      rows.push({
        type: "admin_fee",
        title: "",
        deliveryModeKey: "general",
        amount: roundMoney2(adminFee),
        hintKey: "default",
      });
    }

    if (!rows.length && items.length) {
      let adminFromItems = 0;
      for (const it of items) {
        if (!it || typeof it !== "object") continue;
        const desc = String(it.display_description || it.description || "").trim();
        const lineTotal = roundMoney2(Number(it.line_total) || 0);
        if (isAdminFeeLineLabel(desc)) {
          adminFromItems = Math.max(adminFromItems, lineTotal);
          continue;
        }
        const sid = String(it.service_item_id || "").trim();
        const title =
          matchServiceTitleById(services, sid) || customerFriendlyLineLabel(desc, pkg) || pkg || desc;
        if (!title || isAdminFeeLineLabel(title)) continue;
        rows.push({
          type: "service",
          title,
          deliveryModeKey: "general",
          amount: lineTotal,
          hintKey: detectServiceRowHint(title),
        });
      }
      if (adminFromItems > 0.005) {
        rows.push({
          type: "admin_fee",
          title: "",
          deliveryModeKey: "general",
          amount: adminFromItems,
          hintKey: "default",
        });
      }
    }
  }

  if (!rows.length) {
    const pkg = String(invoice?.display_service_name || invoice?.service_name || "").trim();
    if (pkg) {
      const amt = roundMoney2(Number(invoice?.amount_due) || 0);
      rows.push({
        type: "service",
        title: pkg,
        deliveryModeKey: "general",
        amount: amt,
        hintKey: detectServiceRowHint(pkg),
      });
    }
  }

  return {
    currency,
    rows,
    empty: rows.length === 0,
  };
}
