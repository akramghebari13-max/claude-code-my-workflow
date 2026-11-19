import { createFileRoute } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { accountsQuery, formatPence } from "@/lib/ledger";

export const Route = createFileRoute("/_authenticated/b/$businessId/trial-balance")({
  loader: ({ context, params }) => context.queryClient.ensureQueryData(accountsQuery(params.businessId)),
  head: () => ({ meta: [{ title: "Trial balance — AVENZA" }, { name: "description", content: "Debits and credits for every account." }] }),
  component: TrialBalance,
});

function TrialBalance() {
  const { businessId } = Route.useParams();
  const { data } = useSuspenseQuery(accountsQuery(businessId));
  const rows = data.map((a) => ({ ...a, net: (a.debit_pence ?? 0) - (a.credit_pence ?? 0) })).filter((a) => a.net !== 0);
  const dr = rows.reduce((s, r) => s + Math.max(r.net, 0), 0);
  const cr = rows.reduce((s, r) => s + Math.max(-r.net, 0), 0);
  return (
    <div>
      <h2 className="text-2xl font-semibold">Trial balance</h2>
      <div className="mt-6 overflow-x-auto rounded-xl border bg-card">
        <table className="w-full font-mono text-sm">
          <thead><tr className="border-b text-left text-xs text-muted-foreground"><th className="p-3">Account</th><th className="p-3 text-right">Debit</th><th className="p-3 text-right">Credit</th></tr></thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan={3} className="p-6 text-center text-muted-foreground">Nothing posted yet.</td></tr>}
            {rows.map((r) => (
              <tr key={r.account_id} className="border-b">
                <td className="p-3">{r.code} {r.name}</td>
                <td className="p-3 text-right">{r.net > 0 ? formatPence(r.net) : ""}</td>
                <td className="p-3 text-right">{r.net < 0 ? formatPence(-r.net) : ""}</td>
              </tr>
            ))}
          </tbody>
          <tfoot><tr className="font-semibold"><td className="p-3">Total {dr === cr ? "· balanced" : "· OUT OF BALANCE"}</td><td className="p-3 text-right">{formatPence(dr)}</td><td className="p-3 text-right">{formatPence(cr)}</td></tr></tfoot>
        </table>
      </div>
    </div>
  );
}
