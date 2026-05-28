/**
 * Partner main content — shared page header, spacing, and section wrapper.
 * @module layouts/partner-page-layout
 */

/**
 * @param {{
 *   title: string,
 *   subtitle?: string,
 *   titleId?: string,
 *   subtitleId?: string,
 *   eyebrowHtml?: string,
 * }} opts
 * @returns {string}
 */
export function renderPartnerPageHeaderHtml(opts) {
  const titleId = opts.titleId ? ` id="${opts.titleId}"` : "";
  const subtitleBlock = opts.subtitleId
    ? `<p class="lhai-subtitle" id="${opts.subtitleId}">${opts.subtitle ?? ""}</p>`
    : opts.subtitle
      ? `<p class="lhai-subtitle">${opts.subtitle}</p>`
      : "";
  const eyebrow = opts.eyebrowHtml
    ? `<div class="lhai-partner-page__eyebrow">${opts.eyebrowHtml}</div>`
    : "";

  return `<section class="lhai-page-header lhai-partner-page__header">
    ${eyebrow}
    <div>
      <h1 class="lhai-title"${titleId}>${opts.title}</h1>
      ${subtitleBlock}
    </div>
  </section>`;
}

/**
 * @param {{
 *   title: string,
 *   subtitle?: string,
 *   titleId?: string,
 *   subtitleId?: string,
 *   eyebrowHtml?: string,
 *   bodyHtml?: string,
 *   pageClass?: string,
 * }} opts
 * @returns {string}
 */
export function renderPartnerPageContentHtml(opts) {
  const pageClass = ["lhai-partner-page", opts.pageClass].filter(Boolean).join(" ");
  const header = renderPartnerPageHeaderHtml({
    title: opts.title,
    subtitle: opts.subtitle,
    titleId: opts.titleId,
    subtitleId: opts.subtitleId,
    eyebrowHtml: opts.eyebrowHtml,
  });
  const body = opts.bodyHtml ?? "";
  return `<div class="${pageClass}">
    ${header}
    <div class="lhai-partner-page__body">${body}</div>
  </div>`;
}
