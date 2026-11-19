import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { createIsomorphicFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { NONCE_HEADER } from "./lib/security-headers";

// This request's script nonce (set by src/server.ts). The router stamps it on its own scripts and
// in a <meta property="csp-nonce"> the browser side reads back. Server-only; undefined in dev.
const cspNonce = createIsomorphicFn()
  .server(() => getRequest()?.headers.get(NONCE_HEADER) ?? undefined)
  .client(() => undefined);
import { routeTree } from "./routeTree.gen";

export const getRouter = () => {
  // One client per request: a module-level QueryClient leaks cached data between SSR requests.
  const queryClient = new QueryClient();
  const nonce = cspNonce();

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    // Lets Query own freshness; set caching defaults on the QueryClient, not the router.
    defaultPreloadStaleTime: 0,
    ...(nonce ? { ssr: { nonce } } : {}),
  });

  return router;
};
