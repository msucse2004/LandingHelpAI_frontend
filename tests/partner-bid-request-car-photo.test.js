import test from "node:test";
import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";

async function importFresh(modulePath) {
  const url = pathToFileURL(modulePath);
  url.searchParams.set("t", String(Date.now() + Math.random()));
  return await import(url.href);
}

const logicPath =
  "c:\\workspace\\LandingHelpAI\\LandingHelpAI_frontend\\src\\assets\\js\\pages\\partner-bid-request-car-logic.js";

test("validateBidOfferPhotoFile rejects oversize and unsupported types", async () => {
  const m = await importFresh(logicPath);
  assert.equal(m.validateBidOfferPhotoFile(null), "empty");
  const badType = new File([new Uint8Array([1])], "x.pdf", { type: "application/pdf" });
  assert.equal(m.validateBidOfferPhotoFile(badType), "bad_type");
  const huge = new File([new Uint8Array([1])], "big.jpg", {
    type: "image/jpeg",
  });
  Object.defineProperty(huge, "size", { value: m.MAX_BID_OFFER_PHOTO_BYTES + 1 });
  assert.equal(m.validateBidOfferPhotoFile(huge), "too_large");
  const ok = new File([new Uint8Array([1, 2, 3])], "ok.png", { type: "image/png" });
  assert.equal(m.validateBidOfferPhotoFile(ok), null);
});
