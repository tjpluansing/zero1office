import { KeyRound, Lock, Mail, ShieldAlert } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthProvider";
import AuthShell from "../components/AuthShell";
import { Alert, Button, Field, Input } from "../components/ui";
import { api, errorText, isDemo } from "../lib/api";
import { firstAllowedPath } from "../lib/nav";

function MicrosoftLogo() {
  return (
    <svg viewBox="0 0 21 21" className="h-4 w-4" aria-hidden>
      <rect x="1" y="1" width="9" height="9" fill="#f25022" /><rect x="11" y="1" width="9" height="9" fill="#7fba00" />
      <rect x="1" y="11" width="9" height="9" fill="#00a4ef" /><rect x="11" y="11" width="9" height="9" fill="#ffb900" />
    </svg>
  );
}

export function LoginPage() {
  const { access, loading, signIn, signOutReason, can } = useAuth();
  const nav = useNavigate();
  const loc = useLocation() as { state?: { from?: string } };
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(() => {
    // OAuth errors come back in the URL (e.g. a non ask-karla.com Microsoft account)
    const p = new URLSearchParams(window.location.hash.slice(1) || window.location.search);
    const d = p.get("error_description");
    return d ? errorText(d) : null;
  });

  if (!loading && access) {
    if (access.must_change_password) return <Navigate to="/change-password" replace state={{ from: loc.state?.from }} />;
    return <Navigate to={loc.state?.from ?? firstAllowedPath(can) ?? "/pending"} replace />;
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await signIn(email.trim(), password);
      nav(loc.state?.from ?? "/", { replace: true });
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  async function microsoft() {
    setError(null);
    try { await api.signInWithMicrosoft(); } catch (err) { setError(errorText(err)); }
  }

  return (
    <AuthShell title="Sign in" subtitle="Use your @ask-karla.com account.">
      <div className="space-y-4">
        {signOutReason && <Alert tone="amber">{signOutReason}</Alert>}
        {error && <Alert>{error}</Alert>}
        <Button type="button" className="w-full" onClick={microsoft}>
          <MicrosoftLogo /> Sign in with Microsoft
        </Button>
        <div className="flex items-center gap-3 text-xs text-slate-400">
          <div className="h-px flex-1 bg-slate-200" />or<div className="h-px flex-1 bg-slate-200" />
        </div>
        <form onSubmit={submit} className="space-y-4" noValidate>
          <Field label="Email">
            <Input type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)}
              placeholder="you@ask-karla.com" autoFocus />
          </Field>
          <Field label="Password">
            <Input type="password" autoComplete="current-password" required value={password}
              onChange={(e) => setPassword(e.target.value)} />
          </Field>
          <div className="flex justify-end">
            <Link to="/forgot-password" className="text-sm font-medium text-navy-600 hover:underline">Forgot password?</Link>
          </div>
          <Button variant="primary" type="submit" className="w-full" loading={busy} disabled={!email || !password}>
            <Lock className="h-4 w-4" /> Sign in
          </Button>
        </form>
        {isDemo && (
          <Alert tone="navy">
            <b>Demo:</b> sign in as <code>paolo@ask-karla.com</code>, <code>karla@ask-karla.com</code> or{" "}
            <code>assistant@ask-karla.com</code> with password <code>demo</code>.
          </Alert>
        )}
      </div>
    </AuthShell>
  );
}

export function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    // Always show the same message so this form cannot be used to find out
    // which email addresses have accounts.
    try { await api.sendPasswordReset(email.trim()); } catch { /* same message either way */ }
    setSent(true);
    setBusy(false);
  }
  return (
    <AuthShell title="Reset your password" subtitle="We will email you a link to choose a new one.">
      {sent ? (
        <div className="space-y-4">
          <Alert tone="green">If an account exists for {email}, a reset link is on its way. It expires in 1 hour.</Alert>
          <Link to="/login" className="text-sm font-medium text-navy-600 hover:underline">Back to sign in</Link>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-4">
          <Field label="Email">
            <Input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoFocus />
          </Field>
          <Button variant="primary" type="submit" className="w-full" loading={busy} disabled={!email}>
            <Mail className="h-4 w-4" /> Send reset link
          </Button>
          <Link to="/login" className="block text-center text-sm text-slate-500 hover:underline">Back to sign in</Link>
        </form>
      )}
    </AuthShell>
  );
}

