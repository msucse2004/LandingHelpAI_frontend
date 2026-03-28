import { APP_CONFIG } from "./config.js";
import { getAccessToken } from "./auth.js";

/**
 * Expected data shapes (mocked):
 * - TimelineItem: { id, title, dueDate, status }
 * - ChecklistItem: { id, label, done, required }
 * - Quote: { id, serviceName, totalAmount, currency, status }
 * - Invoice: { id, quoteId, amountDue, currency, dueDate, status }
 * - MessageThread: { id, subject, participants, lastMessageAt }
 * - DocumentItem: { id, name, category, uploadedAt, verificationStatus }
 */

const mockDelay = (ms = 120) => new Promise((resolve) => setTimeout(resolve, ms));

/** 로그인 시 저장된 JWT를 보호 API 요청에 붙입니다. */
function withAuthHeaders(extra = {}) {
  const h = { ...extra };
  const token = getAccessToken();
  if (token != null && String(token).trim() !== "") {
    h.Authorization = `Bearer ${String(token).trim()}`;
  }
  return h;
}

async function apiFetch(path, options = {}) {
  // TODO: Replace with real backend request pipeline in next step.
  await mockDelay(80);
  return {
    mocked: true,
    path,
    method: options.method || "GET",
  };
}

async function tryBackendPost(path, body, extraHeaders = {}) {
  if (!APP_CONFIG.preferBackendAuth) {
    throw new Error("Backend auth disabled by config");
  }
  const response = await fetch(`${APP_CONFIG.apiBaseUrl}${path}`, {
    method: "POST",
    headers: withAuthHeaders({ "Content-Type": "application/json", ...extraHeaders }),
    body: JSON.stringify(body),
  });
  const contentType = response.headers.get("content-type") || "";
  const payload = contentType.includes("application/json") ? await response.json() : await response.text();
  if (!response.ok) {
    const detail = typeof payload === "object" ? payload.detail : payload;
    throw new Error(detail || `Request failed (${response.status})`);
  }
  return payload;
}

async function tryBackendGet(path, extraHeaders = {}) {
  const response = await fetch(`${APP_CONFIG.apiBaseUrl}${path}`, {
    headers: withAuthHeaders(extraHeaders),
  });
  const contentType = response.headers.get("content-type") || "";
  const payload = contentType.includes("application/json") ? await response.json() : await response.text();
  if (!response.ok) {
    const detail = typeof payload === "object" ? payload.detail : payload;
    throw new Error(detail || `Request failed (${response.status})`);
  }
  return payload;
}

async function tryBackendPatch(path, body, extraHeaders = {}) {
  const response = await fetch(`${APP_CONFIG.apiBaseUrl}${path}`, {
    method: "PATCH",
    headers: withAuthHeaders({ "Content-Type": "application/json", ...extraHeaders }),
    body: JSON.stringify(body),
  });
  const contentType = response.headers.get("content-type") || "";
  const payload = contentType.includes("application/json") ? await response.json() : await response.text();
  if (!response.ok) {
    const detail = typeof payload === "object" ? payload.detail : payload;
    throw new Error(detail || `Request failed (${response.status})`);
  }
  return payload;
}

/** FastAPI `detail` may be string or list of `{ msg, loc, type }`. */
function formatFastApiDetail(detail) {
  if (detail == null || detail === "") return "";
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) {
    return detail
      .map((item) => (item && typeof item === "object" && item.msg ? item.msg : String(item)))
      .join("; ");
  }
  return String(detail);
}

async function tryBackendDelete(path, extraHeaders = {}) {
  const response = await fetch(`${APP_CONFIG.apiBaseUrl}${path}`, {
    method: "DELETE",
    headers: withAuthHeaders(extraHeaders),
  });
  if (response.status === 204 || response.status === 205) {
    return null;
  }
  const contentType = response.headers.get("content-type") || "";
  const payload = contentType.includes("application/json") ? await response.json() : await response.text();
  if (!response.ok) {
    const raw = typeof payload === "object" ? payload.detail : payload;
    const detail = formatFastApiDetail(raw) || (typeof raw === "string" ? raw : "");
    throw new Error(detail || `Request failed (${response.status})`);
  }
  return payload;
}

