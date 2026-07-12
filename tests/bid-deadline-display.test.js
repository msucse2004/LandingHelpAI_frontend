import test from "node:test";
import assert from "node:assert/strict";

import {
  formatBidDeadlineRemaining,
  formatBidDeadlineRemainingFromSeconds,
  formatBidDeadlineForUi,
  formatCustomerCountdownBanner,
  formatPartnerCountdownBanner,
  isBidDeadlinePassed,
} from "../src/assets/js/core/bid-deadline-display.js";

/** @type {(key: string, fallback: string) => string} */
function translateCustomerEn(key, fallback) {
  const map = {
    "customer.bid_results.deadline.banner": "Bidding deadline: {time}",
    "customer.bid_results.deadline.ended": "Bidding ended",
    "customer.bid_results.deadline.closing_soon": "Closing soon · {mins} min left",
    "partner.bid.deadline.banner": "Submission deadline: {time}",
    "partner.bid.deadline.ended": "Bidding ended",
  };
  return map[key] ?? fallback;
}

/** @type {(key: string, fallback: string) => string} */
function translateCustomerKo(key, fallback) {
  const map = {
    "customer.bid_results.deadline.banner": "비딩 마감까지 {time}",
    "customer.bid_results.deadline.ended": "비딩 종료",
    "customer.bid_results.deadline.closing_soon": "곧 마감됩니다 · {mins}분 남음",
    "partner.bid.deadline.banner": "제출 마감까지 {time}",
    "partner.bid.deadline.ended": "비딩이 종료되었습니다",
  };
  return map[key] ?? fallback;
}

test("formatBidDeadlineRemaining en locale tiers", () => {
  const now = Date.parse("2026-05-16T12:00:00.000Z");
  const d1 = formatBidDeadlineRemaining("2026-05-17T16:00:00.000Z", now, translateCustomerEn);
  assert.equal(d1, "1 day 4 hr left");
  const h5 = formatBidDeadlineRemaining("2026-05-16T17:20:00.000Z", now, translateCustomerEn);
  assert.equal(h5, "5 hr 20 min left");
  const m42 = formatBidDeadlineRemaining("2026-05-16T12:42:00.000Z", now, translateCustomerEn);
  assert.equal(m42, "42 min left");
  const soon = formatBidDeadlineRemaining("2026-05-16T12:09:00.000Z", now, translateCustomerEn);
  assert.equal(soon, "Closing soon · 9 min left");
  assert.equal(
    formatBidDeadlineRemaining("2026-05-16T11:00:00.000Z", now, translateCustomerEn),
    "Bidding ended",
  );
});

test("formatBidDeadlineRemaining ko locale tiers", () => {
  const now = Date.parse("2026-05-16T12:00:00.000Z");
  const d1 = formatBidDeadlineRemaining("2026-05-17T16:00:00.000Z", now, translateCustomerKo, "ko");
  assert.equal(d1, "1일 4시간 남음");
  const h5 = formatBidDeadlineRemaining("2026-05-16T17:20:00.000Z", now, translateCustomerKo, "ko");
  assert.equal(h5, "5시간 20분 남음");
  const m42 = formatBidDeadlineRemaining("2026-05-16T12:42:00.000Z", now, translateCustomerKo, "ko");
  assert.equal(m42, "42분 남음");
  const soon = formatBidDeadlineRemaining("2026-05-16T12:09:00.000Z", now, translateCustomerKo, "ko");
  assert.equal(soon, "곧 마감됩니다 · 9분 남음");
  assert.equal(
    formatBidDeadlineRemaining("2026-05-16T11:00:00.000Z", now, translateCustomerKo, "ko"),
    "비딩 종료",
  );
});

test("formatBidDeadlineRemainingFromSeconds defaults to English without translate", () => {
  assert.equal(formatBidDeadlineRemainingFromSeconds(0), "Bidding ended");
  assert.equal(formatBidDeadlineRemainingFromSeconds(300), "Closing soon · 5 min left");
  assert.equal(formatBidDeadlineRemainingFromSeconds(42 * 60), "42 min left");
  assert.equal(formatBidDeadlineRemainingFromSeconds(42 * 60, null, "ko"), "42분 남음");
});

test("formatBidDeadlineForUi prefers server label", () => {
  const now = Date.parse("2026-05-16T12:00:00.000Z");
  assert.equal(
    formatBidDeadlineForUi(
      {
        remaining_label: "2 hr 0 min left",
        expires_at: "2026-05-16T14:00:00Z",
        server_now: "2026-05-16T12:00:00Z",
      },
      now,
      translateCustomerEn,
    ),
    "2 hr 0 min left",
  );
  assert.equal(formatBidDeadlineForUi({ is_expired: true }, now, translateCustomerEn), "Bidding ended");
  assert.equal(formatBidDeadlineForUi({ is_expired: true }, now, translateCustomerKo), "비딩 종료");
});

test("customer countdown banners use locale-aware i18n", () => {
  const now = Date.parse("2026-05-16T12:00:00.000Z");
  const snap = {
    expires_at: "2026-05-18T16:00:00.000Z",
    server_now: "2026-05-16T12:00:00.000Z",
  };
  assert.equal(
    formatCustomerCountdownBanner(snap, now, translateCustomerEn),
    "Bidding deadline: 2 days 4 hr",
  );
  assert.equal(
    formatCustomerCountdownBanner(snap, now, translateCustomerKo, "ko"),
    "비딩 마감까지 2일 4시간",
  );
  assert.equal(
    formatCustomerCountdownBanner({ ...snap, bid_request_status: "EXPIRED" }, now, translateCustomerEn),
    "Bidding ended",
  );
  assert.equal(
    formatCustomerCountdownBanner({ ...snap, bid_request_status: "EXPIRED" }, now, translateCustomerKo),
    "비딩 종료",
  );
});

test("partner countdown banner defaults to English fallbacks without translate", () => {
  const now = Date.parse("2026-05-16T12:00:00.000Z");
  const snap = {
    expires_at: "2026-05-18T15:00:00.000Z",
    server_now: "2026-05-16T12:00:00.000Z",
  };
  assert.equal(formatPartnerCountdownBanner(snap, now), "Submission deadline: 2d 3h");
});

test("countdown banners use server skew", () => {
  const now = Date.parse("2026-05-16T12:00:00.000Z");
  const snap = {
    expires_at: "2026-05-18T16:00:00.000Z",
    server_now: "2026-05-16T12:00:00.000Z",
  };
  assert.equal(formatPartnerCountdownBanner(snap, now, translateCustomerEn), "Submission deadline: 2d 4h");
  assert.equal(formatPartnerCountdownBanner(snap, now, translateCustomerKo), "제출 마감까지 2d 4h");
});

test("isBidDeadlinePassed", () => {
  const now = Date.parse("2026-05-16T12:00:00.000Z");
  assert.equal(isBidDeadlinePassed("2026-05-16T11:00:00.000Z", now), true);
  assert.equal(isBidDeadlinePassed("2026-05-16T13:00:00.000Z", now), false);
});
