/**
 * Partner bid detail: AI briefing card + full intake answers disclosure.
 */

function escHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** @param {Record<string, unknown> | null | undefined} detail */
export function resolvePartnerIntakeAnswerRows(detail) {
  const rows = detail?.intake_answer_rows;
  if (Array.isArray(rows) && rows.length) return rows;
  const intake = detail?.intake;
  if (intake && typeof intake === "object" && Array.isArray(intake.answers)) {
    return intake.answers;
  }
  return [];
}

const BRIEFING_ERROR_HINT_KO = {
  ollama_unavailable:
    "AI 서버(Ollama)에 연결하지 못했습니다. Ollama가 실행 중인지, 백엔드 .env의 OLLAMA_BASE_URL이 맞는지 확인하세요.",
  llm_disabled: "브리핑 기능이 비활성화되어 있습니다(BID_BRIEFING_ENABLED).",
  ollama_timeout: "AI 응답 시간이 초과되었습니다. 모델이 로드되었는지 확인하세요.",
  ollama_invalid_response: "AI 응답 형식이 올바르지 않습니다.",
  unexpected_error: "예기치 않은 오류로 브리핑을 만들지 못했습니다.",
};

/** @param {unknown} brief */
export function briefingFailureHint(brief) {
  if (!brief || typeof brief !== "object") return "";
  const b = /** @type {Record<string, unknown>} */ (brief);
  const fallback =
    b.fallback_used === true || String(b.provider || "").trim().toLowerCase() === "fallback";
  if (!fallback) return "";
  const internal =
    b._internal && typeof b._internal === "object"
      ? /** @type {Record<string, unknown>} */ (b._internal)
      : null;
  const kind = String(b.error_kind || internal?.error_kind || "").trim();
  if (kind && BRIEFING_ERROR_HINT_KO[kind]) return BRIEFING_ERROR_HINT_KO[kind];
  if (kind) return `브리핑 생성 실패 (${kind}).`;
  return "자동 요약을 생성하지 못했습니다. 아래 인테이크 답변을 참고해 주세요.";
}

/** @param {unknown} brief */
function briefHasRenderableContent(brief) {
  if (!brief || typeof brief !== "object") return false;
  const b = /** @type {Record<string, unknown>} */ (brief);
  if (String(b.brief_title || b.title || "").trim()) return true;
  if (String(b.one_line_summary || b.brief_summary || b.summary || "").trim()) return true;
  if (String(b.partner_guidance || "").trim()) return true;
  const kp = Array.isArray(b.key_points) ? b.key_points : [];
  if (kp.length) return true;
  const miss = Array.isArray(b.missing_or_unclear) ? b.missing_or_unclear : [];
  return miss.length > 0;
}

/** @param {unknown} raw */
function normalizeKeyPoint(raw) {
  if (typeof raw === "string") {
    const s = raw.trim();
    return s ? { label: "", value: s } : null;
  }
  if (!raw || typeof raw !== "object") return null;
  const o = /** @type {Record<string, unknown>} */ (raw);
  const label = String(o.label || "").trim();
  const value = String(o.value || "").trim();
  if (!label && !value) return null;
  return { label, value };
}

