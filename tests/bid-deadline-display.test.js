import test from "node:test";
import assert from "node:assert/strict";

import {
  formatBidDeadlineRemaining,
  formatBidDeadlineForUi,
  isBidDeadlinePassed,
} from "../src/assets/js/core/bid-deadline-display.js";

test("formatBidDeadlineRemaining tiers", () => {
  const now = Date.parse("2026-05-16T12:00:00.000Z");
  const d1 = formatBidDeadlineRemaining("2026-05-17T16:00:00.000Z", now);
  assert.equal(d1, "1일 4시간 남음");
  const h5 = formatBidDeadlineRemaining("2026-05-16T17:20:00.000Z", now);
  assert.equal(h5, "5시간 20분 남음");
  const m42 = formatBidDeadlineRemaining("2026-05-16T12:42:00.000Z", now);
  assert.equal(m42, "42분 남음");
  const soon = formatBidDeadlineRemaining("2026-05-16T12:09:00.000Z", now);
  assert.match(soon, /^곧 마감됩니다 · \d+분 남음$/);
  assert.equal(formatBidDeadlineRemaining("2026-05-16T11:00:00.000Z", now), "비딩 종료");
});

test("formatBidDeadlineForUi prefers server label", () => {
  assert.equal(
    formatBidDeadlineForUi({ remaining_label: "2시간 0분 남음", expires_at: "2026-05-16T14:00:00Z" }),
    "2시간 0분 남음",
  );
  assert.equal(formatBidDeadlineForUi({ is_expired: true }), "비딩 종료");
});

test("isBidDeadlinePassed", () => {
  const now = Date.parse("2026-05-16T12:00:00.000Z");
  assert.equal(isBidDeadlinePassed("2026-05-16T11:00:00.000Z", now), true);
  assert.equal(isBidDeadlinePassed("2026-05-16T13:00:00.000Z", now), false);
});
