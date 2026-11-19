import { describe, expect, it } from "vitest";
import { cumulativePayload, hmrcTaxYear, normalizeNino, parseCalculation, parseHmrcTaxYear, pickSelfEmployment, taxYearEnded } from "./itsa";

describe("itsa", () => {
  it("validates NINOs", () => {
    expect(normalizeNino("ab 12 34 56 c")).toBe("AB123456C");
    expect(normalizeNino("GB123456A")).toBeNull();
    expect(normalizeNino("AB123456E")).toBeNull();
    expect(normalizeNino("DA123456A")).toBeNull();
  });
  it("formats tax years", () => {
    expect(hmrcTaxYear(2025)).toBe("2025-26");
    expect(hmrcTaxYear(2099)).toBe("2099-00");
    expect(parseHmrcTaxYear("2025-26")).toBe(2025);
    expect(parseHmrcTaxYear("2025-27")).toBeNull();
  });
  it("uses one expenses total under £90,000 turnover", () => {
    const p = cumulativePayload({ turnoverPence: 4_000_000, otherIncomePence: 0, expensesPence: 1_234_56, from: "2025-04-06", to: "2026-04-05" });
    expect(p.periodIncome.turnover).toBe(40000);
    expect(p.periodExpenses).toEqual({ consolidatedExpenses: 1234.56 });
  });
  it("splits expenses at or above £90,000 turnover", () => {
    const p = cumulativePayload({ turnoverPence: 9_000_000, otherIncomePence: 0, expensesPence: 100, from: "a", to: "b" });
    expect(p.periodExpenses).toEqual({ otherExpenses: 1 });
  });
  it("reads calculation figures", () => {
    const c = parseCalculation({ calculation: { taxCalculation: { incomeTax: { incomeTaxCharged: 5486, totalTaxableIncome: 27430 }, nics: { class4Nics: { totalAmount: 1646.1 } }, totalIncomeTaxAndNicsDue: 7132.1 } } });
    expect(c).toEqual({ incomeTax: 5486, class4: 1646.1, total: 7132.1, taxableIncome: 27430 });
    expect(parseCalculation(null).total).toBeNull();
  });
  it("allows final declaration only after 5 April", () => {
    expect(taxYearEnded(2025, "2026-04-05")).toBe(false);
    expect(taxYearEnded(2025, "2026-04-06")).toBe(true);
  });
  it("picks self-employment sources", () => {
    expect(pickSelfEmployment({ listOfBusinesses: [{ typeOfBusiness: "uk-property", businessId: "X" }, { typeOfBusiness: "self-employment", businessId: "XAIS1", tradingName: "Joinery" }] }))
      .toEqual([{ id: "XAIS1", name: "Joinery" }]);
  });
});
