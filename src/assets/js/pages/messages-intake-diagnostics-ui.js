/**
 * 운영자 메시지함: 인테이크 파트너 배정 진단 패널용 순수 렌더·스타일 헬퍼(테스트에서 import).
 * @module messages-intake-diagnostics-ui
 */

/** @param {unknown} s */
export function intakeDiagEscapeHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** @param {unknown} status */
export function intakeDispatchDiagSummaryStatusClass(status) {
  const u = String(status || "").toUpperCase();
  if (u === "OK") return "lhai-intake-diag-status lhai-intake-diag-status--ok";
  if (u === "NO_PARTNER") return "lhai-intake-diag-status lhai-intake-diag-status--nopartner";
  if (u === "FAILED") return "lhai-intake-diag-status lhai-intake-diag-status--failed";
  if (u === "PARTIAL") return "lhai-intake-diag-status lhai-intake-diag-status--partial";
  return "lhai-intake-diag-status";
}

/** @param {unknown} st */
export function intakeDispatchCheckRowClass(st) {
  const u = String(st || "").toUpperCase();
  if (u === "PASS") return "lhai-intake-diag-check lhai-intake-diag-check--pass";
  if (u === "WARN") return "lhai-intake-diag-check lhai-intake-diag-check--warn";
  if (u === "FAIL") return "lhai-intake-diag-check lhai-intake-diag-check--fail";
  return "lhai-intake-diag-check";
}

/**
 * @param {string} title
 * @param {string} innerHtml
 */
function _detailsBlock(title, innerHtml) {
  const t = intakeDiagEscapeHtml(title);
  return `<details class="lhai-intake-diag-acc"><summary class="lhai-intake-diag-acc__summary">${t}</summary><div class="lhai-intake-diag-acc__body">${innerHtml}</div></details>`;
}

