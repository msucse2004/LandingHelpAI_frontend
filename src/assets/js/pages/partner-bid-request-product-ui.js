/**
 * Generic PRODUCT_OFFER partner bid request UI.
 */

import {
  assignOfferIds,
  buildProductSubmitPayload,
  createEmptyProductOffer,
  endedStateMessage,
  formatDeadlineCountdown,
  formatRankSummaryLabel,
  offersFromIncludedItems,
  partnerBidStatusLabel,
  resolvePartnerBidEditable,
  validateProductOffersForSubmit,
} from "./partner-bid-request-product-logic.js";
import { formatMessageTimestamp } from "../core/utils.js";

function escHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** @param {Record<string, unknown> | null | undefined} intake */
function renderIntakeAnswersHtml(intake) {
  const answers = intake && Array.isArray(intake.answers) ? intake.answers : [];
  if (!answers.length) {
    return '<p class="u-text-muted">??��????��??ũ ????????��??��.</p>';
  }
  return `<dl class="lhai-par-prod__intake-dl">${answers
    .map((row) => {
      const r = row && typeof row === "object" ? /** @type {Record<string, unknown>} */ (row) : {};
      const label = escHtml(String(r.label || "??));
      const val = escHtml(String(r.value || "??));
      return `<div class="lhai-par-prod__intake-row"><dt>${label}</dt><dd>${val}</dd></div>`;
    })
    .join("")}</dl>`;
}

/** @param {Record<string, unknown>} photo @param {number} index @param {boolean} disabled */
function renderPhotoRow(photo, index, disabled) {
  const p = photo && typeof photo === "object" ? photo : {};
  const dis = disabled ? "disabled" : "";
  return `<div class="lhai-par-prod__photo-row" data-photo-index="${index}">
    <div class="lhai-par-prod__field-row">
      <label>URL</label>
      <input type="url" name="photo_url" placeholder="https://..." value="${escHtml(p.url || "")}" ${dis} />
    </div>
    <div class="lhai-par-prod__grid-2">
      <div class="lhai-par-prod__field-row">
        <label>??��??URL</label>
        <input type="url" name="photo_thumbnail_url" value="${escHtml(p.thumbnail_url || "")}" ${dis} />
      </div>
      <div class="lhai-par-prod__field-row">
        <label>Caption</label>
        <input type="text" name="photo_caption" value="${escHtml(p.caption || "")}" ${dis} />
      </div>
    </div>
    <button type="button" class="lhai-button lhai-button--ghost lhai-par-prod__photo-remove" data-action="remove-photo" ${dis}>���� ����</button>
  </div>`;
}

