/**
 * CAR_PURCHASE partner bid request UI (DOM render + interactions).
 */

import {
  buildCarSubmitPayload,
  cloneOffer,
  computeOfferEstimatedTotal,
  createEmptyCarOffer,
  formatDeadlineFromBidRequestBlock,
  formatMoney,
  offersFromIncludedItems,
  partnerHasCarPurchaseCapability,
  resolvePartnerBidEditable,
  validateCarOffersForSubmit,
  vehicleRequestSummaryLines,
} from "./partner-bid-request-car-logic.js";

function escHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function readPartnerCapabilities() {
  try {
    const raw = sessionStorage.getItem("lhai_partner_bidding_capabilities");
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/** @param {Record<string, unknown>} data */
function normalizeBidStatus(data) {
  const bid = data.bid && typeof data.bid === "object" ? data.bid : {};
  return String(bid.status ?? "").trim().toUpperCase();
}

/** @param {Record<string, unknown>} vr @param {string} currency */
function renderVehicleCard(vr, currency) {
  const idx = vr.request_index ?? "";
  const opts = Array.isArray(vr.required_options) ? vr.required_options.join(", ") : "";
  const lines = [
    `<p class="lhai-par-car__vreq-title">${escHtml(vr.label || `요청 ${idx}`)}</p>`,
    `<p class="lhai-par-car__vreq-model">${escHtml([vr.make, vr.model].filter(Boolean).join(" ") || "—")}</p>`,
    `<p class="lhai-par-car__vreq-meta">${escHtml(vehicleRequestSummaryLines(vr))}</p>`,
  ];
  if (vr.budget_max != null) {
    lines.push(`<p class="lhai-par-car__vreq-meta">예산: ${escHtml(formatMoney(vr.budget_max, currency))} 이하</p>`);
  }
  if (opts) lines.push(`<p class="lhai-par-car__vreq-meta">필수 옵션: ${escHtml(opts)}</p>`);
  if (vr.clean_title_required === true) lines.push(`<p class="lhai-par-car__vreq-meta">Clean title 필수</p>`);
  if (vr.no_accident_preferred === true) lines.push(`<p class="lhai-par-car__vreq-meta">사고 이력 없는 차량 선호</p>`);
  if (vr.notes) lines.push(`<p class="lhai-par-car__vreq-notes">${escHtml(vr.notes)}</p>`);
  return `<article class="lhai-par-car__vreq-card" data-request-index="${escHtml(idx)}">
    ${lines.join("")}
    <div class="lhai-par-car__vreq-actions">
      <button type="button" class="lhai-button lhai-button--primary" data-action="match" data-index="${escHtml(idx)}">이 요청으로 견적 작성</button>
      <button type="button" class="lhai-button lhai-button--ghost lhai-par-car__alt-btn" data-action="alt" data-index="${escHtml(idx)}">대안 차량 제안</button>
    </div>
  </article>`;
}

/** @param {Record<string, unknown>} offer @param {boolean} disabled */
function renderOfferFields(offer, disabled) {
  const isAlt = Boolean(offer.is_alternative);
  const dis = disabled ? "disabled" : "";
  const chk = (name, checked) =>
    `<label class="lhai-par-car__check"><input type="checkbox" name="${name}" ${checked ? "checked" : ""} ${dis} /> ${name === "clean_title_required" ? "Clean title" : "사고 이력 없음"}</label>`;

  return `
    <div class="lhai-par-car__field-row">
      <label>제안 유형</label>
      <select name="offer_kind" ${dis}>
        <option value="REQUESTED_MATCH" ${!isAlt ? "selected" : ""}>요청 차량과 일치</option>
        <option value="ALTERNATIVE" ${isAlt ? "selected" : ""}>비슷한 대안 차량</option>
      </select>
    </div>
    <div class="lhai-par-car__field-row">
      <label>연결된 고객 요청</label>
      <input type="number" name="linked_request_index" min="1" max="99" value="${offer.linked_request_index ?? ""}" ${dis} />
    </div>
    <div class="lhai-par-car__field-row lhai-par-car__alt-reason ${isAlt ? "" : "lhai-par-car__hidden"}">
      <label>대안 제안 사유 <span class="u-text-muted">(필수)</span></label>
      <textarea name="alternative_reason" rows="2" ${dis}>${escHtml(offer.alternative_reason || "")}</textarea>
    </div>
    <div class="lhai-par-car__grid-2">
      <div class="lhai-par-car__field-row">
        <label>신차/중고차</label>
        <select name="vehicle_condition" ${dis}>
          <option value="">—</option>
          <option value="NEW" ${offer.vehicle_condition === "NEW" ? "selected" : ""}>신차</option>
          <option value="USED" ${offer.vehicle_condition === "USED" ? "selected" : ""}>중고차</option>
        </select>
      </div>
      <div class="lhai-par-car__field-row">
        <label>연식</label>
        <input type="number" name="year" value="${offer.year ?? ""}" ${dis} />
      </div>
    </div>
    <div class="lhai-par-car__grid-2">
      <div class="lhai-par-car__field-row"><label>브랜드</label><input name="make" value="${escHtml(offer.make || "")}" ${dis} /></div>
      <div class="lhai-par-car__field-row"><label>모델</label><input name="model" value="${escHtml(offer.model || "")}" ${dis} /></div>
    </div>
    <div class="lhai-par-car__field-row"><label>트림</label><input name="trim" value="${escHtml(offer.trim || "")}" ${dis} /></div>
    <div class="lhai-par-car__grid-2">
      <div class="lhai-par-car__field-row"><label>주행거리 (miles)</label><input type="number" name="mileage" value="${offer.mileage ?? ""}" ${dis} /></div>
      <div class="lhai-par-car__field-row"><label>위치</label><input name="location" value="${escHtml(offer.location || "")}" ${dis} /></div>
    </div>
    <div class="lhai-par-car__field-row"><label>색상</label><input name="color" value="${escHtml(offer.color || "")}" ${dis} /></div>
    <div class="lhai-par-car__checks">
      ${chk("clean_title_required", offer.clean_title_required === true)}
      ${chk("no_accident_preferred", offer.no_accident_preferred === true)}
    </div>
    <h3 class="lhai-par-car__subhead">가격</h3>
    <div class="lhai-par-car__grid-2">
      <div class="lhai-par-car__field-row"><label>차량 가격</label><input type="number" name="vehicle_price" min="0" step="1" value="${offer.vehicle_price ?? ""}" ${dis} /></div>
      <div class="lhai-par-car__field-row"><label>예상 세금/등록비</label><input type="number" name="estimated_tax_fees" min="0" step="1" value="${offer.estimated_tax_fees ?? ""}" ${dis} /></div>
      <div class="lhai-par-car__field-row"><label>딜러 수수료</label><input type="number" name="dealer_fee" min="0" step="1" value="${offer.dealer_fee ?? ""}" ${dis} /></div>
      <div class="lhai-par-car__field-row"><label>파트너 서비스 수수료</label><input type="number" name="partner_service_fee" min="0" step="1" value="${offer.partner_service_fee ?? ""}" ${dis} /></div>
      <div class="lhai-par-car__field-row"><label>배송비</label><input type="number" name="delivery_fee" min="0" step="1" value="${offer.delivery_fee ?? ""}" ${dis} /></div>
      <div class="lhai-par-car__field-row lhai-par-car__total-row">
        <label>예상 총액</label>
        <output name="estimated_total_display" class="lhai-par-car__total-out">${escHtml(formatMoney(offer.estimated_total, offer.currency || "USD"))}</output>
        <input type="hidden" name="estimated_total" value="${offer.estimated_total ?? ""}" />
      </div>
    </div>
    <div class="lhai-par-car__field-row"><label>진행 가능 시점</label><input name="available_timeline" value="${escHtml(offer.available_timeline || "")}" ${dis} /></div>
    <div class="lhai-par-car__field-row"><label>포함 서비스</label><textarea name="included_services" rows="2" ${dis}>${escHtml(offer.included_services || "")}</textarea></div>
    <div class="lhai-par-car__field-row"><label>고객에게 보여줄 메시지</label><textarea name="message_to_customer" rows="2" ${dis}>${escHtml(offer.message_to_customer || "")}</textarea></div>
  `;
}

/**
 * @param {HTMLElement} root
 * @param {object} ctx
 */
export function mountCarPurchaseBidUi(root, ctx) {
  const { data, expiresAtQuery, requestStatusQuery, bidRequestBlock, onDetailUpdate, submitFn } = ctx;
  const carReq =
    data.car_purchase_request && typeof data.car_purchase_request === "object"
      ? data.car_purchase_request
      : {};
  const carCfg =
    data.car_purchase_config && typeof data.car_purchase_config === "object"
      ? data.car_purchase_config
      : {};
  const cust =
    data.customer_summary && typeof data.customer_summary === "object" ? data.customer_summary : {};
  const bid = data.bid && typeof data.bid === "object" ? data.bid : {};

  const maxOffers = Math.max(1, Number(carCfg.max_partner_vehicle_offers_per_bid) || 3);
  const allowAlternatives = carCfg.allow_alternative_vehicle_offers !== false;
  const currency = String(carReq.currency || "USD");

  const bidStatus = normalizeBidStatus(data);
  const deadlineExpires =
    bidRequestBlock && typeof bidRequestBlock === "object" && bidRequestBlock.expires_at
      ? String(bidRequestBlock.expires_at)
      : expiresAtQuery;
  const serverExpired =
    bidRequestBlock && typeof bidRequestBlock === "object" && bidRequestBlock.is_expired === true;
  const isEditable =
    !serverExpired &&
    resolvePartnerBidEditable({
      bidStatus,
      expiresAt: deadlineExpires,
      requestStatus: requestStatusQuery,
    });
  const isSelected = bidStatus === "SELECTED";
  const isTerminal = bidStatus === "CLOSED" || bidStatus === "REJECTED";

  let offers = offersFromIncludedItems(bid.included_items);
  if (!offers.length && isEditable) {
    offers = [createEmptyCarOffer({ linkedRequestIndex: null, isAlternative: false })];
  }
  let activeIdx = 0;

  const hasCap = partnerHasCarPurchaseCapability(readPartnerCapabilities());
  const vehicleRequests = Array.isArray(carReq.vehicle_requests) ? carReq.vehicle_requests : [];

  const cashLabel =
    carReq.cash_purchase === true ? "현금" : carReq.cash_purchase === false ? "할부/기타" : "—";

  root.innerHTML = `
    <section class="lhai-card lhai-par-car__hero">
      <h2 class="lhai-card__title">자동차 구매 견적 요청</h2>
      ${!hasCap ? '<p class="lhai-par-car__cap-warn" role="status">CAR_PURCHASE 견적 권한이 프로필에 없을 수 있습니다. 제출이 거절되면 관리자에게 문의하세요.</p>' : ""}
      <dl class="lhai-par-car__summary-dl">
        <div><dt>고객</dt><dd>${escHtml(cust.display_name || "—")}</dd></div>
        <div><dt>지역</dt><dd>${escHtml(carReq.location || cust.location || "—")}</dd></div>
        <div><dt>구매 방식</dt><dd>${escHtml(cashLabel)}</dd></div>
        <div><dt>전체 예산</dt><dd>${carReq.budget_max != null ? `${escHtml(formatMoney(carReq.budget_max, currency))} 이하` : "—"}</dd></div>
        <div><dt>구매 희망 시기</dt><dd>${escHtml(carReq.desired_timeline || "—")}</dd></div>
        <div><dt>비딩 마감까지</dt><dd id="partnerCarDeadline">${escHtml(formatDeadlineFromBidRequestBlock(bidRequestBlock) || formatDeadlineFromBidRequestBlock({ expires_at: expiresAtQuery }))}</dd></div>
        <div><dt>대안 차량 제안</dt><dd>${allowAlternatives ? "허용" : "불가"}</dd></div>
      </dl>
    </section>
    ${isSelected ? '<section class="lhai-par-bid__selected-banner"><p><strong>고객이 이 견적을 선택했습니다.</strong> 이후에는 수정할 수 없습니다.</p><button type="button" class="lhai-button lhai-button--primary" id="partnerCarOpenMessagesBtn">고객과 메시지 열기</button></section>' : ""}
    ${isTerminal && !isSelected ? '<p class="lhai-par-bid__closed-banner">이 견적 요청은 종료되었거나 더 이상 수정할 수 없습니다.</p>' : ""}
    ${!isEditable && !isSelected && !isTerminal ? '<p class="lhai-par-car__expired">제출 마감 시간이 지났거나 요청이 마감되었습니다. 수정할 수 없습니다.</p>' : ""}
    <section class="lhai-card"><h2 class="lhai-card__title">고객 요청 차량</h2><div id="partnerCarVreqList" class="lhai-par-car__vreq-list"></div></section>
    <section class="lhai-card lhai-par-car__editor" id="partnerCarEditorSection" ${isEditable ? "" : 'hidden'}>
      <div class="lhai-par-car__editor-head"><h2 class="lhai-card__title">자동차 견적</h2><div class="lhai-par-car__offer-tabs" id="partnerCarOfferTabs"></div></div>
      <form class="lhai-par-car__form" id="partnerCarForm" novalidate>
        <div id="partnerCarOfferFields"></div>
        <div class="lhai-par-bid__field"><label for="partnerCarGlobalMessage">전체 메시지 (선택)</label><textarea id="partnerCarGlobalMessage" name="global_message" rows="3"></textarea></div>
        <p class="lhai-par-bid__form-error" id="partnerCarFormError" role="alert" hidden></p>
        <div class="lhai-par-car__toolbar">
          <button type="button" class="lhai-button lhai-button--ghost" id="partnerCarApplyDefaultsBtn" ${isEditable ? "" : "disabled"}>기본값 적용</button>
          <button type="button" class="lhai-button lhai-button--ghost" id="partnerCarCopyOfferBtn" ${isEditable ? "" : "disabled"}>제안 복사</button>
          <button type="button" class="lhai-button lhai-button--ghost" id="partnerCarAddOfferBtn" ${isEditable ? "" : "disabled"}>제안 추가</button>
          <button type="button" class="lhai-button lhai-button--ghost" id="partnerCarRemoveOfferBtn" ${isEditable ? "" : "disabled"}>제안 삭제</button>
          <button type="submit" class="lhai-button lhai-button--primary" id="partnerCarSubmitBtn" ${isEditable ? "" : "disabled"}>${bidStatus === "SUBMITTED" ? "견적 수정 제출" : "견적 제출"}</button>
        </div>
      </form>
    </section>
  `;

  const vreqList = root.querySelector("#partnerCarVreqList");
  const offerFields = root.querySelector("#partnerCarOfferFields");
  const offerTabs = root.querySelector("#partnerCarOfferTabs");
  const form = root.querySelector("#partnerCarForm");
  const formErr = root.querySelector("#partnerCarFormError");
  const globalMsg = root.querySelector("#partnerCarGlobalMessage");
  const submitBtn = root.querySelector("#partnerCarSubmitBtn");
  const deadlineEl = root.querySelector("#partnerCarDeadline");

  if (globalMsg instanceof HTMLTextAreaElement) {
    globalMsg.value = String(bid.message_to_customer || "");
    globalMsg.disabled = !isEditable;
  }

  if (deadlineEl) {
    const tick = () => {
      deadlineEl.textContent = formatDeadlineFromBidRequestBlock(bidRequestBlock) ||
        formatDeadlineFromBidRequestBlock({ expires_at: deadlineExpires || expiresAtQuery });
    };
    tick();
    window.setInterval(tick, 60000);
  }

  function findVehicleRequest(index) {
    return vehicleRequests.find((v) => Number(v.request_index) === Number(index));
  }

  function readOfferFromForm() {
    const o = offers[activeIdx] ? { ...offers[activeIdx] } : createEmptyCarOffer({});
    if (!(offerFields instanceof HTMLElement)) return o;
    const kind = offerFields.querySelector('[name="offer_kind"]');
    const isAlt = kind instanceof HTMLSelectElement && kind.value === "ALTERNATIVE";
    o.is_alternative = isAlt;
    o.offer_kind = isAlt ? "ALTERNATIVE" : "REQUESTED_MATCH";

    const getVal = (name) => {
      const el = offerFields.querySelector(`[name="${name}"]`);
      if (el instanceof HTMLInputElement && el.type === "checkbox") return el.checked;
      if (el instanceof HTMLInputElement || el instanceof HTMLSelectElement || el instanceof HTMLTextAreaElement) {
        return el.value;
      }
      return "";
    };

    const lri = getVal("linked_request_index");
    o.linked_request_index = lri === "" ? null : Number(lri);
    o.vehicle_condition = getVal("vehicle_condition");
    o.make = String(getVal("make")).trim();
    o.model = String(getVal("model")).trim();
    o.trim = String(getVal("trim")).trim();
    o.year = getVal("year") === "" ? null : Number(getVal("year"));
    o.mileage = getVal("mileage") === "" ? null : Number(getVal("mileage"));
    o.clean_title_required = Boolean(offerFields.querySelector('[name="clean_title_required"]')?.checked);
    o.no_accident_preferred = Boolean(offerFields.querySelector('[name="no_accident_preferred"]')?.checked);
    o.location = String(getVal("location")).trim();
    o.color = String(getVal("color")).trim();
    o.vehicle_price = getVal("vehicle_price") === "" ? null : Number(getVal("vehicle_price"));
    o.estimated_tax_fees = getVal("estimated_tax_fees") === "" ? null : Number(getVal("estimated_tax_fees"));
    o.dealer_fee = getVal("dealer_fee") === "" ? null : Number(getVal("dealer_fee"));
    o.partner_service_fee = getVal("partner_service_fee") === "" ? null : Number(getVal("partner_service_fee"));
    o.delivery_fee = getVal("delivery_fee") === "" ? null : Number(getVal("delivery_fee"));
    o.available_timeline = String(getVal("available_timeline")).trim();
    o.included_services = String(getVal("included_services")).trim();
    o.message_to_customer = String(getVal("message_to_customer")).trim();
    o.alternative_reason = String(getVal("alternative_reason")).trim();
    o.estimated_total = computeOfferEstimatedTotal(o);
    o.currency = currency;
    return o;
  }

  function syncOfferFromForm() {
    if (!offers.length) return;
    offers[activeIdx] = readOfferFromForm();
  }

  function renderVreqList() {
    if (!(vreqList instanceof HTMLElement)) return;
    if (!vehicleRequests.length) {
      vreqList.innerHTML = '<p class="u-text-muted">구조화된 차량 요청이 없습니다.</p>';
      return;
    }
    vreqList.innerHTML = vehicleRequests.map((vr) => renderVehicleCard(vr, currency)).join("");
    vreqList.querySelectorAll(".lhai-par-car__alt-btn").forEach((btn) => {
      if (!(btn instanceof HTMLButtonElement)) return;
      if (!allowAlternatives) {
        btn.disabled = true;
        btn.hidden = true;
      }
    });
    vreqList.querySelectorAll("[data-action]").forEach((btn) => {
      if (!(btn instanceof HTMLButtonElement)) return;
      const action = btn.getAttribute("data-action");
      const index = Number(btn.getAttribute("data-index"));
      if (!isEditable) btn.disabled = true;
      btn.addEventListener("click", () => {
        syncOfferFromForm();
        const vr = findVehicleRequest(index);
        const isAlt = action === "alt";
        const next = createEmptyCarOffer({ linkedRequestIndex: index, isAlternative: isAlt });
        if (vr && !isAlt) {
          next.vehicle_condition = vr.vehicle_condition || "";
          next.make = vr.make || "";
          next.model = vr.model || "";
          next.year = vr.year_min ?? null;
          next.mileage = vr.mileage_max ?? null;
          next.clean_title_required = vr.clean_title_required ?? null;
          next.no_accident_preferred = vr.no_accident_preferred ?? null;
          next.location = String(carReq.location || cust.location || "");
        }
        if (offers.length >= maxOffers) {
          offers[maxOffers - 1] = next;
          activeIdx = maxOffers - 1;
        } else {
          offers.push(next);
          activeIdx = offers.length - 1;
        }
        renderOffersUi();
      });
    });
  }

  function renderOffersUi() {
    if (!(offerTabs instanceof HTMLElement) || !(offerFields instanceof HTMLElement)) return;
    offerTabs.innerHTML = offers
      .map(
        (o, i) =>
          `<button type="button" class="lhai-par-car__tab ${i === activeIdx ? "is-active" : ""}" data-idx="${i}">제안 ${i + 1}${o.is_alternative ? " · 대안" : ""}</button>`
      )
      .join("");
    offerTabs.querySelectorAll(".lhai-par-car__tab").forEach((btn) => {
      btn.addEventListener("click", () => {
        syncOfferFromForm();
        activeIdx = Number(btn.getAttribute("data-idx"));
        renderOffersUi();
      });
    });
    offerFields.innerHTML = renderOfferFields(offers[activeIdx] || createEmptyCarOffer({}), !isEditable);
    bindOfferFieldEvents();
  }

  function bindOfferFieldEvents() {
    if (!(offerFields instanceof HTMLElement)) return;
    const recalc = () => {
      const o = readOfferFromForm();
      const out = offerFields.querySelector('[name="estimated_total_display"]');
      const hid = offerFields.querySelector('[name="estimated_total"]');
      o.estimated_total = computeOfferEstimatedTotal(o);
      if (out instanceof HTMLOutputElement) out.textContent = formatMoney(o.estimated_total, currency);
      if (hid instanceof HTMLInputElement) hid.value = String(o.estimated_total || "");
    };
    offerFields.querySelectorAll("input, select, textarea").forEach((el) => {
      el.addEventListener("input", recalc);
      el.addEventListener("change", recalc);
    });
    const kind = offerFields.querySelector('[name="offer_kind"]');
    if (kind instanceof HTMLSelectElement) {
      kind.addEventListener("change", () => {
        const altRow = offerFields.querySelector(".lhai-par-car__alt-reason");
        const isAlt = kind.value === "ALTERNATIVE";
        if (altRow instanceof HTMLElement) altRow.classList.toggle("lhai-par-car__hidden", !isAlt);
        recalc();
      });
    }
  }

  renderVreqList();
  renderOffersUi();

  root.querySelector("#partnerCarApplyDefaultsBtn")?.addEventListener("click", () => {
    syncOfferFromForm();
    const o = offers[activeIdx];
    if (!o) return;
    if (!o.location) o.location = String(carReq.location || cust.location || "");
    if (!o.vehicle_condition && vehicleRequests[0]) o.vehicle_condition = vehicleRequests[0].vehicle_condition || "USED";
    if (!o.currency) o.currency = currency;
    offers[activeIdx] = o;
    renderOffersUi();
  });

  root.querySelector("#partnerCarCopyOfferBtn")?.addEventListener("click", () => {
    syncOfferFromForm();
    if (offers.length >= maxOffers) {
      window.alert(`제안은 최대 ${maxOffers}개까지입니다.`);
      return;
    }
    offers.push(cloneOffer(offers[activeIdx]));
    activeIdx = offers.length - 1;
    renderOffersUi();
  });

  root.querySelector("#partnerCarAddOfferBtn")?.addEventListener("click", () => {
    syncOfferFromForm();
    if (offers.length >= maxOffers) {
      window.alert(`제안은 최대 ${maxOffers}개까지입니다.`);
      return;
    }
    offers.push(createEmptyCarOffer({ isAlternative: false }));
    activeIdx = offers.length - 1;
    renderOffersUi();
  });

  root.querySelector("#partnerCarRemoveOfferBtn")?.addEventListener("click", () => {
    if (offers.length <= 1) {
      window.alert("최소 1개의 제안이 필요합니다.");
      return;
    }
    offers.splice(activeIdx, 1);
    activeIdx = Math.min(activeIdx, offers.length - 1);
    renderOffersUi();
  });

  root.querySelector("#partnerCarOpenMessagesBtn")?.addEventListener("click", () => {
    const tid = String(data.thread_id || "").trim();
    if (tid) window.location.href = `partner-assigned-request.html?thread_id=${encodeURIComponent(tid)}`;
  });

  if (form instanceof HTMLFormElement) {
    form.addEventListener("submit", async (ev) => {
      ev.preventDefault();
      if (!isEditable) return;
      syncOfferFromForm();
      if (formErr instanceof HTMLElement) {
        formErr.hidden = true;
        formErr.textContent = "";
      }
      const verr = validateCarOffersForSubmit(offers, { maxOffers, allowAlternatives });
      if (verr) {
        if (formErr instanceof HTMLElement) {
          formErr.hidden = false;
          formErr.textContent = verr;
        }
        return;
      }
      const gm = globalMsg instanceof HTMLTextAreaElement ? globalMsg.value : "";
      const payload = buildCarSubmitPayload(offers, gm);
      if (submitBtn instanceof HTMLButtonElement) submitBtn.disabled = true;
      try {
        const next = await submitFn(payload);
        onDetailUpdate(next);
        offers = offersFromIncludedItems(
          next.bid && typeof next.bid === "object" ? next.bid.included_items : null
        );
        if (!offers.length) offers = [createEmptyCarOffer({})];
        activeIdx = 0;
        renderOffersUi();
        if (globalMsg instanceof HTMLTextAreaElement) {
          globalMsg.value = String(
            (next.bid && typeof next.bid === "object" ? next.bid.message_to_customer : "") || ""
          );
        }
        window.alert("견적이 저장되었습니다.");
      } catch (err) {
        const msg = err instanceof Error ? err.message : "제출에 실패했습니다.";
        if (formErr instanceof HTMLElement) {
          formErr.hidden = false;
          formErr.textContent = msg;
        }
      } finally {
        if (submitBtn instanceof HTMLButtonElement) submitBtn.disabled = !isEditable;
      }
    });
  }
}

