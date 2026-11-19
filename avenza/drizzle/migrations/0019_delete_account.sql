-- Deleting your account (App Store rule 5.1.1(v), UK GDPR right to erasure). Run by the server
-- only, after it has cancelled Stripe; the server then removes stored files and the login.
-- A business is deleted, books and all, when the person is its only owner. The user is warned in
-- the app that keeping records is their legal duty. Businesses with another owner are left
-- alone; only this person's membership goes.

-- Businesses that go with the account: this person owns them and nobody else does.
create or replace function public.account_deletion_businesses(_user_id uuid) returns setof uuid
language sql stable security definer set search_path = public as $$
  select m.business_id from public.business_members m
  where m.user_id = _user_id and m.role = 'owner'
    and not exists (select 1 from public.business_members o
                    where o.business_id = m.business_id and o.role = 'owner' and o.user_id <> _user_id)
$$;

-- The 6-year guard on deleting a business with records still applies everywhere else.
create or replace function public.guard_business_delete() returns trigger language plpgsql set search_path = public as $$
begin
  if current_setting('avenza.deleting_account', true) = 'on' then return old; end if;
  if exists (select 1 from public.journal_entries where business_id = old.id) then
    raise exception 'This business has accounting records, which HMRC requires you to keep for at least 6 years. It cannot be deleted.';
  end if;
  return old;
end $$;

-- Audit history: rows removed because their whole business is being deleted are not logged (the
-- log for that business goes with it; writing to it would fail). Everything else is as before.
create or replace function public.write_audit() returns trigger language plpgsql security definer set search_path = public as $$
declare bid uuid; rid text; j jsonb;
begin
  j := coalesce(to_jsonb(new), to_jsonb(old));
  if tg_table_name = 'businesses' then
    if tg_op = 'DELETE' then return old; end if;
    bid := (j->>'id')::uuid;
  else bid := (j->>'business_id')::uuid; end if;
  if tg_op = 'DELETE' and not exists (select 1 from public.businesses where id = bid) then return old; end if;
  rid := coalesce(j->>'id', j->>'user_id', '');
  insert into public.audit_log (business_id, actor_id, table_name, record_id, action, old_data, new_data)
  values (bid, auth.uid(), tg_table_name, rid, tg_op,
    case when tg_op <> 'INSERT' then to_jsonb(old) end,
    case when tg_op <> 'DELETE' then to_jsonb(new) end);
  return coalesce(new, old);
end $$;

-- Deletes the person's businesses (as above), memberships and personal records, and returns the
-- business ids so the server can remove their stored receipts. The login itself (and everything
-- tied to it: profile, subscription, My Files) is deleted by the server through Supabase Auth.
create or replace function public.delete_account_data(_user_id uuid) returns uuid[]
language plpgsql security definer set search_path = public as $$
declare ids uuid[];
begin
  if _user_id is null then raise exception 'No user'; end if;
  ids := array(select public.account_deletion_businesses(_user_id));
  perform set_config('avenza.deleting_account', 'on', true);
  delete from public.businesses where id = any(ids);
  perform set_config('avenza.deleting_account', 'off', true);
  delete from public.business_members where user_id = _user_id;
  return ids;
end $$;

-- The one My Files table not tied to the login: make it go with the login too. NOT VALID skips
-- checking old rows (some may belong to logins already gone) but still cascades from now on.
alter table public.pf_assistant_usage add constraint pf_assistant_usage_user_fk
  foreign key (user_id) references auth.users(id) on delete cascade not valid;

revoke all on function public.account_deletion_businesses(uuid), public.delete_account_data(uuid) from public, anon, authenticated;
grant execute on function public.account_deletion_businesses(uuid), public.delete_account_data(uuid) to service_role;
