import { normalizeDeliveryModeKey } from "./quote-detail-pricing-logic.js";

/** @param {Array<Record<string, unknown>> | ReturnType<typeof normalizeModesFromQuote>} modes */
export function normalizeSupportModeKeys(modes) {
  if (!Array.isArray(modes) || !modes.length) return ["general"];
  const out = [];
  const seen = new Set();
  for (const m of modes) {
    const key = normalizeDeliveryModeKey(m);
    if (!seen.has(key)) {
      seen.add(key);
      out.push(key);
    }
  }
  return out.length ? out : ["general"];
}

/**
 * @param {string[]} modeKeys
 * @returns {"agent" | "general"}
 */
export function resolveSupportSectionTitleVariant(modeKeys) {
  const keys = normalizeSupportModeKeys(modeKeys);
  if (keys.length === 1 && keys[0] === "ai_guide") return "agent";
  return "general";
}

/**
 * @param {string[]} modeKeys
 * @returns {"agent" | "ai_plus_human" | "in_person" | "general"}
 */
export function resolveSupportContentVariant(modeKeys) {
  const keys = normalizeSupportModeKeys(modeKeys);
  if (keys.length === 1) {
    if (keys[0] === "in_person") return "in_person";
    if (keys[0] === "ai_plus_human") return "ai_plus_human";
    if (keys[0] === "ai_guide") return "agent";
    if (keys[0] === "general") return "general";
  }
  if (keys.includes("in_person") && !keys.includes("ai_guide") && !keys.includes("ai_plus_human")) {
    return "in_person";
  }
  if (keys.includes("ai_plus_human")) return "ai_plus_human";
  return "agent";
}

/**
 * @param {string[]} modeKeys
 * @returns {{ titleVariant: "agent" | "general", contentVariant: string, deliveryModeKeys: string[], agentBulletIds: string[], youBulletIds: string[], humanBulletIds: string[] }}
 */
export function buildQuoteSupportContent(modeKeys) {
  const deliveryModeKeys = normalizeSupportModeKeys(modeKeys);
  const titleVariant = resolveSupportSectionTitleVariant(deliveryModeKeys);
  const contentVariant = resolveSupportContentVariant(deliveryModeKeys);

  /** @type {string[]} */
  let agentBulletIds = ["agent.1", "agent.2", "agent.3"];
  if (contentVariant === "in_person") {
    agentBulletIds = ["support.in_person.1", "support.in_person.2", "support.in_person.3"];
  } else if (contentVariant === "ai_plus_human") {
    agentBulletIds = ["support.ai_plus.1", "support.ai_plus.2", "agent.3"];
  } else if (contentVariant === "general") {
    agentBulletIds = ["support.general.1", "support.general.2", "agent.3"];
  }

  const youBulletIds = ["you.1", "you.2", "you.3"];
  const humanBulletIds = ["human.1", "human.2"];

  return {
    titleVariant,
    contentVariant,
    deliveryModeKeys,
    agentBulletIds,
    youBulletIds,
    humanBulletIds,
  };
}

/** @param {unknown} quote @param {(quote: unknown) => string[]} getModeKeys */
export function buildQuoteSupportContentFromQuote(quote, getModeKeys) {
  const modeKeys = typeof getModeKeys === "function" ? getModeKeys(quote) : [];
  return buildQuoteSupportContent(modeKeys);
}
