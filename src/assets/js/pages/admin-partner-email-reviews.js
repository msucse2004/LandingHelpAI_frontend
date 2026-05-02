import { partnerEmailReviewAdminApi } from "../core/api.js";
import { ensureAdminAccess, protectCurrentPage } from "../core/guards.js";
import { loadSidebar } from "../components/sidebar.js";
import { applyI18nToDom } from "../core/i18n-dom.js";

function qs(selector) {
  return document.querySelector(selector);
}

function esc(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function setStatus(msg) {
  const el = qs("#lhaiPartnerEmailReviewsStatus");
  if (el) el.textContent = msg || "";
}

function renderList(items) {
  const root = qs("#lhaiPartnerEmailReviewsList");
  if (!root) return;
  if (!items.length) {
    root.innerHTML = "<div class='lhai-state lhai-state--empty'>검토 대기 항목이 없습니다.</div>";
    return;
  }
  root.innerHTML = items
    .map((it) => {
      const wid = esc(it.workflow_instance_id);
      const tid = esc(it.thread_id);
      const parsed = JSON.stringify(it.parsed_result || {}, null, 2);
      return `
      <article class="lhai-partner-email-reviews__card" data-review-id="${esc(it.id)}">
        <div class="lhai-partner-email-reviews__meta">
          <strong>${esc(it.partner_name)}</strong>
          · 서비스: ${esc(it.service_name || "—")}
          · 신뢰도: ${it.confidence != null ? esc(String(it.confidence)) : "—"}
        </div>
        <p class="u-text-muted u-mb-2">${esc(it.reason || "")}</p>
        <p class="lhai-partner-email-reviews__thread-link u-mb-2">
          워크플로 인스턴스: <code>${wid}</code><br />
          스레드: <code>${tid}</code>
        </p>
        <div class="lhai-partner-email-reviews__label">고객 공개용 요약(미리보기)</div>
        <pre class="lhai-partner-email-reviews__pre">${esc(it.customer_facing_summary_preview || "")}</pre>
        <div class="lhai-partner-email-reviews__label">AI 해석 결과(JSON)</div>
        <pre class="lhai-partner-email-reviews__pre">${esc(parsed)}</pre>
        <div class="lhai-partner-email-reviews__label">내부용 원문 이메일(고객 비노출)</div>
        <pre class="lhai-partner-email-reviews__pre">${esc(it.internal_inbound_email_body || "")}</pre>
        <div class="lhai-partner-email-reviews__actions">
          <button type="button" class="lhai-button lhai-button--primary" data-action="approve">고객에게 공개</button>
          <button type="button" class="lhai-button lhai-button--secondary" data-action="toggle-edit">수정 후 공개</button>
          <button type="button" class="lhai-button lhai-button--danger" data-action="ignore">무시</button>
        </div>
        <div class="lhai-partner-email-reviews__edit-panel" data-edit-panel hidden>
          <label class="lhai-partner-email-reviews__label">고객에게 보일 요약(선택)</label>
          <textarea class="lhai-input" data-role="edit-summary" rows="2" placeholder="비우면 해석 결과로부터 다시 생성">${esc(
            it.customer_facing_summary_preview || ""
          )}</textarea>
          <label class="lhai-partner-email-reviews__label">response_json 덮어쓰기(객체 JSON, 선택)</label>
          <textarea class="lhai-input" data-role="edit-json" rows="4" placeholder='예: {"out_the_door_price": 12500}'></textarea>
          <button type="button" class="lhai-button lhai-button--primary" data-action="approve-edited">수정 반영하여 공개</button>
        </div>
      </article>`;
    })
    .join("");

  root.querySelectorAll("[data-action]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const card = btn.closest("[data-review-id]");
      const id = card?.getAttribute("data-review-id") || "";
      const action = btn.getAttribute("data-action") || "";
      if (!id) return;
      try {
        if (action === "approve") {
          setStatus("처리 중…");
          await partnerEmailReviewAdminApi.approve(id);
          setStatus("공개되었습니다.");
        } else if (action === "ignore") {
          if (!window.confirm("이 회신을 무시할까요? 고객에게 견적이 표시되지 않습니다.")) return;
          setStatus("처리 중…");
          await partnerEmailReviewAdminApi.ignore(id);
          setStatus("무시 처리되었습니다.");
        } else if (action === "toggle-edit") {
          const panel = card?.querySelector("[data-edit-panel]");
          if (panel) panel.hidden = !panel.hidden;
        } else if (action === "approve-edited") {
          const sumEl = card?.querySelector('[data-role="edit-summary"]');
          const jsonEl = card?.querySelector('[data-role="edit-json"]');
          const summary = sumEl && "value" in sumEl ? String(sumEl.value || "").trim() : "";
          let responseJson = null;
          const rawJson = jsonEl && "value" in jsonEl ? String(jsonEl.value || "").trim() : "";
          if (rawJson) {
            try {
              responseJson = JSON.parse(rawJson);
              if (typeof responseJson !== "object" || responseJson === null || Array.isArray(responseJson)) {
                throw new Error("객체 JSON이어야 합니다.");
              }
            } catch (e) {
              setStatus(e instanceof Error ? e.message : "JSON 형식 오류");
              return;
            }
          }
          setStatus("처리 중…");
          await partnerEmailReviewAdminApi.approveWithEdits(id, {
            customer_visible_summary: summary || null,
            response_json: responseJson,
          });
          setStatus("수정 반영하여 공개되었습니다.");
        }
        await refresh();
      } catch (e) {
        setStatus(e instanceof Error ? e.message : "오류가 발생했습니다.");
      }
    });
  });
}

async function refresh() {
  try {
    setStatus("불러오는 중…");
    const res = await partnerEmailReviewAdminApi.list();
    const items = Array.isArray(res?.items) ? res.items : [];
    renderList(items);
    if (items.length) setStatus(`${items.length}건`);
    else setStatus("");
  } catch (e) {
    setStatus(e instanceof Error ? e.message : "목록을 불러오지 못했습니다.");
    renderList([]);
  }
}

async function init() {
  if (!protectCurrentPage()) return;
  if (!ensureAdminAccess()) return;
  await loadSidebar("#sidebar", "admin");
  applyI18nToDom(document);
  qs("#lhaiPartnerEmailReviewsRefresh")?.addEventListener("click", () => {
    void refresh();
  });
  await refresh();
}

void init();
