import { loadSidebar } from "../components/sidebar.js";
import { adminOperationsApi } from "../core/api.js";
import { getAccessToken, getSession } from "../core/auth.js";
import { protectCurrentPage } from "../core/guards.js";
import { initCommonI18nAndApplyDom } from "../core/i18n-dom.js";
import {
  OPS_QUEUE_TABS,
  filterQueueItemsByTab,
  getMockCaseWorkspace,
  getMockTimeline,
  mockOpsDelay,
} from "../core/mock-admin-operations.js";
import { formatDate, safeText } from "../core/utils.js";

const STORAGE_ADMIN_NAME = "lhai_ops_demo_admin_name";

/** @typedef {import("../core/mock-admin-operations.js").OpsQueueTabId} OpsQueueTabId */
/** @typedef {import("../core/mock-admin-operations.js").OpsTimelineAuthor} OpsTimelineAuthor */

function qs(sel) {
  return document.querySelector(sel);
}

function getDemoAdminName() {
  try {
    const v = localStorage.getItem(STORAGE_ADMIN_NAME);
    if (v && v.trim()) return v.trim();
  } catch {
    /* ignore */
  }
  return "데모 관리자";
}

/** @type {OpsQueueTabId} */
let activeTab = "action_required";
/** @type {string | null} */
let selectedCaseId = null;
/** @type {'all'|'customer'|'ai'|'admin'|'system'} */
let timelineFilter = "all";
let queueLoading = false;
let queueError = false;

/**
 * 런타임 데모 상태 (API 없이 UI 동작 검증용).
 * @type {{
 *   claimedCaseIds: Set<string>;
 *   releasedLockCaseIds: Set<string>;
 *   assignedByCase: Record<string, string>;
 *   appendedNotes: { caseId: string; id: string; author: string; body: string; at: string }[];
 *   appendedTimeline: Record<string, { id: string; type: OpsTimelineAuthor; body: string; at: string; label?: string }[]>;
 * }}
 */
const runtime = {
  claimedCaseIds: new Set(),
  releasedLockCaseIds: new Set(),
  assignedByCase: {},
  appendedNotes: [],
  appendedTimeline: {},
};

/** @type {Record<string, Record<string, unknown>>} */
const backendCaseDetailById = {};

/** API·목 공통: 현재 큐에 그려진 항목 (탭 필터 반영). 선택 하이라이트 재렌더용. */
/** @type {import("../core/mock-admin-operations.js").OpsQueueItem[]} */
let cachedQueueItems = [];

function useBackendOperations() {
  return Boolean(getAccessToken()?.trim());
}

/** @returns {number | undefined} */
function currentCaseRowVersion() {
  const bd = selectedCaseId ? backendCaseDetailById[selectedCaseId] : null;
  const v = bd && typeof bd.row_version === "number" ? bd.row_version : undefined;
  return v;
}

function showToast(message) {
  const el = qs("#opsToast");
  if (!el) return;
  el.textContent = message;
  el.classList.add("is-visible");
  window.clearTimeout(showToast._t);
  showToast._t = window.setTimeout(() => el.classList.remove("is-visible"), 3200);
}

function isLoadForcedError() {
  const p = new URLSearchParams(window.location.search);
  return p.get("fail") === "1";
}

function priorityLabel(p) {
  if (p === "high") return "긴급";
  if (p === "low") return "낮음";
  return "보통";
}

function authorLabel(type) {
  if (type === "customer") return "고객";
  if (type === "ai") return "AI";
  if (type === "admin") return "관리자";
  return "시스템";
}

function shortAdminId(id) {
  if (!id || typeof id !== "string") return "";
  const compact = id.replace(/-/g, "");
  return compact.length > 12 ? `${compact.slice(0, 8)}…` : id;
}

/**
 * @param {Record<string, unknown>} c
 * @returns {import("../core/mock-admin-operations.js").OpsQueueItem}
 */
