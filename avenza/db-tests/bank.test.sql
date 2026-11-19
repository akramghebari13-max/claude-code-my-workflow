-- The Bank tab end to end: a real statement (fixtures/statement.csv, parsed by the app into
-- fixtures/statement.json — src/lib/bank-flow.test.ts checks the two agree) is imported, every
-- line is dealt with the way the Bank tab offers, and the books are checked afterwards.
-- Everything rolls back.
\set ON_ERROR_STOP on
\set statement `cat db-tests/fixtures/statement.json`
begin;
create temp table _r(ord serial, msg text) on commit drop;
create temp table _stmt as select :'statement'::jsonb as lines;
create temp table _ids(k text primary key, id uuid);
grant all on _r, _stmt, _ids to authenticated; grant usage on sequence _r_ord_seq to authenticated;

insert into auth.users(id, email) values
  ('cccccccc-0000-4000-8000-000000000001', 'owner@example.com'),
  ('cccccccc-0000-4000-8000-000000000002', 'stranger@example.com');
insert into public.subscriptions(user_id, status) values
  ('cccccccc-0000-4000-8000-000000000001', 'active'),
  ('cccccccc-0000-4000-8000-000000000002', 'active');

set local role authenticated;
select set_config('request.jwt.claim.sub', 'cccccccc-0000-4000-8000-000000000001', true);
insert into public.businesses(id, name, business_type, address)
  values ('dddddddd-0000-4000-8000-000000000001', 'Joinery', 'sole_trader', '1 High St');

-- Before the statement: an unpaid invoice, money already recorded, and a past Screwfix purchase
-- (the history the category suggestion learns from).
do $t$
declare b uuid := 'dddddddd-0000-4000-8000-000000000001';
        a jsonb; cust uuid; inv uuid;
begin
  select jsonb_object_agg(code, id) into a from public.accounts where business_id = b;
  insert into _ids select key, value::uuid from jsonb_each_text(a);
  insert into public.customers(business_id, name) values (b, 'Smith & Co') returning id into cust;
  inv := public.save_invoice(b, null, cust, '2026-10-20', '2026-11-03', null,
    '[{"description":"Fitted wardrobe","quantity":1,"unit_pence":48000,"vat_rate_bp":0}]'::jsonb);
  perform public.issue_invoice(inv);
  insert into _ids values ('invoice', inv);
  insert into _ids values ('jones', public.record_transaction(b, 'in', '2026-11-04', 'Jones Design Ltd', 'Kitchen plans',
    (a->>'4000')::uuid, (a->>'1200')::uuid, 25000, 0, null));
  perform public.record_transaction(b, 'out', '2026-10-01', 'Screwfix', 'Hinges',
    (a->>'5000')::uuid, (a->>'1200')::uuid, 6000, 1000, null);
end $t$;

-- 1. Import the statement.
do $t$
declare b uuid := 'dddddddd-0000-4000-8000-000000000001'; bank uuid := (select id from _ids where k = '1200'); n int;
begin
  n := public.import_bank_lines(b, bank, (select lines from _stmt));
  if n <> 5 then raise exception 'FAIL: imported % lines, expected 5', n; end if;
  if (select count(*) from public.bank_statement_lines where description = 'MONTHLY ACCOUNT FEE') <> 2 then
    raise exception 'FAIL: two identical fees on one day must both be kept';
  end if;
  if (select count(*) from public.bank_statement_lines where status = 'unmatched') <> 5 then raise exception 'FAIL: new lines not waiting'; end if;
  insert into _r(msg) values ('PASS: importing the statement brings in all 5 lines, including two identical fees on one day');
  n := public.import_bank_lines(b, bank, (select lines from _stmt));
  if n <> 0 or (select count(*) from public.bank_statement_lines) <> 5 then raise exception 'FAIL: re-import duplicated lines'; end if;
  insert into _r(msg) values ('PASS: importing the same statement again adds nothing');
end $t$;

-- 2. Money in that pays an invoice: suggested, then "Mark paid".
do $t$
declare line uuid := (select id from public.bank_statement_lines where amount_pence = 48000);
        inv uuid := (select id from _ids where k = 'invoice');
begin
  if not exists (select 1 from public.bank_match_candidates(line) c where c.kind = 'invoice' and c.id = inv) then
    raise exception 'FAIL: unpaid invoice not suggested';
  end if;
  perform public.reconcile_bank_line(line, 'invoice', inv, null, 0);
  if (select status from public.invoices where id = inv) <> 'paid' then raise exception 'FAIL: invoice not marked paid'; end if;
  if (select invoice_id from public.bank_statement_lines where id = line) <> inv then raise exception 'FAIL: line not linked'; end if;
  insert into _r(msg) values ('PASS: a payment from a customer is suggested against their invoice and marks it paid');
end $t$;

-- 3. Money already recorded: suggested within 7 days, matched without posting it twice.
do $t$
declare line uuid := (select id from public.bank_statement_lines where amount_pence = 25000);
        jones uuid := (select id from _ids where k = 'jones'); before bigint := (select count(*) from public.journal_entries);
        other uuid := (select id from public.bank_statement_lines where amount_pence = -500 order by id limit 1);
begin
  if not exists (select 1 from public.bank_match_candidates(line) c where c.kind = 'transaction' and c.id = jones) then
    raise exception 'FAIL: recorded money not suggested';
  end if;
  begin
    perform public.reconcile_bank_line(other, 'transaction', jones, null, 0);
    raise exception 'FAIL: matched a different amount';
  exception when raise_exception then if sqlerrm <> 'Amounts do not match' then raise; end if; end;
  perform public.reconcile_bank_line(line, 'transaction', jones, null, 0);
  if (select count(*) from public.journal_entries) <> before then raise exception 'FAIL: matching posted a new entry'; end if;
  if exists (select 1 from public.bank_match_candidates(line)) then raise exception 'FAIL: matched money still offered'; end if;
  insert into _r(msg) values ('PASS: money already recorded is suggested and matched without being counted twice; a wrong amount is refused');
