/**
 * Provider quote requests: labels, the turnaround scorecard and Quinn's
 * request drafts.
 *
 * The database (supabase/migrations/20261126000001_quote_requests.sql) is
 * the copy that is enforced; the demo API reuses these helpers so the
 * screens behave the same before Supabase is set up.
 */
import { addBusinessDays, todayIso } from "./followups";
import type {
  FollowupRow, ProductLine, QuoteAskRow, QuoteAskStatus, QuoteChannel, QuoteRequestRow, QuoteRequestStatus,
  QuoteSettings, ScorecardRow,
} from "./types";

export const DEFAULT_QUOTE_SETTINGS: QuoteSettings = { target_days: 2 };

export function quoteSettingsError(s: QuoteSettings): string | null {
  return Number.isInteger(s.target_days) && s.target_days >= 1 && s.target_days <= 15
    ? null : "Reply-by target must be 1 to 15 business days.";
}

export const INSURERS = ["Maxicare", "Medicard", "Intellicare", "IMS", "KHL", "FWD"];

export const PRODUCT_LABEL: Record<ProductLine, string> = {
  hmo: "HMO, individual / family",
  group_hmo: "HMO, group / corporate",
  life: "Life",
  preneed: "Pre-need",
  nonlife: "Non-life",
};

export const REQUEST_STATUS_LABEL: Record<QuoteRequestStatus, string> = {
  draft: "Draft", open: "Out to insurers", done: "Quote picked", cancelled: "Cancelled",
};
export const REQUEST_STATUS_TONE = {
  draft: "slate", open: "navy", done: "green", cancelled: "slate",
} as const satisfies Record<QuoteRequestStatus, string>;

export const ASK_STATUS_LABEL: Record<QuoteAskStatus, string> = {
  waiting: "Waiting", quoted: "Quoted", declined: "Declined", withdrawn: "Not needed",
};

export const QUOTE_CHANNEL_LABEL: Record<QuoteChannel, string> = {
  email: "Email", insurer_portal: "Insurer portal", viber: "Viber", phone: "Phone call",
};

/** Weekdays from a to b; same day = 0. Same as public.business_days_between(). */
export function businessDaysBetween(fromIso: string, toIso: string): number {
  if (toIso <= fromIso) return 0;
  let n = 0;
  let d = fromIso;
  while (d < toIso) {
    d = addBusinessDays(d, 1);
    if (d <= toIso) n++;
  }
  return n;
}

/** yyyy-mm-dd in Manila time (where Karla works), from a timestamp. */
export const manilaDate = (iso: string) =>
  new Date(new Date(iso).getTime() + 8 * 3600_000).toISOString().slice(0, 10);

export const turnaround = (a: Pick<QuoteAskRow, "sent_at" | "replied_at">) =>
  a.replied_at ? businessDaysBetween(manilaDate(a.sent_at), manilaDate(a.replied_at)) : null;

export const replyByFor = (s: QuoteSettings, from = todayIso()) => addBusinessDays(from, s.target_days);

export const isLate = (a: Pick<QuoteAskRow, "status" | "due_on">, today = todayIso()) =>
  a.status === "waiting" && a.due_on < today;

export function gradeOf(score: number | null): ScorecardRow["grade"] {
  if (score === null) return null;
  return score >= 85 ? "A" : score >= 70 ? "B" : score >= 50 ? "C" : "D";
}

export const GRADE_TONE = { A: "green", B: "navy", C: "amber", D: "red" } as const;

