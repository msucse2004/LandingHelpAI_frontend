/**
 * Global frontend config for Landing Help AI.
 * Keep values simple and environment-safe for static hosting.
 *
 * Docker Compose(기본): 프론트는 호스트 :8000, API는 :8001 — nginx가 /api 를 백엔드로 넘기므로
 * 같은 호스트에서 상대 경로(/api/...)로 호출해야 합니다.
 * Live Server 등 다른 포트에서는 백엔드(보통 localhost:8000) 전체 URL을 씁니다.
 */
export function resolveApiBaseUrl() {
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
  // HTTPS(예: Cloudflare Tunnel): 기본값으로 http://localhost:8000 을 쓰면 혼합 콘텐츠로 fetch 가 막힙니다.
  // 터널이 nginx 등으로 프론트와 /api 를 같은 호스트에 붙인 경우 상대 경로가 맞습니다.
  // API가 다른 호스트만 있으면 HTML에서 window.LHAI_API_BASE_URL 을 HTTPS API 오리진으로 설정하세요.
  if (window.location.protocol === "https:") {
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
  /** 카탈로그/목업에서 AI 견적 초안 기본 단가가 없을 때 쓰는 USD 기본값(백엔드 catalog_defaults 와 맞출 것). */
  defaultAiGuideUnitPriceUsd: 9.99,
};

const ROLES = {
  SUPER_ADMIN: "super_admin",
  CUSTOMER: "customer",
  PARTNER: "partner",
  AGENT: "agent",
  SUPERVISOR: "supervisor",
  HEADQUARTERS_STAFF: "headquarters_staff",
  ADMIN: "admin",
  OPERATOR: "operator",
  GUEST: "guest",
};

/** 역할 티어(1~6)는 core/role-tiers.js · guards.js 에서 사용 */

export { APP_CONFIG, ROLES };
