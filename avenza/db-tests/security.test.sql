-- Whole-database security checks: they look at every table and function, so a table added later
-- without protection fails here. Everything rolls back.
\set ON_ERROR_STOP on
begin;
create temp table _r(ord serial, msg text) on commit drop;
grant all on _r to anon, authenticated; grant usage on sequence _r_ord_seq to anon, authenticated;

-- 1. Structure.
do $t$
declare bad text;
begin
  select string_agg(c.relname, ', ') into bad from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity;
  if bad is not null then raise exception 'FAIL: row-level security is off on %', bad; end if;
  insert into _r(msg) values ('PASS: row-level security is on for every table');

  select string_agg(c.relname, ', ') into bad from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'v'
    and not coalesce('security_invoker=true' = any(c.reloptions), false)
    and has_table_privilege('authenticated', c.oid, 'select');
  if bad is not null then raise exception 'FAIL: view runs with its owner''s rights: %', bad; end if;
  insert into _r(msg) values ('PASS: every view checks the permissions of the person reading it');

  select string_agg(distinct c.relname, ', ') into bad from pg_class c join pg_namespace n on n.oid = c.relnamespace
  cross join unnest(array['select','insert','update','delete']) p
  where n.nspname = 'public' and c.relkind in ('r','v','m') and has_table_privilege('anon', c.oid, p);
  if bad is not null then raise exception 'FAIL: visitors who are not signed in can use %', bad; end if;
  insert into _r(msg) values ('PASS: visitors who are not signed in cannot read or change any table');

  select string_agg(p.proname, ', ') into bad from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.prosecdef and p.prorettype <> 'trigger'::regtype
    and has_function_privilege('anon', p.oid, 'execute');
  if bad is not null then raise exception 'FAIL: visitors who are not signed in can call %', bad; end if;
  insert into _r(msg) values ('PASS: visitors who are not signed in cannot call any privileged function');

  select string_agg(p.proname, ', ') into bad from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.prosecdef
    and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) c where c like 'search_path=%');
  if bad is not null then raise exception 'FAIL: privileged functions without a fixed search_path: %', bad; end if;
  insert into _r(msg) values ('PASS: every privileged function pins its search_path (no lookalike-table tricks)');
end $t$;

-- 2. Two businesses, two people, both paying.
insert into auth.users(id, email) values
  ('99999999-0000-4000-8000-00000000000a', 'a@example.com'),
  ('99999999-0000-4000-8000-00000000000b', 'b@example.com');
insert into public.subscriptions(user_id, status) values
  ('99999999-0000-4000-8000-00000000000a', 'active'), ('99999999-0000-4000-8000-00000000000b', 'active');
set local role authenticated;
select set_config('request.jwt.claim.sub', '99999999-0000-4000-8000-00000000000a', true);
insert into public.businesses(id, name, business_type, address, vat_registered, registered_in) values
  ('88888888-0000-4000-8000-00000000000a', 'A Ltd', 'limited_company', 'x', true, 'england_wales');
do $t$
declare b uuid := '88888888-0000-4000-8000-00000000000a'; a jsonb; cust uuid; inv uuid;
begin
  select jsonb_object_agg(code, id) into a from public.accounts where business_id = b;
  insert into public.customers(business_id, name, address) values (b, 'Client', '2 Low St') returning id into cust;
  inv := public.save_invoice(b, null, cust, '2026-11-01', '2026-11-30', null,
    '[{"description":"Work","quantity":1,"unit_pence":10000,"vat_rate_bp":2000}]'::jsonb);
  perform public.issue_invoice(inv);
  perform public.record_transaction(b, 'out', '2026-11-02', 'Shop', '', (a->>'7500')::uuid, (a->>'1200')::uuid, 1200, 200, null);
  perform public.import_bank_lines(b, (a->>'1200')::uuid, '[{"date":"2026-11-02","description":"Shop","amount_pence":-1200}]');
end $t$;
insert into storage.objects(bucket_id, name) values ('receipts', '88888888-0000-4000-8000-00000000000a/r.pdf');

select set_config('request.jwt.claim.sub', '99999999-0000-4000-8000-00000000000b', true);
insert into public.businesses(id, name, business_type, address) values ('88888888-0000-4000-8000-00000000000b', 'B', 'sole_trader', 'x');

-- 3. B, signed in and paying, looks at every table with a business column.
do $t$
declare t text; n bigint; checked int := 0; a uuid := '88888888-0000-4000-8000-00000000000a';
begin
  for t in select c.table_name from information_schema.columns c join pg_class k on k.relname = c.table_name
           join pg_namespace s on s.oid = k.relnamespace and s.nspname = 'public'
           where c.table_schema = 'public' and c.column_name = 'business_id' and k.relkind in ('r','v')
           order by 1 loop
    if not has_table_privilege('authenticated', format('public.%I', t), 'select') then continue; end if;
    execute format('select count(*) from public.%I where business_id = $1', t) into n using a;
    if n <> 0 then raise exception 'FAIL: B can see % row(s) of A''s % ', n, t; end if;
    checked := checked + 1;
  end loop;
  if exists (select 1 from public.businesses where id = a) then raise exception 'FAIL: B sees A''s business'; end if;
  if exists (select 1 from storage.objects where name like a || '/%') then raise exception 'FAIL: B sees A''s receipts'; end if;
  insert into _r(msg) values (format('PASS: another paying user sees none of A''s rows in all %s tables, nor A''s receipts', checked));
