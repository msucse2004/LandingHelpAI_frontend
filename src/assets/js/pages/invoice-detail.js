import { invoiceApi, paymentApi, quoteApi } from "../core/api.js";
import { getCustomerMessagingProfileId } from "../core/auth.js";
import { ensureCustomerAccess, protectCurrentPage } from "../core/guards.js";
import { patchState } from "../core/state.js";
import { loadSidebar } from "../components/sidebar.js";
import { applyI18nToDom, applyDocumentLanguageAttributes, wireDynamicPageI18nRefresh } from "../core/i18n-dom.js";
import { bootAppPageContent } from "../core/app-page-i18n-boot.js";
import { mergeFallbackStrings, reloadI18nForLanguage, t, flushRuntimeMissingKeysAfterPageApply } from "../core/i18n-client.js";
import { getEffectiveLanguage, normalizeSupportedLanguageCode, applyUiLanguageFromUrlQuery } from "../core/preferred-language.js";
import { formatMoney } from "../core/utils.js";
import { resolveAppHeaderShell, refreshHeaderMailUnreadBadge } from "../core/app-header.js";
import { getInvoiceLocaleBundle, invoicePageEnglishFallback } from "./invoice-detail-locale.js";
import { buildInvoiceServiceRows } from "./invoice-detail-services-logic.js";
import { buildInvoiceAmountSummaryDisplay } from "./invoice-detail-amount-summary-logic.js";
import { buildInvoicePrepayScopeContent } from "./invoice-detail-prepay-scope-logic.js";
import {
  buildInvoiceDueDateDisplay,
  invoiceReferenceMonoText,
} from "./invoice-detail-details-logic.js";
import {
  customerInvoiceStatusLabelKey,
  getInvoiceActionState,
  normalizeInvoiceStatus,
} from "./invoice-detail-action-state-logic.js";

/**
 * Step 9 — data vs UI labels:
 * - Invoice/quote titles, party names, line items, API transition messages: raw API text.
 * - Payment status: `statusLabel` maps known enums; unknown enum code shown as-is (not via `t()`).
 * - Service row titles (`row.title`) stay raw; only synthetic `admin_fee` row uses a UI label key.
 */

function qs(selector) {
  return document.querySelector(selector);
}

/** 직후 `markSuccess` 응답 — 문서 건수 표시에 한 번만 사용 */
let lastPaymentSuccessApiResult = null;

/** `renderInvoice` 직후 결제 handler가 참조하는 청구서 */
let activeInvoiceRef = null;
/** @type {Record<string, unknown> | null} */
let activeInvoiceQuoteRef = null;
let invoiceViewerLocaleRefetchInFlight = false;

const INVOICE_I18N_DOMAINS = ["common", "nav", "invoice"];

/** @param {string} key */
function ti(key) {
  return t(key, invoicePageEnglishFallback(key));
}

/** @param {unknown} invoice */
function invoiceDisplayServiceName(invoice) {
  return String(invoice?.display_service_name || invoice?.service_name || "").trim();
}

/** @param {unknown} invoice */
function invoiceDisplayDraftNotes(invoice) {
  return String(invoice?.display_draft_notes || invoice?.draft_notes || "").trim();
}

function applyInvoicePageLocaleBundle() {
  const lang = getEffectiveLanguage();
  applyDocumentLanguageAttributes(lang);
  mergeFallbackStrings(getInvoiceLocaleBundle(lang));
}

let invoicePaymentInFlight = false;

function readInvoicePagePreserve() {
  const statusEl = qs("#invoiceStatusMessage");
  return {
    scrollY: window.scrollY || 0,
    statusMessage: invoicePaymentInFlight && statusEl ? String(statusEl.textContent || "") : "",
  };
}

function restoreInvoicePagePreserve(preserve) {
  if (!preserve) return;
  try {
    window.scrollTo(0, preserve.scrollY);
  } catch {
    /* non-browser */
  }
  if (invoicePaymentInFlight) {
    setMessage(preserve.statusMessage || ti("customer.invoice.pay_processing"));
    setInvoicePayButtonsBusy(true);
  }
}

function rerenderInvoicePageFromCache() {
  if (!activeInvoiceRef) return;
  renderInvoice(activeInvoiceRef, activeInvoiceQuoteRef);
  syncInvoicePayButtonsVisibility(activeInvoiceRef);
}

const INVOICE_PAY_BTN_SELECTORS = ["#payNowBtn", "#invoiceHeroPayBtn"];

const INVOICE_ASK_LINK_SELECTORS = ["#invoiceHeroAskBtn"];

const INVOICE_MESSAGES_LINK_SELECTORS = ["#invoiceHeroMessagesBtn"];

function setMessage(message) {
  const el = qs("#invoiceStatusMessage");
  if (el) el.textContent = message || "";
}

function statusClass(status) {
  const st = normalizeInvoiceStatus(status);
  if (st === "PAID") return "lhai-badge lhai-badge--risk-low";
  if (st === "FAILED") return "lhai-badge lhai-badge--risk-high";
  if (st === "CANCELED" || st === "VOID" || st === "EXPIRED") return "lhai-badge lhai-badge--risk-medium";
  if (st === "SENT" || st === "PENDING") return "lhai-badge lhai-badge--risk-medium";
  return "lhai-badge";
}

function statusLabel(status) {
  const st = normalizeInvoiceStatus(status);
  const key = customerInvoiceStatusLabelKey(st);
  const tr = ti(key);
  if (tr && tr !== key) return tr;
  return st || "—";
}

function looksLikeUuid(str) {
  const s = String(str || "").trim();
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s);
}

/** @param {string} invoiceId */
function buildInvoiceMessagesHref(invoiceId) {
  const q = new URLSearchParams();
  const id = String(invoiceId || "").trim();
  if (id) q.set("invoice_id", id);
  const qs = q.toString();
  return qs ? `../pages/messages.html?${qs}` : "../pages/messages.html";
}

/** @param {unknown} statusOrInvoice status 문자열 또는 `{ status }` invoice */
function invoiceStatusAllowsPayment(statusOrInvoice) {
  const invoice =
    statusOrInvoice && typeof statusOrInvoice === "object" && "status" in statusOrInvoice
      ? /** @type {Record<string, unknown>} */ (statusOrInvoice)
      : { status: statusOrInvoice };
  return getInvoiceActionState(invoice).canPay;
}

/** @param {unknown} statusOrInvoice */
function invoiceStatusIsUnpayable(statusOrInvoice) {
  const invoice =
    statusOrInvoice && typeof statusOrInvoice === "object" && "status" in statusOrInvoice
      ? /** @type {Record<string, unknown>} */ (statusOrInvoice)
      : { status: statusOrInvoice };
  const action = getInvoiceActionState(invoice);
  return action.isUnpayable || action.isUnknown;
}

/** Hero 배지: 결제 대기·재시도는 파란/안내 톤, 결제 완료만 성공(초록) 톤 */
function heroStatusBadgeClass(st) {
  const u = normalizeInvoiceStatus(st);
  const action = getInvoiceActionState({ status: u });
  if (action.isPaid) return "lhai-badge lhai-badge--risk-low lhai-quote-hero__badge";
  if (action.isPendingPayment) {
    return "lhai-badge lhai-invoice-hero__badge--pending lhai-quote-hero__badge";
  }
  return "lhai-badge lhai-badge--risk-medium lhai-quote-hero__badge";
}

/** @param {unknown} quote */
function quoteDisplayTitle(quote) {
  if (!quote || typeof quote !== "object") return "";
  return String(quote.display_title || quote.title || "").trim();
}

/** @param {unknown} quote */
function customerFacingQuoteTitle(quote) {
  const raw = quoteDisplayTitle(quote);
  if (!raw) return "";
  for (const suffix of [" Landing Help AI 견적서", " Landing Help AI quote"]) {
    if (raw.endsWith(suffix)) {
      const base = raw.slice(0, -suffix.length).trim();
      return base || raw;
    }
  }
  return raw;
}

/**
 * @param {unknown} quote
 * @returns {string[]}
 */
