import { adminApi, emailLogsApi, serviceCatalogAdminApi } from "../core/api.js";
import { loadBiddingNotificationDebugInto } from "./admin-bidding-notification-debug-ui.js";
import { ensureAdminAccess, protectCurrentPage } from "../core/guards.js";
import { formatDate, formatMessageTimestamp, safeText } from "../core/utils.js";
import { loadSidebar } from "../components/sidebar.js";

/**
 * Admin customer 360 — Step 9: operator view shows API/DB values as-is (names, statuses, survey answers).
 * Form labels are fixed English chrome; field values are never passed through `t()`.
 */

/** @typedef {Record<string, unknown>} JsonObj */

const DEFAULT_LIMIT = 50;

/** @type {Record<string, unknown> | null} */
let current360Data = null;
/** @type {string} */
let currentCustomerProfileId = "";

function qs(sel) {
  return document.querySelector(sel);
}

function resolveCustomerProfileIdFromUrl() {
  const p = new URLSearchParams(window.location.search);
  return (
    (p.get("customer_profile_id") || p.get("customer") || p.get("id") || "").trim()
  );
}

function escapeHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function renderEmpty(message = "No data yet") {
  return `<p class="ac360-empty">${escapeHtml(message)}</p>`;
}

/**
 * @param {Array<{ key: string, value: unknown }>} rows
 */
function renderKv(rows) {
  const items = (rows || []).filter((r) => r.value !== undefined && r.value !== null && r.value !== "");
  if (!items.length) return renderEmpty();
  return `<dl class="ac360-kv">${items
    .map(
      (r) =>
        `<dt>${escapeHtml(r.key)}</dt><dd>${escapeHtml(displayScalar(r.value))}</dd>`
    )
    .join("")}</dl>`;
}

function displayScalar(v) {
  if (v === null || v === undefined || v === "") return "—";
  if (typeof v === "boolean") return v ? "Yes" : "No";
  if (typeof v === "object") return formatJsonValue(v);
  return String(v);
}

function formatJsonValue(v) {
  if (v === null || v === undefined) return "—";
  if (typeof v !== "object") return String(v);
  try {
    return JSON.stringify(v, null, 2);
  } catch {
    return String(v);
  }
}

function renderJsonBlock(obj, label = "") {
  if (!obj || (typeof obj === "object" && !Object.keys(obj).length)) {
    return label ? `<p class="ac360-empty">${escapeHtml(label)}: No data yet</p>` : renderEmpty();
  }
  const head = label ? `<p class="u-text-muted u-mb-1"><strong>${escapeHtml(label)}</strong></p>` : "";
  return `${head}<pre class="ac360-pre">${escapeHtml(formatJsonValue(obj))}</pre>`;
}

function extractAnswerValue(payload) {
  if (payload === null || payload === undefined) return "—";
  if (typeof payload !== "object") return String(payload);
  if (payload.value !== undefined && payload.value !== null && payload.value !== "") {
    if (Array.isArray(payload.value)) return payload.value.map(String).join(", ");
    return String(payload.value);
  }
  if (Array.isArray(payload.values)) {
    return payload.values.map((x) => String(x)).filter(Boolean).join(", ") || "—";
  }
  for (const k of ["text", "answer", "selected"]) {
    if (payload[k] !== undefined && payload[k] !== null && String(payload[k]).trim() !== "") {
      return String(payload[k]);
    }
  }
  return formatJsonValue(payload);
}

function surveyAnswerLabel(ans) {
  const meta = ans.json_metadata && typeof ans.json_metadata === "object" ? ans.json_metadata : {};
  return (
    meta.prompt_snapshot ||
    meta.label ||
    meta.field_key ||
    meta.item_type_snapshot ||
    ans.questionnaire_item_id ||
    "question"
  );
}

function intakeAnswerLabel(ans) {
  const meta = ans.metadata_json && typeof ans.metadata_json === "object" ? ans.metadata_json : {};
  return meta.label || meta.field_label || ans.field_key || ans.field_id || "field";
}

function accountStatusSummary(accountLinks = []) {
  if (!accountLinks.length) return "—";
  return accountLinks
    .map((link) => {
      const acc = link.account;
      if (!acc) return `${link.link_role || "link"} (no account row)`;
      const active = acc.is_active ? "active" : "inactive";
      return `${acc.email || acc.id} · ${active} · ${acc.membership_status || "—"} (${link.link_role || "—"})`;
    })
    .join("; ");
}

function setGlobalError(message, { success = false } = {}) {
  const el = qs("#ac360GlobalError");
  if (!el) return;
  if (!message) {
    el.hidden = true;
    el.textContent = "";
    el.classList.remove("ac360-banner--success");
    return;
  }
  el.hidden = false;
  el.textContent = message;
  el.classList.toggle("ac360-banner--success", success);
  el.classList.toggle("ac360-banner--error", !success);
}

function withEditToolbar(html, editKey) {
  return `<div class="ac360-section__toolbar">
    <button type="button" class="lhai-button lhai-button--secondary ac360-edit-btn" data-ac360-edit="${escapeHtml(editKey)}">편집</button>
  </div>${html}`;
}

