/**
 * Message thread display helpers (viewer locale body vs original; unit-testable).
 */

export const TRANSLATION_SOURCE_SYSTEM_TEMPLATE = "system_template";

export const TRANSLATION_I18N_KEYS = {
  preparingTitle: "messages.translation.preparing_title",
  preparingMessage: "messages.translation.preparing_message",
  preparingForm: "messages.translation.preparing_form",
  preparingPreview: "messages.translation.preparing_preview",
  retryLater: "messages.translation.retry_later",
  requiredFailed: "messages.translation.required_failed",
  unavailable: "messages.translation.unavailable",
  pending: "messages.translation.pending",
};

const SERVICE_THREAD_DISPLAY_KEYS = [
  "display_header_title",
  "display_service_name",
  "display_service_catalog_title",
  "display_title",
];

/**
 * Merge viewer-locale ``display_*`` fields from list/detail thread rows.
 * Detail responses may carry fresher catalog titles after language change.
 * @param {Record<string, unknown> | null | undefined} base
 * @param {Record<string, unknown> | null | undefined} overlay
 * @returns {Record<string, unknown>}
 */
export function mergeServiceThreadDisplayFields(base, overlay) {
  const out = base && typeof base === "object" ? { ...base } : {};
  if (!overlay || typeof overlay !== "object") {
    return out;
  }
  for (const key of SERVICE_THREAD_DISPLAY_KEYS) {
    const value = String(overlay[key] || "").trim();
    if (value) out[key] = value;
  }
  return out;
}

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
 * True when API omitted viewer-locale display text but stored source text exists.
 * @param {Record<string, unknown> | null | undefined} message
 */
export function messageMissingViewerDisplayText(message) {
  const display = String(message?.display_body ?? "").trim();
  const original = String(message?.body ?? "").trim();
  if (!original || display) {
    return false;
  }
  const src = String(message?.source_locale ?? "").trim().toLowerCase();
  const disp = String(message?.display_locale ?? "").trim().toLowerCase();
  if (src && disp && src !== disp) {
    return true;
  }
  return Boolean(message?.translation_status);
}

/**
 * @param {Record<string, unknown> | null | undefined} message
 * @param {{ showOriginal?: boolean }} [options]
 */
export function messageShouldUseTranslationPlaceholder(message, options = {}) {
  if (options.showOriginal) {
    return false;
  }
  if (isSystemTemplateMessage(message)) {
    return false;
  }
  if (messageTranslationNoticeKind(message)) {
    return true;
  }
  return messageMissingViewerDisplayText(message);
}

/**
 * @param {(key: string, fallback: string) => string} translate
 */
export function messageTranslationPreparingTitleLabel(translate) {
  return translate(TRANSLATION_I18N_KEYS.preparingTitle, "Preparing title translation...");
}

/**
 * @param {(key: string, fallback: string) => string} translate
 */
export function messageTranslationPreparingMessageLabel(translate) {
  return translate(TRANSLATION_I18N_KEYS.preparingMessage, "Preparing message translation...");
}

/**
 * @param {(key: string, fallback: string) => string} translate
 */
export function messageTranslationPreparingFormLabel(translate) {
  return translate(TRANSLATION_I18N_KEYS.preparingForm, "This form is being prepared in your language.");
}

/**
 * @param {(key: string, fallback: string) => string} translate
 */
export function messageTranslationPreparingPreviewLabel(translate) {
  return translate(TRANSLATION_I18N_KEYS.preparingPreview, "Preparing preview translation...");
}

/**
 * @param {(key: string, fallback: string) => string} translate
 */
export function messageTranslationRetryLaterLabel(translate) {
  return translate(
    TRANSLATION_I18N_KEYS.retryLater,
    "Please refresh shortly. If this continues, contact support."
  );
}

/**
 * @param {(key: string, fallback: string) => string} translate
 */
export function messageTranslationRequiredFailedLabel(translate) {
  return translate(
    TRANSLATION_I18N_KEYS.requiredFailed,
    "Translation is required but not ready yet."
  );
}

/**
 * @param {Record<string, unknown> | null | undefined} message
 * @param {(key: string, fallback: string) => string} translate
 */
export function messageTranslationPlaceholderBody(message, translate) {
  const status = String(message?.translation_status ?? "")
    .trim()
    .toLowerCase()
    .replace(/-/g, "_");
  if (status === "translation_required_failed") {
    return messageTranslationPreparingMessageLabel(translate);
  }
  if (messageShouldShowTranslationUnavailable(message)) {
    return messageTranslationPreparingMessageLabel(translate);
  }
  return messageTranslationPreparingMessageLabel(translate);
}

