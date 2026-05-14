import { getCurrentRole, getCurrentUserId } from "../core/auth.js";
import { adminApi, invoiceApi, messagesApi, quoteApi } from "../core/api.js";
import { protectCurrentPage } from "../core/guards.js";
import { canManageLowerTierRole, mayShowAccountDeleteButton } from "../core/role-tiers.js";
import { formatDate, formatMoney } from "../core/utils.js";

const detailAlert = document.getElementById("detailAlert");
const detailCard = document.getElementById("detailCard");
const detailDl = document.getElementById("detailDl");
const dangerZone = document.getElementById("dangerZone");
const detailDeleteBtn = document.getElementById("detailDeleteBtn");

function setAlert(text, { error = false } = {}) {
  if (!detailAlert) return;
  detailAlert.textContent = text;
  detailAlert.classList.toggle("lhai-field-error", Boolean(error) && Boolean(text));
  detailAlert.classList.toggle("lhai-help", !error || !text);
}

function membershipLabel(code) {
  if (code === "active") return "정식 회원";
  if (code === "pending_verification") return "인증 대기";
  return code;
}

/** @param {string | null | undefined} mode */
function partnerWorkflowLabel(mode) {
  const m = String(mode || "").trim().toUpperCase();
  if (m === "BIDDING_ONLY") return "비딩";
  if (m === "ASSIGNED_ONLY") return "고정";
  return "—";
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

async function renderQuotesAndInvoices(customerProfileRef) {
  const quotesCard = document.getElementById("quotesCard");
  const invoicesCard = document.getElementById("invoicesCard");
  const quotesList = document.getElementById("adminUserQuotesList");
  const invoicesList = document.getElementById("adminUserInvoicesList");
  if (!quotesCard || !invoicesCard || !quotesList || !invoicesList) return;
  const ref = String(customerProfileRef || "").trim();
  if (!ref) {
    quotesCard.hidden = true;
    invoicesCard.hidden = true;
    return;
  }
  quotesCard.hidden = false;
  invoicesCard.hidden = false;
  quotesList.innerHTML = `<p class="lhai-help">불러오는 중…</p>`;
  invoicesList.innerHTML = `<p class="lhai-help">불러오는 중…</p>`;
  try {
    const [quotes, invoices] = await Promise.all([quoteApi.list("", ref), invoiceApi.list("", ref)]);
    const qRows = Array.isArray(quotes) ? quotes : [];
    const iRows = Array.isArray(invoices) ? invoices : [];
    qRows.sort((a, b) => {
      const ta = new Date(a.updated_at || a.created_at || 0).getTime();
      const tb = new Date(b.updated_at || b.created_at || 0).getTime();
      return tb - ta;
    });
    iRows.sort((a, b) => {
      const ta = new Date(a.created_at || a.updated_at || 0).getTime();
      const tb = new Date(b.created_at || b.updated_at || 0).getTime();
      return tb - ta;
    });

    if (!qRows.length) {
      quotesList.innerHTML = `<p class="lhai-help">연결된 견적이 없습니다.</p>`;
    } else {
      quotesList.innerHTML = `<ul class="lhai-list">
        ${qRows
          .map((q) => {
            const id = String(q.id || "").trim();
            const href = `admin-quote-prepare.html?id=${encodeURIComponent(id)}`;
            const name = escapeHtml(String(q.customer_display_name || q.service_name || "견적"));
            const svc = escapeHtml(String(q.service_name || "—"));
            const st = escapeHtml(String(q.status || ""));
            const when = escapeHtml(formatDate(q.updated_at || q.created_at));
            return `<li class="lhai-list__item"><a href="${href}"><strong>${name}</strong></a><div class="u-text-muted u-mt-1">${when} · ${svc} · 상태 ${st} · <code>${escapeHtml(id)}</code></div></li>`;
          })
          .join("")}
      </ul>`;
    }

    if (!iRows.length) {
      invoicesList.innerHTML = `<p class="lhai-help">연결된 청구서가 없습니다.</p>`;
    } else {
      invoicesList.innerHTML = `<ul class="lhai-list">
        ${iRows
          .map((inv) => {
            const id = String(inv.id || "").trim();
            const href = `invoice-detail.html?invoice_id=${encodeURIComponent(id)}`;
            const svc = escapeHtml(String(inv.service_name || "—"));
            const st = escapeHtml(String(inv.status || ""));
            const when = escapeHtml(formatDate(inv.created_at || inv.updated_at));
            const cur = String(inv.currency || "USD").trim() || "USD";
            const amt = escapeHtml(formatMoney(Number(inv.amount_due || 0), cur));
            return `<li class="lhai-list__item"><a href="${href}"><strong>${svc}</strong></a><div class="u-text-muted u-mt-1">${when} · ${amt} · 상태 ${st} · <code>${escapeHtml(id)}</code></div></li>`;
          })
          .join("")}
      </ul>`;
    }
  } catch {
    quotesList.innerHTML = `<p class="lhai-field-error">견적 목록을 불러오지 못했습니다.</p>`;
    invoicesList.innerHTML = `<p class="lhai-field-error">청구서 목록을 불러오지 못했습니다.</p>`;
  }
}

async function renderMessageSessions(d) {
  const card = document.getElementById("messageSessionsCard");
  const list = document.getElementById("messageSessionsList");
  if (!card || !list) return;
  const ref = (d.customer_profile_ref || `profile::${d.email}`).trim();
  card.hidden = false;
  list.innerHTML = `<p class="lhai-help">메시지 목록을 불러오는 중…</p>`;
  try {
    const threads = await messagesApi.listThreads({ customerProfileId: ref });
    const base = `messages.html?customer_profile_id=${encodeURIComponent(ref)}`;
    if (!threads.length) {
      list.innerHTML = `
        <p class="lhai-help">아직 메시지 스레드가 없습니다. 시스템 알림 등이 생성되면 여기에 표시됩니다.</p>
        <p class="u-mt-2"><a class="lhai-button lhai-button--secondary" href="${base}">메시지함 열기</a></p>`;
      return;
    }
    list.innerHTML = `
      <ul class="lhai-list">
        ${threads
          .map(
            (t) => `
          <li class="lhai-list__item">
            <a href="${base}&thread_id=${encodeURIComponent(String(t.thread_id))}">
              ${escapeHtml(String(t.title || ""))}
            </a>
            <div class="u-text-muted u-mt-1">${escapeHtml(String(t.preview || "").slice(0, 120))}${t.preview && String(t.preview).length > 120 ? "…" : ""}</div>
            <small class="u-text-muted">${t.unread ? "미읽음 · " : ""}${escapeHtml(String(t.message_type || ""))}</small>
          </li>`
          )
          .join("")}
      </ul>
      <p class="u-mt-2"><a class="lhai-button lhai-button--secondary" href="${base}">전체 메시지함</a></p>`;
  } catch {
    list.innerHTML = `<p class="lhai-field-error">메시지 목록을 불러오지 못했습니다.</p>
      <p class="u-mt-2"><a class="lhai-button lhai-button--secondary" href="messages.html?customer_profile_id=${encodeURIComponent(ref)}">메시지함으로 이동</a></p>`;
  }
}

/** @type {boolean} */
let profileCardEditMode = false;
/** @type {Record<string, unknown> | null} */
let lastServerDetail = null;
/** @type {Array<{ value: string, label: string }> | null} */
let cachedPartnerTypes = null;
/** @type {string} */
let currentAccountId = "";

async function ensurePartnerTypes() {
  if (cachedPartnerTypes !== null) return;
  try {
    const r = await adminApi.listPartnerTypes();
    cachedPartnerTypes = Array.isArray(r?.partner_types) ? r.partner_types : [];
  } catch {
    cachedPartnerTypes = [];
  }
}

function setProfileCardAlert(text, { error = false } = {}) {
  const el = document.getElementById("profileCardAlert");
  if (!el) return;
  el.hidden = !text;
  el.textContent = text;
  el.classList.toggle("lhai-field-error", Boolean(error) && Boolean(text));
  el.classList.toggle("lhai-help", !error || !text);
}

/** @param {Record<string, unknown>} d */
function dobInputValue(d) {
  const raw = d?.date_of_birth;
  if (!raw) return "";
  const s = String(raw);
  return s.length >= 10 ? s.slice(0, 10) : "";
}

/**
 * @param {Record<string, unknown>} d
 * @param {boolean} canEdit
 */
function buildProfileDdHtml(d, canEdit) {
  const profileRef = (d.customer_profile_ref || `profile::${d.email}` || "").trim();
  const roleLower = String(d.role || "").trim().toLowerCase();
  const edit = profileCardEditMode && canEdit;

  /** @type {Array<{ label: string, html: string }>} */
  const chunks = [];

  const pushStatic = (label, viewText) => {
    chunks.push({
      label,
      html: `<dd class="lhai-detail-dl__dd">${escapeHtml(viewText)}</dd>`,
    });
  };

  const pushUsername = () => {
    const v = String(d.username || "").trim();
    pushStatic("아이디", v || "—");
  };

  const pushFullName = () => {
    const v = String(d.full_name || "").trim();
    if (edit) {
      chunks.push({
        label: "이름",
        html: `<dd class="lhai-detail-dl__dd"><input class="lhai-input" type="text" id="profileFld_full_name" autocomplete="name" maxlength="255" value="${escapeHtml(v)}" /></dd>`,
      });
    } else {
      pushStatic("이름", v || "—");
    }
  };

  pushUsername();
  pushFullName();
  pushStatic("이메일", String(d.email || ""));
  pushStatic("고객 프로필 참조", profileRef || "—");
  pushStatic("역할", String(d.role || "—"));

  if (roleLower === "partner") {
    const sub = String(d.sub_role ?? "").trim();
    const code = String(d.partner_catalog_type || "").trim();
    if (edit) {
      const opts = cachedPartnerTypes || [];
      const optHtml = opts
        .map((o) => {
          const sel = o.value === code ? " selected" : "";
          return `<option value="${escapeHtml(o.value)}"${sel}>${escapeHtml(o.label)}</option>`;
        })
        .join("");
      const fallback =
        code && !opts.some((o) => o.value === code)
          ? `<option value="${escapeHtml(code)}" selected>${escapeHtml(code)}</option>`
          : "";
      chunks.push({
        label: "Sub 역할",
        html: `<dd class="lhai-detail-dl__dd"><select class="lhai-select" id="profileFld_partner_catalog_type">${fallback}${optHtml}</select></dd>`,
      });
      const wf = String(d.partner_workflow_mode || "").trim().toUpperCase();
      chunks.push({
        label: "워크플로 유형",
        html: `<dd class="lhai-detail-dl__dd"><select class="lhai-select" id="profileFld_partner_workflow_mode">
            <option value=""${wf === "" ? " selected" : ""}>— (유지)</option>
            <option value="ASSIGNED_ONLY"${wf === "ASSIGNED_ONLY" ? " selected" : ""}>고정</option>
            <option value="BIDDING_ONLY"${wf === "BIDDING_ONLY" ? " selected" : ""}>비딩</option>
          </select></dd>`,
      });
    } else {
      pushStatic("Sub 역할", sub !== "" ? sub : "—");
      pushStatic("워크플로 유형", partnerWorkflowLabel(d.partner_workflow_mode));
    }
  }

  pushStatic("가입 상태", membershipLabel(d.membership_status));
  pushStatic("이메일 인증", d.email_verified ? "완료" : "미완료");
  pushStatic("내부 ID", String(d.id || ""));

  const dobStr = dobInputValue(d);
  if (edit) {
    chunks.push({
      label: "생년월일",
      html: `<dd class="lhai-detail-dl__dd"><input class="lhai-input" type="date" id="profileFld_date_of_birth" value="${escapeHtml(dobStr)}" /></dd>`,
    });
  } else {
    pushStatic("생년월일", d.date_of_birth ? String(d.date_of_birth) : "—");
  }

  const gv = String(d.gender || "unspecified").trim().toLowerCase();
  const gSel = ["male", "female", "other", "unspecified"].includes(gv) ? gv : "unspecified";
  if (edit) {
    chunks.push({
      label: "성별",
      html: `<dd class="lhai-detail-dl__dd"><select class="lhai-select" id="profileFld_gender">
          <option value="male"${gSel === "male" ? " selected" : ""}>male</option>
          <option value="female"${gSel === "female" ? " selected" : ""}>female</option>
          <option value="other"${gSel === "other" ? " selected" : ""}>other</option>
          <option value="unspecified"${gSel === "unspecified" ? " selected" : ""}>unspecified</option>
        </select></dd>`,
    });
  } else {
    pushStatic("성별", String(d.gender || "—"));
  }

  pushStatic("계정 생성 시각", d.created_at ? String(d.created_at) : "—");

  return chunks
    .map(
      (c) =>
        `<div class="lhai-detail-dl__row"><dt class="lhai-detail-dl__dt">${escapeHtml(c.label)}</dt>${c.html}</div>`,
    )
    .join("");
}

/**
 * 프로필 카드 상단: 읽기 모드에서는「수정」만, 편집 모드에서는「저장」「취소」만 보이게 한다.
 * ``[hidden]``은 ``.lhai-button { display: inline-flex }``에 밀릴 수 있어 ``display``로 고정한다.
 * @param {boolean} editing
 */
function setProfileCardToolbarEditing(editing) {
  const editBtn = document.getElementById("profileEditBtn");
  const saveBtn = document.getElementById("profileSaveBtn");
  const cancelBtn = document.getElementById("profileCancelBtn");
  if (editBtn) {
    editBtn.hidden = editing;
    editBtn.style.display = editing ? "none" : "inline-flex";
  }
  if (saveBtn) {
    saveBtn.hidden = !editing;
    saveBtn.style.display = editing ? "inline-flex" : "none";
  }
  if (cancelBtn) {
    cancelBtn.hidden = !editing;
    cancelBtn.style.display = editing ? "inline-flex" : "none";
  }
}

/** @param {Record<string, unknown>} d */
async function renderProfileCard(d) {
  if (!detailDl || !detailCard) return;
  lastServerDetail = d;
  const actor = getCurrentRole();
  const targetRole = String(d.role || "").trim();
  const canEdit = canManageLowerTierRole(actor, targetRole);

  const actions = document.getElementById("profileCardActions");
  const hint = document.getElementById("profileEditHint");

  if (!canEdit) {
    profileCardEditMode = false;
    if (actions) actions.hidden = true;
    if (hint) hint.hidden = true;
  } else {
    if (actions) actions.hidden = false;
    setProfileCardToolbarEditing(profileCardEditMode);
    if (hint) hint.hidden = !profileCardEditMode;
  }

  if (String(d.role || "").trim().toLowerCase() === "partner" && profileCardEditMode && canEdit) {
    await ensurePartnerTypes();
  }

  detailDl.innerHTML = buildProfileDdHtml(d, canEdit);
  detailCard.hidden = false;
}

async function saveProfileFromCard() {
  const id = currentAccountId;
  const d = lastServerDetail;
  if (!id || !d) return;
  const roleLower = String(d.role || "").trim().toLowerCase();

  const fn = document.getElementById("profileFld_full_name");
  const dob = document.getElementById("profileFld_date_of_birth");
  const g = document.getElementById("profileFld_gender");
  if (!fn || !dob || !g) return;

  /** @type {Record<string, string>} */
  const patch = {
    full_name: fn.value.trim(),
    gender: g.value,
  };
  const dobVal = dob.value.trim();
  if (dobVal) patch.date_of_birth = dobVal;

  if (roleLower === "partner") {
    const ptEl = document.getElementById("profileFld_partner_catalog_type");
    const wfEl = document.getElementById("profileFld_partner_workflow_mode");
    const pt = ptEl?.value?.trim();
    if (!pt) {
      setProfileCardAlert("Sub 역할(파트너 유형)을 선택하세요.", { error: true });
      return;
    }
    patch.partner_catalog_type = pt;
    const wf = wfEl?.value?.trim();
    if (wf) patch.partner_workflow_mode = wf;
  }

  const saveBtn = document.getElementById("profileSaveBtn");
  saveBtn && (saveBtn.disabled = true);
  setProfileCardAlert("저장 중…");
  try {
    await adminApi.patchAuthAccountRegistration(id, patch);
    profileCardEditMode = false;
    setProfileCardAlert("저장했습니다.");
    const d2 = await adminApi.getAuthAccount(id);
    await renderProfileCard(d2);
    setupRegistrationEdit(id, d2);
    setupDeleteZone(id, d2);
  } catch (e) {
    setProfileCardAlert(`저장 실패: ${e.message || e}`, { error: true });
  } finally {
    saveBtn && (saveBtn.disabled = false);
  }
}

function bindProfileCardActionsOnce() {
  if (document.body.dataset.profileCardActionsBound === "1") return;
  document.body.dataset.profileCardActionsBound = "1";
  document.getElementById("profileEditBtn")?.addEventListener("click", async () => {
    setProfileCardAlert("");
    profileCardEditMode = true;
    if (lastServerDetail) await renderProfileCard(lastServerDetail);
  });
  document.getElementById("profileCancelBtn")?.addEventListener("click", async () => {
    setProfileCardAlert("");
    profileCardEditMode = false;
    if (lastServerDetail) await renderProfileCard(lastServerDetail);
  });
  document.getElementById("profileSaveBtn")?.addEventListener("click", () => void saveProfileFromCard());
}

function setRegEditAlert(text, { error = false } = {}) {
  const regEditAlert = document.getElementById("regEditAlert");
  if (!regEditAlert) return;
  regEditAlert.hidden = !text;
  regEditAlert.textContent = text;
  regEditAlert.classList.toggle("lhai-field-error", Boolean(error) && Boolean(text));
  regEditAlert.classList.toggle("lhai-help", !error || !text);
}

function setupRegistrationEdit(accountId, d) {
  const card = document.getElementById("registrationEditCard");
  const form = document.getElementById("registrationEditForm");
  const ev = document.getElementById("regEditEmailVerified");
  const ms = document.getElementById("regEditMembership");
  const submitBtn = document.getElementById("regEditSubmitBtn");
  if (!card || !form || !ev || !ms) return;

  const actor = getCurrentRole();
  const targetRole = String(d.role || "").trim();
  if (!canManageLowerTierRole(actor, targetRole)) {
    card.hidden = true;
    return;
  }

  card.hidden = false;
  ev.value = d.email_verified ? "true" : "false";
  ms.value = d.membership_status === "active" ? "active" : "pending_verification";
  setRegEditAlert("");

  if (form.dataset.regEditBound !== "1") {
    form.dataset.regEditBound = "1";
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const id = form.dataset.accountId;
      if (!id) return;
      const emailVerifiedEl = document.getElementById("regEditEmailVerified");
      const membershipEl = document.getElementById("regEditMembership");
      const btn = document.getElementById("regEditSubmitBtn");
      if (!emailVerifiedEl || !membershipEl) return;
      const patch = {
        email_verified: emailVerifiedEl.value === "true",
        membership_status: membershipEl.value,
      };
      btn && (btn.disabled = true);
      setRegEditAlert("저장 중…");
      try {
        await adminApi.patchAuthAccountRegistration(id, patch);
        setRegEditAlert("저장했습니다.");
        const d2 = await adminApi.getAuthAccount(id);
        profileCardEditMode = false;
        await renderProfileCard(d2);
        emailVerifiedEl.value = d2.email_verified ? "true" : "false";
        membershipEl.value = d2.membership_status === "active" ? "active" : "pending_verification";
        const pr2 = (d2.customer_profile_ref || `profile::${d2.email}` || "").trim();
        void renderQuotesAndInvoices(pr2);
        void renderMessageSessions(d2);
        setupDeleteZone(id, d2);
      } catch (e) {
        setRegEditAlert(`저장 실패: ${e.message || e}`, { error: true });
      } finally {
        btn && (btn.disabled = false);
      }
    });
  }
  form.dataset.accountId = accountId;
  submitBtn && (submitBtn.disabled = false);
}