function formInput(label, name, value, type = "text") {
  const v = value === null || value === undefined ? "" : String(value);
  return `<label class="ac360-field">
    <span class="ac360-field__label">${escapeHtml(label)}</span>
    <input class="lhai-input" name="${escapeHtml(name)}" type="${escapeHtml(type)}" value="${escapeHtml(v)}" />
  </label>`;
}

function formTextarea(label, name, value, rows = 4) {
  const v = value === null || value === undefined ? "" : String(value);
  return `<label class="ac360-field">
    <span class="ac360-field__label">${escapeHtml(label)}</span>
    <textarea class="lhai-input" name="${escapeHtml(name)}" rows="${rows}">${escapeHtml(v)}</textarea>
  </label>`;
}

function formSelect(label, name, value, options) {
  const v = value === null || value === undefined ? "" : String(value);
  return `<label class="ac360-field">
    <span class="ac360-field__label">${escapeHtml(label)}</span>
    <select class="lhai-input" name="${escapeHtml(name)}">
      ${options
        .map(
          (opt) =>
            `<option value="${escapeHtml(opt.value)}"${opt.value === v ? " selected" : ""}>${escapeHtml(opt.label)}</option>`
        )
        .join("")}
    </select>
  </label>`;
}

const EDIT_SPECS = {
  basic: {
    title: "기본 정보 편집",
    fields(p) {
      return [
        formInput("Full name", "full_name", p.full_name),
        formInput("First name", "first_name", p.first_name),
        formInput("Last name", "last_name", p.last_name),
        formInput("Email", "email", p.email, "email"),
        formInput("Phone", "phone_number", p.phone_number),
        formInput("Preferred language", "preferred_language", p.preferred_language),
        formInput("Preferred contact", "preferred_contact_method", p.preferred_contact_method),
        formInput("Customer stage", "customer_stage", p.customer_stage),
        formInput("Onboarding status", "onboarding_status", p.onboarding_status),
      ].join("");
    },
    async save(patch) {
      return adminApi.patchCustomerProfile(currentCustomerProfileId, patch);
    },
  },
  contact: {
    title: "연락처 / 위치 편집",
    fields(p) {
      return [
        formInput("Address line 1", "address_line1", p.address_line1),
        formInput("Address line 2", "address_line2", p.address_line2),
        formInput("City", "city", p.city),
        formInput("State", "state", p.state),
        formInput("ZIP", "zip_code", p.zip_code),
        formInput("Country", "country", p.country),
        formInput("Target city", "target_city", p.target_city),
        formInput("Target state", "target_state", p.target_state),
        formInput("Moving from", "moving_from", p.moving_from),
        formInput("Moving to", "moving_to", p.moving_to),
        formInput("Moving date", "moving_date", p.moving_date ? String(p.moving_date).slice(0, 10) : "", "date"),
      ].join("");
    },
    async save(patch) {
      return adminApi.patchCustomerProfile(currentCustomerProfileId, patch);
    },
  },
  family: {
    title: "가족 / 가구 편집",
    fields(p) {
      const pets = p.has_pets === true ? "true" : p.has_pets === false ? "false" : "";
      return [
        formInput("Household size", "household_size", p.household_size, "number"),
        formInput("Children count", "children_count", p.children_count, "number"),
        formSelect("Has pets", "has_pets", pets, [
          { value: "", label: "—" },
          { value: "true", label: "Yes" },
          { value: "false", label: "No" },
        ]),
      ].join("");
    },
    async save(patch) {
      if (patch.has_pets === "true") patch.has_pets = true;
      else if (patch.has_pets === "false") patch.has_pets = false;
      else if (patch.has_pets === "") delete patch.has_pets;
      return adminApi.patchCustomerProfile(currentCustomerProfileId, patch);
    },
  },
  notes: {
    title: "관리자 메모 편집",
    fields(p) {
      return [
        formTextarea("Internal note", "internal_note", p.internal_note, 5),
        formTextarea("Admin summary", "admin_summary", p.admin_summary, 4),
      ].join("");
    },
    async save(patch) {
      return adminApi.patchCustomerProfile(currentCustomerProfileId, patch);
    },
  },
};

function serviceEditSpec(serviceType, row) {
  return {
    title: `서비스 프로필 편집 (${serviceType})`,
    fields() {
      return [
        formInput("Status", "status", row.status),
        formInput("Budget min", "budget_min", row.budget_min, "number"),
        formInput("Budget max", "budget_max", row.budget_max, "number"),
        formInput("Desired start", "desired_start_date", row.desired_start_date ? String(row.desired_start_date).slice(0, 10) : "", "date"),
        formInput("Target city", "target_city", row.target_city),
        formInput("Target state", "target_state", row.target_state),
        formTextarea("service_data (JSON)", "service_data", formatJsonValue(row.service_data || {}), 6),
        formTextarea("preference_data (JSON)", "preference_data", formatJsonValue(row.preference_data || {}), 4),
        formTextarea("requirement_data (JSON)", "requirement_data", formatJsonValue(row.requirement_data || {}), 4),
      ].join("");
    },
    async save(patch) {
      const out = { ...patch };
      for (const key of ["service_data", "preference_data", "requirement_data"]) {
        if (typeof out[key] === "string" && out[key].trim()) {
          try {
            out[key] = JSON.parse(out[key]);
          } catch {
            throw new Error(`${key} JSON 형식이 올바르지 않습니다.`);
          }
        } else if (typeof out[key] === "string" && !out[key].trim()) {
          out[key] = {};
        }
      }
      return adminApi.patchCustomerServiceProfile(currentCustomerProfileId, serviceType, out);
    },
  };
}

