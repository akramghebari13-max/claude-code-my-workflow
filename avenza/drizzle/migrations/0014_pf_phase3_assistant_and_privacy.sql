CREATE TABLE public.pf_assistant_usage (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 user_id uuid NOT NULL DEFAULT auth.uid(),
 created_at timestamptz NOT NULL DEFAULT now(),
 access_denied_message text CHECK (char_length(access_denied_message) <= 500)
);
REVOKE ALL ON public.pf_assistant_usage FROM anon, PUBLIC, service_role, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pf_assistant_usage TO authenticated;
ALTER TABLE public.pf_assistant_usage ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pf_assistant_usage FORCE ROW LEVEL SECURITY;
CREATE INDEX pf_assistant_usage_user_created_idx ON public.pf_assistant_usage(user_id,created_at);
CREATE POLICY pf_assistant_usage_select ON public.pf_assistant_usage FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY pf_assistant_usage_insert ON public.pf_assistant_usage FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY pf_assistant_usage_update ON public.pf_assistant_usage FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY pf_assistant_usage_delete ON public.pf_assistant_usage FOR DELETE TO authenticated USING (user_id = auth.uid());
CREATE TRIGGER pf_assistant_usage_guard_user_id BEFORE UPDATE ON public.pf_assistant_usage FOR EACH ROW EXECUTE FUNCTION public.pf_guard_user_id();

CREATE FUNCTION public.pf_assistant_take_slot() RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sign in before asking about your records'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('pf_assistant:' || auth.uid()::text,0));
 DELETE FROM public.pf_assistant_usage WHERE user_id = auth.uid() AND created_at < now() - interval '24 hours' AND access_denied_message IS NULL;
 IF (SELECT count(*) FROM public.pf_assistant_usage WHERE user_id = auth.uid() AND created_at >= now() - interval '1 hour' AND access_denied_message IS NULL) >= 20 THEN
 RAISE EXCEPTION 'Too many questions; please wait before asking another'; END IF;
 INSERT INTO public.pf_assistant_usage(user_id) VALUES (auth.uid());
END $$;

