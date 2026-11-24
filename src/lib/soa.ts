import type { DisbursementRow, SoaRow, SoaStage } from "./types";

/** The order a SOA moves through, with what Karla's team does next at each stage. */
export const STAGES: { id: SoaStage; label: string; short: string; next: string; tone: "slate" | "amber" | "navy" | "gold" | "green" }[] = [
  { id: "draft", label: "Draft", short: "Draft", next: "Add the release date once the SOA goes to the client", tone: "slate" },
  { id: "awaiting_payment", label: "SOA released, awaiting client payment", short: "Awaiting payment", next: "Follow up the client for payment", tone: "amber" },
  { id: "awaiting_docs", label: "Paid, awaiting provider receipt / 2307", short: "Receipt / 2307", next: "Get the provider's receipt and the client's 2307", tone: "amber" },
  { id: "awaiting_commission", label: "Awaiting commission", short: "Awaiting commission", next: "Wait for the provider's commission payout", tone: "navy" },
  { id: "receipt_due", label: "Commission received, Karla's receipt due", short: "Karla's receipt due", next: "Karla issues her receipt to the provider", tone: "gold" },
  { id: "receipt_issued", label: "Receipt issued to provider", short: "Receipt issued", next: "Close once everything is filed", tone: "green" },
  { id: "closed", label: "Closed", short: "Closed", next: "", tone: "slate" },
];
export const stageInfo = (s: SoaStage) => STAGES.find((x) => x.id === s)!;

/** Same rules as public.soa_stage() in the database (the database copy is the one that counts). */
export function computeStage(s: Pick<SoaRow, "closed_on" | "disbursement_id" | "released_on" | "paid_on"
  | "provider_receipt_on" | "cwt_applicable" | "form_2307_on">, receiptIssued: boolean): SoaStage {
  if (s.closed_on) return "closed";
  if (s.disbursement_id && receiptIssued) return "receipt_issued";
  if (s.disbursement_id) return "receipt_due";
  if (!s.released_on) return "draft";
  if (!s.paid_on) return "awaiting_payment";
  if (!s.provider_receipt_on || (s.cwt_applicable && !s.form_2307_on)) return "awaiting_docs";
  return "awaiting_commission";
}

export const today = () => new Date().toISOString().slice(0, 10);
export const daysBetween = (fromIso: string, to = new Date()) =>
  Math.floor((to.getTime() - new Date(fromIso).getTime()) / 86_400_000);

/** How many days a stage may sit before it needs a nudge. Adjust once Karla confirms. */
export const STUCK_AFTER: Partial<Record<SoaStage, number>> = {
  draft: 3, awaiting_docs: 14, awaiting_commission: 45, receipt_due: 3, receipt_issued: 14,
};

export interface SoaFlags { overdueDays: number; stuckDays: number; missing2307: boolean; needsAttention: boolean }

export function flags(s: SoaRow): SoaFlags {
  const overdueDays = s.stage === "awaiting_payment" && s.due_on ? Math.max(0, daysBetween(s.due_on)) : 0;
  const inStage = daysBetween(s.stage_changed_at);
  const limit = STUCK_AFTER[s.stage];
  const stuckDays = limit !== undefined && inStage > limit ? inStage : 0;
  const missing2307 = s.cwt_applicable && !!s.paid_on && !s.form_2307_on && s.stage !== "closed";
  return { overdueDays, stuckDays, missing2307, needsAttention: overdueDays > 0 || stuckDays > 0 || missing2307 };
}

/** Aging of unpaid released SOAs, by days past due. */
export const AGING_BUCKETS = ["Not yet due", "1–30 days", "31–60 days", "61–90 days", "Over 90 days"] as const;
export function agingBucket(s: SoaRow): number | null {
  if (s.stage !== "awaiting_payment") return null;
  const d = s.due_on ? daysBetween(s.due_on) : 0;
  if (d <= 0) return 0;
  if (d <= 30) return 1;
  if (d <= 60) return 2;
  if (d <= 90) return 3;
  return 4;
}

export const peso = (n: number | null | undefined) =>
  n == null ? "—" : "₱" + n.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const fmtDate = (d: string | null | undefined) =>
  d ? new Date(d + (d.length === 10 ? "T00:00:00" : "")).toLocaleDateString("en-PH", { year: "numeric", month: "short", day: "numeric" }) : "—";

