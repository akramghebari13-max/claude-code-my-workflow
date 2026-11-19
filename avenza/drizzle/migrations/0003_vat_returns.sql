create type public.vat_scheme as enum ('standard','cash','flat_rate');
alter table public.businesses add column vat_scheme public.vat_scheme not null default 'standard';
alter table public.businesses add column flat_rate_bp int not null default 0 check (flat_rate_bp between 0 and 1650);

create table public.vat_returns (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  period_start date not null,
  period_end date not null,
  scheme public.vat_scheme not null,
  box1 bigint not null, box2 bigint not null, box3 bigint not null, box4 bigint not null, box5 bigint not null,
  box6 bigint not null, box7 bigint not null, box8 bigint not null, box9 bigint not null,
  adjustment_entry_id uuid references public.journal_entries(id),
  filed_by uuid not null default auth.uid(),
  filed_at timestamptz not null default now(),
  check (period_end >= period_start)
);
create index on public.vat_returns(business_id, period_end desc);
grant select on public.vat_returns to authenticated;
grant all on public.vat_returns to service_role;
alter table public.vat_returns enable row level security;
create policy "members read vat returns" on public.vat_returns for select to authenticated using (public.is_business_member(business_id));
create trigger vat_returns_audit after insert on public.vat_returns for each row execute function public.write_audit();

create or replace function public.vat_return_preview(_business_id uuid, _start date, _end date)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare b public.businesses; out_vat bigint; in_vat bigint; sales_net bigint; purch_net bigint; gross_turnover bigint;
  b1 bigint; b4 bigint; b6 bigint; b7 bigint;
begin
  if not public.is_business_member(_business_id) then raise exception 'Not allowed'; end if;
  select * into b from public.businesses where id = _business_id;
  -- money in/out (cash basis by nature)
  select coalesce(sum(vat_pence) filter (where direction='in'),0), coalesce(sum(vat_pence) filter (where direction='out'),0),
         coalesce(sum(gross_pence - vat_pence) filter (where direction='in'),0), coalesce(sum(gross_pence - vat_pence) filter (where direction='out'),0)
    into out_vat, in_vat, sales_net, purch_net
    from public.transactions where business_id = _business_id and txn_date between _start and _end;
  -- invoices: accrual uses issue date, cash/flat-rate use paid date
  if b.vat_scheme = 'standard' then
    select out_vat + coalesce(sum(vat_pence),0), sales_net + coalesce(sum(net_pence),0) into out_vat, sales_net
      from public.invoices where business_id = _business_id and status in ('sent','paid') and issue_date between _start and _end;
  else
    select out_vat + coalesce(sum(vat_pence),0), sales_net + coalesce(sum(net_pence),0) into out_vat, sales_net
      from public.invoices where business_id = _business_id and status = 'paid' and paid_date between _start and _end;
  end if;
  if b.vat_scheme = 'flat_rate' then
    gross_turnover := sales_net + out_vat;
    b1 := round(gross_turnover * b.flat_rate_bp / 10000.0); b4 := 0; b6 := gross_turnover; b7 := purch_net;
  else
    b1 := out_vat; b4 := in_vat; b6 := sales_net; b7 := purch_net;
  end if;
  return jsonb_build_object('scheme', b.vat_scheme, 'collected_vat', out_vat, 'reclaimable_vat', in_vat,
    'box1', b1, 'box2', 0, 'box3', b1, 'box4', b4, 'box5', b1 - b4,
    'box6', b6 / 100 * 100, 'box7', b7 / 100 * 100, 'box8', 0, 'box9', 0);
end $$;

create or replace function public.file_vat_return(_business_id uuid, _start date, _end date)
returns uuid language plpgsql security definer set search_path = public as $$
declare p jsonb; rid uuid; eid uuid; diff bigint; s public.vat_scheme;
begin
  if not public.can_post(_business_id) then raise exception 'Not allowed'; end if;
  if not (select vat_registered from public.businesses where id = _business_id) then raise exception 'Business is not VAT registered'; end if;
  if exists (select 1 from public.vat_returns where business_id = _business_id and period_start <= _end and period_end >= _start) then
    raise exception 'A return already covers part of this period'; end if;
  p := public.vat_return_preview(_business_id, _start, _end);
  s := (p->>'scheme')::public.vat_scheme;
  if s = 'flat_rate' then
    -- VAT control holds full VAT collected less any reclaimed; keep the flat-rate saving as income
    diff := (p->>'collected_vat')::bigint - (p->>'reclaimable_vat')::bigint - (p->>'box5')::bigint;
    if diff > 0 then
      eid := public.post_journal(_business_id, _end, 'Flat rate VAT adjustment ' || _start || ' to ' || _end, null, jsonb_build_array(
        jsonb_build_object('account_id', public.acct(_business_id,'2200'), 'debit_pence', diff, 'credit_pence', 0),
        jsonb_build_object('account_id', public.acct(_business_id,'4900'), 'debit_pence', 0, 'credit_pence', diff)));
    elsif diff < 0 then
      eid := public.post_journal(_business_id, _end, 'Flat rate VAT adjustment ' || _start || ' to ' || _end, null, jsonb_build_array(
        jsonb_build_object('account_id', public.acct(_business_id,'2200'), 'debit_pence', 0, 'credit_pence', -diff),
        jsonb_build_object('account_id', public.acct(_business_id,'7900'), 'debit_pence', -diff, 'credit_pence', 0)));
    end if;
  end if;
  insert into public.vat_returns (business_id, period_start, period_end, scheme, box1, box2, box3, box4, box5, box6, box7, box8, box9, adjustment_entry_id)
  values (_business_id, _start, _end, s, (p->>'box1')::bigint, 0, (p->>'box3')::bigint, (p->>'box4')::bigint, (p->>'box5')::bigint,
    (p->>'box6')::bigint, (p->>'box7')::bigint, 0, 0, eid) returning id into rid;
  return rid;
end $$;

revoke execute on function public.vat_return_preview(uuid,date,date), public.file_vat_return(uuid,date,date) from public, anon;
grant execute on function public.vat_return_preview(uuid,date,date), public.file_vat_return(uuid,date,date) to authenticated;