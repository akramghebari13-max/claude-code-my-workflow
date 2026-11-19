import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { AccountType } from "./ledger";

export type Bal = { account_id: string; code: string; name: string; account_type: AccountType; debit_pence: number; credit_pence: number };
export type Period = { label: string; from: string; to: string };
const iso = (d: Date) => d.toISOString().slice(0, 10);

/** UK tax year runs 6 April to 5 April. startYear 2026 → 2026/27. */
export function taxYear(startYear: number): Period {
  return { label: `Tax year ${startYear}/${String((startYear + 1) % 100).padStart(2, "0")}`, from: `${startYear}-04-06`, to: `${startYear + 1}-04-05` };
}
export function taxYearContaining(date: Date): number {
  const y = date.getUTCFullYear();
  return date < new Date(Date.UTC(y, 3, 6)) ? y - 1 : y;
}
/** Accounting year ending on endMonth/endDay of endYear. */
export function accountingYear(endYear: number, endMonth: number, endDay: number): Period {
  const to = new Date(Date.UTC(endYear, endMonth - 1, endDay));
  const from = new Date(Date.UTC(endYear - 1, endMonth - 1, endDay + 1));
  return { label: `Year ended ${to.toLocaleDateString("en-GB", { timeZone: "UTC" })}`, from: iso(from), to: iso(to) };
}

export function buildPnl(rows: Bal[]) {
  const income = rows.filter((r) => r.account_type === "income").map((r) => ({ ...r, amount: r.credit_pence - r.debit_pence })).filter((r) => r.amount !== 0);
  const expenses = rows.filter((r) => r.account_type === "expense").map((r) => ({ ...r, amount: r.debit_pence - r.credit_pence })).filter((r) => r.amount !== 0);
  const ti = income.reduce((s, r) => s + r.amount, 0), te = expenses.reduce((s, r) => s + r.amount, 0);
  return { income, expenses, totalIncome: ti, totalExpenses: te, profit: ti - te };
}

export function buildBalanceSheet(rows: Bal[]) {
  const side = (t: AccountType, sign: 1 | -1) => rows.filter((r) => r.account_type === t).map((r) => ({ ...r, amount: sign * (r.debit_pence - r.credit_pence) })).filter((r) => r.amount !== 0);
  const assets = side("asset", 1), liabilities = side("liability", -1), equity = side("equity", -1);
  const sum = (x: { amount: number }[]) => x.reduce((s, r) => s + r.amount, 0);
  const profit = buildPnl(rows).profit;
  const ta = sum(assets), tl = sum(liabilities), teq = sum(equity) + profit;
  return { assets, liabilities, equity, retainedProfit: profit, totalAssets: ta, totalLiabilities: tl, totalEquity: teq, balanced: ta === tl + teq };
}

/** Corporation tax (FY2023 onwards): 19% up to £50k, 25% from £250k, marginal relief between. Ignores associated companies and short periods. */
export function corporationTaxPence(profitPence: number) {
  if (profitPence <= 0) return 0;
  const lower = 5_000_000, upper = 25_000_000;
  if (profitPence <= lower) return Math.round(profitPence * 0.19);
  const main = profitPence * 0.25;
  if (profitPence >= upper) return Math.round(main);
  return Math.round(main - (upper - profitPence) * 3 / 200);
}

/** Sole trader income tax (England, Wales & NI bands) + Class 4 NI, assuming no other income. */
export function soleTraderTaxPence(profitPence: number) {
  if (profitPence <= 0) return { incomeTax: 0, class4: 0 };
  const PA = 1_257_000, BASIC_TOP = 5_027_000, ADD = 12_514_000;
  const pa = Math.max(0, PA - Math.max(0, Math.floor((profitPence - 10_000_000) / 2)));
  const taxable = Math.max(0, profitPence - pa);
  const basicBand = BASIC_TOP - PA;
  const basic = Math.min(taxable, basicBand);
  const higher = Math.min(Math.max(0, taxable - basicBand), ADD - pa - basicBand);
  const additional = Math.max(0, profitPence - ADD);
  const incomeTax = Math.round(basic * 0.2 + Math.max(0, higher) * 0.4 + additional * 0.45);
  const class4 = Math.round(Math.max(0, Math.min(profitPence, BASIC_TOP) - PA) * 0.06 + Math.max(0, profitPence - BASIC_TOP) * 0.02);
  return { incomeTax, class4 };
}

export const periodBalancesQuery = (businessId: string, from: string | null, to: string) => queryOptions({
  queryKey: ["period-balances", businessId, from, to],
  queryFn: async () => {
    const { data, error } = await supabase.rpc("period_balances", { _business_id: businessId, _from: from as string, _to: to });
    if (error) throw error;
    return (data ?? []) as Bal[];
  },
});
