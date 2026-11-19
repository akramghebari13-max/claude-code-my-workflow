import { describe, expect, it } from "vitest";
import {
  ACCEPTED_MIME_TYPES,
  DEFAULT_EXPENSE_CATEGORIES,
  DOC_TYPES,
  MAX_UPLOAD_BYTES,
  addMonthsISO,
  buildStoragePath,
  monthStartISO,
  validateUpload,
  parseMoneyToPence,
  formatPence,
} from "./myfiles";

const user = "11111111-1111-4111-8111-111111111111";
describe("personal finance helpers", () => {
  it("parses decimal pounds exactly including grouped currency", () => {
    expect(parseMoneyToPence("12.34")).toBe(1234);
    expect(parseMoneyToPence("£1,234.50")).toBe(123450);
    expect(parseMoneyToPence("0.01")).toBe(1);
    expect(parseMoneyToPence("1.2")).toBe(120);
    expect(parseMoneyToPence("1000000000.00")).toBe(100000000000);
  });
  it("rejects zero, negatives, excess decimals and the database limit", () => {
    for (const value of ["0", "-1", "1.001", "1000000000.01", "1,23.00", "NaN", "1e3", ""])
      expect(() => parseMoneyToPence(value)).toThrow("Amount");
  });
  it("formats integer pence without rounding or precision loss", () => {
    expect(formatPence(123450)).toBe("£1,234.50");
    expect(formatPence(-1)).toBe("-£0.01");
    expect(formatPence(0)).toBe("£0.00");
    expect(formatPence(100000000000)).toBe("£1,000,000,000.00");
    expect(() => formatPence(1.2)).toThrow();
  });
  it("has the ten ordered default expense categories", () => {
    expect(DEFAULT_EXPENSE_CATEGORIES).toEqual([
      "Rent and housing",
      "Food and groceries",
      "Transport",
      "Shopping",
      "Electricity and gas",
      "Water bills",
      "Internet and phone",
      "Entertainment",
      "Insurance",
      "Other expenses",
    ]);
  });
  it("supports the seven document types", () => {
    expect(DOC_TYPES.map(([key]) => key)).toEqual([
      "receipt",
      "utility_bill",
      "rent_receipt",
      "payslip",
      "bank_statement",
      "invoice",
      "other",
    ]);
  });
  it("uses only JPEG, PNG and PDF with a 10485760-byte limit", () => {
    expect(ACCEPTED_MIME_TYPES).toEqual(["image/jpeg", "image/png", "application/pdf"]);
    expect(MAX_UPLOAD_BYTES).toBe(10485760);
  });
  it("starts calendar months without timezone drift", () => {
    expect(monthStartISO("2026-03-29")).toBe("2026-03-01");
    expect(monthStartISO("2026-10-25")).toBe("2026-10-01");
  });
  it("adds months across years and clamps month ends", () => {
    expect(addMonthsISO("2026-12-31", 1)).toBe("2027-01-31");
    expect(addMonthsISO("2024-01-31", 1)).toBe("2024-02-29");
    expect(addMonthsISO("2026-03-31", -1)).toBe("2026-02-28");
  });
  it("rejects invalid dates and fractional months", () => {
    expect(() => monthStartISO("2026-02-30")).toThrow();
    expect(() => addMonthsISO("2026-01-01", 0.5)).toThrow();
  });
  it("removes traversal and adds a UUID", () => {
    expect(buildStoragePath(user, "../../x.png")).toMatch(
      new RegExp(`^${user}/[0-9a-f-]{36}-x\\.png$`),
    );
    expect(buildStoragePath(user, "..\\..\\x.png")).toMatch(/-x\.png$/);
    expect(buildStoragePath(user, "bad <>?: name.pdf")).toMatch(/-bad______name\.pdf$/);
  });
  it("limits the filename to 120 characters while keeping its extension", () => {
    const path = buildStoragePath(user, "a".repeat(200) + ".pdf");
    expect(path.slice(74).length).toBe(120);
    expect(path).toMatch(/\.pdf$/);
  });
  it("prevents user-folder injection and generates unique paths", () => {
    expect(() => buildStoragePath("../other", "x.png")).toThrow();
    expect(buildStoragePath(user, "x.png")).not.toBe(buildStoragePath(user, "x.png"));
  });
  it("rejects a zero-byte file", () => {
    expect(validateUpload({ name: "x.png", type: "image/png", size: 0 }).ok).toBe(false);
  });
  it("rejects an 11 MB file", () => {
    expect(
      validateUpload({ name: "x.pdf", type: "application/pdf", size: 11 * 1024 * 1024 }).ok,
    ).toBe(false);
  });
  it("rejects executable files, even with a spoofed MIME type", () => {
    expect(validateUpload({ name: "x.exe", type: "application/octet-stream", size: 100 }).ok).toBe(
      false,
    );
    expect(validateUpload({ name: "x.exe", type: "image/png", size: 100 }).ok).toBe(false);
  });
  it("accepts the exact 10 MB boundary and all permitted types", () => {
    expect(validateUpload({ name: "x.pdf", type: "application/pdf", size: 10485760 })).toEqual({
      ok: true,
    });
    expect(validateUpload({ name: "x.JPG", type: "image/jpeg", size: 1 })).toEqual({ ok: true });
    expect(validateUpload({ name: "x.png", type: "image/png", size: 1 })).toEqual({ ok: true });
  });
});
