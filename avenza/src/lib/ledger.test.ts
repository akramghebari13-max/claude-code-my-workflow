import { describe, expect, it } from "vitest";
import { checkJournal, naturalBalance, parsePounds } from "./ledger";

describe("ledger rules", () => {
  it("parses pounds into pence", () => {
    expect(parsePounds("1,234.56")).toBe(123456);
    expect(parsePounds("£12.5")).toBe(1250);
    expect(parsePounds("1.234")).toBeNull();
  });
  it("rejects journals that don't balance", () => {
    const r = checkJournal([{ account_id: "a", debit_pence: 1000, credit_pence: 0 }, { account_id: "b", debit_pence: 0, credit_pence: 900 }]);
    expect(r.ok).toBe(false);
  });
  it("accepts balanced journals", () => {
    const r = checkJournal([{ account_id: "a", debit_pence: 1000, credit_pence: 0 }, { account_id: "b", debit_pence: 0, credit_pence: 1000 }]);
    expect(r).toEqual({ ok: true, total: 1000 });
  });
  it("needs two lines", () => {
    expect(checkJournal([{ account_id: "a", debit_pence: 1000, credit_pence: 0 }]).ok).toBe(false);
  });
  it("shows income as positive on the credit side", () => {
    expect(naturalBalance("income", 0, 5000)).toBe(5000);
    expect(naturalBalance("asset", 5000, 0)).toBe(5000);
  });
});

import { invoiceTotals, vatFromGross } from "./ledger";
describe("VAT", () => {
  it("extracts 20% VAT from a £120 gross", () => { expect(vatFromGross(12000, 2000)).toBe(2000); });
  it("extracts 5% VAT from a £105 gross", () => { expect(vatFromGross(10500, 500)).toBe(500); });
  it("totals invoice lines with VAT", () => {
    expect(invoiceTotals([{ quantity: 2, unit_pence: 5000, vat_rate_bp: 2000 }, { quantity: 1, unit_pence: 1000, vat_rate_bp: 0 }])).toEqual({ net: 11000, vat: 2000, gross: 13000 });
  });
});
