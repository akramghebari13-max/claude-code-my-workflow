import { createFileRoute, Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { LEGAL } from "@/lib/legal";

export const Route = createFileRoute("/privacy")({
  head: () => ({
    meta: [
      { title: "Privacy policy — AVENZA" },
      {
        name: "description",
        content: "What AVENZA collects, why, who it's shared with, and your rights.",
      },
    ],
  }),
  component: Privacy,
});

function H({ children }: { children: ReactNode }) {
  return <h2 className="mt-10 text-2xl font-semibold">{children}</h2>;
}

function Privacy() {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-6 py-4">
          <Link to="/" className="font-display text-xl font-semibold text-primary">
            AVENZA
          </Link>
          <Link to="/auth" className="text-sm font-medium hover:underline">
            Sign in
          </Link>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-6 py-12 text-base leading-relaxed [&_li]:mt-2 [&_p]:mt-4 [&_ul]:mt-3 [&_ul]:list-disc [&_ul]:pl-6">
        <h1 className="text-4xl font-semibold">Privacy policy</h1>
        <p className="text-sm text-muted-foreground">Last updated {LEGAL.updated}</p>
        <p>
          AVENZA is bookkeeping and tax software for UK sole traders and limited companies, with a
          private space (My Files) for personal finances. It is run by {LEGAL.controller},{" "}
          {LEGAL.address} ("we"). We are the data controller for the information described here,
          registered with the Information Commissioner's Office under {LEGAL.icoNumber}. Questions
          or requests:{" "}
          <a className="text-primary underline" href={`mailto:${LEGAL.email}`}>
            {LEGAL.email}
          </a>
          .
        </p>

        <H>What we collect</H>
        <ul>
          <li>
            <strong>Your account:</strong> name, email address and password (stored only as a secure
            hash), or the name and email from your Apple, Google or Lovable account if you sign in
            with one of those (with Apple you can choose to hide your real email).
          </li>
          <li>
            <strong>Your businesses' books:</strong> business details (name, address, company
            number, VAT number), customers, invoices, money in and out, bank statement lines you
            import, receipts and documents you upload, VAT returns and reports.
          </li>
          <li>
            <strong>My Files:</strong> personal documents you upload (such as payslips, bills and
            bank statements), and the transactions, bills, budgets and goals you record.
          </li>
          <li>
            <strong>HMRC filing:</strong> if you connect HMRC, your National Insurance number (for
            Income Tax), the access tokens HMRC issues, and what you submit. HMRC requires software
            to send "fraud prevention" information with each submission: your device's browser,
            screen size, time zone and IP address.
          </li>
          <li>
            <strong>Subscription:</strong> your subscription status and Stripe customer reference.
            Card details go straight to Stripe; we never see or store them.
          </li>
          <li>
            <strong>Technical:</strong> a sign-in token kept in your browser so you stay signed in.
            We don't use advertising or analytics cookies.
          </li>
        </ul>

        <H>Why we use it (and the legal basis)</H>
        <ul>
          <li>
            To provide AVENZA to you: keep your books, prepare returns, file with HMRC when you ask
            us to, and run your subscription. This is necessary for our <em>contract</em> with you.
          </li>
          <li>
            To meet legal duties, such as keeping payment records and HMRC's fraud prevention rules:{" "}
            <em>legal obligation</em>.
          </li>
          <li>
            To keep the service secure and fix problems: our <em>legitimate interests</em>.
          </li>
        </ul>
        <p>
          We don't sell your information, use it for advertising, or use your records to train AI
          models.
        </p>

        <H>Who it's shared with</H>
        <p>
          Only with the services that make AVENZA work, each under a contract that limits what they
          can do with it:
        </p>
        <ul>
          <li>
            <strong>Lovable and Supabase</strong>: host the app, the database and uploaded files.
          </li>
          <li>
            <strong>Stripe</strong>: takes subscription payments.
          </li>
          <li>
            <strong>HMRC</strong>: receives VAT returns and Income Tax updates, only when you send
            them.
          </li>
          <li>
            <strong>Lovable AI gateway and the AI model provider behind it</strong>: when you use AI
            features (suggesting a category for a bank line, reading a receipt or document, the My
            Files assistant, explaining a report), the relevant text or document is sent to be
            processed and the answer returned. We send these requests with the provider's storage
            turned off.
          </li>
          <li>
            <strong>Apple, Google or Lovable</strong>: if you sign in with them. Our pages also load
            fonts from Google Fonts, which sees your IP address.
          </li>
          <li>
            People you invite to a business (such as your accountant) see that business's books, not
            your My Files.
          </li>
        </ul>
        <p>
          Some of these providers process data outside the UK. Where they do, the transfer is
          covered by UK adequacy regulations or the UK's International Data Transfer Agreement or
          Addendum.
        </p>

        <H>How long we keep it</H>
        <ul>
          <li>
            For as long as you have an account, including while your subscription is paused or
            ended, so you can come back to your books.
          </li>
          <li>
            When you delete your account, your login, My Files and every business you own alone
            (with all its records and uploaded files) are deleted straight away. Businesses you
            share with another owner stay with them. Copies in backups are removed as the backups
            expire.
          </li>
          <li>
            Stripe keeps payment records as the law requires. What you've filed with HMRC is held by
            HMRC.
          </li>
        </ul>
        <p>
          <strong>Your record-keeping duty:</strong> HMRC requires businesses to keep their records
          (at least 5 years after the 31 January filing deadline for sole traders, 6 years for
          companies). Download your reports before deleting your account.
        </p>

        <H>Your rights</H>
        <p>
          Under UK data protection law you can ask for a copy of your information, ask us to correct
          or delete it, object to or restrict how we use it, and ask for it in a portable format.
          You can delete your account yourself in AVENZA under <strong>Account</strong>. For
          anything else, email{" "}
          <a className="text-primary underline" href={`mailto:${LEGAL.email}`}>
            {LEGAL.email}
          </a>
          ; we reply within one month.
        </p>
        <p>
          If you're unhappy with how we've handled your information, you can complain to the
          Information Commissioner's Office:{" "}
          <a className="text-primary underline" href="https://ico.org.uk/make-a-complaint/">
            ico.org.uk/make-a-complaint
          </a>
          , 0303 123 1113.
        </p>

        <H>Security</H>
        <p>
          Everything travels over encrypted connections. Each business's books are visible only to
          its members, and My Files only to you; the database itself enforces this. HMRC tokens are
          never sent to your browser.
        </p>

        <H>Changes</H>
        <p>
          If we change this policy in a way that matters, we'll tell you in the app or by email
          before it takes effect.
        </p>
      </main>
    </div>
  );
}
