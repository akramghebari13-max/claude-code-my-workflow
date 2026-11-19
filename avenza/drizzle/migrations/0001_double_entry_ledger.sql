create or replace function public.write_audit() returns trigger language plpgsql security definer set search_path = public as $$
declare bid uuid; rid text; j jsonb;
begin
  j := coalesce(to_jsonb(new), to_jsonb(old));
  if tg_table_name = 'businesses' then
    if tg_op = 'DELETE' then return old; end if;
    bid := (j->>'id')::uuid;
  else bid := (j->>'business_id')::uuid; end if;
  rid := coalesce(j->>'id', j->>'user_id', '');
  insert into public.audit_log (business_id, actor_id, table_name, record_id, action, old_data, new_data)
  values (bid, auth.uid(), tg_table_name, rid, tg_op,
    case when tg_op <> 'INSERT' then to_jsonb(old) end,
    case when tg_op <> 'DELETE' then to_jsonb(new) end);
  return coalesce(new, old);
end $$;

create type public.account_type as enum ('asset','liability','equity','income','expense');

create table public.accounts (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  code text not null,
  name text not null check (length(trim(name)) > 0),
  account_type public.account_type not null,
  is_system boolean not null default false,
  archived boolean not null default false,
  created_at timestamptz not null default now(),
  unique (business_id, code)
);
create table public.journal_entries (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  entry_number bigint not null,
  entry_date date not null,
  description text not null,
  reference text,
  reverses_id uuid references public.journal_entries(id),
  created_by uuid not null default auth.uid(),
  created_at timestamptz not null default now(),
  unique (business_id, entry_number)
);
create table public.journal_lines (
  id uuid primary key default gen_random_uuid(),
  entry_id uuid not null references public.journal_entries(id) on delete cascade,
  business_id uuid not null references public.businesses(id) on delete cascade,
  account_id uuid not null references public.accounts(id),
  debit_pence bigint not null default 0 check (debit_pence >= 0),
  credit_pence bigint not null default 0 check (credit_pence >= 0),
  memo text,
  check ((debit_pence > 0) <> (credit_pence > 0))
);
create index on public.accounts(business_id);
create index on public.journal_entries(business_id, entry_date desc);
create index on public.journal_lines(entry_id);
create index on public.journal_lines(account_id);

grant select, insert, update on public.accounts to authenticated;
grant select on public.journal_entries, public.journal_lines to authenticated;
grant all on public.accounts, public.journal_entries, public.journal_lines to service_role;

alter table public.accounts enable row level security;
alter table public.journal_entries enable row level security;
alter table public.journal_lines enable row level security;

create or replace function public.can_post(_business_id uuid) returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.business_members where business_id = _business_id and user_id = auth.uid() and role in ('owner','accountant'))
$$;

create policy "members read accounts" on public.accounts for select to authenticated using (public.is_business_member(business_id));
create policy "posters add accounts" on public.accounts for insert to authenticated with check (public.can_post(business_id) and not is_system);
create policy "posters edit accounts" on public.accounts for update to authenticated using (public.can_post(business_id)) with check (public.can_post(business_id));
create policy "members read journals" on public.journal_entries for select to authenticated using (public.is_business_member(business_id));
create policy "members read lines" on public.journal_lines for select to authenticated using (public.is_business_member(business_id));

-- protect system account identity
create or replace function public.guard_account_update() returns trigger language plpgsql set search_path = public as $$
begin
  if new.business_id <> old.business_id or new.account_type <> old.account_type or new.is_system <> old.is_system then
    raise exception 'Account type and business cannot be changed';
  end if;
  if old.is_system and new.code <> old.code then raise exception 'System account codes cannot be changed'; end if;
  return new;
end $$;
create trigger accounts_guard before update on public.accounts for each row execute function public.guard_account_update();

