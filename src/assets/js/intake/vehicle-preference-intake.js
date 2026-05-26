/**
 * Vehicle preference admin templates (legacy saved blocks only; not used in customer runtime).
 *
 * @deprecated Customer runtime no longer uses this module. Kept for legacy admin templates only.
 */

/** @typedef {{ value: string, label: string }} VpOption */

export const VP_UI_MARKER = "vehicle_preference_v1";
export const VP_MAX_CARDS = 9;

/** Admin + customer card title for vehicle slot 1..N. */
export function vehiclePreferenceSlotLabel(slotIndex) {
  const n = Math.max(1, Math.min(VP_MAX_CARDS, Number(slotIndex) || 1));
  const fixed = [
    "첫번째 선호 차량",
    "두번째 선호차량",
    "세번째 선호 차량",
    "네번째 선호 차량",
    "다섯번째 선호 차량",
    "여섯번째 선호 차량",
    "일곱번째 선호 차량",
    "여덟번째 선호 차량",
    "아홉번째 선호 차량",
  ];
  if (n <= fixed.length) return fixed[n - 1];
  return `${n}번째 선호 차량`;
}

/** @type {Record<string, string[]>} */
export const VP_MODELS_BY_MAKE = {
  Toyota: ["Any Toyota model", "Camry", "Corolla", "RAV4", "Highlander", "Sienna", "Prius", "Tacoma", "Other"],
  Honda: ["Any Honda model", "Civic", "Accord", "CR-V", "Pilot", "Odyssey", "HR-V", "Other"],
  Hyundai: ["Any Hyundai model", "Elantra", "Sonata", "Tucson", "Santa Fe", "Palisade", "Other"],
  Kia: ["Any Kia model", "Forte", "K5", "Sportage", "Sorento", "Telluride", "Carnival", "Other"],
};

const VP_MAKE_OPTIONS = [
  "any",
  "Toyota",
  "Honda",
  "Hyundai",
  "Kia",
  "Mazda",
  "Nissan",
  "Ford",
  "Chevrolet",
  "Subaru",
  "Lexus",
  "BMW",
  "Mercedes-Benz",
  "Other",
];

/** @param {string} val @param {string} label */
function opt(val, label) {
  return { value: val, label, sort_order: 0, active: true };
}

/** @returns {VpOption[]} */
function vpOpts(pairs) {
  return pairs.map(([value, label], i) => ({ value, label, sort_order: i, active: true }));
}

/** How many model years to list below “Any year” (current year inclusive). */
export const VP_YEAR_MIN_OPTION_COUNT = 7;

/**
 * Year (min) select options from a reference calendar year (default: today).
 * @param {number} [referenceYear]
 * @returns {Array<[string, string]>}
 */
export function vehiclePreferenceYearMinOptionPairs(referenceYear) {
  const y = Number(referenceYear);
  const currentYear = Number.isFinite(y) && y >= 1990 ? Math.floor(y) : new Date().getFullYear();
  /** @type {Array<[string, string]>} */
  const pairs = [["any", "Any year"]];
  for (let i = 0; i < VP_YEAR_MIN_OPTION_COUNT; i++) {
    const yr = currentYear - i;
    if (yr < 1990) break;
    pairs.push([String(yr), `${yr} or newer`]);
  }
  return pairs;
}

/** @param {number} [referenceYear] */
export function vehiclePreferenceYearMinOptions(referenceYear) {
  return vpOpts(vehiclePreferenceYearMinOptionPairs(referenceYear));
}

/**
 * Refresh year_min option lists on stored children (keeps other field edits).
 * @param {Array<Record<string, unknown>>} children
 * @param {number} [referenceYear]
 */
export function applyDynamicYearMinOptionsToChildren(children, referenceYear) {
  const opts = vehiclePreferenceYearMinOptions(referenceYear);
  return children.map((ch) => {
    if (!ch || typeof ch !== "object") return ch;
    const id = String(ch.id || "");
    const ck = String(ch.car_answer_key || "").trim();
    if (ck !== "year_min" && !/_year_min$/.test(id)) return ch;
    return { ...ch, options: opts };
  });
}

/** @param {number} cardIdx */
export function vpStableChildId(cardIdx, key) {
  return `vp${cardIdx}_${key}`;
}

/**
 * @param {Record<string, unknown>} up
 * @returns {boolean}
 */
export function isVehiclePreferenceBiddingGroup(up) {
  if (!up || typeof up !== "object") return false;
  if (up.vehicle_preference_ui === true) return true;
  const desc = String(up.help_text || up.description || "");
  if (desc.includes(VP_UI_MARKER)) return true;
  const children = Array.isArray(up.children) ? up.children : [];
  return children.some((ch) => {
    const id = String(ch?.id || "");
    return /^vp[1-9]_/.test(id);
  });
}

/**
 * @param {Array<Record<string, unknown>>} children
 * @returns {number}
 */
export function vehiclePreferenceSlotCountFromChildren(children) {
  let max = 0;
  for (const ch of children) {
    const m = /^vp([1-9])_/.exec(String(ch?.id || ""));
    if (m) max = Math.max(max, Number(m[1]));
  }
  return max;
}

/**
 * Group children by card index (1–3).
 * @param {Array<Record<string, unknown>>} children
 * @returns {Map<number, Array<Record<string, unknown>>>}
 */
export function groupVehiclePreferenceChildren(children) {
  /** @type {Map<number, Array<Record<string, unknown>>>} */
  const byCard = new Map();
  for (const ch of children) {
    const id = String(ch.id || "");
    const m = /^vp([1-9])_/.exec(id);
    if (!m) continue;
    const idx = Number(m[1]);
    if (!byCard.has(idx)) byCard.set(idx, []);
    byCard.get(idx)?.push(ch);
  }
  return byCard;
}

