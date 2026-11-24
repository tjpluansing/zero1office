import { Download, Pencil, Plus, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../auth/AuthProvider";
import { Alert, Badge, Button, Field, Input, Modal, PageHeader, Select, Spinner, downloadCsv } from "../components/ui";
import { api, errorText } from "../lib/api";
import type { ClientRow } from "../lib/types";

/**
 * Example of a page wired to the matrix: every button is shown only when the
 * matching feature permission is on, and the database refuses the action
 * anyway if someone calls the API directly.
 */
export default function ClientsPage() {
  const { can } = useAuth();
  const [rows, setRows] = useState<ClientRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<Partial<ClientRow> | null>(null);

  const load = useCallback(() => api.listClients().then(setRows).catch((e) => setError(errorText(e))), []);
  useEffect(() => { void load(); }, [load]);

  async function remove(c: ClientRow) {
    try { await api.deleteClient(c.id); await load(); } catch (e) { setError(errorText(e)); }
  }
  async function exportCsv() {
    try {
      const all = await api.exportClients();
      downloadCsv(`clients-${new Date().toISOString().slice(0, 10)}.csv`, all as unknown as Record<string, unknown>[]);
    } catch (e) { setError(errorText(e)); }
  }

  const tone = { lead: "slate", applying: "amber", active: "green", lapsed: "red" } as const;

  return (
    <div>
      <PageHeader title="Client Masterlist" description="Routing details only. Medical and ID documents stay with the insurer."
        actions={<>
          {can("clients.export") && <Button onClick={exportCsv}><Download className="h-4 w-4" /> Export</Button>}
          {can("clients.create") && <Button variant="primary" onClick={() => setEditing({ status: "lead" })}><Plus className="h-4 w-4" /> Add client</Button>}
        </>} />
      {error && <div className="mb-4"><Alert>{error}</Alert></div>}
      {!rows ? <div className="grid h-40 place-items-center"><Spinner /></div> : (
        <div className="overflow-x-auto rounded-xl border bg-white">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr><th className="px-4 py-2.5">Client</th><th className="px-4 py-2.5">Insurer</th><th className="px-4 py-2.5">Product</th><th className="px-4 py-2.5">Status</th><th className="px-4 py-2.5" /></tr>
            </thead>
            <tbody className="divide-y">
              {rows.map((c) => (
                <tr key={c.id}>
                  <td className="px-4 py-2.5"><div className="font-medium">{c.full_name}</div><div className="text-xs text-slate-500">{c.company ?? c.email ?? ""}</div></td>
                  <td className="px-4 py-2.5">{c.insurer}</td>
                  <td className="px-4 py-2.5">{c.product}</td>
                  <td className="px-4 py-2.5"><Badge tone={tone[c.status]}>{c.status}</Badge></td>
                  <td className="px-4 py-2.5">
                    <div className="flex justify-end gap-1">
                      {can("clients.edit") && <Button variant="ghost" className="!p-2" aria-label="Edit" onClick={() => setEditing(c)}><Pencil className="h-4 w-4" /></Button>}
                      {can("clients.delete") && <Button variant="ghost" className="!p-2" aria-label="Delete" onClick={() => remove(c)}><Trash2 className="h-4 w-4" /></Button>}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {editing && <ClientForm row={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); void load(); }} />}
    </div>
  );
}

function ClientForm({ row, onClose, onSaved }: { row: Partial<ClientRow>; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState(row);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (k: keyof ClientRow) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value || null });
  async function save() {
    setBusy(true);
    try { await api.saveClient({ ...f, full_name: f.full_name ?? "" }); onSaved(); }
    catch (e) { setError(errorText(e)); setBusy(false); }
  }
  return (
    <Modal title={row.id ? "Edit client" : "Add client"} onClose={onClose} footer={<>
      <Button onClick={onClose}>Cancel</Button>
      <Button variant="primary" loading={busy} disabled={!f.full_name} onClick={save}>Save</Button>
    </>}>
      <div className="grid gap-3">
        {error && <Alert>{error}</Alert>}
        <Field label="Full name"><Input value={f.full_name ?? ""} onChange={set("full_name")} autoFocus /></Field>
        <Field label="Company"><Input value={f.company ?? ""} onChange={set("company")} /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Insurer"><Input value={f.insurer ?? ""} onChange={set("insurer")} /></Field>
          <Field label="Product"><Input value={f.product ?? ""} onChange={set("product")} /></Field>
        </div>
        <Field label="Status">
          <Select value={f.status ?? "lead"} onChange={set("status")}>
            {["lead", "applying", "active", "lapsed"].map((s) => <option key={s}>{s}</option>)}
          </Select>
        </Field>
      </div>
    </Modal>
  );
}
