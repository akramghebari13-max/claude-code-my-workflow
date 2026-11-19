-- Defence in depth: the three permission checks behind every business rule could be called by
-- someone not signed in. They answered "no" (there is no user), but there is no reason to allow it.
revoke execute on function public.is_business_member(uuid), public.has_business_role(uuid, public.business_role),
  public.can_post(uuid) from public, anon;
grant execute on function public.is_business_member(uuid), public.has_business_role(uuid, public.business_role),
  public.can_post(uuid) to authenticated, service_role;
