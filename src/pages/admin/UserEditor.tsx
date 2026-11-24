import { Mail, KeyRound } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "../../auth/AuthProvider";
import PermissionsMatrix from "../../components/PermissionsMatrix";
import { Alert, Badge, Button, Drawer, Field, Input, Select, Spinner, cx } from "../../components/ui";
import { api, errorText } from "../../lib/api";
import { computeEffective, diffToOverrides } from "../../lib/permissions";
import type { Catalog, UserRow } from "../../lib/types";

interface Props {
  catalog: Catalog;
  user: UserRow | null; // null = create
  onClose: () => void;
  onSaved: (result?: { temp_password?: string; email: string }) => void;
}

export default function UserEditor({ catalog, user, onClose, onSaved }: Props) {
  const { access, can } = useAuth();
  const creating = !user;
  const isSelf = user?.id === access?.id;
  const targetIsSuper = catalog.roles.find((r) => r.id === user?.role_id)?.is_super ?? false;
  const readOnly = !creating && (!can("admin_users.edit") || (targetIsSuper && !access?.is_super));

  const [fullName, setFullName] = useState(user?.full_name ?? "");
  const [email, setEmail] = useState("");
  const [roleId, setRoleId] = useState(user?.role_id === "no_access" || !user ? "assistant" : user.role_id);
  const [mode, setMode] = useState<"invite" | "temp_password">("invite");
  const [perms, setPerms] = useState<Set<string> | null>(creating ? null : null);
  const [loading, setLoading] = useState(!creating);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load current overrides → effective set
  useEffect(() => {
    let alive = true;
    if (creating) {
      setPerms(computeEffective(catalog, roleId, []));
      return;
    }
    api.getOverrides(user!.id).then((o) => {
      if (!alive) return;
      setPerms(computeEffective(catalog, user!.role_id, o));
      setLoading(false);
    }).catch((e) => { setError(errorText(e)); setLoading(false); });
    return () => { alive = false; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Anti-escalation in the UI too: non-super admins only hand out what they have.
  const grantable = useMemo(() => (access?.is_super ? null : new Set(access?.permissions ?? [])), [access]);
  const roleOptions = catalog.roles.filter((r) => {
    if (r.is_super && !access?.is_super) return false;
    if (access?.is_super) return true;
    return (catalog.rolePermissions[r.id] ?? []).every((k) => grantable?.has(k));
  });

  function changeRole(next: string) {
    // Switching role resets the matrix to that role's preset.
    setRoleId(next);
    setPerms(computeEffective(catalog, next, []));
  }

  async function save() {
    if (!perms) return;
    setBusy(true);
    setError(null);
    try {
      const overrides = diffToOverrides(catalog, roleId, perms);
      if (creating) {
        const res = await api.createUser({ email, full_name: fullName.trim(), role_id: roleId, mode, overrides });
        onSaved({ temp_password: res.temp_password, email });
      } else {
        if (fullName.trim() !== user!.full_name || roleId !== user!.role_id) {
          await api.updateUser(user!.id, { full_name: fullName.trim(), role_id: roleId });
        }
        if (!isSelf) await api.setOverrides(user!.id, overrides);
        if (user!.status === "pending") await api.setStatus(user!.id, "active");
        onSaved();
      }
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  const emailOk = /^[^@\s]+@ask-karla\.com$/i.test(email.trim());
  const role = catalog.roles.find((r) => r.id === roleId);

  return (
    <Drawer
      title={creating ? "Add a user" : fullName || user!.email}
      subtitle={creating ? "They get the role preset below; adjust any box for this person only." : (
        <span className="flex items-center gap-2">{user!.email}{isSelf && <Badge tone="navy">You</Badge>}</span>
      )}
      onClose={onClose}
      footer={<>
        <Button onClick={onClose}>Cancel</Button>
        {!readOnly && (
          <Button variant="primary" loading={busy} onClick={save}
            disabled={!perms || (creating && (!emailOk || !fullName.trim()))}>
            {creating ? (mode === "invite" ? "Send invite" : "Create user") : user!.status === "pending" ? "Approve access" : "Save changes"}
          </Button>
        )}
      </>}
    >
      {loading || !perms ? <div className="grid h-40 place-items-center"><Spinner /></div> : (
        <div className="space-y-6">
          {error && <Alert>{error}</Alert>}
          {readOnly && <Alert tone="amber">Only a Super Admin can change this account.</Alert>}
          {user?.status === "pending" && !readOnly && (
            <Alert tone="amber">This person signed in with Microsoft but has no access yet. Pick a role and approve.</Alert>
          )}

          <section className="grid gap-4 sm:grid-cols-2">
            <Field label="Full name">
              <Input value={fullName} onChange={(e) => setFullName(e.target.value)} disabled={readOnly} autoFocus={creating} />
            </Field>
            {creating ? (
              <Field label="Work email" error={email && !emailOk ? "Must be an @ask-karla.com address" : undefined}>
                <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@ask-karla.com" />
              </Field>
            ) : (
              <Field label="Work email" hint="Email cannot be changed here.">
                <Input value={user!.email} disabled />
              </Field>
            )}
            <Field label="Role preset" hint={isSelf ? "You can't change your own role. Another Super Admin can." : role?.description}>
              <Select value={roleId} onChange={(e) => changeRole(e.target.value)} disabled={readOnly || isSelf}>
                {roleOptions.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                {!roleOptions.some((r) => r.id === roleId) && <option value={roleId}>{role?.name}</option>}
              </Select>
            </Field>
          </section>

          {creating && (
            <section>
              <div className="mb-2 text-sm font-medium">How should they get in?</div>
              <div className="grid gap-3 sm:grid-cols-2">
                {([
                  ["invite", Mail, "Email an invite", "They click the link and set their own password. Or they use Sign in with Microsoft."],
                  ["temp_password", KeyRound, "Temporary password", "You see a one-time password to hand over. They must change it at first sign-in."],
                ] as const).map(([id, Icon, title, desc]) => (
                  <button key={id} type="button" onClick={() => setMode(id)}
                    className={cx("rounded-xl border p-3 text-left transition",
                      mode === id ? "border-navy ring-2 ring-navy/15 bg-navy-50/50" : "hover:border-slate-400")}>
                    <div className="flex items-center gap-2 text-sm font-medium"><Icon className="h-4 w-4 text-navy" />{title}</div>
                    <div className="mt-1 text-xs text-slate-500">{desc}</div>
                  </button>
                ))}
              </div>
            </section>
          )}

          <section>
            <h3 className="mb-1 text-sm font-semibold text-navy">Permissions</h3>
            <PermissionsMatrix
              catalog={catalog}
              roleId={roleId}
              value={perms}
              onChange={setPerms}
              grantable={grantable}
              disabled={readOnly || isSelf}
              disabledReason={isSelf ? "You can't change your own permissions." : undefined}
            />
          </section>
        </div>
      )}
    </Drawer>
  );
}
