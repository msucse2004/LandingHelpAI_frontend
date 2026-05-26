import { adminApi } from "../core/api.js";
import { ensureAdminAccess, protectCurrentPage } from "../core/guards.js";
import { formatDate, safeText } from "../core/utils.js";
import { loadSidebar } from "../components/sidebar.js";

function customerDetailUrl(customerProfileId) {
  return `admin-customer-detail.html?customer_profile_id=${encodeURIComponent(
    String(customerProfileId || "").trim()
  )}`;
}

function renderCustomerList(customers = []) {
  const target = document.querySelector("#adminCustomersList");
  if (!target) return;

  if (!customers.length) {
    target.innerHTML = `<div class="lhai-state lhai-state--empty">표시할 고객이 없습니다. 아래에서 프로필 ID로 직접 열 수 있습니다.</div>`;
    return;
  }

  target.innerHTML = `
    <ul class="lhai-list">
      ${customers
        .map((c) => {
          const id = String(c.customer_profile_id || c.id || "").trim();
          const risk = safeText(c.risk_level || "—");
          const blocked = c.blocked ? '<span class="lhai-badge lhai-badge--warning">blocked</span>' : "";
          return `
            <li class="lhai-list__item">
              <a href="${customerDetailUrl(id)}"><strong>${safeText(id)}</strong></a>
              <span class="lhai-badge u-ml-1">${risk}</span>
              ${blocked}
            </li>`;
        })
        .join("")}
    </ul>
    <p class="u-text-muted u-mt-2">총 ${customers.length}명 · 항목을 클릭하면 Customer 360 뷰가 열립니다.</p>
  `;
}

function wireOpenForm() {
  const form = document.querySelector("#adminCustomersOpenForm");
  const input = document.querySelector("#adminCustomersProfileId");
  if (!form || !input) return;

  const params = new URLSearchParams(window.location.search);
  const prefill = (params.get("customer_profile_id") || params.get("customer") || "").trim();
  if (prefill) input.value = prefill;

  form.addEventListener("submit", (ev) => {
    ev.preventDefault();
    const id = String(input.value || "").trim();
    if (!id) return;
    window.location.href = customerDetailUrl(id);
  });
}

async function initAdminCustomersPage() {
  if (!protectCurrentPage()) return;
  if (!ensureAdminAccess()) return;
  await loadSidebar("#sidebar", "admin");
  wireOpenForm();

  const target = document.querySelector("#adminCustomersList");
  try {
    const summary = await adminApi.getRiskSummary();
    renderCustomerList(summary.customers || []);
  } catch (err) {
    if (target) {
      target.innerHTML = `<div class="lhai-state lhai-state--empty">목록 API 오류: ${safeText(err?.message || String(err))}. 프로필 ID로 직접 열어 주세요.</div>`;
    }
  }
}

void initAdminCustomersPage();

export { customerDetailUrl, initAdminCustomersPage };
