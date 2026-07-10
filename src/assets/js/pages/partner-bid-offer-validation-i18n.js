/**
 * Localize partner bid offer validation issues returned from pure logic modules.
 * @module pages/partner-bid-offer-validation-i18n
 */

import { t } from "../core/i18n-client.js";
import { localizedStatus } from "../core/i18n-dynamic.js";

/** @typedef {{ code: string, params?: Record<string, string | number> }} PartnerOfferValidationIssue */

/** @type {Record<string, [string, string]>} */
const CAR_OFFER_VALIDATION_I18N = {
  upload_in_progress: [
    "common.dialog.partner.car.validation.upload_in_progress",
    "Please wait until photo uploads finish.",
  ],
  min_offers: [
    "common.dialog.partner.car.validation.min_offers",
    "Add at least one vehicle proposal.",
  ],
  alternatives_not_allowed: [
    "common.dialog.partner.car.validation.alternatives_not_allowed",
    "Alternative vehicle proposals are not allowed for this request.",
  ],
  year_required: [
    "common.dialog.partner.car.validation.year_required",
    "Proposal {offer}: Enter model year (1980 or later).",
  ],
  make_model_required: [
    "common.dialog.partner.car.validation.make_model_required",
    "Proposal {offer}: Enter make and model.",
  ],
  mileage_required: [
    "common.dialog.partner.car.validation.mileage_required",
    "Proposal {offer}: Enter mileage.",
  ],
  estimated_total_required: [
    "common.dialog.partner.car.validation.estimated_total_required",
    "Proposal {offer}: Enter estimated total or fill in price fields.",
  ],
  timeline_required: [
    "common.dialog.partner.car.validation.timeline_required",
    "Proposal {offer}: Enter when this can proceed.",
  ],
  alternative_reason_required: [
    "common.dialog.partner.car.validation.alternative_reason_required",
    "Proposal {offer}: Enter a reason for this alternative vehicle.",
  ],
  photos_max: [
    "common.dialog.partner.car.validation.photos_max",
    "Proposal {offer}: Up to {max} photos allowed.",
  ],
  photos_min: [
    "common.dialog.partner.car.validation.photos_min",
    "Proposal {offer}: At least one vehicle photo is required.",
  ],
};

/** @type {Record<string, [string, string]>} */
const PRODUCT_OFFER_VALIDATION_I18N = {
  min_offers: [
    "common.dialog.partner.product.validation.min_offers",
    "Add at least one proposal.",
  ],
  title_required: [
    "common.dialog.partner.product.validation.title_required",
    "Proposal {offer}: Enter a product title.",
  ],
  estimated_total_required: [
    "common.dialog.partner.product.validation.estimated_total_required",
    "Proposal {offer}: Enter estimated total.",
  ],
  price_amount_invalid: [
    "common.dialog.partner.product.validation.price_amount_invalid",
    "Proposal {offer}: price_amount format is invalid.",
  ],
  fees_invalid: [
    "common.dialog.partner.product.validation.fees_invalid",
    "Proposal {offer}: fees format is invalid.",
  ],
  attributes_json_invalid: [
    "common.dialog.partner.product.validation.attributes_json_invalid",
    "Proposal {offer}: attributes JSON is invalid.",
  ],
  attributes_not_object: [
    "common.dialog.partner.product.validation.attributes_not_object",
    "Proposal {offer}: attributes must be a JSON object.",
  ],
  photo_url_invalid: [
    "common.dialog.partner.product.validation.photo_url_invalid",
    "Proposal {offer}: Photo URLs must start with http:// or https://",
  ],
  photos_min: [
    "common.dialog.partner.product.validation.photos_min",
    "Proposal {offer}: At least one photo is required.",
  ],
};

/**
 * @param {Record<string, [string, string]>} map
 * @param {PartnerOfferValidationIssue | string | null | undefined} issue
 * @returns {string}
 */
function localizeValidationIssue(map, issue) {
  if (!issue) return "";
  if (typeof issue === "string") return issue;
  const spec = map[String(issue.code || "")];
  if (!spec) return String(issue.code || "");
  const [key, fallback] = spec;
  if (issue.params && Object.keys(issue.params).length) {
    return localizedStatus(key, fallback, issue.params);
  }
  return t(key, fallback);
}

/** @param {PartnerOfferValidationIssue | string | null | undefined} issue */
export function localizeCarOfferValidationError(issue) {
  return localizeValidationIssue(CAR_OFFER_VALIDATION_I18N, issue);
}

/** @param {PartnerOfferValidationIssue | string | null | undefined} issue */
export function localizeProductOfferValidationError(issue) {
  return localizeValidationIssue(PRODUCT_OFFER_VALIDATION_I18N, issue);
}
