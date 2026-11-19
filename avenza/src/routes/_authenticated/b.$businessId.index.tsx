import { createFileRoute } from "@tanstack/react-router";
import { friendlyError } from "@/lib/app";
import { useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PAGE, accountsQuery, checkJournal, formatPence, journalSourcesQuery, journalsQuery, parsePounds } from "@/lib/ledger";
import { useCanPost, todayUK } from "@/lib/app";

export const Route = createFileRoute("/_authenticated/b/$businessId/")({
  loader: ({ context, params }) => Promise.all([
    context.queryClient.ensureQueryData(journalsQuery(params.businessId)),
    context.queryClient.ensureQueryData(accountsQuery(params.businessId)),
  ]),
  head: () => ({ meta: [{ title: "Journals — AVENZA" }, { name: "description", content: "Every entry posted to your books." }] }),
  component: Journals,
});

function Journals() {
  const { businessId } = Route.useParams();
  const [limit, setLimit] = useState(PAGE);
  const { data: rows } = useSuspenseQuery(journalsQuery(businessId, limit));
  const journals = rows.slice(0, limit);
  const { data: sources } = useSuspenseQuery(journalSourcesQuery(businessId));
  const canPost = useCanPost(businessId);
  const qc = useQueryClient();
  const reversed = new Set(journals.map((j) => j.reverses_id).filter(Boolean));

  async function reverse(id: string) {
    const { error } = await supabase.rpc("reverse_journal", { _entry_id: id });
    if (error) { toast.error(friendlyError(error)); return; }
    toast.success("Reversing journal posted");
    qc.invalidateQueries({ queryKey: ["journals", businessId] });
    qc.invalidateQueries({ queryKey: ["accounts", businessId] });
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-2xl font-semibold">Journals</h2>
        {canPost && <NewJournal businessId={businessId} />}
      </div>
      {journals.length === 0 ? (
        <p className="mt-8 rounded-xl border border-dashed bg-card p-8 text-center text-muted-foreground">No journals yet. Post your first one to start your books.</p>
      ) : (
        <ul className="mt-6 grid gap-3">
          {journals.map((j) => (
            <li key={j.id} className="rounded-xl border bg-card p-4">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <div>
                  <span className="font-mono text-xs text-muted-foreground">#{j.entry_number} · {new Date(j.entry_date).toLocaleDateString("en-GB")}</span>
                  <p className="font-medium">{j.description}{j.reference && <span className="text-muted-foreground"> · {j.reference}</span>}</p>
                </div>
                {sources.has(j.id) && <span className="text-xs text-muted-foreground">Automatic · {sources.get(j.id) === "money" ? "Money in & out" : sources.get(j.id) === "vat" ? "VAT return" : "Invoices"}</span>}
                {canPost && !j.reverses_id && !reversed.has(j.id) && !sources.has(j.id) && (
                  <Button variant="ghost" size="sm" onClick={() => reverse(j.id)}>Reverse</Button>
                )}
                {reversed.has(j.id) && <span className="text-xs text-muted-foreground">Reversed</span>}
              </div>
              <table className="mt-3 w-full font-mono text-sm">
                <tbody>
                  {j.journal_lines.map((l) => (
                    <tr key={l.id} className="border-t">
                      <td className="py-1 pr-2">{l.accounts?.code} {l.accounts?.name}</td>
                      <td className="py-1 text-right">{l.debit_pence ? formatPence(l.debit_pence) : ""}</td>
                      <td className="py-1 text-right">{l.credit_pence ? formatPence(l.credit_pence) : ""}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </li>
          ))}
        </ul>
      )}
      {rows.length > limit && <Button variant="outline" className="mt-4 w-full" onClick={() => setLimit(limit + PAGE)}>Load more</Button>}
    </div>
  );
}

type Row = { account_id: string; debit: string; credit: string };
const emptyRow = (): Row => ({ account_id: "", debit: "", credit: "" });

function NewJournal({ businessId }: { businessId: string }) {
  const { data: accounts } = useSuspenseQuery(accountsQuery(businessId));
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState(todayUK());
  const [description, setDescription] = useState("");
  const [reference, setReference] = useState("");
  const [rows, setRows] = useState<Row[]>([emptyRow(), emptyRow()]);
  const [busy, setBusy] = useState(false);

  const parsed = rows.map((r) => ({ account_id: r.account_id, debit_pence: parsePounds(r.debit), credit_pence: parsePounds(r.credit) }));
  const invalid = parsed.some((p) => p.debit_pence === null || p.credit_pence === null);
  const lines = parsed.map((p) => ({ account_id: p.account_id, debit_pence: p.debit_pence ?? 0, credit_pence: p.credit_pence ?? 0 }));
  const check = checkJournal(lines);
  const dr = lines.reduce((s, l) => s + l.debit_pence, 0);
  const cr = lines.reduce((s, l) => s + l.credit_pence, 0);

  const set = (i: number, patch: Partial<Row>) => setRows(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (invalid) { toast.error("Amounts must be in pounds and pence, e.g. 120.50"); return; }
    if (!check.ok) { toast.error(check.reason); return; }
    setBusy(true);
    const { error } = await supabase.rpc("post_journal", {
      _business_id: businessId, _entry_date: date, _description: description, _reference: reference,
      _lines: lines.filter((l) => l.account_id && (l.debit_pence || l.credit_pence)),
    });
    setBusy(false);
    if (error) { toast.error(friendlyError(error)); return; }
    toast.success("Journal posted");
    setOpen(false); setDescription(""); setReference(""); setRows([emptyRow(), emptyRow()]);
    qc.invalidateQueries({ queryKey: ["journals", businessId] });
    qc.invalidateQueries({ queryKey: ["accounts", businessId] });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button>New journal</Button></DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader><DialogTitle>New journal</DialogTitle></DialogHeader>
        <form onSubmit={submit} className="grid gap-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="grid gap-1.5"><Label htmlFor="jd">Date</Label><Input id="jd" type="date" value={date} onChange={(e) => setDate(e.target.value)} required /></div>
            <div className="grid gap-1.5 sm:col-span-2"><Label htmlFor="jdesc">Description</Label><Input id="jdesc" value={description} onChange={(e) => setDescription(e.target.value)} required /></div>
          </div>
          <div className="grid gap-1.5"><Label htmlFor="jref">Reference (optional)</Label><Input id="jref" value={reference} onChange={(e) => setReference(e.target.value)} /></div>
          <div className="grid gap-2">
            <div className="grid grid-cols-[1fr_6rem_6rem] gap-2 text-xs font-medium text-muted-foreground"><span>Account</span><span className="text-right">Debit £</span><span className="text-right">Credit £</span></div>
            {rows.map((r, i) => (
              <div key={i} className="grid grid-cols-[1fr_6rem_6rem] gap-2">
                <Select value={r.account_id} onValueChange={(v) => set(i, { account_id: v })}>
                  <SelectTrigger aria-label={`Line ${i + 1} account`}><SelectValue placeholder="Choose account" /></SelectTrigger>
                  <SelectContent>
                    {accounts.filter((a) => !a.archived).map((a) => <SelectItem key={a.account_id!} value={a.account_id!}>{a.code} {a.name}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Input aria-label={`Line ${i + 1} debit`} inputMode="decimal" className="text-right font-mono" value={r.debit} onChange={(e) => set(i, { debit: e.target.value, credit: e.target.value ? "" : r.credit })} />
                <Input aria-label={`Line ${i + 1} credit`} inputMode="decimal" className="text-right font-mono" value={r.credit} onChange={(e) => set(i, { credit: e.target.value, debit: e.target.value ? "" : r.debit })} />
              </div>
            ))}
            <Button type="button" variant="ghost" size="sm" className="justify-self-start" onClick={() => setRows([...rows, emptyRow()])}>+ Add line</Button>
            <div className="grid grid-cols-[1fr_6rem_6rem] gap-2 border-t pt-2 font-mono text-sm">
              <span className={check.ok ? "text-primary" : "text-destructive"}>{check.ok ? "Balanced" : check.reason}</span>
              <span className="text-right">{formatPence(dr)}</span><span className="text-right">{formatPence(cr)}</span>
            </div>
          </div>
          <Button type="submit" disabled={busy || !check.ok || invalid}>Post journal</Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