/** @param {Record<string, unknown>} data */
export function buildIntakeDispatchDiagnosticsHtml(data) {
  const rc = data && typeof data === "object" && data.request_context && typeof data.request_context === "object"
    ? /** @type {Record<string, unknown>} */ (data.request_context)
    : {};
  const ds =
    data && typeof data === "object" && data.diagnosis_summary && typeof data.diagnosis_summary === "object"
      ? /** @type {Record<string, unknown>} */ (data.diagnosis_summary)
      : {};
  const reqTid = rc.requested_thread_id != null ? String(rc.requested_thread_id) : "";
  const normTid = rc.normalized_thread_id != null ? String(rc.normalized_thread_id) : "";
  const dbSnap =
    rc.database_snapshot != null && typeof rc.database_snapshot === "object"
      ? /** @type {Record<string, unknown>} */ (rc.database_snapshot)
      : null;
  /** DB 스냅샷(배포·마이그레이션 전후 비교용): Alembic revision, 연결 DB명, PG 버전. */
  let dbSnapHtml = "";
  if (dbSnap) {
    const avail = dbSnap.available === true;
    if (!avail) {
      const reason = dbSnap.reason != null ? String(dbSnap.reason) : "";
      const note = dbSnap.note != null ? String(dbSnap.note) : "";
      dbSnapHtml = `<p class="lhai-intake-diag-line u-text-muted"><span class="lhai-intake-diag-k">DB 스냅샷</span> 연결 없음 · reason <code>${intakeDiagEscapeHtml(reason)}</code><br/><span class="lhai-intake-diag-k">안내</span> ${intakeDiagEscapeHtml(note)}</p>`;
    } else {
      const adb = dbSnap.current_database != null ? String(dbSnap.current_database) : "—";
      const sch = dbSnap.current_schema != null ? String(dbSnap.current_schema) : "—";
      const pgv = dbSnap.postgresql_server_version != null ? String(dbSnap.postgresql_server_version) : "—";
      const al = Array.isArray(dbSnap.alembic_version_nums)
        ? dbSnap.alembic_version_nums.map((x) => String(x)).join(", ")
        : "";
      const errs =
        Array.isArray(dbSnap.read_errors) && dbSnap.read_errors.length
          ? `<span class="u-text-muted"> · read_errors: ${intakeDiagEscapeHtml(dbSnap.read_errors.join("; "))}</span>`
          : "";
      dbSnapHtml = `<p class="lhai-intake-diag-line"><span class="lhai-intake-diag-k">연결 DB</span> <code>${intakeDiagEscapeHtml(adb)}</code> · <span class="lhai-intake-diag-k">schema</span> <code>${intakeDiagEscapeHtml(sch)}</code></p>
      <p class="lhai-intake-diag-line u-text-muted"><span class="lhai-intake-diag-k">PostgreSQL</span> ${intakeDiagEscapeHtml(pgv)}</p>
      <p class="lhai-intake-diag-line"><span class="lhai-intake-diag-k">Alembic revision(s)</span> <code>${intakeDiagEscapeHtml(al || "(없음 또는 alembic_version 미조회)")}</code>${errs}</p>`;
    }
  }
  const status = String(ds.status || "");
  const pec = ds.primary_error_code != null ? String(ds.primary_error_code) : "";
  const stClass = intakeDispatchDiagSummaryStatusClass(status);
  const checks =
    data && typeof data === "object" && Array.isArray(data.consistency_checks)
      ? /** @type {Array<Record<string, unknown>>} */ (data.consistency_checks)
      : [];
  const checksRows = checks
    .map((c) => {
      const name = intakeDiagEscapeHtml(c.check_name);
      const st = intakeDiagEscapeHtml(c.status);
      const rowCls = intakeDispatchCheckRowClass(c.status);
      const msg = intakeDiagEscapeHtml(c.message);
      const fix = intakeDiagEscapeHtml(c.recommended_fix);
      return `<tr class="${rowCls}"><td>${name}</td><td>${st}</td><td>${msg}</td><td>${fix}</td></tr>`;
    })
    .join("");

  const top = `
    <div class="lhai-intake-diag-top">
      <p class="lhai-intake-diag-line"><span class="lhai-intake-diag-k">request_context.requested_thread_id</span>
        <code class="lhai-intake-diag-code" id="lhaiIntakeDiagRequestedTid">${intakeDiagEscapeHtml(reqTid)}</code>
        <button type="button" class="lhai-button lhai-button--secondary lhai-button--sm" id="lhaiIntakeDiagCopyTidBtn" title="API 진단 응답 전체(JSON) 복사">전체 복사</button>
      </p>
      ${normTid ? `<p class="lhai-intake-diag-line u-text-muted"><span class="lhai-intake-diag-k">normalized_thread_id</span> <code>${intakeDiagEscapeHtml(normTid)}</code></p>` : ""}
      ${dbSnapHtml}
      <p class="lhai-intake-diag-line"><span class="${stClass}">Status: ${intakeDiagEscapeHtml(status)}</span>
        <span class="lhai-intake-diag-k u-ml-2">primary_error_code</span>
        <code>${pec ? intakeDiagEscapeHtml(pec) : "null"}</code></p>
      <p class="lhai-intake-diag-line"><span class="lhai-intake-diag-k">failed_stage</span> ${intakeDiagEscapeHtml(ds.failed_stage != null ? ds.failed_stage : "")}</p>
      <p class="lhai-intake-diag-line"><span class="lhai-intake-diag-k">next_debug_action</span> ${intakeDiagEscapeHtml(ds.next_debug_action != null ? ds.next_debug_action : "")}</p>
      <p class="lhai-intake-diag-block"><span class="lhai-intake-diag-k">likely_cause</span><br/>${intakeDiagEscapeHtml(ds.likely_cause != null ? ds.likely_cause : "")}</p>
      <p class="lhai-intake-diag-block"><span class="lhai-intake-diag-k">recommended_fix</span><br/>${intakeDiagEscapeHtml(ds.recommended_fix != null ? ds.recommended_fix : "")}</p>
    </div>`;

  const jsonPre = (obj) =>
    `<pre class="lhai-intake-diag-pre" tabindex="0">${intakeDiagEscapeHtml(JSON.stringify(obj ?? {}, null, 2))}</pre>`;

  const sections = [
    _detailsBlock("Request Context", jsonPre(rc)),
    _detailsBlock("Diagnosis Summary", jsonPre(ds)),
    _detailsBlock("Thread", jsonPre(data?.thread)),
    _detailsBlock("Intake Session(s)", jsonPre(data?.intake_sessions_section)),
    _detailsBlock("Workflow Instance", jsonPre(data?.workflow_instance)),
    _detailsBlock("Service Item", jsonPre(data?.service_item)),
    _detailsBlock("Workflow Config DB", jsonPre(data?.workflow_config_db)),
    _detailsBlock("Partner Rules", jsonPre(data?.partner_rules)),
    _detailsBlock("Service Partner", jsonPre(data?.service_partner)),
    _detailsBlock("Partner Account", jsonPre(data?.partner_account)),
    _detailsBlock("Partner Resolve Preview", jsonPre(data?.partner_resolve_preview)),
    _detailsBlock("Message Thread Participants", jsonPre(data?.message_thread_participants)),
    _detailsBlock("Email Bridge", jsonPre(data?.email_bridge)),
    _detailsBlock("Email Dispatch", jsonPre(data?.email_dispatch)),
    _detailsBlock("Dispatch Logs", jsonPre(data?.dispatch_logs_detail)),
    _detailsBlock("Thread Messages", jsonPre(data?.thread_messages)),
    _detailsBlock(
      "Consistency Checks",
      checks.length
        ? `<table class="lhai-table lhai-intake-diag-checks"><thead><tr><th>check</th><th>status</th><th>message</th><th>recommended_fix</th></tr></thead><tbody>${checksRows}</tbody></table>`
        : "<p class=\"u-text-muted\">(없음)</p>",
    ),
    _detailsBlock("Raw Debug", jsonPre(data?.raw_debug)),
  ];

  return `${top}${sections.join("")}`;
}