/** @type {{ key: string, spec: { title: string, fields: Function, save: Function } } | null} */
let activeEdit = null;

function openEditDialog(editKey) {
  const dialog = qs("#ac360EditDialog");
  const titleEl = qs("#ac360EditDialogTitle");
  const fieldsEl = qs("#ac360EditDialogFields");
  const errEl = qs("#ac360EditDialogError");
  if (!dialog || !fieldsEl || !current360Data) return;

  const profile = current360Data.profile || {};
  let spec = EDIT_SPECS[editKey] || null;

  if (editKey.startsWith("service:")) {
    const st = editKey.slice("service:".length);
    const row = (current360Data.service_profiles || {})[st] || {};
    spec = serviceEditSpec(st, row);
    activeEdit = { key: editKey, spec };
  } else {
    activeEdit = spec ? { key: editKey, spec } : null;
  }

  if (!activeEdit) return;

  if (titleEl) titleEl.textContent = activeEdit.spec.title;
  if (errEl) {
    errEl.hidden = true;
    errEl.textContent = "";
  }
  fieldsEl.innerHTML =
    editKey.startsWith("service:") ?
      activeEdit.spec.fields()
    : activeEdit.spec.fields(profile);

  if (typeof dialog.showModal === "function") dialog.showModal();
}

function buildPatchFromForm(form) {
  /** @type {Record<string, unknown>} */
  const patch = {};
  const fd = new FormData(form);
  for (const [name, raw] of fd.entries()) {
    const v = String(raw).trim();
    if (v === "") {
      patch[name] = null;
    } else if (name === "household_size" || name === "children_count") {
      patch[name] = Number(v);
    } else if (name === "budget_min" || name === "budget_max") {
      patch[name] = v;
    } else {
      patch[name] = v;
    }
  }
  return patch;
}

function wireEditDialog() {
  const dialog = qs("#ac360EditDialog");
  const form = qs("#ac360EditForm");
  const cancelBtn = qs("#ac360EditCancelBtn");
  if (!dialog || !form) return;

  document.addEventListener("click", (ev) => {
    const btn = ev.target.closest(".ac360-edit-btn");
    if (!btn) return;
    const key = btn.getAttribute("data-ac360-edit");
    if (key) openEditDialog(key);
  });

  if (cancelBtn) {
    cancelBtn.addEventListener("click", () => dialog.close());
  }

  form.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const errEl = qs("#ac360EditDialogError");
    if (!activeEdit) return;
    const saveBtn = qs("#ac360EditSaveBtn");
    if (saveBtn) saveBtn.disabled = true;
    if (errEl) {
      errEl.hidden = true;
      errEl.textContent = "";
    }
    try {
      const patch = buildPatchFromForm(form);
      const result = await activeEdit.spec.save(patch);
      dialog.close();
      const n = (result.updated_fields || []).length;
      setGlobalError(
        n ? `저장되었습니다. (${n}개 필드 · activity: ${result.activity_recorded ? "admin_update" : "none"})` : "변경된 값이 없습니다.",
        { success: true }
      );
      await fetchAndRenderCustomer360(currentCustomerProfileId);
    } catch (err) {
      if (errEl) {
        errEl.hidden = false;
        errEl.textContent = err?.message || String(err);
      }
    } finally {
      if (saveBtn) saveBtn.disabled = false;
    }
  });
}

function setLoading(loading) {
  const loadEl = qs("#ac360GlobalLoading");
  const root = qs("#ac360Root");
  if (loadEl) loadEl.hidden = !loading;
  if (root && loading) root.hidden = true;
}

function updatePageChrome(customerProfileId) {
  const title = qs("#ac360PageTitle");
  const sub = qs("#ac360PageSubtitle");
  const msgLink = qs("#ac360MessagesLink");
  const nameHint = customerProfileId.length > 48 ? `${customerProfileId.slice(0, 20)}…` : customerProfileId;
  if (title) title.textContent = `Customer 360`;
  if (sub) {
    sub.textContent = `프로필 ID: ${customerProfileId} — 읽기 전용 통합 뷰`;
  }
  document.title = `Customer 360 · ${nameHint}`;
  if (msgLink) {
    msgLink.href = `messages.html?customer_profile_id=${encodeURIComponent(customerProfileId)}`;
  }
}

