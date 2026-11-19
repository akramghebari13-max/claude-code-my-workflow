import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { addMonthsISO } from "./myfiles";
import type { Database } from "@/integrations/supabase/types";

export type PersonalDocument = Database["public"]["Tables"]["pf_documents"]["Row"];
export type PersonalTransaction = Database["public"]["Tables"]["pf_transactions"]["Row"];
export type PersonalCategory = Database["public"]["Tables"]["pf_categories"]["Row"];

async function pages<T>(
  load: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>,
): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += 500) {
    const { data, error } = await load(from, from + 499);
    if (error) throw error;
    rows.push(...(data ?? []));
    if (!data || data.length < 500) return rows;
  }
}

export const personalQuery = (userId: string, month: string) =>
  queryOptions({
    queryKey: ["my-files", userId, month],
    queryFn: async () => {
      const { error } = await supabase.rpc("pf_ensure_defaults");
      if (error) throw error;
      const [categories, documents, transactions, recent, summary, totals, series] =
        await Promise.all([
          pages<PersonalCategory>((from, to) =>
            supabase
              .from("pf_categories")
              .select("*")
              .order("sort_order")
              .order("id")
              .range(from, to),
          ),
          pages<PersonalDocument>((from, to) =>
            supabase
              .from("pf_documents")
              .select("*")
              .order("created_at", { ascending: false })
              .order("id")
              .range(from, to),
          ),
          pages<PersonalTransaction>((from, to) =>
            supabase
              .from("pf_transactions")
              .select("*")
              .gte("txn_date", month)
              .lt("txn_date", addMonthsISO(month, 1))
              .order("txn_date", { ascending: false })
              .order("id")
              .range(from, to),
          ),
          supabase
            .from("pf_transactions")
            .select("*")
            .order("txn_date", { ascending: false })
            .order("created_at", { ascending: false })
            .limit(8),
          supabase.rpc("pf_month_summary", { _month: month }),
          supabase.rpc("pf_month_categories", { _month: month }),
          supabase.rpc("pf_monthly_series", { _months: 6 }),
        ]);
      for (const result of [recent, summary, totals, series]) if (result.error) throw result.error;
      return {
        categories,
        documents,
        transactions,
        recent: recent.data ?? [],
        summary: summary.data?.[0] ?? {
          income_pence: 0,
          expense_pence: 0,
          saving_pence: 0,
          remaining_pence: 0,
        },
        totals: totals.data ?? [],
        series: series.data ?? [],
      };
    },
    refetchInterval: (query) =>
      query.state.data?.documents.some((document) => document.status === "processing")
        ? 3000
        : false,
  });

export const documentUrlQuery = (userId: string, document: PersonalDocument) =>
  queryOptions({
    queryKey: ["my-files-preview", userId, document.id],
    queryFn: async () => {
      const { data, error } = await supabase.storage
        .from("my-files")
        .createSignedUrl(document.storage_path, 60);
      if (error) throw error;
      return data.signedUrl;
    },
    staleTime: 30000,
    refetchInterval: 45000,
  });

export type PersonalBill = Database["public"]["Tables"]["pf_bills"]["Row"];
export type PersonalBudget = Database["public"]["Tables"]["pf_budgets"]["Row"];
export type PersonalGoal = Database["public"]["Tables"]["pf_goals"]["Row"];
export type PersonalNotification = Database["public"]["Tables"]["pf_notifications"]["Row"];

/**
 * Bills, budgets, goals and notifications for the current UK month. Each fetch first runs the
 * idempotent pf_refresh_notifications, so every ["my-files"] invalidation (load, document
 * confirmed, bill paid, transaction saved) also refreshes notifications.
 */
export const planQuery = (userId: string, currentMonth: string) =>
  queryOptions({
    queryKey: ["my-files", userId, "plan", currentMonth],
    queryFn: async () => {
      const refreshed = await supabase.rpc("pf_refresh_notifications");
      if (refreshed.error) throw refreshed.error;
      const [bills, budgets, goals, status, progress, notifications, thisMonth, m1, m2, m3] =
        await Promise.all([
          supabase.from("pf_bills").select("*").order("next_due_date").order("id").limit(500),
          supabase.from("pf_budgets").select("*").order("created_at").limit(200),
          supabase.from("pf_goals").select("*").order("created_at").order("id").limit(200),
          supabase.rpc("pf_budget_status", { _month: currentMonth }),
          supabase.rpc("pf_goal_progress"),
          supabase
            .from("pf_notifications")
            .select("*")
            .order("created_at", { ascending: false })
            .order("id")
            .limit(50),
          supabase.rpc("pf_month_categories", { _month: currentMonth }),
          supabase.rpc("pf_month_categories", { _month: addMonthsISO(currentMonth, -1) }),
          supabase.rpc("pf_month_categories", { _month: addMonthsISO(currentMonth, -2) }),
          supabase.rpc("pf_month_categories", { _month: addMonthsISO(currentMonth, -3) }),
        ]);
      for (const r of [
        bills,
        budgets,
        goals,
        status,
        progress,
        notifications,
        thisMonth,
        m1,
        m2,
        m3,
      ])
        if (r.error) throw r.error;
      return {
        bills: bills.data ?? [],
        budgets: budgets.data ?? [],
        goals: goals.data ?? [],
        budgetStatus: status.data ?? [],
        goalProgress: progress.data ?? [],
        notifications: notifications.data ?? [],
        thisMonthCategories: thisMonth.data ?? [],
        previousCategories: [m1.data ?? [], m2.data ?? [], m3.data ?? []],
      };
    },
  });
export type PlanData = Awaited<ReturnType<NonNullable<ReturnType<typeof planQuery>["queryFn"]>>>;
