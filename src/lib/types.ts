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
  last_login_at: string | null;
  idle_minutes: number;
  permissions: string[];
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
