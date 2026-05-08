import test from "node:test";
import assert from "node:assert/strict";

const {
  buildIntakeDispatchDiagnosticsHtml,
  intakeDispatchCheckRowClass,
  intakeDispatchDiagSummaryStatusClass,
} = await import("../src/assets/js/pages/messages-intake-diagnostics-ui.js");

test("requested_thread_id appears at top of diagnostics HTML", () => {
  const html = buildIntakeDispatchDiagnosticsHtml({
    request_context: { requested_thread_id: "tid-raw-1", normalized_thread_id: "uuid-2" },
    diagnosis_summary: { status: "FAILED", primary_error_code: "thread_not_found" },
    consistency_checks: [],
  });
  assert.ok(html.includes("tid-raw-1"));
  assert.ok(html.includes("request_context.requested_thread_id"));
  assert.ok(html.includes("uuid-2"));
  assert.ok(html.includes("전체 복사"));
  assert.ok(html.includes("lhaiIntakeDiagCopyTidBtn"));
});

test("no_active_partner_rules shows likely_cause and recommended_fix in HTML", () => {
  const html = buildIntakeDispatchDiagnosticsHtml({
    request_context: { requested_thread_id: "a" },
    diagnosis_summary: {
      status: "NO_PARTNER",
      primary_error_code: "no_active_partner_rules",
      likely_cause: "규칙 테이블에 active rule이 없습니다.",
      recommended_fix: "apply_partner_rules_for_config를 확인하세요.",
      failed_stage: "partner_rules",
      next_debug_action: "저장 로그 확인",
    },
    consistency_checks: [],
  });
  assert.ok(html.includes("no_active_partner_rules"));
  assert.ok(html.includes("규칙 테이블에 active rule이 없습니다."));
  assert.ok(html.includes("apply_partner_rules_for_config"));
});

test("consistency FAIL row uses fail class", () => {
  assert.ok(intakeDispatchCheckRowClass("FAIL").includes("fail"));
  assert.ok(intakeDispatchCheckRowClass("PASS").includes("pass"));
  assert.ok(intakeDispatchDiagSummaryStatusClass("NO_PARTNER").includes("nopartner"));
});

test("database_snapshot shows Alembic and DB name when available", () => {
  const html = buildIntakeDispatchDiagnosticsHtml({
    request_context: {
      requested_thread_id: "x",
      database_snapshot: {
        available: true,
        current_database: "appdb",
        current_schema: "public",
        postgresql_server_version: "PostgreSQL 16.1",
        alembic_version_nums: ["abc123", "def456"],
        read_errors: [],
      },
    },
    diagnosis_summary: { status: "OK" },
    consistency_checks: [],
  });
  assert.ok(html.includes("연결 DB"));
  assert.ok(html.includes("appdb"));
  assert.ok(html.includes("Alembic revision"));
  assert.ok(html.includes("abc123"));
  assert.ok(html.includes("def456"));
});

test("database_snapshot skipped path shows reason", () => {
  const html = buildIntakeDispatchDiagnosticsHtml({
    request_context: {
      requested_thread_id: "bad",
      database_snapshot: {
        available: false,
        reason: "invalid_thread_id_no_db_session",
        note: "DB에 연결하지 않았습니다.",
      },
    },
    diagnosis_summary: { status: "FAILED", primary_error_code: "invalid_thread_id" },
    consistency_checks: [],
  });
  assert.ok(html.includes("DB 스냅샷"));
  assert.ok(html.includes("invalid_thread_id_no_db_session"));
});

test("consistency FAIL is red in rendered table row", () => {
  const html = buildIntakeDispatchDiagnosticsHtml({
    request_context: {},
    diagnosis_summary: { status: "FAILED" },
    consistency_checks: [
      {
        check_name: "active_partner_rule_exists",
        status: "FAIL",
        message: "no rules",
        expected: ">=1",
        actual: "0",
        recommended_fix: "save workflow",
      },
    ],
  });
  assert.ok(html.includes("lhai-intake-diag-check--fail"));
});
