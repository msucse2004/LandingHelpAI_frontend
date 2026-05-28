/**
 * Admin: Bidding notification debug panel (read-only, authenticated admin API client).
 * @module admin-bidding-notification-debug-ui
 */

export const ADMIN_BID_NOTIFY_AUTH_MESSAGE =
  "Admin authentication is required. Please log in as an admin.";

/** @param {unknown} err */
export function biddingNotificationHttpStatus(err) {
  if (err != null && typeof err === "object" && "status" in err) {
    const n = Number(/** @type {{ status?: number }} */ (err).status);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

/** @param {unknown} err */
export function formatBiddingNotificationLoadError(err) {
  const st = biddingNotificationHttpStatus(err);
  if (st === 401 || st === 403) return ADMIN_BID_NOTIFY_AUTH_MESSAGE;
  const msg = err instanceof Error ? err.message : String(err ?? "");
  if (/인증이 필요|authentication|unauthorized/i.test(msg)) return ADMIN_BID_NOTIFY_AUTH_MESSAGE;
  return msg.trim() || "Failed to load notification debug.";
}

/** @param {unknown} s */
export function biddingNotifyDebugEscapeHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** @param {unknown} v */
export function biddingNotifyDebugYesNo(v) {
  if (v === true) return "Yes";
  if (v === false) return "No";
  return "—";
}

/** @param {Record<string, unknown>} vm */
export function computeBiddingNotificationHints(vm) {
  const v = vm && typeof vm === "object" ? vm : {};
  if (v.not_found) {
    return {
      root_cause_hint: "Bid request or thread was not found for this ID.",
      recommended_next_action:
        "Confirm bid_request_id from Customer 360, messages (operator inbox), or admin services workflow tab.",
    };
  }
  if (String(v.root_cause_hint || "").trim()) {
    return {
      root_cause_hint: String(v.root_cause_hint).trim(),
      recommended_next_action: String(v.recommended_next_action || "").trim() || "—",
    };
  }
  const smtpOn = v.smtp_enabled === true;
  const dedupe = v.skipped_dedupe === true;
  const mode = String(v.resolved_bidding_mode || "").toUpperCase();
  const modeOk = v.mode_supported === true || mode === "CAR_PURCHASE";
  const attempted = Number(v.attempted) || 0;
  const sent = Number(v.sent) || 0;
  const failed = Number(v.failed) || 0;
  const skippedNo = Number(v.skipped_no_email) || 0;
  const eligible = Number(v.eligible_partners);
  const eligibleN = Number.isFinite(eligible) ? eligible : null;

  if (v.config_normalized === false || v.workflow_config_root_cause === "workflow_config_not_normalized") {
    const missing = v.missing_bidding_mode === true;
    const actual = v.actual_bidding_mode != null ? String(v.actual_bidding_mode) : "(missing)";
    const expected = v.expected_bidding_mode != null ? String(v.expected_bidding_mode) : "CAR_PURCHASE";
    return {
      root_cause_hint:
        v.workflow_config_hint ||
        `Workflow config is not normalized (${missing ? "bidding.mode is missing" : `stored ${actual}, expected ${expected}`}).`,
      recommended_next_action:
        v.workflow_config_action ||
        "Save the service workflow again or run POST /api/admin/services/repair-auto-dealer-bidding-mode.",
    };
  }
  if (v.smtp_enabled === false) {
    return {
      root_cause_hint: "SMTP is disabled or not configured on the server.",
      recommended_next_action: "Configure SMTP in backend environment and redeploy.",
    };
  }
  if (dedupe) {
    return {
      root_cause_hint: "Send skipped: dedupe marker already exists for this bid request.",
      recommended_next_action: "Expected for repeat dispatch; use a new bid request to test again.",
    };
  }
  if (!modeOk && mode) {
    return {
      root_cause_hint: `Bidding mode "${mode}" does not support started-email (CAR_PURCHASE only).`,
      recommended_next_action:
        "Admin → Service workflow: MULTI_PARTNER_QUOTE_AND_SELECT + partner_type AUTO_DEALER saves bidding.mode CAR_PURCHASE (canonical mapping). Re-save workflow or run repair_workflow_config_bidding_mode.py.",
    };
  }
  if (v.started_email_function_called === false) {
    return {
      root_cause_hint: "Bidding-started notification function was not called during dispatch.",
      recommended_next_action: "Check intake dispatch diagnostics and failure_reason in trace JSON.",
    };
  }
  if (eligibleN === 0) {
    return {
      root_cause_hint: "No eligible partners were matched.",
      recommended_next_action: "Review partner coverage, capabilities, and customer location.",
    };
  }
  if (attempted === 0 && skippedNo > 0) {
    return {
      root_cause_hint: "Partners were missing resolvable email addresses.",
      recommended_next_action: "Fix partner or auth account emails listed in partner_email_resolutions.",
    };
  }
  if (failed > 0) {
    return {
      root_cause_hint: `${failed} partner email(s) failed after attempt.`,
      recommended_next_action: "See errors table and server SMTP logs.",
    };
  }
  if (sent > 0) {
    return {
      root_cause_hint: `Successfully sent to ${sent} partner(s).`,
      recommended_next_action: "If inbox empty, check spam and masked email targets.",
    };
  }
  if (attempted === 0) {
    return {
      root_cause_hint: "No send attempts recorded.",
      recommended_next_action: "Expand raw trace; verify draft bids and mode_supported.",
    };
  }
  return {
    root_cause_hint: "Review metrics and partner resolution table below.",
    recommended_next_action: "Compare attempted, sent, and failed counts.",
  };
}

/**
 * @param {Record<string, unknown>} merged
 * @returns {string}
 */
export function resolveBidRequestIdFromMergedPayload(merged) {
  const direct = String(merged.bid_request_id || "").trim();
  if (direct) return direct;
  const latest = String(merged.latest_bid_request_id || "").trim();
  if (latest) return latest;
  const audit =
    merged.bidding_notification_audit && typeof merged.bidding_notification_audit === "object"
      ? /** @type {Record<string, unknown>} */ (merged.bidding_notification_audit)
      : null;
  if (audit) {
    const fromAudit = String(audit.car_bid_deadline_notification_bid_request_id || "").trim();
    if (fromAudit) return fromAudit;
    const n = audit.bidding_started_notification;
    if (n && typeof n === "object") {
      const br = String(/** @type {Record<string, unknown>} */ (n).bid_request_id || "").trim();
      if (br) return br;
    }
  }
  const trace =
    merged.last_bidding_dispatch_debug && typeof merged.last_bidding_dispatch_debug === "object"
      ? /** @type {Record<string, unknown>} */ (merged.last_bidding_dispatch_debug)
      : null;
  if (trace?.bid_request && typeof trace.bid_request === "object") {
    const br = String(
      /** @type {Record<string, unknown>} */ (trace.bid_request).bid_request_id || ""
    ).trim();
    if (br) return br;
  }
  return "";
}

/**
 * Build a flat view-model from trace, intake diagnostics block, or notification-debug API.
 * @param {Record<string, unknown>} input
 */
export function normalizeBiddingNotificationDebugViewModel(input) {
  const src = input && typeof input === "object" ? input : {};
  const trace =
    src.last_bidding_dispatch_debug && typeof src.last_bidding_dispatch_debug === "object"
      ? /** @type {Record<string, unknown>} */ (src.last_bidding_dispatch_debug)
      : src.trace && typeof src.trace === "object"
        ? /** @type {Record<string, unknown>} */ (src.trace)
        : null;
  const diag =
    src.bidding_dispatch_diagnostics && typeof src.bidding_dispatch_diagnostics === "object"
      ? /** @type {Record<string, unknown>} */ (src.bidding_dispatch_diagnostics)
      : src.diagnostics && typeof src.diagnostics === "object"
        ? /** @type {Record<string, unknown>} */ (src.diagnostics)
        : null;
  const audit =
    src.bidding_notification_audit && typeof src.bidding_notification_audit === "object"
      ? /** @type {Record<string, unknown>} */ (src.bidding_notification_audit)
      : null;

  const resolved =
    (trace?.resolved_bidding && typeof trace.resolved_bidding === "object"
      ? trace.resolved_bidding
      : src.resolved_bidding && typeof src.resolved_bidding === "object"
        ? src.resolved_bidding
        : diag && typeof diag === "object"
          ? {
              mode: diag.resolved_bidding_mode ?? diag.workflow_config_bidding_mode,
              enabled: true,
              raw_workflow_config: {
                workflow_type: diag.workflow_type,
                multi_partner_partner_type: diag.workflow_config_multi_partner_type,
                bidding_enabled: diag.stored_bidding_enabled,
                bidding_mode: diag.workflow_config_bidding_mode ?? diag.actual_bidding_mode,
              },
              config_validation: {
                config_normalized: diag.config_normalized,
                missing_bidding_mode: diag.workflow_config_bidding_mode_missing,
                expected_bidding_mode: diag.workflow_config_bidding_mode_canonical,
                actual_bidding_mode: diag.workflow_config_bidding_mode,
                root_cause_hint: diag.workflow_config_root_cause_hint,
                recommended_next_action: diag.workflow_config_recommended_next_action,
              },
            }
          : {}) || {};
  const rawWf =
    src.raw_workflow_config && typeof src.raw_workflow_config === "object"
      ? /** @type {Record<string, unknown>} */ (src.raw_workflow_config)
      : resolved.raw_workflow_config && typeof resolved.raw_workflow_config === "object"
        ? /** @type {Record<string, unknown>} */ (resolved.raw_workflow_config)
        : {};
  const validation =
    src.workflow_config_validation && typeof src.workflow_config_validation === "object"
      ? /** @type {Record<string, unknown>} */ (src.workflow_config_validation)
      : resolved.config_validation && typeof resolved.config_validation === "object"
        ? /** @type {Record<string, unknown>} */ (resolved.config_validation)
        : {};
  const resolvedBlock =
    resolved.resolved && typeof resolved.resolved === "object"
      ? /** @type {Record<string, unknown>} */ (resolved.resolved)
      : {};
  const notif =
    trace?.notification && typeof trace.notification === "object"
      ? /** @type {Record<string, unknown>} */ (trace.notification)
      : {};
  const smtp =
    notif.smtp && typeof notif.smtp === "object"
      ? /** @type {Record<string, unknown>} */ (notif.smtp)
      : src.smtp && typeof src.smtp === "object"
        ? /** @type {Record<string, unknown>} */ (src.smtp)
        : {};
  const br =
    trace?.bid_request && typeof trace.bid_request === "object"
      ? /** @type {Record<string, unknown>} */ (trace.bid_request)
      : {};
  const pm =
    trace?.partner_matching && typeof trace.partner_matching === "object"
      ? /** @type {Record<string, unknown>} */ (trace.partner_matching)
      : {};
  const draft =
    trace?.draft_bids && typeof trace.draft_bids === "object"
      ? /** @type {Record<string, unknown>} */ (trace.draft_bids)
      : {};

  const pickNum = (...vals) => {
    for (const v of vals) {
      if (v === null || v === undefined || v === "") continue;
      const n = Number(v);
      if (Number.isFinite(n)) return n;
    }
    return null;
  };

  const attempted = pickNum(
    notif.attempted,
    audit?.bidding_started_email_attempted,
    diag?.bidding_started_email_attempted,
    diag?.partner_notification_email_attempted
  );
  const sent = pickNum(
    notif.sent,
    audit?.bidding_started_email_sent,
    diag?.bidding_started_email_sent,
    diag?.partner_notification_email_sent
  );
  const failed = pickNum(
    notif.failed,
    audit?.bidding_started_email_failed,
    diag?.bidding_started_email_failed,
    diag?.partner_notification_email_failed
  );
  const skippedNoEmail = pickNum(
    notif.skipped_no_email,
    audit?.bidding_started_email_skipped_no_email,
    diag?.bidding_started_email_skipped_no_email
  );
  const dedupeSkipped = Boolean(
    notif.dedupe_skipped ??
      audit?.bidding_started_email_skipped_dedupe ??
      diag?.bidding_started_email_skipped_dedupe
  );

  let errors = [];
  if (Array.isArray(notif.errors)) errors = notif.errors;
  else if (Array.isArray(diag?.bidding_started_email_errors)) errors = diag.bidding_started_email_errors;
  else if (Array.isArray(audit?.bidding_started_email_errors)) errors = audit.bidding_started_email_errors;

  const resolutions = Array.isArray(notif.partner_email_resolutions)
    ? notif.partner_email_resolutions
    : [];

  const bidRequestId = resolveBidRequestIdFromMergedPayload(src) || null;
  const traceId = String(trace?.trace_id || diag?.trace_id || "").trim() || null;

  const modeSupported =
    notif.mode_supported != null
      ? Boolean(notif.mode_supported)
      : validation.mode_supported != null
        ? Boolean(validation.mode_supported)
        : resolvedBlock.mode_supported != null
          ? Boolean(resolvedBlock.mode_supported)
          : String(resolved.mode || diag?.resolved_bidding_mode || src.resolved_bidding_mode || "")
              .trim()
              .toUpperCase() === "CAR_PURCHASE";

  const vm = {
    trace_id: traceId,
    resolved_bidding_mode: String(
      resolvedBlock.resolved_bidding_mode ||
        resolved.mode ||
        diag?.resolved_bidding_mode ||
        src.resolved_bidding_mode ||
        "—"
    ),
    resolved_bidding_source: String(
      resolvedBlock.resolved_bidding_source || resolved.source || src.resolved_bidding_source || "—"
    ),
    workflow_type: String(rawWf.workflow_type || diag?.workflow_type || "—"),
    multi_partner_partner_type: String(
      rawWf.multi_partner_partner_type || diag?.workflow_config_multi_partner_type || "—"
    ),
    stored_bidding_mode: String(rawWf.bidding_mode ?? validation.actual_bidding_mode ?? "—"),
    stored_bidding_enabled: rawWf.bidding_enabled ?? diag?.stored_bidding_enabled ?? null,
    config_normalized: validation.config_normalized ?? diag?.config_normalized ?? null,
    missing_bidding_mode: validation.missing_bidding_mode ?? diag?.missing_bidding_mode ?? null,
    expected_bidding_mode: String(validation.expected_bidding_mode ?? diag?.expected_bidding_mode ?? "—"),
    actual_bidding_mode:
      validation.actual_bidding_mode != null
        ? String(validation.actual_bidding_mode)
        : rawWf.bidding_mode != null
          ? String(rawWf.bidding_mode)
          : "—",
    workflow_config_root_cause: String(validation.root_cause_hint || diag?.workflow_config_root_cause_hint || ""),
    workflow_config_hint: String(src.root_cause_hint || "").trim(),
    workflow_config_action: String(src.recommended_next_action || "").trim(),
    bidding_enabled: resolved.enabled ?? rawWf.bidding_enabled ?? null,
    bid_request_id: bidRequestId,
    bid_request_status: String(
      br.status || src.bid_request_status || diag?.dispatch_status || ""
    ).trim() || "—",
    eligible_partners: pickNum(
      pm.eligible_partner_count,
      diag?.eligible_partner_count,
      draft.created_count
    ),
    draft_bids_created: pickNum(draft.created_count, diag?.draft_bids_created, diag?.eligible_partner_count),
    started_email_function_called:
      notif.started_email_function_called ??
      diag?.started_email_function_called ??
      null,
    mode_supported: modeSupported,
    smtp_enabled: smtp.smtp_enabled ?? diag?.bidding_started_email_smtp_enabled ?? null,
    smtp_host_present: smtp.smtp_host_present ?? null,
    smtp_port: smtp.smtp_port != null ? String(smtp.smtp_port) : "—",
    attempted: attempted ?? 0,
    sent: sent ?? 0,
    failed: failed ?? 0,
    skipped_no_email: skippedNoEmail ?? 0,
    skipped_dedupe: dedupeSkipped,
    sent_at:
      audit?.bidding_started_email_sent_at ??
      diag?.bidding_started_email_sent_at ??
      notif.sent_at ??
      null,
    errors,
    partner_email_resolutions: resolutions,
    dispatch_status: trace?.dispatch_status ?? diag?.dispatch_status ?? null,
    failure_reason: trace?.failure_reason ?? null,
    root_cause_hint: String(src.root_cause_hint || "").trim(),
    recommended_next_action: String(src.recommended_next_action || "").trim(),
    raw_trace: trace,
    load_error: src.load_error != null ? String(src.load_error) : null,
    auth_required: src.auth_required === true,
    not_found: src.found === false,
    ai_bid_request_brief_debug:
      src.ai_bid_request_brief_debug && typeof src.ai_bid_request_brief_debug === "object"
        ? /** @type {Record<string, unknown>} */ (src.ai_bid_request_brief_debug)
        : null,
  };

  const hints = computeBiddingNotificationHints(vm);
  if (!vm.root_cause_hint) vm.root_cause_hint = hints.root_cause_hint;
  if (!vm.recommended_next_action) vm.recommended_next_action = hints.recommended_next_action;
  return vm;
}

/** @param {Record<string, unknown>} row @param {Record<string, unknown>} vm */
export function partnerEmailResolutionStatus(row, vm) {
  const pid = String(row.partner_account_id || "").trim();
  const err = (vm.errors || []).find(
    (e) => e && typeof e === "object" && String(/** @type {Record<string, unknown>} */ (e).partner_account_id) === pid
  );
  if (vm.skipped_dedupe) return "skipped";
  if (row.skip_reason) return "no email";
  if (err) return "failed";
  const attempted = Number(vm.attempted) || 0;
  const sent = Number(vm.sent) || 0;
  if (attempted === 0) {
    if (vm.started_email_function_called === false) return "skipped";
    if (!row.resolved_email_masked) return "no email";
    return "ready";
  }
  if (sent > 0 && row.resolved_email_masked && !err) return "sent";
  if (row.resolved_email_masked && !row.skip_reason) return "ready";
  return "skipped";
}

/** @param {Record<string, unknown>} vm */
function _buildStatusBadges(vm) {
  const badges = [];
  const sent = Number(vm.sent) || 0;
  const attempted = Number(vm.attempted) || 0;
  const failed = Number(vm.failed) || 0;
  const skippedNo = Number(vm.skipped_no_email) || 0;

  if (vm.auth_required) {
    badges.push({ cls: "lhai-bid-notify-badge lhai-bid-notify-badge--danger", label: "Auth required" });
    return badges;
  }
  if (vm.not_found) {
    badges.push({ cls: "lhai-bid-notify-badge lhai-bid-notify-badge--warn", label: "No debug data" });
    return badges;
  }
  if (sent > 0) {
    badges.push({ cls: "lhai-bid-notify-badge lhai-bid-notify-badge--ok", label: "Email sent" });
  }
  if (vm.smtp_enabled === false) {
    badges.push({ cls: "lhai-bid-notify-badge lhai-bid-notify-badge--danger", label: "SMTP disabled" });
  }
  if (attempted === 0) {
    badges.push({
      cls: "lhai-bid-notify-badge lhai-bid-notify-badge--attention",
      label: "Email not attempted",
    });
  }
  if (skippedNo > 0) {
    badges.push({
      cls: "lhai-bid-notify-badge lhai-bid-notify-badge--warn",
      label: "Some partners missing email",
    });
  }
  if (failed > 0) {
    badges.push({ cls: "lhai-bid-notify-badge lhai-bid-notify-badge--danger", label: "Email failed" });
  }
  if (vm.skipped_dedupe) {
    badges.push({ cls: "lhai-bid-notify-badge lhai-bid-notify-badge--warn", label: "Skipped (dedupe)" });
  }
  return badges;
}

/** @param {Record<string, unknown>} vm @param {(label: string, val: unknown) => string} kv */
function _renderWorkflowConfigSection(vm, kv) {
  const normCls =
    vm.config_normalized === true
      ? "lhai-bid-notify-config--ok"
      : vm.config_normalized === false
        ? "lhai-bid-notify-config--warn"
        : "";
  return `<div class="lhai-bid-notify-debug__section ${normCls}">
    <h5 class="lhai-bid-notify-debug__section-title">Raw workflow config (catalog)</h5>
    <ul class="lhai-intake-diag-kv lhai-bid-notify-debug__kv">
      ${kv("workflow_type", vm.workflow_type)}
      ${kv("multi_partner.partner_type", vm.multi_partner_partner_type)}
      ${kv("bidding.enabled", biddingNotifyDebugYesNo(vm.stored_bidding_enabled))}
      ${kv("bidding.mode (stored)", vm.stored_bidding_mode)}
    </ul>
    <h5 class="lhai-bid-notify-debug__section-title u-mt-2">Resolved config</h5>
    <ul class="lhai-intake-diag-kv lhai-bid-notify-debug__kv">
      ${kv("resolved_bidding_mode", vm.resolved_bidding_mode)}
      ${kv("mode_supported", biddingNotifyDebugYesNo(vm.mode_supported))}
      ${kv("resolved_bidding_source", vm.resolved_bidding_source)}
    </ul>
    <h5 class="lhai-bid-notify-debug__section-title u-mt-2">Config validation</h5>
    <ul class="lhai-intake-diag-kv lhai-bid-notify-debug__kv">
      ${kv("config_normalized", biddingNotifyDebugYesNo(vm.config_normalized))}
      ${kv("missing_bidding_mode", biddingNotifyDebugYesNo(vm.missing_bidding_mode))}
      ${kv("expected_bidding_mode", vm.expected_bidding_mode)}
      ${kv("actual_bidding_mode", vm.actual_bidding_mode)}
    </ul>
  </div>`;
}

/** @param {Record<string, unknown>} vm @param {(label: string, val: unknown) => string} kv */
function _renderAiBidRequestBriefDebugSection(vm, kv) {
  const d =
    vm.ai_bid_request_brief_debug && typeof vm.ai_bid_request_brief_debug === "object"
      ? vm.ai_bid_request_brief_debug
      : null;
  if (!d) {
    return `<div class="lhai-bid-notify-debug__section lhai-bid-notify-debug__section--brief u-mt-2">
      <h5 class="lhai-bid-notify-debug__section-title">AI bid request briefing (Ollama)</h5>
      <p class="u-text-muted">No briefing debug payload (load bid-request notification-debug).</p>
    </div>`;
  }
  const exists = d.exists === true;
  const fallback = d.fallback_used === true;
  const statusCls = !exists
    ? "lhai-bid-notify-brief--missing"
    : fallback
      ? "lhai-bid-notify-brief--fallback"
      : "lhai-bid-notify-brief--ok";
  const statusLabel = !exists
    ? "No briefing stored"
    : fallback
      ? `Fallback (${String(d.error_kind || d.provider || "unknown")})`
      : `Ollama · ${String(d.model || "model unknown")}`;
  return `<div class="lhai-bid-notify-debug__section lhai-bid-notify-debug__section--brief u-mt-2">
    <h5 class="lhai-bid-notify-debug__section-title">AI bid request briefing (Ollama)</h5>
    <p class="lhai-bid-notify-brief-status ${statusCls}" role="status">${biddingNotifyDebugEscapeHtml(statusLabel)}</p>
    <ul class="lhai-intake-diag-kv lhai-bid-notify-debug__kv">
      ${kv("exists", biddingNotifyDebugYesNo(d.exists))}
      ${kv("provider", d.provider ?? "—")}
      ${kv("model", d.model ?? "—")}
      ${kv("generated_at", d.generated_at ?? "—")}
      ${kv("fallback_used", biddingNotifyDebugYesNo(d.fallback_used))}
      ${d.error_kind != null ? kv("error_kind", d.error_kind) : ""}
      ${kv("input_answer_count", d.input_answer_count ?? "—")}
      ${kv("used_answer_count", d.used_answer_count ?? "—")}
      ${kv("output_language", d.output_language ?? "—")}
      ${d.version != null ? kv("snapshot_version", d.version) : ""}
    </ul>
  </div>`;
}

/** @param {Record<string, unknown>} vm @param {(label: string, val: unknown) => string} kv */
function _renderStartedEmailSection(vm, kv) {
  return `<div class="lhai-bid-notify-debug__section u-mt-2">
    <h5 class="lhai-bid-notify-debug__section-title">Started email dispatch</h5>
    <ul class="lhai-intake-diag-kv lhai-bid-notify-debug__kv lhai-bid-notify-debug__kv--primary">
      ${kv("started_email_function_called", biddingNotifyDebugYesNo(vm.started_email_function_called))}
      ${kv("attempted", vm.attempted)}
      ${kv("sent", vm.sent)}
      ${kv("failed", vm.failed)}
      ${kv("skipped_no_email", vm.skipped_no_email)}
      ${kv("skipped_dedupe", biddingNotifyDebugYesNo(vm.skipped_dedupe))}
      ${kv("smtp_enabled", biddingNotifyDebugYesNo(vm.smtp_enabled))}
    </ul>
  </div>`;
}

/**
 * @param {Record<string, unknown>} vm
 * @param {{ compact?: boolean }} [opts]
 */
export function buildBiddingNotificationDebugHtml(vm, opts = {}) {
  const v = vm && typeof vm === "object" ? vm : normalizeBiddingNotificationDebugViewModel({});
  const esc = biddingNotifyDebugEscapeHtml;
  const badges = _buildStatusBadges(v);
  const badgesHtml = badges.length
    ? `<div class="lhai-bid-notify-debug__badges">${badges
        .map((b) => `<span class="${b.cls}">${esc(b.label)}</span>`)
        .join("")}</div>`
    : "";

  const kv = (label, val) =>
    `<li><span>${esc(label)}</span><strong>${esc(val != null && val !== "" ? val : "—")}</strong></li>`;

  const authBlock = v.auth_required
    ? `<p class="lhai-state lhai-state--error" role="alert">${esc(ADMIN_BID_NOTIFY_AUTH_MESSAGE)}</p>`
    : "";

  const hintsBlock =
    !v.auth_required && (v.root_cause_hint || v.recommended_next_action)
      ? `<div class="lhai-bid-notify-debug__hints">
          <p class="lhai-bid-notify-debug__hint-title"><strong>Root cause hint</strong></p>
          <p class="lhai-bid-notify-debug__hint-body">${esc(v.root_cause_hint || "—")}</p>
          <p class="lhai-bid-notify-debug__hint-title u-mt-2"><strong>Recommended next action</strong></p>
          <p class="lhai-bid-notify-debug__hint-body">${esc(v.recommended_next_action || "—")}</p>
        </div>`
      : "";

  const errors = Array.isArray(v.errors) ? v.errors : [];
  const errorsHtml = errors.length
    ? `<table class="lhai-table lhai-bid-notify-debug__table"><thead><tr><th>Partner account</th><th>Email (masked)</th><th>Reason</th></tr></thead><tbody>${errors
        .map((e) => {
          const row = e && typeof e === "object" ? /** @type {Record<string, unknown>} */ (e) : {};
          return `<tr><td><code>${esc(row.partner_account_id || "—")}</code></td><td>${esc(
            row.partner_email || "—"
          )}</td><td>${esc(row.reason || "")}</td></tr>`;
        })
        .join("")}</tbody></table>`
    : '<p class="u-text-muted">(none)</p>';

  const resolutions = Array.isArray(v.partner_email_resolutions) ? v.partner_email_resolutions : [];
  const resHtml = resolutions.length
    ? `<table class="lhai-table lhai-bid-notify-debug__table"><thead><tr><th>Partner account</th><th>Email (masked)</th><th>Status</th></tr></thead><tbody>${resolutions
        .map((r) => {
          const row = r && typeof r === "object" ? /** @type {Record<string, unknown>} */ (r) : {};
          const st = partnerEmailResolutionStatus(row, v);
          const stCls =
            st === "sent"
              ? "lhai-bid-notify-status--sent"
              : st === "failed"
                ? "lhai-bid-notify-status--failed"
                : st === "no email"
                  ? "lhai-bid-notify-status--no-email"
                  : st === "ready"
                    ? "lhai-bid-notify-status--ready"
                    : "lhai-bid-notify-status--skipped";
          return `<tr><td><code>${esc(row.partner_account_id || "—")}</code></td><td>${esc(
            row.resolved_email_masked || "—"
          )}</td><td><span class="lhai-bid-notify-status ${stCls}">${esc(st)}</span></td></tr>`;
        })
        .join("")}</tbody></table>`
    : '<p class="u-text-muted">(no per-partner resolution data)</p>';

  const loadErr =
    v.load_error && !v.auth_required
      ? `<p class="lhai-state lhai-state--error">${esc(v.load_error)}</p>`
      : "";

  const rawJson =
    !opts.compact && v.raw_trace && !v.auth_required
      ? `<details class="lhai-intake-diag-acc u-mt-2"><summary class="lhai-intake-diag-acc__summary">Raw last_bidding_dispatch_debug</summary><div class="lhai-intake-diag-acc__body"><pre class="lhai-intake-diag-pre">${esc(
          JSON.stringify(v.raw_trace, null, 2)
        )}</pre></div></details>`
      : "";

  const extraKv =
    !v.auth_required && !opts.compact
      ? `<ul class="lhai-intake-diag-kv lhai-bid-notify-debug__kv u-mt-2">
          ${v.trace_id ? kv("Trace ID", v.trace_id) : ""}
          ${kv("Bidding enabled", biddingNotifyDebugYesNo(v.bidding_enabled))}
          ${kv("Bid request ID", v.bid_request_id)}
          ${kv("Bid request status", v.bid_request_status)}
          ${kv("Eligible partners", v.eligible_partners)}
          ${kv("Draft bids created", v.draft_bids_created)}
          ${kv("SMTP host present", biddingNotifyDebugYesNo(v.smtp_host_present))}
          ${kv("SMTP port", v.smtp_port)}
          ${kv("Sent at", v.sent_at != null ? String(v.sent_at) : "—")}
        </ul>`
      : "";

  return `<section class="lhai-bid-notify-debug" aria-label="Bidding notification debug">
    <h4 class="lhai-bid-notify-debug__title">Bidding notification debug</h4>
    <p class="lhai-help lhai-bid-notify-debug__api-note">Loaded via authenticated admin API (<code>GET /api/admin/bid-requests/{id}/notification-debug</code>).</p>
    ${authBlock}
    ${loadErr}
    ${badgesHtml}
    ${hintsBlock}
    ${_renderAiBidRequestBriefDebugSection(v, kv)}
    ${_renderWorkflowConfigSection(v, kv)}
    ${_renderStartedEmailSection(v, kv)}
    ${extraKv}
    <p class="lhai-intake-diag-line u-mt-2"><span class="lhai-intake-diag-k">Errors</span></p>
    ${errorsHtml}
    <p class="lhai-intake-diag-line u-mt-2"><span class="lhai-intake-diag-k">Partner email resolutions</span></p>
    ${resHtml}
    ${rawJson}
  </section>`;
}

/**
 * Fetch + render into a container (admin only — use serviceCatalogAdminApi callbacks).
 * @param {HTMLElement} container
 * @param {{ threadId?: string, bidRequestId?: string, fetchThreadDebug: (id: string) => Promise<unknown>, fetchBidDebug?: (id: string) => Promise<unknown> }} opts
 */
export async function loadBiddingNotificationDebugInto(container, opts) {
  const threadId = String(opts.threadId || "").trim();
  const bidRequestId = String(opts.bidRequestId || "").trim();
  if (!threadId && !bidRequestId) {
    container.innerHTML = `<p class="u-text-muted">thread_id or bid_request_id is required.</p>`;
    return;
  }
  container.innerHTML = `<p class="lhai-help">Loading…</p>`;
  try {
    /** @type {Record<string, unknown>} */
    let merged = {};
    if (threadId && typeof opts.fetchThreadDebug === "function") {
      const threadPayload = await opts.fetchThreadDebug(threadId);
      if (threadPayload && typeof threadPayload === "object") {
        merged = { .../** @type {Record<string, unknown>} */ (threadPayload) };
      }
    }
    const effectiveBid = bidRequestId || resolveBidRequestIdFromMergedPayload(merged);
    if (effectiveBid && typeof opts.fetchBidDebug === "function") {
      const bidPayload = await opts.fetchBidDebug(effectiveBid);
      if (bidPayload && typeof bidPayload === "object") {
        const bp = /** @type {Record<string, unknown>} */ (bidPayload);
        merged = {
          ...merged,
          ...bp,
          last_bidding_dispatch_debug:
            bp.last_bidding_dispatch_debug || merged.last_bidding_dispatch_debug,
          bidding_notification_audit:
            bp.bidding_notification_audit || merged.bidding_notification_audit,
          bid_request_id: effectiveBid,
          root_cause_hint: bp.root_cause_hint ?? merged.root_cause_hint,
          recommended_next_action: bp.recommended_next_action ?? merged.recommended_next_action,
        };
      }
    } else if (effectiveBid) {
      merged.bid_request_id = effectiveBid;
    }
    const vm = normalizeBiddingNotificationDebugViewModel(merged);
    container.innerHTML = buildBiddingNotificationDebugHtml(vm);
  } catch (e) {
    const st = biddingNotificationHttpStatus(e);
    const authRequired = st === 401 || st === 403;
    const msg = formatBiddingNotificationLoadError(e);
    container.innerHTML = buildBiddingNotificationDebugHtml(
      normalizeBiddingNotificationDebugViewModel({
        load_error: authRequired ? "" : msg,
        auth_required: authRequired,
      })
    );
  }
}
