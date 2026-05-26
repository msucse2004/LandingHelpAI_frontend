import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import test from "node:test";
import assert from "node:assert/strict";

const __dirname = dirname(fileURLToPath(import.meta.url));
const LOGIC_PATH = join(__dirname, "../src/assets/js/pages/invoice-detail-action-state-logic.js");

async function importFreshLogic() {
  const url = pathToFileURL(LOGIC_PATH);
  url.searchParams.set("t", String(Date.now() + Math.random()));
  return import(url.href);
}

test("normalizeInvoiceStatus maps CANCELLED to CANCELED", async () => {
  const { normalizeInvoiceStatus } = await importFreshLogic();
  assert.equal(normalizeInvoiceStatus("cancelled"), "CANCELED");
});

test("getInvoiceActionState pending payment for SENT and PENDING", async () => {
  const { getInvoiceActionState, INVOICE_UX_GROUP } = await importFreshLogic();
  for (const st of ["SENT", "PENDING", "FAILED"]) {
    const a = getInvoiceActionState({ status: st });
    assert.equal(a.group, INVOICE_UX_GROUP.PENDING_PAYMENT, st);
    assert.equal(a.showPay, true, st);
    assert.equal(a.showAsk, true, st);
    assert.equal(a.showMessages, false, st);
  }
});

test("getInvoiceActionState paid shows messages only", async () => {
  const { getInvoiceActionState, INVOICE_UX_GROUP } = await importFreshLogic();
  const a = getInvoiceActionState({ status: "PAID" });
  assert.equal(a.group, INVOICE_UX_GROUP.PAID);
  assert.equal(a.canPay, false);
  assert.equal(a.showPay, false);
  assert.equal(a.showAsk, false);
  assert.equal(a.showMessages, true);
});

test("getInvoiceActionState unpayable hides pay", async () => {
  const { getInvoiceActionState, INVOICE_UX_GROUP } = await importFreshLogic();
  for (const st of ["CANCELED", "VOID", "EXPIRED", "DRAFT"]) {
    const a = getInvoiceActionState({ status: st });
    assert.equal(a.group, INVOICE_UX_GROUP.UNPAYABLE, st);
    assert.equal(a.showPay, false, st);
    assert.equal(a.showAsk, true, st);
  }
});

test("getInvoiceActionState unknown does not allow pay", async () => {
  const { getInvoiceActionState, INVOICE_UX_GROUP } = await importFreshLogic();
  const a = getInvoiceActionState({ status: "PROCESSING" });
  assert.equal(a.group, INVOICE_UX_GROUP.UNKNOWN);
  assert.equal(a.canPay, false);
  assert.equal(a.showPay, false);
});
