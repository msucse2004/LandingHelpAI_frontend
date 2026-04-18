import { customerScheduleApi, scheduleApi } from "../core/api.js";
import { getCustomerMessagingProfileId } from "../core/auth.js";
import { loadSidebar } from "../components/sidebar.js";
import { applyI18nToDom } from "../core/i18n-dom.js";
import { ensureCustomerAccess, protectCurrentPage } from "../core/guards.js";
import { formatDate, safeText } from "../core/utils.js";

const urlParams = new URLSearchParams(window.location.search);
const scheduleIdFromUrl = String(urlParams.get("schedule_id") || urlParams.get("id") || "").trim();
const CAL_HOUR_START = 6;
const CAL_HOUR_END = 20;
/** @type {Date} */
let customerCalWeekStart = new Date();
let customerCalendarView = "monthly";

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

function getStartOfWeekMonday(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  const dow = x.getDay();
  const diff = (dow + 6) % 7;
  x.setDate(x.getDate() - diff);
  return x;
}

function addDays(base, days) {
  const x = new Date(base);
  x.setDate(x.getDate() + days);
  return x;
}

function addMonths(base, months) {
  const x = new Date(base);
  x.setMonth(x.getMonth() + months);
  return x;
}

function nthWeekdayOfMonth(year, monthZeroBased, weekdaySun0, nth) {
  const first = new Date(year, monthZeroBased, 1);
  const firstDow = first.getDay();
  const delta = (weekdaySun0 - firstDow + 7) % 7;
  return 1 + delta + (nth - 1) * 7;
}

function lastWeekdayOfMonth(year, monthZeroBased, weekdaySun0) {
  const last = new Date(year, monthZeroBased + 1, 0);
  const diff = (last.getDay() - weekdaySun0 + 7) % 7;
  return last.getDate() - diff;
}

function usFederalHolidayNameLocal(d) {
  const y = d.getFullYear();
  const m = d.getMonth() + 1;
  const day = d.getDate();
  const dow = d.getDay();
  const fixed = `${m}-${day}`;
  if (fixed === "1-1") return "New Year";
  if (fixed === "6-19") return "Juneteenth";
  if (fixed === "7-4") return "Independence Day";
  if (fixed === "11-11") return "Veterans Day";
  if (fixed === "12-25") return "Christmas";
  if (m === 1 && day === nthWeekdayOfMonth(y, 0, 1, 3)) return "MLK Day";
  if (m === 2 && day === nthWeekdayOfMonth(y, 1, 1, 3)) return "Presidents Day";
  if (m === 5 && day === lastWeekdayOfMonth(y, 4, 1)) return "Memorial Day";
  if (m === 9 && day === nthWeekdayOfMonth(y, 8, 1, 1)) return "Labor Day";
  if (m === 10 && day === nthWeekdayOfMonth(y, 9, 1, 2)) return "Columbus Day";
  if (m === 11 && day === nthWeekdayOfMonth(y, 10, 4, 4)) return "Thanksgiving";
  // Observed rules for fixed-date holidays
  if (dow === 5) {
    const next = new Date(y, m - 1, day + 1);
    const nfixed = `${next.getMonth() + 1}-${next.getDate()}`;
    if (nfixed === "1-1") return "New Year (Observed)";
    if (nfixed === "6-19") return "Juneteenth (Observed)";
    if (nfixed === "7-4") return "Independence Day (Observed)";
    if (nfixed === "11-11") return "Veterans Day (Observed)";
    if (nfixed === "12-25") return "Christmas (Observed)";
  } else if (dow === 1) {
    const prev = new Date(y, m - 1, day - 1);
    const pfixed = `${prev.getMonth() + 1}-${prev.getDate()}`;
    if (pfixed === "1-1") return "New Year (Observed)";
    if (pfixed === "6-19") return "Juneteenth (Observed)";
    if (pfixed === "7-4") return "Independence Day (Observed)";
    if (pfixed === "11-11") return "Veterans Day (Observed)";
    if (pfixed === "12-25") return "Christmas (Observed)";
  }
  return "";
}

function calendarToneClassLocal(d) {
  if (usFederalHolidayNameLocal(d) || d.getDay() === 0) return "is-holiday";
  if (d.getDay() === 6) return "is-saturday";
  return "";
}