function mapBackendRowToQueueItem(c) {
  const ref = String(c.customer_profile_ref || "");
  const email = ref.startsWith("profile::") ? ref.slice("profile::".length) : ref;
  const local = email.includes("@") ? email.split("@")[0] : email;
  return {
    id: String(c.case_id),
    caseId: String(c.case_id),
    tabs: [String(c.queue_tab)],
    customerName: local || "고객",
    customerEmail: email,
    caseTitle: String(c.title || ""),
    queueSummary: `${String(c.queue_status || "")}${c.claim_lease_active ? " · 인수 중" : ""}`,
    priority: /** @type {'high'|'normal'|'low'} */ (c.priority === "high" || c.priority === "low" ? c.priority : "normal"),
    lastCustomerActivityAt: String(c.updated_at || new Date().toISOString()),
    badges: {
      ambiguous: false,
      escalation: false,
      humanRequested: Boolean(c.claim_lease_active && c.claimed_by_admin_id),
    },
  };
}

async function hydrateBackendCaseDetail() {
  const tok = getAccessToken()?.trim();
  if (!tok || !selectedCaseId) return;
  try {
    const d = await adminOperationsApi.getCase(selectedCaseId);
    backendCaseDetailById[selectedCaseId] = d;
  } catch {
    delete backendCaseDetailById[selectedCaseId];
  }
}

function updateAuditPanelVisible() {
  const pre = qs("#opsAuditPre");
  if (!pre || !selectedCaseId) return;
  pre.hidden = true;
  pre.textContent = "";
}

function getEffectiveLock(caseId, base) {
  const d = backendCaseDetailById[caseId];
  const sess = getSession();
  const myId = sess?.userId != null ? String(sess.userId) : "";
  if (d && d.claim_lease_active && d.claimed_by_admin_id) {
    const claimer = String(d.claimed_by_admin_id);
    const who =
      myId && claimer === myId ? getDemoAdminName() : shortAdminId(claimer);
    return {
      lockedBy: who,
      lockedUntil: d.claim_lease_until ? String(d.claim_lease_until) : null,
      softClaimBy: who,
    };
  }
  const me = getDemoAdminName();
  if (runtime.claimedCaseIds.has(caseId)) {
    return { lockedBy: me, lockedUntil: null, softClaimBy: me };
  }
  if (runtime.releasedLockCaseIds.has(caseId)) {
    return { lockedBy: null, lockedUntil: null, softClaimBy: null };
  }
  return base;
}

function renderQueueTabs() {
  const root = qs("#opsQueueTabs");
  if (!root) return;
  root.innerHTML = OPS_QUEUE_TABS.map(
    (t) =>
      `<button type="button" class="lhai-ops-tab${t.id === activeTab ? " is-active" : ""}" role="tab" aria-selected="${t.id === activeTab}" data-tab="${t.id}">${safeText(t.label)}</button>`,
  ).join("");
}

function renderQueueList(items) {
  const list = qs("#opsQueueList");
  const empty = qs("#opsQueueEmpty");
  if (!list || !empty) return;
  if (!items.length) {
    list.innerHTML = "";
    empty.hidden = false;
    return;
  }
  empty.hidden = true;
  list.innerHTML = items
    .map((q) => {
      const when = formatDate(q.lastCustomerActivityAt);
      const pri = priorityLabel(q.priority);
      const priClass =
        q.priority === "high" ? "lhai-ops-priority--high" : q.priority === "low" ? "lhai-ops-priority--low" : "lhai-ops-priority--normal";
      const badges = [];
      if (q.badges.ambiguous) badges.push(`<span class="lhai-ops-badge lhai-ops-badge--warn">모호</span>`);
      if (q.badges.escalation) badges.push(`<span class="lhai-ops-badge lhai-ops-badge--danger">에스컬</span>`);
      if (q.badges.humanRequested) badges.push(`<span class="lhai-ops-badge lhai-ops-badge--info">사람 요청</span>`);
      const sel = q.caseId === selectedCaseId ? " is-selected" : "";
      return `
        <button type="button" class="lhai-ops-queue-item${sel}" role="option" data-case-id="${safeText(q.caseId)}" aria-selected="${q.caseId === selectedCaseId}">
          <p class="lhai-ops-queue-item__title">${safeText(q.caseTitle)}</p>
          <p class="lhai-ops-queue-item__customer">${safeText(q.customerName)}</p>
          <p class="lhai-ops-queue-item__summary">${safeText(q.queueSummary)}</p>
          <div class="lhai-ops-queue-item__meta">
            <span class="lhai-ops-priority ${priClass}">${safeText(pri)}</span>
            <span>고객 활동 ${safeText(when)}</span>
            ${badges.length ? `<span class="lhai-ops-badges">${badges.join("")}</span>` : ""}
          </div>
        </button>`;
    })
    .join("");
}

