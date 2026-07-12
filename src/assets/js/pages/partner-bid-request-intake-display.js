/**
 * Partner bid detail: AI briefing card + full intake answers disclosure.
 */

import { t } from "../core/i18n-client.js";
import { catalogDisplayText } from "./catalog-display-logic.js";
import {
  messageTranslationPreparingFormLabel,
  messageTranslationPreparingMessageLabel,
  messageTranslationStatusPending,
  messageTranslationStatusUnavailable,
} from "./messages-display-logic.js";

const SAME_LOCALE_INTAKE_STATUSES = new Set([
  "not_required",
  "copied_source_same_locale",
  "translated",
  "auto_translated",
]);

/** @param {unknown} raw */
function normalizeTranslationStatus(raw) {
  return String(raw ?? "")
    .trim()
    .toLowerCase()
    .replace(/-/g, "_");
}

/**
 * Viewer-locale service title for partner bid detail pages.
 * @param {Record<string, unknown> | null | undefined} detail
 * @param {(key: string, fallback: string) => string} [translate]
 * @returns {string}
 */
export function resolvePartnerBidServiceTitle(detail, translate = null) {
  const tr = typeof translate === "function" ? translate : t;
  const service =
    detail?.service && typeof detail.service === "object"
      ? /** @type {Record<string, unknown>} */ (detail.service)
      : {};
  const fromCatalog = catalogDisplayText(service, "name", tr, { kind: "title" });
  if (fromCatalog) return fromCatalog;
  return tr("partner.bid.request_title", "Bid request");
}

/** @param {Record<string, unknown>} row */
function partnerIntakeRowCrossLocale(row) {
  const src = String(row?.source_locale ?? "").trim().toLowerCase();
  const disp = String(row?.display_locale ?? "").trim().toLowerCase();
  return Boolean(src && disp && src !== disp);
}

/**
 * @param {Record<string, unknown>} row
 * @param {(key: string, fallback: string) => string} [translate]
 */
export function partnerIntakeAnswerDisplayLabel(row, translate = null) {
  const tr = typeof translate === "function" ? translate : t;
  const status = normalizeTranslationStatus(row?.translation_status);
  if (
    messageTranslationStatusUnavailable(status) ||
    status === "translation_required_failed" ||
    messageTranslationStatusPending(status)
  ) {
    return messageTranslationPreparingFormLabel(tr);
  }
  const display = row?.display_label != null ? String(row.display_label).trim() : "";
  const raw = String(row?.label ?? "").trim();
  if (display) return display;
  if (partnerIntakeRowCrossLocale(row)) {
    return messageTranslationPreparingFormLabel(tr);
  }
  if (SAME_LOCALE_INTAKE_STATUSES.has(status) && raw) return raw;
  if (raw) return messageTranslationPreparingFormLabel(tr);
  return tr("common.em_dash", "—");
}

/**
 * @param {Record<string, unknown>} row
 * @param {(key: string, fallback: string) => string} [translate]
 */
export function partnerIntakeAnswerDisplayValue(row, translate = null) {
  const tr = typeof translate === "function" ? translate : t;
  const status = normalizeTranslationStatus(row?.translation_status);
  if (
    messageTranslationStatusUnavailable(status) ||
    status === "translation_required_failed" ||
    messageTranslationStatusPending(status)
  ) {
    return messageTranslationPreparingMessageLabel(tr);
  }
  const display = row?.display_value != null ? String(row.display_value).trim() : "";
  const raw = String(row?.value ?? "").trim();
  if (display) return display;
  if (partnerIntakeRowCrossLocale(row)) {
    return messageTranslationPreparingMessageLabel(tr);
  }
  if (SAME_LOCALE_INTAKE_STATUSES.has(status) && raw) return raw;
  if (raw) return messageTranslationPreparingMessageLabel(tr);
  return tr("common.em_dash", "—");
}