CREATE FUNCTION public.pf_assistant_facts(_month date) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = public AS $$
DECLARE m date; previous date; today date; current_summary jsonb; previous_summary jsonb; changes jsonb; categories jsonb; old_categories jsonb; series jsonb; averages jsonb; bills jsonb; budgets jsonb; goals jsonb; recent jsonb;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sign in to see your saved records'; END IF;
 IF _month IS NULL THEN RAISE EXCEPTION 'Choose a month'; END IF;
 m := date_trunc('month',_month::timestamp)::date; previous := (m - interval '1 month')::date; today := public.pf_uk_today();
 SELECT to_jsonb(s) INTO current_summary FROM public.pf_month_summary(m) s;
 SELECT to_jsonb(s) INTO previous_summary FROM public.pf_month_summary(previous) s;
 SELECT jsonb_object_agg(k, jsonb_build_object('difference_pence', (current_summary->>k)::bigint - (previous_summary->>k)::bigint, 'percentage', CASE WHEN (previous_summary->>k)::numeric = 0 THEN NULL ELSE round(((current_summary->>k)::numeric - (previous_summary->>k)::numeric) * 100 / abs((previous_summary->>k)::numeric),2) END)) INTO changes FROM unnest(ARRAY['income_pence','expense_pence','saving_pence','remaining_pence']) k;
 SELECT coalesce(jsonb_agg(jsonb_build_object('name',left(name,80),'total_pence',total_pence)), '[]'::jsonb) INTO categories FROM (SELECT * FROM public.pf_month_categories(m) LIMIT 100) c;
 SELECT coalesce(jsonb_agg(jsonb_build_object('name',left(name,80),'total_pence',total_pence)), '[]'::jsonb) INTO old_categories FROM (SELECT * FROM public.pf_month_categories(previous) LIMIT 100) c;
 -- Food is included separately even when absent or outside the category cap.
 SELECT coalesce(jsonb_agg(to_jsonb(s) || jsonb_build_object('remaining_pence',income_pence-expense_pence-saving_pence)), '[]'::jsonb) INTO series FROM public.pf_monthly_series(6) s;
 SELECT jsonb_build_object('income_pence',trunc(avg(income_pence))::bigint,'expense_pence',trunc(avg(expense_pence))::bigint,'saving_pence',trunc(avg(saving_pence))::bigint,'surplus_pence',trunc(avg(income_pence-expense_pence-saving_pence))::bigint) INTO averages
 FROM generate_series(1,3) n CROSS JOIN LATERAL public.pf_month_summary((date_trunc('month',today::timestamp) - n*interval '1 month')::date) s;
 SELECT coalesce(jsonb_agg(jsonb_build_object('name',left(name,80),'amount_pence',amount_pence,'due_date',next_due_date,'overdue',next_due_date < today)), '[]'::jsonb) INTO bills
 FROM (SELECT * FROM public.pf_bills WHERE user_id=auth.uid() AND active AND next_due_date <= today+30 ORDER BY next_due_date,id LIMIT 100) b;
 SELECT coalesce(jsonb_agg(jsonb_build_object('name',left(coalesce(name,'Overall spending'),80),'limit_pence',limit_pence,'spent_pence',spent_pence,'percentage',percentage)), '[]'::jsonb) INTO budgets FROM (SELECT * FROM public.pf_budget_status(m) LIMIT 100) b;
 SELECT coalesce(jsonb_agg(jsonb_build_object('name',left(name,80),'target_pence',target_pence,'saved_pence',saved_pence,'percentage',percentage,'target_date',target_date,'avg_monthly_saving_pence',avg_monthly_saving_pence)), '[]'::jsonb) INTO goals FROM (SELECT * FROM public.pf_goal_progress() LIMIT 100) g;
 SELECT coalesce(jsonb_agg(jsonb_build_object('date',txn_date,'kind',kind,'amount_pence',amount_pence,'merchant',left(merchant,80),'category',left(name,80))), '[]'::jsonb) INTO recent
 FROM (SELECT t.txn_date,t.kind,t.amount_pence,t.merchant,c.name FROM public.pf_transactions t LEFT JOIN public.pf_categories c ON c.id=t.category_id AND c.user_id=auth.uid() WHERE t.user_id=auth.uid() ORDER BY t.txn_date DESC,t.created_at DESC,t.id LIMIT 10) r;
 RETURN jsonb_build_object('_month',m,'last_month',previous,'current',current_summary,'previous',previous_summary,'changes',changes,'categories',categories,'previous_categories',old_categories,
 'food_and_groceries',jsonb_build_object('name','Food and groceries','this_month_pence',coalesce((SELECT sum(total_pence) FROM public.pf_month_categories(m) WHERE lower(name)='food and groceries'),0),'last_month_pence',coalesce((SELECT sum(total_pence) FROM public.pf_month_categories(previous) WHERE lower(name)='food and groceries'),0)),
 'last_six_months',series,'complete_month_averages',averages,'average_period_start',(date_trunc('month',today::timestamp)-interval '3 months')::date,'average_period_end',date_trunc('month',today::timestamp)::date-1,'bills',bills,'budgets',budgets,'goals',goals,'recent_transactions',recent,'generated_at',now(),
 'has_data',EXISTS(SELECT 1 FROM public.pf_transactions WHERE user_id=auth.uid()) OR EXISTS(SELECT 1 FROM public.pf_documents WHERE user_id=auth.uid()) OR EXISTS(SELECT 1 FROM public.pf_bills WHERE user_id=auth.uid()) OR EXISTS(SELECT 1 FROM public.pf_budgets WHERE user_id=auth.uid()) OR EXISTS(SELECT 1 FROM public.pf_goals WHERE user_id=auth.uid()),'list_cap',100);
END $$;

CREATE FUNCTION public.pf_delete_all_my_data() RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE u uuid := auth.uid(); n int; result jsonb := '{}'::jsonb;
BEGIN
 IF u IS NULL THEN RAISE EXCEPTION 'Sign in before deleting your personal finance data'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('pf_delete:' || u::text,0));
 DELETE FROM public.pf_notifications WHERE user_id=u; GET DIAGNOSTICS n = ROW_COUNT; result := result || jsonb_build_object('notifications',n);
 DELETE FROM public.pf_assistant_usage WHERE user_id=u; GET DIAGNOSTICS n = ROW_COUNT; result := result || jsonb_build_object('assistant_usage',n);
 DELETE FROM public.pf_transactions WHERE user_id=u; GET DIAGNOSTICS n = ROW_COUNT; result := result || jsonb_build_object('transactions',n);
 DELETE FROM public.pf_documents WHERE user_id=u; GET DIAGNOSTICS n = ROW_COUNT; result := result || jsonb_build_object('documents',n);
 DELETE FROM public.pf_bills WHERE user_id=u; GET DIAGNOSTICS n = ROW_COUNT; result := result || jsonb_build_object('bills',n);
 DELETE FROM public.pf_budgets WHERE user_id=u; GET DIAGNOSTICS n = ROW_COUNT; result := result || jsonb_build_object('budgets',n);
 DELETE FROM public.pf_goals WHERE user_id=u; GET DIAGNOSTICS n = ROW_COUNT; result := result || jsonb_build_object('goals',n);
 DELETE FROM public.pf_categories WHERE user_id=u; GET DIAGNOSTICS n = ROW_COUNT; result := result || jsonb_build_object('categories',n);
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.pf_assistant_take_slot(),public.pf_assistant_facts(date),public.pf_delete_all_my_data() FROM PUBLIC,anon,service_role,authenticated;
GRANT EXECUTE ON FUNCTION public.pf_assistant_take_slot(),public.pf_assistant_facts(date),public.pf_delete_all_my_data() TO authenticated;