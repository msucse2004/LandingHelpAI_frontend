import { ROLES } from "./config.js";
import { getCurrentRole, isAuthenticated } from "./auth.js";
import { ROLE_TIER, isRoleTierAtMost } from "./role-tiers.js";

function ensureAuthenticated() {
  // TODO: replace alert/boolean with redirect strategy.
  if (!isAuthenticated()) {
    console.warn("Authentication required");
    return false;
  }
  return true;
}

function hasRole(allowedRoles = []) {
  const currentRole = getCurrentRole();
  return allowedRoles.includes(currentRole);
}

function ensureCustomerAccess() {
  return ensureAuthenticated() && hasRole([
    ROLES.CUSTOMER,
    ROLES.PARTNER,
    ROLES.AGENT,
    ROLES.SUPERVISOR,
    ROLES.HEADQUARTERS_STAFF,
    ROLES.ADMIN,
    ROLES.SUPER_ADMIN,
    ROLES.OPERATOR,
    ROLES.GUEST,
  ]);
}

function ensureAdminAccess() {
  if (!ensureAuthenticated()) return false;
  if (!isRoleTierAtMost(ROLE_TIER.THREE)) {
    console.warn("Admin tier (1–3) required");
    return false;
  }
  return true;
}

/** 로그인 + 티어 상한 검사. 예: ensureTierAccess(ROLE_TIER.TWO) → 티어1·2만, FOUR면 전원 */
function ensureTierAccess(maxInclusiveTier) {
  if (!ensureAuthenticated()) return false;
  return isRoleTierAtMost(maxInclusiveTier);
}

const PAGE_GUARDS = {
  "profile.html": [
    ROLES.CUSTOMER,
    ROLES.AGENT,
    ROLES.SUPERVISOR,
    ROLES.HEADQUARTERS_STAFF,
    ROLES.ADMIN,
    ROLES.SUPER_ADMIN,
    ROLES.OPERATOR,
    ROLES.GUEST,
  ],
  "password.html": [
    ROLES.CUSTOMER,
    ROLES.AGENT,
    ROLES.SUPERVISOR,
    ROLES.HEADQUARTERS_STAFF,
    ROLES.ADMIN,
    ROLES.SUPER_ADMIN,
    ROLES.OPERATOR,
    ROLES.GUEST,
  ],
};

function protectCurrentPage() {
  const page = window.location.pathname.split("/").pop() || "";
  if (page.startsWith("admin-") && page.endsWith(".html")) {
    if (!ensureAuthenticated()) {
      window.location.href = "login.html";
      return false;
    }
    if (!isRoleTierAtMost(ROLE_TIER.THREE)) {
      console.warn(`Access denied for admin page ${page}`);
      window.location.href = "dashboard.html";
      return false;
    }
    return true;
  }
  const allowedRoles = PAGE_GUARDS[page];
  if (!allowedRoles) return true;
  if (!ensureAuthenticated()) {
    window.location.href = "login.html";
    return false;
  }
  if (!hasRole(allowedRoles)) {
    console.warn(`Access denied for page ${page}`);
    window.location.href = "dashboard.html";
    return false;
  }
  return true;
}

export {
  ROLE_TIER,
  getCurrentRoleTier,
  getCurrentRoleTierLabelKo,
  getRoleTier,
  getRoleTierLabelKo,
  getTierLabelKo,
  isRoleTierAtMost,
} from "./role-tiers.js";
export {
  ensureAdminAccess,
  ensureAuthenticated,
  ensureCustomerAccess,
  ensureTierAccess,
  hasRole,
  protectCurrentPage,
};