function setQueueLoadingState(loading, errorMsg) {
  queueLoading = loading;
  queueError = Boolean(errorMsg);
  const sk = qs("#opsQueueSkeleton");
  const panel = qs("#opsQueuePanel");
  const er = qs("#opsQueueError");
  const list = qs("#opsQueueList");
  const empty = qs("#opsQueueEmpty");
  if (sk) sk.hidden = !loading;
  if (panel) panel.setAttribute("aria-busy", loading ? "true" : "false");
  if (er) {
    er.hidden = !errorMsg;
    if (errorMsg) er.innerHTML = `${safeText(errorMsg)} <button type="button" class="lhai-button lhai-button--secondary u-mt-2" id="opsRetryQueue">다시 시도</button>`;
  }
  if (list) list.hidden = loading || Boolean(errorMsg);
  if (empty && (loading || errorMsg)) empty.hidden = true;
}

async function refreshQueue() {
  setQueueLoadingState(true, "");
  try {
    await mockOpsDelay(120);
    if (isLoadForcedError()) throw new Error("데모: 네트워크 오류를 시뮬레이션했습니다. URL에서 ?fail=1 을 제거하면 정상 로드됩니다.");

    const tok = getAccessToken()?.trim();
    if (tok) {
      try {
        const rows = await adminOperationsApi.listCases();
        // 빈 배열([])도 "서버에 케이스 없음"이지 오류가 아님. length>0 일 때만 쓰면 목(mock)으로 잘못 폴백함(개발 리셋 직후 등).
        if (Array.isArray(rows)) {
          const mapped = rows.map(mapBackendRowToQueueItem);
          const items = mapped.filter((q) => q.tabs.includes(activeTab));
          const show = items.length ? items : mapped;
          cachedQueueItems = show;
          setQueueLoadingState(false, "");
          renderQueueTabs();
          renderQueueList(show);
          if (!show.find((i) => i.caseId === selectedCaseId)) {
            selectedCaseId = show[0] ? show[0].caseId : null;
            renderQueueList(show);
          }
          await hydrateBackendCaseDetail();
          updateAuditPanelVisible();
          renderCaseWorkspace();
          renderTimeline();
          return;
        }
      } catch {
        /* 목 데이터로 폴백 */
      }
    }

    const items = filterQueueItemsByTab(activeTab);
    cachedQueueItems = items;
    setQueueLoadingState(false, "");
    renderQueueList(items);
    if (!items.find((i) => i.caseId === selectedCaseId)) {
      selectedCaseId = items[0] ? items[0].caseId : null;
      renderQueueList(items);
    }
    await hydrateBackendCaseDetail();
    updateAuditPanelVisible();
    renderCaseWorkspace();
    renderTimeline();
  } catch (e) {
    const msg = e instanceof Error ? e.message : "큐를 불러오지 못했습니다.";
    setQueueLoadingState(false, msg);
  }
}

