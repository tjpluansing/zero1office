import { Download } from "lucide-react";
import { useEffect, useState } from "react";
import { useAuth } from "../../auth/AuthProvider";
import { Alert, Button, PageHeader, Spinner, downloadCsv, relativeTime } from "../../components/ui";
import { api, errorText } from "../../lib/api";
import type { AuditRow } from "../../lib/types";

const LABELS: Record<string, string> = {
  "user.login": "Signed in",
  "user.created": "Created user",
  "user.updated": "Updated user",
  "user.deleted": "Deleted user",
  "user.delete_requested": "Deleted user",
  "permission.insert": "Changed permission",
  "permission.update": "Changed permission",
  "permission.delete": "Removed custom permission",
  "password.changed": "Changed own password",
  "password.reset_by_admin": "Reset a password",
  "password.reset_email_sent": "Sent a reset link",
  export: "Exported data",
  "integration.updated": "Changed an integration",
  "integration.tested": "Tested an integration",
  "integration.disconnected": "Disconnected an integration",
  "policy.accepted": "Accepted the agreement",
  "policy.published": "Published a new agreement",
  "mfa.enrolled": "Turned on two-step",
  "mfa.reset_by_admin": "Reset two-step",
  "access_review.completed": "Completed access review",
};

function summary(r: AuditRow): string {
  const d = r.details ?? {};
  const parts: string[] = [];
  if (typeof d.email === "string") parts.push(d.email);
  if (typeof d.permission === "string") parts.push(`${d.permission}: ${d.from ?? "role default"} → ${d.to ?? "role default"}`);
  for (const k of ["role_id", "status", "full_name"]) {
    const c = d[k] as { from?: unknown; to?: unknown } | undefined;
    if (c && typeof c === "object") parts.push(`${k.replace("_id", "")}: ${String(c.from)} → ${String(c.to)}`);
  }
  if (r.target_type === "integration" || typeof d.integration === "string") parts.push(String(d.integration ?? r.target_id));
  if (typeof d.ok === "boolean") parts.push(d.ok ? "passed" : `failed${d.error ? `: ${String(d.error)}` : ""}`);
  if (d.key_replaced === true) parts.push("key replaced");
  if (typeof d.rows === "number") parts.push(`${r.target_type}, ${d.rows} rows`);
  return parts.join(" · ");
}

export default function AuditLogPage() {
  const { can } = useAuth();
  const [rows, setRows] = useState<AuditRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { api.listAudit().then(setRows).catch((e) => setError(errorText(e))); }, []);

  async function exportCsv() {
    try {
      const all = await api.exportAudit();
      downloadCsv(`audit-log-${new Date().toISOString().slice(0, 10)}.csv`, all as unknown as Record<string, unknown>[]);
    } catch (e) { setError(errorText(e)); }
  }

  return (
    <div>
      <PageHeader title="Audit Log" description="Every sign-in, user change, permission change and export. Entries cannot be edited or deleted from the app."
        actions={can("audit_log.export") && <Button onClick={exportCsv}><Download className="h-4 w-4" /> Export CSV</Button>} />
      {error && <Alert>{error}</Alert>}
      {!rows ? <div className="grid h-40 place-items-center"><Spinner /></div> : (
        <div className="overflow-x-auto rounded-xl border bg-white">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr><th className="px-4 py-2.5">When</th><th className="px-4 py-2.5">Who</th><th className="px-4 py-2.5">What</th><th className="px-4 py-2.5">Details</th></tr>
            </thead>
            <tbody className="divide-y">
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className="whitespace-nowrap px-4 py-2.5 text-slate-500" title={r.at}>{relativeTime(r.at)}</td>
                  <td className="px-4 py-2.5">{r.actor_email ?? <span className="text-slate-400">system</span>}</td>
                  <td className="px-4 py-2.5 font-medium">{LABELS[r.action] ?? r.action}</td>
                  <td className="px-4 py-2.5 text-slate-600">{summary(r)}</td>
                </tr>
              ))}
              {rows.length === 0 && <tr><td colSpan={4} className="px-4 py-10 text-center text-slate-500">Nothing logged yet.</td></tr>}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
