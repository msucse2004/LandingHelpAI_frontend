/**
 * Step 11 — dashboard case card display helpers (no DOM / no live providers).
 */
import test from "node:test";
import assert from "node:assert/strict";
import { pathToFileURL, fileURLToPath } from "node:url";
import path from "node:path";

const FRONTEND_ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const logicPath = path.join(FRONTEND_ROOT, "src", "assets", "js", "pages", "dashboard-logic.js");

async function importFreshLogic() {
  const url = pathToFileURL(logicPath);
  url.searchParams.set("t", String(Date.now() + Math.random()));
  const logic = await import(url.href);
  const i18n = await import(
    new URL("../src/assets/js/core/i18n-client.js", import.meta.url).href
  );
  const originals = { t: i18n.t };
  i18n.t = (key, fallback) => fallback ?? key;
  return {
    ...logic,
    restore: () => {
      i18n.t = originals.t;
    },
  };
}

test("step11 dashboard uses display_title before title", async () => {
  const { customerCaseDisplayTitle, restore } = await importFreshLogic();
  try {
    assert.equal(
      customerCaseDisplayTitle({
        display_title: "고객센터 · 메시지",
        title: "Customer center · Messages",
      }),
      "고객센터 · 메시지"
    );
    assert.equal(
      customerCaseDisplayTitle({ title: "Customer center · Messages" }),
      "Customer center · Messages"
    );
  } finally {
    restore();
  }
});

test("step11 dashboard uses display_status_label before raw status", async () => {
  const { customerCaseDisplayStatusLabel, restore } = await importFreshLogic();
  try {
    assert.equal(
      customerCaseDisplayStatusLabel({
        case_kind: "messaging",
        unread: true,
        display_status_label: "새 메시지",
      }),
      "새 메시지"
    );
    assert.equal(
      customerCaseDisplayStatusLabel({
        case_kind: "messaging",
        unread: true,
      }),
      "New message"
    );
  } finally {
    restore();
  }
});
