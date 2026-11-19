create type public.bank_line_status as enum ('unmatched','matched','excluded');

create table public.bank_statement_lines (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  bank_account_id uuid not null references public.accounts(id),
  line_date date not null,
  description text not null,
  amount_pence bigint not null check (amount_pence <> 0),
  fingerprint text not null,
  status public.bank_line_status not null default 'unmatched',
  transaction_id uuid references public.transactions(id),
  invoice_id uuid references public.invoices(id),
  reconciled_by uuid, reconciled_at timestamptz,
  created_at timestamptz not null default now(),
  unique (business_id, bank_account_id, fingerprint)
);
create index on public.bank_statement_lines (business_id, status, line_date);
grant select on public.bank_statement_lines to authenticated;
grant all on public.bank_statement_lines to service_role;
alter table public.bank_statement_lines enable row level security;
create policy "members read bank lines" on public.bank_statement_lines for select to authenticated using (public.is_business_member(business_id));
create trigger bank_lines_audit after insert or update on public.bank_statement_lines for each row execute function public.write_audit();

create or replace function public.import_bank_lines(_business_id uuid, _bank_account_id uuid, _lines jsonb) returns int
language plpgsql security definer set search_path = public as $$
declare l jsonb; n int := 0; fp text; seen jsonb := '{}'::jsonb; k int;
begin
  if not public.can_post(_business_id) then raise exception 'Not allowed'; end if;
  if not exists (select 1 from public.accounts where id=_bank_account_id and business_id=_business_id and account_type='asset') then raise exception 'Choose a bank account'; end if;
  if jsonb_array_length(_lines) > 5000 then raise exception 'Too many lines in one import'; end if;
  for l in select * from jsonb_array_elements(_lines) loop
    if (l->>'amount_pence')::bigint = 0 then continue; end if;
    fp := (l->>'date') || '|' || (l->>'amount_pence') || '|' || lower(trim(l->>'description'));
    -- identical lines on the same day within one file are kept apart by occurrence count
    k := coalesce((seen->>fp)::int, 0) + 1; seen := seen || jsonb_build_object(fp, k);
    insert into public.bank_statement_lines (business_id, bank_account_id, line_date, description, amount_pence, fingerprint)
    values (_business_id, _bank_account_id, (l->>'date')::date, left(trim(l->>'description'),500), (l->>'amount_pence')::bigint, fp || '#' || k)
    on conflict do nothing;
    if found then n := n + 1; end if;
  end loop;
  return n;
end $$;

create or replace function public.reconcile_bank_line(_line_id uuid, _action text, _target_id uuid, _category_account_id uuid, _vat_pence bigint)
returns void language plpgsql security definer set search_path = public as $$
declare v public.bank_statement_lines; t public.transactions; inv public.invoices; tid uuid;
begin
  select * into v from public.bank_statement_lines where id=_line_id for update;
  if v.id is null or not public.can_post(v.business_id) then raise exception 'Not allowed'; end if;
  if _action = 'unexclude' then
    if v.status <> 'excluded' then raise exception 'Line is not ignored'; end if;
    update public.bank_statement_lines set status='unmatched', reconciled_by=null, reconciled_at=null where id=v.id; return;
  end if;
  if v.status <> 'unmatched' then raise exception 'Line already dealt with'; end if;
  if _action = 'exclude' then
    update public.bank_statement_lines set status='excluded', reconciled_by=auth.uid(), reconciled_at=now() where id=v.id;
  elsif _action = 'transaction' then
    select * into t from public.transactions where id=_target_id and business_id=v.business_id;
    if t.id is null then raise exception 'Transaction not found'; end if;
    if t.bank_account_id <> v.bank_account_id then raise exception 'That was recorded against a different bank account'; end if;
    if (case when t.direction='in' then t.gross_pence else -t.gross_pence end) <> v.amount_pence then raise exception 'Amounts do not match'; end if;
    if exists (select 1 from public.bank_statement_lines where transaction_id=t.id) then raise exception 'Already matched to another line'; end if;
    update public.bank_statement_lines set status='matched', transaction_id=t.id, reconciled_by=auth.uid(), reconciled_at=now() where id=v.id;
  elsif _action = 'invoice' then
    select * into inv from public.invoices where id=_target_id and business_id=v.business_id;
    if inv.id is null then raise exception 'Invoice not found'; end if;
    if v.amount_pence <> inv.net_pence + inv.vat_pence then raise exception 'Amount does not match the invoice total'; end if;
    perform public.pay_invoice(inv.id, v.line_date, v.bank_account_id);
    update public.bank_statement_lines set status='matched', invoice_id=inv.id, reconciled_by=auth.uid(), reconciled_at=now() where id=v.id;
  elsif _action = 'new' then
    tid := public.record_transaction(v.business_id, case when v.amount_pence>0 then 'in' else 'out' end::public.txn_direction, v.line_date,
      left(v.description,200), 'From bank statement', _category_account_id, v.bank_account_id, abs(v.amount_pence), coalesce(_vat_pence,0), null);
    update public.bank_statement_lines set status='matched', transaction_id=tid, reconciled_by=auth.uid(), reconciled_at=now() where id=v.id;
  else raise exception 'Unknown action'; end if;
end $$;

revoke execute on function public.import_bank_lines(uuid,uuid,jsonb), public.reconcile_bank_line(uuid,text,uuid,uuid,bigint) from public, anon;
grant execute on function public.import_bank_lines(uuid,uuid,jsonb), public.reconcile_bank_line(uuid,text,uuid,uuid,bigint) to authenticated;