import { describe, expect, it } from "vitest";
import {
  describeSubscription,
  rowFromStripeSubscription,
  trialEligible,
  unlocksApp,
} from "./billing";

describe("subscription access", () => {
  it("only a trial or a paid subscription opens the app", () => {
    expect(unlocksApp({ status: "trialing" })).toBe(true);
    expect(unlocksApp({ status: "active" })).toBe(true);
    for (const status of [
      "none",
      "past_due",
      "unpaid",
      "canceled",
      "incomplete",
      "incomplete_expired",
      "paused",
    ])
      expect(unlocksApp({ status })).toBe(false);
    expect(unlocksApp(null)).toBe(false);
    expect(unlocksApp(undefined)).toBe(false);
  });
  it("gives the free trial to a first subscription only", () => {
    expect(trialEligible(null)).toBe(true);
    expect(trialEligible({ status: "none", stripe_subscription_id: null })).toBe(true);
    expect(trialEligible({ status: "canceled", stripe_subscription_id: "sub_1" })).toBe(false);
  });
});

describe("subscription wording", () => {
  it("states the trial end date and the price after it", () => {
    expect(describeSubscription({ status: "trialing", trial_end: "2026-12-03T10:00:00Z" })).toBe(
      "Free trial until 3 December 2026, then £6.99 a month.",
    );
  });
  it("states the next payment date", () => {
    expect(
      describeSubscription({ status: "active", current_period_end: "2027-01-19T10:00:00Z" }),
    ).toBe("£6.99 a month. Next payment on 19 January 2027.");
  });
  it("says when a cancelled subscription stops working", () => {
    expect(
      describeSubscription({
        status: "active",
        current_period_end: "2027-01-19T10:00:00Z",
        cancel_at_period_end: true,
      }),
    ).toBe("Cancelled. You can use AVENZA until 19 January 2027.");
  });
  it("asks for a new card after a failed payment", () => {
    expect(describeSubscription({ status: "past_due" })).toMatch(/Update your card/);
  });
});

describe("reading a Stripe subscription", () => {
  it("takes the period end from the subscription item (current Stripe API)", () => {
    expect(
      rowFromStripeSubscription({
        id: "sub_1",
        status: "trialing",
        customer: "cus_1",
        trial_end: 1796300000,
        cancel_at_period_end: false,
        items: { data: [{ current_period_end: 1796300000 }] },
      }),
    ).toEqual({
      stripe_subscription_id: "sub_1",
      stripe_customer_id: "cus_1",
      status: "trialing",
      trial_end: new Date(1796300000 * 1000).toISOString(),
      current_period_end: new Date(1796300000 * 1000).toISOString(),
      cancel_at_period_end: false,
    });
  });
  it("accepts an expanded customer and an older API shape", () => {
    const row = rowFromStripeSubscription({
      id: "sub_2",
      status: "active",
      customer: { id: "cus_2" },
      current_period_end: 1796300000,
    });
    expect(row.stripe_customer_id).toBe("cus_2");
    expect(row.current_period_end).toBe(new Date(1796300000 * 1000).toISOString());
    expect(row.trial_end).toBeNull();
  });
});