const authApi = {
  /**
   * @returns {Promise<{ username: string, available: boolean }>}
   */
  async invitationPreview(token) {
    const t = String(token || "").trim();
    const params = new URLSearchParams({ token: t });
    return await tryBackendGet(`/api/auth/invitation-preview?${params.toString()}`);
  },
  async checkUsernameAvailable(username) {
    const u = String(username || "").trim();
    if (u.length < 2) {
      return { username: u, available: true, skipped: true };
    }
    try {
      const params = new URLSearchParams({ username: u });
      return await tryBackendGet(`/api/auth/username-available?${params.toString()}`);
    } catch (err) {
      const msg = err && typeof err.message === "string" ? err.message : "";
      const likelyCorsOrOffline =
        /Failed to fetch|NetworkError|Load failed|fetch/i.test(msg) || !msg;
      return { username: u, available: null, error: true, likelyCorsOrOffline };
    }
  },
  /**
   * Signup request shape:
   * { username, email, full_name, password, password_confirm, birth_date, gender, role_name?, invitation_token? }
   */
  async signup(payload) {
    return await tryBackendPost("/api/auth/signup", payload);
  },
  async login(payload) {
    try {
      return await tryBackendPost("/api/auth/login", payload);
    } catch {
      await mockDelay();
      return {
        access_token: `mock-access-${Date.now()}`,
        token_type: "bearer",
        user_id: "mock-user-1",
        role: "customer",
        email: payload.login_id?.includes("@") ? payload.login_id : "mock@example.com",
        username: payload.login_id?.includes("@") ? "" : payload.login_id,
        mocked: true,
      };
    }
  },
  async verifyEmail(payload) {
    try {
      return await tryBackendPost("/api/auth/verify-email", payload);
    } catch {
      await mockDelay();
      return {
        verified: true,
        user_id: "mock-user-1",
        email: "mock@example.com",
        membership_status: "active",
        mocked: true,
      };
    }
  },
};

const timelineApi = {
  async listByCustomer(customerId) {
    try {
      const timeline = await tryBackendGet(`/api/dashboard/timeline?customer_profile_id=${encodeURIComponent(customerId || "profile::demo@customer.com")}`);
      return timeline.map((item) => ({
        id: item.id,
        title: item.title,
        dueDate: item.due_date,
        status: item.status,
      }));
    } catch {
      await mockDelay();
      return [
        { id: "tl-1", title: "Kickoff complete", dueDate: "2026-04-01", status: "done" },
        { id: "tl-2", title: "Document review", dueDate: "2026-04-03", status: "in_progress" },
      ];
    }
  },
};

const checklistApi = {
  async listByCustomer(customerId) {
    await mockDelay();
    return [
      { id: "cl-1", label: "Submit ID document", done: true, required: true },
      { id: "cl-2", label: "Approve quote", done: false, required: true },
    ];
  },
};

const dashboardApi = {
  async getAggregate(customerProfileId = "profile::demo@customer.com") {
    try {
      return await tryBackendGet(`/api/dashboard?customer_profile_id=${encodeURIComponent(customerProfileId)}`);
    } catch {
      await mockDelay();
      return {
        customer_profile_id: customerProfileId,
        current_service_status: "Document review stage",
        next_action: "Upload signed consent form and review proposed invoice.",
        payment_status: "Pending payment",
        schedule_status: "Awaiting final confirmation",
        ai_assistant_quick_link: "/src/pages/ai-assistant.html",
        checklist_summary: { total: 8, completed: 5, required_remaining: 2, next_required_item: "Upload signed consent form" },
        status_cards: [
          { key: "service", label: "Service Status", value: "In Progress", state: "info" },
          { key: "payment", label: "Payment", value: "Pending", state: "warning" },
          { key: "documents", label: "Documents", value: "2 Under Review", state: "warning" },
          { key: "schedule", label: "Schedule", value: "Draft Proposed", state: "neutral" },
        ],
        recent_messages: [
          { id: "msg-1", title: "Operator update", preview: "Please upload signed consent form.", created_at: "2026-03-27T10:00:00Z" },
        ],
        document_status: [
          { id: "doc-1", name: "ID verification.pdf", status: "APPROVED", updated_at: "2026-03-26" },
        ],
        recent_activity: ["Quote transitioned to PROPOSED", "Invoice draft created"],
      };
    }
  },
  async getChecklistSummary(customerProfileId = "profile::demo@customer.com") {
    try {
      return await tryBackendGet(`/api/dashboard/checklist-summary?customer_profile_id=${encodeURIComponent(customerProfileId)}`);
    } catch {
      await mockDelay();
      return {
        total: 8,
        completed: 5,
        required_remaining: 2,
        next_required_item: "Upload signed consent form",
      };
    }
  },
};

