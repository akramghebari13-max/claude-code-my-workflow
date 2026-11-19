import {
  createFileRoute,
  Link,
  useNavigate,
  useRouter,
  type ErrorComponentProps,
} from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { useState } from "react";
import { ChevronLeft, ChevronRight, FolderLock } from "lucide-react";
import { z } from "zod";
import { personalQuery, planQuery, type PersonalTransaction } from "@/lib/myfiles-queries";
import { todayUK, friendlyError } from "@/lib/app";
import { addMonthsISO, monthStartISO } from "@/lib/myfiles";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Overview } from "@/components/my-files/overview";
import { Documents } from "@/components/my-files/documents";
import { Transactions } from "@/components/my-files/transactions";
import { Categories } from "@/components/my-files/categories";
import { TransactionDialog } from "@/components/my-files/transaction-form";
import { Bills, UpcomingBills } from "@/components/my-files/bills";
import { BudgetsCompact, BudgetsGoals } from "@/components/my-files/plan";
import { NotificationsBell } from "@/components/my-files/notifications";
import { PersonalAssistant } from "@/components/my-files/assistant";
import { PersonalPdfButton } from "@/components/my-files/pdf-report";
import { PersonalPrivacy } from "@/components/my-files/privacy";

const viewSchema = z.enum([
  "overview",
  "documents",
  "transactions",
  "categories",
  "bills",
  "plan",
  "assistant",
]);
const kindSchema = z.enum(["all", "income", "expense", "saving"]);
type View = z.infer<typeof viewSchema>;
const VIEWS: [View, string][] = [
  ["overview", "Overview"],
  ["documents", "Documents"],
  ["transactions", "Transactions"],
  ["categories", "Categories"],
  ["bills", "Bills"],
  ["plan", "Budgets & goals"],
  ["assistant", "Ask My Files"],
];

