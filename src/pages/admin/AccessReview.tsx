import { AlertTriangle, CheckCircle2, ClipboardCheck, Download } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "../../auth/AuthProvider";
import { Alert, Badge, Button, Field, PageHeader, Spinner, cx, downloadCsv, relativeTime } from "../../components/ui";
import { api, errorText } from "../../lib/api";
import { groupByPage } from "../../lib/permissions";
import type { AccessReviewData, Catalog, ReviewUser } from "../../lib/types";

const LETTER: Record<string, string> = { view: "V", create: "C", edit: "E", delete: "D", export: "X", approve: "A" };
const DAY = 86_400_000;
const SHORT: Record<string, string> = {
  dashboard: "Dash", clients: "Clients", quotes: "Quotes", billing: "Billing", reports: "Reports",
  admin_users: "Users", admin_settings: "Settings", integrations: "Integr.", audit_log: "Audit",
};

function flags(u: ReviewUser): string[] {
  const f: string[] = [];
  if (u.status === "active" && (!u.last_login_at || Date.now() - new Date(u.last_login_at).getTime() > 30 * DAY))
    f.push(u.last_login_at ? "No sign-in for 30+ days" : "Never signed in");
  const sensitive = u.permissions.some((k) => /^(admin_users|admin_settings|integrations)\./.test(k) || k.endsWith(".export"));
  if (sensitive && !u.mfa) f.push("Admin or export without two-step");
  if (u.overrides > 0) f.push(`${u.overrides} custom permission${u.overrides === 1 ? "" : "s"}`);
  if (u.status === "pending") f.push("Waiting for approval");
  return f;
}

export function reviewDue(d: AccessReviewData | null): { overdue: boolean; days: number | null } {
  if (!d?.last_review) return { overdue: true, days: null };
  const days = Math.floor((Date.now() - new Date(d.last_review.reviewed_at).getTime()) / DAY);
  return { overdue: days >= d.review_days, days };
}