/** Mirrors public.quote_scorecard(). */
export function computeScorecard(
  asks: QuoteAskRow[], requests: QuoteRequestRow[], followups: Pick<FollowupRow, "id" | "attempts">[],
  days = 90, productLine: ProductLine | null = null, today = todayIso(),
): ScorecardRow[] {
  const since = Date.now() - Math.max(days, 1) * 86_400_000;
  const reqById = new Map(requests.map((r) => [r.id, r]));
  const chasesById = new Map(followups.map((f) => [f.id, f.attempts]));
  const groups = new Map<string, QuoteAskRow[]>();
  for (const a of asks) {
    if (a.status === "withdrawn" || new Date(a.sent_at).getTime() < since) continue;
    if (productLine && reqById.get(a.request_id)?.product_line !== productLine) continue;
    groups.set(a.insurer, [...(groups.get(a.insurer) ?? []), a]);
  }
  const round1 = (n: number) => Math.round(n * 10) / 10;
  const rows = [...groups.entries()].map(([insurer, list]): ScorecardRow => {
    const replied = list.filter((a) => a.status === "quoted" || a.status === "declined");
    const tats = list.map(turnaround).filter((t): t is number => t !== null).sort((a, b) => a - b);
    const median = tats.length === 0 ? null
      : tats.length % 2 ? tats[(tats.length - 1) / 2] : (tats[tats.length / 2 - 1] + tats[tats.length / 2]) / 2;
    const onTime = list.filter((a) => a.replied_at && manilaDate(a.replied_at) <= a.due_on).length;
    const judged = list.filter((a) => a.replied_at || a.due_on < today).length;
    const score = list.length >= 3 && judged > 0
      ? Math.round(60 * onTime / judged + 40 * replied.length / list.length) : null;
    return {
      insurer,
      asked: list.length,
      replied: replied.length,
      quoted: list.filter((a) => a.status === "quoted").length,
      declined: list.filter((a) => a.status === "declined").length,
      waiting: list.filter((a) => a.status === "waiting").length,
      overdue: list.filter((a) => isLate(a, today)).length,
      median_days: median === null ? null : round1(median),
      avg_days: tats.length ? round1(tats.reduce((x, y) => x + y, 0) / tats.length) : null,
      on_time: onTime,
      on_time_pct: judged ? Math.round(100 * onTime / judged) : null,
      reply_pct: Math.round(100 * replied.length / list.length),
      chases: list.reduce((n, a) => n + (a.followup_id ? chasesById.get(a.followup_id) ?? 0 : 0), 0),
      chosen: list.filter((a) => a.chosen).length,
      score,
      grade: gradeOf(score),
    };
  });
  return rows.sort((a, b) =>
    (b.score ?? -1) - (a.score ?? -1)
    || (a.median_days ?? 999) - (b.median_days ?? 999)
    || a.insurer.localeCompare(b.insurer));
}

// ---------------------------------------------------------------------
// Quinn's request draft
// ---------------------------------------------------------------------

const fmtLong = (iso: string) =>
  new Date(`${iso}T12:00:00`).toLocaleDateString("en-PH", { weekday: "long", month: "long", day: "numeric" });

/**
 * Quinn writes the quote request for one insurer. It carries only the need
 * (ages, benefit limits, room, area) and the reply-by date. For group and
 * non-life quotes the company name is included because the insurer needs
 * it; individual and family requests never name the client. Census files
 * and IDs go to the insurer separately. Karla reviews and sends it.
 */
export function quinnDraft(
  r: Pick<QuoteRequestRow, "ref_code" | "product_line" | "needs" | "headcount" | "account_label">,
  insurer: string,
  replyBy: string,
  channel: QuoteChannel = "email",
): { subject: string | null; body: string } {
  const company = (r.product_line === "group_hmo" || r.product_line === "nonlife") && r.account_label
    ? r.account_label : null;
  const what = {
    hmo: "an HMO plan", group_hmo: "a group HMO plan", life: "life insurance", preneed: "a pre-need plan", nonlife: "non-life cover",
  }[r.product_line];
  const heads = r.headcount ? ` (${r.headcount} ${r.headcount === 1 ? "person" : "people"})` : "";
  if (channel !== "email") {
    return {
      subject: null,
      body: `Hi ${insurer} team! This is Karla of Ask Karla. May we request a quote for ${what}${company ? ` for ${company}` : ""}${heads}, ref. ${r.ref_code}: ${r.needs.trim()} We hope to get it by ${fmtLong(replyBy)}. Thank you!`,
    };
  }
  return {
    subject: `Quote request ${r.ref_code}: ${PRODUCT_LABEL[r.product_line]}${company ? `, ${company}` : ""}${heads}`,
    body: [
      `Hi ${insurer} team,`,
      "",
      `May we request a quotation for ${what} for ${company ? company : "our client"}${heads}.`,
      "",
      "What they need:",
      ...r.needs.trim().split(/\n+/).map((l) => `- ${l.trim()}`),
      "",
      `Please send your best plan options with the annual premium by ${fmtLong(replyBy)}, and let us know if you need anything else to quote${r.product_line === "group_hmo" ? " (we can have the census sent to you directly)" : ""}.`,
      "",
      `Reference: ${r.ref_code}`,
      "",
      "Thank you,",
      "Karla Luansing",
      "Ask Karla Insurance",
    ].join("\n"),
  };
}

export const peso = (n: number | null | undefined) =>
  n == null ? "—" : `₱${Number(n).toLocaleString("en-PH", { maximumFractionDigits: 0 })}`;
