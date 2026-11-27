// Supabase Edge Function: integrations
//
// "Test connection" for each service on Admin → Integrations. The key is
// read from Vault on the server and never leaves it. The caller must hold
// integrations.edit in a two-step-verified session (checked by the DB).
//
// Also the daily health check (action "health"), called by pg_cron with the
// X-Health-Secret header: re-tests every active connection, then emails the
// Super Admins about new alerts from the company mailbox (if Microsoft 365
// is connected with sending allowed).
//
// Deploy: supabase functions deploy integrations
// Secrets: APP_URL (same as admin-users), HEALTH_CHECK_SECRET (any long random string)

import { createClient } from "npm:@supabase/supabase-js@2.49.4";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const APP_URL = Deno.env.get("APP_URL") ?? "http://localhost:5173";
const HEALTH_SECRET = Deno.env.get("HEALTH_CHECK_SECRET") ?? "";

const cors = {
  "Access-Control-Allow-Origin": APP_URL,
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  Vary: "Origin",
};
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

type Result = { ok: boolean; error?: string; details?: Record<string, unknown> };
type Config = Record<string, unknown>;

async function fetchWithTimeout(url: string, init: RequestInit = {}, ms = 10_000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal });
  } finally {
    clearTimeout(t);
  }
}

// --- GoHighLevel: Private Integration token, API v2 --------------------
async function testGhl(token: string, cfg: Config): Promise<Result> {
  const loc = String(cfg.location_id ?? "").trim();
  if (!loc) return { ok: false, error: "Add your Location ID (Settings → Business Profile in GHL)." };
  const r = await fetchWithTimeout(`https://services.leadconnectorhq.com/locations/${encodeURIComponent(loc)}`, {
    headers: { Authorization: `Bearer ${token}`, Version: "2021-07-28", Accept: "application/json" },
  });
  if (r.status === 401) return { ok: false, error: "GHL rejected the token. Create a new Private Integration token and paste it again." };
  if (r.status === 403) return { ok: false, error: "The token works but lacks the 'View Locations' scope, or belongs to another sub-account." };
  if (!r.ok) return { ok: false, error: `GHL answered ${r.status}.` };
  const body = await r.json();
  const l = body.location ?? body;
  return { ok: true, details: { account: l.name ?? null, timezone: l.timezone ?? null } };
}

// --- Microsoft 365: Entra app, client credentials, Graph ---------------
async function testM365(secret: string, cfg: Config): Promise<Result> {
  const tenant = String(cfg.tenant_id ?? "").trim();
  const clientId = String(cfg.client_id ?? "").trim();
  const mailbox = String(cfg.mailbox ?? "").trim();
  if (!tenant || !clientId) return { ok: false, error: "Add the Tenant ID and Application (client) ID." };
  const tok = await fetchWithTimeout(`https://login.microsoftonline.com/${encodeURIComponent(tenant)}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId, client_secret: secret, grant_type: "client_credentials",
      scope: "https://graph.microsoft.com/.default",
    }),
  });
  const tj = await tok.json();
  if (!tok.ok) {
    const code = String(tj.error_codes?.[0] ?? "");
    const hint = code === "7000215" ? "The client secret is wrong. Copy the secret VALUE, not its ID."
      : code === "7000222" ? "The client secret has expired. Create a new one in Entra ID."
      : code === "700016" ? "Application (client) ID not found in this tenant."
      : code === "90002" ? "Tenant ID not found."
      : tj.error_description?.split("\r\n")[0] ?? "Sign-in to Microsoft failed.";
    return { ok: false, error: hint };
  }
  const details: Record<string, unknown> = { token: "ok" };
  if (mailbox) {
    const r = await fetchWithTimeout(`https://graph.microsoft.com/v1.0/users/${encodeURIComponent(mailbox)}/mailFolders/inbox?$select=displayName,totalItemCount`, {
      headers: { Authorization: `Bearer ${tj.access_token}` },
    });
    if (r.status === 403) {
      return { ok: false, error: `Connected, but the app can't open ${mailbox}. Grant Mail permissions scoped to that mailbox (RBAC for Applications).`, details };
    }
    if (r.status === 404) return { ok: false, error: `Mailbox ${mailbox} not found.`, details };
    if (!r.ok) return { ok: false, error: `Graph answered ${r.status} for the mailbox.`, details };
    details.mailbox = mailbox;
  }
  return { ok: true, details };
}

// --- Claude API ---------------------------------------------------------
async function testAnthropic(key: string, cfg: Config): Promise<Result> {
  const r = await fetchWithTimeout("https://api.anthropic.com/v1/models?limit=20", {
    headers: { "x-api-key": key, "anthropic-version": "2023-06-01" },
  });
  if (r.status === 401) return { ok: false, error: "The API key was rejected. Create a new key in the Claude Console." };
  if (r.status === 403) return { ok: false, error: "The key has no permission for the API. Check the workspace it belongs to." };
  if (!r.ok) return { ok: false, error: `Claude API answered ${r.status}.` };
  const body = await r.json();
  const ids: string[] = (body.data ?? []).map((m: { id: string }) => m.id);
  const wanted = String(cfg.default_model ?? "");
  if (wanted && !ids.includes(wanted)) {
    return { ok: false, error: `Key works, but model "${wanted}" isn't available to it.`, details: { models: ids.slice(0, 8) } };
  }
  return { ok: true, details: { models: ids.slice(0, 8) } };
}

