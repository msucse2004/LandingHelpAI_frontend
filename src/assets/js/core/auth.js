import { ROLES } from "./config.js";
import { debugDashboard, isPartnerDashboardDebugEnabled } from "./partner-dashboard-debug.js";
import { applyLoginPreferredLanguage, resolveAccountPreferredLanguageCode } from "./preferred-language.js";

const TOKEN_KEY = "lhai_access_token";
const SESSION_KEY = "lhai_session";

/**
 * Session shape:
 * { userId: string, role: string, email: string, username?: string, preferred_language_code?: string }
 */
function getSession() {
  const raw = window.localStorage.getItem(SESSION_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/** API·레거시 세션과 맞추기: 소문자, 하이픈→밑줄 (hasRole / 배지와 일치) */
function normalizeRole(role) {
  if (role == null || String(role).trim() === "") return ROLES.CUSTOMER;
  return String(role).trim().toLowerCase().replace(/-/g, "_");
}

function setSession(session) {
  const payload = { ...session };
  if (payload.role != null && String(payload.role).trim() !== "") {
    payload.role = normalizeRole(payload.role);
  }
  const langRaw =
    payload.preferred_language_code != null
      ? payload.preferred_language_code
      : payload.preferredLanguage;
  if (langRaw != null && String(langRaw).trim() !== "") {
    payload.preferred_language_code = resolveAccountPreferredLanguageCode(langRaw);
    delete payload.preferredLanguage;
  }
  window.localStorage.setItem(SESSION_KEY, JSON.stringify(payload));
}

/**
 * Update ``preferred_language_code`` on the authenticated session (validated supported code).
 * @param {string | null | undefined} code
 * @returns {boolean}
 */
function updateSessionPreferredLanguage(code) {
  try {
    const session = getSession();
    if (!session || typeof session !== "object") return false;
    setSession({
      ...session,
      preferred_language_code: resolveAccountPreferredLanguageCode(code),
    });
    return true;
  } catch {
    return false;
  }
}

function clearSession() {
  window.localStorage.removeItem(SESSION_KEY);
}

function getAccessToken() {
  return window.localStorage.getItem(TOKEN_KEY);
}

function setAccessToken(token) {
  window.localStorage.setItem(TOKEN_KEY, token);
}

function clearAccessToken() {
  window.localStorage.removeItem(TOKEN_KEY);
}

function getCurrentRole() {
  const raw = getSession()?.role;
  if (raw == null || String(raw).trim() === "") return ROLES.CUSTOMER;
  return normalizeRole(raw);
}

/** 로그인 후 세션에 저장된 계정 ID(없으면 빈 문자열). */
function getCurrentUserId() {
  const id = getSession()?.userId;
  if (id == null || String(id).trim() === "") return "";
  return String(id).trim();
}

function isAuthenticated() {
  return Boolean(getAccessToken());
}

/** 파트너 대시보드 디버그 플래그가 켜진 경우에만 auth 관련 phase 로그(토큰·이메일 값은 넣지 않음). */
export function emitPartnerDashboardAuthDebug(phase, payload) {
  if (!isPartnerDashboardDebugEnabled()) return;
  const p = payload && typeof payload === "object" ? payload : {};
  debugDashboard(phase, p);
}

/**
 * 설문 제출·메시지함·헤더 배지가 같은 고객을 가리키도록 동일한 식별자를 씁니다.
 * - 세션 이메일이 있으면 `profile::` + 소문자 이메일
 * - 이메일이 없고 userId가 있으면 그대로(백엔드에 저장된 customer_profile_id와 맞춤)
 * - 둘 다 없으면 데모용 `profile::demo@customer.com`
 */
function getCustomerMessagingProfileId() {
  const s = getSession();
  const email = (s?.email || "").trim().toLowerCase();
  if (email) return `profile::${email}`;
  const uid = s?.userId != null ? String(s.userId).trim() : "";
  if (uid) return uid;
  return "profile::demo@customer.com";
}

/** Clears stored token/session and sends the user to the login page. */
function logout() {
  try {
    void import("./realtime-client.js").then((m) => {
      if (typeof m.stopRealtimeClient === "function") m.stopRealtimeClient();
    });
  } catch {
    /* ignore */
  }
  clearAccessToken();
  clearSession();
  window.location.href = "login.html";
}

/**
 * Apply POST /api/auth/login response: token + session only.
 * Account ``preferred_language_code`` from the login API becomes the session language.
 * Guest ``lhai_preferred_language`` remains in localStorage for logged-out pages only.
 * @param {object} result
 * @returns {{ preferredLanguageCode: string }}
 */
function applyAuthLoginResult(result) {
  if (!result || typeof result !== "object") {
    throw new Error("Invalid login response");
  }
  const accessToken = result.access_token;
  if (!accessToken || String(accessToken).trim() === "") {
    throw new Error("Login response missing access_token");
  }
  const preferredLanguageCode = applyLoginPreferredLanguage(result.preferred_language_code);
  setAccessToken(accessToken);
  setSession({
    userId: result.user_id,
    role: result.role,
    email: result.email,
    username: String(result.username || "").trim(),
    preferred_language_code: preferredLanguageCode,
  });
  return { preferredLanguageCode };
}

export {
  SESSION_KEY,
  TOKEN_KEY,
  applyAuthLoginResult,
  clearAccessToken,
  clearSession,
  getAccessToken,
  getCurrentRole,
  getCurrentUserId,
  getCustomerMessagingProfileId,
  getSession,
  isAuthenticated,
  logout,
  normalizeRole,
  setAccessToken,
  setSession,
  updateSessionPreferredLanguage,
};
