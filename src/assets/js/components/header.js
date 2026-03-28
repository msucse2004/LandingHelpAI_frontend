import { qs } from "../core/utils.js";

async function mountHeader(targetSelector = "[data-header]") {
  const target = qs(targetSelector);
  if (!target) return;

  try {
    const response = await fetch("../partials/header.html");
    if (!response.ok) throw new Error("Failed to load header partial");
    target.innerHTML = await response.text();
  } catch {
    target.innerHTML = "<header class='lhai-topbar'><div class='lhai-brand'>Landing Help AI</div></header>";
  }
}

export { mountHeader };
