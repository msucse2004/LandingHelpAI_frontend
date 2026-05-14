/**
 * Admin — Partners: list, filter, create partner (+ optional account), attach account.
 */
import { adminApi } from "../core/api.js";
import { ensureAdminAccess, protectCurrentPage } from "../core/guards.js";
import { normalizePartnerTypesFromApi, partnerTypeOptionDisplayText } from "./admin-partner-type-options.js";

const tbody = document.getElementById("partnersTableBody");
const loadStatus = document.getElementById("partnersLoadStatus");
const pageAlert = document.getElementById("partnersPageAlert");
const filterPartnerType = document.getElementById("filterPartnerType");
const filterActiveOnly = document.getElementById("filterActiveOnly");
const refreshBtn = document.getElementById("partnersRefreshBtn");

const openCreateBtn = document.getElementById("openCreatePartnerBtn");
const createDialog = document.getElementById("createPartnerDialog");
const createForm = document.getElementById("createPartnerForm");
const createCancelBtn = document.getElementById("createPartnerCancelBtn");
const createSubmitBtn = document.getElementById("createPartnerSubmitBtn");
const createPartnerType = document.getElementById("createPartnerType");
const createPartnerMode = document.getElementById("createPartnerMode");
const createPartnerName = document.getElementById("createPartnerName");
const createPartnerEmail = document.getElementById("createPartnerEmail");
const createPartnerPhone = document.getElementById("createPartnerPhone");
const createPartnerState = document.getElementById("createPartnerState");
const createPartnerCity = document.getElementById("createPartnerCity");
const createPartnerPreferredChannel = document.getElementById("createPartnerPreferredChannel");
const createPartnerCreateAccount = document.getElementById("createPartnerCreateAccount");
const createPartnerAccountFields = document.getElementById("createPartnerAccountFields");
const createAccountUsername = document.getElementById("createAccountUsername");
const createAccountPassword = document.getElementById("createAccountPassword");
const createAccountDisplayName = document.getElementById("createAccountDisplayName");
const createAccountEmail = document.getElementById("createAccountEmail");

const attachDialog = document.getElementById("attachAccountDialog");
const attachForm = document.getElementById("attachAccountForm");
const attachCancelBtn = document.getElementById("attachAccountCancelBtn");
const attachSubmitBtn = document.getElementById("attachAccountSubmitBtn");
const attachPartnerId = document.getElementById("attachAccountPartnerId");
const attachPartnerLabel = document.getElementById("attachAccountPartnerLabel");
const attachUsername = document.getElementById("attachUsername");
const attachPassword = document.getElementById("attachPassword");
const attachEmail = document.getElementById("attachEmail");
const attachDisplayName = document.getElementById("attachDisplayName");

/** @type {Array<{ value: string, label: string }>} */
let resolvedPartnerTypes = [];

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function setLoadStatus(text) {
  if (loadStatus) loadStatus.textContent = text || "";
}

function setPageAlert(text, { error = false } = {}) {
  if (!pageAlert) return;
  pageAlert.textContent = text || "";
  pageAlert.classList.toggle("lhai-field-error", Boolean(error) && Boolean(text));
  pageAlert.classList.toggle("lhai-help", !error || !text);
}

function partnerTypeOptions() {
  return resolvedPartnerTypes;
}

function fillPartnerTypeSelect(selectEl, { includeAllEmpty } = {}) {
  if (!(selectEl instanceof HTMLSelectElement)) return;
  const prev = String(selectEl.value || "").trim().toUpperCase();
  selectEl.innerHTML = "";
  if (includeAllEmpty) {
    const all = document.createElement("option");
    all.value = "";
    all.textContent = "전체";
    selectEl.appendChild(all);
  } else {
    const ph = document.createElement("option");
    ph.value = "";
    ph.textContent = "선택…";
    selectEl.appendChild(ph);
  }
  for (const o of partnerTypeOptions()) {
    const v = String(o.value || "").trim().toUpperCase();
    if (!v) continue;
    const op = document.createElement("option");
    op.value = v;
    op.textContent = partnerTypeOptionDisplayText(o);
    selectEl.appendChild(op);
  }
  if (prev && [...selectEl.options].some((opt) => opt.value === prev)) {
    selectEl.value = prev;
  }
}