function billedServiceTitlesFromQuote(quote) {
  const titles = [];
  if (!quote || typeof quote !== "object") return titles;
  const rd = quote.request_details && typeof quote.request_details === "object" ? quote.request_details : {};
  const survey = rd.survey_submission && typeof rd.survey_submission === "object" ? rd.survey_submission : {};
  const services = Array.isArray(survey.selected_services) ? survey.selected_services : [];
  for (const s of services) {
    if (!s || typeof s !== "object") continue;
    const tit = String(s.title || "").trim();
    if (tit) {
      titles.push(tit);
      continue;
    }
    const id = String(s.id || "").trim();
    if (id && !looksLikeUuid(id)) titles.push(id);
  }
  return titles;
}

/**
 * @param {Record<string, unknown>|null} quote
 * @param {Record<string, unknown>} invoice
 */
function heroRequestSummaryText(quote, invoice) {
  const title = customerFacingQuoteTitle(quote);
  if (title) {
    const tpl = t("customer.invoice.hero.request_prefix", "Survey request: %s");
    return tpl.includes("%s") ? tpl.replace("%s", title) : `${tpl} ${title}`;
  }
  const pkg = invoiceDisplayServiceName(invoice);
  if (pkg) {
    const tpl = t("customer.invoice.hero.request_prefix", "Survey request: %s");
    return tpl.includes("%s") ? tpl.replace("%s", pkg) : `${tpl} ${pkg}`;
  }
  return "—";
}

/**
 * @param {Record<string, unknown>|null} quote
 * @param {Record<string, unknown>} invoice
 */
function heroBilledServicesText(quote, invoice) {
  const titles = billedServiceTitlesFromQuote(quote);
  if (titles.length) return titles.join(", ");
  const pkg = invoiceDisplayServiceName(invoice);
  return pkg || "—";
}

function setInvoicePayButtonsBusy(busy) {
  const canPay = invoiceStatusAllowsPayment(activeInvoiceRef);
  for (const sel of INVOICE_PAY_BTN_SELECTORS) {
    const btn = qs(sel);
    if (!btn) continue;
    btn.disabled = busy || !canPay;
  }
}

/** Hero·하단 결제 블록 CTA를 동일 규칙으로 맞춘다. */
function syncInvoicePageCtas(invoice) {
  const action = getInvoiceActionState(invoice);
  const msgHref = buildInvoiceMessagesHref(invoice?.id);

  const payLabel = t("customer.invoice.hero.cta.pay", "Pay now");
  const askLabel = t("customer.invoice.hero.cta.ask", "Ask a question");
  const messagesLabel = t("customer.invoice.hero.cta.messages", "Open messages");

  for (const sel of INVOICE_PAY_BTN_SELECTORS) {
    const btn = qs(sel);
    if (!btn) continue;
    btn.textContent = payLabel;
    btn.hidden = !action.showPay;
    btn.disabled = !action.showPay || invoicePaymentInFlight;
  }

  for (const sel of INVOICE_ASK_LINK_SELECTORS) {
    const link = qs(sel);
    if (!link) continue;
    link.textContent = askLabel;
    link.href = msgHref;
    link.hidden = !action.showAsk;
  }

  for (const sel of INVOICE_MESSAGES_LINK_SELECTORS) {
    const link = qs(sel);
    if (!link) continue;
    link.textContent = messagesLabel;
    link.href = msgHref;
    link.hidden = !action.showMessages;
  }

  const helpLink = qs("#invoiceHelpLink");
  if (helpLink) helpLink.href = msgHref;

  const payBlock = qs("#invoicePayBlock");
  if (payBlock) payBlock.hidden = !action.showPay;
}

function syncInvoicePayButtonsVisibility(invoice) {
  syncInvoicePageCtas(invoice);
}

/** @param {Record<string, unknown>} invoice */
async function runInvoiceWebPayment(invoice) {
  if (!invoice?.id || invoicePaymentInFlight || !invoiceStatusAllowsPayment(invoice)) return;
  invoicePaymentInFlight = true;
  setInvoicePayButtonsBusy(true);
  setMessage(ti("customer.invoice.pay_processing"));
  try {
    const start = await paymentApi.startWebPayment({
      invoice_id: invoice.id,
      success_url: `${window.location.origin}/src/pages/invoice-detail.html?invoice_id=${encodeURIComponent(String(invoice.id))}&payment_id={PAYMENT_ID}&result=success`,
      failure_url: `${window.location.origin}/src/pages/invoice-detail.html?invoice_id=${encodeURIComponent(String(invoice.id))}&payment_id={PAYMENT_ID}&result=failure`,
      cancel_url: `${window.location.origin}/src/pages/invoice-detail.html?invoice_id=${encodeURIComponent(String(invoice.id))}&payment_id={PAYMENT_ID}&result=cancel`,
    });
    const checkout = String(start?.checkout_url || "").trim();
    if (checkout.startsWith("http://") || checkout.startsWith("https://") || checkout.startsWith("/")) {
      window.location.assign(checkout);
      return;
    }
    await handlePaymentSuccess(start.payment_id, String(invoice.id));
    setMessage(ti("customer.invoice.pay_success"));
  } catch {
    setMessage(ti("customer.invoice.pay_error"));
  } finally {
    invoicePaymentInFlight = false;
    if (activeInvoiceRef) {
      syncInvoicePayButtonsVisibility(activeInvoiceRef);
    } else {
      setInvoicePayButtonsBusy(false);
    }
  }
}

