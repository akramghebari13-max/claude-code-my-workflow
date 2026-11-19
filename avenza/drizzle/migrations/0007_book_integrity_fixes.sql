create or replace function public.uk_today() returns date language sql stable as $$ select (now() at time zone 'Europe/London')::date $$;
alter table public.invoices alter column issue_date set default public.uk_today();

alter table public.transactions add column voided_at timestamptz, add column void_entry_id uuid references public.journal_entries(id), add column void_date date;

create table public.credit_notes (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  invoice_id uuid not null references public.invoices(id),
  credit_number text not null,
  credit_date date not null,
  reason text,
  net_pence bigint not null,
  vat_pence bigint not null,
  entry_id uuid not null references public.journal_entries(id),
  refund_entry_id uuid references public.journal_entries(id),
  refund_date date,
  created_by uuid not null default auth.uid(),
  created_at timestamptz not null default now(),
  unique (business_id, credit_number),
  unique (invoice_id)
);
grant select on public.credit_notes to authenticated;
grant all on public.credit_notes to service_role;
alter table public.credit_notes enable row level security;
create policy "members read credit notes" on public.credit_notes for select to authenticated using (public.is_business_member(business_id));
create trigger credit_notes_audit after insert or update on public.credit_notes for each row execute function public.write_audit();

-- which journals belong to another record
create or replace function public.journal_owner(_entry_id uuid) returns text language sql stable security definer set search_path = public as $$
  select case
    when exists (select 1 from public.transactions where journal_entry_id = _entry_id or void_entry_id = _entry_id) then 'money'
    when exists (select 1 from public.invoices where issue_entry_id = _entry_id or payment_entry_id = _entry_id) then 'invoice'
    when exists (select 1 from public.credit_notes where entry_id = _entry_id or refund_entry_id = _entry_id) then 'invoice'
    when exists (select 1 from public.vat_returns where adjustment_entry_id = _entry_id) then 'vat'
    else null end
$$;

