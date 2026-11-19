import { z } from "zod";
import { MAX_AMOUNT_PENCE, monthStartISO } from "./myfiles";

export function extractionCutoff(minutes: number, now = Date.now()) {
  return new Date(now - minutes * 60_000).toISOString();
}

export function isStaleProcessing(
  document: { status: string; updated_at: string },
  now = Date.now(),
) {
  return document.status === "processing" && document.updated_at < extractionCutoff(5, now);
}

// Flat required-but-nullable schema also defines the strict AI wire contract.
export const extractionSchema = z
  .object({
    doc_type: z.enum([
      "receipt",
      "utility_bill",
      "rent_receipt",
      "payslip",
      "bank_statement",
      "invoice",
      "other",
    ]),
    kind: z.enum(["income", "expense", "saving"]),
    txn_date: z.string().nullable(),
    amount_pence: z.number().nullable(),
    merchant: z.string().nullable(),
    description: z.string().nullable(),
    suggested_category: z.string().nullable(),
    income_type: z.enum(["salary", "additional", "other"]).nullable(),
    confidence: z.enum(["low", "medium", "high"]),
  })
  .strict();

export type Extraction = z.infer<typeof extractionSchema>;
export type CategoryOption = { id: string; name: string; archived: boolean };

export function matchCategory(name: string | null, categories: readonly CategoryOption[]) {
  return (
    categories.find(
      (category) =>
        !category.archived &&
        category.name.toLocaleLowerCase("en-GB") === name?.trim().toLocaleLowerCase("en-GB"),
    )?.id ?? null
  );
}

export function sanitizeExtraction(input: unknown, categories: readonly CategoryOption[]) {
  const parsed = extractionSchema.parse(input);
  let date = parsed.txn_date;
  try {
    if (date) monthStartISO(date);
  } catch {
    date = null;
  }
  const amount = parsed.amount_pence;
  const categoryId =
    parsed.kind === "expense" ? matchCategory(parsed.suggested_category, categories) : null;
  return {
    ...parsed,
    txn_date: date,
    amount_pence:
      amount !== null && Number.isSafeInteger(amount) && amount > 0 && amount <= MAX_AMOUNT_PENCE
        ? amount
        : null,
    merchant: parsed.merchant?.slice(0, 120) ?? null,
    description: parsed.description?.slice(0, 300) ?? null,
    suggested_category: categoryId
      ? (categories.find((category) => category.id === categoryId)?.name ?? null)
      : null,
    category_id: categoryId,
    income_type: parsed.kind === "income" ? parsed.income_type : null,
  };
}