end $t$;

-- 4. A new purchase: the category comes from history (src/lib/bank-flow.test.ts suggests 5000
--    for this line from the Screwfix purchase above); record it with VAT.
do $t$
declare line uuid := (select id from public.bank_statement_lines where amount_pence = -120000); tid uuid; e uuid;
        bank uuid := (select id from _ids where k = '1200'); cos uuid := (select id from _ids where k = '5000');
        vat uuid := (select id from _ids where k = '2200');
begin
  -- what suggestCategory reads: expense accounts, and past money with its category
  if not exists (select 1 from public.transactions where counterparty = 'Screwfix' and category_account_id = cos) then
    raise exception 'FAIL: history for the suggestion is not readable';
  end if;
  perform public.reconcile_bank_line(line, 'new', null, cos, 20000);
  select transaction_id into tid from public.bank_statement_lines where id = line and status = 'matched';
  select journal_entry_id into e from public.transactions
    where id = tid and direction = 'out' and txn_date = '2026-11-03' and gross_pence = 120000 and vat_pence = 20000;
  if e is null then raise exception 'FAIL: purchase not recorded as money out on the statement date'; end if;
  if (select count(*) from public.journal_lines where entry_id = e) <> 3
     or not exists (select 1 from public.journal_lines where entry_id = e and account_id = bank and credit_pence = 120000)
     or not exists (select 1 from public.journal_lines where entry_id = e and account_id = cos and debit_pence = 100000)
     or not exists (select 1 from public.journal_lines where entry_id = e and account_id = vat and debit_pence = 20000) then
    raise exception 'FAIL: wrong double entry for the purchase';
  end if;
  insert into _r(msg) values ('PASS: a new purchase is recorded in the suggested category: bank £1,200 out, cost £1,000, VAT £200 to reclaim');
end $t$;

-- 5. The two fees: ignore one by mistake, restore it, then record both as bank charges.
do $t$
declare l1 uuid; l2 uuid; charges uuid := (select id from _ids where k = '7900');
begin
  select id into l1 from public.bank_statement_lines where amount_pence = -500 order by id limit 1;
  select id into l2 from public.bank_statement_lines where amount_pence = -500 and id <> l1;
  perform public.reconcile_bank_line(l1, 'exclude', null, null, 0);
  if (select status from public.bank_statement_lines where id = l1) <> 'excluded' then raise exception 'FAIL: ignore'; end if;
  perform public.reconcile_bank_line(l1, 'unexclude', null, null, 0);
  perform public.reconcile_bank_line(l1, 'new', null, charges, 0);
  perform public.reconcile_bank_line(l2, 'new', null, charges, 0);
  begin
    perform public.reconcile_bank_line(l2, 'new', null, charges, 0);
    raise exception 'FAIL: reconciled the same line twice';
  exception when raise_exception then if sqlerrm <> 'Line already dealt with' then raise; end if; end;
  insert into _r(msg) values ('PASS: a line ignored by mistake can be restored; a line cannot be reconciled twice');
end $t$;

-- 6. The books afterwards.
do $t$
declare bank uuid := (select id from _ids where k = '1200'); nov bigint;
begin
  if exists (select 1 from public.bank_statement_lines where status <> 'matched') then raise exception 'FAIL: lines left over'; end if;
  select coalesce(sum(l.debit_pence - l.credit_pence), 0) into nov
    from public.journal_lines l join public.journal_entries e on e.id = l.entry_id
    where l.account_id = bank and e.entry_date between '2026-11-01' and '2026-11-30';
  if nov <> (select sum((x->>'amount_pence')::bigint) from _stmt, jsonb_array_elements(lines) x) then
    raise exception 'FAIL: bank account moved % in November, statement says otherwise', nov;
  end if;
  if (select sum(debit_pence) - sum(credit_pence) from public.journal_lines) <> 0 then raise exception 'FAIL: books out of balance'; end if;
  if (select count(*) from public.transactions where gross_pence = 500 and category_account_id = (select id from _ids where k = '7900')) <> 2 then
    raise exception 'FAIL: fees not in bank charges';
  end if;
  insert into _r(msg) values ('PASS: everything reconciled; the bank account in the books moved exactly as the statement did, and the books balance');
end $t$;

insert into _ids select 'a line', id from public.bank_statement_lines limit 1;

-- 7. Someone else (with their own subscription) can't see or touch these lines.
select set_config('request.jwt.claim.sub', 'cccccccc-0000-4000-8000-000000000002', true);
do $t$
declare line uuid;
begin
  if exists (select 1 from public.bank_statement_lines) then raise exception 'FAIL: stranger sees bank lines'; end if;
  line := (select id from _ids where k = 'a line');
  begin
    perform public.reconcile_bank_line(line, 'exclude', null, null, 0);
    raise exception 'FAIL: stranger changed a line';
  exception when raise_exception then if sqlerrm <> 'Not allowed' then raise; end if; end;
  begin
    perform public.import_bank_lines('dddddddd-0000-4000-8000-000000000001', (select id from _ids where k = '1200'), (select lines from _stmt));
    raise exception 'FAIL: stranger imported into someone else''s books';
  exception when raise_exception then if sqlerrm <> 'Not allowed' then raise; end if; end;
  insert into _r(msg) values ('PASS: other people cannot see, import into or reconcile someone else''s bank');
end $t$;
reset role;
select msg from _r order by ord;
rollback;
