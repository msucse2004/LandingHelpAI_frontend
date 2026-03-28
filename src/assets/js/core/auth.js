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

function setSession(session) {
  window.localStorage.setItem(SESSION_KEY, JSON.stringify(session));
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
  return getSession()?.role || ROLES.CUSTOMER;
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
  setAccessToken,
  setSession,
};
