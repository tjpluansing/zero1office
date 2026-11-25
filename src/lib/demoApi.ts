/**
 * In-browser stand-in for Supabase so the screens can be clicked through
 * before the real project exists (VITE_DEMO_MODE=true, or no Supabase URL).
 * It copies the database rules closely enough to show the same messages,
 * but it is NOT security: everything here lives in the browser.
 */
import type { Api, AuthEvent } from "./api";
import { computeEffective } from "./permissions";
import type {
  AccessReviewData, IntegrationEvent, IntegrationRow, IntegrationRun, Policy,
  Access, Action, AuditRow, Catalog, ClientRow, Override, Permission, UserRow, UserStatus,
  FollowupEvent, FollowupRow, FollowupSettings,
} from "./types";
import {
  CLOSED, DEFAULT_SETTINGS, MINIMAL_TEXT_ERROR, addBusinessDays, afterChase, daysBetween, hasLongNumber, todayIso,
} from "./followups";

const P = (page: string, page_label: string, action: Action, description: string, sort: number): Permission =>
  ({ key: `${page}.${action}`, page, page_label, action, description, sort });

const permissions: Permission[] = [
  P("dashboard", "Dashboard", "view", "Open the dashboard", 10),
  P("clients", "Client Masterlist", "view", "See clients", 20),
  P("clients", "Client Masterlist", "create", "Add clients", 21),
  P("clients", "Client Masterlist", "edit", "Edit clients", 22),
  P("clients", "Client Masterlist", "delete", "Delete clients", 23),
  P("clients", "Client Masterlist", "export", "Export the client list", 24),
  P("quotes", "Quoting & Proposals", "view", "See quotes and proposals", 30),
  P("quotes", "Quoting & Proposals", "create", "Draft quotes", 31),
  P("quotes", "Quoting & Proposals", "edit", "Edit quotes", 32),
  P("quotes", "Quoting & Proposals", "delete", "Delete quotes", 33),
  P("quotes", "Quoting & Proposals", "export", "Export quotes / PDFs", 34),
  P("quotes", "Quoting & Proposals", "approve", "Approve a quote before it goes to a client", 35),
  P("billing", "Billing & SOA", "view", "See billing and statements of account", 40),
  P("billing", "Billing & SOA", "create", "Create statements", 41),
  P("billing", "Billing & SOA", "edit", "Edit statements", 42),
  P("billing", "Billing & SOA", "delete", "Delete statements", 43),
  P("billing", "Billing & SOA", "export", "Export statements", 44),
  P("billing", "Billing & SOA", "approve", "Approve a statement before sending", 45),
  P("followups", "Follow-ups", "view", "See the follow-up queue", 46),
  P("followups", "Follow-ups", "create", "Add pending items to chase", 47),
  P("followups", "Follow-ups", "edit", "Log chases, mark received, escalate to Karla", 48),
  P("followups", "Follow-ups", "delete", "Delete follow-up items", 49),
  P("followups", "Follow-ups", "export", "Export the follow-up queue", 49),
  P("followups", "Follow-ups", "approve", "Waive or cancel a requirement, reopen a waived item", 49),
  P("reports", "Reports", "view", "See reports", 50),
  P("reports", "Reports", "export", "Export reports", 51),
  P("admin_users", "Manage Users", "view", "See the user directory", 60),
  P("admin_users", "Manage Users", "create", "Invite or create users", 61),
  P("admin_users", "Manage Users", "edit", "Change roles, permissions, suspend", 62),
  P("admin_users", "Manage Users", "delete", "Delete users", 63),
  P("admin_settings", "Admin Settings", "view", "See app settings", 70),
  P("admin_settings", "Admin Settings", "edit", "Change app settings", 71),
  P("integrations", "Integrations", "view", "See connected services and their status", 75),
  P("integrations", "Integrations", "edit", "Connect, change keys, test or disconnect services", 76),
  P("audit_log", "Audit Log", "view", "See the audit log", 80),
  P("audit_log", "Audit Log", "export", "Export the audit log", 81),
];

