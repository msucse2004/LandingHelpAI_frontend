/**
 * Partner main content — shared page header, spacing, and section wrapper.
 * @module layouts/partner-page-layout
 */

/**
 * @param {{
 *   title: string,
 *   subtitle?: string,
 *   titleId?: string,
 *   titleI18nKey?: string,
 *   subtitleId?: string,
 *   eyebrowHtml?: string,
 * }} opts
 * @returns {string}
 */
export function renderPartnerPageHeaderHtml(opts) {
  const titleId = opts.titleId ? ` id="${opts.titleId}"` : "";
  const titleI18n = opts.titleI18nKey ? ` data-i18n="${opts.titleI18nKey}"` : "";
  const subtitleI18n = opts.subtitleI18nKey ? ` data-i18n="${opts.subtitleI18nKey}"` : "";
  const subtitleBlock = opts.subtitleId
    ? `<p class="lhai-subtitle" id="${opts.subtitleId}"${subtitleI18n}>${opts.subtitle ?? ""}</p>`
    : opts.subtitle
      ? `<p class="lhai-subtitle"${subtitleI18n}>${opts.subtitle}</p>`
      : "";
  const eyebrow = opts.eyebrowHtml
    ? `<div class="lhai-partner-page__eyebrow">${opts.eyebrowHtml}</div>`
    : "";

  return `<section class="lhai-page-header lhai-partner-page__header">
    ${eyebrow}
    <div>
      <h1 class="lhai-title"${titleId}${titleI18n}>${opts.title}</h1>
      ${subtitleBlock}
    </div>
  </section>`;
}

/**
 * @param {{
 *   title: string,
 *   subtitle?: string,
 *   titleId?: string,
 *   titleI18nKey?: string,
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
    titleI18nKey: opts.titleI18nKey,
    subtitleId: opts.subtitleId,
    subtitleI18nKey: opts.subtitleI18nKey,
    eyebrowHtml: opts.eyebrowHtml,
  });
  const body = opts.bodyHtml ?? "";
  return `<div class="${pageClass}">
    ${header}
    <div class="lhai-partner-page__body">${body}</div>
  </div>`;
}