export function passwordProblems(pw: string, email?: string): string[] {
  const out: string[] = [];
  if (pw.length < 12) out.push("At least 12 characters");
  if (!/[A-Za-z]/.test(pw) || !/\d/.test(pw)) out.push("Letters and at least one number");
  if (email && pw.toLowerCase().includes(email.split("@")[0]!.toLowerCase())) out.push("Must not contain your name or email");
  if (/^(password|askkarla|zero1office)/i.test(pw)) out.push("Too easy to guess");
  return out;
}

function NewPasswordForm({ email, onDone }: { email?: string; onDone: () => void }) {
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const problems = passwordProblems(pw, email);
  const mismatch = pw2.length > 0 && pw !== pw2;

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (problems.length || pw !== pw2) return;
    setBusy(true);
    setError(null);
    try {
      await api.updatePassword(pw);
      onDone();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      {error && <Alert>{error}</Alert>}
      <Field label="New password">
        <Input type="password" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} autoFocus />
      </Field>
      <ul className="space-y-1 text-xs">
        {["At least 12 characters", "Letters and at least one number", "Must not contain your name or email"].map((r) => {
          const ok = pw.length > 0 && !problems.includes(r);
          return <li key={r} className={ok ? "text-emerald-700" : "text-slate-500"}>{ok ? "✓" : "•"} {r}</li>;
        })}
      </ul>
      <Field label="Confirm new password" error={mismatch ? "Passwords do not match" : undefined}>
        <Input type="password" autoComplete="new-password" value={pw2} onChange={(e) => setPw2(e.target.value)} />
      </Field>
      <Button variant="primary" type="submit" className="w-full" loading={busy} disabled={problems.length > 0 || pw !== pw2}>
        <KeyRound className="h-4 w-4" /> Save new password
      </Button>
    </form>
  );
}

/** Forced change after a temporary password (first login or admin reset). */
export function ChangePasswordPage() {
  const { access, loading, refresh, signOut } = useAuth();
  const nav = useNavigate();
  const from = (useLocation() as { state?: { from?: string } }).state?.from ?? "/";
  if (loading) return null;
  if (!access) return <Navigate to="/login" replace />;
  if (!access.must_change_password) return <Navigate to="/" replace />;
  return (
    <AuthShell title="Choose a new password" subtitle="You signed in with a temporary password. Pick your own before continuing.">
      <NewPasswordForm email={access.email} onDone={async () => { await refresh(); nav(from, { replace: true }); }} />
      <button onClick={() => void signOut()} className="mt-4 block w-full text-center text-sm text-slate-500 hover:underline">Sign out</button>
    </AuthShell>
  );
}

/** Landing page for password-reset and invite links. */
export function ResetPasswordPage() {
  const { access, loading, refresh } = useAuth();
  const nav = useNavigate();
  if (loading) return null;
  if (!access) {
    return (
      <AuthShell title="Link expired" subtitle="This reset or invite link is no longer valid.">
        <Link to="/forgot-password" className="text-sm font-medium text-navy-600 hover:underline">Request a new link</Link>
      </AuthShell>
    );
  }
  return (
    <AuthShell title="Set your password" subtitle={`For ${access.email}`}>
      <NewPasswordForm email={access.email} onDone={async () => { await refresh(); nav("/", { replace: true }); }} />
    </AuthShell>
  );
}

export function PendingPage() {
  const { access, signOut } = useAuth();
  if (!access) return <Navigate to="/login" replace />;
  return (
    <AuthShell title="Waiting for access" subtitle={access.email}>
      <div className="space-y-4">
        <Alert tone="amber">
          <div className="flex gap-2"><ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
            Your account is signed in but has no pages yet. Ask Paolo to approve it and choose your role.</div>
        </Alert>
        <Button className="w-full" onClick={() => void signOut()}>Sign out</Button>
      </div>
    </AuthShell>
  );
}
