import { describe, expect, it } from "vitest";
import { accountingYear, buildBalanceSheet, corporationTaxPence, soleTraderTaxPence, taxYear, taxYearContaining } from "./reports";

const r = (account_type: any, d: number, c: number) => ({ account_id: account_type + d + c, code: "", name: "", account_type, debit_pence: d, credit_pence: c });

describe("reports", () => {
  it("UK tax year is 6 April to 5 April", () => {
    expect(taxYear(2026)).toMatchObject({ from: "2026-04-06", to: "2027-04-05" });
    expect(taxYearContaining(new Date("2026-04-05"))).toBe(2025);
  });
  it("accounting year ending 31 March", () => {
    expect(accountingYear(2027, 3, 31)).toMatchObject({ from: "2026-04-01", to: "2027-03-31" });
  });
  it("balance sheet balances with profit in equity", () => {
    const bs = buildBalanceSheet([r("asset", 10000, 0), r("income", 0, 12000), r("expense", 2000, 0)]);
    expect(bs.retainedProfit).toBe(10000);
    expect(bs.balanced).toBe(true);
  });
  it("corporation tax: 19% small, 25% main, marginal relief at £100k", () => {
    expect(corporationTaxPence(4_000_000)).toBe(760_000);
    expect(corporationTaxPence(30_000_000)).toBe(7_500_000);
    expect(corporationTaxPence(10_000_000)).toBe(2_275_000);
  });
  it("sole trader on £30k profit", () => {
    expect(soleTraderTaxPence(3_000_000)).toEqual({ incomeTax: 348_600, class4: 104_580 });
  });
});
