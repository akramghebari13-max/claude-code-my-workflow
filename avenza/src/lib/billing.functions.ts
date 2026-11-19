import { createServerFn } from "@tanstack/react-start";
import { getRequestUrl } from "@tanstack/react-start/server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { PLAN, trialEligible, unlocksApp } from "./billing";

const NOT_SET_UP = "Payments aren't set up yet. Add the Stripe keys to AVENZA's secrets first.";

/** Start Stripe Checkout for the £6.99/month plan. Returns the page the browser should open. */
export const startCheckout = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ url: string } | { error: string }> => {
    const { stripeClient } = await import("./billing.server");
    const stripe = stripeClient();
    if (!stripe) return { error: NOT_SET_UP };
    const userId = context.userId;
    const { data: existing } = await context.supabase
      .from("subscriptions")
      .select("status, stripe_customer_id, stripe_subscription_id")
      .eq("user_id", userId)
      .maybeSingle();
    if (unlocksApp(existing)) return { error: "You already have an active subscription." };

    let customer = existing?.stripe_customer_id ?? null;
    if (!customer) {
      const email =
        typeof context.claims["email"] === "string" ? context.claims["email"] : undefined;
      const created = await stripe.customers.create({
        ...(email ? { email } : {}),
        metadata: { user_id: userId },
      });
      customer = created.id;
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { error } = await supabaseAdmin
        .from("subscriptions")
        .upsert({ user_id: userId, stripe_customer_id: customer }, { onConflict: "user_id" });
      if (error) return { error: "Couldn't start the subscription. Try again." };
    }

    const origin = getRequestUrl().origin;
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer,
      client_reference_id: userId,
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: PLAN.currency,
            unit_amount: PLAN.amountPence,
            recurring: { interval: PLAN.interval },
            product_data: { name: PLAN.name, description: "Bookkeeping, VAT, tax and My Files" },
          },
        },
      ],
      subscription_data: {
        metadata: { user_id: userId },
        ...(trialEligible(existing) ? { trial_period_days: PLAN.trialDays } : {}),
      },
      success_url: `${origin}/subscribe?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/subscribe?checkout=cancelled`,
    });
    if (!session.url) return { error: "Stripe didn't return a checkout page. Try again." };
    return { url: session.url };
  });

/**
 * After Checkout, save the subscription straight away rather than waiting for the webhook,
 * so the user gets in immediately. Only the user who started the checkout can finish it.
 */
export const finishCheckout = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { sessionId: string }) => {
    if (typeof i?.sessionId !== "string" || !/^cs_[A-Za-z0-9_]{10,200}$/.test(i.sessionId))
      throw new Error("Invalid request");
    return { sessionId: i.sessionId };
  })
  .handler(async ({ data, context }): Promise<{ ok: true } | { error: string }> => {
    const { stripeClient, saveSubscription } = await import("./billing.server");
    const stripe = stripeClient();
    if (!stripe) return { error: NOT_SET_UP };
    const session = await stripe.checkout.sessions.retrieve(data.sessionId, {
      expand: ["subscription"],
    });
    if (session.client_reference_id !== context.userId)
      return { error: "This checkout belongs to a different account." };
    const sub = session.subscription;
    if (!sub || typeof sub === "string")
      return { error: "Stripe hasn't finished setting up your subscription. Refresh in a moment." };
    await saveSubscription(context.userId, sub);
    return { ok: true };
  });

/** Stripe's billing page: change card, see invoices, cancel. */
export const openBillingPortal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ url: string } | { error: string }> => {
    const { stripeClient } = await import("./billing.server");
    const stripe = stripeClient();
    if (!stripe) return { error: NOT_SET_UP };
    const { data: sub } = await context.supabase
      .from("subscriptions")
      .select("stripe_customer_id")
      .eq("user_id", context.userId)
      .maybeSingle();
    if (!sub?.stripe_customer_id) return { error: "You don't have a subscription yet." };
    const portal = await stripe.billingPortal.sessions.create({
      customer: sub.stripe_customer_id,
      return_url: `${getRequestUrl().origin}/dashboard`,
    });
    return { url: portal.url };
  });