/**
 * @param {Record<string, unknown> | null | undefined} row
 */
export function threadTitleNeedsTranslationPlaceholder(row) {
  const status = String(row?.service_title_status ?? "")
    .trim()
    .toLowerCase()
    .replace(/-/g, "_");
  if (status === "translation_required_failed") {
    return true;
  }
  const display = String(
    row?.display_header_title || row?.display_service_name || row?.display_service_catalog_title || ""
  ).trim();
  if (display) {
    return false;
  }
  if (messageTranslationStatusUnavailable(status)) {
    return true;
  }
  const src = String(row?.service_title_source_locale || "").trim().toLowerCase();
  const disp = String(row?.service_title_display_locale || "").trim().toLowerCase();
  if (src && disp && src !== disp) {
    return true;
  }
  const hasDisplayField =
    row &&
    typeof row === "object" &&
    ("display_header_title" in row || "display_service_name" in row || "display_service_catalog_title" in row);
  return Boolean(hasDisplayField);
}

/**
 * SERVICE thread list/header title in the viewer locale.
 * Prefers catalog-style ``display_*`` fields from the API.
 * @param {Record<string, unknown> | null | undefined} row
 * @param {string} [fallbackWhenEmpty]
 * @param {(key: string, fallback: string) => string} [translate]
 * @returns {string}
 */
export function serviceThreadDisplayName(row, fallbackWhenEmpty = "", translate = null) {
  const display =
    String(row?.display_header_title || row?.display_service_name || row?.display_service_catalog_title || "").trim();
  if (display) return display;

  const tr = typeof translate === "function" ? translate : null;
  const src = String(row?.service_title_source_locale || "").trim().toLowerCase();
  const disp = String(row?.service_title_display_locale || "").trim().toLowerCase();
  const original = String(row?.header_title || "").trim();
  const status = String(row?.service_title_status ?? "")
    .trim()
    .toLowerCase()
    .replace(/-/g, "_");
  const sameLocale = Boolean(src && disp && src === disp);
  const crossLocale = Boolean(src && disp && src !== disp);

  if (tr && threadTitleNeedsTranslationPlaceholder(row)) {
    return messageTranslationPreparingTitleLabel(tr);
  }
  if (crossLocale) {
    return tr ? messageTranslationPreparingTitleLabel(tr) : "";
  }
  if (status === "translation_required_failed" || messageTranslationStatusUnavailable(status)) {
    return tr ? messageTranslationPreparingTitleLabel(tr) : "";
  }
  if (original && (sameLocale || status === "not_required" || (!src && !disp))) {
    return original;
  }
  return String(fallbackWhenEmpty || "");
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
    normalized === "provider_failed_hidden" ||
    normalized === "translation_required_failed" ||
    normalized === "missing_translation" ||
    normalized === "needs_admin_review" ||
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
  return normalized === "pending_translation" || normalized === "translation_pending";
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
  if (messageHasLocalizedDisplay(message)) {
    return true;
  }
  const original = String(message?.body ?? "").trim();
  if (!original) {
    return false;
  }
  const display = message?.display_body;
  const hasDisplay = display != null && String(display).trim();
  const src = String(message?.source_locale ?? "").trim().toLowerCase();
  const disp = String(message?.display_locale ?? "").trim().toLowerCase();
  if (!src || !disp || src === disp) {
    return false;
  }
  if (hasDisplay) {
    return false;
  }
  return (
    messageTranslationStatusUnavailable(message?.translation_status) ||
    messageTranslationStatusPending(message?.translation_status)
  );
}

/**
 * Text to show in the bubble (never mutates message.body).
 * @param {Record<string, unknown> | null | undefined} message
 * @param {{ showOriginal?: boolean, originalBody?: string, translate?: (key: string, fallback: string) => string }} [options]
 */
export function messageViewerBody(message, options = {}) {
  const original =
    options.originalBody != null
      ? String(options.originalBody)
      : String(message?.body ?? "").trim();
  if (options.showOriginal) {
    return original;
  }
  const displayRaw = message?.display_body;
  const display = displayRaw != null ? String(displayRaw).trim() : "";
  if (display) {
    return display;
  }
  const translate = typeof options.translate === "function" ? options.translate : null;
  const src = String(message?.source_locale ?? "").trim().toLowerCase();
  const disp = String(message?.display_locale ?? "").trim().toLowerCase();
  const sameLocale = Boolean(src && disp && src === disp);
  const status = String(message?.translation_status ?? "")
    .trim()
    .toLowerCase()
    .replace(/-/g, "_");

  if (translate) {
    if (messageTranslationStatusPending(status)) {
      return messageTranslationPlaceholderBody(message, translate);
    }
    if (messageTranslationStatusUnavailable(status)) {
      return messageTranslationPlaceholderBody(message, translate);
    }
    if (!sameLocale) {
      if (messageShouldUseTranslationPlaceholder(message, options)) {
        return messageTranslationPlaceholderBody(message, translate);
      }
      return messageTranslationPreparingMessageLabel(translate);
    }
  }

  if (messageTranslationStatusUnavailable(message?.translation_status)) {
    return "";
  }

  if (!sameLocale) {
    return "";
  }

  return original;
}