/** @param {Record<string, unknown>} offer @param {number} index @param {boolean} disabled */
function renderOfferPanel(offer, index, disabled) {
  const dis = disabled ? "disabled" : "";
  const photos = Array.isArray(offer.photos) ? offer.photos : [];
  const photosHtml = photos.length
    ? photos.map((p, i) => renderPhotoRow(p, i, disabled)).join("")
    : `<p class="u-text-muted lhai-par-prod__photo-empty">??��????��????��??��.</p>`;

  return `<div class="lhai-par-prod__offer-panel" data-offer-index="${index}">
    <div class="lhai-par-prod__field-row">
      <label>??ǰ??<span class="u-text-muted">(??��)</span></label>
      <input type="text" name="title" required maxlength="256" value="${escHtml(offer.title || "")}" ${dis} />
    </div>
    <div class="lhai-par-prod__field-row">
      <label>??��</label>
      <textarea name="description" rows="2" ${dis}>${escHtml(offer.description || "")}</textarea>
    </div>
    <div class="lhai-par-prod__grid-2">
      <div class="lhai-par-prod__field-row">
        <label>ī�װ���</label>
        <input type="text" name="product_category" value="${escHtml(offer.product_category || "")}" ${dis} />
      </div>
      <div class="lhai-par-prod__field-row">
        <label>??�� �Ѿ� <span class="u-text-muted">(??��)</span></label>
        <input type="number" name="estimated_total" min="0" step="0.01" value="${escHtml(offer.estimated_total ?? "")}" ${dis} />
      </div>
    </div>
    <div class="lhai-par-prod__grid-3">
      <div class="lhai-par-prod__field-row">
        <label>��??price_amount)</label>
        <input type="number" name="price_amount" min="0" step="0.01" value="${escHtml(offer.price_amount ?? "")}" ${dis} />
      </div>
      <div class="lhai-par-prod__field-row">
        <label>??��??fees)</label>
        <input type="number" name="fees" min="0" step="0.01" value="${escHtml(offer.fees ?? "")}" ${dis} />
      </div>
      <div class="lhai-par-prod__field-row">
        <label>??ȭ</label>
        <select name="currency" ${dis}>
          ${["USD", "KRW", "EUR"]
            .map((c) => {
              const cur = String(offer.currency || "USD").toUpperCase();
              return `<option value="${c}"${cur === c ? " selected" : ""}>${c}</option>`;
            })
            .join("")}
        </select>
      </div>
    </div>
    <div class="lhai-par-prod__grid-2">
      <div class="lhai-par-prod__field-row">
        <label>��????��</label>
        <input type="text" name="available_timeline" value="${escHtml(offer.available_timeline || "")}" ${dis} />
      </div>
      <div class="lhai-par-prod__field-row">
        <label>??ġ</label>
        <input type="text" name="location" value="${escHtml(offer.location || "")}" ${dis} />
      </div>
    </div>
    <div class="lhai-par-prod__field-row">
      <label>���� �޽��� (??��??</label>
      <textarea name="message_to_customer" rows="2" ${dis}>${escHtml(offer.message_to_customer || "")}</textarea>
    </div>
    <div class="lhai-par-prod__photos">
      <div class="lhai-par-prod__photos-head">
        <h4 class="lhai-par-prod__subhead">??�� (URL)</h4>
        <button type="button" class="lhai-button lhai-button--ghost" data-action="add-photo" ${dis}>+ ??�� URL</button>
      </div>
      <div class="lhai-par-prod__photo-list">${photosHtml}</div>
      <p class="lhai-par-prod__hint">MVP: URL ??��. ���� ??�� ??��??API??��ü ��??��??��.</p>
    </div>
    <div class="lhai-par-prod__field-row">
      <label>??��(attributes) ??JSON ��ü</label>
      <textarea name="attributes_json" rows="4" placeholder='{"year":2021,"make":"Toyota","model":"Camry"}' ${dis}>${escHtml(offer.attributes_json || "")}</textarea>
      <p class="lhai-par-prod__hint">?? year, make, model, mileage, condition</p>
    </div>
  </div>`;
}

/**
 * @param {HTMLElement} root
 * @param {{
 *   data: Record<string, unknown>,
 *   expiresAtQuery: string,
 *   requestStatusQuery: string,
 *   maxOffers?: number,
 *   onDetailUpdate: (next: Record<string, unknown>) => void,
 *   submitFn: (payload: Record<string, unknown>) => Promise<Record<string, unknown>>,
 *   openMessagesFn?: () => void,
 * }} ctx
 */
