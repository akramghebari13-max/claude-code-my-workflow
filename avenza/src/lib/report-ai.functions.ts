import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { buildBalanceSheet, buildPnl, corporationTaxPence, soleTraderTaxPence, type Bal } from "./reports";

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const gbp = (p: number) => (p < 0 ? "-" : "") + "£" + (Math.abs(p) / 100).toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const askAboutReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { businessId: string; from: string; to: string; question: string }) => {
    if (!/^[0-9a-f-]{36}$/i.test(input.businessId) || !ISO.test(input.from) || !ISO.test(input.to)) throw new Error("Invalid request");
    const question = String(input.question ?? "").trim();
    if (question.length < 3 || question.length > 500) throw new Error("Ask a question between 3 and 500 characters");
    return { ...input, question };
  })
  .handler(async ({ data, context }) => {
    const sb = context.supabase;
    // RLS + member check inside the DB functions keep this to the caller's own business
    const { data: biz, error: be } = await sb.from("businesses").select("name, business_type, vat_registered, vat_scheme, registered_in").eq("id", data.businessId).maybeSingle();
    if (be || !biz) return { error: "Business not found." };
    const [p, b] = await Promise.all([
      sb.rpc("period_balances", { _business_id: data.businessId, _from: data.from, _to: data.to }),
      sb.rpc("period_balances", { _business_id: data.businessId, _from: null as unknown as string, _to: data.to }),
    ]);
    if (p.error || b.error) return { error: "Couldn't load your report." };
    const pnl = buildPnl((p.data ?? []) as Bal[]);
    const bs = buildBalanceSheet((b.data ?? []) as Bal[]);
    const isLtd = biz.business_type === "limited_company";
    const lines = [
      `Business: ${biz.name} (${isLtd ? "limited company" : "sole trader"}), VAT registered: ${biz.vat_registered ? `yes, ${biz.vat_scheme} scheme` : "no"}${biz.registered_in ? `, registered in ${biz.registered_in}` : ""}`,
      `Period: ${data.from} to ${data.to}`,
      `Income: ${pnl.income.map((r) => `${r.name} ${gbp(r.amount)}`).join("; ") || "none"} (total ${gbp(pnl.totalIncome)})`,
      `Expenses: ${pnl.expenses.map((r) => `${r.name} ${gbp(r.amount)}`).join("; ") || "none"} (total ${gbp(pnl.totalExpenses)})`,
      `Net ${pnl.profit >= 0 ? "profit" : "loss"}: ${gbp(pnl.profit)}`,
      `Balance sheet at ${data.to}: assets ${gbp(bs.totalAssets)}, liabilities ${gbp(bs.totalLiabilities)}, net assets ${gbp(bs.totalAssets - bs.totalLiabilities)}`,
    ];
    if (isLtd) lines.push(`Estimated Corporation Tax: ${gbp(corporationTaxPence(pnl.profit))} (19% up to £50k, 25% from £250k, marginal relief between; before adjustments)`);
    else { const t = soleTraderTaxPence(pnl.profit); lines.push(`Estimated Income Tax: ${gbp(t.incomeTax)}, Class 4 NI: ${gbp(t.class4)} (assumes no other income; England/Wales/NI: £12,570 personal allowance tapered above £100k, 20% to £50,270, 40% to £125,140, 45% above; Class 4 NI 6% on £12,570–£50,270 and 2% above)`); }
    const { explainReport } = await import("./ai/report-explain.server");
    return explainReport(lines.join("\n"), data.question);
  });
