import { createFileRoute } from "@tanstack/react-router";
import Stripe from "stripe";

// Stripe calls this whenever a subscription starts, renews, fails to renew or is cancelled.
// The signature proves the call came from Stripe; without it nothing is written.
const HANDLED = new Set([
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "customer.subscription.paused",
  "customer.subscription.resumed",
]);

export const Route = createFileRoute("/api/public/stripe/webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = process.env["STRIPE_WEBHOOK_SECRET"]?.trim();
        const { stripeClient, saveSubscription, userForSubscription } =
          await import("@/lib/billing.server");
        const stripe = stripeClient();
        if (!stripe || !secret) return new Response("Stripe is not configured", { status: 503 });

        const signature = request.headers.get("stripe-signature");
        if (!signature) return new Response("Missing signature", { status: 400 });
        const body = await request.text();
        let event: Stripe.Event;
        try {
          event = await stripe.webhooks.constructEventAsync(
            body,
            signature,
            secret,
            undefined,
            Stripe.createSubtleCryptoProvider(),
          );
        } catch {
          return new Response("Invalid signature", { status: 400 });
        }

        if (HANDLED.has(event.type)) {
          const sub = event.data.object as Stripe.Subscription;
          const userId = await userForSubscription(sub);
          // Unknown subscriptions (e.g. made by hand in the Stripe dashboard) are acknowledged and ignored.
          if (userId) await saveSubscription(userId, sub);
        }
        return new Response("ok", { status: 200 });
      },
    },
  },
});