function renderBasicInfo(data) {
  const p = data.profile || {};
  const links = data.account_links || [];
  const target = qs("#ac360Basic");
  if (!target) return;
  target.innerHTML = withEditToolbar(
    renderKv([
    { key: "Profile ID", value: data.customer_profile_id || p.id },
    { key: "Display name", value: p.display_name },
    { key: "Full name", value: p.full_name },
    { key: "Email", value: p.email },
    { key: "Phone", value: p.phone_number },
    { key: "Preferred language", value: p.preferred_language },
    { key: "Customer stage", value: p.customer_stage },
    { key: "Onboarding status", value: p.onboarding_status },
    { key: "Profile status", value: p.status },
    { key: "Account status", value: accountStatusSummary(links) },
    { key: "Created", value: formatDate(p.created_at) },
    { key: "Updated", value: formatDate(p.updated_at) },
  ]),
    "basic"
  );
}

function renderContactLocation(data) {
  const p = data.profile || {};
  const target = qs("#ac360Contact");
  if (!target) return;
  const addr = [p.address_line1, p.address_line2].filter(Boolean).join(", ");
  target.innerHTML = withEditToolbar(
    renderKv([
      { key: "Address", value: addr || "—" },
      { key: "City", value: p.city },
      { key: "State", value: p.state },
      { key: "ZIP", value: p.zip_code },
      { key: "Country", value: p.country },
      { key: "Target city", value: p.target_city },
      { key: "Target state", value: p.target_state },
      { key: "Target ZIP", value: p.target_zip_code },
      { key: "Moving from", value: p.moving_from },
      { key: "Moving to", value: p.moving_to },
      { key: "Moving date", value: p.moving_date ? formatDate(p.moving_date) : "—" },
      { key: "Timezone", value: p.timezone },
      { key: "Preferred contact", value: p.preferred_contact_method },
    ]) + renderJsonBlock(p.json_metadata, "Profile metadata"),
    "contact"
  );
}

function renderFamily(data) {
  const p = data.profile || {};
  const meta = p.json_metadata && typeof p.json_metadata === "object" ? p.json_metadata : {};
  const familyMeta = meta.family || meta.household || null;
  const target = qs("#ac360Family");
  if (!target) return;
  target.innerHTML = withEditToolbar(
    renderKv([
      { key: "Household size", value: p.household_size },
      { key: "Children count", value: p.children_count },
      { key: "Has pets", value: p.has_pets },
    ]) + renderJsonBlock(familyMeta, "metadata.family"),
    "family"
  );
}

function renderServiceProfiles(data) {
  const grouped = data.service_profiles || {};
  const target = qs("#ac360Services");
  if (!target) return;
  const keys = Object.keys(grouped).sort();
  if (!keys.length) {
    target.innerHTML = renderEmpty();
    return;
  }
  target.innerHTML = `<div class="ac360-cards">${keys
    .map((st) => {
      const row = grouped[st] || {};
      return `
        <article class="ac360-card">
          <div class="ac360-section__toolbar">
            <h3 class="ac360-card__title">${escapeHtml(st)}</h3>
            <button type="button" class="lhai-button lhai-button--secondary ac360-edit-btn" data-ac360-edit="service:${escapeHtml(st)}">편집</button>
          </div>
          ${renderKv([
            { key: "Status", value: row.status },
            { key: "Budget min", value: row.budget_min },
            { key: "Budget max", value: row.budget_max },
            { key: "Desired start", value: row.desired_start_date ? formatDate(row.desired_start_date) : "—" },
            { key: "Target city", value: row.target_city },
            { key: "Target state", value: row.target_state },
            { key: "Service item", value: row.service_item_id },
          ])}
          ${renderJsonBlock(row.service_data, "service_data")}
          ${renderJsonBlock(row.preference_data, "preference_data")}
          ${renderJsonBlock(row.requirement_data, "requirement_data")}
        </article>`;
    })
    .join("")}</div>`;
}

function renderSurvey(data) {
  const survey = data.survey || {};
  const submissions = survey.submissions || [];
  const answers = survey.answers || [];
  const target = qs("#ac360Survey");
  if (!target) return;

  if (!submissions.length && !answers.length) {
    target.innerHTML = renderEmpty();
    return;
  }

  const answersBySub = new Map();
  for (const ans of answers) {
    const sid = String(ans.questionnaire_submission_id || "");
    if (!answersBySub.has(sid)) answersBySub.set(sid, []);
    answersBySub.get(sid).push(ans);
  }

  const subBlocks = submissions.length
    ? submissions
    : [...answersBySub.keys()].map((id) => ({ id, status: "—", submitted_at: null }));

  target.innerHTML = subBlocks
    .map((sub) => {
      const sid = String(sub.id || "");
      const rows = answersBySub.get(sid) || [];
      const rowsHtml = rows.length
        ? `<div class="ac360-table-wrap"><table class="ac360-table">
            <thead><tr><th>질문</th><th>답변</th><th>작성</th></tr></thead>
            <tbody>${rows
              .map(
                (ans) => `<tr>
                  <td>${escapeHtml(safeText(surveyAnswerLabel(ans)))}</td>
                  <td>${escapeHtml(extractAnswerValue(ans.value_json))}</td>
                  <td>${escapeHtml(formatDate(ans.created_at))}</td>
                </tr>`
              )
              .join("")}</tbody></table></div>`
        : renderEmpty("No answers for this submission");

      return `
        <div class="ac360-group">
          <div class="ac360-group__head">
            <strong>Submission ${escapeHtml(sid.slice(0, 8))}…</strong>
            <span class="u-text-muted">${escapeHtml(safeText(sub.status))} · ${escapeHtml(formatDate(sub.submitted_at || sub.created_at))}</span>
          </div>
          ${rowsHtml}
        </div>`;
    })
    .join("");
}

