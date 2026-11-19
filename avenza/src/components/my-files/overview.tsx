import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { Button } from "@/components/ui/button";
import { formatPence } from "@/lib/myfiles";
import type { PersonalTransaction } from "@/lib/myfiles-queries";

// Keep the presentation contract small and independent of Query internals.
export type OverviewData = {
  summary: {
    income_pence: number;
    expense_pence: number;
    saving_pence: number;
    remaining_pence: number;
  };
  totals: { category_id: string; name: string; total_pence: number }[];
  series: { month: string; income_pence: number; expense_pence: number }[];
  recent: PersonalTransaction[];
};
export function Activity({ transactions }: { transactions: PersonalTransaction[] }) {
  return (
    <ul className="divide-y">
      {transactions.map((transaction) => (
        <li
          key={transaction.id}
          className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 py-3"
        >
          <div className="min-w-0">
            <p className="break-words font-medium">
              {transaction.merchant || transaction.description || transaction.kind}
            </p>
            <p className="text-xs text-muted-foreground">
              {transaction.txn_date} · {transaction.kind}
            </p>
          </div>
          <span className="shrink-0 font-mono text-sm">
            {formatPence(transaction.amount_pence)}
          </span>
        </li>
      ))}
    </ul>
  );
}
export function Overview({
  data,
  onUpload,
  onAdd,
}: {
  data: OverviewData;
  onUpload: () => void;
  onAdd: () => void;
}) {
  const stats: [string, number][] = [
    ["Income", data.summary.income_pence],
    ["Expenses", data.summary.expense_pence],
    ["Savings", data.summary.saving_pence],
    ["Remaining", data.summary.remaining_pence],
  ];
  const maximum = Math.max(1, ...data.totals.map((category) => category.total_pence));
  return (
    <div className="space-y-8">
      <div className="grid grid-cols-1 gap-3 min-[360px]:grid-cols-2 lg:grid-cols-4">
        {stats.map(([name, value]) => (
          <div key={name} className="min-w-0 rounded-lg border bg-card p-4">
            <p className="text-sm text-muted-foreground">{name}</p>
            <p className="mt-2 break-all font-mono text-xl font-semibold">{formatPence(value)}</p>
          </div>
        ))}
      </div>
      {!data.recent.length && (
        <section className="border-y py-8">
          <h2 className="text-2xl font-semibold">Your personal finances, in one place</h2>
          <p className="mt-2 text-muted-foreground">No activity yet.</p>
          <div className="mt-4 flex flex-wrap gap-3">
            <Button onClick={onUpload}>Upload your first document</Button>
            <Button variant="outline" onClick={onAdd}>
              Add a transaction
            </Button>
          </div>
        </section>
      )}
      <div className="grid gap-8 lg:grid-cols-2">
        <section>
          <h2 className="mb-4 text-xl font-semibold">Where your money went</h2>
          {data.totals.length ? (
            <ul className="space-y-4">
              {data.totals.map((category) => (
                <li key={category.category_id}>
                  <div className="mb-1 grid grid-cols-[minmax(0,1fr)_auto] gap-3 text-sm">
                    <span className="min-w-0 break-words">{category.name}</span>
                    <span className="shrink-0 font-mono">{formatPence(category.total_pence)}</span>
                  </div>
                  <meter
                    min={0}
                    max={maximum}
                    value={category.total_pence}
                    aria-label={`${category.name} spending`}
                    className="h-3 w-full accent-primary"
                  />
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-muted-foreground">No expenses this month.</p>
          )}
        </section>
        <section>
          <h2 className="mb-4 text-xl font-semibold">Income vs expenses · six months</h2>
          <div
            className="h-64 w-full"
            role="img"
            aria-label="Income and expense chart; exact amounts are listed below"
          >
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.series}>
                <XAxis
                  dataKey="month"
                  tickFormatter={(value: string) => value.slice(0, 7)}
                  tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                />
                <YAxis hide />
                <Tooltip
                  formatter={(value: number) => formatPence(value)}
                  contentStyle={{
                    background: "var(--card)",
                    borderColor: "var(--border)",
                    color: "var(--foreground)",
                  }}
                />
                <Legend />
                <Bar dataKey="income_pence" name="Income" fill="var(--primary)" />
                <Bar dataKey="expense_pence" name="Expenses" fill="var(--accent)" />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <caption className="sr-only">Six-month income and expense totals</caption>
              <thead>
                <tr className="text-left">
                  <th className="py-2">Month</th>
                  <th>Income</th>
                  <th>Expenses</th>
                </tr>
              </thead>
              <tbody>
                {data.series.map((month) => (
                  <tr key={month.month}>
                    <th scope="row" className="py-1 text-left font-normal">
                      {month.month.slice(0, 7)}
                    </th>
                    <td>{formatPence(month.income_pence)}</td>
                    <td>{formatPence(month.expense_pence)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
      <section className="border-t pt-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-xl font-semibold">Recent activity</h2>
          <Button variant="outline" onClick={onAdd}>
            Add a transaction
          </Button>
        </div>
        {data.recent.length ? (
          <Activity transactions={data.recent} />
        ) : (
          <p className="mt-4 text-muted-foreground">Your saved transactions will appear here.</p>
        )}
      </section>
    </div>
  );
}