/** @param {string} key @param {Record<string, unknown>} overrides */
function fieldDef(key, overrides) {
  return { key, vp_modes: ["detailed"], ...overrides };
}

/** @returns {VpOption[]} */
export function vehiclePreferenceBudgetOptions() {
  return vpOpts([
    ["15000", "Under $15,000"],
    ["20000", "Under $20,000"],
    ["25000", "Under $25,000"],
    ["30000", "Under $30,000"],
    ["35000", "Under $35,000"],
    ["40000", "Under $40,000"],
    ["50000", "Under $50,000"],
    ["none", "No strict budget"],
  ]);
}

/** @returns {VpOption[]} */
export function vehiclePreferenceVehicleTypeOptions() {
  return vpOpts([
    ["any", "Any"],
    ["sedan", "Sedan"],
    ["suv", "SUV"],
    ["minivan", "Minivan"],
    ["truck", "Truck"],
    ["hatchback", "Hatchback"],
    ["hybrid", "Hybrid"],
    ["electric", "Electric"],
  ]);
}

/** Single-card field templates (admin + runtime metadata). */
export function vehiclePreferenceFieldTemplates() {
  return [
    fieldDef("detail_level", {
      label: "How much detail do you want to provide?",
      input_type: "radio",
      required: true,
      car_answer_key: "detail_level",
      vp_modes: ["always"],
      default_value: "simple",
      options: [
        {
          value: "simple",
          label: "Keep it simple",
          help: "Help me find good options. I'm not sure exactly what car I want.",
          sort_order: 0,
          active: true,
        },
        {
          value: "detailed",
          label: "Add detailed requirements",
          help: "I know what I want and want to set specific conditions.",
          sort_order: 1,
          active: true,
        },
      ],
    }),
    fieldDef("vehicle_type", {
      label: "Vehicle type",
      input_type: "pill_select",
      required: false,
      car_answer_key: "vehicle_type",
      vp_modes: ["simple", "detailed"],
      options: vehiclePreferenceVehicleTypeOptions(),
    }),
    fieldDef("budget_max", {
      label: "Maximum budget",
      input_type: "select",
      required: true,
      car_answer_key: "budget_max",
      vp_modes: ["simple", "detailed"],
      options: vehiclePreferenceBudgetOptions(),
    }),
    fieldDef("top_priorities", {
      label: "Top priorities",
      input_type: "checkbox_group",
      required: false,
      car_answer_key: "top_priorities",
      vp_modes: ["simple"],
      options: vpOpts([
        ["reliability", "Reliability"],
        ["good_mpg", "Good gas mileage"],
        ["family_friendly", "Family friendly"],
        ["low_maintenance", "Low maintenance cost"],
        ["safety", "Safety"],
        ["value", "Best value"],
        ["comfort", "Comfort"],
        ["cargo", "Cargo space"],
      ]),
    }),
    fieldDef("desired_timeline", {
      label: "Timeline",
      input_type: "select",
      required: false,
      car_answer_key: "desired_timeline",
      vp_modes: ["simple"],
      options: vpOpts([
        ["asap", "As soon as possible"],
        ["1_week", "Within 1 week"],
        ["2_weeks", "Within 2 weeks"],
        ["1_month", "Within 1 month"],
        ["flexible", "Flexible"],
      ]),
    }),
    fieldDef("notes", {
      label: "Additional notes",
      input_type: "textarea",
      required: false,
      car_answer_key: "notes",
      vp_modes: ["simple", "detailed"],
      placeholder: "Optional. Add anything partners should know.",
      options: [],
    }),
    fieldDef("preference_type", {
      label: "How specific is your request?",
      input_type: "radio",
      required: true,
      car_answer_key: "preference_type",
      vp_modes: ["detailed"],
      options: vpOpts([
        ["exact_vehicle", "I know the exact car I want"],
        ["similar_vehicle", "I'm open to similar vehicles"],
        ["open_to_suggestions", "I'm open to any good vehicle within my budget"],
      ]),
    }),
    fieldDef("make", {
      label: "Make",
      input_type: "select",
      required: false,
      car_answer_key: "make",
      vp_modes: ["detailed"],
      options: vpOpts([
        ["any", "Any"],
        ...VP_MAKE_OPTIONS.filter((m) => m !== "any").map((m) => [m, m]),
      ]),
    }),
    fieldDef("model", {
      label: "Model",
      input_type: "select",
      required: false,
      car_answer_key: "model",
      vp_modes: ["detailed"],
      options: vpOpts([
        ["any_model", "Any model"],
        ["other", "Other"],
      ]),
    }),
    fieldDef("make_other", {
      label: "Make (other)",
      input_type: "text",
      required: false,
      car_answer_key: "make",
      vp_modes: ["detailed"],
      options: [],
    }),
    fieldDef("model_other", {
      label: "Model (other)",
      input_type: "text",
      required: false,
      car_answer_key: "model",
      vp_modes: ["detailed"],
      options: [],
    }),
    fieldDef("year_min", {
      label: "Minimum year",
      input_type: "select",
      required: false,
      car_answer_key: "year_min",
      vp_modes: ["detailed"],
      options: vehiclePreferenceYearMinOptions(),
    }),
    fieldDef("mileage_max", {
      label: "Maximum mileage",
      input_type: "select",
      required: false,
      car_answer_key: "mileage_max",
      vp_modes: ["detailed"],
      options: vpOpts([
        ["any", "Any mileage"],
        ["20000", "Under 20,000 miles"],
        ["30000", "Under 30,000 miles"],
        ["50000", "Under 50,000 miles"],
        ["70000", "Under 70,000 miles"],
        ["100000", "Under 100,000 miles"],
      ]),
    }),
    fieldDef("must_have_features", {
      label: "Must-have features",
      input_type: "checkbox_group",
      required: false,
      car_answer_key: "must_have_features",
      vp_modes: ["detailed"],
      options: vpOpts([
        ["clean_title", "Clean title"],
        ["no_accident", "No accident history"],
        ["backup_camera", "Backup camera"],
        ["carplay", "Apple CarPlay"],
        ["android_auto", "Android Auto"],
        ["bluetooth", "Bluetooth"],
        ["good_mpg", "Good gas mileage"],
        ["low_maintenance", "Low maintenance cost"],
        ["leather", "Leather seats"],
        ["sunroof", "Sunroof"],
        ["awd", "AWD / 4WD"],
        ["hybrid", "Hybrid"],
        ["family_friendly", "Family friendly"],
      ]),
    }),
    fieldDef("color_preference", {
      label: "Color preference",
      input_type: "select",
      required: false,
      car_answer_key: "color_preference",
      vp_modes: ["detailed"],
      options: vpOpts([
        ["none", "No preference"],
        ["white", "White"],
        ["black", "Black"],
        ["silver", "Silver"],
        ["gray", "Gray"],
        ["blue", "Blue"],
        ["red", "Red"],
        ["other", "Other"],
      ]),
    }),
    fieldDef("color_other", {
      label: "Color (other)",
      input_type: "text",
      required: false,
      car_answer_key: "color_preference",
      vp_modes: ["detailed"],
      options: [],
    }),
  ];
}

