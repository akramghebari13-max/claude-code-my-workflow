-- My Files phase 2: hardening, bills, budgets, goals, notifications. Additive; pf_ objects only.

-- (b) Owner tables keep only row privileges; TRUNCATE/TRIGGER/REFERENCES/MAINTAIN bypass or sidestep RLS.
REVOKE ALL ON public.pf_categories, public.pf_documents, public.pf_transactions FROM authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pf_categories, public.pf_documents, public.pf_transactions TO authenticated;

-- (a) Bucket MIME limits cannot be set from a migration (storage.buckets writes are refused), so the
-- my-files storage policies themselves now only accept .jpg/.jpeg/.png/.pdf object names.
DROP POLICY pf_storage_insert ON storage.objects;
DROP POLICY pf_storage_update ON storage.objects;
CREATE POLICY pf_storage_insert ON storage.objects FOR INSERT TO authenticated WITH CHECK (
 bucket_id = 'my-files' AND (storage.foldername(name))[1] = auth.uid()::text
 AND lower(storage.extension(name)) IN ('jpg','jpeg','png','pdf'));
CREATE POLICY pf_storage_update ON storage.objects FOR UPDATE TO authenticated
 USING (bucket_id = 'my-files' AND (storage.foldername(name))[1] = auth.uid()::text)
 WITH CHECK (bucket_id = 'my-files' AND (storage.foldername(name))[1] = auth.uid()::text
 AND lower(storage.extension(name)) IN ('jpg','jpeg','png','pdf'));

-- Helpers
CREATE FUNCTION public.pf_owns_category(_id uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
 SELECT _id IS NULL OR EXISTS (SELECT 1 FROM public.pf_categories c WHERE c.id = _id AND c.user_id = auth.uid())
$$;

-- 1. Bills
CREATE TABLE public.pf_bills (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
 name text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 80 AND char_length(name) <= 80),
 amount_pence bigint NOT NULL CHECK (amount_pence > 0 AND amount_pence <= 100000000000),
 frequency text NOT NULL CHECK (frequency IN ('once','weekly','monthly','quarterly','yearly')),
 next_due_date date NOT NULL,
 anchor_day int CHECK (anchor_day BETWEEN 1 AND 31),
 category_id uuid NOT NULL REFERENCES public.pf_categories(id) ON DELETE RESTRICT,
 active boolean NOT NULL DEFAULT true,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT pf_bills_anchor_check CHECK ((frequency IN ('once','weekly')) = (anchor_day IS NULL))
);
REVOKE ALL ON public.pf_bills FROM anon, PUBLIC, service_role, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pf_bills TO authenticated;
ALTER TABLE public.pf_bills ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pf_bills FORCE ROW LEVEL SECURITY;
CREATE INDEX pf_bills_user_due_idx ON public.pf_bills(user_id, active, next_due_date);

-- 3. Goals (before budgets/transactions reference it)
CREATE TABLE public.pf_goals (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
 name text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 80 AND char_length(name) <= 80),
 target_pence bigint NOT NULL CHECK (target_pence > 0 AND target_pence <= 100000000000),
 starting_pence bigint NOT NULL DEFAULT 0 CHECK (starting_pence >= 0 AND starting_pence <= 100000000000),
 target_date date,
 archived boolean NOT NULL DEFAULT false,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);
REVOKE ALL ON public.pf_goals FROM anon, PUBLIC, service_role, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pf_goals TO authenticated;
ALTER TABLE public.pf_goals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pf_goals FORCE ROW LEVEL SECURITY;
CREATE INDEX pf_goals_user_idx ON public.pf_goals(user_id, archived);

-- 2. Budgets
CREATE TABLE public.pf_budgets (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
 category_id uuid REFERENCES public.pf_categories(id) ON DELETE CASCADE,
 monthly_limit_pence bigint NOT NULL CHECK (monthly_limit_pence > 0 AND monthly_limit_pence <= 100000000000),
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);
REVOKE ALL ON public.pf_budgets FROM anon, PUBLIC, service_role, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pf_budgets TO authenticated;
ALTER TABLE public.pf_budgets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pf_budgets FORCE ROW LEVEL SECURITY;
CREATE UNIQUE INDEX pf_budgets_user_category_idx ON public.pf_budgets(user_id, coalesce(category_id, '00000000-0000-0000-0000-000000000000'::uuid));