async function loadPartnerTypes() {
  try {
    const data = await adminApi.listPartnerTypes();
    resolvedPartnerTypes = normalizePartnerTypesFromApi(data);
  } catch {
    resolvedPartnerTypes = [];
  }
  fillPartnerTypeSelect(filterPartnerType, { includeAllEmpty: true });
  fillPartnerTypeSelect(createPartnerType, { includeAllEmpty: false });
}

function cityStateLabel(row) {
  const city = String(row.city || "").trim();
  const state = String(row.state || "").trim();
  if (city && state) return `${city}, ${state}`;
  return city || state || "—";
}

function boolBadge(on) {
  return on
    ? '<span class="lhai-badge lhai-badge--status-active">예</span>'
    : '<span class="lhai-badge lhai-badge--status-pending">아니오</span>';
}

function rowTemplate(row) {
  const tr = document.createElement("tr");
  tr.dataset.partnerId = row.id;
  const hasAcc = Boolean(row.has_account);
  const username = String(row.username || "").trim();
  const accountCell = hasAcc ? escapeHtml(username || "—") : "—";
  const emailRaw = String(row.email || "").trim();
  const canInvite = !hasAcc && emailRaw.includes("@");
  let actions = "";
  if (!hasAcc) {
    const inviteBtn = canInvite
      ? `<button type="button" class="lhai-button lhai-button--secondary lhai-button--compact js-invite-partner-account" data-partner-id="${escapeHtml(row.id)}" data-partner-email="${escapeHtml(emailRaw)}">Invite account</button>`
      : "";
    const attachBtn = `<button type="button" class="lhai-button lhai-button--secondary lhai-button--compact js-attach-account" data-partner-id="${escapeHtml(row.id)}" data-partner-name="${escapeHtml(row.name || "")}" data-partner-email="${escapeHtml(row.email || "")}">계정 만들기</button>`;
    const bits = [inviteBtn, attachBtn].filter(Boolean);
    actions =
      bits.length > 1
        ? `<div class="u-flex u-gap-2 u-flex-wrap" style="align-items:center;">${bits.join("")}</div>`
        : bits[0] || "—";
  } else {
    actions = "—";
  }

  tr.innerHTML = `
    <td>${escapeHtml(row.name || "—")}</td>
    <td>${escapeHtml(row.partner_type_label || row.partner_type || "—")}</td>
    <td>${escapeHtml(String(row.partner_mode || "").trim() || "—")}</td>
    <td>${escapeHtml(row.email || "—")}</td>
    <td>${escapeHtml(cityStateLabel(row))}</td>
    <td>${escapeHtml(String(row.preferred_channel || "").trim() || "—")}</td>
    <td>${boolBadge(hasAcc)}</td>
    <td>${accountCell}</td>
    <td>${boolBadge(Boolean(row.active))}</td>
    <td>${actions || "—"}</td>
  `;
  return tr;
}

