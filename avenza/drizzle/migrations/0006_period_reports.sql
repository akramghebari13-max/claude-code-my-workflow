create or replace function public.period_balances(_business_id uuid, _from date, _to date)
returns table (account_id uuid, code text, name text, account_type public.account_type, debit_pence bigint, credit_pence bigint)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_business_member(_business_id) then raise exception 'Not allowed'; end if;
  return query
    select a.id, a.code, a.name, a.account_type, coalesce(sum(l.debit_pence),0)::bigint, coalesce(sum(l.credit_pence),0)::bigint
    from public.accounts a
    join public.journal_lines l on l.account_id = a.id
    join public.journal_entries e on e.id = l.entry_id
    where a.business_id = _business_id and (_from is null or e.entry_date >= _from) and e.entry_date <= _to
    group by a.id, a.code, a.name, a.account_type
    order by a.code;
end $$;
revoke execute on function public.period_balances(uuid,date,date) from public, anon;
grant execute on function public.period_balances(uuid,date,date) to authenticated;