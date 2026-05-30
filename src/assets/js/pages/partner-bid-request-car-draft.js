/**
 * In-memory partner CAR offer drafts (survive background detail refresh while typing).
 * Keyed by bid_request_id for the current browser tab session only.
 */

/** @type {Map<string, { offers: unknown[], activeIdx: number, globalMessage: string, dirty: boolean, updatedAt: number }>} */
const drafts = new Map();

/** @param {unknown} value */
function cloneJson(value) {
  return JSON.parse(JSON.stringify(value ?? null));
}

/** @param {string} bidRequestId */
export function isPartnerCarOfferDraftDirty(bidRequestId) {
  const id = String(bidRequestId || "").trim();
  if (!id) return false;
  const row = drafts.get(id);
  return Boolean(row?.dirty);
}

/**
 * @param {string} bidRequestId
 * @param {{ offers: unknown[], activeIdx: number, globalMessage?: string, dirty?: boolean }} payload
 */
export function savePartnerCarOfferDraft(bidRequestId, payload) {
  const id = String(bidRequestId || "").trim();
  if (!id) return;
  drafts.set(id, {
    offers: cloneJson(payload.offers || []),
    activeIdx: Number(payload.activeIdx) || 0,
    globalMessage: String(payload.globalMessage ?? ""),
    dirty: payload.dirty !== false,
    updatedAt: Date.now(),
  });
}

/** @param {string} bidRequestId */
export function loadPartnerCarOfferDraft(bidRequestId) {
  const id = String(bidRequestId || "").trim();
  if (!id) return null;
  const row = drafts.get(id);
  if (!row) return null;
  return {
    offers: cloneJson(row.offers),
    activeIdx: row.activeIdx,
    globalMessage: row.globalMessage,
    dirty: row.dirty,
  };
}

/** @param {string} bidRequestId */
export function clearPartnerCarOfferDraft(bidRequestId) {
  const id = String(bidRequestId || "").trim();
  if (!id) return;
  drafts.delete(id);
}
