/**
 * Follow-up queue rules and Felix's message drafts.
 *
 * The database (supabase/migrations/20261125000001_followup_queue.sql) is the
 * copy that is enforced; the demo API reuses these helpers so the screens
 * behave the same before Supabase is set up.
 */
import type {
  ClientRow, FollowupChannel, FollowupKind, FollowupParty, FollowupRow, FollowupSettings, FollowupStatus,
} from "./types";

export const DEFAULT_SETTINGS: FollowupSettings = { chase_every_days: 2, max_attempts: 3, escalate_overdue_days: 2 };

/** Same limits as the checks on public.followup_settings. */
export function settingsError(s: FollowupSettings): string | null {
  const ok = (v: number, lo: number, hi: number) => Number.isInteger(v) && v >= lo && v <= hi;
  if (!ok(s.chase_every_days, 1, 30)) return "Days between chases must be 1 to 30.";
  if (!ok(s.max_attempts, 1, 20)) return "Tries before Karla must be 1 to 20.";
  if (!ok(s.escalate_overdue_days, 0, 60)) return "Days past due must be 0 to 60.";
  return null;
}

export const KIND_LABEL: Record<FollowupKind, string> = {
  document: "Document / requirement",
  signature: "Signature",
  payment: "Payment",
  insurer_reply: "Insurer reply",
  client_reply: "Client reply / decision",
  other: "Other",
};

export const CHANNEL_LABEL: Record<FollowupChannel, string> = {
  email: "Email",
  viber: "Viber",
  messenger: "Messenger",
  phone: "Phone call",
  sms: "SMS",
  insurer_portal: "Insurer portal",
};

export const STATUS_LABEL: Record<FollowupStatus, string> = {
  open: "To chase",
  waiting: "Waiting on reply",
  escalated: "With Karla",
  done: "Received",
  waived: "Waived",
  cancelled: "Cancelled",
};

export const STATUS_TONE = {
  open: "navy", waiting: "amber", escalated: "red", done: "green", waived: "slate", cancelled: "slate",
} as const satisfies Record<FollowupStatus, string>;

export const CLOSED: FollowupStatus[] = ["done", "waived", "cancelled"];
export const isClosed = (s: FollowupStatus) => CLOSED.includes(s);

/** Common things Ask Karla chases. Picking one fills the form. */
export const QUICK_ADD: { title: string; kind: FollowupKind; party: FollowupParty }[] = [
  { title: "Signed application form", kind: "signature", party: "client" },
  { title: "Valid ID (client sends straight to insurer)", kind: "document", party: "client" },
  { title: "Health declaration form", kind: "document", party: "client" },
  { title: "Proof of payment", kind: "payment", party: "client" },
  { title: "Census / employee list for group quote", kind: "document", party: "client" },
  { title: "Decision on the proposal", kind: "client_reply", party: "client" },
  { title: "Insurer reply on application", kind: "insurer_reply", party: "insurer" },
  { title: "Quote from insurer", kind: "insurer_reply", party: "insurer" },
  { title: "Official receipt from insurer", kind: "insurer_reply", party: "insurer" },
  { title: "Policy / member cards from insurer", kind: "insurer_reply", party: "insurer" },
];

/** Same rule as public.followup_text_is_minimal(): no ID, card, account or phone numbers. */
export const hasLongNumber = (s: string | null | undefined) => !!s && /[0-9][0-9 -]{7,}[0-9]/.test(s);
export const MINIMAL_TEXT_ERROR = "Leave out ID, card, account and phone numbers. Keep those with the insurer.";

export const todayIso = () => toIso(new Date());
function toIso(d: Date) {
  const z = new Date(d.getTime() - d.getTimezoneOffset() * 60_000);
  return z.toISOString().slice(0, 10);
}

/** Same as public.add_business_days(): skips Saturday and Sunday. */
export function addBusinessDays(fromIso: string, days: number): string {
  const d = new Date(`${fromIso}T12:00:00`);
  let n = 0;
  while (n < days) {
    d.setDate(d.getDate() + 1);
    const dow = d.getDay();
    if (dow !== 0 && dow !== 6) n++;
  }
  return toIso(d);
}

export function daysBetween(aIso: string, bIso: string): number {
  return Math.round((new Date(`${bIso}T12:00:00`).getTime() - new Date(`${aIso}T12:00:00`).getTime()) / 86_400_000);
}

export type Bucket = "escalated" | "overdue" | "today" | "waiting" | "later" | "closed";

export const BUCKET_LABEL: Record<Bucket, string> = {
  escalated: "With Karla",
  overdue: "Past due date",
  today: "Chase today",
  waiting: "Waiting on reply",
  later: "Scheduled",
  closed: "Closed",
};

/** Where an item sits in the queue today. Order matters: the first match wins. */
export function bucketOf(f: Pick<FollowupRow, "status" | "due_on" | "next_chase_on">, today = todayIso()): Bucket {
  if (isClosed(f.status)) return "closed";
  if (f.status === "escalated") return "escalated";
  if (f.due_on && f.due_on < today) return "overdue";
  if (f.next_chase_on <= today) return "today";
  if (f.status === "waiting") return "waiting";
  return "later";
}

