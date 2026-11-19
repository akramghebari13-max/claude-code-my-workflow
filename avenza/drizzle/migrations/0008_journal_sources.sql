create or replace function public.journal_sources(_business_id uuid) returns table (entry_id uuid, source text)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_business_member(_business_id) then raise exception 'Not allowed'; end if;
  return query
    select e.id, coalesce(public.journal_owner(e.id), public.journal_owner(e.reverses_id))
    from public.journal_entries e where e.business_id = _business_id
      and coalesce(public.journal_owner(e.id), public.journal_owner(e.reverses_id)) is not null;
end $$;
revoke execute on function public.journal_sources(uuid) from public, anon;
grant execute on function public.journal_sources(uuid) to authenticated;