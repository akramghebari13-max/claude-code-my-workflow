import { describe, expect, it } from "vitest";
import { historyMatch, pickCategory } from "./categorise";

const opts = [{ id: "a", code: "5000", name: "Materials" }, { id: "b", code: "6100", name: "Travel" }];
describe("categorise", () => {
  it("only accepts an allowed account code", () => {
    expect(pickCategory("6100", opts)?.id).toBe("b");
    expect(pickCategory("Account 9999", opts)).toBeNull();
    expect(pickCategory("travel", opts)).toBeNull();
  });
  it("reuses the most common past category for the same payee", () => {
    const past = [{ text: "SCREWFIX LEEDS", categoryId: "a" }, { text: "Screwfix", categoryId: "a" }, { text: "Screwfix", categoryId: "b" }];
    expect(historyMatch("CARD PAYMENT SCREWFIX 1234", past)).toBe("a");
    expect(historyMatch("TRAINLINE", past)).toBeNull();
  });
});
