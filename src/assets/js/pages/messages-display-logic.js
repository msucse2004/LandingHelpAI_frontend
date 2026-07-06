/**
 * Message thread display helpers (viewer locale body vs original; unit-testable).
 */

export const TRANSLATION_SOURCE_SYSTEM_TEMPLATE = "system_template";

/**
 * @param {unknown} profileRef
 * @returns {string}
 */
export function customerLabelFromProfileRef(profileRef) {
  const raw = String(profileRef || "").trim();
  if (!raw) return "";
  if (raw.toLowerCase().startsWith("profile::")) {
    const tail = raw.slice(9).trim();
    return tail || raw;
  }
  return raw;
}

/**
 * ADMIN thread list/header title in the viewer locale.
 * @param {Record<string, unknown> | null | undefined} row
 * @param {(key: string, fallback?: string) => string} [translate]
 * @returns {string}
 */
export function adminThreadDisplayTitle(row, translate) {
  const t = typeof translate === "function" ? translate : (_key, fallback) => String(fallback || "");
  const display = String(row?.display_title || "").trim();
  if (display) return display;
  const label = t("messages.thread.customer_center", "Customer center");
  const customer = customerLabelFromProfileRef(row?.customer_profile_id);
  if (customer) return `${label} · ${customer}`;
  const stored = String(row?.title || "").trim();
  return stored || label;
}

/**
 * @param {unknown} status
 * @returns {boolean}
 */
export function messageTranslationStatusUnavailable(status) {
  const normalized = String(status || "")
    .trim()
    .toLowerCase()
    .replace(/-/g, "_");
  return (
    normalized === "fallback_to_source" ||
    normalized === "provider_failed" ||
    normalized === "failed" ||
    normalized === "failed_placeholder_validation"
  );
}

/**
 * @param {unknown} status
 * @returns {boolean}
 */
export function messageTranslationStatusPending(status) {
  const normalized = String(status || "")
    .trim()
    .toLowerCase()
    .replace(/-/g, "_");
  return normalized === "pending_translation";
}

/**
 * @param {Record<string, unknown> | null | undefined} message
 */
export function messageTranslationSource(message) {
  return String(message?.translation_source ?? "")
    .trim()
    .toLowerCase()
    .replace(/-/g, "_");
}

/**
 * @param {Record<string, unknown> | null | undefined} message
 */
export function isSystemTemplateMessage(message) {
  return messageTranslationSource(message) === TRANSLATION_SOURCE_SYSTEM_TEMPLATE;
}

/**
 * @param {Record<string, unknown> | null | undefined} message
 */
export function messageShouldShowTranslationUnavailable(message) {
  if (isSystemTemplateMessage(message)) {
    return false;
  }
  return messageTranslationStatusUnavailable(message?.translation_status);
}

/**
 * @param {Record<string, unknown> | null | undefined} message
 */
export function messageShouldShowTranslationPending(message) {
  if (isSystemTemplateMessage(message)) {
    return false;
  }
  return messageTranslationStatusPending(message?.translation_status);
}

/**
 * @param {Record<string, unknown> | null | undefined} message
 * @returns {"unavailable" | "pending" | null}
 */
export function messageTranslationNoticeKind(message) {
  if (messageShouldShowTranslationUnavailable(message)) {
    return "unavailable";
  }
  if (messageShouldShowTranslationPending(message)) {
    return "pending";
  }
  return null;
}

/**
 * True when API returned a display_body that differs from stored body and original exists.
 * @param {Record<string, unknown> | null | undefined} message
 */
export function messageHasLocalizedDisplay(message) {
  const display = String(message?.display_body ?? "").trim();
  const original = String(message?.body ?? "").trim();
  return Boolean(display && original && display !== original);
}

/**
 * @param {Record<string, unknown> | null | undefined} message
 */
export function messageShouldShowViewOriginalToggle(message) {
  return messageHasLocalizedDisplay(message);
}

/**
 * Text to show in the bubble (never mutates message.body).
 * @param {Record<string, unknown> | null | undefined} message
 * @param {{ showOriginal?: boolean, originalBody?: string }} [options]
 */
