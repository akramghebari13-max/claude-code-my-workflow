import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { unlocksApp } from "@/lib/billing";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async ({ location }) => {
    const { data } = await supabase.auth.getUser();
    if (!data.user) throw redirect({ to: "/auth", search: { redirect: location.href } });
    // Every signed-in page needs a trial or a paid subscription (£6.99/month).
    const { data: sub } = await supabase
      .from("subscriptions").select("status").eq("user_id", data.user.id).maybeSingle();
    if (!unlocksApp(sub)) throw redirect({ to: "/subscribe" });
    return { user: data.user };
  },
  component: () => <Outlet />,
});
