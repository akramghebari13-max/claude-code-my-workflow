import { describe, expect, it } from "vitest";
import { addDays, friendlyError, todayUK } from "./app";

describe("app helpers", () => {
  it("UK date rolls over at midnight London time in summer", () => {
    expect(todayUK(new Date("2026-06-30T23:30:00Z"))).toBe("2026-07-01");
    expect(todayUK(new Date("2026-12-31T23:30:00Z"))).toBe("2026-12-31");
  });
  it("adds days across month end", () => { expect(addDays("2026-01-31", 30)).toBe("2026-03-02"); });
  it("maps permission errors to plain English", () => {
    expect(friendlyError({ message: "new row violates row-level security policy" })).toBe("You don't have permission to do that for this business.");
  });
  it("keeps our own rule messages", () => {
    expect(friendlyError({ message: "This date is in a filed VAT return (01/01/2026 to 31/03/2026); use a date after 31/03/2026 for corrections" })).toContain("filed VAT return");
  });
  it("hides unknown technical errors", () => {
    expect(friendlyError({ message: "syntax error at or near" })).toBe("Something went wrong — nothing was saved. Please try again.");
  });
});
