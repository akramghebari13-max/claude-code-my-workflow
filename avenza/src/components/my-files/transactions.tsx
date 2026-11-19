import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Pencil, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { friendlyError } from "@/lib/app";
import { formatPence } from "@/lib/myfiles";
import type { PersonalTransaction } from "@/lib/myfiles-queries";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { selectClass } from "./transaction-form";
import { Label } from "@/components/ui/label";

export function Transactions({
  transactions,
  kind,
  onKind,
  onEdit,
  onAdd,
}: {
  transactions: PersonalTransaction[];
  kind: string;
  onKind: (kind: string) => void;
  onEdit: (transaction: PersonalTransaction) => void;
  onAdd: () => void;
}) {
  const [deleting, setDeleting] = useState<PersonalTransaction | null>(null);
  const qc = useQueryClient();
  const remove = useMutation({
    mutationFn: async (transaction: PersonalTransaction) => {
      const { error } = await supabase
        .from("pf_transactions")
        .delete()
        .eq("id", transaction.id)
        .select("id")
        .single();
      if (error) throw error;
    },
    onSuccess: async () => {
      setDeleting(null);
      await qc.invalidateQueries({ queryKey: ["my-files"] });
      toast.success("Transaction deleted");
    },
  });
  const filtered = transactions.filter(
    (transaction) => kind === "all" || transaction.kind === kind,
  );
  const dates = [...new Set(filtered.map((transaction) => transaction.txn_date))];
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="w-48">
          <Label htmlFor="kind-filter">Kind</Label>
          <select
            id="kind-filter"
            className={selectClass}
            value={kind}
            onChange={(event) => onKind(event.target.value)}
          >
            <option value="all">All</option>
            <option value="income">Income</option>
            <option value="expense">Expense</option>
            <option value="saving">Saving</option>
          </select>
        </div>
        <Button onClick={onAdd}>Add a transaction</Button>
      </div>
      {!filtered.length && (
        <p className="py-10 text-center text-muted-foreground">
          No transactions for this month and filter.
        </p>
      )}
      {dates.map((date) => (
        <section key={date}>
          <h2 className="mb-2 text-sm font-semibold text-muted-foreground">{date}</h2>
          <ul className="divide-y rounded-lg border bg-card">
            {filtered
              .filter((transaction) => transaction.txn_date === date)
              .map((transaction) => (
                <li
                  key={transaction.id}
                  className="grid min-w-0 gap-3 p-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"
                >
                  <div className="min-w-0 flex-1">
                    <p className="break-words font-medium">
                      {transaction.merchant || transaction.description || transaction.kind}
                    </p>
                    <p className="text-sm capitalize text-muted-foreground">{transaction.kind}</p>
                    {transaction.description && (
                      <p className="break-words text-sm text-muted-foreground">
                        {transaction.description}
                      </p>
                    )}
                    {transaction.document_id && (
                      <Badge variant="secondary" className="mt-1">
                        From a document
                      </Badge>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center justify-end gap-1">
                    <span className="mr-2 font-mono text-sm">
                      {formatPence(transaction.amount_pence)}
                    </span>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`Edit ${transaction.merchant ?? "transaction"}`}
                      title="Edit transaction"
                      onClick={() => onEdit(transaction)}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`Delete ${transaction.merchant ?? "transaction"}`}
                      title="Delete transaction"
                      onClick={() => setDeleting(transaction)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </li>
              ))}
          </ul>
        </section>
      ))}
      <Dialog
        open={Boolean(deleting)}
        onOpenChange={(open) => {
          if (!open && !remove.isPending) setDeleting(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete transaction?</DialogTitle>
            <DialogDescription>
              This removes the personal transaction, not its document.
            </DialogDescription>
          </DialogHeader>
          {remove.error && (
            <p role="alert" className="text-sm text-destructive">
              {friendlyError(remove.error)}
            </p>
          )}
          <div className="flex gap-3">
            <Button variant="outline" disabled={remove.isPending} onClick={() => setDeleting(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={remove.isPending}
              onClick={() => {
                if (deleting) remove.mutate(deleting);
              }}
            >
              {remove.isPending ? "Deleting…" : "Delete transaction"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
