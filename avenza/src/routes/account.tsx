import { createFileRoute, Link, redirect, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { friendlyError } from "@/lib/app";
import { deleteMyAccount } from "@/lib/account.functions";
import { isNativeApp } from "@/lib/platform";

// Outside the subscription gate on purpose: anyone signed in can delete their account,
// including people whose subscription has ended (App Store rule 5.1.1(v), UK GDPR).
export const Route = createFileRoute("/account")({
  ssr: false,
  beforeLoad: async () => {
    const { data } = await supabase.auth.getUser();
    if (!data.user) throw redirect({ to: "/auth", search: { redirect: "/account" } });
    return { user: data.user };
  },
  head: () => ({
    meta: [
      { title: "Your account — AVENZA" },
      { name: "description", content: "Billing, privacy and deleting your account." },
    ],
  }),
  component: Account,
});

const CONFIRM = "DELETE";

function Account() {
  const { user } = Route.useRouteContext();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const remove = useServerFn(deleteMyAccount);
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function deleteAccount() {
    setBusy(true);
    setError(null);
    try {
      const r = await remove({ data: { confirm: typed } });
      if ("error" in r) {
        setError(r.error);
        return;
      }
      qc.clear();
      await supabase.auth.signOut({ scope: "local" });
      toast.success("Your account has been deleted.");
      navigate({ to: "/", replace: true });
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <Link to="/dashboard" className="font-display text-xl font-semibold text-primary">
            AVENZA
          </Link>
          <Button asChild variant="ghost" size="sm">
            <Link to="/dashboard">Back to your books</Link>
          </Button>
        </div>
      </header>
      <main className="mx-auto max-w-lg px-6 py-12">
        <h1 className="text-4xl font-semibold">Your account</h1>
        <p className="mt-3 break-all text-muted-foreground">{user.email}</p>

        <nav className="mt-8 grid divide-y rounded-xl border bg-card" aria-label="Account">
          {/* Store apps can't link to payments outside Apple/Google billing. */}
          {!isNativeApp() && (
            <Link
              to="/subscribe"
              className="flex min-h-12 items-center px-4 font-medium hover:bg-muted"
            >
              Subscription and billing
            </Link>
          )}
          <Link
            to="/privacy"
            className="flex min-h-12 items-center px-4 font-medium hover:bg-muted"
          >
            Privacy policy
          </Link>
        </nav>

        <section
          className="mt-10 rounded-xl border border-destructive/40 bg-card p-6"
          aria-labelledby="delete-h"
        >
          <h2 id="delete-h" className="text-2xl font-semibold">
            Delete your account
          </h2>
          <p className="mt-3 text-sm">This can't be undone. Straight away, we delete:</p>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
            <li>your login and everything in My Files</li>
            <li>
              every business you own on your own, with all its books, invoices, bank lines, receipts
              and returns
            </li>
            <li>
              your subscription, which ends now (cancelling it here also stops future payments)
            </li>
          </ul>
          <p className="mt-3 text-sm">
            Businesses you share with another owner stay with them; you're just removed.
          </p>
          <p className="mt-3 rounded-md bg-muted p-3 text-sm">
            <strong>Keep your records first.</strong> HMRC requires businesses to keep records for
            at least 5 years after the 31 January deadline (6 years for companies). Download your
            reports from each business's Reports page before you delete.
          </p>
          <div className="mt-5 grid gap-1.5">
            <Label htmlFor="confirm-delete">Type {CONFIRM} to confirm</Label>
            <Input
              id="confirm-delete"
              className="h-11"
              autoComplete="off"
              autoCapitalize="characters"
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
            />
          </div>
          <Button
            variant="destructive"
            className="mt-4 h-11 w-full"
            disabled={busy || typed.trim() !== CONFIRM}
            onClick={deleteAccount}
          >
            {busy ? "Deleting…" : "Delete my account permanently"}
          </Button>
          <div aria-live="polite">
            {error && (
              <p role="alert" className="mt-3 text-sm text-destructive">
                {error}
              </p>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}
