import { daysBetween, flags, peso } from "./soa";
import type { DisbursementRow, SoaRow } from "./types";

/** What one AI employee in the 3D office is doing, taken from real app data. */
export interface LiveAgent {
  role?: string;
  desc?: string;
  now: string;
  say?: string;
  tasks: string[];
  k: string;
  kc: number;
  kg: number;
}

/** A row in the office's "From your trackers" list. Clicking it opens `path` in the app. */
export interface LiveItem { who?: string; title: string; sub?: string; badge?: string; tone: "need" | "info"; path: string }

export interface OfficeLive { type: "z1-live"; agents: Record<string, LiveAgent>; items: LiveItem[]; empty?: string }

const plural = (n: number, one: string, many = one + "s") => `${n} ${n === 1 ? one : many}`;

/**
 * Nina (collections) and Sol (commissions and Karla's receipts) work from the
 * SOA tracker; Kara surfaces whatever needs a person.
 */
export function buildOfficeLive(soas: SoaRow[], payouts: DisbursementRow[]): OfficeLive {
  const open = soas.filter((s) => s.stage !== "closed");
  const withF = open.map((s) => ({ s, f: flags(s) }));
  const overdue = withF.filter((x) => x.f.overdueDays > 0).sort((a, b) => b.f.overdueDays - a.f.overdueDays);
  const unpaid = open.filter((s) => s.stage === "awaiting_payment");
  const docs = withF.filter((x) => x.s.stage === "awaiting_docs" || x.f.missing2307);
  const released = soas.filter((s) => s.released_on);
  const paidOnTime = released.filter((s) => s.paid_on && (!s.due_on || s.paid_on <= s.due_on)).length;
  const overdueAmt = overdue.reduce((a, x) => a + x.s.amount, 0);

  const ninaTasks = [
    ...overdue.slice(0, 4).map(({ s, f }) => `Follow up ${s.account_name} on SOA ${s.soa_no} (${f.overdueDays} days overdue)`),
    ...docs.slice(0, 3).map(({ s }) => !s.provider_receipt_on
      ? `Get ${s.provider}'s receipt for SOA ${s.soa_no}`
      : `Get the 2307 from ${s.account_name} for SOA ${s.soa_no}`),
    ...unpaid.filter((s) => !flags(s).overdueDays).slice(0, 2).map((s) => `Watch SOA ${s.soa_no} from ${s.account_name}, due ${s.due_on ?? "soon"}`),
  ];
  const nina: LiveAgent = {
    role: "SOA Collections Tracker",
    desc: "Tracks every SOA from release to client payment, the provider's receipt and the 2307, and chases what is late.",
    now: overdue.length ? `Chasing ${plural(overdue.length, "overdue SOA")} (${peso(overdueAmt)})`
      : docs.length ? `Collecting receipts and 2307s for ${plural(docs.length, "paid SOA")}`
      : unpaid.length ? `Watching ${plural(unpaid.length, "unpaid SOA")}, none overdue`
      : "All SOAs are paid up",
    say: overdue.length ? `${plural(overdue.length, "SOA")} overdue. I'm on it.` : undefined,
    tasks: ninaTasks,
    k: "Released SOAs paid on time",
    kc: paidOnTime,
    kg: Math.max(1, released.length),
  };

  const receiptDue = payouts.filter((d) => !d.receipt_no);
  const awaitingComm = open.filter((s) => s.stage === "awaiting_commission");
  const soaCount = (d: DisbursementRow) => soas.filter((s) => s.disbursement_id === d.id).length;
  const sol: LiveAgent = {
    role: "Commissions & Receipts",
    desc: "Matches each provider's commission payout to its SOAs and prepares the details for Karla's receipt.",
    now: receiptDue.length
      ? `Preparing Karla's receipt for the ${receiptDue[0].provider} payout (${peso(receiptDue[0].net_amount)})`
      : awaitingComm.length ? `Waiting for commission on ${plural(awaitingComm.length, "SOA")}`
      : "Every payout has Karla's receipt",
    say: receiptDue.length ? "A payout needs Karla's receipt." : undefined,
    tasks: [
      ...receiptDue.map((d) => `Get Karla's receipt for ${d.provider} ${d.reference ?? ""} (${plural(soaCount(d), "SOA")}, ${peso(d.net_amount)} net)`.replace("  ", " ")),
      ...awaitingComm.slice(0, 4).map((s) => `Watch for ${s.provider} commission on SOA ${s.soa_no} (${peso(s.commission_expected)} expected)`),
    ],
    k: "Payouts with Karla's receipt",
    kc: payouts.length - receiptDue.length,
    kg: Math.max(1, payouts.length),
  };

  const items: LiveItem[] = [
    ...receiptDue.map((d): LiveItem => ({
      who: "sol", title: `Karla's receipt for ${d.provider} payout`, tone: "need", badge: "Karla",
      sub: `${plural(soaCount(d), "SOA")} · ${peso(d.net_amount)} net · received ${daysBetween(d.received_on)} d ago`, path: "/billing?tab=payouts",
    })),
    ...overdue.slice(0, 3).map(({ s, f }): LiveItem => ({
      who: "nina", title: `${s.account_name}: SOA ${s.soa_no}`, tone: "need", badge: `${f.overdueDays} d overdue`,
      sub: `${s.provider} · ${peso(s.amount)} unpaid`, path: `/billing?soa=${encodeURIComponent(s.id)}`,
    })),
    ...docs.filter((x) => x.f.missing2307).slice(0, 2).map(({ s }): LiveItem => ({
      who: "nina", title: `2307 missing: ${s.account_name}`, tone: "info", badge: "2307",
      sub: `SOA ${s.soa_no} · ${s.provider}`, path: `/billing?soa=${encodeURIComponent(s.id)}`,
    })),
  ];
  if (overdue.length > 3) items.push({ who: "nina", title: `${overdue.length - 3} more overdue SOAs`, tone: "info", badge: "View all", path: "/billing" });

  return { type: "z1-live", agents: { nina, sol }, items, empty: "SOAs and payouts are all on track" };
}
