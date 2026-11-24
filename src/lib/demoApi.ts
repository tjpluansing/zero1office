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
  DisbursementRow, SoaEvent, SoaRow,
} from "./types";
import { computeStage, STAGES } from "./soa";

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
  soas: SoaRow[]; disbursements: DisbursementRow[]; soaEvents: SoaEvent[];
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
    ...seedBilling(),
  };
}

const daysAgo = (d: number) => new Date(Date.now() - d * 86_400_000).toISOString().slice(0, 10);

/** Sample SOAs in every stage so the tracker can be clicked through. Made-up accounts and amounts. */
function seedBilling(): Pick<DemoState, "soas" | "disbursements" | "soaEvents"> {
  const disbursements: DisbursementRow[] = [
    { id: "d1", provider: "Maxicare", received_on: daysAgo(4), reference: "DV-24-1188", gross_amount: 23500, withholding_amount: 2350,
      net_amount: 21150, receipt_no: null, receipt_issued_on: null, notes: null, created_at: hoursAgo(96) },
    { id: "d2", provider: "Intellicare", received_on: daysAgo(30), reference: "CV-0931", gross_amount: 8400, withholding_amount: 840,
      net_amount: 7560, receipt_no: "AK-0042", receipt_issued_on: daysAgo(28), notes: null, created_at: hoursAgo(720) },
  ];
  type S = Partial<SoaRow> & Pick<SoaRow, "id" | "soa_no" | "provider" | "account_name" | "amount">;
  const base: S[] = [
    { id: "s1", soa_no: "MX-2026-0412", provider: "Maxicare", account_name: "Dela Cruz Trading", product: "HMO – Corporate", amount: 185000, commission_rate: 0.1, released_on: daysAgo(70), due_on: daysAgo(40) },
    { id: "s2", soa_no: "MC-88120", provider: "Medicard", account_name: "Santos Bakery", product: "HMO – SME", amount: 64000, commission_rate: 0.1, released_on: daysAgo(20), due_on: daysAgo(5) },
    { id: "s3", soa_no: "IC-55102", provider: "Intellicare", account_name: "Bayani Logistics", product: "HMO – Corporate", amount: 120000, commission_rate: 0.08, released_on: daysAgo(12), due_on: daysAgo(-18) },
    { id: "s4", soa_no: "MX-2026-0398", provider: "Maxicare", account_name: "Luzon Dental Group", product: "HMO – Corporate", amount: 96000, commission_rate: 0.1, released_on: daysAgo(50), due_on: daysAgo(20), paid_on: daysAgo(25), payment_ref: "BDO 22831", cwt_applicable: true, cwt_amount: 1920 },
    { id: "s5", soa_no: "KHL-7781", provider: "KHL", account_name: "Mabuhay Prints", product: "HMO – SME", amount: 38000, commission_rate: 0.1, released_on: daysAgo(40), due_on: daysAgo(10), paid_on: daysAgo(12), provider_receipt_no: "OR 1123", provider_receipt_on: daysAgo(9) },
    { id: "s6", soa_no: "MX-2026-0377", provider: "Maxicare", account_name: "Rizal Builders", product: "HMO – Corporate", amount: 150000, commission_rate: 0.1, released_on: daysAgo(60), due_on: daysAgo(30), paid_on: daysAgo(32), provider_receipt_no: "OR 88231", provider_receipt_on: daysAgo(28), cwt_applicable: true, cwt_amount: 3000, form_2307_on: daysAgo(20), disbursement_id: "d1", commission_amount: 15000 },
    { id: "s7", soa_no: "MX-2026-0380", provider: "Maxicare", account_name: "Cebu Seafoods", product: "HMO – SME", amount: 85000, commission_rate: 0.1, released_on: daysAgo(58), due_on: daysAgo(28), paid_on: daysAgo(29), provider_receipt_no: "OR 88240", provider_receipt_on: daysAgo(26), disbursement_id: "d1", commission_amount: 8500 },
    { id: "s8", soa_no: "IC-54990", provider: "Intellicare", account_name: "Tala Cafe", product: "HMO – SME", amount: 105000, commission_rate: 0.08, released_on: daysAgo(90), due_on: daysAgo(60), paid_on: daysAgo(62), provider_receipt_no: "OR 5521", provider_receipt_on: daysAgo(58), disbursement_id: "d2", commission_amount: 8400 },
    { id: "s9", soa_no: "FWD-GL-301", provider: "FWD", account_name: "Ana Reyes", product: "Group Life", amount: 42000, commission_rate: 0.15 },
  ];
  const soas = base.map((b) => {
    const row: SoaRow = {
      client_id: null, product: null, coverage_period: null, released_on: null, due_on: null, paid_on: null, paid_amount: null,
      payment_ref: null, provider_receipt_no: null, provider_receipt_on: null, cwt_applicable: false, cwt_amount: null,
      form_2307_on: null, commission_rate: null, commission_expected: null, disbursement_id: null, commission_amount: null,
      closed_on: null, ghl_link: null, notes: null, stage: "draft", stage_changed_at: "", created_at: hoursAgo(800),
      updated_at: hoursAgo(1), ...b,
    };
    if (row.paid_on && row.paid_amount == null) row.paid_amount = row.amount;
    if (row.commission_rate != null) row.commission_expected = Math.round(row.amount * row.commission_rate * 100) / 100;
    row.stage = computeStage(row, !!disbursements.find((d) => d.id === row.disbursement_id)?.receipt_issued_on);
    const last = [row.form_2307_on, row.provider_receipt_on, row.paid_on, row.released_on].find(Boolean);
    row.stage_changed_at = row.disbursement_id
      ? new Date(disbursements.find((d) => d.id === row.disbursement_id)!.received_on).toISOString()
      : last ? new Date(last).toISOString() : hoursAgo(120);
    return row;
  });
  const soaEvents: SoaEvent[] = soas.map((r, i) => ({ id: i + 1, soa_id: r.id, at: r.stage_changed_at,
    actor_email: "karla@ask-karla.com", kind: "stage", body: STAGES.find((x) => x.id === r.stage)!.label }));
  soaEvents.push({ id: 100, soa_id: "s1", at: hoursAgo(50), actor_email: "assistant@ask-karla.com", kind: "follow_up",
    body: "Emailed accounting, promised payment next week." });
  return { soas, disbursements, soaEvents };
}

