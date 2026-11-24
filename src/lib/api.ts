import type {
  Access, AuditRow, Catalog, ClientRow, CreateUserInput, Override, UserRow, UserStatus,
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
  listAudit(limit?: number): Promise<AuditRow[]>;
  exportAudit(): Promise<AuditRow[]>;

  // --- example business data ---
  listClients(): Promise<ClientRow[]>;
  saveClient(row: Partial<ClientRow> & { full_name: string }): Promise<void>;
  deleteClient(id: string): Promise<void>;
  exportClients(): Promise<ClientRow[]>;
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
  if (/row-level security|permission denied/i.test(msg)) return "You do not have permission to do that.";
  return msg;
}
