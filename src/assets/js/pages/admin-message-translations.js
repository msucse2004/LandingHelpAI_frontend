/**
 * Admin — message body translation review (search, edit, approve, retry).
 */
import { adminMessageTranslationAdminApi, messagesApi } from "../core/api.js";
import { appPageLanguageReady } from "../core/app-page-i18n-boot.js";
import { ensureAdminAccess, protectCurrentPage } from "../core/guards.js";
import { applyI18nToDom } from "../core/i18n-dom.js";
import { t } from "../core/i18n-client.js";
import { loadSidebar } from "../components/sidebar.js";

const DEFAULT_SCOPE = "message_only";

/** @type {Record<string, unknown> | null} */
let currentDetail = null;
/** @type {boolean} */
let previewShowsOriginal = false;

function qs(selector) {
  return document.querySelector(selector);
}

function esc(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function setStatus(msg) {
  const el = qs("#lhaiMsgTransStatus");
  if (el) el.textContent = msg || "";
}

function apiErrorMessage(err) {
  if (err && typeof err === "object") {
    const detail = /** @type {{ detail?: unknown; message?: string }} */ (err).detail;
    if (detail && typeof detail === "object" && detail !== null && "message" in detail) {
      const m = /** @type {{ message?: string }} */ (detail).message;
      if (m) return String(m);
    }
    if ("message" in err && typeof err.message === "string" && err.message.trim()) {
      return err.message;
    }
  }
  return t("localization.message_review.error_action_failed", "Action failed.");
}

function normalizeLocale(value) {
  return String(value || "").trim().toLowerCase();
}

function sourceLocaleFromDetail(detail) {
  return String(detail?.source_locale || "").trim();
}

function targetLocalesFromDetail(detail) {
  const source = normalizeLocale(sourceLocaleFromDetail(detail));
  const fromDisplay = Array.isArray(detail?.display_by_locale) ? detail.display_by_locale : [];
  const locales = fromDisplay
    .map((row) => String(row?.locale || "").trim())
    .filter(Boolean)
    .filter((loc) => normalizeLocale(loc) !== source);
  if (locales.length) return [...new Set(locales)];
  const fromRows = Array.isArray(detail?.translations) ? detail.translations : [];
  return [
    ...new Set(
      fromRows
        .map((row) => String(row?.target_locale || "").trim())
        .filter(Boolean)
        .filter((loc) => normalizeLocale(loc) !== source)
    ),
  ];
}

function displayRowForLocale(detail, locale) {
  const loc = normalizeLocale(locale);
  const rows = Array.isArray(detail?.display_by_locale) ? detail.display_by_locale : [];
  return rows.find((row) => normalizeLocale(row?.locale) === loc) || null;
}

function translationRowForLocale(detail, locale) {
  const loc = normalizeLocale(locale);
  const rows = Array.isArray(detail?.translations) ? detail.translations : [];
  return rows.find((row) => normalizeLocale(row?.target_locale) === loc) || null;
}

function selectedTargetLocale() {
  const sel = qs("#lhaiMsgTransTargetLocale");
  return sel && "value" in sel ? String(sel.value || "").trim() : "";
}

function updateViewToggleLabel() {
  const btn = qs("#lhaiMsgTransViewToggle");
  const label = qs("#lhaiMsgTransPreviewLabel");
  if (!btn || !label) return;
  if (previewShowsOriginal) {
    btn.textContent = t("localization.message_review.view_translation", "View translation");
    label.textContent = t("localization.message_review.original_body_label", "Original body");
  } else {
    btn.textContent = t("localization.message_review.view_original", "View original");
    label.textContent = t(
      "localization.message_review.display_translation_label",
      "Current display translation"
    );
  }
}

function renderPreviewBody() {
  const pre = qs("#lhaiMsgTransPreviewBody");
  if (!pre || !currentDetail) return;
  if (previewShowsOriginal) {
    pre.textContent = String(currentDetail.original_body || "");
    return;
  }
  const locale = selectedTargetLocale();
  const display = displayRowForLocale(currentDetail, locale);
  pre.textContent = String(display?.display_body ?? currentDetail.original_body ?? "");
}

function formatDebugValue(value) {
  if (value == null || value === "") return "—";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function renderDebugPanel(detail) {
  const panel = qs("#lhaiMsgTransDebugPanel");
  const grid = qs("#lhaiMsgTransDebugGrid");
  if (!panel || !grid) return;
  const locale = selectedTargetLocale();
  const display = displayRowForLocale(detail, locale);
  const debug = display?.debug;
  if (!debug || typeof debug !== "object") {
    panel.hidden = true;
    grid.innerHTML = "";
    return;
  }
  panel.hidden = false;
  const rows = [
    ["message_id", debug.message_id],
    ["source_locale", debug.source_locale],
    ["target_locale", debug.target_locale],
    ["translation_source", debug.translation_source],
    ["provider", debug.provider],
    ["cache_hit", debug.cache_hit],
    ["status", debug.status],
    ["duration_ms", debug.duration_ms],
    ["source_text_length", debug.source_text_length],
    ["source_text_hash", debug.source_text_hash],
    ["error", debug.error],
    ["resolved_at", debug.resolved_at],
    ["stored_pipeline_metadata", debug.stored_pipeline_metadata],
  ];
  grid.innerHTML = rows
    .map(
      ([label, value]) =>
        `<div><dt>${esc(label)}</dt><dd>${esc(formatDebugValue(value))}</dd></div>`
    )
    .join("");
}

function renderLocalePanel() {
  if (!currentDetail) return;
  const locale = selectedTargetLocale();
  const display = displayRowForLocale(currentDetail, locale);
  const row = translationRowForLocale(currentDetail, locale);

  const sourceEl = qs("#lhaiMsgTransSourceLocale");
  if (sourceEl) sourceEl.textContent = sourceLocaleFromDetail(currentDetail) || "—";

  const statusEl = qs("#lhaiMsgTransStatusValue");
  if (statusEl) {
    statusEl.textContent = String(row?.status || display?.translation_status || "—");
  }

  const providerEl = qs("#lhaiMsgTransProvider");
  if (providerEl) {
    providerEl.textContent = String(row?.provider || display?.translation_provider || "—");
  }

  const sourceTypeEl = qs("#lhaiMsgTransTranslationSource");
  if (sourceTypeEl) {
    sourceTypeEl.textContent = String(row?.translation_source || display?.translation_source || "—");
  }

  const editEl = qs("#lhaiMsgTransEditValue");
  if (editEl && "value" in editEl) {
    const initial =
      row?.value != null && String(row.value).length
        ? String(row.value)
        : String(display?.display_body || "");
    editEl.value = initial;
  }

  renderPreviewBody();
  renderDebugPanel(currentDetail);
  updateViewToggleLabel();
}

function populateTargetLocaleSelect(detail) {
  const sel = qs("#lhaiMsgTransTargetLocale");
  if (!sel) return;
  const locales = targetLocalesFromDetail(detail);
  sel.innerHTML = locales
    .map((loc) => `<option value="${esc(loc)}">${esc(loc)}</option>`)
    .join("");
  if (!locales.length) {
    sel.innerHTML = `<option value="">${esc("—")}</option>`;
  }
}

function renderReviewPanel(detail) {
  currentDetail = detail;
  previewShowsOriginal = false;

  const panel = qs("#lhaiMsgTransReviewPanel");
  if (panel) panel.hidden = false;

  const meta = qs("#lhaiMsgTransReviewMeta");
  if (meta) {
    const mid = esc(detail.message_id || "");
    const tid = detail.thread_id ? esc(detail.thread_id) : "—";
    meta.innerHTML = `message_id: <code>${mid}</code> · thread_id: <code>${tid}</code>`;
  }

  populateTargetLocaleSelect(detail);
  renderLocalePanel();
}

function renderReportedQueue(items) {
  const root = qs("#lhaiMsgTransReportedList");
  if (!root) return;
  const rows = Array.isArray(items) ? items : [];
  if (!rows.length) {
    root.innerHTML = `<div class="lhai-state lhai-state--empty">${esc(
      t("localization.message_review.reported_queue_empty", "No user-reported translations.")
    )}</div>`;
    return;
  }
  root.innerHTML = rows
    .map((row) => {
      const messageId = String(row?.message_id || "").trim();
      const locale = String(row?.target_locale || "").trim();
      const preview = String(row?.value_preview || "").trim() || "—";
      const reportCount = Number(row?.report_count || 0);
      const reason = String(row?.last_report_reason || "").trim();
      const meta = [
        locale ? `locale: ${locale}` : "",
        reportCount ? `${t("localization.message_review.report_count_label", "Reports")}: ${reportCount}` : "",
        reason ? esc(reason) : "",
      ]
        .filter(Boolean)
        .join(" · ");
      return `
        <div class="admin-msg-trans__reported-item" data-message-id="${esc(messageId)}">
          <div class="admin-msg-trans__reported-snippet">
            <div><code>${esc(messageId)}</code></div>
            <div>${esc(preview)}</div>
            ${meta ? `<div class="u-text-muted">${meta}</div>` : ""}
          </div>
          <button type="button" class="lhai-button lhai-button--ghost lhai-button--sm" data-action="open-reported">${esc(
            t("localization.message_review.load_message", "Load message")
          )}</button>
        </div>`;
    })
    .join("");

  root.querySelectorAll("[data-action='open-reported']").forEach((btn) => {
    btn.addEventListener("click", () => {
      const item = btn.closest("[data-message-id]");
      const messageId = item?.getAttribute("data-message-id") || "";
      if (!messageId) return;
      const input = qs("#lhaiMsgTransMessageId");
      if (input && "value" in input) input.value = messageId;
      void loadMessageDetail(messageId);
    });
  });
}

async function loadReportedQueue() {
  try {
    const res = await adminMessageTranslationAdminApi.listReported({ limit: 50 });
    const items = Array.isArray(res?.items) ? res.items : [];
    renderReportedQueue(items);
  } catch (err) {
    renderReportedQueue([]);
    setStatus(apiErrorMessage(err));
  }
}

function renderThreadList(messages, activeMessageId = "") {
  const panel = qs("#lhaiMsgTransThreadPanel");
  const root = qs("#lhaiMsgTransThreadList");
  if (!panel || !root) return;

  const items = Array.isArray(messages) ? messages : [];
  if (!items.length) {
    panel.hidden = false;
    root.innerHTML = `<div class="lhai-state lhai-state--empty">${esc(
      t("localization.message_review.thread_messages_empty", "No messages found.")
    )}</div>`;
    return;
  }

  panel.hidden = false;
  root.innerHTML = items
    .map((msg) => {
      const id = String(msg?.id || "").trim();
      const body = String(msg?.body || msg?.display_body || "").trim();
      const snippet = body.length > 120 ? `${body.slice(0, 120)}…` : body || "—";
      const active = id && id === activeMessageId ? " is-active" : "";
      return `
        <div class="admin-msg-trans__thread-item${active}" data-message-id="${esc(id)}">
          <div class="admin-msg-trans__thread-snippet" title="${esc(body)}">${esc(snippet)}</div>
          <button type="button" class="lhai-button lhai-button--ghost lhai-button--sm" data-action="pick-message">${esc(
            t("localization.message_review.load_message", "Load message")
          )}</button>
        </div>`;
    })
    .join("");

  root.querySelectorAll("[data-action='pick-message']").forEach((btn) => {
    btn.addEventListener("click", () => {
      const item = btn.closest("[data-message-id]");
      const messageId = item?.getAttribute("data-message-id") || "";
      if (!messageId) return;
      const input = qs("#lhaiMsgTransMessageId");
      if (input && "value" in input) input.value = messageId;
      void loadMessageDetail(messageId);
    });
  });
}

async function loadMessageDetail(messageId) {
  const id = String(messageId || "").trim();
  if (!id) {
    setStatus(t("localization.message_review.error_message_required", "Enter a message ID."));
    return;
  }
  try {
    setStatus(t("localization.message_review.status_loading", "Loading…"));
    const detail = await adminMessageTranslationAdminApi.getDetail(id);
    renderReviewPanel(detail);
    setStatus(t("localization.message_review.status_loaded", "Loaded."));
    renderThreadList([], id);
  } catch (err) {
    setStatus(apiErrorMessage(err) || t("localization.message_review.error_load_failed", "Could not load data."));
  }
}

async function onLoadMessageClick() {
  const input = qs("#lhaiMsgTransMessageId");
  const id = input && "value" in input ? String(input.value || "").trim() : "";
  await loadMessageDetail(id);
}

async function onLoadThreadClick() {
  const threadInput = qs("#lhaiMsgTransThreadId");
  const profileInput = qs("#lhaiMsgTransCustomerProfileId");
  const threadId = threadInput && "value" in threadInput ? String(threadInput.value || "").trim() : "";
  const customerProfileId =
    profileInput && "value" in profileInput ? String(profileInput.value || "").trim() : "";
  if (!threadId || !customerProfileId) {
    setStatus(
      t(
        "localization.message_review.error_thread_required",
        "Enter thread ID and customer profile ID."
      )
    );
    return;
  }
  try {
    setStatus(t("localization.message_review.status_loading", "Loading…"));
    const messages = await messagesApi.operatorThreadMessages(threadId, { customerProfileId });
    renderThreadList(messages);
    setStatus(
      t("localization.message_review.select_message_hint", "Select a message from the thread list.")
    );
  } catch (err) {
    setStatus(apiErrorMessage(err) || t("localization.message_review.error_load_failed", "Could not load data."));
    renderThreadList([]);
  }
}

async function reloadCurrentMessage() {
  if (!currentDetail?.message_id) return;
  await loadMessageDetail(String(currentDetail.message_id));
}

async function onSaveEdit() {
  if (!currentDetail?.message_id) return;
  const locale = selectedTargetLocale();
  if (!locale) return;
  const editEl = qs("#lhaiMsgTransEditValue");
  const reasonEl = qs("#lhaiMsgTransReason");
  const value = editEl && "value" in editEl ? String(editEl.value || "").trim() : "";
  const reason = reasonEl && "value" in reasonEl ? String(reasonEl.value || "").trim() : "";
  if (!value) return;
  if (!reason) {
    setStatus(t("localization.message_review.error_reason_required", "Enter a reason before saving."));
    return;
  }
  try {
    setStatus(t("localization.message_review.status_loading", "Loading…"));
    await adminMessageTranslationAdminApi.edit(String(currentDetail.message_id), {
      target_locale: locale,
      value,
      reason,
      scope: DEFAULT_SCOPE,
    });
    setStatus(t("localization.message_review.status_saved", "Edit saved."));
    await reloadCurrentMessage();
  } catch (err) {
    setStatus(apiErrorMessage(err));
  }
}

async function onApprove() {
  if (!currentDetail?.message_id) return;
  const locale = selectedTargetLocale();
  if (!locale) return;
  const reasonEl = qs("#lhaiMsgTransReason");
  const reason = reasonEl && "value" in reasonEl ? String(reasonEl.value || "").trim() : "";
  try {
    setStatus(t("localization.message_review.status_loading", "Loading…"));
    await adminMessageTranslationAdminApi.approve(String(currentDetail.message_id), {
      target_locale: locale,
      reason: reason || null,
      scope: DEFAULT_SCOPE,
    });
    setStatus(t("localization.message_review.status_approved", "Translation approved."));
    await reloadCurrentMessage();
  } catch (err) {
    setStatus(apiErrorMessage(err));
  }
}

async function onRetry() {
  if (!currentDetail?.message_id) return;
  const locale = selectedTargetLocale();
  if (!locale) return;
  const reasonEl = qs("#lhaiMsgTransReason");
  const forceEl = qs("#lhaiMsgTransRetryForce");
  const reason = reasonEl && "value" in reasonEl ? String(reasonEl.value || "").trim() : "";
  const force = Boolean(forceEl && "checked" in forceEl && forceEl.checked);
  try {
    setStatus(t("localization.message_review.status_loading", "Loading…"));
    await adminMessageTranslationAdminApi.retry(String(currentDetail.message_id), {
      target_locale: locale,
      force,
      reason: reason || null,
    });
    setStatus(t("localization.message_review.status_retried", "Retry completed."));
    await reloadCurrentMessage();
  } catch (err) {
    setStatus(apiErrorMessage(err));
  }
}

function onViewToggle() {
  previewShowsOriginal = !previewShowsOriginal;
  renderPreviewBody();
  updateViewToggleLabel();
}

function bindEvents() {
  qs("#lhaiMsgTransLoadMessage")?.addEventListener("click", () => {
    void onLoadMessageClick();
  });
  qs("#lhaiMsgTransLoadThread")?.addEventListener("click", () => {
    void onLoadThreadClick();
  });
  qs("#lhaiMsgTransLoadReported")?.addEventListener("click", () => {
    void loadReportedQueue();
  });
  qs("#lhaiMsgTransTargetLocale")?.addEventListener("change", () => {
    previewShowsOriginal = false;
    renderLocalePanel();
  });
  qs("#lhaiMsgTransSaveEdit")?.addEventListener("click", () => {
    void onSaveEdit();
  });
  qs("#lhaiMsgTransApprove")?.addEventListener("click", () => {
    void onApprove();
  });
  qs("#lhaiMsgTransRetry")?.addEventListener("click", () => {
    void onRetry();
  });
  qs("#lhaiMsgTransViewToggle")?.addEventListener("click", onViewToggle);

  qs("#lhaiMsgTransMessageId")?.addEventListener("keydown", (ev) => {
    if (ev.key === "Enter") void onLoadMessageClick();
  });
}

function applyQueryParams() {
  const params = new URLSearchParams(window.location.search);
  const messageId = params.get("message_id") || params.get("messageId") || "";
  const threadId = params.get("thread_id") || params.get("threadId") || "";
  const customerProfileId = params.get("customer_profile_id") || params.get("customerProfileId") || "";
  if (messageId) {
    const input = qs("#lhaiMsgTransMessageId");
    if (input && "value" in input) input.value = messageId;
  }
  if (threadId) {
    const input = qs("#lhaiMsgTransThreadId");
    if (input && "value" in input) input.value = threadId;
  }
  if (customerProfileId) {
    const input = qs("#lhaiMsgTransCustomerProfileId");
    if (input && "value" in input) input.value = customerProfileId;
  }
  if (messageId) {
    void loadMessageDetail(messageId);
  } else if (threadId && customerProfileId) {
    void onLoadThreadClick();
  }
}

async function init() {
  if (!protectCurrentPage()) return;
  if (!ensureAdminAccess()) return;
  await appPageLanguageReady;
  await loadSidebar("#sidebar", "admin");
  const main = qs("#main");
  if (main) applyI18nToDom(main);
  bindEvents();
  setStatus(t("localization.message_review.status_idle", "Search for a message to begin."));
  void loadReportedQueue();
  applyQueryParams();
}

void init();
