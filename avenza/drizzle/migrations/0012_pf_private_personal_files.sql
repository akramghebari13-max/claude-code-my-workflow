CREATE TABLE public.pf_categories (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
 name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 60),
 sort_order int NOT NULL DEFAULT 0,
 is_default boolean NOT NULL DEFAULT false,
 archived boolean NOT NULL DEFAULT false,
 created_at timestamptz NOT NULL DEFAULT now()
);
REVOKE ALL ON public.pf_categories FROM anon, PUBLIC, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pf_categories TO authenticated;
ALTER TABLE public.pf_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pf_categories FORCE ROW LEVEL SECURITY;
CREATE UNIQUE INDEX pf_categories_user_name_idx ON public.pf_categories(user_id, lower(name));

CREATE TABLE public.pf_documents (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
 storage_path text NOT NULL UNIQUE,
 file_name text NOT NULL CHECK (char_length(file_name) <= 200),
 mime_type text NOT NULL CHECK (mime_type IN ('image/jpeg','image/png','application/pdf')),
 size_bytes int NOT NULL CHECK (size_bytes > 0 AND size_bytes <= 10485760),
 doc_type text NOT NULL DEFAULT 'other' CHECK (doc_type IN ('receipt','utility_bill','rent_receipt','payslip','bank_statement','invoice','other')),
 status text NOT NULL DEFAULT 'uploaded' CHECK (status IN ('uploaded','processing','needs_review','confirmed','failed')),
 extracted jsonb, error_message text,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 confirmed_at timestamptz,
 CONSTRAINT pf_documents_storage_path_check CHECK (
 storage_path LIKE user_id::text || '/%' AND
 substring(storage_path FROM 38) ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}-[A-Za-z0-9_-][A-Za-z0-9._-]{0,119}$'
 )
);
REVOKE ALL ON public.pf_documents FROM anon, PUBLIC, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pf_documents TO authenticated;
ALTER TABLE public.pf_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pf_documents FORCE ROW LEVEL SECURITY;
CREATE INDEX pf_documents_user_created_idx ON public.pf_documents(user_id, created_at DESC);

CREATE TABLE public.pf_transactions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
 txn_date date NOT NULL,
 kind text NOT NULL CHECK (kind IN ('income','expense','saving')),
 amount_pence bigint NOT NULL CHECK (amount_pence > 0 AND amount_pence <= 100000000000),
 merchant text CHECK (merchant IS NULL OR char_length(merchant) <= 120),
 description text CHECK (description IS NULL OR char_length(description) <= 300),
 category_id uuid REFERENCES public.pf_categories(id) ON DELETE RESTRICT,
 income_type text CHECK (income_type IN ('salary','additional','other')),
 document_id uuid REFERENCES public.pf_documents(id) ON DELETE SET NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT pf_transactions_kind_fields_check CHECK (
 (kind = 'expense' AND category_id IS NOT NULL AND income_type IS NULL) OR
 (kind = 'income' AND category_id IS NULL AND income_type IS NOT NULL) OR
 (kind = 'saving' AND category_id IS NULL AND income_type IS NULL)
 )
);
REVOKE ALL ON public.pf_transactions FROM anon, PUBLIC, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pf_transactions TO authenticated;
ALTER TABLE public.pf_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pf_transactions FORCE ROW LEVEL SECURITY;
CREATE INDEX pf_transactions_user_date_idx ON public.pf_transactions(user_id, txn_date DESC);

CREATE POLICY pf_categories_select ON public.pf_categories FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY pf_categories_insert ON public.pf_categories FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY pf_categories_update ON public.pf_categories FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY pf_categories_delete ON public.pf_categories FOR DELETE TO authenticated USING (user_id = auth.uid());
CREATE POLICY pf_documents_select ON public.pf_documents FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY pf_documents_insert ON public.pf_documents FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY pf_documents_update ON public.pf_documents FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY pf_documents_delete ON public.pf_documents FOR DELETE TO authenticated USING (user_id = auth.uid());
CREATE POLICY pf_transactions_select ON public.pf_transactions FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY pf_transactions_insert ON public.pf_transactions FOR INSERT TO authenticated WITH CHECK (
 user_id = auth.uid() AND
 (category_id IS NULL OR EXISTS (SELECT 1 FROM public.pf_categories c WHERE c.id = category_id AND c.user_id = auth.uid())) AND
 (document_id IS NULL OR EXISTS (SELECT 1 FROM public.pf_documents d WHERE d.id = document_id AND d.user_id = auth.uid()))
);
CREATE POLICY pf_transactions_update ON public.pf_transactions FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (
 user_id = auth.uid() AND
 (category_id IS NULL OR EXISTS (SELECT 1 FROM public.pf_categories c WHERE c.id = category_id AND c.user_id = auth.uid())) AND
 (document_id IS NULL OR EXISTS (SELECT 1 FROM public.pf_documents d WHERE d.id = document_id AND d.user_id = auth.uid()))
);
CREATE POLICY pf_transactions_delete ON public.pf_transactions FOR DELETE TO authenticated USING (user_id = auth.uid());

