/**
 * Pure planning helpers for My Files: bill dates, goal projections, saving suggestions and
 * notification wording. They mirror the pf_ SQL functions exactly; amounts are integer pence.
 */
import { formatPence } from "./myfiles";

export type BillFrequency = "once" | "weekly" | "monthly" | "quarterly" | "yearly";
export const BILL_FREQUENCIES: readonly [BillFrequency, string][] = [
  ["once", "One-off"],
  ["weekly", "Weekly"],
  ["monthly", "Monthly"],
  ["quarterly", "Every 3 months"],
  ["yearly", "Yearly"],
];

function parts(iso: string): [number, number, number] {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) throw new Error("Choose a valid date");
  const y = Number(m[1]),
    mo = Number(m[2]),
    d = Number(m[3]);
  const check = new Date(Date.UTC(y, mo - 1, d));
  if (check.getUTCFullYear() !== y || check.getUTCMonth() !== mo - 1 || check.getUTCDate() !== d)
    throw new Error("Choose a valid date");
  return [y, mo, d];
}
const iso = (y: number, mo: number, d: number) =>
  new Date(Date.UTC(y, mo - 1, d)).toISOString().slice(0, 10);
const daysInMonth = (y: number, mo: number) => new Date(Date.UTC(y, mo, 0)).getUTCDate();

/** The day of month a repeating bill is anchored to (null for one-off and weekly bills). */
export function anchorFor(frequency: BillFrequency, dueISO: string): number | null {
  return frequency === "once" || frequency === "weekly" ? null : parts(dueISO)[2];
}

/** Next due date after `dueISO`; month-based bills clamp to month end without drifting off the anchor. */
export function advanceDue(
  dueISO: string,
  frequency: BillFrequency,
  anchor: number | null,
): string | null {
  const [y, mo, d] = parts(dueISO);
  if (frequency === "once") return null;
  if (frequency === "weekly") return iso(y, mo, d + 7);
  const step = frequency === "monthly" ? 1 : frequency === "quarterly" ? 3 : 12;
  const index = y * 12 + (mo - 1) + step;
  const ny = Math.floor(index / 12),
    nm = (index % 12) + 1;
  return iso(ny, nm, Math.min(anchor ?? d, daysInMonth(ny, nm)));
}

export function daysBetween(fromISO: string, toISO: string): number {
  const [a, b, c] = parts(fromISO),
    [x, y, z] = parts(toISO);
  return Math.round((Date.UTC(x, y - 1, z) - Date.UTC(a, b - 1, c)) / 86400000);
}

/** "5 Dec 2026", the same format the database uses for notification text. */
export function formatDay(isoDate: string): string {
  const [y, mo, d] = parts(isoDate);
  const month = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ][mo - 1];
  return `${d} ${month} ${y}`;
}

export type UpcomingBill = {
  id: string;
  name: string;
  amount_pence: number;
  next_due_date: string;
  active: boolean;
};
/** Active bills due within `days` (inclusive), overdue first, then by due date. */
export function upcomingBills<T extends UpcomingBill>(bills: T[], todayISO: string, days = 30) {
  return bills
    .filter((b) => b.active && daysBetween(todayISO, b.next_due_date) <= days)
    .map((b) => ({ ...b, overdue: b.next_due_date < todayISO }))
    .sort(
      (a, b) =>
        Number(b.overdue) - Number(a.overdue) ||
        a.next_due_date.localeCompare(b.next_due_date) ||
        a.name.localeCompare(b.name),
    );
}

export function paidMessage(amountPence: number, nextDueISO: string | null): string {
  return `Paid ${formatPence(amountPence)}, ${nextDueISO ? `next due ${formatDay(nextDueISO)}` : "no further payments due"}`;
}

export function percentOf(part: number, whole: number): number {
  return whole > 0 ? Math.floor((part * 100) / whole) : 0;
}

/** Saved amount after n months at the average rate. */
export function projectSaved(savedPence: number, avgMonthlyPence: number, months: number): number {
  return savedPence + Math.max(0, avgMonthlyPence) * months;
}

/** Month (YYYY-MM-01) the target is first reached at the average rate, or null if never. */
export function targetMonth(
  savedPence: number,
  targetPence: number,
  avgMonthlyPence: number,
  todayISO: string,
): string | null {
  const [y, mo] = parts(todayISO);
  if (savedPence >= targetPence) return iso(y, mo, 1);
  if (avgMonthlyPence <= 0) return null;
  const n = Math.ceil((targetPence - savedPence) / avgMonthlyPence);
  const index = y * 12 + (mo - 1) + n;
  return iso(Math.floor(index / 12), (index % 12) + 1, 1);
}

export function formatMonth(monthISO: string): string {
  const [y, mo] = parts(monthISO);
  return `${["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"][mo - 1]} ${y}`;
}

