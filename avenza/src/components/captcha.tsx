import { useEffect, useRef } from "react";

// Cloudflare Turnstile ("are you human?" check) for sign-in, sign-up and password reset.
// Off until VITE_TURNSTILE_SITE_KEY is set. Supabase Auth checks each token with Cloudflare
// (its CAPTCHA setting holds the secret key), so a bot can't skip this by calling Supabase directly.

export const TURNSTILE_SITE_KEY: string = import.meta.env["VITE_TURNSTILE_SITE_KEY"] ?? "";
export const captchaEnabled = () => TURNSTILE_SITE_KEY !== "";
export const TURNSTILE_SCRIPT =
  "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

type Turnstile = {
  render: (el: HTMLElement, opts: Record<string, unknown>) => string;
  reset: (id: string) => void;
  remove: (id: string) => void;
};
declare global {
  interface Window {
    turnstile?: Turnstile;
  }
}

let loading: Promise<Turnstile> | null = null;
function loadTurnstile(): Promise<Turnstile> {
  if (window.turnstile) return Promise.resolve(window.turnstile);
  loading ??= new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = TURNSTILE_SCRIPT;
    s.async = true;
    s.onload = () =>
      window.turnstile ? resolve(window.turnstile) : reject(new Error("Turnstile missing"));
    s.onerror = () => {
      loading = null;
      reject(new Error("Couldn't load the human check"));
    };
    document.head.appendChild(s);
  });
  return loading;
}

/**
 * Shows the check and reports its token (or null when it expires or fails). Tokens work once:
 * change `resetKey` after every attempt to get a fresh one.
 */
export function Captcha({
  onToken,
  resetKey,
  siteKey = TURNSTILE_SITE_KEY,
}: {
  onToken: (t: string | null) => void;
  resetKey: number;
  siteKey?: string;
}) {
  const box = useRef<HTMLDivElement>(null);
  const widget = useRef<string | null>(null);
  const report = useRef(onToken);
  report.current = onToken;

  useEffect(() => {
    let gone = false;
    loadTurnstile()
      .then((t) => {
        if (gone || !box.current) return;
        widget.current = t.render(box.current, {
          sitekey: siteKey,
          size: "flexible",
          callback: (token: string) => report.current(token),
          "expired-callback": () => report.current(null),
          "error-callback": () => report.current(null),
        });
      })
      .catch(() => report.current(null));
    return () => {
      gone = true;
      if (widget.current) window.turnstile?.remove(widget.current);
      widget.current = null;
    };
  }, [siteKey]);

  useEffect(() => {
    if (resetKey === 0 || !widget.current) return;
    report.current(null);
    window.turnstile?.reset(widget.current);
  }, [resetKey]);

  return <div ref={box} className="min-h-[65px]" aria-label="Human check" />;
}
