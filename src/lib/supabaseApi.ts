import { createClient } from "@supabase/supabase-js";
import type { Api } from "./api";
import type { Access, AuditRow, Catalog, ClientRow, Override, UserRow } from "./types";

export function createSupabaseApi(): Api {
  const sb = createClient(import.meta.env.VITE_SUPABASE_URL, import.meta.env.VITE_SUPABASE_ANON_KEY, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: "pkce" },
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const must = (r: { data: any; error: { message: string } | null }): any => {
    if (r.error) throw new Error(r.error.message);
    return r.data;
  };

  async function adminCall<T>(body: Record<string, unknown>): Promise<T> {
    const { data, error } = await sb.functions.invoke("admin-users", { body });
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
