// Server-only: talks to Stripe and writes the subscriptions table with the service role.
// Loaded from inside server handlers only (dynamic import), so the secret key never reaches the browser.
import Stripe from "stripe";
import { rowFromStripeSubscription } from "./billing";

export function stripeClient(): Stripe | null {
  const key = process.env["STRIPE_SECRET_KEY"]?.trim();
  if (!key) return null;
  // Fetch client: the app runs on Cloudflare Workers, which have no Node http module.
  return new Stripe(key, { httpClient: Stripe.createFetchHttpClient() });
}

/** Save a Stripe subscription against the AVENZA user it belongs to. */
export async function saveSubscription(userId: string, sub: Stripe.Subscription) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { error } = await supabaseAdmin
    .from("subscriptions")
    .upsert({ user_id: userId, ...rowFromStripeSubscription(sub) }, { onConflict: "user_id" });
  // 23503: the person deleted their account; Stripe is reporting the cancellation that caused.
  if (error?.code === "23503") return;
  if (error) throw new Error(`Couldn't save subscription: ${error.message}`);
}

/** Which AVENZA user a Stripe subscription belongs to: its metadata first, then its customer. */
export async function userForSubscription(sub: Stripe.Subscription): Promise<string | null> {
  const fromMeta = sub.metadata?.["user_id"];
  if (fromMeta) return fromMeta;
  const customer = typeof sub.customer === "string" ? sub.customer : sub.customer.id;
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("subscriptions")
    .select("user_id")
    .eq("stripe_customer_id", customer)
    .maybeSingle();
  return data?.user_id ?? null;
}
