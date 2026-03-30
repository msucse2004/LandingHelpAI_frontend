import { APP_CONFIG } from "./config.js";
import { clearAccessToken, clearSession, getAccessToken } from "./auth.js";

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

function shouldUseMockFallback(err) {
  const msg = err && typeof err.message === "string" ? err.message : "";
  return /Failed to fetch|NetworkError|Load failed|fetch/i.test(msg) || !msg;
}

function handleUnauthorized() {
  clearAccessToken();
  clearSession();
  const page = window.location.pathname.split("/").pop() || "";
  if (page !== "login.html" && page !== "signup.html") {
    window.location.href = "login.html";
  }
}

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
    if (response.status === 401) {
      handleUnauthorized();
      throw new Error("인증이 만료되었거나 유효하지 않습니다. 다시 로그인해 주세요.");
    }
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
    if (response.status === 401) {
      handleUnauthorized();
      throw new Error("인증이 만료되었거나 유효하지 않습니다. 다시 로그인해 주세요.");
    }
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
    if (response.status === 401) {
      handleUnauthorized();
      throw new Error("인증이 만료되었거나 유효하지 않습니다. 다시 로그인해 주세요.");
    }
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
    if (response.status === 401) {
      handleUnauthorized();
      throw new Error("인증이 만료되었거나 유효하지 않습니다. 다시 로그인해 주세요.");
    }
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
    } catch (err) {
      if (!shouldUseMockFallback(err)) throw err;
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
  /** 티어 1~3: 가입 고객센터(온보딩) 스레드 목록. JWT 필수. */
  async listOperatorOnboardingThreads() {
    return await tryBackendGet("/api/messages/operator/onboarding-threads");
  },
  async operatorThreadMessages(threadId, { customerProfileId = "" } = {}) {
    const cp = String(customerProfileId || "").trim();
    if (!cp) throw new Error("customerProfileId required");
    const params = new URLSearchParams({ customer_profile_id: cp });
    return await tryBackendGet(
      `/api/messages/operator/threads/${encodeURIComponent(String(threadId || "").trim())}/messages?${params.toString()}`
    );
  },
  async sendOperatorThreadMessage(body, { threadId, customerProfileId = "", title = "" } = {}) {
    const t = String(threadId || "").trim();
    const cp = String(customerProfileId || "").trim();
    if (!t) throw new Error("threadId required");
    if (!cp) throw new Error("customerProfileId required");
    return await tryBackendPost(
      `/api/messages/operator/threads/${encodeURIComponent(t)}/messages?customer_profile_id=${encodeURIComponent(cp)}`,
      { body, title }
    );
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

// Admin service catalog APIs for restricted catalog management.
// These endpoints are implemented in LandingHelpAI_backend under:
// - /api/admin/service-catalog/...
//
// If backend calls fail (offline / backend not running), this API falls back to an in-memory mock
// so the admin UI can still be used in development.
const serviceCatalogAdminApi = {
  // Internal mock state (used only when backend is unavailable).
  _mock: {
    categories: [
      {
        id: "cat-1",
        code: "landing-setup",
        name: "Landing Setup",
        description: "Core setup services.",
        active: true,
        sort_order: 0,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      {
        id: "cat-2",
        code: "ops-support",
        name: "Operations Support",
        description: "Ongoing support services.",
        active: true,
        sort_order: 1,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    ],
    packages: [
      {
        id: "pkg-1",
        category_id: "cat-1",
        code: "pkg-landing-1",
        slug: "starter-landing",
        name: "Starter Landing Package",
        short_description: "Fast start package for onboarding.",
        long_description: "Includes onboarding + guided steps.",
        outcome_description: "Customer completes onboarding steps and gets ready for operations.",
        ai_supported: true,
        in_person_only: false,
        self_service_enabled: true,
        base_price: 3200,
        currency: "USD",
        visible: true,
        active: true,
        sort_order: 0,
        created_by: "admin",
        updated_by: "admin",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      {
        id: "pkg-2",
        category_id: "cat-2",
        code: "pkg-ops-1",
        slug: "managed-ops",
        name: "Managed Operations Package",
        short_description: "Ongoing operational support with human review.",
        long_description: "Includes monitoring, document QA, and operator escalation steps.",
        outcome_description: "Reduced risk and predictable operations timeline.",
        ai_supported: false,
        in_person_only: true,
        self_service_enabled: false,
        base_price: 5200,
        currency: "USD",
        visible: true,
        active: true,
        sort_order: 1,
        created_by: "admin",
        updated_by: "admin",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    ],
    modules_by_package_id: {
      "pkg-1": [
        {
          id: "mod-1",
          package_id: "pkg-1",
          code: "m-checklist",
          name: "Checklist Guidance",
          description: "Guided checklist and progress updates.",
          required: true,
          ai_capable: true,
          in_person_required: false,
          sort_order: 0,
          active: true,
        },
        {
          id: "mod-2",
          package_id: "pkg-1",
          code: "m-doc-review",
          name: "Document Review",
          description: "Review submitted documents with operator QA.",
          required: true,
          ai_capable: true,
          in_person_required: false,
          sort_order: 1,
          active: true,
        },
      ],
      "pkg-2": [
        {
          id: "mod-3",
          package_id: "pkg-2",
          code: "m-ops-monitor",
          name: "Operations Monitoring",
          description: "Ongoing monitoring and operator checks.",
          required: true,
          ai_capable: false,
          in_person_required: true,
          sort_order: 0,
          active: true,
        },
      ],
    },
    addons_by_package_id: {
      "pkg-1": [
        {
          id: "ad-1",
          package_id: "pkg-1",
          code: "a-expedite",
          name: "Expedited Review",
          description: "Faster operator review turnaround.",
          extra_price: 450,
          currency: "USD",
          active: true,
          visible: true,
          sort_order: 0,
        },
      ],
      "pkg-2": [
        {
          id: "ad-2",
          package_id: "pkg-2",
          code: "a-on-site",
          name: "On-site Consultation",
          description: "Optional on-site consulting session.",
          extra_price: 900,
          currency: "USD",
          active: true,
          visible: true,
          sort_order: 0,
        },
      ],
    },
  },

  async listCategories(includeInactive = true) {
    try {
      return await tryBackendGet(`/api/admin/service-catalog/categories?include_inactive=${includeInactive ? "true" : "false"}`);
    } catch (err) {
      if (!shouldUseMockFallback(err)) throw err;
      await mockDelay();
      const { categories } = this._mock;
      return includeInactive ? categories : categories.filter((c) => c.active);
    }
  },

  async createCategory(payload) {
    try {
      return await tryBackendPost("/api/admin/service-catalog/categories", payload);
    } catch {
      await mockDelay();
      const id = `cat-${Date.now()}`;
      const now = new Date().toISOString();
      const created = { id, created_at: now, updated_at: now, sort_order: 0, active: true, description: "", ...payload };
      this._mock.categories.push(created);
      return created;
    }
  },

  async updateCategory(categoryId, payload) {
    try {
      return await tryBackendPatch(`/api/admin/service-catalog/categories/${encodeURIComponent(categoryId)}`, payload);
    } catch {
      await mockDelay();
      const now = new Date().toISOString();
      const cat = this._mock.categories.find((c) => c.id === categoryId);
      if (!cat) throw new Error("Mock category not found");
      Object.assign(cat, payload);
      cat.updated_at = now;
      return cat;
    }
  },

  async archiveCategory(categoryId) {
    try {
      return await tryBackendPatch(`/api/admin/service-catalog/categories/${encodeURIComponent(categoryId)}/archive`, {});
    } catch {
      await mockDelay();
      const now = new Date().toISOString();
      const cat = this._mock.categories.find((c) => c.id === categoryId);
      if (!cat) throw new Error("Mock category not found");
      cat.active = false;
      cat.updated_at = now;
      return cat;
    }
  },

  async deleteCategoryIfSafe(categoryId) {
    try {
      // Safe delete endpoint: rejects when packages exist.
      return await tryBackendDelete(`/api/admin/service-catalog/categories/${encodeURIComponent(categoryId)}`);
    } catch {
      await mockDelay();
      const cat = this._mock.categories.find((c) => c.id === categoryId);
      if (!cat) throw new Error("Mock category not found");
      const hasPackages = (this._mock.packages || []).some((p) => String(p.category_id) === String(categoryId));
      if (hasPackages) throw new Error("Cannot delete category: packages exist");
      const idx = this._mock.categories.findIndex((c) => c.id === categoryId);
      if (idx >= 0) this._mock.categories.splice(idx, 1);
      return null;
    }
  },

  async listPackages(includeInactive = true, categoryId = null) {
    const qs = new URLSearchParams();
    qs.set("include_inactive", includeInactive ? "true" : "false");
    if (categoryId) qs.set("category_id", categoryId);
    try {
      const path = `/api/admin/service-catalog/packages?${qs.toString()}`;
      return await tryBackendGet(path);
    } catch (err) {
      if (!shouldUseMockFallback(err)) throw err;
      await mockDelay();
      const { packages } = this._mock;
      let out = packages;
      if (categoryId) out = out.filter((p) => p.category_id === categoryId);
      if (!includeInactive) out = out.filter((p) => p.active);
      return out;
    }
  },

  async getPackage(packageId) {
    try {
      return await tryBackendGet(`/api/admin/service-catalog/packages/${encodeURIComponent(packageId)}`);
    } catch {
      await mockDelay();
      const pkg = this._mock.packages.find((p) => p.id === packageId);
      if (!pkg) throw new Error("Mock package not found");
      return pkg;
    }
  },

  async createPackage(payload) {
    try {
      return await tryBackendPost("/api/admin/service-catalog/packages", payload);
    } catch {
      await mockDelay();
      const id = `pkg-${Date.now()}`;
      const now = new Date().toISOString();
      const created = { id, created_at: now, updated_at: now, sort_order: 0, visible: true, active: true, base_price: 0, currency: "USD", short_description: "", long_description: "", outcome_description: "", ai_supported: false, in_person_only: false, self_service_enabled: true, ...payload };
      this._mock.packages.push(created);
      this._mock.modules_by_package_id[id] = [];
      this._mock.addons_by_package_id[id] = [];
      return created;
    }
  },

  async updatePackage(packageId, payload) {
    try {
      return await tryBackendPatch(`/api/admin/service-catalog/packages/${encodeURIComponent(packageId)}`, payload);
    } catch {
      await mockDelay();
      const now = new Date().toISOString();
      const pkg = this._mock.packages.find((p) => p.id === packageId);
      if (!pkg) throw new Error("Mock package not found");
      Object.assign(pkg, payload);
      pkg.updated_at = now;
      return pkg;
    }
  },

  async setPackageVisibility(packageId, visible) {
    try {
      return await tryBackendPatch(`/api/admin/service-catalog/packages/${encodeURIComponent(packageId)}/visibility`, { visible });
    } catch {
      await mockDelay();
      const now = new Date().toISOString();
      const pkg = this._mock.packages.find((p) => p.id === packageId);
      if (!pkg) throw new Error("Mock package not found");
      pkg.visible = visible;
      pkg.updated_at = now;
      return pkg;
    }
  },

  async setPackageActivation(packageId, active) {
    try {
      return await tryBackendPatch(`/api/admin/service-catalog/packages/${encodeURIComponent(packageId)}/activation`, { active });
    } catch {
      await mockDelay();
      const now = new Date().toISOString();
      const pkg = this._mock.packages.find((p) => p.id === packageId);
      if (!pkg) throw new Error("Mock package not found");
      pkg.active = active;
      pkg.updated_at = now;
      return pkg;
    }
  },

  async archivePackage(packageId) {
    try {
      return await tryBackendPatch(`/api/admin/service-catalog/packages/${encodeURIComponent(packageId)}/archive`, {});
    } catch {
      await mockDelay();
      const now = new Date().toISOString();
      const pkg = this._mock.packages.find((p) => p.id === packageId);
      if (!pkg) throw new Error("Mock package not found");
      pkg.active = false;
      pkg.visible = false;
      pkg.updated_at = now;
      return pkg;
    }
  },

  async deletePackageIfSafe(packageId) {
    try {
      return await tryBackendDelete(`/api/admin/service-catalog/packages/${encodeURIComponent(packageId)}`);
    } catch {
      await mockDelay();
      const pkg = this._mock.packages.find((p) => p.id === packageId);
      if (!pkg) throw new Error("Mock package not found");
      const hasLinks = this._mock.service_links_by_package_id && Array.isArray(this._mock.service_links_by_package_id[packageId]) && this._mock.service_links_by_package_id[packageId].length > 0;
      const hasModules = (this._mock.modules_by_package_id?.[packageId] || []).length > 0;
      const hasAddons = (this._mock.addons_by_package_id?.[packageId] || []).length > 0;
      if (hasLinks || hasModules || hasAddons) {
        throw new Error("Safe delete blocked: package has linked data. Use Archive/Deactivate.");
      }
      const idx = this._mock.packages.findIndex((p) => p.id === packageId);
      if (idx >= 0) this._mock.packages.splice(idx, 1);
      return null;
    }
  },

  async listModulesByPackage(packageId, includeInactive = true) {
    try {
      const qs = `?include_inactive=${includeInactive ? "true" : "false"}`;
      return await tryBackendGet(`/api/admin/service-catalog/packages/${encodeURIComponent(packageId)}/modules${qs}`);
    } catch {
      await mockDelay();
      const mods = this._mock.modules_by_package_id[packageId] || [];
      if (includeInactive) return mods.slice().sort((a, b) => a.sort_order - b.sort_order);
      return mods.filter((m) => m.active).slice().sort((a, b) => a.sort_order - b.sort_order);
    }
  },

  async createModule(payload) {
    try {
      return await tryBackendPost("/api/admin/service-catalog/modules", payload);
    } catch {
      await mockDelay();
      const id = `mod-${Date.now()}`;
      const now = new Date().toISOString();
      const module = { id, active: true, sort_order: 0, description: "", currency: "", ...payload };
      this._mock.modules_by_package_id[module.package_id] = this._mock.modules_by_package_id[module.package_id] || [];
      this._mock.modules_by_package_id[module.package_id].push(module);
      return { ...module, created_at: now, updated_at: now };
    }
  },

  async updateModule(moduleId, payload) {
    try {
      return await tryBackendPatch(`/api/admin/service-catalog/modules/${encodeURIComponent(moduleId)}`, payload);
    } catch {
      await mockDelay();
      for (const pid of Object.keys(this._mock.modules_by_package_id)) {
        const list = this._mock.modules_by_package_id[pid];
        const mod = list.find((m) => m.id === moduleId);
        if (mod) {
          Object.assign(mod, payload);
          return mod;
        }
      }
      throw new Error("Mock module not found");
    }
  },

  async setModuleActivation(moduleId, active) {
    try {
      return await tryBackendPatch(`/api/admin/service-catalog/modules/${encodeURIComponent(moduleId)}/activation`, { active });
    } catch {
      await mockDelay();
      for (const pid of Object.keys(this._mock.modules_by_package_id)) {
        const list = this._mock.modules_by_package_id[pid];
        const mod = list.find((m) => m.id === moduleId);
        if (mod) {
          mod.active = active;
          return mod;
        }
      }
      throw new Error("Mock module not found");
    }
  },

  async reorderModules(packageId, moduleIds) {
    try {
      return await tryBackendPost(`/api/admin/service-catalog/packages/${encodeURIComponent(packageId)}/modules/reorder`, { module_ids: moduleIds });
    } catch {
      await mockDelay();
      const list = this._mock.modules_by_package_id[packageId] || [];
      const byId = Object.fromEntries(list.map((m) => [m.id, m]));
      const newOrder = moduleIds.map((id) => byId[id]).filter(Boolean);
      newOrder.forEach((m, idx) => {
        m.sort_order = idx;
      });
      this._mock.modules_by_package_id[packageId] = newOrder;
      return newOrder;
    }
  },

  async listAddonsByPackage(packageId, includeInactive = true) {
    try {
      const qs = `?include_inactive=${includeInactive ? "true" : "false"}`;
      return await tryBackendGet(`/api/admin/service-catalog/packages/${encodeURIComponent(packageId)}/addons${qs}`);
    } catch (err) {
      if (!shouldUseMockFallback(err)) throw err;
      await mockDelay();
      const addons = this._mock.addons_by_package_id[packageId] || [];
      if (includeInactive) return addons.slice().sort((a, b) => a.sort_order - b.sort_order);
      return addons.filter((a) => a.active).slice().sort((a, b) => a.sort_order - b.sort_order);
    }
  },

  async createAddon(payload) {
    try {
      return await tryBackendPost("/api/admin/service-catalog/addons", payload);
    } catch {
      await mockDelay();
      const id = `ad-${Date.now()}`;
      const now = new Date().toISOString();
      const addon = { id, sort_order: 0, description: "", extra_price: 0, currency: "USD", active: true, visible: true, ...payload };
      this._mock.addons_by_package_id[addon.package_id] = this._mock.addons_by_package_id[addon.package_id] || [];
      this._mock.addons_by_package_id[addon.package_id].push(addon);
      return { ...addon, created_at: now, updated_at: now };
    }
  },

  async updateAddon(addonId, payload) {
    try {
      return await tryBackendPatch(`/api/admin/service-catalog/addons/${encodeURIComponent(addonId)}`, payload);
    } catch {
      await mockDelay();
      for (const pid of Object.keys(this._mock.addons_by_package_id)) {
        const list = this._mock.addons_by_package_id[pid];
        const addon = list.find((a) => a.id === addonId);
        if (addon) {
          Object.assign(addon, payload);
          return addon;
        }
      }
      throw new Error("Mock addon not found");
    }
  },

  async setAddonActivation(addonId, active) {
    try {
      return await tryBackendPatch(`/api/admin/service-catalog/addons/${encodeURIComponent(addonId)}/activation`, { active });
    } catch {
      await mockDelay();
      for (const pid of Object.keys(this._mock.addons_by_package_id)) {
        const list = this._mock.addons_by_package_id[pid];
        const addon = list.find((a) => a.id === addonId);
        if (addon) {
          addon.active = active;
          return addon;
        }
      }
      throw new Error("Mock addon not found");
    }
  },

  async setAddonVisibility(addonId, visible) {
    try {
      return await tryBackendPatch(`/api/admin/service-catalog/addons/${encodeURIComponent(addonId)}/visibility`, { visible });
    } catch {
      await mockDelay();
      for (const pid of Object.keys(this._mock.addons_by_package_id)) {
        const list = this._mock.addons_by_package_id[pid];
        const addon = list.find((a) => a.id === addonId);
        if (addon) {
          addon.visible = visible;
          return addon;
        }
      }
      throw new Error("Mock addon not found");
    }
  },

  async reorderAddons(packageId, addonIds) {
    try {
      return await tryBackendPost(`/api/admin/service-catalog/packages/${encodeURIComponent(packageId)}/addons/reorder`, { addon_ids: addonIds });
    } catch {
      await mockDelay();
      const list = this._mock.addons_by_package_id[packageId] || [];
      const byId = Object.fromEntries(list.map((a) => [a.id, a]));
      const newOrder = addonIds.map((id) => byId[id]).filter(Boolean);
      newOrder.forEach((a, idx) => {
        a.sort_order = idx;
      });
      this._mock.addons_by_package_id[packageId] = newOrder;
      return newOrder;
    }
  },

  // ============================================================
  // Service-first (ServiceItem + PackageServiceLink) APIs
  // ============================================================

  async listServiceItems(type = null, active = null, visible = null, includeInactive = true) {
    try {
      const params = new URLSearchParams();
      if (type) params.set("type", type);
      if (active !== null) params.set("active", active ? "true" : "false");
      if (visible !== null) params.set("visible", visible ? "true" : "false");
      params.set("include_inactive", includeInactive ? "true" : "false");
      const q = params.toString();
      return await tryBackendGet(`/api/admin/service-catalog/service-items?${q}`);
    } catch (err) {
      if (!shouldUseMockFallback(err)) throw err;
      await mockDelay();
      // Fallback: build a derived service-item list from legacy module/addon mocks.
      const items = [];
      const modsByPkg = this._mock.modules_by_package_id || {};
      const addonsByPkg = this._mock.addons_by_package_id || {};
      for (const pkgId of Object.keys(modsByPkg)) {
        for (const m of modsByPkg[pkgId] || []) {
          if (type && m.type !== type && type !== "module") {
            // legacy modules have no explicit "type"; treat them as module
          }
          const itemType = "module";
          if (type && itemType !== type) continue;
          if (active !== null && Boolean(m.active) !== Boolean(active)) continue;
          const itemVisible = true;
          if (visible !== null && Boolean(itemVisible) !== Boolean(visible)) continue;
          items.push({
            id: m.id,
            type: itemType,
            code: m.code,
            slug: m.slug || null,
            name: m.name,
            description: m.description,
            ai_capable: Boolean(m.ai_capable),
            in_person_required: Boolean(m.in_person_required),
            extra_price: 0,
            currency: "USD",
            active: Boolean(m.active),
            visible: itemVisible,
            archived_at: null,
            created_at: m.created_at || new Date().toISOString(),
            updated_at: m.updated_at || new Date().toISOString(),
          });
        }
      }
      for (const pkgId of Object.keys(addonsByPkg)) {
        for (const a of addonsByPkg[pkgId] || []) {
          const itemType = "addon";
          if (type && itemType !== type) continue;
          if (active !== null && Boolean(a.active) !== Boolean(active)) continue;
          if (visible !== null && Boolean(a.visible) !== Boolean(visible)) continue;
          items.push({
            id: a.id,
            type: itemType,
            code: a.code,
            slug: a.slug || null,
            name: a.name,
            description: a.description,
            ai_capable: false,
            in_person_required: false,
            extra_price: Number(a.extra_price ?? 0),
            currency: a.currency || "USD",
            active: Boolean(a.active),
            visible: Boolean(a.visible),
            archived_at: null,
            created_at: a.created_at || new Date().toISOString(),
            updated_at: a.updated_at || new Date().toISOString(),
          });
        }
      }
      return items;
    }
  },

  async createServiceItem(payload) {
    try {
      return await tryBackendPost("/api/admin/service-catalog/service-items", payload);
    } catch {
      await mockDelay();
      const id = `si-${Date.now()}`;
      const now = new Date().toISOString();
      // Fallback: create a legacy module/addon in the first package.
      const firstPkg = (this._mock.packages && this._mock.packages[0]) || null;
      if (!firstPkg) throw new Error("No packages available in mock");
      const package_id = firstPkg.id;
      if (payload.type === "module") {
        const m = {
          id,
          package_id,
          code: `mod-${Date.now()}`,
          name: payload.name,
          description: payload.description || "",
          required: false,
          ai_capable: Boolean(payload.ai_capable),
          in_person_required: Boolean(payload.in_person_required),
          sort_order: 0,
          active: Boolean(payload.active ?? true),
          visible: true,
          created_at: now,
          updated_at: now,
        };
        this._mock.modules_by_package_id[package_id] = this._mock.modules_by_package_id[package_id] || [];
        this._mock.modules_by_package_id[package_id].push(m);
        return {
          id,
          type: "module",
          code: m.code,
          slug: null,
          name: m.name,
          description: m.description,
          ai_capable: m.ai_capable,
          in_person_required: m.in_person_required,
          extra_price: 0,
          currency: "USD",
          active: m.active,
          visible: true,
          archived_at: null,
          created_at: now,
          updated_at: now,
        };
      }
      const a = {
        id,
        package_id,
        code: `addon-${Date.now()}`,
        name: payload.name,
        description: payload.description || "",
        extra_price: Number(payload.extra_price ?? 0),
        currency: payload.currency || "USD",
        active: Boolean(payload.active ?? true),
        visible: Boolean(payload.visible ?? true),
        sort_order: 0,
        created_at: now,
        updated_at: now,
      };
      this._mock.addons_by_package_id[package_id] = this._mock.addons_by_package_id[package_id] || [];
      this._mock.addons_by_package_id[package_id].push(a);
      return {
        id,
        type: "addon",
        code: a.code,
        slug: null,
        name: a.name,
        description: a.description,
        ai_capable: false,
        in_person_required: false,
        extra_price: a.extra_price,
        currency: a.currency,
        active: a.active,
        visible: a.visible,
        archived_at: null,
        created_at: now,
        updated_at: now,
      };
    }
  },

  async getServiceItem(serviceItemId) {
    try {
      return await tryBackendGet(`/api/admin/service-catalog/service-items/${encodeURIComponent(serviceItemId)}`);
    } catch {
      await mockDelay();
      // Fallback: find in mock modules/addons.
      for (const pid of Object.keys(this._mock.modules_by_package_id || {})) {
        const list = this._mock.modules_by_package_id[pid] || [];
        const m = list.find((x) => x.id === serviceItemId);
        if (m) {
          return {
            id: m.id,
            type: "module",
            code: m.code,
            slug: null,
            name: m.name,
            description: m.description,
            ai_capable: Boolean(m.ai_capable),
            in_person_required: Boolean(m.in_person_required),
            extra_price: 0,
            currency: "USD",
            active: Boolean(m.active),
            visible: true,
            archived_at: null,
            created_at: m.created_at || new Date().toISOString(),
            updated_at: m.updated_at || new Date().toISOString(),
          };
        }
      }
      for (const pid of Object.keys(this._mock.addons_by_package_id || {})) {
        const list = this._mock.addons_by_package_id[pid] || [];
        const a = list.find((x) => x.id === serviceItemId);
        if (a) {
          return {
            id: a.id,
            type: "addon",
            code: a.code,
            slug: null,
            name: a.name,
            description: a.description,
            ai_capable: false,
            in_person_required: false,
            extra_price: Number(a.extra_price ?? 0),
            currency: a.currency || "USD",
            active: Boolean(a.active),
            visible: Boolean(a.visible),
            archived_at: null,
            created_at: a.created_at || new Date().toISOString(),
            updated_at: a.updated_at || new Date().toISOString(),
          };
        }
      }
      throw new Error("Mock service item not found");
    }
  },

  async updateServiceItem(serviceItemId, payload) {
    try {
      return await tryBackendPatch(`/api/admin/service-catalog/service-items/${encodeURIComponent(serviceItemId)}`, payload);
    } catch {
      await mockDelay();
      const now = new Date().toISOString();
      // Try module
      for (const pid of Object.keys(this._mock.modules_by_package_id || {})) {
        const list = this._mock.modules_by_package_id[pid] || [];
        const m = list.find((x) => x.id === serviceItemId);
        if (!m) continue;
        Object.assign(m, {
          name: payload.name !== undefined ? payload.name : m.name,
          description: payload.description !== undefined ? payload.description : m.description,
          ai_capable: payload.ai_capable !== undefined ? Boolean(payload.ai_capable) : m.ai_capable,
          in_person_required: payload.in_person_required !== undefined ? Boolean(payload.in_person_required) : m.in_person_required,
        });
        if (payload.active !== undefined) m.active = Boolean(payload.active);
        m.updated_at = now;
        return m;
      }
      // Try addon
      for (const pid of Object.keys(this._mock.addons_by_package_id || {})) {
        const list = this._mock.addons_by_package_id[pid] || [];
        const a = list.find((x) => x.id === serviceItemId);
        if (!a) continue;
        Object.assign(a, {
          name: payload.name !== undefined ? payload.name : a.name,
          description: payload.description !== undefined ? payload.description : a.description,
          extra_price: payload.extra_price !== undefined ? Number(payload.extra_price) : a.extra_price,
          currency: payload.currency !== undefined ? payload.currency : a.currency,
          visible: payload.visible !== undefined ? Boolean(payload.visible) : a.visible,
          active: payload.active !== undefined ? Boolean(payload.active) : a.active,
        });
        a.updated_at = now;
        return a;
      }
      throw new Error("Mock service item not found");
    }
  },

  async setServiceItemActivation(serviceItemId, active) {
    try {
      return await tryBackendPatch(`/api/admin/service-catalog/service-items/${encodeURIComponent(serviceItemId)}/activation`, { active });
    } catch {
      await mockDelay();
      // Module activation
      for (const pid of Object.keys(this._mock.modules_by_package_id || {})) {
        const list = this._mock.modules_by_package_id[pid] || [];
        const m = list.find((x) => x.id === serviceItemId);
        if (!m) continue;
        m.active = Boolean(active);
        m.updated_at = new Date().toISOString();
        return m;
      }
      // Addon activation
      for (const pid of Object.keys(this._mock.addons_by_package_id || {})) {
        const list = this._mock.addons_by_package_id[pid] || [];
        const a = list.find((x) => x.id === serviceItemId);
        if (!a) continue;
        a.active = Boolean(active);
        a.updated_at = new Date().toISOString();
        return a;
      }
      throw new Error("Mock service item not found");
    }
  },

  async setServiceItemVisibility(serviceItemId, visible) {
    try {
      return await tryBackendPatch(`/api/admin/service-catalog/service-items/${encodeURIComponent(serviceItemId)}/visibility`, { visible });
    } catch {
      await mockDelay();
      // Only addons have visible in legacy mock; modules default visible=true.
      for (const pid of Object.keys(this._mock.addons_by_package_id || {})) {
        const list = this._mock.addons_by_package_id[pid] || [];
        const a = list.find((x) => x.id === serviceItemId);
        if (!a) continue;
        a.visible = Boolean(visible);
        a.updated_at = new Date().toISOString();
        return a;
      }
      return { id: serviceItemId, visible: Boolean(visible) };
    }
  },

  async archiveServiceItem(serviceItemId) {
    try {
      return await tryBackendPatch(`/api/admin/service-catalog/service-items/${encodeURIComponent(serviceItemId)}/archive`, {});
    } catch {
      await mockDelay();
      // Module archive
      for (const pid of Object.keys(this._mock.modules_by_package_id || {})) {
        const list = this._mock.modules_by_package_id[pid] || [];
        const m = list.find((x) => x.id === serviceItemId);
        if (!m) continue;
        m.active = false;
        m.updated_at = new Date().toISOString();
        return m;
      }
      // Addon archive
      for (const pid of Object.keys(this._mock.addons_by_package_id || {})) {
        const list = this._mock.addons_by_package_id[pid] || [];
        const a = list.find((x) => x.id === serviceItemId);
        if (!a) continue;
        a.active = false;
        a.visible = false;
        a.updated_at = new Date().toISOString();
        return a;
      }
      throw new Error("Mock service item not found");
    }
  },

  async deleteServiceItem(serviceItemId) {
    try {
      return await tryBackendDelete(`/api/admin/service-catalog/service-items/${encodeURIComponent(serviceItemId)}`);
    } catch {
      await mockDelay();
      // Modules
      for (const pid of Object.keys(this._mock.modules_by_package_id || {})) {
        const list = this._mock.modules_by_package_id[pid] || [];
        const idx = list.findIndex((x) => x.id === serviceItemId);
        if (idx >= 0) {
          list.splice(idx, 1);
          return null;
        }
      }
      // Addons
      for (const pid of Object.keys(this._mock.addons_by_package_id || {})) {
        const list = this._mock.addons_by_package_id[pid] || [];
        const idx = list.findIndex((x) => x.id === serviceItemId);
        if (idx >= 0) {
          list.splice(idx, 1);
          return null;
        }
      }
      throw new Error("Mock service item not found");
    }
  },

  async listServiceItemInventory({ type = null, category_id = null, package_id = null, active = null, visible = null } = {}) {
    try {
      const params = new URLSearchParams();
      if (type) params.set("type", type);
      if (category_id) params.set("category_id", category_id);
      if (package_id) params.set("package_id", package_id);
      if (active !== null) params.set("active", active ? "true" : "false");
      if (visible !== null) params.set("visible", visible ? "true" : "false");
      return await tryBackendGet(`/api/admin/service-catalog/service-items/inventory?${params.toString()}`);
    } catch (err) {
      if (!shouldUseMockFallback(err)) throw err;
      await mockDelay();
      const packages = this._mock.packages || [];
      const categories = this._mock.categories || [];
      const catById = Object.fromEntries(categories.map((c) => [c.id, c]));
      const pkgById = Object.fromEntries(packages.map((p) => [p.id, p]));

      const rows = [];
      // Legacy modules => service items type=module
      for (const pkgId of Object.keys(this._mock.modules_by_package_id || {})) {
        const pkg = pkgById[pkgId];
        if (!pkg) continue;
        const cat = catById[pkg.category_id];
        for (const m of this._mock.modules_by_package_id[pkgId] || []) {
          const itemType = "module";
          if (type && type !== itemType) continue;
          if (package_id && pkgId !== package_id) continue;
          if (category_id && pkg.category_id !== category_id) continue;
          if (active !== null && Boolean(m.active) !== Boolean(active)) continue;
          if (visible !== null && Boolean(true) !== Boolean(visible)) continue;

          rows.push({
            package_service_link_id: `psl-${m.id}-${pkgId}`,
            service_item_id: m.id,
            type: itemType,
            code: m.code,
            slug: null,
            name: m.name,
            description: m.description,
            ai_capable: Boolean(m.ai_capable),
            in_person_required: Boolean(m.in_person_required),
            extra_price: 0,
            currency: "USD",
            active: Boolean(m.active),
            visible: true,
            archived_at: null,
            package_id: pkgId,
            package_name: pkg.name,
            category_id: pkg.category_id,
            category_name: cat?.name || "Uncategorized",
            sort_order: Number(m.sort_order ?? 0),
            required: Boolean(m.required),
          });
        }
      }
      // Legacy addons => service items type=addon
      for (const pkgId of Object.keys(this._mock.addons_by_package_id || {})) {
        const pkg = pkgById[pkgId];
        if (!pkg) continue;
        const cat = catById[pkg.category_id];
        for (const a of this._mock.addons_by_package_id[pkgId] || []) {
          const itemType = "addon";
          if (type && type !== itemType) continue;
          if (package_id && pkgId !== package_id) continue;
          if (category_id && pkg.category_id !== category_id) continue;
          if (active !== null && Boolean(a.active) !== Boolean(active)) continue;
          if (visible !== null && Boolean(a.visible) !== Boolean(visible)) continue;

          rows.push({
            package_service_link_id: `psl-${a.id}-${pkgId}`,
            service_item_id: a.id,
            type: itemType,
            code: a.code,
            slug: null,
            name: a.name,
            description: a.description,
            ai_capable: false,
            in_person_required: false,
            extra_price: Number(a.extra_price ?? 0),
            currency: a.currency || "USD",
            active: Boolean(a.active),
            visible: Boolean(a.visible),
            archived_at: null,
            package_id: pkgId,
            package_name: pkg.name,
            category_id: pkg.category_id,
            category_name: cat?.name || "Uncategorized",
            sort_order: Number(a.sort_order ?? 0),
            required: Boolean(a.required ?? false),
          });
        }
      }
      rows.sort((r1, r2) => (r1.category_name || "").localeCompare(r2.category_name || "") || r1.package_name.localeCompare(r2.package_name) || r1.sort_order - r2.sort_order);
      return rows;
    }
  },

  async addServiceItemToPackage(packageId, payload) {
    try {
      return await tryBackendPost(`/api/admin/service-catalog/packages/${encodeURIComponent(packageId)}/service-links`, payload);
    } catch {
      await mockDelay();
      // Fallback: derive type from existing module/addon id.
      const now = new Date().toISOString();
      const serviceItemId = payload.service_item_id;
      const required = Boolean(payload.required ?? false);
      const sort_order = Number(payload.sort_order ?? 0);

      // Find if it is module
      for (const pid of Object.keys(this._mock.modules_by_package_id || {})) {
        const list = this._mock.modules_by_package_id[pid] || [];
        const m = list.find((x) => x.id === serviceItemId);
        if (m) {
          const copy = { ...m, package_id: packageId, sort_order, required, updated_at: now };
          this._mock.modules_by_package_id[packageId] = this._mock.modules_by_package_id[packageId] || [];
          this._mock.modules_by_package_id[packageId].push(copy);
          return { id: `psl-${Date.now()}`, package_id: packageId, service_item_id: serviceItemId, sort_order, required };
        }
      }
      // Find if it is addon
      for (const pid of Object.keys(this._mock.addons_by_package_id || {})) {
        const list = this._mock.addons_by_package_id[pid] || [];
        const a = list.find((x) => x.id === serviceItemId);
        if (a) {
          const copy = { ...a, package_id: packageId, sort_order, required, updated_at: now };
          copy.required = required;
          this._mock.addons_by_package_id[packageId] = this._mock.addons_by_package_id[packageId] || [];
          this._mock.addons_by_package_id[packageId].push(copy);
          return { id: `psl-${Date.now()}`, package_id: packageId, service_item_id: serviceItemId, sort_order, required };
        }
      }
      throw new Error("Mock service item not found for linking");
    }
  },

  async removeServiceItemFromPackage(packageId, serviceItemId) {
    try {
      return await tryBackendDelete(`/api/admin/service-catalog/packages/${encodeURIComponent(packageId)}/service-links/${encodeURIComponent(serviceItemId)}`);
    } catch {
      await mockDelay();
      // Remove module/addon by id from the legacy mock for this package.
      const mods = this._mock.modules_by_package_id[packageId] || [];
      const idxM = mods.findIndex((x) => x.id === serviceItemId);
      if (idxM >= 0) {
        mods.splice(idxM, 1);
        return null;
      }
      const adds = this._mock.addons_by_package_id[packageId] || [];
      const idxA = adds.findIndex((x) => x.id === serviceItemId);
      if (idxA >= 0) {
        adds.splice(idxA, 1);
        return null;
      }
      throw new Error("Mock package link not found");
    }
  },

  async reorderServiceItemsInPackage(packageId, serviceItemIds) {
    try {
      return await tryBackendPost(
        `/api/admin/service-catalog/packages/${encodeURIComponent(packageId)}/service-links/reorder`,
        { service_item_ids: serviceItemIds }
      );
    } catch {
      await mockDelay();
      // Fallback: update sort_order for matching service item ids within a package.
      for (let idx = 0; idx < serviceItemIds.length; idx++) {
        const sid = serviceItemIds[idx];
        const mods = this._mock.modules_by_package_id[packageId] || [];
        const m = mods.find((x) => x.id === sid);
        if (m) m.sort_order = idx;
        const adds = this._mock.addons_by_package_id[packageId] || [];
        const a = adds.find((x) => x.id === sid);
        if (a) a.sort_order = idx;
      }
      return serviceItemIds;
    }
  },

  async setServiceItemRequiredInPackage(packageId, serviceItemId, required) {
    try {
      return await tryBackendPatch(
        `/api/admin/service-catalog/packages/${encodeURIComponent(packageId)}/service-links/${encodeURIComponent(serviceItemId)}/required`,
        { required }
      );
    } catch {
      await mockDelay();
      const mods = this._mock.modules_by_package_id[packageId] || [];
      const m = mods.find((x) => x.id === serviceItemId);
      if (m) {
        m.required = Boolean(required);
        return m;
      }
      const adds = this._mock.addons_by_package_id[packageId] || [];
      const a = adds.find((x) => x.id === serviceItemId);
      if (a) {
        a.required = Boolean(required);
        return a;
      }
      throw new Error("Mock link not found");
    }
  },
};

// Admin survey builder APIs for questionnaire/version/item/option/rule management.
// Endpoints live under: /api/admin/survey-builder/...
// If backend is unavailable, UI remains usable via in-memory mock persistence.
const surveyBuilderAdminApi = {
  _mock: {
    questionnaires: [
      {
        id: "qnr-1",
        code: "onboarding-diagnosis",
        name: "Onboarding Diagnosis Flow",
        description: "Customer diagnosis flow that drives recommended services.",
        active_version_id: "qnrver-1",
        active: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    ],
    versions_by_questionnaire_id: {
      "qnr-1": [
        {
          id: "qnrver-1",
          questionnaire_id: "qnr-1",
          version_number: 1,
          status: "PUBLISHED",
          created_at: new Date().toISOString(),
          published_at: new Date().toISOString(),
        },
        {
          id: "qnrver-2",
          questionnaire_id: "qnr-1",
          version_number: 2,
          status: "DRAFT",
          created_at: new Date().toISOString(),
          published_at: null,
        },
      ],
    },
    items_by_version_id: {
      "qnrver-1": [
        {
          id: "qitem-1",
          questionnaire_version_id: "qnrver-1",
          section_code: "basic",
          question_code: "company_size",
          label: "Which company size best describes you?",
          help_text: "This helps tailor the onboarding recommendations.",
          input_type: "select",
          placeholder: "",
          required: true,
          sort_order: 0,
          conditional_rule_json: {},
          active: true,
        },
        {
          id: "qitem-2",
          questionnaire_version_id: "qnrver-1",
          section_code: "ops",
          question_code: "needs_on_site",
          label: "Do you need an on-site assistance session?",
          help_text: "On-site assistance may reduce risk and waiting time.",
          input_type: "select",
          placeholder: "",
          required: false,
          sort_order: 1,
          conditional_rule_json: { type: "always" },
          active: true,
        },
      ],
    },
    options_by_item_id: {
      "qitem-1": [
        { id: "qopt-1", question_item_id: "qitem-1", value: "small", label: "Small team", sort_order: 0 },
        { id: "qopt-2", question_item_id: "qitem-1", value: "mid", label: "Mid-size team", sort_order: 1 },
      ],
      "qitem-2": [
        { id: "qopt-3", question_item_id: "qitem-2", value: "yes", label: "Yes, need on-site", sort_order: 0 },
        { id: "qopt-4", question_item_id: "qitem-2", value: "no", label: "No, self-service ok", sort_order: 1 },
      ],
    },
    rules_by_version_id: {
      "qnrver-1": [
        {
          id: "rule-1",
          questionnaire_version_id: "qnrver-1",
          condition_json: { type: "question_option_equals", question_code: "company_size", option_value: "small" },
          result_type: "package",
          result_code: "pkg-1",
          priority: 2,
          active: true,
        },
        {
          id: "rule-2",
          questionnaire_version_id: "qnrver-1",
          condition_json: { type: "question_option_equals", question_code: "needs_on_site", option_value: "yes" },
          result_type: "addon",
          result_code: "ad-2",
          priority: 1,
          active: true,
        },
      ],
    },
  },

  async listQuestionnaires(includeInactive = true) {
    try {
      return await tryBackendGet(
        `/api/admin/survey-builder/questionnaires?include_inactive=${includeInactive ? "true" : "false"}`
      );
    } catch {
      await mockDelay();
      const { questionnaires } = this._mock;
      return includeInactive ? questionnaires : questionnaires.filter((q) => q.active);
    }
  },

  async createQuestionnaire(payload) {
    try {
      return await tryBackendPost("/api/admin/survey-builder/questionnaires", payload);
    } catch {
      await mockDelay();
      const id = `qnr-${Date.now()}`;
      const now = new Date().toISOString();
      const created = { id, created_at: now, updated_at: now, active_version_id: null, ...payload };
      this._mock.questionnaires.push(created);
      this._mock.versions_by_questionnaire_id[id] = [];
      return created;
    }
  },

  async updateQuestionnaire(questionnaireId, payload) {
    try {
      return await tryBackendPatch(`/api/admin/survey-builder/questionnaires/${encodeURIComponent(questionnaireId)}`, payload);
    } catch {
      await mockDelay();
      const q = this._mock.questionnaires.find((x) => x.id === questionnaireId);
      if (!q) throw new Error("Mock questionnaire not found");
      Object.assign(q, payload);
      q.updated_at = new Date().toISOString();
      return q;
    }
  },

  async setQuestionnaireActivation(questionnaireId, active) {
    try {
      return await tryBackendPatch(`/api/admin/survey-builder/questionnaires/${encodeURIComponent(questionnaireId)}/activation`, {
        active,
      });
    } catch {
      await mockDelay();
      const q = this._mock.questionnaires.find((x) => x.id === questionnaireId);
      if (!q) throw new Error("Mock questionnaire not found");
      q.active = active;
      q.updated_at = new Date().toISOString();
      return q;
    }
  },

  async getQuestionnaire(questionnaireId) {
    try {
      return await tryBackendGet(`/api/admin/survey-builder/questionnaires/${encodeURIComponent(questionnaireId)}`);
    } catch {
      await mockDelay();
      const q = this._mock.questionnaires.find((x) => x.id === questionnaireId);
      if (!q) throw new Error("Mock questionnaire not found");
      return q;
    }
  },

  async listQuestionnaireVersions(questionnaireId) {
    try {
      return await tryBackendGet(`/api/admin/survey-builder/questionnaires/${encodeURIComponent(questionnaireId)}/versions`);
    } catch {
      await mockDelay();
      return (this._mock.versions_by_questionnaire_id[questionnaireId] || []).slice().sort((a, b) => a.version_number - b.version_number);
    }
  },

  async createQuestionnaireVersion(questionnaireId, versionNumber = null) {
    try {
      return await tryBackendPost(`/api/admin/survey-builder/questionnaires/${encodeURIComponent(questionnaireId)}/versions`, {
        version_number: versionNumber,
      });
    } catch {
      await mockDelay();
      const list = this._mock.versions_by_questionnaire_id[questionnaireId] || [];
      const currentMax = Math.max(...list.map((v) => v.version_number || 0), 0);
      const vn = versionNumber != null ? versionNumber : currentMax + 1;
      const id = `qnrver-${Date.now()}`;
      const now = new Date().toISOString();
      const created = {
        id,
        questionnaire_id: questionnaireId,
        version_number: vn,
        status: "DRAFT",
        created_at: now,
        published_at: null,
      };
      this._mock.versions_by_questionnaire_id[questionnaireId] = [...list, created];
      return created;
    }
  },

  async publishQuestionnaireVersion(questionnaireId, versionId) {
    try {
      return await tryBackendPost(
        `/api/admin/survey-builder/questionnaires/${encodeURIComponent(questionnaireId)}/versions/${encodeURIComponent(versionId)}/publish`,
        {}
      );
    } catch {
      await mockDelay();
      const list = this._mock.versions_by_questionnaire_id[questionnaireId] || [];
      const v = list.find((x) => x.id === versionId);
      if (!v) throw new Error("Mock version not found");
      v.status = "PUBLISHED";
      v.published_at = new Date().toISOString();
      return v;
    }
  },

  async setActiveQuestionnaireVersion(questionnaireId, versionId) {
    try {
      return await tryBackendPatch(`/api/admin/survey-builder/questionnaires/${encodeURIComponent(questionnaireId)}/active-version`, {
        version_id: versionId,
      });
    } catch {
      await mockDelay();
      const q = this._mock.questionnaires.find((x) => x.id === questionnaireId);
      if (!q) throw new Error("Mock questionnaire not found");
      const versions = this._mock.versions_by_questionnaire_id[questionnaireId] || [];
      const v = versions.find((x) => x.id === versionId);
      if (!v) throw new Error("Mock version not found");
      if (String(v.status || "").toUpperCase() !== "PUBLISHED") throw new Error("Active version must be published");
      q.active_version_id = versionId;
      q.updated_at = new Date().toISOString();
      return q;
    }
  },

  async listQuestionItems(versionId) {
    try {
      return await tryBackendGet(`/api/admin/survey-builder/questionnaire-versions/${encodeURIComponent(versionId)}/items`);
    } catch {
      await mockDelay();
      const list = this._mock.items_by_version_id[versionId] || [];
      return list.slice().sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
    }
  },

  async createQuestionItem(versionId, payload) {
    try {
      return await tryBackendPost(`/api/admin/survey-builder/questionnaire-versions/${encodeURIComponent(versionId)}/items`, payload);
    } catch {
      await mockDelay();
      const id = `qitem-${Date.now()}`;
      const now = new Date().toISOString();
      const item = { id, questionnaire_version_id: versionId, sort_order: 0, conditional_rule_json: {}, ...payload, created_at: now, updated_at: now };
      const list = this._mock.items_by_version_id[versionId] || [];
      const sortOrder = Number(item.sort_order ?? list.length ?? 0);
      item.sort_order = sortOrder;
      this._mock.items_by_version_id[versionId] = [...list, item];
      this._mock.options_by_item_id[id] = [];
      return item;
    }
  },

  async updateQuestionItem(itemId, payload) {
    try {
      return await tryBackendPatch(`/api/admin/survey-builder/question-items/${encodeURIComponent(itemId)}`, payload);
    } catch {
      await mockDelay();
      for (const vid of Object.keys(this._mock.items_by_version_id)) {
        const list = this._mock.items_by_version_id[vid] || [];
        const item = list.find((x) => x.id === itemId);
        if (item) {
          Object.assign(item, payload);
          item.updated_at = new Date().toISOString();
          return item;
        }
      }
      throw new Error("Mock question item not found");
    }
  },

  async reorderQuestionItems(versionId, itemIds) {
    try {
      return await tryBackendPost(
        `/api/admin/survey-builder/questionnaire-versions/${encodeURIComponent(versionId)}/items/reorder`,
        { item_ids: itemIds }
      );
    } catch {
      await mockDelay();
      const list = this._mock.items_by_version_id[versionId] || [];
      const byId = Object.fromEntries(list.map((x) => [x.id, x]));
      const newOrder = itemIds.map((id) => byId[id]).filter(Boolean);
      newOrder.forEach((it, idx) => {
        it.sort_order = idx;
      });
      this._mock.items_by_version_id[versionId] = newOrder;
      return newOrder;
    }
  },

  async setQuestionItemActivation(itemId, active) {
    try {
      return await tryBackendPatch(`/api/admin/survey-builder/question-items/${encodeURIComponent(itemId)}/activation`, { active });
    } catch {
      await mockDelay();
      for (const vid of Object.keys(this._mock.items_by_version_id)) {
        const list = this._mock.items_by_version_id[vid] || [];
        const item = list.find((x) => x.id === itemId);
        if (item) {
          item.active = active;
          item.updated_at = new Date().toISOString();
          return item;
        }
      }
      throw new Error("Mock question item not found");
    }
  },

  async listQuestionOptions(itemId) {
    try {
      return await tryBackendGet(`/api/admin/survey-builder/question-items/${encodeURIComponent(itemId)}/options`);
    } catch {
      await mockDelay();
      const list = this._mock.options_by_item_id[itemId] || [];
      return list.slice().sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
    }
  },

  async createQuestionOption(itemId, payload) {
    try {
      return await tryBackendPost(`/api/admin/survey-builder/question-items/${encodeURIComponent(itemId)}/options`, payload);
    } catch {
      await mockDelay();
      const id = `qopt-${Date.now()}`;
      const now = new Date().toISOString();
      const list = this._mock.options_by_item_id[itemId] || [];
      const sortOrder = Number(payload.sort_order ?? list.length);
      const opt = { id, question_item_id: itemId, sort_order: sortOrder, ...payload, created_at: now, updated_at: now };
      this._mock.options_by_item_id[itemId] = [...list, opt];
      return opt;
    }
  },

  async updateQuestionOption(optionId, payload) {
    try {
      return await tryBackendPatch(`/api/admin/survey-builder/question-options/${encodeURIComponent(optionId)}`, payload);
    } catch {
      await mockDelay();
      for (const itemId of Object.keys(this._mock.options_by_item_id)) {
        const list = this._mock.options_by_item_id[itemId] || [];
        const opt = list.find((x) => x.id === optionId);
        if (opt) {
          Object.assign(opt, payload);
          opt.updated_at = new Date().toISOString();
          return opt;
        }
      }
      throw new Error("Mock question option not found");
    }
  },

  async reorderQuestionOptions(itemId, optionIds) {
    try {
      return await tryBackendPost(
        `/api/admin/survey-builder/question-items/${encodeURIComponent(itemId)}/options/reorder`,
        { option_ids: optionIds }
      );
    } catch {
      await mockDelay();
      const list = this._mock.options_by_item_id[itemId] || [];
      const byId = Object.fromEntries(list.map((x) => [x.id, x]));
      const newOrder = optionIds.map((id) => byId[id]).filter(Boolean);
      newOrder.forEach((opt, idx) => {
        opt.sort_order = idx;
      });
      this._mock.options_by_item_id[itemId] = newOrder;
      return newOrder;
    }
  },

  async deleteQuestionOption(optionId) {
    try {
      return await tryBackendDelete(`/api/admin/survey-builder/question-options/${encodeURIComponent(optionId)}`);
    } catch {
      await mockDelay();
      for (const itemId of Object.keys(this._mock.options_by_item_id)) {
        const list = this._mock.options_by_item_id[itemId] || [];
        const idx = list.findIndex((x) => x.id === optionId);
        if (idx >= 0) {
          list.splice(idx, 1);
          // fix order
          list.forEach((opt, i) => {
            opt.sort_order = i;
          });
          this._mock.options_by_item_id[itemId] = list;
          return null;
        }
      }
      throw new Error("Mock question option not found");
    }
  },

  async listRecommendationRules(versionId, activeOnly = false) {
    try {
      const qs = `?active_only=${activeOnly ? "true" : "false"}`;
      return await tryBackendGet(`/api/admin/survey-builder/questionnaire-versions/${encodeURIComponent(versionId)}/rules${qs}`);
    } catch {
      await mockDelay();
      const list = this._mock.rules_by_version_id[versionId] || [];
      if (activeOnly) return list.filter((r) => r.active).slice();
      return list.slice();
    }
  },

  async createRecommendationRule(versionId, payload) {
    try {
      return await tryBackendPost(
        `/api/admin/survey-builder/questionnaire-versions/${encodeURIComponent(versionId)}/rules`,
        payload
      );
    } catch {
      await mockDelay();
      const id = `rule-${Date.now()}`;
      const list = this._mock.rules_by_version_id[versionId] || [];
      const rule = {
        id,
        questionnaire_version_id: versionId,
        condition_json: {},
        priority: 0,
        active: true,
        ...payload,
      };
      this._mock.rules_by_version_id[versionId] = [...list, rule];
      return rule;
    }
  },

  async updateRecommendationRule(ruleId, payload) {
    try {
      return await tryBackendPatch(`/api/admin/survey-builder/rules/${encodeURIComponent(ruleId)}`, payload);
    } catch {
      await mockDelay();
      for (const vid of Object.keys(this._mock.rules_by_version_id)) {
        const list = this._mock.rules_by_version_id[vid] || [];
        const rule = list.find((x) => x.id === ruleId);
        if (rule) {
          Object.assign(rule, payload);
          return rule;
        }
      }
      throw new Error("Mock recommendation rule not found");
    }
  },

  async setRecommendationRuleActivation(ruleId, active) {
    try {
      return await tryBackendPatch(`/api/admin/survey-builder/rules/${encodeURIComponent(ruleId)}/activation`, { active });
    } catch {
      await mockDelay();
      for (const vid of Object.keys(this._mock.rules_by_version_id)) {
        const list = this._mock.rules_by_version_id[vid] || [];
        const rule = list.find((x) => x.id === ruleId);
        if (rule) {
          rule.active = active;
          return rule;
        }
      }
      throw new Error("Mock recommendation rule not found");
    }
  },

  async reorderRecommendationRules(versionId, ruleIds) {
    try {
      return await tryBackendPost(
        `/api/admin/survey-builder/questionnaire-versions/${encodeURIComponent(versionId)}/rules/reorder`,
        { rule_ids: ruleIds }
      );
    } catch {
      await mockDelay();
      const list = this._mock.rules_by_version_id[versionId] || [];
      const byId = Object.fromEntries(list.map((x) => [x.id, x]));
      const newOrder = ruleIds.map((id) => byId[id]).filter(Boolean);
      const n = newOrder.length;
      newOrder.forEach((r, idx) => {
        r.priority = n - idx - 1;
      });
      this._mock.rules_by_version_id[versionId] = newOrder;
      return newOrder;
    }
  },
};

// Customer survey APIs (need-diagnosis with conditional branching).
// Endpoints live under: /api/surveys/...
const surveyCustomerApi = {
  _mock: {
    questionnaire: {
      id: "qnr-need-1",
      code: "landing-need-diagnosis",
      name: "Landing Need Diagnosis",
      description: "Customer diagnosis flow that drives recommended services.",
      active_version_id: "qnrver-need-1",
      active: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    version: {
      id: "qnrver-need-1",
      questionnaire_id: "qnr-need-1",
      version_number: 1,
      status: "PUBLISHED",
      created_at: new Date().toISOString(),
      published_at: new Date().toISOString(),
    },
    items: [
      {
        id: "qitem-need-areas",
        questionnaire_version_id: "qnrver-need-1",
        section_code: "needs",
        question_code: "need_areas",
        label: "필요한 도움 영역을 골라주세요",
        help_text: "서비스 28개를 고르는 방식이 아니라, 지금 필요한 문제 영역을 먼저 진단합니다.",
        input_type: "multi_select",
        placeholder: "",
        required: true,
        sort_order: 0,
        conditional_rule_json: {},
        active: true,
      },
      // Arrival / Setup
      {
        id: "qitem-arrival-airport",
        questionnaire_version_id: "qnrver-need-1",
        section_code: "arrival_setup",
        question_code: "airport_pickup_needed",
        label: "공항 픽업이 필요하신가요?",
        help_text: "픽업 일정과 동선이 추천 모듈의 우선순위를 바꿉니다.",
        input_type: "select",
        placeholder: "",
        required: false,
        sort_order: 10,
        conditional_rule_json: { type: "needs_includes", question_code: "need_areas", option_value: "arrival_setup" },
        active: true,
      },
      {
        id: "qitem-arrival-phone",
        questionnaire_version_id: "qnrver-need-1",
        section_code: "arrival_setup",
        question_code: "us_phone_needed",
        label: "미국 전화번호가 꼭 필요하신가요?",
        help_text: "연락·인증 단계(번호 확보)가 진행 속도에 영향을 줍니다.",
        input_type: "select",
        placeholder: "",
        required: false,
        sort_order: 11,
        conditional_rule_json: { type: "needs_includes", question_code: "need_areas", option_value: "arrival_setup" },
        active: true,
      },
      {
        id: "qitem-arrival-bank",
        questionnaire_version_id: "qnrver-need-1",
        section_code: "arrival_setup",
        question_code: "bank_account_needed",
        label: "은행 계좌 설정이 필요하신가요?",
        help_text: "계좌 설정은 필수 절차 여부를 결정해 다음 단계 안내를 조정합니다.",
        input_type: "select",
        placeholder: "",
        required: false,
        sort_order: 12,
        conditional_rule_json: { type: "needs_includes", question_code: "need_areas", option_value: "arrival_setup" },
        active: true,
      },
      // Housing
      {
        id: "qitem-housing-rent",
        questionnaire_version_id: "qnrver-need-1",
        section_code: "housing",
        question_code: "rent_budget",
        label: "렌트(임대) 예산 범위는 어디에 가까우세요?",
        help_text: "예산 범위에 따라 지역/절차 안내의 “권장 방향”이 달라집니다.",
        input_type: "select",
        placeholder: "",
        required: false,
        sort_order: 20,
        conditional_rule_json: { type: "needs_includes", question_code: "need_areas", option_value: "housing" },
        active: true,
      },
      {
        id: "qitem-housing-bedrooms",
        questionnaire_version_id: "qnrver-need-1",
        section_code: "housing",
        question_code: "bedrooms",
        label: "침실(베드룸) 수는 몇 개인가요?",
        help_text: "베드룸 수는 준비 체크리스트와 우선순위를 정하는 데 도움이 됩니다.",
        input_type: "number",
        placeholder: "예: 2",
        required: false,
        sort_order: 21,
        conditional_rule_json: { type: "needs_includes", question_code: "need_areas", option_value: "housing" },
        active: true,
      },
      {
        id: "qitem-housing-pets",
        questionnaire_version_id: "qnrver-need-1",
        section_code: "housing",
        question_code: "pets",
        label: "반려동물(펫)이 있으신가요?",
        help_text: "펫 관련 조건이 집 옵션/서류 안내에 영향을 줍니다.",
        input_type: "select",
        placeholder: "",
        required: false,
        sort_order: 22,
        conditional_rule_json: { type: "needs_includes", question_code: "need_areas", option_value: "housing" },
        active: true,
      },
      {
        id: "qitem-housing-area",
        questionnaire_version_id: "qnrver-need-1",
        section_code: "housing",
        question_code: "preferred_area",
        label: "선호하는 지역(대략)이나 우선순위가 있나요?",
        help_text: "선호 지역을 알면 추천 흐름(방문/선정 체크)이 더 정확해집니다.",
        input_type: "text",
        placeholder: "예: Irvine, 혹은 통근 시간 우선",
        required: false,
        sort_order: 23,
        conditional_rule_json: { type: "needs_includes", question_code: "need_areas", option_value: "housing" },
        active: true,
      },
      {
        id: "qitem-housing-video",
        questionnaire_version_id: "qnrver-need-1",
        section_code: "housing",
        question_code: "house_video_needed",
        label: "집 영상(비디오) 확인이 필요하신가요?",
        help_text: "영상 확인이 필요한 경우, 일정/확인 절차를 더 촘촘히 안내합니다.",
        input_type: "select",
        placeholder: "",
        required: false,
        sort_order: 24,
        conditional_rule_json: { type: "needs_includes", question_code: "need_areas", option_value: "housing" },
        active: true,
      },
      {
        id: "qitem-housing-utility",
        questionnaire_version_id: "qnrver-need-1",
        section_code: "housing",
        question_code: "utility_setup_needed",
        label: "유틸리티(전기/가스/인터넷 등) 설정이 필요하신가요?",
        help_text: "유틸리티 설정 여부는 입주 후 “바로 필요한 일” 우선순위를 바꿉니다.",
        input_type: "select",
        placeholder: "",
        required: false,
        sort_order: 25,
        conditional_rule_json: { type: "needs_includes", question_code: "need_areas", option_value: "housing" },
        active: true,
      },
      // Mobility
      {
        id: "qitem-mob-vehicle-count",
        questionnaire_version_id: "qnrver-need-1",
        section_code: "mobility",
        question_code: "vehicle_count",
        label: "차량은 몇 대가 필요하세요?",
        help_text: "차량 수는 렌트/구매 방식과 예산 추천에 영향을 줍니다.",
        input_type: "number",
        placeholder: "예: 1",
        required: false,
        sort_order: 30,
        conditional_rule_json: { type: "needs_includes", question_code: "need_areas", option_value: "mobility" },
        active: true,
      },
      {
        id: "qitem-mob-rent-or-buy",
        questionnaire_version_id: "qnrver-need-1",
        section_code: "mobility",
        question_code: "rent_or_buy",
        label: "렌트가 좋나요, 구매가 좋나요?",
        help_text: "선호 방식에 따라 다음 단계(문서/절차) 안내가 달라집니다.",
        input_type: "select",
        placeholder: "",
        required: false,
        sort_order: 31,
        conditional_rule_json: { type: "needs_includes", question_code: "need_areas", option_value: "mobility" },
        active: true,
      },
      {
        id: "qitem-mob-budget",
        questionnaire_version_id: "qnrver-need-1",
        section_code: "mobility",
        question_code: "mobility_budget",
        label: "차량/이동 관련 예산 범위는 어느 정도인가요?",
        help_text: "예산은 권장 “진행 옵션”을 결정하는 데 쓰입니다.",
        input_type: "select",
        placeholder: "",
        required: false,
        sort_order: 32,
        conditional_rule_json: { type: "needs_includes", question_code: "need_areas", option_value: "mobility" },
        active: true,
      },
      {
        id: "qitem-mob-kr-license",
        questionnaire_version_id: "qnrver-need-1",
        section_code: "mobility",
        question_code: "korean_drivers_license_yes",
        label: "한국 운전면허증이 있으신가요?",
        help_text: "면허 상황에 따라 DMV/전환 단계 지원이 달라집니다.",
        input_type: "select",
        placeholder: "",
        required: false,
        sort_order: 33,
        conditional_rule_json: { type: "needs_includes", question_code: "need_areas", option_value: "mobility" },
        active: true,
      },
      {
        id: "qitem-mob-dmv-support",
        questionnaire_version_id: "qnrver-need-1",
        section_code: "mobility",
        question_code: "dmv_support_needed",
        label: "DMV 절차 지원이 필요하신가요?",
        help_text: "지원 필요 여부를 반영해 문서 준비/진행 난이도를 조정합니다.",
        input_type: "select",
        placeholder: "",
        required: false,
        sort_order: 34,
        conditional_rule_json: { type: "needs_includes", question_code: "need_areas", option_value: "mobility" },
        active: true,
      },
      // Family/School
      {
        id: "qitem-family-count",
        questionnaire_version_id: "qnrver-need-1",
        section_code: "family_school",
        question_code: "number_of_children",
        label: "자녀는 몇 명이 있나요?",
        help_text: "자녀 수는 학교/준비 단계의 우선순위를 정합니다.",
        input_type: "number",
        placeholder: "예: 1",
        required: false,
        sort_order: 40,
        conditional_rule_json: { type: "needs_includes", question_code: "need_areas", option_value: "family_school" },
        active: true,
      },
      {
        id: "qitem-family-grades",
        questionnaire_version_id: "qnrver-need-1",
        section_code: "family_school",
        question_code: "grades",
        label: "자녀 학년(대략)은 어떻게 되나요?",
        help_text: "학년에 따라 필요한 서류/절차가 달라집니다.",
        input_type: "select",
        placeholder: "",
        required: false,
        sort_order: 41,
        conditional_rule_json: { type: "needs_includes", question_code: "need_areas", option_value: "family_school" },
        active: true,
      },
      {
        id: "qitem-family-type",
        questionnaire_version_id: "qnrver-need-1",
        section_code: "family_school",
        question_code: "public_private_school",
        label: "공립/사립 중 어떤 학교를 생각하시나요?",
        help_text: "학교 유형은 다음 단계에서 안내하는 “진행 흐름”에 영향을 줍니다.",
        input_type: "select",
        placeholder: "",
        required: false,
        sort_order: 42,
        conditional_rule_json: { type: "needs_includes", question_code: "need_areas", option_value: "family_school" },
        active: true,
      },
      {
        id: "qitem-family-medical",
        questionnaire_version_id: "qnrver-need-1",
        section_code: "family_school",
        question_code: "medical_document_support_needed",
        label: "의료 문서 지원이 필요하신가요?",
        help_text: "의료 문서가 필요하면 관련 준비/제출 흐름을 우선 안내합니다.",
        input_type: "select",
        placeholder: "",
        required: false,
        sort_order: 43,
        conditional_rule_json: { type: "needs_includes", question_code: "need_areas", option_value: "family_school" },
        active: true,
      },
      // Admin/Business
      {
        id: "qitem-admin-ssn",
        questionnaire_version_id: "qnrver-need-1",
        section_code: "admin_business",
        question_code: "ssn_appointment_needed",
        label: "SSN(사회보장번호) 예약이 필요하신가요?",
        help_text: "SSN 예약/준비 단계가 필요하면 관련 진행 포인트를 강조합니다.",
        input_type: "select",
        placeholder: "",
        required: false,
        sort_order: 50,
        conditional_rule_json: { type: "needs_includes", question_code: "need_areas", option_value: "admin_business" },
        active: true,
      },
      {
        id: "qitem-admin-insurance",
        questionnaire_version_id: "qnrver-need-1",
        section_code: "admin_business",
        question_code: "health_insurance_needed",
        label: "건강보험 가입/준비가 필요하신가요?",
        help_text: "건강보험 단계는 예산/서류 흐름을 같이 고려해 추천합니다.",
        input_type: "select",
        placeholder: "",
        required: false,
        sort_order: 51,
        conditional_rule_json: { type: "needs_includes", question_code: "need_areas", option_value: "admin_business" },
        active: true,
      },
      {
        id: "qitem-admin-llc",
        questionnaire_version_id: "qnrver-need-1",
        section_code: "admin_business",
        question_code: "llc_setup_needed",
        label: "LLC 설립이 필요하신가요?",
        help_text: "LLC 필요 여부에 따라 비즈니스 단계의 안내 강도가 달라집니다.",
        input_type: "select",
        placeholder: "",
        required: false,
        sort_order: 52,
        conditional_rule_json: { type: "needs_includes", question_code: "need_areas", option_value: "admin_business" },
        active: true,
      },
    ],
    options_by_item_id: {
      "qitem-need-areas": [
        { id: "qopt-need-arrival", question_item_id: "qitem-need-areas", value: "arrival_setup", label: "미국 입국 준비가 필요해요", sort_order: 0 },
        { id: "qopt-need-housing", question_item_id: "qitem-need-areas", value: "housing", label: "집 구하기가 필요해요", sort_order: 1 },
        { id: "qopt-need-mobility", question_item_id: "qitem-need-areas", value: "mobility", label: "자동차가 필요해요", sort_order: 2 },
        { id: "qopt-need-family", question_item_id: "qitem-need-areas", value: "family_school", label: "아이 학교 등록이 필요해요", sort_order: 3 },
        { id: "qopt-need-admin", question_item_id: "qitem-need-areas", value: "admin_business", label: "생활 행정/LLC 설립이 필요해요", sort_order: 4 },
      ],
      "qitem-arrival-airport": [
        { id: "qopt-yes-a", question_item_id: "qitem-arrival-airport", value: "yes", label: "예", sort_order: 0 },
        { id: "qopt-no-a", question_item_id: "qitem-arrival-airport", value: "no", label: "아니오", sort_order: 1 },
      ],
      "qitem-arrival-phone": [
        { id: "qopt-yes-b", question_item_id: "qitem-arrival-phone", value: "yes", label: "예", sort_order: 0 },
        { id: "qopt-no-b", question_item_id: "qitem-arrival-phone", value: "no", label: "아니오", sort_order: 1 },
      ],
      "qitem-arrival-bank": [
        { id: "qopt-yes-c", question_item_id: "qitem-arrival-bank", value: "yes", label: "예", sort_order: 0 },
        { id: "qopt-no-c", question_item_id: "qitem-arrival-bank", value: "no", label: "아니오", sort_order: 1 },
      ],
      "qitem-housing-rent": [
        { id: "qopt-r1", question_item_id: "qitem-housing-rent", value: "1-3k", label: "$1,000 - $3,000", sort_order: 0 },
        { id: "qopt-r2", question_item_id: "qitem-housing-rent", value: "3-6k", label: "$3,000 - $6,000", sort_order: 1 },
        { id: "qopt-r3", question_item_id: "qitem-housing-rent", value: "6-10k", label: "$6,000 - $10,000", sort_order: 2 },
        { id: "qopt-r4", question_item_id: "qitem-housing-rent", value: "10k+", label: "$10,000+", sort_order: 3 },
      ],
      "qitem-housing-pets": [
        { id: "qopt-y1", question_item_id: "qitem-housing-pets", value: "yes", label: "예", sort_order: 0 },
        { id: "qopt-n1", question_item_id: "qitem-housing-pets", value: "no", label: "아니오", sort_order: 1 },
      ],
      "qitem-housing-video": [
        { id: "qopt-y2", question_item_id: "qitem-housing-video", value: "yes", label: "예", sort_order: 0 },
        { id: "qopt-n2", question_item_id: "qitem-housing-video", value: "no", label: "아니오", sort_order: 1 },
      ],
      "qitem-housing-utility": [
        { id: "qopt-y3", question_item_id: "qitem-housing-utility", value: "yes", label: "예", sort_order: 0 },
        { id: "qopt-n3", question_item_id: "qitem-housing-utility", value: "no", label: "아니오", sort_order: 1 },
      ],
      "qitem-mob-rent-or-buy": [
        { id: "qopt-m1", question_item_id: "qitem-mob-rent-or-buy", value: "rent", label: "렌트", sort_order: 0 },
        { id: "qopt-m2", question_item_id: "qitem-mob-rent-or-buy", value: "buy", label: "구매", sort_order: 1 },
      ],
      "qitem-mob-budget": [
        { id: "qopt-b1", question_item_id: "qitem-mob-budget", value: "1-3k", label: "$1,000 - $3,000", sort_order: 0 },
        { id: "qopt-b2", question_item_id: "qitem-mob-budget", value: "3-6k", label: "$3,000 - $6,000", sort_order: 1 },
        { id: "qopt-b3", question_item_id: "qitem-mob-budget", value: "6-10k", label: "$6,000 - $10,000", sort_order: 2 },
        { id: "qopt-b4", question_item_id: "qitem-mob-budget", value: "10k+", label: "$10,000+", sort_order: 3 },
      ],
      "qitem-mob-kr-license": [
        { id: "qopt-y4", question_item_id: "qitem-mob-kr-license", value: "yes", label: "예", sort_order: 0 },
        { id: "qopt-n4", question_item_id: "qitem-mob-kr-license", value: "no", label: "아니오", sort_order: 1 },
      ],
      "qitem-mob-dmv-support": [
        { id: "qopt-y5", question_item_id: "qitem-mob-dmv-support", value: "yes", label: "예", sort_order: 0 },
        { id: "qopt-n5", question_item_id: "qitem-mob-dmv-support", value: "no", label: "아니오", sort_order: 1 },
      ],
      "qitem-family-grades": [
        { id: "qopt-g1", question_item_id: "qitem-family-grades", value: "k-2", label: "K-2", sort_order: 0 },
        { id: "qopt-g2", question_item_id: "qitem-family-grades", value: "3-5", label: "3-5", sort_order: 1 },
        { id: "qopt-g3", question_item_id: "qitem-family-grades", value: "6-8", label: "6-8", sort_order: 2 },
        { id: "qopt-g4", question_item_id: "qitem-family-grades", value: "9-12", label: "9-12", sort_order: 3 },
        { id: "qopt-g5", question_item_id: "qitem-family-grades", value: "unknown", label: "잘 모르겠어요", sort_order: 4 },
      ],
      "qitem-family-type": [
        { id: "qopt-f1", question_item_id: "qitem-family-type", value: "public", label: "공립", sort_order: 0 },
        { id: "qopt-f2", question_item_id: "qitem-family-type", value: "private", label: "사립", sort_order: 1 },
      ],
      "qitem-family-medical": [
        { id: "qopt-y6", question_item_id: "qitem-family-medical", value: "yes", label: "예", sort_order: 0 },
        { id: "qopt-n6", question_item_id: "qitem-family-medical", value: "no", label: "아니오", sort_order: 1 },
      ],
      "qitem-admin-ssn": [
        { id: "qopt-y7", question_item_id: "qitem-admin-ssn", value: "yes", label: "예", sort_order: 0 },
        { id: "qopt-n7", question_item_id: "qitem-admin-ssn", value: "no", label: "아니오", sort_order: 1 },
      ],
      "qitem-admin-insurance": [
        { id: "qopt-y8", question_item_id: "qitem-admin-insurance", value: "yes", label: "예", sort_order: 0 },
        { id: "qopt-n8", question_item_id: "qitem-admin-insurance", value: "no", label: "아니오", sort_order: 1 },
      ],
      "qitem-admin-llc": [
        { id: "qopt-y9", question_item_id: "qitem-admin-llc", value: "yes", label: "예", sort_order: 0 },
        { id: "qopt-n9", question_item_id: "qitem-admin-llc", value: "no", label: "아니오", sort_order: 1 },
      ],
    },
    submissions: [],
    answers_by_submission: {},
    recommendations_by_submission: {},
    service_selections_by_submission: {},
  },

  async getActiveQuestionnaireVersion() {
    try {
      return await tryBackendGet("/api/surveys/active-questionnaire-version");
    } catch {
      await mockDelay();
      return { questionnaire: this._mock.questionnaire, version: this._mock.version };
    }
  },

  async listQuestionItems(versionId) {
    try {
      return await tryBackendGet(`/api/surveys/questionnaire-versions/${encodeURIComponent(versionId)}/items`);
    } catch {
      await mockDelay();
      return this._mock.items.filter((it) => it.questionnaire_version_id === versionId);
    }
  },

  async listQuestionOptions(itemId) {
    try {
      return await tryBackendGet(`/api/surveys/question-items/${encodeURIComponent(itemId)}/options`);
    } catch {
      await mockDelay();
      return this._mock.options_by_item_id[itemId] || [];
    }
  },

  async startSubmission(payload) {
    try {
      return await tryBackendPost(`/api/surveys/submissions/start`, payload);
    } catch {
      await mockDelay();
      const id = `sub-${Date.now()}`;
      const now = new Date().toISOString();
      const submission = {
        id,
        questionnaire_version_id: payload.questionnaire_version_id,
        customer_id: payload.customer_id,
        status: payload.status || "IN_PROGRESS",
        started_at: payload.started_at || now,
        completed_at: payload.completed_at || null,
        recommendation_snapshot_json: payload.recommendation_snapshot_json || {},
      };
      this._mock.submissions.push(submission);
      this._mock.answers_by_submission[id] = {};
      return submission;
    }
  },

  async listSubmissionAnswers(submissionId) {
    try {
      return await tryBackendGet(`/api/surveys/submissions/${encodeURIComponent(submissionId)}/answers`);
    } catch {
      await mockDelay();
      const byQ = this._mock.answers_by_submission[submissionId] || {};
      return Object.values(byQ);
    }
  },

  async upsertAnswer(submissionId, payload) {
    try {
      return await tryBackendPost(`/api/surveys/submissions/${encodeURIComponent(submissionId)}/answers`, payload);
    } catch {
      await mockDelay();
      const byQ = this._mock.answers_by_submission[submissionId] || (this._mock.answers_by_submission[submissionId] = {});
      const questionItemId = payload.question_item_id;
      const existing = byQ[questionItemId];
      if (existing) {
        existing.answer_json = payload.answer_json || {};
        return existing;
      }
      const answer = {
        id: `ans-${Date.now()}`,
        submission_id: submissionId,
        question_item_id: questionItemId,
        answer_json: payload.answer_json || {},
      };
      byQ[questionItemId] = answer;
      return answer;
    }
  },

  async completeSubmission(submissionId) {
    try {
      return await tryBackendPost(`/api/surveys/submissions/${encodeURIComponent(submissionId)}/complete`, {});
    } catch {
      await mockDelay();
      const byQ = this._mock.answers_by_submission[submissionId] || {};
      const needAns = byQ["qitem-need-areas"] || {};
      const needs = Array.isArray(needAns.values) ? needAns.values : [];

      const packages = [];
      const modules = [];
      const addons = [];

      const addPackage = (pkg) => {
        if (packages.some((p) => p.id === pkg.id)) return;
        packages.push(pkg);
      };
      const addModule = (m) => {
        if (modules.some((x) => x.id === m.id)) return;
        modules.push(m);
      };
      const addAddon = (a) => {
        if (addons.some((x) => x.id === a.id)) return;
        addons.push(a);
      };

      // Base mappings (mirrors backend seed).
      if (needs.includes("arrival_setup")) {
        addPackage({ id: "pkg-arrival-1", code: "pkg-arrival-1", name: "Arrival Setup Package", explanation: "선택하신 입국 준비 필요에 맞춰 추천됩니다." });
        addModule({ id: "mod-arrival-intake", code: "mod-arrival-intake", name: "Arrival intake + checklist", package_id: "pkg-arrival-1", required: true, ai_capable: true, in_person_required: false, explanation: "입국 준비를 시작하기 위한 체크리스트가 필요합니다." });
        addModule({ id: "mod-arrival-actions", code: "mod-arrival-actions", name: "US setup actions guidance", package_id: "pkg-arrival-1", required: true, ai_capable: true, in_person_required: false, explanation: "연락/계좌 같은 초기 설정 흐름을 안내합니다." });

        const airport = byQ["qitem-arrival-airport"]?.value;
        if (airport === "yes") addAddon({ id: "addon-airport-pickup", code: "addon-airport-pickup", name: "Airport pickup coordination", package_id: "pkg-arrival-1", extra_price: 300, currency: "USD", explanation: "공항 픽업이 필요하다고 답해주셨어요." });
        const phone = byQ["qitem-arrival-phone"]?.value;
        if (phone === "yes") addAddon({ id: "addon-us-phone-setup", code: "addon-us-phone-setup", name: "US phone number setup help", package_id: "pkg-arrival-1", extra_price: 250, currency: "USD", explanation: "전화번호가 꼭 필요하다고 답해주셨어요." });
        const bank = byQ["qitem-arrival-bank"]?.value;
        if (bank === "yes") addAddon({ id: "addon-bank-account-setup", code: "addon-bank-account-setup", name: "Bank account setup support", package_id: "pkg-arrival-1", extra_price: 250, currency: "USD", explanation: "은행 계좌 설정이 필요하다고 답해주셨어요." });
      }

      if (needs.includes("housing")) {
        addPackage({ id: "pkg-housing-1", code: "pkg-housing-1", name: "Housing Package", explanation: "집 구하기 필요에 맞춰 추천됩니다." });
        addModule({ id: "mod-housing-budget", code: "mod-housing-budget", name: "Rent budget planning", package_id: "pkg-housing-1", required: true, ai_capable: true, in_person_required: false, explanation: "예산 범위에 맞춰 우선순위를 잡아드립니다." });
        addModule({ id: "mod-housing-search", code: "mod-housing-search", name: "Preferred area + search workflow", package_id: "pkg-housing-1", required: true, ai_capable: true, in_person_required: false, explanation: "선호 지역/우선순위를 바탕으로 탐색 흐름을 설계합니다." });

        const pets = byQ["qitem-housing-pets"]?.value;
        if (pets === "yes") addAddon({ id: "addon-pet-friendly-search", code: "addon-pet-friendly-search", name: "Pet-friendly housing support", package_id: "pkg-housing-1", extra_price: 220, currency: "USD", explanation: "반려동물 조건이 있으셔서, 펫 친화 옵션을 우선으로 안내합니다." });
        const video = byQ["qitem-housing-video"]?.value;
        if (video === "yes") addAddon({ id: "addon-house-video-assist", code: "addon-house-video-assist", name: "House video review assistance", package_id: "pkg-housing-1", extra_price: 280, currency: "USD", explanation: "집 영상을 확인해야 한다고 답해주셨어요." });
        const util = byQ["qitem-housing-utility"]?.value;
        if (util === "yes") addAddon({ id: "addon-utility-setup", code: "addon-utility-setup", name: "Utility setup guidance", package_id: "pkg-housing-1", extra_price: 240, currency: "USD", explanation: "전기/가스/인터넷 같은 공과 설정이 필요하다고 답해주셨어요." });
      }

      if (needs.includes("mobility")) {
        addPackage({ id: "pkg-mobility-1", code: "pkg-mobility-1", name: "Mobility Package", explanation: "이동(차량) 필요에 맞춰 추천됩니다." });
        addModule({ id: "mod-vehicle-plan", code: "mod-vehicle-plan", name: "Vehicle plan + next steps", package_id: "pkg-mobility-1", required: true, ai_capable: true, in_person_required: false, explanation: "렌트/구매에 맞춰 다음 단계 준비를 안내합니다." });
        addModule({ id: "mod-mobility-budget", code: "mod-mobility-budget", name: "Mobility budget guidance", package_id: "pkg-mobility-1", required: true, ai_capable: true, in_person_required: false, explanation: "예산 범위에 맞춰 추천 방향을 조정합니다." });

        const dmv = byQ["qitem-mob-dmv-support"]?.value;
        if (dmv === "yes") addAddon({ id: "addon-dmv-support", code: "addon-dmv-support", name: "DMV procedure support", package_id: "pkg-mobility-1", extra_price: 260, currency: "USD", explanation: "DMV 절차 지원이 필요하다고 답해주셨어요." });
        const lic = byQ["qitem-mob-kr-license"]?.value;
        if (lic === "yes") addAddon({ id: "addon-license-transfer", code: "addon-license-transfer", name: "Driver license transfer support", package_id: "pkg-mobility-1", extra_price: 220, currency: "USD", explanation: "면허 전환 가능성이 있어 준비 흐름을 더 구체화합니다." });
      }

      if (needs.includes("family_school")) {
        addPackage({ id: "pkg-family-1", code: "pkg-family-1", name: "Family/School Package", explanation: "학교/가족 준비 필요에 맞춰 추천됩니다." });
        addModule({ id: "mod-school-registration", code: "mod-school-registration", name: "School registration workflow", package_id: "pkg-family-1", required: true, ai_capable: true, in_person_required: false, explanation: "자녀 수/학년/학교 유형에 맞춰 등록 흐름을 안내합니다." });

        const medical = byQ["qitem-family-medical"]?.value;
        if (medical === "yes") addAddon({ id: "addon-medical-document-support", code: "addon-medical-document-support", name: "Medical document support", package_id: "pkg-family-1", extra_price: 240, currency: "USD", explanation: "의료 문서 지원이 필요하다고 답해주셨어요." });
      }

      if (needs.includes("admin_business")) {
        addPackage({ id: "pkg-admin-1", code: "pkg-admin-1", name: "Admin/Business Package", explanation: "SSN/보험/LLC 같은 행정/비즈니스 준비에 맞춰 추천됩니다." });
        addModule({ id: "mod-admin-core", code: "mod-admin-core", name: "Admin tasks checklist", package_id: "pkg-admin-1", required: true, ai_capable: true, in_person_required: false, explanation: "필수 행정 체크리스트를 기준으로 진행합니다." });

        const ssn = byQ["qitem-admin-ssn"]?.value;
        if (ssn === "yes") addAddon({ id: "addon-ssn-appointment-support", code: "addon-ssn-appointment-support", name: "SSN appointment support", package_id: "pkg-admin-1", extra_price: 280, currency: "USD", explanation: "SSN 예약이 필요하다고 답해주셨어요." });
        const ins = byQ["qitem-admin-insurance"]?.value;
        if (ins === "yes") addAddon({ id: "addon-health-insurance-support", code: "addon-health-insurance-support", name: "Health insurance setup support", package_id: "pkg-admin-1", extra_price: 250, currency: "USD", explanation: "건강보험이 필요하다고 답해주셨어요." });
        const llc = byQ["qitem-admin-llc"]?.value;
        if (llc === "yes") addAddon({ id: "addon-llc-setup-support", code: "addon-llc-setup-support", name: "LLC setup guidance", package_id: "pkg-admin-1", extra_price: 260, currency: "USD", explanation: "LLC 설립이 필요하다고 답해주셨어요." });
      }

      const recommendation = {
        id: `rec-${Date.now()}`,
        submission_id: submissionId,
        recommended_packages_json: { items: packages },
        recommended_modules_json: { items: modules },
        recommended_addons_json: { items: addons },
        reasoning_json: { selected_needs: needs, matched_rule_ids: [] },
        created_at: new Date().toISOString(),
        mocked: true,
      };

      this._mock.recommendations_by_submission[submissionId] = recommendation;
      return { submission: { id: submissionId }, recommendation };
    }
  },

  async getRecommendations(submissionId) {
    try {
      return await tryBackendGet(`/api/surveys/submissions/${encodeURIComponent(submissionId)}/recommendations`);
    } catch {
      await mockDelay();
      return this._mock.recommendations_by_submission[submissionId] || {
        id: `rec-mock-${submissionId}`,
        submission_id: submissionId,
        recommended_packages_json: { items: [] },
        recommended_modules_json: { items: [] },
        recommended_addons_json: { items: [] },
        reasoning_json: { selected_needs: [] },
        created_at: new Date().toISOString(),
        mocked: true,
      };
    }
  },

  async createServiceSelection(submissionId, payload) {
    try {
      return await tryBackendPost(`/api/surveys/submissions/${encodeURIComponent(submissionId)}/service-selection`, payload);
    } catch {
      await mockDelay();
      const selectionId = `sel-${Date.now()}`;
      const rec = this._mock.recommendations_by_submission[submissionId];
      const pkgItems = rec?.recommended_packages_json?.items || [];
      const modItems = rec?.recommended_modules_json?.items || [];
      const addonItems = rec?.recommended_addons_json?.items || [];

      const acceptedSet = new Set(payload.accepted_package_ids || []);
      const selectedPackages = pkgItems.filter((p) => acceptedSet.has(p.id));
      const pkgIdSet = new Set(selectedPackages.map((p) => p.id));
      const selectedModules = modItems.filter((m) => pkgIdSet.has(m.package_id));

      const addonSet = new Set(payload.included_addon_ids || []);
      const selectedAddons = addonItems.filter((a) => addonSet.has(a.id));

      const selection = {
        id: selectionId,
        submission_id: submissionId,
        status: "IN_PROGRESS",
        selected_packages_json: { items: selectedPackages },
        selected_modules_json: { items: selectedModules },
        selected_addons_json: { items: selectedAddons },
        created_at: new Date().toISOString(),
        mocked: true,
      };
      this._mock.service_selections_by_submission[submissionId] = selection;
      return selection;
    }
  },

  async submitQuoteFromSelection(selectionId, payload) {
    try {
      return await tryBackendPost(`/api/surveys/service-selections/${encodeURIComponent(selectionId)}/quote-request`, payload);
    } catch {
      await mockDelay();
      const quoteId = `q-${Date.now()}`;
      return {
        quote: {
          quote_id: quoteId,
          status: "DRAFT",
          service_id: payload?.service_id || "",
          summary: "Mock quote request created from survey selection.",
          request_details: payload || {},
          mocked: true,
        },
      };
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
  serviceCatalogAdminApi,
  surveyBuilderAdminApi,
  surveyCustomerApi,
  paymentApi,
  emailLogsApi,
  aiApi,
};
