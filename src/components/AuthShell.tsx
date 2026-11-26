import type { ReactNode } from "react";
import { Logo } from "./Layout";

export default function AuthShell({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <div className="relative hidden flex-col justify-between overflow-hidden bg-navy p-12 text-white lg:flex">
        <Logo light />
        <div className="relative z-10 max-w-md">
          <h2 className="text-3xl font-semibold leading-tight">Your pathway to scaling.</h2>
          <p className="mt-3 text-white/70">The Ask Karla office: clients, proposals and billing in one place, with the right access for every team member.</p>
        </div>
        <p className="text-xs text-white/50">The Zero 1 Project · Ask Karla</p>
        <div className="pointer-events-none absolute -bottom-32 -right-32 h-96 w-96 rounded-full bg-gold/20 blur-3xl" />
        <div className="pointer-events-none absolute -top-24 right-24 h-64 w-64 rounded-full bg-navy-600/60 blur-3xl" />
      </div>
      <div className="flex items-center justify-center bg-paper px-4 py-12">
        <div className="w-full max-w-sm">
          <div className="mb-8 lg:hidden"><Logo /></div>
          <h1 className="text-2xl font-semibold text-navy">{title}</h1>
          {subtitle && <p className="mt-1 text-sm text-slate-500">{subtitle}</p>}
          <div className="mt-6">{children}</div>
        </div>
      </div>
    </div>
  );
}