function renderIntake(data) {
  const intake = data.intake || {};
  const sessions = intake.sessions || [];
  const answers = intake.answers || [];
  const target = qs("#ac360Intake");
  if (!target) return;

  if (!sessions.length && !answers.length) {
    target.innerHTML = renderEmpty();
    return;
  }

  const answersBySession = new Map();
  for (const ans of answers) {
    const sid = String(ans.session_id || "");
    if (!answersBySession.has(sid)) answersBySession.set(sid, []);
    answersBySession.get(sid).push(ans);
  }

  const sessionList = sessions.length
    ? sessions
    : [...answersBySession.keys()].map((id) => ({ id, status: "—", template_id: "—" }));

  target.innerHTML = sessionList
    .map((sess) => {
      const sid = String(sess.id || "");
      const rows = answersBySession.get(sid) || [];
      const rowsHtml = rows.length
        ? `<div class="ac360-table-wrap"><table class="ac360-table">
            <thead><tr><th>필드</th><th>값</th><th>source_type</th><th>answered</th></tr></thead>
            <tbody>${rows
              .map(
                (ans) => `<tr>
                  <td>${escapeHtml(safeText(intakeAnswerLabel(ans)))}<br><span class="u-text-muted">${escapeHtml(ans.field_key || "")}</span></td>
                  <td>${escapeHtml(extractAnswerValue(ans.value_json))}</td>
                  <td>${escapeHtml(safeText(ans.source_type))}${ans.source_ref ? `<br><span class="u-text-muted">${escapeHtml(ans.source_ref)}</span>` : ""}</td>
                  <td>${escapeHtml(formatDate(ans.answered_at))}</td>
                </tr>`
              )
              .join("")}</tbody></table></div>`
        : renderEmpty("No answers for this session");

      return `
        <div class="ac360-group">
          <div class="ac360-group__head">
            <strong>Session ${escapeHtml(sid.slice(0, 8))}…</strong>
            <span class="u-text-muted">${escapeHtml(safeText(sess.status))} · ${escapeHtml(safeText(sess.template_id))} · ${escapeHtml(formatDate(sess.completed_at || sess.started_at))}</span>
          </div>
          ${rowsHtml}
        </div>`;
    })
    .join("");
}

function renderQuotes(data) {
  const quotes = data.quotes || [];
  const target = qs("#ac360Quotes");
  if (!target) return;
  if (!quotes.length) {
    target.innerHTML = renderEmpty();
    return;
  }
  target.innerHTML = quotes
    .map((q) => {
      const snap = q.request_details && typeof q.request_details === "object" ? q.request_details : {};
      return `
        <div class="ac360-group">
          <div class="ac360-group__head">
            <strong>${escapeHtml(safeText(q.title || q.reference_code || q.id))}</strong>
            <span class="u-text-muted">${escapeHtml(safeText(q.status))} · ${escapeHtml(formatDate(q.created_at))}</span>
          </div>
          ${renderKv([
            { key: "Quote ID", value: q.id },
            { key: "Total", value: q.total != null ? `${q.total} ${q.currency || ""}` : "—" },
            { key: "Valid until", value: q.valid_until ? formatDate(q.valid_until) : "—" },
          ])}
          ${renderJsonBlock(snap, "request_details snapshot")}
        </div>`;
    })
    .join("");
}

function renderWorkflow(data) {
  const wf = data.workflow || {};
  const instances = wf.instances || [];
  const cases = wf.operational_cases || [];
  const target = qs("#ac360Workflow");
  if (!target) return;

  let html = "";
  if (!instances.length) {
    html += `<h4 class="u-mb-2">Workflow instances</h4>${renderEmpty()}`;
  } else {
    html += `<h4 class="u-mb-2">Workflow instances</h4><div class="ac360-table-wrap"><table class="ac360-table">
      <thead><tr><th>Type</th><th>Status</th><th>Step</th><th>Thread</th><th>Actions</th><th>Updated</th></tr></thead>
      <tbody>${instances
        .map((w) => {
          const tid = String(w.thread_id || "").trim();
          const msgHref = tid
            ? `messages.html?customer_profile_id=${encodeURIComponent(currentCustomerProfileId)}&thread_id=${encodeURIComponent(tid)}`
            : "";
          const actions = tid
            ? `<a class="lhai-link" href="${escapeHtml(msgHref)}">메시지함</a>`
            : "—";
          return `<tr>
            <td>${escapeHtml(safeText(w.workflow_type))}</td>
            <td>${escapeHtml(safeText(w.status))} / ${escapeHtml(safeText(w.customer_status))}</td>
            <td>${escapeHtml(safeText(w.current_step))}</td>
            <td>${tid ? `<code>${escapeHtml(tid.slice(0, 8))}…</code>` : "—"}</td>
            <td>${actions}</td>
            <td>${escapeHtml(formatDate(w.updated_at))}</td>
          </tr>`;
        })
        .join("")}</tbody></table></div>
      <p class="lhai-help u-mt-2">비딩 시작 이메일 진단은 아래 <strong>파트너 / 비딩</strong> 섹션의 Bidding requests → 이메일 진단을 사용하세요.</p>`;
  }

  if (!cases.length) {
    html += `<h4 class="u-mt-3 u-mb-2">Operational cases</h4>${renderEmpty()}`;
  } else {
    html += `<h4 class="u-mt-3 u-mb-2">Operational cases</h4><div class="ac360-table-wrap"><table class="ac360-table">
      <thead><tr><th>Case</th><th>Title</th><th>Queue</th><th>Status</th><th>Updated</th></tr></thead>
      <tbody>${cases
        .map(
          (c) => `<tr>
            <td>${escapeHtml(safeText(c.case_id))}</td>
            <td>${escapeHtml(safeText(c.title))}</td>
            <td>${escapeHtml(safeText(c.queue_tab))}</td>
            <td>${escapeHtml(safeText(c.case_status))}</td>
            <td>${escapeHtml(formatDate(c.updated_at))}</td>
          </tr>`
        )
        .join("")}</tbody></table></div>`;
  }
  target.innerHTML = html;
}

