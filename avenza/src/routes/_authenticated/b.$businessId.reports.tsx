import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useSuspenseQuery } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ItsaPanel } from "@/components/itsa-panel";
import { askAboutReport } from "@/lib/report-ai.functions";
import { buildReportPdf, deliverFile } from "@/lib/report-pdf";
import { Button } from "@/components/ui/button";
import { friendlyError, todayUK } from "@/lib/app";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { businessQuery, formatPence } from "@/lib/ledger";
import { accountingYear, buildBalanceSheet, buildPnl, corporationTaxPence, periodBalancesQuery, soleTraderTaxPence, taxYear, taxYearContaining, type Period } from "@/lib/reports";

export const Route = createFileRoute("/_authenticated/b/$businessId/reports")({
  head: () => ({ meta: [{ title: "Reports — AVENZA" }, { name: "description", content: "Profit and loss, balance sheet and tax estimates." }] }),
  component: Reports,
});

function Reports() {
  const { businessId } = Route.useParams();
  const { data: b } = useSuspenseQuery(businessQuery(businessId));
  const isLtd = b?.business_type === "limited_company";
  const now = new Date(todayUK() + "T12:00:00Z");
  const periods: Period[] = [];
  if (isLtd && b) {
    const thisEnd = new Date(Date.UTC(now.getUTCFullYear(), b.year_end_month - 1, b.year_end_day));
    const endYear = now > thisEnd ? now.getUTCFullYear() + 1 : now.getUTCFullYear();
    for (let i = 0; i < 4; i++) periods.push(accountingYear(endYear - i, b.year_end_month, b.year_end_day));
  } else {
    const ty = taxYearContaining(now);
    for (let i = 0; i < 4; i++) periods.push(taxYear(ty - i));
  }
  const [idx, setIdx] = useState("0");
  const [cFrom, setCFrom] = useState(periods[0]!.from);
  const [cTo, setCTo] = useState(todayUK());
  const customOk = idx === "custom" && cFrom && cTo && cFrom <= cTo;
  const p: Period = idx === "custom" ? { label: "Custom period", from: customOk ? cFrom : periods[0]!.from, to: customOk ? cTo : periods[0]!.to } : periods[+idx]!;
  const [pdfBusy, setPdfBusy] = useState(false);
  const pnlQ = useQuery(periodBalancesQuery(businessId, p.from, p.to));
  const bsQ = useQuery(periodBalancesQuery(businessId, null, p.to));
  const pnl = buildPnl(pnlQ.data ?? []);
  const bs = buildBalanceSheet(bsQ.data ?? []);
  const tax = isLtd ? null : soleTraderTaxPence(pnl.profit);
  const ct = isLtd ? corporationTaxPence(pnl.profit) : 0;
  const taxRows: [string, number][] = isLtd
    ? [["Taxable profit (before adjustments)", Math.max(0, pnl.profit)], ["Corporation Tax", ct]]
    : [["Trading profit", Math.max(0, pnl.profit)], ["Income Tax", tax!.incomeTax], ["Class 4 National Insurance", tax!.class4], ["Estimated total", tax!.incomeTax + tax!.class4]];
  const ready = !pnlQ.isLoading && !bsQ.isLoading && !pnlQ.error && !bsQ.error;

  async function downloadPdf() {
    setPdfBusy(true);
    try {
      const blob = await buildReportPdf({ businessName: b?.name ?? "Business", periodLabel: p.label, from: p.from, to: p.to, isLtd, pnl, bs, taxRows });
      await deliverFile(blob, `${(b?.name ?? "reports").replace(/[^\w-]+/g, "-")}-${p.from}-to-${p.to}.pdf`);
    } catch { toast.error("Couldn't create the PDF. Please try again."); }
    finally { setPdfBusy(false); }
  }

  return (
    <div className="print:text-foreground">
      <div className="grid gap-3 sm:flex sm:flex-wrap sm:items-end sm:justify-between">
        <div className="min-w-0">
          <h2 className="text-2xl font-semibold">Reports</h2>
          <p className="text-sm text-muted-foreground">{isLtd ? "By your company's accounting year." : "By UK tax year (6 April – 5 April)."}</p>
        </div>
        <div className="grid gap-2 sm:flex print:hidden">
          <Select value={idx} onValueChange={setIdx}>
            <SelectTrigger aria-label="Report period" className="h-11 w-full sm:h-10 sm:w-56"><SelectValue /></SelectTrigger>
            <SelectContent>
              {periods.map((x, i) => <SelectItem key={x.from} value={String(i)}>{x.label}</SelectItem>)}
              <SelectItem value="custom">Custom dates…</SelectItem>
            </SelectContent>
          </Select>
          <div className="grid grid-cols-2 gap-2 sm:flex">
            <Button className="h-11 sm:h-10" disabled={!ready || pdfBusy} onClick={downloadPdf}>{pdfBusy ? "Preparing…" : "Download PDF"}</Button>
            <Button className="h-11 sm:h-10" variant="outline" disabled={!ready} onClick={() => window.print()}>Print</Button>
          </div>
        </div>
      </div>
      {idx === "custom" && (
        <div className="mt-3 grid grid-cols-2 gap-3 sm:max-w-md print:hidden">
          <div className="grid gap-1.5"><Label htmlFor="rf">From</Label><Input id="rf" type="date" value={cFrom} onChange={(e) => setCFrom(e.target.value)} /></div>
          <div className="grid gap-1.5"><Label htmlFor="rt">To</Label><Input id="rt" type="date" value={cTo} onChange={(e) => setCTo(e.target.value)} /></div>
          {!customOk && <p role="alert" className="col-span-2 text-sm text-destructive">The start date must be on or before the end date.</p>}
        </div>
      )}
      <p className="mt-1 text-xs text-muted-foreground">{new Date(p.from + "T12:00:00Z").toLocaleDateString("en-GB")} – {new Date(p.to + "T12:00:00Z").toLocaleDateString("en-GB")}</p>

      {(pnlQ.isLoading || bsQ.isLoading) ? <p className="mt-8 text-muted-foreground">Loading…</p> : (pnlQ.error || bsQ.error) ? (
        <p role="alert" className="mt-8 text-destructive">{friendlyError(pnlQ.error || bsQ.error)}</p>
      ) : (
        <div className="mt-6 grid gap-6 lg:grid-cols-2">
          <section className="break-inside-avoid rounded-xl border bg-card p-4 sm:p-5">
            <h3 className="text-lg font-semibold">Profit &amp; loss</h3>
            <Group title="Income" rows={pnl.income} total={pnl.totalIncome} />
            <Group title="Expenses" rows={pnl.expenses} total={pnl.totalExpenses} />
            <Row strong label={pnl.profit >= 0 ? "Net profit" : "Net loss"} value={pnl.profit} />
          </section>

          <section className="break-inside-avoid rounded-xl border bg-card p-4 sm:p-5">
            <h3 className="text-lg font-semibold">Balance sheet <span className="text-sm font-normal text-muted-foreground">as at {new Date(p.to + "T12:00:00Z").toLocaleDateString("en-GB")}</span></h3>
            <Group title="Assets" rows={bs.assets} total={bs.totalAssets} />
            <Group title="Liabilities" rows={bs.liabilities} total={bs.totalLiabilities} />
            <Group title={isLtd ? "Capital & reserves" : "Owner's capital"} rows={[...bs.equity, { account_id: "rp", code: "", name: "Profit to date", amount: bs.retainedProfit }]} total={bs.totalEquity} />
            <Row strong label="Net assets" value={bs.totalAssets - bs.totalLiabilities} />
            {!bs.balanced && <p role="alert" className="mt-2 text-sm text-destructive">The balance sheet doesn't balance — please contact support.</p>}
          </section>

          <section className="break-inside-avoid rounded-xl border bg-card p-4 sm:p-5 lg:col-span-2">
            <h3 className="text-lg font-semibold">Tax estimate</h3>
            {isLtd ? (
              <>
                <Row label="Taxable profit (before adjustments)" value={Math.max(0, pnl.profit)} />
                <Row strong label="Corporation Tax" value={ct} />
                <p className="mt-2 text-xs text-muted-foreground">19% on profits up to £50,000, 25% from £250,000, with marginal relief in between. Doesn't account for capital allowances, disallowable costs or associated companies. Usually due 9 months and 1 day after the year end.</p>
              </>
            ) : tax && (
              <>
                <Row label="Trading profit" value={Math.max(0, pnl.profit)} />
                <Row label="Income Tax" value={tax.incomeTax} />
                <Row label="Class 4 National Insurance" value={tax.class4} />
                <Row strong label="Estimated total" value={tax.incomeTax + tax.class4} />
                <p className="mt-2 text-xs text-muted-foreground">Assumes this is your only income and England, Wales or Northern Ireland tax bands (Scottish rates differ). Self Assessment is due by 31 January after the tax year ends.</p>
              </>
            )}
            <p className="mt-1 text-xs text-muted-foreground">An estimate only — not tax advice.</p>
          </section>
        </div>
      )}
      {!isLtd && <ItsaPanel businessId={businessId} startYear={/-04-06$/.test(p.from) ? Number(p.from.slice(0, 4)) : taxYearContaining(now)} />}
      {ready && <AskPanel businessId={businessId} from={p.from} to={p.to} />}
    </div>
  );
}

const SUGGESTIONS = ["Why is my profit what it is?", "What are my biggest expenses?", "How was my tax estimate worked out?"];

function AskPanel({ businessId, from, to }: { businessId: string; from: string; to: string }) {
  const ask = useServerFn(askAboutReport);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [answer, setAnswer] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  async function run(question: string) {
    if (question.trim().length < 3) return;
    setBusy(true); setErr(null); setAnswer(null);
    try {
      const r = await ask({ data: { businessId, from, to, question } });
      if ("error" in r) setErr(r.error); else setAnswer(r.answer.replace(/\*\*(.+?)\*\*/g, "$1"));
    } catch (e) { setErr(friendlyError(e)); }
    finally { setBusy(false); }
  }
  const submit = (e: FormEvent) => { e.preventDefault(); run(q); };
  return (
    <section aria-labelledby="ask-h" className="mt-6 rounded-xl border bg-card p-4 sm:p-5 print:hidden">
      <h3 id="ask-h" className="text-lg font-semibold">Ask about these reports</h3>
      <p className="text-sm text-muted-foreground">Get a plain-English explanation of your income, expenses and tax estimate for this period.</p>
      <div className="mt-3 flex flex-wrap gap-2">
        {SUGGESTIONS.map((sug) => <Button key={sug} type="button" variant="outline" size="sm" className="min-h-11 sm:min-h-8" disabled={busy} onClick={() => { setQ(sug); run(sug); }}>{sug}</Button>)}
      </div>
      <form onSubmit={submit} className="mt-3 grid gap-2">
        <Label htmlFor="askq" className="sr-only">Your question</Label>
        <Textarea id="askq" value={q} maxLength={500} onChange={(e) => setQ(e.target.value)} placeholder="e.g. Why did my expenses go up?" />
        <Button type="submit" className="h-11 justify-self-start sm:h-10" disabled={busy || q.trim().length < 3}>{busy ? "Thinking…" : "Ask"}</Button>
      </form>
      <div aria-live="polite" className="mt-3">
        {err && <p role="alert" className="text-sm text-destructive">{err}</p>}
        {answer && <div className="whitespace-pre-wrap rounded-lg bg-muted p-3 text-sm">{answer}</div>}
        {answer && <p className="mt-2 text-xs text-muted-foreground">AI-generated from your figures. Check important decisions with an accountant.</p>}
      </div>
    </section>
  );
}


function Group({ title, rows, total }: { title: string; rows: { account_id: string; code: string; name: string; amount: number }[]; total: number }) {
  return (
    <div className="mt-4">
      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{title}</p>
      {rows.length === 0 ? <p className="py-1 text-sm text-muted-foreground">None</p> : rows.map((r) => <Row key={r.account_id} label={`${r.code} ${r.name}`.trim()} value={r.amount} />)}
      <Row strong label={`Total ${title.toLowerCase()}`} value={total} />
    </div>
  );
}

function Row({ label, value, strong }: { label: string; value: number; strong?: boolean }) {
  return (
    <div className={"flex justify-between gap-4 py-1 text-sm " + (strong ? "border-t font-semibold" : "")}>
      <span>{label}</span><span className="font-mono">{value < 0 ? `(${formatPence(-value)})` : formatPence(value)}</span>
    </div>
  );
}
