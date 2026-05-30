/**
 * Partner bid detail entry script and HTML share the same cache-bust version.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const VERSION = "20260519-flicker-refresh-1";

test("partner-bid-request.html script src includes asset version query", () => {
  const html = readFileSync(join(ROOT, "src/pages/partner-bid-request.html"), "utf8");
  assert.match(
    html,
    new RegExp(
      `partner-bid-request\\.js\\?v=${VERSION.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`,
    ),
  );
});

test("partner-bid-request.js defines version and uses it in dynamic imports", () => {
  const js = readFileSync(
    join(ROOT, "src/assets/js/pages/partner-bid-request.js"),
    "utf8",
  );
  assert.match(js, new RegExp(`PARTNER_BID_DETAIL_ASSET_VERSION = "${VERSION}"`));
  assert.match(js, /partnerBidDetailModuleUrl\("partner-bid-request-car-ui\.js"\)/);
  assert.match(js, /partnerBidDetailModuleUrl\("partner-bid-request-product-ui\.js"\)/);
  assert.match(js, /\?v=\$\{encodeURIComponent\(PARTNER_BID_DETAIL_ASSET_VERSION\)\}/);
  assert.match(js, /partnerBidStructuralRenderKey/);
  assert.match(js, /softRefreshPartnerBidDetail/);
});
