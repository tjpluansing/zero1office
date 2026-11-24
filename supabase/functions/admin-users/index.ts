// Supabase Edge Function: admin-users
//
// Everything on the Manage Users page that needs Supabase Auth's admin API
// (create, invite, suspend, delete, reset password) goes through here.
// Plain edits (name, role, permission matrix) are written straight from the
// browser and are protected by row level security and triggers.
//
// Every action first asks the database, AS THE CALLER, whether it is
// allowed (admin_precheck / admin_precheck_role). Only then does it use the
// service-role key.
//
// Deploy:  supabase functions deploy admin-users
// Secrets: SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY are
//          provided automatically. Set APP_URL (e.g. https://app.ask-karla.com).

import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2.49.4";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const APP_URL = Deno.env.get("APP_URL") ?? "http://localhost:5173";

const cors = {
  "Access-Control-Allow-Origin": APP_URL,
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  Vary: "Origin",
};

type Body =
  | { action: "create"; email: string; full_name: string; role_id: string; mode: "invite" | "temp_password";
      overrides?: { permission_key: string; effect: "grant" | "deny" }[] }
  | { action: "set_status"; user_id: string; status: "active" | "suspended" }
  | { action: "delete"; user_id: string }
  | { action: "reset_password"; user_id: string; mode: "email" | "temp_password" }
  | { action: "reset_mfa"; user_id: string };

class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

// 16 chars from an unambiguous alphabet, plus a digit and a symbol.
function tempPassword(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  const core = Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("");
  return `${core}-${(bytes[0] % 10)}!`;
}

async function check(caller: SupabaseClient, fn: string, args: Record<string, unknown>) {
  const { error } = await caller.rpc(fn, args);
  if (error) throw new HttpError(403, error.message);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json(405, { error: "Method not allowed" });

  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) return json(401, { error: "Not signed in" });

  // Client acting as the caller: RLS, triggers and auth.uid() all apply.
  const caller = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });
  const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

  const { data: who, error: whoErr } = await caller.auth.getUser();
  if (whoErr || !who.user) return json(401, { error: "Session expired. Sign in again." });
  const actorId = who.user.id;

  let body: Body;
  try {
    body = await req.json();
  } catch {
    return json(400, { error: "Invalid JSON" });
  }

  try {
    switch (body.action) {
      case "create": {
        const email = String(body.email ?? "").trim().toLowerCase();
        if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new HttpError(400, "Enter a valid email");
        await check(caller, "admin_precheck", { p_user: null, p_perm: "admin_users.create" });
        await check(caller, "admin_precheck_role", { p_role: body.role_id });

        let userId: string;
        let password: string | undefined;
        const appMeta = {
          z1_role: body.role_id,
          z1_full_name: body.full_name ?? "",
          z1_created_by: actorId,
        };

        if (body.mode === "temp_password") {
          password = tempPassword();
          const { data, error } = await admin.auth.admin.createUser({
            email,
            password,
            email_confirm: true,
            app_metadata: { ...appMeta, z1_force_password_change: true },
          });
          if (error) throw new HttpError(400, error.message);
          userId = data.user.id;
        } else {
          const { data, error } = await admin.auth.admin.inviteUserByEmail(email, {
            redirectTo: `${APP_URL}/reset-password`,
          });
          if (error) throw new HttpError(400, error.message);
          userId = data.user.id;
          // Invites cannot carry app_metadata, so the trigger created the
          // profile as pending/no_access. Promote it now.
          const { error: upErr } = await admin.from("profiles")
            .update({ role_id: body.role_id, status: "active", full_name: body.full_name ?? "" })
            .eq("id", userId);
          if (upErr) throw new HttpError(400, upErr.message);
        }

        if (body.overrides?.length) {
          // Written as the caller so the no-escalation trigger applies.
          const { error } = await caller.from("user_permission_overrides").insert(
            body.overrides.map((o) => ({ user_id: userId, permission_key: o.permission_key, effect: o.effect })),
          );
          if (error) throw new HttpError(403, `User created, but permissions were not saved: ${error.message}`);
        }
        return json(200, { user_id: userId, temp_password: password });
      }

      case "set_status": {
        if (!["active", "suspended"].includes(body.status)) throw new HttpError(400, "Bad status");
        // Written as the caller: RLS + guard_profiles decide.
        const { data, error } = await caller.from("profiles")
          .update({ status: body.status }).eq("id", body.user_id).select("id");
        if (error) throw new HttpError(403, error.message);
        if (!data?.length) throw new HttpError(403, "You do not have permission to change this user");
        // Also block new sign-ins / token refreshes at the Auth layer.
        const { error: banErr } = await admin.auth.admin.updateUserById(body.user_id, {
          ban_duration: body.status === "suspended" ? "876000h" : "none",
        });
        if (banErr) throw new HttpError(500, banErr.message);
        return json(200, { ok: true });
      }

      case "delete": {
        await check(caller, "admin_precheck", { p_user: body.user_id, p_perm: "admin_users.delete" });
        await admin.rpc("audit_admin_action", {
          p_actor: actorId, p_action: "user.delete_requested", p_target: body.user_id, p_details: {},
        });
        const { error } = await admin.auth.admin.deleteUser(body.user_id);
        if (error) throw new HttpError(400, error.message);
        return json(200, { ok: true });
      }

      case "reset_password": {
        await check(caller, "admin_precheck", { p_user: body.user_id, p_perm: "admin_users.edit" });
        const { data: target, error: tErr } = await admin.auth.admin.getUserById(body.user_id);
        if (tErr || !target.user?.email) throw new HttpError(404, "User not found");

        if (body.mode === "email") {
          const { error } = await admin.auth.resetPasswordForEmail(target.user.email, {
            redirectTo: `${APP_URL}/reset-password`,
          });
          if (error) throw new HttpError(400, error.message);
          await admin.rpc("audit_admin_action", {
            p_actor: actorId, p_action: "password.reset_email_sent", p_target: body.user_id, p_details: {},
          });
          return json(200, { ok: true });
        }
        const password = tempPassword();
        const { error } = await admin.auth.admin.updateUserById(body.user_id, { password });
        if (error) throw new HttpError(400, error.message);
        const { error: mErr } = await admin.rpc("mark_password_reset", { p_user: body.user_id, p_actor: actorId });
        if (mErr) throw new HttpError(500, mErr.message);
        return json(200, { temp_password: password });
      }

      case "reset_mfa": {
        // For a lost phone: removes their two-step factors so they can set
        // it up again at next sign-in. Admin and export features stay locked
        // for them until they do.
        await check(caller, "admin_precheck", { p_user: body.user_id, p_perm: "admin_users.edit" });
        const { data, error } = await admin.auth.admin.mfa.listFactors({ userId: body.user_id });
        if (error) throw new HttpError(400, error.message);
        for (const f of data.factors) {
          const { error: dErr } = await admin.auth.admin.mfa.deleteFactor({ userId: body.user_id, id: f.id });
          if (dErr) throw new HttpError(400, dErr.message);
        }
        await admin.rpc("audit_admin_action", {
          p_actor: actorId, p_action: "mfa.reset_by_admin", p_target: body.user_id,
          p_details: { factors_removed: data.factors.length },
        });
        return json(200, { ok: true });
      }

      default:
        throw new HttpError(400, "Unknown action");
    }
  } catch (e) {
    const status = e instanceof HttpError ? e.status : 500;
    const message = e instanceof Error ? e.message : "Unexpected error";
    return json(status, { error: message });
  }
});
