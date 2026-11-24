export type Action = "view" | "create" | "edit" | "delete" | "export" | "approve";

export const ACTIONS: { id: Action; label: string }[] = [
  { id: "view", label: "View" },
  { id: "create", label: "Create" },
  { id: "edit", label: "Edit" },
  { id: "delete", label: "Delete" },
  { id: "export", label: "Export" },
  { id: "approve", label: "Approve" },
];

export interface Permission {
  key: string; // "<page>.<action>"
  page: string;
  page_label: string;
  action: Action;
  description: string;
  sort: number;
}

export interface Role {
  id: string;
  name: string;
  description: string;
  is_super: boolean;
  sort: number;
}

export interface Catalog {
  permissions: Permission[];
  roles: Role[];
  rolePermissions: Record<string, string[]>;
}

export type UserStatus = "active" | "suspended" | "pending";

export interface Access {
  id: string;
  email: string;
  full_name: string;
  role_id: string;
  role_name: string;
  is_super: boolean;
  status: UserStatus;
  must_change_password: boolean;
  /** version the user still has to accept, or null */
  policy_required: string | null;
  aal: "aal1" | "aal2";
  mfa_enrolled: boolean;
  last_login_at: string | null;
  idle_minutes: number;
  permissions: string[];
  /** permissions the user holds but can only use after two-step verification */
  mfa_locked: string[];
}

export interface Policy {
  version: string;
  title: string;
  body_markdown: string;
  published_at: string;
}

export interface MfaEnrollment {
  factorId: string;
  qrSvg: string;
  secret: string;
}

export interface ReviewUser {
  id: string;
  email: string;
  full_name: string;
  role_id: string;
  status: UserStatus;
  last_login_at: string | null;
  created_at: string;
  mfa: boolean;
  overrides: number;
  permissions: string[];
}

export interface AccessReviewData {
  review_days: number;
  last_review: { id: number; reviewed_at: string; reviewer_email: string | null; notes: string } | null;
  users: ReviewUser[];
}

export interface UserRow {
  id: string;
  email: string;
  full_name: string;
  role_id: string;
  status: UserStatus;
  must_change_password: boolean;
  last_login_at: string | null;
  created_at: string;
  override_count: number;
}

export interface Override {
  permission_key: string;
  effect: "grant" | "deny";
}

export interface AuditRow {
  id: number;
  at: string;
  actor_email: string | null;
  action: string;
  target_type: string;
  target_id: string | null;
  details: Record<string, unknown>;
}

export interface ClientRow {
  id: string;
  full_name: string;
  company: string | null;
  email: string | null;
  phone: string | null;
  insurer: string | null;
  product: string | null;
  status: "lead" | "applying" | "active" | "lapsed";
  created_at: string;
}

export interface CreateUserInput {
  email: string;
  full_name: string;
  role_id: string;
  mode: "invite" | "temp_password";
  overrides: Override[];
}
