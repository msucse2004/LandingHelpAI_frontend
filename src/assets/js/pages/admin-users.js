import { adminApi } from "../core/api.js";

const tbody = document.getElementById("accountsTableBody");
const loadStatus = document.getElementById("accountsLoadStatus");
const pageAlert = document.getElementById("pageAlert");

function setLoadStatus(text) {
  if (loadStatus) loadStatus.textContent = text;
}

function setPageAlert(text, { error = false } = {}) {
  if (!pageAlert) return;
  pageAlert.textContent = text;
  pageAlert.classList.toggle("lhai-field-error", Boolean(error) && Boolean(text));
  pageAlert.classList.toggle("lhai-help", !error || !text);
}

function displayUsername(row) {
  const u = String(row.username || "").trim();
  if (u) return u;
  const email = String(row.email || "").trim();
  if (email.includes("@")) return email.split("@")[0];
  return "";
}

function rowTemplate(row) {
  const tr = document.createElement("tr");
  tr.dataset.userId = row.id;
  const detailHref = `admin-user-detail.html?id=${encodeURIComponent(row.id)}`;
  const uname = displayUsername(row) || "—";
  tr.innerHTML = `
    <td><a class="lhai-table__link" href="${detailHref}">${escapeHtml(uname)}</a></td>
    <td>${escapeHtml(row.full_name || "—")}</td>
    <td>${escapeHtml(row.email)}</td>
    <td><span class="lhai-badge lhai-badge--customer">${escapeHtml(row.role)}</span></td>
  `;
  return tr;
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

async function loadTable() {
  if (!tbody) return;
  setLoadStatus("목록을 불러오는 중…");
  setPageAlert("");
  tbody.innerHTML = "";
  let rows;
  try {
    rows = await adminApi.listAuthAccounts();
  } catch (e) {
    setLoadStatus("");
    setPageAlert(`목록을 불러오지 못했습니다. ${e.message || ""}`, { error: true });
    return;
  }
  if (!Array.isArray(rows)) {
    setLoadStatus("");
    setPageAlert("서버 응답 형식이 올바르지 않습니다.", { error: true });
    return;
  }
  setLoadStatus(rows.length ? `총 ${rows.length}명` : "등록된 계정이 없습니다.");
  if (!rows.length) {
    const tr = document.createElement("tr");
    tr.innerHTML = `<td colspan="4" class="lhai-state lhai-state--empty">표시할 계정이 없습니다. 데모 시드 계정을 쓰지 않으므로, 먼저 <a href="signup.html">회원가입</a>으로 계정을 만든 뒤 이 페이지에서 새로고침하세요.</td>`;
    tbody.appendChild(tr);
    return;
  }
  for (const row of rows) {
    tbody.appendChild(rowTemplate(row));
  }
}

const refreshBtn = document.getElementById("accountsRefreshBtn");
if (refreshBtn) refreshBtn.addEventListener("click", () => void loadTable());

void loadTable();
