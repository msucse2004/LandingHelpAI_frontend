/**
 * Canonical workflow_config_json domain (mirrors backend workflow_config_domain.py).
 * @module workflow-config-domain
 */

export const BIDDING_MODE_GENERAL = "GENERAL";
export const BIDDING_MODE_CAR_PURCHASE = "CAR_PURCHASE";

export const WT_MULTI_PARTNER_QUOTE_AND_SELECT = "MULTI_PARTNER_QUOTE_AND_SELECT";
export const PARTNER_TYPE_AUTO_DEALER = "AUTO_DEALER";

const BIDDING_WORKFLOW_TYPES = new Set([
  WT_MULTI_PARTNER_QUOTE_AND_SELECT,
  "PARTNER_BIDDING",
  "CUSTOMER_SELECTS_PARTNER",
]);

function norm(raw) {
  return String(raw ?? "").trim().toUpperCase();
}

/** @param {string | null | undefined} workflowType */
export function workflowTypeSupportsBidding(workflowType) {
  return BIDDING_WORKFLOW_TYPES.has(norm(workflowType));
}

/** @param {Record<string, unknown> | null | undefined} cfg */
export function multiPartnerTypeFromConfig(cfg) {
  if (!cfg || typeof cfg !== "object") return "";
  const mp = cfg.multi_partner;
  if (!mp || typeof mp !== "object" || Array.isArray(mp)) return "";
  return norm(/** @type {Record<string, unknown>} */ (mp).partner_type);
}

/** @param {Record<string, unknown> | null | undefined} cfg */
export function storedBiddingModeFromConfig(cfg) {
  if (!cfg || typeof cfg !== "object") return null;
  const bidding = cfg.bidding;
  if (!bidding || typeof bidding !== "object" || Array.isArray(bidding)) return null;
  const mode = norm(/** @type {Record<string, unknown>} */ (bidding).mode);
  if (mode === BIDDING_MODE_CAR_PURCHASE || mode === BIDDING_MODE_GENERAL) return mode;
  return null;
}

/**
 * Canonical bidding.mode from workflow_type + multi_partner.partner_type.
 * @param {string | null | undefined} workflowType
 * @param {Record<string, unknown> | null | undefined} workflowConfigJson
 */
export function canonicalBiddingMode(workflowType, workflowConfigJson) {
  const wt = norm(workflowType);
  if (!workflowTypeSupportsBidding(wt)) return BIDDING_MODE_GENERAL;
  const pt = multiPartnerTypeFromConfig(workflowConfigJson);
  if (wt === WT_MULTI_PARTNER_QUOTE_AND_SELECT && pt === PARTNER_TYPE_AUTO_DEALER) {
    return BIDDING_MODE_CAR_PURCHASE;
  }
  if ((wt === "PARTNER_BIDDING" || wt === "CUSTOMER_SELECTS_PARTNER") && pt === PARTNER_TYPE_AUTO_DEALER) {
    return BIDDING_MODE_CAR_PURCHASE;
  }
  return BIDDING_MODE_GENERAL;
}

/**
 * Merge canonical mode into bidding payload for admin save.
 * @param {string} workflowType
 * @param {Record<string, unknown>} workflowConfigJson
 */
export function applyCanonicalBiddingToWorkflowConfig(workflowType, workflowConfigJson) {
  const out =
    workflowConfigJson && typeof workflowConfigJson === "object"
      ? { ...workflowConfigJson }
      : {};
  if (!workflowTypeSupportsBidding(workflowType)) return out;
  const mode = canonicalBiddingMode(workflowType, out);
  const biddingRaw = out.bidding;
  const biddingIn =
    biddingRaw && typeof biddingRaw === "object" && !Array.isArray(biddingRaw)
      ? { .../** @type {Record<string, unknown>} */ (biddingRaw) }
      : {};
  out.bidding = { ...biddingIn, mode };
  return out;
}

/**
 * @param {string | null | undefined} workflowType
 * @param {Record<string, unknown> | null | undefined} workflowConfigJson
 */
export function resolveBiddingModeView(workflowType, workflowConfigJson) {
  const cfg = workflowConfigJson && typeof workflowConfigJson === "object" ? workflowConfigJson : {};
  const stored = storedBiddingModeFromConfig(cfg);
  const canonical = canonicalBiddingMode(workflowType, cfg);
  return {
    stored_bidding_mode: stored || "—",
    canonical_bidding_mode: canonical,
    multi_partner_partner_type: multiPartnerTypeFromConfig(cfg) || "—",
    workflow_type: norm(workflowType) || "—",
  };
}