function renderPartners(data) {
  const partners = data.partners || {};
  const target = qs("#ac360Partners");
  if (!target) return;

  const offers = partners.offers || [];
  const selected = offers.filter((o) => String(o.status || "").toUpperCase() === "SELECTED");

  let highlight = "";
  if (selected.length) {
    highlight = `<div class="ac360-highlight">선택된 파트너 오퍼: ${selected
      .map((o) => escapeHtml(String(o.id).slice(0, 8)))
      .join(", ")}…</div>`;
  }

  const section = (title, rows, columns) => {
    if (!rows.length) return `<h4 class="u-mb-2">${escapeHtml(title)}</h4>${renderEmpty()}`;
    return `<h4 class="u-mb-2">${escapeHtml(title)}</h4>
      <div class="ac360-table-wrap"><table class="ac360-table">
        <thead><tr>${columns.map((c) => `<th>${escapeHtml(c)}</th>`).join("")}</tr></thead>
        <tbody>${rows.map((r) => `<tr>${r}</tr>`).join("")}</tbody>
      </table></div>`;
  };

  target.innerHTML =
    highlight +
    section(
      "Partner requests",
      (partners.requests || []).map(
        (r) => `<td>${escapeHtml(safeText(r.request_type))}</td>
          <td>${escapeHtml(safeText(r.status))}</td>
          <td>${escapeHtml(safeText(r.delivery_channel))}</td>
          <td>${escapeHtml(formatDate(r.sent_at || r.created_at))}</td>`
      ),
      ["Type", "Status", "Channel", "Sent"]
    ) +
    section(
      "Partner offers",
      offers.map(
        (o) => `<td>${escapeHtml(safeText(o.offer_type))}</td>
          <td>${escapeHtml(safeText(o.status))}</td>
          <td>${escapeHtml(o.price_amount != null ? `${o.price_amount} ${o.currency}` : "—")}</td>
          <td>${escapeHtml(formatDate(o.created_at))}</td>`
      ),
      ["Type", "Status", "Price", "Created"]
    ) +
    section(
      "Bidding requests",
      (partners.bidding_requests || []).map((b) => {
        const bidId = String(b.id || "").trim();
        const tid = String(b.thread_id || "").trim();
        const msgHref = tid
          ? `messages.html?customer_profile_id=${encodeURIComponent(currentCustomerProfileId)}&thread_id=${encodeURIComponent(tid)}`
          : "#";
        return `<td>${escapeHtml(safeText(b.status))}</td>
          <td><a class="lhai-link" href="${escapeHtml(msgHref)}">${escapeHtml(String(tid).slice(0, 8))}…</a></td>
          <td>${escapeHtml(formatDate(b.expires_at || b.created_at))}</td>
          <td>${
            bidId
              ? `<button type="button" class="lhai-button lhai-button--secondary lhai-button--sm ac360-bid-email-debug-btn" data-bid-request-id="${escapeHtml(bidId)}" data-thread-id="${escapeHtml(tid)}">Notification debug</button>`
              : "—"
          }</td>`;
      }),
      ["Status", "Thread", "Expires", "Debug"]
    ) +
    `<div id="ac360BiddingEmailDebugMount" class="ac360-bidding-email-debug u-mt-3" hidden>
      <p class="lhai-help u-mb-1">Bidding notification debug (admin API; bid_request_id from table below)</p>
      <div id="ac360BiddingEmailDebugBody"></div>
    </div>` +
    section(
      "Partner bids",
      (partners.partner_bids || []).map(
        (b) => `<td>${escapeHtml(safeText(b.status))}</td>
          <td>${escapeHtml(b.price_amount != null ? `${b.price_amount} ${b.price_currency}` : "—")}</td>
          <td>${escapeHtml(formatDate(b.submitted_at || b.created_at))}</td>`
      ),
      ["Status", "Price", "Submitted"]
    );
}

