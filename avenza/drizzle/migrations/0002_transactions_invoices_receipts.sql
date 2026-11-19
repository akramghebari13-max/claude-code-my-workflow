create type public.txn_direction as enum ('in','out');
create type public.invoice_status as enum ('draft','sent','paid','void');

create table public.transactions (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  direction public.txn_direction not null,
  txn_date date not null,
  counterparty text not null,
  description text,
  category_account_id uuid not null references public.accounts(id),
  bank_account_id uuid not null references public.accounts(id),
  gross_pence bigint not null check (gross_pence > 0),
  vat_pence bigint not null default 0 check (vat_pence >= 0),
  receipt_path text,
  journal_entry_id uuid references public.journal_entries(id),
  created_by uuid not null default auth.uid(),
  created_at timestamptz not null default now(),
  check (vat_pence < gross_pence)
);
create table public.customers (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  name text not null check (length(trim(name))>0),
  email text,
  address text,
  created_at timestamptz not null default now()
);
create table public.invoices (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  customer_id uuid not null references public.customers(id),
  invoice_number text not null,
  issue_date date not null default current_date,
  due_date date not null,
  status public.invoice_status not null default 'draft',
  notes text,
  net_pence bigint not null default 0,
  vat_pence bigint not null default 0,
  issue_entry_id uuid references public.journal_entries(id),
  payment_entry_id uuid references public.journal_entries(id),
  paid_date date,
  created_at timestamptz not null default now(),
  unique (business_id, invoice_number)
);
create table public.invoice_lines (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.invoices(id) on delete cascade,
  business_id uuid not null references public.businesses(id) on delete cascade,
  description text not null,
  quantity numeric(12,2) not null default 1 check (quantity > 0),
  unit_pence bigint not null check (unit_pence >= 0),
  vat_rate_bp int not null default 0 check (vat_rate_bp in (0,500,2000)),
  position int not null default 0
);
create index on public.transactions(business_id, txn_date desc);
create index on public.invoices(business_id, issue_date desc);
create index on public.invoice_lines(invoice_id);
create index on public.customers(business_id);

grant select on public.transactions to authenticated;
grant select, insert, update on public.customers to authenticated;
grant select on public.invoices, public.invoice_lines to authenticated;
grant all on public.transactions, public.customers, public.invoices, public.invoice_lines to service_role;

alter table public.transactions enable row level security;
alter table public.customers enable row level security;
alter table public.invoices enable row level security;
alter table public.invoice_lines enable row level security;

create policy "members read txns" on public.transactions for select to authenticated using (public.is_business_member(business_id));
create policy "members read customers" on public.customers for select to authenticated using (public.is_business_member(business_id));
create policy "posters add customers" on public.customers for insert to authenticated with check (public.can_post(business_id));
create policy "posters edit customers" on public.customers for update to authenticated using (public.can_post(business_id)) with check (public.can_post(business_id));
create policy "members read invoices" on public.invoices for select to authenticated using (public.is_business_member(business_id));
create policy "members read invoice lines" on public.invoice_lines for select to authenticated using (public.is_business_member(business_id));

create or replace function public.acct(_b uuid, _code text) returns uuid language sql stable security definer set search_path = public as $$
  select id from public.accounts where business_id = _b and code = _code
$$;

-- record money in / out, posting a balanced journal
create or replace function public.record_transaction(_business_id uuid, _direction public.txn_direction, _date date, _counterparty text, _description text,
  _category_account_id uuid, _bank_account_id uuid, _gross_pence bigint, _vat_pence bigint, _receipt_path text)
