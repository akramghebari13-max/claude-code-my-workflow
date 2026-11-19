// The app's half of the Bank tab end-to-end test (db-tests/bank.test.sql is the database half):
// the statement file is read exactly as the database test assumes, and the category suggestion
// picks the right account for the purchase it records.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { parseBankCsv } from "./bank";
import { historyFromTransactions, historyMatch } from "./categorise";

const fixture = (name: string) =>
  readFileSync(resolve(__dirname, "../../db-tests/fixtures", name), "utf8");

describe("Bank tab, end to end (app side)", () => {
  const { lines, errors } = parseBankCsv(fixture("statement.csv"));

  it("reads the statement into exactly the lines the database test imports", () => {
    expect(lines).toEqual(JSON.parse(fixture("statement.json")));
    expect(errors).toEqual(["Row 7: couldn't read date or amount"]);
  });

  it("suggests the category the purchase was filed under before", () => {
    // what suggestCategory reads from the books in db-tests/bank.test.sql
    const past = historyFromTransactions([
      { counterparty: "Jones Design Ltd", category_account_id: "sales-4000" },
      { counterparty: "Screwfix", category_account_id: "cost-of-sales-5000" },
    ]);
    const screwfix = lines.find((l) => l.amount_pence === -120000)!;
    expect(historyMatch(screwfix.description, past)).toBe("cost-of-sales-5000");
    // nothing like the bank fee was recorded before, so it goes to AI (or the user) instead
    const fee = lines.find((l) => l.description === "MONTHLY ACCOUNT FEE")!;
    expect(historyMatch(fee.description, past)).toBeNull();
  });

  it("learns from lines reconciled earlier, whose payee is the bank wording", () => {
    const past = historyFromTransactions([
      { counterparty: "CARD PAYMENT SCREWFIX DIRECT 1022", category_account_id: "5000" },
    ]);
    expect(historyMatch("CARD PAYMENT SCREWFIX DIRECT 4417", past)).toBe("5000");
  });
});