/** @param {unknown} value */
function parseIsoOrDateOnlyToLocalDate(value) {
  const s = String(value || "").trim();
  if (!s) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

function intlLocaleForUiLanguage(lang) {
  const code = normalizeSupportedLanguageCode(lang) || getEffectiveLanguage();
  if (code === "ko") return "ko-KR";
  if (code === "en") return "en-US";
  return code;
}

/**
 * @param {unknown} value
 * @param {string} [lang]
 */
function formatInvoiceCalendarDate(value, lang) {
  const d = parseIsoOrDateOnlyToLocalDate(value);
  if (!d) return "";
  const loc = intlLocaleForUiLanguage(lang ?? getEffectiveLanguage());
  return new Intl.DateTimeFormat(loc, { dateStyle: "long" }).format(d);
}

/**
 * @param {HTMLDListElement} dl
 * @param {string} label
 * @param {unknown} value
 * @param {{ muted?: boolean, mono?: boolean }} [opts]
 */
function appendInvoiceMetaPlainRow(dl, label, value, opts = {}) {
  const { muted = false, mono = false } = opts;
  const dt = document.createElement("dt");
  dt.className = "lhai-invoice-meta__dt";
  dt.textContent = label;
  const dd = document.createElement("dd");
  dd.className = "lhai-invoice-meta__dd";
  if (mono) {
    dd.classList.add("lhai-invoice-meta__dd--mono");
    const code = document.createElement("code");
    code.className = "lhai-invoice-meta__mono-value";
    code.textContent = invoiceReferenceMonoText(value);
    dd.appendChild(code);
  } else {
    dd.textContent = String(value ?? "").trim() || "—";
    if (muted) dd.classList.add("lhai-invoice-meta__dd--muted-prose");
  }
  dl.appendChild(dt);
  dl.appendChild(dd);
}

/**
 * @param {HTMLDListElement} dl
 * @param {string} label
 * @param {unknown} value
 */
function appendInvoiceMetaMonoRow(dl, label, value) {
  appendInvoiceMetaPlainRow(dl, label, value, { mono: true });
}

/**
 * @param {HTMLDListElement} dl
 * @param {string} label
 * @param {string} quoteId
 */
function appendInvoiceMetaQuoteRefRow(dl, label, quoteId) {
  const qref = String(quoteId || "").trim();
  if (!qref) return;
  const dt = document.createElement("dt");
  dt.className = "lhai-invoice-meta__dt";
  dt.textContent = label;
  const dd = document.createElement("dd");
  dd.className = "lhai-invoice-meta__dd lhai-invoice-meta__dd--mono";
  const link = document.createElement("a");
  link.className = "lhai-invoice-meta__mono-value lhai-invoice-meta__ref-link";
  link.href = `../pages/quote-detail.html?quote_id=${encodeURIComponent(qref)}`;
  link.textContent = qref;
  dd.appendChild(link);
  dl.appendChild(dt);
  dl.appendChild(dd);
}

/**
 * @param {HTMLDListElement} dl
 * @param {string} label
 * @param {Record<string, unknown>} invoice
 */
function appendInvoiceMetaStatusRow(dl, label, invoice) {
  const dt = document.createElement("dt");
  dt.className = "lhai-invoice-meta__dt";
  dt.textContent = label;
  const dd = document.createElement("dd");
  dd.className = "lhai-invoice-meta__dd lhai-invoice-meta__dd--status";
  const badge = document.createElement("span");
  badge.setAttribute("role", "status");
  badge.className = statusClass(invoice.status);
  badge.textContent = statusLabel(invoice.status);
  dd.appendChild(badge);
  dl.appendChild(dt);
  dl.appendChild(dd);
}

/**
 * @param {Record<string, unknown>} invoice
 * @param {Record<string, unknown>|null} quote
 */
function renderInvoiceMeta(invoice, quote) {
  const dl = qs("#invoiceMetaDl");
  if (!dl) return;

  const lang = getEffectiveLanguage();
  dl.innerHTML = "";

  const issueFmt = formatInvoiceCalendarDate(invoice.created_at, lang);
  appendInvoiceMetaPlainRow(dl, ti("customer.invoice.meta.issue_date"), issueFmt || "—");

  const dueDisplay = buildInvoiceDueDateDisplay(
    invoice.due_date,
    (raw) => formatInvoiceCalendarDate(raw, lang),
    () => ti("customer.invoice.meta.due_not_set"),
  );
  appendInvoiceMetaPlainRow(dl, ti("customer.invoice.meta.due_date"), dueDisplay.text, {
    muted: dueDisplay.muted,
  });

  const invNum = String(invoice.invoice_number || invoice.id || "").trim();
  appendInvoiceMetaMonoRow(dl, ti("customer.invoice.meta.invoice_number"), invNum);
  const qref = String(invoice.quote_id || "").trim();
  if (qref) {
    appendInvoiceMetaQuoteRefRow(dl, ti("customer.invoice.meta.quote_reference"), qref);
  }
  appendInvoiceMetaStatusRow(dl, ti("customer.invoice.meta.payment_status"), invoice);
  const cur = String(invoice.currency || "USD").trim().toUpperCase() || "USD";
  appendInvoiceMetaMonoRow(dl, ti("customer.invoice.meta.currency"), cur);
}

/** @param {ReturnType<typeof getInvoiceActionState>} action */
function heroTitleForAction(action) {
  if (action.isPaid) return ti("customer.invoice.hero.title_paid");
  if (action.isUnpayable || action.isUnknown) {
    return ti("customer.invoice.hero.title_unpayable");
  }
  if (action.status === "FAILED") return ti("customer.invoice.hero.title_failed");
  return ti("customer.invoice.hero.title_payment_needed");
}

/** @param {string} st */
function heroSubtitleForStatus(st) {
  const u = String(st || "").toUpperCase();
  if (u === "PAID") return ti("customer.invoice.hero.subtitle_paid");
  if (u === "CANCELED") return ti("customer.invoice.hero.subtitle_canceled");
  if (u === "FAILED") return ti("customer.invoice.hero.subtitle_failed");
  return ti("customer.invoice.hero.subtitle_default");
}

/**
 * @param {{ type: string, deliveryModeKey: string }} row
 */
function invoiceServiceSupportLabel(row) {
  if (row.type === "admin_fee") {
    return ti("customer.invoice.services.admin_fee_support");
  }
  const key = `customer.invoice.services.support.${row.deliveryModeKey || "general"}`;
  const tr = ti(key);
  if (tr && tr !== key) return tr;
  return ti("customer.invoice.services.support.general");
}

/**
 * @param {string} hintKey
 */
function invoiceServiceHintLabel(hintKey) {
  const key = `customer.invoice.services.hint.${hintKey || "default"}`;
  const tr = ti(key);
  if (tr && tr !== key) return tr;
  return ti("customer.invoice.services.hint.default");
}

/**
 * @param {HTMLElement} container
 * @param {{ type: string, title: string, deliveryModeKey: string, amount: number, hintKey: string }} row
 * @param {string} currency
 */
function appendInvoiceServiceRowCard(container, row, currency) {
  const card = document.createElement("article");
  card.className = "lhai-invoice-services__card";
  card.setAttribute("role", "listitem");

  const head = document.createElement("div");
  head.className = "lhai-invoice-services__card-head";

  const name = document.createElement("h3");
  name.className = "lhai-invoice-services__name";
  name.textContent =
    row.type === "admin_fee"
      ? t("customer.invoice.services.admin_fee_title", "Custom support fee")
      : row.title;

  const amount = document.createElement("p");
  amount.className = "lhai-invoice-services__amount";
  if (row.amount > 0.005) {
    amount.textContent = formatMoney(row.amount, currency);
  } else {
    amount.textContent = t("customer.invoice.services.amount_pending", "—");
    amount.classList.add("lhai-invoice-services__amount--muted");
  }

  head.appendChild(name);
  head.appendChild(amount);

  const support = document.createElement("p");
  support.className = "lhai-invoice-services__support";
  support.textContent = invoiceServiceSupportLabel(row);

  const hint = document.createElement("p");
  hint.className = "lhai-invoice-services__hint";
  hint.textContent = invoiceServiceHintLabel(row.hintKey);

  card.appendChild(head);
  card.appendChild(support);
  card.appendChild(hint);
  container.appendChild(card);
}

/**
 * 견적 제목 또는 견적 라인 설명으로 짧은 요약 생성.
 * @param {unknown} quote
 * @param {string} packageName
 */
function shortServiceDescriptionFromQuote(quote, packageName) {
  if (!quote || typeof quote !== "object") return "";
  const pkgNorm = String(packageName || "").trim().toLowerCase();
  const title = quoteDisplayTitle(quote);
  if (title && title.toLowerCase() !== pkgNorm) return title;

  const items = Array.isArray(quote.items) ? quote.items : [];
  const parts = [];
  for (const it of items) {
    if (!it || typeof it !== "object") continue;
    const d = String(it.display_description || it.description || "").trim();
    if (d && !parts.includes(d)) {
      parts.push(d);
      if (parts.length >= 4) break;
    }
  }
  return parts.join(" · ");
}

/**
 * @param {Record<string, unknown>} invoice
 * @param {Record<string, unknown>|null} quote
 */
function renderInvoiceScopeSection(invoice, quote) {
  const section = qs("#invoiceScopeSection");
  const rowsEl = qs("#invoiceScopeRows");
  const emptyEl = qs("#invoiceScopeEmpty");
  const descBlock = qs("#invoiceScopeDescriptionBlock");
  const descEl = qs("#invoiceScopeDescription");
  const noteBlock = qs("#invoiceScopeNoteBlock");
  const noteEl = qs("#invoiceScopeCustomerNote");
  const quoteNoteEl = qs("#invoiceScopeQuoteNote");
  if (!section || !rowsEl) return;

  section.hidden = false;
  const pkg = invoiceDisplayServiceName(invoice);

  let shortDesc = shortServiceDescriptionFromQuote(quote, pkg);
  const facing =
    quote && typeof quote === "object"
      ? String(quote.display_customer_facing_note || quote.customer_facing_note || "").trim()
      : "";
  if (facing && shortDesc && facing === shortDesc) {
    shortDesc = "";
  }

  if (shortDesc && descBlock && descEl) {
    descEl.textContent = shortDesc;
    descBlock.hidden = false;
  } else if (descBlock && descEl) {
    descBlock.hidden = true;
    descEl.textContent = "";
  }

  if (facing && noteBlock && noteEl) {
    noteEl.textContent = facing;
    noteBlock.hidden = false;
  } else if (noteBlock && noteEl) {
    noteBlock.hidden = true;
    noteEl.textContent = "";
  }

  rowsEl.innerHTML = "";
  const built = buildInvoiceServiceRows(invoice, quote);
  if (built.empty) {
    rowsEl.hidden = true;
    if (emptyEl) {
      emptyEl.hidden = false;
      emptyEl.textContent = ti("customer.invoice.scope.empty");
    }
  } else {
    rowsEl.hidden = false;
    if (emptyEl) {
      emptyEl.hidden = true;
      emptyEl.textContent = "";
    }
    for (const row of built.rows) {
      appendInvoiceServiceRowCard(rowsEl, row, built.currency);
    }
  }

  if (quoteNoteEl) {
    const qid = quote && String(quote.id || "").trim();
    const invQ = String(invoice.quote_id || "").trim();
    if (qid && invQ && qid === invQ) {
      quoteNoteEl.hidden = false;
      quoteNoteEl.textContent = ti("customer.invoice.scope.quote_note").replace(/%s/g, qid);
    } else {
      quoteNoteEl.hidden = true;
      quoteNoteEl.textContent = "";
    }
  }
}

/** @param {unknown} x */
function roundMoney2(x) {
  const n = Number(x);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100) / 100;
}

