import { test } from "node:test";
import assert from "node:assert/strict";

const {
  ADMIN_BID_NOTIFY_AUTH_MESSAGE,
  buildBiddingNotificationDebugHtml,
  formatBiddingNotificationLoadError,
  normalizeBiddingNotificationDebugViewModel,
  partnerEmailResolutionStatus,
  resolveBidRequestIdFromMergedPayload,
} = await import("../src/assets/js/pages/admin-bidding-notification-debug-ui.js");

test("normalize shows workflow config validation when not normalized", () => {
  const html = buildBiddingNotificationDebugHtml(
    normalizeBiddingNotificationDebugViewModel({
      resolved_bidding: {
        mode: "GENERAL",
        raw_workflow_config: {
          workflow_type: "MULTI_PARTNER_QUOTE_AND_SELECT",
          multi_partner_partner_type: "AUTO_DEALER",
          bidding_enabled: true,
          bidding_mode: null,
        },
        config_validation: {
          config_normalized: false,
          missing_bidding_mode: true,
          expected_bidding_mode: "CAR_PURCHASE",
          actual_bidding_mode: null,
          root_cause_hint: "workflow_config_not_normalized",
        },
        resolved: {
          resolved_bidding_mode: "GENERAL",
          mode_supported: false,
          resolved_bidding_source: "service.workflow_config_json.bidding.mode",
        },
      },
    })
  );
  assert.ok(html.includes("Config validation"));
  assert.ok(html.includes("config_normalized"));
  assert.ok(html.includes("AUTO_DEALER"));
  assert.ok(html.includes("missing_bidding_mode"));
});

test("normalize shows config_normalized true for CAR_PURCHASE", () => {
  const vm = normalizeBiddingNotificationDebugViewModel({
    resolved_bidding: {
      mode: "CAR_PURCHASE",
      raw_workflow_config: {
        workflow_type: "MULTI_PARTNER_QUOTE_AND_SELECT",
        multi_partner_partner_type: "AUTO_DEALER",
        bidding_mode: "CAR_PURCHASE",
      },
      config_validation: {
        config_normalized: true,
        missing_bidding_mode: false,
        expected_bidding_mode: "CAR_PURCHASE",
        actual_bidding_mode: "CAR_PURCHASE",
        mode_supported: true,
      },
      resolved: { resolved_bidding_mode: "CAR_PURCHASE", mode_supported: true },
    },
    last_bidding_dispatch_debug: {
      notification: { mode_supported: true, sent: 1, attempted: 1, smtp: { smtp_enabled: true } },
    },
  });
  assert.equal(vm.config_normalized, true);
  assert.equal(vm.resolved_bidding_mode, "CAR_PURCHASE");
  assert.equal(vm.mode_supported, true);
});

test("normalize renders AI bid briefing debug section", () => {
  const html = buildBiddingNotificationDebugHtml(
    normalizeBiddingNotificationDebugViewModel({
      ai_bid_request_brief_debug: {
        exists: true,
        provider: "ollama",
        model: "qwen3:14b",
        generated_at: "2026-05-19T12:00:00+00:00",
        fallback_used: false,
        input_answer_count: 8,
        used_answer_count: 4,
        output_language: "en",
      },
    })
  );
  assert.ok(html.includes("AI bid request briefing"));
  assert.ok(html.includes("qwen3:14b"));
  assert.ok(html.includes("fallback_used"));
});

test("normalize renders briefing fallback error_kind", () => {
  const html = buildBiddingNotificationDebugHtml(
    normalizeBiddingNotificationDebugViewModel({
      ai_bid_request_brief_debug: {
        exists: true,
        provider: "fallback",
        model: null,
        fallback_used: true,
        error_kind: "ollama_unavailable",
      },
    })
  );
  assert.ok(html.includes("ollama_unavailable"));
  assert.ok(html.includes("Fallback"));
});

test("normalize merges trace notification counts", () => {
  const vm = normalizeBiddingNotificationDebugViewModel({
    last_bidding_dispatch_debug: {
      trace_id: "t-1",
      resolved_bidding: { mode: "CAR_PURCHASE", enabled: true },
      bid_request: { bid_request_id: "br-1", status: "OPEN" },
      partner_matching: { eligible_partner_count: 3 },
      draft_bids: { created_count: 3 },
      notification: {
        started_email_function_called: true,
        mode_supported: true,
        attempted: 3,
        sent: 2,
        failed: 1,
        skipped_no_email: 0,
        dedupe_skipped: false,
        smtp: { smtp_enabled: true, smtp_host_present: true, smtp_port: 587 },
        errors: [{ partner_account_id: "p1", partner_email: "a***@x.com", reason: "SMTPError" }],
      },
    },
  });
  assert.equal(vm.trace_id, "t-1");
  assert.equal(vm.sent, 2);
  assert.equal(vm.smtp_enabled, true);
  assert.equal(vm.mode_supported, true);
  assert.ok(vm.root_cause_hint);
});

test("API root_cause_hint and recommended_next_action are shown", () => {
  const html = buildBiddingNotificationDebugHtml(
    normalizeBiddingNotificationDebugViewModel({
      root_cause_hint: "SMTP is disabled.",
      recommended_next_action: "Configure SMTP_HOST.",
      resolved_bidding_mode: "CAR_PURCHASE",
      notification: { sent: 0, attempted: 0, smtp: { smtp_enabled: false } },
    })
  );
  assert.ok(html.includes("Bidding notification debug"));
  assert.ok(html.includes("SMTP is disabled"));
  assert.ok(html.includes("Configure SMTP_HOST"));
});

test("auth error shows admin login message", () => {
  const html = buildBiddingNotificationDebugHtml(
    normalizeBiddingNotificationDebugViewModel({ auth_required: true })
  );
  assert.ok(html.includes(ADMIN_BID_NOTIFY_AUTH_MESSAGE));
  const err = new Error("인증이 필요합니다.");
  /** @type {{ status?: number }} */ (err).status = 401;
  assert.equal(formatBiddingNotificationLoadError(err), ADMIN_BID_NOTIFY_AUTH_MESSAGE);
});

test("badges show Email sent when sent > 0", () => {
  const html = buildBiddingNotificationDebugHtml(
    normalizeBiddingNotificationDebugViewModel({
      last_bidding_dispatch_debug: {
        notification: { sent: 2, attempted: 2, smtp: { smtp_enabled: true } },
      },
    })
  );
  assert.ok(html.includes("Email sent"));
});

test("resolveBidRequestIdFromMergedPayload uses latest_bid_request_id", () => {
  assert.equal(
    resolveBidRequestIdFromMergedPayload({ latest_bid_request_id: "br-latest" }),
    "br-latest"
  );
});

test("partner resolution status maps skip and error", () => {
  const vm = { attempted: 1, sent: 0, skipped_dedupe: false, errors: [{ partner_account_id: "p2", reason: "fail" }] };
  assert.equal(partnerEmailResolutionStatus({ partner_account_id: "p1", skip_reason: "no_email" }, vm), "no email");
  assert.equal(partnerEmailResolutionStatus({ partner_account_id: "p2" }, vm), "failed");
});
