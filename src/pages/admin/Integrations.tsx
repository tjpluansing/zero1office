import { AlertTriangle, CheckCircle2, CircleDashed, Copy, ExternalLink, KeyRound, Lock, PauseCircle, PlugZap, RotateCw, ShieldCheck, Webhook } from "lucide-react";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { useAuth } from "../../auth/AuthProvider";
import { Alert, Badge, Button, Drawer, Field, Input, Modal, PageHeader, Select, Spinner, Toggle, cx, relativeTime } from "../../components/ui";
import { api, errorText } from "../../lib/api";
import type { IntegrationAlert, IntegrationEvent, IntegrationId, IntegrationRow, SyncLog, TestResult } from "../../lib/types";

interface FieldDef {
  key: string;
  label: string;
  hint?: string;
  type?: "text" | "email" | "toggle" | "select" | "number" | "date";
  options?: { value: string; label: string }[];
  required?: boolean;
  placeholder?: string;
}

interface ServiceDef {
  id: IntegrationId;
  tagline: string;
  color: string;
  initials: string;
  powers: string[];
  secretLabel: string;
  secretHint: string;
  fields: FieldDef[];
  steps: ReactNode[];
  docs: { label: string; url: string };
  privacy: string;
}

const SERVICES: ServiceDef[] = [
  {
    id: "ghl",
    tagline: "CRM, inbox, forms and automations (client-facing hub)",
    color: "#155EEF",
    initials: "HL",
    powers: ["Pull new leads and contacts into the Client Masterlist", "Show GHL conversations next to each client", "Let AI employees log notes and tasks back to GHL"],
    secretLabel: "Private Integration token",
    secretHint: "Starts with pit-. Shown once in GHL when you create it.",
    fields: [
      { key: "location_id", label: "Location (sub-account) ID", required: true, hint: "GHL → Settings → Business Profile, or the ID in your GHL web address after /location/." },
      { key: "sync_contacts", label: "Sync contacts", type: "toggle" },
      { key: "sync_conversations", label: "Show conversations", type: "toggle" },
    ],
    steps: [
      <>In GHL open <b>Settings → Private Integrations</b> and click <b>Create new integration</b>.</>,
      <>Name it <b>zero1office</b>. Tick only the scopes you need: <i>View Locations</i>, <i>View/Edit Contacts</i>, <i>View Conversations</i>.</>,
      <>Copy the token (it is shown once) and paste it here with your Location ID, then press <b>Test connection</b>.</>,
      <>Set a reminder to rotate the token every 90 days.</>,
    ],
    docs: { label: "GHL Private Integrations", url: "https://help.gohighlevel.com/support/solutions/articles/155000003054-private-integrations-everything-you-need-to-know" },
    privacy: "Client contact details flow between GHL and zero1office. GHL stores data outside the Philippines, so list it in your privacy notice as a data processor.",
  },
  {
    id: "m365",
    tagline: "Send email from @ask-karla.com and read calendars",
    color: "#0078D4",
    initials: "MS",
    powers: ["Send statements, reminders and proposals from a company mailbox", "Show Karla's availability for client meetings", "Sign-in with Microsoft is set up separately in Supabase (see README)"],
    secretLabel: "Client secret (value)",
    secretHint: "Entra ID → App registrations → your app → Certificates & secrets. Copy the Value, not the Secret ID.",
    fields: [
      { key: "tenant_id", label: "Directory (tenant) ID", required: true },
      { key: "client_id", label: "Application (client) ID", required: true },
      { key: "secret_expires_on", label: "Client secret expires on", type: "date", hint: "Shown next to the secret in Entra ID. You'll get a reminder 30 days before." },
      { key: "mailbox", label: "Mailbox the app may use", type: "email", placeholder: "noreply@ask-karla.com", hint: "Use one shared mailbox, not a person's inbox." },
      { key: "send_email", label: "Allow sending email", type: "toggle" },
      { key: "read_calendar", label: "Allow reading calendars", type: "toggle" },
    ],
    steps: [
      <>In <b>portal.azure.com → Entra ID → App registrations</b>, create <b>zero1office-mail</b> (single tenant).</>,
      <>Create a shared mailbox such as <b>noreply@ask-karla.com</b> in the Microsoft 365 admin center (free, no licence).</>,
      <>Limit the app to that one mailbox with <b>RBAC for Applications</b> in Exchange Online, then give it <i>Mail.Send</i> (and <i>Calendars.Read</i> if needed). Without this, the app could send as anyone.</>,
      <>Create a client secret (12 months max), paste the IDs and secret here, then <b>Test connection</b>.</>,
    ],
    docs: { label: "Limit app access to one mailbox", url: "https://learn.microsoft.com/en-us/exchange/permissions-exo/application-rbac" },
    privacy: "Email stays in your Microsoft 365 tenant. The app only gets the mailbox you scope it to.",
  },
  {
    id: "anthropic",
    tagline: "Powers the AI employees (drafting, summaries, matching)",
    color: "#D97757",
    initials: "AI",
    powers: ["Kara, Maya, Quinn and the other AI employees draft and summarise", "Plan comparisons and proposal first drafts", "Usage tracked against a monthly budget"],
    secretLabel: "API key",
    secretHint: "Claude Console → API keys. Use a key in a workspace made only for zero1office.",
    fields: [
      { key: "default_model", label: "Default model", type: "select", options: [
        { value: "claude-sonnet-5-5", label: "Claude Sonnet 5.5 (recommended)" },
        { value: "claude-opus-5-5", label: "Claude Opus 5.5 (most capable)" },
        { value: "claude-haiku-5-5", label: "Claude Haiku 5.5 (fastest, cheapest)" },
      ] },
      { key: "monthly_budget_usd", label: "Monthly budget (USD)", type: "number", placeholder: "50", hint: "Also set a spend limit on the workspace in the Claude Console." },
    ],
    steps: [
      <>In the <b>Claude Console</b>, create a workspace called <b>zero1office</b> and set its monthly spend limit.</>,
      <>Create an API key in that workspace and paste it here.</>,
      <>Choose the default model, then <b>Test connection</b>.</>,
    ],
    docs: { label: "Claude API docs", url: "https://docs.claude.com/en/api/overview" },
    privacy: "Send only what a task needs. Remove IDs and health details before text goes to the AI.",
  },
];

