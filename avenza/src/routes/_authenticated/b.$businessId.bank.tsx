import { createFileRoute } from "@tanstack/react-router";
import { friendlyError, useCanPost } from "@/lib/app";
import { useQuery, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { suggestCategory } from "@/lib/categorise.functions";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { accountsQuery, businessQuery, formatPence, parsePounds } from "@/lib/ledger";
import { bankLinesQuery, parseBankCsv } from "@/lib/bank";

export const Route = createFileRoute("/_authenticated/b/$businessId/bank")({
  loader: ({ context, params }) => Promise.all([
    context.queryClient.ensureQueryData(bankLinesQuery(params.businessId)),
    context.queryClient.ensureQueryData(accountsQuery(params.businessId)),
  ]),
  head: () => ({ meta: [{ title: "Bank reconciliation — AVENZA" }, { name: "description", content: "Import bank statements and reconcile them with your books." }] }),
  component: Bank,
});

type Line = Awaited<ReturnType<NonNullable<ReturnType<typeof bankLinesQuery>["queryFn"]>>>[number];

function Bank() {
  const { businessId } = Route.useParams();
  const qc = useQueryClient();
  const { data: lines } = useSuspenseQuery(bankLinesQuery(businessId));
  const { data: rawAccounts } = useSuspenseQuery(accountsQuery(businessId));
  const accounts = rawAccounts.map((a) => ({ ...a, id: a.account_id!, code: a.code ?? "" }));
  const canPost = useCanPost(businessId);
  const banks = accounts.filter((a) => a.account_type === "asset" && !a.archived && /^1[2-3]/.test(a.code));
  const bankOpts = banks.length ? banks : accounts.filter((a) => a.account_type === "asset" && !a.archived);
  const [bankId, setBankId] = useState(bankOpts[0]?.id ?? "");
  const [filter, setFilter] = useState<"unmatched" | "matched" | "excluded">("unmatched");
  const [busy, setBusy] = useState(false);
  const [working, setWorking] = useState<Line | null>(null);
  const refresh = () => Promise.all(["bank-lines", "bank-match", "transactions", "invoices", "journals", "balances", "accounts", "trial-balance"].map((k) => qc.invalidateQueries({ queryKey: [k] })));

  const mine = lines.filter((l) => l.bank_account_id === bankId);
  const shown = mine.filter((l) => l.status === filter);
  const count = (s: string) => mine.filter((l) => l.status === s).length;
  const statementTotal = mine.filter((l) => l.status !== "excluded").reduce((s, l) => s + l.amount_pence, 0);

  async function onFile(f: File) {
    const { lines: parsed, errors } = parseBankCsv(await f.text());
    if (!parsed.length) { toast.error(errors[0] ?? "No lines found"); return; }
    setBusy(true);
    const { data, error } = await supabase.rpc("import_bank_lines", { _business_id: businessId, _bank_account_id: bankId, _lines: parsed });
    setBusy(false);
    if (error) { toast.error(friendlyError(error)); return; }
    toast.success(`Imported ${data} new line${data === 1 ? "" : "s"}${parsed.length - (data ?? 0) ? `, skipped ${parsed.length - (data ?? 0)} already imported` : ""}${errors.length ? `, ${errors.length} unreadable` : ""}`);
    refresh();
  }

  async function act(line: Line, action: string, target?: string, category?: string, vat?: number) {
    const { error } = await supabase.rpc("reconcile_bank_line", { _line_id: line.id, _action: action, _target_id: target ?? null as unknown as string, _category_account_id: category ?? null as unknown as string, _vat_pence: vat ?? 0 });
    if (error) { toast.error(friendlyError(error)); return false; }
    await refresh(); return true;
  }

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold">Bank</h2>
          <p className="text-sm text-muted-foreground">Import a statement (CSV from your online banking) and tick off each line against your books.</p>
        </div>
        <div className="grid w-full gap-2 sm:flex sm:w-auto sm:flex-wrap sm:items-end">
          <div className="sm:min-w-48">
            <Label className="text-xs">Bank account</Label>
            <Select value={bankId} onValueChange={setBankId}>
              <SelectTrigger><SelectValue placeholder="Choose" /></SelectTrigger>
              <SelectContent>{bankOpts.map((a) => <SelectItem key={a.id} value={a.id}>{a.code} {a.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          {canPost && bankId && (
            <Button asChild disabled={busy} className="h-11 w-full focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2 sm:h-10 sm:w-auto"><label className="cursor-pointer">{busy ? "Importing…" : "Import statement (CSV)"}
              <input type="file" accept=".csv,text/csv,text/comma-separated-values,application/vnd.ms-excel,text/plain" className="sr-only" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) onFile(f); }} />
            </label></Button>
          )}
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Stat label="To reconcile" value={String(count("unmatched"))} />
        <Stat label="Reconciled" value={String(count("matched"))} />
        <Stat label="Statement movement" value={formatPence(statementTotal)} />
      </div>

      <div className="mt-6 flex gap-1 overflow-x-auto pb-1">
        {(["unmatched", "matched", "excluded"] as const).map((s) => (
          <Button key={s} size="sm" className="min-h-11 shrink-0 sm:min-h-8" aria-pressed={filter === s} variant={filter === s ? "default" : "outline"} onClick={() => setFilter(s)}>
            {s === "unmatched" ? "To reconcile" : s === "matched" ? "Reconciled" : "Ignored"} ({count(s)})
          </Button>
        ))}
      </div>

      {shown.length === 0 ? (
        <p className="mt-4 rounded-xl border border-dashed bg-card p-8 text-center text-muted-foreground">
          {mine.length === 0 ? "No statement imported for this account yet." : "Nothing here."}
        </p>
      ) : (
        <ul className="mt-4 grid gap-3 sm:block sm:divide-y sm:rounded-xl sm:border sm:bg-card">
          {shown.map((l) => (
            <li key={l.id} className="grid gap-2 rounded-xl border bg-card px-4 py-3 sm:rounded-none sm:border-0 sm:flex sm:items-center sm:justify-between">
              <div className="min-w-0">
                <p className="truncate font-medium">{l.description}</p>
                <p className="text-xs text-muted-foreground">{new Date(l.line_date).toLocaleDateString("en-GB")}</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span className={"mr-auto font-mono sm:mr-0 " + (l.amount_pence > 0 ? "text-primary" : "")}><span className="sr-only">{l.amount_pence > 0 ? "Money in " : "Money out "}</span>{l.amount_pence > 0 ? "+" : "−"}{formatPence(Math.abs(l.amount_pence))}</span>
                {canPost && l.status === "unmatched" && <>
                  <Button size="sm" className="min-h-11 sm:min-h-8" onClick={() => setWorking(l)}>Reconcile</Button>
                  <Button size="sm" variant="ghost" className="min-h-11 sm:min-h-8" onClick={() => act(l, "exclude")}>Ignore</Button>
                </>}
                {canPost && l.status === "excluded" && <Button size="sm" variant="ghost" className="min-h-11 sm:min-h-8" onClick={() => act(l, "unexclude")}>Restore</Button>}
              </div>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-6 text-xs text-muted-foreground">On a phone: download the CSV from your banking app or website, then tap Import and choose it from Files or Downloads. Automatic bank feeds (Open Banking) are coming; until then, download a CSV from your bank. Re-importing the same file is safe — lines already imported are skipped.</p>
      {working && <ReconcileDialog businessId={businessId} line={working} onClose={() => setWorking(null)} act={act} />}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return <div className="rounded-xl border bg-card p-4"><p className="text-xs text-muted-foreground">{label}</p><p className="font-mono text-xl">{value}</p></div>;
}

function ReconcileDialog({ businessId, line, onClose, act }: { businessId: string; line: Line; onClose: () => void; act: (l: Line, a: string, t?: string, c?: string, v?: number) => Promise<boolean> }) {
  const { data: cands = [], isLoading } = useQuery({ queryKey: ["bank-match", line.id], queryFn: async () => {
    const { data, error } = await supabase.rpc("bank_match_candidates", { _line_id: line.id });
    if (error) throw error; return data;
  } });
  const { data: rawAccounts } = useSuspenseQuery(accountsQuery(businessId));
  const accounts = rawAccounts.map((a) => ({ ...a, id: a.account_id!, code: a.code ?? "" }));
  const { data: b } = useSuspenseQuery(businessQuery(businessId));
  const isIn = line.amount_pence > 0;
  const cats = accounts.filter((a) => !a.archived && a.account_type === (isIn ? "income" : "expense"));
  const [cat, setCat] = useState("");
  const [vat, setVat] = useState("");
  const suggest = useServerFn(suggestCategory);
  const [hint, setHint] = useState<"history" | "ai" | null>(null);
  useEffect(() => {
    let live = true;
    suggest({ data: { lineId: line.id } }).then((r) => {
      if (live && r.categoryId) { setCat((c) => c || r.categoryId!); setHint(r.source); }
    }).catch(() => {});
    return () => { live = false; };
  }, [line.id]);
  const noInputVat = !isIn && (!b?.vat_registered || b?.vat_scheme === "flat_rate");
  const done = async (p: Promise<boolean>) => { if (await p) { toast.success("Reconciled"); onClose(); } };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{line.description}</DialogTitle></DialogHeader>
        <p className="font-mono text-lg">{isIn ? "+" : "−"}{formatPence(Math.abs(line.amount_pence))} · {new Date(line.line_date).toLocaleDateString("en-GB")}</p>

        <section>
          <h3 className="text-sm font-semibold">Suggested matches</h3>
          {isLoading ? <p className="mt-2 text-sm text-muted-foreground">Searching all your records…</p> : cands.length === 0 ? <p className="mt-2 text-sm text-muted-foreground">No recorded money or unpaid invoice matches this amount.</p> : (
            <ul className="mt-2 divide-y rounded-lg border">
              {cands.map((c) => (
                <li key={c.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 px-3 py-2 text-sm">
                  <span className="min-w-0 truncate">{c.label} · {c.match_date ? new Date(c.match_date).toLocaleDateString("en-GB") : ""}</span>
                  <Button size="sm" className="min-h-11 sm:min-h-8" onClick={() => done(act(line, c.kind, c.id))}>{c.kind === "invoice" ? "Mark paid" : "Match"}</Button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="space-y-3">
          <h3 className="text-sm font-semibold">Or record it as new money {isIn ? "in" : "out"}</h3>
          <div>
            <Label>Category</Label>
            <Select value={cat} onValueChange={setCat}>
              <SelectTrigger><SelectValue placeholder="Choose a category" /></SelectTrigger>
              <SelectContent>{cats.map((a) => <SelectItem key={a.id} value={a.id}>{a.code} {a.name}</SelectItem>)}</SelectContent>
            </Select>
            {hint && cat && <p className="mt-1 text-xs text-muted-foreground">{hint === "history" ? "Suggested from how you've recorded this before." : "Suggested by AI — check it's right."}</p>}
          </div>
          <div>
            <Label>VAT included (£)</Label>
            <Input inputMode="decimal" value={noInputVat ? "0" : vat} disabled={noInputVat} onChange={(e) => setVat(e.target.value)} placeholder="0.00" />
            {noInputVat && <p className="mt-1 text-xs text-muted-foreground">No VAT can be reclaimed on purchases for this business.</p>}
          </div>
          <Button className="w-full" disabled={!cat} onClick={() => {
            const v = noInputVat || vat.trim() === "" ? 0 : parsePounds(vat);
            if (v === null) { toast.error("Enter VAT as pounds and pence"); return; }
            done(act(line, "new", undefined, cat, v));
          }}>Record and reconcile</Button>
        </section>
      </DialogContent>
    </Dialog>
  );
}