/** @type {ReadonlySet<string>} */
const MEANINGLESS_BRIEFING_VALUE_KEYS = new Set([
  "__skipped__",
  "skipped",
  "__hidden__",
  "__not_applicable__",
  "not applicable",
  "n/a",
  "na",
  "-",
  "—",
  "none",
  "null",
  "undefined",
  "건너뜀",
  "해당 없음",
  "없음",
  "未填写",
  "未填",
  "なし",
  "該当なし",
  "sin respuesta",
  "no aplica",
  "không có",
  "không áp dụng",
]);

/** @param {unknown} value */
export function isMeaninglessBriefingValue(value) {
  if (value == null) return true;
  if (typeof value === "boolean") return false;
  if (typeof value === "number") return false;
  const s = String(value).trim();
  if (!s) return true;
  const low = s.toLowerCase();
  return MEANINGLESS_BRIEFING_VALUE_KEYS.has(low) || MEANINGLESS_BRIEFING_VALUE_KEYS.has(s);
}

/** @param {Array<Record<string, unknown>>} rows */
export function filterPartnerIntakeAnswerRows(rows) {
  const list = Array.isArray(rows) ? rows : [];
  return list.filter((row) => {
    if (!row || typeof row !== "object") return false;
    if (String(row.kind || "answer").trim().toLowerCase() === "section") return true;
    const visible = partnerIntakeAnswerDisplayValue(row);
    return !isMeaninglessBriefingValue(visible) && !isMeaninglessBriefingValue(row.value);
  });
}

/** @param {string | null | undefined} label */
function normalizeBriefingLabel(label) {
  return String(label ?? "")
    .trim()
    .toLowerCase()
    .replace(/[_\-.]+/g, " ")
    .replace(/\s+/g, " ");
}

/** Location-style labels are not treated as PII. */
const LOCATION_BRIEFING_LABEL_EXCEPTIONS = [
  "location",
  "city",
  "state",
  "region",
  "area",
  "지역",
  "도시",
  "주",
  "위치",
  "ciudad",
  "estado",
  "ubicacion",
  "ubicación",
  "城市",
  "州",
  "thành phố",
  "thanh pho",
];

/** @param {string} norm */
function isLocationBriefingLabel(norm) {
  return LOCATION_BRIEFING_LABEL_EXCEPTIONS.some(
    (ex) => norm === ex || norm.includes(ex),
  );
}

const PERSONAL_SENSITIVE_BRIEFING_LABEL_TOKENS = [
  "first name",
  "last name",
  "full name",
  "customer name",
  "contact name",
  "phone",
  "email",
  "gender",
  "birthdate",
  "birth date",
  "date of birth",
  "account id",
  "customer id",
  "first_name",
  "last_name",
  "phone_number",
  "이메일",
  "전화",
  "전화번호",
  "성별",
  "생년",
  "생일",
  "이름",
  "고객명",
  "氏名",
  "メール",
  "電話",
  "correo",
  "teléfono",
  "telefono",
  "电子邮件",
  "電話番号",
  "họ tên",
  "số điện thoại",
];

/** @param {string | null | undefined} label */
export function isPersonalOrSensitiveBriefingLabel(label) {
  const norm = normalizeBriefingLabel(label);
  if (!norm) return false;
  if (isLocationBriefingLabel(norm)) return false;
  return PERSONAL_SENSITIVE_BRIEFING_LABEL_TOKENS.some(
    (token) => norm === token || norm.includes(token),
  );
}

/** @param {unknown} value */
function isPiiBriefingValue(value) {
  const s = String(value ?? "").trim();
  if (!s) return false;
  if (/^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$/.test(s)) return true;
  const digits = s.replace(/\D/g, "");
  return digits.length >= 10 && /^[\d\s\-+().]{7,}$/.test(s);
}

