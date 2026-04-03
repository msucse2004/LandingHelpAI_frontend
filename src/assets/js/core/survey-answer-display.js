/**
 * 설문/견적에 저장된 answer_json을 사람이 읽기 쉬운 한 줄로 만듭니다.
 * - label_snapshot(제출 시 라벨 스냅샷)을 우선 사용
 * - 저장용 옵션 값(slug)은 가능한 범위에서 표시용으로 변환 (예: f_5_gb → 5 GB)
 */

/** @param {unknown} s */
export function humanizeSurveyOptionStorageValue(s) {
  const raw = String(s ?? "").trim();
  if (!raw) return "";
  const gb = /^f_(\d+)_gb$/i.exec(raw);
  if (gb) return `${gb[1]} GB`;
  const mb = /^f_(\d+)_mb$/i.exec(raw);
  if (mb) return `${mb[1]} MB`;
  const tb = /^f_(\d+)_tb$/i.exec(raw);
  if (tb) return `${tb[1]} TB`;
  return raw;
}

/** 쉼표로 구분된 여러 저장 값 각각에 humanize 적용 */
export function humanizeSurveyAnswerTokens(display) {
  const t0 = String(display ?? "").trim();
  if (!t0) return "";
  return t0
    .split(/\s*,\s*/)
    .map((part) => humanizeSurveyOptionStorageValue(part.trim()))
    .filter(Boolean)
    .join(", ");
}

/**
 * @param {unknown} raw answer_json 또는 원시 값
 * @param {{ yes: string, no: string }} boolLabels
 * @returns {string}
 */
export function formatSurveyAnswerForDisplay(raw, boolLabels) {
  const yes = boolLabels?.yes ?? "Yes";
  const no = boolLabels?.no ?? "No";

  if (raw == null || raw === "") return "";
  if (typeof raw === "string" || typeof raw === "number") {
    return humanizeSurveyAnswerTokens(String(raw).trim());
  }
  if (typeof raw === "boolean") return raw ? yes : no;
  if (typeof raw !== "object") return humanizeSurveyAnswerTokens(String(raw));

  const j = raw;

  const snap = j.label_snapshot;
  if (snap && typeof snap === "object") {
    if (snap.value_label != null && String(snap.value_label).trim() !== "") {
      return humanizeSurveyAnswerTokens(String(snap.value_label).trim());
    }
    if (Array.isArray(snap.value_labels) && snap.value_labels.length) {
      return snap.value_labels
        .map((x) => humanizeSurveyOptionStorageValue(String(x).trim()))
        .filter(Boolean)
        .join(", ");
    }
  }

  if (typeof j.value === "boolean") return j.value ? yes : no;
  if (typeof j.value === "string" || typeof j.value === "number") {
    return humanizeSurveyAnswerTokens(String(j.value).trim());
  }
  if (Array.isArray(j.value)) {
    return j.value
      .map((x) => humanizeSurveyOptionStorageValue(String(x).trim()))
      .filter(Boolean)
      .join(", ");
  }
  if (typeof j.text === "string") return j.text.trim();
  if (Array.isArray(j.selected)) {
    return j.selected
      .map((x) => humanizeSurveyOptionStorageValue(String(x).trim()))
      .filter(Boolean)
      .join(", ");
  }
  if (Array.isArray(j.values)) {
    return j.values
      .map((x) => humanizeSurveyOptionStorageValue(String(x).trim()))
      .filter(Boolean)
      .join(", ");
  }

  const keys = Object.keys(j);
  if (keys.length === 1) {
    const v = j[keys[0]];
    if (typeof v === "boolean") return v ? yes : no;
    if (typeof v === "string" || typeof v === "number") return humanizeSurveyAnswerTokens(String(v).trim());
  }

  try {
    const s = JSON.stringify(j);
    return s.length > 120 ? `${s.slice(0, 117)}…` : s;
  } catch {
    return "";
  }
}
