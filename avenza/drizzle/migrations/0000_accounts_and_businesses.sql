create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select, insert, update on public.profiles to authenticated;
grant all on public.profiles to service_role;
alter table public.profiles enable row level security;
create policy "own profile read" on public.profiles for select to authenticated using (id = auth.uid());
create policy "own profile update" on public.profiles for update to authenticated using (id = auth.uid());
create policy "own profile insert" on public.profiles for insert to authenticated with check (id = auth.uid());

create or replace function public.handle_new_user() returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, full_name) values (new.id, coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name'));
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

create type public.business_type as enum ('sole_trader','limited_company');
create type public.business_role as enum ('owner','accountant','staff');

create table public.businesses (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) > 0),
  business_type public.business_type not null,
  company_number text,
  utr text,
  vat_number text,
  vat_registered boolean not null default false,
  year_end_month smallint not null default 3 check (year_end_month between 1 and 12),
  year_end_day smallint not null default 31 check (year_end_day between 1 and 31),
  created_by uuid not null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table public.business_members (
  business_id uuid not null references public.businesses(id) on delete cascade,
  user_id uuid not null,
  role public.business_role not null default 'staff',
  created_at timestamptz not null default now(),
  primary key (business_id, user_id)
);
create table public.audit_log (
  id bigint generated always as identity primary key,
  business_id uuid not null references public.businesses(id) on delete cascade,
  actor_id uuid,
  table_name text not null,
  record_id text not null,
  action text not null,
  old_data jsonb,
  new_data jsonb,
  created_at timestamptz not null default now()
);
create index on public.business_members(user_id);
create index on public.audit_log(business_id, created_at desc);

grant select, insert, update, delete on public.businesses to authenticated;
grant select, insert, update, delete on public.business_members to authenticated;
grant select on public.audit_log to authenticated;
grant all on public.businesses, public.business_members, public.audit_log to service_role;

alter table public.businesses enable row level security;
alter table public.business_members enable row level security;
alter table public.audit_log enable row level security;

create or replace function public.is_business_member(_business_id uuid) returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.business_members where business_id = _business_id and user_id = auth.uid())
$$;
create or replace function public.has_business_role(_business_id uuid, _role public.business_role) returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.business_members where business_id = _business_id and user_id = auth.uid() and role = _role)
$$;

create policy "members read business" on public.businesses for select to authenticated using (public.is_business_member(id) or created_by = auth.uid());
create policy "create business" on public.businesses for insert to authenticated with check (created_by = auth.uid());
create policy "owners update business" on public.businesses for update to authenticated using (public.has_business_role(id,'owner'));
create policy "owners delete business" on public.businesses for delete to authenticated using (public.has_business_role(id,'owner'));

create policy "members read members" on public.business_members for select to authenticated using (public.is_business_member(business_id));
create policy "owners add members" on public.business_members for insert to authenticated with check (public.has_business_role(business_id,'owner'));
create policy "owners update members" on public.business_members for update to authenticated using (public.has_business_role(business_id,'owner'));
create policy "owners remove members" on public.business_members for delete to authenticated using (public.has_business_role(business_id,'owner'));

create policy "members read audit" on public.audit_log for select to authenticated using (public.is_business_member(business_id));

-- creator becomes owner automatically
create or replace function public.add_business_owner() returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.business_members (business_id, user_id, role) values (new.id, new.created_by, 'owner');
  return new;
end $$;
create trigger businesses_add_owner after insert on public.businesses for each row execute function public.add_business_owner();

-- generic audit trigger
create or replace function public.write_audit() returns trigger language plpgsql security definer set search_path = public as $$
declare bid uuid; rid text;
begin
  if tg_table_name = 'businesses' then bid := coalesce(new.id, old.id); rid := bid::text;
  else bid := coalesce(new.business_id, old.business_id); rid := coalesce(new.user_id, old.user_id)::text; end if;
  if tg_op = 'DELETE' and tg_table_name = 'businesses' then return old; end if;
  insert into public.audit_log (business_id, actor_id, table_name, record_id, action, old_data, new_data)
  values (bid, auth.uid(), tg_table_name, rid, tg_op,
    case when tg_op <> 'INSERT' then to_jsonb(old) end,
    case when tg_op <> 'DELETE' then to_jsonb(new) end);
  return coalesce(new, old);
end $$;
create trigger businesses_audit after insert or update or delete on public.businesses for each row execute function public.write_audit();
create trigger members_audit after insert or update or delete on public.business_members for each row execute function public.write_audit();

create or replace function public.touch_updated_at() returns trigger language plpgsql set search_path = public as $$
begin new.updated_at := now(); return new; end $$;
create trigger businesses_touch before update on public.businesses for each row execute function public.touch_updated_at();
create trigger profiles_touch before update on public.profiles for each row execute function public.touch_updated_at();