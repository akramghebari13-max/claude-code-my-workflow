import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { addMonthsISO, formatPence } from "./myfiles";

export type MonthFigures = {
  income_pence: number;
  expense_pence: number;
  saving_pence: number;
  remaining_pence: number;
};
export type PdfInput = {
  month: string;
  generatedAt: string;
  summary: MonthFigures;
  categories: { name: string; total_pence: number }[];
  previous: (MonthFigures & { month: string })[];
  bills: { name: string; amount_pence: number; next_due_date: string; active: boolean }[];
  goals: { name: string; saved_pence: number; target_pence: number; percentage: number }[];
};

export function assemblePersonalReport(input: PdfInput) {
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/London",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(input.generatedAt));
  const horizon = new Date(`${today}T00:00:00Z`);
  horizon.setUTCDate(horizon.getUTCDate() + 30);
  const previous = input.previous.find((row) => row.month === addMonthsISO(input.month, -1));
  const change = {
    income_pence: input.summary.income_pence - (previous?.income_pence ?? 0),
    expense_pence: input.summary.expense_pence - (previous?.expense_pence ?? 0),
    saving_pence: input.summary.saving_pence - (previous?.saving_pence ?? 0),
    remaining_pence: input.summary.remaining_pence - (previous?.remaining_pence ?? 0),
  };
  return {
    ...input,
    change,
    empty: Object.values(input.summary).every((n) => n === 0),
    categories: input.categories.map((c) => ({
      ...c,
      percentage: input.summary.expense_pence
        ? Math.round((c.total_pence * 10000) / input.summary.expense_pence) / 100
        : 0,
    })),
    bills: input.bills
      .filter((b) => b.active && b.next_due_date <= horizon.toISOString().slice(0, 10))
      .map((b) => ({ ...b, overdue: b.next_due_date < today })),
  };
}

export function buildPersonalReport(input: PdfInput): jsPDF {
  const data = assemblePersonalReport(input);
  const doc = new jsPDF();
  doc.setFont("helvetica");
  doc.setFontSize(20);
  doc.text("My Files monthly report", 14, 20);
  doc.setFontSize(12);
  doc.text(input.month.slice(0, 7), 14, 29);
  doc.setFontSize(10);
  doc.text(
    `Generated ${new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", dateStyle: "medium", timeStyle: "short" }).format(new Date(input.generatedAt))} (UK time)`,
    14,
    36,
  );
  let y = 42;
  function table(title: string, head: string[], rows: string[][]) {
    if (y > 245) {
      doc.addPage();
      y = 18;
    }
    doc.setFontSize(12);
    doc.text(title, 14, y);
    y += 4;
    autoTable(doc, {
      startY: y,
      head: [head],
      body: rows.length ? rows : [["None recorded"]],
      theme: "grid",
      styles: { font: "helvetica", fontSize: 9, overflow: "linebreak" },
      margin: { left: 14, right: 14 },
      didDrawPage: (hook) => {
        y = (hook.cursor?.y ?? 20) + 12;
      },
    });
  }
  if (data.empty) {
    doc.text("No income, expenses or savings recorded for this month.", 14, y);
    y += 10;
  }
  table(
    "Monthly totals",
    ["Income", "Expenses", "Savings", "Remaining"],
    [
      [
        input.summary.income_pence,
        input.summary.expense_pence,
        input.summary.saving_pence,
        input.summary.remaining_pence,
      ].map(formatPence),
    ],
  );
  table(
    "Expenses by category",
    ["Category", "Amount", "% of expenses"],
    data.categories.map((c) => [c.name, formatPence(c.total_pence), `${c.percentage}%`]),
  );
  table(
    "Bills due next 30 days and overdue (as of generation)",
    ["Bill", "Amount", "Due date", "Status"],
    data.bills.map((b) => [
      b.name,
      formatPence(b.amount_pence),
      b.next_due_date,
      b.overdue ? "Overdue" : "Upcoming",
    ]),
  );
  table(
    "Goal progress (as of generation)",
    ["Goal", "Saved", "Target", "%"],
    data.goals.map((g) => [
      g.name,
      formatPence(g.saved_pence),
      formatPence(g.target_pence),
      `${g.percentage}%`,
    ]),
  );
  table(
    "Previous three months and change versus last month",
    ["Month", "Income", "Expenses", "Savings", "Remaining"],
    [
      ...input.previous.map((m) => [
        m.month.slice(0, 7),
        formatPence(m.income_pence),
        formatPence(m.expense_pence),
        formatPence(m.saving_pence),
        formatPence(m.remaining_pence),
      ]),
      [
        "Change this month",
        formatPence(data.change.income_pence),
        formatPence(data.change.expense_pence),
        formatPence(data.change.saving_pence),
        formatPence(data.change.remaining_pence),
      ],
    ],
  );
  for (let page = 1; page <= doc.getNumberOfPages(); page++) {
    doc.setPage(page);
    doc.setFontSize(8);
    doc.text(`Personal records only - Page ${page} of ${doc.getNumberOfPages()}`, 14, 287);
  }
  return doc;
}
