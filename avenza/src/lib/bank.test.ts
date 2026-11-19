import { describe, expect, it } from "vitest";
import { fetchAllPages, parseBankCsv, parseMoney, parseUkDate, suggestMatches } from "./bank";

describe("bank line paging", () => {
  // A statement history longer than one Supabase response (1,000 rows).
  const all = Array.from({ length: 2500 }, (_, i) => ({ id: i }));
  const loader = (from: number, to: number) =>
    Promise.resolve({ data: all.slice(from, to + 1), error: null });

  it("loads every line, not just the first 1,000", async () => {
    const rows = await fetchAllPages(loader);
    expect(rows).toHaveLength(2500);
    expect(rows.at(-1)).toEqual({ id: 2499 });
  });
  it("stops after a short page and asks for ranges in order", async () => {
    const asked: [number, number][] = [];
    await fetchAllPages((from, to) => {
      asked.push([from, to]);
      return loader(from, to);
    });
    expect(asked).toEqual([
      [0, 999],
      [1000, 1999],
      [2000, 2999],
    ]);
  });
  it("makes one more request when the total is an exact multiple of the page size", async () => {
    let calls = 0;
    const rows = await fetchAllPages((from, to) => {
      calls++;
      return Promise.resolve({ data: all.slice(0, 2000).slice(from, to + 1), error: null });
    });
    expect(rows).toHaveLength(2000);
    expect(calls).toBe(3);
  });
  it("passes a database error on instead of returning a partial list", async () => {
    const err = new Error("permission denied");
    await expect(
      fetchAllPages((from) =>
        Promise.resolve(
          from === 0 ? { data: all.slice(0, 1000), error: null } : { data: null, error: err },
        ),
      ),
    ).rejects.toBe(err);
  });
});

describe("bank import", () => {
  it("reads UK dates as day/month", () => {
    expect(parseUkDate("03/04/2026")).toBe("2026-04-03");
    expect(parseUkDate("31/02/2026")).toBeNull();
  });
  it("reads money with £, commas and brackets", () => {
    expect(parseMoney("£1,234.56")).toBe(123456);
    expect(parseMoney("(12.30)")).toBe(-1230);
  });
  it("handles Paid in / Paid out columns", () => {
    const r = parseBankCsv('Date,Description,Paid out,Paid in\n01/05/2026,"Tesco, London",12.50,\n02/05/2026,Client,,100.00');
    expect(r.lines.map((l) => l.amount_pence)).toEqual([-1250, 10000]);
    expect(r.lines[0]?.description).toBe("Tesco, London");
  });
  it("suggests only same amount within 7 days", () => {
    const c = [{ id: "a", date: "2026-05-01", signed_pence: -1250 }, { id: "b", date: "2026-05-20", signed_pence: -1250 }, { id: "c", date: "2026-05-01", signed_pence: 1250 }];
    expect(suggestMatches({ line_date: "2026-05-03", amount_pence: -1250 }, c).map((x) => x.id)).toEqual(["a"]);
  });
});