export function mountProductOfferBidUi(root, ctx) {
  const data = ctx.data;
  const svc = data.service && typeof data.service === "object" ? data.service : {};
  const cust = data.customer_summary && typeof data.customer_summary === "object" ? data.customer_summary : {};
  const intake = data.intake && typeof data.intake === "object" ? data.intake : {};
  const bid = data.bid && typeof data.bid === "object" ? data.bid : {};
  const bidStatus = String(bid.status ?? "").trim().toUpperCase();
  const reqStatus = String(ctx.requestStatusQuery || data.bid_request_status || "OPEN")
    .trim()
    .toUpperCase();
  const editable = resolvePartnerBidEditable({
    bidStatus,
    requestStatus: reqStatus,
    expiresAt: ctx.expiresAtQuery,
  });
  const maxOffers = Math.max(1, Number(ctx.maxOffers) || 3);
  const endedMsg = endedStateMessage(bid, reqStatus);
  const rankSummary =
    data.rank_summary && typeof data.rank_summary === "object" ? data.rank_summary : null;
  const lastViewRank =
    data.last_view_rank_summary && typeof data.last_view_rank_summary === "object"
      ? data.last_view_rank_summary
      : null;
  const rankLabel = formatRankSummaryLabel(rankSummary);
  const lastViewLabel =
    lastViewRank && lastViewRank.basis !== rankSummary?.basis
      ? formatRankSummaryLabel(lastViewRank, { prefix: "�ֱ� ���� ȭ�� ����" })
      : "";

  let offers = offersFromIncludedItems(bid.included_items);
  if (!offers.length) offers = [createEmptyProductOffer()];
  let activeIndex = 0;

  const svcName = String(svc.name || "���� ??û");
  root.innerHTML = `
    <section class="lhai-card lhai-par-prod__hero">
      <h2 class="lhai-card__title">${escHtml(svcName)}</h2>
      <dl class="lhai-par-prod__summary-dl">
        <div><dt>??û ??��</dt><dd id="pbrProdReqStatus">${escHtml(partnerBidStatusLabel(bidStatus, reqStatus))}</dd></div>
        <div><dt>??�� ??��</dt><dd>${escHtml(bidStatus === "SUBMITTED" ? "??��?? : "����??)}</dd></div>
        <div><dt>����</dt><dd id="pbrProdDeadline">${escHtml(formatDeadlineCountdown(ctx.expiresAtQuery))}</dd></div>
        <div><dt>����</dt><dd>${escHtml(String(cust.display_name || "??))}</dd></div>
        <div><dt>��??/dt><dd>${escHtml(String(cust.location || svc.location || "??))}</dd></div>
      </dl>
      <div class="lhai-par-prod__rank-card" id="pbrProdRankCard" hidden>
        <p class="lhai-par-prod__rank" id="pbrProdRank"></p>
        <p class="lhai-par-prod__rank-hint">���� ���� ���� �����̸�, ������ ���� ������ �������� �ʽ��ϴ�.</p>
        <p class="lhai-par-prod__rank lhai-par-prod__rank--secondary" id="pbrProdLastViewRank" hidden></p>
      </div>
    </section>

    <div id="pbrProdSelectedBanner" class="lhai-par-bid__selected-banner" hidden>
      <p><strong>Customer selected your offer. Open conversation.</strong></p>
      <div class="lhai-par-bid__actions">
        <button type="button" class="lhai-button lhai-button--primary" id="pbrProdOpenMessages">Open conversation</button>
      </div>
    </div>
    <div id="pbrProdClosedBanner" class="lhai-par-bid__closed-banner" hidden></div>

    <section class="lhai-card">
      <h2 class="lhai-card__title">���� ??û (??��??ũ)</h2>
      <p class="lhai-par-prod__hint">??��: ${escHtml(formatMessageTimestamp(intake.submitted_at))}</p>
      ${renderIntakeAnswersHtml(intake)}
    </section>

    <section class="lhai-card" id="pbrProdEditorSection">
      <div class="lhai-par-prod__editor-head">
        <h2 class="lhai-card__title">??ǰ ??��</h2>
        <button type="button" class="lhai-button lhai-button--secondary" id="pbrProdAddOffer" ${editable ? "" : "disabled"}>+ ??�� ��??</button>
      </div>
      <div class="lhai-par-prod__offer-tabs" id="pbrProdOfferTabs"></div>
      <form class="lhai-par-prod__form" id="pbrProdForm" novalidate>
        <div id="pbrProdOfferPanels"></div>
        <div class="lhai-par-prod__field-row">
          <label>���� ??ü �޽��� (??��)</label>
          <textarea id="pbrProdBidMessage" name="bid_message" rows="3" ${editable ? "" : "disabled"}>${escHtml(String(bid.message_to_customer || ""))}</textarea>
        </div>
        <p class="lhai-par-bid__form-error" id="pbrProdFormError" role="alert" hidden></p>
        <div class="lhai-par-bid__actions">
          <button type="submit" class="lhai-button lhai-button--primary" id="pbrProdSubmit" ${editable ? "" : "disabled"}>${bidStatus === "SUBMITTED" ? "??�� ??�� ??��" : "??�� ??��"}</button>
        </div>
      </form>
      <div class="lhai-par-bid__msg-gate" id="pbrProdMsgGate" hidden>����????��??�� �޽���????��??????��??��.</div>
    </section>`;

  const selectedBanner = root.querySelector("#pbrProdSelectedBanner");
  const closedBanner = root.querySelector("#pbrProdClosedBanner");
  const form = root.querySelector("#pbrProdForm");
  const panelsEl = root.querySelector("#pbrProdOfferPanels");
  const tabsEl = root.querySelector("#pbrProdOfferTabs");
  const formErr = root.querySelector("#pbrProdFormError");
  const rankCard = root.querySelector("#pbrProdRankCard");
  const rankEl = root.querySelector("#pbrProdRank");
  const lastViewRankEl = root.querySelector("#pbrProdLastViewRank");

  if (bidStatus === "SELECTED" && selectedBanner instanceof HTMLElement) {
    selectedBanner.hidden = false;
  } else if (endedMsg && closedBanner instanceof HTMLElement) {
    closedBanner.hidden = false;
    closedBanner.innerHTML = `<p>${escHtml(endedMsg)}</p>`;
  }

  if (rankLabel && rankCard instanceof HTMLElement && rankEl instanceof HTMLElement) {
    rankCard.hidden = false;
    rankEl.textContent = rankLabel;
    if (lastViewLabel && lastViewRankEl instanceof HTMLElement) {
      lastViewRankEl.hidden = false;
      lastViewRankEl.textContent = lastViewLabel;
    }
  }

  function renderTabsAndPanels() {
    if (!(tabsEl instanceof HTMLElement) || !(panelsEl instanceof HTMLElement)) return;
    offers = assignOfferIds(offers);
    if (activeIndex >= offers.length) activeIndex = Math.max(0, offers.length - 1);
    tabsEl.innerHTML = offers
      .map((o, i) => {
        const title = String(o.title || "").trim() || `??�� ${i + 1}`;
        const cls = i === activeIndex ? " lhai-par-prod__tab is-active" : " lhai-par-prod__tab";
        return `<button type="button" class="${cls.trim()}" data-tab="${i}">${escHtml(title)}</button>`;
      })
      .join("");
    panelsEl.innerHTML = renderOfferPanel(offers[activeIndex], activeIndex, !editable);
  }

  /** @param {HTMLElement} panel */
  function readOfferFromPanel(panel) {
    const idx = activeIndex;
    const prev = offers[idx] && typeof offers[idx] === "object" ? { ...offers[idx] } : createEmptyProductOffer();
    const q = (name) => panel.querySelector(`[name="${name}"]`);
    const titleEl = q("title");
    if (titleEl instanceof HTMLInputElement) prev.title = titleEl.value;
    const descEl = q("description");
    if (descEl instanceof HTMLTextAreaElement) prev.description = descEl.value;
    const catEl = q("product_category");
    if (catEl instanceof HTMLInputElement) prev.product_category = catEl.value;
    const totalEl = q("estimated_total");
    if (totalEl instanceof HTMLInputElement) prev.estimated_total = totalEl.value;
    const paEl = q("price_amount");
    if (paEl instanceof HTMLInputElement) prev.price_amount = paEl.value;
    const feesEl = q("fees");
    if (feesEl instanceof HTMLInputElement) prev.fees = feesEl.value;
    const curEl = q("currency");
    if (curEl instanceof HTMLSelectElement) prev.currency = curEl.value;
    const tlEl = q("available_timeline");
    if (tlEl instanceof HTMLInputElement) prev.available_timeline = tlEl.value;
    const locEl = q("location");
    if (locEl instanceof HTMLInputElement) prev.location = locEl.value;
    const msgEl = q("message_to_customer");
    if (msgEl instanceof HTMLTextAreaElement) prev.message_to_customer = msgEl.value;
    const attrEl = q("attributes_json");
    if (attrEl instanceof HTMLTextAreaElement) prev.attributes_json = attrEl.value;
    const photoRows = panel.querySelectorAll(".lhai-par-prod__photo-row");
    prev.photos = Array.from(photoRows)
      .map((row) => {
        const urlEl = row.querySelector('[name="photo_url"]');
        const thumbEl = row.querySelector('[name="photo_thumbnail_url"]');
        const capEl = row.querySelector('[name="photo_caption"]');
        const url = urlEl instanceof HTMLInputElement ? urlEl.value.trim() : "";
        if (!url) return null;
        const out = { url };
        const thumb = thumbEl instanceof HTMLInputElement ? thumbEl.value.trim() : "";
        if (thumb) out.thumbnail_url = thumb;
        const cap = capEl instanceof HTMLInputElement ? capEl.value.trim() : "";
        if (cap) out.caption = cap;
        return out;
      })
      .filter(Boolean);
    offers[idx] = prev;
  }

  function persistActivePanel() {
    const panel = panelsEl?.querySelector(".lhai-par-prod__offer-panel");
    if (panel instanceof HTMLElement) readOfferFromPanel(panel);
  }

  renderTabsAndPanels();

  tabsEl?.addEventListener("click", (ev) => {
    const t = ev.target;
    if (!(t instanceof HTMLElement)) return;
    const tab = t.closest("[data-tab]");
    if (!(tab instanceof HTMLElement)) return;
    persistActivePanel();
    activeIndex = Number(tab.getAttribute("data-tab") || "0");
    renderTabsAndPanels();
  });

  root.querySelector("#pbrProdAddOffer")?.addEventListener("click", () => {
    if (!editable) return;
    persistActivePanel();
    if (offers.length >= maxOffers) {
      window.alert(`??��?? ��?? ${maxOffers}������ ��????????��??��.`);
      return;
    }
    offers.push(createEmptyProductOffer());
    activeIndex = offers.length - 1;
    renderTabsAndPanels();
  });

  panelsEl?.addEventListener("click", (ev) => {
    const t = ev.target;
    if (!(t instanceof HTMLElement) || !editable) return;
    const panel = t.closest(".lhai-par-prod__offer-panel");
    if (!(panel instanceof HTMLElement)) return;
    if (t.closest('[data-action="add-photo"]')) {
      readOfferFromPanel(panel);
      const idx = activeIndex;
      const list = Array.isArray(offers[idx].photos) ? [...offers[idx].photos] : [];
      list.push({ url: "", thumbnail_url: "", caption: "" });
      offers[idx].photos = list;
      renderTabsAndPanels();
      return;
    }
    if (t.closest('[data-action="remove-photo"]')) {
      readOfferFromPanel(panel);
      const row = t.closest(".lhai-par-prod__photo-row");
      const pi = Number(row?.getAttribute("data-photo-index") ?? "-1");
      const idx = activeIndex;
      const list = Array.isArray(offers[idx].photos) ? [...offers[idx].photos] : [];
      if (pi >= 0) list.splice(pi, 1);
      offers[idx].photos = list;
      renderTabsAndPanels();
    }
  });

  root.querySelector("#pbrProdOpenMessages")?.addEventListener("click", () => {
    if (typeof ctx.openMessagesFn === "function") ctx.openMessagesFn();
  });

  form?.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    if (!editable) return;
    if (formErr instanceof HTMLElement) {
      formErr.hidden = true;
      formErr.textContent = "";
    }
    persistActivePanel();
    const verr = validateProductOffersForSubmit(offers, {
      maxOffers,
      requiresOfferPhotos: ctx.requiresOfferPhotos === true,
    });
    if (verr) {
      if (formErr instanceof HTMLElement) {
        formErr.hidden = false;
        formErr.textContent = verr;
      }
      return;
    }
    const bidMsgEl = root.querySelector("#pbrProdBidMessage");
    const bidMsg = bidMsgEl instanceof HTMLTextAreaElement ? bidMsgEl.value : "";
    const payload = buildProductSubmitPayload(offers, { messageToCustomer: bidMsg });
    const submitBtn = root.querySelector("#pbrProdSubmit");
    if (submitBtn instanceof HTMLButtonElement) submitBtn.disabled = true;
    try {
      const next = await ctx.submitFn(payload);
      ctx.onDetailUpdate(next);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "??��????��??��??��.";
      if (formErr instanceof HTMLElement) {
        formErr.hidden = false;
        formErr.textContent = msg;
      }
    } finally {
      if (submitBtn instanceof HTMLButtonElement) submitBtn.disabled = false;
    }
  });
}