const TESTERS: Record<string, (s: string, c: Config) => Promise<Result>> = {
  ghl: testGhl, m365: testM365, anthropic: testAnthropic,
};

// --- Daily health check -------------------------------------------------
type Alert = { alert_key: string; integration_id: string; severity: string; title: string; detail: string };

function sameSecret(a: string, b: string) {
  if (!a || !b || a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));

async function emailAlerts(admin: ReturnType<typeof createClient>, alerts: Alert[], to: string[]): Promise<string> {
  const { data: m } = await admin.from("integrations").select("config, enabled, status").eq("id", "m365").single();
  const cfg = (m?.config ?? {}) as Config;
  if (!m?.enabled || m.status !== "connected" || !cfg.send_email || !cfg.mailbox) return "skipped: Microsoft 365 sending is not set up";
  const { data: secret } = await admin.rpc("integration_secret", { p_id: "m365" });
  const tok = await fetchWithTimeout(`https://login.microsoftonline.com/${encodeURIComponent(String(cfg.tenant_id))}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: String(cfg.client_id), client_secret: String(secret), grant_type: "client_credentials",
      scope: "https://graph.microsoft.com/.default" }),
  });
  if (!tok.ok) return "failed: Microsoft sign-in";
  const { access_token } = await tok.json();
  const rows = alerts.map((a) => `<li><b>${esc(a.title)}</b><br>${esc(a.detail)}</li>`).join("");
  const r = await fetchWithTimeout(`https://graph.microsoft.com/v1.0/users/${encodeURIComponent(String(cfg.mailbox))}/sendMail`, {
    method: "POST",
    headers: { Authorization: `Bearer ${access_token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      message: {
        subject: `zero1office: ${alerts.length} integration alert${alerts.length === 1 ? "" : "s"}`,
        body: { contentType: "HTML", content: `<p>The daily check found:</p><ul>${rows}</ul><p><a href="${APP_URL}/admin/integrations">Open Integrations</a></p>` },
        toRecipients: to.map((address) => ({ emailAddress: { address } })),
      },
      saveToSentItems: true,
    }),
  });
  return r.ok ? `sent to ${to.length}` : `failed: Graph answered ${r.status}`;
}

async function healthCheck(): Promise<Response> {
  const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
  const { data: rows } = await admin.from("integrations").select("id, config, enabled, secret_id").eq("enabled", true);
  const tested: Record<string, boolean> = {};
  for (const row of rows ?? []) {
    if (!row.secret_id || !TESTERS[row.id]) continue;
    const { data: secret } = await admin.rpc("integration_secret", { p_id: row.id });
    let result: Result;
    try {
      result = await TESTERS[row.id](secret as string, (row.config ?? {}) as Config);
    } catch {
      result = { ok: false, error: "Could not reach the service during the daily check." };
    }
    tested[row.id] = result.ok;
    await admin.rpc("integration_record_test", {
      p_id: row.id, p_actor: null, p_ok: result.ok, p_error: result.error ?? null, p_details: result.details ?? {},
    });
  }
  const { data: due } = await admin.rpc("integration_alerts_to_notify");
  const alerts = (due?.alerts ?? []) as Alert[];
  const to = (due?.recipients ?? []) as string[];
  const email = alerts.length && to.length ? await emailAlerts(admin, alerts, to) : "nothing new";
  return json(200, { tested, alerts: alerts.length, email });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json(405, { error: "Method not allowed" });
  const health = req.headers.get("x-health-secret");
  if (health !== null) {
    if (!sameSecret(health, HEALTH_SECRET)) return json(401, { error: "Wrong health check secret" });
    return await healthCheck();
  }
  const auth = req.headers.get("Authorization") ?? "";
  if (!auth.startsWith("Bearer ")) return json(401, { error: "Not signed in" });

  const caller = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: auth } }, auth: { persistSession: false } });
  const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
  const { data: who } = await caller.auth.getUser();
  if (!who?.user) return json(401, { error: "Session expired. Sign in again." });

  let body: { action?: string; id?: string };
  try { body = await req.json(); } catch { return json(400, { error: "Invalid JSON" }); }
  if (body.action !== "test" || !body.id || !TESTERS[body.id]) return json(400, { error: "Unknown request" });

  // Permission check as the caller (includes the two-step requirement).
  const { error: pErr } = await caller.rpc("admin_precheck", { p_user: null, p_perm: "integrations.edit" });
  if (pErr) return json(403, { error: pErr.message });

  const { data: row } = await admin.from("integrations").select("config, enabled").eq("id", body.id).single();
  const { data: secret } = await admin.rpc("integration_secret", { p_id: body.id });
  let result: Result;
  if (!secret) {
    result = { ok: false, error: "No key saved yet." };
  } else {
    try {
      result = await TESTERS[body.id](secret as string, (row?.config ?? {}) as Config);
    } catch (e) {
      result = { ok: false, error: e instanceof DOMException && e.name === "AbortError"
        ? "The service did not answer within 10 seconds." : "Could not reach the service." };
    }
  }
  await admin.rpc("integration_record_test", {
    p_id: body.id, p_actor: who.user.id, p_ok: result.ok, p_error: result.error ?? null, p_details: result.details ?? {},
  });
  return json(200, result);
});
