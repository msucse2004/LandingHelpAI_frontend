import { ROLES } from "./config.js";

const TOKEN_KEY = "lhai_access_token";
const SESSION_KEY = "lhai_session";

/**
 * Session shape:
 * { userId: string, role: string, email: string, username?: string }
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
  window.localStorage.setItem(SESSION_KEY, JSON.stringify(payload));
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

function isAuthenticated() {
  return Boolean(getAccessToken());
}

/** Clears stored token/session and sends the user to the login page. */
function logout() {
  clearAccessToken();
  clearSession();
  window.location.href = "login.html";
}

export {
  SESSION_KEY,
  TOKEN_KEY,
  clearAccessToken,
  clearSession,
  getAccessToken,
  getCurrentRole,
  getSession,
  isAuthenticated,
  logout,
  normalizeRole,
  setAccessToken,
  setSession,
};
