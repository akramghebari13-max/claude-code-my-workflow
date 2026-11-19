// Pure helpers for Making Tax Digital for Income Tax (self-employment). Safe in browser and server.

/** HMRC API versions used. Change here if HMRC retires a version. */
export const ITSA_VERSIONS = { businessDetails: "1.0", selfEmployment: "5.0", calculations: "8.0" } as const;
export const ITSA_SCOPES = "read:self-assessment write:self-assessment";
/** Above this turnover HMRC needs expenses split by category rather than one total. */
export const CONSOLIDATED_LIMIT_PENCE = 90_000_00;

export function normalizeNino(raw: string): string | null {
  const n = (raw ?? "").replace(/\s+/g, "").toUpperCase();
  if (!/^[A-CEGHJ-PR-TW-Z][A-CEGHJ-NPR-TW-Z][0-9]{6}[A-D]$/.test(n)) return null;
  if (/^(BG|GB|NK|KN|TN|NT|ZZ)/.test(n)) return null;
  return n;
}

/** Tax year starting 6 April of startYear, in HMRC's "2025-26" form. */
export function hmrcTaxYear(startYear: number): string {
  return `${startYear}-${String((startYear + 1) % 100).padStart(2, "0")}`;
}

export function parseHmrcTaxYear(s: string): number | null {
  const m = /^(\d{4})-(\d{2})$/.exec(s ?? "");
  if (!m) return null;
  const y = Number(m[1]);
  return (y + 1) % 100 === Number(m[2]) ? y : null;
}

const pounds = (p: number) => Math.round(p) / 100;

export type ItsaFigures = { turnoverPence: number; otherIncomePence: number; expensesPence: number; from: string; to: string };

/** Body for HMRC's cumulative self-employment period summary. */
export function cumulativePayload(f: ItsaFigures) {
  const expenses = Math.max(0, f.expensesPence);
  return {
    periodDates: { periodStartDate: f.from, periodEndDate: f.to },
    periodIncome: { turnover: pounds(Math.max(0, f.turnoverPence)), other: pounds(Math.max(0, f.otherIncomePence)) },
    periodExpenses: f.turnoverPence < CONSOLIDATED_LIMIT_PENCE
      ? { consolidatedExpenses: pounds(expenses) }
      : { otherExpenses: pounds(expenses) },
  };
}

export type ItsaCalculation = { incomeTax: number | null; class4: number | null; total: number | null; taxableIncome: number | null };

function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

/** Pull the headline figures (in pounds) out of an HMRC calculation response. */
export function parseCalculation(json: unknown): ItsaCalculation {
  const c = (json as { calculation?: Record<string, unknown> } | null)?.calculation as Record<string, any> | undefined;
  const tc = c?.["taxCalculation"] as Record<string, any> | undefined;
  return {
    incomeTax: num(tc?.["incomeTax"]?.["incomeTaxCharged"]),
    class4: num(tc?.["nics"]?.["class4Nics"]?.["totalAmount"]),
    total: num(tc?.["totalIncomeTaxAndNicsDue"]),
    taxableIncome: num(tc?.["incomeTax"]?.["totalTaxableIncome"]),
  };
}

/** Final declaration is only allowed once the tax year has ended. */
export function taxYearEnded(startYear: number, today: string): boolean {
  return today > `${startYear + 1}-04-05`;
}

/** First self-employment income source from HMRC's business list. */
export function pickSelfEmployment(json: unknown): { id: string; name: string }[] {
  const list = (json as { listOfBusinesses?: unknown[] } | null)?.listOfBusinesses;
  if (!Array.isArray(list)) return [];
  return list
    .filter((b: any) => b?.typeOfBusiness === "self-employment" && typeof b?.businessId === "string")
    .map((b: any) => ({ id: b.businessId as string, name: typeof b.tradingName === "string" ? b.tradingName : "Self-employment" }));
}
