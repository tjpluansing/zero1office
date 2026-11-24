import {
  BarChart3, ClipboardList, FileText, LayoutDashboard, type LucideIcon, Receipt, ScrollText, Settings, Users,
} from "lucide-react";

export interface NavItem {
  path: string;
  label: string;
  icon: LucideIcon;
  /** The page-level permission that shows this item and unlocks the route. */
  permission: string;
  section?: "admin";
}

export const NAV: NavItem[] = [
  { path: "/dashboard", label: "Dashboard", icon: LayoutDashboard, permission: "dashboard.view" },
  { path: "/clients", label: "Client Masterlist", icon: ClipboardList, permission: "clients.view" },
  { path: "/quotes", label: "Quoting & Proposals", icon: FileText, permission: "quotes.view" },
  { path: "/billing", label: "Billing & SOA", icon: Receipt, permission: "billing.view" },
  { path: "/reports", label: "Reports", icon: BarChart3, permission: "reports.view" },
  { path: "/admin/users", label: "Manage Users", icon: Users, permission: "admin_users.view", section: "admin" },
  { path: "/admin/audit", label: "Audit Log", icon: ScrollText, permission: "audit_log.view", section: "admin" },
  { path: "/admin/settings", label: "Admin Settings", icon: Settings, permission: "admin_settings.view", section: "admin" },
];

export function firstAllowedPath(can: (p: string) => boolean): string | null {
  return NAV.find((n) => can(n.permission))?.path ?? null;
}