CREATE FUNCTION public.pf_guard_user_id() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
BEGIN
 IF NEW.user_id IS DISTINCT FROM OLD.user_id THEN RAISE EXCEPTION 'Choose your own records; user ownership cannot be changed'; END IF;
 RETURN NEW;
END $$;
CREATE FUNCTION public.pf_touch_updated_at() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
BEGIN NEW.updated_at := now(); RETURN NEW; END $$;
CREATE TRIGGER pf_categories_guard_user_id BEFORE UPDATE ON public.pf_categories FOR EACH ROW EXECUTE FUNCTION public.pf_guard_user_id();
CREATE TRIGGER pf_documents_guard_user_id BEFORE UPDATE ON public.pf_documents FOR EACH ROW EXECUTE FUNCTION public.pf_guard_user_id();
CREATE TRIGGER pf_transactions_guard_user_id BEFORE UPDATE ON public.pf_transactions FOR EACH ROW EXECUTE FUNCTION public.pf_guard_user_id();
CREATE TRIGGER pf_documents_touch_updated_at BEFORE UPDATE ON public.pf_documents FOR EACH ROW EXECUTE FUNCTION public.pf_touch_updated_at();
CREATE TRIGGER pf_transactions_touch_updated_at BEFORE UPDATE ON public.pf_transactions FOR EACH ROW EXECUTE FUNCTION public.pf_touch_updated_at();

CREATE FUNCTION public.pf_limit_uploads() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
BEGIN
 IF auth.uid() IS NULL OR NEW.user_id IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION 'Choose your own documents while signed in'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('pf_upload:' || auth.uid()::text, 0));
 IF (SELECT count(*) FROM public.pf_documents WHERE user_id = auth.uid() AND created_at >= now() - interval '1 hour') >= 30 THEN
 RAISE EXCEPTION 'Too many uploads; please wait before uploading another document';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER pf_documents_limit_uploads BEFORE INSERT ON public.pf_documents FOR EACH ROW EXECUTE FUNCTION public.pf_limit_uploads();

CREATE FUNCTION public.pf_ensure_defaults() RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Choose to sign in before adding categories'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('pf_defaults:' || auth.uid()::text, 0));
 IF NOT EXISTS (SELECT 1 FROM public.pf_categories WHERE user_id = auth.uid()) THEN
 INSERT INTO public.pf_categories(user_id, name, sort_order, is_default)
 SELECT auth.uid(), v.name, v.ord::int, true FROM unnest(ARRAY['Rent and housing','Food and groceries','Transport','Shopping','Electricity and gas','Water bills','Internet and phone','Entertainment','Insurance','Other expenses']) WITH ORDINALITY AS v(name, ord);
 END IF;
END $$;

CREATE FUNCTION public.pf_confirm_document(_document_id uuid, _txn_date date, _kind text, _amount_pence bigint, _merchant text, _description text, _category_id uuid, _income_type text, _doc_type text) RETURNS uuid LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE doc public.pf_documents%ROWTYPE; txn_id uuid;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Choose to sign in before confirming a document'; END IF;
 SELECT * INTO doc FROM public.pf_documents WHERE id = _document_id AND user_id = auth.uid() FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Choose one of your own documents'; END IF;
 IF doc.status NOT IN ('needs_review','failed') THEN RAISE EXCEPTION 'This document is already confirmed or is not ready for review'; END IF;
 IF _txn_date IS NULL THEN RAISE EXCEPTION 'Choose a transaction date'; END IF;
 IF _amount_pence IS NULL OR _amount_pence <= 0 OR _amount_pence > 100000000000 THEN RAISE EXCEPTION 'Amount must be positive and no more than £1,000,000,000'; END IF;
 IF _kind IS NULL OR _kind NOT IN ('income','expense','saving') THEN RAISE EXCEPTION 'Choose income, expense or saving'; END IF;
 IF _doc_type IS NULL OR _doc_type NOT IN ('receipt','utility_bill','rent_receipt','payslip','bank_statement','invoice','other') THEN RAISE EXCEPTION 'Choose a document type'; END IF;
 IF (_kind = 'expense' AND (_category_id IS NULL OR _income_type IS NOT NULL)) OR
 (_kind = 'income' AND (_category_id IS NOT NULL OR _income_type IS NULL OR _income_type NOT IN ('salary','additional','other'))) OR
 (_kind = 'saving' AND (_category_id IS NOT NULL OR _income_type IS NOT NULL)) THEN RAISE EXCEPTION 'Choose the correct category or income type for this entry'; END IF;
 IF _category_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.pf_categories WHERE id = _category_id AND user_id = auth.uid()) THEN RAISE EXCEPTION 'Choose one of your own categories'; END IF;
 IF char_length(_merchant) > 120 OR char_length(_description) > 300 THEN RAISE EXCEPTION 'Choose a shorter merchant or description'; END IF;
 INSERT INTO public.pf_transactions(user_id, txn_date, kind, amount_pence, merchant, description, category_id, income_type, document_id)
 VALUES(auth.uid(), _txn_date, _kind, _amount_pence, _merchant, _description, _category_id, _income_type, _document_id) RETURNING id INTO txn_id;
 UPDATE public.pf_documents SET doc_type = _doc_type, status = 'confirmed', confirmed_at = now() WHERE id = _document_id AND user_id = auth.uid();
 RETURN txn_id;
