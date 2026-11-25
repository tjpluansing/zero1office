import { createClient } from "@supabase/supabase-js";
import type { Api } from "./api";
import type { IntegrationAlert, IntegrationRow, SyncLog, TestResult } from "./types";
import type { Access, AccessReviewData, AuditRow, Catalog, ClientRow, MfaEnrollment, Override, Policy, UserRow } from "./types";

export function createSupabaseApi(): Api {
  const sb = createClient(import.meta.env.VITE_SUPABASE_URL, import.meta.env.VITE_SUPABASE_ANON_KEY, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: "pkce" },
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const must = (r: { data: any; error: { message: string } | null }): any => {
    if (r.error) throw new Error(r.error.message);
    return r.data;
  };

  const adminCall = <T,>(body: Record<string, unknown>) => adminFn<T>("admin-users", body);
  async function adminFn<T>(fn: string, body: Record<string, unknown>): Promise<T> {
    const { data, error } = await sb.functions.invoke(fn, { body });
    if (error) {
      // FunctionsHttpError carries the JSON body in error.context
      let msg = error.message;
      try {
        const j = await (error as { context?: Response }).context?.json();
        if (j?.error) msg = j.error;
      } catch { /* keep generic message */ }
      throw new Error(msg);
    }
    return data as T;
  }

  return {
    mode: "supabase",

    async hasSession() {
      const { data } = await sb.auth.getSession();
      return !!data.session;
    },
    onAuthChange(cb) {
      const { data } = sb.auth.onAuthStateChange((event) => {
        cb(event === "SIGNED_IN" || event === "SIGNED_OUT" || event === "PASSWORD_RECOVERY" ? event : "OTHER");
      });
      return () => data.subscription.unsubscribe();
    },
    async signInWithPassword(email, password) {
      must(await sb.auth.signInWithPassword({ email, password }));
    },
    async signInWithMicrosoft() {
      must(await sb.auth.signInWithOAuth({
        provider: "azure",
        options: { scopes: "email openid profile", redirectTo: `${window.location.origin}/` },
      }));
    },
    async signOut() {
      await sb.auth.signOut();
    },
    async sendPasswordReset(email) {
      must(await sb.auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}/reset-password` }));
    },
    async updatePassword(newPassword) {
      must(await sb.auth.updateUser({ password: newPassword }));
      must(await sb.rpc("complete_password_change"));
    },
    async getAccess() {
      const { data: s } = await sb.auth.getSession();
      if (!s.session) return null;
      return must(await sb.rpc("my_access")) as Access | null;
    },

    async getPolicy() {
      return must(await sb.rpc("current_policy")) as Policy | null;
    },
    async acceptPolicy(version) {
      must(await sb.rpc("accept_policy", { p_version: version }));
    },
    async mfaEnroll(): Promise<MfaEnrollment> {
      // Drop any half-finished setup first so the user gets a fresh QR code.
      const { data: list } = await sb.auth.mfa.listFactors();
      for (const f of list?.all ?? []) {
        if (f.status === "unverified") await sb.auth.mfa.unenroll({ factorId: f.id });
      }
      const d = must(await sb.auth.mfa.enroll({ factorType: "totp", friendlyName: "Authenticator app" }));
      return { factorId: d.id, qrSvg: d.totp.qr_code, secret: d.totp.secret };
    },
    async mfaVerify(code, factorId) {
      let id = factorId;
      if (!id) {
        const { data } = await sb.auth.mfa.listFactors();
        id = data?.totp?.[0]?.id;
        if (!id) throw new Error("No authenticator is set up for this account.");
      }
      must(await sb.auth.mfa.challengeAndVerify({ factorId: id, code }));
    },
    resetMfa: async (userId) => { await adminCall({ action: "reset_mfa", user_id: userId }); },
    async getAccessReview() {
      return must(await sb.rpc("access_review_data")) as AccessReviewData;
    },
    async completeAccessReview(notes) {
      must(await sb.rpc("complete_access_review", { p_notes: notes }));
    },

    async listIntegrations() {
      return must(await sb.from("integrations")
        .select("id, name, enabled, config, secret_hint, status, last_tested_at, last_test_ok, last_error, last_details, secret_set_at, updated_at, webhook_secret_hint, webhook_secret_set_at, last_event_at")
        .order("id")) as IntegrationRow[];
    },
    async saveIntegration(id, config, secret, enabled) {
      must(await sb.rpc("integration_save", { p_id: id, p_config: config, p_secret: secret, p_enabled: enabled }));
    },
    testIntegration: (id) => adminFn<TestResult>("integrations", { action: "test", id }),
    async disconnectIntegration(id) {
      must(await sb.rpc("integration_disconnect", { p_id: id }));
    },
    webhookUrl: (id) => `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/${id}-webhook`,
    async newWebhookSecret(id) {
      return must(await sb.rpc("integration_new_webhook_secret", { p_id: id })) as string;
    },
    async getSyncLog(id): Promise<SyncLog> {
      const [events, runs] = await Promise.all([
        sb.from("integration_events")
          .select("id, event_type, summary, verified_by, status, attempts, next_attempt_at, last_error, result, client_id, received_at, processed_at")
          .eq("integration_id", id).order("received_at", { ascending: false }).limit(100),
        sb.from("integration_runs").select("*").eq("integration_id", id).order("started_at", { ascending: false }).limit(20),
      ]);
      return { events: must(events), runs: must(runs) };
    },
    async retryEvent(eventId) {
      must(await sb.rpc("integration_retry_event", { p_event: eventId }));
    },
    async getIntegrationAlerts() {
      return must(await sb.rpc("integration_alerts")) as IntegrationAlert[];
    },

    async getCatalog(): Promise<Catalog> {
      const [perms, roles, rp] = await Promise.all([
        sb.from("permissions").select("*").order("sort"),
        sb.from("roles").select("*").order("sort"),
        sb.from("role_permissions").select("role_id, permission_key"),
      ]);
      const rolePermissions: Record<string, string[]> = {};
      for (const r of must(rp) as { role_id: string; permission_key: string }[]) {
        (rolePermissions[r.role_id] ??= []).push(r.permission_key);
      }
      return { permissions: must(perms), roles: must(roles), rolePermissions };
    },
    async listUsers() {
      const rows = must(await sb.from("profiles")
        .select("id, email, full_name, role_id, status, must_change_password, last_login_at, created_at, user_permission_overrides(count)")
        .order("full_name")) as (Omit<UserRow, "override_count"> & { user_permission_overrides: { count: number }[] })[];
      return rows.map(({ user_permission_overrides, ...r }) => ({
        ...r, override_count: user_permission_overrides?.[0]?.count ?? 0,
      }));
    },
    async getOverrides(userId) {
      return must(await sb.from("user_permission_overrides")
        .select("permission_key, effect").eq("user_id", userId)) as Override[];
    },
    async updateUser(userId, patch) {
      const rows = must(await sb.from("profiles").update(patch).eq("id", userId).select("id"));
      if (!rows?.length) throw new Error("You do not have permission to edit this user.");
    },
    async setOverrides(userId, overrides) {
      const current = must(await sb.from("user_permission_overrides")
        .select("permission_key, effect").eq("user_id", userId)) as Override[];
      const keep = new Set(overrides.map((o) => o.permission_key));
      const remove = current.filter((c) => !keep.has(c.permission_key)).map((c) => c.permission_key);
      if (remove.length) {
        must(await sb.from("user_permission_overrides").delete().eq("user_id", userId).in("permission_key", remove));
      }
      const changed = overrides.filter((o) =>
        !current.some((c) => c.permission_key === o.permission_key && c.effect === o.effect));
      if (changed.length) {
        must(await sb.from("user_permission_overrides")
          .upsert(changed.map((o) => ({ user_id: userId, ...o })), { onConflict: "user_id,permission_key" }));
      }
    },
    createUser: (input) => adminCall({ action: "create", ...input }),
    async setStatus(userId, status) {
      await adminCall({ action: "set_status", user_id: userId, status });
    },
    async deleteUser(userId) {
      await adminCall({ action: "delete", user_id: userId });
    },
    resetPassword: (userId, mode) => adminCall({ action: "reset_password", user_id: userId, mode }),
    async listAudit(limit = 200) {
      return must(await sb.from("audit_log").select("*").order("at", { ascending: false }).limit(limit)) as AuditRow[];
    },
    async exportAudit() {
      return must(await sb.rpc("export_audit_log")) as AuditRow[];
    },

    async listClients() {
      return must(await sb.from("clients").select("*").order("full_name")) as ClientRow[];
    },
    async saveClient(row) {
      const { id, created_at: _c, ...fields } = row;
      if (id) must(await sb.from("clients").update(fields).eq("id", id));
      else must(await sb.from("clients").insert(fields));
    },
    async deleteClient(id) {
      const rows = must(await sb.from("clients").delete().eq("id", id).select("id"));
      if (!rows?.length) throw new Error("You do not have permission to delete clients.");
    },
    async exportClients() {
      const rows = must(await sb.rpc("export_clients")) as ClientRow[];
      await sb.rpc("log_export", { p_what: "clients", p_rows: rows.length });
      return rows;
    },
  };
}