/**
 * Text to show in the bubble title line (never mutates message.title).
 * @param {Record<string, unknown> | null | undefined} message
 * @param {{ showOriginal?: boolean, translate?: (key: string, fallback: string) => string }} [options]
 */
export function messageViewerTitle(message, options = {}) {
  const original = String(message?.title ?? "").trim();
  if (options.showOriginal) {
    return original;
  }
  const displayRaw = message?.display_title;
  const display = displayRaw != null ? String(displayRaw).trim() : "";
  if (display) {
    return display;
  }
  const translate = typeof options.translate === "function" ? options.translate : null;
  const src = String(message?.source_locale ?? "").trim().toLowerCase();
  const disp = String(message?.display_locale ?? "").trim().toLowerCase();
  const sameLocale = Boolean(src && disp && src === disp);
  const status = String(message?.translation_status ?? "")
    .trim()
    .toLowerCase()
    .replace(/-/g, "_");

  if (translate) {
    if (messageTranslationStatusUnavailable(status) || status === "translation_required_failed") {
      return messageTranslationPreparingTitleLabel(translate);
    }
    if (messageTranslationStatusPending(status)) {
      return messageTranslationPreparingTitleLabel(translate);
    }
    if (!sameLocale && original) {
      return messageTranslationPreparingTitleLabel(translate);
    }
  }

  if (messageTranslationStatusUnavailable(message?.translation_status)) {
    return "";
  }

  if (!sameLocale) {
    return "";
  }

  return original;
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
  return messageTranslationRequiredFailedLabel(translate);
}

/**
 * @param {(key: string, fallback: string) => string} translate
 */
