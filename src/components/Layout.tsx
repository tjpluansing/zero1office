import { KeyRound, LogOut, Menu, ShieldAlert, ShieldCheck } from "lucide-react";
import { useState } from "react";
import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../auth/AuthProvider";
import { isDemo } from "../lib/api";
import { NAV } from "../lib/nav";
import { cx } from "./ui";

export function Logo({ light }: { light?: boolean }) {
  return (
    <div className="flex items-center gap-2">
      <div className="grid h-8 w-8 place-items-center rounded-lg bg-gold font-bold text-navy">01</div>
      <span className={cx("text-lg font-semibold tracking-tight", light ? "text-white" : "text-navy")}>zero1office</span>
    </div>
  );
}

export default function Layout() {
  const { access, can, signOut } = useAuth();
  const [open, setOpen] = useState(false);
  const fullBleed = ["/office", "/preview"].includes(useLocation().pathname);
  // Only pages the user may open are rendered. Route guards and the
  // database block the rest even if someone types the URL.
  const items = NAV.filter((n) => can(n.permission));
  const main = items.filter((n) => !n.section);
  const admin = items.filter((n) => n.section === "admin");

  const link = (n: (typeof NAV)[number]) => (
    <NavLink key={n.path} to={n.path} onClick={() => setOpen(false)}
      className={({ isActive }) => cx(
        "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition",
        isActive ? "bg-white/10 text-white" : "text-white/70 hover:bg-white/5 hover:text-white",
      )}>
      {({ isActive }) => (<>
        <n.icon className={cx("h-4 w-4", isActive && "text-gold")} />
        {n.label}
      </>)}
    </NavLink>
  );

  const initials = (access?.full_name || access?.email || "?").split(/[\s@.]/).filter(Boolean).slice(0, 2)
    .map((s) => s[0]!.toUpperCase()).join("");

  return (
    <div className={fullBleed ? "flex h-screen overflow-hidden" : "flex min-h-screen"}>
      <aside className={cx(
        "fixed inset-y-0 left-0 z-30 flex w-64 flex-col bg-navy px-4 py-5 transition-transform lg:static lg:translate-x-0",
        open ? "translate-x-0" : "-translate-x-full",
      )}>
        <div className="px-2"><Logo light /></div>
        <nav className="mt-8 flex-1 space-y-1">
          {main.map(link)}
          {admin.length > 0 && (
            <>
              <div className="px-3 pb-1 pt-6 text-[11px] font-semibold uppercase tracking-wider text-gold-300/80">Admin</div>
              {admin.map(link)}
            </>
          )}
        </nav>
        <NavLink to="/security" onClick={() => setOpen(false)}
          className={({ isActive }) => cx("mt-4 flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition",
            isActive ? "bg-white/10 text-white" : "text-white/70 hover:bg-white/5 hover:text-white")}>
          <KeyRound className="h-4 w-4" /> Sign-in security
          {access && !access.mfa_enrolled && <span className="ml-auto h-2 w-2 rounded-full bg-gold" />}
        </NavLink>
        <div className="mt-2 rounded-xl bg-white/5 p-3">
          <div className="flex items-center gap-3">
            <div className="grid h-9 w-9 place-items-center rounded-full bg-gold/90 text-sm font-semibold text-navy">{initials}</div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium text-white">{access?.full_name || access?.email}</div>
              <div className="flex items-center gap-1 text-xs text-white/60">
                {access?.is_super && <ShieldCheck className="h-3 w-3 text-gold" />}{access?.role_name}
              </div>
            </div>
            <button onClick={() => void signOut()} title="Sign out" aria-label="Sign out"
              className="rounded-lg p-2 text-white/70 hover:bg-white/10 hover:text-white">
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </aside>
      {open && <div className="fixed inset-0 z-20 bg-black/30 lg:hidden" onClick={() => setOpen(false)} />}

      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <header className="flex items-center gap-3 border-b bg-white px-4 py-3 lg:hidden">
          <button onClick={() => setOpen(true)} aria-label="Open menu" className="rounded p-1.5 hover:bg-slate-100"><Menu className="h-5 w-5" /></button>
          <Logo />
        </header>
        {isDemo && (
          <div className="bg-gold-50 px-4 py-1.5 text-center text-xs text-[#7a5a14]">
            Demo mode: sample users stored in this browser only. Connect Supabase to enforce permissions on the server.
          </div>
        )}
        {access && access.mfa_locked.length > 0 && (
          <div className="flex flex-wrap items-center justify-center gap-2 bg-navy-50 px-4 py-2 text-center text-sm text-navy">
            <ShieldAlert className="h-4 w-4" />
            {access.mfa_enrolled
              ? "Admin and export features need this sign-in verified with your code."
              : "Turn on two-step verification to unlock your admin and export features."}
            <Link to={access.mfa_enrolled ? "/verify-code" : "/security"} className="font-semibold underline">
              {access.mfa_enrolled ? "Verify now" : "Set it up"}
            </Link>
          </div>
        )}
        <main className={fullBleed ? "flex min-h-0 w-full flex-1 flex-col" : "mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-8 sm:py-8"}>
          <Outlet />
        </main>
      </div>
    </div>
  );
}
