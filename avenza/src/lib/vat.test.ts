import { describe, expect, it } from "vitest";
import { quarterBounds } from "./vat";
describe("VAT quarters", () => {
  it("Nov 2026 falls in Oct–Dec", () => { expect(quarterBounds(new Date(2026, 10, 18))).toEqual({ start: "2026-10-01", end: "2026-12-31" }); });
  it("Feb 2028 quarter ends 31 Mar", () => { expect(quarterBounds(new Date(2028, 1, 29)).end).toBe("2028-03-31"); });
});
