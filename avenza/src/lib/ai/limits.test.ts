import { describe, expect, it } from "vitest";
import { AI_LIMIT_MESSAGE, aiLimitMessage } from "./limits";

const sb = (data: boolean | null, error: unknown = null) => ({
  rpc: async () => ({ data, error }),
});

describe("AI allowance", () => {
  it("goes ahead only when the database grants a slot", async () => {
    expect(await aiLimitMessage(sb(true), "bank_category")).toBeNull();
    expect(await aiLimitMessage(sb(false), "bank_category")).toBe(AI_LIMIT_MESSAGE);
  });
  it("refuses AI if the check itself fails", async () => {
    expect(await aiLimitMessage(sb(null, { message: "boom" }), "report_question")).toMatch(
      /unavailable/,
    );
    expect(await aiLimitMessage(sb(null), "report_question")).toBe(AI_LIMIT_MESSAGE);
  });
});
