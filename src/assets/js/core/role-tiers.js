/**
 * 역할 티어 (숫자가 작을수록 권한이 높음)
 *
 * 티어1: super_admin · 티어2: admin · 티어3: supervisor
 * 티어4: headquarters_staff · 티어5: customer, partner, agent, operator · 티어6: guest
 *
 * admin HTML: 티어 1~3만 (isRoleTierAtMost(ROLE_TIER.THREE))
 * 초대/삭제: 대상 티어가 행위자보다 낮을 때만 — canManageLowerTierRole(actor, target)
 */
import { getCurrentRole } from "./auth.js";
import { ROLES } from "./config.js";

const ROLE_TIER = Object.freeze({
  ONE: 1,
  TWO: 2,
  THREE: 3,
  FOUR: 4,
  FIVE: 5,
  SIX: 6,
});

/** 알 수 없는 역할: admin 셸·티어 상한 검사에서 제외 */
const UNKNOWN_TIER = 99;

const TIER_BY_ROLE = Object.freeze({
  [ROLES.SUPER_ADMIN]: ROLE_TIER.ONE,
  [ROLES.ADMIN]: ROLE_TIER.TWO,
  [ROLES.SUPERVISOR]: ROLE_TIER.THREE,
  [ROLES.HEADQUARTERS_STAFF]: ROLE_TIER.FOUR,
  [ROLES.CUSTOMER]: ROLE_TIER.FIVE,
  [ROLES.PARTNER]: ROLE_TIER.FIVE,
  [ROLES.AGENT]: ROLE_TIER.FIVE,
  [ROLES.OPERATOR]: ROLE_TIER.FIVE,
  [ROLES.GUEST]: ROLE_TIER.SIX,
});

function normalizeRoleKey(roleKey) {
  if (roleKey == null || String(roleKey).trim() === "") return "";
  return String(roleKey).trim().toLowerCase().replace(/-/g, "_");
}

/**
 * @param {string} [roleKey] 생략 시 현재 세션 역할
 * @returns {number} ROLE_TIER.ONE … SIX, 미정의 역할은 UNKNOWN_TIER
 */
function getRoleTier(roleKey) {
  const key = roleKey !== undefined ? normalizeRoleKey(roleKey) : normalizeRoleKey(getCurrentRole());
  if (!key) return UNKNOWN_TIER;
  return TIER_BY_ROLE[key] ?? UNKNOWN_TIER;
}

function getCurrentRoleTier() {
  return getRoleTier(getCurrentRole());
}

/**
 * 허용 티어 상한. 숫자가 클수록 더 많은 역할이 통과.
 * @param {number} maxInclusiveTier ROLE_TIER.ONE … SIX
 */
function isRoleTierAtMost(maxInclusiveTier) {
  return getCurrentRoleTier() <= maxInclusiveTier;
}

/** admin 상단바/사이드바(messages 등) — 티어 1~3 */
function canAccessAdminShell() {
  return isRoleTierAtMost(ROLE_TIER.THREE);
}

/**
 * 초대·가입 수정 등: 양쪽 역할이 정의되어 있고, 대상 티어가 행위자보다 **엄격히 낮을 때만**(동일·상위는 false).
 * @param {string} actorRole
 * @param {string} targetRole
 */
function canManageLowerTierRole(actorRole, targetRole) {
  const ar = normalizeRoleKey(actorRole);
  const tr = normalizeRoleKey(targetRole);
  const at = TIER_BY_ROLE[ar];
  const tt = TIER_BY_ROLE[tr];
  if (at === undefined || tt === undefined) return false;
  if (tt <= at) return false;
  return true;
}

/**
 * 계정 삭제 버튼 표시: 대상이 행위자보다 권한이 **낮을 때만** true.
 * 동일 등급(admin끼리 등)·상위·맵에 없는 역할명이면 false (버튼 비표시).
 */
function mayShowAccountDeleteButton(actorRole, targetRole) {
  return canManageLowerTierRole(actorRole, targetRole);
}

const TIER_LABEL_KO = Object.freeze({
  [ROLE_TIER.ONE]: "티어 1 — 최고 관리자 (super_admin)",
  [ROLE_TIER.TWO]: "티어 2 — 관리자 (admin)",
  [ROLE_TIER.THREE]: "티어 3 — 슈퍼바이저 (supervisor)",
  [ROLE_TIER.FOUR]: "티어 4 — 본사 직원 (headquarters_staff)",
  [ROLE_TIER.FIVE]: "티어 5 — 고객·파트너·에이전트·오퍼레이터",
  [ROLE_TIER.SIX]: "티어 6 — 게스트",
});

function getTierLabelKo(tierNumber) {
  return TIER_LABEL_KO[tierNumber] ?? `티어 미정의 (${tierNumber})`;
}

/** @param {string} [roleKey] 생략 시 현재 세션 역할 */
function getRoleTierLabelKo(roleKey) {
  return getTierLabelKo(getRoleTier(roleKey));
}

function getCurrentRoleTierLabelKo() {
  return getTierLabelKo(getCurrentRoleTier());
}

export {
  ROLE_TIER,
  TIER_BY_ROLE,
  TIER_LABEL_KO,
  canAccessAdminShell,
  canManageLowerTierRole,
  getCurrentRoleTier,
  getCurrentRoleTierLabelKo,
  getRoleTier,
  getRoleTierLabelKo,
  getTierLabelKo,
  isRoleTierAtMost,
  mayShowAccountDeleteButton,
};
