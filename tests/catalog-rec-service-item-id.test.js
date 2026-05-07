import test from "node:test";
import assert from "node:assert/strict";

const {
  abortIfInvalidServiceItemId,
  assertServiceItemUuid,
  filterBrowseCatalogServiceItems,
  intakeStartServiceItemIdFromCardJson,
  isCatalogRecServiceItemUuidString,
  isLegacyCatalogPublicIdString,
  isLegacyServiceId,
  isUuid,
  pickCatalogUuidFromWorkflowCardJson,
  sanitizeServiceFlowSubmitPayloadForNetwork,
} = await import("../src/assets/js/lib/catalog-rec-service-item-id.js");

const good = "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11";

test("isCatalogRecServiceItemUuidString accepts standard UUID", () => {
  assert.equal(isCatalogRecServiceItemUuidString(good), true);
});

test("isCatalogRecServiceItemUuidString rejects empty", () => {
  assert.equal(isCatalogRecServiceItemUuidString(""), false);
});

test("isCatalogRecServiceItemUuidString rejects si-mod legacy id", () => {
  assert.equal(isCatalogRecServiceItemUuidString("si-mod-abc"), false);
});

test("isLegacyCatalogPublicIdString matches si-addon", () => {
  assert.equal(isLegacyCatalogPublicIdString("si-addon-xyz"), true);
  assert.equal(isCatalogRecServiceItemUuidString("si-addon-xyz"), false);
});

test("isLegacyServiceId matches si-mod and si-addon", () => {
  assert.equal(isLegacyServiceId("si-mod-abc"), true);
  assert.equal(isLegacyServiceId("si-addon-x"), true);
  assert.equal(isLegacyServiceId(good), false);
});

test("isUuid accepts hex UUID shape and rejects legacy prefix", () => {
  assert.equal(isUuid(good), true);
  assert.equal(isUuid("si-mod-x"), false);
  assert.equal(isUuid(""), false);
});

test("pickCatalogUuidFromWorkflowCardJson reads rec_service_item_id", () => {
  assert.equal(
    pickCatalogUuidFromWorkflowCardJson({
      rec_service_item_id: good,
    }),
    good
  );
});

test("pickCatalogUuidFromWorkflowCardJson prefers service_item_id", () => {
  assert.equal(
    pickCatalogUuidFromWorkflowCardJson({
      service_item_id: good,
      catalog_service_item_id: "b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a22",
    }),
    good
  );
});

test("pickCatalogUuidFromWorkflowCardJson falls back to catalog_service_item_id", () => {
  assert.equal(
    pickCatalogUuidFromWorkflowCardJson({
      catalog_service_item_id: good,
    }),
    good
  );
});

test("pickCatalogUuidFromWorkflowCardJson ignores si-mod", () => {
  assert.equal(
    pickCatalogUuidFromWorkflowCardJson({
      service_item_id: "si-mod-x",
      catalog_service_item_id: good,
    }),
    good
  );
});

test("pickCatalogUuidFromWorkflowCardJson returns empty when only si-mod", () => {
  assert.equal(
    pickCatalogUuidFromWorkflowCardJson({
      service_item_id: "si-mod-x",
    }),
    ""
  );
});

test("intakeStartServiceItemIdFromCardJson uses only service_item_id key", () => {
  assert.equal(intakeStartServiceItemIdFromCardJson({ service_item_id: good }), good);
  assert.equal(intakeStartServiceItemIdFromCardJson({ rec_service_item_id: good }), "");
  assert.equal(intakeStartServiceItemIdFromCardJson({ catalog_service_item_id: good }), "");
  assert.equal(intakeStartServiceItemIdFromCardJson({ service_item_id: "si-mod-x" }), "");
});

test("assertServiceItemUuid throws on legacy or invalid", () => {
  assert.throws(() => assertServiceItemUuid("si-mod-x"));
  assert.throws(() => assertServiceItemUuid(""));
  assert.doesNotThrow(() => assertServiceItemUuid(good));
});

test("abortIfInvalidServiceItemId matches assertServiceItemUuid policy", () => {
  assert.throws(() => abortIfInvalidServiceItemId("si-mod-x"));
  assert.doesNotThrow(() => abortIfInvalidServiceItemId(good));
});

test("filterBrowseCatalogServiceItems drops non-uuid id rows", () => {
  const rows = [{ id: good, name: "A" }, { id: "si-mod-x", name: "B" }, { name: "no id" }];
  const out = filterBrowseCatalogServiceItems(rows);
  assert.equal(out.length, 1);
  assert.equal(out[0].id, good);
});

test("sanitizeServiceFlowSubmitPayloadForNetwork strips hints and bad service rows", () => {
  const out = sanitizeServiceFlowSubmitPayloadForNetwork({
    customer_profile_id: "p",
    service_id: "legacy-row",
    service_name_hint: "nope",
    selected_services: [
      { id: good, title: "T1", service_name_hint: "x" },
      { id: "si-mod-bad", title: "Bad" },
    ],
    detailed_answers: [
      { service_id: "si-mod-x", field_id: "f", answer_json: {} },
      { service_id: good, field_id: "g", answer_json: { value: "1" } },
    ],
  });
  assert.equal(out.service_id, undefined);
  assert.equal(out.service_name_hint, undefined);
  assert.equal(out.selected_services.length, 1);
  assert.equal(out.selected_services[0].id, good);
  assert.equal(out.selected_services[0].service_name_hint, undefined);
  assert.equal(out.detailed_answers[0].service_id, undefined);
  assert.equal(out.detailed_answers[1].service_id, good);
});
