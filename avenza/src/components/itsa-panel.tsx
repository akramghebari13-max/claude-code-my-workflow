import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { collectHmrcFraudData } from "@/lib/hmrc";
import { hmrcTaxYear, taxYearEnded, type ItsaCalculation } from "@/lib/itsa";
import { todayUK } from "@/lib/app";
import { formatPence } from "@/lib/ledger";
import { disconnectItsa, itsaCalculate, itsaFinalDeclaration, itsaSendFigures, itsaStatus, startItsaAuth } from "@/lib/itsa.functions";

const gbp = (n: number | null) => (n === null ? "—" : formatPence(Math.round(n * 100)));

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
            <div className="grid gap-2 sm:flex sm:flex-wrap">
              <Button className="h-11 sm:h-10" disabled={busy !== null} onClick={() => run("send", () => send({ data: { businessId, taxYear, fraud: collectHmrcFraudData() } }), () => { toast.success("Figures sent to HMRC"); void hist.refetch(); })}>
                {busy === "send" ? "Sending…" : "1. Send figures to HMRC"}</Button>
              <Button variant="outline" className="h-11 sm:h-10" disabled={busy !== null} onClick={() => run("calc", () => calculate({ data: { businessId, taxYear, fraud: collectHmrcFraudData() } }), (r) => { if (!("error" in r)) setCalc({ id: r.calculationId, type: r.type, calc: r.calc }); })}>
                {busy === "calc" ? "Calculating…" : "2. Get HMRC's calculation"}</Button>
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
              {hist.data!.map((h) => <li key={h.id}>{new Date(h.submitted_at).toLocaleString("en-GB")} · {h.kind === "final" ? "Final declaration" : "Figures sent"}{h.is_sandbox ? " (sandbox)" : ""}</li>)}
            </ul>
          )}
          {s.canPost && <Button variant="ghost" size="sm" className="w-fit" disabled={busy !== null} onClick={() => run("drop", () => drop({ data: { businessId } }), () => qc.invalidateQueries({ queryKey: ["itsa-status", businessId] }))}>Disconnect HMRC</Button>}
        </div>
      )}
    </section>
  );
}