const quoteApi = {
  async list(statusFilter = "") {
    const query = statusFilter ? `?status=${encodeURIComponent(statusFilter)}` : "";
    try {
      return await tryBackendGet(`/api/quotes${query}`);
    } catch {
      await mockDelay();
      return [
        {
          id: "q-demo-1",
          customer_profile_id: "profile::demo@customer.com",
          status: "DRAFT",
          service_name: "Starter Landing Package",
          estimated_cost: 3200,
          updated_at: new Date().toISOString(),
        },
      ];
    }
  },
  async getDetail(quoteId) {
    try {
      return await tryBackendGet(`/api/quotes/${encodeURIComponent(quoteId || "q-1001")}`);
    } catch {
      await mockDelay();
      return {
        id: quoteId || "q-1001",
        service_name: "Starter Landing Package",
        included_items: ["Initial workflow setup", "Customer onboarding"],
        excluded_items: ["Custom on-site training"],
        estimated_cost: 3200,
        ai_support_scope: "Checklist guidance and document QA support.",
        possible_extra_costs: ["Urgent turnaround surcharge"],
        next_step_guidance: "Review and decide to approve or reject.",
        currency: "USD",
        status: "PROPOSED",
        request_details: {},
      };
    }
  },
  /**
   * Quote request payload shape:
   * {
   *   service_id,
   *   profile: { full_name, email, company_name, phone },
   *   schedule: { target_start_date, target_end_date, entry_date },
   *   context: { country, preferred_language, customer_notes }
   * }
   */
  async submitRequest(payload) {
    try {
      return await tryBackendPost("/api/quotes/requests", payload);
    } catch {
      await mockDelay();
      return {
        quote_id: `q-${Date.now()}`,
        status: "DRAFT",
        service_id: payload.service_id,
        summary: `Quote request created for service ${payload.service_id} in DRAFT state.`,
        request_details: payload,
        mocked: true,
      };
    }
  },
  /**
   * Admin update shape:
   * { service_name, included_items[], excluded_items[], estimated_cost, ai_support_scope, possible_extra_costs[], next_step_guidance }
   */
  async update(quoteId, payload) {
    try {
      const response = await fetch(`${APP_CONFIG.apiBaseUrl}/api/quotes/${encodeURIComponent(quoteId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || "Failed to update quote");
      return data;
    } catch {
      await mockDelay();
      return { id: quoteId, ...payload, status: "DRAFT", mocked: true };
    }
  },
  async transition(quoteId, toStatus, note = "") {
    try {
      return await tryBackendPost(`/api/quotes/${encodeURIComponent(quoteId)}/transition`, {
        to_status: toStatus,
        note,
      });
    } catch {
      await mockDelay();
      return {
        quote_id: quoteId,
        from_status: "DRAFT",
        to_status: toStatus,
        message: `Mock transition to ${toStatus}`,
        mocked: true,
      };
    }
  },
};

const invoiceApi = {
  async list() {
    try {
      return await tryBackendGet("/api/invoices");
    } catch {
      await mockDelay();
      return [
        {
          id: "inv-demo-1",
          quote_id: "q-demo-1",
          customer_profile_id: "profile::demo@customer.com",
          amount_due: 3200,
          service_name: "Starter Landing Package",
          currency: "USD",
          status: "SENT",
          due_date: "2026-04-20",
          in_person_only: false,
          draft_notes: "",
        },
      ];
    }
  },
  async createFromApprovedQuote(payload) {
    try {
      return await tryBackendPost("/api/invoices/from-approved-quote", payload);
    } catch {
      await mockDelay();
      return {
        id: `inv-${Date.now()}`,
        quote_id: payload.quote_id,
        customer_profile_id: "profile::mock@example.com",
        amount_due: 3200,
        service_name: "Starter Landing Package",
        currency: "USD",
        status: "DRAFT",
        due_date: payload.due_date || "",
        in_person_only: Boolean(payload.in_person_only),
        draft_notes: payload.draft_notes || "",
        mocked: true,
      };
    }
  },
  async updateDraft(invoiceId, payload) {
    try {
      const response = await fetch(`${APP_CONFIG.apiBaseUrl}/api/invoices/${encodeURIComponent(invoiceId)}/draft`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || "Failed to update invoice draft");
      return data;
    } catch {
      await mockDelay();
      return { id: invoiceId, ...payload, mocked: true };
    }
  },
  async send(invoiceId) {
    try {
      return await tryBackendPost(`/api/invoices/${encodeURIComponent(invoiceId)}/send`, {});
    } catch {
      await mockDelay();
      return { id: invoiceId, status: "SENT", mocked: true };
    }
  },
  async getDetail(invoiceId) {
    try {
      return await tryBackendGet(`/api/invoices/${encodeURIComponent(invoiceId || "inv-demo-1")}`);
    } catch {
      await mockDelay();
      return {
        id: invoiceId || "inv-demo-1",
        quote_id: "q-demo-1",
        customer_profile_id: "profile::demo@customer.com",
        amount_due: 3200,
        service_name: "Starter Landing Package",
        currency: "USD",
        due_date: "2026-04-20",
        status: "SENT",
        in_person_only: false,
        draft_notes: "",
        mocked: true,
      };
    }
  },
};

const paymentApi = {
  async startWebPayment(payload) {
    try {
      return await tryBackendPost("/api/payments/start", payload);
    } catch {
      await mockDelay();
      return {
        payment_id: `pay-${Date.now()}`,
        status: "PENDING",
        checkout_url: payload.success_url,
        mocked: true,
      };
    }
  },
  async markSuccess(paymentId) {
    try {
      return await tryBackendPost(`/api/payments/${encodeURIComponent(paymentId)}/success`, {});
    } catch {
      await mockDelay();
      return {
        payment_id: paymentId,
        invoice_id: "inv-demo-1",
        payment_status: "SUCCEEDED",
        invoice_status: "PAID",
        message: "Mock payment success.",
        checklist_stub: { created: true },
        document_request_stub: { created: true },
        in_app_message_stub: { created: true },
        email_logs_stub: [],
        mocked: true,
      };
    }
  },
  async markFailure(paymentId) {
    try {
      return await tryBackendPost(`/api/payments/${encodeURIComponent(paymentId)}/failure`, {});
    } catch {
      await mockDelay();
      return {
        payment_id: paymentId,
        invoice_id: "inv-demo-1",
        payment_status: "FAILED",
        invoice_status: "FAILED",
        message: "Mock payment failure.",
        checklist_stub: { created: true },
        document_request_stub: { created: true },
        in_app_message_stub: { created: true },
        email_logs_stub: [],
        mocked: true,
      };
    }
  },
  async markCancel(paymentId) {
    try {
      return await tryBackendPost(`/api/payments/${encodeURIComponent(paymentId)}/cancel`, {});
    } catch {
      await mockDelay();
      return {
        payment_id: paymentId,
        invoice_id: "inv-demo-1",
        payment_status: "CANCELED",
        invoice_status: "CANCELED",
        message: "Mock payment canceled.",
        checklist_stub: { created: true },
        document_request_stub: { created: true },
        in_app_message_stub: { created: true },
        email_logs_stub: [],
        mocked: true,
      };
    }
  },
};

const aiApi = {
  async ask(payload) {
    try {
      return await tryBackendPost("/api/ai/assist", payload);
    } catch {
      await mockDelay();
      const prompt = String(payload.prompt || "").toLowerCase();
      const outOfScope = ["visa", "tax", "medical", "flight", "hotel"].some((word) => prompt.includes(word));
      if (outOfScope) {
        return {
          answer: "해당 질문은 서비스 범위를 벗어납니다. 견적/결제/문서/일정 관련 질문으로 부탁드립니다.",
          internal_guide_based: true,
          web_verified: false,
          review_needed: true,
          escalation_suggestion: "request_in_person_help",
          allowed_scope: "out_of_scope",
          mocked: true,
        };
      }
      return {
        answer: "요청하신 내용은 현재 고객 서비스 진행 범위 내에서 안내 가능합니다. 상태 변경은 관리자 확인이 필요합니다.",
        internal_guide_based: true,
        web_verified: false,
        review_needed: false,
        escalation_suggestion: "none",
        allowed_scope: "customer_service_scope",
        mocked: true,
      };
    }
  },
  async listInteractions(customerProfileId = "profile::demo@customer.com") {
    try {
      return await tryBackendGet(`/api/ai/interactions?customer_profile_id=${encodeURIComponent(customerProfileId)}`);
    } catch {
      await mockDelay();
      return [];
    }
  },
  async getContextWindow(entryDate = "2026-04-15") {
    try {
      return await tryBackendGet(`/api/ai/context-window?entry_date=${encodeURIComponent(entryDate)}`);
    } catch {
      await mockDelay();
      return {
        available: true,
        reason: "Mock window available",
        allowed_from: "2026-03-18",
        allowed_until: "2026-06-15",
        mocked: true,
      };
    }
  },
};

const messagesApi = {
  async list({ customerProfileId = "profile::demo@customer.com", category = "", unreadOnly = false } = {}) {
    const params = new URLSearchParams({ customer_profile_id: customerProfileId });
    if (category) params.set("category", category);
    if (unreadOnly) params.set("unread_only", "true");
    try {
      return await tryBackendGet(`/api/messages?${params.toString()}`);
    } catch {
      await mockDelay();
      const ts = new Date().toISOString();
      return [
        {
          id: "msg-1",
          customer_profile_id: customerProfileId,
          sender_user_id: null,
          message_type: "SYSTEM",
          title: "Quote Proposed",
          body: "Your quote is now proposed and ready for review.",
          unread: true,
          read_at: "",
          event_code: "quote.proposed",
          thread_id: "mock-thread-1",
          direction: "SYSTEM",
          created_at: ts,
        },
      ];
    }
  },
  async listThreads({ customerProfileId = "profile::demo@customer.com", category = "", unreadOnly = false } = {}) {
    const params = new URLSearchParams({ customer_profile_id: customerProfileId });
    if (category) params.set("category", category);
    if (unreadOnly) params.set("unread_only", "true");
    try {
      return await tryBackendGet(`/api/messages/threads?${params.toString()}`);
    } catch {
      await mockDelay();
      const messages = await this.list({ customerProfileId, category, unreadOnly });
      return messages.map((message) => ({
        thread_id: message.thread_id || message.id,
        title: `[${customerProfileId}] 정착 서비스`,
        preview: (message.body || "").slice(0, 120),
        message_type: message.message_type,
        unread: message.unread,
        last_message_at: message.created_at,
      }));
    }
  },
  async threadMessages(threadId, { customerProfileId = "profile::demo@customer.com" } = {}) {
    const params = new URLSearchParams({ customer_profile_id: customerProfileId });
    try {
      return await tryBackendGet(
        `/api/messages/threads/${encodeURIComponent(threadId)}/messages?${params.toString()}`
      );
    } catch {
      await mockDelay();
      const messages = await this.list({ customerProfileId });
      const key = String(threadId);
      const threadMsgs = messages.filter((m) => String(m.thread_id || m.id) === key);
      if (!threadMsgs.length) return [];
      return [...threadMsgs].sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
    }
  },
  async sendThreadMessage(body, { threadId, customerProfileId = "profile::demo@customer.com", title = "" } = {}) {
    const t = String(threadId || "").trim();
    if (!t) throw new Error("threadId required");
    try {
      return await tryBackendPost(
        `/api/messages/threads/${encodeURIComponent(t)}/messages?customer_profile_id=${encodeURIComponent(customerProfileId)}`,
        { body, title }
      );
    } catch {
      await mockDelay();
      return {
        id: `mock-send-${Date.now()}`,
        customer_profile_id: customerProfileId,
        sender_user_id: null,
        message_type: "CHAT",
        title: title || "메시지",
        body,
        unread: false,
        read_at: "",
        event_code: "",
        thread_id: t,
        direction: "INBOUND",
        created_at: new Date().toISOString(),
        mocked: true,
      };
    }
  },
  async markRead(messageId, read = true) {
    try {
      const response = await fetch(`${APP_CONFIG.apiBaseUrl}/api/messages/${encodeURIComponent(messageId)}/read`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ read }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || "Failed to update read state");
      return data;
    } catch {
      await mockDelay();
      return { id: messageId, unread: !read, mocked: true };
    }
  },
  async triggerEvent(eventCode, customerProfileId = "profile::demo@customer.com") {
    try {
      return await tryBackendPost(`/api/messages/events/${encodeURIComponent(eventCode)}?customer_profile_id=${encodeURIComponent(customerProfileId)}`, {});
    } catch {
      await mockDelay();
      return { event_code: eventCode, mocked: true };
    }
  },
  async listThreadsLegacy() {
    const threads = await this.listThreads();
    return threads.map((row) => ({
      id: row.thread_id,
      subject: row.title,
      participants: ["customer", "operator"],
      lastMessageAt: row.last_message_at,
      unread: row.unread,
      messageType: row.message_type,
    }));
  },
};

const emailLogsApi = {
  async list(customerProfileId = "profile::demo@customer.com") {
    try {
      return await tryBackendGet(`/api/email-logs?customer_profile_id=${encodeURIComponent(customerProfileId)}`);
    } catch {
      await mockDelay();
      return [
        {
          id: "eml-1",
          customer_profile_id: customerProfileId,
          template_code: "quote_proposed_notice",
          subject: "Your quote is ready to review",
          to_email: "demo@customer.com",
          status: "queued",
          linked_message_id: "msg-1",
          event_code: "quote.proposed",
          created_at: new Date().toISOString(),
        },
      ];
    }
  },
};

const documentsApi = {
  async list(customerProfileId = "") {
    const query = customerProfileId ? `?customer_profile_id=${encodeURIComponent(customerProfileId)}` : "";
    try {
      return await tryBackendGet(`/api/documents${query}`);
    } catch {
      await mockDelay();
      return [
        {
          id: "doc-1",
          customer_profile_id: customerProfileId || "profile::demo@customer.com",
          name: "customer_submission_passport.pdf",
          file_url: "/mock-storage/customer_submission_passport.pdf",
          document_type: "documents_submitted",
          version_label: "v2",
          version_number: 2,
          review_status: "under_review",
          status: "UNDER_REVIEW",
        },
      ];
    }
  },
  async upload(payload) {
    try {
      return await tryBackendPost("/api/documents/upload", payload);
    } catch {
      await mockDelay();
      return {
        id: `doc-${Date.now()}`,
        customer_profile_id: payload.customer_profile_id,
        name: payload.name,
        file_url: `/mock-storage/${payload.name}`,
        document_type: payload.document_type,
        version_label: payload.version_label || "v1",
        version_number: payload.version_number || 1,
        review_status: "uploaded",
        status: "UPLOADED",
        mocked: true,
      };
    }
  },
  async updateStatus(documentId, payload) {
    try {
      const response = await fetch(`${APP_CONFIG.apiBaseUrl}/api/documents/${encodeURIComponent(documentId)}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || "Failed to update document status");
      return data;
    } catch {
      await mockDelay();
      return { id: documentId, ...payload, mocked: true };
    }
  },
  async createRequest(payload) {
    try {
      return await tryBackendPost("/api/documents/requests", payload);
    } catch {
      await mockDelay();
      return {
        id: `doc-req-${Date.now()}`,
        customer_profile_id: payload.customer_profile_id,
        name: payload.name,
        document_type: payload.document_type,
        status: "REQUESTED",
        review_status: "requested",
        mocked: true,
      };
    }
  },
  async listDocuments() {
    const documents = await this.list("profile::demo@customer.com");
    return documents.map((document) => ({
      id: document.id,
      name: document.name,
      category: document.document_type,
      uploadedAt: document.created_at || new Date().toISOString(),
      verificationStatus: document.status,
      versionLabel: document.version_label,
      reviewStatus: document.review_status,
    }));
  },
};

