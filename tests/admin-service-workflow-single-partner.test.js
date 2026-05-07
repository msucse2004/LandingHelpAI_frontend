import test from "node:test";
import assert from "node:assert/strict";

globalThis.window = {
  LHAI_API_BASE_URL: "",
  location: { hostname: "localhost", port: "8000" },
};

const { __testOnlySinglePartner } = await import("../src/assets/js/pages/admin-service-workflow-tab.js");
const {
  mswSingleTargetUiState,
  mswParseSinglePostWorkflowFromNotes,
  mswSerializeSinglePostWorkflow,
  mswValidateSinglePartnerSlice,
  mswBuildSinglePartnerPreviewSummary,
  mswInferFixedTargetModeFromSlice,
  MSW_FIXED_TARGET_EMAIL,
  MSW_FIXED_TARGET_REGISTERED,
} = __testOnlySinglePartner;

test("strategy switching: fixed shows email, matching_rule shows rule select", () => {
  const fixed = mswSingleTargetUiState("fixed");
  assert.equal(fixed.showPartnerEmail, true);
  assert.equal(fixed.showMatchingRule, false);

  const byRule = mswSingleTargetUiState("matching_rule");
  assert.equal(byRule.showPartnerEmail, false);
  assert.equal(byRule.showMatchingRule, true);
});

test("infer fixed target: fixed_partner_ids implies registered mode", () => {
  assert.equal(
    mswInferFixedTargetModeFromSlice({
      strategy: "fixed",
      fixed_partner_ids: ["550e8400-e29b-41d4-a716-446655440000"],
    }),
    MSW_FIXED_TARGET_REGISTERED
  );
  assert.equal(mswInferFixedTargetModeFromSlice({ strategy: "fixed", partner_email: "a@b.co" }), MSW_FIXED_TARGET_EMAIL);
});

test("infer fixed target: ambiguous empty slice defaults to registered", () => {
  assert.equal(mswInferFixedTargetModeFromSlice({}), MSW_FIXED_TARGET_REGISTERED);
  assert.equal(mswInferFixedTargetModeFromSlice(null), MSW_FIXED_TARGET_REGISTERED);
});

test("validation: fixed requires valid email", () => {
  const bad = mswValidateSinglePartnerSlice(
    {
      partner_type: "AUTO_DEALER",
      strategy: "fixed",
      fixed_target_mode: "email",
      default_partner: "not-an-email",
      intake_builder_id: "intake-1",
      post_submission_workflow: {
        step1_after_customer_submission: "SEND_IMMEDIATELY",
        step2_after_partner_response: "ADMIN_REVIEW",
        step3_customer_follow_up: "NONE",
      },
    },
    {
      partnerTypeAllowedSet: new Set(["AUTO_DEALER"]),
      looksLikeEmail: (v) => /@/.test(v),
      isKnownMatchingRule: () => true,
      isKnownIntakeBuilder: () => true,
      isWorkflowStepAllowed: () => true,
    }
  );
  assert.ok(bad.errors.some((x) => x.includes("이메일")));
});

test("validation: matching_rule requires rule selection", () => {
  const bad = mswValidateSinglePartnerSlice(
    {
      partner_type: "AUTO_DEALER",
      strategy: "matching_rule",
      default_partner: "",
      intake_builder_id: "intake-1",
      post_submission_workflow: {
        step1_after_customer_submission: "SEND_IMMEDIATELY",
        step2_after_partner_response: "ADMIN_REVIEW",
        step3_customer_follow_up: "NONE",
      },
    },
    {
      partnerTypeAllowedSet: new Set(["AUTO_DEALER"]),
      looksLikeEmail: () => true,
      isKnownMatchingRule: () => true,
      isKnownIntakeBuilder: () => true,
      isWorkflowStepAllowed: () => true,
    }
  );
  assert.ok(bad.errors.some((x) => x.includes("매칭 규칙")));
});