export function createDemoApi(): Api {
  let state: DemoState;
  try {
    state = JSON.parse(localStorage.getItem(KEY) ?? "") as DemoState;
    if (!state?.users || !state.reviews) throw new Error();
    if (!state.soas) Object.assign(state, seedBilling());
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

  const blankSoa = (): SoaRow => ({
    id: "", soa_no: "", provider: "", account_name: "", amount: 0, client_id: null, product: null, coverage_period: null,
    released_on: null, due_on: null, paid_on: null, paid_amount: null, payment_ref: null, provider_receipt_no: null,
    provider_receipt_on: null, cwt_applicable: false, cwt_amount: null, form_2307_on: null, commission_rate: null,
    commission_expected: null, disbursement_id: null, commission_amount: null, closed_on: null, ghl_link: null, notes: null,
    stage: "draft", stage_changed_at: "", created_at: new Date().toISOString(), updated_at: "",
  });
  const addEvent = (soaId: string, kind: SoaEvent["kind"], body: string) => {
    state.soaEvents.push({ id: Math.max(0, ...state.soaEvents.map((e) => e.id)) + 1, soa_id: soaId,
      at: new Date().toISOString(), actor_email: me()?.email ?? null, kind, body });
  };
  /** Mirrors the soas triggers: tidy, validate, default, work out the stage, log stage changes. */
  const writeSoa = (r: SoaRow) => {
    r.soa_no = r.soa_no.trim(); r.provider = r.provider.trim(); r.account_name = r.account_name.trim();
    if (!r.soa_no || !r.provider || !r.account_name) throw new Error("SOA number, provider and account are required");
    if (!(r.amount >= 0)) throw new Error("Amount must be zero or more");
    if (r.ghl_link && !/^https:\/\//i.test(r.ghl_link)) throw new Error("The GoHighLevel link must start with https://");
    if (state.soas.some((x) => x.id !== r.id && x.provider.toLowerCase() === r.provider.toLowerCase() && x.soa_no === r.soa_no))
      throw new Error(`duplicate key: SOA ${r.soa_no} from ${r.provider} already exists`);
    if (r.commission_expected == null && r.commission_rate != null) r.commission_expected = Math.round(r.amount * r.commission_rate * 100) / 100;
    if (r.paid_on && r.paid_amount == null) r.paid_amount = r.amount;
    const d = r.disbursement_id ? state.disbursements.find((x) => x.id === r.disbursement_id) : undefined;
    if (d && d.provider.toLowerCase() !== r.provider.toLowerCase())
      throw new Error(`SOA ${r.soa_no} is from ${r.provider}, but this payout is from ${d.provider}`);
    if (d && r.commission_amount == null) r.commission_amount = r.commission_expected;
    const old = state.soas.find((x) => x.id === r.id);
    const stage = computeStage(r, !!d?.receipt_issued_on);
    r.updated_at = new Date().toISOString();
    if (!old || old.stage !== stage) {
      r.stage = stage;
      r.stage_changed_at = r.updated_at;
      addEvent(r.id, "stage", STAGES.find((x) => x.id === stage)!.label);
    }
    if (old) Object.assign(old, r); else state.soas.push(r);
  };

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

    async listSoas() { need("billing.view"); await wait(); return state.soas.map((r) => ({ ...r })); },
    async saveSoa(row) {
      await wait();
      if (row.id) {
        need("billing.edit");
        const r = state.soas.find((x) => x.id === row.id);
        if (!r) throw new Error("SOA not found");
        writeSoa({ ...r, ...row });
      } else {
        need("billing.create");
        writeSoa({ ...blankSoa(), ...row, id: `s-${Date.now()}` });
      }
      save();
    },
    async importSoas(rows) {
      await wait();
      need("billing.create");
      const before = state.soas.length;
      const snapshot = JSON.stringify(state);
      try {
        rows.forEach((r, i) => writeSoa({ ...blankSoa(), ...r, id: `s-${Date.now()}-${i}` }));
      } catch (e) {
        state = JSON.parse(snapshot) as DemoState;
        throw e;
      }
      save();
      return state.soas.length - before;
    },
    async deleteSoa(id) {
      need("billing.delete");
      const r = state.soas.find((x) => x.id === id);
      state.soas = state.soas.filter((x) => x.id !== id);
      state.soaEvents = state.soaEvents.filter((e) => e.soa_id !== id);
      log("soa.deleted", id, { soa_no: r?.soa_no, provider: r?.provider, amount: r?.amount }, "soa");
      save();
    },
    async listSoaEvents(soaId) {
      need("billing.view");
      return state.soaEvents.filter((e) => e.soa_id === soaId).sort((a, b) => b.at.localeCompare(a.at) || b.id - a.id);
    },
    async addSoaEvent(soaId, kind, body) {
      need("billing.view");
      addEvent(soaId, kind, body);
      save();
    },
    async listDisbursements() {
      need("billing.view");
      return [...state.disbursements].sort((a, b) => b.received_on.localeCompare(a.received_on));
    },
    async saveDisbursement(row) {
      await wait();
      const old = row.id ? state.disbursements.find((d) => d.id === row.id) : undefined;
      const receiptChanged = (row.receipt_no ?? null) !== (old?.receipt_no ?? null)
        || (row.receipt_issued_on ?? null) !== (old?.receipt_issued_on ?? null);
      if (receiptChanged && !can("billing.approve")) throw new Error("Only someone with Billing approve (Karla) can record her receipt");
      if (!row.receipt_no !== !row.receipt_issued_on) throw new Error("Enter both the receipt number and its date");
      if (old) {
        if (!can("billing.edit") && !can("billing.approve")) need("billing.edit");
        if (row.provider.toLowerCase() !== old.provider.toLowerCase() && state.soas.some((s) => s.disbursement_id === old.id))
          throw new Error("Unlink the SOAs before changing this payout's provider");
        Object.assign(old, row);
        old.net_amount = (old.gross_amount ?? 0) - (old.withholding_amount ?? 0);
        state.soas.filter((s) => s.disbursement_id === old.id).forEach((s) => writeSoa(s));
        save();
        return old.id;
      }
      need("billing.create");
      const d: DisbursementRow = { reference: null, gross_amount: 0, withholding_amount: 0, receipt_no: null, receipt_issued_on: null,
        notes: null, ...row, id: `d-${Date.now()}`, net_amount: 0, created_at: new Date().toISOString() };
      d.net_amount = d.gross_amount - d.withholding_amount;
      state.disbursements.push(d);
      save();
      return d.id;
    },
    async deleteDisbursement(id) {
      need("billing.delete");
      const d = state.disbursements.find((x) => x.id === id);
      state.disbursements = state.disbursements.filter((x) => x.id !== id);
      state.soas.filter((s) => s.disbursement_id === id).forEach((s) => writeSoa({ ...s, disbursement_id: null }));
      log("disbursement.deleted", id, { provider: d?.provider, gross: d?.gross_amount, receipt_no: d?.receipt_no }, "disbursement");
      save();
    },
    async linkSoas(disbursementId, links) {
      need("billing.edit");
      for (const l of links) {
        const s = state.soas.find((x) => x.id === l.soa_id);
        if (!s) continue;
        writeSoa({ ...s, disbursement_id: disbursementId, commission_amount: disbursementId ? l.commission_amount : null });
      }
      save();
    },
    async exportSoas() {
      need("billing.export");
      log("export", null, { rows: state.soas.length }, "billing");
      save();
      return state.soas.map((s) => {
        const d = state.disbursements.find((x) => x.id === s.disbursement_id);
        return { soa_no: s.soa_no, provider: s.provider, account_name: s.account_name, product: s.product, amount: s.amount,
          released_on: s.released_on, due_on: s.due_on, paid_on: s.paid_on, provider_receipt_on: s.provider_receipt_on,
          cwt_applicable: s.cwt_applicable, form_2307_on: s.form_2307_on, commission_expected: s.commission_expected,
          commission_amount: s.commission_amount, disbursement_ref: d?.reference ?? null, karla_receipt_no: d?.receipt_no ?? null,
          karla_receipt_on: d?.receipt_issued_on ?? null, closed_on: s.closed_on, stage: s.stage, notes: s.notes };
      });
    },
  };
}
