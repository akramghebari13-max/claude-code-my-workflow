import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { friendlyError } from "@/lib/app";
import { linkError, MIN_PASSWORD, passwordProblem } from "@/lib/passwords";

// Opened from the reset email. Supabase checks the link (single use, expires after the time set
// in Auth settings) and signs the person in for this one purpose before this page runs.
export const Route = createFileRoute("/reset-password")({
  ssr: false,
  head: () => ({
    meta: [{ title: "Choose a new password — AVENZA" }, { name: "robots", content: "noindex" }],
  }),
  component: ResetPassword,
});

function ResetPassword() {
  const navigate = useNavigate();
  const [state, setState] = useState<"checking" | "ready" | "bad">("checking");
  const [problem, setProblem] = useState<string | null>(null);
  const [pw, setPw] = useState("");
  const [again, setAgain] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const err = linkError(window.location.hash);
    if (err) {
      setProblem(err);
      setState("bad");
      return;
    }
    const { data } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") setState("ready");
    });
    // Give the link a moment to be exchanged; with no recovery session, the link was bad.
    const t = setTimeout(async () => {
      const { data: s } = await supabase.auth.getSession();
      setState((cur) => (cur === "checking" ? (s.session ? "ready" : "bad") : cur));
    }, 1500);
    return () => {
      clearTimeout(t);
      data.subscription.unsubscribe();
    };
  }, []);

  async function save(e: FormEvent) {
    e.preventDefault();
    const p = passwordProblem(pw, again);
    if (p) {
      toast.error(p);
      return;
    }
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password: pw });
    if (error) {
      toast.error(friendlyError(error));
      setBusy(false);
      return;
    }
    // Anyone else signed in with the old password is signed out.
    await supabase.auth.signOut({ scope: "others" });
    toast.success("Password changed.");
    navigate({ to: "/dashboard", replace: true });
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-12">
      <div className="w-full max-w-sm rounded-xl border bg-card p-8 shadow-sm">
        <h1 className="text-3xl font-semibold text-primary">AVENZA</h1>
        {state === "checking" ? (
          <p className="mt-6 text-sm text-muted-foreground">Checking your link…</p>
        ) : state === "bad" ? (
          <div className="mt-6 grid gap-4 text-sm">
            <p role="alert">
              {problem ?? "This link has expired or has already been used. Ask for a new one."}
            </p>
            <Button asChild>
              <Link to="/auth">Back to sign in</Link>
            </Button>
          </div>
        ) : (
          <form onSubmit={save} className="mt-6 grid gap-4">
            <p className="text-sm text-muted-foreground">
              Choose a new password. At least {MIN_PASSWORD} characters.
            </p>
            <div className="grid gap-1.5">
              <Label htmlFor="new-password">New password</Label>
              <Input
                id="new-password"
                type="password"
                autoComplete="new-password"
                minLength={MIN_PASSWORD}
                maxLength={72}
                value={pw}
                onChange={(e) => setPw(e.target.value)}
                required
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="new-password-2">Type it again</Label>
              <Input
                id="new-password-2"
                type="password"
                autoComplete="new-password"
                value={again}
                onChange={(e) => setAgain(e.target.value)}
                required
              />
            </div>
            <Button type="submit" disabled={busy}>
              {busy ? "Saving…" : "Save new password"}
            </Button>
          </form>
        )}
      </div>
    </div>
  );
}