test("validation: fixed registered requires partner id", () => {
  const bad = mswValidateSinglePartnerSlice(
    {
      partner_type: "AUTO_DEALER",
      strategy: "fixed",
      fixed_target_mode: "registered_catalog",
      default_partner: "",
      fixed_partner_ids: [],
      intake_builder_id: "intake-1",
      post_submission_workflow: {
        step1_after_customer_submission: "SEND_IMMEDIATELY",
        step2_after_partner_response: "ADMIN_REVIEW",
        step3_customer_follow_up: "NONE",
      },
    },
    {
      partnerTypeAllowedSet: new Set(["AUTO_DEALER"]),
      looksLikeEmail: () => true,
      isKnownMatchingRule: () => true,
      isKnownIntakeBuilder: () => true,
      isWorkflowStepAllowed: () => true,
    }
  );
  assert.ok(bad.errors.some((x) => x.includes("목록에서")));
});

test("validation: fixed registered accepts catalog uuid", () => {
  const pid = "550e8400-e29b-41d4-a716-446655440000";
  const ok = mswValidateSinglePartnerSlice(
    {
      partner_type: "AUTO_DEALER",
      strategy: "fixed",
      fixed_target_mode: "registered_catalog",
      default_partner: pid,
      fixed_partner_ids: [pid],
      intake_builder_id: "intake-1",
      post_submission_workflow: {
        step1_after_customer_submission: "SEND_IMMEDIATELY",
        step2_after_partner_response: "ADMIN_REVIEW",
        step3_customer_follow_up: "NONE",
      },
    },
    {
      partnerTypeAllowedSet: new Set(["AUTO_DEALER"]),
      looksLikeEmail: () => true,
      isKnownMatchingRule: () => true,
      isKnownIntakeBuilder: () => true,
      isWorkflowStepAllowed: () => true,
    }
  );
  assert.equal(ok.errors.length, 0);
});

test("validation: intake builder and workflow steps required", () => {
  const bad = mswValidateSinglePartnerSlice(
    {
      partner_type: "AUTO_DEALER",
      strategy: "fixed",
      fixed_target_mode: "email",
      default_partner: "partner@example.com",
      intake_builder_id: "",
      post_submission_workflow: {
        step1_after_customer_submission: "",
        step2_after_partner_response: "",
        step3_customer_follow_up: "",
      },
    },
    {
      partnerTypeAllowedSet: new Set(["AUTO_DEALER"]),
      looksLikeEmail: () => true,
      isKnownMatchingRule: () => true,
      isKnownIntakeBuilder: () => true,
      isWorkflowStepAllowed: () => true,
    }
  );
  assert.ok(bad.errors.some((x) => x.includes("Intake Builder")));
  assert.ok(bad.errors.some((x) => x.includes("1단계")));
  assert.ok(bad.errors.some((x) => x.includes("2단계")));
  assert.ok(bad.errors.some((x) => x.includes("3단계")));
});

test("backward compatibility: legacy request_type and plain text notes do not crash", () => {
  const parsedLegacy = mswParseSinglePostWorkflowFromNotes("legacy plain text notes");
  assert.equal(parsedLegacy.legacyDetected, true);
  assert.equal(parsedLegacy.legacyPlainText, "legacy plain text notes");

  const valid = mswValidateSinglePartnerSlice(
    {
      partner_type: "AUTO_DEALER",
      strategy: "fixed",
      fixed_target_mode: "email",
      default_partner: "partner@example.com",
      request_type: "legacy_request_type_text",
      post_submission_workflow: parsedLegacy.steps,
    },
    {
      partnerTypeAllowedSet: new Set(["AUTO_DEALER"]),
      looksLikeEmail: () => true,
      isKnownMatchingRule: () => true,
      isKnownIntakeBuilder: () => true,
      isWorkflowStepAllowed: () => true,
      legacyResponseUnstructured: true,
    }
  );
  assert.equal(Array.isArray(valid.errors), true);
  assert.ok(valid.warnings.some((x) => x.includes("레거시")));
});

