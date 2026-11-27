// Zero1Office: Firecrawl for Leads > Find businesses on app.ask-karla.com (Paolo, 2026-11-27).
// The app asks for one of three things; this function checks the caller is an active member (z1_member),
// keeps only the fields the app needs, and calls Firecrawl with the FIRECRAWL_API_KEY secret, which never
// reaches the browser.
//   firecrawl_search        -> POST /v2/search   (websites, Facebook pages, LinkedIn company pages)
//   firecrawl_scrape        -> POST /v2/scrape   (Check website: one page as markdown)
//   alexandria_library_read -> POST /v2/scrape   (Google Maps listings: firecrawl-maps businesses/search only)
// Deploy: Supabase > Edge Functions > Deploy a new function > name "z1-firecrawl" > paste this file.
// Then Edge Functions > Secrets: add FIRECRAWL_API_KEY. Turn off "Verify JWT with legacy secret" as for z1-admin.
import { createClient } from "npm:@supabase/supabase-js@2.49.4";

const cors = {
  "Access-Control-Allow-Origin": Deno.env.get("APP_ORIGIN") ?? "https://app.ask-karla.com",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
function key(legacy: string, list: string): string {
  const v = Deno.env.get(legacy);
  if (v) return v;
  try { const o = JSON.parse(Deno.env.get(list) ?? "{}"); return o.default ?? Object.values(o)[0] ?? ""; } catch { return ""; }
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
const str = (v: unknown, max: number) => String(v ?? "").slice(0, max);

function build(tool: string, input: Record<string, unknown>): [string, Record<string, unknown>] | string {
  if (tool === "firecrawl_search") {
    const query = str(input.query, 400).trim();
    if (!query) return "Type something to search for.";
    return ["/v2/search", { query, limit: Math.min(20, Math.max(1, Number(input.limit) || 10)), location: str(input.location || "Philippines", 60), sources: [{ type: "web" }], domainTools: false }];
  }
  if (tool === "firecrawl_scrape") {
    let u: URL;
    try { u = new URL(str(input.url, 2000)); } catch { return "That website address isn't valid."; }
    if (!/^https?:$/.test(u.protocol)) return "That website address isn't valid.";
    return ["/v2/scrape", { url: u.toString(), formats: ["markdown"], onlyMainContent: input.onlyMainContent === true, timeout: 30000 }];
  }
  if (tool === "alexandria_library_read") {
    const call = Array.isArray(input.calls) ? input.calls[0] as Record<string, unknown> : null;
    if (!call || call.provider !== "firecrawl-maps" || call.capability !== "businesses/search") return "Only the Google Maps business search is allowed here.";
    const o = (call.options ?? {}) as Record<string, unknown>;
    const options: Record<string, unknown> = { query: str(o.query, 200), country: "ph", include_opening_hours: false };
    if (o.cursor) options.cursor = str(o.cursor, 2000);
    return ["/v2/scrape", { alexandria: { provider: "firecrawl-maps", capability: "businesses/search", options } }];
  }
  return "That isn't allowed.";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Use POST" }, 405);
  const apiKey = Deno.env.get("FIRECRAWL_API_KEY");
  if (!apiKey) return json({ error: "Firecrawl isn't set up yet. Ask Paolo to add the Firecrawl key in Supabase." }, 503);
  const asCaller = createClient(Deno.env.get("SUPABASE_URL")!, key("SUPABASE_ANON_KEY", "SUPABASE_PUBLISHABLE_KEYS"),
    { global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } } });
  const { data: ok, error } = await asCaller.rpc("z1_member");
  if (error || ok !== true) return json({ error: "Sign in again to search." }, 403);

  let body: { tool?: string; input?: Record<string, unknown> };
  try { body = await req.json(); } catch { return json({ error: "Bad request" }, 400); }
  const plan = build(String(body.tool ?? ""), body.input ?? {});
  if (typeof plan === "string") return json({ error: plan }, 400);

  const r = await fetch("https://api.firecrawl.dev" + plan[0], {
    method: "POST",
    headers: { Authorization: "Bearer " + apiKey, "Content-Type": "application/json" },
    body: JSON.stringify(plan[1]),
  });
  const out = await r.json().catch(() => ({}));
  if (!r.ok) return json({ error: (out && (out.error || out.message)) || "Firecrawl said no (" + r.status + ")." }, r.status === 402 ? 402 : 502);
  return json(out);
});