function renderTriageOrSummary(ws) {
  const root = qs("#opsTriageOrSummary");
  if (!root || !ws.triage) return;
  const tri = ws.triage;
  if (tri.mode === "ambiguous" || (ws.case.ambiguous && tri.ambiguities?.length)) {
    root.innerHTML = `
      <div class="lhai-ops-card lhai-ops-card--triage">
        <h3 class="lhai-ops-card__head">트리아지 (모호함 — 자신만만한 요약 대신)</h3>
        <p class="u-text-muted" style="font-size:0.8rem;margin:0 0 0.5rem">아래는 확인된 사실과 열린 질문입니다. 고객에게 보내기 전에 의도를 정리하세요.</p>
        <p class="lhai-ops-card__head" style="font-size:0.8rem;margin-top:0.75rem">확인됨</p>
        <ul>${tri.known.map((x) => `<li>${safeText(x)}</li>`).join("")}</ul>
        <p class="lhai-ops-card__head" style="font-size:0.8rem;margin-top:0.75rem">모호·분기</p>
        <ul>${(tri.ambiguities || []).map((x) => `<li>${safeText(x)}</li>`).join("")}</ul>
        <p class="lhai-ops-card__head" style="font-size:0.8rem;margin-top:0.75rem">열린 질문</p>
        <ul>${tri.openQuestions.map((x) => `<li>${safeText(x)}</li>`).join("")}</ul>
      </div>`;
    return;
  }
  root.innerHTML = `
    <div class="lhai-ops-card">
      <h3 class="lhai-ops-card__head">AI 요약 / 맥락</h3>
      <p class="lhai-ops-card__head" style="font-size:0.8rem">파악된 내용</p>
      <ul>${tri.known.map((x) => `<li>${safeText(x)}</li>`).join("")}</ul>
      ${
        tri.openQuestions.length
          ? `<p class="lhai-ops-card__head" style="font-size:0.8rem;margin-top:0.75rem">추가 확인</p><ul>${tri.openQuestions.map((x) => `<li>${safeText(x)}</li>`).join("")}</ul>`
          : ""
      }
    </div>`;
}

function renderLockBanner(caseId, ws) {
  const banner = qs("#opsLockBanner");
  if (!banner) return;
  const bd = backendCaseDetailById[caseId];
  if (bd && bd.customer_reply_gate && bd.customer_reply_gate.allowed === false) {
    banner.hidden = false;
    banner.className = "lhai-ops-lock-banner";
    banner.innerHTML = `<strong>동시 회신 주의</strong> — ${safeText(String(bd.customer_reply_gate.message || ""))}`;
    return;
  }
  if (bd && bd.claim_lease_active && bd.claimed_by_admin_id) {
    const claimer = String(bd.claimed_by_admin_id);
    const sess = getSession();
    const myId = sess?.userId != null ? String(sess.userId) : "";
    const isMe = Boolean(myId && claimer === myId);
    const who = safeText(isMe ? getDemoAdminName() : shortAdminId(claimer));
    const until = bd.claim_lease_until ? safeText(formatDate(String(bd.claim_lease_until))) : "";
    banner.hidden = false;
    banner.className = isMe ? "lhai-ops-lock-banner lhai-ops-lock-banner--self" : "lhai-ops-lock-banner";
    if (isMe) {
      banner.innerHTML = `<strong>내가 인수한 케이스 (API)</strong>${until ? ` — 연장·만료 기준: ${until}` : ""}. 다른 관리자에게는 동시 처리 경고가 표시됩니다.`;
    } else {
      banner.innerHTML = `<strong>다른 관리자 인수 중</strong> — <strong>${who}</strong>${until ? ` (잠금·연장 기준: ${until})` : ""}. 실수 방지를 위해 고객 회신 전에 인수·조율을 확인하세요.`;
    }
    return;
  }
  const lock = getEffectiveLock(caseId, ws.lock);
  const me = getDemoAdminName();
  if (!lock.lockedBy && !lock.softClaimBy) {
    banner.hidden = true;
    banner.textContent = "";
    banner.className = "lhai-ops-lock-banner";
    return;
  }
  const by = lock.softClaimBy || lock.lockedBy;
  const isSelf = by === me;
  banner.hidden = false;
  banner.className = isSelf ? "lhai-ops-lock-banner lhai-ops-lock-banner--self" : "lhai-ops-lock-banner";
  if (lock.lockedUntil && !isSelf) {
    const until = formatDate(lock.lockedUntil);
    banner.innerHTML = `<strong>소프트 락</strong> — <strong>${safeText(by || "")}</strong> 님이 처리 중입니다. (${safeText(until)} 까지) 다른 관리자는 충돌을 피해 조율하거나, 아래 <strong>작업 인수</strong>로 데모상 인수할 수 있습니다.`;
  } else if (!isSelf) {
    banner.innerHTML = `<strong>다른 관리자 작업 중</strong> — <strong>${safeText(by || "")}</strong>. 필요 시 <strong>작업 인수</strong>로 큐 소유를 데모 전환합니다.`;
  } else {
    banner.innerHTML = `<strong>내가 인수한 케이스</strong> — 다른 관리자에게는 잠금/소프트 클레임으로 표시됩니다 (데모).`;
  }
}

