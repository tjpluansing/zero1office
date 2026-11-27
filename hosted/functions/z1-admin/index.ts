// Zero1Office: sign-in accounts for Settings > Users (Super Admins only).
// Actions: "password" (create the sign-in if missing, set a temporary password, return it once),
//          "remove" (delete the sign-in), "pause" / "unpause" (block or allow sign-in).
// The caller's own token is checked against the database (z1_admin) before the service key is used.
// Deploy: Supabase > Edge Functions > Deploy a new function > name "z1-admin" > paste this file.
import { createClient } from "npm:@supabase/supabase-js@2.49.4";

const cors = {
  "Access-Control-Allow-Origin": Deno.env.get("APP_ORIGIN") ?? "https://app.ask-karla.com",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
// Newer Supabase projects use publishable/secret keys; older ones the anon/service_role keys. Accept either.
function key(legacy: string, list: string): string {
  const v = Deno.env.get(legacy);
  if (v) return v;
  try { const o = JSON.parse(Deno.env.get(list) ?? "{}"); return o.default ?? Object.values(o)[0] ?? ""; } catch { return ""; }
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

function tempPassword(): string {
  const abc = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const a = new Uint32Array(12);
  crypto.getRandomValues(a);
  return Array.from(a, (x) => abc[x % abc.length]).join("").replace(/(.{4})(?=.)/g, "$1-");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Use POST" }, 405);
  const url = Deno.env.get("SUPABASE_URL")!;
  const auth = req.headers.get("Authorization") ?? "";
  const asCaller = createClient(url, key("SUPABASE_ANON_KEY", "SUPABASE_PUBLISHABLE_KEYS"), { global: { headers: { Authorization: auth } } });
  const { data: isAdmin, error: e1 } = await asCaller.rpc("z1_admin");
  if (e1 || isAdmin !== true) return json({ error: "Only a Super Admin can do this." }, 403);

  let body: { action?: string; email?: string };
  try { body = await req.json(); } catch { return json({ error: "Bad request" }, 400); }
  const email = String(body.email ?? "").trim().toLowerCase();
  if (!/^[^@\s]+@ask-karla\.com$/.test(email)) return json({ error: "Use an @ask-karla.com email." }, 400);
  const { data: me } = await asCaller.auth.getUser();
  if (me.user?.email?.toLowerCase() === email && body.action !== "password")
    return json({ error: "You can't do this to your own account." }, 400);

  const admin = createClient(url, key("SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_SECRET_KEYS"), { auth: { persistSession: false } });
  // find the sign-in by email (small team: one page is enough)
  const { data: list, error: e2 } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (e2) return json({ error: "Couldn't read sign-ins." }, 500);
  const user = list.users.find((u) => (u.email ?? "").toLowerCase() === email);

  switch (body.action) {
    case "password": {
      // the account must exist in Settings > Users first
      const { data: rec } = await asCaller.from("app_docs").select("path").eq("path", "z1users/" + email.replace(/[^a-z0-9]/g, "_")).maybeSingle();
      if (!rec) return json({ error: "Add the person in Settings > Users first." }, 400);
      const pw = tempPassword();
      const r = user
        ? await admin.auth.admin.updateUserById(user.id, { password: pw, ban_duration: "none" })
        : await admin.auth.admin.createUser({ email, password: pw, email_confirm: true });
      if (r.error) return json({ error: r.error.message }, 400);
      return json({ password: pw });
    }
    case "remove": {
      if (user) { const r = await admin.auth.admin.deleteUser(user.id); if (r.error) return json({ error: r.error.message }, 400); }
      return json({ ok: true });
    }
    case "pause":
    case "unpause": {
      if (user) {
        const r = await admin.auth.admin.updateUserById(user.id, { ban_duration: body.action === "pause" ? "876000h" : "none" });
        if (r.error) return json({ error: r.error.message }, 400);
      }
      return json({ ok: true });
    }
    default:
      return json({ error: "Unknown action" }, 400);
  }
});