const catalog: Catalog = {
  permissions,
  roles: [
    { id: "super_admin", name: "Super Admin", description: "Everything, including users and settings. Cannot be locked out.", is_super: true, sort: 10 },
    { id: "agent", name: "Agent", description: "Licensed agent: all client, quoting, billing and report work, including approvals.", is_super: false, sort: 20 },
    { id: "assistant", name: "Assistant", description: "Follows up pending items: works the follow-up queue, adds and updates clients, drafts quotes, sees billing status. No approvals, deletes, exports, reports or admin.", is_super: false, sort: 30 },
    { id: "no_access", name: "No access", description: "Signed in but waiting for an admin to grant access.", is_super: false, sort: 99 },
  ],
  rolePermissions: {
    super_admin: [],
    agent: permissions
      .filter((p) => ["dashboard", "clients", "quotes", "billing", "followups", "reports"].includes(p.page) || p.key === "audit_log.view")
      .map((p) => p.key),
    assistant: ["dashboard.view", "clients.view", "clients.create", "clients.edit", "quotes.view", "quotes.create",
      "quotes.edit", "billing.view", "followups.view", "followups.create", "followups.edit"],
    no_access: [],
  },
};

interface DemoUser extends Omit<UserRow, "override_count"> { overrides: Override[]; policy: string | null; mfa: boolean }
interface DemoState {
  users: DemoUser[]; clients: ClientRow[]; audit: AuditRow[]; sessionUserId: string | null; aal: "aal1" | "aal2";
  integrations: (IntegrationRow & { secret: string | null })[];
  reviews: { id: number; reviewed_at: string; reviewer_email: string | null; notes: string }[];
  events: IntegrationEvent[];
  runs: IntegrationRun[];
  followups: FollowupRow[];
  followupEvents: FollowupEvent[];
  followupSettings: FollowupSettings;
}

const POLICY: Policy = {
  version: "2026-11-24",
  title: "Acceptable Use and Privacy Agreement",
  published_at: "2026-11-24T00:00:00Z",
  body_markdown: [
    "By using zero1office you agree to the following. Ask Karla follows the Data Privacy Act of 2012 and the National Privacy Commission's rules on the security of personal data.",
    "**1. Need to know.** Open, copy or export client information only when your current task needs it.",
    "**2. Your account is yours alone.** Do not share your password or two-step codes. Lock or sign out when you step away.",
    "**3. Passwords.** At least 12 characters, not used on any other site, kept in the company password manager.",
    "**4. Keep data inside approved tools.** No client details in personal email, chat apps, cloud storage or public AI tools.",
    "**5. Exports and downloads.** Export only what you need and delete files once done. Every export is logged.",
    "**6. Documents stay with insurers.** Do not keep copies of IDs, medical or financial documents after submission.",
    "**7. Devices.** Screen lock and current updates. Report a lost device to Paolo the same day.",
    "**8. Report problems right away.** Tell Paolo and the Data Protection Officer within 24 hours.",
    "**9. Monitoring.** Sign-ins, changes and exports are recorded and reviewed.",
    "**10. Consequences.** Breaking these rules can lead to loss of access and disciplinary action.",
  ].join("\n\n"),
};
const sensitive = (k: string) => /^(admin_users|admin_settings|integrations)\./.test(k) || k.endsWith(".export");

const KEY = "z1-demo-state-v4";
const hoursAgo = (h: number) => new Date(Date.now() - h * 3600_000).toISOString();
const ev = (id: number, event_type: string, summary: string | null, status: IntegrationEvent["status"], attempts: number,
  x: { result?: string; last_error?: string; next?: number; by?: IntegrationEvent["verified_by"] } = {}): IntegrationEvent => ({
  id, event_type, summary, status, attempts, verified_by: x.by ?? "ghl_signature",
  received_at: hoursAgo(6 - id * 0.9), processed_at: status === "retrying" ? null : hoursAgo(6 - id * 0.9),
  next_attempt_at: hoursAgo(x.next ?? 6 - id * 0.9), last_error: x.last_error ?? null, result: x.result ?? null, client_id: null,
});

