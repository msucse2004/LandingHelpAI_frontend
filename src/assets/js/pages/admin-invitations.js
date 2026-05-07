import { getAccessToken } from "../core/auth.js";
import { adminApi } from "../core/api.js";
import { protectCurrentPage } from "../core/guards.js";
import { t } from "../core/i18n-client.js";
import { normalizePartnerTypesFromApi, partnerTypeOptionDisplayText } from "./admin-partner-type-options.js";

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
const invitePartnerFields = document.getElementById("invitePartnerFields");
const invitePartnerType = document.getElementById("invitePartnerType");
const invitePreferredChannel = document.getElementById("invitePreferredChannel");
const inviteEmail = document.getElementById("inviteEmail");
const inviteSignupUrlWrap = document.getElementById("inviteSignupUrlWrap");
const inviteSignupUrlLink = document.getElementById("inviteSignupUrlLink");
const inviteSignupUrlWarnLoopback = document.getElementById("inviteSignupUrlWarnLoopback");

/** 파트너 유형 허용 집합은 GET /api/admin/partners/types 응답(DB 기반)으로만 채운다. */
/** @type {Set<string>} */
let allowedPartnerTypeValues = new Set();

let inviteRoleChangeBound = false;

/** @type {Promise<Array<{ value: string, label: string }>> | null} */
let partnerTypesLoadPromise = null;

function getPartnerTypesLoadPromise() {
  if (!partnerTypesLoadPromise) {
    partnerTypesLoadPromise = adminApi
      .listPartnerTypes()
      .then((data) => {
        const opts = normalizePartnerTypesFromApi(data);
        allowedPartnerTypeValues = new Set(opts.map((o) => o.value));
        return opts;
      })
      .catch(() => {
        allowedPartnerTypeValues = new Set();
        partnerTypesLoadPromise = null;
        return [];
      });
  }
  return partnerTypesLoadPromise;
}

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

function isPartnerRoleSelected() {
  return roleSelect instanceof HTMLSelectElement && String(roleSelect.value || "").trim().toLowerCase() === "partner";
}

function fillPartnerTypeSelect(opts) {
  if (!(invitePartnerType instanceof HTMLSelectElement)) return;
  const ph = t("common.admin_services.workflow.partner_type.placeholder", "선택…");
  invitePartnerType.innerHTML = "";
  const phOpt = document.createElement("option");
  phOpt.value = "";
  phOpt.textContent = ph;
  invitePartnerType.appendChild(phOpt);
  for (const o of opts) {
    const opt = document.createElement("option");
    opt.value = String(o.value || "").trim();
    opt.textContent = partnerTypeOptionDisplayText(o);
    invitePartnerType.appendChild(opt);
  }
}

async function ensurePartnerTypeOptionsLoaded() {
  if (!(invitePartnerType instanceof HTMLSelectElement)) return;
  invitePartnerType.innerHTML = `<option value="">${t(
    "common.admin_invitations.partner_type.loading_option",
    "불러오는 중…",
  )}</option>`;
  try {
    const opts = await getPartnerTypesLoadPromise();
    fillPartnerTypeSelect(opts);
    if (allowedPartnerTypeValues.size === 0) {
      setPageAlert(
        t(
          "common.admin_invitations.partner_type.empty_list",
          "파트너 유형 목록이 비어 있습니다. GET /api/admin/partners/types 응답과 서버 설정을 확인해 주세요.",
        ),
        { error: true },
      );
    }
  } catch {
    allowedPartnerTypeValues = new Set();
    fillPartnerTypeSelect([]);
    setPageAlert(
      t(
        "common.admin_invitations.partner_type.load_failed",
        "파트너 유형 목록을 불러오지 못했습니다. 네트워크·인증·서버 설정을 확인해 주세요.",
      ),
      { error: true },
    );
  }
}

function clearPartnerFields() {
  if (invitePartnerType instanceof HTMLSelectElement) invitePartnerType.selectedIndex = 0;
  if (invitePreferredChannel instanceof HTMLSelectElement) {
    invitePreferredChannel.value = "BOTH";
  }
}

function syncInvitePartnerFieldsVisibility() {
  if (!invitePartnerFields || !(roleSelect instanceof HTMLSelectElement)) return;
  const on = isPartnerRoleSelected();
  invitePartnerFields.style.display = on ? "block" : "none";
  if (!on) {
    clearPartnerFields();
  } else {
    void ensurePartnerTypeOptionsLoaded();
  }
}