export const Route = createFileRoute("/_authenticated/my-files")({
  validateSearch: (
    search: Record<string, unknown>,
  ): {
    view?: View | undefined;
    month?: string | undefined;
    kind?: string | undefined;
    review?: string | undefined;
  } => {
    const view = viewSchema.catch("overview").parse(search["view"]);
    const kind = kindSchema.catch("all").parse(search["kind"]);
    let month: string | undefined;
    try {
      if (typeof search["month"] === "string")
        month = monthStartISO(`${search["month"].slice(0, 7)}-01`);
    } catch {
      /* Invalid URL month falls back to UK today. */
    }
    const review = z.string().uuid().safeParse(search["review"]);
    return {
      view,
      kind,
      ...(month ? { month } : {}),
      ...(review.success ? { review: review.data } : {}),
    };
  },
  loaderDeps: ({ search }) => ({ month: search.month }),
  loader: ({ context, deps }) =>
    Promise.all([
      context.queryClient.ensureQueryData(
        personalQuery(context.user.id, deps.month ?? monthStartISO(todayUK())),
      ),
      context.queryClient.ensureQueryData(planQuery(context.user.id, monthStartISO(todayUK()))),
    ]),
  head: () => ({
    meta: [
      { title: "My Files — AVENZA personal finances" },
      {
        name: "description",
        content: "Your private personal income, expenses, savings and documents.",
      },
      { property: "og:title", content: "My Files — AVENZA" },
      { property: "og:description", content: "Private personal finances and document review." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: MyFiles,
  pendingComponent: () => (
    <main className="mx-auto max-w-6xl space-y-6 p-6">
      <Skeleton className="h-12 w-48" />
      <Skeleton className="h-40 w-full" />
      <Skeleton className="h-80 w-full" />
    </main>
  ),
  errorComponent: MyFilesError,
  notFoundComponent: () => <main className="p-6">My Files could not be found.</main>,
});

function MyFilesError({ error }: ErrorComponentProps) {
  const router = useRouter();
  return (
    <main className="mx-auto max-w-lg space-y-4 p-6">
      <h1 className="text-2xl">My Files</h1>
      <p role="alert">{friendlyError(error)}</p>
      <Button onClick={() => router.invalidate()}>Try again</Button>
      <Button asChild variant="outline">
        <Link to="/dashboard">Dashboard</Link>
      </Button>
    </main>
  );
}

function MyFiles() {
  const { user } = Route.useRouteContext();
  const search = Route.useSearch();
  const month = search.month ?? monthStartISO(todayUK());
  const view = search.view ?? "overview";
  const { data } = useSuspenseQuery(personalQuery(user.id, month));
  const { data: plan } = useSuspenseQuery(planQuery(user.id, monthStartISO(todayUK())));
  const navigate = useNavigate({ from: Route.fullPath });
  const [transactionOpen, setTransactionOpen] = useState(false);
  const [editing, setEditing] = useState<PersonalTransaction | undefined>();
  const openAdd = () => {
    setEditing(undefined);
    setTransactionOpen(true);
  };
  const switchView = (next: View) =>
    navigate({ search: (previous) => ({ ...previous, view: next, review: undefined }) });
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-4 sm:px-6">
          <Link to="/dashboard" className="font-display text-xl font-semibold text-primary">
            AVENZA
          </Link>
          <div className="flex items-center gap-2">
            <NotificationsBell notifications={plan.notifications} />
            <Button asChild variant="ghost">
              <Link to="/dashboard">
                <ChevronLeft className="mr-1 h-4 w-4" />
                Dashboard
              </Link>
            </Button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl space-y-6 px-4 py-6 sm:px-6 sm:py-8">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="flex items-center gap-3 text-3xl font-semibold">
              <FolderLock className="h-7 w-7 text-primary" />
              My Files
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">Personal finances · Private to you</p>
          </div>
          {(view === "overview" || view === "transactions") && (
            <div className="flex items-center gap-1">
              <Button
                variant="outline"
                size="icon"
                aria-label="Previous month"
                title="Previous month"
                onClick={() =>
                  navigate({
                    search: (previous) => ({ ...previous, month: addMonthsISO(month, -1) }),
                  })
                }
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Input
                aria-label="Month"
                type="month"
                className="w-40"
                value={month.slice(0, 7)}
                onChange={(event) => {
                  if (event.target.value)
                    navigate({
                      search: (previous) => ({
                        ...previous,
                        month: monthStartISO(event.target.value + "-01"),
                      }),
                    });
                }}
              />
              <Button
                variant="outline"
                size="icon"
                aria-label="Next month"
                title="Next month"
                onClick={() =>
                  navigate({
                    search: (previous) => ({ ...previous, month: addMonthsISO(month, 1) }),
                  })
                }
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          )}
        </div>
        <nav
          aria-label="My Files views"
          className="grid grid-cols-2 gap-2 border-b pb-4 sm:flex sm:flex-wrap"
        >
          {VIEWS.map(([key, label]) => (
            <Button key={key} asChild variant={view === key ? "default" : "ghost"}>
              <Link
                to="/my-files"
                search={{ ...search, view: key, review: undefined }}
                aria-current={view === key ? "page" : undefined}
              >
                {label}
              </Link>
            </Button>
          ))}
        </nav>
        {view === "overview" && (
          <>
            <PersonalPdfButton month={month} data={data} />
            <div className="grid gap-6 lg:grid-cols-2">
              <UpcomingBills bills={plan.bills} onAll={() => switchView("bills")} />
              <BudgetsCompact status={plan.budgetStatus} onAll={() => switchView("plan")} />
            </div>
            <Overview data={data} onUpload={() => switchView("documents")} onAdd={openAdd} />
          </>
        )}
        {view === "documents" && (
          <Documents
            userId={user.id}
            documents={data.documents}
            categories={data.categories}
            {...(search.review ? { reviewId: search.review } : {})}
            onReview={(review) => navigate({ search: (previous) => ({ ...previous, review }) })}
          />
        )}
        {view === "transactions" && (
          <Transactions
            transactions={data.transactions}
            kind={search.kind ?? "all"}
            onKind={(kind) => navigate({ search: (previous) => ({ ...previous, kind }) })}
            onAdd={openAdd}
            onEdit={(transaction) => {
              setEditing(transaction);
              setTransactionOpen(true);
            }}
          />
        )}
        {view === "categories" && <Categories categories={data.categories} />}
        {view === "bills" && <Bills bills={plan.bills} categories={data.categories} />}
        {view === "plan" && <BudgetsGoals plan={plan} categories={data.categories} />}
        {view === "assistant" && (
          <PersonalAssistant
            hasData={Boolean(
              data.recent.length ||
              data.documents.length ||
              plan.bills.length ||
              plan.budgets.length ||
              plan.goals.length,
            )}
          />
        )}
        <PersonalPrivacy userId={user.id} />
        <TransactionDialog
          key={editing?.id ?? "new"}
          open={transactionOpen}
          onClose={() => {
            setTransactionOpen(false);
            setEditing(undefined);
          }}
          categories={data.categories}
          {...(editing ? { transaction: editing } : {})}
        />
      </main>
    </div>
  );
}