function renderCaseWorkspace() {
  const empty = qs("#opsCaseEmpty");
  const body = qs("#opsCaseBody");
  const tEmpty = qs("#opsTimelineEmpty");
  const tBody = qs("#opsTimelineBody");
  if (!empty || !body || !tEmpty || !tBody) return;

  if (!selectedCaseId) {
    empty.hidden = false;
    body.hidden = true;
    tEmpty.hidden = false;
    tBody.hidden = true;
    return;
  }

  const base = getMockCaseWorkspace(selectedCaseId);
  if (!base) {
    empty.hidden = false;
    empty.textContent = "선택한 케이스 데이터가 없습니다.";
    body.hidden = true;
    return;
  }

  const ws = JSON.parse(JSON.stringify(base));
  const assignOverride = runtime.assignedByCase[selectedCaseId];
  if (assignOverride) ws.case.assignedAdminName = assignOverride;

  const bd = backendCaseDetailById[selectedCaseId];
  if (bd && bd.assigned_admin_id) {
    ws.case.assignedAdminName = shortAdminId(String(bd.assigned_admin_id));
  }

  let caseNotes = [...ws.internalNotes, ...runtime.appendedNotes.filter((n) => n.caseId === selectedCaseId)];
  if (bd && Array.isArray(bd.internal_notes)) {
    const apiNotes = bd.internal_notes.map((n) => ({
      id: n.id,
      author: shortAdminId(String(n.author_account_id)),
      body: n.body,
      at: n.created_at,
    }));
    caseNotes = [...apiNotes, ...caseNotes];
  }

  empty.hidden = true;
  body.hidden = false;
  tEmpty.hidden = true;
  tBody.hidden = false;

  renderLockBanner(selectedCaseId, ws);

  const cust = qs("#opsCustomerMeta");
  if (cust) {
    cust.innerHTML = `
      <div><dt>고객</dt><dd>${safeText(ws.customer.name)}</dd></div>
      <div><dt>이메일</dt><dd>${safeText(ws.customer.email)}</dd></div>
      <div><dt>프로필 참조</dt><dd class="u-text-muted" style="font-weight:400;font-size:0.8rem">${safeText(ws.customer.profileRef)}</dd></div>`;
  }

  const cmeta = qs("#opsCaseMeta");
  if (cmeta) {
    cmeta.innerHTML = `
      <div><dt>케이스 제목</dt><dd>${safeText(ws.case.title)}</dd></div>
      <div><dt>케이스 상태</dt><dd>${safeText(ws.case.caseStatus)}</dd></div>
      <div><dt>큐 상태</dt><dd>${safeText(ws.case.queueStatus)}</dd></div>
      <div><dt>담당</dt><dd>${ws.case.assignedAdminName ? safeText(ws.case.assignedAdminName) : "— 미배정"}</dd></div>
      <div><dt>해결 필요</dt><dd>${ws.case.needsResolution ? "예" : "아니오"}</dd></div>`;
  }

  renderTriageOrSummary(ws);

  const km = qs("#opsKeyMessages");
  if (km) {
    km.innerHTML = ws.keyMessages
      .map((m) => {
        const cls = `lhai-ops-msg lhai-ops-msg--${m.author}`;
        return `<div class="${cls}"><div class="lhai-ops-msg__label">${safeText(authorLabel(m.author))} · ${safeText(formatDate(m.at))}</div>${safeText(m.body)}</div>`;
      })
      .join("");
  }

  const rec = qs("#opsRecommended");
  if (rec) rec.innerHTML = `<strong>권장 다음 조치</strong> — ${safeText(ws.recommendedNextAction)}`;

  const notes = qs("#opsInternalNotes");
  if (notes) {
    notes.innerHTML = caseNotes
      .map(
        (n) =>
          `<div class="lhai-ops-note"><div class="lhai-ops-note__meta">${safeText(n.author)} · ${safeText(formatDate(n.at))}</div>${safeText(n.body)}</div>`,
      )
      .join("") || `<p class="u-text-muted" style="font-size:0.8rem">메모 없음</p>`;
  }
}

