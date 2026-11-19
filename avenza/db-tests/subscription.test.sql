-- The £6.99 subscription is enforced by the database. Everything rolls back.
\set ON_ERROR_STOP on
begin;
create temp table _r(ord serial, msg text) on commit drop;
grant all on _r to authenticated; grant usage on sequence _r_ord_seq to authenticated;
insert into auth.users(id, email) values
  ('aaaaaaaa-0000-4000-8000-000000000001', 'paid@example.com'),
  ('aaaaaaaa-0000-4000-8000-000000000002', 'unpaid@example.com');
insert into public.subscriptions(user_id, status) values
  ('aaaaaaaa-0000-4000-8000-000000000001', 'trialing'),
  ('aaaaaaaa-0000-4000-8000-000000000002', 'canceled');

-- A subscriber sets up a business and records some money.
set local role authenticated;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-4000-8000-000000000001', true);
insert into public.businesses(id, name, business_type, address)
  values ('bbbbbbbb-0000-4000-8000-000000000001', 'Joinery', 'sole_trader', '1 High St');
do $t$ begin
  perform public.record_transaction('bbbbbbbb-0000-4000-8000-000000000001', 'in', '2026-11-01', 'Client', '',
    (select id from public.accounts where code = '4000'), (select id from public.accounts where code = '1200'), 12000, 0, null);
  if (select count(*) from public.journal_entries) <> 1 then raise exception 'FAIL subscriber posting'; end if;
  insert into _r(msg) values ('PASS: a subscriber (on trial) can create a business and post to the books');
end $t$;
insert into public.pf_categories(name) values ('Food');
insert into _r(msg) values ('PASS: a subscriber can use My Files');

-- A person with an ended subscription gets nothing.
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-4000-8000-000000000002', true);
do $t$ begin
  begin
    insert into public.businesses(name, business_type, address) values ('Sneaky Ltd', 'limited_company', 'x');
    raise exception 'FAIL: unpaid user created a business';
  exception when insufficient_privilege then null; end;
  insert into _r(msg) values ('PASS: without a subscription you cannot create a business');
  begin
    insert into public.pf_categories(name) values ('Rent');
    raise exception 'FAIL: unpaid user wrote to My Files';
  exception when insufficient_privilege then null; end;
  if exists (select 1 from public.pf_categories) then raise exception 'FAIL: unpaid user read My Files'; end if;
  insert into _r(msg) values ('PASS: without a subscription My Files can be neither read nor written');
  begin
    insert into storage.objects(bucket_id, name) values ('my-files', 'aaaaaaaa-0000-4000-8000-000000000002/x.pdf');
    raise exception 'FAIL: unpaid user uploaded a file';
  exception when insufficient_privilege then null; end;
  insert into _r(msg) values ('PASS: without a subscription no files can be uploaded');
end $t$;

-- The subscriber's own subscription lapses: their books lock, and come back when they pay.
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-4000-8000-000000000001', true);
reset role;
update public.subscriptions set status = 'past_due' where user_id = 'aaaaaaaa-0000-4000-8000-000000000001';
set local role authenticated;
do $t$ begin
  if exists (select 1 from public.businesses) or exists (select 1 from public.journal_entries)
     or exists (select 1 from public.pf_categories) then
    raise exception 'FAIL: lapsed subscriber can still read records';
  end if;
  begin
    perform public.post_journal('bbbbbbbb-0000-4000-8000-000000000001', '2026-11-02', 'x', null, '[]'::jsonb);
    raise exception 'FAIL: lapsed subscriber posted';
  exception when raise_exception then
    if sqlerrm not like 'Not allowed%' then raise; end if;
  end;
  begin
    perform public.period_balances('bbbbbbbb-0000-4000-8000-000000000001', null, '2026-12-31');
    raise exception 'FAIL: lapsed subscriber read reports';
  exception when raise_exception then null; end;
  insert into _r(msg) values ('PASS: when a payment fails the books lock: no reading, posting or reports');
end $t$;
reset role;
update public.subscriptions set status = 'active' where user_id = 'aaaaaaaa-0000-4000-8000-000000000001';
set local role authenticated;
do $t$ begin
  if (select count(*) from public.journal_entries) <> 1 or (select count(*) from public.pf_categories) <> 1 then
    raise exception 'FAIL: records missing after resubscribing';
  end if;
  insert into _r(msg) values ('PASS: paying again brings every record back, untouched');
end $t$;

-- The subscription row itself stays readable (the app needs it to show "Subscribe to continue")
-- and only the server can change it.
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-4000-8000-000000000002', true);
do $t$ begin
  if (select status from public.subscriptions) <> 'canceled' then raise exception 'FAIL: cannot read own subscription'; end if;
  if (select count(*) from public.subscriptions) <> 1 then raise exception 'FAIL: can see other subscriptions'; end if;
  begin
    update public.subscriptions set status = 'active';
    raise exception 'FAIL: user activated their own subscription';
  exception when insufficient_privilege then null; end;
  insert into _r(msg) values ('PASS: users see only their own subscription and cannot switch it on themselves');
end $t$;
reset role;
select msg from _r order by ord;
rollback;