function renderMessagesBlock(data, customerProfileId) {
  const msg = data.messages || {};
  const threads = msg.threads || [];
  const recent = msg.recent_messages || [];
  const target = qs("#ac360Messages");
  if (!target) return;

  const totalT = msg.threads_total_count ?? threads.length;
  const totalM = msg.recent_messages_total_count ?? recent.length;

  let html = `<p class="u-text-muted u-mb-2">스레드 ${totalT}건 · 최근 메시지 표시 ${recent.length}/${totalM}건 (limit ${msg.recent_messages_limit ?? DEFAULT_LIMIT})</p>`;

  if (!threads.length) {
    html += `<h4 class="u-mb-2">Threads</h4>${renderEmpty()}`;
  } else {
    html += `<h4 class="u-mb-2">Threads</h4><ul class="lhai-list">${threads
      .map((t) => {
        const tid = String(t.id || "");
        const href = `messages.html?customer_profile_id=${encodeURIComponent(customerProfileId)}&thread_id=${encodeURIComponent(tid)}`;
        return `<li class="lhai-list__item">
          <a href="${href}"><strong>${escapeHtml(safeText(t.service_name_snapshot || t.thread_role || tid.slice(0, 8)))}</strong></a>
          <span class="u-text-muted"> · ${escapeHtml(safeText(t.status))} · ${escapeHtml(formatDate(t.updated_at))}</span>
        </li>`;
      })
      .join("")}</ul>`;
  }

  if (!recent.length) {
    html += `<h4 class="u-mt-3 u-mb-2">Recent messages</h4>${renderEmpty()}`;
  } else {
    html += `<h4 class="u-mt-3 u-mb-2">Recent messages</h4><ul class="ac360-timeline">${recent
      .map((m) => {
        const dir = safeText(m.direction);
        const sender = m.sender_account_id ? `account ${String(m.sender_account_id).slice(0, 8)}…` : dir;
        return `<li class="ac360-timeline__item">
          <strong>${escapeHtml(safeText(m.subject || m.message_type || "message"))}</strong>
          <span class="lhai-badge">${escapeHtml(dir)}</span>
          <p class="u-text-muted u-mb-1">${escapeHtml(sender)} → thread ${escapeHtml(String(m.thread_id || "").slice(0, 8))}…</p>
          <p>${escapeHtml(safeText((m.body_text || "").slice(0, 200)))}${(m.body_text || "").length > 200 ? "…" : ""}</p>
          <small class="u-text-muted">${escapeHtml(formatMessageTimestamp(m.created_at))}</small>
        </li>`;
      })
      .join("")}</ul>`;
  }

  target.innerHTML = html;
}

function renderActivity(data) {
  const activities = data.activities || [];
  const target = qs("#ac360Activity");
  if (!target) return;
  if (!activities.length) {
    target.innerHTML = renderEmpty();
    return;
  }
  target.innerHTML = `<ul class="ac360-timeline">${activities
    .map(
      (a) => `<li class="ac360-timeline__item">
        <div class="ac360-badge-row">
          <span class="lhai-badge">${escapeHtml(safeText(a.activity_type))}</span>
          ${a.service_type ? `<span class="lhai-badge lhai-badge--muted">${escapeHtml(safeText(a.service_type))}</span>` : ""}
        </div>
        ${a.title ? `<strong>${escapeHtml(safeText(a.title))}</strong>` : ""}
        ${a.summary ? `<p>${escapeHtml(safeText(a.summary))}</p>` : ""}
        <small class="u-text-muted">${escapeHtml(formatMessageTimestamp(a.created_at))}</small>
      </li>`
    )
    .join("")}</ul>`;
}

function renderAdminNotes(data) {
  const p = data.profile || {};
  const target = qs("#ac360Notes");
  if (!target) return;
  const hasNote = (p.internal_note || "").trim() || (p.admin_summary || "").trim();
  const body =
    !hasNote
      ? renderEmpty("No admin notes yet")
      : renderKv([
          { key: "Internal note", value: p.internal_note },
          { key: "Admin summary", value: p.admin_summary },
        ]);
  target.innerHTML = withEditToolbar(body, "notes");
}

function ac360AutoLoadLatestBiddingEmailDebug(partnersBlock) {
  const list = partnersBlock?.bidding_requests;
  if (!Array.isArray(list) || !list.length) return;
  const sorted = [...list].sort((a, b) => {
    const ta = Date.parse(String(a.created_at || a.expires_at || "")) || 0;
    const tb = Date.parse(String(b.created_at || b.expires_at || "")) || 0;
    return tb - ta;
  });
  const latest = sorted[0];
  const bidRequestId = String(latest?.id || "").trim();
  const threadId = String(latest?.thread_id || "").trim();
  if (!bidRequestId) return;
  const mount = qs("#ac360BiddingEmailDebugMount");
  const body = qs("#ac360BiddingEmailDebugBody");
  if (mount instanceof HTMLElement) mount.hidden = false;
  if (!(body instanceof HTMLElement)) return;
  void loadBiddingNotificationDebugInto(body, {
    threadId,
    bidRequestId,
    fetchThreadDebug: (id) => serviceCatalogAdminApi.getThreadBiddingDispatchDebug(id),
    fetchBidDebug: (id) => serviceCatalogAdminApi.getBidRequestNotificationDebug(id),
  });
}

