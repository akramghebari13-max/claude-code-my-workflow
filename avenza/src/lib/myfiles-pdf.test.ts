import { describe, expect, it } from "vitest";
import { assemblePersonalReport, buildPersonalReport, type PdfInput } from "./myfiles-pdf";

const sample: PdfInput = {
  month: "2026-11-01",
  generatedAt: "2026-11-19T09:00:00Z",
  summary: {
    income_pence: 200000,
    expense_pence: 45000,
    saving_pence: 20000,
    remaining_pence: 135000,
  },
  categories: [
    { name: "Food and groceries", total_pence: 30000 },
    { name: "Transport", total_pence: 15000 },
  ],
  previous: [
    {
      month: "2026-10-01",
      income_pence: 180000,
      expense_pence: 30000,
      saving_pence: 10000,
      remaining_pence: 140000,
    },
  ],
  bills: [{ name: "Phone", amount_pence: 4599, next_due_date: "2026-11-21", active: true }],
  goals: [{ name: "Holiday", saved_pence: 40000, target_pence: 100000, percentage: 40 }],
};
describe("personal monthly report", () => {
  it("assembles hand-calculated figures in integer pence", () => {
    const report = assemblePersonalReport(sample);
    expect(report.summary.remaining_pence).toBe(135000);
    expect(report.categories.map((c) => c.percentage)).toEqual([66.67, 33.33]);
    expect(report.change).toEqual({
      income_pence: 20000,
      expense_pence: 15000,
      saving_pence: 10000,
      remaining_pence: -5000,
    });
    expect(report.bills[0]?.amount_pence).toBe(4599);
    expect(report.goals[0]?.saved_pence).toBe(40000);
  });
  it("builds a real PDF containing pound figures", () => {
    const output = buildPersonalReport(sample).output();
    expect(output.startsWith("%PDF")).toBe(true);
    expect(output).toContain("£2,000.00");
  });
  it("handles an empty month", () => {
    expect(
      assemblePersonalReport({
        ...sample,
        summary: { income_pence: 0, expense_pence: 0, saving_pence: 0, remaining_pence: 0 },
        categories: [],
      }).empty,
    ).toBe(true);
  });
  it("splits long reports across pages", () => {
    expect(
      buildPersonalReport({
        ...sample,
        categories: Array.from({ length: 150 }, (_, i) => ({
          name: `Long category ${i}`,
          total_pence: 100,
        })),
      }).getNumberOfPages(),
    ).toBeGreaterThan(1);
  });
});
