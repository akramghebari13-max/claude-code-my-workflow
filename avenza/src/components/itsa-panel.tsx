import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { collectHmrcFraudData } from "@/lib/hmrc";
import {
  finalDeclarationDeadline, hmrcTaxYear, itsaQuarters, nextQuarter, quarterStatus, taxYearEnded, ukDate,
  type ItsaCalculation, type QuarterStatus,
} from "@/lib/itsa";
import { buildPnl, periodBalancesQuery } from "@/lib/reports";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { todayUK } from "@/lib/app";
import { formatPence } from "@/lib/ledger";
import { disconnectItsa, itsaCalculate, itsaFinalDeclaration, itsaSendFigures, itsaStatus, startItsaAuth } from "@/lib/itsa.functions";

const gbp = (n: number | null) => (n === null ? "—" : formatPence(Math.round(n * 100)));
const STATUS: Record<QuarterStatus, { text: string; cls: string }> = {
  sent: { text: "Sent", cls: "bg-primary/10 text-primary" },
  due: { text: "Ready to send", cls: "bg-accent/30" },
  overdue: { text: "Overdue", cls: "bg-destructive/10 text-destructive" },
  open: { text: "Quarter not ended", cls: "bg-muted text-muted-foreground" },
};
const short = (iso: string) => ukDate(iso).replace(/ \d{4}$/, "");