/**
 * @param {number} cardIdx 1..3
 * @returns {Array<Record<string, unknown>>}
 */
/** @param {Record<string, unknown>} fd */
function resolveVpCarAnswerKey(fd) {
  const explicit = String(fd.car_answer_key || "").trim();
  if (explicit) return explicit;
  return String(fd.key || "").trim();
}

export function buildVehiclePreferenceChildrenForCard(cardIdx) {
  const mkBase = () => ({
    default_value: null,
    validation: {},
    prefill: {},
    visibility_rule_json: {},
    vehicle_request_index: cardIdx,
  });
  return vehiclePreferenceFieldTemplates().map((fd) => {
    const carKey = resolveVpCarAnswerKey(fd);
    const row = {
      ...mkBase(),
      id: vpStableChildId(cardIdx, fd.key),
      label: fd.label,
      help_text: String(fd.help_text || ""),
      input_type: fd.input_type,
      placeholder: fd.placeholder || "",
      required: Boolean(fd.required),
      options: fd.options || [],
      vp_modes: fd.vp_modes,
    };
    if (fd.default_value != null && fd.default_value !== "") {
      row.default_value = fd.default_value;
    }
    if (carKey) row.car_answer_key = carKey;
    return row;
  });
}

/**
 * @param {number} slotCount 1..9 — matches admin “Vehicle # (multiple cars)”
 * @returns {Array<Record<string, unknown>>}
 */
export function buildVehiclePreferenceChildrenForCount(slotCount) {
  const n = Math.max(1, Math.min(VP_MAX_CARDS, Number(slotCount) || 1));
  const out = [];
  for (let i = 1; i <= n; i++) out.push(...buildVehiclePreferenceChildrenForCard(i));
  return out;
}

/** @returns {Array<Record<string, unknown>>} */
export function buildAllVehiclePreferenceChildren() {
  return buildVehiclePreferenceChildrenForCount(3);
}

/**
 * @param {Record<string, unknown>} up
 * @param {string} messageId
 * @param {(s: string) => string} escapeHtml
 */
export function renderVehiclePreferenceGroupHtml(up, messageId, escapeHtml) {
  const mid = String(messageId || "msg").replace(/[^a-zA-Z0-9_-]/g, "_");
  const children = Array.isArray(up.children) ? up.children : buildAllVehiclePreferenceChildren();
  const byCard = groupVehiclePreferenceChildren(children);
  const slotCount = Math.max(1, vehiclePreferenceSlotCountFromChildren(children));
  const intro = `Add up to ${slotCount} vehicle preferences. Start with your first choice. You can be specific or keep it simple.`;

  const cards = [];
  for (let cardIdx = 1; cardIdx <= slotCount; cardIdx++) {
    const cardChildren = byCard.get(cardIdx) || [];
    if (!cardChildren.length) continue;
    const hidden = cardIdx > 1 ? ' hidden aria-hidden="true"' : "";
    const fieldsHtml = cardChildren.map((ch) => renderVpFieldRow(ch, mid, cardIdx, escapeHtml)).join("");
    const cardTitle = vehiclePreferenceSlotLabel(cardIdx);
    cards.push(`<section class="lhai-vp-card" data-vp-card="${cardIdx}"${hidden}>
      <h4 class="lhai-vp-card__title">${escapeHtml(cardTitle)}</h4>
      <div class="lhai-vp-card__fields">${fieldsHtml}</div>
      <button type="button" class="lhai-vp-more-details" data-vp-more-details hidden>Add more details</button>
    </section>`);
  }

  const actionsHtml =
    cards.length > 0
      ? `<div class="lhai-vp-actions" data-vp-actions>
    <p class="lhai-vp-actions__prompt" data-vp-actions-prompt></p>
    <div class="lhai-vp-actions__buttons">
      <button type="button" class="lhai-button lhai-button--primary" data-vp-submit></button>
      <button type="button" class="lhai-button lhai-button--secondary" data-vp-add></button>
    </div>
  </div>`
      : "";

  return `<div class="lhai-vp-root" data-lhai-vp-root data-lhai-intake-group role="group">
    <p class="lhai-vp-intro">${escapeHtml(intro)}</p>
    ${cards.join("")}
    ${actionsHtml}
  </div>`;
}

