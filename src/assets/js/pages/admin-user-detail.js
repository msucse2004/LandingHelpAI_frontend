import { adminApi } from "../core/api.js";
import { protectCurrentPage } from "../core/guards.js";

const detailAlert = document.getElementById("detailAlert");
const detailCard = document.getElementById("detailCard");
const detailDl = document.getElementById("detailDl");
const dangerZone = document.getElementById("dangerZone");
const detailDeleteBtn = document.getElementById("detailDeleteBtn");

const DEMO_SEED_EMAILS = new Set([
  "demo.customer@landinghelp.ai",
  "demo.admin@landinghelp.ai",
  "demo.supervisor@landinghelp.ai",
]);

function isDemoSeedEmail(email) {
  return DEMO_SEED_EMAILS.has(String(email || "").trim().toLowerCase());
}

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

function renderDetail(d) {
  if (!detailDl || !detailCard) return;
  const rows = [
    ["아이디", d.username || "—"],
    ["이름", d.full_name || "—"],
    ["이메일", d.email],
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

function setupDeleteZone(accountId, d) {
  if (!dangerZone || !detailDeleteBtn) return;
  const demo = isDemoSeedEmail(d.email);
  dangerZone.hidden = false;
  detailDeleteBtn.disabled = demo;
  detailDeleteBtn.title = demo ? "데모 시드 계정은 삭제할 수 없습니다." : "";

  detailDeleteBtn.onclick = async () => {
    if (demo) return;
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
      detailDeleteBtn.disabled = demo;
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
    setAlert("");
    renderDetail(d);
    setupDeleteZone(accountId, d);
  } catch (e) {
    setAlert(`불러오지 못했습니다. ${e.message || e}`, { error: true });
  }
}

void main();