async function loadPartnersTable() {
  if (!tbody) return;
  setPageAlert("");
  setLoadStatus("목록을 불러오는 중…");
  tbody.innerHTML = "";

  const partner_type =
    filterPartnerType instanceof HTMLSelectElement && filterPartnerType.value.trim()
      ? filterPartnerType.value.trim().toUpperCase()
      : undefined;
  const active_only = filterActiveOnly instanceof HTMLInputElement ? filterActiveOnly.checked : true;

  let rows;
  try {
    rows = await adminApi.listPartners({ partner_type, active_only, limit: 500 });
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

  setLoadStatus(rows.length ? `총 ${rows.length}건` : "조건에 맞는 파트너가 없습니다.");
  if (!rows.length) {
    const tr = document.createElement("tr");
    tr.innerHTML =
      '<td colspan="9" class="lhai-state lhai-state--empty">표시할 파트너가 없습니다. 상단에서 필터를 바꾸거나 파트너를 추가하세요.</td>';
    tbody.appendChild(tr);
    return;
  }
  for (const row of rows) {
    tbody.appendChild(rowTemplate(row));
  }
}

function toggleCreateAccountFields() {
  const on = createPartnerCreateAccount instanceof HTMLInputElement && createPartnerCreateAccount.checked;
  if (createPartnerAccountFields) {
    createPartnerAccountFields.style.display = on ? "block" : "none";
  }
  if (createAccountPassword instanceof HTMLInputElement) {
    createAccountPassword.required = on;
  }
  if (on && createAccountEmail instanceof HTMLInputElement && !createAccountEmail.value.trim() && createPartnerEmail instanceof HTMLInputElement) {
    createAccountEmail.value = createPartnerEmail.value.trim();
  }
}

function openCreateDialog() {
  if (!(createDialog instanceof HTMLDialogElement) || !createForm) return;
  createForm.reset();
  if (createAccountEmail instanceof HTMLInputElement) delete createAccountEmail.dataset.userEdited;
  if (createPartnerPreferredChannel instanceof HTMLSelectElement) {
    createPartnerPreferredChannel.value = "EMAIL";
  }
  toggleCreateAccountFields();
  createDialog.showModal();
}

function closeCreateDialog() {
  if (createDialog instanceof HTMLDialogElement) createDialog.close();
}

function openAttachDialog(partnerId, partnerName, partnerEmail) {
  if (!(attachDialog instanceof HTMLDialogElement) || !attachForm) return;
  attachForm.reset();
  if (attachPartnerId instanceof HTMLInputElement) attachPartnerId.value = partnerId;
  if (attachPartnerLabel) {
    attachPartnerLabel.textContent = partnerName ? `파트너: ${partnerName}` : `ID: ${partnerId}`;
  }
  if (attachEmail instanceof HTMLInputElement) {
    attachEmail.value = String(partnerEmail || "").trim();
  }
  attachDialog.showModal();
}

function closeAttachDialog() {
  if (attachDialog instanceof HTMLDialogElement) attachDialog.close();
}

function syncAccountEmailFromPartner() {
  if (!(createPartnerCreateAccount instanceof HTMLInputElement) || !createPartnerCreateAccount.checked) return;
  if (!(createAccountEmail instanceof HTMLInputElement) || !(createPartnerEmail instanceof HTMLInputElement)) return;
  const pe = createPartnerEmail.value.trim();
  const ae = createAccountEmail.value.trim();
  if (!ae && pe) createAccountEmail.value = pe;
}

createPartnerEmail?.addEventListener("input", () => {
  if (!(createAccountEmail instanceof HTMLInputElement)) return;
  if (!createPartnerCreateAccount?.checked) return;
  if (!createAccountEmail.dataset.userEdited) {
    createAccountEmail.value = createPartnerEmail.value.trim();
  }
});

createAccountEmail?.addEventListener("input", () => {
  createAccountEmail.dataset.userEdited = "1";
});

createPartnerCreateAccount?.addEventListener("change", () => {
  if (createPartnerCreateAccount.checked && createAccountEmail instanceof HTMLInputElement) {
    delete createAccountEmail.dataset.userEdited;
    createAccountEmail.value = createPartnerEmail instanceof HTMLInputElement ? createPartnerEmail.value.trim() : "";
  }
  toggleCreateAccountFields();
});

openCreateBtn?.addEventListener("click", () => openCreateDialog());
createCancelBtn?.addEventListener("click", () => closeCreateDialog());
createDialog?.addEventListener("cancel", (e) => {
  e.preventDefault();
  closeCreateDialog();
});

createForm?.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!(createSubmitBtn instanceof HTMLButtonElement)) return;
  const createAccount = createPartnerCreateAccount instanceof HTMLInputElement && createPartnerCreateAccount.checked;
  const partnerEmail = createPartnerEmail instanceof HTMLInputElement ? createPartnerEmail.value.trim() : "";
  const accountEmail =
    createAccount && createAccountEmail instanceof HTMLInputElement
      ? createAccountEmail.value.trim() || partnerEmail
      : partnerEmail;

  if (createAccount) {
    if (!accountEmail || !accountEmail.includes("@")) {
      setPageAlert("계정을 함께 만들 때는 유효한 이메일(파트너 또는 계정 이메일)이 필요합니다.", { error: true });
      return;
    }
    const unRaw =
      createAccountUsername instanceof HTMLInputElement ? createAccountUsername.value.trim().toLowerCase() : "";
    if (unRaw && (unRaw.length < 2 || !/^[-a-zA-Z0-9_.]+$/.test(unRaw))) {
      setPageAlert("로그인 ID는 2자 이상이며 영문·숫자·- _ . 만 사용할 수 있습니다.", { error: true });
      return;
    }
  }

  const modeRaw = createPartnerMode instanceof HTMLSelectElement ? createPartnerMode.value.trim().toUpperCase() : "";
  if (!modeRaw) {
    setPageAlert("파트너 모드(ASSIGNED_ONLY / BIDDING_ONLY)를 선택해 주세요.", { error: true });
    return;
  }
  const payload = {
    partner_type: createPartnerType instanceof HTMLSelectElement ? createPartnerType.value.trim().toUpperCase() : "",
    partner_mode: modeRaw,
    name: createPartnerName instanceof HTMLInputElement ? createPartnerName.value.trim() : "",
    email: createAccount ? accountEmail : partnerEmail || null,
    phone: createPartnerPhone instanceof HTMLInputElement ? createPartnerPhone.value.trim() || null : null,
    state: createPartnerState instanceof HTMLSelectElement ? createPartnerState.value.trim() || null : null,
    city: createPartnerCity instanceof HTMLInputElement ? createPartnerCity.value.trim() || null : null,
    preferred_channel:
      createPartnerPreferredChannel instanceof HTMLSelectElement
        ? createPartnerPreferredChannel.value.trim().toUpperCase()
        : "EMAIL",
    active: true,
    create_account: createAccount,
  };

  if (createAccount) {
    const un =
      createAccountUsername instanceof HTMLInputElement ? createAccountUsername.value.trim().toLowerCase() : "";
    if (un) payload.username = un;
    payload.password = createAccountPassword instanceof HTMLInputElement ? createAccountPassword.value : "";
    const dn = createAccountDisplayName instanceof HTMLInputElement ? createAccountDisplayName.value.trim() : "";
    if (dn) payload.display_name = dn;
  }

  createSubmitBtn.disabled = true;
  setPageAlert("");
  try {
    await adminApi.createPartner(payload);
    closeCreateDialog();
    await loadPartnersTable();
    setPageAlert("파트너를 저장했습니다.");
  } catch (err) {
    setPageAlert(err.message || "저장에 실패했습니다.", { error: true });
  } finally {
    createSubmitBtn.disabled = false;
  }
});

