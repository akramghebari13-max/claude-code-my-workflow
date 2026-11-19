# AVENZA audit and fix plan

Scope: 14 pages, 7 database migrations, 6 test files (24 tests). Basic security scan: no issues found. That scan is shallow, so no deep review has been done. Nothing here claims HMRC or MTD compliance. The VAT, Income Tax and Corporation Tax logic follows the published GOV.UK guidance I read, but HMRC has not tested or certified any of it.

## Findings

### Critical (the books can be wrong)
1. **Reversing a system journal desyncs records.** The Journals tab offers "Reverse" on every journal (`b.$businessId.index.tsx:60`), and `reverse_journal` accepts any of them. Reversing an invoice, payment, money in/out, or VAT adjustment journal zeroes the ledger. The invoice still shows "sent"/"paid", the transaction still appears, and the bank line stays "reconciled". VAT returns and reports then disagree with the screens.
2. **No lock after a VAT return is filed.** `post_journal`, `record_transaction`, `issue_invoice`, `pay_invoice` and `void_invoice` all accept dates inside a filed period. A back-dated entry silently changes figures HMRC has already received.

### High
3. **Paid invoices can't be credited** (`void_invoice` rejects paid). There's no refund or credit-note flow for a paid sale, so users will reverse journals by hand, which triggers finding 1.
4. **Credit notes vanish from VAT instead of reducing it.** `vat_return_preview` only counts invoices with status `sent`/`paid`. If an invoice was issued in a filed quarter and credited in a later one, the later return never shows the negative VAT. A credit note needs its own date and its own figures in the period it's raised.
5. **Lists are silently cut off at 200 rows** (`ledger.ts:69,103,114`). The Money in/out totals (`money.tsx:33-34`) are worked out from those 200 rows only, so they're wrong for any active business. Bank matching is also capped at 1,000 rows (`bank.ts:84,94`).
6. **"Today" follows UTC, not UK time.** `current_date` defaults (invoice issue date, reversal date) and `new Date()` period choices can be a day off during British Summer Time near midnight. This affects quarter and tax-year edges.

### Medium
7. Staff (view-only) members can still see posting buttons on some screens. The database refuses the action, but the user gets a raw error. Check every screen for the `canPost` guard.
8. Raw database error text is shown in toasts. These need plain-English messages.
9. Child pages (Journals, Money, Invoices, VAT, Accounts, Trial balance, Settings) have no page title of their own. They all show "Books — AVENZA".
10. Mobile: 10 tabs sit on one scrolling row with nothing to show there's more. Tap targets on small "ghost" buttons are under 44px. Long tables (Trial balance, Reports) need checking at 414px width.
11. Accessibility: the file-import button is a label without a visible focus ring, Reconcile dialog rows rely on colour for +/−, and the error panel has no live region.
12. Tests cover only pure helpers. There are no tests for database rules such as balance, immutability, period lock, credit notes or tenant isolation.

### Low
13. The Trial balance doesn't refresh after Bank or Reports actions in some paths, because of mismatched cache keys.
14. Landing page and sign-in SEO tags exist. Signed-in pages are correctly left out of search.

## Fixes proposed (all safe, no external services, no data deletion)

1. **Protect system journals.** Add a link from each journal back to where it came from. `reverse_journal` refuses journals owned by an invoice, transaction, VAT return or bank line, with the message "Undo this from Invoices/Money instead". Hide "Reverse" for those journals in the UI.
2. **Undo a recorded transaction properly.** Add an `void_transaction` RPC: it reverses the journal, marks the transaction void, and returns any bank line to "To reconcile". The transaction stays visible as "Voided".
3. **Lock filed periods.** Add a check inside `post_journal`: if the entry date falls inside a filed VAT return period, refuse it with "This date is in a filed VAT return (Q…); use today's date for corrections."
4. **Proper credit notes.** Add an `credit_notes` table and a `credit_invoice` RPC that works on both sent and paid invoices, with its own number (CN-0001), date and figures. For paid invoices it can also record the refund. `vat_return_preview` then counts credit notes as negative in the period they're raised. Add a printable credit note page.
5. **UK dates.** Add a `uk_today()` database function (Europe/London), used in every default. Add a `todayUK()` helper for the screens. Use these for quarter and tax-year picks.
6. **Totals and paging.** Work out Money in/out totals in the database for the selected period. Add "Load more" paging instead of silent caps. Bank matching will search the database by amount and date instead of using a 1,000-row list.
7. **Roles in the UI.** Add one `useCanPost()` helper used on every screen. Staff see read-only screens with a note.
8. **Friendlier errors.** Add one helper that maps known database messages to plain English and falls back to "Something went wrong — nothing was saved."
9. **Page titles** on every business page.
10. **Mobile and accessibility.** Grouped tabs (Books / Sales / Bank / Tax / Settings) with a "More" menu below 640px. 44px tap targets. Focus rings on the import button. +/− shown as text as well as colour. `role="alert"` and `aria-live` on errors and toasts.

## How each fix will be verified
- **Database rules:** rehearsal scripts that run inside the database and undo themselves:
  - reversing a system journal is refused
  - posting into a filed period is refused
  - crediting a paid invoice produces a negative VAT amount in the next quarter
  - another business's data is unreadable
  - debits always equal credits
- **Unit tests** for the new helpers, using concrete values: UK date at 23:30 BST rolls to the next day, error mapping, and credit-note totals. The full test suite must pass.
- **Typecheck and build log** must be clean.
- **Browser checks** with a signed-in test user at 1280px and 414px, with screenshots of:
  - recording money, issuing and paying an invoice, then crediting it
  - importing and reconciling a statement
  - the Reports page
  - mobile navigation

## Not included (needs your decision or outside setup)
- Sending returns to HMRC (MTD VAT / Income Tax): needs HMRC developer credentials and HMRC's own recognition testing.
- Live bank feeds: needs an Open Banking provider account.
- A full security review: run a deep scan from the Security tab.
- Publishing, changing who can access the app, and deleting any existing data.

## Order
Fixes 1–3 first (book integrity), then 4–5, then 6–8, then 9–10. Each step is verified before the next starts.
