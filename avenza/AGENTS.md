<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.

## What Lovable manages

Rules outside this block are the project's own. Change the pieces below in
Lovable, not by hand. With the [Lovable MCP](https://mcp.lovable.dev)
connected, `send_message` asks Lovable to do it; otherwise ask the user to
use the editor.

- **Database.** Do not add or edit `supabase/migrations/` or `drizzle/`.
  Ask Lovable to change the schema.
- **Generated files.** Do not edit a file whose header says it is automatically
  generated.
- **AI gateway.** Keep model calls on Lovable's gateway, and keep
  `LOVABLE_API_KEY` out of browser code.
- **Connectors.** Lovable provides native connectors. `list_connectors` shows
  which are enabled; `add_connector` only returns the dashboard link. When a
  connector is enabled, calls go through the connector gateway and need
  `LOVABLE_API_KEY`. When Lovable does not provide one, users can bring their
  own key and store it in Secrets.
- **Secrets.** Lovable manages them. Do not put secret values in the repo.
<!-- LOVABLE:END -->

- Every business-owned table carries `business_id` and uses RLS via `is_business_member` / `has_business_role` security-definer functions — keeps business data isolated.
- Changes to business data are recorded by the `write_audit` trigger into read-only `audit_log` — audit history must never be editable from the app.
- Journals are posted only through the `post_journal` / `reverse_journal` database functions (no direct insert grants); posted journals are immutable and amounts are integer pence — guarantees balanced, tamper-evident books.
- Money in/out and invoice lifecycle (save/issue/pay/void) go through security-definer RPCs that post journals; receipts live in the private `receipts` bucket under `<business_id>/` and are opened via short-lived signed URLs.
- VAT return figures are computed only by the `vat_return_preview` DB function (scheme-aware) and frozen by `file_vat_return`; filed periods cannot overlap.
- Bank statement lines are imported only via `import_bank_lines` (fingerprint dedupe, safe re-import) and reconciled only via `reconcile_bank_line`, which reuses the posting RPCs — keeps bank lines and books in step.
- Period reports (P&L, balance sheet) are built from the `period_balances` DB function; tax estimates live in `src/lib/reports.ts` with tests — keeps figures traceable to posted journals.
- Journals owned by another record (money, invoice, credit note, VAT) can only be undone through that record's RPC (`void_transaction`, `credit_invoice`); `reverse_journal` is for manual journals and `post_journal` refuses dates inside filed VAT periods — keeps screens, ledger and filed returns consistent.
- Dates default to UK time (`uk_today()` in SQL, `todayUK()` in `src/lib/app.ts`); UI errors go through `friendlyError` and role checks through `useCanPost` — one place for each rule.
- The report assistant is an authenticated server function (`src/lib/report-ai.functions.ts`) that rebuilds figures from `period_balances` under the caller's RLS before calling Lovable AI; the model never gets raw tables. Report PDFs are built from figures with jsPDF in the browser.
- Bank match suggestions come from the `bank_match_candidates` DB function (all history, membership-checked) — avoids client row caps.
- HMRC OAuth tokens live only in the service-role-only `hmrc_connections` / `hmrc_oauth_states` tables; the app reads them through `hmrc_connection_status` (metadata only) and submits returns from authenticated server functions behind a role check — keeps HMRC credentials out of the browser.
- A business with accounting records cannot be deleted (`guard_business_delete`) because HMRC requires records for 6 years — removals need an explicit, deliberate decision, not a stray click.
- Home-screen support is manifest-only (`public/manifest.webmanifest` + head tags), no service worker — nothing is cached offline, so previews and published updates always load fresh.
- MTD Income Tax uses its own service-role-only `hmrc_itsa_connections` (NINO + tokens, read via `hmrc_itsa_status`); figures sent to HMRC are rebuilt server-side from `period_balances`, and sends are logged in read-only `itsa_submissions` via `record_itsa_submission` — the browser never supplies tax figures.
- Bank category suggestions (`suggestCategory` in `src/lib/categorise.functions.ts`) reuse past choices first, then ask Lovable AI, and only pre-fill the form — the user still confirms, and the AI's answer is accepted only if it names an allowed account code.
- Personal finance uses only `pf_` objects with immutable user ownership, forced owner-only RLS, invoker functions, and the private user-folder `my-files` bucket — it must never post to or depend on business books.
- My Files lives directly under the signed-in layout, loads user-keyed Query data, and reads documents through an authenticated conditional claim; AI only fills review fields and the invoker confirmation RPC alone creates linked transactions — keeps personal access independent of businesses and prevents double extraction or automatic posting.
- My Files assistant reads only caller-scoped facts, validates output figures, and never stores chat; PDFs stay client-side and deletion removes private storage before atomic owner-only record deletion — preserves personal/business separation. Questions are unlimited and a provider denial applies to that request only (no stored denial marker).
- Access needs a trial or paid £6.99/month subscription (`subscriptions`, written only by the server from Stripe). The app gate redirects to `/subscribe`, and the database enforces it too: `is_business_member`, `has_business_role` and `can_post` require `has_active_subscription()`, and restrictive policies cover `businesses`, every `pf_` table and the `receipts`/`my-files` buckets — the paywall can't be bypassed through the API. Database rules are tested with `db-tests/run.sh` (PostgreSQL + a Supabase stand-in).
