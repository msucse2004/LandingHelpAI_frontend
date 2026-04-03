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

export { formatDate, formatMessageTimestamp, formatMoney, qsa, qs, safeText };