function sameLocalDay(a, b) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function blockLayoutLocal(item) {
  const s = new Date(item.scheduled_start || "");
  if (Number.isNaN(s.getTime())) return null;
  const e = new Date(item.scheduled_end || "");
  const startM = s.getHours() * 60 + s.getMinutes();
  let endM = e instanceof Date && !Number.isNaN(e.getTime()) ? e.getHours() * 60 + e.getMinutes() : startM + 60;
  if (endM <= startM) endM = startM + 60;
  const windowStart = CAL_HOUR_START * 60;
  const windowEnd = CAL_HOUR_END * 60;
  const clampedStart = Math.min(windowEnd, Math.max(windowStart, startM));
  const clampedEnd = Math.min(windowEnd, Math.max(clampedStart + 15, endM));
  const span = windowEnd - windowStart;
  const topPct = ((clampedStart - windowStart) / span) * 100;
  const hPct = ((clampedEnd - clampedStart) / span) * 100;
  return { topPct, hPct: Math.max(hPct, 5) };
}

function weeklyHeader(mon, dayCount) {
  const dayNames = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  let head = `<div class="lhai-cs-week-head__corner"></div>`;
  for (let i = 0; i < dayCount; i += 1) {
    const d = addDays(mon, i);
    const tone = calendarToneClassLocal(d);
    const holiday = usFederalHolidayNameLocal(d);
    head += `<div class="lhai-cs-week-head__day ${tone}"><strong>${dayNames[i]}</strong> ${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}${holiday ? ` <span class="lhai-cs-holiday-name">${safeText(holiday)}</span>` : ""}</div>`;
  }
  return head;
}

function renderTimeRail() {
  let rail = "";
  for (let h = CAL_HOUR_START; h < CAL_HOUR_END; h += 1) {
    rail += `<div class="lhai-cs-time-rail__tick">${String(h).padStart(2, "0")}:00</div>`;
  }
  return rail;
}

function renderWeekLikeGrid(view, mon, dayCount) {
  const grid = document.querySelector("#customerScheduleCalendar");
  if (!grid) return;
  const head = weeklyHeader(mon, dayCount);
  const rail = renderTimeRail();
  let daysHtml = "";
  for (let i = 0; i < dayCount; i += 1) {
    const day = addDays(mon, i);
    const blocks = view.items
      .filter((it) => {
        const st = new Date(it.scheduled_start || "");
        return !Number.isNaN(st.getTime()) && sameLocalDay(st, day);
      })
      .map((it) => {
        const layout = blockLayoutLocal(it);
        if (!layout) return "";
        return `<div class="lhai-cs-block" style="top:${layout.topPct.toFixed(2)}%;height:${layout.hPct.toFixed(2)}%;">
          <span class="lhai-cs-block__title">${safeText(it.service_name_snapshot || "서비스")}</span>
        </div>`;
      })
      .join("");
    daysHtml += `<div class="lhai-cs-day"><div class="lhai-cs-day-slots">${blocks}</div></div>`;
  }
  grid.innerHTML = `
    <div class="lhai-cs-week-head lhai-cs-week-head--${dayCount}">${head}</div>
    <div class="lhai-cs-week-body lhai-cs-week-body--${dayCount}">
      <div class="lhai-cs-time-rail">${rail}</div>
      ${daysHtml}
    </div>
  `;
}

