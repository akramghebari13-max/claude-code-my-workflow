import { createServerFn } from "@tanstack/react-start";
import type { Json } from "@/integrations/supabase/types";
import { getRequestUrl } from "@tanstack/react-start/server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { hmrcErrorText, hmrcSubmitChecks, hmrcVatId, matchObligation, type VatBoxFigures } from "./hmrc";
import { todayUK } from "./app";

const UUID = /^[0-9a-f-]{36}$/i;

function checkBusinessId(businessId: unknown): string {
  if (typeof businessId !== "string" || !UUID.test(businessId)) throw new Error("Invalid request");
  return businessId;
}

function newState(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export type HmrcConnectionStatus = {
  mtd_vat_id: string;
  is_sandbox: boolean;
  customer_name: string | null;
  connected_at: string;
  expired: boolean;
};

export type HmrcStatusResult = {
  configured: boolean;
  isSandbox: boolean;
  redirectUri: string;
  status: HmrcConnectionStatus | null;
  canPost: boolean;
};

/** Is HMRC set up, and is this business connected? Never returns tokens. */
export const hmrcStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { businessId: string }) => ({ businessId: checkBusinessId(input?.businessId) }))
  .handler(async ({ data, context }): Promise<HmrcStatusResult> => {
    const { hmrcConfig, hmrcRedirectUri } = await import("./hmrc.server");
    const cfg = hmrcConfig();
    const { data: allowed } = await context.supabase.rpc("can_post", { _business_id: data.businessId });
    const { data: status } = await context.supabase.rpc("hmrc_connection_status", { _business_id: data.businessId });
    return {
      configured: Boolean(cfg),
      isSandbox: cfg?.isSandbox ?? true,
      redirectUri: hmrcRedirectUri(getRequestUrl().origin),
      status: (status as HmrcConnectionStatus | null) ?? null,
      canPost: Boolean(allowed),
    };
  });

/** Start HMRC's own sign-in page. Returns the URL the browser should open. */
export const startHmrcAuth = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { businessId: string }) => ({ businessId: checkBusinessId(input?.businessId) }))
  .handler(async ({ data, context }) => {
    const { hmrcConfig, hmrcAuthUrl, hmrcRedirectUri } = await import("./hmrc.server");
    const cfg = hmrcConfig();
    if (!cfg) return { error: "HMRC isn't set up in AVENZA yet — add the client ID and secret from your HMRC developer app." };
    const { data: allowed } = await context.supabase.rpc("can_post", { _business_id: data.businessId });
    if (!allowed) return { error: "Only the owner or their accountant can connect HMRC." };
    const { data: biz } = await context.supabase
      .from("businesses").select("vat_registered, vat_number").eq("id", data.businessId).maybeSingle();
    if (!biz?.vat_registered) return { error: "Mark this business as VAT registered in Settings first." };
    const vrn = hmrcVatId(biz.vat_number);
    if (!vrn) return { error: "Add a valid VAT number in Settings first." };
    const state = newState();
    const redirectUri = hmrcRedirectUri(getRequestUrl().origin);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("hmrc_oauth_states").insert({
      state, business_id: data.businessId, redirect_uri: redirectUri, is_sandbox: cfg.isSandbox,
    });
    if (error) return { error: "Couldn't start HMRC sign-in. Try again." };
    return { url: hmrcAuthUrl(cfg, redirectUri, state) };
  });

/** Send a filed return to HMRC. The figures come from the locked return, never from the browser. */
export const submitHmrcVatReturn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { businessId: string; returnId: string; fraud?: Record<string, string> }) => {
    checkBusinessId(input?.businessId);
    if (typeof input?.returnId !== "string" || !UUID.test(input.returnId)) throw new Error("Invalid request");
    return { businessId: input.businessId, returnId: input.returnId, fraud: input.fraud ?? {} };
  })
  .handler(async ({ data, context }) => {
    const { hmrcConfig, hmrcOpenObligations, hmrcRefresh, sanitizeFraud, hmrcSubmitVatReturn: submit } =
      await import("./hmrc.server");
    const cfg = hmrcConfig();
    if (!cfg) return { error: "HMRC isn't set up in AVENZA yet." };
    const { data: allowed } = await context.supabase.rpc("can_post", { _business_id: data.businessId });
    if (!allowed) return { error: "Only the owner or their accountant can send returns to HMRC." };

    const { data: ret } = await context.supabase
      .from("vat_returns").select("*").eq("id", data.returnId).eq("business_id", data.businessId).maybeSingle();
    if (!ret) return { error: "Return not found." };
    if (ret.hmrc_submitted_at) return { error: "This return has already been sent to HMRC." };

    const problems = hmrcSubmitChecks(ret as unknown as VatBoxFigures, ret.period_end, todayUK());
    if (problems.length) return { error: problems[0] };

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: conn } = await supabaseAdmin.from("hmrc_connections").select("*").eq("business_id", data.businessId).maybeSingle();
    if (!conn) return { error: "Connect your HMRC account first." };

    let token = conn.access_token as string;
    if (new Date(conn.token_expires_at as string).getTime() < Date.now() + 30_000) {
      const refreshed = await hmrcRefresh(cfg, conn.refresh_token as string);
      if ("error" in refreshed) return { error: refreshed.error };
      token = refreshed.access_token;
      await supabaseAdmin.from("hmrc_connections").update({
        access_token: refreshed.access_token,
        refresh_token: refreshed.refresh_token,
        token_expires_at: new Date(Date.now() + refreshed.expires_in * 1000).toISOString(),
        updated_at: new Date().toISOString(),
      }).eq("business_id", data.businessId);
    }

    const fraud = sanitizeFraud(data.fraud);
    const vrn = conn.mtd_vat_id as string;
    const obligations = await hmrcOpenObligations(cfg, token, vrn, ret.period_start, ret.period_end, fraud);
    if (!obligations.ok) return { error: obligations.error };
    const periodKey = matchObligation(obligations.obligations, ret.period_start, ret.period_end);
    if (!periodKey) return { error: "HMRC has no open return period for these dates." };

    const res = await submit(cfg, token, vrn, ret as unknown as VatBoxFigures, periodKey, fraud);
    if (!res.ok) return { error: hmrcErrorText(res.status, res.json) ?? `HMRC refused the return (${res.status})` };

    const receipt: Json = {
      status: res.status,
      periodKey,
      sent_at: new Date().toISOString(),
      body: (res.json ?? null) as unknown as Json,
    };
    const { error: se } = await context.supabase.rpc("record_hmrc_submission", {
      _business_id: data.businessId,
      _return_id: data.returnId,
      _period_key: periodKey,
      _receipt: receipt,
    });
    if (se) return { error: "HMRC accepted the return, but AVENZA couldn't record it. Check your VAT tab before sending anything again." };
    return { ok: true as const, periodKey };
  });

/** Unlink this business from HMRC. */
export const disconnectHmrc = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { businessId: string }) => ({ businessId: checkBusinessId(input?.businessId) }))
  .handler(async ({ data, context }) => {
    const { data: isOwner } = await context.supabase.rpc("has_business_role", { _business_id: data.businessId, _role: "owner" });
    if (!isOwner) return { error: "Only the owner can disconnect HMRC." };
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("hmrc_connections").delete().eq("business_id", data.businessId);
    if (error) return { error: "Couldn't disconnect HMRC. Try again." };
    return { ok: true as const };
  });
