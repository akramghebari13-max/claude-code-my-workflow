DELETE FROM public.pf_assistant_usage WHERE access_denied_message IS NOT NULL;
ALTER TABLE public.pf_assistant_usage DROP CONSTRAINT IF EXISTS pf_assistant_usage_no_denial_marker;
ALTER TABLE public.pf_assistant_usage ADD CONSTRAINT pf_assistant_usage_no_denial_marker CHECK (access_denied_message IS NULL);
COMMENT ON COLUMN public.pf_assistant_usage.access_denied_message IS 'DEPRECATED: sticky AI denial marker removed; always NULL';

CREATE OR REPLACE FUNCTION public.pf_assistant_take_slot() RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sign in before asking about your records'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('pf_assistant:' || auth.uid()::text,0));
 DELETE FROM public.pf_assistant_usage WHERE user_id = auth.uid() AND created_at < now() - interval '24 hours';
 IF (SELECT count(*) FROM public.pf_assistant_usage WHERE user_id = auth.uid() AND created_at >= now() - interval '1 hour') >= 20 THEN
  RAISE EXCEPTION 'Too many questions; please wait before asking another'; END IF;
 INSERT INTO public.pf_assistant_usage(user_id) VALUES (auth.uid());
END $$;

REVOKE ALL ON FUNCTION public.pf_assistant_take_slot() FROM PUBLIC, anon, service_role, authenticated;
GRANT EXECUTE ON FUNCTION public.pf_assistant_take_slot() TO authenticated;