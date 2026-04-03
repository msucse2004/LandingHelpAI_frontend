import { invoiceApi, paymentApi, quoteApi } from "../core/api.js";
import { ensureCustomerAccess, protectCurrentPage } from "../core/guards.js";
import { patchState } from "../core/state.js";
import { loadSidebar } from "../components/sidebar.js";
import { applyI18nToDom } from "../core/i18n-dom.js";
import { initI18nDomains, mergeFallbackStrings, t } from "../core/i18n-client.js";
import { formatMoney } from "../core/utils.js";
import { resolveAppHeaderShell, refreshHeaderMailUnreadBadge } from "../core/app-header.js";
import { getInvoiceLocaleBundle, resolveInvoiceUiLang } from "./invoice-detail-locale.js";

function qs(selector) {
  return document.querySelector(selector);
}

function setMessage(message) {
  const el = qs("#invoiceStatusMessage");
  if (el) el.textContent = message || "";
}

function statusClass(status) {
  if (status === "PAID") return "lhai-badge lhai-badge--risk-low";
  if (status === "FAILED") return "lhai-badge lhai-badge--risk-high";
  if (status === "CANCELED") return "lhai-badge lhai-badge--risk-medium";
  if (status === "SENT") return "lhai-badge lhai-badge--risk-medium";
  return "lhai-badge";
}