/** A factual statement about pace; never a promise. */
export function onTrackStatement(
  g: {
    saved_pence: number;
    target_pence: number;
    target_date: string | null;
    avg_monthly_saving_pence: number;
  },
  todayISO: string,
): string {
  if (g.saved_pence >= g.target_pence) return "Target reached.";
  const when = targetMonth(g.saved_pence, g.target_pence, g.avg_monthly_saving_pence, todayISO);
  if (!when)
    return "Not at the current rate: you have not saved anything in the last 3 complete months.";
  if (!g.target_date)
    return `At your recent average of ${formatPence(g.avg_monthly_saving_pence)} a month, you would reach it around ${formatMonth(when)}.`;
  const due = g.target_date.slice(0, 7) + "-01";
  return when <= due
    ? `On track: at ${formatPence(g.avg_monthly_saving_pence)} a month you would reach it around ${formatMonth(when)}, by your target of ${formatDay(g.target_date)}.`
    : `Behind: at ${formatPence(g.avg_monthly_saving_pence)} a month you would reach it around ${formatMonth(when)}, after your target of ${formatDay(g.target_date)}.`;
}

export type CategoryTotal = { category_id: string; name: string; total_pence: number };
export type Suggestion = {
  categoryId: string;
  name: string;
  thisMonthPence: number;
  averagePence: number;
  tenPercentPence: number;
  text: string;
};
/**
 * Top 3 expense categories this month against their average over the previous 3 complete months.
 * The 10% figure uses the 3-month average when there is one, otherwise this month's spend.
 */
export function savingSuggestions(
  thisMonth: CategoryTotal[],
  previous3: CategoryTotal[][],
): Suggestion[] {
  const sums = new Map<string, number>();
  for (const month of previous3)
    for (const c of month) sums.set(c.category_id, (sums.get(c.category_id) ?? 0) + c.total_pence);
  return [...thisMonth]
    .filter((c) => c.total_pence > 0)
    .sort((a, b) => b.total_pence - a.total_pence || a.name.localeCompare(b.name))
    .slice(0, 3)
    .map((c) => {
      const averagePence = Math.floor((sums.get(c.category_id) ?? 0) / 3);
      const tenPercentPence = Math.floor((averagePence > 0 ? averagePence : c.total_pence) / 10);
      const compare =
        averagePence > 0
          ? `${formatPence(c.total_pence)} so far this month, against a 3-month average of ${formatPence(averagePence)}.`
          : `${formatPence(c.total_pence)} so far this month; no spending here in the previous 3 months.`;
      return {
        categoryId: c.category_id,
        name: c.name,
        thisMonthPence: c.total_pence,
        averagePence,
        tenPercentPence,
        text: `${c.name}: ${compare} Reducing it by 10% would free about ${formatPence(tenPercentPence)} a month.`,
      };
    });
}

/** Notification wording, mirrored by pf_refresh_notifications. */
export const notificationText = {
  billDueSoon: (name: string, amount: number, due: string, today: string) => ({
    title: `${name} is due ${due === today ? "today" : `on ${formatDay(due)}`}`.slice(0, 120),
    body: `${formatPence(amount)} for ${name} is due on ${formatDay(due)}.`.slice(0, 300),
  }),
  billOverdue: (name: string, amount: number, due: string) => ({
    title: `${name} is overdue`.slice(0, 120),
    body: `${formatPence(amount)} for ${name} was due on ${formatDay(due)} and is not marked as paid.`.slice(
      0,
      300,
    ),
  }),
  budget: (name: string | null, spent: number, limit: number, level: 80 | 100) => {
    const pct = percentOf(spent, limit);
    return {
      title: `${name ?? "Overall"} budget ${level === 100 ? "exceeded" : `${pct}% used`}`.slice(
        0,
        120,
      ),
      body: `You have spent ${formatPence(spent)} of your ${formatPence(limit)} ${name ?? "overall"} budget this month (${pct}%).`.slice(
        0,
        300,
      ),
    };
  },
  spike: (thisMonth: number, average: number) => ({
    title: "Spending is higher than usual this month",
    body: `You have spent ${formatPence(thisMonth)} so far this month. Your average over the previous 3 months was ${formatPence(average)} a month.`,
  }),
  goalNear: (name: string, saved: number, target: number) => ({
    title: `${name}: ${Math.min(percentOf(saved, target), 999)}% saved`.slice(0, 120),
    body: `You have saved ${formatPence(saved)} of your ${formatPence(target)} goal for ${name}.`.slice(
      0,
      300,
    ),
  }),
};

/** Spike rule: at least day 5, average above £0, and more than 30% above it. */
export function isSpendingSpike(
  thisMonthPence: number,
  previous3TotalPence: number,
  dayOfMonth: number,
): boolean {
  const average = Math.floor(previous3TotalPence / 3);
  return dayOfMonth >= 5 && average > 0 && thisMonthPence * 10 > average * 13;
}
