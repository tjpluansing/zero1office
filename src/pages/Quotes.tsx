import {
  AlertTriangle, Award, Bot, CheckCircle2, Clipboard, ClipboardCheck, Clock, Download, FileText, Pencil, Plus, RotateCcw, Search,
  Send, SlidersHorizontal, Trash2, XCircle,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "../auth/AuthProvider";
import {
  Alert, Badge, Button, Drawer, Field, Input, Modal, PageHeader, Select, Spinner, Toggle, cx, downloadCsv, relativeTime,
} from "../components/ui";
import { api, errorText } from "../lib/api";
import { MINIMAL_TEXT_ERROR, hasLongNumber, todayIso } from "../lib/followups";
import {
  ASK_STATUS_LABEL, DEFAULT_QUOTE_SETTINGS, GRADE_TONE, INSURERS, PRODUCT_LABEL, QUOTE_CHANNEL_LABEL, REQUEST_STATUS_LABEL,
  REQUEST_STATUS_TONE, isLate, manilaDate, peso, quinnDraft, quoteSettingsError, replyByFor, turnaround,
} from "../lib/quotes";
import type {
  ClientRow, ProductLine, QuoteAskRow, QuoteChannel, QuoteRequestInput, QuoteRequestRow, QuoteSettings, ScorecardRow,
} from "../lib/types";

const fmtDate = (iso: string | null) =>
  iso ? new Date(iso.length === 10 ? `${iso}T12:00:00` : iso).toLocaleDateString("en-PH", { month: "short", day: "numeric" }) : "—";
const daysLabel = (n: number | null) => n === null ? "—" : n === 0 ? "Same day" : `${n} ${n === 1 ? "day" : "days"}`;

type View = "requests" | "scorecard";
type Filter = "open" | "drafts" | "ready" | "closed" | "all";

interface Enriched extends QuoteRequestRow {
  asks: QuoteAskRow[];
  quoted: number;
  waiting: number;
  late: number;
  who: string;
}

const FILTERS: { id: Filter; label: string; match: (r: Enriched) => boolean }[] = [
  { id: "open", label: "Open", match: (r) => r.status === "draft" || r.status === "open" },
  { id: "drafts", label: "Drafts to send", match: (r) => r.status === "draft" },
  { id: "ready", label: "Ready to pick", match: (r) => r.status === "open" && r.quoted > 0 },
  { id: "closed", label: "Closed", match: (r) => r.status === "done" || r.status === "cancelled" },
  { id: "all", label: "All", match: () => true },
];

/**
 * Provider quote requests. Quinn drafts the request for each insurer;
 * Karla sends it and later picks the quote for the proposal; the assistant
 * logs replies. Slow insurers are chased from the follow-up queue, and the
 * scorecard shows how each insurer answers over time.
 */
export default function QuotesPage() {
  const { can } = useAuth();
  const [view, setView] = useState<View>("requests");
  const [requests, setRequests] = useState<QuoteRequestRow[] | null>(null);
  const [asks, setAsks] = useState<QuoteAskRow[]>([]);
  const [clients, setClients] = useState<ClientRow[]>([]);
  const [settings, setSettings] = useState<QuoteSettings>(DEFAULT_QUOTE_SETTINGS);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("open");
  const [q, setQ] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const [editing, setEditing] = useState<Partial<QuoteRequestRow> | null>(null);
  const [rulesOpen, setRulesOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      const [r, a, s] = await Promise.all([api.listQuoteRequests(), api.listQuoteAsks(), api.getQuoteSettings()]);
      setRequests(r); setAsks(a); setSettings(s);
    } catch (e) { setError(errorText(e)); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    if (can("clients.view")) api.listClients().then(setClients).catch(() => setClients([]));
  }, [can]);

  const clientById = useMemo(() => new Map(clients.map((c) => [c.id, c])), [clients]);
  const today = todayIso();
  const rows: Enriched[] = useMemo(() => (requests ?? []).map((r) => {
    const list = asks.filter((a) => a.request_id === r.id).sort((a, b) => a.insurer.localeCompare(b.insurer));
    return {
      ...r, asks: list,
      quoted: list.filter((a) => a.status === "quoted").length,
      waiting: list.filter((a) => a.status === "waiting").length,
      late: list.filter((a) => isLate(a, today)).length,
      who: clientById.get(r.client_id ?? "")?.full_name ?? r.account_label ?? "Client",
    };
  }), [requests, asks, clientById, today]);

  const counts = {
    drafts: rows.filter((r) => r.status === "draft").length,
    waiting: rows.filter((r) => r.status === "open").reduce((n, r) => n + r.waiting, 0),
    late: rows.filter((r) => r.status === "open").reduce((n, r) => n + r.late, 0),
    ready: rows.filter((r) => r.status === "open" && r.quoted > 0).length,
    picked: rows.filter((r) => r.status === "done" && r.closed_at && Date.now() - new Date(r.closed_at).getTime() < 30 * 86_400_000).length,
  };
  const needle = q.trim().toLowerCase();
  const shown = rows.filter((r) => FILTERS.find((f) => f.id === filter)!.match(r)
    && (!needle || [r.ref_code, r.who, r.needs, ...r.asks.map((a) => a.insurer)].some((s) => s?.toLowerCase().includes(needle))));
  const open = rows.find((r) => r.id === openId) ?? null;

  async function exportCsv() {
    try { downloadCsv(`quote-requests-${today}.csv`, await api.exportQuoteRequests()); }
    catch (e) { setError(errorText(e)); }
  }

  const tiles: { label: string; value: number; tone: string; filter: Filter; icon: typeof Clock }[] = [
    { label: "Drafts for Karla to send", value: counts.drafts, tone: "text-navy", filter: "drafts", icon: Send },
    { label: "Insurers we're waiting on", value: counts.waiting, tone: "text-slate-700", filter: "open", icon: Clock },
    { label: "Past the reply-by date", value: counts.late, tone: "text-amber-700", filter: "open", icon: AlertTriangle },
    { label: "Ready for Karla to pick", value: counts.ready, tone: "text-emerald-700", filter: "ready", icon: CheckCircle2 },
    { label: "Picked in the last 30 days", value: counts.picked, tone: "text-slate-700", filter: "closed", icon: Award },
  ];

  return (
    <div>
      <PageHeader title="Quote requests"
        description={`Ask insurers for quotes and see who answers fast. Quinn drafts each request; insurers get ${settings.target_days} business ${settings.target_days === 1 ? "day" : "days"} to reply, then Felix chases them.`}
        actions={<>
          {(can("quotes.approve") || can("admin_settings.edit")) && <Button onClick={() => setRulesOpen(true)}><SlidersHorizontal className="h-4 w-4" /> Reply-by target</Button>}
          {can("quotes.export") && <Button onClick={exportCsv}><Download className="h-4 w-4" /> Export</Button>}
          {can("quotes.create") && <Button variant="primary" onClick={() => setEditing({ product_line: "hmo" })}><Plus className="h-4 w-4" /> New quote request</Button>}
        </>} />
      {error && <div className="mb-4"><Alert>{error}</Alert></div>}

      <div className="mb-5 flex gap-1 rounded-lg bg-slate-100 p-1 w-fit" role="tablist">
        {([["requests", "Requests"], ["scorecard", "Insurer scorecard"]] as const).map(([id, label]) => (
          <button key={id} role="tab" aria-selected={view === id} onClick={() => setView(id)}
            className={cx("rounded-md px-3 py-1.5 text-sm", view === id ? "bg-white font-medium text-navy shadow-sm" : "text-slate-600 hover:text-ink")}>
            {label}
          </button>
        ))}
      </div>

      {view === "scorecard" ? <Scorecard targetDays={settings.target_days} /> : <>
        <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {tiles.map((t) => (
            <button key={t.label} onClick={() => setFilter(t.filter)}
              className="rounded-xl border bg-white p-4 text-left transition hover:border-navy/40">
              <div className="flex items-center gap-1.5 text-xs text-slate-500"><t.icon className="h-3.5 w-3.5" />{t.label}</div>
              <div className={cx("mt-1 text-2xl font-semibold", t.tone)}>{requests ? t.value : "–"}</div>
            </button>
          ))}
        </div>

        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap gap-1 rounded-lg bg-slate-100 p-1" role="tablist">
            {FILTERS.map((f) => (
              <button key={f.id} role="tab" aria-selected={filter === f.id} onClick={() => setFilter(f.id)}
                className={cx("rounded-md px-3 py-1.5 text-sm", filter === f.id ? "bg-white font-medium text-navy shadow-sm" : "text-slate-600 hover:text-ink")}>
                {f.label}
              </button>
            ))}
          </div>
          <div className="relative w-full sm:w-64">
            <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search ref, client, insurer" className="pl-9" />
          </div>
        </div>

        {!requests ? <div className="grid h-40 place-items-center"><Spinner /></div> : shown.length === 0 ? (
          <div className="rounded-xl border border-dashed bg-white p-10 text-center text-sm text-slate-500">Nothing here.</div>
        ) : (
          <div className="overflow-x-auto rounded-xl border bg-white">
            <table className="w-full min-w-[820px] text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-2.5">Request</th><th className="px-4 py-2.5">For</th>
                  <th className="px-4 py-2.5">Insurers</th><th className="px-4 py-2.5">Sent</th><th className="px-4 py-2.5">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {shown.map((r) => (
                  <tr key={r.id} className="cursor-pointer align-top hover:bg-slate-50" onClick={() => setOpenId(r.id)}>
                    <td className="px-4 py-2.5">
                      <div className="font-medium">{r.ref_code}</div>
                      <div className="text-xs text-slate-500">{PRODUCT_LABEL[r.product_line]}{r.headcount ? ` · ${r.headcount} ${r.headcount === 1 ? "person" : "people"}` : ""}</div>
                    </td>
                    <td className="px-4 py-2.5 max-w-[220px]">
                      <div>{r.who}</div>
                      <div className="truncate text-xs text-slate-500" title={r.needs}>{r.needs}</div>
                    </td>
                    <td className="px-4 py-2.5">
                      {r.asks.length === 0 ? <span className="text-slate-400">Not sent yet</span> : (
                        <div className="flex flex-wrap gap-1">{r.asks.map((a) => <AskChip key={a.id} a={a} />)}</div>
                      )}
                    </td>
                    <td className="px-4 py-2.5 whitespace-nowrap">{fmtDate(r.sent_at)}</td>
                    <td className="px-4 py-2.5"><RequestBadge r={r} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </>}

      {open && (
        <RequestDrawer r={open} settings={settings} onClose={() => setOpenId(null)} onChanged={load}
          onEdit={() => setEditing(open)} onDeleted={() => { setOpenId(null); void load(); }} />
      )}
      {editing && (
        <RequestForm row={editing} clients={clients} onClose={() => setEditing(null)}
          onSaved={(id) => { setEditing(null); setOpenId(id); setView("requests"); void load(); }} />
      )}
      {rulesOpen && <TargetModal settings={settings} onClose={() => setRulesOpen(false)} onSaved={() => { setRulesOpen(false); void load(); }} />}
    </div>
  );
}

function RequestBadge({ r }: { r: Enriched }) {
  if (r.status === "open" && r.late) return <Badge tone="amber">{r.late} late</Badge>;
  if (r.status === "open" && r.quoted && !r.waiting) return <Badge tone="green">All replied</Badge>;
  if (r.status === "open" && r.quoted) return <Badge tone="green">{r.quoted} quoted</Badge>;
  return <Badge tone={REQUEST_STATUS_TONE[r.status]}>{REQUEST_STATUS_LABEL[r.status]}</Badge>;
}

function AskChip({ a }: { a: QuoteAskRow }) {
  const late = isLate(a);
  const tone = a.chosen ? "gold" : a.status === "quoted" ? "green" : a.status === "declined" || a.status === "withdrawn" ? "slate" : late ? "amber" : "navy";
  const text = a.chosen ? `★ ${a.insurer}` : a.status === "quoted" ? `${a.insurer} ${peso(a.annual_premium)}`
    : a.status === "waiting" ? `${a.insurer}${late ? " · late" : ""}` : `${a.insurer} · ${ASK_STATUS_LABEL[a.status].toLowerCase()}`;
  return <Badge tone={tone}>{text}</Badge>;
}

// ---------------------------------------------------------------------
// Request drawer
// ---------------------------------------------------------------------
function RequestDrawer({ r, settings, onClose, onChanged, onEdit, onDeleted }: {
  r: Enriched; settings: QuoteSettings; onClose: () => void; onChanged: () => Promise<void>; onEdit: () => void; onDeleted: () => void;
}) {
  const { can } = useAuth();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [logging, setLogging] = useState<QuoteAskRow | null>(null);
  const live = r.status === "draft" || r.status === "open";
  const cheapest = Math.min(...r.asks.filter((a) => a.status === "quoted").map((a) => a.annual_premium ?? Infinity));

  async function run(key: string, fn: () => Promise<void>) {
    setBusy(key); setError(null);
    try { await fn(); await onChanged(); } catch (e) { setError(errorText(e)); } finally { setBusy(null); }
  }
  const canCancel = live && (r.status === "draft" ? can("quotes.edit") : can("quotes.approve"));

  return (
    <Drawer title={`${r.ref_code} · ${r.who}`}
      subtitle={<span className="flex flex-wrap items-center gap-2">
        <Badge tone={REQUEST_STATUS_TONE[r.status]}>{REQUEST_STATUS_LABEL[r.status]}</Badge>
        <span>{PRODUCT_LABEL[r.product_line]}{r.headcount ? ` · ${r.headcount} ${r.headcount === 1 ? "person" : "people"}` : ""}</span>
        {r.sent_at && <span>· sent {relativeTime(r.sent_at)}</span>}
      </span>}
      onClose={onClose}
      footer={<>
        {can("quotes.delete") && (
          <Button variant="ghost" className="mr-auto text-red-600" loading={busy === "delete"}
            onClick={() => run("delete", async () => { await api.deleteQuoteRequest(r.id); onDeleted(); })}>
            <Trash2 className="h-4 w-4" /> Delete
          </Button>
        )}
        {canCancel && (
          <Button loading={busy === "cancel"} onClick={() => run("cancel", () => api.cancelQuoteRequest(r.id))}>
            <XCircle className="h-4 w-4" /> Cancel request
          </Button>
        )}
        {live && can("quotes.edit") && <Button onClick={onEdit}><Pencil className="h-4 w-4" /> Edit details</Button>}
        <Button onClick={onClose}>Close</Button>
      </>}>
      <div className="grid gap-5">
        {error && <Alert>{error}</Alert>}
        <section>
          <h3 className="mb-1 text-sm font-semibold text-navy">What the client needs</h3>
          <p className="whitespace-pre-wrap rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-700">{r.needs}</p>
          {r.notes && <p className="mt-2 text-sm text-slate-600">Note: {r.notes}</p>}
          {r.ghl_link && <a href={r.ghl_link} target="_blank" rel="noreferrer" className="mt-2 inline-block text-sm text-navy underline">Open in GoHighLevel</a>}
        </section>

        {r.asks.length > 0 && (
          <section>
            <h3 className="mb-2 text-sm font-semibold text-navy">Insurer replies</h3>
            <div className="overflow-x-auto rounded-xl border">
              <table className="w-full min-w-[640px] text-sm">
                <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-3 py-2">Insurer</th><th className="px-3 py-2">Reply</th><th className="px-3 py-2">Reply by</th>
                    <th className="px-3 py-2">Took</th><th className="px-3 py-2 text-right">Annual premium</th><th className="px-3 py-2" />
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {r.asks.map((a) => {
                    const late = isLate(a);
                    const t = turnaround(a);
                    return (
                      <tr key={a.id} className={cx(a.chosen && "bg-gold-50/60")}>
                        <td className="px-3 py-2">
                          <div className="font-medium">{a.chosen ? "★ " : ""}{a.insurer}</div>
                          <div className="text-xs text-slate-500">{QUOTE_CHANNEL_LABEL[a.channel]}{a.plan_name ? ` · ${a.plan_name}` : ""}</div>
                          {a.reply_notes && <div className="text-xs text-slate-600">“{a.reply_notes}”</div>}
                        </td>
                        <td className="px-3 py-2">
                          <Badge tone={a.chosen ? "gold" : a.status === "quoted" ? "green" : a.status === "waiting" ? late ? "amber" : "navy" : "slate"}>
                            {a.chosen ? "Picked" : late ? "Late" : ASK_STATUS_LABEL[a.status]}
                          </Badge>
                        </td>
                        <td className={cx("px-3 py-2", late && "font-medium text-amber-700")}>{fmtDate(a.due_on)}</td>
                        <td className="px-3 py-2 whitespace-nowrap">{a.replied_at ? <span className={cx(manilaDate(a.replied_at) > a.due_on && "text-amber-700")}>{daysLabel(t)}</span> : "—"}</td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {a.status === "quoted" ? <span className={cx(a.annual_premium === cheapest && r.quoted > 1 && "font-semibold text-emerald-700")}>{peso(a.annual_premium)}</span> : "—"}
                        </td>
                        <td className="px-3 py-2 text-right whitespace-nowrap">
                          {r.status === "open" && can("quotes.edit") && !a.chosen && a.status !== "withdrawn" && (
                            a.status === "waiting"
                              ? <Button variant="ghost" className="!py-1" onClick={() => setLogging(a)}>Log reply</Button>
                              : <Button variant="ghost" className="!py-1" title="Back to waiting" loading={busy === `undo-${a.id}`}
                                  onClick={() => run(`undo-${a.id}`, () => api.recordQuoteReply(a.id, { status: "waiting" }))}><RotateCcw className="h-4 w-4" /></Button>
                          )}
                          {r.status === "open" && a.status === "quoted" && can("quotes.approve") && (
                            <Button variant="gold" className="!py-1" loading={busy === `pick-${a.id}`}
                              onClick={() => run(`pick-${a.id}`, () => api.chooseQuote(a.id))}>Pick</Button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {r.status === "open" && r.quoted > 0 && (
              <p className="mt-2 text-xs text-slate-500">
                {can("quotes.approve")
                  ? "Pick the quote that goes into the proposal. Insurers still waiting are marked not needed and their chases stop."
                  : "Karla picks the quote that goes into the proposal."}
              </p>
            )}
            {r.status === "open" && r.late > 0 && (
              <p className="mt-2 text-xs text-amber-700">Late insurers are in the Follow-ups queue, where Felix drafts the chase.</p>
            )}
          </section>
        )}

        {live && <SendSection r={r} settings={settings} onSent={onChanged} />}
      </div>
      {logging && <ReplyModal ask={logging} onClose={() => setLogging(null)}
        onSaved={async () => { setLogging(null); await onChanged(); }} />}
    </Drawer>
  );
}

// ---------------------------------------------------------------------
// Quinn's drafts + sending (Karla)
// ---------------------------------------------------------------------
function SendSection({ r, settings, onSent }: { r: Enriched; settings: QuoteSettings; onSent: () => Promise<void> }) {
  const { can } = useAuth();
  const asked = new Set(r.asks.map((a) => a.insurer.toLowerCase()));
  const options = (r.product_line === "life" ? ["FWD"] : r.product_line === "hmo" || r.product_line === "group_hmo" ? INSURERS.filter((i) => i !== "FWD") : INSURERS)
    .filter((i) => !asked.has(i.toLowerCase()));
  const [picked, setPicked] = useState<string[]>(r.status === "draft" ? options : []);
  const [other, setOther] = useState("");
  const [channel, setChannel] = useState<QuoteChannel>("email");
  const [addFollowups, setAddFollowups] = useState(can("followups.create"));
  const targets = [...picked, ...other.split(",").map((s) => s.trim()).filter((s) => s && !asked.has(s.toLowerCase()))];
  const [preview, setPreview] = useState<string>(targets[0] ?? options[0] ?? "Maxicare");
  const replyBy = replyByFor(settings);
  const draft = quinnDraft(r, preview, replyBy, channel);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const canSend = can("quotes.approve");

  async function copy() {
    const text = draft.subject ? `Subject: ${draft.subject}\n\n${draft.body}` : draft.body;
    try { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1500); }
    catch { setError("Copy failed. Select the text and copy it by hand."); }
  }
  async function send() {
    setBusy(true); setError(null);
    try { await api.sendQuoteRequest(r.id, targets, channel, addFollowups); setPicked([]); setOther(""); await onSent(); }
    catch (e) { setError(errorText(e)); }
    finally { setBusy(false); }
  }

  return (
    <section className="rounded-xl border border-gold/40 bg-gold-50/40 p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Bot className="h-5 w-5 text-gold" />
          <div>
            <div className="text-sm font-semibold text-navy">{r.status === "draft" ? "Send to insurers" : "Ask more insurers"} · Quinn's draft</div>
            <div className="text-xs text-slate-500">
              {canSend ? "Check the draft, send it from karla@ask-karla.com, then mark it sent here. Quinn only drafts; nothing is sent from here."
                : "Karla sends quote requests. You can check Quinn's draft and edit the request details."}
            </div>
          </div>
        </div>
        <Select value={channel} onChange={(e) => setChannel(e.target.value as QuoteChannel)} className="!w-auto" aria-label="Channel">
          {(Object.keys(QUOTE_CHANNEL_LABEL) as QuoteChannel[]).map((c) => <option key={c} value={c}>{QUOTE_CHANNEL_LABEL[c]}</option>)}
        </Select>
      </div>

      {error && <div className="mb-3"><Alert>{error}</Alert></div>}

      <div className="mb-3 flex flex-wrap gap-2">
        {options.map((i) => (
          <label key={i} className={cx("flex cursor-pointer items-center gap-1.5 rounded-full border px-3 py-1 text-sm",
            picked.includes(i) ? "border-navy bg-white text-navy" : "border-slate-300 bg-white/60 text-slate-500")}>
            <input type="checkbox" className="accent-navy" checked={picked.includes(i)} disabled={!canSend}
              onChange={(e) => setPicked((p) => e.target.checked ? [...p, i] : p.filter((x) => x !== i))} />
            {i}
          </label>
        ))}
        {canSend && <Input value={other} onChange={(e) => setOther(e.target.value)} placeholder="Other insurer(s), comma separated" className="!w-64 !py-1" />}
      </div>

      <div className="mb-2 flex flex-wrap items-center gap-2 text-xs text-slate-500">
        Preview for
        <Select value={preview} onChange={(e) => setPreview(e.target.value)} className="!w-auto !py-1 text-xs" aria-label="Preview insurer">
          {[...new Set([...targets, ...options])].map((i) => <option key={i} value={i}>{i}</option>)}
        </Select>
        · reply by {fmtDate(replyBy)}
      </div>
      <div className="grid gap-2">
        {draft.subject && <Input value={draft.subject} readOnly aria-label="Subject" />}
        <textarea value={draft.body} readOnly rows={channel === "email" ? 12 : 4} aria-label="Message"
          className="block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm" />
        <div className="flex justify-end">
          <Button variant="ghost" onClick={copy}>
            {copied ? <ClipboardCheck className="h-4 w-4 text-emerald-600" /> : <Clipboard className="h-4 w-4" />}
            {copied ? "Copied" : "Copy draft"}
          </Button>
        </div>
      </div>

      {canSend && (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-gold/30 pt-3">
          <label className="flex items-center gap-2 text-sm">
            <Toggle checked={addFollowups} onChange={setAddFollowups} disabled={!can("followups.create")} label="Add to follow-ups" />
            Add each insurer to Follow-ups so Felix chases late replies
          </label>
          <Button variant="primary" loading={busy} disabled={targets.length === 0} onClick={send}>
            <Send className="h-4 w-4" /> I sent it to {targets.length || "no"} {targets.length === 1 ? "insurer" : "insurers"}
          </Button>
        </div>
      )}
    </section>
  );
}

function ReplyModal({ ask, onClose, onSaved }: { ask: QuoteAskRow; onClose: () => void; onSaved: () => Promise<void> }) {
  const [status, setStatus] = useState<"quoted" | "declined">("quoted");
  const [premium, setPremium] = useState("");
  const [plan, setPlan] = useState("");
  const [note, setNote] = useState("");
  const [day, setDay] = useState(todayIso());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sentDay = manilaDate(ask.sent_at);

  async function save() {
    setBusy(true); setError(null);
    try {
      if (hasLongNumber(note) || hasLongNumber(plan)) throw new Error(MINIMAL_TEXT_ERROR);
      const amount = premium.trim() ? Number(premium.replace(/[₱,\s]/g, "")) : null;
      if (status === "quoted" && (amount === null || !Number.isFinite(amount) || amount < 0)) throw new Error("Enter the annual premium the insurer quoted");
      const isToday = day === todayIso();
      await api.recordQuoteReply(ask.id, {
        status, annual_premium: status === "quoted" ? amount : null, plan_name: plan.trim() || null, note: note.trim() || null,
        replied_at: isToday ? null : new Date(`${day}T17:00:00+08:00`).toISOString(),
      });
      await onSaved();
    } catch (e) { setError(errorText(e)); setBusy(false); }
  }

  return (
    <Modal title={`Reply from ${ask.insurer}`} onClose={onClose} footer={<>
      <Button onClick={onClose}>Cancel</Button>
      <Button variant="primary" loading={busy} onClick={save}>Save reply</Button>
    </>}>
      <div className="grid gap-3">
        {error && <Alert>{error}</Alert>}
        <div className="flex gap-2">
          {(["quoted", "declined"] as const).map((s) => (
            <button key={s} type="button" onClick={() => setStatus(s)}
              className={cx("flex-1 rounded-lg border px-3 py-2 text-sm", status === s ? "border-navy bg-navy-50 font-medium text-navy" : "border-slate-300")}>
              {s === "quoted" ? "Sent a quote" : "Declined to quote"}
            </button>
          ))}
        </div>
        {status === "quoted" && <>
          <Field label="Annual premium (₱)" hint="Total for everyone on the request, per year.">
            <Input inputMode="decimal" value={premium} onChange={(e) => setPremium(e.target.value)} placeholder="e.g. 58,400" autoFocus />
          </Field>
          <Field label="Plan name"><Input value={plan} onChange={(e) => setPlan(e.target.value)} maxLength={80} placeholder="e.g. MyMaxicare Gold" /></Field>
        </>}
        <Field label="When did they reply?" hint="Change it if you are logging an older reply. This is what the scorecard counts.">
          <Input type="date" value={day} min={sentDay} max={todayIso()} onChange={(e) => setDay(e.target.value)} />
        </Field>
        <Field label="Note (optional)"><Input value={note} onChange={(e) => setNote(e.target.value)} maxLength={500}
          placeholder={status === "declined" ? "Why they declined" : "e.g. includes dental, 1-year waiting period"} /></Field>
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------------
// New / edit request
// ---------------------------------------------------------------------
function RequestForm({ row, clients, onClose, onSaved }: {
  row: Partial<QuoteRequestRow>; clients: ClientRow[]; onClose: () => void; onSaved: (id: string) => void;
}) {
  const [f, setF] = useState<Partial<QuoteRequestRow>>(row);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = <K extends keyof QuoteRequestRow>(k: K, v: QuoteRequestRow[K] | null) => setF((x) => ({ ...x, [k]: v }));
  const tooMuch = hasLongNumber(f.needs) || hasLongNumber(f.notes) || hasLongNumber(f.account_label);
  const sent = row.status === "open";

  async function save() {
    setBusy(true); setError(null);
    try {
      const input: QuoteRequestInput = {
        id: f.id, client_id: f.client_id || null, account_label: f.account_label?.trim() || null,
        product_line: f.product_line, needs: (f.needs ?? "").trim(), headcount: f.headcount || null,
        notes: f.notes?.trim() || null, ghl_link: f.ghl_link?.trim() || null,
      };
      onSaved(await api.saveQuoteRequest(input));
    } catch (e) { setError(errorText(e)); setBusy(false); }
  }

  return (
    <Modal wide title={f.id ? `Edit ${row.ref_code}` : "New quote request"} onClose={onClose} footer={<>
      <Button onClick={onClose}>Cancel</Button>
      <Button variant="primary" loading={busy} disabled={tooMuch || !(f.needs ?? "").trim()} onClick={save}>
        <FileText className="h-4 w-4" /> {f.id ? "Save" : "Save draft"}
      </Button>
    </>}>
      <div className="grid gap-3">
        {error && <Alert>{error}</Alert>}
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Client" hint="Or type a name below if they are not in the masterlist yet.">
            <Select value={f.client_id ?? ""} onChange={(e) => set("client_id", e.target.value || null)}>
              <option value="">Not in the masterlist</option>
              {clients.map((c) => <option key={c.id} value={c.id}>{c.full_name}{c.company ? ` (${c.company})` : ""}</option>)}
            </Select>
          </Field>
          <Field label="Company or label" hint="For group quotes, the company name the insurer needs.">
            <Input value={f.account_label ?? ""} onChange={(e) => set("account_label", e.target.value)} maxLength={80} placeholder="e.g. Santos Bakery" />
          </Field>
          <Field label="Product">
            <Select value={f.product_line ?? "hmo"} disabled={sent} onChange={(e) => set("product_line", e.target.value as ProductLine)}>
              {(Object.keys(PRODUCT_LABEL) as ProductLine[]).map((p) => <option key={p} value={p}>{PRODUCT_LABEL[p]}</option>)}
            </Select>
          </Field>
          <Field label="Number of people">
            <Input type="number" min={1} value={f.headcount ?? ""} onChange={(e) => set("headcount", e.target.value ? Number(e.target.value) : null)} />
          </Field>
        </div>
        <Field label="What to quote" error={tooMuch ? MINIMAL_TEXT_ERROR : undefined}
          hint="Ages, benefit limit, room type, area or hospitals, riders. No names, birthdays or ID numbers: census files go straight to the insurer.">
          <textarea value={f.needs ?? ""} onChange={(e) => set("needs", e.target.value)} rows={4} maxLength={600}
            placeholder="Family of 4, ages 38/36/8/5. 150k MBL, semi-private room, Makati hospitals."
            className="block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-navy focus:outline-none focus:ring-2 focus:ring-navy/20" />
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Internal note (optional)"><Input value={f.notes ?? ""} onChange={(e) => set("notes", e.target.value)} maxLength={500} /></Field>
          <Field label="GoHighLevel link (optional)"><Input value={f.ghl_link ?? ""} onChange={(e) => set("ghl_link", e.target.value)} placeholder="https://" /></Field>
        </div>
      </div>
    </Modal>
  );
}

function TargetModal({ settings, onClose, onSaved }: { settings: QuoteSettings; onClose: () => void; onSaved: () => void }) {
  const [days, setDays] = useState(String(settings.target_days));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const value = { target_days: Number(days) };
  const bad = quoteSettingsError(value);
  return (
    <Modal title="Reply-by target" onClose={onClose} footer={<>
      <Button onClick={onClose}>Cancel</Button>
      <Button variant="primary" loading={busy} disabled={!!bad} onClick={async () => {
        setBusy(true);
        try { await api.saveQuoteSettings(value); onSaved(); } catch (e) { setError(errorText(e)); setBusy(false); }
      }}>Save</Button>
    </>}>
      <div className="grid gap-3">
        {error && <Alert>{error}</Alert>}
        <Field label="Business days an insurer gets to reply" error={bad ?? undefined}
          hint="Used for new requests: it sets the reply-by date, when Felix starts chasing, and what counts as on time on the scorecard.">
          <Input type="number" min={1} max={15} value={days} onChange={(e) => setDays(e.target.value)} />
        </Field>
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------------
// Scorecard
// ---------------------------------------------------------------------
function Scorecard({ targetDays }: { targetDays: number }) {
  const [days, setDays] = useState(90);
  const [product, setProduct] = useState<ProductLine | "">("");
  const [rows, setRows] = useState<ScorecardRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setRows(null);
    api.getScorecard(days, product || null).then(setRows).catch((e) => setError(errorText(e)));
  }, [days, product]);

  const best = rows?.find((r) => r.grade);
  const slowest = rows?.filter((r) => r.median_days !== null && r.asked >= 3).sort((a, b) => (b.median_days ?? 0) - (a.median_days ?? 0))[0];

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <Field label="Period">
          <Select value={days} onChange={(e) => setDays(Number(e.target.value))} className="!w-auto">
            {[30, 90, 180, 365].map((d) => <option key={d} value={d}>Last {d} days</option>)}
          </Select>
        </Field>
        <Field label="Product">
          <Select value={product} onChange={(e) => setProduct(e.target.value as ProductLine | "")} className="!w-auto">
            <option value="">All products</option>
            {(Object.keys(PRODUCT_LABEL) as ProductLine[]).map((p) => <option key={p} value={p}>{PRODUCT_LABEL[p]}</option>)}
          </Select>
        </Field>
      </div>
      {error && <div className="mb-4"><Alert>{error}</Alert></div>}

      {rows && rows.length > 0 && (best || slowest) && (
        <div className="mb-4 grid gap-3 sm:grid-cols-2">
          {best && <div className="rounded-xl border bg-white p-4 text-sm">
            <div className="text-xs text-slate-500">Most reliable</div>
            <div className="mt-1 font-semibold text-navy">{best.insurer} · grade {best.grade}</div>
            <div className="text-slate-600">{best.on_time_pct ?? 0}% on time, usually {daysLabel(best.median_days).toLowerCase()}</div>
          </div>}
          {slowest && slowest !== best && <div className="rounded-xl border bg-white p-4 text-sm">
            <div className="text-xs text-slate-500">Slowest to reply</div>
            <div className="mt-1 font-semibold text-amber-700">{slowest.insurer}</div>
            <div className="text-slate-600">Usually {daysLabel(slowest.median_days).toLowerCase()}. Ask them first, or set the client's expectations.</div>
          </div>}
        </div>
      )}

      {!rows ? <div className="grid h-40 place-items-center"><Spinner /></div> : rows.length === 0 ? (
        <div className="rounded-xl border border-dashed bg-white p-10 text-center text-sm text-slate-500">No quote requests sent in this period.</div>
      ) : (
        <div className="overflow-x-auto rounded-xl border bg-white">
          <table className="w-full min-w-[860px] text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-2.5">Insurer</th><th className="px-4 py-2.5">Grade</th><th className="px-4 py-2.5 text-right">Asked</th>
                <th className="px-4 py-2.5">Replied</th><th className="px-4 py-2.5">On time</th>
                <th className="px-4 py-2.5 text-right">Usually takes</th><th className="px-4 py-2.5 text-right">Waiting</th>
                <th className="px-4 py-2.5 text-right">Chases</th><th className="px-4 py-2.5 text-right">Picked</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {rows.map((r) => (
                <tr key={r.insurer}>
                  <td className="px-4 py-2.5 font-medium">{r.insurer}</td>
                  <td className="px-4 py-2.5">{r.grade ? <Badge tone={GRADE_TONE[r.grade]}>{r.grade} · {r.score}</Badge> : <span className="text-xs text-slate-400">Too few to grade</span>}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{r.asked}</td>
                  <td className="px-4 py-2.5">
                    <span className="tabular-nums">{r.reply_pct}%</span>
                    <span className="text-xs text-slate-500"> · {r.quoted} quoted{r.declined ? `, ${r.declined} declined` : ""}</span>
                  </td>
                  <td className="px-4 py-2.5"><Meter pct={r.on_time_pct} /></td>
                  <td className="px-4 py-2.5 text-right">{daysLabel(r.median_days)}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{r.waiting}{r.overdue ? <span className="text-amber-700"> ({r.overdue} late)</span> : ""}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{r.chases}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{r.chosen}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="mt-3 text-xs text-slate-500">
        Turnaround is counted in business days from the day we asked to the day they replied. On time means a reply within {targetDays} business {targetDays === 1 ? "day" : "days"} (the target when the request went out); insurers still waiting past that date count as late.
        Score = 60% on time + 40% reply rate. A is 85 and up, B 70, C 50, D below. Insurers need at least 3 requests in the period to get a grade.
      </p>
    </div>
  );
}

function Meter({ pct }: { pct: number | null }) {
  if (pct === null) return <span className="text-xs text-slate-400">Not yet due</span>;
  const tone = pct >= 85 ? "bg-emerald-500" : pct >= 60 ? "bg-navy" : pct >= 40 ? "bg-amber-500" : "bg-red-500";
  return (
    <div className="flex items-center gap-2">
      <div className="h-2 w-24 overflow-hidden rounded-full bg-slate-100"><div className={cx("h-full rounded-full", tone)} style={{ width: `${pct}%` }} /></div>
      <span className="tabular-nums text-xs">{pct}%</span>
    </div>
  );
}
