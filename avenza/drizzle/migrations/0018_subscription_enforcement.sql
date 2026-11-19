-- Enforce the £6.99/month subscription in the database, not only in the app, so a signed-in
-- user without a trial or paid subscription cannot read or change records through the API.
-- One subscription per person: an accountant or staff member added to someone's business needs
-- their own. The server (service role) is not affected.

create or replace function public.has_active_subscription()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.subscriptions
    where user_id = auth.uid() and status in ('trialing', 'active')
  )
$$;
revoke all on function public.has_active_subscription() from public, anon;
grant execute on function public.has_active_subscription() to authenticated;

-- Business data: every row-level rule and every posting function goes through these three checks,
-- so adding the subscription here covers reading, posting, invoices, bank, VAT, reports and HMRC.
create or replace function public.is_business_member(_business_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.has_active_subscription() and exists (
    select 1 from public.business_members where business_id = _business_id and user_id = auth.uid())
$$;
create or replace function public.has_business_role(_business_id uuid, _role public.business_role) returns boolean
language sql stable security definer set search_path = public as $$
  select public.has_active_subscription() and exists (
    select 1 from public.business_members where business_id = _business_id and user_id = auth.uid() and role = _role)
$$;
create or replace function public.can_post(_business_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.has_active_subscription() and exists (
    select 1 from public.business_members where business_id = _business_id and user_id = auth.uid() and role in ('owner','accountant'))
$$;

-- Creating a business and the creator's own read rule don't go through the checks above.
create policy "subscription required" on public.businesses as restrictive for all to authenticated
  using (public.has_active_subscription()) with check (public.has_active_subscription());

-- My Files (personal finance): owner-only tables with forced row-level security.
do $$
declare t text;
begin
  foreach t in array array['pf_categories','pf_documents','pf_transactions','pf_bills','pf_budgets',
                           'pf_goals','pf_notifications','pf_assistant_usage'] loop
    execute format(
      'create policy "subscription required" on public.%I as restrictive for all to authenticated
         using (public.has_active_subscription()) with check (public.has_active_subscription())', t);
  end loop;
end $$;

-- Stored files: receipts (business) and my-files (personal). Other buckets are untouched.
create policy "subscription required for app files" on storage.objects as restrictive for all to authenticated
  using (bucket_id not in ('receipts','my-files') or public.has_active_subscription())
  with check (bucket_id not in ('receipts','my-files') or public.has_active_subscription());
