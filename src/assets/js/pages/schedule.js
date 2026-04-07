import { customerScheduleApi, scheduleApi } from "../core/api.js";
import { getCustomerMessagingProfileId } from "../core/auth.js";
import { loadSidebar } from "../components/sidebar.js";
import { applyI18nToDom } from "../core/i18n-dom.js";
import { ensureCustomerAccess, protectCurrentPage } from "../core/guards.js";
import { formatDate, safeText } from "../core/utils.js";

const urlParams = new URLSearchParams(window.location.search);
const scheduleIdFromUrl = String(urlParams.get("schedule_id") || urlParams.get("id") || "").trim();

function setFeedbackStatus(message) {
  const target = document.querySelector("#customerScheduleFeedbackStatus");
  if (target) target.textContent = message;
}

function statusLabelKo(status) {
  const s = String(status || "").toUpperCase();
  if (s === "DRAFT") return "준비 중(초안)";
  if (s === "PROPOSED") return "검토·안내 중";
  if (s === "CONFIRMED") return "확정";
  if (s === "REVISED") return "조정 반영 중";
  return safeText(status, "알 수 없음");
}

function deliveryLabel(deliveryType) {
  const d = String(deliveryType || "").toLowerCase().replace(/-/g, "_");
  if (d === "in_person" || d === "inperson") return "방문 지원";
  if (d === "ai_guide" || d === "ai" || d === "guide") return "Landing Help AI Agent";
  if (d === "hybrid" || d === "optional_human" || d === "ai_plus_human")
    return "Landing Help AI Agent + 선택적 인력 지원";
  if (!d) return "";
  return safeText(deliveryType);
}

function formatTimeLocal(iso) {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  try {
    return new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(date);
  } catch {
    return "";
  }
}

function localDateKey(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "_invalid";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function formatDayHeading(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "일정";
  try {
    return new Intl.DateTimeFormat("ko-KR", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    }).format(d);
  } catch {
    return formatDate(iso);
  }
}

function groupItemsByDate(items) {
  const list = Array.isArray(items) ? items.slice() : [];
  list.sort((a, b) => String(a.scheduled_start || "").localeCompare(String(b.scheduled_start || "")));
  const map = new Map();
  for (const it of list) {
    const key = localDateKey(it.scheduled_start);
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(it);
  }
  const keys = Array.from(map.keys()).filter((k) => k !== "_invalid").sort();
  if (map.has("_invalid")) keys.push("_invalid");
  return keys.map((k) => ({ key: k, items: map.get(k) || [], anchorIso: (map.get(k) || [])[0]?.scheduled_start || "" }));
}

function escapeAttr(s) {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;");
}

function renderSummary(view) {
  const target = document.querySelector("#customerScheduleSummary");
  if (!target) return;
  if (!view) {
    target.innerHTML = `<div class="lhai-state lhai-state--empty">표시할 일정이 없습니다. 링크가 올바른지 확인하거나 고객센터로 문의해 주세요.</div>`;
    return;
  }
  const lr = view.last_release;
  const releasedLine = lr
    ? `<p class="lhai-schedule-meta"><strong>안내 버전</strong> v${safeText(lr.version_number)} · <strong>공개·갱신</strong> ${formatDate(lr.released_at)} ${formatTimeLocal(lr.released_at)}</p>${
        lr.release_note
          ? `<p class="lhai-schedule-release-note">${safeText(lr.release_note)}</p>`
          : ""
      }`
    : `<p class="lhai-schedule-meta u-text-muted">아직 고객에게 공개된 일정 버전이 없습니다. 아래는 최신 초안 기준 안내일 수 있어요.</p>`;
  const prevFeedback =
    view.customer_feedback && String(view.customer_feedback).trim()
      ? `<p class="lhai-schedule-meta"><strong>이전 조정 요청 요약</strong> ${safeText(view.customer_feedback)}</p>`
      : "";
  target.innerHTML = `
    <div class="lhai-schedule-hero">
      <span class="lhai-schedule-status-badge" data-status="${escapeAttr(view.status)}">${statusLabelKo(view.status)}</span>
      <p class="lhai-schedule-meta"><strong>최종 수정</strong> ${formatDate(view.updated_at)} ${formatTimeLocal(view.updated_at)}</p>
      ${releasedLine}
      ${prevFeedback}
    </div>
    <p class="lhai-schedule-hint u-text-muted">가격·내부 검토 정보는 이 화면에 표시되지 않습니다.</p>
  `;
}

