import { createFileRoute, Link } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { businessQuery, formatPence } from "@/lib/ledger";
import { JURISDICTION_LABEL } from "@/lib/businesses";

const invoiceQuery = (id: string) => queryOptions({
  queryKey: ["invoice", id],
  queryFn: async () => {
    const { data, error } = await supabase.from("invoices")
      .select("*, customers(name, address, email), invoice_lines(*), credit_notes(*)").eq("id", id).maybeSingle();
    if (error) throw error;
    return data;
  },
});

export const Route = createFileRoute("/_authenticated/b/$businessId/invoices_/$invoiceId")({
  loader: ({ context, params }) => Promise.all([
    context.queryClient.ensureQueryData(invoiceQuery(params.invoiceId)),
    context.queryClient.ensureQueryData(businessQuery(params.businessId)),
  ]),
  head: () => ({ meta: [{ title: "Invoice — AVENZA" }, { name: "description", content: "Printable VAT invoice or credit note." }] }),
  component: InvoiceView,
});

const d = (s: string) => new Date(s).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });

function InvoiceView() {
  const { businessId, invoiceId } = Route.useParams();
  const { data: inv } = useSuspenseQuery(invoiceQuery(invoiceId));
  const { data: b } = useSuspenseQuery(businessQuery(businessId));
  const [showCn, setShowCn] = useState(false);
  if (!inv || !b) return <p>Invoice not found.</p>;
  const lines = [...inv.invoice_lines].sort((x, y) => x.position - y.position);
  const cn = inv.credit_notes;
  const asCn = showCn && !!cn;
  const title = asCn ? "Credit note" : inv.status === "void" ? "Cancelled invoice" : b.vat_registered ? "VAT invoice" : "Invoice";
  return (
    <div>
      <div className="mb-4 flex justify-between print:hidden">
        <Link to="/b/$businessId/invoices" params={{ businessId }} className="text-sm text-muted-foreground hover:text-foreground">← Invoices</Link>
        <div className="flex gap-2">
          {cn && <Button variant="outline" size="sm" onClick={() => setShowCn(!showCn)}>{asCn ? "Show invoice" : `Show credit note ${cn.credit_number}`}</Button>}
          <Button variant="outline" size="sm" onClick={() => window.print()}>Print / save PDF</Button>
        </div>
      </div>
      <article className="mx-auto max-w-3xl rounded-xl border bg-card p-8 text-sm">
        <header className="flex flex-wrap justify-between gap-6">
          <div>
            <h2 className="text-3xl font-semibold">{title}</h2>
            <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 font-mono text-xs">
              {asCn && cn ? <>
                <dt className="text-muted-foreground">Number</dt><dd>{cn.credit_number}</dd>
                <dt className="text-muted-foreground">Date</dt><dd>{d(cn.credit_date)}</dd>
                <dt className="text-muted-foreground">Original invoice</dt><dd>{inv.invoice_number} of {d(inv.issue_date)}</dd>
                {cn.reason && <><dt className="text-muted-foreground">Reason</dt><dd className="font-sans">{cn.reason}</dd></>}
                <dt className="text-muted-foreground">Amount credited</dt><dd>{formatPence(cn.net_pence + cn.vat_pence)}{cn.vat_pence ? ` (VAT ${formatPence(cn.vat_pence)})` : ""}</dd>
              </> : <>
                <dt className="text-muted-foreground">Number</dt><dd>{inv.invoice_number}</dd>
                <dt className="text-muted-foreground">Date / tax point</dt><dd>{d(inv.issue_date)}</dd>
                <dt className="text-muted-foreground">Due</dt><dd>{d(inv.due_date)}</dd>
              </>}
            </dl>
          </div>
          <div className="text-right">
            <p className="font-semibold">{b.name}</p>
            <p className="whitespace-pre-line text-muted-foreground">{b.address}</p>
            {b.vat_registered && <p className="mt-1 font-mono text-xs">VAT reg. no. {b.vat_number}</p>}
          </div>
        </header>
        <section className="mt-8">
          <p className="text-xs uppercase tracking-wider text-muted-foreground">Bill to</p>
          <p className="font-semibold">{inv.customers?.name}</p>
          <p className="whitespace-pre-line text-muted-foreground">{inv.customers?.address}</p>
        </section>
        <table className="mt-8 w-full">
          <thead><tr className="border-b text-left text-xs text-muted-foreground">
            <th className="py-2">Description</th><th className="py-2 text-right">Qty</th><th className="py-2 text-right">Unit price</th>
            {b.vat_registered && <th className="py-2 text-right">VAT</th>}<th className="py-2 text-right">Amount (ex VAT)</th>
          </tr></thead>
          <tbody className="font-mono">
            {lines.map((l) => (
              <tr key={l.id} className="border-b">
                <td className="py-2 font-sans">{l.description}</td>
                <td className="py-2 text-right">{Number(l.quantity)}</td>
                <td className="py-2 text-right">{formatPence(l.unit_pence)}</td>
                {b.vat_registered && <td className="py-2 text-right">{l.vat_rate_bp / 100}%</td>}
                <td className="py-2 text-right">{formatPence(Math.round(Number(l.quantity) * l.unit_pence))}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <dl className="ml-auto mt-4 grid w-64 grid-cols-2 gap-1 font-mono">
          <dt>Total ex VAT</dt><dd className="text-right">{formatPence(inv.net_pence)}</dd>
          {b.vat_registered && <><dt>VAT</dt><dd className="text-right">{formatPence(inv.vat_pence)}</dd></>}
          <dt className="font-semibold">Total due</dt><dd className="text-right font-semibold">{formatPence(inv.net_pence + inv.vat_pence)}</dd>
        </dl>
        {inv.notes && <p className="mt-6 whitespace-pre-line text-muted-foreground">{inv.notes}</p>}
        {b.business_type === "limited_company" && (
          <footer className="mt-10 border-t pt-4 text-xs text-muted-foreground">
            {b.name} is a company registered in {b.registered_in ? JURISDICTION_LABEL[b.registered_in] : "—"}, number {b.company_number}. Registered office: {b.address?.replace(/\n/g, ", ")}.
          </footer>
        )}
      </article>
    </div>
  );
}
