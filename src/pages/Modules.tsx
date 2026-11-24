import { CheckCircle2, Download, Pencil, Plus, Trash2 } from "lucide-react";
import { useAuth } from "../auth/AuthProvider";
import { Badge, Button, PageHeader } from "../components/ui";
import { Link } from "react-router-dom";
import { NAV } from "../lib/nav";

/**
 * Placeholder for modules that are not built yet. It still shows how the
 * feature toggles drive the buttons, so the matrix can be tested end to end.
 */
export function ModulePage({ page, title, description }: { page: string; title: string; description: string }) {
  const { can } = useAuth();
  const actions = [
    { key: "create", label: "New", icon: Plus, variant: "primary" as const },
    { key: "edit", label: "Edit", icon: Pencil },
    { key: "delete", label: "Delete", icon: Trash2 },
    { key: "export", label: "Export", icon: Download },
    { key: "approve", label: "Approve", icon: CheckCircle2, variant: "gold" as const },
  ];
  return (
    <div>
      <PageHeader title={title} description={description}
        actions={actions.filter((a) => can(`${page}.${a.key}`)).map((a) => (
          <Button key={a.key} variant={a.variant ?? "secondary"}><a.icon className="h-4 w-4" />{a.label}</Button>
        ))} />
      <div className="rounded-xl border border-dashed bg-white p-10 text-center">
        <p className="text-sm text-slate-500">This module is next on the build list. The buttons above follow your permissions.</p>
        <div className="mt-4 flex flex-wrap justify-center gap-2">
          {["view", ...actions.map((a) => a.key)].map((k) => {
            const key = `${page}.${k}`;
            return <Badge key={k} tone={can(key) ? "green" : "slate"}>{k}: {can(key) ? "allowed" : "off"}</Badge>;
          })}
        </div>
      </div>
    </div>
  );
}

export function DashboardPage() {
  const { access, can } = useAuth();
  const pages = NAV.filter((n) => can(n.permission) && n.path !== "/dashboard");
  return (
    <div>
      <PageHeader title={`Good day${access?.full_name ? `, ${access.full_name.split(" ")[0]}` : ""}`}
        description={`Signed in as ${access?.role_name}.`} />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {pages.map((n) => (
          <Link key={n.path} to={n.path} className="group rounded-xl border bg-white p-5 transition hover:border-navy/40 hover:shadow-sm">
            <n.icon className="h-5 w-5 text-gold" />
            <div className="mt-3 font-medium text-navy group-hover:underline">{n.label}</div>
          </Link>
        ))}
      </div>
    </div>
  );
}
