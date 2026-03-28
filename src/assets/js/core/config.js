/**
 * Global frontend config for Landing Help AI.
 * Keep values simple and environment-safe for static hosting.
 *
 * Docker Compose(기본): 프론트는 호스트 :8000, API는 :8001 — nginx가 /api 를 백엔드로 넘기므로
 * 같은 호스트에서 상대 경로(/api/...)로 호출해야 합니다.
 * Live Server 등 다른 포트에서는 백엔드(보통 localhost:8000) 전체 URL을 씁니다.
 */
function resolveApiBaseUrl() {
  const explicit = window.LHAI_API_BASE_URL;
  if (explicit != null && String(explicit).trim() !== "") {
    return String(explicit).replace(/\/$/, "");
  }
  const host = window.location.hostname;
  const port = window.location.port;
  const local = host === "localhost" || host === "127.0.0.1";
  if (local && (port === "8000" || port === "")) {
    return "";
  }
  return "http://localhost:8000";
}

const APP_CONFIG = {
  appName: "Landing Help AI",
  apiBaseUrl: resolveApiBaseUrl(),
  appBasePath: "/src/pages/",
  defaultRole: "customer",
  preferBackendAuth: true,
};

const ROLES = {
  SUPER_ADMIN: "super_admin",
  CUSTOMER: "customer",
  AGENT: "agent",
  SUPERVISOR: "supervisor",
  HEADQUARTERS_STAFF: "headquarters_staff",
  ADMIN: "admin",
  OPERATOR: "operator",
  GUEST: "guest",
};

/** 역할 티어(1~6)는 core/role-tiers.js · guards.js 에서 사용 */

export { APP_CONFIG, ROLES };
