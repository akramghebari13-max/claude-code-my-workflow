import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { BUSINESS_TYPE_LABEL, myBusinessesQuery } from "@/lib/businesses";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({ meta: [{ title: "Your businesses — AVENZA" }, { name: "description", content: "Choose a business to manage." }] }),
  loader: ({ context }) => context.queryClient.ensureQueryData(myBusinessesQuery),
  component: Dashboard,
});

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

function Dashboard() {
  const { data } = useSuspenseQuery(myBusinessesQuery);
  const { user } = Route.useRouteContext();
  const qc = useQueryClient();
  const navigate = useNavigate();

  async function signOut() {
    await qc.cancelQueries(); qc.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", search: { redirect: undefined }, replace: true });
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <span className="font-display text-xl font-semibold text-primary">AVENZA</span>
          <div className="flex items-center gap-3">
            <span className="hidden text-sm text-muted-foreground sm:inline">{user.email}</span>
            <Button asChild variant="ghost" size="sm"><Link to="/subscribe">Billing</Link></Button>
            <Button variant="ghost" size="sm" onClick={signOut}>Sign out</Button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-6 py-10">
        <Button asChild variant="outline" className="mb-6"><Link to="/my-files">My Files</Link></Button>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <h1 className="text-4xl font-semibold">Your businesses</h1>
          <Button asChild><Link to="/businesses/new">Add a business</Link></Button>
        </div>
        {data.length === 0 ? (
          <div className="mt-10 rounded-xl border border-dashed bg-card p-10 text-center">
            <h2 className="text-2xl font-semibold">Set up your first business</h2>
            <p className="mt-2 text-muted-foreground">Add a sole trader business or a limited company to start keeping books.</p>
            <Button asChild className="mt-6"><Link to="/businesses/new">Add a business</Link></Button>
          </div>
        ) : (
          <ul className="mt-8 grid gap-4 md:grid-cols-2">
            {data.map((b) => (
              <li key={b.id} className="rounded-xl border bg-card p-6">
                <div className="flex items-start justify-between gap-2">
                  <h2 className="text-2xl font-semibold"><Link to="/b/$businessId" params={{ businessId: b.id }} className="hover:text-primary">{b.name}</Link></h2>
                  <Badge variant="secondary">{BUSINESS_TYPE_LABEL[b.business_type]}</Badge>
                </div>
                <dl className="mt-4 grid grid-cols-2 gap-y-1 font-mono text-xs text-muted-foreground">
                  <dt>Year end</dt><dd>{b.year_end_day} {MONTHS[b.year_end_month - 1]}</dd>
                  <dt>VAT</dt><dd>{b.vat_registered ? b.vat_number ?? "Registered" : "Not registered"}</dd>
                  {b.company_number && (<><dt>Company no.</dt><dd>{b.company_number}</dd></>)}
                  <dt>Your role</dt><dd className="capitalize">{b.business_members[0]?.role ?? "—"}</dd>
                </dl>
                <Button asChild variant="outline" size="sm" className="mt-4"><Link to="/b/$businessId" params={{ businessId: b.id }}>Open books</Link></Button>
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}
