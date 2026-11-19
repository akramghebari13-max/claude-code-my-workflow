-- Per-person limits on AI features, so one account (or a stolen login) can't run up the AI bill.
-- Enforced here, not in the browser: the server asks for a slot before every AI request, and the
-- slot is only granted to a signed-in subscriber under their allowance.
create table public.ai_usage (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  kind text not null check (kind in ('bank_category', 'document_read', 'myfiles_question', 'report_question')),
  created_at timestamptz not null default now()
);
create index ai_usage_user_time on public.ai_usage (user_id, created_at);
alter table public.ai_usage enable row level security;
alter table public.ai_usage force row level security;
revoke all on public.ai_usage from public, anon, authenticated;
grant all on public.ai_usage to service_role;

-- Allowance per rolling 24 hours, generous for real use; plus at most 20 AI requests a minute.
create or replace function public.ai_daily_limit(_kind text) returns int language sql immutable as $$
  select case _kind when 'bank_category' then 300 when 'document_read' then 60
                    when 'myfiles_question' then 100 when 'report_question' then 60 end
$$;

-- true = go ahead (and the use is counted); false = over the limit, or not allowed AI at all.
create or replace function public.take_ai_slot(_kind text) returns boolean
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); lim int := public.ai_daily_limit(_kind);
begin
  if uid is null or lim is null or not public.has_active_subscription() then return false; end if;
  perform pg_advisory_xact_lock(hashtext('ai_usage:' || uid::text));
  if (select count(*) from public.ai_usage where user_id = uid and created_at > now() - interval '1 minute') >= 20 then return false; end if;
  if (select count(*) from public.ai_usage where user_id = uid and kind = _kind and created_at > now() - interval '24 hours') >= lim then return false; end if;
  insert into public.ai_usage(user_id, kind) values (uid, _kind);
  delete from public.ai_usage where user_id = uid and created_at < now() - interval '2 days';
  return true;
end $$;
revoke all on function public.take_ai_slot(text), public.ai_daily_limit(text) from public, anon;
grant execute on function public.take_ai_slot(text) to authenticated;
