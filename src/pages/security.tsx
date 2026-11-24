import { CheckCircle2, FileCheck2, ShieldCheck, Smartphone } from "lucide-react";
import { Fragment, useEffect, useState, type FormEvent, type ReactNode } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthProvider";
import AuthShell from "../components/AuthShell";
import { Alert, Button, Field, Input, PageHeader, Spinner } from "../components/ui";
import { api, errorText, isDemo } from "../lib/api";
import type { MfaEnrollment, Policy } from "../lib/types";

/** Tiny, safe renderer for the agreement text: paragraphs and **bold** only. */
function PolicyText({ markdown }: { markdown: string }) {
  return (
    <>
      {markdown.trim().split(/\n\s*\n/).map((para, i) => (
        <p key={i} className="mb-3 last:mb-0">
          {para.split(/(\*\*[^*]+\*\*)/).map((part, j) =>
            part.startsWith("**") ? <b key={j}>{part.slice(2, -2)}</b> : <Fragment key={j}>{part}</Fragment>)}
        </p>
      ))}
    </>
  );
}

function useFrom() {
  return (useLocation() as { state?: { from?: string } }).state?.from ?? "/";
}

/** First sign-in (and after each new version): read and accept before any access. */
export function AgreementPage() {
  const { access, loading, refresh, signOut } = useAuth();
  const nav = useNavigate();
  const from = useFrom();
  const [policy, setPolicy] = useState<Policy | null>(null);
  const [agree, setAgree] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { api.getPolicy().then(setPolicy).catch((e) => setError(errorText(e))); }, []);

  if (loading) return null;
  if (!access) return <Navigate to="/login" replace />;
  if (!access.policy_required) return <Navigate to={from} replace />;

  async function accept() {
    if (!policy) return;
    setBusy(true);
    setError(null);
    try {
      await api.acceptPolicy(policy.version);
      await refresh();
      nav(from, { replace: true });
    } catch (e) {
      setError(errorText(e));
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen bg-paper px-4 py-10">
      <div className="mx-auto max-w-2xl rounded-2xl border bg-white shadow-sm">
        <div className="flex items-center gap-3 border-b px-6 py-4">
          <FileCheck2 className="h-5 w-5 text-gold" />
          <div>
            <h1 className="text-lg font-semibold text-navy">{policy?.title ?? "Agreement"}</h1>
            <p className="text-xs text-slate-500">Version {access.policy_required}. Please read before continuing.</p>
          </div>
        </div>
        <div className="max-h-[55vh] overflow-y-auto px-6 py-5 text-sm leading-relaxed text-ink">
          {policy ? <PolicyText markdown={policy.body_markdown} /> : <Spinner />}
        </div>
        <div className="space-y-3 border-t bg-slate-50 px-6 py-4 rounded-b-2xl">
          {error && <Alert>{error}</Alert>}
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" className="mt-0.5 h-4 w-4 accent-navy" checked={agree} onChange={(e) => setAgree(e.target.checked)} />
            <span>I, {access.full_name || access.email}, have read and agree to this agreement.</span>
          </label>
          <div className="flex justify-between gap-2">
            <Button variant="ghost" onClick={() => void signOut()}>Sign out</Button>
            <Button variant="primary" disabled={!agree || !policy} loading={busy} onClick={accept}>I agree, continue</Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function CodeForm({ onSubmit, label = "Verify" }: { onSubmit: (code: string) => Promise<void>; label?: string }) {
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try { await onSubmit(code.replace(/\s/g, "")); }
    catch (err) { setError(errorText(err)); setBusy(false); }
  }
  return (
    <form onSubmit={submit} className="space-y-3">
      {error && <Alert>{error}</Alert>}
      <Field label="6-digit code from your authenticator app">
        <Input inputMode="numeric" autoComplete="one-time-code" maxLength={7} value={code}
          onChange={(e) => setCode(e.target.value)} className="text-center font-mono text-lg tracking-[0.4em]" autoFocus />
      </Field>
      <Button variant="primary" type="submit" className="w-full" loading={busy} disabled={code.replace(/\s/g, "").length !== 6}>{label}</Button>
      {isDemo && <p className="text-center text-xs text-slate-500">Demo code: 123456</p>}
    </form>
  );
}

/** Sign-in step 2 for users who have set up an authenticator. */
export function VerifyCodePage() {
  const { access, loading, refresh, signOut } = useAuth();
  const nav = useNavigate();
  const from = useFrom();
  if (loading) return null;
  if (!access) return <Navigate to="/login" replace />;
  if (!access.mfa_enrolled || access.aal === "aal2") return <Navigate to={from} replace />;
  return (
    <AuthShell title="Two-step verification" subtitle="Open your authenticator app and enter the code for zero1office.">
      <CodeForm label="Verify and continue" onSubmit={async (code) => {
        await api.mfaVerify(code);
        await refresh();
        nav(from, { replace: true });
      }} />
      <p className="mt-4 text-xs text-slate-500">Lost your phone? Ask another admin to reset your two-step verification.</p>
      <button onClick={() => void signOut()} className="mt-3 block w-full text-center text-sm text-slate-500 hover:underline">Sign out</button>
    </AuthShell>
  );
}

/** Inside the app: set up two-step verification. */
export function SecurityPage() {
  const { access, refresh } = useAuth();
  const [enroll, setEnroll] = useState<MfaEnrollment | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  if (!access) return null;

  async function start() {
    setBusy(true);
    setError(null);
    try { setEnroll(await api.mfaEnroll()); } catch (e) { setError(errorText(e)); }
    setBusy(false);
  }

  const qrSrc = enroll ? (enroll.qrSvg.startsWith("data:") ? enroll.qrSvg
    : `data:image/svg+xml;utf8,${encodeURIComponent(enroll.qrSvg)}`) : "";

  return (
    <div className="max-w-2xl">
      <PageHeader title="Sign-in security" description="Protect your account with a code from your phone." />
      {error && <div className="mb-4"><Alert>{error}</Alert></div>}

      <div className="rounded-xl border bg-white p-6">
        <div className="flex items-start gap-4">
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-navy-50"><Smartphone className="h-5 w-5 text-navy" /></div>
          <div className="flex-1">
            <h2 className="font-semibold">Two-step verification</h2>
            {access.mfa_enrolled ? (
              <p className="mt-1 flex items-center gap-1.5 text-sm text-emerald-700"><CheckCircle2 className="h-4 w-4" /> On. You'll be asked for a code each time you sign in.</p>
            ) : (
              <p className="mt-1 text-sm text-slate-600">
                Off. {access.mfa_locked.length > 0
                  ? "It's required for your admin and export permissions. They stay locked until you turn it on."
                  : "Recommended for everyone."}
              </p>
            )}

            {!access.mfa_enrolled && !enroll && (
              <Button variant="primary" className="mt-4" loading={busy} onClick={start}><ShieldCheck className="h-4 w-4" /> Set up</Button>
            )}

            {enroll && !done && (
              <div className="mt-5 grid gap-6 sm:grid-cols-[180px_1fr]">
                <div>
                  <img src={qrSrc} alt="QR code for your authenticator app" className="h-44 w-44 rounded-lg border p-2" />
                  <p className="mt-2 break-all font-mono text-[11px] text-slate-500">{enroll.secret}</p>
                </div>
                <div className="space-y-3 text-sm">
                  <Steps items={[
                    <>Install <b>Microsoft Authenticator</b> (or Google Authenticator) on your phone.</>,
                    <>Tap <b>+</b>, choose <b>Other account</b>, and scan this code. Or type the key under it.</>,
                    <>Enter the 6-digit code it shows.</>,
                  ]} />
                  <CodeForm label="Turn on" onSubmit={async (code) => {
                    await api.mfaVerify(code, enroll.factorId);
                    await refresh();
                    setDone(true);
                  }} />
                </div>
              </div>
            )}
            {done && <div className="mt-4"><Alert tone="green">Two-step verification is on.{access.mfa_locked.length === 0 && " Your admin and export permissions are unlocked."}</Alert></div>}
          </div>
        </div>
      </div>
      <p className="mt-4 text-sm text-slate-500">Need to change your password? <Link to="/forgot-password" className="text-navy-600 hover:underline">Send yourself a reset link</Link>.</p>
    </div>
  );
}

function Steps({ items }: { items: ReactNode[] }) {
  return (
    <ol className="space-y-2">
      {items.map((t, i) => (
        <li key={i} className="flex gap-2">
          <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-gold text-[11px] font-semibold text-navy">{i + 1}</span>
          <span>{t}</span>
        </li>
      ))}
    </ol>
  );
}
