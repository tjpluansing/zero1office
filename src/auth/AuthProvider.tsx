import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { api } from "../lib/api";
import type { Access } from "../lib/types";

interface AuthState {
  loading: boolean;
  access: Access | null;
  /** true while the user arrived from a password-reset / invite link */
  recovery: boolean;
  signOutReason: string | null;
  can: (permission: string) => boolean;
  refresh: () => Promise<Access | null>;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: (reason?: string) => Promise<void>;
}

const Ctx = createContext<AuthState | null>(null);

const REFRESH_MS = 5 * 60_000;

export function AuthProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [access, setAccess] = useState<Access | null>(null);
  const [recovery, setRecovery] = useState(false);
  const [signOutReason, setSignOutReason] = useState<string | null>(null);
  const accessRef = useRef<Access | null>(null);

  const signOut = useCallback(async (reason?: string) => {
    setSignOutReason(reason ?? null);
    await api.signOut();
    accessRef.current = null;
    setAccess(null);
  }, []);

  const refresh = useCallback(async () => {
    try {
      const a = await api.getAccess();
      if (a?.status === "suspended") {
        await signOut("This account is suspended. Ask an admin to reactivate it.");
        return null;
      }
      accessRef.current = a;
      setAccess(a);
      return a;
    } catch {
      // Network blip: keep what we had; the server still enforces.
      return accessRef.current;
    }
  }, [signOut]);

  // Initial load + auth events
  useEffect(() => {
    let alive = true;
    (async () => {
      if (await api.hasSession()) await refresh();
      if (alive) setLoading(false);
    })();
    const off = api.onAuthChange((event) => {
      if (event === "PASSWORD_RECOVERY") setRecovery(true);
      if (event === "SIGNED_OUT") { accessRef.current = null; setAccess(null); }
      if (event === "SIGNED_IN") void refresh();
    });
    return () => { alive = false; off(); };
  }, [refresh]);

  // Keep permissions in sync: on tab focus and every few minutes. The
  // database checks every request anyway; this only updates the menu.
  useEffect(() => {
    if (!access) return;
    const onFocus = () => void refresh();
    window.addEventListener("focus", onFocus);
    const t = window.setInterval(onFocus, REFRESH_MS);
    return () => { window.removeEventListener("focus", onFocus); window.clearInterval(t); };
  }, [access?.id, refresh]); // eslint-disable-line react-hooks/exhaustive-deps

  // Idle sign-out
  useEffect(() => {
    if (!access) return;
    const limit = (access.idle_minutes || 30) * 60_000;
    let last = Date.now();
    const bump = () => { last = Date.now(); };
    const events = ["mousemove", "keydown", "click", "touchstart", "scroll"];
    events.forEach((e) => window.addEventListener(e, bump, { passive: true }));
    const t = window.setInterval(() => {
      if (Date.now() - last > limit) void signOut("You were signed out after a period of inactivity.");
    }, 30_000);
    return () => { events.forEach((e) => window.removeEventListener(e, bump)); window.clearInterval(t); };
  }, [access?.id, access?.idle_minutes, signOut]); // eslint-disable-line react-hooks/exhaustive-deps

  const value = useMemo<AuthState>(() => {
    const set = new Set(access?.permissions ?? []);
    return {
      loading, access, recovery, signOutReason,
      can: (p) => set.has(p),
      refresh,
      signIn: async (email, password) => {
        setSignOutReason(null);
        await api.signInWithPassword(email, password);
        await refresh();
      },
      signOut,
    };
  }, [loading, access, recovery, signOutReason, refresh, signOut]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useAuth outside AuthProvider");
  return v;
}
