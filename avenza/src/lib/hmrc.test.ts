import { describe, expect, it } from "vitest";
import {
  hmrcErrorText, hmrcReturnPayload, hmrcSubmitChecks, hmrcVatId, matchObligation, penceToHmrcPounds,
} from "./hmrc";

// A quarter's worth of figures: £2,000 VAT on £10,000 of sales, £500 VAT reclaimed on £2,500 of purchases.
const boxes = {
  box1: 200000, box2: 0, box3: 200000, box4: 50000, box5: 150000,
  box6: 1000000, box7: 250000, box8: 0, box9: 0,
};

describe("HMRC VAT reference", () => {
  it("strips the GB prefix", () => { expect(hmrcVatId("GB123456789")).toBe("123456789"); });
  it("keeps a 12-digit branch number", () => { expect(hmrcVatId("GB 123 456 789 001")).toBe("123456789001"); });
  it("rejects anything that isn't 9 or 12 digits", () => {
    expect(hmrcVatId("GB12345")).toBeNull();
    expect(hmrcVatId(null)).toBeNull();
  });
});

describe("pence to HMRC pounds", () => {
  it("two decimals", () => { expect(penceToHmrcPounds(123456)).toBe("1234.56"); });
  it("under a pound", () => { expect(penceToHmrcPounds(5)).toBe("0.05"); });
  it("negative", () => { expect(penceToHmrcPounds(-123456)).toBe("-1234.56"); });
  it("zero", () => { expect(penceToHmrcPounds(0)).toBe("0.00"); });
});

describe("return payload", () => {
  it("maps our boxes onto HMRC's fields and declares the return", () => {
    expect(hmrcReturnPayload(boxes, "26A3")).toMatchObject({
      periodKey: "26A3",
      finalised: true,
      vatDueSales: 2000,
      vatDueAcquisitions: 0,
      totalVatDue: 2000,
      vatReclaimedCurrPeriod: 500,
      netVatDue: 1500,
      totalValueSalesExVAT: 10000,
      totalValuePurchasesExVAT: 2500,
    });
  });
  it("never sends a negative sales or purchases figure", () => {
    const p = hmrcReturnPayload({ ...boxes, box6: -50000, box7: -1 }, "26A3");
    expect(p["totalValueSalesExVAT"]).toBe(0);
    expect(p["totalValuePurchasesExVAT"]).toBe(0);
  });
  it("keeps a negative net figure, which is how a reclaim is sent", () => {
    const p = hmrcReturnPayload({ ...boxes, box5: -150000 }, "26A3");
    expect(p["netVatDue"]).toBe(-1500);
  });
});

describe("submit checks", () => {
  const ended = "2026-06-30";
  const today = "2026-11-18";
  it("accepts a balanced return for a period that has ended", () => {
    expect(hmrcSubmitChecks(boxes, ended, today)).toEqual([]);
  });
  it("flags box 3 that isn't box 1 plus box 2", () => {
    expect(hmrcSubmitChecks({ ...boxes, box3: 199999 }, ended, today))
      .toContain("Box 3 (total VAT due) must equal box 1 plus box 2");
  });
  it("flags box 5 that isn't box 3 minus box 4", () => {
    expect(hmrcSubmitChecks({ ...boxes, box5: 149000 }, ended, today))
      .toContain("Box 5 (net VAT) must equal box 3 minus box 4");
  });
  it("flags a negative box HMRC only takes as zero or more", () => {
    const problems = hmrcSubmitChecks({ ...boxes, box1: -100 }, ended, today);
    expect(problems.some((p) => p.includes("negative"))).toBe(true);
  });
  it("flags a period that hasn't ended yet", () => {
    expect(hmrcSubmitChecks(boxes, "2026-12-31", today))
      .toContain("The period must have ended before HMRC will accept the return");
  });
});

describe("HMRC period matching", () => {
  const obligations = [
    { periodKey: "26A3", periodStart: "2026-01-01", periodEnd: "2026-03-31", status: "O" },
    { periodKey: "26A4", periodStart: "2026-04-01", periodEnd: "2026-06-30", status: "F" },
  ];
  it("uses the open period for those dates", () => {
    expect(matchObligation(obligations, "2026-01-01", "2026-03-31")).toBe("26A3");
  });
  it("says so when HMRC has no period for those dates", () => {
    expect(matchObligation(obligations, "2026-07-01", "2026-09-30")).toBeNull();
  });
});

describe("HMRC error messages", () => {
  it("already sent", () => {
    expect(hmrcErrorText(403, { code: "DUPLICATE_SUBMISSION" }))
      .toBe("HMRC already has a return for this period — don't send it again");
  });
  it("period not ended", () => {
    expect(hmrcErrorText(400, { errors: [{ code: "TAX_PERIOD_NOT_ENDED" }] }))
      .toBe("The period hasn't ended yet, so HMRC won't accept the return");
  });
  it("sign-in run out", () => {
    expect(hmrcErrorText(401, {})).toMatch(/sign-in has run out/);
  });
  it("leaves an unknown error alone rather than dressing it up", () => {
    expect(hmrcErrorText(418, { code: "TEAPOT" })).toBeNull();
  });
});
