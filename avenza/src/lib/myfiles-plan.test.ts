import { describe, expect, it } from "vitest";
import {
  advanceDue,
  anchorFor,
  isSpendingSpike,
  notificationText,
  onTrackStatement,
  paidMessage,
  projectSaved,
  savingSuggestions,
  targetMonth,
  upcomingBills,
} from "./myfiles-plan";

describe("bill dates", () => {
  it("monthly bill due 31 Jan goes 28 Feb then 31 Mar without drift", () => {
    const a = anchorFor("monthly", "2026-01-31");
    expect(a).toBe(31);
    const feb = advanceDue("2026-01-31", "monthly", a);
    expect(feb).toBe("2026-02-28");
    expect(advanceDue(feb!, "monthly", a)).toBe("2026-03-31");
  });
  it("leap year February keeps the 29th", () => {
    expect(advanceDue("2028-01-31", "monthly", 31)).toBe("2028-02-29");
    expect(advanceDue("2028-01-30", "monthly", 30)).toBe("2028-02-29");
  });
  it("yearly 29 Feb clamps to 28 Feb then returns to 29 Feb in a leap year", () => {
    const a = anchorFor("yearly", "2028-02-29");
    expect(advanceDue("2028-02-29", "yearly", a)).toBe("2029-02-28");
    expect(advanceDue("2031-02-28", "yearly", a)).toBe("2032-02-29");
  });
  it("quarterly crosses the year end", () => {
    expect(advanceDue("2026-11-30", "quarterly", 30)).toBe("2027-02-28");
    expect(advanceDue("2027-02-28", "quarterly", 30)).toBe("2027-05-30");
  });
  it("weekly adds 7 days across months and one-off has no next date", () => {
    expect(anchorFor("weekly", "2026-12-29")).toBeNull();
    expect(advanceDue("2026-12-29", "weekly", null)).toBe("2027-01-05");
    expect(advanceDue("2026-12-29", "once", null)).toBeNull();
  });
  it("lists overdue bills first and only the next 30 days", () => {
    const list = upcomingBills(
      [
        { id: "a", name: "Gym", amount_pence: 1, next_due_date: "2026-11-21", active: true },
        { id: "b", name: "Rent", amount_pence: 1, next_due_date: "2026-11-10", active: true },
        { id: "c", name: "Car", amount_pence: 1, next_due_date: "2027-01-10", active: true },
        { id: "d", name: "Old", amount_pence: 1, next_due_date: "2026-11-01", active: false },
      ],
      "2026-11-19",
    );
    expect(list.map((b) => [b.id, b.overdue])).toEqual([
      ["b", true],
      ["a", false],
    ]);
  });
  it("confirms a payment with the amount and next date", () => {
    expect(paidMessage(4599, "2026-12-31")).toBe("Paid £45.99, next due 31 Dec 2026");
    expect(paidMessage(100, null)).toBe("Paid £1.00, no further payments due");
  });
});

describe("goal projections", () => {
  it("projects saved + average × months", () => {
    expect([3, 6, 12].map((n) => projectSaved(50000, 12500, n))).toEqual([87500, 125000, 200000]);
    expect(projectSaved(50000, 0, 12)).toBe(50000);
  });
  it("estimates the month the target is reached, or none at zero rate", () => {
    expect(targetMonth(50000, 200000, 12500, "2026-11-19")).toBe("2027-11-01");
    expect(targetMonth(50000, 200000, 0, "2026-11-19")).toBeNull();
    expect(targetMonth(200000, 200000, 0, "2026-11-19")).toBe("2026-11-01");
  });
  it("states pace against the target date", () => {
    const g = { saved_pence: 50000, target_pence: 200000, avg_monthly_saving_pence: 12500 };
    expect(onTrackStatement({ ...g, target_date: "2027-12-31" }, "2026-11-19")).toMatch(
      /^On track.*November 2027/,
    );
    expect(onTrackStatement({ ...g, target_date: "2027-06-30" }, "2026-11-19")).toMatch(/^Behind/);
    expect(
      onTrackStatement({ ...g, avg_monthly_saving_pence: 0, target_date: null }, "2026-11-19"),
    ).toMatch(/^Not at the current rate/);
  });
});

describe("ways to save more", () => {
  it("uses top 3 categories this month against their 3-month average", () => {
    const s = savingSuggestions(
      [
        { category_id: "f", name: "Food and groceries", total_pence: 40000 },
        { category_id: "t", name: "Transport", total_pence: 15000 },
        { category_id: "e", name: "Entertainment", total_pence: 9000 },
        { category_id: "s", name: "Shopping", total_pence: 1000 },
      ],
      [
        [{ category_id: "f", name: "Food and groceries", total_pence: 30000 }],
        [{ category_id: "f", name: "Food and groceries", total_pence: 33000 }],
        [],
      ],
    );
    expect(s.map((x) => x.categoryId)).toEqual(["f", "t", "e"]);
    expect(s[0]).toMatchObject({ averagePence: 21000, tenPercentPence: 2100 });
    expect(s[0]!.text).toBe(
      "Food and groceries: £400.00 so far this month, against a 3-month average of £210.00. Reducing it by 10% would free about £21.00 a month.",
    );
    expect(s[1]).toMatchObject({ averagePence: 0, tenPercentPence: 1500 });
  });
});

describe("notification wording", () => {
  it("states facts with amounts and names", () => {
    expect(notificationText.billDueSoon("Council tax", 15000, "2026-11-21", "2026-11-19")).toEqual({
      title: "Council tax is due on 21 Nov 2026",
      body: "£150.00 for Council tax is due on 21 Nov 2026.",
    });
    expect(notificationText.billDueSoon("Rent", 1, "2026-11-19", "2026-11-19").title).toBe(
      "Rent is due today",
    );
    expect(notificationText.billOverdue("Water", 3000, "2026-11-10").body).toBe(
      "£30.00 for Water was due on 10 Nov 2026 and is not marked as paid.",
    );
    expect(notificationText.budget("Food and groceries", 17000, 20000, 80)).toEqual({
      title: "Food and groceries budget 85% used",
      body: "You have spent £170.00 of your £200.00 Food and groceries budget this month (85%).",
    });
    expect(notificationText.budget(null, 25000, 20000, 100).title).toBe("Overall budget exceeded");
    expect(notificationText.goalNear("Holiday", 90000, 100000).title).toBe("Holiday: 90% saved");
  });
  it("flags a spike only above 30%, from day 5, with a positive average", () => {
    expect(isSpendingSpike(13001, 30000, 5)).toBe(true);
    expect(isSpendingSpike(13000, 30000, 5)).toBe(false);
    expect(isSpendingSpike(99999, 30000, 4)).toBe(false);
    expect(isSpendingSpike(99999, 0, 20)).toBe(false);
  });
});
