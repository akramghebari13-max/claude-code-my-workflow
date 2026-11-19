import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

export type AccountType = Database["public"]["Enums"]["account_type"];
export const ACCOUNT_TYPES: AccountType[] = ["asset", "liability", "equity", "income", "expense"];
export const ACCOUNT_TYPE_LABEL: Record<AccountType, string> = {
  asset: "Assets", liability: "Liabilities", equity: "Equity", income: "Income", expense: "Expenses",
};

/** Parse "1,234.56" / "£12.5" into pence. Returns null if invalid. */
export function parsePounds(input: string): number | null {
  const s = input.replace(/[£,\s]/g, "");
  if (s === "") return 0;
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return null;
  const [w, f = ""] = s.split(".");
  return Number(w) * 100 + Number((f + "00").slice(0, 2));
}

export function formatPence(p: number) {
  const sign = p < 0 ? "-" : "";
  return sign + "£" + (Math.abs(p) / 100).toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export type DraftLine = { account_id: string; debit_pence: number; credit_pence: number };

/** Same rules the database enforces when posting. */
export function checkJournal(lines: DraftLine[]): { ok: true; total: number } | { ok: false; reason: string } {
  const used = lines.filter((l) => l.account_id && (l.debit_pence > 0 || l.credit_pence > 0));
  if (used.length < 2) return { ok: false, reason: "Add at least two lines." };
  if (used.some((l) => l.debit_pence > 0 && l.credit_pence > 0)) return { ok: false, reason: "A line can't have both a debit and a credit." };
  const dr = used.reduce((s, l) => s + l.debit_pence, 0);
  const cr = used.reduce((s, l) => s + l.credit_pence, 0);
  if (dr !== cr) return { ok: false, reason: `Out of balance by ${formatPence(Math.abs(dr - cr))}.` };
  return { ok: true, total: dr };
}

/** Natural-side balance: assets & expenses are debit-normal, others credit-normal. */
export function naturalBalance(type: AccountType, debit: number, credit: number) {
  return type === "asset" || type === "expense" ? debit - credit : credit - debit;
}

export const businessQuery = (id: string) => queryOptions({
  queryKey: ["business", id],
  queryFn: async () => {
    const { data, error } = await supabase.from("businesses").select("id, name, business_type, address, registered_in, company_number, vat_registered, vat_number, vat_scheme, utr, year_end_month, year_end_day, business_members(role)").eq("id", id).maybeSingle();
    if (error) throw error;
    return data;
  },
});

export const accountsQuery = (businessId: string) => queryOptions({
  queryKey: ["accounts", businessId],
  queryFn: async () => {
    const { data, error } = await supabase.from("account_balances").select("*").eq("business_id", businessId).order("code");
    if (error) throw error;
    return data;
  },
});

export const PAGE = 100;

export const journalsQuery = (businessId: string, limit: number = PAGE) => queryOptions({
  queryKey: ["journals", businessId, limit],
  queryFn: async () => {
    const { data, error } = await supabase
      .from("journal_entries")
      .select("id, entry_number, entry_date, description, reference, reverses_id, journal_lines(id, account_id, debit_pence, credit_pence, accounts(code, name))")
      .eq("business_id", businessId)
      .order("entry_number", { ascending: false })
      .limit(limit + 1);
    if (error) throw error;
    return data;
  },
});

/** UK VAT rates in basis points. */
export const VAT_RATES = [
  { bp: 2000, label: "20% standard" },
  { bp: 500, label: "5% reduced" },
  { bp: 0, label: "0% / exempt" },
] as const;

/** VAT contained in a VAT-inclusive gross amount. */
export function vatFromGross(grossPence: number, rateBp: number) {
  return Math.round((grossPence * rateBp) / (10000 + rateBp));
}

/** Invoice totals using the same rounding as the database (per line). */
export function invoiceTotals(lines: { quantity: number; unit_pence: number; vat_rate_bp: number }[]) {
  let net = 0, vat = 0;
  for (const l of lines) {
    const ln = Math.round(l.quantity * l.unit_pence);
    net += ln;
    vat += Math.round((ln * l.vat_rate_bp) / 10000);
  }
  return { net, vat, gross: net + vat };
}

export const transactionsQuery = (businessId: string, limit: number = PAGE) => queryOptions({
  queryKey: ["transactions", businessId, limit],
  queryFn: async () => {
    const { data, error } = await supabase.from("transactions")
      .select("id, direction, txn_date, counterparty, description, gross_pence, vat_pence, receipt_path, voided_at, void_date, category:accounts!transactions_category_account_id_fkey(code, name)")
      .eq("business_id", businessId).order("txn_date", { ascending: false }).order("created_at", { ascending: false }).limit(limit + 1);
    if (error) throw error;
    return data;
  },
});

export const invoicesQuery = (businessId: string, limit: number = PAGE) => queryOptions({
  queryKey: ["invoices", businessId, limit],
  queryFn: async () => {
    const { data, error } = await supabase.from("invoices")
      .select("id, invoice_number, issue_date, due_date, status, net_pence, vat_pence, paid_date, customers(name), credit_notes(id, credit_number, credit_date, refund_date)")
      .eq("business_id", businessId).order("created_at", { ascending: false }).limit(limit + 1);
    if (error) throw error;
    return data;
  },
});

export const customersQuery = (businessId: string) => queryOptions({
  queryKey: ["customers", businessId],
  queryFn: async () => {
    const { data, error } = await supabase.from("customers").select("id, name, email, address").eq("business_id", businessId).order("name");
    if (error) throw error;
    return data;
  },
});

export const moneyTotalsQuery = (businessId: string) => queryOptions({
  queryKey: ["transactions", businessId, "totals"],
  queryFn: async () => {
    const { data, error } = await supabase.rpc("money_totals", { _business_id: businessId, _from: null as unknown as string, _to: null as unknown as string });
    if (error) throw error;
    return data as { in: number; out: number; count: number };
  },
});

export const journalSourcesQuery = (businessId: string) => queryOptions({
  queryKey: ["journals", businessId, "sources"],
  queryFn: async () => {
    const { data, error } = await supabase.rpc("journal_sources", { _business_id: businessId });
    if (error) throw error;
    return new Map((data ?? []).map((r) => [r.entry_id, r.source]));
  },
});
