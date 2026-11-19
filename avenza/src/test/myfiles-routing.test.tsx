import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { describe, expect, it, vi } from "vitest";
import { routeTree } from "@/routeTree.gen";
import { supabase } from "@/integrations/supabase/client";
import { SupabaseClient, type User } from "@supabase/supabase-js";

/** Stand in for `supabase.from("subscriptions")…maybeSingle()` with a given status (or no row). */
function mockSubscription(status: string | null) {
  const chain = {
    select: () => chain,
    eq: () => chain,
    maybeSingle: () => Promise.resolve({ data: status ? { status } : null, error: null }),
  };
  // `supabase` is a lazy proxy, so spy on the client class that actually serves `.from`.
  return vi
    .spyOn(SupabaseClient.prototype, "from")
    .mockReturnValue(chain as unknown as ReturnType<typeof supabase.from>);
}

describe("My Files access without a business", () => {
  it("matches every refresh-safe view directly under the signed-in layout", () => {
    const router = createRouter({ routeTree, context: { queryClient: new QueryClient() } });
    for (const view of [
      "overview",
      "documents",
      "transactions",
      "categories",
      "bills",
      "plan",
    ] as const) {
      const location = router.buildLocation({ to: "/my-files", search: { view } });
      const matches = router.matchRoutes(location.pathname);
      expect(matches.map((match) => match.routeId)).toEqual([
        "__root__",
        "/_authenticated",
        "/_authenticated/my-files",
      ]);
    }
  });
  it("the parent gate accepts a user without asking for a business", async () => {
    const router = createRouter({ routeTree, context: { queryClient: new QueryClient() } });
    const gate = router.routesById["/_authenticated"].options.beforeLoad;
    const spy = vi.spyOn(supabase.auth, "getUser").mockResolvedValue({
      data: {
        user: { id: "11111111-1111-4111-8111-111111111111" } as User,
      },
      error: null,
    });
    const subscription = mockSubscription("trialing");
    if (typeof gate !== "function") throw new Error("Missing auth gate");
    const callGate = gate as unknown as (input: {
      location: { href: string };
    }) => Promise<{ user: { id: string } }>;
    try {
      expect((await callGate({ location: { href: "/my-files" } })).user.id).toBe(
        "11111111-1111-4111-8111-111111111111",
      );
    } finally {
      spy.mockRestore();
      subscription.mockRestore();
    }
  });
  it("sends a signed-in user without a subscription to the subscribe page", async () => {
    const router = createRouter({ routeTree, context: { queryClient: new QueryClient() } });
    const gate = router.routesById["/_authenticated"].options.beforeLoad as unknown as (input: {
      location: { href: string };
    }) => Promise<unknown>;
    const spy = vi.spyOn(supabase.auth, "getUser").mockResolvedValue({
      data: { user: { id: "11111111-1111-4111-8111-111111111111" } as User },
      error: null,
    });
    const subscription = mockSubscription(null);
    try {
      await expect(gate({ location: { href: "/dashboard" } })).rejects.toMatchObject({
        options: { to: "/subscribe" },
      });
    } finally {
      spy.mockRestore();
      subscription.mockRestore();
    }
  });
});
