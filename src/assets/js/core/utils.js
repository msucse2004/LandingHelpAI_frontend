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

export { formatDate, formatMoney, qsa, qs, safeText };
