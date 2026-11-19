// Applied to every response by src/server.ts: HTTPS only, and browser protections that cost nothing.

const LOCAL = /^(localhost|127\.0\.0\.1|\[::1\])$/;

/** Plain-HTTP requests (other than on this computer) are sent to the HTTPS address instead. */
export function httpsRedirect(request: Request): Response | null {
  const url = new URL(request.url);
  if (LOCAL.test(url.hostname)) return null;
  const proto =
    request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim() ??
    url.protocol.replace(":", "");
  if (proto !== "http") return null;
  url.protocol = "https:";
  return new Response(null, { status: 308, headers: { location: url.toString() } });
}

/**
 * The page may be shown inside Lovable's editor; any other site framing it is refused (stops
 * clickjacking). A full script policy needs per-request nonces and is listed as a next step.
 */
export const CONTENT_SECURITY_POLICY = [
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'self' https://lovable.dev https://*.lovable.dev https://*.lovable.app https://*.lovableproject.com",
  "upgrade-insecure-requests",
].join("; ");

export const SECURITY_HEADERS: Record<string, string> = {
  "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
  "Content-Security-Policy": CONTENT_SECURITY_POLICY,
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=(self), microphone=(), geolocation=(), payment=(), usb=()",
  "Cross-Origin-Opener-Policy": "same-origin-allow-popups",
};

export function withSecurityHeaders(response: Response): Response {
  // Responses from fetch() can have read-only headers; copy into a new one.
  const out = new Response(response.body, response);
  for (const [k, v] of Object.entries(SECURITY_HEADERS))
    if (!out.headers.has(k)) out.headers.set(k, v);
  out.headers.delete("x-powered-by");
  return out;
}