function seed(): DemoState {
  const u = (id: string, email: string, full_name: string, role_id: string, status: UserStatus,
    last: number | null, extra: Partial<DemoUser> = {}): DemoUser => ({
    id, email, full_name, role_id, status, must_change_password: false,
    last_login_at: last === null ? null : hoursAgo(last), created_at: hoursAgo(400), overrides: [],
    policy: POLICY.version, mfa: false, ...extra,
  });
  return {
    sessionUserId: null,
    aal: "aal1",
    reviews: [],
    integrations: ([["ghl", "GoHighLevel"], ["m365", "Microsoft 365"], ["anthropic", "Claude API"]] as const).map(([id, name]) => ({
      id, name, enabled: false, config: {}, secret: null, secret_hint: null, status: "not_connected" as const,
      last_tested_at: null, last_test_ok: null, last_error: null, last_details: {}, secret_set_at: null,
      updated_at: hoursAgo(1), webhook_secret_hint: null, webhook_secret_set_at: null, last_event_at: null,
    })),
    // Sample GHL webhook traffic so the Sync Log has something to show.
    events: [
      ev(6, "ContactCreate", "Rica M.", "retrying", 2, { last_error: "could not serialize access due to concurrent update", next: -0.2 }),
      ev(5, "ContactCreate", null, "failed", 1, { last_error: "Contact has no name, email or phone" }),
      ev(4, "InboundMessage", null, "ignored", 1, { result: "ignored: not handled yet" }),
      ev(3, "ContactUpdate", "Ana R.", "done", 1, { result: "Updated client" }),
      ev(2, "ContactUpsert", "Jose L.", "done", 1, { result: "Added client", by: "webhook_secret" }),
      ev(1, "ContactCreate", "Mark S.", "done", 1, { result: "Added client" }),
    ],
    runs: [
      { id: 3, trigger: "schedule", started_at: hoursAgo(0.3), finished_at: hoursAgo(0.3), processed: 1, succeeded: 0, ignored: 0, will_retry: 1, failed: 0 },
      { id: 2, trigger: "webhook", started_at: hoursAgo(0.5), finished_at: hoursAgo(0.5), processed: 3, succeeded: 1, ignored: 1, will_retry: 1, failed: 0 },
      { id: 1, trigger: "webhook", started_at: hoursAgo(5), finished_at: hoursAgo(5), processed: 3, succeeded: 2, ignored: 0, will_retry: 0, failed: 1 },
    ],
    users: [
      u("u-paolo", "paolo@ask-karla.com", "Paolo", "super_admin", "active", 0.2, { must_change_password: true, policy: null }),
      u("u-karla", "karla@ask-karla.com", "Karla", "agent", "active", 3, {
        overrides: [{ permission_key: "admin_users.view", effect: "grant" }],
      }),
      u("u-assistant", "assistant@ask-karla.com", "New Assistant", "assistant", "active", null, {
        overrides: [{ permission_key: "clients.export", effect: "grant" }],
      }),
      u("u-ojt", "ojt@ask-karla.com", "OJT Trainee", "assistant", "suspended", 300),
      u("u-ms", "marketing@ask-karla.com", "", "no_access", "pending", null),
    ],
    clients: [
      { id: "c1", full_name: "Juan Dela Cruz", company: "Dela Cruz Trading", email: "juan@example.com", phone: "0917 000 0001", insurer: "Maxicare", product: "HMO – Corporate", status: "active", created_at: hoursAgo(200) },
      { id: "c2", full_name: "Ana Reyes", company: null, email: "ana@example.com", phone: "0917 000 0002", insurer: "FWD", product: "Life – Set for Life", status: "applying", created_at: hoursAgo(90) },
      { id: "c3", full_name: "Mark Santos", company: "Santos Bakery", email: null, phone: "0917 000 0003", insurer: "Oona", product: "Non-Life – Fire", status: "lead", created_at: hoursAgo(20) },
    ],
    audit: [],
    ...seedFollowups(),
  };
}

