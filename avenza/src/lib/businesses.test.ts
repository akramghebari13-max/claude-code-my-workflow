import { describe, expect, it } from "vitest";
import { isValidCompanyNumber, isValidUtr, isValidVatNumber } from "./businesses";

describe("UK identifiers", () => {
  it("accepts 8-digit and prefixed company numbers", () => {
    expect(isValidCompanyNumber("12345678")).toBe(true);
    expect(isValidCompanyNumber("SC123456")).toBe(true);
    expect(isValidCompanyNumber("1234567")).toBe(false);
  });
  it("requires 10-digit UTR", () => {
    expect(isValidUtr("12345 67890")).toBe(true);
    expect(isValidUtr("123456789")).toBe(false);
  });
  it("accepts VAT numbers with valid HMRC check digits", () => {
    expect(isValidVatNumber("GB 980 7806 84")).toBe(true);
    expect(isValidVatNumber("980780684001")).toBe(true);
  });
  it("rejects VAT numbers with wrong check digits or length", () => {
    expect(isValidVatNumber("GB980780685")).toBe(false);
    expect(isValidVatNumber("GB12345678")).toBe(false);
  });
});
