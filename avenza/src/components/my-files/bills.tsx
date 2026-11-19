import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { friendlyError, todayUK } from "@/lib/app";
import { formatPence, parseMoneyToPence } from "@/lib/myfiles";
import {
  BILL_FREQUENCIES,
  advanceDue,
  anchorFor,
  formatDay,
  paidMessage,
  upcomingBills,
  type BillFrequency,
} from "@/lib/myfiles-plan";
import type { PersonalBill, PersonalCategory } from "@/lib/myfiles-queries";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

const frequencyLabel = (f: string) => BILL_FREQUENCIES.find(([k]) => k === f)?.[1] ?? f;

/** Per-bill pending state, so one slow payment never disables another bill's button. */
function useMarkPaid() {
  const qc = useQueryClient();
  const [busy, setBusy] = useState<ReadonlySet<string>>(new Set());
  const mutation = useMutation({
    mutationFn: async (bill: PersonalBill) => {
      const { error } = await supabase.rpc("pf_mark_bill_paid", {
        _bill_id: bill.id,
        _paid_date: todayUK(),
        _due_date: bill.next_due_date,
      });
      if (error) throw error;
      return paidMessage(
        bill.amount_pence,
        advanceDue(bill.next_due_date, bill.frequency as BillFrequency, bill.anchor_day),
      );
    },
    onMutate: (bill) => setBusy((s) => new Set(s).add(bill.id)),
    onSuccess: (message) => toast.success(message),
    onError: (error) => toast.error(friendlyError(error)),
    onSettled: async (_r, _e, bill) => {
      setBusy((s) => {
        const next = new Set(s);
        next.delete(bill.id);
        return next;
      });
      await qc.invalidateQueries({ queryKey: ["my-files"] });
    },
  });
  return {
    pay: (bill: PersonalBill) => mutation.mutate(bill),
    isBusy: (id: string) => busy.has(id),
  };
}

function DueText({ bill, today }: { bill: PersonalBill; today: string }) {
  const overdue = bill.active && bill.next_due_date < today;
  return (
    <span className={overdue ? "font-semibold text-destructive" : undefined}>
      {overdue
        ? `Overdue — was due ${formatDay(bill.next_due_date)}`
        : `Due ${formatDay(bill.next_due_date)}`}
    </span>
  );
}