/**
 * @param {Record<string, unknown>} invoice
 * @param {Record<string, unknown>|null} quote
 */
function buildBillingSummaryClient(invoice, quote) {
  const currency = String(invoice.currency || "USD").trim().toUpperCase() || "USD";
  const amountDue = Math.max(roundMoney2(invoice.amount_due), 0);
  const st = String(invoice.status || "").toUpperCase();
  const paid = st === "PAID";

  if (!quote || typeof quote !== "object") {
    return {
      currency,
      base_service_amount: amountDue,
      add_ons_amount: 0,
      discounts_amount: 0,
      surcharges_amount: 0,
      taxes_and_fees_amount: 0,
      subtotal_excluding_tax: amountDue,
      invoice_total: amountDue,
      amount_already_paid: paid ? amountDue : 0,
      current_payable_amount: paid ? 0 : amountDue,
      reconciliation_note: "",
    };
  }

  const tax = Math.max(roundMoney2(quote.tax_amount), 0);
  const items = Array.isArray(quote.items) ? quote.items : [];
  const rd = quote.request_details && typeof quote.request_details === "object" ? quote.request_details : {};
  const qp = rd.quote_pricing && typeof rd.quote_pricing === "object" ? rd.quote_pricing : {};
  let adminFee = 0;
  if (qp.admin_fee != null) {
    const feeN = Number(qp.admin_fee);
    if (Number.isFinite(feeN) && feeN >= 0) adminFee = roundMoney2(feeN);
  }
  let subtotalLines;
  let base;
  let addons;
  if (items.length) {
    subtotalLines = roundMoney2(items.reduce((acc, it) => acc + Number(it.line_total || 0), 0));
    base = roundMoney2(Number(items[0].line_total) || 0);
    addons = roundMoney2(Math.max(subtotalLines - base, 0));
  } else {
    const est = Math.max(roundMoney2(quote.estimated_cost), 0);
    subtotalLines = roundMoney2(Math.max(est - adminFee, 0));
    base = subtotalLines;
    addons = 0;
  }
  subtotalLines = roundMoney2(subtotalLines + adminFee);

  const nominal = roundMoney2(subtotalLines + tax);
  let discount = 0;
  let surcharge = 0;
  if (nominal > amountDue + 0.005) discount = roundMoney2(nominal - amountDue);
  else if (amountDue > nominal + 0.005) surcharge = roundMoney2(amountDue - nominal);

  return {
    currency,
    base_service_amount: base,
    add_ons_amount: addons,
    discounts_amount: discount,
    admin_fee_amount: adminFee,
    surcharges_amount: surcharge,
    taxes_and_fees_amount: tax,
    subtotal_excluding_tax: subtotalLines,
    invoice_total: amountDue,
    amount_already_paid: paid ? amountDue : 0,
    current_payable_amount: paid ? 0 : amountDue,
    reconciliation_note: "",
  };
}

/**
 * @param {Record<string, unknown>} raw
 * @param {Record<string, unknown>} invoice
 */
function normalizeBillingSummaryFromApi(raw, invoice) {
  const currency = String(raw.currency || invoice.currency || "USD").trim().toUpperCase() || "USD";
  return {
    currency,
    base_service_amount: roundMoney2(raw.base_service_amount),
    add_ons_amount: roundMoney2(raw.add_ons_amount),
    discounts_amount: roundMoney2(raw.discounts_amount),
    admin_fee_amount: roundMoney2(raw.admin_fee_amount ?? 0),
    surcharges_amount: roundMoney2(raw.surcharges_amount ?? 0),
    taxes_and_fees_amount: roundMoney2(raw.taxes_and_fees_amount),
    subtotal_excluding_tax: roundMoney2(raw.subtotal_excluding_tax),
    invoice_total: roundMoney2(raw.invoice_total),
    amount_already_paid: roundMoney2(raw.amount_already_paid),
    current_payable_amount: roundMoney2(raw.current_payable_amount),
    reconciliation_note: String(raw.display_reconciliation_note || raw.reconciliation_note || "").trim(),
  };
}

/**
 * @param {Record<string, unknown>} invoice
 * @param {Record<string, unknown>|null} quote
 */
function getInvoiceBillingSummary(invoice, quote) {
  const s = invoice.billing_summary;
  if (
    s &&
    typeof s === "object" &&
    s.invoice_total != null &&
    (typeof s.invoice_total === "number" || typeof s.invoice_total === "string")
  ) {
    return normalizeBillingSummaryFromApi(/** @type {Record<string, unknown>} */ (s), invoice);
  }
  return buildBillingSummaryClient(invoice, quote);
}

/**
 * @param {HTMLTableSectionElement} tbody
 * @param {string} label
 * @param {string} amountDisplay
 * @param {string} [rowClass]
 */
function appendAmountSummaryRow(tbody, label, amountDisplay, rowClass = "") {
  const tr = document.createElement("tr");
  if (rowClass) tr.className = rowClass;
  const tdL = document.createElement("td");
  tdL.textContent = label;
  const tdR = document.createElement("td");
  tdR.className = "lhai-invoice-amount-summary__amount";
  tdR.textContent = amountDisplay;
  tr.appendChild(tdL);
  tr.appendChild(tdR);
  tbody.appendChild(tr);
}

/**
 * @param {HTMLTableSectionElement} foot
 * @param {string} label
 * @param {string} amountDisplay
 * @param {string} [rowClass]
 */
function appendAmountSummaryFootRow(foot, label, amountDisplay, rowClass = "") {
  const tr = document.createElement("tr");
  if (rowClass) tr.className = rowClass;
  const tdL = document.createElement("td");
  tdL.textContent = label;
  const tdR = document.createElement("td");
  tdR.className = "lhai-invoice-amount-summary__amount";
  tdR.textContent = amountDisplay;
  tr.appendChild(tdL);
  tr.appendChild(tdR);
  foot.appendChild(tr);
}

/** @param {string} labelKey */
function amountSummaryLabelForKey(labelKey) {
  const map = {
    service_subtotal: "customer.invoice.amount.row.service_subtotal",
    tax_and_fees: "customer.invoice.amount.row.tax_and_fees",
    discount: "customer.invoice.amount.row.discount",
    surcharge: "customer.invoice.amount.row.surcharge",
    invoice_total: "customer.invoice.amount.row.invoice_total",
    amount_paid: "customer.invoice.amount.row.amount_paid",
    current_payable: "customer.invoice.amount.row.current_payable",
    balance_remaining: "customer.invoice.amount.row.balance_remaining",
  };
  const i18nKey = map[labelKey] || labelKey;
  return ti(i18nKey);
}

/**
 * @param {string} currency
 * @param {number} amount
 * @param {boolean} [negative]
 */
function formatAmountSummaryMoney(currency, amount, negative = false) {
  const formatted = formatMoney(amount, currency);
  if (!negative) return formatted;
  if (formatted.startsWith("-")) return formatted;
  return `−${formatted}`;
}

/**
 * @param {"included" | "excluded"} kind
 * @param {string} itemId
 */
function prepayScopeItemLabel(kind, itemId) {
  const key = `customer.invoice.prepay_scope.${kind}.${itemId}`;
  const tr = ti(key);
  return tr && tr !== key ? tr : itemId;
}

/**
 * @param {HTMLUListElement} ul
 * @param {Array<{ id: string, emphasis?: boolean }>} items
 * @param {"included" | "excluded"} kind
 */
