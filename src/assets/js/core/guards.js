import { ROLES } from "./config.js";
import { getCurrentRole, isAuthenticated } from "./auth.js";

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
    ROLES.AGENT,
    ROLES.SUPERVISOR,
    ROLES.HEADQUARTERS_STAFF,
    ROLES.ADMIN,
    ROLES.SUPER_ADMIN,
    ROLES.OPERATOR,
  ]);
}

function ensureAdminAccess() {
  if (!ensureAuthenticated()) return false;
  if (!hasRole([ROLES.ADMIN, ROLES.SUPER_ADMIN, ROLES.SUPERVISOR])) {
    console.warn("Admin role required");
    return false;
  }
  return true;
}

const PAGE_GUARDS = {
  "admin-dashboard.html": [ROLES.ADMIN, ROLES.SUPER_ADMIN, ROLES.SUPERVISOR],
  "admin-customers.html": [ROLES.ADMIN, ROLES.SUPER_ADMIN, ROLES.SUPERVISOR],
  "admin-customer-detail.html": [ROLES.ADMIN, ROLES.SUPER_ADMIN, ROLES.SUPERVISOR],
  "admin-quotes.html": [ROLES.ADMIN, ROLES.SUPER_ADMIN, ROLES.SUPERVISOR],
  "admin-invoices.html": [ROLES.ADMIN, ROLES.SUPER_ADMIN, ROLES.SUPERVISOR],
  "admin-risk-board.html": [ROLES.ADMIN, ROLES.SUPER_ADMIN, ROLES.SUPERVISOR],
  "admin-schedules.html": [ROLES.ADMIN, ROLES.SUPER_ADMIN, ROLES.SUPERVISOR],
  "admin-services.html": [ROLES.ADMIN, ROLES.SUPER_ADMIN],
  "admin-documents.html": [ROLES.ADMIN, ROLES.SUPER_ADMIN, ROLES.HEADQUARTERS_STAFF],
  "admin-users.html": [ROLES.ADMIN, ROLES.SUPER_ADMIN],
  "admin-user-detail.html": [ROLES.ADMIN, ROLES.SUPER_ADMIN],
  "admin-profile.html": [ROLES.ADMIN, ROLES.SUPER_ADMIN, ROLES.SUPERVISOR],
  "admin-password.html": [ROLES.ADMIN, ROLES.SUPER_ADMIN, ROLES.SUPERVISOR],
  "admin-analytics.html": [ROLES.ADMIN, ROLES.SUPER_ADMIN],
};

function protectCurrentPage() {
  const page = window.location.pathname.split("/").pop() || "";
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

export { ensureAdminAccess, ensureAuthenticated, ensureCustomerAccess, hasRole, protectCurrentPage };
