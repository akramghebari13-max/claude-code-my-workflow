import { createFileRoute, Link, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useSuspenseQuery } from "@tanstack/react-query";
import { businessQuery } from "@/lib/ledger";
import { friendlyError } from "@/lib/app";
import { BUSINESS_TYPE_LABEL } from "@/lib/businesses";

export const Route = createFileRoute("/_authenticated/b/$businessId")({
  loader: ({ context, params }) => context.queryClient.ensureQueryData(businessQuery(params.businessId)),
  head: () => ({ meta: [{ title: "Books — AVENZA" }, { name: "description", content: "Your business books." }] }),
  component: BusinessLayout,
  errorComponent: ({ error }) => <div role="alert" className="p-8 text-destructive">{friendlyError(error)}</div>,
  notFoundComponent: () => <div className="p-8">Business not found.</div>,
});

const tabs = [
  { to: "/b/$businessId", label: "Journals", exact: true },
  { to: "/b/$businessId/money", label: "Money in & out", exact: false },
  { to: "/b/$businessId/bank", label: "Bank", exact: false },
  { to: "/b/$businessId/invoices", label: "Invoices", exact: false },
  { to: "/b/$businessId/vat", label: "VAT", exact: false },
  { to: "/b/$businessId/accounts", label: "Chart of accounts", exact: false },
  { to: "/b/$businessId/reports", label: "Reports", exact: false },
  { to: "/b/$businessId/trial-balance", label: "Trial balance", exact: false },
  { to: "/b/$businessId/settings", label: "Settings", exact: false },
] as const;

function BusinessLayout() {
  const { businessId } = Route.useParams();
  const { data: b } = useSuspenseQuery(businessQuery(businessId));
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const base = `/b/${businessId}`;
  const current = [...tabs].reverse().find((t) => t.exact ? pathname === base || pathname === base + "/" : pathname.startsWith(t.to.replace("/b/$businessId", base)))?.to ?? tabs[0].to;
  if (!b) return <div className="p-8">Business not found or you don't have access.</div>;
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card print:hidden">
        <div className="mx-auto max-w-6xl px-4 pt-4 sm:px-6">
          <Link to="/dashboard" className="text-sm text-muted-foreground hover:text-foreground">← All businesses</Link>
          <div className="mt-1 flex flex-wrap items-baseline gap-3">
            <h1 className="min-w-0 truncate text-2xl font-semibold sm:text-3xl">{b.name}</h1>
            <span className="font-mono text-xs uppercase tracking-wider text-muted-foreground">{BUSINESS_TYPE_LABEL[b.business_type]}</span>
          </div>
          <div className="mt-3 pb-3 sm:hidden">
            <Select value={current} onValueChange={(to) => navigate({ to, params: { businessId } })}>
              <SelectTrigger aria-label="Go to section" className="h-11 w-full"><SelectValue /></SelectTrigger>
              <SelectContent>{tabs.map((t) => <SelectItem key={t.to} value={t.to} className="min-h-11">{t.label}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <nav aria-label="Business sections" className="mt-4 hidden gap-1 overflow-x-auto sm:flex print:hidden">
            {tabs.map((t) => (
              <Link key={t.to} to={t.to} params={{ businessId }} activeOptions={{ exact: t.exact }}
                className="whitespace-nowrap border-b-2 border-transparent px-3 py-2 text-sm text-muted-foreground hover:text-foreground data-[status=active]:border-primary data-[status=active]:text-foreground">
                {t.label}
              </Link>
            ))}
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8 print:p-0"><Outlet /></main>
    </div>
  );
}
