import type {
  AccessReviewData, IntegrationRow, MfaEnrollment, Policy, SyncLog, TestResult, IntegrationAlert,
  Access, AuditRow, Catalog, ClientRow, CreateUserInput, Override, UserRow, UserStatus,
  DisbursementInput, DisbursementRow, SoaEvent, SoaExportRow, SoaInput, SoaRow,
  FollowupChannel, FollowupEvent, FollowupInput, FollowupRow, FollowupSettings, FollowupStatus,
  ProductLine, QuoteAskRow, QuoteChannel, QuoteExportRow, QuoteReplyInput, QuoteRequestInput, QuoteRequestRow,
  QuoteSettings, ScorecardRow, MyProfile,
} from "./types";
import { createSupabaseApi } from "./supabaseApi";
import { createDemoApi } from "./demoApi";

export type AuthEvent = "SIGNED_IN" | "SIGNED_OUT" | "PASSWORD_RECOVERY" | "OTHER";

export interface Api {
  mode: "supabase" | "demo";

  // --- auth ---
  hasSession(): Promise<boolean>;
  onAuthChange(cb: (event: AuthEvent) => void): () => void;
  signInWithPassword(email: string, password: string): Promise<void>;
  signInWithMicrosoft(): Promise<void>;
  signOut(): Promise<void>;
  sendPasswordReset(email: string): Promise<void>;
  /** Sets a new password and clears the forced-change flag. */
  updatePassword(newPassword: string): Promise<void>;
  getAccess(): Promise<Access | null>;
  getMyProfile(): Promise<MyProfile | null>;
  updateMyProfile(patch: { full_name: string; job_title: string; phone: string }): Promise<void>;

  // --- agreement + two-step ---
  getPolicy(): Promise<Policy | null>;
  acceptPolicy(version: string): Promise<void>;
  mfaEnroll(): Promise<MfaEnrollment>;
  /** Confirms a new authenticator, or verifies the sign-in code for an enrolled one. */
  mfaVerify(code: string, factorId?: string): Promise<void>;

  // --- user management ---
  getCatalog(): Promise<Catalog>;
  listUsers(): Promise<UserRow[]>;
  getOverrides(userId: string): Promise<Override[]>;
  updateUser(userId: string, patch: { full_name: string; role_id: string }): Promise<void>;
  setOverrides(userId: string, overrides: Override[]): Promise<void>;
  createUser(input: CreateUserInput): Promise<{ user_id: string; temp_password?: string }>;
  setStatus(userId: string, status: Exclude<UserStatus, "pending">): Promise<void>;
  deleteUser(userId: string): Promise<void>;
  resetPassword(userId: string, mode: "email" | "temp_password"): Promise<{ temp_password?: string }>;
  resetMfa(userId: string): Promise<void>;
  getAccessReview(): Promise<AccessReviewData>;
  completeAccessReview(notes: string): Promise<void>;
  listIntegrations(): Promise<IntegrationRow[]>;
  saveIntegration(id: string, config: IntegrationRow["config"], secret: string | null, enabled: boolean): Promise<void>;
  testIntegration(id: string): Promise<TestResult>;
  disconnectIntegration(id: string): Promise<void>;
  /** Where GHL should send webhooks, or null when there is no backend (demo). */
  webhookUrl(id: string): string | null;
  /** Creates or replaces the webhook secret. The secret is returned once and never again. */
  newWebhookSecret(id: string): Promise<string>;
  getSyncLog(id: string): Promise<SyncLog>;
  retryEvent(eventId: number): Promise<void>;
  /** Problems with connected services; empty for people without integrations.view. */
  getIntegrationAlerts(): Promise<IntegrationAlert[]>;
  listAudit(limit?: number): Promise<AuditRow[]>;
  exportAudit(): Promise<AuditRow[]>;

  // --- example business data ---
  listClients(): Promise<ClientRow[]>;
  saveClient(row: Partial<ClientRow> & { full_name: string }): Promise<void>;
  deleteClient(id: string): Promise<void>;
  exportClients(): Promise<ClientRow[]>;

