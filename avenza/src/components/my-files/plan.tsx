import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Archive, Pencil, RotateCcw, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { friendlyError, todayUK } from "@/lib/app";
import { formatPence, parseMoneyToPence } from "@/lib/myfiles";
import {
  formatDay,
  formatMonth,
  onTrackStatement,
  projectSaved,
  savingSuggestions,
  targetMonth,
} from "@/lib/myfiles-plan";
import type {
  PersonalBudget,
  PersonalCategory,
  PersonalGoal,
  PlanData,
} from "@/lib/myfiles-queries";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
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

type Status = PlanData["budgetStatus"][number];
const OVERALL = "overall";

function BudgetBar({ s }: { s: Status }) {
  const over = s.spent_pence > s.limit_pence;
  return (
    <div>
      <div className="grid min-w-0 gap-1 text-sm sm:flex sm:flex-wrap sm:items-baseline sm:justify-between sm:gap-x-3">
        <span className="min-w-0 break-words font-medium">{s.name ?? "Overall spending"}</span>
        <span className={over ? "font-semibold text-destructive" : "text-muted-foreground"}>
          {formatPence(s.spent_pence)} of {formatPence(s.limit_pence)}, {s.percentage}%
          {over ? " — over budget" : s.percentage >= 80 ? " — nearly used" : ""}
        </span>
      </div>
      <Progress
        className="mt-1"
        value={Math.min(100, s.percentage)}
        aria-label={`${s.name ?? "Overall spending"} budget ${s.percentage}% used`}
      />
    </div>
  );
}

export function BudgetsCompact({ status, onAll }: { status: Status[]; onAll: () => void }) {
  return (
    <section className="rounded-lg border bg-card p-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-xl font-semibold">Budgets this month</h2>
        <Button variant="ghost" size="sm" onClick={onAll}>
          Budgets &amp; goals
        </Button>
      </div>
      {status.length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">No budgets set yet.</p>
      ) : (
        <div className="mt-3 space-y-3">
          {status.map((s) => (
            <BudgetBar key={s.budget_id} s={s} />
          ))}
        </div>
      )}
    </section>
  );
}

