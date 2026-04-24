/**
 * Shared HTML for Customer Intake content blocks (notice, image, rich_text, divider).
 *
 * Single source for block **markup** — used by admin preview, customer `form_prompt` embeds (when
 * present), and `intake_content_block` thread messages via `intake-runtime-view.js`.
 */
import DOMPurify from "https://cdn.jsdelivr.net/npm/dompurify@3.2.4/dist/purify.es.mjs";
import { resolveBackendMediaUrl } from "../core/utils.js";

/** Quill-style HTML from admin body editor; strip scripts/on* handlers while keeping lists/colors/links. */
const INTAKE_BODY_PURIFY = {
  ALLOWED_TAGS: [
    "p",
    "br",
    "strong",
    "b",
    "em",
    "i",
    "u",
    "s",
    "strike",
    "span",
    "a",
    "ul",
    "ol",
    "li",
    "h1",
    "h2",
    "h3",
    "h4",
    "blockquote",
    "pre",
    "code",
  ],
  ALLOWED_ATTR: ["href", "target", "rel", "class", "style"],
  ALLOW_DATA_ATTR: false,
  ADD_ATTR: ["target"],
};

/**
 * @param {unknown} raw
 * @returns {string}
 */
export function sanitizeIntakeBodyHtml(raw) {
  const s = String(raw ?? "").trim();
  if (!s) return "";
  return DOMPurify.sanitize(s, INTAKE_BODY_PURIFY);
}

/** @param {unknown} s */
export function escapeHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * @param {Array<Record<string, unknown>>} contentBlocks
 * @param {{ ariaLabel?: string }} [opts]
 */
export function renderIntakeContentBlocksArray(contentBlocks, opts = {}) {
  const raw = contentBlocks;
  if (!Array.isArray(raw) || raw.length === 0) return "";
  const parts = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const o = /** @type {Record<string, unknown>} */ (item);
    const bt = String(o.block_type || "").toLowerCase();
    const plRaw = o.payload;
    const pl = plRaw && typeof plRaw === "object" ? /** @type {Record<string, unknown>} */ (plRaw) : {};
    const style = String(pl.style_variant || "default").replace(/[^a-z0-9_-]/g, "") || "default";
    const layout = String(pl.media_layout || "default").replace(/[^a-z0-9_-]/g, "") || "default";
    const baseCls = [
      "lhai-intake-block",
      `lhai-intake-block--${bt.replace(/[^a-z0-9-]/g, "_")}`,
      `lhai-intake-block--layout-${layout}`,
      `lhai-intake-block--style-${style}`,
    ].join(" ");

    if (bt === "divider") {
      parts.push(`<div class="${baseCls}" role="separator" aria-hidden="true"><hr class="lhai-intake-block__rule" /></div>`);
      continue;
    }

    const title = String(pl.title || "").trim();
    const body = String(pl.body || "").trim();
    const caption = String(pl.caption || "").trim();
    const alt = String(pl.alt_text || "").trim();
    const mediaUrl = String(pl.media_url || "").trim();
    const assetId = String(pl.media_asset_id || "").trim();
    const kind = String(pl.media_kind || "image").toLowerCase();
    const resolved = mediaUrl ? resolveBackendMediaUrl(mediaUrl) : "";

    let mediaHtml = "";
    if (kind === "document" && resolved) {
      const lab = caption || "문서 열기";
      mediaHtml = `<div class="lhai-intake-block__doc"><a href="${escapeHtml(resolved)}" target="_blank" rel="noopener noreferrer" class="lhai-intake-block__doc-link">${escapeHtml(lab)}</a></div>`;
    } else if (kind === "video" && resolved) {
      mediaHtml = `<div class="lhai-intake-block__video-wrap"><video class="lhai-intake-block__video" controls preload="metadata" src="${escapeHtml(resolved)}"></video>${
        caption ? `<div class="lhai-intake-block__caption">${escapeHtml(caption)}</div>` : ""
      }</div>`;
    } else if (resolved && (kind === "image" || kind === "none")) {
      const altText = alt || caption || title || "Image";
      mediaHtml = `<figure class="lhai-intake-block__figure"><img class="lhai-intake-block__img" src="${escapeHtml(resolved)}" alt="${escapeHtml(altText)}" loading="lazy" decoding="async" />${
        caption ? `<figcaption class="lhai-intake-block__caption">${escapeHtml(caption)}</figcaption>` : ""
      }</figure>`;
    } else if (assetId && !resolved) {
      mediaHtml = `<div class="lhai-intake-block__asset-placeholder u-text-muted">${escapeHtml(`자료 참조 ID: ${assetId}`)}</div>`;
    }

    const titleHtml = title ? `<h4 class="lhai-intake-block__title">${escapeHtml(title)}</h4>` : "";
    const bodySafe = sanitizeIntakeBodyHtml(body);
    const richCls = bt === "rich_text" ? "lhai-intake-block__body--rich" : "";
    const bodyHtml = bodySafe
      ? `<div class="lhai-intake-block__body lhai-intake-block__body--html ${richCls}">${bodySafe}</div>`
      : "";

    if (bt === "notice" || bt === "image" || bt === "rich_text") {
      parts.push(`<section class="${baseCls}">${titleHtml}${mediaHtml}${bodyHtml}</section>`);
    }
  }
  if (!parts.length) return "";
  const aria = escapeHtml(opts.ariaLabel || "안내 블록");
  return `<div class="lhai-intake-content-blocks" role="region" aria-label="${aria}">${parts.join("")}</div>`;
}

/**
 * @param {Record<string, unknown>} uiPayload
 */
export function renderIntakeContentBlocksHtml(uiPayload) {
  const raw = uiPayload?.content_blocks;
  return renderIntakeContentBlocksArray(Array.isArray(raw) ? /** @type {Array<Record<string, unknown>>} */ (raw) : [], {
    ariaLabel: "안내 블록",
  });
}
