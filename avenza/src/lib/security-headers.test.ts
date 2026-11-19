import { describe, expect, it } from "vitest";
import { httpsRedirect, withSecurityHeaders } from "./security-headers";

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
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("frame-ancestors 'self'");
    expect(csp).not.toContain("*;");
  });
  it("works on responses whose headers can't be changed", () => {
    const frozen = Response.redirect("https://avenza.example/", 302);
    expect(withSecurityHeaders(frozen).headers.get("location")).toBe("https://avenza.example/");
  });
});
