import { createFileRoute, Link } from "@tanstack/react-router";
import { addDays, friendlyError, todayUK, useCanPost } from "@/lib/app";
import { useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PAGE, VAT_RATES, accountsQuery, customersQuery, formatPence, invoiceTotals, invoicesQuery, parsePounds } from "@/lib/ledger";
import { Textarea } from "@/components/ui/textarea";

export const Route = createFileRoute("/_authenticated/b/$businessId/invoices")({
  loader: ({ context, params }) => Promise.all([
    context.queryClient.ensureQueryData(invoicesQuery(params.businessId)),
    context.queryClient.ensureQueryData(customersQuery(params.businessId)),
    context.queryClient.ensureQueryData(accountsQuery(params.businessId)),
  ]),
  head: () => ({ meta: [{ title: "Invoices — AVENZA" }, { name: "description", content: "Create, send and track VAT invoices and credit notes." }] }),
  component: Invoices,
});

const STATUS_LABEL = { draft: "Draft", sent: "Sent", paid: "Paid", void: "Cancelled" } as const;

function Invoices() {
  const { businessId } = Route.useParams();
  const [limit, setLimit] = useState(PAGE);
  const { data: rows } = useSuspenseQuery(invoicesQuery(businessId, limit));
  const invoices = rows.slice(0, limit);
  const { data: accounts } = useSuspenseQuery(accountsQuery(businessId));
  const canPost = useCanPost(businessId);
  const qc = useQueryClient();
  const bank = accounts.find((a) => a.code === "1200")?.account_id;
  const today = todayUK();
  const [crediting, setCrediting] = useState<(typeof invoices)[number] | null>(null);

  const refresh = () => { for (const k of ["invoices", "journals", "accounts", "period-balances", "reconcile-candidates"]) qc.invalidateQueries({ queryKey: [k] }); };
  async function act(fn: "issue_invoice" | "pay_invoice" | "void_invoice", id: string) {
    const { error } = fn === "pay_invoice"
      ? await supabase.rpc("pay_invoice", { _invoice_id: id, _paid_date: today, _bank_account_id: bank! })
      : await supabase.rpc(fn, { _invoice_id: id });
    if (error) { toast.error(friendlyError(error)); return; }
    toast.success(fn === "issue_invoice" ? "Invoice sent and posted" : fn === "pay_invoice" ? "Payment recorded" : "Draft cancelled");
    refresh();
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-2xl font-semibold">Invoices</h2>
        {canPost && <div className="flex gap-2"><NewCustomer businessId={businessId} /><NewInvoice businessId={businessId} /></div>}
      </div>
      {invoices.length === 0 ? (
        <p className="mt-8 rounded-xl border border-dashed bg-card p-8 text-center text-muted-foreground">No invoices yet. Add a customer, then create your first invoice.</p>
      ) : (
        <ul className="mt-6 divide-y rounded-xl border bg-card">
          {invoices.map((i) => {
            const overdue = i.status === "sent" && i.due_date < today;
            return (
              <li key={i.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                <div>
                  <p className="font-medium"><Link to="/b/$businessId/invoices/$invoiceId" params={{ businessId, invoiceId: i.id }} className="font-mono text-sm text-primary underline-offset-4 hover:underline">{i.invoice_number}</Link> · {i.customers?.name}</p>
                  <p className="text-xs text-muted-foreground">Issued {new Date(i.issue_date).toLocaleDateString("en-GB")} · due {new Date(i.due_date).toLocaleDateString("en-GB")}</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant={overdue ? "destructive" : i.status === "paid" ? "default" : "secondary"}>{overdue ? "Overdue" : STATUS_LABEL[i.status]}</Badge>
                  <span className="font-mono">{formatPence(i.net_pence + i.vat_pence)}</span>
                  {canPost && i.status === "draft" && <Button size="sm" onClick={() => act("issue_invoice", i.id)}>Send</Button>}
                  {canPost && i.status === "sent" && <Button size="sm" variant="outline" onClick={() => act("pay_invoice", i.id)}>Mark paid</Button>}
                  {canPost && i.status === "draft" && <Button size="sm" variant="ghost" onClick={() => act("void_invoice", i.id)}>Cancel draft</Button>}
                  {canPost && (i.status === "sent" || i.status === "paid") && <Button size="sm" variant="ghost" onClick={() => setCrediting(i)}>Credit note</Button>}
                  {i.credit_notes && <span className="text-xs text-muted-foreground">Credited {i.credit_notes.credit_number}</span>}
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {rows.length > limit && <Button variant="outline" className="mt-4 w-full" onClick={() => setLimit(limit + PAGE)}>Load more</Button>}
      {crediting && <CreditDialog inv={crediting} bankOptions={accounts.filter((a) => a.account_type === "asset" && !a.archived && /^12/.test(a.code ?? ""))} onClose={() => setCrediting(null)} onDone={refresh} />}
      <Customers businessId={businessId} canEdit={canPost} />
    </div>
  );
}

function CreditDialog({ inv, bankOptions, onClose, onDone }: {
  inv: { id: string; invoice_number: string; issue_date: string; status: string; net_pence: number; vat_pence: number };
  bankOptions: { account_id: string | null; code: string | null; name: string | null }[]; onClose: () => void; onDone: () => void;
}) {
  const [date, setDate] = useState(todayUK());
  const [reason, setReason] = useState("");
  const [refund, setRefund] = useState(inv.status === "paid" ? (bankOptions[0]?.account_id ?? "") : "");
  const [busy, setBusy] = useState(false);
  async function submit(e: FormEvent) {
    e.preventDefault(); setBusy(true);
    const { error } = await supabase.rpc("credit_invoice", { _invoice_id: inv.id, _credit_date: date, _reason: reason, _refund_bank_account_id: (refund || null) as unknown as string });
    setBusy(false);
    if (error) { toast.error(friendlyError(error)); return; }
    toast.success("Credit note raised"); onDone(); onClose();
  }
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>Credit note for {inv.invoice_number}</DialogTitle></DialogHeader>
        <form onSubmit={submit} className="grid gap-3">
          <p className="text-sm">This cancels the full invoice of <span className="font-mono">{formatPence(inv.net_pence + inv.vat_pence)}</span>{inv.vat_pence ? <> (including VAT <span className="font-mono">{formatPence(inv.vat_pence)}</span>, which comes off the VAT return for the period of the credit note date)</> : null}.</p>
          <div className="grid gap-1.5"><Label htmlFor="cnd">Credit note date</Label><Input id="cnd" type="date" min={inv.issue_date} value={date} onChange={(e) => setDate(e.target.value)} required /></div>
          <div className="grid gap-1.5"><Label htmlFor="cnr">Reason</Label><Textarea id="cnr" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Work cancelled" /></div>
          {inv.status === "paid" && (
            <div className="grid gap-1.5"><Label>Refund the customer from</Label>
              <Select value={refund || "none"} onValueChange={(v) => setRefund(v === "none" ? "" : v)}>
                <SelectTrigger aria-label="Refund from"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No refund yet (customer is owed the money)</SelectItem>
                  {bankOptions.map((a) => <SelectItem key={a.account_id!} value={a.account_id!}>{a.code} {a.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}
          <Button type="submit" disabled={busy}>{busy ? "Saving…" : "Raise credit note"}</Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function Customers({ businessId, canEdit }: { businessId: string; canEdit: boolean }) {
  const { data: customers } = useSuspenseQuery(customersQuery(businessId));
  const qc = useQueryClient();
  async function editAddress(id: string, current: string | null) {
    const address = window.prompt("Customer address", current ?? "");
    if (address === null) return;
    const { error } = await supabase.from("customers").update({ address: address.trim() || null }).eq("id", id);
    if (error) { toast.error(friendlyError(error)); return; }
    qc.invalidateQueries({ queryKey: ["customers", businessId] });
  }
  if (!customers.length) return null;
  return (
    <section className="mt-10">
      <h3 className="text-lg font-semibold">Customers</h3>
      <ul className="mt-2 divide-y rounded-xl border bg-card">
        {customers.map((c) => (
          <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2">
            <span>{c.name} <span className="text-xs text-muted-foreground">{c.address || "No address"}</span></span>
            {canEdit && <Button variant="ghost" size="sm" onClick={() => editAddress(c.id, c.address)}>Edit address</Button>}
          </li>
        ))}
      </ul>
    </section>
  );
}

function NewCustomer({ businessId }: { businessId: string }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(""); const [email, setEmail] = useState(""); const [address, setAddress] = useState("");
  async function submit(e: FormEvent) {
    e.preventDefault();
    const { error } = await supabase.from("customers").insert({ business_id: businessId, name: name.trim(), email: email || null, address: address || null });
    if (error) { toast.error(friendlyError(error)); return; }
    toast.success("Customer added"); setOpen(false); setName(""); setEmail(""); setAddress("");
    qc.invalidateQueries({ queryKey: ["customers", businessId] });
  }
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button variant="outline">Add customer</Button></DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>New customer</DialogTitle></DialogHeader>
        <form onSubmit={submit} className="grid gap-3">
          <div className="grid gap-1.5"><Label htmlFor="cn">Name</Label><Input id="cn" value={name} onChange={(e) => setName(e.target.value)} required /></div>
          <div className="grid gap-1.5"><Label htmlFor="ce">Email</Label><Input id="ce" type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></div>
          <div className="grid gap-1.5"><Label htmlFor="ca">Address (needed on VAT invoices)</Label><Input id="ca" value={address} onChange={(e) => setAddress(e.target.value)} required /></div>
          <Button type="submit">Save customer</Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

type Line = { description: string; quantity: string; unit: string; rate: string };
const blank = (): Line => ({ description: "", quantity: "1", unit: "", rate: "2000" });

function NewInvoice({ businessId }: { businessId: string }) {
  const { data: customers } = useSuspenseQuery(customersQuery(businessId));
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [customer, setCustomer] = useState("");
  const [issue, setIssue] = useState(todayUK());
  const [due, setDue] = useState(addDays(todayUK(), 30));
  const [lines, setLines] = useState<Line[]>([blank()]);
  const [busy, setBusy] = useState(false);
  const parsed = lines.map((l) => ({ description: l.description.trim(), quantity: Number(l.quantity), unit_pence: parsePounds(l.unit), vat_rate_bp: Number(l.rate) }));
  const valid = parsed.every((p) => p.description && p.quantity > 0 && p.unit_pence !== null && p.unit_pence > 0);
  const totals = invoiceTotals(parsed.map((p) => ({ ...p, unit_pence: p.unit_pence ?? 0 })));
  const set = (i: number, patch: Partial<Line>) => setLines(lines.map((l, j) => (j === i ? { ...l, ...patch } : l)));

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!customer) { toast.error("Choose a customer"); return; }
    if (!valid) { toast.error("Each line needs a description, quantity and price"); return; }
    setBusy(true);
    const { error } = await supabase.rpc("save_invoice", {
      _business_id: businessId, _invoice_id: null as unknown as string, _customer_id: customer, _issue_date: issue, _due_date: due, _notes: "", _lines: parsed,
    });
    setBusy(false);
    if (error) { toast.error(friendlyError(error)); return; }
    toast.success("Draft invoice saved"); setOpen(false); setLines([blank()]);
    qc.invalidateQueries({ queryKey: ["invoices", businessId] });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button>New invoice</Button></DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader><DialogTitle>New invoice</DialogTitle></DialogHeader>
        {customers.length === 0 ? <p className="text-sm text-muted-foreground">Add a customer first.</p> : (
          <form onSubmit={submit} className="grid gap-4">
            <div className="grid gap-1.5"><Label>Customer</Label>
              <Select value={customer} onValueChange={setCustomer}><SelectTrigger aria-label="Customer"><SelectValue placeholder="Choose customer" /></SelectTrigger>
                <SelectContent>{customers.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent></Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5"><Label htmlFor="id">Issue date</Label><Input id="id" type="date" value={issue} onChange={(e) => setIssue(e.target.value)} /></div>
              <div className="grid gap-1.5"><Label htmlFor="dd">Due date</Label><Input id="dd" type="date" value={due} onChange={(e) => setDue(e.target.value)} /></div>
            </div>
            <div className="grid gap-2">
              {lines.map((l, i) => (
                <div key={i} className="grid grid-cols-2 gap-2 rounded-lg border p-2 sm:grid-cols-[1fr_4rem_6rem_8rem]">
                  <Input aria-label="Description" placeholder="Description" className="col-span-2 sm:col-span-1" value={l.description} onChange={(e) => set(i, { description: e.target.value })} />
                  <Input aria-label="Quantity" inputMode="decimal" value={l.quantity} onChange={(e) => set(i, { quantity: e.target.value })} />
                  <Input aria-label="Unit price" placeholder="£ each" inputMode="decimal" className="font-mono" value={l.unit} onChange={(e) => set(i, { unit: e.target.value })} />
                  <Select value={l.rate} onValueChange={(v) => set(i, { rate: v })}><SelectTrigger aria-label="VAT"><SelectValue /></SelectTrigger>
                    <SelectContent>{VAT_RATES.map((r) => <SelectItem key={r.bp} value={String(r.bp)}>{r.label}</SelectItem>)}</SelectContent></Select>
                </div>
              ))}
              <Button type="button" variant="ghost" size="sm" className="justify-self-start" onClick={() => setLines([...lines, blank()])}>+ Add line</Button>
            </div>
            <dl className="grid grid-cols-2 gap-1 justify-self-end font-mono text-sm">
              <dt>Net</dt><dd className="text-right">{formatPence(totals.net)}</dd>
              <dt>VAT</dt><dd className="text-right">{formatPence(totals.vat)}</dd>
              <dt className="font-semibold">Total</dt><dd className="text-right font-semibold">{formatPence(totals.gross)}</dd>
            </dl>
            <Button type="submit" disabled={busy}>Save draft</Button>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