/**
 * @param {Record<string, unknown>} ch
 * @param {string} mid
 * @param {number} cardIdx
 * @param {(s: string) => string} escapeHtml
 */
function renderVpFieldRow(ch, mid, cardIdx, escapeHtml) {
  const key = String(ch.id || "").replace(/^vp\d+_/, "");
  const cid = String(ch.id || "").trim();
  const lab = String(ch.label || "").trim();
  const help = String(ch.help_text || "").trim();
  const req = Boolean(ch.required);
  const reqHtml = req ? ` <abbr class="lhai-chat-form-prompt__req" title="required">*</abbr>` : "";
  const cit = String(ch.input_type || "text").toLowerCase();
  const options = Array.isArray(ch.options) ? ch.options : [];
  const def = ch.default_value != null ? String(ch.default_value) : "";
  const rawVal = ch.value != null && String(ch.value).trim() !== "" ? String(ch.value).trim() : "";
  const iv = rawVal || def;
  const suff = `${mid}-vp${cardIdx}-${key}`;
  const modeAttr = `data-vp-field="${escapeHtml(key)}" data-vp-mode-field`;
  let inner = "";

  const citNorm =
    cit === "pill_select" ? "select" : cit === "checkbox_group" ? "multi_select" : cit;

  if (cit === "radio") {
    const name = `lhai-vp-r-${suff}`;
    const opts = [...options].sort((a, b) => Number(a.sort_order || 0) - Number(b.sort_order || 0));
    const isDetailLevel = key === "detail_level";
    inner = `<div class="lhai-chat-form-prompt__radio-group lhai-vp-segmented${isDetailLevel ? " lhai-vp-detail-level" : ""}" role="radiogroup" aria-label="${escapeHtml(lab)}">
      ${opts
        .map((o, i) => {
          const val = String(o.value ?? "");
          const olab = String(o.label ?? val);
          const ohelp = String(o.help ?? "").trim();
          const id = `${name}-${i}`;
          const checked =
            val === iv || (!iv && val === "simple" && key === "detail_level") ? " checked" : "";
          const helpHtml = ohelp
            ? `<span class="lhai-vp-radio-help">${escapeHtml(ohelp)}</span>`
            : "";
          return `<label class="lhai-chat-form-prompt__radio-label lhai-vp-radio-option" for="${escapeHtml(id)}">
            <input type="radio" name="${escapeHtml(name)}" id="${escapeHtml(id)}" value="${escapeHtml(val)}" class="lhai-chat-form-prompt__radio"${checked} />
            <span class="lhai-vp-radio-labels"><span class="lhai-vp-radio-title">${escapeHtml(olab)}</span>${helpHtml}</span>
          </label>`;
        })
        .join("")}
    </div>`;
  } else if (citNorm === "select") {
    const opts = [...options].sort((a, b) => Number(a.sort_order || 0) - Number(b.sort_order || 0));
    const optHtml = opts
      .map((o) => {
        const val = String(o.value ?? "");
        const olab = String(o.label ?? val);
        const selMark = val === iv ? " selected" : "";
        return `<option value="${escapeHtml(val)}"${selMark}>${escapeHtml(olab)}</option>`;
      })
      .join("");
    const pillCls = cit === "pill_select" || key === "vehicle_type" ? " lhai-vp-field--pills" : "";
    inner = `<select class="lhai-chat-form-prompt__input lhai-chat-form-prompt__select" aria-label="${escapeHtml(lab)}">
      <option value="">${escapeHtml("Select…")}</option>
      ${optHtml}
    </select>`;
    return wrapVpField(cid, key, lab, help, reqHtml, inner, modeAttr, pillCls, cardIdx, escapeHtml, cit);
  } else if (citNorm === "multi_select") {
    const opts = [...options].sort((a, b) => Number(a.sort_order || 0) - Number(b.sort_order || 0));
    const saved = iv ? iv.split(",").map((x) => x.trim()) : [];
    inner = `<div class="lhai-chat-form-prompt__checks" role="group" aria-label="${escapeHtml(lab)}">
      ${opts
        .map((o, i) => {
          const val = String(o.value ?? "");
          const olab = String(o.label ?? val);
          const id = `lhai-vp-ms-${suff}-${i}`;
          const checked = saved.includes(val) ? " checked" : "";
          return `<label class="lhai-chat-form-prompt__check-label" for="${escapeHtml(id)}">
            <input type="checkbox" id="${escapeHtml(id)}" class="lhai-chat-form-prompt__cb" value="${escapeHtml(val)}"${checked} />
            <span>${escapeHtml(olab)}</span>
          </label>`;
        })
        .join("")}
    </div>`;
  } else if (cit === "textarea") {
    inner = `<textarea class="lhai-chat-form-prompt__input lhai-chat-form-prompt__textarea" rows="2" maxlength="8000" placeholder="${escapeHtml(String(ch.placeholder || ""))}" aria-label="${escapeHtml(lab)}">${escapeHtml(iv)}</textarea>`;
  } else {
    inner = `<input type="text" class="lhai-chat-form-prompt__input lhai-chat-form-prompt__text lhai-vp-other-text" value="${escapeHtml(iv)}" maxlength="200" aria-label="${escapeHtml(lab)}" />`;
  }

  return wrapVpField(cid, key, lab, help, reqHtml, inner, modeAttr, "", cardIdx, escapeHtml, cit);
}

