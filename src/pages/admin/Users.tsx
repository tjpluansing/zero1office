import { Copy, KeyRound, Pause, Pencil, Play, Search, ShieldCheck, Trash2, UserCheck, UserPlus } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "../../auth/AuthProvider";
import { Alert, Badge, Button, Field, Input, Modal, PageHeader, Select, Spinner, cx, relativeTime } from "../../components/ui";
import { api, errorText } from "../../lib/api";
import type { AccessReviewData, Catalog, UserRow } from "../../lib/types";
import { Link } from "react-router-dom";
import { reviewDue } from "./AccessReview";
import UserEditor from "./UserEditor";

type Dialog =
  | { kind: "edit"; user: UserRow | null }
  | { kind: "delete"; user: UserRow }
  | { kind: "reset"; user: UserRow }
  | { kind: "temp"; email: string; password: string };

function statusOf(u: UserRow): { label: string; tone: "green" | "red" | "amber" | "slate" } {
  if (u.status === "suspended") return { label: "Suspended", tone: "red" };
  if (u.status === "pending") return { label: "Needs approval", tone: "amber" };
  if (!u.last_login_at) return { label: "Invited", tone: "slate" };
  return { label: "Active", tone: "green" };
}

export default function UsersPage() {
  const { access, can } = useAuth();
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [review, setReview] = useState<AccessReviewData | null>(null);
  useEffect(() => { api.getAccessReview().then(setReview).catch(() => undefined); }, []);

  const load = useCallback(async () => {
    try {
      const [c, u] = await Promise.all([api.getCatalog(), api.listUsers()]);
      setCatalog(c);
      setUsers(u);
      setError(null);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const roleName = (id: string) => catalog?.roles.find((r) => r.id === id)?.name ?? id;
  const isSuperRole = (id: string) => !!catalog?.roles.find((r) => r.id === id)?.is_super;

  const filtered = useMemo(() => users.filter((u) => {
    const s = q.trim().toLowerCase();
    if (s && !`${u.full_name} ${u.email}`.toLowerCase().includes(s)) return false;
    if (roleFilter && u.role_id !== roleFilter) return false;
    if (statusFilter && statusOf(u).label !== statusFilter) return false;
    return true;
  }), [users, q, roleFilter, statusFilter]);

  const counts = useMemo(() => ({
    total: users.length,
    active: users.filter((u) => u.status === "active").length,
    suspended: users.filter((u) => u.status === "suspended").length,
    pending: users.filter((u) => u.status === "pending").length,
  }), [users]);

  async function run(id: string, fn: () => Promise<unknown>, ok: string) {
    setBusyId(id);
    setError(null);
    try {
      await fn();
      setNotice(ok);
      await load();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusyId(null);
    }
  }

  if (loading) return <div className="grid h-64 place-items-center"><Spinner /></div>;

  return (
    <div>
      <PageHeader
        title="Manage Users"
        description="Who can sign in, their role, and exactly which pages and actions they can use."
        actions={can("admin_users.create") && (
          <Button variant="primary" onClick={() => setDialog({ kind: "edit", user: null })}>
            <UserPlus className="h-4 w-4" /> Add user
          </Button>
        )}
      />

      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[["Users", counts.total], ["Active", counts.active], ["Needs approval", counts.pending], ["Suspended", counts.suspended]].map(([l, n]) => (
          <div key={l as string} className="rounded-xl border bg-white px-4 py-3">
            <div className="text-xs text-slate-500">{l}</div>
            <div className="mt-0.5 text-xl font-semibold text-navy">{n}</div>
          </div>
        ))}
      </div>

      {catalog && users.filter((u) => u.status === "active" && isSuperRole(u.role_id)).length < 2 && (
        <div className="mb-4"><Alert tone="amber">
          <b>Only one active Super Admin.</b> If that account is lost, nobody can manage users. Make a second trusted person
          (e.g. Karla) a Super Admin and keep an emergency login in the company password manager.
        </Alert></div>
      )}
      {review && reviewDue(review).overdue && (
        <div className="mb-4"><Alert tone="navy">
          The monthly access review is due. <Link to="/admin/access-review" className="font-semibold underline">Review access</Link>
        </Alert></div>
      )}
      {error && <div className="mb-4"><Alert>{error}</Alert></div>}
      {notice && !error && <div className="mb-4"><Alert tone="green">{notice}</Alert></div>}

      <div className="rounded-xl border bg-white">
        <div className="flex flex-wrap items-center gap-2 border-b p-3">
          <div className="relative min-w-[200px] flex-1">
            <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <Input placeholder="Search name or email" value={q} onChange={(e) => setQ(e.target.value)} className="pl-9" />
          </div>
          <Select value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)} className="!w-auto" aria-label="Filter by role">
            <option value="">All roles</option>
            {catalog?.roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </Select>
          <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="!w-auto" aria-label="Filter by status">
            <option value="">All statuses</option>
            {["Active", "Invited", "Needs approval", "Suspended"].map((s) => <option key={s}>{s}</option>)}
          </Select>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-2.5 font-semibold">User</th>
                <th className="px-4 py-2.5 font-semibold">Role</th>
                <th className="px-4 py-2.5 font-semibold">Status</th>
                <th className="px-4 py-2.5 font-semibold">Last login</th>
                <th className="px-4 py-2.5 text-right font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {filtered.map((u) => {
                const self = u.id === access?.id;
                const st = statusOf(u);
                const superTarget = isSuperRole(u.role_id);
                const protectedRow = self || (superTarget && !access?.is_super);
                const whyNot = self ? "You can't do this to your own account" : "Only a Super Admin can change a Super Admin";
                const initials = (u.full_name || u.email).split(/[\s@.]/).filter(Boolean).slice(0, 2).map((s) => s[0]!.toUpperCase()).join("");
                return (
                  <tr key={u.id} className={cx("hover:bg-slate-50/70", busyId === u.id && "opacity-60")}>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className={cx("grid h-9 w-9 shrink-0 place-items-center rounded-full text-xs font-semibold",
                          superTarget ? "bg-gold text-navy" : "bg-navy-50 text-navy")}>{initials}</div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5 font-medium">
                            {u.full_name || <span className="text-slate-400">No name yet</span>}
                            {self && <Badge tone="navy">You</Badge>}
                          </div>
                          <div className="truncate text-xs text-slate-500">{u.email}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        {superTarget && <ShieldCheck className="h-4 w-4 text-gold" />}
                        {roleName(u.role_id)}
                      </div>
                      {u.override_count > 0 && <div className="text-xs text-[#8a6416]">+ {u.override_count} custom</div>}
                    </td>
                    <td className="px-4 py-3">
                      <Badge tone={st.tone}>{st.label}</Badge>
                      {u.must_change_password && <div className="mt-1 text-xs text-slate-500">Must set password</div>}
                    </td>
                    <td className="px-4 py-3 text-slate-600" title={u.last_login_at ?? ""}>{relativeTime(u.last_login_at)}</td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-1">
                        <IconBtn label={u.status === "pending" ? "Review and approve" : "Edit"} onClick={() => setDialog({ kind: "edit", user: u })}
                          icon={u.status === "pending" ? UserCheck : Pencil} highlight={u.status === "pending"} />
                        {can("admin_users.edit") && u.status !== "pending" && (
                          u.status === "suspended" ? (
                            <IconBtn label="Reactivate" icon={Play} disabled={protectedRow} why={whyNot}
                              onClick={() => run(u.id, () => api.setStatus(u.id, "active"), `${u.email} can sign in again.`)} />
                          ) : (
                            <IconBtn label="Suspend" icon={Pause} disabled={protectedRow} why={whyNot}
                              onClick={() => run(u.id, () => api.setStatus(u.id, "suspended"), `${u.email} is suspended and signed out.`)} />
                          )
                        )}
                        {can("admin_users.edit") && (
                          <IconBtn label="Reset sign-in" icon={KeyRound} disabled={protectedRow} why={whyNot}
                            onClick={() => setDialog({ kind: "reset", user: u })} />
                        )}
                        {can("admin_users.delete") && (
                          <IconBtn label="Delete" icon={Trash2} danger disabled={protectedRow} why={whyNot}
                            onClick={() => setDialog({ kind: "delete", user: u })} />
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr><td colSpan={5} className="px-4 py-10 text-center text-slate-500">No users match.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {dialog?.kind === "edit" && catalog && (
        <UserEditor catalog={catalog} user={dialog.user} onClose={() => setDialog(null)}
          onSaved={(res) => {
            setDialog(res?.temp_password ? { kind: "temp", email: res.email, password: res.temp_password } : null);
            setNotice(dialog.user ? "Changes saved. They apply on the user's next request." :
              res?.temp_password ? null : `Invite sent to ${res?.email}.`);
            void load();
          }} />
      )}
      {dialog?.kind === "delete" && (
        <DeleteDialog user={dialog.user} onClose={() => setDialog(null)}
          onConfirm={() => { const u = dialog.user; setDialog(null); return run(u.id, () => api.deleteUser(u.id), `${u.email} was deleted.`); }} />
      )}
      {dialog?.kind === "reset" && (
        <ResetDialog user={dialog.user} onClose={() => setDialog(null)}
          onDone={(pw) => { setDialog(pw ? { kind: "temp", email: dialog.user.email, password: pw } : null);
            if (!pw) setNotice(`Done for ${dialog.user.email}.`); void load(); }} />
      )}
      {dialog?.kind === "temp" && <TempPasswordDialog email={dialog.email} password={dialog.password} onClose={() => setDialog(null)} />}
    </div>
  );
}

function IconBtn({ label, icon: Icon, onClick, disabled, why, danger, highlight }: {
  label: string; icon: typeof Pencil; onClick: () => void; disabled?: boolean; why?: string; danger?: boolean; highlight?: boolean;
}) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} aria-label={label} title={disabled ? why : label}
      className={cx("rounded-lg p-2 transition disabled:cursor-not-allowed disabled:opacity-30",
        highlight ? "bg-gold-50 text-[#8a6416] hover:bg-gold-300/40" :
        danger ? "text-slate-500 hover:bg-red-50 hover:text-red-600" : "text-slate-500 hover:bg-slate-100 hover:text-navy")}>
      <Icon className="h-4 w-4" />
    </button>
  );
}

function DeleteDialog({ user, onClose, onConfirm }: { user: UserRow; onClose: () => void; onConfirm: () => void }) {
  const [typed, setTyped] = useState("");
  return (
    <Modal title="Delete user" onClose={onClose} footer={<>
      <Button onClick={onClose}>Cancel</Button>
      <Button variant="danger" disabled={typed.trim().toLowerCase() !== user.email.toLowerCase()} onClick={onConfirm}>Delete permanently</Button>
    </>}>
      <div className="space-y-3 text-sm">
        <p>This removes <b>{user.email}</b> and their sign-in. Their past actions stay in the audit log. This can't be undone.</p>
        <p className="text-slate-500">Tip: Suspend is usually better. It blocks access but keeps the account.</p>
        <Field label="Type the email to confirm"><Input value={typed} onChange={(e) => setTyped(e.target.value)} autoFocus /></Field>
      </div>
    </Modal>
  );
}

function ResetDialog({ user, onClose, onDone }: { user: UserRow; onClose: () => void; onDone: (tempPassword?: string) => void }) {
  const [busy, setBusy] = useState<"email" | "temp_password" | "mfa" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const go = async (mode: "email" | "temp_password" | "mfa") => {
    setBusy(mode);
    setError(null);
    try {
      if (mode === "mfa") { await api.resetMfa(user.id); onDone(); return; }
      const r = await api.resetPassword(user.id, mode);
      onDone(r.temp_password);
    } catch (e) {
      setError(errorText(e));
      setBusy(null);
    }
  };
  return (
    <Modal title="Reset sign-in" onClose={onClose}>
      <div className="space-y-3 text-sm">
        {error && <Alert>{error}</Alert>}
        <p>How should <b>{user.email}</b> get back in?</p>
        <Button className="w-full justify-start" loading={busy === "email"} onClick={() => go("email")}>Email them a reset link</Button>
        <Button className="w-full justify-start" loading={busy === "temp_password"} onClick={() => go("temp_password")}>
          Give me a temporary password (they must change it at sign-in)
        </Button>
        <Button className="w-full justify-start" loading={busy === "mfa"} onClick={() => go("mfa")}>
          Reset two-step verification (lost phone)
        </Button>
      </div>
    </Modal>
  );
}

function TempPasswordDialog({ email, password, onClose }: { email: string; password: string; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  return (
    <Modal title="Temporary password" onClose={onClose} footer={<Button variant="primary" onClick={onClose}>Done</Button>}>
      <div className="space-y-3 text-sm">
        <p>Give this to <b>{email}</b> in person or by a private message. It is shown only once, and they must change it at first sign-in.</p>
        <div className="flex items-center gap-2 rounded-lg border bg-slate-50 px-3 py-2 font-mono text-base">
          <span className="flex-1 select-all">{password}</span>
          <Button variant="ghost" className="!p-1.5" aria-label="Copy"
            onClick={() => { void navigator.clipboard?.writeText(password); setCopied(true); }}>
            <Copy className="h-4 w-4" />
          </Button>
        </div>
        {copied && <p className="text-xs text-emerald-700">Copied.</p>}
      </div>
    </Modal>
  );
}
