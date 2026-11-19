alter table public.hmrc_oauth_states add column purpose text not null default 'vat', add column nino text;

create table public.hmrc_itsa_connections (
  business_id uuid primary key references public.businesses(id) on delete cascade,
  nino text not null,
  access_token text not null,
  refresh_token text not null,
  token_expires_at timestamptz not null,
  scope text,
  is_sandbox boolean not null default true,
  connected_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant all on public.hmrc_itsa_connections to service_role;
alter table public.hmrc_itsa_connections enable row level security;

create or replace function public.hmrc_itsa_status(_business_id uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select case when not public.is_business_member(_business_id) then null
  else (select jsonb_build_object(
    'nino_hint', '•••••' || right(nino, 4),
    'is_sandbox', is_sandbox,
    'connected_at', connected_at,
    'expired', token_expires_at <= now())
    from public.hmrc_itsa_connections where business_id = _business_id) end
$$;
revoke all on function public.hmrc_itsa_status(uuid) from public, anon;
grant execute on function public.hmrc_itsa_status(uuid) to authenticated;

create table public.itsa_submissions (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete restrict,
  tax_year text not null,
  kind text not null check (kind in ('figures','final')),
  hmrc_business_id text,
  figures jsonb,
  calculation_id text,
  receipt jsonb,
  is_sandbox boolean not null default true,
  submitted_by uuid,
  submitted_at timestamptz not null default now()
);
create index itsa_submissions_biz on public.itsa_submissions(business_id, submitted_at desc);
grant select on public.itsa_submissions to authenticated;
grant all on public.itsa_submissions to service_role;
alter table public.itsa_submissions enable row level security;
create policy "members read itsa submissions" on public.itsa_submissions
  for select to authenticated using (public.is_business_member(business_id));
create trigger itsa_submissions_audit after insert on public.itsa_submissions for each row execute function public.write_audit();

create or replace function public.record_itsa_submission(_business_id uuid, _tax_year text, _kind text, _hmrc_business_id text, _figures jsonb, _calculation_id text, _receipt jsonb, _is_sandbox boolean)
returns uuid language plpgsql security definer set search_path = public as $$
declare _id uuid;
begin
  if not public.can_post(_business_id) then raise exception 'Not allowed'; end if;
  insert into public.itsa_submissions(business_id, tax_year, kind, hmrc_business_id, figures, calculation_id, receipt, is_sandbox, submitted_by)
  values (_business_id, _tax_year, _kind, _hmrc_business_id, _figures, _calculation_id, _receipt, _is_sandbox, auth.uid())
  returning id into _id;
  return _id;
end $$;
revoke all on function public.record_itsa_submission(uuid, text, text, text, jsonb, text, jsonb, boolean) from public, anon;
grant execute on function public.record_itsa_submission(uuid, text, text, text, jsonb, text, jsonb, boolean) to authenticated;