import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { DELETE_WORD } from "./account.server";

/** Permanently delete the signed-in person's account. Works with or without a subscription. */
export const deleteMyAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { confirm: string }) => ({ confirm: String(i?.confirm ?? "").trim() }))
  .handler(async ({ data, context }): Promise<{ ok: true } | { error: string }> => {
    if (data.confirm !== DELETE_WORD) return { error: `Type ${DELETE_WORD} to confirm.` };
    const userId = context.userId;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { stripeClient } = await import("./billing.server");
    const { deleteAccountEverywhere } = await import("./account.server");
    const { data: sub } = await supabaseAdmin
      .from("subscriptions")
      .select("stripe_customer_id")
      .eq("user_id", userId)
      .maybeSingle();
    const stripe = stripeClient();
    try {
      await deleteAccountEverywhere({
        userId,
        stripeCustomerId: sub?.stripe_customer_id ?? null,
        deleteStripeCustomer: stripe
          ? async (id) => {
              try {
                await stripe.customers.del(id);
              } catch (e) {
                // Already deleted in Stripe: nothing left to cancel.
                if ((e as { code?: string }).code !== "resource_missing") throw e;
              }
            }
          : null,
        businessesToDelete: async () => {
          const { data: ids, error } = await supabaseAdmin.rpc("account_deletion_businesses", {
            _user_id: userId,
          });
          if (error) throw new Error(error.message);
          return (ids ?? []) as string[];
        },
        storage: supabaseAdmin.storage,
        deleteData: async () => {
          const { error } = await supabaseAdmin.rpc("delete_account_data", { _user_id: userId });
          if (error) throw new Error(error.message);
        },
        deleteLogin: async () => {
          const { error } = await supabaseAdmin.auth.admin.deleteUser(userId);
          if (error && error.status !== 404) throw new Error(error.message);
        },
      });
      return { ok: true };
    } catch (e) {
      console.error("account deletion stopped:", e instanceof Error ? e.message : e);
      return {
        error:
          "Your account couldn't be fully deleted. Please try again, or contact us if it keeps happening.",
      };
    }
  });
