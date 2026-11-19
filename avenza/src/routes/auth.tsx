import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { friendlyError } from "@/lib/app";
import { linkError, MIN_PASSWORD, passwordProblem } from "@/lib/passwords";
import { Captcha, captchaEnabled } from "@/components/captcha";
import { useEffect, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { LovableMark } from "@lovable.dev/cloud-auth-js/react";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/auth")({
  validateSearch: (s: Record<string, unknown>): { redirect?: string | undefined } => {
    const r = s["redirect"];
    return { redirect: typeof r === "string" && r.startsWith("/") && !r.startsWith("//") ? r : undefined };
  },
  head: () => ({
    meta: [
      { title: "Sign in — AVENZA" },
      { name: "description", content: "Sign in or create your AVENZA account." },
      { property: "og:title", content: "Sign in — AVENZA" },
      { property: "og:description", content: "Sign in or create your AVENZA account." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AuthPage,
});

const GoogleG = () => (
  <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24"><path fill="#4285F4" d="M23.49 12.27c0-.79-.07-1.54-.19-2.27H12v4.51h6.47c-.29 1.48-1.14 2.73-2.4 3.58v3h3.86c2.26-2.09 3.56-5.17 3.56-8.82z"/><path fill="#34A853" d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.86-3c-1.08.72-2.45 1.16-4.07 1.16-3.13 0-5.78-2.11-6.73-4.96H1.29v3.09C3.26 21.3 7.31 24 12 24z"/><path fill="#FBBC05" d="M5.27 14.29c-.25-.72-.38-1.49-.38-2.29s.14-1.57.38-2.29V6.62H1.29C.47 8.24 0 10.06 0 12s.47 3.76 1.29 5.38l3.98-3.09z"/><path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.62l3.98 3.09c.95-2.85 3.6-4.96 6.73-4.96z"/></svg>
);

const AppleMark = () => (
  <svg aria-hidden="true" width="16" height="18" viewBox="0 0 814 1000" fill="currentColor"><path d="M788 341c-6 4-110 63-110 193 0 150 132 203 136 204-1 3-21 72-70 143-43 62-89 125-158 125s-87-40-167-40c-78 0-106 41-169 41s-107-58-158-129C33 795 0 674 0 559c0-185 120-283 239-283 63 0 115 41 155 41 38 0 97-44 169-44 27 0 126 3 193 99zM554 169c30-35 51-84 51-133 0-7-1-14-2-19-48 2-106 32-140 72-27 31-53 80-53 130 0 8 1 15 2 18 3 1 9 2 14 2 43 0 97-29 128-70z"/></svg>
);

function AuthPage() {
  const { redirect } = Route.useSearch();
  const navigate = useNavigate();
  const [mode, setMode] = useState<"signin" | "signup" | "reset">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const target = redirect ?? "/dashboard";
  const needCaptcha = captchaEnabled();
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [captchaRound, setCaptchaRound] = useState(0);
  const captcha = captchaToken ? { captchaToken } : {};
  // An expired or used confirmation link lands here with the reason after #.
  useEffect(() => { const err = linkError(window.location.hash); if (err) toast.error(err); }, []);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => { if (data.user) navigate({ to: target }); });
    const { data } = supabase.auth.onAuthStateChange((e) => { if (e === "SIGNED_IN") navigate({ to: target }); });
    return () => data.subscription.unsubscribe();
  }, [navigate, target]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (needCaptcha && !captchaToken) { toast.error("Complete the check above the button first."); return; }
    setBusy(true);
    if (mode === "reset") {
      const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin + "/reset-password", ...captcha });
      // Same answer whether or not the email has an account, so nobody can use this to find out.
      if (error && /rate limit|too many|captcha/i.test(error.message)) toast.error(friendlyError(error)); else setSent(true);
    } else if (mode === "signup") {
      const problem = passwordProblem(password);
      if (problem) { toast.error(problem); setBusy(false); return; }
      const { error } = await supabase.auth.signUp({ email, password, options: { emailRedirectTo: window.location.origin + "/dashboard", data: { full_name: name }, ...captcha } });
      if (error) toast.error(friendlyError(error)); else setSent(true);
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email, password, options: captcha });
      if (error) toast.error(friendlyError(error));
    }
    // Each check works once: get a fresh one for the next attempt.
    if (needCaptcha) setCaptchaRound((n) => n + 1);
    setBusy(false);
  }

  async function social(p: "apple" | "google" | "lovable") {
    const r = await lovable.auth.signInWithOAuth(p, { redirect_uri: window.location.origin + "/auth" });
    if (r.error) toast.error(r.error.message ?? "Sign-in failed");
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-12">
      <div className="w-full max-w-sm rounded-xl border bg-card p-8 shadow-sm">
        <h1 className="text-3xl font-semibold text-primary">AVENZA</h1>
        {sent ? (
          <div className="mt-6 grid gap-4 text-sm text-muted-foreground">
            {mode === "reset"
              ? <p>If <strong className="text-foreground">{email}</strong> has an AVENZA account, we've sent it a link to choose a new password. The link works once and expires in an hour.</p>
              : <p>Check <strong className="text-foreground">{email}</strong> for a link to confirm your account.</p>}
            <button type="button" className="w-fit text-primary underline-offset-4 hover:underline" onClick={() => { setSent(false); setMode("signin"); }}>Back to sign in</button>
          </div>
        ) : (
          <>
            <p className="mt-2 text-sm text-muted-foreground">{mode === "signin" ? "Sign in to your books." : mode === "signup" ? "Create your account." : "We'll email you a link to choose a new password."}</p>
            {mode !== "reset" && <>
            <div className="mt-6 grid gap-2">
              {/* Apple requires this whenever another provider's sign-in is offered (App Store 4.8). */}
              <Button type="button" className="bg-black text-white hover:bg-black/85" onClick={() => social("apple")}><AppleMark />Continue with Apple</Button>
              <Button type="button" variant="outline" onClick={() => social("google")}><GoogleG />Continue with Google</Button>
              <Button type="button" variant="outline" onClick={() => social("lovable")}><LovableMark className="size-[18px]" />Continue with Lovable</Button>
            </div>
            <div className="my-6 flex items-center gap-3 text-xs text-muted-foreground"><span className="h-px flex-1 bg-border" />or<span className="h-px flex-1 bg-border" /></div>
            </>}
            <form onSubmit={submit} className={"grid gap-4" + (mode === "reset" ? " mt-6" : "")}>
              {mode === "signup" && (
                <div className="grid gap-1.5"><Label htmlFor="name">Full name</Label><Input id="name" value={name} onChange={(e) => setName(e.target.value)} required /></div>
              )}
              <div className="grid gap-1.5"><Label htmlFor="email">Email</Label><Input id="email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></div>
              {mode !== "reset" && (
                <div className="grid gap-1.5">
                  <div className="flex items-baseline justify-between"><Label htmlFor="password">Password</Label>
                    {mode === "signin" && <button type="button" className="text-xs text-primary underline-offset-4 hover:underline" onClick={() => setMode("reset")}>Forgot your password?</button>}</div>
                  <Input id="password" type="password" minLength={mode === "signup" ? MIN_PASSWORD : undefined} maxLength={72} autoComplete={mode === "signin" ? "current-password" : "new-password"} value={password} onChange={(e) => setPassword(e.target.value)} required />
                  {mode === "signup" && <p className="text-xs text-muted-foreground">At least {MIN_PASSWORD} characters.</p>}
                </div>
              )}
              {needCaptcha && <Captcha key={mode} onToken={setCaptchaToken} resetKey={captchaRound} />}
              <Button type="submit" disabled={busy || (needCaptcha && !captchaToken)}>{mode === "signin" ? "Sign in" : mode === "signup" ? "Create account" : busy ? "Sending…" : "Send reset link"}</Button>
            </form>
            <button type="button" className="mt-4 text-sm text-primary underline-offset-4 hover:underline" onClick={() => setMode(mode === "signin" ? "signup" : "signin")}>
              {mode === "signin" ? "New here? Create an account" : mode === "signup" ? "Already have an account? Sign in" : "Back to sign in"}
            </button>
            <p className="mt-4 text-xs text-muted-foreground">See how we look after your information in our <Link to="/privacy" className="underline">privacy policy</Link>.</p>
          </>
        )}
      </div>
    </div>
  );
}
