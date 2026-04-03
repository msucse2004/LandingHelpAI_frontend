import { APP_CONFIG } from "./config.js";

function formatMoney(amount, currency = "USD") {
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency }).format(amount);
  } catch {
    return `${amount} ${currency}`;
  }
}

function formatDate(dateLike) {
  if (!dateLike) return "-";
  const date = new Date(dateLike);
  if (Number.isNaN(date.getTime())) return String(dateLike);
  return new Intl.DateTimeFormat(undefined, { year: "numeric", month: "short", day: "numeric" }).format(date);
}

/**
 * 메시지 타임스탬프: 브라우저 로캘·기기 로컬 타임존(접속 지역) 기준 날짜·시간·타임존(오프셋) 표시.
 */
function formatMessageTimestamp(dateLike) {
  if (!dateLike) return "-";
  const date = new Date(dateLike);
  if (Number.isNaN(date.getTime())) return String(dateLike);
  const base = {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  };
  try {
    return new Intl.DateTimeFormat(undefined, { ...base, timeZoneName: "longOffset" }).format(date);
  } catch {
    try {
      return new Intl.DateTimeFormat(undefined, { ...base, timeZoneName: "short" }).format(date);
    } catch {
      return new Intl.DateTimeFormat(undefined, base).format(date);
    }
  }
}

function qs(selector, scope = document) {
  return scope.querySelector(selector);
}

function qsa(selector, scope = document) {
  return Array.from(scope.querySelectorAll(selector));
}

function safeText(value, fallback = "-") {
  if (value === null || value === undefined || value === "") return fallback;
  return String(value);
}

/**
 * 설문·서비스 플로우 등 단계 전환 시 상단으로 스크롤.
 * - '다음' 클릭 후에도 포커스가 버튼에 남으면 브라우저가 다시 아래로 스크롤하는 경우가 있어 blur + 지연 재스크롤을 둡니다.
 */
function scrollPageToTop() {
  const ae = document.activeElement;
  if (
    ae instanceof HTMLElement &&
    (ae.tagName === "BUTTON" || ae.tagName === "A" || ae.tagName === "INPUT" || ae.tagName === "TEXTAREA" || ae.tagName === "SELECT")
  ) {
    ae.blur();
  }

  const apply = () => {
    const root = document.scrollingElement || document.documentElement;
    if (root instanceof HTMLElement) root.scrollTop = 0;
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
    if (document.documentElement) document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
    document.querySelectorAll(".lhai-main, .lhai-chat-scroll").forEach((el) => {
      if (el instanceof HTMLElement) el.scrollTop = 0;
    });
  };

  const alignSurveyTop = () => {
    const surveyMain = document.querySelector("main.lhai-container--survey");
    const header = surveyMain?.querySelector(".lhai-page-header");
    if (header instanceof HTMLElement) {
      header.scrollIntoView({ behavior: "auto", block: "start" });
      return;
    }
    const anchor =
      document.querySelector(".service-flow__progress") ||
      document.querySelector(".survey-branching__progress") ||
      document.querySelector(".lhai-page-header");
    if (anchor instanceof HTMLElement) anchor.scrollIntoView({ behavior: "auto", block: "start" });
  };

  /** 포커스를 상단 제목으로 옮겨 버튼 포커스 스크롤을 막음 (스크롤은 하지 않음) */
  const focusSurveyHeadingNoScroll = () => {
    const surveyMain = document.querySelector("main.lhai-container--survey");
    const h =
      surveyMain?.querySelector(".lhai-page-header h1.lhai-title") ||
      surveyMain?.querySelector("h1.lhai-title") ||
      surveyMain?.querySelector("h1");
    if (!(h instanceof HTMLElement)) return;
    if (!h.hasAttribute("tabindex")) h.setAttribute("tabindex", "-1");
    try {
      h.focus({ preventScroll: true });
    } catch {
      h.focus();
    }
  };

  apply();
  alignSurveyTop();

  requestAnimationFrame(() => {
    apply();
    alignSurveyTop();
  });

  window.setTimeout(() => {
    apply();
    alignSurveyTop();
    focusSurveyHeadingNoScroll();
  }, 0);

  window.setTimeout(() => {
    apply();
    alignSurveyTop();
  }, 120);

  window.setTimeout(() => {
    apply();
    alignSurveyTop();
    focusSurveyHeadingNoScroll();
  }, 280);

  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      apply();
      alignSurveyTop();
    });
  });
}

/**
 * `/api/...` 상대 URL을 API 베이스(또는 현재 origin)에 붙여 PDF 등이 올바른 호스트로 열리게 함.
 * @param {string} url
 */
function resolveBackendMediaUrl(url) {
  const s = String(url || "").trim();
  if (!s) return "";
  if (/^https?:\/\//i.test(s)) return s;
  const path = s.startsWith("/") ? s : `/${s}`;
  if (typeof window === "undefined") return s;
  const base = String(APP_CONFIG.apiBaseUrl || "").replace(/\/$/, "");
  if (base) return `${base}${path}`;
  return `${window.location.origin}${path}`;
}

export { formatDate, formatMessageTimestamp, formatMoney, qsa, qs, resolveBackendMediaUrl, safeText, scrollPageToTop };