function wireAc360BiddingEmailDebug() {
  const partners = qs("#ac360Partners");
  if (!partners || partners.dataset.bidEmailDebugWired === "1") return;
  partners.dataset.bidEmailDebugWired = "1";
  partners.addEventListener("click", (ev) => {
    const btn =
      ev.target instanceof HTMLElement ? ev.target.closest(".ac360-bid-email-debug-btn") : null;
    if (!(btn instanceof HTMLButtonElement)) return;
    const bidRequestId = String(btn.getAttribute("data-bid-request-id") || "").trim();
    const threadId = String(btn.getAttribute("data-thread-id") || "").trim();
    const mount = qs("#ac360BiddingEmailDebugMount");
    const body = qs("#ac360BiddingEmailDebugBody");
    if (mount instanceof HTMLElement) mount.hidden = false;
    if (!(body instanceof HTMLElement)) return;
    void loadBiddingNotificationDebugInto(body, {
      threadId,
      bidRequestId,
      fetchThreadDebug: (id) => serviceCatalogAdminApi.getThreadBiddingDispatchDebug(id),
      fetchBidDebug: (id) => serviceCatalogAdminApi.getBidRequestNotificationDebug(id),
    });
    mount?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  });
}

function renderCustomer360(data, customerProfileId) {
  renderBasicInfo(data);
  renderContactLocation(data);
  renderFamily(data);
  renderServiceProfiles(data);
  renderSurvey(data);
  renderIntake(data);
  renderQuotes(data);
  renderWorkflow(data);
  renderPartners(data);
  wireAc360BiddingEmailDebug();
  ac360AutoLoadLatestBiddingEmailDebug(data.partners || {});
  renderMessagesBlock(data, customerProfileId);
  renderActivity(data);
  renderAdminNotes(data);
}

async function loadEmailLogs(customerProfileId) {
  const target = qs("#ac360EmailLogs");
  if (!target) return;
  try {
    const logs = await emailLogsApi.list(customerProfileId);
    if (!logs.length) {
      target.innerHTML = renderEmpty();
      return;
    }
    target.innerHTML = `<ul class="lhai-list">${logs
      .map(
        (log) => `<li class="lhai-list__item">
          <strong>${escapeHtml(safeText(log.subject))}</strong>
          <p class="u-text-muted">${escapeHtml(safeText(log.to_email))} · ${escapeHtml(safeText(log.status))}</p>
          <small class="u-text-muted">${escapeHtml(formatDate(log.created_at))}</small>
        </li>`
      )
      .join("")}</ul>`;
  } catch (err) {
    target.innerHTML = `<p class="ac360-empty">이메일 로그를 불러오지 못했습니다: ${escapeHtml(err?.message || String(err))}</p>`;
  }
}

/**
 * @param {string} customerProfileId
 */
async function fetchAndRenderCustomer360(customerProfileId) {
  setGlobalError("");
  setLoading(true);

  let data = null;
  currentCustomerProfileId = customerProfileId;
  try {
    data = await adminApi.getCustomer360(customerProfileId, { limit: DEFAULT_LIMIT });
    current360Data = data;
  } catch (err) {
    const detail = err?.message || String(err);
    setGlobalError(
      `Customer 360 API를 불러오지 못했습니다. (${detail}) 프로필 ID와 관리자 로그인·DB 연결을 확인하세요.`
    );
    setLoading(false);
    return;
  }

  setLoading(false);
  const root = qs("#ac360Root");
  if (root) root.hidden = false;

  try {
    renderCustomer360(data, customerProfileId);
  } catch (renderErr) {
    console.error(renderErr);
    setGlobalError(
      `데이터는 수신했으나 화면 렌더링 중 오류가 발생했습니다: ${renderErr?.message || String(renderErr)}`
    );
  }

  void loadEmailLogs(customerProfileId);
}

async function initAdminCustomerDetailPage() {
  if (!protectCurrentPage()) return;
  if (!ensureAdminAccess()) return;
  await loadSidebar("#sidebar", "admin");

  const customerProfileId = resolveCustomerProfileIdFromUrl();
  if (!customerProfileId) {
    setLoading(false);
    setGlobalError(
      "URL에 customer_profile_id 가 없습니다. 예: admin-customer-detail.html?customer_profile_id=<uuid>"
    );
    return;
  }

  updatePageChrome(customerProfileId);

  const reloadBtn = qs("#ac360ReloadBtn");
  if (reloadBtn) {
    reloadBtn.addEventListener("click", () => {
      void fetchAndRenderCustomer360(customerProfileId);
    });
  }

  wireEditDialog();
  await fetchAndRenderCustomer360(customerProfileId);
}

void initAdminCustomerDetailPage();

export {
  resolveCustomerProfileIdFromUrl,
  fetchAndRenderCustomer360,
  renderCustomer360,
  displayScalar,
};