function wrapVpField(cid, key, lab, help, reqHtml, inner, modeAttr, extraCls, cardIdx, escapeHtml, rawCit) {
  const otherKeys = new Set(["make_other", "model_other", "color_other"]);
  const hiddenOther = otherKeys.has(key) ? ' hidden data-vp-other-for="' + key.replace("_other", "") + '"' : "";
  const citAttr = rawCit ? ` data-child-input-type="${escapeHtml(String(rawCit))}"` : "";
  return `<div class="lhai-chat-form-prompt__group-child lhai-vp-field${extraCls}${hiddenOther}" data-child-id="${escapeHtml(cid)}" data-child-input-type="${escapeHtml(key)}"${citAttr} data-vp-card-field="${cardIdx}" ${modeAttr}>
    <div class="lhai-chat-form-prompt__child-label">${escapeHtml(lab)}${reqHtml}</div>
    ${help ? `<div class="lhai-chat-form-prompt__child-help u-text-muted">${escapeHtml(help)}</div>` : ""}
    <div class="lhai-chat-form-prompt__child-controls">${inner}</div>
  </div>`;
}

const VP_SIMPLE_FIELDS = new Set([
  "vehicle_type",
  "budget_max",
  "top_priorities",
  "desired_timeline",
  "notes",
]);

const VP_DETAILED_BASE = new Set([
  "preference_type",
  "vehicle_type",
  "year_min",
  "mileage_max",
  "budget_max",
  "must_have_features",
  "color_preference",
  "color_other",
  "notes",
]);

const VP_DETAILED_MAKE_MODEL = new Set(["make", "model", "make_other", "model_other"]);

/** @param {HTMLElement} cardEl */
function getVpDetailLevel(cardEl) {
  const checked = cardEl.querySelector('[data-vp-field="detail_level"] input[type="radio"]:checked');
  if (checked instanceof HTMLInputElement && checked.value) return checked.value;
  const makeSel = cardEl.querySelector('[data-vp-field="make"] select');
  if (makeSel instanceof HTMLSelectElement) {
    const mv = String(makeSel.value || "").trim();
    if (mv && mv !== "any") return "detailed";
  }
  const prefType = cardEl.querySelector('[data-vp-field="preference_type"]');
  if (prefType && !prefType.hidden) return "detailed";
  return "simple";
}

/** @param {HTMLElement} fieldEl @param {string} detailLevel @param {string} prefType */
function shouldShowVpField(fieldEl, detailLevel, prefType) {
  const fk = fieldEl.getAttribute("data-vp-field") || "";
  if (fk === "detail_level") return true;
  if (detailLevel === "simple") return VP_SIMPLE_FIELDS.has(fk);
  if (!VP_DETAILED_BASE.has(fk) && !VP_DETAILED_MAKE_MODEL.has(fk)) return false;
  if (VP_DETAILED_MAKE_MODEL.has(fk)) {
    return prefType === "exact_vehicle" || prefType === "similar_vehicle";
  }
  if (fk === "preference_type") return true;
  return true;
}

/**
 * @param {HTMLElement} root
 */
export function syncVehiclePreferenceCardVisibility(root) {
  if (!(root instanceof HTMLElement)) return;
  root.querySelectorAll(".lhai-vp-card").forEach((cardEl) => {
    if (!(cardEl instanceof HTMLElement)) return;
    const detailLevel = getVpDetailLevel(cardEl);
    const prefRadio = cardEl.querySelector('[data-vp-field="preference_type"] input[type="radio"]:checked');
    const prefType =
      prefRadio instanceof HTMLInputElement ? prefRadio.value : "open_to_suggestions";
    const moreBtn = cardEl.querySelector("[data-vp-more-details]");
    if (moreBtn instanceof HTMLButtonElement) {
      moreBtn.hidden = detailLevel !== "simple";
    }
    cardEl.querySelectorAll("[data-vp-mode-field]").forEach((fieldEl) => {
      if (!(fieldEl instanceof HTMLElement)) return;
      const fk = fieldEl.getAttribute("data-vp-field") || "";
      const show = shouldShowVpField(fieldEl, detailLevel, prefType);
      fieldEl.hidden = !show;
      if (!show) clearVpFieldValue(fieldEl);
      if (fk === "vehicle_type" && show) {
        const sel = fieldEl.querySelector("select");
        if (sel instanceof HTMLSelectElement) {
          fieldEl.classList.toggle("lhai-vp-field--pills", detailLevel === "simple");
        }
      }
    });
    syncVpOtherInputs(cardEl);
    if (detailLevel === "detailed") syncVpModelOptions(cardEl);
  });
  syncVpActions(root);
}

/** @param {HTMLElement} root */
function getVpVisibleCardCount(root) {
  return [...root.querySelectorAll(".lhai-vp-card")].filter(
    (c) => c instanceof HTMLElement && !c.hidden
  ).length;
}

/** @param {HTMLElement} root */
function getVpMaxCardSlots(root) {
  return root.querySelectorAll(".lhai-vp-card").length;
}

/**
 * @param {HTMLElement} root
 */
