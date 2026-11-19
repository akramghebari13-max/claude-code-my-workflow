import { createServerFn } from "@tanstack/react-start";
import { getRequestUrl } from "@tanstack/react-start/server";
import type { Json } from "@/integrations/supabase/types";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { hmrcErrorText } from "./hmrc";
import { buildPnl, type Bal } from "./reports";
import { todayUK } from "./app";
import {
  ITSA_SCOPES, ITSA_VERSIONS, cumulativePayload, hmrcTaxYear, itsaQuarters, normalizeNino, parseCalculation,
  parseHmrcTaxYear, pickSelfEmployment, taxYearEnded, ukDate, type ItsaCalculation,
} from "./itsa";

const UUID = /^[0-9a-f-]{36}$/i;
const accept = (v: string) => `application/vnd.hmrc.${v}+json`;
type Sb = { rpc: (...a: any[]) => any };

function base(input: { businessId?: unknown; taxYear?: unknown; fraud?: unknown }) {
  if (typeof input?.businessId !== "string" || !UUID.test(input.businessId)) throw new Error("Invalid request");
  const taxYear = typeof input.taxYear === "string" ? input.taxYear : "";
  return { businessId: input.businessId, taxYear, fraud: (input.fraud ?? {}) as Record<string, string> };
}

export type ItsaStatus = {
  configured: boolean; isSandbox: boolean; canPost: boolean;
  status: { nino_hint: string; is_sandbox: boolean; connected_at: string; expired: boolean } | null;
};

export const itsaStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { businessId: string }) => base(i))
  .handler(async ({ data, context }): Promise<ItsaStatus> => {
    const { hmrcConfig } = await import("./hmrc.server");
    const cfg = hmrcConfig();
    const [{ data: allowed }, { data: status }] = await Promise.all([
      context.supabase.rpc("can_post", { _business_id: data.businessId }),
      context.supabase.rpc("hmrc_itsa_status", { _business_id: data.businessId }),
    ]);
    return { configured: Boolean(cfg), isSandbox: cfg?.isSandbox ?? true, canPost: Boolean(allowed), status: (status as ItsaStatus["status"]) ?? null };
  });

export const startItsaAuth = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { businessId: string; nino: string }) => ({ ...base(i), nino: String(i?.nino ?? "") }))
  .handler(async ({ data, context }) => {
    const { hmrcConfig, hmrcAuthUrl, hmrcRedirectUri } = await import("./hmrc.server");
    const cfg = hmrcConfig();
    if (!cfg) return { error: "HMRC isn't set up in AVENZA yet — add the client ID and secret from your HMRC developer app." };
    const nino = normalizeNino(data.nino);
    if (!nino) return { error: "Enter a valid National Insurance number, like QQ 12 34 56 C." };
    const { data: allowed } = await context.supabase.rpc("can_post", { _business_id: data.businessId });
    if (!allowed) return { error: "Only the owner or their accountant can connect HMRC." };
    const { data: biz } = await context.supabase.from("businesses").select("business_type").eq("id", data.businessId).maybeSingle();
    if (biz?.business_type !== "sole_trader") return { error: "Income Tax returns are for sole traders." };
    const bytes = crypto.getRandomValues(new Uint8Array(24));
    const state = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
    const redirectUri = hmrcRedirectUri(getRequestUrl().origin);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("hmrc_oauth_states").insert({
      state, business_id: data.businessId, redirect_uri: redirectUri, is_sandbox: cfg.isSandbox, purpose: "itsa", nino,
    });
    if (error) return { error: "Couldn't start HMRC sign-in. Try again." };
    return { url: hmrcAuthUrl(cfg, redirectUri, state, ITSA_SCOPES) };
  });

