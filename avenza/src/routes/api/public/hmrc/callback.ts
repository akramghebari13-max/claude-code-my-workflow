import { createFileRoute } from "@tanstack/react-router";

// HMRC sends the user back here after they sign in. The single-use `state` value written by
// startHmrcAuth is what proves this callback belongs to a business that asked for it.
const STATE_MAX_AGE_MS = 15 * 60_000;

export const Route = createFileRoute("/api/public/hmrc/callback")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const code = url.searchParams.get("code");
        const state = url.searchParams.get("state");
        const denied = url.searchParams.get("error");

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const go = (businessId: string | null, q: string) =>
          Response.redirect(new URL(businessId ? `/b/${businessId}/vat${q}` : `/dashboard${q}`, url.origin), 302);

        if (!state) return go(null, "?hmrc=invalid");

        const { data: st } = await supabaseAdmin.from("hmrc_oauth_states").select("*").eq("state", state).maybeSingle();
        // Single use: whatever happens next, this state can never be replayed.
        await supabaseAdmin.from("hmrc_oauth_states").delete().eq("state", state);
        await supabaseAdmin.from("hmrc_oauth_states").delete().lt("created_at", new Date(Date.now() - 86_400_000).toISOString());

        // A sign-in takes minutes; an old, unused state is refused.
        if (!st || Date.now() - new Date(st.created_at).getTime() > STATE_MAX_AGE_MS) return go(null, "?hmrc=invalid");
        if (denied) return st.purpose === "itsa"
          ? Response.redirect(new URL(`/b/${st.business_id}/reports?hmrc=cancelled`, url.origin), 302)
          : go(st.business_id, "?hmrc=cancelled");
        if (!code) return go(st.business_id, "?hmrc=nocode");

        const { hmrcConfig, hmrcExchangeCode, hmrcCustomerName } = await import("@/lib/hmrc.server");
        const cfg = hmrcConfig();
        if (!cfg) return go(st.business_id, "?hmrc=unconfigured");

        const tokens = await hmrcExchangeCode(cfg, code, st.redirect_uri);
        if ("error" in tokens) return go(st.business_id, "?hmrc=failed");

        if (st.purpose === "itsa") {
          const back = (q: string) => Response.redirect(new URL(`/b/${st.business_id}/reports${q}`, url.origin), 302);
          if (!st.nino) return back("?hmrc=failed");
          const { error: ie } = await supabaseAdmin.from("hmrc_itsa_connections").upsert({
            business_id: st.business_id,
            nino: st.nino,
            access_token: tokens.access_token,
            refresh_token: tokens.refresh_token,
            token_expires_at: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
            scope: tokens.scope ?? null,
            is_sandbox: cfg.isSandbox,
            connected_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          });
          return back(ie ? "?hmrc=failed" : "?hmrc=connected");
        }

        const { data: biz } = await supabaseAdmin.from("businesses").select("vat_number").eq("id", st.business_id).maybeSingle();
        const digits = (biz?.vat_number ?? "").replace(/[^0-9]/g, "");
        if (digits.length !== 9 && digits.length !== 12) return go(st.business_id, "?hmrc=novat");

        const fraud: Record<string, string> = {};
        const customerName = await hmrcCustomerName(cfg, tokens.access_token, digits, fraud);
        const { error } = await supabaseAdmin.from("hmrc_connections").upsert({
          business_id: st.business_id,
          mtd_vat_id: digits,
          access_token: tokens.access_token,
          refresh_token: tokens.refresh_token,
          token_expires_at: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
          scope: tokens.scope ?? null,
          is_sandbox: cfg.isSandbox,
          customer_name: customerName,
          connected_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        });
        if (error) return go(st.business_id, "?hmrc=failed");
        return go(st.business_id, "?hmrc=connected");
      },
    },
  },
});