function syncVpActions(root) {
  const actions = root.querySelector("[data-vp-actions]");
  if (!(actions instanceof HTMLElement)) return;

  const visibleCount = getVpVisibleCardCount(root);
  const maxSlots = getVpMaxCardSlots(root);
  const atMax = visibleCount >= maxSlots || visibleCount >= 3;

  const promptEl = actions.querySelector("[data-vp-actions-prompt]");
  const submitBtn = actions.querySelector("[data-vp-submit]");
  const addBtn = actions.querySelector("[data-vp-add]");

  let prompt = "";
  let submitLabel = "Submit vehicle preferences";
  let addLabel = "+ Add another vehicle preference";
  let hideAdd = maxSlots <= 1;

  if (atMax) {
    const cap = Math.min(maxSlots, 3);
    prompt = `You added the maximum of ${cap} vehicle preferences.`;
    submitLabel = "Submit vehicle preferences";
    hideAdd = true;
  } else if (visibleCount === 2) {
    prompt = "Would you like to add one more vehicle preference?";
    submitLabel = "Submit with 2 vehicle preferences";
    addLabel = "+ Add one more vehicle preference";
    hideAdd = false;
  } else {
    prompt = "Would you like to add another vehicle preference?";
    submitLabel = "Submit with 1 vehicle preference";
    addLabel = "+ Add another vehicle preference";
    hideAdd = maxSlots <= 1;
  }

  if (promptEl instanceof HTMLElement) promptEl.textContent = prompt;
  if (submitBtn instanceof HTMLButtonElement) submitBtn.textContent = submitLabel;
  if (addBtn instanceof HTMLButtonElement) {
    addBtn.textContent = addLabel;
    addBtn.hidden = hideAdd;
  }
}

/**
 * Reuse the existing intake form submit handler (no duplicate payload).
 * @param {HTMLElement} root
 * @returns {boolean}
 */
function triggerIntakeFormSubmitFromVpRoot(root) {
  const formRoot = root.closest("[data-lhai-intake-form]");
  if (!(formRoot instanceof HTMLElement)) return false;
  const submitBtn = formRoot.querySelector("[data-lhai-intake-submit]");
  if (!(submitBtn instanceof HTMLButtonElement)) return false;
  submitBtn.click();
  return true;
}

/**
 * @param {HTMLElement} cardEl
 */
function syncVpModelOptions(cardEl) {
  const makeSel = cardEl.querySelector('[data-vp-field="make"] select');
  const modelSel = cardEl.querySelector('[data-vp-field="model"] select');
  if (!(makeSel instanceof HTMLSelectElement) || !(modelSel instanceof HTMLSelectElement)) return;
  const make = String(makeSel.value || "").trim();
  const models = VP_MODELS_BY_MAKE[make] || ["Any model", "Other"];
  const prev = modelSel.value;
  modelSel.innerHTML = `<option value="">Select…</option>${models
    .map((m) => {
      const v = m.startsWith("Any") ? "any_model" : m === "Other" ? "other" : m;
      return `<option value="${v}">${m}</option>`;
    })
    .join("")}`;
  if ([...modelSel.options].some((o) => o.value === prev)) modelSel.value = prev;
}

/**
 * @param {HTMLElement} cardEl
 */
function syncVpOtherInputs(cardEl) {
  const pairs = [
    ["make", "make_other"],
    ["model", "model_other"],
    ["color_preference", "color_other"],
  ];
  for (const [mainKey, otherKey] of pairs) {
    const main = cardEl.querySelector(`[data-vp-field="${mainKey}"] select`);
    const other = cardEl.querySelector(`[data-vp-field="${otherKey}"]`);
    if (!(other instanceof HTMLElement)) continue;
    const show =
      main instanceof HTMLSelectElement &&
      (main.value === "Other" || main.value === "other" || main.value === "other");
    other.hidden = !show;
    if (!show) clearVpFieldValue(other);
  }
}

/** @param {HTMLElement} fieldEl */
function clearVpFieldValue(fieldEl) {
  fieldEl.querySelectorAll("input, select, textarea").forEach((el) => {
    if (el instanceof HTMLInputElement) {
      if (el.type === "checkbox" || el.type === "radio") el.checked = false;
      else el.value = "";
    } else if (el instanceof HTMLSelectElement) el.selectedIndex = 0;
    else if (el instanceof HTMLTextAreaElement) el.value = "";
  });
}

/**
 * @param {HTMLElement} root
 */
export function bindVehiclePreferenceGroup(root) {
  if (!(root instanceof HTMLElement)) return;
  const onChange = () => syncVehiclePreferenceCardVisibility(root);
  root.addEventListener("change", (ev) => {
    const t = ev.target;
    if (!(t instanceof HTMLElement)) return;
    if (
      t.matches('select, input[type="radio"], input[type="checkbox"]') &&
      root.contains(t)
    ) {
      onChange();
    }
  });
  root.addEventListener("click", (ev) => {
    const t = ev.target;
    if (!(t instanceof Element)) return;
    const moreBtn = t.closest("[data-vp-more-details]");
    if (moreBtn instanceof HTMLButtonElement && root.contains(moreBtn)) {
      ev.preventDefault();
      const card = moreBtn.closest(".lhai-vp-card");
      const detailedRadio = card?.querySelector(
        '[data-vp-field="detail_level"] input[type="radio"][value="detailed"]'
      );
      if (detailedRadio instanceof HTMLInputElement) {
        detailedRadio.checked = true;
        syncVehiclePreferenceCardVisibility(root);
      }
      return;
    }
    const addBtn = t.closest("[data-vp-add]");
    if (addBtn instanceof HTMLButtonElement && root.contains(addBtn) && !addBtn.hidden) {
      ev.preventDefault();
      const hidden = root.querySelector(".lhai-vp-card[hidden]");
      if (hidden instanceof HTMLElement) {
        hidden.hidden = false;
        hidden.removeAttribute("aria-hidden");
      }
      syncVpActions(root);
      return;
    }
    const submitVp = t.closest("[data-vp-submit]");
    if (submitVp instanceof HTMLButtonElement && root.contains(submitVp)) {
      ev.preventDefault();
      triggerIntakeFormSubmitFromVpRoot(root);
    }
  });
  syncVehiclePreferenceCardVisibility(root);
}

