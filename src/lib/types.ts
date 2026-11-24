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

// --- Billing & SOA: collections tracker ---
export const PROVIDERS = ["Maxicare", "Medicard", "Intellicare", "IMS", "KHL", "FWD"] as const;

export type SoaStage =
  | "draft" | "awaiting_payment" | "awaiting_docs" | "awaiting_commission"
  | "receipt_due" | "receipt_issued" | "closed";

export interface SoaRow {
  id: string;
  soa_no: string;
  provider: string;
  account_name: string;
  client_id: string | null;
  product: string | null;
  coverage_period: string | null;
  amount: number;
  released_on: string | null;
  due_on: string | null;
  paid_on: string | null;
  paid_amount: number | null;
  payment_ref: string | null;
  provider_receipt_no: string | null;
  provider_receipt_on: string | null;
  cwt_applicable: boolean;
  cwt_amount: number | null;
  form_2307_on: string | null;
  commission_rate: number | null;
  commission_expected: number | null;
  disbursement_id: string | null;
  commission_amount: number | null;
  closed_on: string | null;
  ghl_link: string | null;
  notes: string | null;
  stage: SoaStage;
  stage_changed_at: string;
  created_at: string;
  updated_at: string;
}

/** Fields a person can set; stage and timestamps come from the server. */
export type SoaInput = Partial<Omit<SoaRow, "stage" | "stage_changed_at" | "created_at" | "updated_at">>
  & { soa_no: string; provider: string; account_name: string; amount: number };

export interface DisbursementRow {
  id: string;
  provider: string;
  received_on: string;
  reference: string | null;
  gross_amount: number;
  withholding_amount: number;
  net_amount: number;
  receipt_no: string | null;
  receipt_issued_on: string | null;
  notes: string | null;
  created_at: string;
}

export type DisbursementInput = Partial<Omit<DisbursementRow, "net_amount" | "created_at">>
  & { provider: string; received_on: string };

export interface SoaEvent {
  id: number;
  soa_id: string;
  at: string;
  actor_email: string | null;
  kind: "stage" | "note" | "follow_up";
  body: string;
}

export type SoaExportRow = Record<string, string | number | boolean | null>;