function getMergedTimeline(caseId) {
  const base = getMockTimeline(caseId);
  const extra = runtime.appendedTimeline[caseId] || [];
  return [...base, ...extra].sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());
}

function renderTimelineFilters() {
  const root = qs("#opsTimelineFilters");
  if (!root) return;
  const opts = [
    { id: "all", label: "전체" },
    { id: "customer", label: "고객만" },
    { id: "ai", label: "AI만" },
    { id: "admin", label: "관리자만" },
    { id: "system", label: "시스템만" },
  ];
  root.innerHTML = opts
    .map(
      (o) =>
        `<button type="button" class="lhai-ops-filter${o.id === timelineFilter ? " is-active" : ""}" data-filter="${o.id}">${safeText(o.label)}</button>`,
    )
    .join("");
}

function renderTimeline() {
  renderTimelineFilters();
  const list = qs("#opsTimelineList");
  if (!list) return;
  if (!selectedCaseId) {
    list.innerHTML = "";
    return;
  }
  let entries = getMergedTimeline(selectedCaseId);
  if (timelineFilter !== "all") {
    entries = entries.filter((e) => e.type === timelineFilter);
  }
  if (!entries.length) {
    list.innerHTML = `<p class="u-text-muted" style="font-size:0.85rem;padding:0.5rem">필터에 맞는 이벤트가 없습니다.</p>`;
    return;
  }
  list.innerHTML = entries
    .map((e) => {
      const label = e.label ? ` · ${safeText(e.label)}` : "";
      return `<div class="lhai-ops-tl-item lhai-ops-msg--${e.type}">
        <div class="lhai-ops-tl-item__when">${safeText(authorLabel(e.type))}${label} · ${safeText(formatDate(e.at))}</div>
        ${safeText(e.body)}
      </div>`;
    })
    .join("");
}

