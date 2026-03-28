import { getAccessToken } from "../core/auth.js";
import { adminApi } from "../core/api.js";
import { protectCurrentPage } from "../core/guards.js";

const form = document.getElementById("inviteForm");
const roleSelect = document.getElementById("inviteRole");
const pageAlert = document.getElementById("pageAlert");
const rolesLoadStatus = document.getElementById("rolesLoadStatus");
const submitBtn = document.getElementById("inviteSubmitBtn");
const resultSection = document.getElementById("inviteResultSection");
const resultBody = document.getElementById("inviteResultBody");
const resultMeta = document.getElementById("inviteResultMeta");
const inviteErrorDialog = document.getElementById("inviteErrorDialog");
const inviteErrorTitle = document.getElementById("inviteErrorTitle");
const inviteErrorBody = document.getElementById("inviteErrorBody");
const inviteErrorCloseBtn = document.getElementById("inviteErrorCloseBtn");

/**
 * @param {string} title
 * @param {string[]} paragraphs
 */
function openInviteErrorDialog(title, paragraphs) {
  if (!inviteErrorDialog || !inviteErrorTitle || !inviteErrorBody) return;
  inviteErrorTitle.textContent = title;
  inviteErrorBody.replaceChildren();
  const lines = paragraphs.filter((x) => String(x || "").trim());
  for (const line of lines.length ? lines : ["자세한 원인을 알 수 없습니다."]) {
    const p = document.createElement("p");
    p.textContent = line;
    inviteErrorBody.appendChild(p);
  }
  inviteErrorDialog.showModal();
  queueMicrotask(() => inviteErrorCloseBtn?.focus());
}

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

if (protectCurrentPage() && form) {
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    setPageAlert("");
    if (resultSection) resultSection.hidden = true;
    const fd = new FormData(form);
    const email = String(fd.get("inviteEmail") || "").trim();
    const role_name = String(fd.get("inviteRole") || "").trim();
    const personal_message = String(fd.get("personalMessage") || "").trim();
    if (!email || !role_name) {
      const msg = "받는 사람 이메일과 부여할 역할을 모두 입력·선택해 주세요.";
      setPageAlert(msg, { error: true });
      openInviteErrorDialog("초대를 보낼 수 없습니다", [msg]);
      return;
    }
    if (!getAccessToken()?.trim()) {
      setPageAlert("로그인이 필요합니다. 다시 로그인한 뒤 초대 메일을 보내 주세요.", { error: true });
      openInviteErrorDialog("초대를 보낼 수 없습니다", [
        "액세스 토큰이 없습니다.",
        "로그아웃 후 다시 로그인하면 토큰이 갱신됩니다.",
      ]);
      return;
    }
    submitBtn && (submitBtn.disabled = true);
    try {
      const data = await adminApi.sendMemberInvitation({
        email,
        role_name,
        personal_message,
      });
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
      const raw = e && typeof e.message === "string" ? e.message : String(e || "알 수 없는 오류가 발생했습니다.");
      setPageAlert(`전송 실패: ${raw}`, { error: true });
      const hint =
        /Failed to fetch|NetworkError|Load failed|fetch/i.test(raw) || !raw.trim()
          ? "브라우저가 서버에 연결하지 못했습니다. 백엔드 실행 여부, API 주소(필요 시 window.LHAI_API_BASE_URL), CORS 설정을 확인해 주세요."
          : "위 문구는 서버 또는 클라이언트가 알려준 원인입니다. 권한·세션 문제면 로그아웃 후 다시 로그인해 보세요.";
      openInviteErrorDialog("초대 메일을 보낼 수 없습니다", [raw, hint]);
    } finally {
      submitBtn && (submitBtn.disabled = false);
    }
  });
  void loadRoles();
}
