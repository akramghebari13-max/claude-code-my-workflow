import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { describe, expect, it, vi } from "vitest";
import { routeTree } from "@/routeTree.gen";
import { supabase } from "@/integrations/supabase/client";
import type { User } from "@supabase/supabase-js";

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
    }
  });
});
