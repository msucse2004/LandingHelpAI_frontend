import { adminApi } from "../core/api.js";
import { ensureAdminAccess, protectCurrentPage } from "../core/guards.js";
import { getState, patchState } from "../core/state.js";

async function initAdminServicesPage() {
  if (!protectCurrentPage()) return;
  if (!ensureAdminAccess()) return;
  const services = await adminApi.listServices();
  const current = getState();
  patchState({ admin: { ...current.admin, services } });
  console.info("Admin services page initialized", services);
}

export { initAdminServicesPage };
