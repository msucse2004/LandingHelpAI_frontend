/**
 * 페이지 백그라운드 갱신 시 깜빡임(로딩·main 숨김·불필요한 innerHTML) 방지.
 */

/** @param {HTMLElement | null | undefined} el @param {string} text */
export function setTextIfChanged(el, text) {
  if (!(el instanceof HTMLElement)) return;
  const next = String(text ?? "");
  if (el.textContent !== next) el.textContent = next;
}

/** @param {HTMLElement | null | undefined} el @param {string} html */
export function setInnerHtmlIfChanged(el, html) {
  if (!(el instanceof HTMLElement)) return;
  const next = String(html ?? "");
  if (el.innerHTML !== next) el.innerHTML = next;
}

/** @param {HTMLElement | null | undefined} el @param {string} className */
export function setClassNameIfChanged(el, className) {
  if (!(el instanceof HTMLElement)) return;
  const next = String(className ?? "");
  if (el.className !== next) el.className = next;
}

/**
 * @param {{
 *   silent?: boolean,
 *   loadingEl?: HTMLElement | null,
 *   mainEl?: HTMLElement | null,
 *   errEl?: HTMLElement | null,
 * }} opts
 */
export function beginPageLoad(opts = {}) {
  const silent = Boolean(opts.silent);
  if (silent) return { silent: true };
  if (opts.loadingEl instanceof HTMLElement) opts.loadingEl.hidden = false;
  if (opts.mainEl instanceof HTMLElement) opts.mainEl.hidden = true;
  if (opts.errEl instanceof HTMLElement) {
    opts.errEl.hidden = true;
    opts.errEl.textContent = "";
  }
  return { silent: false };
}

/**
 * @param {{
 *   silent?: boolean,
 *   success?: boolean,
 *   loadingEl?: HTMLElement | null,
 *   mainEl?: HTMLElement | null,
 *   errEl?: HTMLElement | null,
 *   errorMessage?: string,
 * }} opts
 */
export function endPageLoad(opts = {}) {
  const silent = Boolean(opts.silent);
  const success = opts.success !== false;
  if (!silent) {
    if (opts.loadingEl instanceof HTMLElement) opts.loadingEl.hidden = true;
    if (success && opts.mainEl instanceof HTMLElement) opts.mainEl.hidden = false;
    if (!success && opts.mainEl instanceof HTMLElement) opts.mainEl.hidden = true;
  }
  if (!success && opts.errEl instanceof HTMLElement && opts.errorMessage) {
    opts.errEl.hidden = false;
    setTextIfChanged(opts.errEl, opts.errorMessage);
  }
}
