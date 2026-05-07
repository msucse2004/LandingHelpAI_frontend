import { adminApi } from "../core/api.js";
import { APP_CONFIG } from "../core/config.js";
import { getCurrentRole, getCurrentUserId } from "../core/auth.js";
import { protectCurrentPage } from "../core/guards.js";
import { mayShowAccountDeleteButton } from "../core/role-tiers.js";

const tbody = document.getElementById("accountsTableBody");
const loadStatus = document.getElementById("accountsLoadStatus");
const pageAlert = document.getElementById("pageAlert");
const filterRecordType = document.getElementById("filterRecordType");
const filterRole = document.getElementById("filterRole");
const filterEmailKeyword = document.getElementById("filterEmailKeyword");
const filterResetBtn = document.getElementById("filterResetBtn");
let allRowsCache = [];

function setLoadStatus(text) {
  if (loadStatus) loadStatus.textContent = text;
}

function setPageAlert(text, { error = false } = {}) {
  if (!pageAlert) return;
  pageAlert.textContent = text;
  pageAlert.classList.toggle("lhai-field-error", Boolean(error) && Boolean(text));
  pageAlert.classList.toggle("lhai-help", !error || !text);
}

function escapeHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function displayUsername(row) {
  const u = String(row.username || "").trim();
  if (u) return u;
  const email = String(row.email || "").trim();
  if (email.includes("@")) return email.split("@")[0];
  return "";
}

/** 백엔드와 동일: 자신보다 권한이 낮은 대상만 삭제 UI. 본인 계정은 삭제 불가. 상위·동일 등급은 버튼 없음. */
function rowMayBeDeletedByActor(row) {
  const actor = getCurrentRole();
  const targetRole = String(row.role || "").trim();
  if (!targetRole || !mayShowAccountDeleteButton(actor, targetRole)) return false;
  if (String(row.record_type || "") === "account") {
    const myId = getCurrentUserId();
    if (myId && String(row.id || "").trim() === myId) return false;
  }
  return true;
}

function rowTemplate(row) {
  const tr = document.createElement("tr");
  tr.dataset.recordType = String(row.record_type || "account");
  tr.dataset.recordId = String(row.id || "");
  const isAccount = row.record_type === "account";
  const uname = displayUsername(row) || "—";
  const role = String(row.role || "");
  const subRoleRaw = String(row.sub_role ?? "").trim();
  const badgeClass = isAccount ? "lhai-badge--customer" : "lhai-badge--info";
  const typeLabel = isAccount ? "회원" : "초대";
  const name = String(row.full_name || "").trim() || "—";
  const accountCell = isAccount
    ? `<a class="lhai-table__link" href="admin-user-detail.html?id=${encodeURIComponent(row.id)}">${escapeHtml(uname)}</a>`
    : "—";
  const actionText = isAccount ? "계정 삭제" : "초대 삭제";
  const mayDelete = rowMayBeDeletedByActor(row);
  const deleteCell = mayDelete
    ? `<td><button type="button" class="lhai-button lhai-button--danger lhai-button--compact js-delete-record">${escapeHtml(actionText)}</button></td>`
    : `<td></td>`;

  const subRoleCell =
    subRoleRaw !== ""
      ? `<td><span class="lhai-badge ${badgeClass}">${escapeHtml(subRoleRaw)}</span></td>`
      : "<td></td>";

  tr.innerHTML = `
    <td><span class="lhai-badge ${isAccount ? "lhai-badge--success" : "lhai-badge--info"}">${escapeHtml(typeLabel)}</span></td>
    <td>${accountCell}</td>
    <td>${escapeHtml(name)}</td>
    <td>${escapeHtml(row.email || "")}</td>
    <td><span class="lhai-badge ${badgeClass}">${escapeHtml(role || "—")}</span></td>
    ${subRoleCell}
    ${deleteCell}
  `;
  return tr;
}

function rowMatchesFilters(row) {
  const typeFilter = String(filterRecordType?.value || "").trim();
  const roleFilter = String(filterRole?.value || "").trim().toLowerCase();
  const emailKeyword = String(filterEmailKeyword?.value || "").trim().toLowerCase();
  if (typeFilter && String(row.record_type || "").trim() !== typeFilter) return false;
  if (roleFilter && String(row.role || "").trim().toLowerCase() !== roleFilter) return false;
  if (emailKeyword && !String(row.email || "").trim().toLowerCase().includes(emailKeyword)) return false;
  return true;
}

function rebuildRoleFilterOptions(rows) {
  if (!(filterRole instanceof HTMLSelectElement)) return;
  const keep = String(filterRole.value || "").trim().toLowerCase();
  const roles = Array.from(
    new Set(rows.map((r) => String(r.role || "").trim().toLowerCase()).filter((x) => x.length > 0)),
  ).sort();
  filterRole.innerHTML = '<option value="">전체</option>';
  for (const role of roles) {
    const opt = document.createElement("option");
    opt.value = role;
    opt.textContent = role;
    filterRole.appendChild(opt);
  }
  if (keep && roles.includes(keep)) filterRole.value = keep;
}

