// Password rules shown on the page. The real check happens in Supabase Auth (minimum length and
// breached-password protection are set in its settings; see SECURITY.md), so this only saves a round trip.
export const MIN_PASSWORD = 10;

export function passwordProblem(pw: string, confirm?: string): string | null {
  if (pw.length < MIN_PASSWORD) return `Use at least ${MIN_PASSWORD} characters.`;
  if (pw.length > 72) return "Use 72 characters or fewer.";
  if (/^(.)\1+$/.test(pw) || /^(?:0123456789|1234567890|password|qwerty)/i.test(pw))
    return "That password is too easy to guess.";
  if (confirm !== undefined && pw !== confirm) return "The two passwords don't match.";
  return null;
}

/** Supabase puts link errors (expired, already used) in the URL hash after #. */
export function linkError(hash: string): string | null {
  const h = new URLSearchParams(hash.replace(/^#/, ""));
  const code = h.get("error_code") ?? h.get("error");
  if (!code) return null;
  return /expired|access_denied/i.test(code)
    ? "This link has expired or has already been used. Ask for a new one."
    : "This link isn't valid. Ask for a new one.";
}
