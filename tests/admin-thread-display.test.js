import test from "node:test";
import assert from "node:assert/strict";

import { adminThreadDisplayTitle } from "../src/assets/js/pages/messages-display-logic.js";

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