/** @param {Record<string, unknown> | null | undefined} brief */
export function renderAiBidRequestBriefCard(brief) {
  const eyebrow = "고객 요청 브리핑";

  if (!briefHasRenderableContent(brief)) {
    const hint = briefingFailureHint(brief);
    const hintHtml = hint
      ? `<p class="lhai-par-bid__brief-fallback-hint">${escHtml(hint)}</p>`
      : "";
    return `<section class="lhai-par-bid__brief-card lhai-par-bid__brief-card--fallback" aria-label="${escHtml(eyebrow)}">
      <p class="lhai-par-bid__brief-eyebrow">${escHtml(eyebrow)}</p>
      <h3 class="lhai-par-bid__brief-card-title">${escHtml(eyebrow)}</h3>
      <p class="lhai-par-bid__brief-fallback-body">고객 요청 브리핑을 생성하지 못했습니다. 전체 인테이크 답변을 확인해 주세요.</p>
      ${hintHtml}
    </section>`;
  }

  const b = /** @type {Record<string, unknown>} */ (brief);
  const title = escHtml(String(b.brief_title || b.title || eyebrow).trim());
  const summary = escHtml(
    String(b.one_line_summary || b.brief_summary || b.summary || "").trim(),
  );
  const keyPoints = (Array.isArray(b.key_points) ? b.key_points : [])
    .map(normalizeKeyPoint)
    .filter(Boolean);
  const missing = (Array.isArray(b.missing_or_unclear) ? b.missing_or_unclear : [])
    .map((m) => String(m || "").trim())
    .filter(Boolean);
  const guidance = escHtml(String(b.partner_guidance || "").trim());

  const kpHtml = keyPoints.length
    ? `<div class="lhai-par-bid__brief-section">
        <h4 class="lhai-par-bid__brief-section-title">핵심 조건</h4>
        <ul class="lhai-par-bid__brief-kp-grid" role="list">
          ${keyPoints
            .map((kp) => {
              const item = /** @type {{ label: string, value: string }} */ (kp);
              const lbl = escHtml(item.label || "—");
              const val = escHtml(item.value || "—");
              if (item.label) {
                return `<li class="lhai-par-bid__brief-kp-item"><span class="lhai-par-bid__brief-kp-label">${lbl}</span><span class="lhai-par-bid__brief-kp-value">${val}</span></li>`;
              }
              return `<li class="lhai-par-bid__brief-kp-item lhai-par-bid__brief-kp-item--solo"><span class="lhai-par-bid__brief-kp-value">${val}</span></li>`;
            })
            .join("")}
        </ul>
      </div>`
    : "";

  const missHtml = missing.length
    ? `<div class="lhai-par-bid__brief-section lhai-par-bid__brief-section--missing">
        <h4 class="lhai-par-bid__brief-section-title">확인 필요</h4>
        <ul class="lhai-par-bid__brief-missing-list">${missing
          .map((m) => `<li>${escHtml(m)}</li>`)
          .join("")}</ul>
      </div>`
    : "";

  const guideHtml = guidance
    ? `<div class="lhai-par-bid__brief-section lhai-par-bid__brief-section--guidance">
        <h4 class="lhai-par-bid__brief-section-title">파트너 안내</h4>
        <p class="lhai-par-bid__brief-guidance">${guidance}</p>
      </div>`
    : "";

  return `<section class="lhai-par-bid__brief-card" aria-label="${escHtml(eyebrow)}">
    <p class="lhai-par-bid__brief-eyebrow">${escHtml(eyebrow)}</p>
    <h3 class="lhai-par-bid__brief-card-title">${title}</h3>
    ${summary ? `<p class="lhai-par-bid__brief-summary">${summary}</p>` : ""}
    ${kpHtml}
    ${missHtml}
    ${guideHtml}
  </section>`;
}

/**
 * @param {Array<Record<string, unknown>>} rows
 * @param {{ listClass?: string, itemClass?: string, emptyMessage?: string }} [opts]
 */
export function renderFullIntakeAnswersDisclosure(rows, opts = {}) {
  const listClass = opts.listClass || "lhai-par-bid__intake-list";
  const itemClass = opts.itemClass || "lhai-par-bid__intake-item";
  const emptyMessage =
    opts.emptyMessage || "파트너에게 공개된 인테이크 답변이 없습니다.";

  const list = Array.isArray(rows) ? rows : [];

  const body =
    list.length === 0
      ? `<p class="lhai-par-bid__intake-empty u-text-muted">${escHtml(emptyMessage)}</p>`
      : `<div class="${listClass}" role="list">${list
          .map((row) => {
            const r = row && typeof row === "object" ? row : {};
            const label = escHtml(String(r.label || "—"));
            if (String(r.kind || "answer").trim().toLowerCase() === "section") {
              return `<div class="lhai-par-bid__intake-section ${itemClass}" role="listitem">
                <p class="lhai-par-bid__intake-section-title">${label}</p>
              </div>`;
            }
            const display =
              r.display_value != null && String(r.display_value).trim()
                ? String(r.display_value)
                : String(r.value || "—");
            const val = escHtml(display);
            const skipped =
              String(r.value || "").trim().toLowerCase() === "__skipped__" ||
              val === "건너뜀";
            const answerClass = skipped
              ? "lhai-par-bid__intake-a lhai-par-bid__intake-a--skipped"
              : "lhai-par-bid__intake-a";
            return `<div class="${itemClass}" role="listitem">
              <p class="lhai-par-bid__intake-q">${label}</p>
              <p class="${answerClass}">${val}</p>
            </div>`;
          })
          .join("")}</div>`;

  return `<section class="lhai-par-bid__intake-disclosure-wrap" aria-label="전체 인테이크 답변">
    <details class="lhai-par-bid__intake-disclosure">
      <summary class="lhai-par-bid__intake-disclosure-trigger">전체 인테이크 답변 보기</summary>
      <div class="lhai-par-bid__intake-disclosure-body">${body}</div>
    </details>
  </section>`;
}

/** @param {Record<string, unknown> | null | undefined} detail @param {object} [opts] */
export function renderPartnerBidIntakeSectionHtml(detail, opts = {}) {
  const brief =
    detail?.ai_bid_request_brief && typeof detail.ai_bid_request_brief === "object"
      ? detail.ai_bid_request_brief
      : null;
  return `${renderAiBidRequestBriefCard(brief)}${renderFullIntakeAnswersDisclosure(
    resolvePartnerIntakeAnswerRows(detail),
    opts,
  )}`;
}
