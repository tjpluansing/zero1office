import { CheckCircle2, ShieldCheck, UserRound } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../auth/AuthProvider";
import { Alert, Badge, Button, Field, FullPageSpinner, Input, PageHeader, relativeTime } from "../components/ui";
import { api, errorText } from "../lib/api";
import { NAV } from "../lib/nav";
import type { MyProfile } from "../lib/types";

const PHONE_OK = /^[0-9+() -]{0,20}$/;

/** My profile: everyone keeps their own name, job title and mobile number here.
 *  Role and pages are set by a Super Admin in Manage Users. */
export default function ProfilePage() {
  const { can, refresh } = useAuth();
  const [p, setP] = useState<MyProfile | null>(null);
  const [form, setForm] = useState({ full_name: "", job_title: "", phone: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    api.getMyProfile().then((r) => {
      setP(r);
      if (r) setForm({ full_name: r.full_name, job_title: r.job_title, phone: r.phone });
    }).catch((e) => setError(errorText(e)));
  }, []);

  if (!p) return error ? <Alert>{error}</Alert> : <FullPageSpinner />;

  const phoneOk = PHONE_OK.test(form.phone);
  const changed = form.full_name !== p.full_name || form.job_title !== p.job_title || form.phone !== p.phone;
  const pages = NAV.filter((n) => can(n.permission));

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!phoneOk || !p) return;
    setBusy(true); setError(null); setSaved(false);
    const patch = { full_name: form.full_name.trim(), job_title: form.job_title.trim(), phone: form.phone.trim() };
    try {
      await api.updateMyProfile(patch);
      setP({ ...p, ...patch });
      setForm(patch);
      setSaved(true);
      await refresh();
    } catch (err) { setError(errorText(err)); }
    setBusy(false);
  }

  const initials = (p.full_name || p.email).split(/[\s@.]/).filter(Boolean).slice(0, 2).map((s) => s[0]!.toUpperCase()).join("");

  return (
    <div className="max-w-2xl space-y-5">
      <PageHeader title="My profile" description="Your details as the rest of the team sees them." />
      {error && <Alert>{error}</Alert>}

      <div className="rounded-xl border bg-white p-6">
        <div className="flex items-center gap-4">
          <div className="grid h-14 w-14 shrink-0 place-items-center rounded-full bg-gold/90 text-lg font-semibold text-navy">{initials}</div>
          <div className="min-w-0">
            <div className="truncate text-lg font-semibold text-navy">{p.full_name || p.email}</div>
            <div className="truncate text-sm text-slate-600">{p.email}</div>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <Badge tone={p.is_super ? "gold" : "navy"}>
                {p.is_super && <ShieldCheck className="mr-1 h-3 w-3" />}{p.role_name}
              </Badge>
              {p.last_login_at && <span className="text-xs text-slate-500">Last sign-in {relativeTime(p.last_login_at)}</span>}
            </div>
          </div>
        </div>

        <form onSubmit={save} className="mt-6 grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Field label="Full name">
              <Input value={form.full_name} maxLength={80} onChange={(e) => { setForm({ ...form, full_name: e.target.value }); setSaved(false); }} />
            </Field>
          </div>
          <Field label="Job title" hint="For example: Secretary">
            <Input value={form.job_title} maxLength={80} onChange={(e) => { setForm({ ...form, job_title: e.target.value }); setSaved(false); }} />
          </Field>
          <Field label="Mobile number" hint="For example: +63 917 123 4567" error={phoneOk ? undefined : "Use only numbers, spaces, + and brackets"}>
            <Input type="tel" value={form.phone} maxLength={20} onChange={(e) => { setForm({ ...form, phone: e.target.value }); setSaved(false); }} />
          </Field>
          <div className="flex items-center gap-3 sm:col-span-2">
            <Button type="submit" variant="primary" loading={busy} disabled={!changed || !phoneOk}>Save</Button>
            {saved && <span className="flex items-center gap-1.5 text-sm text-emerald-700"><CheckCircle2 className="h-4 w-4" /> Saved</span>}
          </div>
        </form>
        <p className="mt-4 text-xs text-slate-500">You sign in with your @ask-karla.com account. Your email address can only be changed by a Super Admin.</p>
      </div>

      <div className="rounded-xl border bg-white p-6">
        <h2 className="flex items-center gap-2 font-semibold"><UserRound className="h-4 w-4 text-navy" /> Pages you can open</h2>
        {pages.length ? (
          <ul className="mt-3 grid gap-2 sm:grid-cols-2">
            {pages.map((n) => (
              <li key={n.path}>
                <Link to={n.path} className="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm hover:bg-slate-50">
                  <n.icon className="h-4 w-4 text-navy" /> {n.label}
                </Link>
              </li>
            ))}
          </ul>
        ) : <p className="mt-2 text-sm text-slate-600">No pages yet.</p>}
        <p className="mt-4 text-sm text-slate-600">
          {p.is_super
            ? <>You're a Super Admin, so every page is yours (admin pages open once two-step verification is on). Choose other people's pages in <Link to="/admin/users" className="font-medium text-navy underline">Manage Users</Link>.</>
            : "A Super Admin chooses which pages you can open. Ask Paolo or Karla if you need another one."}
        </p>
      </div>
    </div>
  );
}
