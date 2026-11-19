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

/** Header the server uses to hand this request's nonce to the router (never trusted from outside). */
export const NONCE_HEADER = "x-avenza-csp-nonce";

/** A fresh random value per request; only scripts carrying it may run on that page. */
export function newNonce(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(18));
  return btoa(String.fromCharCode(...bytes));
}

/**
 * With a nonce (production): only the app's own script files and inline scripts stamped with this
 * page's nonce run, and inline event handlers (onclick="…") never do. Without one (the
 * development server and Lovable's preview, which inject their own scripts) scripts aren't
 * restricted. Cloudflare's script is allowed for the sign-in human check. Either way: no plugins, no base-tag tricks, and only Lovable's editor may frame it.
 */
export function contentSecurityPolicy(nonce?: string): string {
  return [
    ...(nonce
      ? [
          `script-src 'self' 'nonce-${nonce}' https://challenges.cloudflare.com`,
          "script-src-attr 'none'",
        ]
      : []),
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'self' https://lovable.dev https://*.lovable.dev https://*.lovable.app https://*.lovableproject.com",
    "upgrade-insecure-requests",
  ].join("; ");
}

export const SECURITY_HEADERS: Record<string, string> = {
  "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=(self), microphone=(), geolocation=(), payment=(), usb=()",
  "Cross-Origin-Opener-Policy": "same-origin-allow-popups",
};

export function withSecurityHeaders(response: Response, nonce?: string): Response {
  // Responses from fetch() can have read-only headers; copy into a new one.
  const out = new Response(response.body, response);
  for (const [k, v] of Object.entries(SECURITY_HEADERS))
    if (!out.headers.has(k)) out.headers.set(k, v);
  if (!out.headers.has("Content-Security-Policy"))
    out.headers.set("Content-Security-Policy", contentSecurityPolicy(nonce));
  out.headers.delete("x-powered-by");
  return out;
}

/** The same request with different headers. Built field by field: `new Request(request, init)`
 * fails on some runtimes' request objects (seen on Node). */
export function copyWithHeaders(request: Request, headers: Headers): Request {
  const hasBody = request.method !== "GET" && request.method !== "HEAD";
  return new Request(request.url, {
    method: request.method,
    headers,
    signal: request.signal,
    redirect: request.redirect,
    ...(hasBody ? { body: request.body, duplex: "half" } : {}),
  } as RequestInit);
}