function renderMonthlyGrid(view, anchorDate) {
  const labelEl = document.querySelector("#customerCalWeekLabel");
  const grid = document.querySelector("#customerScheduleCalendar");
  if (!labelEl || !grid) return;
  const monthStart = new Date(anchorDate.getFullYear(), anchorDate.getMonth(), 1);
  const monthEnd = new Date(anchorDate.getFullYear(), anchorDate.getMonth() + 1, 0);
  labelEl.textContent = `${monthStart.getFullYear()}-${String(monthStart.getMonth() + 1).padStart(2, "0")}`;

  const first = getStartOfWeekMonday(monthStart);
  let cells = "";
  for (let i = 0; i < 42; i += 1) {
    const d = addDays(first, i);
    const inMonth = d >= monthStart && d <= monthEnd;
    const tone = calendarToneClassLocal(d);
    const holiday = usFederalHolidayNameLocal(d);
    const dayItems = view.items.filter((it) => {
      const st = new Date(it.scheduled_start || "");
      return !Number.isNaN(st.getTime()) && sameLocalDay(st, d);
    });
    const blocks = dayItems
      .slice(0, 3)
      .map((it) => `<span class="lhai-cs-month-item">${safeText(it.service_name_snapshot || "서비스")}</span>`)
      .join("");
    const more = dayItems.length > 3 ? `<span class="lhai-cs-month-more">+${dayItems.length - 3}</span>` : "";
    cells += `<div class="lhai-cs-month-cell ${inMonth ? "" : "is-muted"}">
      <div class="lhai-cs-month-date ${tone}">${d.getDate()}${holiday ? ` <span class="lhai-cs-holiday-name">${safeText(holiday)}</span>` : ""}</div>
      <div class="lhai-cs-month-items">${blocks}${more}</div>
    </div>`;
  }
  grid.innerHTML = `
    <div class="lhai-cs-month-head">
      <span>Mon</span><span>Tue</span><span>Wed</span><span>Thu</span><span>Fri</span><span>Sat</span><span>Sun</span>
    </div>
    <div class="lhai-cs-month-grid">${cells}</div>
  `;
}

function syncCalendarViewButtons() {
  document.querySelectorAll(".lhai-cs-view-btn").forEach((btn) => {
    const isActive = btn.getAttribute("data-view") === customerCalendarView;
    btn.classList.toggle("is-active", isActive);
    btn.setAttribute("aria-selected", isActive ? "true" : "false");
  });
}

function renderReadOnlyCalendar(view) {
  const labelEl = document.querySelector("#customerCalWeekLabel");
  const grid = document.querySelector("#customerScheduleCalendar");
  if (!labelEl || !grid) return;
  if (!view || !Array.isArray(view.items)) {
    labelEl.textContent = "";
    grid.innerHTML = `<div class="lhai-state lhai-state--empty">표시할 일정이 없습니다.</div>`;
    return;
  }

  const mon = new Date(customerCalWeekStart);
  if (customerCalendarView === "daily") {
    labelEl.textContent = `${mon.getFullYear()}-${String(mon.getMonth() + 1).padStart(2, "0")}-${String(mon.getDate()).padStart(2, "0")}`;
    renderWeekLikeGrid(view, mon, 1);
    return;
  }
  if (customerCalendarView === "monthly") {
    renderMonthlyGrid(view, mon);
    return;
  }
  const sun = addDays(mon, 6);
  labelEl.textContent = `${mon.getFullYear()}-${String(mon.getMonth() + 1).padStart(2, "0")}-${String(mon.getDate()).padStart(2, "0")} → ${sun.getFullYear()}-${String(sun.getMonth() + 1).padStart(2, "0")}-${String(sun.getDate()).padStart(2, "0")}`;
  renderWeekLikeGrid(view, mon, 7);
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
    if (selected?.items?.length) {
      const first = selected.items
        .map((it) => new Date(it.scheduled_start || ""))
        .find((d) => !Number.isNaN(d.getTime()));
      if (first) customerCalWeekStart = getStartOfWeekMonday(first);
    }
    renderSummary(selected);
    renderReadOnlyCalendar(selected);
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

  document.querySelector("#customerCalPrev")?.addEventListener("click", () => {
    if (customerCalendarView === "daily") customerCalWeekStart = addDays(customerCalWeekStart, -1);
    else if (customerCalendarView === "monthly") customerCalWeekStart = addMonths(customerCalWeekStart, -1);
    else customerCalWeekStart = addDays(customerCalWeekStart, -7);
    renderReadOnlyCalendar(selected);
  });
  document.querySelector("#customerCalNext")?.addEventListener("click", () => {
    if (customerCalendarView === "daily") customerCalWeekStart = addDays(customerCalWeekStart, 1);
    else if (customerCalendarView === "monthly") customerCalWeekStart = addMonths(customerCalWeekStart, 1);
    else customerCalWeekStart = addDays(customerCalWeekStart, 7);
    renderReadOnlyCalendar(selected);
  });
  document.querySelectorAll(".lhai-cs-view-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const view = btn.getAttribute("data-view");
      if (!view || view === customerCalendarView) return;
      customerCalendarView = view;
      syncCalendarViewButtons();
      renderReadOnlyCalendar(selected);
    });
  });
  syncCalendarViewButtons();

  await refresh();
}

export { initSchedulePage };

initSchedulePage();
