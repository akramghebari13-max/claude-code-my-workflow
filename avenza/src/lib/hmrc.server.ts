// Server-only: talks to HMRC. Loaded from inside server handlers only (dynamic import),
// so this module and its secrets never reach the client bundle.
import { getRequestIP } from "@tanstack/react-start/server";
import { hmrcErrorText, hmrcReturnPayload, type HmrcObligation, type VatBoxFigures } from "./hmrc";

const SANDBOX_BASE = "https://test-api.service.hmrc.gov.uk";
const LIVE_BASE = "https://api.service.hmrc.gov.uk";
const SCOPES = "read:vat write:vat";

export type HmrcConfig = { clientId: string; clientSecret: string; base: string; isSandbox: boolean };

/** Read inside a server handler: env is injected per request on Cloudflare Workers. */
export function hmrcConfig(): HmrcConfig | null {
  const clientId = process.env["HMRC_CLIENT_ID"]?.trim();
  const clientSecret = process.env["HMRC_CLIENT_SECRET"]?.trim();
  if (!clientId || !clientSecret) return null;
  const isSandbox = (process.env["HMRC_ENV"] ?? "sandbox").trim().toLowerCase() !== "production";
  return { clientId, clientSecret, base: isSandbox ? SANDBOX_BASE : LIVE_BASE, isSandbox };
}

export function hmrcRedirectUri(origin: string): string {
  return `${origin.replace(/\/+$/, "")}/api/public/hmrc/callback`;
}

export function hmrcAuthUrl(cfg: HmrcConfig, redirectUri: string, state: string, scope: string = SCOPES): string {
  const q = new URLSearchParams({
    client_id: cfg.clientId,
    redirect_uri: redirectUri,
    scope,
    state,
    response_type: "code",
  });
  return `${cfg.base}/oauth/authorize?${q.toString()}`;
}

export type HmrcTokens = { access_token: string; refresh_token: string; expires_in: number; scope?: string };
export type HmrcFailure = { error: string };

async function tokenPost(cfg: HmrcConfig, path: string, params: Record<string, string>): Promise<HmrcTokens | HmrcFailure> {
  let res: Response;
  try {
    res = await fetch(`${cfg.base}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
      body: new URLSearchParams({ client_id: cfg.clientId, client_secret: cfg.clientSecret, ...params }).toString(),
    });
  } catch {
    return { error: "Couldn't reach HMRC — check your internet connection and try again" };
  }
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) return { error: hmrcErrorText(res.status, json) ?? `HMRC sign-in failed (${res.status})` };
  if (typeof json["access_token"] !== "string" || typeof json["refresh_token"] !== "string") {
    return { error: "HMRC didn't return a sign-in token" };
  }
  return {
    access_token: json["access_token"],
    refresh_token: json["refresh_token"],
    expires_in: typeof json["expires_in"] === "number" ? json["expires_in"] : 3600,
    scope: typeof json["scope"] === "string" ? json["scope"] : "",
  };
}

export function hmrcExchangeCode(cfg: HmrcConfig, code: string, redirectUri: string): Promise<HmrcTokens | HmrcFailure> {
  return tokenPost(cfg, "/oauth/token", { grant_type: "authorization_code", code, redirect_uri: redirectUri });
}

export function hmrcRefresh(cfg: HmrcConfig, refreshToken: string): Promise<HmrcTokens | HmrcFailure> {
  return tokenPost(cfg, "/oauth/refresh-token", { grant_type: "refresh_token", refresh_token: refreshToken });
}

/** Only these browser-reported headers are forwarded to HMRC, and only as short strings. */
const FRAUD_KEYS = new Set([
  "Gov-Client-Browser-JS-User-Agent",
  "Gov-Client-Browser-Do-Not-Track",
  "Gov-Client-Browser-Plugins",
  "Gov-Client-Window-Size",
  "Gov-Client-Screen-Display",
  "Gov-Client-Timezone",
  "Gov-Client-Device-ID",
]);

export function sanitizeFraud(input: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (!input || typeof input !== "object") return out;
  for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
    if (FRAUD_KEYS.has(key) && typeof value === "string" && value.length <= 512) out[key] = value;
  }
  return out;
}

/** Server-side fraud data: the public IP the request came from, as HMRC requires. */
function serverFraud(): Record<string, string> {
  const out: Record<string, string> = {};
  try {
    const ip = getRequestIP({ xForwardedFor: true });
    if (ip) out["Gov-Client-Public-IP"] = ip.slice(0, 64);
  } catch {
    /* no request context */
  }
  return out;
}

function hmrcHeaders(cfg: HmrcConfig, token: string, fraud: Record<string, string>, accept = "application/vnd.hmrc.1.0+json"): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    Accept: accept,
    "Content-Type": "application/json",
    "Gov-Client-Connection-Method": "WEB_APP_VIA_SERVER",
    "Gov-Vendor-Client-ID": cfg.clientId,
    "Gov-Vendor-Version": "avenza%260.1",
    ...serverFraud(),
    ...fraud,
  };
}

export type HmrcResponse = { ok: boolean; status: number; json: Record<string, unknown> | null };

export async function hmrcCall(cfg: HmrcConfig, token: string, path: string, fraud: Record<string, string>, init?: RequestInit, accept?: string): Promise<HmrcResponse> {
  let res: Response;
  try {
    res = await fetch(`${cfg.base}${path}`, { ...init, headers: hmrcHeaders(cfg, token, fraud, accept) });
  } catch {
    return { ok: false, status: 0, json: null };
  }
  const json = (await res.json().catch(() => null)) as Record<string, unknown> | null;
  return { ok: res.ok, status: res.status, json };
}

export function hmrcCustomerName(cfg: HmrcConfig, token: string, vrn: string, fraud: Record<string, string>): Promise<string | null> {
  return hmrcCall(cfg, token, `/organisations/vat/${vrn}/customer`, fraud).then((r) => {
    const name = r.json?.["businessName"];
    return typeof name === "string" ? name.slice(0, 200) : null;
  });
}

export async function hmrcOpenObligations(
  cfg: HmrcConfig, token: string, vrn: string, from: string, to: string, fraud: Record<string, string>,
): Promise<{ ok: true; obligations: HmrcObligation[] } | { ok: false; error: string }> {
  const r = await hmrcCall(cfg, token, `/organisations/vat/${vrn}/obligations?status=o&from=${from}&to=${to}`, fraud);
  if (!r.ok) return { ok: false, error: hmrcErrorText(r.status, r.json) ?? "Couldn't load your HMRC return periods" };
  const list = Array.isArray(r.json?.["obligations"]) ? r.json?.["obligations"] : [];
  return { ok: true, obligations: list as HmrcObligation[] };
}

export function hmrcSubmitVatReturn(
  cfg: HmrcConfig, token: string, vrn: string, boxes: VatBoxFigures, periodKey: string, fraud: Record<string, string>,
): Promise<HmrcResponse> {
  return hmrcCall(cfg, token, `/organisations/vat/${vrn}/returns`, fraud, {
    method: "POST",
    body: JSON.stringify(hmrcReturnPayload(boxes, periodKey)),
  });
}
