import test from "node:test";
import assert from "node:assert/strict";

import {
  catalogCardTitle,
  catalogDisplayText,
  catalogFieldNeedsTranslationPlaceholder,
} from "../src/assets/js/pages/catalog-display-logic.js";

const tr = (key, fb) => fb;

test("catalogFieldNeedsTranslationPlaceholder when display status is translation_required_failed", () => {
  const item = {
    name: "공항 픽업",
    display_name: null,
    display_name_status: "translation_required_failed",
  };
  assert.equal(catalogFieldNeedsTranslationPlaceholder(item, "name"), true);
});

test("catalogDisplayText shows placeholder instead of Korean source for English viewer", () => {
  const item = {
    name: "공항 픽업",
    display_name: null,
    display_name_status: "translation_required_failed",
  };
  const text = catalogDisplayText(item, "name", tr, { kind: "title" });
  assert.equal(text, "Preparing title translation...");
  assert.doesNotMatch(text, /공항/);
});

test("catalogDisplayText uses Korean source for same-locale viewer", () => {
  const item = {
    name: "공항 픽업",
    display_name: "공항 픽업",
    display_name_status: "not_required",
  };
  assert.equal(catalogDisplayText(item, "name", tr), "공항 픽업");
});

test("catalogCardTitle prefers customer_title display", () => {
  const item = {
    name: "Internal",
    customer_title: "Customer facing",
    display_customer_title: "Customer facing",
    display_customer_title_status: "not_required",
  };
  assert.equal(catalogCardTitle(item, tr), "Customer facing");
});

test("Step 8: category subtitle uses placeholder instead of wrong-locale source", () => {
  const item = {
    customer_subtitle: "한국어 부제",
    display_customer_subtitle: null,
    display_customer_subtitle_status: "translation_required_failed",
  };
  const text = catalogDisplayText(item, "customer_subtitle", tr, { kind: "body" });
  assert.match(text, /Preparing message translation/);
  assert.doesNotMatch(text, /한국어/);
});
