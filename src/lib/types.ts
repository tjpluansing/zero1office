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

export interface MyProfile {
  id: string;
  email: string;
  full_name: string;
  job_title: string;
  phone: string;
  role_id: string;
  role_name: string;
  is_super: boolean;
  last_login_at: string | null;
  created_at: string;
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

export interface IntegrationAlert {
  alert_key: string;
  integration_id: IntegrationId;
  severity: "red" | "amber";
  title: string;
  detail: string;
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

// --- follow-up queue ---
export type FollowupKind = "document" | "signature" | "payment" | "insurer_reply" | "client_reply" | "other";
export type FollowupParty = "client" | "insurer";
export type FollowupChannel = "email" | "viber" | "messenger" | "phone" | "sms" | "insurer_portal";
export type FollowupStatus = "open" | "waiting" | "escalated" | "done" | "waived" | "cancelled";

export interface FollowupRow {
  id: string;
  title: string;
  kind: FollowupKind;
  party: FollowupParty;
  client_id: string | null;
  insurer: string | null;
  reference: string | null;
  channel: FollowupChannel;
  status: FollowupStatus;
  due_on: string | null;        // yyyy-mm-dd
  next_chase_on: string;        // yyyy-mm-dd
  attempts: number;
  last_chased_at: string | null;
  escalation_reason: string | null;
  felix_drafts: boolean;
  assignee_id: string | null;
  notes: string | null;
  ghl_link: string | null;
  created_at: string;
  updated_at: string;
  closed_at: string | null;
}

export type FollowupInput = Partial<Pick<FollowupRow,
  "id" | "kind" | "party" | "client_id" | "insurer" | "reference" | "channel" | "due_on" | "next_chase_on"
  | "felix_drafts" | "notes" | "ghl_link">> & { title: string };

export interface FollowupEvent {
  id: number;
  followup_id: string;
  at: string;
  actor_label: string;
  kind: "created" | "chased" | "status" | "escalated" | "note" | "edited";
  channel: string | null;
  note: string | null;
  details: Record<string, unknown>;
}

export interface FollowupSettings {
  chase_every_days: number;
  max_attempts: number;
  escalate_overdue_days: number;
}

// --- provider quote requests + scorecard ---
export type ProductLine = "hmo" | "group_hmo" | "life" | "preneed" | "nonlife";
export type QuoteRequestStatus = "draft" | "open" | "done" | "cancelled";
export type QuoteChannel = "email" | "insurer_portal" | "viber" | "phone";
export type QuoteAskStatus = "waiting" | "quoted" | "declined" | "withdrawn";

export interface QuoteRequestRow {
  id: string;
  ref_code: string;
  client_id: string | null;
  account_label: string | null;
  product_line: ProductLine;
  needs: string;
  headcount: number | null;
  status: QuoteRequestStatus;
  notes: string | null;
  ghl_link: string | null;
  sent_at: string | null;
  closed_at: string | null;
  created_at: string;
  updated_at: string;
}

export type QuoteRequestInput = Partial<Pick<QuoteRequestRow,
  "id" | "client_id" | "account_label" | "product_line" | "headcount" | "notes" | "ghl_link">> & { needs: string };

/** One insurer asked on a request. */
export interface QuoteAskRow {
  id: string;
  request_id: string;
  insurer: string;
  channel: QuoteChannel;
  sent_at: string;
  due_on: string;               // reply-by, yyyy-mm-dd
  status: QuoteAskStatus;
  replied_at: string | null;
  annual_premium: number | null;
  plan_name: string | null;
  reply_notes: string | null;
  chosen: boolean;
  followup_id: string | null;
  updated_at: string;
}

export interface QuoteReplyInput {
  status: "quoted" | "declined" | "waiting";
  annual_premium?: number | null;
  plan_name?: string | null;
  note?: string | null;
  /** When the insurer replied, if not now (logging late). */
  replied_at?: string | null;
}

export interface ScorecardRow {
  insurer: string;
  asked: number;
  replied: number;
  quoted: number;
  declined: number;
  waiting: number;
  overdue: number;
  median_days: number | null;
  avg_days: number | null;
  on_time: number;
  on_time_pct: number | null;
  reply_pct: number;
  chases: number;
  chosen: number;
  score: number | null;
  grade: "A" | "B" | "C" | "D" | null;
}

export interface QuoteSettings { target_days: number }

export type QuoteExportRow = Record<string, string | number | boolean | null>;
