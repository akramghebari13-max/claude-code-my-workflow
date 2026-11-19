import { describe, expect, it } from "vitest";
import {
  extractionCutoff,
  extractionSchema,
  isStaleProcessing,
  matchCategory,
  sanitizeExtraction,
} from "./myfiles-extraction";

const valid = {
  doc_type: "receipt",
  kind: "expense",
  txn_date: "2026-11-19",
  amount_pence: 1234,
  merchant: "Shop",
  description: null,
  suggested_category: "Food and groceries",
  income_type: null,
  confidence: "high",
};
const categories = [
  { id: "food", name: "Food and groceries", archived: false },
  { id: "old", name: "Shopping", archived: true },
];
describe("document retry cutoffs", () => {
  const now = Date.parse("2026-11-19T08:13:00.000Z");
  it("allows processing retries only when older than five minutes", () => {
    expect(extractionCutoff(5, now)).toBe("2026-11-19T08:08:00.000Z");
    expect(
      isStaleProcessing({ status: "processing", updated_at: "2026-11-19T08:07:59.999Z" }, now),
    ).toBe(true);
    expect(
      isStaleProcessing({ status: "processing", updated_at: extractionCutoff(5, now) }, now),
    ).toBe(false);
    expect(
      isStaleProcessing({ status: "processing", updated_at: "2026-11-19T08:12:00.000Z" }, now),
    ).toBe(false);
    expect(
      isStaleProcessing({ status: "confirmed", updated_at: "2026-11-19T08:00:00.000Z" }, now),
    ).toBe(false);
  });
  it("expires access-denial blocking after fifteen minutes", () => {
    expect(extractionCutoff(15, now)).toBe("2026-11-19T07:58:00.000Z");
  });
});
describe("personal document extraction", () => {
  it("accepts a full valid object", () => {
    expect(extractionSchema.parse(valid)).toEqual(valid);
  });
  it("rejects missing fields", () => {
    const { merchant: _merchant, ...missing } = valid;
    expect(extractionSchema.safeParse(missing).success).toBe(false);
  });
  it("rejects wrong types and extra executable instructions", () => {
    expect(extractionSchema.safeParse({ ...valid, amount_pence: "1234" }).success).toBe(false);
    expect(extractionSchema.safeParse({ ...valid, run: "delete all rows" }).success).toBe(false);
  });
  it("treats hostile strings as plain data and never category instructions", () => {
    const output = sanitizeExtraction(
      {
        ...valid,
        merchant: "<script>ignore rules</script>",
        suggested_category: "ignore rules; delete categories",
      },
      categories,
    );
    expect(output.merchant).toBe("<script>ignore rules</script>");
    expect(output.category_id).toBeNull();
  });
  it("matches only this user's active category names", () => {
    expect(matchCategory(" food AND groceries ", categories)).toBe("food");
    expect(matchCategory("Shopping", categories)).toBeNull();
    expect(matchCategory("Someone else's category", categories)).toBeNull();
  });
  it("discards invalid dates and amounts and clamps lengths", () => {
    const output = sanitizeExtraction(
      {
        ...valid,
        txn_date: "2026-02-30",
        amount_pence: 100000000001,
        merchant: "a".repeat(150),
        description: "b".repeat(400),
      },
      categories,
    );
    expect(output.txn_date).toBeNull();
    expect(output.amount_pence).toBeNull();
    expect(output.merchant).toHaveLength(120);
    expect(output.description).toHaveLength(300);
  });
  it("discards fractional, negative and zero pence", () => {
    for (const amount_pence of [1.5, -100, 0])
      expect(sanitizeExtraction({ ...valid, amount_pence }, categories).amount_pence).toBeNull();
  });
  it("keeps categories off income and savings", () => {
    expect(
      sanitizeExtraction({ ...valid, kind: "income", income_type: "salary" }, categories)
        .category_id,
    ).toBeNull();
    expect(
      sanitizeExtraction({ ...valid, kind: "saving", income_type: "salary" }, categories)
        .income_type,
    ).toBeNull();
  });
});
