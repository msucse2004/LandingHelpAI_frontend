import { scheduleApi, quoteApi } from "../core/api.js";
import { loadSidebar } from "../components/sidebar.js";
import { applyI18nToDom } from "../core/i18n-dom.js";
import { ensureAdminAccess, protectCurrentPage } from "../core/guards.js";
import { formatDate, safeText } from "../core/utils.js";

const HOUR_START = 6;
const HOUR_END = 20;

/** Two-letter US state / DC → primary IANA zone (simplified; split states use most common zone). */
const US_STATE_TO_IANA = {
  AK: "America/Anchorage",
  AL: "America/Chicago",
  AR: "America/Chicago",
  AZ: "America/Phoenix",
  CA: "America/Los_Angeles",
  CO: "America/Denver",
  CT: "America/New_York",
  DC: "America/New_York",
  DE: "America/New_York",
  FL: "America/New_York",
  GA: "America/New_York",
  HI: "Pacific/Honolulu",
  IA: "America/Chicago",
  ID: "America/Boise",
  IL: "America/Chicago",
  IN: "America/Indiana/Indianapolis",
  KS: "America/Chicago",
  KY: "America/New_York",
  LA: "America/Chicago",
  MA: "America/New_York",
  MD: "America/New_York",
  ME: "America/New_York",
  MI: "America/Detroit",
  MN: "America/Chicago",
  MO: "America/Chicago",
  MS: "America/Chicago",
  MT: "America/Denver",
  NC: "America/New_York",
  ND: "America/Chicago",
  NE: "America/Chicago",
  NH: "America/New_York",
  NJ: "America/New_York",
  NM: "America/Denver",
  NV: "America/Los_Angeles",
  NY: "America/New_York",
  OH: "America/New_York",
  OK: "America/Chicago",
  OR: "America/Los_Angeles",
  PA: "America/New_York",
  RI: "America/New_York",
  SC: "America/New_York",
  SD: "America/Chicago",
  TN: "America/Chicago",
  TX: "America/Chicago",
  UT: "America/Denver",
  VA: "America/New_York",
  VT: "America/New_York",
  WA: "America/Los_Angeles",
  WI: "America/Chicago",
  WV: "America/New_York",
  WY: "America/Denver",
};

const WD_MON0 = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 };

function isValidIanaTimeZone(tz) {
  if (!tz || typeof tz !== "string") return false;
  const t = tz.trim();
  if (!t || t.toUpperCase() === "UTC") return true;
  try {
    Intl.DateTimeFormat(undefined, { timeZone: t });
    return true;
  } catch {
    return false;
  }
}

function partsInZone(ms, timeZone) {
  const f = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
  });
  const parts = f.formatToParts(new Date(ms));
  const g = (ty) => parts.find((x) => x.type === ty)?.value;
  return {
    y: Number(g("year")),
    m: Number(g("month")),
    d: Number(g("day")),
    hour: Number(g("hour")),
    minute: Number(g("minute")),
    second: Number(g("second") || 0),
    weekday: g("weekday"),
  };
}

function civilDaysBetween(y1, m1, d1, y2, m2, d2) {
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86400000);
}

function addCivilDays(y, m, d, delta) {
  const x = new Date(Date.UTC(y, m - 1, d + delta));
  return { y: x.getUTCFullYear(), m: x.getUTCMonth() + 1, d: x.getUTCDate() };
}

/**
 * UTC millis for wall-clock y-m-d hh:mm:ss in `timeZone` (iterative; handles DST).
 */
function utcAtLocalWallClock(timeZone, y, m, d, hh, mm, ss) {
  let ms = Date.UTC(y, m - 1, d, hh, mm, ss);
  for (let i = 0; i < 32; i += 1) {
    const p = partsInZone(ms, timeZone);
    if (p.y === y && p.m === m && p.d === d && p.hour === hh && p.minute === mm && p.second === ss) {
      return ms;
    }
    const dayAdj = civilDaysBetween(p.y, p.m, p.d, y, m, d) * 86400000;
    const secAdj = (hh * 3600 + mm * 60 + ss - (p.hour * 3600 + p.minute * 60 + p.second)) * 1000;
    ms += dayAdj + secAdj;
  }
  return ms;
}

function startOfWeekMondayContaining(anchorMs, timeZone) {
  const p = partsInZone(anchorMs, timeZone);
  const dow = p.weekday != null ? WD_MON0[p.weekday] : undefined;
  if (dow === undefined) {
    const d = new Date(anchorMs);
    const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
    const ud = x.getUTCDay();
    const diff = (ud + 6) % 7;
    x.setUTCDate(x.getUTCDate() - diff);
    return x.getTime();
  }
  const mon = addCivilDays(p.y, p.m, p.d, -dow);
  return utcAtLocalWallClock(timeZone, mon.y, mon.m, mon.d, 0, 0, 0);
}

function sameZonedCalendarDay(utcMsA, utcMsB, timeZone) {
  const pa = partsInZone(utcMsA, timeZone);
  const pb = partsInZone(utcMsB, timeZone);
  return pa.y === pb.y && pa.m === pb.m && pa.d === pb.d;
}