function seedFollowups(): Pick<DemoState, "followups" | "followupEvents" | "followupSettings"> {
  const t = todayIso();
  const d = (n: number) => {
    if (n >= 0) return addBusinessDays(t, n);
    const x = new Date(`${t}T12:00:00`);
    x.setDate(x.getDate() + n);
    return x.toISOString().slice(0, 10);
  };
  const base = { reference: null, felix_drafts: true, assignee_id: "u-assistant", notes: null, ghl_link: null,
    escalation_reason: null, last_chased_at: null, closed_at: null, attempts: 0, created_at: hoursAgo(72), updated_at: hoursAgo(5) };
  const followups: FollowupRow[] = [
    { ...base, id: "f1", title: "Signed application form", kind: "signature", party: "client", client_id: "c2",
      insurer: "FWD", channel: "viber", status: "waiting", due_on: d(4), next_chase_on: t, attempts: 1, last_chased_at: hoursAgo(50) },
    { ...base, id: "f2", title: "Proof of payment", kind: "payment", party: "client", client_id: "c1",
      insurer: "Maxicare", channel: "email", status: "escalated", due_on: d(-1), next_chase_on: d(-1), attempts: 3,
      last_chased_at: hoursAgo(26), escalation_reason: "No reply after 3 follow-ups" },
    { ...base, id: "f3", title: "Insurer reply on application", kind: "insurer_reply", party: "insurer", client_id: "c2",
      insurer: "FWD", reference: "APP-2026-118", channel: "email", status: "open", due_on: d(-1), next_chase_on: t },
    { ...base, id: "f4", title: "Census / employee list for group quote", kind: "document", party: "client", client_id: "c3",
      insurer: null, channel: "messenger", status: "open", due_on: d(8), next_chase_on: d(2) },
    { ...base, id: "f5", title: "Official receipt from insurer", kind: "insurer_reply", party: "insurer", client_id: "c1",
      insurer: "Maxicare", channel: "email", status: "waiting", due_on: null, next_chase_on: d(1), attempts: 1, last_chased_at: hoursAgo(20) },
    { ...base, id: "f6", title: "Health declaration form", kind: "document", party: "client", client_id: "c2",
      insurer: "FWD", channel: "email", status: "done", due_on: d(-3), next_chase_on: d(-3), attempts: 2,
      last_chased_at: hoursAgo(80), closed_at: hoursAgo(30) },
  ];
  const ev = (id: number, followup_id: string, h: number, actor_label: string, kind: FollowupEvent["kind"],
    x: Partial<FollowupEvent> = {}): FollowupEvent =>
    ({ id, followup_id, at: hoursAgo(h), actor_label, kind, channel: null, note: null, details: {}, ...x });
  const followupEvents: FollowupEvent[] = [
    ev(9, "f6", 30, "assistant@ask-karla.com", "status", { details: { from: "waiting", to: "done" }, note: null }),
    ev(8, "f2", 26, "assistant@ask-karla.com", "chased", { channel: "phone", note: "Client asked for the SOA again", details: { attempt: 3, drafted_by: "Felix" } }),
    ev(7, "f2", 26, "assistant@ask-karla.com", "escalated", { details: { from: "waiting", to: "escalated", reason: "No reply after 3 follow-ups" } }),
    ev(6, "f5", 20, "assistant@ask-karla.com", "chased", { channel: "email", details: { attempt: 1, drafted_by: "Felix" } }),
    ev(5, "f1", 50, "assistant@ask-karla.com", "chased", { channel: "viber", details: { attempt: 1, drafted_by: "Felix" } }),
    ev(4, "f2", 75, "assistant@ask-karla.com", "chased", { channel: "email", details: { attempt: 2, drafted_by: "Felix" } }),
    ev(3, "f2", 120, "assistant@ask-karla.com", "chased", { channel: "email", details: { attempt: 1, drafted_by: "Felix" } }),
    ...followups.map((f, i) => ev(-i - 1, f.id, 140, "karla@ask-karla.com", "created", { details: { title: f.title, party: f.party } })),
  ];
  return { followups, followupEvents, followupSettings: { ...DEFAULT_SETTINGS } };
}