returns uuid language plpgsql security definer set search_path = public as $$
declare tid uuid := gen_random_uuid(); eid uuid; net bigint; vat uuid; lines jsonb;
begin
  if not public.can_post(_business_id) then raise exception 'Not allowed'; end if;
  if _gross_pence is null or _gross_pence <= 0 then raise exception 'Amount must be more than zero'; end if;
  if coalesce(_vat_pence,0) < 0 or coalesce(_vat_pence,0) >= _gross_pence then raise exception 'VAT must be less than the total'; end if;
  if _receipt_path is not null and split_part(_receipt_path,'/',1) <> _business_id::text then raise exception 'Invalid receipt'; end if;
  if not exists (select 1 from public.accounts where id = _bank_account_id and business_id = _business_id and account_type = 'asset') then raise exception 'Choose a bank or cash account'; end if;
  net := _gross_pence - coalesce(_vat_pence,0);
  vat := public.acct(_business_id, '2200');
  if _direction = 'in' then
    lines := jsonb_build_array(jsonb_build_object('account_id',_bank_account_id,'debit_pence',_gross_pence,'credit_pence',0),
                               jsonb_build_object('account_id',_category_account_id,'debit_pence',0,'credit_pence',net));
    if _vat_pence > 0 then lines := lines || jsonb_build_object('account_id',vat,'debit_pence',0,'credit_pence',_vat_pence); end if;
  else
    lines := jsonb_build_array(jsonb_build_object('account_id',_bank_account_id,'debit_pence',0,'credit_pence',_gross_pence),
                               jsonb_build_object('account_id',_category_account_id,'debit_pence',net,'credit_pence',0));
    if _vat_pence > 0 then lines := lines || jsonb_build_object('account_id',vat,'debit_pence',_vat_pence,'credit_pence',0); end if;
  end if;
  eid := public.post_journal(_business_id, _date, case when _direction='in' then 'Money in: ' else 'Money out: ' end || trim(_counterparty), null, lines);
  insert into public.transactions (id, business_id, direction, txn_date, counterparty, description, category_account_id, bank_account_id, gross_pence, vat_pence, receipt_path, journal_entry_id)
  values (tid, _business_id, _direction, _date, trim(_counterparty), nullif(trim(coalesce(_description,'')),''), _category_account_id, _bank_account_id, _gross_pence, coalesce(_vat_pence,0), _receipt_path, eid);
  return tid;
end $$;

create or replace function public.attach_receipt(_transaction_id uuid, _receipt_path text) returns void language plpgsql security definer set search_path = public as $$
declare b uuid;
begin
  select business_id into b from public.transactions where id = _transaction_id;
  if b is null or not public.can_post(b) then raise exception 'Not allowed'; end if;
  if split_part(_receipt_path,'/',1) <> b::text then raise exception 'Invalid receipt'; end if;
  update public.transactions set receipt_path = _receipt_path where id = _transaction_id;
end $$;