function renderTimeline(view) {
  const target = document.querySelector("#customerScheduleTimeline");
  if (!target) return;
  if (!view) {
    target.innerHTML = "";
    return;
  }
  const groups = groupItemsByDate(view.items || []);
  if (!groups.length || (groups.length === 1 && groups[0].key === "_invalid" && !(groups[0].items || []).length)) {
    target.innerHTML = `<div class="lhai-state lhai-state--empty">등록된 서비스 일정이 아직 없습니다. 운영팀이 구성 중이면 잠시 후 다시 확인해 주세요.</div>`;
    return;
  }
  const docLink = `<a class="lhai-button lhai-button--ghost lhai-schedule-doc-link" href="documents.html">문서 센터에서 서류 확인</a>`;
  const blocks = groups
    .map(({ key, items, anchorIso }) => {
      const title = key === "_invalid" ? "일정(시간 미확인)" : formatDayHeading(anchorIso || items[0]?.scheduled_start);
      const cards = (items || [])
        .map((it) => {
          const t0 = formatTimeLocal(it.scheduled_start);
          const t1 = formatTimeLocal(it.scheduled_end);
          const range = t0 && t1 ? `${t0} – ${t1}` : t0 || "시간 협의";
          const del = deliveryLabel(it.delivery_type);
          const doc = it.document_hint ? `<p class="lhai-schedule-card__doc">${safeText(it.document_hint)}</p>` : "";
          const note = it.customer_note ? `<p class="lhai-schedule-card__note">${safeText(it.customer_note)}</p>` : "";
          const dur = it.duration_label ? `<span class="lhai-schedule-card__dur">${safeText(it.duration_label)}</span>` : "";
          return `
            <li class="lhai-schedule-card">
              <div class="lhai-schedule-card__time">${safeText(range)} ${dur}</div>
              <div class="lhai-schedule-card__body">
                <h3 class="lhai-schedule-card__title">${safeText(it.service_name_snapshot || "서비스")}</h3>
                ${del ? `<p class="lhai-schedule-card__delivery">${del}</p>` : ""}
                ${note}
                ${doc}
              </div>
            </li>`;
        })
        .join("");
      return `
        <section class="lhai-schedule-day" data-date-key="${escapeAttr(key)}">
          <header class="lhai-schedule-day__head">
            <span class="lhai-schedule-day__dot" aria-hidden="true"></span>
            <h2 class="lhai-schedule-day__title">${safeText(title)}</h2>
          </header>
          <ol class="lhai-schedule-day__list">${cards}</ol>
        </section>`;
    })
    .join("");
  target.innerHTML = `
    <div class="lhai-schedule-timeline">${blocks}</div>
    <div class="lhai-schedule-doc-cta">${docLink}</div>
  `;
}

async function initSchedulePage() {
  if (!protectCurrentPage()) return;
  if (!ensureCustomerAccess()) return;
  await loadSidebar("#sidebar", "customer");
  applyI18nToDom(document);

  let selected = null;
  const refresh = async () => {
    const cp = getCustomerMessagingProfileId();
    setFeedbackStatus("");
    try {
      if (scheduleIdFromUrl) {
        selected = await customerScheduleApi.get(scheduleIdFromUrl, cp);
      } else {
        const schedules = await customerScheduleApi.list(cp);
        selected = schedules[0] || null;
      }
    } catch {
      selected = null;
      if (scheduleIdFromUrl) {
        setFeedbackStatus("일정을 불러오지 못했습니다. 로그인·권한을 확인하거나 고객센터로 문의해 주세요.");
      }
    }
    renderSummary(selected);
    renderTimeline(selected);
  };

  document.querySelector("#customerScheduleFeedbackForm")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!selected?.id) return setFeedbackStatus("업데이트할 일정이 없습니다.");
    const input = document.querySelector("#customerScheduleFeedbackInput");
    const feedback = input instanceof HTMLTextAreaElement ? input.value.trim() : "";
    if (!feedback) return setFeedbackStatus("조정 요청 내용을 입력해 주세요.");
    try {
      await scheduleApi.requestAdjustment(selected.id, feedback);
      setFeedbackStatus("조정 요청이 전달되었습니다. 담당자 확인 후 연락드릴 수 있어요.");
    } catch {
      setFeedbackStatus("조정 요청 전송에 실패했습니다. 잠시 후 다시 시도하거나 메시지로 문의해 주세요.");
    }
    if (input instanceof HTMLTextAreaElement) input.value = "";
    await refresh();
  });

  await refresh();
}

export { initSchedulePage };

initSchedulePage();
