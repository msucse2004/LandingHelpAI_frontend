/**
 * Smoke: mountCarPurchaseBidUi must not throw on minimal CAR_PURCHASE detail payload.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
import path from "node:path";

/** @type {typeof globalThis} */
const g = globalThis;
g.window = g.window || {
  location: { origin: "http://localhost", pathname: "/" },
  localStorage: { getItem: () => null, setItem: () => {} },
  setInterval: () => 0,
  clearInterval: () => {},
  alert: () => {},
};
g.window.LHAI_API_BASE_URL = "";
class HTMLElement {}
class HTMLTextAreaElement extends HTMLElement {}
class HTMLInputElement extends HTMLElement {}
class HTMLSelectElement extends HTMLElement {}
class HTMLButtonElement extends HTMLElement {}
class HTMLFormElement extends HTMLElement {}
class HTMLOutputElement extends HTMLElement {}
g.HTMLElement = HTMLElement;
g.HTMLTextAreaElement = HTMLTextAreaElement;
g.HTMLInputElement = HTMLInputElement;
g.HTMLSelectElement = HTMLSelectElement;
g.HTMLButtonElement = HTMLButtonElement;
g.HTMLFormElement = HTMLFormElement;
g.HTMLOutputElement = HTMLOutputElement;

const carUiPath = pathToFileURL(
  path.join(process.cwd(), "src/assets/js/pages/partner-bid-request-car-ui.js"),
).href;

/** Minimal DOM for mount smoke (no browser HTML* classes). */
function createMockRoot() {
  const nodes = [];

  function makeEl(tag) {
    const el = {
      tagName: String(tag).toUpperCase(),
      hidden: false,
      disabled: false,
      value: "",
      textContent: "",
      innerHTML: "",
      className: "",
      classList: {
        add: () => {},
        remove: () => {},
        toggle: () => {},
      },
      attributes: {},
      children: [],
      setAttribute(k, v) {
        this.attributes[k] = v;
      },
      getAttribute(k) {
        return this.attributes[k] ?? null;
      },
      appendChild(c) {
        this.children.push(c);
        c.parentElement = this;
      },
      querySelector(sel) {
        return findOne(this, sel);
      },
      querySelectorAll(sel) {
        return findAll(this, sel);
      },
      addEventListener() {},
    };
    nodes.push(el);
    return el;
  }

  function match(el, sel) {
    if (sel.startsWith("#")) return el.id === sel.slice(1);
    if (sel.startsWith(".")) {
      const cls = sel.slice(1);
      return String(el.className || "").split(/\s+/).includes(cls);
    }
    return el.tagName === String(sel).toUpperCase();
  }

  function walk(el, fn) {
    fn(el);
    for (const c of el.children || []) walk(c, fn);
  }

  function findOne(root, sel) {
    let found = null;
    walk(root, (el) => {
      if (!found && match(el, sel)) found = el;
    });
    return found;
  }

  function findAll(root, sel) {
    const out = [];
    walk(root, (el) => {
      if (match(el, sel)) out.push(el);
    });
    return out;
  }

  const root = makeEl("div");
  root.id = "partnerBidCarRoot";
  return root;
}

function sampleDetail() {
  const expires = new Date(Date.now() + 86400000).toISOString();
  return {
    bidding_mode: "CAR_PURCHASE",
    bid_request_id: "84ac754c-a205-4e61-ab27-2cb463abda0f",
    bid_request_status: "OPEN",
    thread_id: "00000000-0000-4000-8000-000000000001",
    expires_at: expires,
    service: { name: "자동차 조사/구입", category: "AUTO_DEALER" },
    customer_summary: { display_name: "고객 A", location: "Raleigh, NC" },
    intake: {
      submitted_at: expires,
      answers: [
        { label: "예산", value: "$30,000" },
        { label: "메모", value: "${broken" },
      ],
    },
    bid: {
      status: "DRAFT",
      included_items: {
        bid_type: "PRODUCT_OFFER",
        product_category: "vehicle",
        offers: [
          {
            offer_id: "offer_1",
            title: "2021 Toyota Camry",
            estimated_total: "28000",
            attributes: { year: 2021, make: "Toyota", model: "Camry" },
          },
        ],
      },
      message_to_customer: "",
    },
    car_purchase_request: {
      location: "Raleigh, NC",
      cash_purchase: true,
      budget_max: 30000,
      currency: "USD",
      desired_timeline: "2_weeks",
      vehicle_requests: [
        {
          request_index: 1,
          label: "요청 1",
          make: "Toyota",
          model: "Sienna",
          vehicle_condition: "USED",
          year_min: 2021,
          mileage_max: 50000,
          budget_max: 30000,
        },
      ],
    },
    car_purchase_config: {
      allow_alternative_vehicle_offers: true,
    },
    bidding_config: {},
    bid_request: {
      expires_at: expires,
      bid_request_status: "OPEN",
      is_expired: false,
      remaining_label: "2시간 남음",
    },
  };
}

test("mountCarPurchaseBidUi does not throw on CAR detail sample", async () => {
  const url = new URL(carUiPath);
  url.searchParams.set("t", String(Date.now()));
  const { mountCarPurchaseBidUi } = await import(url.href);

  const root = createMockRoot();
  const data = sampleDetail();
  const bidRequestBlock = data.bid_request;

  assert.doesNotThrow(() => {
    mountCarPurchaseBidUi(root, {
      data,
      bidRequestBlock,
      expiresAtQuery: data.expires_at,
      requestStatusQuery: "OPEN",
      requiresOfferPhotos: false,
      onDetailUpdate: () => {},
      submitFn: async () => data,
      uploadOfferPhotoFn: async () => ({ url: "https://example.com/x.jpg" }),
      openMessagesFn: () => {},
    });
  });

  assert.ok(String(root.innerHTML).length > 100, "expected rendered markup");
});