-- 4. Savings transactions may count towards a goal
ALTER TABLE public.pf_transactions ADD COLUMN goal_id uuid REFERENCES public.pf_goals(id) ON DELETE SET NULL;
ALTER TABLE public.pf_transactions ADD CONSTRAINT pf_transactions_goal_kind_check CHECK (goal_id IS NULL OR kind = 'saving');
CREATE INDEX pf_transactions_goal_idx ON public.pf_transactions(goal_id) WHERE goal_id IS NOT NULL;
DROP POLICY pf_transactions_insert ON public.pf_transactions;
DROP POLICY pf_transactions_update ON public.pf_transactions;
CREATE POLICY pf_transactions_insert ON public.pf_transactions FOR INSERT TO authenticated WITH CHECK (
 user_id = auth.uid() AND
 (category_id IS NULL OR EXISTS (SELECT 1 FROM public.pf_categories c WHERE c.id = category_id AND c.user_id = auth.uid())) AND
 (document_id IS NULL OR EXISTS (SELECT 1 FROM public.pf_documents d WHERE d.id = document_id AND d.user_id = auth.uid())) AND
 (goal_id IS NULL OR EXISTS (SELECT 1 FROM public.pf_goals g WHERE g.id = goal_id AND g.user_id = auth.uid()))
);
CREATE POLICY pf_transactions_update ON public.pf_transactions FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (
 user_id = auth.uid() AND
 (category_id IS NULL OR EXISTS (SELECT 1 FROM public.pf_categories c WHERE c.id = category_id AND c.user_id = auth.uid())) AND
 (document_id IS NULL OR EXISTS (SELECT 1 FROM public.pf_documents d WHERE d.id = document_id AND d.user_id = auth.uid())) AND
 (goal_id IS NULL OR EXISTS (SELECT 1 FROM public.pf_goals g WHERE g.id = goal_id AND g.user_id = auth.uid()))
);

-- 5. Notifications
CREATE TABLE public.pf_notifications (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
 kind text NOT NULL CHECK (kind IN ('bill_due_soon','bill_overdue','over_budget','spending_spike','goal_near','document_ready')),
 title text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 120),
 body text NOT NULL CHECK (char_length(body) BETWEEN 1 AND 300),
 related_id uuid,
 dedupe_key text NOT NULL CHECK (char_length(dedupe_key) BETWEEN 1 AND 200),
 read_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now()
);
REVOKE ALL ON public.pf_notifications FROM anon, PUBLIC, service_role, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pf_notifications TO authenticated;
ALTER TABLE public.pf_notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pf_notifications FORCE ROW LEVEL SECURITY;
CREATE UNIQUE INDEX pf_notifications_user_dedupe_idx ON public.pf_notifications(user_id, dedupe_key);
CREATE INDEX pf_notifications_user_created_idx ON public.pf_notifications(user_id, created_at DESC);

-- Policies (owner only; referenced categories/goals must be the caller's)
CREATE POLICY pf_bills_select ON public.pf_bills FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY pf_bills_insert ON public.pf_bills FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid() AND public.pf_owns_category(category_id));
CREATE POLICY pf_bills_update ON public.pf_bills FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid() AND public.pf_owns_category(category_id));
CREATE POLICY pf_bills_delete ON public.pf_bills FOR DELETE TO authenticated USING (user_id = auth.uid());
CREATE POLICY pf_budgets_select ON public.pf_budgets FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY pf_budgets_insert ON public.pf_budgets FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid() AND public.pf_owns_category(category_id));
CREATE POLICY pf_budgets_update ON public.pf_budgets FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid() AND public.pf_owns_category(category_id));
CREATE POLICY pf_budgets_delete ON public.pf_budgets FOR DELETE TO authenticated USING (user_id = auth.uid());
CREATE POLICY pf_goals_select ON public.pf_goals FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY pf_goals_insert ON public.pf_goals FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY pf_goals_update ON public.pf_goals FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY pf_goals_delete ON public.pf_goals FOR DELETE TO authenticated USING (user_id = auth.uid());
CREATE POLICY pf_notifications_select ON public.pf_notifications FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY pf_notifications_insert ON public.pf_notifications FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY pf_notifications_update ON public.pf_notifications FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY pf_notifications_delete ON public.pf_notifications FOR DELETE TO authenticated USING (user_id = auth.uid());

