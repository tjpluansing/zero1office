import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthProvider";
import { api } from "../lib/api";
import { buildOfficeLive, type OfficeLive } from "../lib/officeLive";

const REFRESH_MS = 60_000;
// Same-origin frame. In a sandboxed preview the origin is opaque ("null"),
// so messages fall back to "*" but are still only accepted from the frame itself.
const ORIGIN = window.location.origin === "null" ? "*" : window.location.origin;

/**
 * The 3D AI office as the app's home screen. The office runs in a same-origin
 * frame (public/office) and gets live work from the app: Nina and Sol work
 * the real SOA tracker, and their rows open the matching app page.
 */
export default function OfficePage() {
  const { can } = useAuth();
  const nav = useNavigate();
  const frame = useRef<HTMLIFrameElement>(null);
  const live = useRef<OfficeLive | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const send = useCallback(() => {
    if (live.current) frame.current?.contentWindow?.postMessage(live.current, ORIGIN);
  }, []);

  const refresh = useCallback(async () => {
    if (!can("billing.view")) { setNote("Live SOA work shows here for people with Billing access."); return; }
    try {
      const [soas, payouts] = await Promise.all([api.listSoas(), api.listDisbursements()]);
      live.current = buildOfficeLive(soas, payouts);
      setNote(null);
      send();
    } catch {
      setNote("Couldn't load the SOA tracker. The office is showing sample work.");
    }
  }, [can, send]);

  useEffect(() => {
    void refresh();
    const t = window.setInterval(() => void refresh(), REFRESH_MS);
    const onMsg = (ev: MessageEvent) => {
      if ((ORIGIN !== "*" && ev.origin !== ORIGIN) || ev.source !== frame.current?.contentWindow) return;
      const m = ev.data as { type?: string; path?: string };
      if (m?.type === "z1-office-ready") send();
      if (m?.type === "z1-open" && typeof m.path === "string" && m.path.startsWith("/") && !m.path.startsWith("//")) nav(m.path);
    };
    window.addEventListener("message", onMsg);
    return () => { window.clearInterval(t); window.removeEventListener("message", onMsg); };
  }, [refresh, send, nav]);

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      {note && <div className="border-b bg-paper px-4 py-1.5 text-center text-xs text-slate-500">{note}</div>}
      <iframe ref={frame} title="AI Office" src={`${import.meta.env.BASE_URL}office/index.html?embed=1`} onLoad={send}
        className="min-h-[640px] w-full flex-1 border-0" />
    </div>
  );
}
