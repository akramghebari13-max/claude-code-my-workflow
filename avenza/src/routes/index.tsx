import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowLeftRight,
  CalendarCheck,
  Check,
  FileText,
  History,
  Layers,
  Percent,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { UkMapHero } from "@/components/uk-map-hero";
import { PLAN, PLAN_PRICE_TEXT } from "@/lib/billing";
import { InstallAppButton } from "@/components/install-app";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "AVENZA — UK accounting for sole traders and small companies" },
      { name: "description", content: "Keep your books, VAT and Self Assessment in one place. Built for UK sole traders and limited companies." },
      { property: "og:title", content: "AVENZA — UK accounting, done properly" },
      { property: "og:description", content: "Books, VAT and tax for UK sole traders and limited companies." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

/**
 * One plan for everything. Set to null to hide the pricing section and nav link.
 * The amount charged is set in src/lib/billing.ts (PLAN); keep the two in step.
 */
const PRICES = {
  price: PLAN_PRICE_TEXT,
  period: `per month, after a ${PLAN.trialDays}-day free trial`,
  extras: "One subscription covers every business you run and My Files. Cancel any time before the trial ends and you won't be charged.",
} as null | { price: string; period: string; extras?: string };

const AUDIENCE = [
  {
    kind: "Sole trader",
    title: "Your own name, your own books.",
    body: "Keep income, spending and invoices in order, with proper records behind your Self Assessment.",
  },
  {
    kind: "Limited company",
    title: "Company books, kept properly.",
    body: "Bookkeeping, VAT and year-end records in one place, separate from anything else you run.",
  },
];

const STEPS = [
  { title: "Add your business", body: "Choose sole trader or limited company. Each business gets its own records." },
  { title: "Record as you go", body: "Create invoices and log income and spending. Every pound is recorded twice, so the books always add up." },
  { title: "Stay ready", body: "Work towards VAT, Self Assessment and year-end from records that are already in order." },
];

const FEATURES = [
  { icon: ArrowLeftRight, title: "Double-entry bookkeeping", body: "Every pound is recorded twice, as money in one place and money out of another, so your books always add up." },
  { icon: Layers, title: "Separate businesses", body: "Sole traders and companies are kept apart, each with its own records." },
  { icon: History, title: "Full history", body: "Every change is logged. Nothing quietly disappears." },
  { icon: FileText, title: "Invoices", body: "Create and track invoices alongside your books, in the same place." },
  { icon: Percent, title: "VAT", body: "Keep the records VAT needs in the same place as everything else." },
  { icon: CalendarCheck, title: "Year-end and Self Assessment", body: "Records organised for the end of the year, so there is no scramble." },
];

const CHECKS = [
  { title: "Debits always equal credits.", body: "If something is out, you see it straight away instead of finding it at year-end." },
  { title: "Every change has a record.", body: "The full history is there to read, so nothing is altered without a trace." },
  { title: "No business mixes with another.", body: "Each sole trader or company has its own set of books." },
];

// Sample entries for illustration only.
const LEDGER: { caption: string; rows: [string, string, string][] }[] = [
  { caption: "Invoice paid", rows: [["Bank", "1,200.00", ""], ["Sales", "", "1,200.00"]] },
  { caption: "Materials bought", rows: [["Materials", "340.00", ""], ["Bank", "", "340.00"]] },
];

const PLAN_FEATURES = [
  "Sole traders and limited companies, as many as you run",
  "Double-entry books, invoices and bank reconciliation",
  "VAT returns, Self Assessment and year-end records",
  "Reports, tax estimates and full change history",
  "My Files for your personal finances",
];

const FAQ: [string, string][] = [
  ["Who is AVENZA for?", "UK sole traders and limited companies who want their bookkeeping, VAT and tax records in one place and in proper order."],
  ["What does double-entry mean?", "Every transaction is recorded twice: once where the money came from and once where it went. Total debits then always equal total credits, so a mistake shows up instead of hiding."],
  ["Can I keep more than one business?", "Yes. Sole traders and companies are kept apart, and each business has its own records."],
  ["Can anything change without a record?", "No. Every change is logged, so you can always see what was changed and nothing quietly disappears."],
  ["How much does it cost?", "£6.99 a month for everything, after a 14-day free trial. Cancel any time before the trial ends and you won't be charged."],
  ["How do I get started?", "Select Get started to create your account, start your free trial, then add your first business."],
];

const navLink =
  "inline-flex min-h-11 items-center rounded-sm text-[15px] font-medium text-primary-foreground hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-land-lime";
const lightBtn =
  "h-[52px] rounded-full bg-background px-8 text-[17px] font-semibold text-primary shadow-none hover:bg-card focus-visible:ring-2 focus-visible:ring-land-lime";
const ghostBtn =
  "h-[52px] rounded-full border-[1.5px] border-land-fog/70 bg-transparent px-7 text-[17px] font-semibold text-white shadow-none hover:bg-white/10 hover:text-white focus-visible:ring-2 focus-visible:ring-land-lime";
const eyebrow = "text-[13px] font-semibold uppercase tracking-[0.12em]";
const h2 = "font-display text-[clamp(30px,4vw,44px)] font-semibold leading-[1.1] tracking-[-0.01em] text-primary";

function Logo({ className }: { className?: string }) {
  return (
    <Link
      to="/"
      aria-label="AVENZA home"
      className={`inline-flex min-h-11 items-center gap-2.5 rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-land-lime ${className ?? ""}`}
    >
      <svg width="28" height="28" viewBox="0 0 28 28" aria-hidden="true">
        <rect x="3" y="4" width="22" height="9" rx="2" fill="currentColor" />
        <rect x="4" y="16" width="20" height="8" rx="1.5" fill="none" stroke="currentColor" strokeWidth="2" />
      </svg>
      <span className="font-display text-[22px] font-semibold tracking-[0.14em]">AVENZA</span>
    </Link>
  );
}

function Index() {
  return (
    <div id="top" className="min-w-0 bg-background">
      {/* HERO */}
      <section className="relative overflow-hidden bg-land-deep text-primary-foreground">
        <header className="mx-auto flex max-w-[1240px] flex-wrap items-center justify-between gap-x-6 gap-y-2 px-6 py-4">
          <Logo className="text-primary-foreground" />
          <nav aria-label="Main" className="flex flex-wrap items-center gap-x-6">
            <a href="#how" className={navLink}>How it works</a>
            <a href="#features" className={navLink}>Features</a>
            {PRICES && <a href="#pricing" className={navLink}>Pricing</a>}
            <a href="#faq" className={navLink}>FAQ</a>
            <Link to="/auth" className={navLink}>Sign in</Link>
            <Button
              asChild
              className="h-11 rounded-full bg-background px-5 text-[15px] font-semibold text-primary shadow-none hover:bg-card focus-visible:ring-2 focus-visible:ring-land-lime"
            >
              <Link to="/auth">Get started</Link>
            </Button>
          </nav>
        </header>

        <div className="mx-auto flex max-w-[1240px] flex-wrap items-center gap-x-6 px-6 pb-10">
          <div className="min-w-0 flex-[1_1_440px] py-6 md:py-12">
            <p className={`${eyebrow} mb-5 text-land-mint`}>Sole traders and limited companies, across the UK</p>
            <h1 className="mb-6 font-display text-[clamp(40px,5.6vw,76px)] font-semibold italic leading-[1.02] tracking-[-0.02em] text-white">
              Britain’s businesses, in good order.
            </h1>
            <p className="mb-9 max-w-[500px] text-[19px] leading-relaxed text-land-fog">
              From one-person trades to limited companies, AVENZA keeps books, VAT and tax records in one place, wherever the work takes you.
            </p>
            <div className="flex flex-wrap items-center gap-x-7 gap-y-2">
              <Button asChild className={lightBtn}>
                <Link to="/auth">Get started</Link>
              </Button>
              <a
                href="#how"
                className="inline-flex min-h-[52px] items-center rounded-sm text-base font-semibold text-white underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-land-lime"
              >
                See how it works
              </a>
            </div>
          </div>
          <div className="min-w-0 flex-[1.15_1_520px]">
            <UkMapHero />
          </div>
        </div>
      </section>

      {/* WHO IT'S FOR */}
      <section className="border-y bg-card">
        <div className="mx-auto max-w-6xl px-6 py-16 md:py-24">
          <h2 className={`${h2} mb-4 max-w-[680px]`}>Made for sole traders and limited companies.</h2>
          <p className="mb-12 max-w-[620px] text-lg leading-relaxed text-muted-foreground">
            Pick the one that matches how you trade. If you run both, each keeps its own records and the two are never mixed.
          </p>
          <div className="grid gap-6 md:grid-cols-2">
            {AUDIENCE.map((a) => (
              <div key={a.kind} className="rounded-2xl border bg-background p-8">
                <p className={`${eyebrow} mb-3 text-primary`}>{a.kind}</p>
                <h3 className="mb-3 font-display text-[26px] font-semibold leading-tight text-primary">{a.title}</h3>
                <p className="text-base leading-relaxed text-muted-foreground">{a.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section id="how" className="mx-auto max-w-6xl scroll-mt-4 px-6 py-16 md:py-24">
        <h2 className={`${h2} mb-4 max-w-[680px]`}>Three steps. No jargon.</h2>
        <p className="mb-12 max-w-[620px] text-lg leading-relaxed text-muted-foreground">
          Set up once, record as you go, and your books stay in order all year.
        </p>
        <div className="grid gap-10 md:grid-cols-3">
          {STEPS.map((s, i) => (
            <div key={s.title} className="border-t-2 border-primary pt-6">
              <p className="mb-4 font-mono text-sm font-medium text-primary">{String(i + 1).padStart(2, "0")}</p>
              <h3 className="mb-2.5 font-display text-2xl font-semibold leading-tight text-primary">{s.title}</h3>
              <p className="text-base leading-relaxed text-muted-foreground">{s.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* FEATURES */}
      <section id="features" className="scroll-mt-4 border-y bg-card">
        <div className="mx-auto max-w-6xl px-6 py-16 md:py-24">
          <h2 className={`${h2} mb-4 max-w-[680px]`}>What you get, in plain English.</h2>
          <p className="mb-12 max-w-[620px] text-lg leading-relaxed text-muted-foreground">Six things, each with one job.</p>
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map(({ icon: Icon, title, body }) => (
              <div key={title} className="rounded-2xl border bg-background p-7">
                <div className="mb-5 flex size-11 items-center justify-center rounded-full bg-secondary text-primary">
                  <Icon className="size-[22px]" aria-hidden="true" />
                </div>
                <h3 className="mb-2 text-lg font-semibold text-primary">{title}</h3>
                <p className="text-base leading-relaxed text-muted-foreground">{body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CHECK IT YOURSELF + SAMPLE LEDGER */}
      <section className="bg-primary text-primary-foreground">
        <div className="mx-auto max-w-6xl px-6 py-16 md:py-24">
          <div className="grid items-center gap-12 lg:grid-cols-2">
            <div>
              <h2 className="mb-4 max-w-[680px] font-display text-[clamp(30px,4vw,44px)] font-semibold leading-[1.1] tracking-[-0.01em] text-white">
                Three things you can check for yourself.
              </h2>
              <p className="max-w-[520px] text-lg leading-relaxed text-land-fog">
                Good accounts should not need to be taken on trust. Every entry is recorded twice, and the totals have to match.
              </p>
            </div>
            <div className="overflow-hidden rounded-2xl border bg-card text-card-foreground shadow-xl">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-4 sm:px-6">
                <span className="font-display text-lg font-semibold text-primary">Ledger</span>
                <span className="rounded-full bg-secondary px-3 py-1 text-xs font-semibold text-primary">
                  Sample entries, for illustration
                </span>
              </div>
              <table className="w-full text-[15px]">
                <caption className="sr-only">
                  Sample double-entry ledger showing two transactions with equal debit and credit totals
                </caption>
                <thead>
                  <tr className="border-b text-xs uppercase tracking-[0.1em] text-muted-foreground">
                    <th scope="col" className="px-4 py-2.5 text-left font-semibold sm:px-6">Account</th>
                    <th scope="col" className="px-4 py-2.5 text-right font-semibold sm:px-6">Debit (£)</th>
                    <th scope="col" className="px-4 py-2.5 text-right font-semibold sm:px-6">Credit (£)</th>
                  </tr>
                </thead>
                {LEDGER.map((g) => (
                  <tbody key={g.caption}>
                    <tr>
                      <td colSpan={3} className="px-4 pb-1 pt-4 text-xs font-semibold uppercase tracking-[0.08em] text-primary sm:px-6">
                        {g.caption}
                      </td>
                    </tr>
                    {g.rows.map(([account, debit, credit]) => (
                      <tr key={account}>
                        <td className="px-4 py-2.5 sm:px-6">{account}</td>
                        <td className="px-4 py-2.5 text-right font-mono font-medium sm:px-6">{debit || "–"}</td>
                        <td className="px-4 py-2.5 text-right font-mono font-medium sm:px-6">{credit || "–"}</td>
                      </tr>
                    ))}
                  </tbody>
                ))}
                <tfoot>
                  <tr className="border-t-2 border-primary font-semibold text-primary">
                    <td className="px-4 py-4 sm:px-6">Total</td>
                    <td className="px-4 py-4 text-right font-mono sm:px-6">1,540.00</td>
                    <td className="px-4 py-4 text-right font-mono sm:px-6">1,540.00</td>
                  </tr>
                </tfoot>
              </table>
              <div className="flex items-center gap-2.5 bg-secondary px-4 py-4 text-[15px] font-semibold text-primary sm:px-6">
                <Check className="size-5" aria-hidden="true" />
                Debits equal credits. The books balance.
              </div>
            </div>
          </div>

          <div className="mt-16 grid gap-10 md:grid-cols-3">
            {CHECKS.map((c, i) => (
              <div key={c.title} className="border-t border-land-fog/40 pt-6">
                <p className="mb-3.5 font-mono text-sm font-medium text-land-lime">{String(i + 1).padStart(2, "0")}</p>
                <h3 className="mb-2.5 font-display text-2xl font-semibold leading-tight text-white">{c.title}</h3>
                <p className="text-base leading-relaxed text-land-fog">{c.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* PRICING (hidden until PRICES is set) */}
      {PRICES && (
        <section id="pricing" className="mx-auto max-w-6xl scroll-mt-4 px-6 py-16 md:py-24">
          <h2 className={`${h2} mb-4 max-w-[680px]`}>Simple pricing. Nothing hidden.</h2>
          <p className="mb-12 max-w-[620px] text-lg leading-relaxed text-muted-foreground">
            One price for everything, shown in full. No extras, no per-business charges.
          </p>
          <div className="max-w-xl">
            {[PLAN_FEATURES].map((feats) => (
              <div key="plan" className="rounded-2xl border bg-card p-9">
                <p className={`${eyebrow} mb-4 text-primary`}>AVENZA</p>
                <p className="font-mono text-[22px] font-medium text-primary">{PRICES.price}</p>
                <p className="mb-6 mt-2 text-[15px] text-muted-foreground">{PRICES.period}</p>
                <ul className="mb-8 flex flex-col gap-3 text-base">
                  {feats.map((f) => (
                    <li key={f} className="flex items-start gap-3">
                      <Check className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden="true" />
                      {f}
                    </li>
                  ))}
                </ul>
                <Button asChild className="h-[52px] w-full rounded-full text-base font-semibold">
                  <Link to="/auth">Start free trial</Link>
                </Button>
              </div>
            ))}
          </div>
          {PRICES.extras && <p className="mt-8 text-[15px] leading-relaxed text-muted-foreground">{PRICES.extras}</p>}
        </section>
      )}

      {/* FAQ */}
      <section id="faq" className="scroll-mt-4 border-y bg-card">
        <div className="mx-auto max-w-[860px] px-6 py-16 md:py-24">
          <h2 className={`${h2} mb-10`}>Questions, answered.</h2>
          <Accordion type="single" collapsible className="border-t">
            {FAQ.map(([q, a]) => (
              <AccordionItem key={q} value={q}>
                <AccordionTrigger className="min-h-11 py-5 text-left text-lg font-semibold text-primary hover:no-underline">
                  {q}
                </AccordionTrigger>
                <AccordionContent className="max-w-[680px] text-base leading-[1.7] text-muted-foreground">
                  {a}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>
      </section>

      {/* FINAL CTA */}
      <section className="bg-primary text-primary-foreground">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-x-12 gap-y-8 px-6 py-16 md:py-24">
          <div className="min-w-0 flex-[1_1_420px]">
            <h2 className="mb-3 font-display text-[clamp(32px,4.4vw,52px)] font-semibold italic leading-[1.08] tracking-[-0.01em] text-white">
              Get your books in order.
            </h2>
            <p className="max-w-[520px] text-lg leading-relaxed text-land-fog">
              Start with one business and keep every pound accounted for.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-4">
            <Button asChild className={lightBtn}>
              <Link to="/auth">Get started</Link>
            </Button>
            <Button asChild variant="outline" className={ghostBtn}>
              <Link to="/auth">Sign in</Link>
            </Button>
            <InstallAppButton className={ghostBtn} />
          </div>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-x-8 gap-y-5 px-6 pb-12 pt-10">
        <div>
          <p className="mb-1.5 font-display text-lg font-semibold tracking-[0.14em] text-primary">AVENZA</p>
          <p className="text-sm text-muted-foreground">UK accounting, done properly. © {new Date().getFullYear()} AVENZA.</p>
        </div>
        <nav aria-label="Footer" className="flex flex-wrap gap-x-6">
          <a href="#how" className="inline-flex min-h-11 items-center text-sm font-medium text-foreground hover:underline">How it works</a>
          <a href="#features" className="inline-flex min-h-11 items-center text-sm font-medium text-foreground hover:underline">Features</a>
          {PRICES && <a href="#pricing" className="inline-flex min-h-11 items-center text-sm font-medium text-foreground hover:underline">Pricing</a>}
          <a href="#faq" className="inline-flex min-h-11 items-center text-sm font-medium text-foreground hover:underline">FAQ</a>
          <Link to="/privacy" className="inline-flex min-h-11 items-center text-sm font-medium text-foreground hover:underline">Privacy</Link>
          <Link to="/auth" className="inline-flex min-h-11 items-center text-sm font-medium text-foreground hover:underline">Sign in</Link>
        </nav>
      </footer>
    </div>
  );
}
