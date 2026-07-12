import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const FRONTEND_ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

function read(relPath) {
  return readFileSync(path.join(FRONTEND_ROOT, relPath), "utf8");
}

test("customerBidsApi list endpoints send lang query and Accept-Language", () => {
  const api = read("src/assets/js/core/api.js");
  assert.match(api, /async listByServiceRequest\(serviceRequestId, query\)/);
  assert.match(api, /async listByThread\(threadId, query\)/);
  assert.match(
    api,
    /listByServiceRequest[\s\S]*?tryBackendGet\(path, messagesViewerLanguageHeaders\(\)\)/,
  );
  assert.match(
    api,
    /listByThread[\s\S]*?tryBackendGet\(path, messagesViewerLanguageHeaders\(\)\)/,
  );
  assert.match(api, /appendViewerLanguageQueryParams\(p\)/);
  assert.match(api, /product_category/);
  assert.match(api, /has_photos/);
});

test("customer bid results refetches on language change only", () => {
  const page = read("src/assets/js/pages/customer-bid-results.js");
  assert.match(page, /wireDynamicPageI18nRefresh\(\(\) => \{[\s\S]*?reloadList\(\{ silent: true \}\)/);
  assert.match(
    page,
    /wireDynamicPageI18nRefresh\(\(\) => \{[\s\S]*?reloadList\(\{ silent: true \}\)[\s\S]*?\}, \{ languageChangeOnly: true \}\)/,
  );
  assert.match(page, /runtimeResolvedOnly: true/);
  assert.match(page, /refreshCustomerBidResultsPageI18nFromCache/);
});
