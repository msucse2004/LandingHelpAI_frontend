/**
 * Shared Customer Intake **presentation** rules for admin preview and customer thread UI.
 *
 * Strategy:
 * - **Block HTML** — All notice/image/rich_text/divider pixels use
 *   `intake-block-render.js` (`renderIntakeContentBlocksArray`) so admin static/interactive preview
 *   and message-thread bubbles share the same markup and CSS (`lhai-intake-*`).
 * - **Branching / order** — `intake-preview-branching.js` mirrors backend `intake_branching`
 *   (`contentBlocksForPrompt`, visibility). Runtime API responses (`prompt.content_blocks`, thread
 *   messages) follow the same ordering rules.
 * - **Service header** — `.lhai-service-header` shows **service name** + **delivery pill** (AI Agent /
 *   In-Person) for SERVICE threads and for the intake preview dialog, using shared modifiers
 *   (`--ai`, `--inperson`, `--both`) aligned with thread list badges.
 * - **Delivery labels** — `deliveryModeBadgeFromThreadMeta` (API `selected_delivery_mode` /
 *   `header_badge`). Preview uses `deliveryCapabilityBadgeFromFlags` from catalog checkboxes.
 *
 * Preview data stays local to the admin editor; this module has no network calls.
 */

import { renderIntakeContentBlocksArray } from "./intake-block-render.js";

/**
 * Thread / list row: human-readable delivery badge (matches messages list + detail header).
 * @param {Record<string, unknown> | null | undefined} row
 * @returns {string}
 */
export function deliveryModeBadgeFromThreadMeta(row) {
  if (!row || typeof row !== "object") return "";
  const api = String(row.header_badge || row.selected_delivery_mode_label || "").trim();
  if (api) return api;
  const m = String(row.selected_delivery_mode || "").toUpperCase();
  if (m === "AI_AGENT") return "AI Agent";
  if (m === "IN_PERSON") return "In-Person";
  return "";
}

/**
 * Admin service editor flags → same vocabulary as thread delivery badges where possible.
 * @param {{ aiCapable?: boolean; inPersonRequired?: boolean }} caps
 */
export function deliveryCapabilityBadgeFromFlags({ aiCapable = false, inPersonRequired = false } = {}) {
  if (aiCapable && inPersonRequired) return "AI + Optional Human Help";
  if (aiCapable) return "AI Agent";
  if (inPersonRequired) return "In-Person";
  return "Service";
}

/**
 * Maps badge text to a CSS modifier (colors match `.lhai-thread-badge--ai` / `--inperson` in messages.css).
 * @param {string} label
 * @returns {"ai" | "inperson" | "both" | "neutral"}
 */
export function deliveryBadgeModifierFromLabel(label) {
  const s = String(label || "").trim();
  if (s === "In-Person") return "inperson";
  if (s === "AI Agent") return "ai";
  if (s.includes("Optional Human") || (s.includes("AI") && s.includes("+"))) return "both";
  return "neutral";
}

/**
 * Preview-only subtitle under the service header (customer thread uses real assignment from API).
 * @param {{ aiCapable?: boolean; inPersonRequired?: boolean }} caps
 */
export function previewServiceHeaderSubtitleFromFlags({ aiCapable = false, inPersonRequired = false } = {}) {
  if (inPersonRequired && !aiCapable) {
    return "담당 Agent가 배정되면 이름이 이 위치에 표시됩니다.";
  }
  if (aiCapable && !inPersonRequired) {
    return "이 서비스는 AI Agent가 제한된 범위에서 안내합니다.";
  }
  if (aiCapable && inPersonRequired) {
    return "AI 안내와 대면 지원이 모두 가능합니다. 대면 선택 시 담당자 이름이 표시될 수 있습니다.";
  }
  return "";
}

/**
 * One `intake_content_block` thread message (backend `widget_type`) → same block markup as preview.
 * @param {Record<string, unknown>} up message `ui_payload`
 */
export function renderIntakeThreadContentBlockBubble(up) {
  const bt = String(up.block_type || "").toLowerCase();
  const raw = up.payload;
  const pl = raw && typeof raw === "object" ? /** @type {Record<string, unknown>} */ (raw) : {};
  const inner = renderIntakeContentBlocksArray([{ block_type: bt, payload: pl }], {
    ariaLabel: "인테이크 안내",
  });
  return `<div class="lhai-chat-intake-content">${inner}</div>`;
}
