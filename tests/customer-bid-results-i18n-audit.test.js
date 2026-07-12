import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const FRONTEND_ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

const TARGETS = [
  "src/assets/js/pages/customer-bid-results.js",
  "src/assets/js/pages/customer-bid-results-logic.js",
];

/** Strip block/line comments so audit focuses on runtime string literals. */
function stripComments(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
}

function findKoreanStringLiterals(source) {
  const stripped = stripComments(source);
  const hits = [];
  const patterns = [
    /"(?:[^"\\]|\\.)*[\uac00-\ud7af](?:[^"\\]|\\.)*"/g,
    /'(?:[^'\\]|\\.)*[\uac00-\ud7af](?:[^'\\]|\\.)*'/g,
    /`(?:[^`\\]|\\.)*[\uac00-\ud7af](?:[^`\\]|\\.)*`/g,
  ];
  for (const re of patterns) {
    for (const m of stripped.matchAll(re)) {
      hits.push(m[0]);
    }
  }
  return hits;
}

test("customer bid results JS has no Korean hardcoded string literals", () => {
  for (const rel of TARGETS) {
    const src = readFileSync(path.join(FRONTEND_ROOT, rel), "utf8");
    const hits = findKoreanStringLiterals(src);
    assert.deepEqual(
      hits,
      [],
      `${rel} still contains Korean string literals: ${hits.slice(0, 5).join(", ")}`,
    );
  }
});

test("CUSTOMER_BID_SORT_OPTIONS use i18nKey and English fallback", () => {
  const src = readFileSync(
    path.join(FRONTEND_ROOT, "src/assets/js/pages/customer-bid-results-logic.js"),
    "utf8",
  );
  assert.match(src, /i18nKey: "customer\.bid_results\.sort\.recommended"/);
  assert.match(src, /fallback: "Recommended"/);
  assert.doesNotMatch(src, /label: "추천순"/);
});

test("customer-bid-results.html static labels use data-i18n", () => {
  const html = readFileSync(path.join(FRONTEND_ROOT, "src/pages/customer-bid-results.html"), "utf8");
  assert.match(html, /data-i18n="customer\.bid_results\.title"/);
  assert.match(html, /data-i18n-default="Compare bid offers"/);
  assert.doesNotMatch(html, /[\uac00-\ud7af]/);
});