export function UpcomingBills({ bills, onAll }: { bills: PersonalBill[]; onAll: () => void }) {
  const today = todayUK();
  const list = upcomingBills(bills, today);
  const { pay, isBusy } = useMarkPaid();
  return (
    <section className="rounded-lg border bg-card p-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-xl font-semibold">Upcoming bills</h2>
        <Button variant="ghost" size="sm" onClick={onAll}>
          All bills
        </Button>
      </div>
      {list.length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">No bills due in the next 30 days.</p>
      ) : (
        <ul className="mt-2 divide-y">
          {list.map((bill) => (
            <li key={bill.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
              <div className="min-w-0">
                <p className="break-words font-medium">
                  {bill.overdue && (
                    <Badge variant="destructive" className="mr-2">
                      Overdue
                    </Badge>
                  )}
                  {bill.name}
                </p>
                <p className="text-xs text-muted-foreground">
                  {formatPence(bill.amount_pence)} · <DueText bill={bill} today={today} />
                </p>
              </div>
              <Button size="sm" disabled={isBusy(bill.id)} onClick={() => pay(bill)}>
                {isBusy(bill.id) ? "Saving…" : "Mark as paid"}
              </Button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

type Draft = {
  name: string;
  amount: string;
  frequency: BillFrequency;
  due: string;
  categoryId: string;
};

function BillDialog({
  open,
  bill,
  categories,
  onClose,
}: {
  open: boolean;
  bill?: PersonalBill | undefined;
  categories: PersonalCategory[];
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const usable = categories.filter((c) => !c.archived || c.id === bill?.category_id);
  const [draft, setDraft] = useState<Draft>(() => ({
    name: bill?.name ?? "",
    amount: bill ? (bill.amount_pence / 100).toFixed(2) : "",
    frequency: (bill?.frequency as BillFrequency | undefined) ?? "monthly",
    due: bill?.next_due_date ?? todayUK(),
    categoryId: bill?.category_id ?? "",
  }));
  const save = useMutation({
    mutationFn: async () => {
      const name = draft.name.trim();
      if (!name || name.length > 80)
        throw new Error("Choose a bill name between 1 and 80 characters");
      const amount_pence = parseMoneyToPence(draft.amount);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(draft.due)) throw new Error("Choose the next due date");
      if (!draft.categoryId) throw new Error("Choose an expense category");
      const row = {
        name,
        amount_pence,
        frequency: draft.frequency,
        next_due_date: draft.due,
        anchor_day: anchorFor(draft.frequency, draft.due),
        category_id: draft.categoryId,
      };
      const result = bill
        ? await supabase.from("pf_bills").update(row).eq("id", bill.id).select("id").single()
        : await supabase.from("pf_bills").insert(row).select("id").single();
      if (result.error) throw result.error;
    },
    onSuccess: async () => {
      toast.success(bill ? "Bill updated" : "Bill added");
      await qc.invalidateQueries({ queryKey: ["my-files"] });
      onClose();
    },
    onError: (error) => toast.error(friendlyError(error)),
  });
  const set = (patch: Partial<Draft>) => setDraft((d) => ({ ...d, ...patch }));
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{bill ? "Edit bill" : "Add a bill"}</DialogTitle>
          <DialogDescription>
            Monthly, quarterly and yearly bills keep the same day of the month; short months use
            their last day.
          </DialogDescription>
        </DialogHeader>
        <form
          className="grid gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            save.mutate();
          }}
        >
          <div className="grid gap-1">
            <Label htmlFor="bill-name">Name</Label>
            <Input
              id="bill-name"
              maxLength={80}
              value={draft.name}
              onChange={(e) => set({ name: e.target.value })}
            />
          </div>
          <div className="grid gap-1">
            <Label htmlFor="bill-amount">Amount (£)</Label>
            <Input
              id="bill-amount"
              inputMode="decimal"
              value={draft.amount}
              onChange={(e) => set({ amount: e.target.value })}
              placeholder="0.00"
            />
          </div>
          <div className="grid gap-1">
            <Label htmlFor="bill-frequency">How often</Label>
            <Select
              value={draft.frequency}
              onValueChange={(v) => set({ frequency: v as BillFrequency })}
            >
              <SelectTrigger id="bill-frequency">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {BILL_FREQUENCIES.map(([k, l]) => (
                  <SelectItem key={k} value={k}>
                    {l}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-1">
            <Label htmlFor="bill-due">Next due date</Label>
            <Input
              id="bill-due"
              type="date"
              value={draft.due}
              onChange={(e) => set({ due: e.target.value })}
            />
          </div>
          <div className="grid gap-1">
            <Label htmlFor="bill-category">Category</Label>
            <Select value={draft.categoryId} onValueChange={(v) => set({ categoryId: v })}>
              <SelectTrigger id="bill-category">
                <SelectValue placeholder="Choose a category" />
              </SelectTrigger>
              <SelectContent>
                {usable.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={save.isPending}>
              {save.isPending ? "Saving…" : "Save bill"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function Bills({
  bills,
  categories,
}: {
  bills: PersonalBill[];
  categories: PersonalCategory[];
}) {
  const qc = useQueryClient();
  const today = todayUK();
  const { pay, isBusy } = useMarkPaid();
  const [editing, setEditing] = useState<PersonalBill | undefined>();
  const [open, setOpen] = useState(false);
  const [deleting, setDeleting] = useState<PersonalBill | null>(null);
  const update = useMutation({
    mutationFn: async (
      action:
        | { type: "active"; bill: PersonalBill; active: boolean }
        | { type: "delete"; bill: PersonalBill },
    ) => {
      const result =
        action.type === "active"
          ? await supabase
              .from("pf_bills")
              .update({ active: action.active })
              .eq("id", action.bill.id)
              .select("id")
              .single()
          : await supabase.from("pf_bills").delete().eq("id", action.bill.id).select("id").single();
      if (result.error) throw result.error;
      return action;
    },
    onSuccess: async (action) => {
      toast.success(
        action.type === "delete"
          ? "Bill deleted; payments already recorded are kept."
          : action.active
            ? "Bill turned back on"
            : "Bill turned off",
      );
      setDeleting(null);
      await qc.invalidateQueries({ queryKey: ["my-files"] });
    },
    onError: (error) => toast.error(friendlyError(error)),
  });
  const category = (id: string) => categories.find((c) => c.id === id)?.name ?? "Category";
  const sorted = [...bills].sort(
    (a, b) => Number(b.active) - Number(a.active) || a.next_due_date.localeCompare(b.next_due_date),
  );
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold">Bills</h2>
          <p className="text-sm text-muted-foreground">
            Marking a bill as paid records it as an expense and moves it to its next due date.
          </p>
        </div>
        <Button
          onClick={() => {
            setEditing(undefined);
            setOpen(true);
          }}
        >
          Add a bill
        </Button>
      </div>
      {sorted.length === 0 ? (
        <p className="rounded-lg border border-dashed p-8 text-center text-muted-foreground">
          No bills yet. Add rent, council tax, phone or anything else you pay regularly.
        </p>
      ) : (
        <ul className="grid gap-3">
          {sorted.map((bill) => (
            <li
              key={bill.id}
              className="grid gap-3 rounded-lg border bg-card p-4 sm:flex sm:items-center sm:justify-between"
            >
              <div className="min-w-0">
                <p className="break-words font-medium">
                  {bill.name}
                  {!bill.active && (
                    <Badge variant="secondary" className="ml-2">
                      Off
                    </Badge>
                  )}
                  {bill.active && bill.next_due_date < today && (
                    <Badge variant="destructive" className="ml-2">
                      Overdue
                    </Badge>
                  )}
                </p>
                <p className="text-sm text-muted-foreground">
                  {formatPence(bill.amount_pence)} · {frequencyLabel(bill.frequency)} ·{" "}
                  {category(bill.category_id)}
                </p>
                <p className="text-sm">
                  {bill.active ? <DueText bill={bill} today={today} /> : "Not active"}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {bill.active && (
                  <Button size="sm" disabled={isBusy(bill.id)} onClick={() => pay(bill)}>
                    {isBusy(bill.id) ? "Saving…" : "Mark as paid"}
                  </Button>
                )}
                <label className="flex items-center gap-2 text-sm">
                  <Switch
                    checked={bill.active}
                    disabled={update.isPending}
                    aria-label={`${bill.name} active`}
                    onCheckedChange={(active) => update.mutate({ type: "active", bill, active })}
                  />
                  Active
                </label>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`Edit ${bill.name}`}
                  title="Edit bill"
                  onClick={() => {
                    setEditing(bill);
                    setOpen(true);
                  }}
                >
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`Delete ${bill.name}`}
                  title="Delete bill"
                  onClick={() => setDeleting(bill)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
      {open && (
        <BillDialog
          key={editing?.id ?? "new"}
          open={open}
          bill={editing}
          categories={categories}
          onClose={() => {
            setOpen(false);
            setEditing(undefined);
          }}
        />
      )}
      <AlertDialog open={Boolean(deleting)} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {deleting?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              The bill and its reminders stop. Payments you already recorded stay in your
              transactions.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={update.isPending}
              onClick={(e) => {
                e.preventDefault();
                if (deleting) update.mutate({ type: "delete", bill: deleting });
              }}
            >
              Delete bill
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
