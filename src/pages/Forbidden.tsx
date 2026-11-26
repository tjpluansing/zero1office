import { Lock } from "lucide-react";
import { Link } from "react-router-dom";
import { useAuth } from "../auth/AuthProvider";
import { firstAllowedPath } from "../lib/nav";

export default function Forbidden({ permission }: { permission?: string }) {
  const { can, access } = useAuth();
  const home = firstAllowedPath(can);
  if (permission && access?.mfa_locked.includes(permission)) {
    return (
      <div className="mx-auto mt-16 max-w-md text-center">
        <div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-gold-50"><Lock className="h-6 w-6 text-[#8a6416]" /></div>
        <h1 className="mt-4 text-xl font-semibold text-navy">This page needs two-step verification</h1>
        <p className="mt-2 text-sm text-slate-500">You have access, but admin and export features only open after you verify this sign-in with a code from your phone.</p>
        <Link to={access.mfa_enrolled ? "/verify-code" : "/security"}
          className="mt-6 inline-block rounded-lg bg-navy px-4 py-2 text-sm font-medium text-white hover:bg-navy-600">
          {access.mfa_enrolled ? "Enter my code" : "Set up two-step verification"}
        </Link>
      </div>
    );
  }
  return (
    <div className="mx-auto mt-16 max-w-md text-center">
      <div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-navy-50"><Lock className="h-6 w-6 text-navy" /></div>
      <h1 className="mt-4 text-xl font-semibold text-navy">You don't have access to this page</h1>
      <p className="mt-2 text-sm text-slate-500">If you need it for your work, ask an admin to turn it on in Manage Users.</p>
      {home && <Link to={home} className="mt-6 inline-block text-sm font-medium text-navy-600 hover:underline">Go to your home page</Link>}
    </div>
  );
}
