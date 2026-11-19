-- Deleting an account removes the person's own businesses (books and all), their memberships and
-- their personal records, and nothing belonging to anyone else. Everything rolls back.
\set ON_ERROR_STOP on
begin;
create temp table _r(ord serial, msg text) on commit drop;
grant all on _r to authenticated, service_role; grant usage on sequence _r_ord_seq to authenticated, service_role;

-- A is leaving. B stays: B co-owns one of A's businesses and has A as accountant on another.
insert into auth.users(id, email) values
  ('eeeeeeee-0000-4000-8000-00000000000a', 'leaving@example.com'),
  ('eeeeeeee-0000-4000-8000-00000000000b', 'staying@example.com');
insert into public.subscriptions(user_id, status) values
  ('eeeeeeee-0000-4000-8000-00000000000a', 'active'),
  ('eeeeeeee-0000-4000-8000-00000000000b', 'active');

set local role authenticated;
select set_config('request.jwt.claim.sub', 'eeeeeeee-0000-4000-8000-00000000000a', true);
insert into public.businesses(id, name, business_type, address) values
  ('ffffffff-0000-4000-8000-000000000001', 'A alone', 'sole_trader', 'x'),
  ('ffffffff-0000-4000-8000-000000000002', 'A and B', 'limited_company', 'x');
select public.record_transaction(b, 'in', '2026-11-01', 'Client', '',
  (select id from public.accounts where business_id = b and code = '4000'),
  (select id from public.accounts where business_id = b and code = '1200'), 10000, 0, null)
from unnest(array['ffffffff-0000-4000-8000-000000000001', 'ffffffff-0000-4000-8000-000000000002']::uuid[]) b;
select public.import_bank_lines('ffffffff-0000-4000-8000-000000000001',
  (select id from public.accounts where business_id = 'ffffffff-0000-4000-8000-000000000001' and code = '1200'),
  '[{"date":"2026-11-01","description":"Client","amount_pence":10000}]');
insert into public.pf_categories(name) values ('Food');
insert into public.pf_assistant_usage default values;

select set_config('request.jwt.claim.sub', 'eeeeeeee-0000-4000-8000-00000000000b', true);
insert into public.businesses(id, name, business_type, address) values ('ffffffff-0000-4000-8000-000000000003', 'B alone', 'sole_trader', 'x');
select public.record_transaction('ffffffff-0000-4000-8000-000000000003', 'in', '2026-11-01', 'Client', '',
  (select id from public.accounts where business_id = 'ffffffff-0000-4000-8000-000000000003' and code = '4000'),
  (select id from public.accounts where business_id = 'ffffffff-0000-4000-8000-000000000003' and code = '1200'), 5000, 0, null);
insert into public.pf_categories(name) values ('Rent');
reset role;
insert into public.business_members(business_id, user_id, role) values
  ('ffffffff-0000-4000-8000-000000000002', 'eeeeeeee-0000-4000-8000-00000000000b', 'owner'),
  ('ffffffff-0000-4000-8000-000000000003', 'eeeeeeee-0000-4000-8000-00000000000a', 'accountant');

-- Only the server can delete an account.
set local role authenticated;
select set_config('request.jwt.claim.sub', 'eeeeeeee-0000-4000-8000-00000000000a', true);
do $t$ begin
  begin
    perform public.delete_account_data('eeeeeeee-0000-4000-8000-00000000000b');
    raise exception 'FAIL: a signed-in user deleted someone''s account';
  exception when insufficient_privilege then null; end;
  insert into _r(msg) values ('PASS: signed-in users cannot call the deletion function (not even on others)');
end $t$;
reset role;

set local role service_role;
do $t$
declare a uuid := 'eeeeeeee-0000-4000-8000-00000000000a'; ids uuid[];
begin
  if array(select public.account_deletion_businesses(a)) <> array['ffffffff-0000-4000-8000-000000000001'::uuid] then
    raise exception 'FAIL: wrong businesses picked for deletion';
  end if;
  insert into _r(msg) values ('PASS: only the business A owns alone is marked to go (not the co-owned one, not the one A keeps books for)');
  ids := public.delete_account_data(a);
  if ids <> array['ffffffff-0000-4000-8000-000000000001'::uuid] then raise exception 'FAIL: returned %', ids; end if;
  if exists (select 1 from public.businesses where id = ids[1])
     or exists (select 1 from public.journal_entries where business_id = ids[1])
     or exists (select 1 from public.transactions where business_id = ids[1])
     or exists (select 1 from public.bank_statement_lines where business_id = ids[1])
     or exists (select 1 from public.accounts where business_id = ids[1])
     or exists (select 1 from public.audit_log where business_id = ids[1]) then
    raise exception 'FAIL: A''s own business left data behind';
  end if;
  insert into _r(msg) values ('PASS: A''s own business is deleted with its books, bank lines, chart of accounts and history');
  if exists (select 1 from public.business_members where user_id = a) then raise exception 'FAIL: memberships left'; end if;
  if (select count(*) from public.businesses) <> 2
     or (select count(*) from public.journal_entries where business_id = 'ffffffff-0000-4000-8000-000000000002') <> 1
     or (select count(*) from public.journal_entries where business_id = 'ffffffff-0000-4000-8000-000000000003') <> 1
     or not exists (select 1 from public.business_members where business_id = 'ffffffff-0000-4000-8000-000000000002' and role = 'owner') then
    raise exception 'FAIL: B''s businesses were touched';
  end if;
  insert into _r(msg) values ('PASS: businesses shared with someone else keep their books; A just stops being a member');
  if current_setting('avenza.deleting_account', true) = 'on' then raise exception 'FAIL: deletion switch left on'; end if;
  begin
    delete from public.businesses where id = 'ffffffff-0000-4000-8000-000000000003';
    raise exception 'FAIL: guard off';
  exception when raise_exception then if sqlerrm not like 'This business has accounting records%' then raise; end if; end;
  insert into _r(msg) values ('PASS: outside account deletion, a business with records still cannot be deleted');
end $t$;
reset role;

-- The server then deletes the login (Supabase Auth); personal records go with it.
delete from auth.users where id = 'eeeeeeee-0000-4000-8000-00000000000a';
do $t$ begin
  if exists (select 1 from public.subscriptions where user_id = 'eeeeeeee-0000-4000-8000-00000000000a')
     or exists (select 1 from public.pf_categories where user_id = 'eeeeeeee-0000-4000-8000-00000000000a')
     or exists (select 1 from public.pf_assistant_usage where user_id = 'eeeeeeee-0000-4000-8000-00000000000a')
     or exists (select 1 from public.profiles where id = 'eeeeeeee-0000-4000-8000-00000000000a') then
    raise exception 'FAIL: personal records survived the login';
  end if;
  if not exists (select 1 from public.pf_categories where user_id = 'eeeeeeee-0000-4000-8000-00000000000b') then
    raise exception 'FAIL: B''s My Files touched';
  end if;
  insert into _r(msg) values ('PASS: deleting the login removes A''s subscription, profile and every My Files record, and nothing of B''s');
end $t$;
select msg from _r order by ord;
rollback;