/** @param {unknown} kp */
export function shouldShowBriefKeyPoint(kp) {
  if (!kp || typeof kp !== "object") return false;
  const o = /** @type {Record<string, unknown>} */ (kp);
  const label = String(o.label || "").trim();
  const value = String(o.value || "").trim();
  if (!label && !value) return false;
  if (isMeaninglessBriefingValue(value)) return false;
  if (isPersonalOrSensitiveBriefingLabel(label)) return false;
  if (isPiiBriefingValue(value)) return false;
  return true;
}

const GENERIC_ONE_LINE_SUMMARIES = new Set([
  "please review the customer's request details below.",
  "please review the customer's vehicle preferences below.",
  "please review the customer's intake answers below.",
  "please review the customer's intake answers.",
  "아래 고객 인테이크 답변을 확인해 주세요.",
  "아래 고객의 차량 선호 사항을 확인해 주세요.",
]);

/** @param {string} summary */
function isGenericOneLineSummary(summary) {
  const norm = String(summary || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
  return GENERIC_ONE_LINE_SUMMARIES.has(norm);
}

/** @param {unknown} brief */
function filterBriefKeyPoints(brief) {
  if (!brief || typeof brief !== "object") return brief;
  const b = /** @type {Record<string, unknown>} */ ({ ...brief });
  if (Array.isArray(b.key_points)) {
    b.key_points = b.key_points.filter((kp) => shouldShowBriefKeyPoint(kp));
  }
  if (b.partner_display && typeof b.partner_display === "object") {
    const pd = /** @type {Record<string, unknown>} */ ({ ...b.partner_display });
    if (Array.isArray(pd.lines)) {
      pd.lines = pd.lines.filter((line) => shouldShowBriefKeyPoint(line));
    }
    b.partner_display = pd;
  }
  return b;
}

/** @param {Record<string, unknown>} b */
function mergeBriefFromPartnerDisplay(b) {
  const out = { ...b };
  const pd = resolvePartnerBriefDisplay(out);
  if (!pd) return out;
  if (!String(out.brief_title || out.title || "").trim() && pd.headline) {
    out.brief_title = pd.headline;
  }
  const existing = Array.isArray(out.key_points) ? out.key_points : [];
  if (!existing.length && pd.lines.length) {
    out.key_points = pd.lines;
  }
  return out;
}

function escHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** @param {Record<string, unknown> | null | undefined} detail */
export function resolvePartnerIntakeAnswerRows(detail) {
  const rows = detail?.intake_answer_rows;
  if (Array.isArray(rows) && rows.length) return rows;
  const intake = detail?.intake;
  if (intake && typeof intake === "object" && Array.isArray(intake.answers)) {
    return intake.answers;
  }
  return [];
}

const BRIEFING_ERROR_I18N = {
  ollama_unavailable: [
    "partner.bid.brief.error.ollama_unavailable",
    "Could not connect to the AI server (Ollama). Check that Ollama is running and OLLAMA_BASE_URL in the backend .env is correct.",
  ],
  llm_disabled: [
    "partner.bid.brief.error.llm_disabled",
    "Briefing is disabled (BID_BRIEFING_ENABLED).",
  ],
  ollama_timeout: [
    "partner.bid.brief.error.ollama_timeout",
    "The AI response timed out. Check that the model is loaded.",
  ],
  ollama_invalid_response: [
    "partner.bid.brief.error.ollama_invalid_response",
    "The AI response format was invalid.",
  ],
  unexpected_error: [
    "partner.bid.brief.error.unexpected_error",
    "An unexpected error prevented briefing generation.",
  ],
};

/** @param {unknown} brief @param {(key: string, fallback: string) => string} [translate] */
export function briefingFailureHint(brief, translate = null) {
  const tr = typeof translate === "function" ? translate : t;
  if (!brief || typeof brief !== "object") return "";
  const b = /** @type {Record<string, unknown>} */ (brief);
  const fallback =
    b.fallback_used === true || String(b.provider || "").trim().toLowerCase() === "fallback";
  if (!fallback) return "";
  const internal =
    b._internal && typeof b._internal === "object"
      ? /** @type {Record<string, unknown>} */ (b._internal)
      : null;
  const kind = String(b.error_kind || internal?.error_kind || "").trim();
  const spec = kind ? BRIEFING_ERROR_I18N[kind] : null;
  if (spec) return tr(spec[0], spec[1]);
  if (kind) {
    return tr("partner.bid.brief.error.generic_with_kind", "Briefing generation failed ({kind}).").replace(
      "{kind}",
      kind,
    );
  }
  return tr(
    "partner.bid.brief.error.generic",
    "Automatic summary could not be generated. Review the full intake answers below.",
  );
}

/** @param {unknown} raw */
function resolvePartnerBriefDisplay(brief) {
  if (!brief || typeof brief !== "object") return null;
  const b = /** @type {Record<string, unknown>} */ (brief);
  const pd = b.partner_display;
  if (!pd || typeof pd !== "object") return null;
  const d = /** @type {Record<string, unknown>} */ (pd);
  const headline = String(d.headline || "").trim();
  const lines = Array.isArray(d.lines) ? d.lines : [];
  if (!headline && !lines.length) return null;
  return { headline, lines };
}

/** @param {unknown} brief */
function briefHasRenderableContent(brief) {
  if (!brief || typeof brief !== "object") return false;
  if (resolvePartnerBriefDisplay(brief)) return true;
  const b = /** @type {Record<string, unknown>} */ (brief);
  if (String(b.brief_title || b.title || "").trim()) return true;
  if (String(b.one_line_summary || b.brief_summary || b.summary || "").trim()) return true;
  if (String(b.partner_guidance || "").trim()) return true;
  const kp = Array.isArray(b.key_points) ? b.key_points : [];
  if (kp.length) return true;
  const miss = Array.isArray(b.missing_or_unclear) ? b.missing_or_unclear : [];
  return miss.length > 0;
}

/** @param {unknown} raw */
function normalizeKeyPoint(raw) {
  if (typeof raw === "string") {
    const s = raw.trim();
    return s ? { label: "", value: s } : null;
  }
  if (!raw || typeof raw !== "object") return null;
  const o = /** @type {Record<string, unknown>} */ (raw);
  const label = String(o.label || "").trim();
  const value = String(o.value || "").trim();
  if (!label && !value) return null;
  return { label, value };
}

/**
 * @param {unknown} kp
 * @returns {{ label: string, value: string } | null}
 */
function normalizeKeyPointForDisplay(kp) {
  const row = normalizeKeyPoint(kp);
  if (!row || !shouldShowBriefKeyPoint(row)) return null;
  return row;
}

/** @param {Record<string, unknown>} b @param {{ serviceTitle?: string, translate?: (key: string, fallback: string) => string }} [opts] */
function resolveBriefCardTitle(b, opts = {}) {
  const tr = typeof opts.translate === "function" ? opts.translate : t;
  const fromBrief = String(b.brief_title || b.title || "").trim();
  if (fromBrief) return fromBrief;
  const fromService = String(opts.serviceTitle || b.service_title || "").trim();
  if (fromService) return fromService;
  return tr("partner.bid.brief.eyebrow", "Customer request briefing");
}

/** @param {Record<string, unknown>} b */
function resolveBriefSummaryForDisplay(b) {
  const raw = String(
    b.one_line_summary || b.brief_summary || b.summary || "",
  ).trim();
  if (!raw || isGenericOneLineSummary(raw)) return "";
  return raw;
}

/** @param {Array<{ label: string, value: string }>} keyPoints @param {(key: string, fallback: string) => string} tr */
function renderBriefKeyPointListHtml(keyPoints, tr) {
  if (!keyPoints.length) {
    return `<p class="lhai-par-bid__brief-empty-kp">${escHtml(
      tr("partner.bid.brief.review_intake", "Review the full intake answers below."),
    )}</p>`;
  }
  const items = keyPoints
    .map((kp) => {
      const lbl = String(kp.label || "").trim();
      const val = escHtml(String(kp.value || "—").trim());
      if (lbl) {
        return `<li class="lhai-par-bid__brief-kv-item">${escHtml(lbl)}: ${val}</li>`;
      }
      return `<li class="lhai-par-bid__brief-kv-item lhai-par-bid__brief-kv-item--solo">${val}</li>`;
    })
    .join("");
  return `<ul class="lhai-par-bid__brief-kv-list" role="list">${items}</ul>`;
}

/**
 * @param {Record<string, unknown> | null | undefined} brief
 * @param {{ serviceTitle?: string, translate?: (key: string, fallback: string) => string }} [opts]
 */
export function renderAiBidRequestBriefCard(brief, opts = {}) {
  const tr = typeof opts.translate === "function" ? opts.translate : t;
  const eyebrow = tr("partner.bid.brief.eyebrow", "Customer request briefing");

  if (!briefHasRenderableContent(brief)) {
    const hint = briefingFailureHint(brief, tr);
    const hintHtml = hint
      ? `<p class="lhai-par-bid__brief-fallback-hint">${escHtml(hint)}</p>`
      : "";
    return `<section class="lhai-par-bid__brief-card lhai-par-bid__brief-card--fallback" aria-label="${escHtml(eyebrow)}">
      <p class="lhai-par-bid__brief-eyebrow">${escHtml(eyebrow)}</p>
      <h3 class="lhai-par-bid__brief-card-title">${escHtml(eyebrow)}</h3>
      <p class="lhai-par-bid__brief-fallback-body">${escHtml(
        tr(
          "partner.bid.brief.fallback_body",
          "We could not generate the customer request briefing. Review the full intake answers below.",
        ),
      )}</p>
      ${hintHtml}
    </section>`;
  }

  const b = /** @type {Record<string, unknown>} */ (
    mergeBriefFromPartnerDisplay(
      /** @type {Record<string, unknown>} */ (filterBriefKeyPoints(brief)),
    )
  );

  const title = escHtml(resolveBriefCardTitle(b, { ...opts, translate: tr }));
  const summaryRaw = resolveBriefSummaryForDisplay(b);
  const summary = summaryRaw ? escHtml(summaryRaw) : "";
  const keyPoints = (Array.isArray(b.key_points) ? b.key_points : [])
    .map(normalizeKeyPointForDisplay)
    .filter(Boolean);
  const missing = (Array.isArray(b.missing_or_unclear) ? b.missing_or_unclear : [])
    .map((m) => String(m || "").trim())
    .filter((m) => m && !isMeaninglessBriefingValue(m) && !isPiiBriefingValue(m));
  const guidance = escHtml(String(b.partner_guidance || "").trim());

  const kpHtml = renderBriefKeyPointListHtml(
    /** @type {Array<{ label: string, value: string }>} */ (keyPoints),
    tr,
  );

  const missHtml = missing.length
    ? `<div class="lhai-par-bid__brief-section lhai-par-bid__brief-section--missing">
        <h4 class="lhai-par-bid__brief-section-title">${escHtml(
          tr("partner.bid.brief.section.missing", "Needs clarification"),
        )}</h4>
        <ul class="lhai-par-bid__brief-missing-list">${missing
            .map((m) => `<li>${escHtml(m)}</li>`)
            .join("")}</ul>
      </div>`
    : "";

  const guideHtml = guidance
    ? `<div class="lhai-par-bid__brief-section lhai-par-bid__brief-section--guidance">
        <h4 class="lhai-par-bid__brief-section-title">${escHtml(
          tr("partner.bid.brief.section.guidance", "Partner guidance"),
        )}</h4>
        <p class="lhai-par-bid__brief-guidance">${guidance}</p>
      </div>`
    : "";

  return `<section class="lhai-par-bid__brief-card lhai-par-bid__brief-card--multiline" aria-label="${escHtml(eyebrow)}">
    <p class="lhai-par-bid__brief-eyebrow">${escHtml(eyebrow)}</p>
    <h3 class="lhai-par-bid__brief-card-title">${title}</h3>
    ${summary ? `<p class="lhai-par-bid__brief-summary lhai-par-bid__brief-summary--subtle">${summary}</p>` : ""}
    ${kpHtml}
    ${missHtml}
    ${guideHtml}
  </section>`;
}

/**
 * @param {Array<Record<string, unknown>>} rows
 * @param {{ listClass?: string, itemClass?: string, emptyMessage?: string, translate?: (key: string, fallback: string) => string }} [opts]
 */
export function renderFullIntakeAnswersDisclosure(rows, opts = {}) {
  const tr = typeof opts.translate === "function" ? opts.translate : t;
  const listClass = opts.listClass || "lhai-par-bid__intake-list";
  const itemClass = opts.itemClass || "lhai-par-bid__intake-item";
  const emptyMessage =
    opts.emptyMessage ||
    tr("partner.bid.intake.empty", "No intake answers are visible to partners.");

  const list = filterPartnerIntakeAnswerRows(Array.isArray(rows) ? rows : []);

  const body =
    list.length === 0
      ? `<p class="lhai-par-bid__intake-empty u-text-muted">${escHtml(emptyMessage)}</p>`
      : `<div class="${listClass}" role="list">${list
          .map((row) => {
            const r = row && typeof row === "object" ? row : {};
            const label = escHtml(partnerIntakeAnswerDisplayLabel(r, tr));
            if (String(r.kind || "answer").trim().toLowerCase() === "section") {
              return `<div class="lhai-par-bid__intake-section ${itemClass}" role="listitem">
                <p class="lhai-par-bid__intake-section-title">${label}</p>
              </div>`;
            }
            const val = escHtml(partnerIntakeAnswerDisplayValue(r, tr));
            return `<div class="${itemClass}" role="listitem">
              <p class="lhai-par-bid__intake-q">${label}</p>
              <p class="lhai-par-bid__intake-a">${val}</p>
            </div>`;
          })
          .join("")}</div>`;

  return `<section class="lhai-par-bid__intake-disclosure-wrap" aria-label="${escHtml(
    tr("partner.bid.intake.disclosure_aria", "Full intake answers"),
  )}">
    <details class="lhai-par-bid__intake-disclosure">
      <summary class="lhai-par-bid__intake-disclosure-trigger">${escHtml(
        tr("partner.bid.intake.disclosure_summary", "View full intake answers"),
      )}</summary>
      <div class="lhai-par-bid__intake-disclosure-body">${body}</div>
    </details>
  </section>`;
}

/**
 * Replace viewer-locale brief + intake blocks after API refetch (language change / soft refresh).
 * @param {ParentNode} root
 * @param {Record<string, unknown> | null | undefined} detail
 * @param {object} [opts]
 */
export function patchPartnerBidLocaleSections(root, detail, opts = {}) {
  const host = root.querySelector("[data-partner-bid-locale-sections]");
  if (!(host instanceof HTMLElement)) return;
  host.innerHTML = renderPartnerBidIntakeSectionHtml(detail, opts);
}

/** @param {Record<string, unknown> | null | undefined} detail @param {object} [opts] */
export function renderPartnerBidIntakeSectionHtml(detail, opts = {}) {
  const tr = typeof opts.translate === "function" ? opts.translate : t;
  const brief =
    detail?.ai_bid_request_brief && typeof detail.ai_bid_request_brief === "object"
      ? detail.ai_bid_request_brief
      : null;
  const serviceTitle = resolvePartnerBidServiceTitle(detail, tr);
  return `${renderAiBidRequestBriefCard(brief, {
    serviceTitle,
    translate: tr,
  })}${renderFullIntakeAnswersDisclosure(
    filterPartnerIntakeAnswerRows(resolvePartnerIntakeAnswerRows(detail)),
    { ...opts, translate: tr },
  )}`;
}