-- save draft invoice (create or replace lines)
create or replace function public.save_invoice(_business_id uuid, _invoice_id uuid, _customer_id uuid, _issue_date date, _due_date date, _notes text, _lines jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare iid uuid := _invoice_id; num text; l jsonb; i int := 0; net bigint := 0; vat bigint := 0; ln bigint;
begin
  if not public.can_post(_business_id) then raise exception 'Not allowed'; end if;
  if not exists (select 1 from public.customers where id = _customer_id and business_id = _business_id) then raise exception 'Choose a customer'; end if;
  if _due_date < _issue_date then raise exception 'Due date must be on or after the issue date'; end if;
  if jsonb_typeof(_lines) <> 'array' or jsonb_array_length(_lines) = 0 then raise exception 'Add at least one line'; end if;
  if iid is null then
    perform pg_advisory_xact_lock(hashtext('inv'||_business_id::text));
    select 'INV-' || lpad((count(*)+1)::text, 4, '0') into num from public.invoices where business_id = _business_id;
    insert into public.invoices (business_id, customer_id, invoice_number, issue_date, due_date, notes)
      values (_business_id, _customer_id, num, _issue_date, _due_date, nullif(_notes,'')) returning id into iid;
  else
    if not exists (select 1 from public.invoices where id = iid and business_id = _business_id and status = 'draft') then raise exception 'Only draft invoices can be edited'; end if;
    update public.invoices set customer_id=_customer_id, issue_date=_issue_date, due_date=_due_date, notes=nullif(_notes,'') where id = iid;
    delete from public.invoice_lines where invoice_id = iid;
  end if;
  for l in select * from jsonb_array_elements(_lines) loop
    ln := round((l->>'quantity')::numeric * (l->>'unit_pence')::bigint);
    net := net + ln;
    vat := vat + round(ln * (l->>'vat_rate_bp')::int / 10000.0);
    insert into public.invoice_lines (invoice_id, business_id, description, quantity, unit_pence, vat_rate_bp, position)
      values (iid, _business_id, l->>'description', (l->>'quantity')::numeric, (l->>'unit_pence')::bigint, (l->>'vat_rate_bp')::int, i);
    i := i + 1;
  end loop;
  if net <= 0 then raise exception 'Invoice total must be more than zero'; end if;
  update public.invoices set net_pence = net, vat_pence = vat where id = iid;
  return iid;
end $$;

create or replace function public.issue_invoice(_invoice_id uuid) returns void language plpgsql security definer set search_path = public as $$
declare v public.invoices; eid uuid; lines jsonb;
begin
  select * into v from public.invoices where id = _invoice_id for update;
  if v.id is null or not public.can_post(v.business_id) then raise exception 'Not allowed'; end if;
  if v.status <> 'draft' then raise exception 'Invoice already sent'; end if;
  lines := jsonb_build_array(jsonb_build_object('account_id',public.acct(v.business_id,'1100'),'debit_pence',v.net_pence+v.vat_pence,'credit_pence',0),
                             jsonb_build_object('account_id',public.acct(v.business_id,'4000'),'debit_pence',0,'credit_pence',v.net_pence));
  if v.vat_pence > 0 then lines := lines || jsonb_build_object('account_id',public.acct(v.business_id,'2200'),'debit_pence',0,'credit_pence',v.vat_pence); end if;
  eid := public.post_journal(v.business_id, v.issue_date, 'Invoice ' || v.invoice_number, v.invoice_number, lines);
  update public.invoices set status='sent', issue_entry_id = eid where id = v.id;
end $$;

create or replace function public.pay_invoice(_invoice_id uuid, _paid_date date, _bank_account_id uuid) returns void language plpgsql security definer set search_path = public as $$
declare v public.invoices; eid uuid; tot bigint;
begin
  select * into v from public.invoices where id = _invoice_id for update;
  if v.id is null or not public.can_post(v.business_id) then raise exception 'Not allowed'; end if;
  if v.status <> 'sent' then raise exception 'Only sent invoices can be marked paid'; end if;
  tot := v.net_pence + v.vat_pence;
  eid := public.post_journal(v.business_id, _paid_date, 'Payment for ' || v.invoice_number, v.invoice_number, jsonb_build_array(
    jsonb_build_object('account_id',_bank_account_id,'debit_pence',tot,'credit_pence',0),
    jsonb_build_object('account_id',public.acct(v.business_id,'1100'),'debit_pence',0,'credit_pence',tot)));
  update public.invoices set status='paid', payment_entry_id = eid, paid_date = _paid_date where id = v.id;
end $$;

create or replace function public.void_invoice(_invoice_id uuid) returns void language plpgsql security definer set search_path = public as $$
declare v public.invoices;
begin
  select * into v from public.invoices where id = _invoice_id for update;
  if v.id is null or not public.can_post(v.business_id) then raise exception 'Not allowed'; end if;
  if v.status = 'paid' then raise exception 'Paid invoices cannot be voided; issue a credit instead'; end if;
  if v.status = 'void' then return; end if;
  if v.issue_entry_id is not null then perform public.reverse_journal(v.issue_entry_id); end if;
  update public.invoices set status='void' where id = v.id;
end $$;

revoke execute on function public.record_transaction(uuid,public.txn_direction,date,text,text,uuid,uuid,bigint,bigint,text), public.attach_receipt(uuid,text),
  public.save_invoice(uuid,uuid,uuid,date,date,text,jsonb), public.issue_invoice(uuid), public.pay_invoice(uuid,date,uuid), public.void_invoice(uuid), public.acct(uuid,text) from public, anon;
grant execute on function public.record_transaction(uuid,public.txn_direction,date,text,text,uuid,uuid,bigint,bigint,text), public.attach_receipt(uuid,text),
  public.save_invoice(uuid,uuid,uuid,date,date,text,jsonb), public.issue_invoice(uuid), public.pay_invoice(uuid,date,uuid), public.void_invoice(uuid) to authenticated;

create trigger txns_audit after insert or update on public.transactions for each row execute function public.write_audit();
create trigger customers_audit after insert or update on public.customers for each row execute function public.write_audit();
create trigger invoices_audit after insert or update on public.invoices for each row execute function public.write_audit();

-- receipts storage: path = <business_id>/<file>
create policy "members read receipts" on storage.objects for select to authenticated
  using (bucket_id = 'receipts' and public.is_business_member(((storage.foldername(name))[1])::uuid));
create policy "posters upload receipts" on storage.objects for insert to authenticated
  with check (bucket_id = 'receipts' and public.can_post(((storage.foldername(name))[1])::uuid));