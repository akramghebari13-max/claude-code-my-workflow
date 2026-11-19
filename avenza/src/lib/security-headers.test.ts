import { describe, expect, it } from "vitest";
import {
  contentSecurityPolicy,
  copyWithHeaders,
  httpsRedirect,
  newNonce,
  withSecurityHeaders,
} from "./security-headers";

describe("HTTPS everywhere", () => {
  it("sends plain-HTTP visitors to the HTTPS address, keeping the path", () => {
    const r = httpsRedirect(new Request("http://avenza.example/dashboard?x=1"));
    expect(r?.status).toBe(308);
    expect(r?.headers.get("location")).toBe("https://avenza.example/dashboard?x=1");
  });
  it("trusts the proxy's record of how the visitor connected", () => {
    const viaProxy = (proto: string) =>
      new Request("https://avenza.example/", { headers: { "x-forwarded-proto": proto } });
    expect(httpsRedirect(viaProxy("http"))?.headers.get("location")).toBe(
      "https://avenza.example/",
    );
    expect(httpsRedirect(viaProxy("https"))).toBeNull();
  });
  it("leaves HTTPS and this computer alone", () => {
    expect(httpsRedirect(new Request("https://avenza.example/"))).toBeNull();
    expect(httpsRedirect(new Request("http://localhost:5173/"))).toBeNull();
    expect(httpsRedirect(new Request("http://127.0.0.1:5173/"))).toBeNull();
  });
});

describe("security headers", () => {
  it("adds them to every response without changing it", async () => {
    const r = withSecurityHeaders(
      new Response("hi", { status: 201, headers: { "content-type": "text/plain" } }),
    );
    expect(r.status).toBe(201);
    expect(await r.text()).toBe("hi");
    expect(r.headers.get("content-type")).toBe("text/plain");
    expect(r.headers.get("strict-transport-security")).toBe("max-age=31536000; includeSubDomains");
    expect(r.headers.get("x-content-type-options")).toBe("nosniff");
    const csp = r.headers.get("content-security-policy")!;
    expect(csp).not.toContain("script-src"); // development: scripts unrestricted
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("frame-ancestors 'self'");
    expect(csp).not.toContain("*;");
  });
  it("works on responses whose headers can't be changed", () => {
    const frozen = Response.redirect("https://avenza.example/", 302);
    expect(withSecurityHeaders(frozen).headers.get("location")).toBe("https://avenza.example/");
  });
});

describe("script nonce", () => {
  it("is fresh for every request", () => {
    const seen = new Set(Array.from({ length: 50 }, newNonce));
    expect(seen.size).toBe(50);
    expect([...seen][0]).toMatch(/^[A-Za-z0-9+/]{24}$/);
  });
  it("lets only the app's own and nonce-stamped scripts run, and no inline handlers", () => {
    const csp = contentSecurityPolicy("abc123");
    expect(csp).toContain("script-src 'self' 'nonce-abc123' https://challenges.cloudflare.com;");
    expect(csp).toContain("script-src-attr 'none'");
    expect(csp).not.toContain("unsafe-inline");
    expect(
      withSecurityHeaders(new Response("x"), "abc123").headers.get("content-security-policy"),
    ).toBe(csp);
  });
  it("copies a request with new headers, keeping method and body", async () => {
    const h = new Headers({ "content-type": "application/json", "x-test": "1" });
    const post = copyWithHeaders(
      new Request("https://a.example/_serverFn/x", { method: "POST", body: '{"a":1}' }),
      h,
    );
    expect(post.method).toBe("POST");
    expect(post.headers.get("x-test")).toBe("1");
    expect(await post.text()).toBe('{"a":1}');
    const get = copyWithHeaders(new Request("https://a.example/p?q=1"), h);
    expect(get.url).toBe("https://a.example/p?q=1");
  });
});