function formatDateInZone(dateLike, timeZone) {
  const d = dateLike instanceof Date ? dateLike : new Date(dateLike);
  if (Number.isNaN(d.getTime())) return "-";
  return new Intl.DateTimeFormat(undefined, { timeZone, year: "numeric", month: "short", day: "numeric" }).format(d);
}

function formatDateTimeInZone(dateLike, timeZone) {
  const d = dateLike instanceof Date ? dateLike : new Date(dateLike);
  if (Number.isNaN(d.getTime())) return "-";
  return new Intl.DateTimeFormat(undefined, {
    timeZone,
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(d);
}

function formatReasonLineForDisplay(text, timeZone) {
  return String(text).replace(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z/g, (match) => {
    const d = parseIsoUtc(match);
    return d ? formatDateTimeInZone(d, timeZone) : match;
  });
}

function getBuilderTimeZone() {
  const code = usStateHint().toUpperCase();
  if (code && US_STATE_TO_IANA[code]) return US_STATE_TO_IANA[code];
  const fromSchedule = schedule?.timezone && String(schedule.timezone).trim();
  if (fromSchedule && fromSchedule.toUpperCase() !== "UTC" && isValidIanaTimeZone(fromSchedule)) {
    return fromSchedule;
  }
  return "UTC";
}

function getBuilderTimeZoneLabel() {
  const tz = getBuilderTimeZone();
  if (tz === "UTC") return "UTC";
  const state = usStateHint();
  return state ? `${tz} · ${state}` : tz;
}

/** @type {object | null} */
let schedule = null;
/** @type {object | null} */
let quoteDetail = null;
/** @type {Array<object>} */
let workingItems = [];
/** @type {Set<string>} */
const dirtyIds = new Set();
/** @type {string} */
let selectedId = "";
/** @type {Date} */
let weekStart = new Date();

const MSG_UNSAVED_LEAVE_LIST =
  "저장하지 않은 변경 사항(일정 위치·노트 등)이 있습니다. 일정 관리 화면으로 나가면 이 수정 내용은 모두 사라집니다. 나갈까요?";
const MSG_UNSAVED_RESET =
  "저장하지 않은 로컬 변경(일정 위치·노트 등)이 있습니다. 리셋하면 서버에 저장된 일정으로 덮어쓰여 이 변경은 사라집니다. 계속할까요?";

function hasUnsavedBuilderChanges() {
  return dirtyIds.size > 0;
}

function getQueryScheduleId() {
  const q = new URLSearchParams(window.location.search);
  return String(q.get("schedule_id") || q.get("id") || "").trim();
}

function parseIsoUtc(s) {
  if (!s || !String(s).trim()) return null;
  const d = new Date(String(s).trim());
  return Number.isNaN(d.getTime()) ? null : d;
}

function isoUtcZ(d) {
  return d.toISOString().replace(/\.\d{3}Z$/, "Z");
}

function blockLayout(item, timeZone) {
  const start = parseIsoUtc(item.scheduled_start);
  if (!start) return null;
  let end = parseIsoUtc(item.scheduled_end);
  if (!end) {
    const dm = Number(item.duration_minutes) > 0 ? Number(item.duration_minutes) : 120;
    end = new Date(start.getTime() + dm * 60000);
  }
  const sp = partsInZone(start.getTime(), timeZone);
  const ep = partsInZone(end.getTime(), timeZone);
  const startM = sp.hour * 60 + sp.minute;
  let endM = ep.hour * 60 + ep.minute;
  if (end <= start) endM = startM + 60;
  if (ep.y !== sp.y || ep.m !== sp.m || ep.d !== sp.d) {
    endM = HOUR_END * 60;
  }
  const windowStart = HOUR_START * 60;
  const windowEnd = HOUR_END * 60;
  const clampedStart = Math.min(windowEnd, Math.max(windowStart, startM));
  const clampedEnd = Math.min(windowEnd, Math.max(clampedStart + 15, endM));
  const span = windowEnd - windowStart;
  const topPct = ((clampedStart - windowStart) / span) * 100;
  const hPct = ((clampedEnd - clampedStart) / span) * 100;
  return { topPct, hPct: Math.max(hPct, 5) };
}

function snapToQuarterMinutes(minutes) {
  return Math.round(minutes / 15) * 15;
}

/**
 * Column = one calendar day in `timeZone`; vertical position = local start time in [HOUR_START, HOUR_END] (15-minute snap).
 * Stored times remain UTC ISO Z on the server.
 */
function applyDropAtSlot(item, civilY, civilM, civilD, clientY, slotsElement, timeZone) {
  const dm = Number(item.duration_minutes) > 0 ? Number(item.duration_minutes) : 120;
  const rect = slotsElement.getBoundingClientRect();
  const y = clientY - rect.top;
  const frac = rect.height > 0 ? Math.max(0, Math.min(1, y / rect.height)) : 0.5;

  const bandStartMin = HOUR_START * 60;
  const bandEndMin = HOUR_END * 60;
  const bandLen = bandEndMin - bandStartMin;

  let startMin = bandStartMin + frac * bandLen;
  startMin = snapToQuarterMinutes(startMin);
  const latestStart = bandEndMin - dm;
  startMin = Math.max(bandStartMin, Math.min(Math.max(bandStartMin, latestStart), startMin));

  const h = Math.floor(startMin / 60);
  const m = startMin % 60;
  const startMs = utcAtLocalWallClock(timeZone, civilY, civilM, civilD, h, m, 0);
  const next = new Date(startMs);
  item.scheduled_start = isoUtcZ(next);
  item.scheduled_end = isoUtcZ(new Date(startMs + dm * 60000));
}

function clearScheduleDragState() {
  document.body.classList.remove("lhai-sb-is-dragging");
  document.querySelectorAll(".lhai-sb-block--drag-source").forEach((el) => el.classList.remove("lhai-sb-block--drag-source"));
  document.querySelectorAll(".lhai-sb-card--drag-source").forEach((el) => el.classList.remove("lhai-sb-card--drag-source"));
  document.querySelectorAll(".lhai-sb-day-slots--drop-target").forEach((el) => el.classList.remove("lhai-sb-day-slots--drop-target"));
  document.querySelectorAll(".lhai-sb-day--drop-target").forEach((el) => el.classList.remove("lhai-sb-day--drop-target"));
}

function beginScheduleDrag() {
  document.body.classList.add("lhai-sb-is-dragging");
}

function itemById(id) {
  return workingItems.find((x) => x.id === id) || null;
}

/** Prevent breaking textarea / HTML when notes contain `<` or `&`. */
function escapeForRcData(s) {
  return String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;");
}

function setStatus(msg) {
  const el = document.querySelector("#builderStatus");
  if (el) el.textContent = msg || "";
}

function renderEditHistory() {
  const root = document.querySelector("#builderEditHistory");
  if (!root || !schedule) return;
  const events = Array.isArray(schedule.edit_events) ? [...schedule.edit_events] : [];
  events.sort((a, b) => String(b.created_at || "").localeCompare(String(a.created_at || "")));
  const slice = events.slice(0, 25);
  if (!slice.length) {
    root.innerHTML = `<div class="u-text-muted">No edit events yet.</div>`;
    return;
  }
  root.innerHTML = slice
    .map((ev) => {
      const item = ev.schedule_item_id ? safeText(ev.schedule_item_id).slice(0, 8) + "…" : "—";
      const at = ev.created_at ? formatDate(ev.created_at) : "—";
      return `<div class="lhai-sb-history__row"><span class="u-text-muted">${safeText(at)}</span><span><span class="lhai-sb-history__action">${safeText(ev.action_type || "")}</span> · item ${item}</span></div>`;
    })
    .join("");
}

function surveyCommonFromQuoteDetail() {
  const rd = quoteDetail?.request_details;
  if (!rd || typeof rd !== "object") return {};
  const ss = rd.survey_submission;
  if (!ss || typeof ss !== "object") return {};
  const ci = ss.common_info;
  return ci && typeof ci === "object" ? ci : {};
}

/** Part shown in parentheses; strips `profile::` when present (e.g. email/username). */
function customerAccountIdForDisplay() {
  const raw = schedule?.customer_profile_id ? String(schedule.customer_profile_id).trim() : "";
  if (!raw) return "";
  if (raw.toLowerCase().startsWith("profile::")) {
    const rest = raw.slice("profile::".length).trim();
    return rest || raw;
  }
  return raw;
}

/** "First Last (accountId)" for the context bar; falls back to account id or profile id. */
function customerDisplayName() {
  const common = surveyCommonFromQuoteDetail();
  const fn = String(common.profile_first_name || "").trim();
  const ln = String(common.profile_last_name || "").trim();
  let name = [fn, ln].filter(Boolean).join(" ").trim();

  const rd = quoteDetail?.request_details;
  const profile = rd && typeof rd === "object" ? rd.profile : null;
  if (!name && profile && typeof profile === "object") {
    const pFn = String(profile.first_name || "").trim();
    const pLn = String(profile.last_name || "").trim();
    name = [pFn, pLn].filter(Boolean).join(" ").trim();
    if (!name && typeof profile.full_name === "string") name = profile.full_name.trim();
  }

  const acct = customerAccountIdForDisplay();
  if (name && acct) return `${name} (${acct})`;
  if (name) return name;
  if (acct) return acct;
  return "—";
}

function contextSnapshot() {
  const d = schedule?.draft;
  return d && typeof d === "object" && d.context_snapshot && typeof d.context_snapshot === "object"
    ? d.context_snapshot
    : {};
}

function entryDateLabel() {
  const snap = contextSnapshot();
  const iso = snap.entry_anchor_iso;
  const tz = getBuilderTimeZone();
  if (iso && String(iso).trim()) {
    const d = parseIsoUtc(iso);
    if (d) return `${formatDateInZone(d, tz)} (anchor)`;
    return safeText(iso);
  }
  const rd = quoteDetail?.request_details?.schedule;
  if (rd && rd.entry_date) return `${safeText(rd.entry_date)} (quote)`;
  return "—";
}

function usStateHint() {
  const snap = contextSnapshot();
  const c = snap.us_state_code_hint;
  return c && String(c).trim() ? String(c).trim() : "";
}

function releaseVersionSummary() {
  if (!schedule) return "—";
  const rvs = schedule.release_versions || [];
  if (!rvs.length) return "None yet";
  const nums = rvs.map((r) => Number(r.version_number) || 0);
  const maxv = Math.max(...nums);
  return `${rvs.length} saved · latest v${maxv}`;
}

function updateWorkflowControls() {
  const btn = document.querySelector("#builderReleaseBtn");
  if (!schedule) return;
  const st = String(schedule.status || "");
  const locked = st === "CONFIRMED";

  const releasable = st === "DRAFT" || st === "REVISED" || st === "PROPOSED";
  if (btn instanceof HTMLButtonElement) {
    btn.disabled = !releasable || locked;
    btn.title = locked
      ? "최종 확정됨 — 이 화면에서 고객 공개를 진행할 수 없습니다."
      : !releasable
        ? "현재 상태에서는 고객 공개를 사용할 수 없습니다."
        : "저장되지 않은 변경이 있으면 먼저 서버에 저장한 뒤 버전을 공개하고 고객 알림을 보냅니다.";
  }
}

/** @param {boolean} [skipWorkflowControls] When true, do not toggle header buttons (e.g. during release+flush). */
function renderContext(skipWorkflowControls = false) {
  const root = document.querySelector("#builderContext");
  if (!root || !schedule) return;
  const stateHint = usStateHint();
  root.innerHTML = `
    <div class="lhai-sb-context__cell">
      <span class="lhai-sb-context__label">Customer</span>
      <span class="lhai-sb-context__value">${safeText(customerDisplayName())}</span>
    </div>
    <div class="lhai-sb-context__cell">
      <span class="lhai-sb-context__label">Entry / anchor</span>
      <span class="lhai-sb-context__value">${safeText(entryDateLabel())}${stateHint ? ` · ${safeText(stateHint)}` : ""}</span>
    </div>
    <div class="lhai-sb-context__cell">
      <span class="lhai-sb-context__label">Schedule status</span>
      <span class="lhai-sb-context__value lhai-sb-context__value--status">${safeText(schedule.status)}</span>
    </div>
    <div class="lhai-sb-context__cell">
      <span class="lhai-sb-context__label">Released versions</span>
      <span class="lhai-sb-context__value">${safeText(releaseVersionSummary())}</span>
    </div>
  `;
  if (!skipWorkflowControls) updateWorkflowControls();
}

function formatDuration(item) {
  if (item.duration_label && String(item.duration_label).trim()) return safeText(item.duration_label);
  const m = Number(item.duration_minutes);
  if (m > 0) return `${m} min`;
  return "—";
}

function formatSlotLine(item) {
  const a = parseIsoUtc(item.scheduled_start);
  if (!a) return "Unscheduled — drop on calendar";
  const tz = getBuilderTimeZone();
  return formatDateTimeInZone(a, tz);
}

function formatSlotRange(item) {
  const a = parseIsoUtc(item.scheduled_start);
  const b = parseIsoUtc(item.scheduled_end);
  const tz = getBuilderTimeZone();
  if (!a) return formatSlotLine(item);
  const tm = { timeZone: tz, hour: "2-digit", minute: "2-digit", hourCycle: "h23" };
  const sh = new Intl.DateTimeFormat(undefined, tm).format(a);
  const tzLine = new Intl.DateTimeFormat(undefined, { timeZone: tz, timeZoneName: "short" }).format(a);
  const abbrev = tzLine.includes(",") ? tzLine.split(", ").pop() : tzLine;
  if (!b) return `${formatDateInZone(a, tz)} ${sh} (${abbrev || tz})`;
  const eh = new Intl.DateTimeFormat(undefined, tm).format(b);
  return `${formatDateInZone(a, tz)} ${sh}–${eh} (${abbrev || tz})`;
}

function prereqHint(item) {
  const p = item.prerequisites_json;
  if (!p || typeof p !== "object") return "";
  const role = p.suggestion_role;
  if (role && String(role).trim()) return `Role: ${safeText(role)}`;
  return "";
}

function renderLeft() {
  const root = document.querySelector("#builderLeftList");
  if (!root) return;
  const items = [...workingItems].sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
  root.innerHTML = items
    .map((it) => {
      const unsched = !parseIsoUtc(it.scheduled_start);
      const hint = prereqHint(it);
      return `
      <div class="lhai-sb-card ${it.id === selectedId ? "is-selected" : ""}" draggable="true" data-item-id="${safeText(it.id)}">
        <div class="lhai-sb-card__name">${safeText(it.service_name_snapshot || "Service")}</div>
        <div class="lhai-sb-card__row">Delivery: ${safeText(it.delivery_type || "—")}</div>
        <div class="lhai-sb-card__row">${safeText(formatSlotLine(it))}</div>
        <div class="lhai-sb-card__row">Duration: ${safeText(formatDuration(it))}</div>
        ${hint ? `<div class="lhai-sb-card__row">${hint}</div>` : ""}
        ${unsched ? `<span class="lhai-sb-card__badge">Unscheduled</span>` : ""}
      </div>`;
    })
    .join("");

  root.querySelectorAll(".lhai-sb-card").forEach((el) => {
    el.addEventListener("click", () => {
      selectedId = el.getAttribute("data-item-id") || "";
      renderLeft();
      renderWeek();
      renderRight();
    });
    el.addEventListener("dragstart", (ev) => {
      el.classList.add("lhai-sb-card--drag-source");
      beginScheduleDrag();
      const id = el.getAttribute("data-item-id") || "";
      const payload = JSON.stringify({ itemId: id, source: "list" });
      ev.dataTransfer.setData("application/json", payload);
      ev.dataTransfer.setData("text/plain", id);
      ev.dataTransfer.effectAllowed = "move";
    });
    el.addEventListener("dragend", () => {
      clearScheduleDragState();
    });
  });
}

function renderWeek() {
  const labelEl = document.querySelector("#builderWeekLabel");
  const grid = document.querySelector("#builderWeekGrid");
  if (!labelEl || !grid) return;

  const tz = getBuilderTimeZone();
  const monParts = partsInZone(weekStart.getTime(), tz);
  const sunCivil = addCivilDays(monParts.y, monParts.m, monParts.d, 6);
  const sunLabel = `${sunCivil.y}-${String(sunCivil.m).padStart(2, "0")}-${String(sunCivil.d).padStart(2, "0")}`;
  const monLabel = `${monParts.y}-${String(monParts.m).padStart(2, "0")}-${String(monParts.d).padStart(2, "0")}`;
  labelEl.textContent = `${monLabel} → ${sunLabel} (${getBuilderTimeZoneLabel()})`;

  const dayNames = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  let head = `<div class="lhai-sb-week-head__corner"></div>`;
  for (let i = 0; i < 7; i += 1) {
    const c = addCivilDays(monParts.y, monParts.m, monParts.d, i);
    head += `<div class="lhai-sb-week-head__day"><strong>${dayNames[i]}</strong> ${String(c.m).padStart(2, "0")}-${String(c.d).padStart(2, "0")}</div>`;
  }

  let rail = "";
  for (let h = HOUR_START; h < HOUR_END; h += 1) {
    rail += `<div class="lhai-sb-time-rail__tick">${String(h).padStart(2, "0")}:00</div>`;
  }

  let daysHtml = "";
  for (let i = 0; i < 7; i += 1) {
    const colCivil = addCivilDays(monParts.y, monParts.m, monParts.d, i);
    const dayIso = `${colCivil.y}-${String(colCivil.m).padStart(2, "0")}-${String(colCivil.d).padStart(2, "0")}`;
    const colStartMs = utcAtLocalWallClock(tz, colCivil.y, colCivil.m, colCivil.d, 0, 0, 0);
    const blocks = workingItems
      .filter((it) => {
        const st = parseIsoUtc(it.scheduled_start);
        return st && sameZonedCalendarDay(st.getTime(), colStartMs, tz);
      })
      .map((it) => {
        const layout = blockLayout(it, tz);
        if (!layout) return "";
        const sel = it.id === selectedId ? " is-selected" : "";
        return `
          <div class="lhai-sb-block${sel}" draggable="true" data-item-id="${safeText(it.id)}"
            style="top:${layout.topPct.toFixed(2)}%;height:${layout.hPct.toFixed(2)}%;">
            <span class="lhai-sb-block__title">${safeText(it.service_name_snapshot || "Service")}</span>
            <span class="lhai-sb-block__meta">${safeText(it.delivery_type || "")}</span>
          </div>`;
      })
      .join("");

    daysHtml += `
      <div class="lhai-sb-day" data-day-root="1" data-day-iso="${dayIso}" tabindex="0" aria-label="Drop zone ${dayIso}">
        <div class="lhai-sb-day-slots">${blocks}</div>
      </div>`;
  }

  grid.innerHTML = `
    <div class="lhai-sb-week-head">${head}</div>
    <div class="lhai-sb-week-body">
      <div class="lhai-sb-time-rail">${rail}</div>
      ${daysHtml}
    </div>
  `;

  grid.querySelectorAll(".lhai-sb-block").forEach((el) => {
    el.addEventListener("click", (ev) => {
      ev.stopPropagation();
      selectedId = el.getAttribute("data-item-id") || "";
      renderLeft();
      renderWeek();
      renderRight();
    });
    el.addEventListener("dragstart", (ev) => {
      el.classList.add("lhai-sb-block--drag-source");
      beginScheduleDrag();
      const id = el.getAttribute("data-item-id") || "";
      const payload = JSON.stringify({ itemId: id, source: "grid" });
      ev.dataTransfer.setData("application/json", payload);
      ev.dataTransfer.setData("text/plain", id);
      ev.dataTransfer.effectAllowed = "move";
      ev.stopPropagation();
    });
    el.addEventListener("dragend", () => {
      clearScheduleDragState();
    });
  });

  grid.querySelectorAll(".lhai-sb-day-slots").forEach((slotsEl) => {
    const dayEl = slotsEl.closest(".lhai-sb-day");
    const iso = dayEl?.getAttribute("data-day-iso") || "";
    const parts = iso.split("-").map((x) => Number(x));
    const civilY = parts[0];
    const civilM = parts[1];
    const civilD = parts[2];
    if (!Number.isFinite(civilY) || !Number.isFinite(civilM) || !Number.isFinite(civilD)) return;

    slotsEl.addEventListener("dragover", (ev) => {
      ev.preventDefault();
      slotsEl.classList.add("lhai-sb-day-slots--drop-target");
      if (dayEl) dayEl.classList.add("lhai-sb-day--drop-target");
      ev.dataTransfer.dropEffect = "move";
    });
    slotsEl.addEventListener("dragleave", (ev) => {
      const rel = ev.relatedTarget;
      if (rel instanceof Node && slotsEl.contains(rel)) return;
      slotsEl.classList.remove("lhai-sb-day-slots--drop-target");
      if (dayEl) dayEl.classList.remove("lhai-sb-day--drop-target");
    });
    slotsEl.addEventListener("drop", (ev) => {
      ev.preventDefault();
      slotsEl.classList.remove("lhai-sb-day-slots--drop-target");
      if (dayEl) dayEl.classList.remove("lhai-sb-day--drop-target");
      let data = {};
      const jsonRaw = ev.dataTransfer.getData("application/json");
      if (jsonRaw) {
        try {
          data = JSON.parse(jsonRaw);
        } catch {
          data = {};
        }
      }
      const itemId = data.itemId || ev.dataTransfer.getData("text/plain");
      if (!itemId) return;
      const it = itemById(itemId);
      if (!it) return;
      applyDropAtSlot(it, civilY, civilM, civilD, ev.clientY, slotsEl, tz);
      dirtyIds.add(itemId);
      selectedId = itemId;
      setStatus("일정을 옮겼습니다. 반영하려면 「변경 저장」을 누르세요.");
      renderLeft();
      renderWeek();
      renderRight();
      updateWorkflowControls();
      /* innerHTML 교체로 dragend가 누락될 수 있어 드래그 상태를 여기서 반드시 해제 */
      clearScheduleDragState();
    });
  });
}

function itemReasonsList(item) {
  const p = item.prerequisites_json;
  if (!p || typeof p !== "object") return [];
  const r = p.suggestion_reasons;
  if (Array.isArray(r)) return r.map((x) => String(x));
  return [];
}

function docWarnings(item) {
  const d = item.document_requirements_summary_json;
  if (!d || typeof d !== "object") return [];
  const pending = d.pending_on_invoice_at_suggestion;
  const lines = [];
  if (typeof pending === "number" && pending > 0) {
    lines.push(`${pending} document(s) were pending when this draft was generated.`);
  }
  return lines;
}

function renderRight() {
  const root = document.querySelector("#builderRightPanel");
  if (!root) return;

  const globalReasons = Array.isArray(schedule?.recommendation_reasons) ? schedule.recommendation_reasons : [];
  const tz = getBuilderTimeZone();

  if (!selectedId) {
    root.innerHTML = `
      <p class="lhai-sb-right__empty">Select a service card or a block on the calendar.</p>
      <p class="lhai-sb-section-label">Draft recommendations</p>
      <ul class="lhai-sb-reasons">
        ${globalReasons.length ? globalReasons.map((r) => `<li>${safeText(formatReasonLineForDisplay(r, tz))}</li>`).join("") : "<li>No draft-level reasons recorded.</li>"}
      </ul>
    `;
    return;
  }

  const item = itemById(selectedId);
  if (!item) {
    root.innerHTML = `<p class="lhai-sb-right__empty">Item not found.</p>`;
    return;
  }

  const reasons = itemReasonsList(item);
  const warns = docWarnings(item);

  root.innerHTML = `
    <p class="lhai-sb-section-label">Draft recommendations</p>
    <ul class="lhai-sb-reasons">
      ${globalReasons.length ? globalReasons.map((r) => `<li>${safeText(formatReasonLineForDisplay(r, tz))}</li>`).join("") : "<li>—</li>"}
    </ul>
    <p class="lhai-sb-section-label">Why this slot (suggestion)</p>
    <ul class="lhai-sb-reasons">
      ${reasons.length ? reasons.map((r) => `<li>${safeText(formatReasonLineForDisplay(r, tz))}</li>`).join("") : "<li>No item-level reasons.</li>"}
    </ul>
    ${warns.length ? `<div class="lhai-sb-warn">${warns.map((w) => `<p>${safeText(w)}</p>`).join("")}</div>` : ""}
    <p class="lhai-sb-section-label">Card</p>
    <p><strong>${safeText(item.service_name_snapshot || "Service")}</strong></p>
    <p class="u-text-muted" style="font-size:0.8rem">${safeText(formatSlotRange(item))} · ${safeText(formatDuration(item))}</p>
    <p class="u-text-muted" style="font-size:0.72rem;line-height:1.35">${
      tz === "UTC"
        ? `Drag vertically in the week column to change <strong>UTC</strong> start time (${HOUR_START}:00–${HOUR_END}:00, 15-minute steps).`
        : `Drag vertically to change start time in <strong>destination local time</strong> (${HOUR_START}:00–${HOUR_END}:00, ${safeText(getBuilderTimeZoneLabel())}, 15-minute steps).`
    } Dragging from the list or moving a block uses the same rule.</p>
    <div class="lhai-sb-field lhai-field">
      <label class="lhai-label" for="builderInternalNote">내부 메모 (운영)</label>
      <p class="lhai-sb-note-hint u-text-muted">고객 화면에는 표시되지 않으며, 관리자·운영 목적으로만 사용됩니다.</p>
      <textarea id="builderInternalNote" class="lhai-input" data-note-field="internal">${escapeForRcData(item.internal_note || "")}</textarea>
    </div>
    <div class="lhai-sb-field lhai-field">
      <label class="lhai-label" for="builderCustomerNote">고객에게 전달되는 메시지 (선택)</label>
      <p class="lhai-sb-note-hint u-text-muted">일정을 여는 고객에게 보이는 안내 문구입니다.</p>
      <textarea id="builderCustomerNote" class="lhai-input" data-note-field="customer">${escapeForRcData(item.customer_note || "")}</textarea>
    </div>
    <button type="button" class="lhai-button lhai-button--secondary" id="builderApplyNotesBtn">메모 저장</button>
  `;

  document.querySelector("#builderApplyNotesBtn")?.addEventListener("click", async () => {
    const intEl = document.querySelector("#builderInternalNote");
    const custEl = document.querySelector("#builderCustomerNote");
    if (intEl instanceof HTMLTextAreaElement) item.internal_note = intEl.value;
    if (custEl instanceof HTMLTextAreaElement) item.customer_note = custEl.value;
    if (!schedule) return;
    dirtyIds.add(item.id);
    const btn = document.querySelector("#builderApplyNotesBtn");
    try {
      if (btn instanceof HTMLButtonElement) btn.disabled = true;
      setStatus("메모를 서버에 저장하는 중…");
      const r = await flushBuilderDraftToServer();
      if (!r.ok) {
        setStatus(`메모 저장 실패: ${r.message || ""}`);
        window.alert(`메모를 저장하지 못했습니다.\n${r.message || ""}`);
        return;
      }
      setStatus("메모를 서버에 저장했습니다. 다시 열어도 그대로 표시됩니다.");
      updateWorkflowControls();
    } finally {
      if (btn instanceof HTMLButtonElement) btn.disabled = false;
    }
  });
}

async function loadAll(scheduleId) {
  schedule = await scheduleApi.get(scheduleId);
  workingItems = JSON.parse(JSON.stringify(schedule.items || []));
  dirtyIds.clear();
  quoteDetail = null;
  const qid = schedule.related_quote_id;
  if (qid && String(qid).trim()) {
    try {
      quoteDetail = await quoteApi.getDetail(String(qid).trim());
    } catch {
      quoteDetail = null;
    }
  }

  const anchor = contextSnapshot().entry_anchor_iso;
  const ad = anchor ? parseIsoUtc(anchor) : null;
  const firstItemStart = workingItems.map((x) => parseIsoUtc(x.scheduled_start)).find(Boolean);
  const base = ad || firstItemStart || new Date();
  const tz = getBuilderTimeZone();
  weekStart = new Date(startOfWeekMondayContaining(base.getTime(), tz));

  const cp = schedule.customer_profile_id;
  const back = document.querySelector("#builderBackLink");
  if (back instanceof HTMLAnchorElement && cp) {
    back.href = `admin-schedules.html?customer_profile_id=${encodeURIComponent(cp)}`;
  }

  renderContext();
  renderLeft();
  renderWeek();
  renderRight();
  renderEditHistory();
  setStatus("불러왔습니다. 달력·노트를 수정한 뒤 「변경 저장」으로 서버에 반영하거나, 「리셋」으로 취소할 수 있습니다.");
}

function buildPatchPayload() {
  const items = [];
  for (const id of dirtyIds) {
    const it = itemById(id);
    if (!it) continue;
    const patch = { id: it.id };
    if (it.scheduled_start) patch.scheduled_start = it.scheduled_start;
    if (it.scheduled_end) patch.scheduled_end = it.scheduled_end;
    patch.internal_note = it.internal_note ?? "";
    patch.customer_note = it.customer_note ?? "";
    items.push(patch);
  }
  return { items };
}

/** Persist dirty cards/notes to the server. No-op if nothing dirty. Returns { ok, message? }. */
async function flushBuilderDraftToServer() {
  if (!schedule) return { ok: false, message: "일정이 로드되지 않았습니다." };
  if (!dirtyIds.size) return { ok: true };
  try {
    const body = buildPatchPayload();
    const updated = await scheduleApi.patchBuilder(schedule.id, body);
    if (Array.isArray(updated.items)) {
      schedule = updated;
      workingItems = JSON.parse(JSON.stringify(updated.items));
    } else {
      await loadAll(schedule.id);
    }
    dirtyIds.clear();
    renderContext(true);
    renderLeft();
    renderWeek();
    renderRight();
    renderEditHistory();
    return { ok: true };
  } catch (e) {
    const msg = e && typeof e.message === "string" ? e.message : String(e);
    return { ok: false, message: msg };
  }
}

async function init() {
  if (!protectCurrentPage()) return;
  if (!ensureAdminAccess()) return;
  await loadSidebar("#sidebar", "admin");
  applyI18nToDom(document);

  const scheduleId = getQueryScheduleId();
  if (!scheduleId) {
    setStatus("Missing schedule_id query parameter.");
    const ctx = document.querySelector("#builderContext");
    if (ctx) {
      ctx.innerHTML = `<div class="lhai-sb-context__cell"><span class="lhai-sb-context__value">Open this page from Schedule Management with a schedule id.</span></div>`;
    }
    return;
  }

  try {
    await loadAll(scheduleId);
  } catch (e) {
    const msg = e && typeof e.message === "string" ? e.message : String(e);
    setStatus(`Failed to load: ${msg}`);
    return;
  }

  window.addEventListener("dragend", clearScheduleDragState);

  document.querySelector("#builderBackLink")?.addEventListener("click", (ev) => {
    const a = ev.currentTarget;
    if (!(a instanceof HTMLAnchorElement)) return;
    if (!hasUnsavedBuilderChanges()) return;
    ev.preventDefault();
    if (!window.confirm(MSG_UNSAVED_LEAVE_LIST)) return;
    window.location.assign(a.href);
  });

  document.querySelector("#builderReleaseBtn")?.addEventListener("click", async () => {
    if (!schedule) return;
    const st = String(schedule.status || "");
    if (st === "CONFIRMED") return;
    const btn = document.querySelector("#builderReleaseBtn");
    const hadLocalChanges = dirtyIds.size > 0;
    try {
      if (btn instanceof HTMLButtonElement) btn.disabled = true;
      if (hadLocalChanges) {
        setStatus("저장 중… (고객 공개 전 서버에 반영합니다)");
        const flushed = await flushBuilderDraftToServer();
        if (!flushed.ok) {
          setStatus(`저장 실패: ${flushed.message || ""}`);
          window.alert(`변경 사항을 서버에 저장하지 못했습니다. 고객 공개를 중단합니다.\n${flushed.message || ""}`);
          return;
        }
      }
      await scheduleApi.releaseToCustomer(schedule.id, "");
      const cp = schedule?.customer_profile_id;
      const listUrl =
        cp && String(cp).trim()
          ? `admin-schedules.html?customer_profile_id=${encodeURIComponent(String(cp).trim())}`
          : "admin-schedules.html";
      const doneMsg = hadLocalChanges
        ? "변경 사항을 서버에 저장한 뒤 고객에게 일정을 공개했습니다. 일정 관리 화면으로 이동합니다."
        : "저장할 로컬 변경은 없었습니다. 고객에게 일정을 공개했습니다. 일정 관리 화면으로 이동합니다.";
      setStatus(doneMsg);
      window.alert(doneMsg);
      window.location.assign(listUrl);
    } catch (e) {
      const msg = e && typeof e.message === "string" ? e.message : String(e);
      setStatus(`고객 공개 실패: ${msg}`);
      window.alert(`고객 공개에 실패했습니다.\n${msg}`);
    } finally {
      updateWorkflowControls();
    }
  });

  document.querySelector("#builderWeekPrev")?.addEventListener("click", () => {
    const tz = getBuilderTimeZone();
    const mon = partsInZone(weekStart.getTime(), tz);
    const prev = addCivilDays(mon.y, mon.m, mon.d, -7);
    weekStart = new Date(utcAtLocalWallClock(tz, prev.y, prev.m, prev.d, 0, 0, 0));
    renderWeek();
  });
  document.querySelector("#builderWeekNext")?.addEventListener("click", () => {
    const tz = getBuilderTimeZone();
    const mon = partsInZone(weekStart.getTime(), tz);
    const next = addCivilDays(mon.y, mon.m, mon.d, 7);
    weekStart = new Date(utcAtLocalWallClock(tz, next.y, next.m, next.d, 0, 0, 0));
    renderWeek();
  });

  document.querySelector("#builderResetBtn")?.addEventListener("click", async () => {
    if (!getQueryScheduleId()) return;
    if (hasUnsavedBuilderChanges() && !window.confirm(MSG_UNSAVED_RESET)) {
      return;
    }
    try {
      await loadAll(getQueryScheduleId());
      setStatus("서버에 저장된 일정으로 되돌렸습니다. 로컬에서 수정한 내용은 적용되지 않습니다.");
      window.alert("서버에 저장된 일정으로 화면을 맞췄습니다.");
    } catch (e) {
      const msg = e && typeof e.message === "string" ? e.message : String(e);
      setStatus(`되돌리기 실패: ${msg}`);
      window.alert(`서버 저장본을 불러오지 못했습니다.\n${msg}`);
    }
  });

  document.querySelector("#builderSaveBtn")?.addEventListener("click", async () => {
    if (!schedule || !dirtyIds.size) {
      setStatus("저장할 로컬 변경이 없습니다.");
      window.alert("저장할 로컬 변경이 없습니다. 일정을 옮기거나 노트를 수정한 뒤 다시 시도해 주세요.");
      return;
    }
    const saveBtn = document.querySelector("#builderSaveBtn");
    try {
      if (saveBtn instanceof HTMLButtonElement) saveBtn.disabled = true;
      setStatus("저장 중…");
      const r = await flushBuilderDraftToServer();
      if (!r.ok) {
        setStatus(`저장 실패: ${r.message || ""}`);
        window.alert(`저장에 실패했습니다.\n${r.message || ""}`);
        return;
      }
      setStatus("변경 사항을 서버에 저장했습니다.");
      window.alert("변경 사항을 서버에 저장했습니다.");
    } finally {
      if (saveBtn instanceof HTMLButtonElement) saveBtn.disabled = false;
      updateWorkflowControls();
    }
  });
}

init();