function renderFilteredRows() {
  if (!tbody) return;
  tbody.innerHTML = "";
  const filtered = allRowsCache.filter((row) => rowMatchesFilters(row));
  setLoadStatus(filtered.length ? `총 ${filtered.length}건` : "필터 조건에 맞는 데이터가 없습니다.");
  if (!filtered.length) {
    const tr = document.createElement("tr");
    tr.innerHTML =
      '<td colspan="7" class="lhai-state lhai-state--empty">조건에 맞는 데이터가 없습니다. 필터를 조정해 주세요.</td>';
    tbody.appendChild(tr);
    return;
  }
  for (const row of filtered) tbody.appendChild(rowTemplate(row));
}

async function loadMemoryPersistenceWarning() {
  try {
    const base = String(APP_CONFIG.apiBaseUrl || "").replace(/\/$/, "");
    const healthUrl = `${base}/health`;
    const hr = await fetch(healthUrl);
    if (!hr.ok) return "";
    const h = await hr.json();
    if (h && h.accounts_durable === false) {
      return (
        "이 서버는 계정을 DB가 아닌 메모리에만 저장 중입니다. 재시작하면 초대·가입 계정이 사라질 수 있습니다. " +
        "백엔드에 PostgreSQL DATABASE_URL을 설정하고 `alembic upgrade head`를 실행하세요."
      );
    }
  } catch {
    return "";
  }
  return "";
}

async function loadTable() {
  if (!tbody) return;
  setLoadStatus("목록을 불러오는 중…");
  setPageAlert("");
  tbody.innerHTML = "";

  const memoryPersistenceWarning = await loadMemoryPersistenceWarning();
  let rows;
  try {
    rows = await adminApi.listRegistrationStatus();
  } catch (e) {
    setLoadStatus("");
    const extra = memoryPersistenceWarning ? ` ${memoryPersistenceWarning}` : "";
    setPageAlert(`목록을 불러오지 못했습니다. ${e.message || ""}${extra}`, { error: true });
    return;
  }
  if (!Array.isArray(rows)) {
    setLoadStatus("");
    setPageAlert("서버 응답 형식이 올바르지 않습니다.", { error: true });
    return;
  }

  if (memoryPersistenceWarning) setPageAlert(memoryPersistenceWarning, { error: true });
  allRowsCache = rows;
  rebuildRoleFilterOptions(rows);
  if (!rows.length) {
    setLoadStatus("표시할 가입/초대 데이터가 없습니다.");
    const tr = document.createElement("tr");
    tr.innerHTML =
      '<td colspan="7" class="lhai-state lhai-state--empty">표시할 데이터가 없습니다. 초대 메일을 보내거나 회원가입 후 새로고침해 주세요.</td>';
    tbody.appendChild(tr);
    return;
  }
  renderFilteredRows();
}

async function deleteRecord(rowEl, btnEl) {
  const recordType = String(rowEl?.dataset.recordType || "");
  const recordId = String(rowEl?.dataset.recordId || "");
  if (!recordType || !recordId || !(btnEl instanceof HTMLButtonElement)) return;
  const label = recordType === "invitation" ? "초대 데이터를 삭제하시겠습니까?" : "계정을 삭제하시겠습니까?";
  if (!window.confirm(label)) return;

  btnEl.disabled = true;
  setPageAlert("");
  try {
    if (recordType === "invitation") {
      await adminApi.deleteInvitationRecord(recordId);
      setPageAlert("초대 데이터를 삭제했습니다.");
    } else {
      await adminApi.deleteAuthAccount(recordId);
      setPageAlert("계정을 삭제했습니다.");
    }
    await loadTable();
  } catch (e) {
    setPageAlert(`삭제 실패: ${e.message || e}`, { error: true });
    btnEl.disabled = false;
  }
}

const refreshBtn = document.getElementById("accountsRefreshBtn");
if (refreshBtn) refreshBtn.addEventListener("click", () => void loadTable());
if (filterRecordType instanceof HTMLSelectElement) {
  filterRecordType.addEventListener("change", () => renderFilteredRows());
}
if (filterRole instanceof HTMLSelectElement) {
  filterRole.addEventListener("change", () => renderFilteredRows());
}
if (filterEmailKeyword instanceof HTMLInputElement) {
  filterEmailKeyword.addEventListener("input", () => renderFilteredRows());
}
if (filterResetBtn instanceof HTMLButtonElement) {
  filterResetBtn.addEventListener("click", () => {
    if (filterRecordType instanceof HTMLSelectElement) filterRecordType.value = "";
    if (filterRole instanceof HTMLSelectElement) filterRole.value = "";
    if (filterEmailKeyword instanceof HTMLInputElement) filterEmailKeyword.value = "";
    renderFilteredRows();
  });
}

tbody?.addEventListener("click", (ev) => {
  const t = ev.target;
  if (!(t instanceof HTMLElement)) return;
  const btn = t.closest(".js-delete-record");
  if (!(btn instanceof HTMLButtonElement)) return;
  const tr = btn.closest("tr");
  if (!(tr instanceof HTMLTableRowElement)) return;
  void deleteRecord(tr, btn);
});

if (protectCurrentPage()) {
  void loadTable();
}