function fillInvoicePrepayScopeList(ul, items, kind) {
  if (!ul) return;
  ul.innerHTML = "";
  for (const item of items) {
    const li = document.createElement("li");
    if (item.emphasis) li.classList.add("lhai-invoice-prepay-scope__list-item--emphasis");
    li.textContent = prepayScopeItemLabel(kind, item.id);
    ul.appendChild(li);
  }
}

/**
 * @param {Record<string, unknown>} invoice
 * @param {Record<string, unknown>|null} quote
 */
function renderInvoicePrepayScopeSection(invoice, quote) {
  const titleEl = qs("#invoicePaymentNoticeTitle");
  const ledeEl = qs("#invoicePrepayScopeLede");
  const contextNote = qs("#invoicePrepayScopeContextNote");
  const includedTitle = qs("#invoicePrepayIncludedTitle");
  const excludedTitle = qs("#invoicePrepayExcludedTitle");
  const includedList = qs("#invoicePrepayIncludedList");
  const excludedList = qs("#invoicePrepayExcludedList");

  if (titleEl) {
    titleEl.textContent = t("customer.invoice.legal.notice_block_title", "Please review before paying");
  }
  if (ledeEl) {
    ledeEl.textContent = t(
      "customer.invoice.prepay_scope.lede",
      "Before you pay, please read the sections below.",
    );
  }
  if (includedTitle) {
    includedTitle.textContent = t("customer.invoice.prepay_scope.included_title", "Included in this invoice");
  }
  if (excludedTitle) {
    excludedTitle.textContent = t("customer.invoice.prepay_scope.excluded_title", "Not included in this invoice");
  }

  const content = buildInvoicePrepayScopeContent(quote, invoice);
  fillInvoicePrepayScopeList(includedList, content.included, "included");
  fillInvoicePrepayScopeList(excludedList, content.excluded, "excluded");

  if (contextNote) {
    const { hasCar, hasPhone } = content.context;
    if (hasCar && hasPhone) {
      contextNote.hidden = false;
      contextNote.textContent = ti("customer.invoice.prepay_scope.context_note_both");
    } else if (hasPhone) {
      contextNote.hidden = false;
      contextNote.textContent = ti("customer.invoice.prepay_scope.context_note_phone");
    } else if (hasCar) {
      contextNote.hidden = false;
      contextNote.textContent = ti("customer.invoice.prepay_scope.context_note_car");
    } else {
      contextNote.hidden = true;
      contextNote.textContent = "";
    }
  }
}

/**
 * @param {Record<string, unknown>} invoice
 * @param {Record<string, unknown>|null} quote
 */
function renderInvoiceAmountSummary(invoice, quote) {
  const section = qs("#invoiceAmountSummarySection");
  const tbody = qs("#invoiceAmountSummaryTbody");
  const tfoot = qs("#invoiceAmountSummaryTfoot");
  const fnEl = qs("#invoiceAmountSummaryFootnote");
  if (!section || !tbody || !tfoot) return;

  const sum = getInvoiceBillingSummary(invoice, quote);
  const display = buildInvoiceAmountSummaryDisplay(invoice, quote, sum);
  const cur = display.currency;
  section.hidden = false;
  tbody.innerHTML = "";
  tfoot.innerHTML = "";

  for (const row of display.bodyRows) {
    const label =
      row.label === "__admin_fee__"
        ? t("customer.invoice.amount.row.admin_fee", "Custom coordination support fee")
        : row.label;
    appendAmountSummaryRow(
      tbody,
      label,
      formatAmountSummaryMoney(cur, row.amount, row.negative),
      row.rowClass,
    );
  }

  for (const row of display.footRows) {
    appendAmountSummaryFootRow(
      tfoot,
      amountSummaryLabelForKey(row.labelKey),
      formatAmountSummaryMoney(cur, row.amount, row.negative),
      row.rowClass,
    );
  }

  if (fnEl) {
    if (display.footnote) {
      fnEl.hidden = false;
      fnEl.textContent = display.footnote;
    } else if (display.showSurchargeHint) {
      fnEl.hidden = false;
      fnEl.textContent = ti("customer.invoice.amount.surcharge_hint");
    } else {
      fnEl.hidden = true;
      fnEl.textContent = "";
    }
  }
}

/**
 * 결제 완료(PAID)일 때만 ‘다음 단계’ 패널을 표시한다. 결제 전에는 필수 서류·체크리스트 성격의 상세 안내를 두지 않는다.
 * 직전 결제 성공 API 응답에 서류 건수가 있으면 한 줄 힌트로 표시한다.
 * @param {Record<string, unknown>} invoice
 */
function syncPostPaymentContinuationPanel(invoice) {
  const panel = qs("#invoicePostPayContinuation");
  if (!panel) return;

  const st = String(invoice?.status || "").toUpperCase();
  if (st !== "PAID") {
    panel.hidden = true;
    return;
  }

  panel.hidden = false;

  const stub =
    lastPaymentSuccessApiResult &&
    typeof lastPaymentSuccessApiResult === "object" &&
    lastPaymentSuccessApiResult.document_request_stub;
  const countRaw =
    stub && typeof stub === "object" && stub !== null && "count" in stub ? stub.count : undefined;
  const count = typeof countRaw === "number" ? countRaw : null;

  const hint = qs("#invoicePostPayDocCountHint");
  if (hint) {
    if (count !== null && count > 0) {
      const tpl = ti("customer.invoice.postpay.docs_count");
      hint.hidden = false;
      hint.textContent = tpl.includes("{n}") ? tpl.split("{n}").join(String(count)) : `${tpl} (${count})`;
    } else {
      hint.hidden = true;
      hint.textContent = "";
    }
  }
}

/** 청구서 세부 정보(번호·당사자) wrapper 표시 */
function renderInvoiceDetailsSection() {
  const wrap = qs("#invoiceDetailsSection");
  if (wrap) wrap.hidden = false;
}

function renderAfterPaymentList(invoice) {
  const action = getInvoiceActionState(invoice);
  const paid = action.isPaid;
  const mainH = qs("#invoiceAfterMainHeading");
  const intro = qs("#invoiceAfterIntro");
  const ol = qs("#invoiceAfterList");

  if (mainH) {
    mainH.textContent = t("customer.invoice.next_steps.title", "Next steps after payment");
  }
  if (intro) {
    intro.textContent = paid
      ? ti("customer.invoice.next_steps.intro_paid")
      : t("customer.invoice.next_steps.intro", "After payment, Landing Help AI Agent guidance begins.");
  }
  if (ol) {
    ol.innerHTML = "";
    for (let i = 1; i <= 4; i += 1) {
      const li = document.createElement("li");
      li.textContent = ti(`customer.invoice.next_steps.step.${i}`);
      ol.appendChild(li);
    }
  }

  syncInvoicePageCtas(invoice);
}

/**
 * @param {HTMLDListElement} dl
 * @param {string} label
 * @param {string} value
 * @returns {boolean} true if a row was added
 */
function appendInvoicePartyRow(dl, label, value) {
  const v = String(value || "").trim();
  if (!v) return false;
  const dt = document.createElement("dt");
  dt.className = "lhai-invoice-parties__dt";
  dt.textContent = label;
  const dd = document.createElement("dd");
  dd.className = "lhai-invoice-parties__dd";
  dd.textContent = v;
  dl.appendChild(dt);
  dl.appendChild(dd);
  return true;
}

/**
 * @param {HTMLDListElement} dl
 * @param {string} label
 * @param {string} email
 */
function appendInvoicePartyCustomerEmailRow(dl, label, email) {
  const dt = document.createElement("dt");
  dt.className = "lhai-invoice-parties__dt";
  dt.textContent = label;
  const dd = document.createElement("dd");
  dd.className = "lhai-invoice-parties__dd";
  const v = String(email || "").trim();
  if (v) {
    dd.textContent = v;
  } else {
    dd.textContent = "—";
    dd.classList.add("lhai-invoice-parties__dd--muted");
  }
  dl.appendChild(dt);
  dl.appendChild(dd);
  return true;
}

