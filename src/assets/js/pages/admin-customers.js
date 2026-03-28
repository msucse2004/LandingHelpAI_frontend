import { adminApi } from "../core/api.js";
import { ensureAdminAccess, protectCurrentPage } from "../core/guards.js";
import { getState, patchState } from "../core/state.js";

async function initAdminCustomersPage() {
  if (!protectCurrentPage()) return;
  if (!ensureAdminAccess()) return;
  const customers = await adminApi.listCustomers();
  const current = getState();
  patchState({ admin: { ...current.admin, customers } });
  console.info("Admin customers page initialized", customers);
}

export { initAdminCustomersPage };

void initAdminCustomersPage();