export function messageTranslationPendingLabel(translate) {
  return messageTranslationPreparingMessageLabel(translate);
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
 * True when workflow card visible copy must use placeholder (cross-locale missing display).
 * @param {Record<string, unknown> | null | undefined} message
 * @param {"title" | "body"} fieldKey
 */
function workflowCardFieldNeedsPlaceholder(message, fieldKey) {
  const display = String(message?.[`display_${fieldKey}`] ?? "").trim();
  if (display) {
    return false;
  }
  const status = String(message?.translation_status ?? "")
    .trim()
    .toLowerCase()
    .replace(/-/g, "_");
  if (status === "translation_required_failed") {
    return true;
  }
  const src = String(message?.source_locale ?? "").trim().toLowerCase();
  const disp = String(message?.display_locale ?? "").trim().toLowerCase();
  if (src && disp && src !== disp) {
    return true;
  }
  return messageTranslationStatusUnavailable(String(message?.translation_status ?? ""));
}

/**
 * True when workflow card visible copy must use placeholder (cross-locale missing display).
 * @param {Record<string, unknown> | null | undefined} message
 */
export function workflowCardNeedsTranslationPlaceholder(message) {
  return (
    workflowCardFieldNeedsPlaceholder(message, "title") ||
    workflowCardFieldNeedsPlaceholder(message, "body")
  );
}

/**
 * @param {Record<string, unknown> | null | undefined} message
 */
function workflowCardSameLocale(message) {
  const src = String(message?.source_locale ?? "").trim().toLowerCase();
  const disp = String(message?.display_locale ?? "").trim().toLowerCase();
  return Boolean(src && disp && src === disp);
}

/**
 * Viewer-facing workflow card title (never ``card_json.title``).
 * @param {Record<string, unknown> | null | undefined} message
 * @param {(key: string, fallback: string) => string} [translate]
 */
export function workflowCardViewerTitle(message, translate = null) {
  const display = String(message?.display_title ?? "").trim();
  if (display) {
    return display;
  }
  const tr = typeof translate === "function" ? translate : null;
  if (workflowCardFieldNeedsPlaceholder(message, "title")) {
    return tr ? messageTranslationPreparingTitleLabel(tr) : "";
  }
  if (workflowCardSameLocale(message)) {
    return String(message?.title ?? "").trim();
  }
  return "";
}

/**
 * Viewer-facing workflow card body (never ``card_json.body``).
 * @param {Record<string, unknown> | null | undefined} message
 * @param {(key: string, fallback: string) => string} [translate]
 */
export function workflowCardViewerBody(message, translate = null) {
  const display = String(message?.display_body ?? "").trim();
  if (display) {
    return display;
  }
  const tr = typeof translate === "function" ? translate : null;
  if (workflowCardFieldNeedsPlaceholder(message, "body")) {
    return tr ? messageTranslationPlaceholderBody(message, tr) : "";
  }
  if (workflowCardSameLocale(message)) {
    return String(message?.body ?? "").trim();
  }
  return "";
}

/**
 * Widget type for intake messages from stored or display payload (display wins when present).
 * @param {Record<string, unknown> | null | undefined} message
 */
export function messageIntakeWidgetType(message) {
  if (!message || typeof message !== "object") return "";
  const display =
    message.display_ui_payload && typeof message.display_ui_payload === "object"
      ? /** @type {Record<string, unknown>} */ (message.display_ui_payload)
      : null;
  const canonical =
    message.ui_payload && typeof message.ui_payload === "object"
      ? /** @type {Record<string, unknown>} */ (message.ui_payload)
      : null;
  return String((display?.widget_type ?? canonical?.widget_type) ?? "").trim();
}

/**
 * True when intake widget visible copy must not fall back to raw ``ui_payload``.
 * @param {Record<string, unknown> | null | undefined} message
 */
export function intakeUiPayloadNeedsTranslationPlaceholder(message) {
  const status = String(message?.display_ui_payload_status ?? "")
    .trim()
    .toLowerCase()
    .replace(/-/g, "_");
  if (status === "translation_required_failed") {
    return true;
  }
  if (messageTranslationStatusUnavailable(status)) {
    return true;
  }
  const src = String(
    message?.source_locale ?? (message?.ui_payload && message.ui_payload.source_locale) ?? ""
  )
    .trim()
    .toLowerCase();
  const disp = String(message?.display_ui_payload_locale ?? message?.display_locale ?? "")
    .trim()
    .toLowerCase();
  if (src && disp && src !== disp) {
    const hasDisplay =
      message?.display_ui_payload && typeof message.display_ui_payload === "object";
    if (!hasDisplay) {
      return true;
    }
  }
  return false;
}

/**
 * @param {Record<string, unknown> | null | undefined} message
 */
export function intakeUiPayloadSameLocale(message) {
  const src = String(
    message?.source_locale ?? (message?.ui_payload && message.ui_payload.source_locale) ?? ""
  )
    .trim()
    .toLowerCase();
  const disp = String(message?.display_ui_payload_locale ?? message?.display_locale ?? "")
    .trim()
    .toLowerCase();
  return Boolean(src && disp && src === disp);
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
 * @param {(key: string, fallback: string) => string} [translate]
 */
export function threadListPreviewBody(row, translate = null) {
  const original = String(row?.last_message_body ?? row?.preview ?? "").trim();
  if (!original) {
    return "";
  }
  const tr = typeof translate === "function" ? translate : null;
  const status = String(row?.last_message_translation_status ?? "")
    .trim()
    .toLowerCase()
    .replace(/-/g, "_");
  const src = String(row?.last_message_source_locale ?? "")
    .trim()
    .toLowerCase();
  const disp = String(row?.last_message_display_locale ?? "")
    .trim()
    .toLowerCase();
  const sameLocale = Boolean(src && disp && src === disp);

  const displayRaw = row?.last_message_display_body;
  if (displayRaw != null && String(displayRaw).trim()) {
    return String(displayRaw).trim();
  }

  if (status === "translation_required_failed" && tr) {
    return messageTranslationPreparingPreviewLabel(tr);
  }

  if (tr) {
    if (messageTranslationStatusPending(status)) {
      return messageTranslationPreparingPreviewLabel(tr);
    }
    if (messageTranslationStatusUnavailable(status)) {
      return messageTranslationPreparingPreviewLabel(tr);
    }
    if (!sameLocale) {
      return messageTranslationPreparingPreviewLabel(tr);
    }
  } else if (messageTranslationStatusUnavailable(status) || !sameLocale) {
    return "";
  }

  if (sameLocale || status === "not_required") {
    return original;
  }

  return "";
}

/**
 * @param {Record<string, unknown> | null | undefined} up
 * @param {(key: string, fallback: string) => string} translate
 */
export function formPromptDisplayLabel(up, translate) {
  const status = up?.translation_status;
  if (messageTranslationStatusUnavailable(status) || messageTranslationStatusPending(status)) {
    return messageTranslationPreparingFormLabel(translate);
  }
  const display = String(up?.label ?? "").trim();
  if (!display) {
    return messageTranslationPreparingFormLabel(translate);
  }
  return display;
}