end $t$;

-- 4. ...and tries to change them, or join them.
do $t$
declare a uuid := '88888888-0000-4000-8000-00000000000a'; sales uuid; bank uuid;
begin
  begin
    insert into public.business_members(business_id, user_id, role) values (a, '99999999-0000-4000-8000-00000000000b', 'owner');
    raise exception 'FAIL: B made themselves owner of A''s business';
  exception when insufficient_privilege then null; end;
  begin
    insert into public.customers(business_id, name) values (a, 'Planted');
    raise exception 'FAIL: B added a customer to A''s business';
  exception when insufficient_privilege then null; end;
  begin
    insert into storage.objects(bucket_id, name) values ('receipts', a || '/planted.pdf');
    raise exception 'FAIL: B uploaded into A''s receipts';
  exception when insufficient_privilege then null; end;
  -- Either refused outright or allowed to run but matching nothing; both leave A's rows alone (checked below).
  begin update public.businesses set name = 'Hacked' where id = a; exception when insufficient_privilege then null; end;
  begin update public.accounts set name = 'Hacked' where business_id = a; exception when insufficient_privilege then null; end;
  begin delete from public.customers where business_id = a; exception when insufficient_privilege then null; end;
  begin delete from public.journal_entries where business_id = a; exception when insufficient_privilege then null; end;
  begin update public.subscriptions set status = 'active' where user_id = '99999999-0000-4000-8000-00000000000a'; exception when insufficient_privilege then null; end;
  insert into _r(msg) values ('PASS: B cannot join A''s business, add to it, upload into it, or (silently) change or delete its rows');
end $t$;

-- 5. Every business function, called by B with A's business id.
do $t$
declare a uuid := '88888888-0000-4000-8000-00000000000a'; f text; ok int := 0;
begin
  foreach f in array array[
    'select public.period_balances($1, null, ''2026-12-31'')',
    'select public.money_totals($1, null, null)',
    'select public.record_transaction($1, ''in'', ''2026-11-03'', ''x'', '''', null, null, 100, 0, null)',
    'select public.import_bank_lines($1, null, ''[]''::jsonb)',
    'select public.post_journal($1, ''2026-11-03'', ''x'', null, ''[]''::jsonb)',
    'select public.save_invoice($1, null, null, ''2026-11-01'', ''2026-11-30'', null, ''[]''::jsonb)',
    'select public.record_itsa_submission($1, ''2026-27'', ''figures'', null, null, null, null, true)'
  ] loop
    begin
      execute f using a;
      raise exception 'FAIL: % worked on someone else''s business', f;
    exception when raise_exception or insufficient_privilege then
      if sqlerrm like 'FAIL%' then raise; end if;
      if sqlerrm not similar to '%(Not allowed|not found|permission denied)%' then raise exception 'FAIL: % stopped for another reason: %', f, sqlerrm; end if;
      ok := ok + 1;
    end;
  end loop;
  -- HMRC connection status answers with nothing at all for outsiders.
  if public.hmrc_itsa_status(a) is not null or public.hmrc_connection_status(a) is not null then
    raise exception 'FAIL: HMRC status shown to an outsider';
  end if;
  insert into _r(msg) values (format('PASS: all %s business functions refuse someone else''s business; HMRC status shows them nothing', ok + 2));
end $t$;
reset role;
do $t$ begin
  if (select name from public.businesses where id = '88888888-0000-4000-8000-00000000000a') <> 'A Ltd'
     or (select count(*) from public.customers where business_id = '88888888-0000-4000-8000-00000000000a') <> 1
     or exists (select 1 from public.accounts where name = 'Hacked') then
    raise exception 'FAIL: A''s data was changed';
  end if;
  insert into _r(msg) values ('PASS: A''s data is exactly as A left it');
end $t$;

-- 6. Oversized text is refused by the database itself, whatever the page allows.
set local role authenticated;
select set_config('request.jwt.claim.sub', '99999999-0000-4000-8000-00000000000a', true);
do $t$
declare a uuid := '88888888-0000-4000-8000-00000000000a'; n int := 0; s text;
begin
  foreach s in array array[
    format('update public.businesses set name = %L where id = %L', repeat('x', 201), a),
    format('update public.businesses set vat_number = %L where id = %L', repeat('9', 21), a),
    format('insert into public.customers(business_id, name, email) values (%L, %L, %L)', a, 'C', repeat('e', 255)),
    format('update public.accounts set name = %L where business_id = %L and code = ''7500''', repeat('x', 101), a)
  ] loop
    begin execute s; raise exception 'FAIL: oversized text accepted: %', left(s, 60);
    exception when check_violation then n := n + 1; end;
  end loop;
  update public.businesses set name = 'A Trading Ltd' where id = a;
  insert into _r(msg) values (format('PASS: the database refuses oversized form input (%s cases) and still accepts normal edits', n));
end $t$;
reset role;

-- 7. Someone not signed in.
set local role anon;
select set_config('request.jwt.claim.sub', '', true);
do $t$ begin
  begin
    perform 1 from public.businesses;
    raise exception 'FAIL: anon read businesses';
  exception when insufficient_privilege then null; end;
  if exists (select 1 from storage.objects) then raise exception 'FAIL: anon sees files'; end if;
  insert into _r(msg) values ('PASS: someone not signed in gets nothing, not even files');
end $t$;
reset role;
select msg from _r order by ord;
rollback;
