// Supabase Edge Function: ghl-webhook
//
// Receives GoHighLevel webhooks, checks they really came from GHL (or from
// your own GHL workflow), stores each event once, then processes the queue.
// Answers fast; anything that fails is retried later by
// process_integration_events() (see README, "GHL webhooks").
//
// Two ways in, one must pass:
//   1. X-GHL-Signature: Ed25519 signature GHL puts on app webhooks.
//   2. X-Webhook-Secret (or Authorization: Bearer ...): the secret created on
//      Admin → Integrations → GoHighLevel, for Workflow "Custom Webhook" actions.
//
// Deploy without the Supabase JWT check (GHL has no Supabase login):
//   supabase functions deploy ghl-webhook --no-verify-jwt

import { createClient } from "npm:@supabase/supabase-js@2.49.4";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
// GHL's published webhook public key (SPKI, base64). Override if GHL rotates it.
const GHL_PUBLIC_KEY = Deno.env.get("GHL_WEBHOOK_PUBLIC_KEY") ??
  "MCowBQYDK2VwAyEAi2HR1srL4o18O8BRa7gVJY7G7bupbN3H9AwJrHCDiOg=";
const MAX_BYTES = 256 * 1024;

const reply = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

const b64 = (s: string) => Uint8Array.from(atob(s.replace(/\s+/g, "")), (c) => c.charCodeAt(0));

let keyPromise: Promise<CryptoKey> | null = null;
function ghlKey() {
  keyPromise ??= crypto.subtle.importKey("spki", b64(GHL_PUBLIC_KEY), { name: "Ed25519" }, false, ["verify"]);
  return keyPromise;
}

async function validGhlSignature(raw: Uint8Array, signature: string): Promise<boolean> {
  try {
    return await crypto.subtle.verify({ name: "Ed25519" }, await ghlKey(), b64(signature), raw);
  } catch {
    return false;
  }
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return reply(405, { error: "POST only" });
  const length = Number(req.headers.get("content-length") ?? "0");
  if (length > MAX_BYTES) return reply(413, { error: "Too large" });

  const raw = new Uint8Array(await req.arrayBuffer());
  if (raw.byteLength > MAX_BYTES) return reply(413, { error: "Too large" });
  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(new TextDecoder().decode(raw));
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) throw new Error();
  } catch {
    return reply(400, { error: "Expected a JSON object" });
  }

  const db = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
  const { data: row } = await db.from("integrations").select("config").eq("id", "ghl").single();
  if (!row?.config?.webhook_enabled) return reply(403, { error: "Webhooks are turned off" });

  // --- who sent it? ---
  let verifiedBy: "ghl_signature" | "webhook_secret" | null = null;
  const sig = req.headers.get("x-ghl-signature");
  if (sig && await validGhlSignature(raw, sig)) verifiedBy = "ghl_signature";
  if (!verifiedBy) {
    const bearer = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
    const secret = req.headers.get("x-webhook-secret") ?? bearer;
    if (secret?.startsWith("whsec_")) {
      const { data: ok } = await db.rpc("integration_check_webhook_secret", { p_id: "ghl", p_secret: secret });
      if (ok === true) verifiedBy = "webhook_secret";
    }
  }
  if (!verifiedBy) return reply(401, { error: "Signature or secret missing or wrong" });

  // --- store once, then process (failures are retried later) ---
  const eventId = typeof payload.webhookId === "string" ? payload.webhookId : null;
  const { data: id, error } = await db.rpc("ghl_ingest_event", {
    p_event_id: eventId, p_payload: payload, p_verified_by: verifiedBy,
  });
  if (error) return reply(500, { error: "Could not store the event" }); // GHL may resend
  if (id !== null) {
    await db.rpc("process_integration_events", { p_limit: 20, p_trigger: "webhook" }).then(() => {}, () => {});
  }
  return reply(200, { received: true, duplicate: id === null });
});
