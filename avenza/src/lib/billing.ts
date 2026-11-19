// Subscription rules shared by the browser, the server functions and the Stripe webhook.

export const PLAN = {
  name: "AVENZA",
  amountPence: 699,
  currency: "gbp",
  interval: "month",
  trialDays: 14,
} as const;

export const PLAN_PRICE_TEXT = "£6.99";

export type SubscriptionRow = {
  status: string;
  stripe_subscription_id?: string | null;
  trial_end?: string | null;
  current_period_end?: string | null;
  cancel_at_period_end?: boolean | null;
};

/** Stripe statuses that let someone use the app. Everything else shows "Subscribe to continue". */
const UNLOCKING = new Set(["trialing", "active"]);

export function unlocksApp(sub: SubscriptionRow | null | undefined): boolean {
  return !!sub && UNLOCKING.has(sub.status);
}

/** The free trial is for a first subscription only. */
export function trialEligible(sub: SubscriptionRow | null | undefined): boolean {
  return !sub?.stripe_subscription_id;
}

const ukDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-GB", {
    timeZone: "Europe/London",
    day: "numeric",
    month: "long",
    year: "numeric",
  });

/** One plain-English line describing where the subscription stands. */
export function describeSubscription(sub: SubscriptionRow | null | undefined): string {
  if (!sub || sub.status === "none") return "You don't have a subscription yet.";
  if (sub.status === "trialing" && sub.trial_end)
    return sub.cancel_at_period_end
      ? `Free trial ends on ${ukDate(sub.trial_end)} and won't renew.`
      : `Free trial until ${ukDate(sub.trial_end)}, then ${PLAN_PRICE_TEXT} a month.`;
  if (sub.status === "active" && sub.current_period_end)
    return sub.cancel_at_period_end
      ? `Cancelled. You can use AVENZA until ${ukDate(sub.current_period_end)}.`
      : `${PLAN_PRICE_TEXT} a month. Next payment on ${ukDate(sub.current_period_end)}.`;
  if (sub.status === "past_due" || sub.status === "unpaid")
    return "Your last payment didn't go through. Update your card to keep using AVENZA.";
  if (sub.status === "canceled") return "Your subscription has ended.";
  return "Your subscription isn't active.";
}

/** The fields we keep from a Stripe subscription (works with old and new Stripe API shapes). */
export function rowFromStripeSubscription(s: {
  id: string;
  status: string;
  customer: string | { id: string };
  trial_end?: number | null;
  cancel_at_period_end?: boolean | null;
  current_period_end?: number | null;
  items?: { data?: { current_period_end?: number | null }[] };
}) {
  const end = s.current_period_end ?? s.items?.data?.[0]?.current_period_end ?? null;
  const iso = (t: number | null | undefined) => (t ? new Date(t * 1000).toISOString() : null);
  return {
    stripe_subscription_id: s.id,
    stripe_customer_id: typeof s.customer === "string" ? s.customer : s.customer.id,
    status: s.status,
    trial_end: iso(s.trial_end),
    current_period_end: iso(end),
    cancel_at_period_end: !!s.cancel_at_period_end,
  };
}