CREATE TRIGGER pf_bills_guard_user_id BEFORE UPDATE ON public.pf_bills FOR EACH ROW EXECUTE FUNCTION public.pf_guard_user_id();
CREATE TRIGGER pf_budgets_guard_user_id BEFORE UPDATE ON public.pf_budgets FOR EACH ROW EXECUTE FUNCTION public.pf_guard_user_id();
CREATE TRIGGER pf_goals_guard_user_id BEFORE UPDATE ON public.pf_goals FOR EACH ROW EXECUTE FUNCTION public.pf_guard_user_id();
CREATE TRIGGER pf_notifications_guard_user_id BEFORE UPDATE ON public.pf_notifications FOR EACH ROW EXECUTE FUNCTION public.pf_guard_user_id();
CREATE TRIGGER pf_bills_touch_updated_at BEFORE UPDATE ON public.pf_bills FOR EACH ROW EXECUTE FUNCTION public.pf_touch_updated_at();
CREATE TRIGGER pf_budgets_touch_updated_at BEFORE UPDATE ON public.pf_budgets FOR EACH ROW EXECUTE FUNCTION public.pf_touch_updated_at();
CREATE TRIGGER pf_goals_touch_updated_at BEFORE UPDATE ON public.pf_goals FOR EACH ROW EXECUTE FUNCTION public.pf_touch_updated_at();

-- Pure helpers (mirrored and tested in src/lib/myfiles-plan.ts)
CREATE FUNCTION public.pf_uk_today() RETURNS date LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
 SELECT (now() AT TIME ZONE 'Europe/London')::date
$$;
CREATE FUNCTION public.pf_advance_due(_d date, _frequency text, _anchor int) RETURNS date LANGUAGE plpgsql IMMUTABLE SECURITY INVOKER SET search_path = public AS $$
DECLARE k int; base date; last_day int;
BEGIN
 IF _frequency = 'once' THEN RETURN NULL; END IF;
 IF _frequency = 'weekly' THEN RETURN _d + 7; END IF;
 k := CASE _frequency WHEN 'monthly' THEN 1 WHEN 'quarterly' THEN 3 WHEN 'yearly' THEN 12 END;
 IF k IS NULL THEN RAISE EXCEPTION 'Choose how often this bill repeats'; END IF;
 base := (date_trunc('month', _d::timestamp) + make_interval(months => k))::date;
 last_day := extract(day FROM (base + interval '1 month' - interval '1 day'))::int;
 RETURN base + (least(coalesce(_anchor, extract(day FROM _d)::int), last_day) - 1);
END $$;
CREATE FUNCTION public.pf_money(_p bigint) RETURNS text LANGUAGE sql IMMUTABLE SECURITY INVOKER SET search_path = public AS $$
 SELECT '£' || to_char(_p / 100, 'FM999,999,999,990') || '.' || lpad((_p % 100)::text, 2, '0')
$$;
CREATE FUNCTION public.pf_day(_d date) RETURNS text LANGUAGE sql IMMUTABLE SECURITY INVOKER SET search_path = public AS $$
 SELECT to_char(_d, 'FMDD Mon YYYY')
$$;

CREATE FUNCTION public.pf_mark_bill_paid(_bill_id uuid, _paid_date date, _amount_pence bigint DEFAULT NULL, _due_date date DEFAULT NULL) RETURNS uuid
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE b public.pf_bills%ROWTYPE; txn_id uuid; amt bigint;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Choose to sign in before paying a bill'; END IF;
 IF _paid_date IS NULL THEN RAISE EXCEPTION 'Choose the date you paid'; END IF;
 -- Row lock: a concurrent second call waits, then re-reads the advanced due date.
 SELECT * INTO b FROM public.pf_bills WHERE id = _bill_id AND user_id = auth.uid() AND active FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Choose one of your own active bills'; END IF;
 IF _due_date IS NOT NULL AND _due_date <> b.next_due_date THEN
 RAISE EXCEPTION 'This bill has already been marked as paid for %', public.pf_day(_due_date);
 END IF;
 amt := coalesce(_amount_pence, b.amount_pence);
 IF amt <= 0 OR amt > 100000000000 THEN RAISE EXCEPTION 'Amount must be positive and no more than £1,000,000,000'; END IF;
 INSERT INTO public.pf_transactions(user_id, txn_date, kind, amount_pence, merchant, description, category_id)
 VALUES (auth.uid(), _paid_date, 'expense', amt, b.name, 'Bill due ' || public.pf_day(b.next_due_date), b.category_id)
 RETURNING id INTO txn_id;
 IF b.frequency = 'once' THEN
 UPDATE public.pf_bills SET active = false WHERE id = b.id;
 ELSE
 UPDATE public.pf_bills SET next_due_date = public.pf_advance_due(b.next_due_date, b.frequency, b.anchor_day) WHERE id = b.id;
 END IF;
 RETURN txn_id;