-- post a balanced journal atomically
create or replace function public.post_journal(_business_id uuid, _entry_date date, _description text, _reference text, _lines jsonb, _reverses_id uuid default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare eid uuid; num bigint; dr bigint; cr bigint; n int; l jsonb;
begin
  if not public.can_post(_business_id) then raise exception 'Not allowed to post journals for this business'; end if;
  if coalesce(trim(_description),'') = '' then raise exception 'Description is required'; end if;
  if jsonb_typeof(_lines) <> 'array' then raise exception 'Lines must be a list'; end if;
  select count(*), coalesce(sum((x->>'debit_pence')::bigint),0), coalesce(sum((x->>'credit_pence')::bigint),0)
    into n, dr, cr from jsonb_array_elements(_lines) x;
  if n < 2 then raise exception 'A journal needs at least two lines'; end if;
  if dr <> cr then raise exception 'Journal does not balance: debits % vs credits %', dr, cr; end if;
  if dr = 0 then raise exception 'Journal total cannot be zero'; end if;
  if exists (select 1 from jsonb_array_elements(_lines) x
             where not exists (select 1 from public.accounts a where a.id = (x->>'account_id')::uuid and a.business_id = _business_id and not a.archived)) then
    raise exception 'Every line must use an active account from this business';
  end if;
  perform pg_advisory_xact_lock(hashtext(_business_id::text));
  select coalesce(max(entry_number),0)+1 into num from public.journal_entries where business_id = _business_id;
  insert into public.journal_entries (business_id, entry_number, entry_date, description, reference, reverses_id)
    values (_business_id, num, _entry_date, trim(_description), nullif(trim(coalesce(_reference,'')),''), _reverses_id) returning id into eid;
  for l in select * from jsonb_array_elements(_lines) loop
    insert into public.journal_lines (entry_id, business_id, account_id, debit_pence, credit_pence, memo)
    values (eid, _business_id, (l->>'account_id')::uuid, coalesce((l->>'debit_pence')::bigint,0), coalesce((l->>'credit_pence')::bigint,0), nullif(l->>'memo',''));
  end loop;
  return eid;
end $$;

create or replace function public.reverse_journal(_entry_id uuid, _entry_date date default current_date)
returns uuid language plpgsql security definer set search_path = public as $$
declare e public.journal_entries; ls jsonb;
begin
  select * into e from public.journal_entries where id = _entry_id;
  if e.id is null then raise exception 'Journal not found'; end if;
  if exists (select 1 from public.journal_entries where reverses_id = _entry_id) then raise exception 'Journal already reversed'; end if;
  select jsonb_agg(jsonb_build_object('account_id', account_id, 'debit_pence', credit_pence, 'credit_pence', debit_pence, 'memo', memo))
    into ls from public.journal_lines where entry_id = _entry_id;
  return public.post_journal(e.business_id, _entry_date, 'Reversal of #' || e.entry_number || ': ' || e.description, e.reference, ls, _entry_id);
end $$;
revoke execute on function public.post_journal(uuid,date,text,text,jsonb,uuid) from public, anon;
revoke execute on function public.reverse_journal(uuid,date) from public, anon;
grant execute on function public.post_journal(uuid,date,text,text,jsonb,uuid) to authenticated;
grant execute on function public.reverse_journal(uuid,date) to authenticated;

-- account balances (respects RLS via security_invoker)
create view public.account_balances with (security_invoker = true) as
select a.id as account_id, a.business_id, a.code, a.name, a.account_type, a.archived,
  coalesce(sum(l.debit_pence),0)::bigint as debit_pence,
  coalesce(sum(l.credit_pence),0)::bigint as credit_pence
from public.accounts a left join public.journal_lines l on l.account_id = a.id
group by a.id;
grant select on public.account_balances to authenticated;

-- default UK chart
create or replace function public.seed_chart_of_accounts() returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.accounts (business_id, code, name, account_type, is_system) values
    (new.id,'1200','Business bank account','asset',true),
    (new.id,'1210','Cash','asset',true),
    (new.id,'1100','Trade debtors','asset',true),
    (new.id,'0030','Equipment','asset',false),
    (new.id,'2100','Trade creditors','liability',true),
    (new.id,'2200','VAT control','liability',true),
    (new.id,'2210','PAYE and NI','liability',false),
    (new.id,'4000','Sales','income',true),
    (new.id,'4900','Other income','income',false),
    (new.id,'5000','Cost of sales','expense',false),
    (new.id,'7100','Rent and rates','expense',false),
    (new.id,'7200','Utilities','expense',false),
    (new.id,'7300','Travel and motor','expense',false),
    (new.id,'7400','Phone and internet','expense',false),
    (new.id,'7500','Office and software','expense',false),
    (new.id,'7600','Accountancy and legal','expense',false),
    (new.id,'7700','Advertising','expense',false),
    (new.id,'7900','Bank charges','expense',false);
  if new.business_type = 'sole_trader' then
    insert into public.accounts (business_id, code, name, account_type, is_system) values
      (new.id,'3000','Owner capital','equity',true),
      (new.id,'3050','Owner drawings','equity',true);
  else
    insert into public.accounts (business_id, code, name, account_type, is_system) values
      (new.id,'3000','Share capital','equity',true),
      (new.id,'3200','Retained earnings','equity',true),
      (new.id,'2300','Corporation tax','liability',true),
      (new.id,'2400','Directors'' loan account','liability',true),
      (new.id,'7000','Salaries','expense',false);
  end if;
  return new;
end $$;
create trigger businesses_seed_chart after insert on public.businesses for each row execute function public.seed_chart_of_accounts();

-- backfill charts for existing businesses
insert into public.accounts (business_id, code, name, account_type, is_system)
select b.id, v.code, v.name, v.t::public.account_type, true from public.businesses b
cross join (values ('1200','Business bank account','asset'),('4000','Sales','income'),('2200','VAT control','liability'),('3000','Owner capital','equity')) v(code,name,t)
on conflict do nothing;

create trigger accounts_audit after insert or update or delete on public.accounts for each row execute function public.write_audit();
create trigger journals_audit after insert on public.journal_entries for each row execute function public.write_audit();