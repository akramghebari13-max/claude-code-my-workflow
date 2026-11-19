import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type ParsedLine = { date: string; description: string; amount_pence: number };

function splitCsvRow(row: string): string[] {
  const out: string[] = []; let cur = ""; let q = false;
  for (let i = 0; i < row.length; i++) {
    const c = row[i]!;
    if (q) { if (c === '"' && row[i + 1] === '"') { cur += '"'; i++; } else if (c === '"') q = false; else cur += c; }
    else if (c === '"') q = true; else if (c === ",") { out.push(cur); cur = ""; } else cur += c;
  }
  out.push(cur); return out.map((s) => s.trim());
}

/** UK bank dates: dd/mm/yyyy, dd-mm-yyyy, dd/mm/yy, or ISO yyyy-mm-dd. Returns ISO or null. */
export function parseUkDate(s: string): string | null {
  const t = s.trim();
  let m = t.match(/^(\d{4})-(\d{2})-(\d{2})/);
  let y: number, mo: number, d: number;
  if (m) { y = +m[1]!; mo = +m[2]!; d = +m[3]!; }
  else if ((m = t.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})$/))) { d = +m[1]!; mo = +m[2]!; y = m[3]!.length === 2 ? 2000 + +m[3]! : +m[3]!; }
  else return null;
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return null;
  return `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** "£1,234.56", "-12.30", "(12.30)" → pence; empty → 0; junk → null */
export function parseMoney(s: string): number | null {
  let t = s.replace(/[£,\s]/g, "");
  if (t === "") return 0;
  let neg = false;
  if (/^\(.*\)$/.test(t)) { neg = true; t = t.slice(1, -1); }
  if (t.endsWith("CR")) t = t.slice(0, -2);
  else if (t.endsWith("DR")) { neg = !neg; t = t.slice(0, -2); }
  if (!/^[-+]?\d+(\.\d{1,2})?$/.test(t)) return null;
  const p = Math.round(parseFloat(t) * 100);
  return neg ? -p : p;
}

const find = (h: string[], names: string[]) => h.findIndex((x) => names.some((n) => x === n || x.includes(n)));

/** Parses a bank CSV with either one signed Amount column or separate Paid in / Paid out columns. */
export function parseBankCsv(text: string): { lines: ParsedLine[]; errors: string[] } {
  const rows = text.replace(/^\uFEFF/, "").split(/\r?\n/).filter((r) => r.trim() !== "");
  if (rows.length < 2) return { lines: [], errors: ["The file has no rows"] };
  const h = splitCsvRow(rows[0]!).map((x) => x.toLowerCase());
  const di = find(h, ["date"]);
  const desc = find(h, ["description", "details", "narrative", "memo", "payee", "reference", "name"]);
  const inI = find(h, ["paid in", "money in", "credit", "deposit"]);
  const outI = find(h, ["paid out", "money out", "debit", "withdrawal"]);
  const amtI = find(h, ["amount", "value"]);
  if (di < 0 || desc < 0 || (amtI < 0 && (inI < 0 || outI < 0)))
    return { lines: [], errors: ["Couldn't find Date, Description and Amount (or Paid in / Paid out) columns"] };
  const lines: ParsedLine[] = []; const errors: string[] = [];
  rows.slice(1).forEach((r, i) => {
    const c = splitCsvRow(r);
    const date = parseUkDate(c[di] ?? "");
    let amt: number | null;
    if (inI >= 0 && outI >= 0) { const a = parseMoney(c[inI] ?? ""), b = parseMoney(c[outI] ?? ""); amt = a === null || b === null ? null : a - Math.abs(b); }
    else amt = parseMoney(c[amtI] ?? "");
    if (!date || amt === null) { errors.push(`Row ${i + 2}: couldn't read date or amount`); return; }
    if (amt === 0) return;
    lines.push({ date, description: (c[desc] || "Bank line").slice(0, 500), amount_pence: amt });
  });
  return { lines, errors };
}

type Candidate = { id: string; date: string; signed_pence: number };
/** Same signed amount within 7 days, closest date first. */
export function suggestMatches<T extends Candidate>(line: { line_date: string; amount_pence: number }, cands: T[]): T[] {
  const day = 86400000; const ld = Date.parse(line.line_date);
  return cands
    .filter((c) => c.signed_pence === line.amount_pence && Math.abs(Date.parse(c.date) - ld) <= 7 * day)
    .sort((a, b) => Math.abs(Date.parse(a.date) - ld) - Math.abs(Date.parse(b.date) - ld));
}

/** Supabase returns at most 1,000 rows per request, so read page by page until a short page. */
export const BANK_PAGE = 1000;
export async function fetchAllPages<T>(
  load: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>,
  pageSize: number = BANK_PAGE,
): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await load(from, from + pageSize - 1);
    if (error) throw error;
    rows.push(...(data ?? []));
    if (!data || data.length < pageSize) return rows;
  }
}

// Every line is loaded: the counts, the statement total and the lists are all worked out from it.
export const bankLinesQuery = (businessId: string) => queryOptions({
  queryKey: ["bank-lines", businessId],
  queryFn: () => fetchAllPages((from, to) => supabase.from("bank_statement_lines")
    .select("id, bank_account_id, line_date, description, amount_pence, status, transaction_id, invoice_id")
    .eq("business_id", businessId).order("line_date", { ascending: false }).order("id").range(from, to)),
});

export const reconcileCandidatesQuery = (businessId: string) => queryOptions({
  queryKey: ["reconcile-candidates", businessId],
  queryFn: async () => {
    const [t, i, used] = await Promise.all([
      supabase.from("transactions").select("id, direction, txn_date, counterparty, gross_pence, bank_account_id").eq("business_id", businessId).is("voided_at", null).order("txn_date", { ascending: false }).limit(1000),
      supabase.from("invoices").select("id, invoice_number, due_date, issue_date, net_pence, vat_pence, customers(name)").eq("business_id", businessId).eq("status", "sent"),
      supabase.from("bank_statement_lines").select("transaction_id").eq("business_id", businessId).not("transaction_id", "is", null),
    ]);
    if (t.error) throw t.error; if (i.error) throw i.error; if (used.error) throw used.error;
    const usedIds = new Set(used.data.map((u) => u.transaction_id));
    return {
      transactions: t.data.filter((x) => !usedIds.has(x.id)).map((x) => ({ ...x, date: x.txn_date, signed_pence: x.direction === "in" ? x.gross_pence : -x.gross_pence })),
      invoices: i.data.map((x) => ({ ...x, date: x.due_date ?? x.issue_date ?? "", signed_pence: x.net_pence + x.vat_pence })),
    };
  },
});