function bindEvents() {
  qs("#opsQueueTabs")?.addEventListener("click", (ev) => {
    const btn = ev.target.closest("[data-tab]");
    if (!btn) return;
    const tab = /** @type {OpsQueueTabId} */ (btn.getAttribute("data-tab"));
    if (!tab || tab === activeTab) return;
    activeTab = tab;
    selectedCaseId = null;
    renderQueueTabs();
    void refreshQueue();
  });

  qs("#opsQueueList")?.addEventListener("click", (ev) => {
    const item = ev.target.closest("[data-case-id]");
    if (!item) return;
    selectedCaseId = item.getAttribute("data-case-id");
    const items = cachedQueueItems.length ? cachedQueueItems : filterQueueItemsByTab(activeTab);
    renderQueueList(items);
    void (async () => {
      await hydrateBackendCaseDetail();
      updateAuditPanelVisible();
      renderCaseWorkspace();
      renderTimeline();
    })();
  });

  document.body.addEventListener("click", (ev) => {
    if (ev.target && /** @type {HTMLElement} */ (ev.target).id === "opsRetryQueue") {
      ev.preventDefault();
      void refreshQueue();
    }
  });

  qs("#opsTimelineFilters")?.addEventListener("click", (ev) => {
    const btn = ev.target.closest("[data-filter]");
    if (!btn) return;
    const f = btn.getAttribute("data-filter");
    if (!f) return;
    timelineFilter = /** @type {typeof timelineFilter} */ (f);
    renderTimeline();
  });

  const me = getDemoAdminName();

  qs("#opsSendReplyBtn")?.addEventListener("click", () => {
    const bd = selectedCaseId ? backendCaseDetailById[selectedCaseId] : null;
    if (bd && bd.customer_reply_gate && bd.customer_reply_gate.allowed === false) {
      showToast(String(bd.customer_reply_gate.message || "다른 관리자 인수 중에는 고객 회신을 삼가세요."));
      return;
    }
    const ta = /** @type {HTMLTextAreaElement | null} */ (qs("#opsReplyInput"));
    const text = (ta?.value || "").trim();
    if (!selectedCaseId || !text) {
      showToast("회신 내용을 입력하세요.");
      return;
    }
    const id = `tl-${Date.now()}`;
    const at = new Date().toISOString();
    if (!runtime.appendedTimeline[selectedCaseId]) runtime.appendedTimeline[selectedCaseId] = [];
    runtime.appendedTimeline[selectedCaseId].push({ id, type: "admin", body: text, at });
    if (ta) ta.value = "";
    showToast("데모: 회신이 타임라인에 반영되었습니다.");
    renderTimeline();
  });

  qs("#opsAddNoteBtn")?.addEventListener("click", async () => {
    const ta = /** @type {HTMLTextAreaElement | null} */ (qs("#opsNoteInput"));
    const text = (ta?.value || "").trim();
    if (!selectedCaseId || !text) {
      showToast("메모를 입력하세요.");
      return;
    }
    if (useBackendOperations()) {
      try {
        const d = await adminOperationsApi.addInternalNote(selectedCaseId, {
          body: text,
          expected_row_version: currentCaseRowVersion(),
        });
        backendCaseDetailById[selectedCaseId] = d;
        if (ta) ta.value = "";
        showToast("내부 메모가 저장되었습니다.");
        renderCaseWorkspace();
      } catch (e) {
        const msg = e instanceof Error ? e.message : "저장 실패";
        showToast(msg);
      }
      return;
    }
    const id = `${selectedCaseId}-n-${Date.now()}`;
    runtime.appendedNotes.push({ caseId: selectedCaseId, id, author: me, body: text, at: new Date().toISOString() });
    if (ta) ta.value = "";
    showToast("데모: 내부 메모가 저장되었습니다.");
    renderCaseWorkspace();
  });

  qs("#opsBtnAssign")?.addEventListener("click", async () => {
    if (!selectedCaseId) return;
    const targetInput = /** @type {HTMLInputElement | null} */ (qs("#opsAssignTargetId"));
    const raw = (targetInput?.value || "").trim();
    const sess = getSession();
    const selfId = sess?.userId != null ? String(sess.userId) : "";
    if (useBackendOperations()) {
      if (!selfId && !raw) {
        showToast("배정하려면 로그인한 관리자 계정이 필요합니다. 또는 배정 대상 UUID를 입력하세요.");
        return;
      }
      const assignee = raw || selfId;
      try {
        await adminOperationsApi.assignCase(selectedCaseId, {
          assignee_user_id: assignee,
          expected_row_version: currentCaseRowVersion(),
        });
        await hydrateBackendCaseDetail();
        await refreshQueue();
        showToast("배정을 반영했습니다.");
        if (targetInput) targetInput.value = "";
        renderCaseWorkspace();
      } catch (e) {
        showToast(e instanceof Error ? e.message : "배정 실패");
      }
      return;
    }
    runtime.assignedByCase[selectedCaseId] = me;
    showToast(`나에게 배정됨 (${me})`);
    renderCaseWorkspace();
  });

  qs("#opsBtnClaim")?.addEventListener("click", async () => {
    if (!selectedCaseId) return;
    if (useBackendOperations()) {
      const attempt = async (force) => {
        await adminOperationsApi.claimCase(selectedCaseId, {
          expected_row_version: currentCaseRowVersion(),
          force_takeover: force,
        });
        await hydrateBackendCaseDetail();
        await refreshQueue();
        showToast(force ? "강제 인수했습니다." : "작업을 인수했습니다.");
        renderCaseWorkspace();
        renderTimeline();
      };
      try {
        await attempt(false);
      } catch (e) {
        const msg = e instanceof Error ? e.message : "인수 실패";
        const tryForce = window.confirm(`${msg}\n\n다른 관리자가 인수 중일 수 있습니다. 강제 인수할까요?`);
        if (!tryForce) {
          showToast(msg);
          return;
        }
        try {
          await attempt(true);
        } catch (e2) {
          showToast(e2 instanceof Error ? e2.message : "강제 인수 실패");
        }
      }
      return;
    }
    runtime.claimedCaseIds.add(selectedCaseId);
    runtime.releasedLockCaseIds.delete(selectedCaseId);
    showToast("작업을 인수했습니다 (데모).");
    renderCaseWorkspace();
    renderTimeline();
  });

  qs("#opsBtnRelease")?.addEventListener("click", async () => {
    if (!selectedCaseId) return;
    if (useBackendOperations()) {
      try {
        await adminOperationsApi.releaseCase(selectedCaseId, { expected_row_version: currentCaseRowVersion() });
        await hydrateBackendCaseDetail();
        await refreshQueue();
        showToast("인수를 해제했습니다.");
        renderCaseWorkspace();
      } catch (e) {
        showToast(e instanceof Error ? e.message : "해제 실패");
      }
      return;
    }
    runtime.claimedCaseIds.delete(selectedCaseId);
    runtime.releasedLockCaseIds.add(selectedCaseId);
    showToast("인수 해제 (데모).");
    renderCaseWorkspace();
  });

  qs("#opsBtnLoadAudit")?.addEventListener("click", async () => {
    if (!selectedCaseId) return;
    const pre = qs("#opsAuditPre");
    if (!useBackendOperations()) {
      showToast("감사 로그는 관리자 로그인(API) 후 조회할 수 있습니다.");
      return;
    }
    try {
      const rows = await adminOperationsApi.listCaseAudit(selectedCaseId);
      if (pre) {
        pre.hidden = false;
        pre.textContent = JSON.stringify(rows, null, 2);
      }
    } catch (e) {
      showToast(e instanceof Error ? e.message : "조회 실패");
    }
  });

  qs("#opsBtnSnooze")?.addEventListener("click", () => {
    showToast("데모: 스누즈 — 2시간 후 큐 상단 알림 예정");
  });

  qs("#opsBtnClarify")?.addEventListener("click", () => {
    showToast("데모: 고객에게 명확화 요청 메시지 템플릿 전송");
  });

  qs("#opsBtnWaiting")?.addEventListener("click", () => {
    showToast("데모: 큐 상태 → 고객 회신 대기");
  });

  qs("#opsBtnResolve")?.addEventListener("click", () => {
    showToast("데모: 케이스 해결 처리 (실제 API 연동 시 확정)");
  });
}

async function init() {
  if (!protectCurrentPage()) return;
  await initCommonI18nAndApplyDom(document);
  await loadSidebar("#sidebar", "admin");
  renderQueueTabs();
  bindEvents();
  await refreshQueue();
}

void init();
