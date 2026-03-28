import { adminApi } from "../core/api.js";

const form = document.getElementById("inviteForm");
const roleSelect = document.getElementById("inviteRole");
const pageAlert = document.getElementById("pageAlert");
const rolesLoadStatus = document.getElementById("rolesLoadStatus");
const submitBtn = document.getElementById("inviteSubmitBtn");
const resultSection = document.getElementById("inviteResultSection");
const resultBody = document.getElementById("inviteResultBody");
const resultMeta = document.getElementById("inviteResultMeta");

function setPageAlert(text, { error = false } = {}) {
  if (!pageAlert) return;
  pageAlert.textContent = text;
  pageAlert.classList.toggle("lhai-field-error", Boolean(error) && Boolean(text));
  pageAlert.classList.toggle("lhai-help", !error || !text);
}

function setRolesLoadStatus(text) {
  if (rolesLoadStatus) rolesLoadStatus.textContent = text;
}

function formatExpiresAt(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("ko-KR", { dateStyle: "medium", timeStyle: "short" });
}

async function loadRoles() {
  if (!roleSelect) return;
  setRolesLoadStatus("역할 목록을 불러오는 중…");
  try {
    const rows = await adminApi.listInvitableRoles();
    if (!Array.isArray(rows) || rows.length === 0) {
      setRolesLoadStatus("");
      setPageAlert("역할 목록을 불러오지 못했습니다. API 서버가 켜져 있는지와 주소 설정을 확인하세요.", { error: true });
      roleSelect.innerHTML = '<option value="">불러오기 실패</option>';
      roleSelect.disabled = true;
      submitBtn && (submitBtn.disabled = true);
      return;
    }
    roleSelect.innerHTML = "";
    for (const r of rows) {
      const opt = document.createElement("option");
      opt.value = r.code;
      opt.textContent = `${r.label_ko} (${r.code})`;
      roleSelect.appendChild(opt);
    }
    roleSelect.disabled = false;
    roleSelect.removeAttribute("aria-busy");
    setRolesLoadStatus(`${rows.length}개 역할을 불러왔습니다.`);
    setPageAlert("");
  } catch (e) {
    setRolesLoadStatus("");
    setPageAlert(`역할 목록 오류: ${e.message || e}`, { error: true });
    roleSelect.innerHTML = '<option value="">오류</option>';
    roleSelect.disabled = true;
    submitBtn && (submitBtn.disabled = true);
  }
}

if (form) {
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    setPageAlert("");
    if (resultSection) resultSection.hidden = true;
    const fd = new FormData(form);
    const email = String(fd.get("inviteEmail") || "").trim();
    const role_name = String(fd.get("inviteRole") || "").trim();
    const personal_message = String(fd.get("personalMessage") || "").trim();
    if (!email || !role_name) {
      setPageAlert("이메일과 역할을 모두 선택해 주세요.", { error: true });
      return;
    }
    submitBtn && (submitBtn.disabled = true);
    try {
      const data = await adminApi.sendMemberInvitation({ email, role_name, personal_message });
      const sent = data.invitation_email_sent !== false;
      if (resultSection) resultSection.hidden = false;
      if (resultBody) {
        resultBody.textContent = data.message || (sent ? "초대 메일을 보냈습니다." : "초대는 저장되었으나 메일 발송에 실패했을 수 있습니다.");
      }
      if (resultMeta) {
        resultMeta.innerHTML = `대상: <strong>${email}</strong> · 역할: <strong>${data.role_name}</strong> · 링크 만료(참고): ${formatExpiresAt(data.expires_at)} · 메일 발송: <strong>${sent ? "예" : "아니오(서버 SMTP 확인)"}</strong>`;
      }
      form.reset();
      await loadRoles();
    } catch (e) {
      setPageAlert(`전송 실패: ${e.message || e}`, { error: true });
    } finally {
      submitBtn && (submitBtn.disabled = false);
    }
  });
}

void loadRoles();