const BUCKET_RANK: Record<Bucket, number> = { escalated: 0, overdue: 1, today: 2, waiting: 3, later: 4, closed: 5 };
export function sortQueue<T extends Pick<FollowupRow, "status" | "due_on" | "next_chase_on" | "created_at">>(rows: T[]): T[] {
  const today = todayIso();
  return [...rows].sort((a, b) =>
    BUCKET_RANK[bucketOf(a, today)] - BUCKET_RANK[bucketOf(b, today)]
    || (a.due_on ?? "9999").localeCompare(b.due_on ?? "9999")
    || a.next_chase_on.localeCompare(b.next_chase_on)
    || a.created_at.localeCompare(b.created_at));
}

/** What logging one more chase does. Mirrors public.log_followup_chase(). */
export function afterChase(f: FollowupRow, s: FollowupSettings, channel: FollowupChannel, today = todayIso()): FollowupRow {
  const attempts = f.attempts + 1;
  const escalate = f.status === "escalated" || attempts >= s.max_attempts;
  return {
    ...f,
    attempts,
    channel,
    last_chased_at: new Date().toISOString(),
    next_chase_on: addBusinessDays(today, s.chase_every_days),
    status: escalate ? "escalated" : "waiting",
    escalation_reason: f.status === "escalated" ? f.escalation_reason
      : escalate ? `No reply after ${attempts} follow-ups` : f.escalation_reason,
  };
}

// ---------------------------------------------------------------------
// Felix's drafts
// ---------------------------------------------------------------------

export interface Draft { subject: string | null; body: string }

const firstName = (c: Pick<ClientRow, "full_name"> | null | undefined) =>
  c?.full_name?.trim().split(/\s+/)[0] ?? "";

const fmtDate = (iso: string | null) =>
  iso ? new Date(`${iso}T12:00:00`).toLocaleDateString("en-PH", { month: "long", day: "numeric" }) : null;

/**
 * Felix writes the next chase message. Tone gets firmer with each attempt;
 * short for chat channels, a full email otherwise. Uses only the client's
 * first name and the item title, so no personal data leaves the queue.
 * The assistant always reviews and sends it; Felix never sends on his own.
 */
export function felixDraft(
  f: Pick<FollowupRow, "title" | "kind" | "party" | "insurer" | "reference" | "due_on" | "attempts">,
  channel: FollowupChannel,
  client?: Pick<ClientRow, "full_name"> | null,
): Draft {
  const attempt = f.attempts + 1;
  const due = fmtDate(f.due_on);
  const late = !!f.due_on && f.due_on < todayIso();
  const item = f.title.replace(/\s*\(.*?\)\s*$/, "");
  const ref = f.reference ? ` (ref. ${f.reference})` : "";
  const chat = channel !== "email" && channel !== "insurer_portal";

  if (f.party === "insurer") {
    const who = f.insurer ? `${f.insurer} team` : "team";
    const ask = attempt === 1
      ? `May we get an update on this: ${item}${ref}? Our client is waiting on it.`
      : attempt === 2
        ? `Following up again on this: ${item}${ref}. Could you share an update or an expected date?`
        : `This is our ${ordinal(attempt)} follow-up on this: ${item}${ref}. Could you escalate it on your side so we can update our client today?`;
    const body = chat
      ? `Hi ${who}! ${ask} Thank you!`
      : `Hi ${who},\n\n${ask}${due ? late ? ` It was due on ${due}.` : ` We hope to have it by ${due}.` : ""}\n\nThank you,\nAsk Karla Insurance`;
    return { subject: chat ? null : `Follow-up: ${item}${ref}`, body };
  }

  const name = firstName(client);
  const hi = name ? `Hi ${name}` : "Hi";
  const need = {
    document: `the ${item.toLowerCase()}`,
    signature: `your signature on the ${item.replace(/^signed\s+/i, "").toLowerCase()}`,
    payment: `the ${item.toLowerCase()}`,
    client_reply: `your ${item.toLowerCase()}`,
    insurer_reply: `the ${item.toLowerCase()}`,
    other: `the ${item.toLowerCase()}`,
  }[f.kind];
  const lead = attempt === 1
    ? `just a friendly reminder that we still need ${need}${f.insurer ? ` to move your ${f.insurer} application forward` : ""}.`
    : attempt === 2
      ? `following up on ${need}${due ? `, which ${f.insurer ?? "the insurer"} ${late ? "needed by" : "needs by"} ${due}` : ""}.`
      : `checking in once more on ${need}. We don't want your application to be held up. Is there anything we can help with?`;
  const body = chat
    ? `${hi}! This is Ask Karla, ${lead} Thank you!`
    : `${hi},\n\nThis is Ask Karla, ${lead}\n\nJust reply to this email if you have questions.\n\nThank you,\nAsk Karla Insurance`;
  return { subject: chat ? null : `Reminder: ${item}`, body };
}

function ordinal(n: number) {
  return n === 3 ? "third" : n === 4 ? "fourth" : n === 5 ? "fifth" : `${n}th`;
}
