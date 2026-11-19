import { createFileRoute } from "@tanstack/react-router";
import { friendlyError, todayUK, useCanPost } from "@/lib/app";
import { useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PAGE, VAT_RATES, accountsQuery, businessQuery, formatPence, moneyTotalsQuery, parsePounds, transactionsQuery, vatFromGross } from "@/lib/ledger";

export const Route = createFileRoute("/_authenticated/b/$businessId/money")({
  loader: ({ context, params }) => Promise.all([
    context.queryClient.ensureQueryData(transactionsQuery(params.businessId)),
    context.queryClient.ensureQueryData(accountsQuery(params.businessId)),
  ]),
  head: () => ({ meta: [{ title: "Money in & out — AVENZA" }, { name: "description", content: "Record income and expenses with receipts." }] }),
  component: Money,
});

async function openReceipt(path: string) {
  const { data, error } = await supabase.storage.from("receipts").createSignedUrl(path, 60);
  if (error || !data) { toast.error("Couldn't open receipt"); return; }
  window.open(data.signedUrl, "_blank", "noopener");
}

function Money() {
  const { businessId } = Route.useParams();
  const [limit, setLimit] = useState(PAGE);
  const { data: rows } = useSuspenseQuery(transactionsQuery(businessId, limit));
  const txns = rows.slice(0, limit);
  const { data: totals } = useSuspenseQuery(moneyTotalsQuery(businessId));
  const canPost = useCanPost(businessId);
  const qc = useQueryClient();
  const totIn = totals.in, totOut = totals.out;
  async function voidTxn(id: string, who: string) {
    if (!window.confirm(`Void "${who}"? This reverses it in your books with today's date. It stays listed as Voided.`)) return;
    const { error } = await supabase.rpc("void_transaction", { _transaction_id: id, _void_date: todayUK() });
    if (error) { toast.error(friendlyError(error)); return; }
    toast.success("Voided");
    for (const k of ["transactions", "journals", "accounts", "bank-lines", "reconcile-candidates", "period-balances"]) qc.invalidateQueries({ queryKey: [k] });
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-2xl font-semibold">Money in &amp; out</h2>
        {canPost && <div className="flex gap-2"><RecordDialog businessId={businessId} direction="in" /><RecordDialog businessId={businessId} direction="out" /></div>}
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3">
        <div className="rounded-xl border bg-card p-4"><p className="text-xs text-muted-foreground">Money in</p><p className="font-mono text-xl">{formatPence(totIn)}</p></div>
        <div className="rounded-xl border bg-card p-4"><p className="text-xs text-muted-foreground">Money out</p><p className="font-mono text-xl">{formatPence(totOut)}</p></div>
      </div>
      {txns.length === 0 ? (
        <p className="mt-8 rounded-xl border border-dashed bg-card p-8 text-center text-muted-foreground">Nothing recorded yet.</p>
      ) : (
        <ul className="mt-6 divide-y rounded-xl border bg-card">
          {txns.map((t) => (
            <li key={t.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
              <div>
                <p className={"font-medium " + (t.voided_at ? "line-through text-muted-foreground" : "")}>{t.counterparty}{t.voided_at && <span className="ml-2 text-xs no-underline">Voided {new Date(t.void_date!).toLocaleDateString("en-GB")}</span>}</p>
                <p className="text-xs text-muted-foreground">{new Date(t.txn_date).toLocaleDateString("en-GB")} · {t.category?.name}{t.vat_pence ? ` · VAT ${formatPence(t.vat_pence)}` : ""}</p>
              </div>
              <div className="flex items-center gap-3">
                {t.receipt_path && <Button variant="ghost" size="sm" onClick={() => openReceipt(t.receipt_path!)}>Receipt</Button>}
                {canPost && !t.voided_at && <Button variant="ghost" size="sm" className="min-h-11 sm:min-h-8" onClick={() => voidTxn(t.id, t.counterparty)}>Void</Button>}
                <span className={"font-mono " + (t.direction === "in" ? "text-primary" : "text-foreground")}><span className="sr-only">{t.direction === "in" ? "Money in " : "Money out "}</span>{t.direction === "in" ? "+" : "−"}{formatPence(t.gross_pence)}</span>
              </div>
            </li>
          ))}
        </ul>
      )}
      {rows.length > limit && <Button variant="outline" className="mt-4 w-full" onClick={() => setLimit(limit + PAGE)}>Load more</Button>}
    </div>
  );
}

function RecordDialog({ businessId, direction }: { businessId: string; direction: "in" | "out" }) {
  const { data: accounts } = useSuspenseQuery(accountsQuery(businessId));
  const { data: biz } = useSuspenseQuery(businessQuery(businessId));
  const noInputVat = direction === "out" && biz?.vat_scheme === "flat_rate";
  const noVat = biz ? !biz.vat_registered : false;
  const qc = useQueryClient();
  const active = accounts.filter((a) => !a.archived);
  const banks = active.filter((a) => a.account_type === "asset" && (a.code === "1200" || a.code === "1210" || a.name?.toLowerCase().includes("bank")));
  const cats = active.filter((a) => direction === "in" ? a.account_type === "income" || a.account_type === "equity" : a.account_type === "expense" || a.account_type === "asset" || a.account_type === "equity");
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState(todayUK());
  const [who, setWho] = useState("");
  const [cat, setCat] = useState("");
  const [bank, setBank] = useState(banks[0]?.account_id ?? "");
  const [amount, setAmount] = useState("");
  const [rate, setRate] = useState("0");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const gross = parsePounds(amount);
  const vat = gross && !noInputVat && !noVat ? vatFromGross(gross, Number(rate)) : 0;

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!gross) { toast.error("Enter an amount, e.g. 49.99"); return; }
    if (!cat || !bank) { toast.error("Choose a category and bank account"); return; }
    setBusy(true);
    let path: string | null = null;
    if (file) {
      path = `${businessId}/${crypto.randomUUID()}-${file.name.replace(/[^\w.-]/g, "_")}`;
      const up = await supabase.storage.from("receipts").upload(path, file);
      if (up.error) { setBusy(false); toast.error("Receipt upload failed: " + friendlyError(up.error)); return; }
    }
    const { error } = await supabase.rpc("record_transaction", {
      _business_id: businessId, _direction: direction, _date: date, _counterparty: who, _description: "",
      _category_account_id: cat, _bank_account_id: bank, _gross_pence: gross, _vat_pence: vat, _receipt_path: path as string,
    });
    setBusy(false);
    if (error) { toast.error(friendlyError(error)); return; }
    toast.success("Recorded and posted to the books");
    setOpen(false); setWho(""); setAmount(""); setFile(null);
    for (const k of ["transactions", "journals", "accounts", "period-balances", "reconcile-candidates"]) qc.invalidateQueries({ queryKey: [k] });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button variant={direction === "in" ? "default" : "outline"}>{direction === "in" ? "Money in" : "Money out"}</Button></DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{direction === "in" ? "Record money in" : "Record money out"}</DialogTitle></DialogHeader>
        <form onSubmit={submit} className="grid gap-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5"><Label htmlFor="d">Date</Label><Input id="d" type="date" value={date} onChange={(e) => setDate(e.target.value)} required /></div>
            <div className="grid gap-1.5"><Label htmlFor="a">Total (inc. VAT) £</Label><Input id="a" inputMode="decimal" className="font-mono" value={amount} onChange={(e) => setAmount(e.target.value)} required /></div>
          </div>
          <div className="grid gap-1.5"><Label htmlFor="w">{direction === "in" ? "Received from" : "Paid to"}</Label><Input id="w" value={who} onChange={(e) => setWho(e.target.value)} required /></div>
          <div className="grid gap-1.5"><Label>Category</Label>
            <Select value={cat} onValueChange={setCat}><SelectTrigger aria-label="Category"><SelectValue placeholder="Choose category" /></SelectTrigger>
              <SelectContent>{cats.map((a) => <SelectItem key={a.account_id!} value={a.account_id!}>{a.code} {a.name}</SelectItem>)}</SelectContent></Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5"><Label>Bank account</Label>
              <Select value={bank} onValueChange={setBank}><SelectTrigger aria-label="Bank account"><SelectValue /></SelectTrigger>
                <SelectContent>{banks.map((a) => <SelectItem key={a.account_id!} value={a.account_id!}>{a.name}</SelectItem>)}</SelectContent></Select>
            </div>
            <div className="grid gap-1.5"><Label>VAT rate</Label>
              <Select value={noInputVat || noVat ? "0" : rate} onValueChange={setRate} disabled={noInputVat || noVat}><SelectTrigger aria-label="VAT rate"><SelectValue /></SelectTrigger>
                <SelectContent>{VAT_RATES.map((r) => <SelectItem key={r.bp} value={String(r.bp)}>{r.label}</SelectItem>)}</SelectContent></Select>
            </div>
          </div>
          {noInputVat && <p className="text-xs text-muted-foreground">On the flat rate scheme you can't reclaim VAT on purchases, so the full amount is the cost.</p>}
          {gross ? <p className="font-mono text-xs text-muted-foreground">Net {formatPence(gross - vat)} · VAT {formatPence(vat)}</p> : null}
          <div className="grid gap-1.5"><Label htmlFor="r">Receipt (optional)</Label><Input id="r" type="file" accept="image/*,application/pdf" onChange={(e) => setFile(e.target.files?.[0] ?? null)} /></div>
          <Button type="submit" disabled={busy}>Save</Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
