-- HMRC (Making Tax Digital) connection. Tokens are server-side only: no client role is granted access.
create table public.hmrc_connections (
  business_id uuid primary key references public.businesses(id) on delete cascade,
  mtd_vat_id text not null,
  access_token text not null,
  refresh_token text not null,
  token_expires_at timestamptz not null,
  scope text,
  is_sandbox boolean not null default true,
  customer_name text,
  connected_by uuid,
  connected_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant all on public.hmrc_connections to service_role;
alter table public.hmrc_connections enable row level security;

-- single-use record of an HMRC sign-in in progress
create table public.hmrc_oauth_states (
  state text primary key,
  business_id uuid not null references public.businesses(id) on delete cascade,
  redirect_uri text not null,
  is_sandbox boolean not null default true,
  created_at timestamptz not null default now()
);
grant all on public.hmrc_oauth_states to service_role;
alter table public.hmrc_oauth_states enable row level security;

-- what the app may show about the connection: never tokens
create or replace function public.hmrc_connection_status(_business_id uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select case
    when not public.is_business_member(_business_id) then null
    else (select jsonb_build_object(
      'mtd_vat_id', mtd_vat_id,
      'is_sandbox', is_sandbox,
      'customer_name', customer_name,
      'connected_at', connected_at,
      'expired', token_expires_at <= now())
      from public.hmrc_connections where business_id = _business_id)
  end
$$;
revoke all on function public.hmrc_connection_status(uuid) from public, anon;
grant execute on function public.hmrc_connection_status(uuid) to authenticated;

-- HMRC submission tracking on a filed return
alter table public.vat_returns
  add column hmrc_period_key text,
  add column hmrc_receipt jsonb,
  add column hmrc_submitted_at timestamptz,
  add column hmrc_submitted_by uuid;

create or replace function public.record_hmrc_submission(_business_id uuid, _return_id uuid, _period_key text, _receipt jsonb)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.can_post(_business_id) then raise exception 'Not allowed to send returns to HMRC'; end if;
  update public.vat_returns
     set hmrc_period_key = _period_key, hmrc_receipt = _receipt,
         hmrc_submitted_at = now(), hmrc_submitted_by = auth.uid()
   where id = _return_id and business_id = _business_id and hmrc_submitted_at is null;
  if not found then raise exception 'This return was not found, or has already been sent to HMRC'; end if;
end $$;
revoke all on function public.record_hmrc_submission(uuid, uuid, text, jsonb) from public, anon;
grant execute on function public.record_hmrc_submission(uuid, uuid, text, jsonb) to authenticated;

-- keep the read-only trail current when a return is stamped as sent
create trigger vat_returns_update_audit after update on public.vat_returns for each row execute function public.write_audit();