END $$;

CREATE FUNCTION public.pf_budget_status(_month date) RETURNS TABLE(budget_id uuid, category_id uuid, name text, limit_pence bigint, spent_pence bigint, percentage int)
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = public AS $$
DECLARE m0 date; m1 date;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Choose to sign in to view your budgets'; END IF;
 IF _month IS NULL THEN RAISE EXCEPTION 'Choose a month date'; END IF;
 m0 := date_trunc('month', _month::timestamp)::date; m1 := (m0 + interval '1 month')::date;
 RETURN QUERY
 SELECT b.id, b.category_id, c.name, b.monthly_limit_pence, s.spent,
 least(s.spent * 100 / b.monthly_limit_pence, 1000000)::int
 FROM public.pf_budgets b
 LEFT JOIN public.pf_categories c ON c.id = b.category_id AND c.user_id = auth.uid()
 CROSS JOIN LATERAL (
 SELECT coalesce(sum(t.amount_pence), 0)::bigint AS spent FROM public.pf_transactions t
 WHERE t.user_id = auth.uid() AND t.kind = 'expense' AND t.txn_date >= m0 AND t.txn_date < m1
 AND (b.category_id IS NULL OR t.category_id = b.category_id)) s
 WHERE b.user_id = auth.uid()
 ORDER BY b.category_id IS NOT NULL, c.name, b.id;
END $$;

CREATE FUNCTION public.pf_goal_progress() RETURNS TABLE(goal_id uuid, name text, target_pence bigint, saved_pence bigint, percentage int, target_date date, avg_monthly_saving_pence bigint)
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = public AS $$
DECLARE m0 date := date_trunc('month', public.pf_uk_today()::timestamp)::date; avg_s bigint;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Choose to sign in to view your goals'; END IF;
 SELECT coalesce(sum(t.amount_pence), 0) / 3 INTO avg_s FROM public.pf_transactions t
 WHERE t.user_id = auth.uid() AND t.kind = 'saving' AND t.txn_date >= (m0 - interval '3 months')::date AND t.txn_date < m0;
 RETURN QUERY
 SELECT g.id, g.name, g.target_pence, (g.starting_pence + coalesce(x.linked, 0))::bigint,
 least((g.starting_pence + coalesce(x.linked, 0)) * 100 / g.target_pence, 1000000)::int, g.target_date, avg_s
 FROM public.pf_goals g
 LEFT JOIN LATERAL (SELECT sum(t.amount_pence) AS linked FROM public.pf_transactions t
 WHERE t.user_id = auth.uid() AND t.goal_id = g.id AND t.kind = 'saving') x ON true
 WHERE g.user_id = auth.uid() AND NOT g.archived
 ORDER BY g.created_at, g.id;
END $$;