export function createDemoApi(): Api {
  let state: DemoState;
  try {
    state = JSON.parse(localStorage.getItem(KEY) ?? "") as DemoState;
    if (!state?.users || !state.reviews || !state.integrations || !state.events || !state.followups) throw new Error();
  } catch {
    state = seed();
  }
  const listeners = new Set<(e: AuthEvent) => void>();
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* private mode */ } };
  const wait = () => new Promise((r) => setTimeout(r, 120));
  const me = () => state.users.find((u) => u.id === state.sessionUserId) ?? null;
  const isSuper = (u: DemoUser | null) => !!u && u.status === "active" && u.role_id === "super_admin";
  const effective = (u: DemoUser | null) =>
    !u || u.status !== "active" || u.must_change_password || u.policy !== POLICY.version
      ? new Set<string>() : computeEffective(catalog, u.role_id, u.overrides);
  const session = () => new Set([...effective(me())].filter((k) => !sensitive(k) || state.aal === "aal2"));
  const can = (k: string) => session().has(k);
  const need = (k: string) => { if (!can(k)) throw new Error(`You do not have permission (${k})`); };
  const target = (id: string) => {
    const t = state.users.find((u) => u.id === id);
    if (!t) throw new Error("User not found");
    return t;
  };
  const guardTarget = (t: DemoUser) => {
    if (t.id === state.sessionUserId) throw new Error("You cannot do this to your own account (self-lockout protection)");
    if (t.role_id === "super_admin" && !isSuper(me())) throw new Error("Only a Super Admin can manage a Super Admin");
  };
  const otherSupers = (id: string) => state.users.filter((u) => u.id !== id && isSuper(u)).length;
  const log = (action: string, target_id: string | null, details: Record<string, unknown> = {}, target_type = "user") => {
    state.audit.unshift({ id: state.audit.length + 1, at: new Date().toISOString(), actor_email: me()?.email ?? null,
      action, target_type, target_id, details });
  };
  const followup = (id: string) => {
    const f = state.followups.find((x) => x.id === id);
    if (!f) throw new Error("Follow-up not found");
    return f;
  };
  const fev = (followup_id: string, kind: FollowupEvent["kind"], x: Partial<FollowupEvent> = {}, actor?: string) => {
    const id = Math.max(0, ...state.followupEvents.map((e) => e.id)) + 1;
    state.followupEvents.push({ id, followup_id, at: new Date().toISOString(), actor_label: actor ?? me()?.email ?? "system",
      kind, channel: null, note: null, details: {}, ...x });
  };
  const emit = (e: AuthEvent) => listeners.forEach((l) => l(e));
  const temp = () => Math.random().toString(36).slice(2, 10) + "-Z1!";

  return {
    mode: "demo",
    async hasSession() { return !!me(); },
    onAuthChange(cb) { listeners.add(cb); return () => { listeners.delete(cb); }; },
    async signInWithPassword(email, password) {
      await wait();
      const u = state.users.find((x) => x.email === email.trim().toLowerCase());
      if (!u || password !== "demo") throw new Error("Invalid login credentials");
      if (u.status === "suspended") throw new Error("User is banned");
      state.sessionUserId = u.id;
      state.aal = "aal1";
      u.last_login_at = new Date().toISOString();
      log("user.login", u.id);
      save(); emit("SIGNED_IN");
    },
    async signInWithMicrosoft() {
      throw new Error("Microsoft sign-in works once Supabase is connected. In the demo, use a password.");
    },
    async signOut() { state.sessionUserId = null; state.aal = "aal1"; save(); emit("SIGNED_OUT"); },
    async sendPasswordReset() { await wait(); },
    async updatePassword(pw) {
      await wait();
      const u = me();
      if (!u) throw new Error("Not signed in");
      if (pw === "demo") throw new Error("Choose a new password first");
      u.must_change_password = false;
      log("password.changed", u.id);
      save();
    },
    async getAccess(): Promise<Access | null> {
      const u = me();
      if (!u) return null;
      const role = catalog.roles.find((r) => r.id === u.role_id)!;
      const sess = session();
      return { id: u.id, email: u.email, full_name: u.full_name, role_id: u.role_id, role_name: role.name,
        is_super: isSuper(u), status: u.status, must_change_password: u.must_change_password,
        policy_required: u.policy === POLICY.version ? null : POLICY.version, aal: state.aal, mfa_enrolled: u.mfa,
        last_login_at: u.last_login_at, idle_minutes: 30, permissions: [...sess].sort(),
        mfa_locked: [...effective(u)].filter((k) => !sess.has(k)).sort() };
    },
    async getPolicy() { return POLICY; },
    async acceptPolicy(version) {
      const u = me();
      if (!u) throw new Error("Not signed in");
      if (version !== POLICY.version) throw new Error("That agreement is out of date. Reload the page.");
      u.policy = version;
      log("policy.accepted", u.id, { version }, "policy");
      save();
    },
    async mfaEnroll() {
      await wait();
      return { factorId: "demo-factor", secret: "JBSWY3DPEHPK3PXP",
        qrSvg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 29 29" shape-rendering="crispEdges"><rect width="29" height="29" fill="#fff"/>${
          Array.from({ length: 29 * 29 }, (_, i) => ((i * 7919) % 13 < 6 ? `<rect x="${i % 29}" y="${Math.floor(i / 29)}" width="1" height="1"/>` : "")).join("")}</svg>` };
    },
    async mfaVerify(code) {
      await wait();
      const u = me();
      if (!u) throw new Error("Not signed in");
      if (code !== "123456") throw new Error("Invalid TOTP code entered");
      if (!u.mfa) log("mfa.enrolled", u.id);
      u.mfa = true;
      state.aal = "aal2";
      save();
    },
    async resetMfa(id) {
      need("admin_users.edit");
      const t = target(id);
      guardTarget(t);
      t.mfa = false;
      log("mfa.reset_by_admin", id, { email: t.email });
      save();
    },
    async listIntegrations() {
      need("integrations.view");
      return state.integrations.map(({ secret: _s, ...r }) => r);
    },
    async saveIntegration(id, config, secret, enabled) {
      await wait();
      need("integrations.edit");
      const r = state.integrations.find((x) => x.id === id)!;
      const key = secret?.trim() || null;
      if (key && key.length < 16) throw new Error("That key looks too short. Paste the whole value.");
      const changed = JSON.stringify(config) !== JSON.stringify(r.config);
      if (key) { r.secret = key; r.secret_hint = key.slice(-4); r.secret_set_at = new Date().toISOString(); }
      r.config = config;
      r.enabled = enabled;
      r.status = !r.secret ? "not_connected" : !enabled ? "paused" : key || changed || r.status === "paused" ? "untested" : r.status;
      if (key || changed) r.last_error = "Not tested since the last change";
      log("integration.updated", null, { integration: id, key_replaced: !!key }, "integration");
      save();
    },
    async testIntegration(id) {
      await new Promise((res) => setTimeout(res, 700));
      need("integrations.edit");
      const r = state.integrations.find((x) => x.id === id)!;
      const missing = id === "ghl" ? !r.config.location_id : id === "m365" ? !r.config.tenant_id || !r.config.client_id : false;
      const result = !r.secret ? { ok: false, error: "No key saved yet." }
        : missing ? { ok: false, error: "Fill in the required IDs first." }
        : { ok: true, details: id === "ghl" ? { account: "Ask Karla (demo)", timezone: "Asia/Manila" }
            : id === "m365" ? { token: "ok", mailbox: r.config.mailbox || null } : { models: ["claude-sonnet-5-5", "claude-haiku-5-5"] } };
      r.last_tested_at = new Date().toISOString();
      r.last_test_ok = result.ok;
      r.last_error = result.ok ? null : result.error!;
      r.last_details = result.details ?? {};
      r.status = !r.enabled ? "paused" : result.ok ? "connected" : "error";
      log("integration.tested", null, { integration: id, ok: result.ok }, "integration");
      save();
      return result;
    },
    async disconnectIntegration(id) {
      need("integrations.edit");
      const r = state.integrations.find((x) => x.id === id)!;
      Object.assign(r, { secret: null, secret_hint: null, secret_set_at: null, enabled: false, status: "not_connected",
        last_error: null, last_test_ok: null });
      log("integration.disconnected", null, { integration: id }, "integration");
      save();
    },
    webhookUrl: () => null,
    async newWebhookSecret(id) {
      await wait();
      need("integrations.edit");
      const r = state.integrations.find((x) => x.id === id)!;
      const secret = "whsec_" + Array.from(crypto.getRandomValues(new Uint8Array(32)), (b) => b.toString(16).padStart(2, "0")).join("");
      r.webhook_secret_hint = secret.slice(-4);
      r.webhook_secret_set_at = new Date().toISOString();
      log("integration.webhook_secret", id, { integration: id }, "integration");
      save();
      return secret;
    },
    async getSyncLog() {
      need("integrations.view");
      return { events: state.events, runs: state.runs };
    },
    async retryEvent(eventId) {
      await wait();
      need("integrations.edit");
      const e = state.events.find((x) => x.id === eventId)!;
      if (e.status !== "failed" && e.status !== "retrying") throw new Error("Only failed or waiting events can be retried");
      log("integration.event_retried", "ghl", { integration: "ghl", event: eventId }, "integration");
      const ok = !!e.summary; // the demo's "no name" event still fails
      Object.assign(e, ok
        ? { status: "done", result: "Added client", last_error: null, attempts: e.attempts + 1, processed_at: new Date().toISOString() }
        : { status: "failed", attempts: 1, processed_at: new Date().toISOString() });
      state.runs.unshift({ id: state.runs.length + 1, trigger: "manual", started_at: new Date().toISOString(),
        finished_at: new Date().toISOString(), processed: 1, succeeded: ok ? 1 : 0, ignored: 0, will_retry: 0, failed: ok ? 0 : 1 });
      save();
    },
    async getAccessReview(): Promise<AccessReviewData> {
      need("admin_users.view");
      return {
        review_days: 30,
        last_review: state.reviews[0] ?? null,
        users: state.users.map((u) => ({ id: u.id, email: u.email, full_name: u.full_name, role_id: u.role_id,
          status: u.status, last_login_at: u.last_login_at, created_at: u.created_at, mfa: u.mfa,
          overrides: u.overrides.length,
          permissions: u.status === "active" ? [...computeEffective(catalog, u.role_id, u.overrides)].sort() : [] })),
      };
    },
    async completeAccessReview(notes) {
      need("admin_users.edit");
      state.reviews.unshift({ id: state.reviews.length + 1, reviewed_at: new Date().toISOString(),
        reviewer_email: me()?.email ?? null, notes });
      log("access_review.completed", null, { users: state.users.length, notes }, "access_review");
      save();
    },

    async getCatalog() { return catalog; },
    async listUsers() {
      await wait();
      need("admin_users.view");
      return state.users.map(({ overrides, ...u }) => ({ ...u, override_count: overrides.length }));
    },
    async getOverrides(id) { return [...target(id).overrides]; },
    async updateUser(id, patch) {
      need("admin_users.edit");
      const t = target(id);
      if (t.id === state.sessionUserId && patch.role_id !== t.role_id)
        throw new Error("You cannot change your own role or status (self-lockout protection)");
      if ((t.role_id === "super_admin" || patch.role_id === "super_admin") && !isSuper(me()) &&
          (patch.role_id !== t.role_id || patch.full_name !== t.full_name))
        throw new Error("Only a Super Admin can change a Super Admin or grant that role");
      if (t.role_id === "super_admin" && patch.role_id !== "super_admin" && otherSupers(t.id) === 0)
        throw new Error("At least one active Super Admin must remain");
      const changes: Record<string, unknown> = {};
      if (patch.role_id !== t.role_id) changes.role_id = { from: t.role_id, to: patch.role_id };
      if (patch.full_name !== t.full_name) changes.full_name = { from: t.full_name, to: patch.full_name };
      Object.assign(t, patch);
      if (Object.keys(changes).length) log("user.updated", t.id, { ...changes, email: t.email });
      save();
    },
    async setOverrides(id, overrides) {
      need("admin_users.edit");
      const t = target(id);
      const before = JSON.stringify(t.overrides);
      if (before === JSON.stringify(overrides)) return;
      guardTarget(t);
      if (!isSuper(me())) for (const o of overrides)
        if (o.effect === "grant" && !can(o.permission_key)) throw new Error(`You cannot grant ${o.permission_key} because you do not have it`);
      t.overrides = overrides;
      log("permission.update", t.id, { overrides: overrides.length, email: t.email });
      save();
    },
    async createUser(input) {
      await wait();
      need("admin_users.create");
      const email = input.email.trim().toLowerCase();
      if (!email.endsWith("@ask-karla.com")) throw new Error("Sign-in is limited to ask-karla.com");
      if (state.users.some((u) => u.email === email)) throw new Error("A user with this email address has already been registered");
      if (input.role_id === "super_admin" && !isSuper(me())) throw new Error("Only a Super Admin can grant the Super Admin role");
      const id = `u-${Date.now()}`;
      const temp_password = input.mode === "temp_password" ? temp() : undefined;
      state.users.push({ id, email, full_name: input.full_name, role_id: input.role_id, status: "active",
        must_change_password: input.mode === "temp_password", last_login_at: null,
        created_at: new Date().toISOString(), overrides: input.overrides, policy: null, mfa: false });
      log("user.created", id, { email, role: input.role_id, via: input.mode });
      save();
      return { user_id: id, temp_password };
    },
    async setStatus(id, status) {
      await wait();
      need("admin_users.edit");
      const t = target(id);
      guardTarget(t);
      if (t.role_id === "super_admin" && status !== "active" && otherSupers(t.id) === 0)
        throw new Error("At least one active Super Admin must remain");
      log("user.updated", t.id, { status: { from: t.status, to: status }, email: t.email });
      t.status = status;
      save();
    },
    async deleteUser(id) {
      await wait();
      need("admin_users.delete");
      const t = target(id);
      guardTarget(t);
      if (t.role_id === "super_admin" && otherSupers(t.id) === 0) throw new Error("At least one active Super Admin must remain");
      state.users = state.users.filter((u) => u.id !== id);
      log("user.deleted", id, { email: t.email });
      save();
    },
    async resetPassword(id, mode) {
      await wait();
      need("admin_users.edit");
      const t = target(id);
      guardTarget(t);
      if (mode === "email") { log("password.reset_email_sent", id, { email: t.email }); save(); return {}; }
      t.must_change_password = true;
      log("password.reset_by_admin", id, { email: t.email });
      save();
      return { temp_password: temp() };
    },
    async listAudit() { need("audit_log.view"); return state.audit.slice(0, 200); },
    async exportAudit() { need("audit_log.export"); return state.audit; },

    async listClients() { need("clients.view"); return [...state.clients].sort((a, b) => a.full_name.localeCompare(b.full_name)); },
    async saveClient(row) {
      if (row.id) {
        need("clients.edit");
        const c = state.clients.find((x) => x.id === row.id);
        if (c) Object.assign(c, row);
      } else {
        need("clients.create");
        state.clients.push({ company: null, email: null, phone: null, insurer: null, product: null, status: "lead",
          ...row, id: `c-${Date.now()}`, created_at: new Date().toISOString() } as ClientRow);
      }
      save();
    },
    async deleteClient(id) { need("clients.delete"); state.clients = state.clients.filter((c) => c.id !== id); save(); },
    async exportClients() { need("clients.export"); log("export", null, { rows: state.clients.length }, "clients"); save(); return state.clients; },

    async listFollowups() {
      need("followups.view");
      // same overdue sweep the database runs on a schedule
      const today = todayIso();
      for (const f of state.followups) {
        if ((f.status === "open" || f.status === "waiting") && f.due_on
          && daysBetween(f.due_on, today) >= state.followupSettings.escalate_overdue_days) {
          const reason = `${daysBetween(f.due_on, today)} days past the due date`;
          fev(f.id, "escalated", { details: { from: f.status, to: "escalated", reason } }, "system");
          Object.assign(f, { status: "escalated", escalation_reason: reason });
          save();
        }
      }
      return state.followups.map((f) => ({ ...f }));
    },
    async listFollowupEvents(id) {
      need("followups.view");
      return state.followupEvents.filter((e) => e.followup_id === id).sort((a, b) => b.at.localeCompare(a.at));
    },
    async getFollowupSettings() { need("followups.view"); return { ...state.followupSettings }; },
    async saveFollowup(row) {
      await wait();
      if ([row.title, row.notes].some(hasLongNumber)) throw new Error(MINIMAL_TEXT_ERROR);
      if (row.title.trim().length < 3) throw new Error("Describe what is pending (at least 3 characters)");
      if (row.party === "insurer" && !row.insurer) throw new Error("Pick the insurer we are waiting on");
      if (row.party !== "insurer" && !row.client_id && !row.id) throw new Error("Pick the client we are waiting on");
      if (row.id) {
        need("followups.edit");
        const f = followup(row.id);
        Object.assign(f, row, { updated_at: new Date().toISOString() });
        fev(f.id, "edited");
      } else {
        need("followups.create");
        const id = `f-${Date.now()}`;
        state.followups.push({
          kind: "document", party: "client", client_id: null, insurer: null, reference: null, channel: "email",
          due_on: null, next_chase_on: todayIso(), felix_drafts: true, notes: null, ghl_link: null,
          ...row, id, status: "open", attempts: 0, last_chased_at: null, escalation_reason: null,
          assignee_id: state.sessionUserId, created_at: new Date().toISOString(), updated_at: new Date().toISOString(), closed_at: null,
        });
        fev(id, "created", { details: { title: row.title, party: row.party ?? "client" } });
      }
      save();
    },
    async logFollowupChase(id, channel, note, fromFelix) {
      await wait();
      need("followups.edit");
      if (hasLongNumber(note)) throw new Error(MINIMAL_TEXT_ERROR);
      const f = followup(id);
      if (CLOSED.includes(f.status)) throw new Error("This item is already closed");
      const next = afterChase(f, state.followupSettings, channel);
      fev(id, "chased", { channel, note, details: { attempt: next.attempts, drafted_by: fromFelix ? "Felix" : null } });
      if (next.status === "escalated" && f.status !== "escalated")
        fev(id, "escalated", { details: { from: f.status, to: "escalated", reason: next.escalation_reason } });
      Object.assign(f, next, { updated_at: new Date().toISOString() });
      save();
    },
    async setFollowupStatus(id, status, note) {
      await wait();
      need("followups.edit");
      if (hasLongNumber(note)) throw new Error(MINIMAL_TEXT_ERROR);
      const f = followup(id);
      if (status === f.status) return;
      if ((status === "waived" || status === "cancelled") && !can("followups.approve"))
        throw new Error("Only Karla can waive or cancel a requirement. Escalate it instead.");
      if ((f.status === "waived" || f.status === "cancelled") && !can("followups.approve"))
        throw new Error("Only Karla can reopen a waived or cancelled item.");
      const reason = status === "escalated" ? (note?.trim() || `Escalated by ${me()?.email}`) : null;
      fev(id, status === "escalated" ? "escalated" : "status", { details: { from: f.status, to: status, reason } });
      if (note?.trim() && status !== "escalated") fev(id, "note", { note });
      const closed = CLOSED.includes(status);
      Object.assign(f, {
        status,
        escalation_reason: status === "escalated" ? reason : closed ? f.escalation_reason : null,
        closed_at: closed ? new Date().toISOString() : null,
        next_chase_on: !closed && f.next_chase_on < todayIso() ? todayIso() : f.next_chase_on,
        updated_at: new Date().toISOString(),
      });
      save();
    },
    async addFollowupNote(id, note) {
      need("followups.edit");
      if (hasLongNumber(note)) throw new Error(MINIMAL_TEXT_ERROR);
      followup(id);
      fev(id, "note", { note: note.slice(0, 500) });
      save();
    },
    async deleteFollowup(id) {
      need("followups.delete");
      state.followups = state.followups.filter((f) => f.id !== id);
      state.followupEvents = state.followupEvents.filter((e) => e.followup_id !== id);
      save();
    },
    async exportFollowups() {
      need("followups.export");
      log("export", null, { rows: state.followups.length }, "followups");
      save();
      return state.followups;
    },
  };
}