/** Checks role, loads (and refreshes) the stored HMRC token. Server-only use. */
type Session = { error: string } | { error?: undefined; cfg: import("./hmrc.server").HmrcConfig; token: string; nino: string; sandbox: boolean };
async function session(supabase: Sb, businessId: string): Promise<Session> {
  const { hmrcConfig, hmrcRefresh } = await import("./hmrc.server");
  const cfg = hmrcConfig();
  if (!cfg) return { error: "HMRC isn't set up in AVENZA yet." };
  const { data: allowed } = await supabase.rpc("can_post", { _business_id: businessId });
  if (!allowed) return { error: "Only the owner or their accountant can send figures to HMRC." };
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: conn } = await supabaseAdmin.from("hmrc_itsa_connections").select("*").eq("business_id", businessId).maybeSingle();
  if (!conn) return { error: "Connect your HMRC account first." };
  let token = conn.access_token;
  if (new Date(conn.token_expires_at).getTime() < Date.now() + 30_000) {
    const r = await hmrcRefresh(cfg, conn.refresh_token);
    if ("error" in r) return { error: r.error };
    token = r.access_token;
    await supabaseAdmin.from("hmrc_itsa_connections").update({
      access_token: r.access_token, refresh_token: r.refresh_token,
      token_expires_at: new Date(Date.now() + r.expires_in * 1000).toISOString(), updated_at: new Date().toISOString(),
    }).eq("business_id", businessId);
  }
  return { cfg, token, nino: conn.nino, sandbox: conn.is_sandbox };
}

const fail = (status: number, json: unknown, fallback: string) => ({ error: hmrcErrorText(status, json) ?? `${fallback} (${status || "no response"})` });

/**
 * Send one quarterly update: the cumulative figures from 6 April to the end of the chosen quarter.
 * Sending a quarter again replaces it (that's how corrections work). Figures are rebuilt from the
 * ledger here, never taken from the browser.
 */
export const itsaSendFigures = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { businessId: string; taxYear: string; quarter: number; fraud?: Record<string, string> }) => {
    const b = base(i);
    if (![1, 2, 3, 4].includes(i?.quarter)) throw new Error("Invalid request");
    return { ...b, quarter: i.quarter };
  })
  .handler(async ({ data, context }) => {
    const start = parseHmrcTaxYear(data.taxYear);
    if (start === null) return { error: "Pick a tax year." };
    const { from, to } = itsaQuarters(start)[data.quarter - 1]!;
    if (todayUK() <= to) return { error: `This quarter ends on ${ukDate(to)}. You can send it from the next day.` };
    const s = await session(context.supabase, data.businessId);
    if (s.error !== undefined) return { error: s.error };
    const { hmrcCall, sanitizeFraud } = await import("./hmrc.server");
    const fraud = sanitizeFraud(data.fraud);

    const list = await hmrcCall(s.cfg, s.token, `/individuals/business/details/${s.nino}/list`, fraud, undefined, accept(ITSA_VERSIONS.businessDetails));
    if (!list.ok) return fail(list.status, list.json, "Couldn't load your businesses from HMRC");
    const sources = pickSelfEmployment(list.json);
    if (!sources.length) return { error: "HMRC has no self-employment registered for this National Insurance number." };
    const source = sources[0]!;

    const { data: rows, error: be } = await context.supabase.rpc("period_balances", { _business_id: data.businessId, _from: from, _to: to });
    if (be) return { error: "Couldn't read your books." };
    const pnl = buildPnl((rows ?? []) as Bal[]);
    const figures = { turnoverPence: pnl.totalIncome, otherIncomePence: 0, expensesPence: pnl.totalExpenses, from, to };

    const res = await hmrcCall(s.cfg, s.token, `/individuals/business/self-employment/${s.nino}/${source.id}/cumulative/${data.taxYear}`, fraud,
      { method: "PUT", body: JSON.stringify(cumulativePayload(figures)) }, accept(ITSA_VERSIONS.selfEmployment));
    if (!res.ok) return fail(res.status, res.json, "HMRC refused the figures");

    await context.supabase.rpc("record_itsa_submission", {
      _business_id: data.businessId, _tax_year: data.taxYear, _kind: "figures", _hmrc_business_id: source.id,
      _figures: { ...figures, quarter: data.quarter } as unknown as Json, _calculation_id: null as unknown as string,
      _receipt: { status: res.status, body: res.json } as unknown as Json, _is_sandbox: s.sandbox,
    });
    return { ok: true as const, figures, sourceName: source.name };
  });

