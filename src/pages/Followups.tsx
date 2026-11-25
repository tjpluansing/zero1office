import {
  AlertTriangle, Bot, CheckCircle2, Clipboard, ClipboardCheck, Download, Pencil, Plus, RotateCcw, Search, Send, Trash2, XCircle,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "../auth/AuthProvider";
import {
  Alert, Badge, Button, Drawer, Field, Input, Modal, PageHeader, Select, Spinner, Toggle, cx, downloadCsv, relativeTime,
} from "../components/ui";
import { api, errorText } from "../lib/api";
import {
  BUCKET_LABEL, CHANNEL_LABEL, DEFAULT_SETTINGS, KIND_LABEL, MINIMAL_TEXT_ERROR, QUICK_ADD, STATUS_LABEL, STATUS_TONE,
  type Bucket, bucketOf, daysBetween, felixDraft, hasLongNumber, isClosed, sortQueue, todayIso,
} from "../lib/followups";
import type {
  ClientRow, FollowupChannel, FollowupEvent, FollowupInput, FollowupKind, FollowupRow, FollowupSettings, FollowupStatus,
} from "../lib/types";

const INSURERS = ["Maxicare", "Medicard", "Intellicare", "IMS", "KHL", "FWD"];

type Tab = "queue" | "escalated" | "waiting" | "later" | "open" | "closed";
const TABS: { id: Tab; label: string; match: (b: Bucket) => boolean }[] = [
  { id: "queue", label: "Today's queue", match: (b) => b === "escalated" || b === "overdue" || b === "today" },
  { id: "escalated", label: "With Karla", match: (b) => b === "escalated" },
  { id: "waiting", label: "Waiting on reply", match: (b) => b === "waiting" },
  { id: "later", label: "Scheduled", match: (b) => b === "later" },
  { id: "open", label: "All open", match: (b) => b !== "closed" },
  { id: "closed", label: "Closed", match: (b) => b === "closed" },
];

const fmtDate = (iso: string | null) =>
  iso ? new Date(`${iso}T12:00:00`).toLocaleDateString("en-PH", { month: "short", day: "numeric" }) : "—";

/**
 * Follow-up queue. Felix (AI employee) drafts every chase; the assistant
 * sends it from the usual channel and logs it here; anything that keeps
 * going unanswered lands with Karla.
 */
export default function FollowupsPage() {
  const { can } = useAuth();
  const [rows, setRows] = useState<FollowupRow[] | null>(null);
  const [clients, setClients] = useState<ClientRow[]>([]);
  const [settings, setSettings] = useState<FollowupSettings>(DEFAULT_SETTINGS);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("queue");
  const [q, setQ] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const [editing, setEditing] = useState<Partial<FollowupRow> | null>(null);

  const load = useCallback(async () => {
    try {
      const [f, s] = await Promise.all([api.listFollowups(), api.getFollowupSettings()]);
      setRows(f);
      setSettings(s);
    } catch (e) { setError(errorText(e)); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    if (can("clients.view")) api.listClients().then(setClients).catch(() => setClients([]));
  }, [can]);

  const clientById = useMemo(() => new Map(clients.map((c) => [c.id, c])), [clients]);
  const today = todayIso();
  const withBucket = useMemo(() => sortQueue(rows ?? []).map((r) => ({ ...r, bucket: bucketOf(r, today) })), [rows, today]);
  const counts = useMemo(() => {
    const c: Record<Bucket, number> = { escalated: 0, overdue: 0, today: 0, waiting: 0, later: 0, closed: 0 };
    for (const r of withBucket) c[r.bucket]++;
    return c;
  }, [withBucket]);
  const receivedThisWeek = (rows ?? []).filter((r) => r.status === "done" && r.closed_at
    && Date.now() - new Date(r.closed_at).getTime() < 7 * 86_400_000).length;

  const who = (r: FollowupRow) => r.party === "insurer"
    ? r.insurer ?? "Insurer"
    : clientById.get(r.client_id ?? "")?.full_name ?? "Client";

  const needle = q.trim().toLowerCase();
  const shown = withBucket.filter((r) => TABS.find((t) => t.id === tab)!.match(r.bucket)
    && (!needle || [r.title, r.reference, r.insurer, who(r)].some((s) => s?.toLowerCase().includes(needle))));
  const open = rows?.find((r) => r.id === openId) ?? null;

  async function exportCsv() {
    try {
      const all = await api.exportFollowups();
      downloadCsv(`follow-ups-${today}.csv`, all.map((r) => ({
        title: r.title, waiting_on: who(r), kind: r.kind, insurer: r.insurer, reference: r.reference, status: r.status,
        due_on: r.due_on, next_chase_on: r.next_chase_on, attempts: r.attempts, last_chased_at: r.last_chased_at,
      })));
    } catch (e) { setError(errorText(e)); }
  }

  const tiles: { label: string; value: number; tone: string; tab: Tab; icon: typeof AlertTriangle }[] = [
    { label: "With Karla", value: counts.escalated, tone: "text-red-700", tab: "escalated", icon: AlertTriangle },
    { label: "Past due date", value: counts.overdue, tone: "text-amber-700", tab: "queue", icon: AlertTriangle },
    { label: "Chase today", value: counts.today, tone: "text-navy", tab: "queue", icon: Send },
    { label: "Waiting on reply", value: counts.waiting, tone: "text-slate-700", tab: "waiting", icon: Clipboard },
    { label: "Received this week", value: receivedThisWeek, tone: "text-emerald-700", tab: "closed", icon: CheckCircle2 },
  ];

  return (
    <div>
      <PageHeader title="Follow-ups"
        description={`Pending requirements and replies from clients and insurers. Felix drafts each chase; after ${settings.max_attempts} tries with no reply it goes to Karla.`}
        actions={<>
          {can("followups.export") && <Button onClick={exportCsv}><Download className="h-4 w-4" /> Export</Button>}
          {can("followups.create") && <Button variant="primary" onClick={() => setEditing({ party: "client", kind: "document", channel: "email" })}>
            <Plus className="h-4 w-4" /> Add follow-up</Button>}
        </>} />
      {error && <div className="mb-4"><Alert>{error}</Alert></div>}

      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {tiles.map((t) => (
          <button key={t.label} onClick={() => setTab(t.tab)}
            className="rounded-xl border bg-white p-4 text-left transition hover:border-navy/40">
            <div className="flex items-center gap-1.5 text-xs text-slate-500"><t.icon className="h-3.5 w-3.5" />{t.label}</div>
            <div className={cx("mt-1 text-2xl font-semibold", t.tone)}>{rows ? t.value : "–"}</div>
          </button>
        ))}
      </div>

      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-1 rounded-lg bg-slate-100 p-1" role="tablist">
          {TABS.map((t) => (
            <button key={t.id} role="tab" aria-selected={tab === t.id} onClick={() => setTab(t.id)}
              className={cx("rounded-md px-3 py-1.5 text-sm", tab === t.id ? "bg-white font-medium text-navy shadow-sm" : "text-slate-600 hover:text-ink")}>
              {t.label}
            </button>
          ))}
        </div>
        <div className="relative w-full sm:w-64">
          <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search item, client, insurer" className="pl-9" />
        </div>
      </div>

      {!rows ? <div className="grid h-40 place-items-center"><Spinner /></div> : shown.length === 0 ? (
        <div className="rounded-xl border border-dashed bg-white p-10 text-center text-sm text-slate-500">
          {tab === "queue" ? "Nothing to chase today." : "Nothing here."}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border bg-white">
          <table className="w-full min-w-[760px] text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-2.5">What is pending</th><th className="px-4 py-2.5">Waiting on</th>
                <th className="px-4 py-2.5">Status</th><th className="px-4 py-2.5">Due</th>
                <th className="px-4 py-2.5">Next chase</th><th className="px-4 py-2.5">Tries</th><th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody className="divide-y">
              {shown.map((r) => (
                <tr key={r.id} className="cursor-pointer hover:bg-slate-50" onClick={() => setOpenId(r.id)}>
                  <td className="px-4 py-2.5">
                    <div className="font-medium">{r.title}</div>
                    <div className="text-xs text-slate-500">{KIND_LABEL[r.kind]}{r.reference ? ` · ${r.reference}` : ""}</div>
                  </td>
                  <td className="px-4 py-2.5">
                    <div>{who(r)}</div>
                    <div className="text-xs text-slate-500">{r.party === "insurer" ? "Insurer" : r.insurer ? `Client · ${r.insurer}` : "Client"}</div>
                  </td>
                  <td className="px-4 py-2.5"><StatusBadge row={r} bucket={r.bucket} /></td>
                  <td className={cx("px-4 py-2.5", r.bucket === "overdue" && "font-medium text-amber-700")}>{fmtDate(r.due_on)}</td>
                  <td className="px-4 py-2.5">{isClosed(r.status) ? "—" : r.next_chase_on <= today ? "Today" : fmtDate(r.next_chase_on)}</td>
                  <td className="px-4 py-2.5 tabular-nums">{r.attempts}/{settings.max_attempts}</td>
                  <td className="px-4 py-2.5 text-right">
                    {!isClosed(r.status) && can("followups.edit") && (
                      <Button variant="ghost" className="!py-1" onClick={(e) => { e.stopPropagation(); setOpenId(r.id); }}>
                        <Bot className="h-4 w-4 text-gold" /> Chase
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {open && (
        <FollowupDrawer row={open} client={clientById.get(open.client_id ?? "") ?? null} who={who(open)} settings={settings}
          onClose={() => setOpenId(null)} onChanged={load} onEdit={() => setEditing(open)}
          onDeleted={() => { setOpenId(null); void load(); }} />
      )}
      {editing && (
        <FollowupForm row={editing} clients={clients} onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); void load(); }} />
      )}
    </div>
  );
}

function StatusBadge({ row, bucket }: { row: FollowupRow; bucket: Bucket }) {
  if (bucket === "overdue") return <Badge tone="amber">{BUCKET_LABEL.overdue}</Badge>;
  if (bucket === "today") return <Badge tone="navy">{BUCKET_LABEL.today}</Badge>;
  return <Badge tone={STATUS_TONE[row.status]}>{STATUS_LABEL[row.status]}</Badge>;
}

// ---------------------------------------------------------------------
// Drawer: Felix's draft, actions, timeline
// ---------------------------------------------------------------------
function FollowupDrawer({ row, client, who, settings, onClose, onChanged, onEdit, onDeleted }: {
  row: FollowupRow; client: ClientRow | null; who: string; settings: FollowupSettings;
  onClose: () => void; onChanged: () => Promise<void>; onEdit: () => void; onDeleted: () => void;
}) {
  const { can } = useAuth();
  const [events, setEvents] = useState<FollowupEvent[] | null>(null);
  const [channel, setChannel] = useState<FollowupChannel>(row.channel);
  const draft = useMemo(() => felixDraft(row, channel, client), [row, channel, client]);
  const [subject, setSubject] = useState(draft.subject ?? "");
  const [body, setBody] = useState(draft.body);
  const [edited, setEdited] = useState(false);
  const [note, setNote] = useState("");
  const [histNote, setHistNote] = useState("");
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [escalating, setEscalating] = useState(false);

  useEffect(() => { setSubject(draft.subject ?? ""); setBody(draft.body); setEdited(false); }, [draft]);
  const loadEvents = useCallback(() => api.listFollowupEvents(row.id).then(setEvents).catch((e) => setError(errorText(e))), [row.id]);
  useEffect(() => { void loadEvents(); }, [loadEvents, row.updated_at]);

  const closed = isClosed(row.status);
  const canEdit = can("followups.edit");
  const canApprove = can("followups.approve");

  async function run(key: string, fn: () => Promise<void>) {
    setBusy(key); setError(null);
    try { await fn(); setNote(""); setHistNote(""); await onChanged(); await loadEvents(); }
    catch (e) { setError(errorText(e)); }
    finally { setBusy(null); }
  }
  async function copy() {
    const text = channel === "email" && subject ? `Subject: ${subject}\n\n${body}` : body;
    try { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1500); }
    catch { setError("Copy failed. Select the text and copy it by hand."); }
  }
  const checkNote = (n: string) => { if (hasLongNumber(n)) throw new Error(MINIMAL_TEXT_ERROR); return n.trim() || null; };

  const due = row.due_on ? daysBetween(todayIso(), row.due_on) : null;

  return (
    <Drawer title={row.title}
      subtitle={<span className="flex flex-wrap items-center gap-2">
        <Badge tone={STATUS_TONE[row.status]}>{STATUS_LABEL[row.status]}</Badge>
        <span>Waiting on {who}{row.party === "client" && row.insurer ? ` for ${row.insurer}` : ""}</span>
        {row.reference && <span>· {row.reference}</span>}
      </span>}
      onClose={onClose}
      footer={<>
        {can("followups.delete") && (
          <Button variant="ghost" className="mr-auto text-red-600" loading={busy === "delete"}
            onClick={() => run("delete", async () => { await api.deleteFollowup(row.id); onDeleted(); })}>
            <Trash2 className="h-4 w-4" /> Delete
          </Button>
        )}
        {canEdit && <Button onClick={onEdit}><Pencil className="h-4 w-4" /> Edit details</Button>}
        <Button onClick={onClose}>Close</Button>
      </>}>
      <div className="grid gap-5">
        {error && <Alert>{error}</Alert>}
        {row.status === "escalated" && (
          <Alert tone="amber">
            <b>With Karla:</b> {row.escalation_reason ?? "Escalated"}.
            {canApprove ? " You can keep chasing, mark it received, or waive it." : " Keep chasing if Karla asks; only she can waive it."}
          </Alert>
        )}

        <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
          <Info label="Due">{row.due_on ? `${fmtDate(row.due_on)}${due !== null && !closed ? ` (${due < 0 ? `${-due} d late` : due === 0 ? "today" : `in ${due} d`})` : ""}` : "No date"}</Info>
          <Info label="Next chase">{closed ? "—" : fmtDate(row.next_chase_on)}</Info>
          <Info label="Tries">{row.attempts} of {settings.max_attempts}</Info>
          <Info label="Last chased">{relativeTime(row.last_chased_at)}</Info>
        </dl>
        {row.notes && <p className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-700">{row.notes}</p>}
        {row.ghl_link && <a href={row.ghl_link} target="_blank" rel="noreferrer" className="text-sm text-navy underline">Open in GoHighLevel</a>}

        {!closed && canEdit && (
          <section className="rounded-xl border border-gold/40 bg-gold-50/40 p-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Bot className="h-5 w-5 text-gold" />
                <div>
                  <div className="text-sm font-semibold text-navy">Felix's draft · follow-up {row.attempts + 1}</div>
                  <div className="text-xs text-slate-500">Check it, send it yourself, then log it here. Felix never sends on his own.</div>
                </div>
              </div>
              <Select value={channel} onChange={(e) => setChannel(e.target.value as FollowupChannel)} className="!w-auto" aria-label="Channel">
                {(Object.keys(CHANNEL_LABEL) as FollowupChannel[]).map((c) => <option key={c} value={c}>{CHANNEL_LABEL[c]}</option>)}
              </Select>
            </div>
            {!row.felix_drafts ? (
              <p className="text-sm text-slate-500">Felix drafts are off for this item. Send your own message and log it below.</p>
            ) : (
              <div className="grid gap-2">
                {draft.subject !== null && (
                  <Input value={subject} onChange={(e) => { setSubject(e.target.value); setEdited(true); }} aria-label="Subject" />
                )}
                <textarea value={body} onChange={(e) => { setBody(e.target.value); setEdited(true); }} rows={channel === "email" ? 9 : 4}
                  aria-label={channel === "phone" ? "Call script" : "Message"}
                  className="block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-navy focus:outline-none focus:ring-2 focus:ring-navy/20" />
                <div className="flex justify-end">
                  <Button variant="ghost" onClick={copy}>
                    {copied ? <ClipboardCheck className="h-4 w-4 text-emerald-600" /> : <Clipboard className="h-4 w-4" />}
                    {copied ? "Copied" : channel === "phone" ? "Copy call script" : "Copy message"}
                  </Button>
                </div>
              </div>
            )}
            <div className="mt-3 grid gap-2 border-t border-gold/30 pt-3">
              <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Optional note, e.g. client says she will send it Friday" />
              <div className="flex flex-wrap justify-end gap-2">
                <Button variant="primary" loading={busy === "chase"}
                  onClick={() => run("chase", () => api.logFollowupChase(row.id, channel, checkNote(note), row.felix_drafts && !edited))}>
                  <Send className="h-4 w-4" /> I sent it
                </Button>
              </div>
              {row.attempts + 1 >= settings.max_attempts && row.status !== "escalated" && (
                <p className="text-right text-xs text-amber-700">This is try {row.attempts + 1} of {settings.max_attempts}. If it goes unanswered it moves to Karla.</p>
              )}
            </div>
          </section>
        )}

        {canEdit && (
          <section className="flex flex-wrap gap-2">
            {!closed && (
              <Button loading={busy === "done"} onClick={() => run("done", () => api.setFollowupStatus(row.id, "done", checkNote(note)))}>
                <CheckCircle2 className="h-4 w-4 text-emerald-600" /> Received
              </Button>
            )}
            {!closed && row.status !== "escalated" && (
              <Button onClick={() => setEscalating(true)}><AlertTriangle className="h-4 w-4 text-red-600" /> Escalate to Karla</Button>
            )}
            {row.status === "escalated" && (
              <Button loading={busy === "back"} onClick={() => run("back", () => api.setFollowupStatus(row.id, "waiting", checkNote(note)))}>
                <RotateCcw className="h-4 w-4" /> Back to the assistant
              </Button>
            )}
            {!closed && canApprove && (
              <Button loading={busy === "waive"} onClick={() => run("waive", () => api.setFollowupStatus(row.id, "waived", checkNote(note)))}>
                <XCircle className="h-4 w-4" /> Waive
              </Button>
            )}
            {(row.status === "done" || canApprove) && closed && (
              <Button loading={busy === "reopen"} onClick={() => run("reopen", () => api.setFollowupStatus(row.id, "open", checkNote(note)))}>
                <RotateCcw className="h-4 w-4" /> Reopen
              </Button>
            )}
          </section>
        )}

        <section>
          <h3 className="mb-2 text-sm font-semibold text-navy">History</h3>
          {!events ? <Spinner /> : (
            <ol className="grid gap-2 text-sm">
              {events.map((e) => (
                <li key={e.id} className="flex gap-3">
                  <span className="w-24 shrink-0 text-xs text-slate-500">{relativeTime(e.at)}</span>
                  <span>
                    <EventText e={e} />
                    <span className="text-xs text-slate-500"> · {e.actor_label}</span>
                    {e.note && <span className="block text-slate-600">“{e.note}”</span>}
                  </span>
                </li>
              ))}
            </ol>
          )}
          {canEdit && (
            <div className="mt-3 flex gap-2">
              <Input value={histNote} onChange={(e) => setHistNote(e.target.value)} placeholder="Add a note" maxLength={500} />
              <Button disabled={!histNote.trim()} loading={busy === "note"}
                onClick={() => run("note", () => api.addFollowupNote(row.id, checkNote(histNote) ?? ""))}>Add</Button>
            </div>
          )}
        </section>
      </div>

      {escalating && <EscalateModal onClose={() => setEscalating(false)} onSubmit={async (reason) => {
        await api.setFollowupStatus(row.id, "escalated", checkNote(reason));
        setEscalating(false);
        await onChanged(); await loadEvents();
      }} />}
    </Drawer>
  );
}

function Info({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><dt className="text-xs text-slate-500">{label}</dt><dd className="font-medium">{children}</dd></div>;
}

function EventText({ e }: { e: FollowupEvent }) {
  const d = e.details as { attempt?: number; drafted_by?: string | null; from?: FollowupStatus; to?: FollowupStatus; reason?: string; title?: string };
  switch (e.kind) {
    case "created": return <>Added to the queue</>;
    case "chased": return <>Follow-up {d.attempt ?? ""} sent by {CHANNEL_LABEL[e.channel as FollowupChannel] ?? e.channel}{d.drafted_by ? ` (Felix's draft)` : ""}</>;
    case "escalated": return <>Escalated to Karla{d.reason ? `: ${d.reason}` : ""}</>;
    case "status": return <>{d.from ? `${STATUS_LABEL[d.from]} → ` : ""}{d.to ? STATUS_LABEL[d.to] : "Status changed"}</>;
    case "edited": return <>Details edited</>;
    default: return <>Note</>;
  }
}

function EscalateModal({ onClose, onSubmit }: { onClose: () => void; onSubmit: (reason: string) => Promise<void> }) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <Modal title="Escalate to Karla" onClose={onClose} footer={<>
      <Button onClick={onClose}>Cancel</Button>
      <Button variant="primary" loading={busy} disabled={!reason.trim()} onClick={async () => {
        setBusy(true);
        try { await onSubmit(reason); } catch (e) { setError(errorText(e)); setBusy(false); }
      }}>Escalate</Button>
    </>}>
      <div className="grid gap-3">
        {error && <Alert>{error}</Alert>}
        <Field label="What does Karla need to know?" hint="One line. Karla decides whether to waive it, call them herself, or keep chasing.">
          <Input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={200} autoFocus />
        </Field>
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------------
// Add / edit
// ---------------------------------------------------------------------
function FollowupForm({ row, clients, onClose, onSaved }: {
  row: Partial<FollowupRow>; clients: ClientRow[]; onClose: () => void; onSaved: () => void;
}) {
  const [f, setF] = useState<Partial<FollowupRow>>({ felix_drafts: true, next_chase_on: todayIso(), ...row });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = <K extends keyof FollowupRow>(k: K, v: FollowupRow[K] | null) => setF((x) => ({ ...x, [k]: v }));
  const tooMuch = hasLongNumber(f.title) || hasLongNumber(f.notes);

  async function save() {
    setBusy(true); setError(null);
    try {
      const input: FollowupInput = {
        id: f.id, title: (f.title ?? "").trim(), kind: f.kind, party: f.party, client_id: f.client_id ?? null,
        insurer: f.insurer?.trim() || null, reference: f.reference?.trim() || null, channel: f.channel,
        due_on: f.due_on || null, next_chase_on: f.next_chase_on || todayIso(), felix_drafts: f.felix_drafts,
        notes: f.notes?.trim() || null, ghl_link: f.ghl_link?.trim() || null,
      };
      await api.saveFollowup(input);
      onSaved();
    } catch (e) { setError(errorText(e)); setBusy(false); }
  }

  const pickClient = (id: string) => {
    const c = clients.find((x) => x.id === id);
    setF((x) => ({ ...x, client_id: id || null, insurer: x.insurer || c?.insurer || null }));
  };

  return (
    <Modal wide title={row.id ? "Edit follow-up" : "Add follow-up"} onClose={onClose} footer={<>
      <Button onClick={onClose}>Cancel</Button>
      <Button variant="primary" loading={busy} disabled={!f.title?.trim() || tooMuch} onClick={save}>Save</Button>
    </>}>
      <div className="-mr-2 grid max-h-[65vh] gap-3 overflow-y-auto pr-2">
        {error && <Alert>{error}</Alert>}
        {!row.id && (
          <div>
            <div className="mb-1 text-xs font-medium text-slate-500">Common items</div>
            <div className="flex flex-wrap gap-1.5">
              {QUICK_ADD.map((t) => (
                <button key={t.title} type="button" onClick={() => setF((x) => ({ ...x, title: t.title, kind: t.kind, party: t.party }))}
                  className={cx("rounded-full border px-2.5 py-1 text-xs hover:border-navy/50", f.title === t.title ? "border-navy bg-navy-50 text-navy" : "bg-white")}>
                  {t.title}
                </button>
              ))}
            </div>
          </div>
        )}
        <Field label="What is pending" error={tooMuch ? MINIMAL_TEXT_ERROR : undefined}
          hint="Describe the item, not its contents. IDs, medical and payment documents go to the insurer.">
          <Input value={f.title ?? ""} onChange={(e) => set("title", e.target.value)} maxLength={140} />
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Waiting on">
            <Select value={f.party ?? "client"} onChange={(e) => set("party", e.target.value as FollowupRow["party"])}>
              <option value="client">Client</option>
              <option value="insurer">Insurer</option>
            </Select>
          </Field>
          <Field label="Type">
            <Select value={f.kind ?? "document"} onChange={(e) => set("kind", e.target.value as FollowupKind)}>
              {(Object.keys(KIND_LABEL) as FollowupKind[]).map((k) => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}
            </Select>
          </Field>
          <Field label={f.party === "insurer" ? "For client (optional)" : "Client"}
            hint={clients.length ? undefined : "Add the client in the Client Masterlist first."}>
            <Select value={f.client_id ?? ""} onChange={(e) => pickClient(e.target.value)}>
              <option value="">{f.party === "insurer" ? "None" : "Pick a client"}</option>
              {clients.map((c) => <option key={c.id} value={c.id}>{c.full_name}</option>)}
            </Select>
          </Field>
          <Field label="Insurer">
            <Input list="z1-insurers" value={f.insurer ?? ""} onChange={(e) => set("insurer", e.target.value)} maxLength={60} />
            <datalist id="z1-insurers">{INSURERS.map((i) => <option key={i} value={i} />)}</datalist>
          </Field>
          <Field label="Reference" hint="Application, SOA or policy reference">
            <Input value={f.reference ?? ""} onChange={(e) => set("reference", e.target.value)} maxLength={40} />
          </Field>
          <Field label="Usual channel">
            <Select value={f.channel ?? "email"} onChange={(e) => set("channel", e.target.value as FollowupChannel)}>
              {(Object.keys(CHANNEL_LABEL) as FollowupChannel[]).map((c) => <option key={c} value={c}>{CHANNEL_LABEL[c]}</option>)}
            </Select>
          </Field>
          <Field label="Due date" hint="When the insurer needs it">
            <Input type="date" value={f.due_on ?? ""} onChange={(e) => set("due_on", e.target.value)} />
          </Field>
          <Field label="First chase on">
            <Input type="date" value={f.next_chase_on ?? ""} onChange={(e) => set("next_chase_on", e.target.value)} />
          </Field>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Notes" hint="Short and work-related only.">
            <Input value={f.notes ?? ""} onChange={(e) => set("notes", e.target.value)} maxLength={500} />
          </Field>
          <Field label="GoHighLevel link (optional)">
            <Input value={f.ghl_link ?? ""} onChange={(e) => set("ghl_link", e.target.value)} placeholder="https://app.gohighlevel.com/..." />
          </Field>
        </div>
        <div className="flex items-center justify-between rounded-lg border px-3 py-2">
          <span className="text-sm"><b>Felix drafts the messages</b><span className="block text-xs text-slate-500">Turn off if this one needs a personal touch.</span></span>
          <Toggle checked={f.felix_drafts ?? true} onChange={(v) => set("felix_drafts", v)} label="Felix drafts" />
        </div>
      </div>
    </Modal>
  );
}