-- period lock + required date
create or replace function public.post_journal(_business_id uuid, _entry_date date, _description text, _reference text, _lines jsonb, _reverses_id uuid default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare eid uuid; num bigint; dr bigint; cr bigint; n int; l jsonb; r public.vat_returns;
begin
  if not public.can_post(_business_id) then raise exception 'Not allowed to post journals for this business'; end if;
  if _entry_date is null then raise exception 'A date is required'; end if;
  select * into r from public.vat_returns where business_id = _business_id and _entry_date between period_start and period_end limit 1;
  if r.id is not null then
    raise exception 'This date is in a filed VAT return (% to %); use a date after % for corrections', to_char(r.period_start,'DD/MM/YYYY'), to_char(r.period_end,'DD/MM/YYYY'), to_char(r.period_end,'DD/MM/YYYY');
  end if;
  if coalesce(trim(_description),'') = '' then raise exception 'Description is required'; end if;
  if jsonb_typeof(_lines) <> 'array' then raise exception 'Lines must be a list'; end if;
  select count(*), coalesce(sum((x->>'debit_pence')::bigint),0), coalesce(sum((x->>'credit_pence')::bigint),0)
    into n, dr, cr from jsonb_array_elements(_lines) x;
  if n < 2 then raise exception 'A journal needs at least two lines'; end if;
  if exists (select 1 from jsonb_array_elements(_lines) x where coalesce((x->>'debit_pence')::bigint,0) < 0 or coalesce((x->>'credit_pence')::bigint,0) < 0) then raise exception 'Amounts cannot be negative'; end if;
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

-- internal reversal used by RPCs
create or replace function public._reverse_entry(_entry_id uuid, _entry_date date) returns uuid
language plpgsql security definer set search_path = public as $$
declare e public.journal_entries; ls jsonb;
begin
  select * into e from public.journal_entries where id = _entry_id;
  if e.id is null then raise exception 'Journal not found'; end if;
  if exists (select 1 from public.journal_entries where reverses_id = _entry_id) then raise exception 'Journal already reversed'; end if;
  select jsonb_agg(jsonb_build_object('account_id', account_id, 'debit_pence', credit_pence, 'credit_pence', debit_pence, 'memo', memo))
    into ls from public.journal_lines where entry_id = _entry_id;
  return public.post_journal(e.business_id, coalesce(_entry_date, public.uk_today()), 'Reversal of #' || e.entry_number || ': ' || e.description, e.reference, ls, _entry_id);
end $$;

-- user-facing reversal: manual journals only
create or replace function public.reverse_journal(_entry_id uuid, _entry_date date default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare o text; orig uuid;
begin
  o := public.journal_owner(_entry_id);
  select reverses_id into orig from public.journal_entries where id = _entry_id;
  if o is null and orig is not null then o := public.journal_owner(orig); end if;
  if o = 'money' then raise exception 'This entry came from Money in & out; void it there instead'; end if;
  if o = 'invoice' then raise exception 'This entry came from an invoice; use a credit note on the Invoices tab instead'; end if;
  if o = 'vat' then raise exception 'This entry belongs to a filed VAT return and cannot be reversed'; end if;
  return public._reverse_entry(_entry_id, coalesce(_entry_date, public.uk_today()));
end $$;

create or replace function public.void_transaction(_transaction_id uuid, _void_date date default null) returns void
language plpgsql security definer set search_path = public as $$
declare t public.transactions; eid uuid; d date := coalesce(_void_date, public.uk_today());
begin
  select * into t from public.transactions where id = _transaction_id for update;
  if t.id is null or not public.can_post(t.business_id) then raise exception 'Not allowed'; end if;
  if t.voided_at is not null then raise exception 'Already voided'; end if;
  if d < t.txn_date then raise exception 'Void date cannot be before the original date'; end if;
  eid := public._reverse_entry(t.journal_entry_id, d);
  update public.transactions set voided_at = now(), void_entry_id = eid, void_date = d where id = t.id;
  update public.bank_statement_lines set status = 'unmatched', transaction_id = null, reconciled_by = null, reconciled_at = null where transaction_id = t.id;
end $$;

create or replace function public.credit_invoice(_invoice_id uuid, _credit_date date, _reason text, _refund_bank_account_id uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare v public.invoices; num text; n int; eid uuid; rid uuid; cid uuid; tot bigint; lines jsonb; d date := coalesce(_credit_date, public.uk_today());
begin
  select * into v from public.invoices where id = _invoice_id for update;
  if v.id is null or not public.can_post(v.business_id) then raise exception 'Not allowed'; end if;
  if v.status not in ('sent','paid') then raise exception 'Only sent or paid invoices can be credited'; end if;
  if d < v.issue_date then raise exception 'Credit note date cannot be before the invoice date'; end if;
  if v.status = 'sent' and _refund_bank_account_id is not null then raise exception 'This invoice has not been paid, so there is nothing to refund'; end if;
  tot := v.net_pence + v.vat_pence;
  perform pg_advisory_xact_lock(hashtext('cn' || v.business_id::text));
  select count(*)+1 into n from public.credit_notes where business_id = v.business_id;
  num := 'CN-' || lpad(n::text, 4, '0');
  lines := jsonb_build_array(
    jsonb_build_object('account_id', public.acct(v.business_id,'4000'), 'debit_pence', v.net_pence, 'credit_pence', 0),
    jsonb_build_object('account_id', public.acct(v.business_id,'1100'), 'debit_pence', 0, 'credit_pence', tot));
  if v.vat_pence > 0 then lines := lines || jsonb_build_object('account_id', public.acct(v.business_id,'2200'), 'debit_pence', v.vat_pence, 'credit_pence', 0); end if;
  eid := public.post_journal(v.business_id, d, 'Credit note ' || num || ' for ' || v.invoice_number, num, lines);
  if _refund_bank_account_id is not null then
    if not exists (select 1 from public.accounts where id=_refund_bank_account_id and business_id=v.business_id and account_type='asset') then raise exception 'Choose a bank account for the refund'; end if;
    rid := public.post_journal(v.business_id, d, 'Refund for ' || num, num, jsonb_build_array(
      jsonb_build_object('account_id', public.acct(v.business_id,'1100'), 'debit_pence', tot, 'credit_pence', 0),
      jsonb_build_object('account_id', _refund_bank_account_id, 'debit_pence', 0, 'credit_pence', tot)));
  end if;
  insert into public.credit_notes (business_id, invoice_id, credit_number, credit_date, reason, net_pence, vat_pence, entry_id, refund_entry_id, refund_date)
  values (v.business_id, v.id, num, d, nullif(trim(coalesce(_reason,'')),''), v.net_pence, v.vat_pence, eid, rid, case when rid is null then null else d end) returning id into cid;
  update public.invoices set status = 'void' where id = v.id;
  return cid;
end $$;

-- drafts only; sent invoices need a credit note
create or replace function public.void_invoice(_invoice_id uuid) returns void language plpgsql security definer set search_path = public as $$
declare v public.invoices;
begin
  select * into v from public.invoices where id = _invoice_id for update;
  if v.id is null or not public.can_post(v.business_id) then raise exception 'Not allowed'; end if;
  if v.status = 'void' then return; end if;
  if v.status <> 'draft' then raise exception 'Sent or paid invoices are cancelled with a credit note'; end if;
  update public.invoices set status='void' where id = v.id;
end $$;

-- VAT preview: credit notes and voids count in the period they happen
create or replace function public.vat_return_preview(_business_id uuid, _start date, _end date)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare b public.businesses; out_vat bigint := 0; in_vat bigint := 0; sales_net bigint := 0; purch_net bigint := 0; gross_turnover bigint;
  b1 bigint; b4 bigint; b6 bigint; b7 bigint; x record;
begin
  if not public.is_business_member(_business_id) then raise exception 'Not allowed'; end if;
  select * into b from public.businesses where id = _business_id;
  -- money in/out: original on its date, void as negative on void date
  select coalesce(sum(s*vat_pence) filter (where direction='in'),0), coalesce(sum(s*vat_pence) filter (where direction='out'),0),
         coalesce(sum(s*(gross_pence-vat_pence)) filter (where direction='in'),0), coalesce(sum(s*(gross_pence-vat_pence)) filter (where direction='out'),0)
    into out_vat, in_vat, sales_net, purch_net
  from (
    select 1 s, direction, vat_pence, gross_pence from public.transactions where business_id=_business_id and txn_date between _start and _end
    union all
    select -1, direction, vat_pence, gross_pence from public.transactions where business_id=_business_id and void_date between _start and _end
  ) t;
  if b.vat_scheme = 'standard' then
    -- every issued invoice on its issue date
    select coalesce(sum(vat_pence),0) v, coalesce(sum(net_pence),0) n into x from public.invoices
      where business_id=_business_id and issue_entry_id is not null and issue_date between _start and _end;
    out_vat := out_vat + x.v; sales_net := sales_net + x.n;
    -- credit notes on their date
    select coalesce(sum(vat_pence),0) v, coalesce(sum(net_pence),0) n into x from public.credit_notes
      where business_id=_business_id and credit_date between _start and _end;
    out_vat := out_vat - x.v; sales_net := sales_net - x.n;
    -- legacy voids (reversed before credit notes existed) on their reversal date
    select coalesce(sum(i.vat_pence),0) v, coalesce(sum(i.net_pence),0) n into x from public.invoices i
      join public.journal_entries r on r.reverses_id = i.issue_entry_id
      where i.business_id=_business_id and i.status='void' and not exists (select 1 from public.credit_notes c where c.invoice_id=i.id)
        and r.entry_date between _start and _end;
    out_vat := out_vat - x.v; sales_net := sales_net - x.n;
  else
    -- cash/flat rate: payments received, refunds paid out
    select coalesce(sum(vat_pence),0) v, coalesce(sum(net_pence),0) n into x from public.invoices
      where business_id=_business_id and paid_date is not null and paid_date between _start and _end;
    out_vat := out_vat + x.v; sales_net := sales_net + x.n;
    select coalesce(sum(vat_pence),0) v, coalesce(sum(net_pence),0) n into x from public.credit_notes
      where business_id=_business_id and refund_date between _start and _end;
    out_vat := out_vat - x.v; sales_net := sales_net - x.n;
  end if;
  if b.vat_scheme = 'flat_rate' then
    gross_turnover := sales_net + out_vat;
    b1 := round(gross_turnover * b.flat_rate_bp / 10000.0); b4 := 0; b6 := gross_turnover; b7 := purch_net;
  else
    b1 := out_vat; b4 := in_vat; b6 := sales_net; b7 := purch_net;
  end if;
  return jsonb_build_object('scheme', b.vat_scheme, 'collected_vat', out_vat, 'reclaimable_vat', in_vat,
    'box1', b1, 'box2', 0, 'box3', b1, 'box4', b4, 'box5', b1 - b4,
    'box6', trunc(b6 / 100.0) * 100, 'box7', trunc(b7 / 100.0) * 100, 'box8', 0, 'box9', 0);
end $$;

-- bank matching must skip voided money
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
    if t.id is null or t.voided_at is not null then raise exception 'Transaction not found'; end if;
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

-- money totals for a period, ignoring voided
create or replace function public.money_totals(_business_id uuid, _from date, _to date) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare r jsonb;
begin
  if not public.is_business_member(_business_id) then raise exception 'Not allowed'; end if;
  select jsonb_build_object('in', coalesce(sum(gross_pence) filter (where direction='in'),0), 'out', coalesce(sum(gross_pence) filter (where direction='out'),0), 'count', count(*))
    into r from public.transactions where business_id=_business_id and voided_at is null and (_from is null or txn_date >= _from) and (_to is null or txn_date <= _to);
  return r;
end $$;

revoke execute on function public._reverse_entry(uuid,date), public.journal_owner(uuid) from public, anon, authenticated;
revoke execute on function public.reverse_journal(uuid,date), public.void_transaction(uuid,date), public.credit_invoice(uuid,date,text,uuid), public.money_totals(uuid,date,date), public.uk_today() from public, anon;
grant execute on function public.reverse_journal(uuid,date), public.void_transaction(uuid,date), public.credit_invoice(uuid,date,text,uuid), public.money_totals(uuid,date,date), public.uk_today() to authenticated;