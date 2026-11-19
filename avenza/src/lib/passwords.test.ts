import { describe, expect, it } from "vitest";
import { linkError, passwordProblem } from "./passwords";

describe("passwords", () => {
  it("asks for long, not obvious passwords", () => {
    expect(passwordProblem("short")).toMatch(/at least 10/);
    expect(passwordProblem("aaaaaaaaaaaa")).toMatch(/easy to guess/);
    expect(passwordProblem("password123")).toMatch(/easy to guess/);
    expect(passwordProblem("x".repeat(73))).toMatch(/72/);
    expect(passwordProblem("timber-kettle-41")).toBeNull();
    expect(passwordProblem("timber-kettle-41", "timber-kettle-42")).toMatch(/don't match/);
  });
  it("explains expired or used reset links", () => {
    expect(
      linkError(
        "#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired",
      ),
    ).toMatch(/expired or has already been used/);
    expect(linkError("#access_token=abc&type=recovery")).toBeNull();
    expect(linkError("")).toBeNull();
  });
});