/** @param {unknown} p */
function billingToPartyHasRows(p) {
  if (!p || typeof p !== "object") return false;
  const o = /** @type {Record<string, unknown>} */ (p);
  return ["full_name", "email", "phone", "company_name", "address"].some((k) => String(o[k] ?? "").trim());
}

/**
 * @param {Record<string, unknown>|null} quote
 * @param {Record<string, unknown>} invoice
 */
function extractBillingToFromQuote(quote, invoice) {
  const empty = { full_name: "", email: "", phone: "", company_name: "", address: "" };
  if (!quote || typeof quote !== "object") return empty;
  const rd = quote.request_details && typeof quote.request_details === "object" ? quote.request_details : {};
  const survey = rd.survey_submission && typeof rd.survey_submission === "object" ? rd.survey_submission : {};
  const common = survey.common_info && typeof survey.common_info === "object" ? survey.common_info : {};
  const profile = rd.profile && typeof rd.profile === "object" ? rd.profile : {};

  const fn = String(common.profile_first_name || "").trim();
  const ln = String(common.profile_last_name || "").trim();
  let fullName = [fn, ln].filter(Boolean).join(" ").trim();
  if (!fullName) fullName = String(common.full_name || common.name || profile.full_name || "").trim();

  let email = String(common.profile_email || common.email || common.contact_email || profile.email || "")
    .trim()
    .toLowerCase();
  if (!email) {
    const cpid = String(invoice.customer_profile_id || "").trim();
    if (cpid.startsWith("profile::")) {
      const tail = cpid.slice("profile::".length).trim();
      if (tail.includes("@")) email = tail.toLowerCase();
    }
  }

  const phone = String(
    common.phone || common.contact_phone || common.mobile || common.tel || profile.phone || "",
  ).trim();
  const company_name = String(common.company_name || profile.company_name || "").trim();
  const address = String(common.address || common.billing_address || common.street_address || "").trim();

  return { full_name: fullName, email, phone, company_name, address };
}

/**
 * @param {Record<string, unknown>} invoice
 * @param {Record<string, unknown>|null} quote
 */
function effectiveBillingTo(invoice, quote) {
  const server = invoice.billing_to;
  if (billingToPartyHasRows(server)) return /** @type {Record<string, string>} */ (server);
  return extractBillingToFromQuote(quote, invoice);
}

/**
 * @param {Record<string, unknown>} invoice
 */
function normalizeBillingFrom(invoice) {
  const raw = invoice.billing_from;
  const o = raw && typeof raw === "object" ? /** @type {Record<string, unknown>} */ (raw) : {};
  const brand = t("common.header.brand.customer", "Landing Help AI");
  return {
    legal_name: String(o.legal_name || "").trim() || brand,
    registered_address: String(o.registered_address || "").trim(),
    email: String(o.email || "").trim(),
    phone: String(o.phone || "").trim(),
    tax_id: String(o.tax_id || "").trim(),
  };
}

/**
 * @param {Record<string, unknown>} invoice
 * @param {Record<string, unknown>|null} quote
 */
function renderInvoiceParties(invoice, quote) {
  const section = qs("#invoicePartiesSection");
  const fromDl = qs("#invoicePartyFromDl");
  const toDl = qs("#invoicePartyToDl");
  const fromEmpty = qs("#invoicePartyFromEmpty");
  const toEmpty = qs("#invoicePartyToEmpty");
  if (!section || !fromDl || !toDl) return;

  fromDl.innerHTML = "";
  toDl.innerHTML = "";
  if (fromEmpty) fromEmpty.hidden = true;
  if (toEmpty) toEmpty.hidden = true;

  const from = normalizeBillingFrom(invoice);
  let fromRows = 0;
  fromRows += appendInvoicePartyRow(fromDl, ti("customer.invoice.parties.from.legal_name"), from.legal_name) ? 1 : 0;
  fromRows += appendInvoicePartyRow(fromDl, ti("customer.invoice.parties.from.address"), from.registered_address)
    ? 1
    : 0;
  fromRows += appendInvoicePartyRow(fromDl, ti("customer.invoice.parties.from.email"), from.email) ? 1 : 0;
  fromRows += appendInvoicePartyRow(fromDl, ti("customer.invoice.parties.from.phone"), from.phone) ? 1 : 0;
  fromRows += appendInvoicePartyRow(fromDl, ti("customer.invoice.parties.from.tax_id"), from.tax_id) ? 1 : 0;
  if (fromRows === 0 && fromEmpty) fromEmpty.hidden = false;

  const to = effectiveBillingTo(invoice, quote);
  let toRows = 0;
  appendInvoicePartyCustomerEmailRow(toDl, ti("customer.invoice.parties.to.email"), to.email);
  toRows += 1;
  toRows += appendInvoicePartyRow(toDl, ti("customer.invoice.parties.to.full_name"), to.full_name) ? 1 : 0;
  toRows += appendInvoicePartyRow(toDl, ti("customer.invoice.parties.to.company"), to.company_name) ? 1 : 0;
  toRows += appendInvoicePartyRow(toDl, ti("customer.invoice.parties.to.phone"), to.phone) ? 1 : 0;
  toRows += appendInvoicePartyRow(toDl, ti("customer.invoice.parties.to.address"), to.address) ? 1 : 0;
  if (toRows === 0 && toEmpty) toEmpty.hidden = false;
}

/**
 * @param {Record<string, unknown>} invoice
 * @param {Record<string, unknown>|null} quote
 * @param {ReturnType<typeof getInvoiceBillingSummary>} summary
 */
function renderInvoiceHero(invoice, quote, summary) {
  const hero = qs("#invoiceHero");
  const heroTitle = qs("#invoiceHeroTitle");
  const heroSubtitle = qs("#invoiceHeroSubtitle");
  const heroWeb = qs("#invoiceHeroWebNote");
  const heroBadge = qs("#invoiceHeroStatusBadge");
  const requestLabel = qs("#invoiceHeroRequestLabel");
  const requestSummary = qs("#invoiceHeroRequestSummary");
  const billedLabel = qs("#invoiceHeroBilledLabel");
  const billedServices = qs("#invoiceHeroBilledServices");
  const reassurance = qs("#invoiceHeroReassurance");
  const statusMsg = qs("#invoiceHeroStatusMessage");
  const amtEl = qs("#invoiceHeroAmountDue");
  const amtLabel = qs("#invoiceHeroAmountLabel");
  const amtEyebrow = qs("#invoiceHeroAmountEyebrow");
  const costCard = qs("#invoiceHeroCostCard");

  const action = getInvoiceActionState(invoice);
  const st = action.status;
  const settledAmount = action.isPaid || (action.isUnpayable && st === "CANCELED");

  const heroAmount = settledAmount ? summary.invoice_total : summary.current_payable_amount;
  if (amtEl) amtEl.textContent = formatMoney(heroAmount, summary.currency);

  if (hero) {
    hero.hidden = false;
    hero.classList.remove("lhai-invoice-hero--pending", "lhai-invoice-hero--paid", "lhai-invoice-hero--unpayable");
    if (action.isPaid) hero.classList.add("lhai-invoice-hero--paid");
    else if (action.isUnpayable || action.isUnknown) hero.classList.add("lhai-invoice-hero--unpayable");
    else hero.classList.add("lhai-invoice-hero--pending");
  }
  if (heroTitle) heroTitle.textContent = heroTitleForAction(action);
  if (heroBadge) {
    heroBadge.className = heroStatusBadgeClass(st);
    heroBadge.textContent = statusLabel(st);
  }
  if (requestLabel) {
    requestLabel.textContent = t("customer.invoice.hero.request_label", "Request summary");
  }
  if (requestSummary) requestSummary.textContent = heroRequestSummaryText(quote, invoice);
  if (billedLabel) {
    billedLabel.textContent = t("customer.invoice.hero.billed_services_label", "Services on this invoice");
  }
  if (billedServices) billedServices.textContent = heroBilledServicesText(quote, invoice);

  if (reassurance) {
    const showReassurance =
      action.isPendingPayment && action.status !== "FAILED";
    if (showReassurance) {
      reassurance.hidden = false;
      reassurance.textContent = ti("customer.invoice.hero.reassurance");
    } else {
      reassurance.hidden = true;
      reassurance.textContent = "";
    }
  }

  if (statusMsg) {
    statusMsg.classList.remove(
      "lhai-quote-hero__status-message--paid",
      "lhai-quote-hero__status-message--rejected",
    );
    if (action.isPaid) {
      statusMsg.hidden = false;
      statusMsg.classList.add("lhai-quote-hero__status-message--paid");
      statusMsg.textContent = ti("customer.invoice.hero.status_paid");
    } else if (action.isUnpayable) {
      statusMsg.hidden = false;
      statusMsg.classList.add("lhai-quote-hero__status-message--rejected");
      statusMsg.textContent = ti("customer.invoice.hero.status_unpayable");
    } else if (action.isUnknown) {
      statusMsg.hidden = false;
      statusMsg.classList.add("lhai-quote-hero__status-message--rejected");
      statusMsg.textContent = ti("customer.invoice.hero.status_unknown");
    } else {
      statusMsg.hidden = true;
      statusMsg.textContent = "";
    }
  }

  if (heroSubtitle) {
    const sub = heroSubtitleForStatus(st);
    if (action.status === "FAILED" && sub) {
      heroSubtitle.hidden = false;
      heroSubtitle.textContent = sub;
    } else {
      heroSubtitle.hidden = true;
      heroSubtitle.textContent = "";
    }
  }

  if (heroWeb) {
    heroWeb.textContent = ti("customer.invoice.hero.web_only");
    heroWeb.hidden = !action.showPay;
  }
  if (amtLabel) {
    if (action.isPaid) {
      amtLabel.textContent = ti("customer.invoice.hero.amount_label_paid");
    } else if (action.isUnpayable && st === "CANCELED") {
      amtLabel.textContent = ti("customer.invoice.hero.amount_label_canceled");
    } else if (action.isUnpayable || action.isUnknown) {
      amtLabel.textContent = ti("customer.invoice.hero.amount_label_canceled");
    } else {
      amtLabel.textContent = ti("customer.invoice.hero.amount_label");
    }
  }
  if (amtEyebrow) {
    if (action.isPaid) {
      amtEyebrow.textContent = ti("customer.invoice.hero.amount_eyebrow_paid");
    } else if (action.isUnpayable && st === "CANCELED") {
      amtEyebrow.textContent = ti("customer.invoice.hero.amount_eyebrow_canceled");
    } else if (action.isUnpayable || action.isUnknown) {
      amtEyebrow.textContent = ti("customer.invoice.hero.amount_eyebrow_canceled");
    } else {
      amtEyebrow.textContent = ti("customer.invoice.hero.amount_eyebrow");
    }
  }
  if (costCard) {
    costCard.classList.toggle("lhai-invoice-hero__cost-card--settled", action.isPaid);
    costCard.classList.toggle("lhai-invoice-hero__cost-card--pending", action.showPay);
  }

  syncInvoicePageCtas(invoice);
}

