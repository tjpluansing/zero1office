/**
 * In-browser stand-in for Supabase so the screens can be clicked through
 * before the real project exists (VITE_DEMO_MODE=true, or no Supabase URL).
 * It copies the database rules closely enough to show the same messages,
 * but it is NOT security: everything here lives in the browser.
 */
import type { Api, AuthEvent } from "./api";
import { computeEffective } from "./permissions";
import type {
  AccessReviewData, Policy,
  Access, Action, AuditRow, Catalog, ClientRow, Override, Permission, UserRow, UserStatus,
} from "./types";

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
  P("reports", "Reports", "view", "See reports", 50),
  P("reports", "Reports", "export", "Export reports", 51),
  P("admin_users", "Manage Users", "view", "See the user directory", 60),
  P("admin_users", "Manage Users", "create", "Invite or create users", 61),
  P("admin_users", "Manage Users", "edit", "Change roles, permissions, suspend", 62),
  P("admin_users", "Manage Users", "delete", "Delete users", 63),
  P("admin_settings", "Admin Settings", "view", "See app settings", 70),
  P("admin_settings", "Admin Settings", "edit", "Change app settings", 71),
  P("audit_log", "Audit Log", "view", "See the audit log", 80),
  P("audit_log", "Audit Log", "export", "Export the audit log", 81),
];

const catalog: Catalog = {
  permissions,
  roles: [
    { id: "super_admin", name: "Super Admin", description: "Everything, including users and settings. Cannot be locked out.", is_super: true, sort: 10 },
    { id: "agent", name: "Agent", description: "Licensed agent: all client, quoting, billing and report work, including approvals.", is_super: false, sort: 20 },
    { id: "assistant", name: "Assistant", description: "Day-to-day encoding: view and update clients and quotes, no approvals, deletes or exports.", is_super: false, sort: 30 },
    { id: "no_access", name: "No access", description: "Signed in but waiting for an admin to grant access.", is_super: false, sort: 99 },
  ],
  rolePermissions: {
    super_admin: [],
    agent: permissions
      .filter((p) => ["dashboard", "clients", "quotes", "billing", "reports"].includes(p.page) || p.key === "audit_log.view")
      .map((p) => p.key),
    assistant: ["dashboard.view", "clients.view", "clients.create", "clients.edit", "quotes.view", "quotes.create",
      "quotes.edit", "billing.view", "reports.view"],
    no_access: [],
  },
};

interface DemoUser extends Omit<UserRow, "override_count"> { overrides: Override[]; policy: string | null; mfa: boolean }
interface DemoState {
  users: DemoUser[]; clients: ClientRow[]; audit: AuditRow[]; sessionUserId: string | null; aal: "aal1" | "aal2";
  reviews: { id: number; reviewed_at: string; reviewer_email: string | null; notes: string }[];
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
const sensitive = (k: string) => /^(admin_users|admin_settings)\./.test(k) || k.endsWith(".export");

const KEY = "z1-demo-state-v2";
const hoursAgo = (h: number) => new Date(Date.now() - h * 3600_000).toISOString();

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
    users: [
      u("u-paolo", "paolo@ask-karla.com", "Paolo", "super_admin", "active", 0.2, { must_change_password: true, policy: null }),
      u("u-karla", "karla@ask-karla.com", "Karla", "agent", "active", 3, {
        overrides: [{ permission_key: "admin_users.view", effect: "grant" }],
      }),
      u("u-assistant", "assistant@ask-karla.com", "New Assistant", "assistant", "active", null, {
        overrides: [{ permission_key: "reports.view", effect: "deny" }, { permission_key: "clients.export", effect: "grant" }],
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
  };
}

export function createDemoApi(): Api {
  let state: DemoState;
  try {
    state = JSON.parse(localStorage.getItem(KEY) ?? "") as DemoState;
    if (!state?.users || !state.reviews) throw new Error();
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
  };
}