attachCancelBtn?.addEventListener("click", () => closeAttachDialog());
attachDialog?.addEventListener("cancel", (e) => {
  e.preventDefault();
  closeAttachDialog();
});

tbody?.addEventListener("click", async (ev) => {
  const t = ev.target;
  if (!(t instanceof HTMLElement)) return;

  const inviteBtn = t.closest(".js-invite-partner-account");
  if (inviteBtn instanceof HTMLButtonElement) {
    const email = String(inviteBtn.dataset.partnerEmail || "").trim();
    if (!email) {
      setPageAlert("파트너 이메일이 있어야 초대 화면으로 안내할 수 있습니다.", { error: true });
      return;
    }
    window.location.href = `admin-invitations.html?role=partner&prefill_email=${encodeURIComponent(email)}`;
    return;
  }

  const btn = t.closest(".js-attach-account");
  if (!(btn instanceof HTMLButtonElement)) return;
  const id = btn.dataset.partnerId || "";
  const name = btn.dataset.partnerName || "";
  const email = btn.dataset.partnerEmail || "";
  openAttachDialog(id, name, email);
});

attachForm?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const pid = attachPartnerId instanceof HTMLInputElement ? attachPartnerId.value.trim() : "";
  if (!pid || !(attachSubmitBtn instanceof HTMLButtonElement)) return;

  const body = {
    username: attachUsername instanceof HTMLInputElement ? attachUsername.value.trim().toLowerCase() : "",
    password: attachPassword instanceof HTMLInputElement ? attachPassword.value : "",
  };
  const em = attachEmail instanceof HTMLInputElement ? attachEmail.value.trim() : "";
  if (em) body.email = em;
  const dn = attachDisplayName instanceof HTMLInputElement ? attachDisplayName.value.trim() : "";
  if (dn) body.display_name = dn;

  attachSubmitBtn.disabled = true;
  setPageAlert("");
  try {
    await adminApi.attachPartnerAccount(pid, body);
    closeAttachDialog();
    await loadPartnersTable();
    setPageAlert("파트너 계정을 연결했습니다.");
  } catch (err) {
    setPageAlert(err.message || "계정 생성에 실패했습니다.", { error: true });
  } finally {
    attachSubmitBtn.disabled = false;
  }
});

filterPartnerType?.addEventListener("change", () => void loadPartnersTable());
filterActiveOnly?.addEventListener("change", () => void loadPartnersTable());
refreshBtn?.addEventListener("click", () => void loadPartnersTable());

async function init() {
  if (!protectCurrentPage()) return;
  if (!ensureAdminAccess()) return;
  await loadPartnerTypes();
  await loadPartnersTable();
}

void init();
