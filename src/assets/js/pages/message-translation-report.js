/**
 * User report for bad message translations (Step 18).
 */
import { messagesApi } from "../core/api.js";
import { getAccessToken } from "../core/auth.js";
import { messageHasLocalizedDisplay } from "./messages-display-logic.js";
import { t } from "../core/i18n-client.js";
import { safeText } from "../core/utils.js";

/** @type {Set<string>} */
const reportedTranslationKeys = new Set();

function reportKey(messageId, locale) {
  return `${String(messageId || "").trim()}::${String(locale || "").trim().toLowerCase()}`;
}

/**
 * @param {Record<string, unknown>} message
 * @returns {boolean}
 */
export function messageTranslationReported(message) {
  const id = String(message?.id || "").trim();
  const locale = String(message?.display_locale || "").trim();
  if (!id || !locale) return reportedTranslationKeys.has(reportKey(id, locale));
  return reportedTranslationKeys.has(reportKey(id, locale));
}

/**
 * @param {Record<string, unknown>} message
 * @returns {string}
 */
export function buildMessageTranslationReportHtml(message) {
  if (!messageHasLocalizedDisplay(message)) return "";
  const id = String(message?.id || "").trim();
  if (!id) return "";
  if (messageTranslationReported(message)) {
    return `<span class="lhai-chat-bubble__report-translation lhai-chat-bubble__report-translation--done">${safeText(
      t("messages.actions.report_translation_done", "Report sent")
    )}</span>`;
  }
  return `<button type="button" class="lhai-chat-bubble__report-translation" data-message-id="${safeText(
    id
  )}" data-target-locale="${safeText(String(message?.display_locale || ""))}">${safeText(
    t("messages.actions.report_translation", "Report translation")
  )}</button>`;
}

/**
 * @param {object} opts
 * @param {() => { operatorInboxMode: boolean }} opts.getContext
 * @param {() => void} [opts.onReported]
 */
export function bindMessageTranslationReport(opts) {
  const host = document.querySelector("#messageDetailContainer");
  if (!host || host.dataset.lhaiTranslationReportBound === "1") return;
  host.dataset.lhaiTranslationReportBound = "1";

  host.addEventListener("click", async (ev) => {
    const ctx = opts.getContext();
    if (ctx.operatorInboxMode) return;
    const target = ev.target;
    if (!(target instanceof Element)) return;
    const btn = target.closest(".lhai-chat-bubble__report-translation:not(.lhai-chat-bubble__report-translation--done)");
    if (!(btn instanceof HTMLButtonElement)) return;
    ev.preventDefault();
    const messageId = btn.getAttribute("data-message-id") || "";
    const targetLocale = btn.getAttribute("data-target-locale") || "";
    if (!messageId || !targetLocale) return;
    if (!getAccessToken()) {
      window.alert(t("messages.actions.report_translation", "Report translation"));
      return;
    }
    btn.disabled = true;
    try {
      await messagesApi.reportTranslation(messageId, { targetLocale });
      reportedTranslationKeys.add(reportKey(messageId, targetLocale));
      btn.replaceWith(
        Object.assign(document.createElement("span"), {
          className: "lhai-chat-bubble__report-translation lhai-chat-bubble__report-translation--done",
          textContent: t("messages.actions.report_translation_done", "Report sent"),
        })
      );
      opts.onReported?.();
    } catch (err) {
      const msg = err && typeof err.message === "string" ? err.message : "Report failed.";
      window.alert(msg);
      btn.disabled = false;
    }
  });
}