/**
 * @param {Record<string, unknown>} invoice
 * @param {Record<string, unknown>|null} [quote]
 */
function renderInvoice(invoice, quote = null) {
  activeInvoiceRef = invoice;
  activeInvoiceQuoteRef = quote;
  const st = String(invoice.status || "").toUpperCase();
  const summary = getInvoiceBillingSummary(invoice, quote);

  renderInvoiceHero(invoice, quote, summary);

  const payBtn = qs("#payNowBtn");
  if (payBtn) payBtn.textContent = t("customer.invoice.pay_button", "Pay now");

  const qid = invoice && String(invoice.quote_id || "").trim();
  const quoteLink = qs("#invoiceViewQuoteLink");
  if (quoteLink) {
    if (qid) {
      quoteLink.hidden = false;
      quoteLink.href = `../pages/quote-detail.html?quote_id=${encodeURIComponent(qid)}`;
    } else {
      quoteLink.hidden = true;
      quoteLink.removeAttribute("href");
    }
  }

  const pdfRaw = String(
    (invoice && (invoice.invoice_pdf_url || invoice.pdf_url || invoice.customer_pdf_url)) || ""
  ).trim();
  const pdfLink = qs("#invoicePdfLink");
  if (pdfLink) {
    let pdfHref = "";
    if (pdfRaw) {
      try {
        pdfHref = new URL(pdfRaw, window.location.origin).href;
      } catch {
        pdfHref = "";
      }
    }
    if (pdfHref) {
      pdfLink.hidden = false;
      pdfLink.href = pdfHref;
    } else {
      pdfLink.hidden = true;
      pdfLink.removeAttribute("href");
    }
  }

  try {
    document.title = `${heroTitleForAction(getInvoiceActionState(invoice))} · ${t("customer.invoice.page_title", "Invoice")} - Landing Help AI`;
  } catch {
    /* non-browser */
  }

  renderInvoiceScopeSection(invoice, quote);
  renderInvoiceAmountSummary(invoice, quote);
  renderInvoicePrepayScopeSection(invoice, quote);
  renderAfterPaymentList(invoice);
  renderInvoiceMeta(invoice, quote);
  renderInvoiceParties(invoice, quote);
  renderInvoiceDetailsSection();
  syncPostPaymentContinuationPanel(invoice);
}

/**
 * @returns {Promise<{ invoice: Record<string, unknown>, quote: Record<string, unknown> | null }>}
 */
async function resolveInvoiceForDisplay(invoiceId) {
  let invoice = await invoiceApi.getDetail(invoiceId);
  let quote = null;
  const qid = invoice && String(invoice.quote_id || "").trim();
  if (qid) {
    try {
      quote = await quoteApi.getDetail(qid);
    } catch {
      quote = null;
    }
  }
  if (invoice && invoice.quote_id && invoice.mocked && quote && Number.isFinite(Number(quote.estimated_cost))) {
    invoice = {
      ...invoice,
      amount_due: Number(quote.estimated_cost),
      service_name:
        quote.display_service_name || quote.service_name || invoice.display_service_name || invoice.service_name,
      display_service_name:
        quote.display_service_name || invoice.display_service_name || quote.service_name || invoice.service_name,
      currency: quote.currency || invoice.currency,
    };
  }
  return { invoice, quote };
}

/**
 * URL·localStorage에 유효한 id가 없거나 상세 로드가 실패한 뒤, 현재 세션 고객의 최신 비초안 청구서를 고릅니다.
 * (사이드바 "청구서"는 `invoice_id` 없이 열립니다.)
 *
 * @returns {Promise<{ invoice: Record<string, unknown>, quote: Record<string, unknown> | null } | null>}
 */
async function fetchLatestCustomerInvoiceDetail() {
  const profileId = getCustomerMessagingProfileId();
  try {
    const rows = await invoiceApi.list("", profileId);
    const visible = (Array.isArray(rows) ? rows : []).filter(
      (inv) => String(inv?.status || "").toUpperCase() !== "DRAFT"
    );
    visible.sort((a, b) => {
      const ta = new Date(a?.created_at || 0).getTime();
      const tb = new Date(b?.created_at || 0).getTime();
      return tb - ta;
    });
    const pick = visible[0];
    if (!pick?.id) return null;
    return await resolveInvoiceForDisplay(String(pick.id));
  } catch {
    return null;
  }
}

function renderPaymentResult(result, success) {
  const section = qs("#paymentResultSection");
  const message = qs("#paymentResultMessage");
  const detail = qs("#paymentResultDetail");
  if (!section || !message) return;
  section.style.display = "block";
  message.textContent = result.message || (success ? ti("customer.invoice.pay_success") : "");
  if (detail) {
    if (success) {
      detail.hidden = false;
      detail.textContent = ti("customer.invoice.result_success_detail");
    } else {
      detail.hidden = true;
      detail.textContent = "";
    }
  }
}

const MARK_SUCCESS_SESSION_PREFIX = "lhai_payment_mark_success_done:";

/**
 * Stripe·mock 체크아웃이 ``success_url``로 돌아온 뒤: ``payment_id`` + ``result=success`` 로 결제 확정 API를 한 번 호출한다.
 * (페이지를 직접 열었을 때만 ``markSuccess`` 하던 기존 동작의 빈틈을 맞춘다.)
 */
