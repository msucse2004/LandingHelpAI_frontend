/**
 * Lightweight app state store for local UI state only.
 * Do not store secrets here.
 */

const listeners = new Set();

const state = {
  customer: null,
  dashboardSummary: {
    paymentStatus: "",
    lastInvoiceId: "",
  },
  timeline: [],
  checklist: [],
  quote: null,
  invoice: null,
  messages: [],
  documents: [],
  postPayment: {
    checklistStub: null,
    documentRequestStub: null,
    inAppMessageStub: null,
    emailLogsStub: [],
  },
  admin: {
    customers: [],
    quotes: [],
    services: [],
    riskCards: [],
  },
};

function getState() {
  return state;
}

function patchState(partialState) {
  Object.assign(state, partialState);
  listeners.forEach((listener) => listener(state));
}

function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export { getState, patchState, subscribe };
