import { authApi } from "../core/api.js";

const form = document.getElementById("verifyEmailForm");
const statusEl = document.getElementById("verifyStatus");
const tokenInput = document.getElementById("token");
const verifyResultDialog = document.getElementById("verifyResultDialog");
const verifyResultTitle = document.getElementById("verifyResultTitle");
const verifyResultBody = document.getElementById("verifyResultBody");
const verifyResultCloseBtn = document.getElementById("verifyResultCloseBtn");

const params = new URLSearchParams(window.location.search);
const tokenFromUrl = params.get("token");
if (tokenInput && tokenFromUrl) {
  tokenInput.value = tokenFromUrl;
}

let verifySubmitInFlight = false;
/** 확인으로 다이얼로그를 닫을 때 로그인으로 이동 */
let verifyRedirectToLoginOnClose = false;

function setStatus(message) {
  if (statusEl) statusEl.textContent = message;
}

/**
 * @param {{ title: string, paragraphs: string[], variant?: "success"|"error", redirectToLoginAfterClose?: boolean }} spec
 */
function openVerifyOutcomeDialog(spec) {
  if (!verifyResultDialog || !verifyResultTitle || !verifyResultBody) return;
  const { title, paragraphs, variant = "success", redirectToLoginAfterClose = false } = spec;
  verifyRedirectToLoginOnClose = Boolean(redirectToLoginAfterClose);
  verifyResultTitle.textContent = title;
  verifyResultBody.replaceChildren();
  for (const line of paragraphs) {
    const p = document.createElement("p");
    p.textContent = line;
    verifyResultBody.appendChild(p);
  }
  verifyResultDialog.classList.toggle("lhai-dialog--error", variant === "error");
  verifyResultDialog.showModal();
  queueMicrotask(() => verifyResultCloseBtn?.focus());
}

if (verifyResultDialog) {
  verifyResultDialog.addEventListener("close", () => {
    if (!verifyRedirectToLoginOnClose) return;
    verifyRedirectToLoginOnClose = false;
    window.location.assign("login.html");
  });
}

if (form) {
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (verifySubmitInFlight) {
      return;
    }
    const formData = new FormData(form);
    const token = String(formData.get("token") || "").trim();
    if (!token) {
      setStatus("토큰을 입력하세요.");
      return;
    }

    verifySubmitInFlight = true;
    const submitBtn = form.querySelector('button[type="submit"]');
    if (submitBtn) submitBtn.disabled = true;
    try {
      setStatus("인증 처리 중…");
      const result = await authApi.verifyEmail({ token });
      setStatus("");
      if (result.verified) {
        openVerifyOutcomeDialog({
          title: "🎉 이메일 인증이 완료되었습니다",
          paragraphs: [
            "✨ 이제 이메일이 확인되어 정식 회원으로 이용을 시작하실 수 있습니다.",
            "🔑 확인을 누르시면 로그인 페이지로 이동합니다. 등록하신 아이디와 비밀번호로 로그인해 주세요.",
          ],
          variant: "success",
          redirectToLoginAfterClose: true,
        });
      } else {
        openVerifyOutcomeDialog({
          title: "😔 인증에 실패했습니다",
          paragraphs: [
            "토큰이 올바르지 않거나 이미 사용된 링크일 수 있습니다.",
            "가입 확인 메일의 링크를 다시 열거나, 토큰을 복사해 붙여 넣은 뒤 다시 시도해 주세요.",
          ],
          variant: "error",
          redirectToLoginAfterClose: false,
        });
      }
    } catch (error) {
      setStatus("");
      openVerifyOutcomeDialog({
        title: "😔 인증을 완료할 수 없습니다",
        paragraphs: [
          `❗ ${String(error?.message || error || "알 수 없는 오류가 발생했습니다.")}`,
          "📝 잠시 후 다시 시도하시거나, 네트워크와 토큰을 확인해 주세요.",
        ],
        variant: "error",
        redirectToLoginAfterClose: false,
      });
    } finally {
      verifySubmitInFlight = false;
      if (submitBtn) submitBtn.disabled = false;
    }
  });
}
