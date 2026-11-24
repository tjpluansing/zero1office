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

export type IntegrationId = "ghl" | "m365" | "anthropic";

export interface IntegrationRow {
  id: IntegrationId;
  name: string;
  enabled: boolean;
  config: Record<string, string | number | boolean>;
  secret_hint: string | null;
  status: "not_connected" | "untested" | "connected" | "error" | "paused";
  last_tested_at: string | null;
  last_test_ok: boolean | null;
  last_error: string | null;
  last_details: Record<string, unknown>;
  secret_set_at: string | null;
  updated_at: string;
  webhook_secret_hint: string | null;
  webhook_secret_set_at: string | null;
  last_event_at: string | null;
}

export interface IntegrationEvent {
  id: number;
  event_type: string;
  summary: string | null;
  verified_by: "ghl_signature" | "webhook_secret" | "test";
  status: "pending" | "retrying" | "done" | "ignored" | "failed";
  attempts: number;
  next_attempt_at: string;
  last_error: string | null;
  result: string | null;
  client_id: string | null;
  received_at: string;
  processed_at: string | null;
}

export interface IntegrationRun {
  id: number;
  trigger: "webhook" | "schedule" | "manual";
  started_at: string;
  finished_at: string | null;
  processed: number;
  succeeded: number;
  ignored: number;
  will_retry: number;
  failed: number;
}

export interface SyncLog {
  events: IntegrationEvent[];
  runs: IntegrationRun[];
}

export interface TestResult {
  ok: boolean;
  error?: string;
  details?: Record<string, unknown>;
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
