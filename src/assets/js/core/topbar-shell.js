/**
 * 메시지함 등에서 admin 레이아웃(상단바·사이드)과 맞출지 판별.
 * 티어 1~3(super_admin, admin, supervisor)만 admin 셸을 씁니다.
 */
export { canAccessAdminShell } from "./role-tiers.js";