export default function AccessReviewPage() {
  const { can } = useAuth();
  const [data, setData] = useState<AccessReviewData | null>(null);
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const load = useCallback(async () => {
    try {
      const [d, c] = await Promise.all([api.getAccessReview(), api.getCatalog()]);
      setData(d);
      setCatalog(c);
    } catch (e) { setError(errorText(e)); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const pages = useMemo(() => (catalog ? groupByPage(catalog.permissions) : []), [catalog]);
  const due = reviewDue(data);
  const flagged = data?.users.filter((u) => flags(u).length > 0).length ?? 0;
  const roleName = (id: string) => catalog?.roles.find((r) => r.id === id)?.name ?? id;

  async function complete() {
    setBusy(true);
    setError(null);
    try {
      await api.completeAccessReview(notes.trim());
      setNotes("");
      setDone(true);
      await load();
    } catch (e) { setError(errorText(e)); }
    setBusy(false);
  }

  function exportCsv() {
    if (!data) return;
    downloadCsv(`access-review-${new Date().toISOString().slice(0, 10)}.csv`, data.users.map((u) => ({
      name: u.full_name, email: u.email, role: roleName(u.role_id), status: u.status,
      last_login: u.last_login_at ?? "never", two_step: u.mfa ? "on" : "off",
      custom_permissions: u.overrides, permissions: u.permissions.join(" "), flags: flags(u).join("; "),
    })));
  }

  if (!data || !catalog) return error ? <Alert>{error}</Alert> : <div className="grid h-64 place-items-center"><Spinner /></div>;

  return (
    <div>
      <PageHeader title="Access Review"
        description={`Once every ${data.review_days} days, check that everyone still needs the access they have. Required by the NPC's security rules.`}
        actions={can("admin_users.view") && <Button onClick={exportCsv}><Download className="h-4 w-4" /> Export CSV</Button>} />

      <div className="mb-5 grid gap-3 sm:grid-cols-3">
        <div className={cx("rounded-xl border px-4 py-3", due.overdue ? "border-amber-300 bg-amber-50" : "bg-white")}>
          <div className="text-xs text-slate-500">Last review</div>
          <div className="mt-0.5 font-semibold text-navy">
            {data.last_review ? relativeTime(data.last_review.reviewed_at) : "Never"}
          </div>
          <div className="text-xs text-slate-500">
            {data.last_review ? `by ${data.last_review.reviewer_email ?? "unknown"}` : "Do the first one before launch"}
          </div>
        </div>
        <div className="rounded-xl border bg-white px-4 py-3">
          <div className="text-xs text-slate-500">Status</div>
          <div className={cx("mt-0.5 flex items-center gap-1.5 font-semibold", due.overdue ? "text-amber-700" : "text-emerald-700")}>
            {due.overdue ? <><AlertTriangle className="h-4 w-4" /> Due now</> : <><CheckCircle2 className="h-4 w-4" /> Up to date</>}
          </div>
          <div className="text-xs text-slate-500">{due.overdue ? "" : `Next in ${data.review_days - (due.days ?? 0)} days`}</div>
        </div>
        <div className="rounded-xl border bg-white px-4 py-3">
          <div className="text-xs text-slate-500">Accounts to look at</div>
          <div className="mt-0.5 font-semibold text-navy">{flagged} of {data.users.length}</div>
          <div className="text-xs text-slate-500">Flags are shown on each row</div>
        </div>
      </div>

      {error && <div className="mb-4"><Alert>{error}</Alert></div>}

      <div className="overflow-x-auto rounded-xl border bg-white">
        <table className="w-full min-w-[980px] text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-2.5 text-left">User</th>
              <th className="px-3 py-2.5 text-left">Last sign-in</th>
              <th className="px-3 py-2.5 text-left">2-step</th>
              {pages.map((p) => <th key={p.page} className="px-2 py-2.5 text-center font-semibold normal-case" title={p.label}>{SHORT[p.page] ?? p.label}</th>)}
              <th className="px-3 py-2.5 text-left">Check</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {data.users.map((u) => {
              const f = flags(u);
              const set = new Set(u.permissions);
              return (
                <tr key={u.id} className={cx(f.length > 0 && "bg-amber-50/40")}>
                  <td className="px-4 py-2.5">
                    <div className="font-medium">{u.full_name || u.email}</div>
                    <div className="text-xs text-slate-500">{roleName(u.role_id)}{u.status !== "active" && ` · ${u.status}`}</div>
                  </td>
                  <td className="px-3 py-2.5 text-slate-600">{relativeTime(u.last_login_at)}</td>
                  <td className="px-3 py-2.5">{u.mfa ? <Badge tone="green">On</Badge> : <Badge>Off</Badge>}</td>
                  {pages.map((p) => {
                    const letters = p.perms.filter((x) => set.has(x.key)).map((x) => LETTER[x.action]).join("");
                    return <td key={p.page} className="px-2 py-2.5 text-center font-mono text-xs text-navy">{letters || <span className="text-slate-300">·</span>}</td>;
                  })}
                  <td className="px-3 py-2.5">
                    <div className="flex flex-col gap-1">{f.map((x) => <span key={x} className="text-xs text-amber-800">{x}</span>)}</div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-xs text-slate-500">V view · C create · E edit · D delete · X export · A approve. Change anyone's access from Manage Users.</p>

      {can("admin_users.edit") && (
        <div className="mt-6 rounded-xl border bg-white p-5">
          <h2 className="mb-3 flex items-center gap-2 font-semibold text-navy"><ClipboardCheck className="h-4 w-4" /> Sign off this review</h2>
          {done && <div className="mb-3"><Alert tone="green">Review recorded with a snapshot of everyone's access.</Alert></div>}
          <Field label="Notes (what you changed or checked)">
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3}
              className="block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-navy focus:outline-none focus:ring-2 focus:ring-navy/20"
              placeholder="e.g. Removed export from the OJT account; everyone else still needs their access." />
          </Field>
          <Button variant="primary" className="mt-3" loading={busy} onClick={complete}>Mark review complete</Button>
        </div>
      )}
    </div>
  );
}