/**
 * @param {HTMLElement} fieldEl
 * @param {string} cit
 * @returns {{ ok: boolean, valueJson?: Record<string, unknown>, error?: string }}
 */
export function collectVpFieldValue(fieldEl, cit) {
  if (!(fieldEl instanceof HTMLElement) || fieldEl.hidden) {
    return { ok: true, valueJson: { value: "" } };
  }
  if (cit === "multi_select" || fieldEl.querySelector(".lhai-chat-form-prompt__cb")) {
    const vals = Array.from(fieldEl.querySelectorAll(".lhai-chat-form-prompt__cb:checked")).map((c) =>
      String(/** @type {HTMLInputElement} */ (c).value)
    );
    return { ok: true, valueJson: { values: vals } };
  }
  if (cit === "radio" || fieldEl.querySelector('.lhai-chat-form-prompt__radio-group input[type="radio"]')) {
    const sel = fieldEl.querySelector('input[type="radio"]:checked');
    if (!(sel instanceof HTMLInputElement)) return { ok: false, error: "Please choose an option." };
    return { ok: true, valueJson: { value: sel.value } };
  }
  if (fieldEl.querySelector("select")) {
    const sel = fieldEl.querySelector("select");
    if (!(sel instanceof HTMLSelectElement)) return { ok: false, error: "Select a value." };
    const v = String(sel.value || "").trim();
    if (!v && fieldEl.querySelector(".lhai-chat-form-prompt__req")) {
      return { ok: false, error: "Select a value." };
    }
    return { ok: true, valueJson: { value: v } };
  }
  if (fieldEl.querySelector("textarea")) {
    const ta = fieldEl.querySelector("textarea");
    if (!(ta instanceof HTMLTextAreaElement)) return { ok: true, valueJson: { value: "" } };
    return { ok: true, valueJson: { value: String(ta.value || "").trim() } };
  }
  const inp = fieldEl.querySelector("input.lhai-vp-other-text, input.lhai-chat-form-prompt__text");
  if (inp instanceof HTMLInputElement) {
    return { ok: true, valueJson: { value: String(inp.value || "").trim() } };
  }
  return { ok: true, valueJson: { value: "" } };
}

/**
 * @param {Record<string, Record<string, unknown>>} ga
 */
function mergeMakeModelOtherIntoAnswers(ga) {
  for (const id of Object.keys(ga)) {
    if (id.endsWith("_make_other")) {
      const v = ga[id]?.value;
      if (v) ga[id.replace("_make_other", "_make")] = { value: String(v) };
    }
    if (id.endsWith("_model_other")) {
      const v = ga[id]?.value;
      if (v) ga[id.replace("_model_other", "_model")] = { value: String(v) };
    }
    if (id.endsWith("_color_other")) {
      const v = ga[id]?.value;
      if (v) ga[id.replace("_color_other", "_color_preference")] = { value: String(v) };
    }
  }
}

/** @param {Record<string, unknown>} ch */
function normalizeVpChildInputType(ch) {
  const t = String(ch.input_type || "text").toLowerCase();
  if (t === "dropdown" || t === "pill_select") return "select";
  if (t === "multi_select" || t === "checkbox" || t === "checkbox_group") return "multi_select";
  return t;
}

/** @param {string} cit @param {Record<string, unknown>} vj */
function intakeVpAnswerLooksEmpty(cit, vj) {
  if (cit === "multi_select") {
    const vals = vj.values;
    return !Array.isArray(vals) || vals.length === 0;
  }
  const v = vj.value;
  return v === undefined || v === null || String(v).trim() === "";
}

/**
 * @param {HTMLElement} container
 * @param {Array<Record<string, unknown>>} children
 * @returns {{ ok: boolean, valueJson?: Record<string, unknown>, error?: string }}
 */
export function collectVehiclePreferenceGroupAnswers(container, children) {
  const vpRoot = container.querySelector("[data-lhai-vp-root]");
  if (!(vpRoot instanceof HTMLElement)) {
    return { ok: false, error: "Vehicle preference form not found." };
  }
  /** @type {Record<string, Record<string, unknown>>} */
  const group_answers = {};
  for (const ch of children) {
    const cid = String(ch.id || "").trim();
    if (!cid) continue;
    const fieldEl = vpRoot.querySelector(`.lhai-chat-form-prompt__group-child[data-child-id="${cid}"]`);
    if (!(fieldEl instanceof HTMLElement)) continue;
    const card = fieldEl.closest(".lhai-vp-card");
    if (card instanceof HTMLElement && card.hidden) continue;
    if (fieldEl.hidden) continue;
    const cit = normalizeVpChildInputType(ch);
    const sub = collectVpFieldValue(fieldEl, cit);
    if (!sub.ok) return { ok: false, error: sub.error };
    group_answers[cid] = /** @type {Record<string, unknown>} */ (sub.valueJson || {});
  }
  mergeMakeModelOtherIntoAnswers(group_answers);
  return { ok: true, valueJson: { group_answers } };
}

/**
 * @param {HTMLElement} container
 * @param {Array<Record<string, unknown>>} children
 * @returns {{ ok: boolean, error?: string }}
 */