function BudgetDialog({
  budget,
  categories,
  budgets,
  onClose,
}: {
  budget?: PersonalBudget | undefined;
  categories: PersonalCategory[];
  budgets: PersonalBudget[];
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const taken = new Set(
    budgets.filter((b) => b.id !== budget?.id).map((b) => b.category_id ?? OVERALL),
  );
  const all: [string, string][] = [
    [OVERALL, "Overall monthly spending"],
    ...categories
      .filter((c) => !c.archived || c.id === budget?.category_id)
      .map((c): [string, string] => [c.id, c.name]),
  ];
  const options = all.filter(([k]) => !taken.has(k));
  const [target, setTarget] = useState(
    budget ? (budget.category_id ?? OVERALL) : (options[0]?.[0] ?? ""),
  );
  const [limit, setLimit] = useState(budget ? (budget.monthly_limit_pence / 100).toFixed(2) : "");
  const save = useMutation({
    mutationFn: async () => {
      if (!target) throw new Error("Choose a category for this budget");
      const row = {
        category_id: target === OVERALL ? null : target,
        monthly_limit_pence: parseMoneyToPence(limit),
      };
      const r = budget
        ? await supabase.from("pf_budgets").update(row).eq("id", budget.id).select("id").single()
        : await supabase.from("pf_budgets").insert(row).select("id").single();
      if (r.error) throw r.error;
    },
    onSuccess: async () => {
      toast.success("Budget saved");
      await qc.invalidateQueries({ queryKey: ["my-files"] });
      onClose();
    },
    onError: (e) => toast.error(friendlyError(e)),
  });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{budget ? "Edit budget" : "Set a budget"}</DialogTitle>
          <DialogDescription>
            A monthly spending limit. You get a notification at 80% and again when you go over.
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
            <Label htmlFor="budget-category">Applies to</Label>
            <Select value={target} onValueChange={setTarget}>
              <SelectTrigger id="budget-category">
                <SelectValue placeholder="Every category has a budget" />
              </SelectTrigger>
              <SelectContent>
                {options.map(([k, l]) => (
                  <SelectItem key={k} value={k}>
                    {l}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-1">
            <Label htmlFor="budget-limit">Monthly limit (£)</Label>
            <Input
              id="budget-limit"
              inputMode="decimal"
              value={limit}
              onChange={(e) => setLimit(e.target.value)}
              placeholder="0.00"
            />
          </div>
          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={save.isPending}>
              {save.isPending ? "Saving…" : "Save budget"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function GoalDialog({ goal, onClose }: { goal?: PersonalGoal | undefined; onClose: () => void }) {
  const qc = useQueryClient();
  const [name, setName] = useState(goal?.name ?? "");
  const [target, setTarget] = useState(goal ? (goal.target_pence / 100).toFixed(2) : "");
  const [start, setStart] = useState(goal ? (goal.starting_pence / 100).toFixed(2) : "0");
  const [date, setDate] = useState(goal?.target_date ?? "");
  const save = useMutation({
    mutationFn: async () => {
      const trimmed = name.trim();
      if (!trimmed || trimmed.length > 80)
        throw new Error("Choose a goal name between 1 and 80 characters");
      const starting =
        start.trim() === "" || /^0+(\.0{1,2})?$/.test(start.trim()) ? 0 : parseMoneyToPence(start);
      const row = {
        name: trimmed,
        target_pence: parseMoneyToPence(target),
        starting_pence: starting,
        target_date: date || null,
      };
      const r = goal
        ? await supabase.from("pf_goals").update(row).eq("id", goal.id).select("id").single()
        : await supabase.from("pf_goals").insert(row).select("id").single();
      if (r.error) throw r.error;
    },
    onSuccess: async () => {
      toast.success("Goal saved");
      await qc.invalidateQueries({ queryKey: ["my-files"] });
      onClose();
    },
    onError: (e) => toast.error(friendlyError(e)),
  });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{goal ? "Edit goal" : "New savings goal"}</DialogTitle>
          <DialogDescription>
            Saved so far = the starting amount plus savings you add to this goal.
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
            <Label htmlFor="goal-name">Name</Label>
            <Input
              id="goal-name"
              maxLength={80}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div className="grid gap-1">
            <Label htmlFor="goal-target">Target (£)</Label>
            <Input
              id="goal-target"
              inputMode="decimal"
              value={target}
              onChange={(e) => setTarget(e.target.value)}
              placeholder="0.00"
            />
          </div>
          <div className="grid gap-1">
            <Label htmlFor="goal-start">Already saved (£)</Label>
            <Input
              id="goal-start"
              inputMode="decimal"
              value={start}
              onChange={(e) => setStart(e.target.value)}
            />
          </div>
          <div className="grid gap-1">
            <Label htmlFor="goal-date">Target date (optional)</Label>
            <Input
              id="goal-date"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>
          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={save.isPending}>
              {save.isPending ? "Saving…" : "Save goal"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function AddToGoalDialog({
  goal,
  onClose,
}: {
  goal: { goal_id: string; name: string };
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(todayUK());
  const save = useMutation({
    mutationFn: async () => {
      const r = await supabase
        .from("pf_transactions")
        .insert({
          kind: "saving",
          amount_pence: parseMoneyToPence(amount),
          txn_date: date,
          goal_id: goal.goal_id,
          description: `Added to ${goal.name}`.slice(0, 300),
        })
        .select("id")
        .single();
      if (r.error) throw r.error;
    },
    onSuccess: async () => {
      toast.success(`Added to ${goal.name}`);
      await qc.invalidateQueries({ queryKey: ["my-files"] });
      onClose();
    },
    onError: (e) => toast.error(friendlyError(e)),
  });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add to {goal.name}</DialogTitle>
          <DialogDescription>
            Records a saving in your transactions, counted towards this goal.
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
            <Label htmlFor="add-amount">Amount (£)</Label>
            <Input
              id="add-amount"
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.00"
            />
          </div>
          <div className="grid gap-1">
            <Label htmlFor="add-date">Date</Label>
            <Input
              id="add-date"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>
          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={save.isPending}>
              {save.isPending ? "Saving…" : "Add saving"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function BudgetsGoals({
  plan,
  categories,
}: {
  plan: PlanData;
  categories: PersonalCategory[];
}) {
  const qc = useQueryClient();
  const today = todayUK();
  const [budgetDialog, setBudgetDialog] = useState<{ budget?: PersonalBudget } | null>(null);
  const [goalDialog, setGoalDialog] = useState<{ goal?: PersonalGoal } | null>(null);
  const [adding, setAdding] = useState<{ goal_id: string; name: string } | null>(null);
  const act = useMutation({
    mutationFn: async (
      a: { type: "deleteBudget"; id: string } | { type: "archive"; id: string; archived: boolean },
    ) => {
      const r =
        a.type === "deleteBudget"
          ? await supabase.from("pf_budgets").delete().eq("id", a.id).select("id").single()
          : await supabase
              .from("pf_goals")
              .update({ archived: a.archived })
              .eq("id", a.id)
              .select("id")
              .single();
      if (r.error) throw r.error;
      return a;
    },
    onSuccess: async (a) => {
      toast.success(
        a.type === "deleteBudget"
          ? "Budget removed"
          : a.archived
            ? "Goal archived"
            : "Goal restored",
      );
      await qc.invalidateQueries({ queryKey: ["my-files"] });
    },
    onError: (e) => toast.error(friendlyError(e)),
  });
  const suggestions = savingSuggestions(plan.thisMonthCategories, plan.previousCategories);
  const archived = plan.goals.filter((g) => g.archived);
  return (
    <div className="space-y-10">
      <section className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-2xl font-semibold">Budgets</h2>
            <p className="text-sm text-muted-foreground">
              {formatMonth(today.slice(0, 7) + "-01")} so far.
            </p>
          </div>
          <Button onClick={() => setBudgetDialog({})}>Set a budget</Button>
        </div>
        {plan.budgetStatus.length === 0 ? (
          <p className="rounded-lg border border-dashed p-6 text-center text-muted-foreground">
            No budgets yet. Set an overall limit or one for a category.
          </p>
        ) : (
          <ul className="grid gap-3">
            {plan.budgetStatus.map((s) => {
              const budget = plan.budgets.find((b) => b.id === s.budget_id);
              return (
                <li key={s.budget_id} className="rounded-lg border bg-card p-4">
                  <BudgetBar s={s} />
                  <div className="mt-2 flex gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => budget && setBudgetDialog({ budget })}
                    >
                      <Pencil className="mr-1 h-4 w-4" />
                      Edit
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={act.isPending}
                      onClick={() => act.mutate({ type: "deleteBudget", id: s.budget_id })}
                    >
                      <Trash2 className="mr-1 h-4 w-4" />
                      Remove
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-2xl font-semibold">Savings goals</h2>
            <p className="text-sm text-muted-foreground">
              Projections use your average saving over the last 3 complete months. They are
              estimates.
            </p>
          </div>
          <Button onClick={() => setGoalDialog({})}>New goal</Button>
        </div>
        {plan.goalProgress.length === 0 ? (
          <p className="rounded-lg border border-dashed p-6 text-center text-muted-foreground">
            No goals yet.
          </p>
        ) : (
          <ul className="grid gap-4">
            {plan.goalProgress.map((g) => {
              const goal = plan.goals.find((x) => x.id === g.goal_id);
              const reach = targetMonth(
                g.saved_pence,
                g.target_pence,
                g.avg_monthly_saving_pence,
                today,
              );
              return (
                <li key={g.goal_id} className="rounded-lg border bg-card p-4">
                  <div className="grid min-w-0 gap-2 sm:flex sm:flex-wrap sm:items-baseline sm:justify-between">
                    <h3 className="min-w-0 break-words text-lg font-semibold">{g.name}</h3>
                    <span className="text-sm">
                      {formatPence(g.saved_pence)} of {formatPence(g.target_pence)}, {g.percentage}%
                    </span>
                  </div>
                  <Progress
                    className="mt-2"
                    value={Math.min(100, g.percentage)}
                    aria-label={`${g.name} ${g.percentage}% saved`}
                  />
                  {g.target_date && (
                    <p className="mt-2 text-xs text-muted-foreground">
                      Target date {formatDay(g.target_date)}
                    </p>
                  )}
                  <p className="mt-2 text-sm">{onTrackStatement(g, today)}</p>
                  <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1 text-sm sm:grid-cols-4">
                    <dt className="text-muted-foreground">Average a month</dt>
                    <dd className="font-mono">{formatPence(g.avg_monthly_saving_pence)}</dd>
                    {[3, 6, 12].map((n) => (
                      <div key={n} className="contents">
                        <dt className="text-muted-foreground">In {n} months</dt>
                        <dd className="font-mono">
                          {formatPence(projectSaved(g.saved_pence, g.avg_monthly_saving_pence, n))}
                        </dd>
                      </div>
                    ))}
                    <dt className="text-muted-foreground">Target reached</dt>
                    <dd>{reach ? formatMonth(reach) : "Not at the current rate"}</dd>
                  </dl>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      onClick={() => setAdding({ goal_id: g.goal_id, name: g.name })}
                    >
                      Add to goal
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => goal && setGoalDialog({ goal })}
                    >
                      <Pencil className="mr-1 h-4 w-4" />
                      Edit
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={act.isPending}
                      onClick={() => act.mutate({ type: "archive", id: g.goal_id, archived: true })}
                    >
                      <Archive className="mr-1 h-4 w-4" />
                      Archive
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
        {archived.length > 0 && (
          <div>
            <h3 className="text-sm font-semibold text-muted-foreground">Archived goals</h3>
            <ul className="mt-2 divide-y rounded-lg border">
              {archived.map((g) => (
                <li
                  key={g.id}
                  className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 px-4 py-2 text-sm"
                >
                  <span className="min-w-0 break-words">
                    {g.name}{" "}
                    <Badge variant="secondary" className="ml-1">
                      Archived
                    </Badge>
                  </span>
                  <Button
                    className="shrink-0"
                    size="sm"
                    variant="ghost"
                    disabled={act.isPending}
                    onClick={() => act.mutate({ type: "archive", id: g.id, archived: false })}
                  >
                    <RotateCcw className="mr-1 h-4 w-4" />
                    Restore
                  </Button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-2xl font-semibold">Ways to save more</h2>
        <p className="text-sm text-muted-foreground">
          Estimates worked out from your own spending only.
        </p>
        {suggestions.length === 0 ? (
          <p className="text-sm text-muted-foreground">No expenses recorded this month yet.</p>
        ) : (
          <ul className="grid gap-2">
            {suggestions.map((s) => (
              <li key={s.categoryId} className="rounded-lg border bg-card p-3 text-sm">
                {s.text}
              </li>
            ))}
          </ul>
        )}
      </section>
      {budgetDialog && (
        <BudgetDialog
          budget={budgetDialog.budget}
          budgets={plan.budgets}
          categories={categories}
          onClose={() => setBudgetDialog(null)}
        />
      )}
      {goalDialog && <GoalDialog goal={goalDialog.goal} onClose={() => setGoalDialog(null)} />}
      {adding && <AddToGoalDialog goal={adding} onClose={() => setAdding(null)} />}
    </div>
  );
}
