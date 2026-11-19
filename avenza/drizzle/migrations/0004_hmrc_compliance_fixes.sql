create type public.uk_jurisdiction as enum ('england_wales','scotland','northern_ireland');
alter table public.businesses add column address text;
alter table public.businesses add column registered_in public.uk_jurisdiction;

create or replace function public.guard_business_delete() returns trigger language plpgsql set search_path = public as $$
begin
  if exists (select 1 from public.journal_entries where business_id = old.id) then
    raise exception 'This business has accounting records, which HMRC requires you to keep for at least 6 years. It cannot be deleted.';
  end if;
  return old;
end $$;
create trigger businesses_guard_delete before delete on public.businesses for each row execute function public.guard_business_delete();

-- flat rate: no input VAT on purchases
create or replace function public.flat_rate_no_input_vat() returns trigger language plpgsql set search_path = public as $$
begin
  if new.direction = 'out' and new.vat_pence > 0 and (select vat_scheme from public.businesses where id = new.business_id) = 'flat_rate' then
    raise exception 'On the flat rate scheme VAT on purchases cannot be reclaimed. Record the full amount with 0%% VAT.';
  end if;
  return new;
end $$;
create trigger txns_flat_rate_check before insert on public.transactions for each row execute function public.flat_rate_no_input_vat();

-- flat-rate adjustment: VAT control now holds only VAT collected
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
    diff := (p->>'collected_vat')::bigint - (p->>'reclaimable_vat')::bigint - (p->>'box5')::bigint;
    if diff > 0 then
      eid := public.post_journal(_business_id, _end, 'Flat rate VAT adjustment ' || _start || ' to ' || _end, null, jsonb_build_array(
        jsonb_build_object('account_id', public.acct(_business_id,'2200'), 'debit_pence', diff, 'credit_pence', 0),
        jsonb_build_object('account_id', public.acct(_business_id,'4900'), 'debit_pence', 0, 'credit_pence', diff)));
    elsif diff < 0 then
      eid := public.post_journal(_business_id, _end, 'Flat rate VAT adjustment ' || _start || ' to ' || _end, null, jsonb_build_array(
        jsonb_build_object('account_id', public.acct(_business_id,'2200'), 'debit_pence', 0, 'credit_pence', -diff),
        jsonb_build_object('account_id', public.acct(_business_id,'5000'), 'debit_pence', -diff, 'credit_pence', 0)));
    end if;
  end if;
  insert into public.vat_returns (business_id, period_start, period_end, scheme, box1, box2, box3, box4, box5, box6, box7, box8, box9, adjustment_entry_id)
  values (_business_id, _start, _end, s, (p->>'box1')::bigint, 0, (p->>'box3')::bigint, (p->>'box4')::bigint, (p->>'box5')::bigint,
    (p->>'box6')::bigint, (p->>'box7')::bigint, 0, 0, eid) returning id into rid;
  return rid;
end $$;

-- VAT invoices need seller and customer addresses
create or replace function public.issue_invoice(_invoice_id uuid) returns void language plpgsql security definer set search_path = public as $$
declare v public.invoices; b public.businesses; eid uuid; lines jsonb;
begin
  select * into v from public.invoices where id = _invoice_id for update;
  if v.id is null or not public.can_post(v.business_id) then raise exception 'Not allowed'; end if;
  if v.status <> 'draft' then raise exception 'Invoice already sent'; end if;
  select * into b from public.businesses where id = v.business_id;
  if coalesce(trim(b.address),'') = '' then raise exception 'Add your business address before sending invoices'; end if;
  if b.business_type = 'limited_company' and b.registered_in is null then raise exception 'Add where your company is registered before sending invoices'; end if;
  if b.vat_registered and coalesce(trim((select address from public.customers where id = v.customer_id)),'') = '' then
    raise exception 'VAT invoices must show the customer''s address — add it to the customer first'; end if;
  lines := jsonb_build_array(jsonb_build_object('account_id',public.acct(v.business_id,'1100'),'debit_pence',v.net_pence+v.vat_pence,'credit_pence',0),
                             jsonb_build_object('account_id',public.acct(v.business_id,'4000'),'debit_pence',0,'credit_pence',v.net_pence));
  if v.vat_pence > 0 then lines := lines || jsonb_build_object('account_id',public.acct(v.business_id,'2200'),'debit_pence',0,'credit_pence',v.vat_pence); end if;
  eid := public.post_journal(v.business_id, v.issue_date, 'Invoice ' || v.invoice_number, v.invoice_number, lines);
  update public.invoices set status='sent', issue_entry_id = eid where id = v.id;
end $$;