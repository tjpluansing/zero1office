import {
  AlertTriangle, Banknote, CheckCircle2, ClipboardCopy, Download, ExternalLink, FileUp, Link2, MessageSquare, Pencil,
  PhoneCall, Plus, Search, Trash2, Unlink,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { useSearchParams } from "react-router-dom";
import { useAuth } from "../auth/AuthProvider";
import {
  Alert, Badge, Button, Drawer, Field, Input, Modal, PageHeader, Select, Spinner, Toggle, cx, downloadCsv, relativeTime,
} from "../components/ui";
import { api, errorText } from "../lib/api";
import {
  AGING_BUCKETS, IMPORT_COLUMNS, STAGES, agingBucket, daysBetween, flags, fmtDate, peso, receiptDetails, soasFromCsv,
  stageInfo, today,
} from "../lib/soa";
import type { DisbursementInput, DisbursementRow, SoaEvent, SoaInput, SoaRow, SoaStage } from "../lib/types";
import { PROVIDERS } from "../lib/types";

/**
 * Billing & SOA: Karla's collections tracker (Nina) and commission payouts with
 * Karla's receipts (Sol). One row per SOA; its stage is worked out by the
 * server from the dates filled in, so nobody has to drag cards around.
 */
export default function BillingPage() {
  const { can } = useAuth();
  const [params] = useSearchParams();
  const [tab, setTab] = useState<"soas" | "payouts">(params.get("tab") === "payouts" ? "payouts" : "soas");
  const [soas, setSoas] = useState<SoaRow[] | null>(null);
  const [payouts, setPayouts] = useState<DisbursementRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [openSoa, setOpenSoa] = useState<string | null>(params.get("soa"));
  const [openPayout, setOpenPayout] = useState<string | null>(null);
  const [editing, setEditing] = useState<Partial<SoaRow> | null>(null);
  const [importing, setImporting] = useState(false);
  const [newPayout, setNewPayout] = useState(false);

  const load = useCallback(async () => {
    try {
      const [s, d] = await Promise.all([api.listSoas(), api.listDisbursements()]);
      setSoas(s); setPayouts(d); setError(null);
    } catch (e) { setError(errorText(e)); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  async function exportCsv() {
    try {
      const rows = await api.exportSoas();
      downloadCsv(`soa-tracker-${today()}.csv`, rows);
    } catch (e) { setError(errorText(e)); }
  }

  const soa = soas?.find((s) => s.id === openSoa) ?? null;
  const payout = payouts?.find((d) => d.id === openPayout) ?? null;

  return (
    <div>
      <PageHeader title="Billing & SOA"
        description="Every SOA from release to client payment, receipt and 2307, commission, and Karla's receipt to the provider."
        actions={<>
          {can("billing.export") && <Button onClick={exportCsv}><Download className="h-4 w-4" /> Export</Button>}
          {can("billing.create") && tab === "soas" && <Button onClick={() => setImporting(true)}><FileUp className="h-4 w-4" /> Import CSV</Button>}
          {can("billing.create") && tab === "soas" && <Button variant="primary" onClick={() => setEditing({ provider: "Maxicare", cwt_applicable: false })}><Plus className="h-4 w-4" /> New SOA</Button>}
          {can("billing.create") && tab === "payouts" && <Button variant="primary" onClick={() => setNewPayout(true)}><Plus className="h-4 w-4" /> Record payout</Button>}
        </>} />

      <div className="mb-4 flex gap-1 border-b">
        {([["soas", "SOAs"], ["payouts", "Commission payouts"]] as const).map(([id, label]) => (
          <button key={id} onClick={() => setTab(id)}
            className={cx("-mb-px border-b-2 px-4 py-2 text-sm font-medium",
              tab === id ? "border-navy text-navy" : "border-transparent text-slate-500 hover:text-ink")}>
            {label}
            {id === "payouts" && payouts && payouts.some((d) => !d.receipt_no) &&
              <span className="ml-2 rounded-full bg-gold px-1.5 text-xs text-navy">{payouts.filter((d) => !d.receipt_no).length}</span>}
          </button>
        ))}
      </div>

      {error && <div className="mb-4"><Alert>{error}</Alert></div>}
      {!soas || !payouts ? <div className="grid h-40 place-items-center"><Spinner /></div>
        : tab === "soas" ? <SoaList soas={soas} onOpen={setOpenSoa} />
        : <PayoutList payouts={payouts} soas={soas} onOpen={setOpenPayout} />}

      {soa && <SoaDrawer soa={soa} payout={payouts?.find((d) => d.id === soa.disbursement_id) ?? null}
        onClose={() => setOpenSoa(null)} onEdit={() => setEditing(soa)} onChanged={load}
        onOpenPayout={(id) => { setOpenSoa(null); setTab("payouts"); setOpenPayout(id); }} />}
      {payout && soas && <PayoutDrawer payout={payout} soas={soas} onClose={() => setOpenPayout(null)} onChanged={load}
        onOpenSoa={(id) => { setOpenPayout(null); setTab("soas"); setOpenSoa(id); }} />}
      {editing && <SoaForm row={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); void load(); }} />}
      {importing && <ImportModal onClose={() => setImporting(false)} onDone={() => { setImporting(false); void load(); }} />}
      {newPayout && <PayoutForm onClose={() => setNewPayout(false)}
        onSaved={(id) => { setNewPayout(false); void load().then(() => setOpenPayout(id)); }} />}
    </div>
  );
}

// ---------------------------------------------------------------------
// SOA list: stage cards, aging, filters, table
// ---------------------------------------------------------------------

function SoaList({ soas, onOpen }: { soas: SoaRow[]; onOpen: (id: string) => void }) {
  const [stage, setStage] = useState<SoaStage | "open" | "all">("open");
  const [provider, setProvider] = useState("");
  const [q, setQ] = useState("");
  const [attention, setAttention] = useState(false);

  const providers = useMemo(() => [...new Set([...PROVIDERS, ...soas.map((s) => s.provider)])], [soas]);
  const withFlags = useMemo(() => soas.map((s) => ({ s, f: flags(s) })), [soas]);
  const rows = withFlags.filter(({ s, f }) =>
    (stage === "all" || (stage === "open" ? s.stage !== "closed" : s.stage === stage))
    && (!provider || s.provider === provider)
    && (!attention || f.needsAttention)
    && (!q || `${s.soa_no} ${s.account_name} ${s.product ?? ""}`.toLowerCase().includes(q.toLowerCase())));

  const aging = AGING_BUCKETS.map(() => ({ n: 0, amt: 0 }));
  for (const s of soas) {
    const b = agingBucket(s);
    if (b !== null) { aging[b].n++; aging[b].amt += s.amount; }
  }
  const attentionCount = withFlags.filter(({ f }) => f.needsAttention).length;

  return (
    <div className="space-y-4">
      <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-6">
        {STAGES.filter((st) => st.id !== "closed").map((st) => {
          const list = soas.filter((s) => s.stage === st.id);
          const amt = list.reduce((a, s) => a + (st.id === "receipt_due" || st.id === "receipt_issued" || st.id === "awaiting_commission"
            ? (s.commission_amount ?? s.commission_expected ?? 0) : s.amount), 0);
          return (
            <button key={st.id} onClick={() => setStage(stage === st.id ? "open" : st.id)}
              className={cx("rounded-xl border bg-white p-3 text-left transition hover:border-navy/40",
                stage === st.id && "border-navy ring-2 ring-navy/15")}>
              <div className="text-xs font-medium text-slate-500">{st.short}</div>
              <div className="mt-1 text-xl font-semibold text-navy">{list.length}</div>
              <div className="text-xs text-slate-500">
                {peso(amt)}{["awaiting_commission", "receipt_due", "receipt_issued"].includes(st.id) ? " commission" : ""}
              </div>
            </button>
          );
        })}
      </div>

      <div className="rounded-xl border bg-white p-4">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-navy">Unpaid SOAs by days past due</h2>
          <span className="text-xs text-slate-500">{aging.reduce((a, b) => a + b.n, 0)} unpaid · {peso(aging.reduce((a, b) => a + b.amt, 0))}</span>
        </div>
        <div className="grid grid-cols-5 gap-2">
          {AGING_BUCKETS.map((label, i) => (
            <div key={label} className={cx("rounded-lg px-3 py-2", i === 0 ? "bg-slate-50" : i === 1 ? "bg-amber-50" : "bg-red-50")}>
              <div className="text-xs text-slate-500">{label}</div>
              <div className={cx("text-sm font-semibold", i >= 2 ? "text-red-700" : "text-ink")}>{aging[i].n} · {peso(aging[i].amt)}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full sm:w-64">
          <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
          <Input className="pl-8" placeholder="Search SOA no. or account" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <Select className="!w-auto" value={provider} onChange={(e) => setProvider(e.target.value)} aria-label="Provider">
          <option value="">All providers</option>
          {providers.map((p) => <option key={p}>{p}</option>)}
        </Select>
        <Select className="!w-auto" value={stage} onChange={(e) => setStage(e.target.value as typeof stage)} aria-label="Stage">
          <option value="open">All open SOAs</option>
          {STAGES.map((st) => <option key={st.id} value={st.id}>{st.label}</option>)}
          <option value="all">Everything, including closed</option>
        </Select>
        <label className="ml-auto flex items-center gap-2 text-sm text-slate-600">
          <Toggle checked={attention} onChange={setAttention} label="Needs attention only" />
          Needs attention ({attentionCount})
        </label>
      </div>

      <div className="overflow-x-auto rounded-xl border bg-white">
        <table className="w-full min-w-[860px] text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-2.5">SOA / account</th><th className="px-4 py-2.5">Provider</th>
              <th className="px-4 py-2.5 text-right">Amount</th><th className="px-4 py-2.5">Due</th>
              <th className="px-4 py-2.5">Stage</th><th className="px-4 py-2.5">Next step</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {rows.length === 0 && <tr><td colSpan={6} className="px-4 py-10 text-center text-slate-500">No SOAs match.</td></tr>}
            {rows.map(({ s, f }) => (
              <tr key={s.id} onClick={() => onOpen(s.id)} className="cursor-pointer hover:bg-slate-50">
                <td className="px-4 py-2.5">
                  <div className="font-medium">{s.soa_no}</div>
                  <div className="text-xs text-slate-500">{s.account_name}{s.product ? ` · ${s.product}` : ""}</div>
                </td>
                <td className="px-4 py-2.5">{s.provider}</td>
                <td className="px-4 py-2.5 text-right tabular-nums">{peso(s.amount)}</td>
                <td className="px-4 py-2.5">{fmtDate(s.due_on)}</td>
                <td className="px-4 py-2.5">
                  <Badge tone={stageInfo(s.stage).tone}>{stageInfo(s.stage).short}</Badge>
                  <div className="mt-0.5 text-xs text-slate-400">{daysBetween(s.stage_changed_at)} d in stage</div>
                </td>
                <td className="px-4 py-2.5">
                  <div className="text-xs text-slate-600">{stageInfo(s.stage).next}</div>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {f.overdueDays > 0 && <Badge tone="red"><AlertTriangle className="h-3 w-3" />{f.overdueDays} d overdue</Badge>}
                    {f.missing2307 && <Badge tone="amber">2307 missing</Badge>}
                    {f.stuckDays > 0 && f.overdueDays === 0 && <Badge tone="amber">Stuck {f.stuckDays} d</Badge>}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------
// One SOA: details, quick steps, timeline
// ---------------------------------------------------------------------

function SoaDrawer({ soa, payout, onClose, onEdit, onChanged, onOpenPayout }: {
  soa: SoaRow; payout: DisbursementRow | null; onClose: () => void; onEdit: () => void;
  onChanged: () => Promise<void>; onOpenPayout: (id: string) => void;
}) {
  const { can } = useAuth();
  const [events, setEvents] = useState<SoaEvent[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState<null | "release" | "paid" | "receipt" | "2307" | "close">(null);
  const [note, setNote] = useState("");
  const [noteKind, setNoteKind] = useState<"follow_up" | "note">("follow_up");
  const [busy, setBusy] = useState(false);
  const f = flags(soa);

  const loadEvents = useCallback(() => api.listSoaEvents(soa.id).then(setEvents).catch((e) => setError(errorText(e))), [soa.id]);
  useEffect(() => { void loadEvents(); }, [loadEvents, soa.updated_at]);

  async function update(patch: Partial<SoaInput>) {
    setBusy(true);
    try {
      await api.saveSoa({ ...soa, ...patch });
      setStep(null);
      await onChanged();
    } catch (e) { setError(errorText(e)); }
    setBusy(false);
  }
  async function addNote() {
    if (!note.trim()) return;
    setBusy(true);
    try { await api.addSoaEvent(soa.id, noteKind, note.trim()); setNote(""); await loadEvents(); }
    catch (e) { setError(errorText(e)); }
    setBusy(false);
  }
  async function remove() {
    if (!window.confirm(`Delete SOA ${soa.soa_no}? Its timeline is deleted too.`)) return;
    try { await api.deleteSoa(soa.id); onClose(); await onChanged(); } catch (e) { setError(errorText(e)); }
  }

  const steps: { id: NonNullable<typeof step>; label: string; show: boolean }[] = [
    { id: "release", label: "Mark SOA released", show: !soa.released_on },
    { id: "paid", label: "Client paid", show: !!soa.released_on && !soa.paid_on },
    { id: "receipt", label: "Provider receipt in", show: !!soa.paid_on && !soa.provider_receipt_on },
    { id: "2307", label: "2307 received", show: soa.cwt_applicable && !soa.form_2307_on },
    { id: "close", label: "Close SOA", show: soa.stage === "receipt_issued" },
  ];

  const row = (label: string, value: ReactNode) => (
    <div className="flex justify-between gap-4 py-1.5 text-sm"><dt className="text-slate-500">{label}</dt><dd className="text-right">{value}</dd></div>
  );

  return (
    <Drawer title={`SOA ${soa.soa_no}`} subtitle={`${soa.account_name} · ${soa.provider}${soa.product ? ` · ${soa.product}` : ""}`}
      onClose={onClose}
      footer={<>
        {can("billing.delete") && <Button variant="ghost" className="mr-auto text-red-600" onClick={remove}><Trash2 className="h-4 w-4" /> Delete</Button>}
        {can("billing.edit") && <Button onClick={onEdit}><Pencil className="h-4 w-4" /> Edit all details</Button>}
      </>}>
      <div className="space-y-5">
        {error && <Alert>{error}</Alert>}

        <StageTrack stage={soa.stage} />

        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={stageInfo(soa.stage).tone}>{stageInfo(soa.stage).label}</Badge>
          {f.overdueDays > 0 && <Badge tone="red">{f.overdueDays} days past due</Badge>}
          {f.missing2307 && <Badge tone="amber">2307 missing</Badge>}
          {f.stuckDays > 0 && <Badge tone="amber">{f.stuckDays} days in this stage</Badge>}
        </div>
        {stageInfo(soa.stage).next && <p className="text-sm text-slate-600"><strong>Next:</strong> {stageInfo(soa.stage).next}.</p>}

        {can("billing.edit") && steps.some((s) => s.show) && (
          <div className="rounded-xl border border-navy/15 bg-navy-50/50 p-3">
            <div className="flex flex-wrap gap-2">
              {steps.filter((s) => s.show).map((s) => (
                <Button key={s.id} variant={step === s.id ? "primary" : "secondary"} onClick={() => setStep(step === s.id ? null : s.id)}>
                  <CheckCircle2 className="h-4 w-4" /> {s.label}
                </Button>
              ))}
            </div>
            {step && <QuickStep step={step} soa={soa} busy={busy} onSave={update} />}
          </div>
        )}

        <div className="grid gap-x-8 md:grid-cols-2">
          <dl className="divide-y">
            {row("SOA amount", <span className="font-medium">{peso(soa.amount)}</span>)}
            {row("Coverage", soa.coverage_period ?? "—")}
            {row("Released", fmtDate(soa.released_on))}
            {row("Due", fmtDate(soa.due_on))}
            {row("Client paid", soa.paid_on ? `${fmtDate(soa.paid_on)} · ${peso(soa.paid_amount)}` : "—")}
            {row("Payment ref.", soa.payment_ref ?? "—")}
          </dl>
          <dl className="divide-y">
            {row("Provider receipt", soa.provider_receipt_on ? `${soa.provider_receipt_no ?? "—"} · ${fmtDate(soa.provider_receipt_on)}` : "—")}
            {row("CWT / 2307", soa.cwt_applicable ? (soa.form_2307_on ? `Received ${fmtDate(soa.form_2307_on)}` : `Needed${soa.cwt_amount ? ` · ${peso(soa.cwt_amount)}` : ""}`) : "Not applicable")}
            {row("Commission expected", `${peso(soa.commission_expected)}${soa.commission_rate != null ? ` (${+(soa.commission_rate * 100).toFixed(2)}%)` : ""}`)}
            {row("Commission received", payout
              ? <button className="text-navy underline" onClick={() => onOpenPayout(payout.id)}>{peso(soa.commission_amount)} · {payout.reference ?? fmtDate(payout.received_on)}</button>
              : "—")}
            {row("Karla's receipt", payout?.receipt_no ? `${payout.receipt_no} · ${fmtDate(payout.receipt_issued_on)}` : "—")}
            {row("GoHighLevel", soa.ghl_link
              ? <a href={soa.ghl_link} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-1 text-navy underline">Open <ExternalLink className="h-3 w-3" /></a>
              : "—")}
          </dl>
        </div>
        {soa.notes && <p className="rounded-lg bg-slate-50 p-3 text-sm text-slate-700">{soa.notes}</p>}

        <div>
          <h3 className="mb-2 text-sm font-semibold text-navy">Timeline and follow-ups</h3>
          <div className="mb-3 flex gap-2">
            <Select className="!w-36" value={noteKind} onChange={(e) => setNoteKind(e.target.value as typeof noteKind)} aria-label="Entry type">
              <option value="follow_up">Follow-up</option>
              <option value="note">Note</option>
            </Select>
            <Input placeholder={noteKind === "follow_up" ? "e.g. Called accounting, payment promised Friday" : "Add a note"}
              value={note} maxLength={2000} onChange={(e) => setNote(e.target.value)} onKeyDown={(e) => e.key === "Enter" && void addNote()} />
            <Button onClick={addNote} loading={busy} disabled={!note.trim()}>Add</Button>
          </div>
          {!events ? <Spinner /> : (
            <ol className="space-y-2">
              {events.map((e) => (
                <li key={e.id} className="flex gap-3 text-sm">
                  <span className={cx("mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full",
                    e.kind === "stage" ? "bg-navy-50 text-navy" : e.kind === "follow_up" ? "bg-gold-50 text-[#8a6416]" : "bg-slate-100 text-slate-500")}>
                    {e.kind === "stage" ? <CheckCircle2 className="h-3.5 w-3.5" /> : e.kind === "follow_up" ? <PhoneCall className="h-3.5 w-3.5" /> : <MessageSquare className="h-3.5 w-3.5" />}
                  </span>
                  <div>
                    <div>{e.body}</div>
                    <div className="text-xs text-slate-400">{relativeTime(e.at)}{e.actor_email ? ` · ${e.actor_email}` : ""}</div>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </div>
      </div>
    </Drawer>
  );
}

function StageTrack({ stage }: { stage: SoaStage }) {
  const idx = STAGES.findIndex((s) => s.id === stage);
  return (
    <ol className="flex gap-1" aria-label="Stages">
      {STAGES.slice(1).map((s, i) => (
        <li key={s.id} title={s.label} className="flex-1">
          <div className={cx("h-1.5 rounded-full", i + 1 <= idx ? "bg-navy" : "bg-slate-200")} />
          <div className={cx("mt-1 hidden text-[11px] leading-tight sm:block", i + 1 === idx ? "font-medium text-navy" : "text-slate-400")}>{s.short}</div>
        </li>
      ))}
    </ol>
  );
}

function QuickStep({ step, soa, busy, onSave }: {
  step: "release" | "paid" | "receipt" | "2307" | "close"; soa: SoaRow; busy: boolean; onSave: (p: Partial<SoaInput>) => void;
}) {
  const [d, setD] = useState(today());
  const [a, setA] = useState(String(soa.amount));
  const [ref, setRef] = useState("");
  const [due, setDue] = useState(soa.due_on ?? "");
  const go = () => {
    if (step === "release") onSave({ released_on: d, due_on: due || null });
    if (step === "paid") onSave({ paid_on: d, paid_amount: Number(a), payment_ref: ref || null });
    if (step === "receipt") onSave({ provider_receipt_on: d, provider_receipt_no: ref || null });
    if (step === "2307") onSave({ form_2307_on: d });
    if (step === "close") onSave({ closed_on: d });
  };
  return (
    <div className="mt-3 grid items-end gap-3 sm:grid-cols-4">
      <Field label="Date"><Input type="date" value={d} max={today()} onChange={(e) => setD(e.target.value)} /></Field>
      {step === "release" && <Field label="Due date"><Input type="date" value={due} onChange={(e) => setDue(e.target.value)} /></Field>}
      {step === "paid" && <Field label="Amount paid (₱)"><Input type="number" min="0" step="0.01" value={a} onChange={(e) => setA(e.target.value)} /></Field>}
      {(step === "paid" || step === "receipt") && (
        <Field label={step === "paid" ? "Payment ref." : "Receipt no."}><Input value={ref} onChange={(e) => setRef(e.target.value)} /></Field>
      )}
      <Button variant="primary" loading={busy} disabled={!d || (step === "paid" && !(Number(a) >= 0))} onClick={go}>Save</Button>
    </div>
  );
}

// ---------------------------------------------------------------------
// Add / edit a SOA
// ---------------------------------------------------------------------

function SoaForm({ row, onClose, onSaved }: { row: Partial<SoaRow>; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState<Partial<SoaRow>>(row);
  const [ratePct, setRatePct] = useState(row.commission_rate != null ? String(+(row.commission_rate * 100).toFixed(4)) : "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const txt = (k: keyof SoaRow) => ({
    value: (f[k] as string | null | undefined) ?? "",
    onChange: (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value || null }),
  });
  const money = (k: keyof SoaRow) => ({
    type: "number", min: "0", step: "0.01", value: f[k] == null ? "" : String(f[k]),
    onChange: (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value === "" ? null : Number(e.target.value) }),
  });
  const valid = !!f.soa_no?.trim() && !!f.provider?.trim() && !!f.account_name?.trim() && f.amount != null && f.amount >= 0;

  async function save() {
    setBusy(true);
    try {
      const rate = ratePct.trim() === "" ? null : Number(ratePct) / 100;
      const rateChanged = rate !== (row.commission_rate ?? null) || f.amount !== row.amount;
      const { stage: _s, stage_changed_at: _c, created_at: _a, updated_at: _u, ...rest } = f;
      await api.saveSoa({
        ...rest, soa_no: f.soa_no!, provider: f.provider!, account_name: f.account_name!, amount: f.amount!,
        commission_rate: rate,
        // recompute expected commission from the rate unless it was typed in by hand
        commission_expected: rateChanged && f.commission_expected === row.commission_expected ? null : f.commission_expected ?? null,
      });
      onSaved();
    } catch (e) { setError(errorText(e)); setBusy(false); }
  }

  return (
    <Modal wide title={row.id ? `Edit SOA ${row.soa_no}` : "New SOA"} onClose={onClose} footer={<>
      <Button onClick={onClose}>Cancel</Button>
      <Button variant="primary" loading={busy} disabled={!valid} onClick={save}>Save</Button>
    </>}>
      <div className="grid max-h-[65vh] gap-4 overflow-y-auto pr-1">
        {error && <Alert>{error}</Alert>}
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="SOA number"><Input {...txt("soa_no")} autoFocus /></Field>
          <Field label="Provider">
            <Input list="z1-providers" {...txt("provider")} />
            <datalist id="z1-providers">{PROVIDERS.map((p) => <option key={p} value={p} />)}</datalist>
          </Field>
          <Field label="Amount (₱)"><Input {...money("amount")} /></Field>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Account (company or client)"><Input {...txt("account_name")} /></Field>
          <Field label="Product"><Input {...txt("product")} placeholder="HMO – Corporate" /></Field>
          <Field label="Coverage period"><Input {...txt("coverage_period")} placeholder="Jan–Dec 2027" /></Field>
        </div>
        <fieldset className="grid gap-3 rounded-lg border p-3 sm:grid-cols-3">
          <legend className="px-1 text-xs font-semibold uppercase text-slate-500">Billing and payment</legend>
          <Field label="Released to client"><Input type="date" {...txt("released_on")} /></Field>
          <Field label="Due"><Input type="date" {...txt("due_on")} /></Field>
          <Field label="Client paid"><Input type="date" {...txt("paid_on")} /></Field>
          <Field label="Amount paid (₱)" hint="Blank = SOA amount"><Input {...money("paid_amount")} /></Field>
          <Field label="Payment ref."><Input {...txt("payment_ref")} /></Field>
        </fieldset>
        <fieldset className="grid gap-3 rounded-lg border p-3 sm:grid-cols-3">
          <legend className="px-1 text-xs font-semibold uppercase text-slate-500">Receipt and 2307</legend>
          <Field label="Provider receipt no."><Input {...txt("provider_receipt_no")} /></Field>
          <Field label="Provider receipt date"><Input type="date" {...txt("provider_receipt_on")} /></Field>
          <div className="flex items-center gap-2 pt-6 text-sm">
            <Toggle checked={!!f.cwt_applicable} onChange={(v) => setF({ ...f, cwt_applicable: v })} label="CWT applies" /> CWT applies (2307 needed)
          </div>
          {f.cwt_applicable && <>
            <Field label="CWT amount (₱)"><Input {...money("cwt_amount")} /></Field>
            <Field label="2307 received"><Input type="date" {...txt("form_2307_on")} /></Field>
          </>}
        </fieldset>
        <fieldset className="grid gap-3 rounded-lg border p-3 sm:grid-cols-3">
          <legend className="px-1 text-xs font-semibold uppercase text-slate-500">Commission and close</legend>
          <Field label="Commission rate (%)"><Input type="number" min="0" max="100" step="0.01" value={ratePct} onChange={(e) => setRatePct(e.target.value)} /></Field>
          <Field label="Expected commission (₱)" hint="Blank = amount × rate"><Input {...money("commission_expected")} /></Field>
          <Field label="Closed on"><Input type="date" {...txt("closed_on")} /></Field>
        </fieldset>
        <Field label="GoHighLevel link" hint="The contact or opportunity in GHL, so you can jump there."><Input {...txt("ghl_link")} placeholder="https://app.gohighlevel.com/..." /></Field>
        <Field label="Notes"><Input {...txt("notes")} /></Field>
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------------
// CSV import
// ---------------------------------------------------------------------

function ImportModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [parsed, setParsed] = useState<ReturnType<typeof soasFromCsv> | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function template() {
    const example: Record<string, unknown> = Object.fromEntries(IMPORT_COLUMNS.map((c) => [c, ""]));
    Object.assign(example, { soa_no: "MX-2026-0001", provider: "Maxicare", account_name: "Sample Company Inc.", product: "HMO – Corporate",
      amount: 100000, released_on: "2026-10-01", due_on: "2026-10-31", cwt_applicable: "yes", commission_rate: "10%" });
    downloadCsv("soa-import-template.csv", [example]);
  }
  async function pick(file: File) {
    setError(null);
    setParsed(soasFromCsv(await file.text()));
  }
  async function run() {
    if (!parsed) return;
    setBusy(true);
    try { await api.importSoas(parsed.rows); onDone(); }
    catch (e) { setError(errorText(e)); setBusy(false); }
  }

  return (
    <Modal wide title="Import SOAs from a spreadsheet" onClose={onClose} footer={<>
      <Button onClick={onClose}>Cancel</Button>
      <Button variant="primary" loading={busy} disabled={!parsed || parsed.errors.length > 0 || parsed.rows.length === 0} onClick={run}>
        Import {parsed?.rows.length ? `${parsed.rows.length} SOAs` : ""}
      </Button>
    </>}>
      <div className="space-y-3 text-sm">
        <p>Save your sheet as CSV with one row per SOA. Required columns: <code>soa_no</code>, <code>provider</code>, <code>account_name</code>, <code>amount</code>. Dates as YYYY-MM-DD.</p>
        <p className="text-slate-500">Optional: {IMPORT_COLUMNS.slice(3).join(", ")}. Stages are worked out from the dates. Leave out member names and health details.</p>
        <Button onClick={template}><Download className="h-4 w-4" /> Download template</Button>
        <Input type="file" accept=".csv,text/csv" onChange={(e) => e.target.files?.[0] && void pick(e.target.files[0])} />
        {error && <Alert>{error}</Alert>}
        {parsed && parsed.errors.length > 0 && (
          <Alert>Fix these and choose the file again:<ul className="mt-1 list-disc pl-5">{parsed.errors.slice(0, 10).map((m) => <li key={m}>{m}</li>)}</ul>
            {parsed.errors.length > 10 && <div>…and {parsed.errors.length - 10} more.</div>}</Alert>
        )}
        {parsed && parsed.errors.length === 0 && parsed.rows.length > 0 && (
          <Alert tone="green">{parsed.rows.length} SOAs ready, totalling {peso(parsed.rows.reduce((a, r) => a + r.amount, 0))}.</Alert>
        )}
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------------
// Commission payouts and Karla's receipts
// ---------------------------------------------------------------------

function PayoutList({ payouts, soas, onOpen }: { payouts: DisbursementRow[]; soas: SoaRow[]; onOpen: (id: string) => void }) {
  return (
    <div className="space-y-3">
      <p className="text-sm text-slate-500">
        Record each commission payout a provider sends, tick the SOAs it covers, and Karla records her receipt once issued.
      </p>
      <div className="overflow-x-auto rounded-xl border bg-white">
        <table className="w-full min-w-[760px] text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
            <tr><th className="px-4 py-2.5">Received</th><th className="px-4 py-2.5">Provider / ref.</th><th className="px-4 py-2.5">SOAs</th>
              <th className="px-4 py-2.5 text-right">Gross</th><th className="px-4 py-2.5 text-right">Net</th><th className="px-4 py-2.5">Karla's receipt</th></tr>
          </thead>
          <tbody className="divide-y">
            {payouts.length === 0 && <tr><td colSpan={6} className="px-4 py-10 text-center text-slate-500">No payouts recorded yet.</td></tr>}
            {payouts.map((d) => {
              const linked = soas.filter((s) => s.disbursement_id === d.id);
              const sum = linked.reduce((a, s) => a + (s.commission_amount ?? 0), 0);
              const mismatch = linked.length > 0 && Math.abs(sum - d.gross_amount) >= 0.01;
              return (
                <tr key={d.id} onClick={() => onOpen(d.id)} className="cursor-pointer hover:bg-slate-50">
                  <td className="px-4 py-2.5">{fmtDate(d.received_on)}</td>
                  <td className="px-4 py-2.5"><div className="font-medium">{d.provider}</div><div className="text-xs text-slate-500">{d.reference ?? "—"}</div></td>
                  <td className="px-4 py-2.5">{linked.length}{mismatch && <span className="ml-2"><Badge tone="amber">Totals differ</Badge></span>}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{peso(d.gross_amount)}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{peso(d.net_amount)}</td>
                  <td className="px-4 py-2.5">{d.receipt_no
                    ? <Badge tone="green">{d.receipt_no} · {fmtDate(d.receipt_issued_on)}</Badge>
                    : <Badge tone="gold">Receipt due</Badge>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function PayoutForm({ row, onClose, onSaved }: { row?: DisbursementRow; onClose: () => void; onSaved: (id: string) => void }) {
  const [f, setF] = useState<DisbursementInput>(row ?? { provider: "Maxicare", received_on: today(), gross_amount: 0, withholding_amount: 0 });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function save() {
    setBusy(true);
    try { onSaved(await api.saveDisbursement(f)); } catch (e) { setError(errorText(e)); setBusy(false); }
  }
  const n = (k: "gross_amount" | "withholding_amount") => ({
    type: "number", min: "0", step: "0.01", value: String(f[k] ?? 0),
    onChange: (e: { target: { value: string } }) => setF({ ...f, [k]: Number(e.target.value || 0) }),
  });
  return (
    <Modal title={row ? "Edit payout" : "Record a commission payout"} onClose={onClose} footer={<>
      <Button onClick={onClose}>Cancel</Button>
      <Button variant="primary" loading={busy} disabled={!f.provider.trim() || !f.received_on} onClick={save}>Save</Button>
    </>}>
      <div className="grid gap-3">
        {error && <Alert>{error}</Alert>}
        <div className="grid grid-cols-2 gap-3">
          <Field label="Provider">
            <Input list="z1-providers-p" value={f.provider} onChange={(e) => setF({ ...f, provider: e.target.value })} />
            <datalist id="z1-providers-p">{PROVIDERS.map((p) => <option key={p} value={p} />)}</datalist>
          </Field>
          <Field label="Date received"><Input type="date" value={f.received_on} onChange={(e) => setF({ ...f, received_on: e.target.value })} /></Field>
        </div>
        <Field label="Provider's reference (voucher or advice no.)"><Input value={f.reference ?? ""} onChange={(e) => setF({ ...f, reference: e.target.value || null })} /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Gross commission (₱)"><Input {...n("gross_amount")} /></Field>
          <Field label="Withholding tax (₱)"><Input {...n("withholding_amount")} /></Field>
        </div>
        <p className="text-sm text-slate-500">Net received: <strong>{peso((f.gross_amount ?? 0) - (f.withholding_amount ?? 0))}</strong></p>
        <Field label="Notes"><Input value={f.notes ?? ""} onChange={(e) => setF({ ...f, notes: e.target.value || null })} /></Field>
      </div>
    </Modal>
  );
}

function PayoutDrawer({ payout, soas, onClose, onChanged, onOpenSoa }: {
  payout: DisbursementRow; soas: SoaRow[]; onClose: () => void; onChanged: () => Promise<void>; onOpenSoa: (id: string) => void;
}) {
  const { can } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [picking, setPicking] = useState(false);
  const [receiptNo, setReceiptNo] = useState(payout.receipt_no ?? "");
  const [receiptOn, setReceiptOn] = useState(payout.receipt_issued_on ?? today());
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);

  const linked = soas.filter((s) => s.disbursement_id === payout.id);
  const sum = linked.reduce((a, s) => a + (s.commission_amount ?? 0), 0);
  const diff = payout.gross_amount - sum;

  async function act(fn: () => Promise<unknown>) {
    setBusy(true);
    try { await fn(); await onChanged(); setError(null); } catch (e) { setError(errorText(e)); }
    setBusy(false);
  }
  async function copy() {
    try {
      await navigator.clipboard.writeText(receiptDetails(payout, linked));
      setCopied(true); setTimeout(() => setCopied(false), 2000);
    } catch { setError("Copy failed. Select the text and copy it by hand."); }
  }
  async function remove() {
    if (!window.confirm("Delete this payout? Its SOAs go back to awaiting commission.")) return;
    await act(async () => { await api.deleteDisbursement(payout.id); onClose(); });
  }

  return (
    <Drawer title={`${payout.provider} payout · ${fmtDate(payout.received_on)}`} subtitle={payout.reference ?? undefined} onClose={onClose}
      footer={<>
        {can("billing.delete") && <Button variant="ghost" className="mr-auto text-red-600" onClick={remove}><Trash2 className="h-4 w-4" /> Delete</Button>}
        {can("billing.edit") && <Button onClick={() => setEditing(true)}><Pencil className="h-4 w-4" /> Edit payout</Button>}
      </>}>
      <div className="space-y-5">
        {error && <Alert>{error}</Alert>}
        <div className="grid grid-cols-3 gap-3">
          {[["Gross", payout.gross_amount], ["Withholding", payout.withholding_amount], ["Net received", payout.net_amount]].map(([l, v]) => (
            <div key={l as string} className="rounded-xl border bg-white p-3">
              <div className="text-xs text-slate-500">{l}</div><div className="text-lg font-semibold text-navy">{peso(v as number)}</div>
            </div>
          ))}
        </div>

        <section>
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-navy">SOAs covered ({linked.length})</h3>
            {can("billing.edit") && <Button onClick={() => setPicking(true)}><Link2 className="h-4 w-4" /> Add SOAs</Button>}
          </div>
          {linked.length === 0 ? <p className="text-sm text-slate-500">No SOAs linked yet. Add the SOAs this payout covers.</p> : (
            <table className="w-full text-sm">
              <tbody className="divide-y">
                {linked.map((s) => (
                  <tr key={s.id}>
                    <td className="py-2"><button className="font-medium text-navy underline" onClick={() => onOpenSoa(s.id)}>{s.soa_no}</button>
                      <div className="text-xs text-slate-500">{s.account_name}</div></td>
                    <td className="py-2 text-right tabular-nums">{peso(s.commission_amount)}</td>
                    <td className="w-10 py-2 text-right">
                      {can("billing.edit") && !payout.receipt_no && <Button variant="ghost" className="!p-2" aria-label={`Unlink ${s.soa_no}`}
                        onClick={() => act(() => api.linkSoas(null, [{ soa_id: s.id, commission_amount: null }]))}><Unlink className="h-4 w-4" /></Button>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {linked.length > 0 && Math.abs(diff) >= 0.01 && (
            <div className="mt-2"><Alert tone="amber">SOA commissions add up to {peso(sum)}, which is {peso(Math.abs(diff))} {diff > 0 ? "less" : "more"} than the payout's gross. Check for a missing SOA or an adjustment.</Alert></div>
          )}
        </section>

        <section className="rounded-xl border border-gold/40 bg-gold-50/60 p-4">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-navy"><Banknote className="h-4 w-4" /> Karla's receipt to {payout.provider}</h3>
          <pre className="mt-3 whitespace-pre-wrap rounded-lg bg-white p-3 font-sans text-sm">{receiptDetails(payout, linked)}</pre>
          <div className="mt-2 flex flex-wrap gap-2">
            <Button onClick={copy}><ClipboardCopy className="h-4 w-4" /> {copied ? "Copied" : "Copy details for the receipt"}</Button>
          </div>
          {can("billing.approve") ? (
            <div className="mt-4 grid items-end gap-3 sm:grid-cols-3">
              <Field label="Receipt no. (Karla's series)"><Input value={receiptNo} onChange={(e) => setReceiptNo(e.target.value)} /></Field>
              <Field label="Date issued"><Input type="date" value={receiptOn} max={today()} onChange={(e) => setReceiptOn(e.target.value)} /></Field>
              <div className="flex gap-2">
                <Button variant="gold" loading={busy} disabled={!receiptNo.trim() || !receiptOn || linked.length === 0}
                  onClick={() => act(() => api.saveDisbursement({ ...payout, receipt_no: receiptNo.trim(), receipt_issued_on: receiptOn }))}>
                  {payout.receipt_no ? "Update" : "Record receipt"}
                </Button>
                {payout.receipt_no && <Button variant="ghost" onClick={() => act(() => api.saveDisbursement({ ...payout, receipt_no: null, receipt_issued_on: null }))}>Clear</Button>}
              </div>
            </div>
          ) : (
            <p className="mt-3 text-sm text-slate-600">
              {payout.receipt_no ? `Issued: ${payout.receipt_no} on ${fmtDate(payout.receipt_issued_on)}.` : "Waiting for Karla to issue and record her receipt."}
            </p>
          )}
        </section>
      </div>
      {editing && <PayoutForm row={payout} onClose={() => setEditing(false)} onSaved={() => { setEditing(false); void onChanged(); }} />}
      {picking && <LinkSoasModal payout={payout} soas={soas} onClose={() => setPicking(false)}
        onDone={async () => { setPicking(false); await onChanged(); }} />}
    </Drawer>
  );
}

function LinkSoasModal({ payout, soas, onClose, onDone }: {
  payout: DisbursementRow; soas: SoaRow[]; onClose: () => void; onDone: () => Promise<void>;
}) {
  const candidates = soas.filter((s) => !s.disbursement_id && s.provider.toLowerCase() === payout.provider.toLowerCase()
    && s.paid_on && s.stage !== "closed");
  const [picked, setPicked] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const total = Object.values(picked).reduce((a, v) => a + (Number(v) || 0), 0);

  async function save() {
    setBusy(true);
    try {
      await api.linkSoas(payout.id, Object.entries(picked).map(([soa_id, v]) => ({ soa_id, commission_amount: v === "" ? null : Number(v) })));
      await onDone();
    } catch (e) { setError(errorText(e)); setBusy(false); }
  }

  return (
    <Modal wide title={`SOAs covered by this ${payout.provider} payout`} onClose={onClose} footer={<>
      <span className="mr-auto self-center text-sm text-slate-600">Selected: {peso(total)} of {peso(payout.gross_amount)}</span>
      <Button onClick={onClose}>Cancel</Button>
      <Button variant="primary" loading={busy} disabled={Object.keys(picked).length === 0} onClick={save}>Link {Object.keys(picked).length || ""}</Button>
    </>}>
      {error && <div className="mb-3"><Alert>{error}</Alert></div>}
      {candidates.length === 0 ? <p className="text-sm text-slate-500">No paid {payout.provider} SOAs are waiting for commission.</p> : (
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase text-slate-500"><tr><th className="py-2" /><th>SOA</th><th>Stage</th><th className="text-right">Commission (₱)</th></tr></thead>
          <tbody className="divide-y">
            {candidates.map((s) => {
              const on = s.id in picked;
              return (
                <tr key={s.id}>
                  <td className="py-2 pr-2"><input type="checkbox" checked={on} aria-label={`Select ${s.soa_no}`} onChange={() => {
                    const next = { ...picked };
                    if (on) delete next[s.id]; else next[s.id] = s.commission_expected != null ? String(s.commission_expected) : "";
                    setPicked(next);
                  }} /></td>
                  <td className="py-2"><div className="font-medium">{s.soa_no}</div><div className="text-xs text-slate-500">{s.account_name} · {peso(s.amount)}</div></td>
                  <td className="py-2"><Badge tone={stageInfo(s.stage).tone}>{stageInfo(s.stage).short}</Badge></td>
                  <td className="w-36 py-2"><Input type="number" min="0" step="0.01" disabled={!on} value={picked[s.id] ?? ""}
                    onChange={(e) => setPicked({ ...picked, [s.id]: e.target.value })} /></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </Modal>
  );
}
