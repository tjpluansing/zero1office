// Zero1Office: the AI brain on app.ask-karla.com (Paolo, 2026-11-27: "I also want the option connect different AI's
// such as Chatgpt etc.").
// The app's AI features (Ask Kara, live chat replies with the AI employees) ask this function. It checks the caller
// is an active member (z1_member), reads which AI the office uses from app_docs meta/ai ({provider, models}, set by a
// Super Admin in Settings > AI brain), and calls that provider with its key. Keys are Supabase secrets and never
// reach the browser:
//   ANTHROPIC_API_KEY  Claude (Anthropic)
//   OPENAI_API_KEY     ChatGPT (OpenAI)
//   GEMINI_API_KEY     Gemini (Google)
// Add only the ones you use. Requests:
//   {op: "status"}                                   -> {providers: {anthropic: bool, openai: bool, gemini: bool}, provider, model}
//   {op: "ask", input: string | [{role, content}], tier?: "quick"|"default"|"complex", provider?, model?}
//                                                    -> {text, provider, model}
//   provider/model in a request are honoured only for a Super Admin (the "Test" button in Settings > AI brain).
// Deploy: Supabase > Edge Functions > Deploy a new function > name "z1-ai" > paste this file. Then Edge Functions >
// Secrets: add the key(s). Turn off "Verify JWT with legacy secret" as for z1-admin.
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

type Provider = "anthropic" | "openai" | "gemini";
type Msg = { role: "user" | "assistant"; content: string };
const SECRET: Record<Provider, string> = { anthropic: "ANTHROPIC_API_KEY", openai: "OPENAI_API_KEY", gemini: "GEMINI_API_KEY" };
// Defaults when Settings > AI brain leaves the model empty. "quick" is the cheaper model for short jobs.
const DEFAULTS: Record<Provider, { default: string; quick: string }> = {
  anthropic: { default: "claude-sonnet-5-5", quick: "claude-haiku-5-5" },
  openai: { default: "gpt-5", quick: "gpt-5-mini" },
  gemini: { default: "gemini-2.5-pro", quick: "gemini-2.5-flash" },
};
const has = (p: Provider) => !!Deno.env.get(SECRET[p]);
const isProvider = (p: unknown): p is Provider => p === "anthropic" || p === "openai" || p === "gemini";

function messages(input: unknown): Msg[] | string {
  if (typeof input === "string") return input.trim() ? [{ role: "user", content: input.slice(0, 60000) }] : "Nothing to ask.";
  if (!Array.isArray(input) || !input.length) return "Nothing to ask.";
  const out: Msg[] = [];
  for (const m of input.slice(-40)) {
    const role = (m as Msg)?.role === "assistant" ? "assistant" : "user";
    out.push({ role, content: String((m as Msg)?.content ?? "").slice(0, 60000) });
  }
  if (out[out.length - 1].role !== "user") return "The last message must be the user's.";
  return out;
}

async function ask(p: Provider, model: string, msgs: Msg[]): Promise<string> {
  const k = Deno.env.get(SECRET[p])!;
  if (p === "anthropic") {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": k, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({ model, max_tokens: 2048, messages: msgs }),
    });
    const b = await r.json().catch(() => ({}));
    if (!r.ok) throw { status: r.status, message: b?.error?.message || "Claude said no (" + r.status + ")." };
    return (b.content ?? []).filter((c: { type: string }) => c.type === "text").map((c: { text: string }) => c.text).join("");
  }
  if (p === "openai") {
    const r = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: "Bearer " + k, "content-type": "application/json" },
      body: JSON.stringify({ model, max_completion_tokens: 4096, messages: msgs }),
    });
    const b = await r.json().catch(() => ({}));
    if (!r.ok) throw { status: r.status, message: b?.error?.message || "ChatGPT said no (" + r.status + ")." };
    return String(b.choices?.[0]?.message?.content ?? "");
  }
  const r = await fetch("https://generativelanguage.googleapis.com/v1beta/models/" + encodeURIComponent(model) + ":generateContent", {
    method: "POST",
    headers: { "x-goog-api-key": k, "content-type": "application/json" },
    body: JSON.stringify({
      contents: msgs.map((m) => ({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.content }] })),
      generationConfig: { maxOutputTokens: 4096 },
    }),
  });
  const b = await r.json().catch(() => ({}));
  if (!r.ok) throw { status: r.status, message: b?.error?.message || "Gemini said no (" + r.status + ")." };
  return (b.candidates?.[0]?.content?.parts ?? []).map((x: { text?: string }) => x.text ?? "").join("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Use POST" }, 405);
  const asCaller = createClient(Deno.env.get("SUPABASE_URL")!, key("SUPABASE_ANON_KEY", "SUPABASE_PUBLISHABLE_KEYS"),
    { global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } } });
  const { data: ok, error } = await asCaller.rpc("z1_member");
  if (error || ok !== true) return json({ error: "Sign in again to use the AI." }, 403);

  let body: { op?: string; input?: unknown; tier?: string; provider?: unknown; model?: unknown };
  try { body = await req.json(); } catch { return json({ error: "Bad request" }, 400); }

  const { data: row } = await asCaller.from("app_docs").select("data").eq("path", "meta/ai").maybeSingle();
  const cfg = (row?.data ?? {}) as { provider?: string; models?: Record<string, string> };
  let provider: Provider | null = isProvider(cfg.provider) && has(cfg.provider) ? cfg.provider : null;
  if (!provider) provider = (["anthropic", "openai", "gemini"] as Provider[]).find(has) ?? null;
  // A model picked in Settings > AI brain is used for everything; otherwise the default, or the quick one for short jobs.
  const pick = (p: Provider, tier: string) => (cfg.models?.[p] ?? "").trim() || DEFAULTS[p][tier === "quick" ? "quick" : "default"];

  if (body.op === "status") {
    return json({ providers: { anthropic: has("anthropic"), openai: has("openai"), gemini: has("gemini") }, provider, model: provider ? pick(provider, "default") : null });
  }
  if (body.op !== "ask") return json({ error: "That isn't allowed." }, 400);

  // A Super Admin may test another provider or model before switching to it.
  if (body.provider !== undefined || body.model !== undefined) {
    const { data: admin } = await asCaller.rpc("z1_admin");
    if (admin !== true) return json({ error: "Only a Super Admin can test another AI." }, 403);
    if (!isProvider(body.provider) || !has(body.provider)) return json({ error: "That AI has no key yet. Add it in Supabase > Edge Functions > Secrets." }, 400);
    provider = body.provider;
  }
  if (!provider) return json({ error: "No AI is connected yet. Add an API key in Supabase, then pick it in Settings > AI brain.", code: "unavailable" }, 503);

  const msgs = messages(body.input);
  if (typeof msgs === "string") return json({ error: msgs }, 400);
  const model = typeof body.model === "string" && body.model.trim() ? body.model.trim().slice(0, 80) : pick(provider, String(body.tier ?? "default"));
  try {
    const text = await ask(provider, model, msgs);
    return json({ text, provider, model });
  } catch (e) {
    const err = e as { status?: number; message?: string };
    const code = err.status === 429 ? "rate_limited" : err.status === 401 || err.status === 403 ? "bad_key" : "upstream_error";
    return json({ error: err.message ?? "The AI didn't answer.", code }, err.status === 429 ? 429 : 502);
  }
});