/** Ask HMRC to work out the tax. Uses the final-declaration calculation once the year has ended. */
export const itsaCalculate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { businessId: string; taxYear: string; fraud?: Record<string, string> }) => base(i))
  .handler(async ({ data, context }): Promise<{ error: string } | { ok: true; calculationId: string; type: string; calc: ItsaCalculation }> => {
    const start = parseHmrcTaxYear(data.taxYear);
    if (start === null) return { error: "Pick a tax year." };
    const s = await session(context.supabase, data.businessId);
    if (s.error !== undefined) return { error: s.error };
    const { hmrcCall, sanitizeFraud } = await import("./hmrc.server");
    const fraud = sanitizeFraud(data.fraud);
    const type = taxYearEnded(start, todayUK()) ? "intent-to-finalise" : "in-year";
    const root = `/individuals/calculations/${s.nino}/self-assessment/${data.taxYear}`;
    const v = accept(ITSA_VERSIONS.calculations);
    const trig = await hmrcCall(s.cfg, s.token, `${root}/trigger/${type}`, fraud, { method: "POST" }, v);
    if (!trig.ok) return fail(trig.status, trig.json, "HMRC couldn't start the calculation");
    const id = trig.json?.["calculationId"];
    if (typeof id !== "string") return { error: "HMRC didn't return a calculation." };
    // HMRC works the calculation out in the background; wait briefly for it.
    for (let i = 0; i < 6; i++) {
      await new Promise((r) => setTimeout(r, 1500));
      const got = await hmrcCall(s.cfg, s.token, `${root}/${id}`, fraud, undefined, v);
      if (got.ok) return { ok: true, calculationId: id, type, calc: parseCalculation(got.json) };
      if (got.status !== 404) return fail(got.status, got.json, "Couldn't read HMRC's calculation");
    }
    return { error: "HMRC is still working out your tax. Try again in a minute." };
  });

/** The legal final declaration for the year. */
export const itsaFinalDeclaration = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { businessId: string; taxYear: string; calculationId: string; fraud?: Record<string, string> }) => {
    const b = base(i);
    if (typeof i?.calculationId !== "string" || !/^[0-9a-f-]{36}$/i.test(i.calculationId)) throw new Error("Invalid request");
    return { ...b, calculationId: i.calculationId };
  })
  .handler(async ({ data, context }) => {
    const start = parseHmrcTaxYear(data.taxYear);
    if (start === null) return { error: "Pick a tax year." };
    if (!taxYearEnded(start, todayUK())) return { error: "You can only send the final declaration after the tax year ends on 5 April." };
    const s = await session(context.supabase, data.businessId);
    if (s.error !== undefined) return { error: s.error };
    const { hmrcCall, sanitizeFraud } = await import("./hmrc.server");
    const res = await hmrcCall(s.cfg, s.token,
      `/individuals/calculations/${s.nino}/self-assessment/${data.taxYear}/${data.calculationId}/intent-to-finalise/final-declaration`,
      sanitizeFraud(data.fraud), { method: "POST" }, accept(ITSA_VERSIONS.calculations));
    if (!res.ok) return fail(res.status, res.json, "HMRC refused the declaration");
    const { error } = await context.supabase.rpc("record_itsa_submission", {
      _business_id: data.businessId, _tax_year: data.taxYear, _kind: "final", _hmrc_business_id: null as unknown as string,
      _figures: null as unknown as Json, _calculation_id: data.calculationId,
      _receipt: { status: res.status, sent_at: new Date().toISOString() } as unknown as Json, _is_sandbox: s.sandbox,
    });
    if (error) return { error: "HMRC accepted your declaration, but AVENZA couldn't record it. Don't send it again." };
    return { ok: true as const };
  });

export const disconnectItsa = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { businessId: string }) => base(i))
  .handler(async ({ data, context }) => {
    const { data: isOwner } = await context.supabase.rpc("has_business_role", { _business_id: data.businessId, _role: "owner" });
    if (!isOwner) return { error: "Only the owner can disconnect HMRC." };
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("hmrc_itsa_connections").delete().eq("business_id", data.businessId);
    return error ? { error: "Couldn't disconnect HMRC. Try again." } : { ok: true as const };
  });

export { hmrcTaxYear };
