// Pure, browser-safe helpers for HMRC's Making Tax Digital VAT API.
// AVENZA stores money as integer pence; HMRC wants pounds with two decimals.

export type VatBoxFigures = {
  box1: number; box2: number; box3: number; box4: number;
  box5: number; box6: number; box7: number; box8: number; box9: number;
};

/** HMRC's MTD VAT reference is the VAT number without the GB prefix (a branch suffix is allowed). */
export function hmrcVatId(vatNumber: string | null | undefined): string | null {
  const digits = (vatNumber ?? "").replace(/[^0-9]/g, "");
  return digits.length === 9 || digits.length === 12 ? digits : null;
}

/** Integer pence to HMRC's pounds-with-two-decimals text, e.g. -123456 -> "-1234.56". */
export function penceToHmrcPounds(pence: number): string {
  const p = Math.round(pence);
  const sign = p < 0 ? "-" : "";
  const abs = Math.abs(p);
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, "0")}`;
}

/** Our box numbers to HMRC's field names. */
export const HMRC_RETURN_FIELDS: Record<keyof VatBoxFigures, string> = {
  box1: "vatDueSales",
  box2: "vatDueAcquisitions",
  box3: "totalVatDue",
  box4: "vatReclaimedCurrPeriod",
  box5: "netVatDue",
  box6: "totalValueSalesExVAT",
  box7: "totalValuePurchasesExVAT",
  box8: "totalValueGoodsSuppliedExVAT",
  box9: "totalAcquisitionsExVAT",
};

/** HMRC only accepts zero or more for every box except the net figure (box 5). */
export const HMRC_NON_NEGATIVE_BOXES: (keyof VatBoxFigures)[] =
  ["box1", "box2", "box3", "box4", "box6", "box7", "box8", "box9"];

const BOX_LABEL: Record<keyof VatBoxFigures, string> = {
  box1: "VAT due on sales (box 1)",
  box2: "VAT due on EU acquisitions (box 2)",
  box3: "Total VAT due (box 3)",
  box4: "VAT reclaimed on purchases (box 4)",
  box5: "Net VAT (box 5)",
  box6: "Total sales excluding VAT (box 6)",
  box7: "Total purchases excluding VAT (box 7)",
  box8: "Goods supplied to the EU (box 8)",
  box9: "Goods acquired from the EU (box 9)",
};

/** The JSON body HMRC expects for a return. Boxes HMRC won't take as negative are floored at zero. */
export function hmrcReturnPayload(boxes: VatBoxFigures, periodKey: string): Record<string, unknown> {
  const payload: Record<string, unknown> = { periodKey, finalised: true };
  (Object.keys(HMRC_RETURN_FIELDS) as (keyof VatBoxFigures)[]).forEach((box) => {
    const raw = boxes[box];
    const pence = HMRC_NON_NEGATIVE_BOXES.includes(box) ? Math.max(0, raw) : raw;
    payload[HMRC_RETURN_FIELDS[box]] = Number(penceToHmrcPounds(pence));
  });
  return payload;
}

/** Plain-English reasons HMRC would refuse this return. Empty means it is worth sending. */
export function hmrcSubmitChecks(boxes: VatBoxFigures, periodEnd: string, today: string): string[] {
  const problems: string[] = [];
  for (const box of HMRC_NON_NEGATIVE_BOXES) {
    if (boxes[box] < 0) problems.push(`${BOX_LABEL[box]} is negative — HMRC only accepts zero or more`);
  }
  if (boxes.box3 !== boxes.box1 + boxes.box2) problems.push("Box 3 (total VAT due) must equal box 1 plus box 2");
  if (boxes.box5 !== boxes.box3 - boxes.box4) problems.push("Box 5 (net VAT) must equal box 3 minus box 4");
  if (periodEnd >= today) problems.push("The period must have ended before HMRC will accept the return");
  return problems;
}

export type HmrcObligation = {
  periodKey: string;
  periodStart: string;
  periodEnd: string;
  status?: string;
  dueDate?: string;
};

/** The HMRC period reference for these dates, or null when HMRC has none open. */
export function matchObligation(obligations: HmrcObligation[], start: string, end: string): string | null {
  const matching = obligations.filter((o) => o.periodStart === start && o.periodEnd === end);
  const open = matching.find((o) => (o.status ?? "O").toUpperCase() === "O");
  return (open ?? matching[0])?.periodKey ?? null;
}

/** Turn an HMRC error response into something a business owner can act on. Null means "not recognised". */
export function hmrcErrorText(status: number, body: unknown): string | null {
  const codes: string[] = [];
  const b = body as { code?: unknown; errors?: unknown } | null;
  if (b && typeof b === "object") {
    if (typeof b.code === "string") codes.push(b.code);
    if (Array.isArray(b.errors)) {
      for (const e of b.errors) {
        const code = (e as { code?: unknown })?.code;
        if (typeof code === "string") codes.push(code);
      }
    }
  }
  const has = (c: string) => codes.includes(c);
  if (has("DUPLICATE_SUBMISSION")) return "HMRC already has a return for this period — don't send it again";
  if (has("TAX_PERIOD_NOT_ENDED")) return "The period hasn't ended yet, so HMRC won't accept the return";
  if (has("INVALID_PERIODKEY") || has("TAX_PERIOD_NOT_FOUND") || has("INVALID_OBLIGATION_END_DATE")) {
    return "HMRC has no open return period for these dates";
  }
  if (has("INVALID_VRN") || has("INVALID_MTDBTID")) return "HMRC doesn't recognise this VAT number on the account you signed in to";
  if (has("INVALID_PAYLOAD")) return "HMRC rejected the figures in this return";
  if (has("MISSING_CREDENTIALS") || has("UNAUTHORISED") || has("INVALID_TOKEN") || status === 401) {
    return "Your HMRC sign-in has run out — connect your HMRC account again";
  }
  if (has("FORBIDDEN") || status === 403) return "This HMRC account isn't allowed to send returns for this VAT number";
  if (status === 429) return "HMRC is limiting requests — try again in a minute";
  if (status >= 500) return "HMRC had a problem — try again later";
  return null;
}

/**
 * Fraud-prevention data HMRC requires with every API call from a web app served through a server.
 * Called from a click handler, never during render. Values HMRC doesn't need are left out rather
 * than invented.
 */
export function collectHmrcFraudData(): Record<string, string> {
  if (typeof window === "undefined" || typeof navigator === "undefined") return {};
  const out: Record<string, string> = {};
  const set = (key: string, value: string | undefined | null) => {
    if (value) out[key] = value.slice(0, 512);
  };
  set("Gov-Client-Browser-JS-User-Agent", navigator.userAgent);
  const dnt = (navigator as unknown as { doNotTrack?: string; msDoNotTrack?: string });
  set("Gov-Client-Browser-Do-Not-Track", String(dnt.doNotTrack === "1" || dnt.msDoNotTrack === "1"));
  set("Gov-Client-Browser-Plugins", Array.from(navigator.plugins ?? []).map((p) => p.name).filter(Boolean).join(","));
  set("Gov-Client-Window-Size", `${window.innerWidth}x${window.innerHeight}`);
  if (typeof screen !== "undefined") set("Gov-Client-Screen-Display", `pixels:${screen.width}x${screen.height}`);
  const offsetMins = new Date().getTimezoneOffset();
  const sign = offsetMins <= 0 ? "+" : "-";
  const mins = Math.abs(offsetMins);
  set("Gov-Client-Timezone", `${sign}${String(Math.floor(mins / 60)).padStart(2, "0")}${String(mins % 60).padStart(2, "0")}`);
  // A persistent per-device identifier, as HMRC's spec asks for. Created here, not at module load.
  let deviceId: string | null = null;
  try {
    deviceId = window.localStorage.getItem("avenza:device-id");
    if (!deviceId) {
      deviceId = typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(36).slice(2);
      window.localStorage.setItem("avenza:device-id", deviceId);
    }
  } catch {
    deviceId = null;
  }
  set("Gov-Client-Device-ID", deviceId);
  return out;
}