/** Plain-text receipt details Karla copies into her receipt template. */
export function receiptDetails(d: DisbursementRow, soas: SoaRow[]): string {
  const lines = [
    `Received from: ${d.provider}`,
    `Payout received: ${fmtDate(d.received_on)}${d.reference ? ` (ref. ${d.reference})` : ""}`,
    `Gross commission: ${peso(d.gross_amount)}`,
    `Less withholding tax: ${peso(d.withholding_amount)}`,
    `Net received: ${peso(d.net_amount)}`,
    "",
    `Covers ${soas.length} SOA${soas.length === 1 ? "" : "s"}:`,
    ...soas.map((s) => `  ${s.soa_no} · ${s.account_name} · ${peso(s.commission_amount ?? s.commission_expected)}`),
  ];
  return lines.join("\n");
}

// ---------------------------------------------------------------------
// CSV import
// ---------------------------------------------------------------------

export const IMPORT_COLUMNS = [
  "soa_no", "provider", "account_name", "product", "coverage_period", "amount", "released_on", "due_on",
  "paid_on", "paid_amount", "payment_ref", "provider_receipt_no", "provider_receipt_on", "cwt_applicable",
  "cwt_amount", "form_2307_on", "commission_rate", "commission_expected", "notes",
] as const;

export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") { row.push(cell); cell = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(cell); cell = "";
      if (row.some((c) => c.trim() !== "")) rows.push(row);
      row = [];
    } else cell += ch;
  }
  row.push(cell);
  if (row.some((c) => c.trim() !== "")) rows.push(row);
  return rows;
}

const num = (v: string) => {
  const n = Number(v.replace(/[₱,\s]/g, ""));
  if (v.trim() === "") return null;
  if (Number.isNaN(n)) throw new Error(`"${v}" is not a number`);
  return n;
};
const date = (v: string) => {
  const t = v.trim();
  if (!t) return null;
  const d = new Date(t);
  if (Number.isNaN(d.getTime())) throw new Error(`"${v}" is not a date (use YYYY-MM-DD)`);
  return /^\d{4}-\d{2}-\d{2}$/.test(t) ? t : new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
};
const rate = (v: string) => {
  const n = num(v.replace("%", ""));
  if (n == null) return null;
  return v.includes("%") || n > 1 ? n / 100 : n;
};

export interface ImportResult { rows: import("./types").SoaInput[]; errors: string[] }

/** Turn a CSV (first row = headers named as in IMPORT_COLUMNS) into SOA rows, collecting every error. */
export function soasFromCsv(text: string): ImportResult {
  const table = parseCsv(text.replace(/^﻿/, ""));
  if (table.length < 2) return { rows: [], errors: ["The file has no data rows."] };
  const header = table[0].map((h) => h.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, ""));
  const missing = ["soa_no", "provider", "account_name", "amount"].filter((c) => !header.includes(c));
  if (missing.length) return { rows: [], errors: [`Missing column(s): ${missing.join(", ")}`] };
  const rows: ImportResult["rows"] = [];
  const errors: string[] = [];
  table.slice(1).forEach((cells, i) => {
    const get = (c: string) => (cells[header.indexOf(c)] ?? "").trim();
    try {
      const amount = num(get("amount"));
      if (!get("soa_no") || !get("provider") || !get("account_name") || amount == null)
        throw new Error("soa_no, provider, account_name and amount are required");
      rows.push({
        soa_no: get("soa_no"), provider: get("provider"), account_name: get("account_name"), amount,
        product: get("product") || null, coverage_period: get("coverage_period") || null,
        released_on: date(get("released_on")), due_on: date(get("due_on")), paid_on: date(get("paid_on")),
        paid_amount: num(get("paid_amount")), payment_ref: get("payment_ref") || null,
        provider_receipt_no: get("provider_receipt_no") || null, provider_receipt_on: date(get("provider_receipt_on")),
        cwt_applicable: /^(y|yes|true|1)$/i.test(get("cwt_applicable")), cwt_amount: num(get("cwt_amount")),
        form_2307_on: date(get("form_2307_on")), commission_rate: rate(get("commission_rate")),
        commission_expected: num(get("commission_expected")), notes: get("notes") || null,
      });
    } catch (e) {
      errors.push(`Row ${i + 2}: ${e instanceof Error ? e.message : String(e)}`);
    }
  });
  const seen = new Set<string>();
  for (const r of rows) {
    const k = `${r.provider.toLowerCase()}|${r.soa_no}`;
    if (seen.has(k)) errors.push(`SOA ${r.soa_no} (${r.provider}) appears twice`);
    seen.add(k);
  }
  return { rows, errors };
}