export function validateVehiclePreferenceGroup(container, children) {
  const vpRoot = container.querySelector("[data-lhai-vp-root]");
  if (!(vpRoot instanceof HTMLElement)) return { ok: true };
  const cards = [...vpRoot.querySelectorAll(".lhai-vp-card")].filter(
    (c) => c instanceof HTMLElement && !c.hidden
  );
  for (const card of cards) {
    if (!(card instanceof HTMLElement)) continue;
    const detailRadio = card.querySelector(
      '[data-vp-field="detail_level"] input[type="radio"]:checked'
    );
    const detailLevel =
      detailRadio instanceof HTMLInputElement && detailRadio.value
        ? detailRadio.value
        : getVpDetailLevel(card);
    if (!detailLevel) {
      return { ok: false, error: "Choose how much detail you want to provide." };
    }
    const budgetSel = card.querySelector('[data-vp-field="budget_max"] select');
    if (budgetSel instanceof HTMLSelectElement && !String(budgetSel.value || "").trim()) {
      return { ok: false, error: "Select a maximum budget." };
    }
    if (detailLevel === "simple") {
      const vtSel = card.querySelector('[data-vp-field="vehicle_type"] select');
      if (vtSel instanceof HTMLSelectElement && !String(vtSel.value || "").trim()) {
        return { ok: false, error: "Select a vehicle type." };
      }
    } else {
      const prefRadio = card.querySelector(
        '[data-vp-field="preference_type"] input[type="radio"]:checked'
      );
      if (!(prefRadio instanceof HTMLInputElement) || !prefRadio.value) {
        return { ok: false, error: "Choose how specific your vehicle request is." };
      }
    }
    for (const ch of children) {
      if (!ch?.required) continue;
      const cid = String(ch.id || "").trim();
      const fieldEl = card.querySelector(`[data-child-id="${cid}"]`);
      if (!(fieldEl instanceof HTMLElement) || fieldEl.hidden) continue;
      const cit = normalizeVpChildInputType(ch);
      const sub = collectVpFieldValue(fieldEl, cit);
      if (!sub.ok) return { ok: false, error: sub.error };
      const vj = /** @type {Record<string, unknown>} */ (sub.valueJson || {});
      if (intakeVpAnswerLooksEmpty(cit, vj)) {
        return { ok: false, error: "Please complete all required fields." };
      }
    }
  }
  return { ok: true };
}

/**
 * Build human-readable summary for one vehicle card from group_answers + children.
 * @param {number} cardIdx
 * @param {Array<Record<string, unknown>>} children
 * @param {Record<string, Record<string, unknown>>} ga
 */
export function vehiclePreferenceCardSummary(cardIdx, children, ga) {
  const prefix = `vp${cardIdx}_`;
  const get = (k) => {
    const id = prefix + k;
    const row = ga[id];
    if (!row) return "";
    if (row.values) return /** @type {string[]} */ (row.values);
    return String(row.value || "").trim();
  };
  const labelFor = (chId, val) => {
    const ch = children.find((c) => String(c.id) === chId);
    if (!ch || !val) return String(val);
    const opts = Array.isArray(ch.options) ? ch.options : [];
    const hit = opts.find((o) => String(o.value) === String(val));
    return hit ? String(hit.label || val) : String(val);
  };

  const detailLevel = get("detail_level") || "simple";
  const budget = labelFor(`${prefix}budget_max`, get("budget_max"));
  const vtRaw = get("vehicle_type");
  const vtLabel = labelFor(`${prefix}vehicle_type`, vtRaw);
  const lines = [`Request #${cardIdx}`];

  if (detailLevel === "simple") {
    const vtPart =
      vtLabel && vtLabel !== "Any" ? `${vtLabel}` : "Any vehicle";
    const budgetPart = budget || "—";
    lines[0] = `Request #${cardIdx}: ${vtPart} under ${budgetPart}`;
    const priorities = get("top_priorities");
    const priLabels = Array.isArray(priorities)
      ? priorities.map((v) => labelFor(`${prefix}top_priorities`, v)).filter(Boolean).join(", ")
      : "";
    if (priLabels) lines.push(`Priorities: ${priLabels}`);
    const timeline = labelFor(`${prefix}desired_timeline`, get("desired_timeline"));
    if (timeline) lines.push(`Timeline: ${timeline}`);
  } else {
    const pref = get("preference_type");
    const make = labelFor(`${prefix}make`, get("make"));
    const model = labelFor(`${prefix}model`, get("model"));
    if (pref === "open_to_suggestions") {
      const vt = vtLabel && vtLabel !== "Any" ? vtLabel : "";
      lines[0] = vt
        ? `Request #${cardIdx}: ${vt} (open to suggestions)`
        : `Request #${cardIdx}: Open to suggestions`;
    } else if (make && make !== "Any") {
      const sim = pref === "similar_vehicle" ? " or similar" : "";
      lines[0] = `Request #${cardIdx}: ${make}${model && model !== "Any model" ? ` ${model}` : ""}${sim}`;
    }
    if (budget) lines.push(`Budget: ${budget}`);
    const year = labelFor(`${prefix}year_min`, get("year_min"));
    if (year && year !== "Any year") lines.push(`Year: ${year}`);
    const mileage = labelFor(`${prefix}mileage_max`, get("mileage_max"));
    if (mileage && mileage !== "Any mileage") lines.push(`Mileage: ${mileage}`);
    const feats = get("must_have_features");
    const featLabels = Array.isArray(feats)
      ? feats.map((v) => labelFor(`${prefix}must_have_features`, v)).filter(Boolean).join(", ")
      : "";
    if (featLabels) lines.push(`Must-have: ${featLabels}`);
  }
  return lines;
}