export function ItsaPanel({ businessId, startYear }: { businessId: string; startYear: number }) {
  const qc = useQueryClient();
  const getStatus = useServerFn(itsaStatus);
  const startAuth = useServerFn(startItsaAuth);
  const send = useServerFn(itsaSendFigures);
  const calculate = useServerFn(itsaCalculate);
  const declare = useServerFn(itsaFinalDeclaration);
  const drop = useServerFn(disconnectItsa);
  const taxYear = hmrcTaxYear(startYear);
  const ended = taxYearEnded(startYear, todayUK());
  const [nino, setNino] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [calc, setCalc] = useState<{ id: string; type: string; calc: ItsaCalculation } | null>(null);
  const [agree, setAgree] = useState(false);

  const q = useQuery({ queryKey: ["itsa-status", businessId], queryFn: () => getStatus({ data: { businessId } }) });
  const hist = useQuery({
    queryKey: ["itsa-history", businessId, taxYear],
    queryFn: async () => (await supabase.from("itsa_submissions").select("id, kind, submitted_at, is_sandbox, figures")
      .eq("business_id", businessId).eq("tax_year", taxYear).order("submitted_at", { ascending: false }).limit(10)).data ?? [],
  });
  const declared = (hist.data ?? []).some((h) => h.kind === "final");
  const today = todayUK();
  const quarters = itsaQuarters(startYear);
  const sentTo = (hist.data ?? []).filter((h) => h.kind === "figures")
    .map((h) => (h.figures as { to?: unknown } | null)?.to).filter((t): t is string => typeof t === "string");
  const [picked, setPicked] = useState<number | null>(null);
  const quarter = quarters[(picked ?? nextQuarter(quarters, today, sentTo).n) - 1]!;
  const qStatus = quarterStatus(quarter, today, sentTo);
  const qBooks = useQuery({ ...periodBalancesQuery(businessId, quarter.from, quarter.to), enabled: qStatus !== "open" });
  const qPnl = buildPnl(qBooks.data ?? []);

  async function run<T>(key: string, fn: () => Promise<T>, ok?: (r: T) => void) {
    setBusy(key);
    try {
      const r = await fn();
      const err = (r as { error?: string }).error;
      if (err) toast.error(err); else ok?.(r);
    } catch { toast.error("Something went wrong talking to HMRC. Try again."); }
    finally { setBusy(null); }
  }

  const s = q.data;
  return (
    <section className="mt-6 rounded-lg border border-border bg-card p-4 sm:p-5 print:hidden" aria-labelledby="itsa-h">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 id="itsa-h" className="text-lg font-semibold">Income Tax return · {taxYear.replace("-", "/")}</h3>
        {s?.configured && <span className="rounded bg-accent/20 px-2 py-0.5 text-xs font-medium">{s.isSandbox ? "HMRC test sandbox" : "HMRC live"}</span>}
      </div>
      <p className="mt-1 text-sm text-muted-foreground">Making Tax Digital for Income Tax: send your self-employment figures, see HMRC's Income Tax and Class 4 calculation, then make the final declaration after 5 April.</p>

      <ul className="mt-3 divide-y rounded-md border text-sm" aria-label="Quarterly update deadlines">
        {quarters.map((q) => {
          const st = STATUS[quarterStatus(q, today, sentTo)];
          return (
            <li key={q.n} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 px-3 py-2">
              <span><span className="font-medium">Q{q.n}</span> · {short(q.from)} – {ukDate(q.to)}</span>
              <span className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">due {ukDate(q.deadline)}</span>
                <span className={"rounded px-2 py-0.5 text-xs font-medium " + st.cls}>{st.text}</span>
              </span>
            </li>
          );
        })}
        <li className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 px-3 py-2">
          <span className="font-medium">Final declaration</span>
          <span className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">due {ukDate(finalDeclarationDeadline(startYear))}</span>
            <span className={"rounded px-2 py-0.5 text-xs font-medium " + (declared ? STATUS.sent.cls : STATUS.open.cls)}>{declared ? "Sent" : ended ? "Ready when you are" : "After 5 April"}</span>
          </span>
        </li>
      </ul>

      {q.isLoading ? <p className="mt-3 text-sm">Checking HMRC…</p> : !s?.configured ? (
        <p className="mt-3 text-sm">AVENZA isn't linked to an HMRC developer app yet. Once the sandbox client ID and secret are added, you can connect here.</p>
      ) : !s.status ? (
        s.canPost ? (
          <form className="mt-3 grid gap-2 sm:flex sm:items-end" onSubmit={(e) => { e.preventDefault(); void run("connect", () => startAuth({ data: { businessId, nino } }), (r) => { if ("url" in r && r.url) { const w = window.open(r.url, "_blank", "noopener"); if (!w) window.location.href = r.url; } }); }}>
            <div className="grid gap-1"><Label htmlFor="nino">National Insurance number</Label>
              <Input id="nino" className="h-11 sm:h-10 sm:w-56" value={nino} onChange={(e) => setNino(e.target.value)} placeholder="QQ 12 34 56 C" autoComplete="off" /></div>
            <Button type="submit" className="h-11 sm:h-10" disabled={busy !== null}>{busy === "connect" ? "Opening…" : "Connect to HMRC"}</Button>
          </form>
        ) : <p className="mt-3 text-sm">Only the owner or their accountant can connect HMRC.</p>
      ) : (
        <div className="mt-3 grid gap-3">
          <p className="text-sm">Connected for NI number {s.status.nino_hint}{s.status.expired ? " · sign-in will refresh on next send" : ""}.</p>
          {declared ? <p className="text-sm font-medium">Final declaration sent for {taxYear.replace("-", "/")}.</p> : s.canPost && (
            <div className="grid gap-3">
              <div className="rounded-md border p-3">
                <div className="grid gap-2 sm:flex sm:items-end sm:gap-3">
                  <div className="grid gap-1">
                    <Label htmlFor="itsa-quarter">Quarterly update</Label>
                    <Select value={String(quarter.n)} onValueChange={(v) => setPicked(Number(v))}>
                      <SelectTrigger id="itsa-quarter" className="h-11 sm:h-10 sm:w-64"><SelectValue /></SelectTrigger>
                      <SelectContent>{quarters.map((q) => <SelectItem key={q.n} value={String(q.n)}>Q{q.n} · to {ukDate(q.to)}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <p className="text-xs text-muted-foreground">Due by {ukDate(quarter.deadline)}. Each update covers 6 April to the quarter end; sending again replaces it.</p>
                </div>
                {qStatus === "open" ? (
                  <p className="mt-3 text-sm">This quarter ends on {ukDate(quarter.to)}. You can send it from the next day.</p>
                ) : (
                  <>
                    <dl className="mt-3 grid grid-cols-2 gap-1 text-sm">
                      <dt>Income, {short(quarter.from)} – {short(quarter.to)}</dt><dd className="text-right tabular-nums">{qBooks.isLoading ? "…" : formatPence(qPnl.totalIncome)}</dd>
                      <dt>Expenses</dt><dd className="text-right tabular-nums">{qBooks.isLoading ? "…" : formatPence(qPnl.totalExpenses)}</dd>
                      <dt className="font-semibold">Profit</dt><dd className="text-right font-semibold tabular-nums">{qBooks.isLoading ? "…" : formatPence(qPnl.profit)}</dd>
                    </dl>
                    <Button className="mt-3 h-11 w-full sm:h-10 sm:w-auto" disabled={busy !== null || qBooks.isLoading || qBooks.isError}
                      onClick={() => run("send", () => send({ data: { businessId, taxYear, quarter: quarter.n, fraud: collectHmrcFraudData() } }), () => { toast.success(`Q${quarter.n} update sent to HMRC`); void hist.refetch(); })}>
                      {busy === "send" ? "Sending…" : qStatus === "sent" ? `Send Q${quarter.n} again (correction)` : `1. Send Q${quarter.n} update to HMRC`}</Button>
                  </>
                )}
              </div>
              <div className="grid gap-2 sm:flex sm:flex-wrap">
              <Button variant="outline" className="h-11 sm:h-10" disabled={busy !== null} onClick={() => run("calc", () => calculate({ data: { businessId, taxYear, fraud: collectHmrcFraudData() } }), (r) => { if (!("error" in r)) setCalc({ id: r.calculationId, type: r.type, calc: r.calc }); })}>
                {busy === "calc" ? "Calculating…" : "2. Get HMRC's calculation"}</Button>
              </div>
            </div>
          )}
          {calc && (
            <div className="rounded-md bg-muted p-3 text-sm">
              <p className="font-medium">HMRC's calculation {calc.type === "in-year" ? "(so far this year)" : "(for the final return)"}</p>
              <dl className="mt-2 grid grid-cols-2 gap-1">
                <dt>Taxable income</dt><dd className="text-right tabular-nums">{gbp(calc.calc.taxableIncome)}</dd>
                <dt>Income Tax</dt><dd className="text-right tabular-nums">{gbp(calc.calc.incomeTax)}</dd>
                <dt>Class 4 National Insurance</dt><dd className="text-right tabular-nums">{gbp(calc.calc.class4)}</dd>
                <dt className="font-semibold">Total due</dt><dd className="text-right font-semibold tabular-nums">{gbp(calc.calc.total)}</dd>
              </dl>
            </div>
          )}
          {calc && !declared && s.canPost && (ended && calc.type === "intent-to-finalise" ? (
            <div className="grid gap-2">
              <label className="flex items-start gap-2 text-sm"><input type="checkbox" className="mt-1 h-4 w-4" checked={agree} onChange={(e) => setAgree(e.target.checked)} />
                <span>I declare that the information and self-assessment I have filed are, to the best of my knowledge, correct and complete. I understand I may have to pay financial penalties or face prosecution if I give false information.</span></label>
              <Button className="h-11 sm:h-10 sm:w-fit" disabled={!agree || busy !== null} onClick={() => run("final", () => declare({ data: { businessId, taxYear, calculationId: calc.id, fraud: collectHmrcFraudData() } }), () => { toast.success("Final declaration sent to HMRC"); void hist.refetch(); })}>
                {busy === "final" ? "Sending…" : "3. Send final declaration"}</Button>
            </div>
          ) : <p className="text-xs text-muted-foreground">The final declaration opens after the tax year ends on 5 April.</p>)}
          {(hist.data ?? []).length > 0 && (
            <ul className="text-xs text-muted-foreground">
              {hist.data!.map((h) => <li key={h.id}>{new Date(h.submitted_at).toLocaleString("en-GB")} · {h.kind === "final" ? "Final declaration" : sentLabel(h.figures)}{h.is_sandbox ? " (sandbox)" : ""}</li>)}
            </ul>
          )}
          {s.canPost && <Button variant="ghost" size="sm" className="w-fit" disabled={busy !== null} onClick={() => run("drop", () => drop({ data: { businessId } }), () => qc.invalidateQueries({ queryKey: ["itsa-status", businessId] }))}>Disconnect HMRC</Button>}
        </div>
      )}
    </section>
  );
}

function sentLabel(figures: unknown): string {
  const f = figures as { quarter?: number; to?: string } | null;
  return f?.quarter ? `Q${f.quarter} update sent` : f?.to ? `Figures to ${ukDate(f.to)} sent` : "Figures sent";
}