async function maybeCompletePaymentFromReturnUrl(invoiceId) {
  const params = new URLSearchParams(window.location.search);
  const pid = (params.get("payment_id") || params.get("paymentId") || "").trim();
  const resultRaw = (params.get("result") || "").trim().toLowerCase();
  const result = resultRaw.split("?")[0].trim();
  if (!pid || result !== "success" || !invoiceId) return;
  const key = `${MARK_SUCCESS_SESSION_PREFIX}${pid}`;
  if (window.sessionStorage.getItem(key)) return;
  try {
    await handlePaymentSuccess(pid, String(invoiceId));
    window.sessionStorage.setItem(key, "1");
    try {
      const u = new URL(window.location.href);
      u.searchParams.delete("payment_id");
      u.searchParams.delete("paymentId");
      u.searchParams.delete("result");
      u.searchParams.delete("mock_payment");
      u.searchParams.delete("ref");
      history.replaceState(null, "", u);
    } catch {
      /* non-browser */
    }
  } catch {
    setMessage(ti("customer.invoice.pay_error"));
  }
}

async function handlePaymentSuccess(paymentId, invoiceId) {
  const result = await paymentApi.markSuccess(paymentId);
  if (!result) return;
  lastPaymentSuccessApiResult = result;
  renderPaymentResult(result, true);
  patchState({
    dashboardSummary: {
      paymentStatus: result.payment_status,
      lastInvoiceId: result.invoice_id,
    },
    postPayment: {
      checklistStub: result.checklist_stub,
      documentRequestStub: result.document_request_stub,
      inAppMessageStub: result.in_app_message_stub,
      emailLogsStub: result.email_logs_stub || [],
    },
  });
  window.localStorage.setItem(
    "lhai_dashboard_summary",
    JSON.stringify({
      paymentStatus: result.payment_status,
      lastInvoiceId: result.invoice_id,
    })
  );
  window.localStorage.setItem("lhai_latest_invoice_id", String(invoiceId));
  const refreshed = await resolveInvoiceForDisplay(invoiceId);
  renderInvoice(refreshed.invoice, refreshed.quote);
  lastPaymentSuccessApiResult = null;
  try {
    qs("#invoicePostPayContinuation")?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  } catch {
    /* non-browser */
  }
}

async function bootstrapInvoicePageShellI18n() {
  applyInvoicePageLocaleBundle();
  applyI18nToDom(document);
  await flushRuntimeMissingKeysAfterPageApply();
}

async function refetchInvoiceDetailForViewerLocale() {
  const invoiceId = String(activeInvoiceRef?.id || "").trim();
  if (!invoiceId) return true;
  const previousInvoice = activeInvoiceRef;
  const previousQuote = activeInvoiceQuoteRef;
  try {
    const resolved = await resolveInvoiceForDisplay(invoiceId);
    activeInvoiceRef = resolved.invoice;
    activeInvoiceQuoteRef = resolved.quote;
    patchState({ invoice: resolved.invoice });
    return true;
  } catch {
    activeInvoiceRef = previousInvoice;
    activeInvoiceQuoteRef = previousQuote;
    if (previousInvoice) patchState({ invoice: previousInvoice });
    return false;
  }
}

/** Runtime i18n keys resolved: rerender cached invoice from local bundle only (no API). */
function refreshInvoicePageStaticFromCache() {
  if (invoiceViewerLocaleRefetchInFlight || !activeInvoiceRef) return;
  applyInvoicePageLocaleBundle();
  const preserve = readInvoicePagePreserve();
  renderInvoice(activeInvoiceRef, activeInvoiceQuoteRef);
  syncInvoicePayButtonsVisibility(activeInvoiceRef);
  applyI18nToDom(document);
  restoreInvoicePagePreserve(preserve);
  void flushRuntimeMissingKeysAfterPageApply();
}

async function refreshInvoicePageForViewerLanguage() {
  if (invoiceViewerLocaleRefetchInFlight) return;
  invoiceViewerLocaleRefetchInFlight = true;
  try {
    const preserve = readInvoicePagePreserve();
    applyInvoicePageLocaleBundle();
    try {
      await reloadI18nForLanguage(getEffectiveLanguage(), INVOICE_I18N_DOMAINS);
    } catch {
      /* keep merged locale bundle fallbacks */
    }
    let refetchOk = true;
    if (activeInvoiceRef?.id) {
      refetchOk = await refetchInvoiceDetailForViewerLocale();
    }
    applyI18nToDom(document);
    rerenderInvoicePageFromCache();
    restoreInvoicePagePreserve(preserve);
    if (!refetchOk && activeInvoiceRef && !invoicePaymentInFlight) {
      setMessage(ti("customer.invoice.locale_refresh_failed"));
    }
    await flushRuntimeMissingKeysAfterPageApply();
  } finally {
    invoiceViewerLocaleRefetchInFlight = false;
  }
}

wireDynamicPageI18nRefresh(() => {
  void refreshInvoicePageForViewerLanguage();
}, { languageChangeOnly: true });

wireDynamicPageI18nRefresh(refreshInvoicePageStaticFromCache, {
  runtimeResolvedOnly: true,
  keyPrefixes: ["customer.invoice.", "invoice.", "common."],
});

async function initInvoiceDetailPage() {
  if (!protectCurrentPage()) return;
  if (!ensureCustomerAccess()) return;
  applyUiLanguageFromUrlQuery();

  await bootAppPageContent(INVOICE_I18N_DOMAINS, async () => {
  const params = new URLSearchParams(window.location.search);
  const invoiceIdFromUrl = (
    params.get("invoice_id") ||
    params.get("invoiceId") ||
    params.get("id") ||
    ""
  ).trim();
  const invoiceIdFromStore = window.localStorage.getItem("lhai_latest_invoice_id") || "";

  await loadSidebar("#sidebar", "customer");

  const missing = qs("#invoiceMissingState");
  const main = qs("#invoiceMainCard");

  /** @type {{ invoice: Record<string, unknown>, quote: Record<string, unknown> | null } | null} */
  let resolved = null;
  if (invoiceIdFromUrl) {
    try {
      resolved = await resolveInvoiceForDisplay(invoiceIdFromUrl);
    } catch {
      resolved = null;
    }
  }
  if (!resolved) {
    const storeId = (invoiceIdFromStore || "").trim();
    if (storeId) {
      try {
        resolved = await resolveInvoiceForDisplay(storeId);
      } catch {
        window.localStorage.removeItem("lhai_latest_invoice_id");
        resolved = null;
      }
    }
  }
  if (!resolved) {
    resolved = await fetchLatestCustomerInvoiceDetail();
  }

  if (!resolved?.invoice?.id) {
    await bootstrapInvoicePageShellI18n();
    if (missing) missing.hidden = false;
    if (main) main.hidden = true;
    await resolveAppHeaderShell({ variant: "customer" });
    refreshHeaderMailUnreadBadge().catch(() => {});
    return;
  }

  if (missing) missing.hidden = true;
  if (main) main.hidden = false;

  const loadErr = qs("#invoiceLoadError");
  if (loadErr) loadErr.hidden = true;

  const invoice = resolved.invoice;
  const quote = resolved.quote;

  if (!invoiceIdFromUrl && invoice?.id) {
    try {
      const u = new URL(window.location.href);
      u.searchParams.set("invoice_id", String(invoice.id));
      history.replaceState(null, "", u);
    } catch {
      /* non-browser */
    }
  }
  window.localStorage.setItem("lhai_latest_invoice_id", String(invoice.id));

  await bootstrapInvoicePageShellI18n();

  patchState({ invoice });
  renderInvoice(invoice, quote);
  await maybeCompletePaymentFromReturnUrl(String(invoice.id));

  await resolveAppHeaderShell({ variant: "customer" });
  refreshHeaderMailUnreadBadge().catch(() => {});

  const onPayClick = () => {
    if (activeInvoiceRef) runInvoiceWebPayment(activeInvoiceRef);
  };
  for (const sel of INVOICE_PAY_BTN_SELECTORS) {
    const btn = qs(sel);
    if (!btn || btn.dataset.invoicePayBound === "1") continue;
    btn.dataset.invoicePayBound = "1";
    btn.addEventListener("click", onPayClick);
  }
  });
}

initInvoiceDetailPage();

export { initInvoiceDetailPage };