CREATE FUNCTION public.pf_refresh_notifications() RETURNS int LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE today date := public.pf_uk_today(); m0 date; ym text; n int := 0; k int; this_month bigint; prev_avg bigint;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Choose to sign in to see notifications'; END IF;
 m0 := date_trunc('month', today::timestamp)::date; ym := to_char(today, 'YYYY-MM');

 INSERT INTO public.pf_notifications(user_id, kind, title, body, related_id, dedupe_key)
 SELECT auth.uid(), 'bill_due_soon', left(b.name || ' is due ' || CASE WHEN b.next_due_date = today THEN 'today' ELSE 'on ' || public.pf_day(b.next_due_date) END, 120),
 left(public.pf_money(b.amount_pence) || ' for ' || b.name || ' is due on ' || public.pf_day(b.next_due_date) || '.', 300),
 b.id, 'bill_due_soon:' || b.id || ':' || b.next_due_date
 FROM public.pf_bills b WHERE b.user_id = auth.uid() AND b.active AND b.next_due_date BETWEEN today AND today + 3
 ON CONFLICT (user_id, dedupe_key) DO NOTHING;
 GET DIAGNOSTICS k = ROW_COUNT; n := n + k;

 INSERT INTO public.pf_notifications(user_id, kind, title, body, related_id, dedupe_key)
 SELECT auth.uid(), 'bill_overdue', left(b.name || ' is overdue', 120),
 left(public.pf_money(b.amount_pence) || ' for ' || b.name || ' was due on ' || public.pf_day(b.next_due_date) || ' and is not marked as paid.', 300),
 b.id, 'bill_overdue:' || b.id || ':' || b.next_due_date
 FROM public.pf_bills b WHERE b.user_id = auth.uid() AND b.active AND b.next_due_date < today
 ON CONFLICT (user_id, dedupe_key) DO NOTHING;
 GET DIAGNOSTICS k = ROW_COUNT; n := n + k;

 INSERT INTO public.pf_notifications(user_id, kind, title, body, related_id, dedupe_key)
 SELECT auth.uid(), 'over_budget',
 left(coalesce(s.name, 'Overall') || ' budget ' || CASE WHEN t.level = 100 THEN 'exceeded' ELSE s.percentage || '% used' END, 120),
 left('You have spent ' || public.pf_money(s.spent_pence) || ' of your ' || public.pf_money(s.limit_pence) || ' ' || coalesce(s.name, 'overall') || ' budget this month (' || s.percentage || '%).', 300),
 s.budget_id, 'over_budget:' || coalesce(s.category_id::text, 'overall') || ':' || ym || ':' || t.level
 FROM public.pf_budget_status(today) s
 CROSS JOIN (VALUES (80), (100)) t(level)
 WHERE (t.level = 80 AND s.percentage >= 80) OR (t.level = 100 AND s.spent_pence > s.limit_pence)
 ON CONFLICT (user_id, dedupe_key) DO NOTHING;
 GET DIAGNOSTICS k = ROW_COUNT; n := n + k;

 IF extract(day FROM today) >= 5 THEN
 SELECT coalesce(sum(amount_pence), 0) INTO this_month FROM public.pf_transactions
 WHERE user_id = auth.uid() AND kind = 'expense' AND txn_date >= m0 AND txn_date <= today;
 SELECT coalesce(sum(amount_pence), 0) / 3 INTO prev_avg FROM public.pf_transactions
 WHERE user_id = auth.uid() AND kind = 'expense' AND txn_date >= (m0 - interval '3 months')::date AND txn_date < m0;
 IF prev_avg > 0 AND this_month * 10 > prev_avg * 13 THEN
 INSERT INTO public.pf_notifications(user_id, kind, title, body, related_id, dedupe_key)
 VALUES (auth.uid(), 'spending_spike', 'Spending is higher than usual this month',
 left('You have spent ' || public.pf_money(this_month) || ' so far this month. Your average over the previous 3 months was ' || public.pf_money(prev_avg) || ' a month.', 300),
 NULL, 'spending_spike:' || ym)
 ON CONFLICT (user_id, dedupe_key) DO NOTHING;
 GET DIAGNOSTICS k = ROW_COUNT; n := n + k;
 END IF;
 END IF;

 INSERT INTO public.pf_notifications(user_id, kind, title, body, related_id, dedupe_key)
 SELECT auth.uid(), 'goal_near', left(g.name || ': ' || least(g.percentage, 999) || '% saved', 120),
 left('You have saved ' || public.pf_money(g.saved_pence) || ' of your ' || public.pf_money(g.target_pence) || ' goal for ' || g.name || '.', 300),
 g.goal_id, 'goal_near:' || g.goal_id
 FROM public.pf_goal_progress() g WHERE g.percentage >= 90
 ON CONFLICT (user_id, dedupe_key) DO NOTHING;
 GET DIAGNOSTICS k = ROW_COUNT; n := n + k;
 RETURN n;
END $$;

REVOKE ALL ON FUNCTION public.pf_owns_category(uuid), public.pf_uk_today(), public.pf_advance_due(date,text,int), public.pf_money(bigint), public.pf_day(date),
 public.pf_mark_bill_paid(uuid,date,bigint,date), public.pf_budget_status(date), public.pf_goal_progress(), public.pf_refresh_notifications() FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.pf_owns_category(uuid), public.pf_uk_today(), public.pf_advance_due(date,text,int), public.pf_money(bigint), public.pf_day(date),
 public.pf_mark_bill_paid(uuid,date,bigint,date), public.pf_budget_status(date), public.pf_goal_progress(), public.pf_refresh_notifications() TO authenticated;