function applyPreselectedRoleFromUrl() {
  try {
    const params = new URLSearchParams(window.location.search);
    const pre = params.get("role");
    if (pre && roleSelect instanceof HTMLSelectElement) {
      const want = String(pre).trim().toLowerCase();
      const opt = Array.from(roleSelect.options).find((o) => String(o.value || "").trim().toLowerCase() === want);
      if (opt) {
        roleSelect.value = opt.value;
        syncInvitePartnerFieldsVisibility();
      }
    }
    const pe = params.get("prefill_email");
    if (pe && inviteEmail instanceof HTMLInputElement) {
      inviteEmail.value = String(pe).trim();
    }
  } catch {
    /* ignore */
  }
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
    if (!inviteRoleChangeBound) {
      inviteRoleChangeBound = true;
      roleSelect.addEventListener("change", () => syncInvitePartnerFieldsVisibility());
    }
    setRolesLoadStatus(`${rows.length}개 역할을 불러왔습니다.`);
    setPageAlert("");
    void getPartnerTypesLoadPromise().then((opts) => {
      if (isPartnerRoleSelected() && invitePartnerType instanceof HTMLSelectElement) {
        fillPartnerTypeSelect(opts);
      }
    });
    syncInvitePartnerFieldsVisibility();
    applyPreselectedRoleFromUrl();
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
    const partner_type = String(fd.get("invitePartnerType") || "").trim();
    const preferred_channel =
      invitePreferredChannel instanceof HTMLSelectElement
        ? String(invitePreferredChannel.value || "").trim()
        : "BOTH";

    if (!email || !role_name) {
      const msg = "받는 사람 이메일과 부여할 역할을 모두 입력·선택해 주세요.";
      setPageAlert(msg, { error: true });
      openInviteErrorDialog("초대를 보낼 수 없습니다", [msg]);
      return;
    }

    const rn = String(role_name).trim().toLowerCase();
    if (rn === "partner") {
      if (!partner_type) {
        const msg = t("common.admin_invitations.partner_type.required", "파트너 역할/유형을 선택해 주세요.");
        setPageAlert(msg, { error: true });
        openInviteErrorDialog("초대를 보낼 수 없습니다", [msg]);
        return;
      }
      if (allowedPartnerTypeValues.size === 0) {
        const msg = t(
          "common.admin_invitations.partner_type.empty_before_send",
          "파트너 유형 목록이 비어 있습니다. GET /api/admin/partners/types 가 정상인지 확인한 뒤 페이지를 새로고침해 주세요.",
        );
        setPageAlert(msg, { error: true });
        openInviteErrorDialog("초대를 보낼 수 없습니다", [msg]);
        return;
      }
      if (!allowedPartnerTypeValues.has(partner_type)) {
        const msg = t(
          "common.admin_invitations.partner_type.not_allowed",
          "허용되지 않은 파트너 유형입니다. 목록을 새로고침한 뒤 다시 선택해 주세요.",
        );
        setPageAlert(msg, { error: true });
        openInviteErrorDialog("초대를 보낼 수 없습니다", [msg]);
        return;
      }
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
    if (inviteSignupUrlWrap) inviteSignupUrlWrap.hidden = true;
    if (inviteSignupUrlWarnLoopback) inviteSignupUrlWarnLoopback.hidden = true;
    try {
      /** @type {Record<string, unknown>} */
      const payload = {
        email,
        role_name,
        personal_message,
      };
      if (rn === "partner") {
        payload.partner_type = partner_type;
        payload.preferred_channel = preferred_channel || "BOTH";
      }
      const data = await adminApi.sendMemberInvitation(payload);
      const sent = data.invitation_email_sent !== false;
      if (resultSection) resultSection.hidden = false;
      if (resultBody) {
        resultBody.textContent =
          data.message || (sent ? "초대 메일을 보냈습니다." : "초대는 저장되었으나 메일 발송에 실패했을 수 있습니다.");
      }
      if (resultMeta) {
        const pt = data.partner_type ? ` · 파트너 유형: <strong>${data.partner_type}</strong>` : "";
        resultMeta.innerHTML = `대상: <strong>${escapeHtmlMeta(email)}</strong> · 역할: <strong>${escapeHtmlMeta(
          data.role_name || role_name,
        )}</strong>${pt} · 링크 만료(참고): ${formatExpiresAt(data.expires_at)} · 메일 발송: <strong>${
          sent ? "예" : "아니오(서버 SMTP 확인)"
        }</strong>`;
      }
      const su = typeof data.signup_url === "string" ? data.signup_url.trim() : "";
      if (su && inviteSignupUrlWrap && inviteSignupUrlLink instanceof HTMLAnchorElement) {
        inviteSignupUrlWrap.hidden = false;
        inviteSignupUrlLink.href = su;
        inviteSignupUrlLink.textContent = su;
        const loop = /127\.0\.0\.1(\b|:|$)/i.test(su) || /localhost(\b|:|$)/i.test(su);
        if (inviteSignupUrlWarnLoopback) inviteSignupUrlWarnLoopback.hidden = !loop;
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

/** @param {string} s */
function escapeHtmlMeta(s) {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/"/g, "&quot;");
}