  // --- Billing & SOA: collections tracker ---
  listSoas(): Promise<SoaRow[]>;
  saveSoa(row: SoaInput): Promise<void>;
  /** Insert many SOAs at once (CSV import). Rejects the whole batch on any error. */
  importSoas(rows: SoaInput[]): Promise<number>;
  deleteSoa(id: string): Promise<void>;
  listSoaEvents(soaId: string): Promise<SoaEvent[]>;
  addSoaEvent(soaId: string, kind: "note" | "follow_up", body: string): Promise<void>;
  listDisbursements(): Promise<DisbursementRow[]>;
  saveDisbursement(row: DisbursementInput): Promise<string>;
  deleteDisbursement(id: string): Promise<void>;
  /** Point the given SOAs at a payout (or unlink with null), with the commission each one earned. */
  linkSoas(disbursementId: string | null, links: { soa_id: string; commission_amount: number | null }[]): Promise<void>;
  exportSoas(): Promise<SoaExportRow[]>;
  // --- follow-up queue (Felix + assistant) ---
  listFollowups(): Promise<FollowupRow[]>;
  listFollowupEvents(id: string): Promise<FollowupEvent[]>;
  getFollowupSettings(): Promise<FollowupSettings>;
  /** Chase rules. Karla (followups.approve) or admins (admin_settings.edit). */
  saveFollowupSettings(s: FollowupSettings): Promise<void>;
  /** Creates (no id) or edits the details of an item. Status and counters have their own calls. */
  saveFollowup(row: FollowupInput): Promise<void>;
  /** The assistant sent a chase. Escalates to Karla after the max number of tries. */
  logFollowupChase(id: string, channel: FollowupChannel, note: string | null, fromFelix: boolean): Promise<void>;
  /** Waived / cancelled, and reopening those, need followups.approve. */
  setFollowupStatus(id: string, status: FollowupStatus, note: string | null): Promise<void>;
  addFollowupNote(id: string, note: string): Promise<void>;
  deleteFollowup(id: string): Promise<void>;
  exportFollowups(): Promise<FollowupRow[]>;

  // --- provider quote requests (Quinn drafts, Karla sends and picks) ---
  listQuoteRequests(): Promise<QuoteRequestRow[]>;
  listQuoteAsks(): Promise<QuoteAskRow[]>;
  getQuoteSettings(): Promise<QuoteSettings>;
  /** Reply-by target. Karla (quotes.approve) or admins (admin_settings.edit). */
  saveQuoteSettings(s: QuoteSettings): Promise<void>;
  /** Creates (no id) or edits a request's details. Sending, picking and cancelling have their own calls. */
  saveQuoteRequest(row: QuoteRequestInput): Promise<string>;
  /** Karla sends the request to these insurers (or adds insurers to one already out). */
  sendQuoteRequest(id: string, insurers: string[], channel: QuoteChannel, addFollowups: boolean): Promise<void>;
  recordQuoteReply(askId: string, reply: QuoteReplyInput): Promise<void>;
  /** Karla picks the quote for the proposal; closes the request. */
  chooseQuote(askId: string): Promise<void>;
  cancelQuoteRequest(id: string): Promise<void>;
  deleteQuoteRequest(id: string): Promise<void>;
  getScorecard(days: number, productLine: ProductLine | null): Promise<ScorecardRow[]>;
  exportQuoteRequests(): Promise<QuoteExportRow[]>;
}

export const isDemo = import.meta.env.VITE_DEMO_MODE === "true";
/** A real build with no Supabase settings: refuse to run rather than fall back to demo. */
export const configMissing = !isDemo && !import.meta.env.VITE_SUPABASE_URL;

export const api: Api = isDemo || configMissing ? createDemoApi() : createSupabaseApi();

/** Friendly text for errors coming back from Supabase / Postgres. */
export function errorText(e: unknown): string {
  const msg = e instanceof Error ? e.message : typeof e === "string" ? e : "Something went wrong";
  if (/Invalid login credentials/i.test(msg)) return "Wrong email or password.";
  if (/Email not confirmed/i.test(msg)) return "Open the invite email first to confirm your address.";
  if (/banned/i.test(msg)) return "This account is suspended. Ask an admin.";
  if (/Database error saving new user/i.test(msg)) return "Only @ask-karla.com accounts can sign in.";
  if (/Invalid TOTP code|invalid.*code/i.test(msg)) return "That code didn't match. Check the time on your phone and try the newest code.";
  if (/row-level security|permission denied/i.test(msg)) return "You do not have permission to do that.";
  return msg;
}