END $$;

CREATE FUNCTION public.pf_month_summary(_month date) RETURNS TABLE(income_pence bigint, expense_pence bigint, saving_pence bigint, remaining_pence bigint) LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Choose to sign in to view your summary'; END IF;
 IF _month IS NULL THEN RAISE EXCEPTION 'Choose a month date'; END IF;
 RETURN QUERY WITH totals AS (
 SELECT coalesce(sum(t.amount_pence) FILTER (WHERE t.kind = 'income'),0)::bigint AS i,
 coalesce(sum(t.amount_pence) FILTER (WHERE t.kind = 'expense'),0)::bigint AS e,
 coalesce(sum(t.amount_pence) FILTER (WHERE t.kind = 'saving'),0)::bigint AS s
 FROM public.pf_transactions t WHERE t.user_id = auth.uid() AND t.txn_date >= date_trunc('month',_month::timestamp)::date AND t.txn_date < (date_trunc('month',_month::timestamp) + interval '1 month')::date
 ) SELECT i,e,s,i-e-s FROM totals;
END $$;
CREATE FUNCTION public.pf_month_categories(_month date) RETURNS TABLE(category_id uuid, name text, total_pence bigint) LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Choose to sign in to view your categories'; END IF;
 IF _month IS NULL THEN RAISE EXCEPTION 'Choose a month date'; END IF;
 RETURN QUERY SELECT c.id,c.name,sum(t.amount_pence)::bigint FROM public.pf_transactions t JOIN public.pf_categories c ON c.id = t.category_id AND c.user_id = auth.uid()
 WHERE t.user_id = auth.uid() AND t.kind = 'expense' AND t.txn_date >= date_trunc('month',_month::timestamp)::date AND t.txn_date < (date_trunc('month',_month::timestamp) + interval '1 month')::date
 GROUP BY c.id,c.name ORDER BY sum(t.amount_pence) DESC,c.name,c.id;
END $$;
CREATE FUNCTION public.pf_monthly_series(_months int DEFAULT 6) RETURNS TABLE(month date, income_pence bigint, expense_pence bigint, saving_pence bigint) LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE n int := greatest(1,least(24,coalesce(_months,6))); current_month date := date_trunc('month',now() AT TIME ZONE 'Europe/London')::date;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Choose to sign in to view your monthly figures'; END IF;
 RETURN QUERY SELECT m.start_date::date,
 coalesce(sum(t.amount_pence) FILTER (WHERE t.kind = 'income'),0)::bigint,
 coalesce(sum(t.amount_pence) FILTER (WHERE t.kind = 'expense'),0)::bigint,
 coalesce(sum(t.amount_pence) FILTER (WHERE t.kind = 'saving'),0)::bigint
 FROM generate_series(current_month::timestamp - (n-1)*interval '1 month',current_month::timestamp,interval '1 month') m(start_date)
 LEFT JOIN public.pf_transactions t ON t.user_id = auth.uid() AND t.txn_date >= m.start_date::date AND t.txn_date < (m.start_date + interval '1 month')::date
 GROUP BY m.start_date ORDER BY m.start_date;
END $$;

REVOKE ALL ON FUNCTION public.pf_guard_user_id(), public.pf_touch_updated_at(), public.pf_limit_uploads(), public.pf_ensure_defaults(), public.pf_confirm_document(uuid,date,text,bigint,text,text,uuid,text,text), public.pf_month_summary(date), public.pf_month_categories(date), public.pf_monthly_series(int) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.pf_guard_user_id(), public.pf_touch_updated_at(), public.pf_limit_uploads(), public.pf_ensure_defaults(), public.pf_confirm_document(uuid,date,text,bigint,text,text,uuid,text,text), public.pf_month_summary(date), public.pf_month_categories(date), public.pf_monthly_series(int) TO authenticated;

CREATE POLICY pf_storage_select ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'my-files' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY pf_storage_insert ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'my-files' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY pf_storage_update ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = 'my-files' AND (storage.foldername(name))[1] = auth.uid()::text) WITH CHECK (bucket_id = 'my-files' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY pf_storage_delete ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'my-files' AND (storage.foldername(name))[1] = auth.uid()::text);