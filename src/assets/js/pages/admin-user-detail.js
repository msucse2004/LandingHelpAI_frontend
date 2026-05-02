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

function renderDetail(d) {
  if (!detailDl || !detailCard) return;
  const profileRef = (d.customer_profile_ref || `profile::${d.email}` || "").trim();
  const rows = [
    ["아이디", d.username || "—"],
    ["이름", d.full_name || "—"],
    ["이메일", d.email],
    ["고객 프로필 참조", profileRef || "—"],
    ["역할", d.role],
    ["가입 상태", membershipLabel(d.membership_status)],
    ["이메일 인증", d.email_verified ? "완료" : "미완료"],
    ["내부 ID", d.id],
    ["생년월일", d.date_of_birth || "—"],
    ["성별", d.gender || "—"],
    ["계정 생성 시각", d.created_at || "—"],
  ];
  detailDl.innerHTML = rows
    .map(
      ([k, v]) =>
        `<div class="lhai-detail-dl__row"><dt class="lhai-detail-dl__dt">${escapeHtml(k)}</dt><dd class="lhai-detail-dl__dd">${escapeHtml(v)}</dd></div>`,
    )
    .join("");
  detailCard.hidden = false;
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
        renderDetail(d2);
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
  const id = new URLSearchParams(window.location.search).get("id");
  if (!id || !id.trim()) {
    setAlert("주소에 계정 id가 없습니다. 회원 목록에서 아이디를 눌러 들어오세요.", { error: true });
    return;
  }
  const accountId = id.trim();
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
    renderDetail(d);
    setupRegistrationEdit(accountId, d);
    await renderMessageSessions(d);
    await renderQuotesAndInvoices(profileRef);
    setupDeleteZone(accountId, d);
  } catch (e) {
    setAlert(`불러오지 못했습니다. ${e.message || e}`, { error: true });
  }
}

void main();
