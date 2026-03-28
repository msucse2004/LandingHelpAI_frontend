import { getCurrentRole, getSession } from "./auth.js";
import { ROLES } from "./config.js";
import { ROLE_TIER, getRoleTier } from "./role-tiers.js";

/** 역할 라벨(title). 배지 색은 티어(`lhai-badge--tier-n`)로 구분 */
const ROLE_BADGE = {
  [ROLES.SUPER_ADMIN]: { label: "Super Admin" },
  [ROLES.ADMIN]: { label: "Admin" },
  [ROLES.SUPERVISOR]: { label: "Supervisor" },
  [ROLES.HEADQUARTERS_STAFF]: { label: "HQ Staff" },
  [ROLES.AGENT]: { label: "Agent" },
  [ROLES.OPERATOR]: { label: "Operator" },
  [ROLES.CUSTOMER]: { label: "Customer" },
  [ROLES.GUEST]: { label: "Guest" },
};

const TIER_BADGE_MOD = Object.freeze({
  [ROLE_TIER.ONE]: "lhai-badge--tier-1",
  [ROLE_TIER.TWO]: "lhai-badge--tier-2",
  [ROLE_TIER.THREE]: "lhai-badge--tier-3",
  [ROLE_TIER.FOUR]: "lhai-badge--tier-4",
  [ROLE_TIER.FIVE]: "lhai-badge--tier-5",
  [ROLE_TIER.SIX]: "lhai-badge--tier-6",
});

function headerBadgeModForTier(tier) {
  return TIER_BADGE_MOD[tier] || "lhai-badge--tier-unknown";
}

/** 로그인 아이디: username 우선, 없으면 userId */
function displayAccountId(session) {
  if (!session) return "";
  const u = String(session.username || "").trim();
  if (u) return u;
  const id = session.userId != null ? String(session.userId).trim() : "";
  return id;
}

/**
 * Sets #lhai-header-role-badge: 표시는 계정 아이디만, 색은 권한 티어(tier 1–6), 역할은 title에 표기.
 */
export function syncHeaderRoleBadge(elementId = "lhai-header-role-badge") {
  const el = document.getElementById(elementId);
  if (!el) return;
  const session = getSession();
  const role = getCurrentRole();
  const cfg = ROLE_BADGE[role] || {
    label: role.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
  };
  const tier = getRoleTier(role);
  const mod = headerBadgeModForTier(tier);
  const accountId = displayAccountId(session);
  el.className = `lhai-badge ${mod}`;
  el.textContent = accountId || "—";
  const tierHint = tier >= 1 && tier <= 6 ? `티어 ${tier}` : "티어 미정";
  el.setAttribute("title", accountId ? `${cfg.label} · ${tierHint} · ${accountId}` : `${cfg.label} · ${tierHint}`);
}