function statusLabel(status) {
  const st = String(status || "").toUpperCase();
  const key = `customer.invoice.status.${st}`;
  const tr = t(key, "");
  if (tr && tr !== key) return tr;
  return t("customer.invoice.status._fallback", st || "—");
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

/**
 * @param {unknown} value
 * @param {string} lang
 */
function formatInvoiceCalendarDate(value, lang) {
  const d = parseIsoOrDateOnlyToLocalDate(value);
  if (!d) return "";
  const loc = lang === "en" ? "en-US" : "ko-KR";
  return new Intl.DateTimeFormat(loc, { dateStyle: "long" }).format(d);
}

/**
 * @param {HTMLDListElement} dl
 * @param {string} label
 * @param {unknown} value
 */
function appendInvoiceMetaMonoRow(dl, label, value) {
  const dt = document.createElement("dt");
  dt.className = "lhai-invoice-meta__dt";
  dt.textContent = label;
  const dd = document.createElement("dd");
  dd.className = "lhai-invoice-meta__dd lhai-invoice-meta__dd--mono";
  dd.textContent = String(value ?? "").trim() || "—";
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
  const section = qs("#invoiceMetaSection");
  const issueEl = qs("#invoiceMetaIssueDate");
  const dueEl = qs("#invoiceMetaDueDate");
  const dl = qs("#invoiceMetaDl");
  if (!section || !issueEl || !dueEl || !dl) return;

  const lang = resolveInvoiceUiLang(quote);
  section.hidden = false;
  dl.innerHTML = "";

  const issueFmt = formatInvoiceCalendarDate(invoice.created_at, lang);
  issueEl.textContent = issueFmt || "—";
  issueEl.classList.toggle("lhai-invoice-meta__date-value--muted", !issueFmt);

  const dueStr = String(invoice.due_date || "").trim();
  if (dueStr) {
    dueEl.textContent = formatInvoiceCalendarDate(dueStr, lang) || dueStr;
    dueEl.classList.remove("lhai-invoice-meta__date-value--muted");
  } else {
    dueEl.textContent = t("customer.invoice.meta.due_not_set", "");
    dueEl.classList.add("lhai-invoice-meta__date-value--muted");
  }

  const invNum = String(invoice.invoice_number || invoice.id || "").trim();
  appendInvoiceMetaMonoRow(dl, t("customer.invoice.meta.invoice_number", ""), invNum || "—");
  const qref = String(invoice.quote_id || "").trim();
  if (qref) {
    appendInvoiceMetaMonoRow(dl, t("customer.invoice.meta.quote_reference", ""), qref);
  }
  appendInvoiceMetaStatusRow(dl, t("customer.invoice.meta.payment_status", ""), invoice);
  const cur = String(invoice.currency || "USD").trim().toUpperCase() || "USD";
  appendInvoiceMetaMonoRow(dl, t("customer.invoice.meta.currency", ""), cur);
}

/** @param {string} st */
function heroTitleForStatus(st) {
  const u = String(st || "").toUpperCase();
  if (u === "PAID") return t("customer.invoice.hero.title_paid", "");
  if (u === "CANCELED") return t("customer.invoice.hero.title_canceled", "");
  if (u === "FAILED") return t("customer.invoice.hero.title_failed", "");
  return t("customer.invoice.hero.title_payment_needed", "");
}

/** @param {string} st */
function heroSubtitleForStatus(st) {
  const u = String(st || "").toUpperCase();
  if (u === "PAID") return t("customer.invoice.hero.subtitle_paid", "");
  if (u === "CANCELED") return t("customer.invoice.hero.subtitle_canceled", "");
  if (u === "FAILED") return t("customer.invoice.hero.subtitle_failed", "");
  return t("customer.invoice.hero.subtitle_default", "");
}

function deliveryKo(mode) {
  const raw = String(mode || "general").toLowerCase();
  const map = {
    ai_guide: t("common.service_flow.delivery.ai_guide.badge", "AI 안내"),
    in_person: t("common.service_flow.delivery.in_person.badge", "대면·현장 지원"),
    ai_plus_human: t("common.service_flow.delivery.ai_plus_human.badge", "AI + 필요 시 사람 도움"),
    general: t("common.service_flow.delivery.general.badge", "안내형 서비스"),
  };
  return map[raw] || map.general;
}

/**
 * 설문에서 선택된 서비스 줄만 (고객 안내 문단은 별도 블록).
 * @param {unknown} quote
 * @returns {string[]}
 */
function scopeServiceLinesFromQuote(quote) {
  const lines = [];
  if (!quote || typeof quote !== "object") return lines;

  const rd = quote.request_details && typeof quote.request_details === "object" ? quote.request_details : {};
  const survey = rd.survey_submission && typeof rd.survey_submission === "object" ? rd.survey_submission : {};
  const services = Array.isArray(survey.selected_services) ? survey.selected_services : [];
  for (const s of services) {
    if (!s || typeof s !== "object") continue;
    const title = String(s.title || s.id || "").trim();
    if (!title) continue;
    const dm = s.delivery_mode ? String(s.delivery_mode).trim() : "";
    lines.push(dm ? `${title} (${deliveryKo(dm)})` : title);
  }

  return lines;
}

/**
 * 견적 제목 또는 견적 라인 설명으로 짧은 요약 생성.
 * @param {unknown} quote
 * @param {string} packageName
 */
function shortServiceDescriptionFromQuote(quote, packageName) {
  if (!quote || typeof quote !== "object") return "";
  const pkgNorm = String(packageName || "").trim().toLowerCase();
  const title = String(quote.title || "").trim();
  if (title && title.toLowerCase() !== pkgNorm) return title;

  const items = Array.isArray(quote.items) ? quote.items : [];
  const parts = [];
  for (const it of items) {
    if (!it || typeof it !== "object") continue;
    const d = String(it.description || "").trim();
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
  const svcNameEl = qs("#invoiceScopeServiceName");
  const descBlock = qs("#invoiceScopeDescriptionBlock");
  const descEl = qs("#invoiceScopeDescription");
  const noteBlock = qs("#invoiceScopeNoteBlock");
  const noteEl = qs("#invoiceScopeCustomerNote");
  const ul = qs("#invoiceScopeList");
  const quoteNoteEl = qs("#invoiceScopeQuoteNote");
  if (!section || !svcNameEl || !ul) return;

  section.hidden = false;
  const pkg = String(invoice.service_name || "").trim() || "—";
  svcNameEl.textContent = pkg;

  let shortDesc = shortServiceDescriptionFromQuote(quote, pkg);
  const facing = quote && typeof quote === "object" ? String(quote.customer_facing_note || "").trim() : "";
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

  ul.innerHTML = "";
  const serviceLines = scopeServiceLinesFromQuote(quote);
  if (!serviceLines.length) {
    const li = document.createElement("li");
    li.textContent = t("customer.invoice.scope.empty", "");
    ul.appendChild(li);
  } else {
    for (const line of serviceLines) {
      const li = document.createElement("li");
      li.textContent = line;
      ul.appendChild(li);
    }
  }

  if (quoteNoteEl) {
    const qid = quote && String(quote.id || "").trim();
    const invQ = String(invoice.quote_id || "").trim();
    if (qid && invQ && qid === invQ) {
      quoteNoteEl.hidden = false;
      quoteNoteEl.textContent = t("customer.invoice.scope.quote_note", "").replace(/%s/g, qid);
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
  let subtotalLines;
  let base;
  let addons;
  if (items.length) {
    subtotalLines = roundMoney2(items.reduce((acc, it) => acc + Number(it.line_total || 0), 0));
    base = roundMoney2(Number(items[0].line_total) || 0);
    addons = roundMoney2(Math.max(subtotalLines - base, 0));
  } else {
    const est = Math.max(roundMoney2(quote.estimated_cost), 0);
    subtotalLines = est;
    base = est;
    addons = 0;
  }

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
    surcharges_amount: roundMoney2(raw.surcharges_amount ?? 0),
    taxes_and_fees_amount: roundMoney2(raw.taxes_and_fees_amount),
    subtotal_excluding_tax: roundMoney2(raw.subtotal_excluding_tax),
    invoice_total: roundMoney2(raw.invoice_total),
    amount_already_paid: roundMoney2(raw.amount_already_paid),
    current_payable_amount: roundMoney2(raw.current_payable_amount),
    reconciliation_note: String(raw.reconciliation_note || "").trim(),
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
  const cur = sum.currency;
  section.hidden = false;
  tbody.innerHTML = "";
  tfoot.innerHTML = "";

  appendAmountSummaryRow(tbody, t("customer.invoice.amount.row.base", ""), formatMoney(sum.base_service_amount, cur));

  if (sum.add_ons_amount > 0.005) {
    appendAmountSummaryRow(tbody, t("customer.invoice.amount.row.addons", ""), formatMoney(sum.add_ons_amount, cur));
  }

  const showPreTaxSubtotal =
    sum.add_ons_amount > 0.005 ||
    sum.taxes_and_fees_amount > 0.005 ||
    sum.discounts_amount > 0.005 ||
    sum.surcharges_amount > 0.005;

  if (showPreTaxSubtotal) {
    appendAmountSummaryRow(
      tbody,
      t("customer.invoice.amount.row.subtotal_pre_tax", ""),
      formatMoney(sum.subtotal_excluding_tax, cur),
    );
  }

  if (sum.taxes_and_fees_amount > 0.005) {
    appendAmountSummaryRow(
      tbody,
      t("customer.invoice.amount.row.tax", ""),
      formatMoney(sum.taxes_and_fees_amount, cur),
    );
  }

  if (sum.discounts_amount > 0.005) {
    const disc = formatMoney(sum.discounts_amount, cur);
    appendAmountSummaryRow(
      tbody,
      t("customer.invoice.amount.row.discount", ""),
      disc.startsWith("-") ? disc : `−${disc}`,
    );
  }

  if (sum.surcharges_amount > 0.005) {
    appendAmountSummaryRow(
      tbody,
      t("customer.invoice.amount.row.surcharge", ""),
      formatMoney(sum.surcharges_amount, cur),
    );
  }

  appendAmountSummaryRow(
    tbody,
    t("customer.invoice.amount.row.invoice_total", ""),
    formatMoney(sum.invoice_total, cur),
    "lhai-invoice-amount-summary__row--total",
  );

  if (sum.amount_already_paid > 0.005) {
    appendAmountSummaryFootRow(
      tfoot,
      t("customer.invoice.amount.row.amount_paid", ""),
      formatMoney(sum.amount_already_paid, cur),
      "lhai-invoice-amount-summary__row--paid",
    );
  }

  const st = String(invoice.status || "").toUpperCase();
  const payableLabel =
    st === "PAID"
      ? t("customer.invoice.amount.row.balance_remaining", "")
      : t("customer.invoice.amount.row.current_payable", "");

  appendAmountSummaryFootRow(
    tfoot,
    payableLabel,
    formatMoney(sum.current_payable_amount, cur),
    "lhai-invoice-amount-summary__row--payable",
  );

  if (fnEl) {
    const note = sum.reconciliation_note;
    if (note) {
      fnEl.hidden = false;
      fnEl.textContent = note;
    } else if (sum.surcharges_amount > 0.005) {
      fnEl.hidden = false;
      fnEl.textContent = t("customer.invoice.amount.surcharge_hint", "");
    } else {
      fnEl.hidden = true;
      fnEl.textContent = "";
    }
  }
}

function renderAfterPaymentList() {
  const ol = qs("#invoiceAfterList");
  if (!ol) return;
  ol.innerHTML = "";
  for (let i = 1; i <= 5; i += 1) {
    const li = document.createElement("li");
    li.textContent = t(`customer.invoice.after.${i}`, "");
    ol.appendChild(li);
  }
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

  section.hidden = false;
  fromDl.innerHTML = "";
  toDl.innerHTML = "";
  if (fromEmpty) fromEmpty.hidden = true;
  if (toEmpty) toEmpty.hidden = true;

  const from = normalizeBillingFrom(invoice);
  let fromRows = 0;
  fromRows += appendInvoicePartyRow(fromDl, t("customer.invoice.parties.from.legal_name", ""), from.legal_name) ? 1 : 0;
  fromRows += appendInvoicePartyRow(fromDl, t("customer.invoice.parties.from.address", ""), from.registered_address)
    ? 1
    : 0;
  fromRows += appendInvoicePartyRow(fromDl, t("customer.invoice.parties.from.email", ""), from.email) ? 1 : 0;
  fromRows += appendInvoicePartyRow(fromDl, t("customer.invoice.parties.from.phone", ""), from.phone) ? 1 : 0;
  fromRows += appendInvoicePartyRow(fromDl, t("customer.invoice.parties.from.tax_id", ""), from.tax_id) ? 1 : 0;
  if (fromRows === 0 && fromEmpty) fromEmpty.hidden = false;

  const to = effectiveBillingTo(invoice, quote);
  let toRows = 0;
  toRows += appendInvoicePartyRow(toDl, t("customer.invoice.parties.to.full_name", ""), to.full_name) ? 1 : 0;
  toRows += appendInvoicePartyRow(toDl, t("customer.invoice.parties.to.company", ""), to.company_name) ? 1 : 0;
  toRows += appendInvoicePartyRow(toDl, t("customer.invoice.parties.to.email", ""), to.email) ? 1 : 0;
  toRows += appendInvoicePartyRow(toDl, t("customer.invoice.parties.to.phone", ""), to.phone) ? 1 : 0;
  toRows += appendInvoicePartyRow(toDl, t("customer.invoice.parties.to.address", ""), to.address) ? 1 : 0;
  if (toRows === 0 && toEmpty) toEmpty.hidden = false;
}

/**
 * @param {Record<string, unknown>} invoice
 * @param {Record<string, unknown>|null} [quote]
 */
function renderInvoice(invoice, quote = null) {
  const hero = qs("#invoiceHero");
  const heroTitle = qs("#invoiceHeroTitle");
  const heroSubtitle = qs("#invoiceHeroSubtitle");
  const heroWeb = qs("#invoiceHeroWebNote");
  const svcEl = qs("#invoiceHeroServiceName");
  const amtEl = qs("#invoiceHeroAmountDue");
  const amtLabel = qs("#invoiceHeroAmountLabel");
  const amtEyebrow = qs("#invoiceHeroAmountEyebrow");
  const costCard = qs("#invoiceHeroCostCard");

  const st = String(invoice.status || "").toUpperCase();
  const summary = getInvoiceBillingSummary(invoice, quote);
  const paidOrCanceled = st === "PAID" || st === "CANCELED";

  if (svcEl) svcEl.textContent = invoice.service_name || "-";
  const heroAmount =
    st === "PAID" || st === "CANCELED" ? summary.invoice_total : summary.current_payable_amount;
  if (amtEl) amtEl.textContent = formatMoney(heroAmount, summary.currency);

  if (hero) hero.hidden = false;
  if (heroTitle) heroTitle.textContent = heroTitleForStatus(st);
  if (heroSubtitle) heroSubtitle.textContent = heroSubtitleForStatus(st);
  if (heroWeb) {
    heroWeb.textContent = t("customer.invoice.hero.web_only", "");
    heroWeb.hidden = paidOrCanceled;
  }
  if (amtLabel) {
    if (st === "PAID") {
      amtLabel.textContent = t("customer.invoice.hero.amount_label_paid", "");
    } else if (st === "CANCELED") {
      amtLabel.textContent = t("customer.invoice.hero.amount_label_canceled", "");
    } else {
      amtLabel.textContent = t("customer.invoice.hero.amount_label", "");
    }
  }
  if (amtEyebrow) {
    if (st === "PAID") {
      amtEyebrow.textContent = t("customer.invoice.hero.amount_eyebrow_paid", "");
    } else if (st === "CANCELED") {
      amtEyebrow.textContent = t("customer.invoice.hero.amount_eyebrow_canceled", "");
    } else {
      amtEyebrow.textContent = t("customer.invoice.hero.amount_eyebrow", "");
    }
  }
  if (costCard) {
    costCard.classList.toggle("lhai-invoice-hero__cost-card--settled", st === "PAID");
  }

  const payBtn = qs("#payNowBtn");
  const payBlock = qs("#invoicePayBlock");
  if (payBtn) {
    payBtn.disabled = st === "PAID" || st === "CANCELED";
    payBtn.hidden = st === "PAID" || st === "CANCELED";
  }
  if (payBlock) {
    payBlock.hidden = paidOrCanceled;
  }

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
    document.title = `${heroTitleForStatus(st)} · ${t("customer.invoice.page_title", "청구서")} - Landing Help AI`;
  } catch {
    /* non-browser */
  }

  renderInvoiceMeta(invoice, quote);
  renderInvoiceParties(invoice, quote);
  renderInvoiceScopeSection(invoice, quote);
  renderInvoiceAmountSummary(invoice, quote);
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
  if (invoice && invoice.quote_id && invoice.mocked && quote && Number.isFinite(Number(q.estimated_cost))) {
    invoice = {
      ...invoice,
      amount_due: Number(q.estimated_cost),
      service_name: q.service_name || invoice.service_name,
      currency: q.currency || invoice.currency,
    };
  }
  return { invoice, quote };
}

function renderPaymentResult(result, success) {
  const section = qs("#paymentResultSection");
  const message = qs("#paymentResultMessage");
  const detail = qs("#paymentResultDetail");
  if (!section || !message) return;
  section.style.display = "block";
  message.textContent = result.message || (success ? t("customer.invoice.pay_success", "") : "");
  if (detail) {
    if (success) {
      detail.hidden = false;
      detail.textContent = t("customer.invoice.result_success_detail", "");
    } else {
      detail.hidden = true;
      detail.textContent = "";
    }
  }
}

async function handlePaymentSuccess(paymentId, invoiceId) {
  const result = await paymentApi.markSuccess(paymentId);
  if (!result) return;
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
  const refreshed = await resolveInvoiceForDisplay(invoiceId);
  renderInvoice(refreshed.invoice, refreshed.quote);
}

async function initInvoiceDetailPage() {
  if (!protectCurrentPage()) return;
  if (!ensureCustomerAccess()) return;

  const params = new URLSearchParams(window.location.search);
  const invoiceId = (params.get("invoice_id") || "").trim();

  await loadSidebar("#sidebar", "customer");

  const missing = qs("#invoiceMissingState");
  const main = qs("#invoiceMainCard");

  if (!invoiceId) {
    mergeFallbackStrings(getInvoiceLocaleBundle("ko"));
    try {
      await initI18nDomains(["common", "quote"], "ko");
    } catch {
      /* API 번역 없으면 폴백만 사용 */
    }
    mergeFallbackStrings(getInvoiceLocaleBundle("ko"));
    applyI18nToDom(document);
    if (missing) missing.hidden = false;
    if (main) main.hidden = true;
    await resolveAppHeaderShell({ variant: "customer" });
    refreshHeaderMailUnreadBadge().catch(() => {});
    return;
  }

  if (missing) missing.hidden = true;
  if (main) main.hidden = false;

  const loadErr = qs("#invoiceLoadError");
  let invoice;
  let quote;
  try {
    const resolved = await resolveInvoiceForDisplay(invoiceId);
    invoice = resolved.invoice;
    quote = resolved.quote;
  } catch {
    mergeFallbackStrings(getInvoiceLocaleBundle("ko"));
    try {
      await initI18nDomains(["common", "quote"], "ko");
    } catch {
      /* ignore */
    }
    mergeFallbackStrings(getInvoiceLocaleBundle("ko"));
    applyI18nToDom(document);
    if (loadErr) {
      loadErr.hidden = false;
      loadErr.textContent = t("customer.invoice.load_error", "");
    }
    await resolveAppHeaderShell({ variant: "customer" });
    refreshHeaderMailUnreadBadge().catch(() => {});
    return;
  }
  if (loadErr) loadErr.hidden = true;

  const lang = resolveInvoiceUiLang(quote);
  mergeFallbackStrings(getInvoiceLocaleBundle(lang));
  try {
    await initI18nDomains(["common", "quote"], lang);
  } catch {
    /* ignore */
  }
  mergeFallbackStrings(getInvoiceLocaleBundle(lang));
  applyI18nToDom(document);

  patchState({ invoice });
  renderAfterPaymentList();
  renderInvoice(invoice, quote);

  await resolveAppHeaderShell({ variant: "customer" });
  refreshHeaderMailUnreadBadge().catch(() => {});

  qs("#payNowBtn")?.addEventListener("click", async () => {
    setMessage(t("customer.invoice.pay_processing", ""));
    try {
      const start = await paymentApi.startWebPayment({
        invoice_id: invoice.id,
        success_url: `${window.location.origin}/src/pages/invoice-detail.html?invoice_id=${encodeURIComponent(String(invoice.id))}&payment_id={PAYMENT_ID}&result=success`,
        failure_url: `${window.location.origin}/src/pages/invoice-detail.html?invoice_id=${encodeURIComponent(String(invoice.id))}&payment_id={PAYMENT_ID}&result=failure`,
        cancel_url: `${window.location.origin}/src/pages/invoice-detail.html?invoice_id=${encodeURIComponent(String(invoice.id))}&payment_id={PAYMENT_ID}&result=cancel`,
      });
      await handlePaymentSuccess(start.payment_id, String(invoice.id));
      setMessage(t("customer.invoice.pay_success", ""));
    } catch {
      setMessage(t("customer.invoice.pay_error", ""));
    }
  });
}

initInvoiceDetailPage();

export { initInvoiceDetailPage };
