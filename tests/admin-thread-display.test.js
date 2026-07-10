import test from "node:test";
import assert from "node:assert/strict";

import { adminThreadDisplayTitle, mergeServiceThreadDisplayFields, serviceThreadDisplayName } from "../src/assets/js/pages/messages-display-logic.js";

const t = (key, fallback) => {
  if (key === "messages.thread.customer_center") return "Customer center";
  return fallback || key;
};

test("adminThreadDisplayTitle prefers API display_title", () => {
  assert.equal(
    adminThreadDisplayTitle(
      {
        display_title: "Customer center · user@example.com",
        title: "고객센터 · user@example.com",
      },
      t
    ),
    "Customer center · user@example.com"
  );
});

test("adminThreadDisplayTitle localizes from customer_profile_id when display_title missing", () => {
  assert.equal(
    adminThreadDisplayTitle(
      {
        title: "고객센터 · msucse.bryan@gmail.com",
        customer_profile_id: "profile::msucse.bryan@gmail.com",
      },
      t
    ),
    "Customer center · msucse.bryan@gmail.com"
  );
});

test("serviceThreadDisplayName prefers display_header_title", () => {
  assert.equal(
    serviceThreadDisplayName({
      display_header_title: "Car Research/Purchase",
      header_title: "자동차 조사/구입",
      service_name_snapshot: "자동차 조사/구입",
    }),
    "Car Research/Purchase"
  );
});

test("serviceThreadDisplayName falls back to header_title when display_* absent and no translate", () => {
  assert.equal(
    serviceThreadDisplayName({
      header_title: "자동차 조사/구입",
      service_name_snapshot: "자동차 조사/구입",
    }),
    "자동차 조사/구입"
  );
});

test("serviceThreadDisplayName never shows snapshot to English viewer on translation failure", () => {
  const tr = (key, fallback) => `${key}:${fallback}`;
  const title = serviceThreadDisplayName(
    {
      display_header_title: null,
      display_service_name: null,
      header_title: "자동차 조사/구입",
      service_name_snapshot: "자동차 조사/구입",
      service_title_status: "translation_required_failed",
      service_title_source_locale: "ko",
      service_title_display_locale: "en",
    },
    "",
    tr
  );
  assert.match(title, /messages\.translation\.preparing_title/);
  assert.doesNotMatch(title, /자동차/);
});

test("serviceThreadDisplayName uses display_header_title when present", () => {
  assert.equal(
    serviceThreadDisplayName({
      display_header_title: "Car Research/Purchase",
      header_title: "자동차 조사/구입",
      service_name_snapshot: "자동차 조사/구입",
    }),
    "Car Research/Purchase"
  );
});

test("mergeServiceThreadDisplayFields overlays detail display_* onto list row", () => {
  const merged = mergeServiceThreadDisplayFields(
    {
      thread_id: "abc",
      header_title: "자동차 조사/구입",
      service_name_snapshot: "자동차 조사/구입",
    },
    {
      display_header_title: "Car Research/Purchase",
      display_service_name: "Car Research/Purchase",
    }
  );
  assert.equal(merged.display_header_title, "Car Research/Purchase");
  assert.equal(merged.header_title, "자동차 조사/구입");
});