function setupDeleteZone(accountId, d) {
  if (!dangerZone || !detailDeleteBtn) return;
  const actor = getCurrentRole();
  const targetRole = String(d.role || "").trim();
  if (!mayShowAccountDeleteButton(actor, targetRole)) {
    dangerZone.hidden = true;
    return;
  }
  const myId = getCurrentUserId();
  if (myId && String(accountId || "").trim() === myId) {
    dangerZone.hidden = true;
    return;
  }
  dangerZone.hidden = false;
  detailDeleteBtn.disabled = false;
  detailDeleteBtn.title = "";

  detailDeleteBtn.onclick = async () => {
    const msg = [
      "이 계정을 삭제할까요? 되돌릴 수 없습니다.",
      `· 아이디: ${d.username || "—"}`,
      `· 이메일: ${d.email}`,
    ].join("\n");
    if (!window.confirm(msg)) return;
    detailDeleteBtn.disabled = true;
    setAlert("삭제 중…");
    try {
      await adminApi.deleteAuthAccount(accountId);
      window.location.href = "admin-users.html";
    } catch (e) {
      setAlert(`삭제 실패: ${e.message || e}`, { error: true });
      detailDeleteBtn.disabled = false;
    }
  };
}

async function main() {
  if (!protectCurrentPage()) return;
  bindProfileCardActionsOnce();
  const id = new URLSearchParams(window.location.search).get("id");
  if (!id || !id.trim()) {
    setAlert("주소에 계정 id가 없습니다. 회원 목록에서 아이디를 눌러 들어오세요.", { error: true });
    return;
  }
  const accountId = id.trim();
  currentAccountId = accountId;
  profileCardEditMode = false;
  cachedPartnerTypes = null;
  setAlert("불러오는 중…");
  try {
    const d = await adminApi.getAuthAccount(accountId);
    const profileRef = (d.customer_profile_ref || `profile::${d.email}` || "").trim();
    setAlert("");
    const readOnlyHint = document.getElementById("detailReadOnlyHint");
    if (readOnlyHint) {
      const actor = getCurrentRole();
      const targetRole = String(d.role || "").trim();
      readOnlyHint.hidden = !targetRole || canManageLowerTierRole(actor, targetRole);
    }
    await renderProfileCard(d);
    setupRegistrationEdit(accountId, d);
    await renderMessageSessions(d);
    await renderQuotesAndInvoices(profileRef);
    setupDeleteZone(accountId, d);
  } catch (e) {
    setAlert(`불러오지 못했습니다. ${e.message || e}`, { error: true });
  }
}

void main();
