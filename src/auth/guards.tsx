import type { ReactNode } from "react";
import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "./AuthProvider";
import { firstAllowedPath } from "../lib/nav";
import { FullPageSpinner } from "../components/ui";
import Forbidden from "../pages/Forbidden";

/** Signed in, active, password not pending. Otherwise redirect. */
export function RequireAuth() {
  const { loading, access } = useAuth();
  const loc = useLocation();
  if (loading) return <FullPageSpinner />;
  if (!access) return <Navigate to="/login" replace state={{ from: loc.pathname + loc.search }} />;
  if (access.must_change_password) return <Navigate to="/change-password" replace state={{ from: loc.pathname + loc.search }} />;
  const from = { from: loc.pathname + loc.search };
  if (access.policy_required) return <Navigate to="/agreement" replace state={from} />;
  if (access.mfa_enrolled && access.aal !== "aal2") return <Navigate to="/verify-code" replace state={from} />;
  if (access.status === "pending") return <Navigate to="/pending" replace />;
  return <Outlet />;
}

/** Page-level guard. The database blocks the data too; this blocks the screen. */
export function RequirePermission({ permission, children }: { permission: string; children: ReactNode }) {
  const { can } = useAuth();
  return can(permission) ? <>{children}</> : <Forbidden permission={permission} />;
}

export function HomeRedirect() {
  const { can } = useAuth();
  const to = firstAllowedPath(can);
  return to ? <Navigate to={to} replace /> : <Navigate to="/pending" replace />;
}