const scheduleApi = {
  async list(customerProfileId = "profile::demo@customer.com") {
    try {
      return await tryBackendGet(`/api/schedules?customer_profile_id=${encodeURIComponent(customerProfileId)}`);
    } catch {
      await mockDelay();
      return [
        {
          id: "sch-demo-1",
          customer_profile_id: customerProfileId,
          proposed_slots: ["2026-04-24T09:00:00Z", "2026-04-25T09:00:00Z"],
          notes: "Initial draft for onboarding schedule.",
          recommendation_reasons: ["Avoids weekend processing delay"],
          revision_notes: [],
          customer_feedback: "",
          final_confirmed_version: {},
          draft: { proposed_slots: ["2026-04-24T09:00:00Z", "2026-04-25T09:00:00Z"] },
          edits: [],
          customer_reaction: {},
          final_result: {},
          status: "PROPOSED",
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
      ];
    }
  },
  async createDraft(payload) {
    try {
      return await tryBackendPost("/api/schedules/drafts", payload);
    } catch {
      await mockDelay();
      return { id: `sch-${Date.now()}`, ...payload, status: "DRAFT", edits: [], mocked: true };
    }
  },
  async revise(scheduleId, payload) {
    try {
      return await tryBackendPost(`/api/schedules/${encodeURIComponent(scheduleId)}/revise`, payload);
    } catch {
      await mockDelay();
      return { id: scheduleId, ...payload, status: "REVISED", mocked: true };
    }
  },
  async propose(scheduleId, note = "") {
    try {
      return await tryBackendPost(`/api/schedules/${encodeURIComponent(scheduleId)}/propose`, { note });
    } catch {
      await mockDelay();
      return { id: scheduleId, status: "PROPOSED", mocked: true };
    }
  },
  async confirm(scheduleId, note = "") {
    try {
      return await tryBackendPost(`/api/schedules/${encodeURIComponent(scheduleId)}/confirm`, { note });
    } catch {
      await mockDelay();
      return { id: scheduleId, status: "CONFIRMED", mocked: true };
    }
  },
  async requestAdjustment(scheduleId, feedback) {
    try {
      return await tryBackendPost(`/api/schedules/${encodeURIComponent(scheduleId)}/feedback`, { feedback });
    } catch {
      await mockDelay();
      return { id: scheduleId, customer_feedback: feedback, status: "REVISED", mocked: true };
    }
  },
};

const adminApi = {
  /** @returns {Promise<Array<{ id, email, username, full_name, email_verified, membership_status, role }>>} */
  async listAuthAccounts() {
    return await tryBackendGet("/api/admin/accounts");
  },
  /** @returns {Promise<object>} single account detail */
  async getAuthAccount(userId) {
    return await tryBackendGet(`/api/admin/accounts/${encodeURIComponent(userId)}`);
  },
  /** @returns {Promise<object>} updated row */
  async patchAuthAccountRegistration(userId, patch) {
    if (!getAccessToken()?.trim()) {
      throw new Error("수정하려면 로그인 후 발급된 액세스 토큰이 필요합니다.");
    }
    return await tryBackendPatch(`/api/admin/accounts/${encodeURIComponent(userId)}`, patch);
  },
  async deleteAuthAccount(userId) {
    if (!getAccessToken()?.trim()) {
      throw new Error("삭제하려면 로그인 후 발급된 액세스 토큰이 필요합니다.");
    }
    return await tryBackendDelete(`/api/admin/accounts/${encodeURIComponent(userId)}`);
  },
  /** 서버가 JWT에서 초대 권한·역할 티어를 판별합니다. */
  async listInvitableRoles() {
    try {
      return await tryBackendGet("/api/admin/invitations/roles");
    } catch {
      await mockDelay();
      return [];
    }
  },
  async sendMemberInvitation(payload) {
    const { email, role_name, personal_message = "" } = payload || {};
    return await tryBackendPost("/api/admin/invitations/send", {
      email,
      role_name,
      personal_message,
    });
  },
  async listCustomers() {
    await mockDelay();
    return [{ id: "c-1", name: "Acme Corp", riskLevel: "medium", owner: "Operator A" }];
  },
  async listQuotes() {
    return quoteApi.list();
  },
  async listServices() {
    await mockDelay();
    return [{ id: "svc-1", name: "Starter Landing Package", active: true }];
  },
  async listInvoices() {
    return invoiceApi.list();
  },
  async listRiskCards() {
    try {
      const response = await tryBackendGet("/api/analytics/risk-summary");
      return response.customers || [];
    } catch {
      await mockDelay();
      return [
        {
          customer_profile_id: "profile::demo@customer.com",
          risk_level: "high",
          blocked: true,
          stuck_too_long: true,
          missing_documents: true,
          requested_human_help_after_ai: true,
          high_schedule_revision_count: false,
          signals: [],
        },
      ];
    }
  },
  async listDocuments() {
    return documentsApi.list("profile::demo@customer.com");
  },
  async listSchedules(customerProfileId = "profile::demo@customer.com") {
    return scheduleApi.list(customerProfileId);
  },
  async getRiskSummary() {
    try {
      return await tryBackendGet("/api/analytics/risk-summary");
    } catch {
      await mockDelay();
      return { total_customers: 1, blocked_customers: 1, high_risk_customers: 1, customers: await this.listRiskCards() };
    }
  },
  async getCustomerOperationsSummary(customerProfileId = "profile::demo@customer.com") {
    try {
      return await tryBackendGet(`/api/analytics/customer-operations-summary?customer_profile_id=${encodeURIComponent(customerProfileId)}`);
    } catch {
      await mockDelay();
      return {
        customer_profile_id: customerProfileId,
        overview: { owner: "Operator A", current_phase: "PROPOSED", risk_level: "high" },
        quote_status: { count: 1, latest_status: "PROPOSED", latest_quote_id: "q-demo-1", estimated_cost: 3200 },
        invoice_payment_status: { count: 1, latest_invoice_id: "inv-demo-1", invoice_status: "FAILED", amount_due: 3200 },
        document_status: { total: 3, requested_or_rejected: 1, under_review: 1, approved: 1 },
        recent_messages: [{ id: "msg-1", title: "Escalation requested", type: "AI", preview: "Customer requested in-person support." }],
        schedule_status: { latest_status: "REVISED", revision_count: 2, proposed_slot_count: 1 },
        ai_escalation_history: [{ id: "ai-1", prompt: "Need human help", escalation_suggestion: "ask_admin", review_needed: true, created_at: new Date().toISOString() }],
        audit_history: [{ id: "aud-1", event_type: "quote.status_changed", target_type: "quote", target_id: "q-demo-1", created_at: new Date().toISOString() }],
      };
    }
  },
};

const serviceCatalogApi = {
  /**
   * Service category shape:
   * { id, name, slug, description, is_public }
   */
  async listCategories() {
    try {
      return await tryBackendGet("/api/services/categories?public_only=true");
    } catch {
      await mockDelay();
      return [
        { id: "cat-1", name: "Landing Setup", slug: "landing-setup", description: "Core setup services.", is_public: true },
        { id: "cat-2", name: "Operations Support", slug: "operations-support", description: "Ongoing support services.", is_public: true },
      ];
    }
  },
  /**
   * Service shape:
   * { id, category_id, name, ai_supported, in_person_only, is_public, summary, help_description }
   */
  async listServices(categorySlug = "") {
    const query = categorySlug ? `?public_only=true&category=${encodeURIComponent(categorySlug)}` : "?public_only=true";
    try {
      return await tryBackendGet(`/api/services${query}`);
    } catch {
      await mockDelay();
      return [
        {
          id: "svc-1",
          category_id: "cat-1",
          name: "Starter Landing Package",
          ai_supported: true,
          in_person_only: false,
          is_public: true,
          summary: "Fast start package for onboarding.",
          help_description: "Helps with checklist, quote, invoice, and first document submission.",
        },
        {
          id: "svc-2",
          category_id: "cat-2",
          name: "On-site Compliance Review",
          ai_supported: false,
          in_person_only: true,
          is_public: true,
          summary: "In-person compliance review support.",
          help_description: "Helps teams pass review requirements through guided in-person checks.",
        },
      ];
    }
  },
};

export {
  APP_CONFIG,
  adminApi,
  apiFetch,
  checklistApi,
  documentsApi,
  scheduleApi,
  invoiceApi,
  messagesApi,
  quoteApi,
  timelineApi,
  dashboardApi,
  authApi,
  serviceCatalogApi,
  paymentApi,
  emailLogsApi,
  aiApi,
};
