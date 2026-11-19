import { createFileRoute, Link, redirect, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { Check } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { friendlyError } from "@/lib/app";
import {
  describeSubscription,
  PLAN,
  PLAN_PRICE_TEXT,
  trialEligible,
  unlocksApp,
} from "@/lib/billing";
import { finishCheckout, openBillingPortal, startCheckout } from "@/lib/billing.functions";

export const Route = createFileRoute("/subscribe")({
  ssr: false,
  validateSearch: (s: Record<string, unknown>): { checkout?: string; session_id?: string } => ({
    ...(typeof s["checkout"] === "string" ? { checkout: s["checkout"].slice(0, 20) } : {}),
    ...(typeof s["session_id"] === "string" ? { session_id: s["session_id"].slice(0, 220) } : {}),
  }),
  beforeLoad: async () => {
    const { data } = await supabase.auth.getUser();
    if (!data.user) throw redirect({ to: "/auth", search: { redirect: "/subscribe" } });
    return { user: data.user };
  },
  head: () => ({
    meta: [
      { title: "Subscribe — AVENZA" },
      {
        name: "description",
        content: `AVENZA is ${PLAN_PRICE_TEXT} a month after a ${PLAN.trialDays}-day free trial.`,
      },
    ],
  }),
  component: Subscribe,
});

const INCLUDED = [
  "Double-entry books for every business you run",
  "Invoices, credit notes and bank reconciliation",
  "VAT returns and HMRC Making Tax Digital",
  "Reports and tax estimates",
  "My Files for your personal finances",
];

function Subscribe() {
  const { user } = Route.useRouteContext();
  const search = Route.useSearch();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const checkout = useServerFn(startCheckout);
  const finish = useServerFn(finishCheckout);
  const portal = useServerFn(openBillingPortal);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sub = useQuery({
    queryKey: ["subscription", user.id],
    retry: 1,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("subscriptions")
        .select("*")
        .eq("user_id", user.id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  // Back from Stripe Checkout: save the new subscription, then go into the app.
  useEffect(() => {
    if (search.checkout !== "success" || !search.session_id) return;
    setBusy(true);
    finish({ data: { sessionId: search.session_id } })
      .then(async (r) => {
        if ("error" in r) {
          setError(r.error);
          return;
        }
        await qc.invalidateQueries({ queryKey: ["subscription", user.id] });
        navigate({ to: "/dashboard", replace: true });
      })
      .catch((e) => setError(friendlyError(e)))
      .finally(() => setBusy(false));
  }, [search.checkout, search.session_id]);

  async function go(fn: typeof checkout) {
    setBusy(true);
    setError(null);
    try {
      const r = await fn();
      if ("error" in r) setError(r.error);
      else window.location.href = r.url;
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setBusy(false);
    }
  }

  async function signOut() {
    qc.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", search: { redirect: undefined }, replace: true });
  }

  const row = sub.data;
  const active = unlocksApp(row);
  const trial = trialEligible(row);

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <span className="font-display text-xl font-semibold text-primary">AVENZA</span>
          <div className="flex items-center gap-3">
            <span className="hidden text-sm text-muted-foreground sm:inline">{user.email}</span>
            <Button variant="ghost" size="sm" onClick={signOut}>
              Sign out
            </Button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-lg px-6 py-12">
        <h1 className="text-4xl font-semibold">
          {active ? "Your subscription" : "Subscribe to continue"}
        </h1>
        <p className="mt-3 text-muted-foreground">
          {search.checkout === "cancelled" && !active
            ? "Checkout was cancelled — nothing was charged. "
            : ""}
          {sub.isLoading
            ? "Checking your subscription…"
            : sub.isError
              ? "Couldn't check your subscription. You can still start one below."
              : describeSubscription(row)}
        </p>

        <section className="mt-8 rounded-2xl border bg-card p-8">
          <p className="text-[13px] font-semibold uppercase tracking-[0.12em] text-primary">
            AVENZA
          </p>
          <p className="mt-3 font-display text-5xl font-semibold text-primary">
            {PLAN_PRICE_TEXT}
            <span className="ml-1 font-sans text-base text-muted-foreground">/ month</span>
          </p>
          <p className="mt-2 text-sm text-muted-foreground">
            {trial
              ? `${PLAN.trialDays}-day free trial. Cancel any time before it ends and you won't be charged.`
              : "Cancel any time."}
          </p>
          <ul className="mt-6 grid gap-3 text-base">
            {INCLUDED.map((f) => (
              <li key={f} className="flex items-start gap-3">
                <Check className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden="true" />
                {f}
              </li>
            ))}
          </ul>
          <div className="mt-8 grid gap-3">
            {active ? (
              <Button asChild className="h-12 rounded-full text-base">
                <Link to="/dashboard">Go to your books</Link>
              </Button>
            ) : (
              <Button
                className="h-12 rounded-full text-base"
                disabled={busy || sub.isLoading}
                onClick={() => go(checkout)}
              >
                {busy
                  ? "Opening secure checkout…"
                  : trial
                    ? "Start free trial"
                    : `Subscribe for ${PLAN_PRICE_TEXT} a month`}
              </Button>
            )}
            {row?.stripe_customer_id && (
              <Button
                variant="outline"
                className="h-11 rounded-full"
                disabled={busy}
                onClick={() => go(portal)}
              >
                Manage billing
              </Button>
            )}
          </div>
          <div aria-live="polite">
            {error && (
              <p role="alert" className="mt-4 text-sm text-destructive">
                {error}
              </p>
            )}
          </div>
        </section>
        <p className="mt-6 text-xs text-muted-foreground">
          Payments are handled by Stripe. Your records stay yours: if you stop paying, your data is
          kept, and you can come back to it by subscribing again.
        </p>
      </main>
    </div>
  );
}
