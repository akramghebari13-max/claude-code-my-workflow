-- AI allowance per person (migration 0022). Everything rolls back.
\set ON_ERROR_STOP on
begin;
create temp table _r(ord serial, msg text) on commit drop;
grant all on _r to anon, authenticated; grant usage on sequence _r_ord_seq to anon, authenticated;
insert into auth.users(id, email) values
  ('77777777-0000-4000-8000-00000000000a', 'paid@example.com'),
  ('77777777-0000-4000-8000-00000000000b', 'other@example.com'),
  ('77777777-0000-4000-8000-00000000000c', 'unpaid@example.com');
insert into public.subscriptions(user_id, status) values
  ('77777777-0000-4000-8000-00000000000a', 'active'), ('77777777-0000-4000-8000-00000000000b', 'trialing'),
  ('77777777-0000-4000-8000-00000000000c', 'canceled');

set local role authenticated;
select set_config('request.jwt.claim.sub', '77777777-0000-4000-8000-00000000000a', true);
do $t$
declare n int := 0;
begin
  if not public.take_ai_slot('bank_category') then raise exception 'FAIL: subscriber refused'; end if;
  begin perform public.take_ai_slot('anything_else'); exception when others then null; end;
  if public.take_ai_slot('not_a_feature') then raise exception 'FAIL: unknown feature allowed'; end if;
  insert into _r(msg) values ('PASS: a subscriber gets AI help; unknown features get none');
  -- burst: 20 a minute in total, the first one above included
  while public.take_ai_slot('report_question') loop n := n + 1; exit when n > 50; end loop;
  if n <> 19 then raise exception 'FAIL: % requests allowed in a minute', n + 1; end if;
  insert into _r(msg) values ('PASS: at most 20 AI requests a minute, across all features');
  begin
    perform 1 from public.ai_usage;
    raise exception 'FAIL: user can read the usage table';
  exception when insufficient_privilege then null; end;
  begin
    delete from public.ai_usage;
    raise exception 'FAIL: user can reset their own usage';
  exception when insufficient_privilege then null; end;
  insert into _r(msg) values ('PASS: nobody can read or reset the usage count themselves');
end $t$;

-- daily allowance: 60 document reads in the last 24 hours (older ones don't count)
reset role;
delete from public.ai_usage;
insert into public.ai_usage(user_id, kind, created_at)
  select '77777777-0000-4000-8000-00000000000a', 'document_read', now() - interval '25 hours' from generate_series(1, 100);
insert into public.ai_usage(user_id, kind, created_at)
  select '77777777-0000-4000-8000-00000000000a', 'document_read', now() - interval '2 hours' from generate_series(1, 59);
set local role authenticated;
do $t$ begin
  if not public.take_ai_slot('document_read') then raise exception 'FAIL: 60th read of the day refused (old reads counted?)'; end if;
  if public.take_ai_slot('document_read') then raise exception 'FAIL: 61st read of the day allowed'; end if;
  if not public.take_ai_slot('bank_category') then raise exception 'FAIL: other features blocked by one limit'; end if;
  insert into _r(msg) values ('PASS: 60 document reads a day; reads over 24 hours old don''t count; other features unaffected');
end $t$;

select set_config('request.jwt.claim.sub', '77777777-0000-4000-8000-00000000000b', true);
do $t$ begin
  if not public.take_ai_slot('document_read') then raise exception 'FAIL: one person''s usage limited another'; end if;
  insert into _r(msg) values ('PASS: each person has their own allowance');
end $t$;
select set_config('request.jwt.claim.sub', '77777777-0000-4000-8000-00000000000c', true);
do $t$ begin
  if public.take_ai_slot('bank_category') then raise exception 'FAIL: non-subscriber got AI'; end if;
  insert into _r(msg) values ('PASS: no AI without a trial or paid subscription');
end $t$;
reset role;
set local role anon;
do $t$ begin
  begin
    perform public.take_ai_slot('bank_category');
    raise exception 'FAIL: anon called take_ai_slot';
  exception when insufficient_privilege then null; end;
  insert into _r(msg) values ('PASS: someone not signed in cannot use AI at all');
end $t$;
reset role;
select msg from _r order by ord;
rollback;
