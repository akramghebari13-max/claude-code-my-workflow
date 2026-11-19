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

export type ItsaQuarter = { n: 1 | 2 | 3 | 4; from: string; to: string; deadline: string };

/**
 * HMRC's standard quarterly update periods for a tax year. Updates are cumulative: each one covers
 * 6 April to the end of that quarter, and is due by the 7th of the month after the quarter ends.
 */
export function itsaQuarters(startYear: number): ItsaQuarter[] {
  const y = startYear, n = startYear + 1, from = `${y}-04-06`;
  return [
    { n: 1, from, to: `${y}-07-05`, deadline: `${y}-08-07` },
    { n: 2, from, to: `${y}-10-05`, deadline: `${y}-11-07` },
    { n: 3, from, to: `${n}-01-05`, deadline: `${n}-02-07` },
    { n: 4, from, to: `${n}-04-05`, deadline: `${n}-05-07` },
  ];
}

/** The final declaration for a tax year is due by 31 January after it ends. */
export function finalDeclarationDeadline(startYear: number): string {
  return `${startYear + 2}-01-31`;
}

export type QuarterStatus = "open" | "due" | "overdue" | "sent";

/** "open": the quarter hasn't ended, so it can't be sent yet. `sentTo` lists period ends already sent. */
export function quarterStatus(q: ItsaQuarter, today: string, sentTo: string[]): QuarterStatus {
  if (sentTo.includes(q.to)) return "sent";
  if (today <= q.to) return "open";
  return today > q.deadline ? "overdue" : "due";
}

/** The quarter to offer first: the earliest ended one not yet sent, else the latest ended, else Q1. */
export function nextQuarter(quarters: ItsaQuarter[], today: string, sentTo: string[]): ItsaQuarter {
  const ended = quarters.filter((q) => today > q.to);
  return ended.find((q) => !sentTo.includes(q.to)) ?? ended[ended.length - 1] ?? quarters[0]!;
}

/** "2026-08-07" → "7 Aug 2026" */
export function ukDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return `${d} ${["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][m! - 1]} ${y}`;
}