const STATUS: Record<IntegrationRow["status"], { label: string; tone: "green" | "red" | "amber" | "slate"; icon: typeof CheckCircle2 }> = {
  connected: { label: "Connected", tone: "green", icon: CheckCircle2 },
  error: { label: "Needs attention", tone: "red", icon: AlertTriangle },
  untested: { label: "Not tested", tone: "amber", icon: CircleDashed },
  paused: { label: "Paused", tone: "slate", icon: PauseCircle },
  not_connected: { label: "Not connected", tone: "slate", icon: PlugZap },
};

const PLANNED = [
  { name: "GHL two-way sync", note: "Notes, tasks and status changes from zero1office written back to the GHL contact." },
  { name: "Canva Pro", note: "Fill brand templates for proposals and greetings from client data." },
  { name: "OneDrive Transit folder", note: "Hand documents to insurers, then auto-delete after submission." },
];

function ageDays(iso: string | null) {
  return iso ? Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000) : null;
}

export default function IntegrationsPage() {
  const { can, access } = useAuth();
  const [rows, setRows] = useState<IntegrationRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<ServiceDef | null>(null);
  const [alerts, setAlerts] = useState<IntegrationAlert[]>([]);

  const load = useCallback(() => Promise.all([api.listIntegrations(), api.getIntegrationAlerts()])
    .then(([r, a]) => { setRows(r); setAlerts(a); }).catch((e) => setError(errorText(e))), []);
  useEffect(() => { void load(); }, [load]);

  const connected = rows?.filter((r) => r.status === "connected").length ?? 0;

  return (
    <div>
      <PageHeader title="Integrations"
        description="Connect the services zero1office works with. Keys are encrypted on the server and never shown again after saving." />

      <div className="mb-5 flex flex-wrap gap-3 text-sm">
        <div className="flex items-center gap-2 rounded-lg border bg-white px-3 py-2"><PlugZap className="h-4 w-4 text-gold" /> {connected} of {SERVICES.length} connected</div>
        <div className="flex items-center gap-2 rounded-lg border bg-white px-3 py-2"><Lock className="h-4 w-4 text-navy" /> Keys stored in Supabase Vault</div>
        <div className="flex items-center gap-2 rounded-lg border bg-white px-3 py-2"><ShieldCheck className="h-4 w-4 text-navy" /> Changes need two-step and are logged</div>
      </div>

      {error && <div className="mb-4"><Alert>{error}</Alert></div>}
      {alerts.length > 0 && (
        <div className="mb-5 space-y-2">
          {alerts.map((a) => {
            const svc = SERVICES.find((s) => s.id === a.integration_id);
            return (
              <div key={a.alert_key} className={cx("flex flex-wrap items-center gap-3 rounded-xl border px-4 py-3",
                a.severity === "red" ? "border-red-200 bg-red-50" : "border-amber-200 bg-amber-50")}>
                <AlertTriangle className={cx("h-4 w-4 shrink-0", a.severity === "red" ? "text-red-600" : "text-amber-600")} />
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-semibold text-navy">{a.title}</div>
                  <div className="text-xs text-slate-600">{a.detail}</div>
                </div>
                {svc && !a.alert_key.startsWith("sync_") && <Button onClick={() => setOpen(svc)}>Open {rows?.find((r) => r.id === svc.id)?.name ?? ""}</Button>}
                {a.alert_key.startsWith("sync_") && <Button onClick={() => document.getElementById("sync-log")?.scrollIntoView({ behavior: "smooth" })}>Open sync log</Button>}
              </div>
            );
          })}
          <p className="text-xs text-slate-500">Super Admins are also emailed about new alerts once a day.</p>
        </div>
      )}
      {!rows ? <div className="grid h-40 place-items-center"><Spinner /></div> : (
        <div className="grid gap-4 lg:grid-cols-3">
          {SERVICES.map((svc) => {
            const row = rows.find((r) => r.id === svc.id);
            if (!row) return null;
            const st = STATUS[row.status];
            const keyAge = ageDays(row.secret_set_at);
            return (
              <div key={svc.id} className="flex flex-col rounded-xl border bg-white p-5">
                <div className="flex items-start gap-3">
                  <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl text-sm font-bold text-white" style={{ background: svc.color }}>{svc.initials}</div>
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold text-navy">{row.name}</div>
                    <div className="text-xs text-slate-500">{svc.tagline}</div>
                  </div>
                </div>
                <div className="mt-4 flex items-center gap-2">
                  <Badge tone={st.tone}><st.icon className="h-3 w-3" />{st.label}</Badge>
                  {row.secret_hint && <span className="font-mono text-xs text-slate-400">•••• {row.secret_hint}</span>}
                </div>
                {row.status === "error" && row.last_error && <p className="mt-2 text-xs text-red-700">{row.last_error}</p>}
                <ul className="mt-4 flex-1 space-y-1.5 text-sm text-slate-600">
                  {svc.powers.map((p) => <li key={p} className="flex gap-2"><span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-gold" />{p}</li>)}
                </ul>
                <div className="mt-4 space-y-1 border-t pt-3 text-xs text-slate-500">
                  <div>Last test: {row.last_tested_at ? `${relativeTime(row.last_tested_at)} · ${row.last_test_ok ? "passed" : "failed"}` : "never"}</div>
                  {typeof row.config.secret_expires_on === "string" && row.config.secret_expires_on && (
                    <div>Secret expires {new Date(row.config.secret_expires_on).toLocaleDateString("en-PH", { day: "numeric", month: "short", year: "numeric" })}</div>
                  )}
                  {keyAge !== null && <div className={cx(keyAge > 90 && "font-medium text-amber-700")}>Key saved {keyAge === 0 ? "today" : `${keyAge} days ago`}{keyAge > 90 && " · time to rotate"}</div>}
                </div>
                <Button className="mt-4 w-full" variant={row.status === "not_connected" ? "primary" : "secondary"} onClick={() => setOpen(svc)}>
                  {row.status === "not_connected" ? (can("integrations.edit") ? "Connect" : "View setup") : "Manage"}
                </Button>
              </div>
            );
          })}
        </div>
      )}

      {rows?.find((r) => r.id === "ghl" && (r.status !== "not_connected" || r.last_event_at)) && (
        <SyncLogSection canEdit={can("integrations.edit")} />
      )}

      <h2 className="mb-3 mt-10 text-sm font-semibold uppercase tracking-wide text-slate-500">Planned next</h2>
      <div className="grid gap-3 sm:grid-cols-3">
        {PLANNED.map((p) => (
          <div key={p.name} className="rounded-xl border border-dashed bg-white/60 p-4">
            <div className="text-sm font-medium text-navy">{p.name}</div>
            <div className="mt-1 text-xs text-slate-500">{p.note}</div>
          </div>
        ))}
      </div>

      {open && rows && (
        <IntegrationDrawer svc={open} row={rows.find((r) => r.id === open.id)!} canEdit={can("integrations.edit")}
          actorIsSuper={!!access?.is_super} onClose={() => setOpen(null)} onChanged={() => void load()} />
      )}
    </div>
  );
}

function IntegrationDrawer({ svc, row, canEdit, onClose, onChanged }: {
  svc: ServiceDef; row: IntegrationRow; canEdit: boolean; actorIsSuper: boolean; onClose: () => void; onChanged: () => void;
}) {
  const [config, setConfig] = useState<IntegrationRow["config"]>({ ...row.config });
  const [secret, setSecret] = useState("");
  const [enabled, setEnabled] = useState(row.status === "not_connected" ? true : row.enabled);
  const [busy, setBusy] = useState<"save" | "test" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [test, setTest] = useState<TestResult | null>(null);
  const [confirmOff, setConfirmOff] = useState(false);

  const hasKey = !!row.secret_hint;
  const missing = svc.fields.filter((f) => f.required && !String(config[f.key] ?? "").trim());
  const dirty = secret.trim() !== "" || enabled !== row.enabled || JSON.stringify(config) !== JSON.stringify(row.config);

  async function save(andTest: boolean) {
    setBusy(andTest ? "test" : "save");
    setError(null);
    setTest(null);
    try {
      if (dirty) {
        await api.saveIntegration(svc.id, config, secret.trim() || null, enabled);
        setSecret("");
      }
      if (andTest) setTest(await api.testIntegration(svc.id));
      onChanged();
    } catch (e) {
      setError(errorText(e));
    }
    setBusy(null);
  }

  async function disconnect() {
    setConfirmOff(false);
    try {
      await api.disconnectIntegration(svc.id);
      onChanged();
      onClose();
    } catch (e) { setError(errorText(e)); }
  }

  const set = (k: string, v: string | number | boolean) => setConfig({ ...config, [k]: v });

  return (
    <Drawer title={row.name} subtitle={svc.tagline} onClose={onClose} footer={canEdit ? <>
      {hasKey && <Button variant="ghost" className="mr-auto text-red-600 hover:bg-red-50" onClick={() => setConfirmOff(true)}>Disconnect</Button>}
      <Button onClick={() => save(false)} loading={busy === "save"} disabled={!dirty || (!hasKey && !secret.trim())}>Save</Button>
      <Button variant="primary" onClick={() => save(true)} loading={busy === "test"} disabled={(!hasKey && !secret.trim()) || missing.length > 0}>
        {dirty ? "Save and test" : "Test connection"}
      </Button>
    </> : <Button onClick={onClose}>Close</Button>}>
      <div className="space-y-6">
        {!canEdit && <Alert tone="amber">You can view this connection but not change it.</Alert>}
        {error && <Alert>{error}</Alert>}
        {test && (test.ok
          ? <Alert tone="green"><b>Connected.</b>{" "}{Object.entries(test.details ?? {}).filter(([, v]) => v && typeof v !== "object").map(([k, v]) => `${k}: ${String(v)}`).join(" · ")}</Alert>
          : <Alert><b>Test failed.</b> {test.error}</Alert>)}

        <section>
          <h3 className="mb-2 text-sm font-semibold text-navy">Set up</h3>
          <ol className="space-y-2 text-sm text-slate-700">
            {svc.steps.map((s, i) => (
              <li key={i} className="flex gap-2">
                <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-gold text-[11px] font-semibold text-navy">{i + 1}</span>
                <span>{s}</span>
              </li>
            ))}
          </ol>
          <a href={svc.docs.url} target="_blank" rel="noreferrer noopener" className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-navy-600 hover:underline">
            {svc.docs.label} <ExternalLink className="h-3 w-3" />
          </a>
        </section>

        <section className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Field label={svc.secretLabel} hint={hasKey ? `Saved (•••• ${row.secret_hint}). Leave blank to keep it, or paste a new one to replace it.` : svc.secretHint}>
              <div className="relative">
                <KeyRound className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                <Input type="password" autoComplete="off" spellCheck={false} value={secret} disabled={!canEdit}
                  onChange={(e) => setSecret(e.target.value)} className="pl-9 font-mono" placeholder={hasKey ? "••••••••••••••••" : "Paste here"} />
              </div>
            </Field>
          </div>
          {svc.fields.map((f) => {
            const v = config[f.key];
            if (f.type === "toggle") {
              return (
                <div key={f.key} className="flex items-center justify-between rounded-lg border px-3 py-2">
                  <span className="text-sm">{f.label}</span>
                  <Toggle label={f.label} checked={!!v} disabled={!canEdit} onChange={(x) => set(f.key, x)} />
                </div>
              );
            }
            if (f.type === "select") {
              return (
                <Field key={f.key} label={f.label} hint={f.hint}>
                  <Select value={String(v ?? f.options![0].value)} disabled={!canEdit} onChange={(e) => set(f.key, e.target.value)}>
                    {f.options!.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </Select>
                </Field>
              );
            }
            return (
              <Field key={f.key} label={f.label + (f.required ? "" : " (optional)")} hint={f.hint}>
                <Input type={f.type ?? "text"} value={String(v ?? "")} placeholder={f.placeholder} disabled={!canEdit}
                  onChange={(e) => set(f.key, f.type === "number" ? Number(e.target.value) || 0 : e.target.value.trim())} />
              </Field>
            );
          })}
          <div className="flex items-center justify-between rounded-lg border px-3 py-2 sm:col-span-2">
            <div>
              <div className="text-sm font-medium">Active</div>
              <div className="text-xs text-slate-500">Pause to stop all traffic without deleting the key.</div>
            </div>
            <Toggle label="Active" checked={enabled} disabled={!canEdit} onChange={setEnabled} />
          </div>
        </section>

        {svc.id === "ghl" && (
          <WebhookSection row={row} canEdit={canEdit} on={!!config.webhook_enabled}
            onToggle={(x) => set("webhook_enabled", x)} onChanged={onChanged} />
        )}

        <Alert tone="navy"><b>Privacy:</b> {svc.privacy}</Alert>
      </div>

      {confirmOff && (
        <Modal title={`Disconnect ${row.name}?`} onClose={() => setConfirmOff(false)} footer={<>
          <Button onClick={() => setConfirmOff(false)}>Cancel</Button>
          <Button variant="danger" onClick={disconnect}>Disconnect and delete key</Button>
        </>}>
          <p className="text-sm">The saved key is deleted from the vault and everything that uses {row.name} stops. Also revoke the key in {row.name} itself.</p>
        </Modal>
      )}
    </Drawer>
  );
}

function CopyButton({ text }: { text: string }) {
  const [done, setDone] = useState(false);
  return (
    <Button variant="ghost" className="shrink-0" onClick={() => {
      void navigator.clipboard?.writeText(text).then(() => { setDone(true); setTimeout(() => setDone(false), 1500); });
    }}>
      <Copy className="h-4 w-4" /> {done ? "Copied" : "Copy"}
    </Button>
  );
}

function WebhookSection({ row, canEdit, on, onToggle, onChanged }: {
  row: IntegrationRow; canEdit: boolean; on: boolean; onToggle: (on: boolean) => void; onChanged: () => void;
}) {
  const url = api.webhookUrl(row.id);
  const [secret, setSecret] = useState<string | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function create() {
    setConfirm(false);
    setBusy(true);
    setError(null);
    try {
      setSecret(await api.newWebhookSecret(row.id));
      onChanged();
    } catch (e) { setError(errorText(e)); }
    setBusy(false);
  }

  return (
    <section className="rounded-xl border p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="flex items-center gap-2 text-sm font-semibold text-navy"><Webhook className="h-4 w-4" /> Instant updates (webhooks)</h3>
          <p className="mt-0.5 text-xs text-slate-500">GHL tells zero1office the moment a contact is added or changed. Every delivery is checked, stored once, and retried if it fails.</p>
        </div>
        <Toggle label="Receive webhooks" checked={on} disabled={!canEdit} onChange={onToggle} />
      </div>
      {error && <div className="mt-3"><Alert>{error}</Alert></div>}
      {on && (
        <div className="mt-4 space-y-4 text-sm">
          <Field label="Webhook URL" hint="Paste this into GHL. It only accepts deliveries with your secret or GHL's own signature.">
            <div className="flex gap-2">
              <Input readOnly value={url ?? "https://<your-project>.supabase.co/functions/v1/ghl-webhook"} className="font-mono text-xs" />
              {url && <CopyButton text={url} />}
            </div>
          </Field>
          <div className="flex items-center justify-between gap-3 rounded-lg bg-slate-50 px-3 py-2">
            <div>
              <div className="font-medium">Webhook secret</div>
              <div className="text-xs text-slate-500">
                {row.webhook_secret_hint ? <>Set {relativeTime(row.webhook_secret_set_at).toLowerCase()} · ends in <span className="font-mono">{row.webhook_secret_hint}</span></> : "Not created yet"}
              </div>
            </div>
            {canEdit && (
              <Button loading={busy} onClick={() => (row.webhook_secret_hint ? setConfirm(true) : void create())}>
                <KeyRound className="h-4 w-4" /> {row.webhook_secret_hint ? "Replace" : "Create secret"}
              </Button>
            )}
          </div>
          {secret && (
            <Alert tone="amber">
              <div className="mb-1"><b>Copy this now.</b> It will not be shown again.</div>
              <div className="flex items-center gap-2">
                <code className="block min-w-0 flex-1 break-all rounded bg-white px-2 py-1 text-xs">{secret}</code>
                <CopyButton text={secret} />
              </div>
            </Alert>
          )}
          <ol className="space-y-2 text-slate-700">
            {[
              <>In GHL open <b>Automation → Workflows</b> and create <b>zero1office contact sync</b>.</>,
              <>Add the triggers <b>Contact Created</b> and <b>Contact Changed</b>.</>,
              <>Add the action <b>Custom Webhook</b>: method <b>POST</b>, the URL above, and a header <code className="rounded bg-slate-100 px-1">X-Webhook-Secret</code> with your secret. Send the contact's name, email, phone, company and ID.</>,
              <>Publish the workflow, add a test contact, and check the <b>GoHighLevel sync log</b> on the Integrations page.</>,
            ].map((s, i) => (
              <li key={i} className="flex gap-2">
                <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-gold text-[11px] font-semibold text-navy">{i + 1}</span>
                <span>{s}</span>
              </li>
            ))}
          </ol>
          <p className="text-xs text-slate-500">Turn on <b>Sync contacts</b> above so contacts are added to the Client Masterlist. A contact deleted in GHL is never deleted here.</p>
        </div>
      )}
      {confirm && (
        <Modal title="Replace the webhook secret?" onClose={() => setConfirm(false)} footer={<>
          <Button onClick={() => setConfirm(false)}>Cancel</Button>
          <Button variant="danger" onClick={create}>Replace secret</Button>
        </>}>
          <p className="text-sm">The old secret stops working at once. Updates from GHL will be refused until you paste the new one into the GHL workflow.</p>
        </Modal>
      )}
    </section>
  );
}

const EVENT_STATUS: Record<IntegrationEvent["status"], { label: string; tone: "green" | "red" | "amber" | "slate" | "navy" }> = {
  done: { label: "Done", tone: "green" },
  ignored: { label: "Skipped", tone: "slate" },
  pending: { label: "Queued", tone: "navy" },
  retrying: { label: "Will retry", tone: "amber" },
  failed: { label: "Failed", tone: "red" },
};

function untilText(iso: string) {
  const mins = Math.round((new Date(iso).getTime() - Date.now()) / 60_000);
  if (mins <= 0) return "next run";
  return mins < 60 ? `in ${mins} min` : `in ${Math.round(mins / 60)} h`;
}

function SyncLogSection({ canEdit }: { canEdit: boolean }) {
  const [log, setLog] = useState<SyncLog | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<number | null>(null);
  const [filter, setFilter] = useState<"all" | "problems">("all");

  const load = useCallback(() => api.getSyncLog("ghl").then(setLog).catch((e) => setError(errorText(e))), []);
  useEffect(() => { void load(); }, [load]);

  async function retry(id: number) {
    setBusy(id);
    setError(null);
    try { await api.retryEvent(id); await load(); } catch (e) { setError(errorText(e)); }
    setBusy(null);
  }

  const events = log?.events ?? [];
  const waiting = events.filter((e) => e.status === "retrying" || e.status === "pending").length;
  const failed = events.filter((e) => e.status === "failed").length;
  const shown = filter === "all" ? events : events.filter((e) => e.status === "failed" || e.status === "retrying");

  return (
    <section id="sync-log" className="mt-10 scroll-mt-6">
      <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">GoHighLevel sync log</h2>
          <p className="text-xs text-slate-500">Last 100 updates from GHL. Failed ones retry by themselves (1, 4, 16, 64 min, 4 h, 6 h), then wait for you.</p>
        </div>
        <div className="flex gap-2">
          <Select value={filter} onChange={(e) => setFilter(e.target.value as "all" | "problems")} className="w-auto">
            <option value="all">All updates</option>
            <option value="problems">Only problems</option>
          </Select>
          <Button onClick={() => void load()}><RotateCw className="h-4 w-4" /> Refresh</Button>
        </div>
      </div>
      {error && <div className="mb-3"><Alert>{error}</Alert></div>}
      {!log ? <div className="grid h-24 place-items-center"><Spinner /></div> : <>
        <div className="mb-3 grid gap-3 sm:grid-cols-3">
          <div className="rounded-xl border bg-white px-4 py-3">
            <div className="text-xs text-slate-500">Last update received</div>
            <div className="mt-0.5 font-semibold text-navy">{events[0] ? relativeTime(events[0].received_at) : "None yet"}</div>
          </div>
          <div className={cx("rounded-xl border px-4 py-3", waiting ? "border-amber-300 bg-amber-50" : "bg-white")}>
            <div className="text-xs text-slate-500">Waiting to retry</div>
            <div className="mt-0.5 font-semibold text-navy">{waiting}</div>
          </div>
          <div className={cx("rounded-xl border px-4 py-3", failed ? "border-red-300 bg-red-50" : "bg-white")}>
            <div className="text-xs text-slate-500">Failed, needs a look</div>
            <div className="mt-0.5 font-semibold text-navy">{failed}</div>
          </div>
        </div>
        <div className="overflow-x-auto rounded-xl border bg-white">
          <table className="w-full min-w-[760px] text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr><th className="px-4 py-2.5">When</th><th className="px-4 py-2.5">Update</th><th className="px-4 py-2.5">Status</th><th className="px-4 py-2.5">Result</th><th className="px-4 py-2.5" /></tr>
            </thead>
            <tbody className="divide-y">
              {shown.map((e) => {
                const st = EVENT_STATUS[e.status];
                return (
                  <tr key={e.id}>
                    <td className="whitespace-nowrap px-4 py-2.5 text-slate-500" title={e.received_at}>{relativeTime(e.received_at)}</td>
                    <td className="px-4 py-2.5">
                      <div className="font-medium">{e.event_type}{e.summary && <span className="font-normal text-slate-500"> · {e.summary}</span>}</div>
                      <div className="text-xs text-slate-400">{e.verified_by === "ghl_signature" ? "GHL signature verified" : e.verified_by === "webhook_secret" ? "Workflow secret verified" : "Test"}</div>
                    </td>
                    <td className="px-4 py-2.5"><Badge tone={st.tone}>{st.label}</Badge>
                      {e.attempts > 1 && <div className="mt-0.5 text-xs text-slate-400">{e.attempts} tries</div>}</td>
                    <td className="px-4 py-2.5 text-slate-600">
                      {e.status === "retrying" ? <><span className="text-amber-800">{e.last_error}</span><div className="text-xs text-slate-400">Next try {untilText(e.next_attempt_at)}</div></>
                        : e.status === "failed" ? <span className="text-red-700">{e.last_error}</span>
                        : e.result?.replace(/^ignored: /, "") ?? "—"}
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      {canEdit && (e.status === "failed" || e.status === "retrying") && (
                        <Button loading={busy === e.id} onClick={() => void retry(e.id)}><RotateCw className="h-4 w-4" /> Retry now</Button>
                      )}
                    </td>
                  </tr>
                );
              })}
              {shown.length === 0 && <tr><td colSpan={5} className="px-4 py-10 text-center text-slate-500">
                {events.length === 0 ? "Nothing received yet. Turn on webhooks in GoHighLevel → Manage." : "No problems. Everything was processed."}
              </td></tr>}
            </tbody>
          </table>
        </div>
        {log.runs.length > 0 && (
          <p className="mt-2 text-xs text-slate-500">
            Last run {relativeTime(log.runs[0].started_at)} ({log.runs[0].trigger}): {log.runs[0].succeeded} done, {log.runs[0].ignored} skipped, {log.runs[0].will_retry} to retry, {log.runs[0].failed} failed.
          </p>
        )}
      </>}
    </section>
  );
}
