import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import test from "node:test";
import assert from "node:assert/strict";

const __dirname = dirname(fileURLToPath(import.meta.url));
const LOGIC_PATH = join(__dirname, "../src/assets/js/pages/invoice-detail-details-logic.js");

async function importFreshLogic() {
  const url = pathToFileURL(LOGIC_PATH);
  url.searchParams.set("t", String(Date.now() + Math.random()));
  return import(url.href);
}

test("buildInvoiceDueDateDisplay uses fallback when due date empty", async () => {
  const { buildInvoiceDueDateDisplay } = await importFreshLogic();
  const fallback =
    "별도 납기일은 없습니다. 결제 완료 후 서비스 안내가 시작됩니다.";
  const out = buildInvoiceDueDateDisplay("", () => "", () => fallback);
  assert.equal(out.text, fallback);
  assert.equal(out.muted, true);
});

test("buildInvoiceDueDateDisplay formats due date when present", async () => {
  const { buildInvoiceDueDateDisplay } = await importFreshLogic();
  const out = buildInvoiceDueDateDisplay(
    "2026-06-01",
    (raw) => (raw === "2026-06-01" ? "2026년 6월 1일" : ""),
    () => "fallback",
  );
  assert.equal(out.text, "2026년 6월 1일");
  assert.equal(out.muted, false);
});

test("invoiceReferenceMonoText returns em dash for blank", async () => {
  const { invoiceReferenceMonoText } = await importFreshLogic();
  assert.equal(invoiceReferenceMonoText("  "), "—");
  assert.equal(invoiceReferenceMonoText("inv-abc"), "inv-abc");
});