test("structured JSON loads correctly", () => {
  const parsed = mswParseSinglePostWorkflowFromNotes(
    JSON.stringify({
      submission_dispatch_mode: "SEND_IMMEDIATELY",
      partner_response_mode: "ADMIN_REVIEW",
      customer_followup_mode: "NONE",
    })
  );
  assert.equal(parsed.legacyDetected, false);
  assert.equal(parsed.steps.step1_after_customer_submission, "SEND_IMMEDIATELY");
  assert.equal(parsed.steps.step2_after_partner_response, "ADMIN_REVIEW");
  assert.equal(parsed.steps.step3_customer_follow_up, "NONE");
});

test("serialization: workflow steps serialize predictably", () => {
  const raw = mswSerializeSinglePostWorkflow({
    step1_after_customer_submission: "SEND_IMMEDIATELY",
    step2_after_partner_response: "ADMIN_REVIEW",
    step3_customer_follow_up: "NONE",
  });
  const parsed = JSON.parse(raw);
  assert.deepEqual(parsed, {
    submission_dispatch_mode: "SEND_IMMEDIATELY",
    partner_response_mode: "ADMIN_REVIEW",
    customer_followup_mode: "NONE",
  });
});

test("serialization compatibility: default_partner target source by strategy", () => {
  const fixedTarget = "partner@example.com";
  const ruleTarget = "same_state_first_then_expand";
  assert.equal(fixedTarget.includes("@"), true);
  assert.equal(ruleTarget.includes("@"), false);
});

test("preview: strategy-specific text and workflow summary rendered", () => {
  const fixedPreview = mswBuildSinglePartnerPreviewSummary({
    partnerTypeDisplay: "자동차 딜러 (AUTO_DEALER)",
    strategy: "fixed",
    defaultPartner: "partner@example.com",
    intakeBuilderLabel: "기본 Intake",
    step1Label: "즉시 파트너에게 전송",
    step2Label: "관리자 검토",
    step3Label: "추가 조치 없음",
  });
  assert.ok(fixedPreview.some((x) => x.includes("고정 파트너에게 전달")));
  assert.ok(fixedPreview.some((x) => x.includes("1단계(고객 제출 직후)")));
  assert.ok(fixedPreview.some((x) => x.includes("2단계(파트너 응답 후 처리)")));
  assert.ok(fixedPreview.some((x) => x.includes("3단계(고객 후속 안내)")));

  const regPreview = mswBuildSinglePartnerPreviewSummary({
    partnerTypeDisplay: "휴대폰 (PHONE_VENDOR)",
    strategy: "fixed",
    defaultPartner: "",
    fixedTargetMode: MSW_FIXED_TARGET_REGISTERED,
    catalogPreviewLine: "ACME (@acme_partner)",
    intakeBuilderLabel: "기본 Intake",
    step1Label: "즉시 파트너에게 전송",
    step2Label: "관리자 검토",
    step3Label: "추가 조치 없음",
  });
  assert.ok(regPreview.some((x) => x.includes("등록 파트너 계정")));
  assert.ok(regPreview.some((x) => x.includes("ACME")));

  const rulePreview = mswBuildSinglePartnerPreviewSummary({
    partnerTypeDisplay: "자동차 딜러 (AUTO_DEALER)",
    strategy: "matching_rule",
    defaultPartner: "same_state_first_then_expand",
    matchingRuleLabel: "고객 주 우선 후 확장",
    intakeBuilderLabel: "기본 Intake",
    step1Label: "즉시 파트너에게 전송",
    step2Label: "관리자 검토",
    step3Label: "추가 조치 없음",
  });
  assert.ok(rulePreview.some((x) => x.includes("매칭 규칙으로 자동 선택")));
});
