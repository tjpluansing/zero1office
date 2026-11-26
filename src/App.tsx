import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { configMissing } from "./lib/api";
import { AuthProvider } from "./auth/AuthProvider";
import { HomeRedirect, RequireAuth, RequirePermission } from "./auth/guards";
import Layout from "./components/Layout";
import AccessReviewPage from "./pages/admin/AccessReview";
import AuditLogPage from "./pages/admin/AuditLog";
import IntegrationsPage from "./pages/admin/Integrations";
import { AgreementPage, SecurityPage, VerifyCodePage } from "./pages/security";
import UsersPage from "./pages/admin/Users";
import {
  ChangePasswordPage, ForgotPasswordPage, LoginPage, PendingPage, ResetPasswordPage,
} from "./pages/auth";
import ClientsPage from "./pages/Clients";
import FollowupsPage from "./pages/Followups";
import { DashboardPage, ModulePage } from "./pages/Modules";

export default function App() {
  if (configMissing) {
    return (
      <div className="mx-auto mt-24 max-w-md p-6 text-sm">
        <h1 className="text-lg font-semibold text-navy">Setup needed</h1>
        <p className="mt-2">Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY (see .env.example), or VITE_DEMO_MODE=true to try the screens.</p>
      </div>
    );
  }
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          {/* public */}
          <Route path="/login" element={<LoginPage />} />
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />
          <Route path="/reset-password" element={<ResetPasswordPage />} />
          <Route path="/change-password" element={<ChangePasswordPage />} />
          <Route path="/pending" element={<PendingPage />} />
          <Route path="/agreement" element={<AgreementPage />} />
          <Route path="/verify-code" element={<VerifyCodePage />} />

          {/* signed in */}
          <Route element={<RequireAuth />}>
            <Route element={<Layout />}>
              <Route index element={<HomeRedirect />} />
              <Route path="dashboard" element={<RequirePermission permission="dashboard.view"><DashboardPage /></RequirePermission>} />
              <Route path="clients" element={<RequirePermission permission="clients.view"><ClientsPage /></RequirePermission>} />
              <Route path="quotes" element={<RequirePermission permission="quotes.view">
                <ModulePage page="quotes" title="Quoting & Proposals" description="Plan comparisons and proposals for HMO, life, pre-need and non-life." />
              </RequirePermission>} />
              <Route path="billing" element={<RequirePermission permission="billing.view">
                <ModulePage page="billing" title="Billing & SOA" description="Statements of account and payment follow-ups." />
              </RequirePermission>} />
              <Route path="followups" element={<RequirePermission permission="followups.view"><FollowupsPage /></RequirePermission>} />
              <Route path="reports" element={<RequirePermission permission="reports.view">
                <ModulePage page="reports" title="Reports" description="Production, renewals and pipeline reports." />
              </RequirePermission>} />
              <Route path="admin/users" element={<RequirePermission permission="admin_users.view"><UsersPage /></RequirePermission>} />
              <Route path="security" element={<SecurityPage />} />
              <Route path="admin/access-review" element={<RequirePermission permission="admin_users.view"><AccessReviewPage /></RequirePermission>} />
              <Route path="admin/integrations" element={<RequirePermission permission="integrations.view"><IntegrationsPage /></RequirePermission>} />
              <Route path="admin/audit" element={<RequirePermission permission="audit_log.view"><AuditLogPage /></RequirePermission>} />
              <Route path="admin/settings" element={<RequirePermission permission="admin_settings.view">
                <ModulePage page="admin_settings" title="Admin Settings" description="Allowed email domains, idle sign-out time and integrations." />
              </RequirePermission>} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Route>
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