export function messageViewerBody(message, options = {}) {
  const original =
    options.originalBody != null
      ? String(options.originalBody)
      : String(message?.body ?? "").trim();
  const display = String(message?.display_body ?? "").trim();
  if (options.showOriginal) {
    return original;
  }
  return display || original;
}

/**
 * @param {boolean} showingOriginal
 * @param {(key: string, fallback: string) => string} translate
 */
export function messageViewOriginalToggleLabel(showingOriginal, translate) {
  if (showingOriginal) {
    return translate("messages.actions.hide_original", "Hide original");
  }
  return translate("messages.actions.view_original", "View original");
}

/**
 * @param {(key: string, fallback: string) => string} translate
 */
export function messageTranslationUnavailableLabel(translate) {
  return translate("messages.translation.unavailable", "Translation unavailable");
}

/**
 * @param {(key: string, fallback: string) => string} translate
 */
export function messageTranslationPendingLabel(translate) {
  return translate("messages.translation.pending", "Translation pending");
}

/**
 * Safe client-side snapshot of API translation fields (no message body).
 * @param {Record<string, unknown> | null | undefined} message
 */
export function messageTranslationDebugFields(message) {
  const body = String(message?.body ?? "");
  const display = String(message?.display_body ?? "");
  return {
    message_id: String(message?.id ?? "").trim() || null,
    event_code: String(message?.event_code ?? "").trim() || null,
    message_type: String(message?.message_type ?? "").trim() || null,
    source_locale: message?.source_locale ?? null,
    display_locale: message?.display_locale ?? null,
    translation_status: message?.translation_status ?? null,
    translation_source: message?.translation_source ?? null,
    translation_provider: message?.translation_provider ?? null,
    translation_cache_hit: message?.translation_cache_hit ?? null,
    body_length: body.length,
    display_body_length: display.length,
    display_differs_from_body: Boolean(body.trim() && display.trim() && body.trim() !== display.trim()),
    translation_unavailable: messageShouldShowTranslationUnavailable(message),
    translation_pending: messageShouldShowTranslationPending(message),
  };
}

/**
 * Log messages where translation is unavailable or failed (no full body text).
 * @param {Array<Record<string, unknown>> | null | undefined} messages
 * @param {{ logFn?: (...args: unknown[]) => void, label?: string }} [options]
 */
export function logMessageTranslationFailures(messages, options = {}) {
  const logFn = typeof options.logFn === "function" ? options.logFn : () => {};
  const label = String(options.label || "message_translation_failure").trim();
  const rows = Array.isArray(messages) ? messages : [];
  const failures = rows
    .map((message) => messageTranslationDebugFields(message))
    .filter((row) => row.translation_unavailable || row.translation_pending);
  if (!failures.length) {
    return [];
  }
  logFn(`[LHAI_DEBUG_MESSAGE_TRANSLATION] ${label}`, {
    failure_count: failures.length,
    failures,
  });
  return failures;
}

/**
 * @param {Record<string, unknown> | null | undefined} row
 * @returns {boolean}
 */
export function threadListPreviewIsSystemTemplate(row) {
  const source = String(row?.last_message_translation_source ?? "")
    .trim()
    .toLowerCase()
    .replace(/-/g, "_");
  if (source === TRANSLATION_SOURCE_SYSTEM_TEMPLATE) {
    return true;
  }
  const status = String(row?.last_message_translation_status ?? "")
    .trim()
    .toLowerCase()
    .replace(/-/g, "_");
  return status === "template_resolved" || status === "auto_translated_template";
}

/**
 * Thread list row preview in viewer locale (API-resolved; no client-side translation).
 * @param {Record<string, unknown> | null | undefined} row
 */
export function threadListPreviewBody(row) {
  const original = String(row?.last_message_body ?? row?.preview ?? "").trim();
  if (!original) {
    return "";
  }
  if (threadListPreviewIsSystemTemplate(row)) {
    const display = String(row?.last_message_display_body ?? "").trim();
    return display || original;
  }
  if (messageTranslationStatusUnavailable(row?.last_message_translation_status)) {
    return original;
  }
  const display = String(row?.last_message_display_body ?? "").trim();
  return display || original;
}
