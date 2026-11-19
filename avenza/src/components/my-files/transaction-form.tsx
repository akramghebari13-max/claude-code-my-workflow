import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { friendlyError, todayUK } from "@/lib/app";
import { DOC_TYPES, formatPence, parseMoneyToPence, monthStartISO } from "@/lib/myfiles";
import { extractionSchema, sanitizeExtraction } from "@/lib/myfiles-extraction";
import type {
  PersonalCategory,
  PersonalDocument,
  PersonalTransaction,
} from "@/lib/myfiles-queries";
import type { PostgrestSingleResponse } from "@supabase/supabase-js";

export const selectClass =
  "h-11 w-full rounded-md border border-input bg-background px-3 text-base md:text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

type Props = {
  categories: PersonalCategory[];
  transaction?: PersonalTransaction;
  document?: PersonalDocument;
  onSaved: () => void;
  preview?: React.ReactNode;
  actions?: React.ReactNode;
  busy?: boolean;
};

export function TransactionForm({
  categories,
  transaction,
  document,
  onSaved,
  preview,
  actions,
  busy = false,
}: Props) {
  const parsed = extractionSchema.safeParse(
    document?.extracted && typeof document.extracted === "object"
      ? Object.fromEntries(
          Object.entries(document.extracted).filter(([key]) => key !== "category_id"),
        )
      : null,
  );
  const extraction = parsed.success ? sanitizeExtraction(parsed.data, categories) : null;
  const [kind, setKind] = useState(transaction?.kind ?? extraction?.kind ?? "expense");
  const [date, setDate] = useState(transaction?.txn_date ?? extraction?.txn_date ?? todayUK());
  const initialAmount = transaction?.amount_pence ?? extraction?.amount_pence;
  const [amount, setAmount] = useState(
    initialAmount ? formatPence(initialAmount).replace("£", "").replaceAll(",", "") : "",
  );
  const [merchant, setMerchant] = useState(transaction?.merchant ?? extraction?.merchant ?? "");
  const [description, setDescription] = useState(
    transaction?.description ?? extraction?.description ?? "",
  );
  const [category, setCategory] = useState(
    transaction?.category_id ?? extraction?.category_id ?? "",
  );
  const [incomeType, setIncomeType] = useState(
    transaction?.income_type ?? extraction?.income_type ?? "salary",
  );
  const [docType, setDocType] = useState(extraction?.doc_type ?? document?.doc_type ?? "other");
  const qc = useQueryClient();
  const mutation = useMutation({
    mutationFn: async () => {
      monthStartISO(date);
      const amountPence = parseMoneyToPence(amount);
      if (
        kind === "expense" &&
        !categories.some(
          (item) =>
            item.id === category && (!item.archived || item.id === transaction?.category_id),
        )
      )
        throw new Error("Choose an expense category");
      const row = {
        txn_date: date,
        kind,
        amount_pence: amountPence,
        merchant: merchant.trim() || null,
        description: description.trim() || null,
        category_id: kind === "expense" ? category : null,
        income_type: kind === "income" ? incomeType : null,
      };
      if (document) {
        // Generated RPC types omit SQL argument nullability. Preserve the real nullable contract.
        type ConfirmArgs = {
          _document_id: string;
          _txn_date: string;
          _kind: string;
          _amount_pence: number;
          _merchant: string | null;
          _description: string | null;
          _category_id: string | null;
          _income_type: string | null;
          _doc_type: string;
        };
        const confirm = supabase.rpc.bind(supabase) as unknown as (
          name: "pf_confirm_document",
          args: ConfirmArgs,
        ) => PromiseLike<PostgrestSingleResponse<string>>;
        const { error } = await confirm("pf_confirm_document", {
          _document_id: document.id,
          _txn_date: date,
          _kind: kind,
          _amount_pence: amountPence,
          _merchant: row.merchant,
          _description: row.description,
          _category_id: row.category_id,
          _income_type: row.income_type,
          _doc_type: docType,
        });
        if (error) throw error;
      } else {
        const result = transaction
          ? await supabase
              .from("pf_transactions")
              .update(row)
              .eq("id", transaction.id)
              .select("id")
              .single()
          : await supabase.from("pf_transactions").insert(row).select("id").single();
        if (result.error) throw result.error;
      }
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["my-files"] });
      toast.success(
        `Saved to ${new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(date + "T00:00:00Z"))}`,
      );
      onSaved();
    },
  });
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        mutation.mutate();
      }}
      className="space-y-5"
    >
      {document?.error_message && (
        <p role="alert" className="rounded-md bg-muted p-3 text-sm">
          {document.error_message}
        </p>
      )}
      <div className={preview ? "grid gap-6 md:grid-cols-2" : ""}>
        {preview}
        <fieldset disabled={mutation.isPending} className="min-w-0 space-y-4">
          {extraction?.confidence === "low" && (
            <p className="text-sm text-destructive">
              Please check — the document details are uncertain.
            </p>
          )}
          <div>
            <Label htmlFor="txn-kind">Kind</Label>
            <select
              id="txn-kind"
              className={selectClass}
              value={kind}
              onChange={(event) => {
                setKind(event.target.value);
                setCategory("");
              }}
            >
              <option value="income">Income</option>
              <option value="expense">Expense</option>
              <option value="saving">Saving</option>
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="txn-date">
                Date{document && !extraction?.txn_date ? " · Please check" : ""}
              </Label>
              <Input
                id="txn-date"
                type="date"
                required
                value={date}
                onChange={(event) => setDate(event.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="txn-amount">
                Amount (£){document && !extraction?.amount_pence ? " · Please check" : ""}
              </Label>
              <Input
                id="txn-amount"
                inputMode="decimal"
                required
                placeholder="0.00"
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
              />
            </div>
          </div>
          <div>
            <Label htmlFor="txn-merchant">Merchant / payer</Label>
            <Input
              id="txn-merchant"
              maxLength={120}
              value={merchant}
              onChange={(event) => setMerchant(event.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="txn-description">Description</Label>
            <Textarea
              id="txn-description"
              maxLength={300}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
            />
          </div>
          {kind === "expense" && (
            <div>
              <Label htmlFor="txn-category">
                Category{document && !extraction?.category_id ? " · Please check" : ""}
              </Label>
              <select
                id="txn-category"
                required
                className={selectClass}
                value={category}
                onChange={(event) => setCategory(event.target.value)}
              >
                <option value="">Choose a category</option>
                {categories
                  .filter((item) => !item.archived || item.id === transaction?.category_id)
                  .map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                      {item.archived ? " (archived)" : ""}
                    </option>
                  ))}
              </select>
            </div>
          )}
          {kind === "income" && (
            <div>
              <Label htmlFor="txn-income-type">Income type</Label>
              <select
                id="txn-income-type"
                className={selectClass}
                value={incomeType}
                onChange={(event) => setIncomeType(event.target.value)}
              >
                <option value="salary">Salary</option>
                <option value="additional">Additional</option>
                <option value="other">Other</option>
              </select>
            </div>
          )}
          {document && (
            <div>
              <Label htmlFor="txn-doc-type">Document type</Label>
              <select
                id="txn-doc-type"
                className={selectClass}
                value={docType}
                onChange={(event) => setDocType(event.target.value)}
              >
                {DOC_TYPES.map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
          )}
        </fieldset>
      </div>
      {mutation.error && (
        <p role="alert" className="text-sm text-destructive">
          {friendlyError(mutation.error)}
        </p>
      )}
      <div className="flex flex-wrap gap-3">
        <Button type="submit" disabled={mutation.isPending || busy}>
          {mutation.isPending ? "Saving…" : document ? "Confirm and save" : "Save transaction"}
        </Button>
        {actions}
      </div>
    </form>
  );
}

export function TransactionDialog({
  open,
  onClose,
  categories,
  transaction,
}: {
  open: boolean;
  onClose: () => void;
  categories: PersonalCategory[];
  transaction?: PersonalTransaction;
}) {
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <DialogContent className="max-h-[100dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{transaction ? "Edit transaction" : "Add a transaction"}</DialogTitle>
          <DialogDescription>Personal income, spending and savings.</DialogDescription>
        </DialogHeader>
        <TransactionForm
          categories={categories}
          {...(transaction ? { transaction } : {})}
          onSaved={onClose}
        />
      </DialogContent>
    </Dialog>
  );
}
