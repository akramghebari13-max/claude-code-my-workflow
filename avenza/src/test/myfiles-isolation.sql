-- Run against this draft's local database as postgres. All fixtures roll back.
\set ON_ERROR_STOP on
BEGIN;
-- Storage API normally supplies this transaction-local setting. It permits
-- SQL delete rehearsal without changing a trigger or bypassing RLS.
SET LOCAL storage.allow_delete_query = 'true';
CREATE TEMP TABLE _results(ord serial, msg text) ON COMMIT DROP;
GRANT ALL ON _results TO authenticated, anon;
GRANT USAGE ON SEQUENCE _results_ord_seq TO authenticated, anon;
INSERT INTO auth.users(id,aud,role,email,created_at,updated_at) VALUES
 ('11111111-1111-4111-8111-111111111111','authenticated','authenticated','pf-isolation-a@example.com',now(),now()),
 ('22222222-2222-4222-8222-222222222222','authenticated','authenticated','pf-isolation-b@example.com',now(),now());
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',true);
INSERT INTO public.pf_categories(id,name) VALUES ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','Food');
INSERT INTO public.pf_documents(id,storage_path,file_name,mime_type,size_bytes,status)
 VALUES ('dddddddd-dddd-4ddd-8ddd-dddddddddddd','11111111-1111-4111-8111-111111111111/dddddddd-dddd-4ddd-8ddd-dddddddddddd-x.png','x.png','image/png',100,'needs_review');
INSERT INTO public.pf_transactions(id,txn_date,kind,amount_pence,category_id,document_id)
 VALUES ('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee','2026-11-01','expense',100,'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','dddddddd-dddd-4ddd-8ddd-dddddddddddd');
INSERT INTO storage.objects(bucket_id,name) VALUES ('my-files','11111111-1111-4111-8111-111111111111/x.png');
DO $test$ DECLARE n bigint; BEGIN
BEGIN UPDATE public.pf_categories SET user_id='22222222-2222-4222-8222-222222222222'; RAISE EXCEPTION 'FAIL ownership'; EXCEPTION WHEN raise_exception THEN IF SQLERRM NOT LIKE 'Choose your own records%' THEN RAISE; END IF; END;
INSERT INTO _results(msg) VALUES ('PASS: pf_categories: immutable user_id'); END $test$;
DO $test$ DECLARE n bigint; BEGIN
BEGIN UPDATE public.pf_documents SET user_id='22222222-2222-4222-8222-222222222222'; RAISE EXCEPTION 'FAIL ownership'; EXCEPTION WHEN raise_exception THEN IF SQLERRM NOT LIKE 'Choose your own records%' THEN RAISE; END IF; END;
INSERT INTO _results(msg) VALUES ('PASS: pf_documents: immutable user_id'); END $test$;
DO $test$ DECLARE n bigint; BEGIN
BEGIN UPDATE public.pf_transactions SET user_id='22222222-2222-4222-8222-222222222222'; RAISE EXCEPTION 'FAIL ownership'; EXCEPTION WHEN raise_exception THEN IF SQLERRM NOT LIKE 'Choose your own records%' THEN RAISE; END IF; END;
INSERT INTO _results(msg) VALUES ('PASS: pf_transactions: immutable user_id'); END $test$;
SELECT set_config('request.jwt.claim.sub','22222222-2222-4222-8222-222222222222',true);
DO $test$ DECLARE n bigint; BEGIN
IF EXISTS(SELECT 1 FROM public.pf_categories WHERE user_id='11111111-1111-4111-8111-111111111111') THEN RAISE EXCEPTION 'FAIL select'; END IF;
INSERT INTO _results(msg) VALUES ('PASS: pf_categories: B cannot select A'); END $test$;
DO $test$ DECLARE n bigint; BEGIN
UPDATE public.pf_categories SET user_id=user_id WHERE user_id='11111111-1111-4111-8111-111111111111'; GET DIAGNOSTICS n = ROW_COUNT; IF n<>0 THEN RAISE EXCEPTION 'FAIL update'; END IF;
INSERT INTO _results(msg) VALUES ('PASS: pf_categories: B cannot update A'); END $test$;
DO $test$ DECLARE n bigint; BEGIN
DELETE FROM public.pf_categories WHERE user_id='11111111-1111-4111-8111-111111111111'; GET DIAGNOSTICS n = ROW_COUNT; IF n<>0 THEN RAISE EXCEPTION 'FAIL delete'; END IF;
INSERT INTO _results(msg) VALUES ('PASS: pf_categories: B cannot delete A'); END $test$;
DO $test$ DECLARE n bigint; BEGIN
IF EXISTS(SELECT 1 FROM public.pf_documents WHERE user_id='11111111-1111-4111-8111-111111111111') THEN RAISE EXCEPTION 'FAIL select'; END IF;
INSERT INTO _results(msg) VALUES ('PASS: pf_documents: B cannot select A'); END $test$;
DO $test$ DECLARE n bigint; BEGIN
UPDATE public.pf_documents SET user_id=user_id WHERE user_id='11111111-1111-4111-8111-111111111111'; GET DIAGNOSTICS n = ROW_COUNT; IF n<>0 THEN RAISE EXCEPTION 'FAIL update'; END IF;
INSERT INTO _results(msg) VALUES ('PASS: pf_documents: B cannot update A'); END $test$;
DO $test$ DECLARE n bigint; BEGIN
DELETE FROM public.pf_documents WHERE user_id='11111111-1111-4111-8111-111111111111'; GET DIAGNOSTICS n = ROW_COUNT; IF n<>0 THEN RAISE EXCEPTION 'FAIL delete'; END IF;
INSERT INTO _results(msg) VALUES ('PASS: pf_documents: B cannot delete A'); END $test$;
DO $test$ DECLARE n bigint; BEGIN
IF EXISTS(SELECT 1 FROM public.pf_transactions WHERE user_id='11111111-1111-4111-8111-111111111111') THEN RAISE EXCEPTION 'FAIL select'; END IF;
INSERT INTO _results(msg) VALUES ('PASS: pf_transactions: B cannot select A'); END $test$;
DO $test$ DECLARE n bigint; BEGIN
UPDATE public.pf_transactions SET user_id=user_id WHERE user_id='11111111-1111-4111-8111-111111111111'; GET DIAGNOSTICS n = ROW_COUNT; IF n<>0 THEN RAISE EXCEPTION 'FAIL update'; END IF;
INSERT INTO _results(msg) VALUES ('PASS: pf_transactions: B cannot update A'); END $test$;
DO $test$ DECLARE n bigint; BEGIN
DELETE FROM public.pf_transactions WHERE user_id='11111111-1111-4111-8111-111111111111'; GET DIAGNOSTICS n = ROW_COUNT; IF n<>0 THEN RAISE EXCEPTION 'FAIL delete'; END IF;
INSERT INTO _results(msg) VALUES ('PASS: pf_transactions: B cannot delete A'); END $test$;
DO $test$ DECLARE n bigint; BEGIN
BEGIN
 INSERT INTO public.pf_categories(user_id,name) VALUES ('11111111-1111-4111-8111-111111111111','Forbidden');
 RAISE EXCEPTION 'FAIL: categories: B cannot insert for A unexpectedly allowed';
 EXCEPTION WHEN insufficient_privilege OR check_violation THEN NULL; END;
INSERT INTO _results(msg) VALUES ('PASS: categories: B cannot insert for A'); END $test$;
DO $test$ DECLARE n bigint; BEGIN
BEGIN INSERT INTO public.pf_documents(user_id,storage_path,file_name,mime_type,size_bytes) VALUES ('11111111-1111-4111-8111-111111111111','11111111-1111-4111-8111-111111111111/'||gen_random_uuid()||'-x.png','x.png','image/png',100); RAISE EXCEPTION 'FAIL insert'; EXCEPTION WHEN raise_exception THEN IF SQLERRM NOT LIKE 'Choose your own documents%' THEN RAISE; END IF; END;
INSERT INTO _results(msg) VALUES ('PASS: documents: B cannot insert for A'); END $test$;
DO $test$ DECLARE n bigint; BEGIN
BEGIN
 INSERT INTO public.pf_transactions(user_id,txn_date,kind,amount_pence) VALUES ('11111111-1111-4111-8111-111111111111','2026-11-01','saving',1);
 RAISE EXCEPTION 'FAIL: transactions: B cannot insert for A unexpectedly allowed';
 EXCEPTION WHEN insufficient_privilege OR check_violation THEN NULL; END;
INSERT INTO _results(msg) VALUES ('PASS: transactions: B cannot insert for A'); END $test$;
DO $test$ DECLARE n bigint; BEGIN
BEGIN
 INSERT INTO public.pf_transactions(txn_date,kind,amount_pence,category_id) VALUES ('2026-11-01','expense',1,'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
 RAISE EXCEPTION 'FAIL: transactions: B cannot reference A category unexpectedly allowed';
 EXCEPTION WHEN insufficient_privilege OR check_violation THEN NULL; END;
INSERT INTO _results(msg) VALUES ('PASS: transactions: B cannot reference A category'); END $test$;
DO $test$ DECLARE n bigint; BEGIN
BEGIN
 INSERT INTO public.pf_transactions(txn_date,kind,amount_pence,document_id) VALUES ('2026-11-01','saving',1,'dddddddd-dddd-4ddd-8ddd-dddddddddddd');
 RAISE EXCEPTION 'FAIL: transactions: B cannot reference A document unexpectedly allowed';
 EXCEPTION WHEN insufficient_privilege OR check_violation THEN NULL; END;
INSERT INTO _results(msg) VALUES ('PASS: transactions: B cannot reference A document'); END $test$;
INSERT INTO public.pf_transactions(txn_date,kind,amount_pence) VALUES ('2026-11-01','saving',1);
DO $test$ DECLARE n bigint; BEGIN
BEGIN
 UPDATE public.pf_transactions SET kind='expense',category_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' WHERE user_id='22222222-2222-4222-8222-222222222222';
 RAISE EXCEPTION 'FAIL: transactions: B cannot update reference to A category unexpectedly allowed';
 EXCEPTION WHEN insufficient_privilege OR check_violation THEN NULL; END;
INSERT INTO _results(msg) VALUES ('PASS: transactions: B cannot update reference to A category'); END $test$;
DO $test$ DECLARE n bigint; BEGIN
BEGIN
 UPDATE public.pf_transactions SET document_id='dddddddd-dddd-4ddd-8ddd-dddddddddddd' WHERE user_id='22222222-2222-4222-8222-222222222222';
 RAISE EXCEPTION 'FAIL: transactions: B cannot update reference to A document unexpectedly allowed';
 EXCEPTION WHEN insufficient_privilege OR check_violation THEN NULL; END;
INSERT INTO _results(msg) VALUES ('PASS: transactions: B cannot update reference to A document'); END $test$;
DO $test$ DECLARE n bigint; BEGIN
IF EXISTS(SELECT 1 FROM storage.objects WHERE bucket_id='my-files' AND name='11111111-1111-4111-8111-111111111111/x.png') THEN RAISE EXCEPTION 'FAIL storage select'; END IF;
INSERT INTO _results(msg) VALUES ('PASS: storage: B cannot read A folder'); END $test$;
DO $test$ DECLARE n bigint; BEGIN
UPDATE storage.objects SET name='11111111-1111-4111-8111-111111111111/changed.png' WHERE bucket_id='my-files' AND name='11111111-1111-4111-8111-111111111111/x.png'; GET DIAGNOSTICS n = ROW_COUNT; IF n<>0 THEN RAISE EXCEPTION 'FAIL storage update'; END IF;
INSERT INTO _results(msg) VALUES ('PASS: storage: B cannot update A folder'); END $test$;
DO $test$ DECLARE n bigint; BEGIN
DELETE FROM storage.objects WHERE bucket_id='my-files' AND name='11111111-1111-4111-8111-111111111111/x.png'; GET DIAGNOSTICS n = ROW_COUNT; IF n<>0 THEN RAISE EXCEPTION 'FAIL storage delete'; END IF;
INSERT INTO _results(msg) VALUES ('PASS: storage: B cannot delete A folder'); END $test$;
DO $test$ DECLARE n bigint; BEGIN
BEGIN
 INSERT INTO storage.objects(bucket_id,name) VALUES ('my-files','11111111-1111-4111-8111-111111111111/forbidden.png');
 RAISE EXCEPTION 'FAIL: storage: B cannot insert under A folder unexpectedly allowed';
 EXCEPTION WHEN insufficient_privilege OR check_violation THEN NULL; END;
INSERT INTO _results(msg) VALUES ('PASS: storage: B cannot insert under A folder'); END $test$;
INSERT INTO storage.objects(bucket_id,name) VALUES ('my-files','22222222-2222-4222-8222-222222222222/own.png');
DO $test$ DECLARE n bigint; BEGIN
BEGIN
 UPDATE storage.objects SET name='11111111-1111-4111-8111-111111111111/moved.png' WHERE bucket_id='my-files' AND name='22222222-2222-4222-8222-222222222222/own.png';
 RAISE EXCEPTION 'FAIL: storage: B cannot move own object into A folder unexpectedly allowed';
 EXCEPTION WHEN insufficient_privilege OR check_violation THEN NULL; END;
INSERT INTO _results(msg) VALUES ('PASS: storage: B cannot move own object into A folder'); END $test$;
DO $test$ DECLARE n bigint; BEGIN
BEGIN PERFORM public.pf_confirm_document('dddddddd-dddd-4ddd-8ddd-dddddddddddd','2026-11-01','saving',1,NULL,NULL,NULL,NULL,'other'); RAISE EXCEPTION 'FAIL confirm'; EXCEPTION WHEN raise_exception THEN IF SQLERRM <> 'Choose one of your own documents' THEN RAISE; END IF; END;
INSERT INTO _results(msg) VALUES ('PASS: confirmation: B cannot confirm A document'); END $test$;
SET LOCAL ROLE anon; SELECT set_config('request.jwt.claim.sub','',true);
DO $test$ DECLARE n bigint; BEGIN
IF has_table_privilege('anon','public.pf_categories','SELECT') THEN RAISE EXCEPTION 'FAIL anon grant'; END IF;
INSERT INTO _results(msg) VALUES ('PASS: pf_categories: anon lacks SELECT'); END $test$;
DO $test$ DECLARE n bigint; BEGIN
IF has_table_privilege('anon','public.pf_categories','INSERT') THEN RAISE EXCEPTION 'FAIL anon grant'; END IF;
INSERT INTO _results(msg) VALUES ('PASS: pf_categories: anon lacks INSERT'); END $test$;
DO $test$ DECLARE n bigint; BEGIN
IF has_table_privilege('anon','public.pf_categories','UPDATE') THEN RAISE EXCEPTION 'FAIL anon grant'; END IF;
INSERT INTO _results(msg) VALUES ('PASS: pf_categories: anon lacks UPDATE'); END $test$;
DO $test$ DECLARE n bigint; BEGIN
IF has_table_privilege('anon','public.pf_categories','DELETE') THEN RAISE EXCEPTION 'FAIL anon grant'; END IF;
INSERT INTO _results(msg) VALUES ('PASS: pf_categories: anon lacks DELETE'); END $test$;
DO $test$ DECLARE n bigint; BEGIN
BEGIN
 PERFORM 1 FROM public.pf_categories;
 RAISE EXCEPTION 'FAIL: pf_categories: anon SELECT denied unexpectedly allowed';
 EXCEPTION WHEN insufficient_privilege OR check_violation THEN NULL; END;
INSERT INTO _results(msg) VALUES ('PASS: pf_categories: anon SELECT denied'); END $test$;
DO $test$ DECLARE n bigint; BEGIN
IF has_table_privilege('anon','public.pf_documents','SELECT') THEN RAISE EXCEPTION 'FAIL anon grant'; END IF;
INSERT INTO _results(msg) VALUES ('PASS: pf_documents: anon lacks SELECT'); END $test$;
DO $test$ DECLARE n bigint; BEGIN
IF has_table_privilege('anon','public.pf_documents','INSERT') THEN RAISE EXCEPTION 'FAIL anon grant'; END IF;
INSERT INTO _results(msg) VALUES ('PASS: pf_documents: anon lacks INSERT'); END $test$;
DO $test$ DECLARE n bigint; BEGIN
IF has_table_privilege('anon','public.pf_documents','UPDATE') THEN RAISE EXCEPTION 'FAIL anon grant'; END IF;
INSERT INTO _results(msg) VALUES ('PASS: pf_documents: anon lacks UPDATE'); END $test$;
DO $test$ DECLARE n bigint; BEGIN
IF has_table_privilege('anon','public.pf_documents','DELETE') THEN RAISE EXCEPTION 'FAIL anon grant'; END IF;
INSERT INTO _results(msg) VALUES ('PASS: pf_documents: anon lacks DELETE'); END $test$;
DO $test$ DECLARE n bigint; BEGIN
BEGIN
 PERFORM 1 FROM public.pf_documents;
 RAISE EXCEPTION 'FAIL: pf_documents: anon SELECT denied unexpectedly allowed';
 EXCEPTION WHEN insufficient_privilege OR check_violation THEN NULL; END;
INSERT INTO _results(msg) VALUES ('PASS: pf_documents: anon SELECT denied'); END $test$;
DO $test$ DECLARE n bigint; BEGIN
IF has_table_privilege('anon','public.pf_transactions','SELECT') THEN RAISE EXCEPTION 'FAIL anon grant'; END IF;
INSERT INTO _results(msg) VALUES ('PASS: pf_transactions: anon lacks SELECT'); END $test$;
DO $test$ DECLARE n bigint; BEGIN
IF has_table_privilege('anon','public.pf_transactions','INSERT') THEN RAISE EXCEPTION 'FAIL anon grant'; END IF;
INSERT INTO _results(msg) VALUES ('PASS: pf_transactions: anon lacks INSERT'); END $test$;
DO $test$ DECLARE n bigint; BEGIN
IF has_table_privilege('anon','public.pf_transactions','UPDATE') THEN RAISE EXCEPTION 'FAIL anon grant'; END IF;
INSERT INTO _results(msg) VALUES ('PASS: pf_transactions: anon lacks UPDATE'); END $test$;
DO $test$ DECLARE n bigint; BEGIN
IF has_table_privilege('anon','public.pf_transactions','DELETE') THEN RAISE EXCEPTION 'FAIL anon grant'; END IF;
INSERT INTO _results(msg) VALUES ('PASS: pf_transactions: anon lacks DELETE'); END $test$;
DO $test$ DECLARE n bigint; BEGIN
BEGIN
 PERFORM 1 FROM public.pf_transactions;
 RAISE EXCEPTION 'FAIL: pf_transactions: anon SELECT denied unexpectedly allowed';
 EXCEPTION WHEN insufficient_privilege OR check_violation THEN NULL; END;
INSERT INTO _results(msg) VALUES ('PASS: pf_transactions: anon SELECT denied'); END $test$;
DO $test$ DECLARE n bigint; BEGIN
IF EXISTS(SELECT 1 FROM storage.objects WHERE bucket_id='my-files') THEN RAISE EXCEPTION 'FAIL anon storage'; END IF;
INSERT INTO _results(msg) VALUES ('PASS: storage: anon reads nothing'); END $test$;
DO $test$ DECLARE n bigint; BEGIN
BEGIN
 INSERT INTO storage.objects(bucket_id,name) VALUES ('my-files','11111111-1111-4111-8111-111111111111/anon.png');
 RAISE EXCEPTION 'FAIL: storage: anon cannot upload unexpectedly allowed';
 EXCEPTION WHEN insufficient_privilege OR check_violation THEN NULL; END;
INSERT INTO _results(msg) VALUES ('PASS: storage: anon cannot upload'); END $test$;
SET LOCAL ROLE authenticated; SELECT set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',true);
DO $test$ DECLARE n bigint; BEGIN
IF (SELECT count(*) FROM public.pf_categories WHERE id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')<>1 OR (SELECT count(*) FROM public.pf_documents WHERE id='dddddddd-dddd-4ddd-8ddd-dddddddddddd')<>1 OR (SELECT count(*) FROM public.pf_transactions WHERE id='eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee')<>1 THEN RAISE EXCEPTION 'FAIL missing A rows'; END IF;
INSERT INTO _results(msg) VALUES ('PASS: A rows survived B attempts'); END $test$;
DO $test$ DECLARE n bigint; BEGIN
PERFORM public.pf_confirm_document('dddddddd-dddd-4ddd-8ddd-dddddddddddd','2026-11-01','income',1000,NULL,NULL,NULL,'salary','payslip'); IF (SELECT status FROM public.pf_documents WHERE id='dddddddd-dddd-4ddd-8ddd-dddddddddddd')<>'confirmed' THEN RAISE EXCEPTION 'FAIL status'; END IF; BEGIN PERFORM public.pf_confirm_document('dddddddd-dddd-4ddd-8ddd-dddddddddddd','2026-11-01','income',1000,NULL,NULL,NULL,'salary','payslip'); RAISE EXCEPTION 'FAIL duplicate'; EXCEPTION WHEN raise_exception THEN IF SQLERRM NOT LIKE 'This document is already%' THEN RAISE; END IF; END;
INSERT INTO _results(msg) VALUES ('PASS: confirmation is atomic and cannot duplicate'); END $test$;
DO $test$ DECLARE n bigint; BEGIN
IF NOT EXISTS(SELECT 1 FROM public.pf_month_summary('2026-11-19') WHERE income_pence=1000 AND expense_pence=100 AND saving_pence=0 AND remaining_pence=900) THEN RAISE EXCEPTION 'FAIL summary'; END IF;
INSERT INTO _results(msg) VALUES ('PASS: month summary in integer pence'); END $test$;
DO $test$ DECLARE n bigint; BEGIN
IF NOT EXISTS(SELECT 1 FROM public.pf_month_summary('2000-01-01') WHERE income_pence=0 AND expense_pence=0 AND saving_pence=0 AND remaining_pence=0) THEN RAISE EXCEPTION 'FAIL zeros'; END IF;
INSERT INTO _results(msg) VALUES ('PASS: empty month summary is zeros'); END $test$;
DO $test$ DECLARE n bigint; BEGIN
IF NOT EXISTS(SELECT 1 FROM public.pf_month_categories('2026-11-01') WHERE category_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' AND total_pence=100) THEN RAISE EXCEPTION 'FAIL categories'; END IF;
INSERT INTO _results(msg) VALUES ('PASS: month categories correct'); END $test$;
DO $test$ DECLARE n bigint; BEGIN
IF (SELECT count(*) FROM public.pf_monthly_series(0))<>1 OR (SELECT count(*) FROM public.pf_monthly_series(100))<>24 OR (SELECT count(*) FROM public.pf_monthly_series())<>6 THEN RAISE EXCEPTION 'FAIL series'; END IF;
INSERT INTO _results(msg) VALUES ('PASS: monthly series clamps to 1..24'); END $test$;
SELECT set_config('request.jwt.claim.sub','22222222-2222-4222-8222-222222222222',true);
DO $test$ DECLARE n bigint; BEGIN
PERFORM public.pf_ensure_defaults(); PERFORM public.pf_ensure_defaults(); IF (SELECT count(*) FROM public.pf_categories)<>10 OR (SELECT name FROM public.pf_categories WHERE sort_order=1)<>'Rent and housing' OR (SELECT name FROM public.pf_categories WHERE sort_order=10)<>'Other expenses' THEN RAISE EXCEPTION 'FAIL defaults'; END IF;
INSERT INTO _results(msg) VALUES ('PASS: defaults are ordered and idempotent'); END $test$;
DO $test$ DECLARE n bigint; BEGIN
FOR i IN 1..30 LOOP INSERT INTO public.pf_documents(storage_path,file_name,mime_type,size_bytes) VALUES ('22222222-2222-4222-8222-222222222222/'||gen_random_uuid()||'-x.png','x.png','image/png',1); END LOOP; BEGIN INSERT INTO public.pf_documents(storage_path,file_name,mime_type,size_bytes) VALUES ('22222222-2222-4222-8222-222222222222/'||gen_random_uuid()||'-x.png','x.png','image/png',1); RAISE EXCEPTION 'FAIL rate limit'; EXCEPTION WHEN raise_exception THEN IF SQLERRM NOT LIKE 'Too many uploads%' THEN RAISE; END IF; END;
INSERT INTO _results(msg) VALUES ('PASS: 30 uploads allowed; 31st rejected'); END $test$;
DO $test$ BEGIN
BEGIN INSERT INTO public.pf_transactions(txn_date,kind,amount_pence) VALUES ('2026-11-01','saving',0); RAISE EXCEPTION 'FAIL zero amount'; EXCEPTION WHEN check_violation THEN NULL; END;
BEGIN INSERT INTO public.pf_transactions(txn_date,kind,amount_pence) VALUES ('2026-11-01','saving',100000000001); RAISE EXCEPTION 'FAIL maximum amount'; EXCEPTION WHEN check_violation THEN NULL; END;
INSERT INTO public.pf_transactions(txn_date,kind,amount_pence) VALUES ('2026-11-01','saving',100000000000);
INSERT INTO _results(msg) VALUES ('PASS: Amount positive and capped at 100000000000 pence'); END $test$;
DO $test$ BEGIN
BEGIN INSERT INTO public.pf_transactions(txn_date,kind,amount_pence) VALUES ('2026-11-01','expense',1); RAISE EXCEPTION 'FAIL expense category'; EXCEPTION WHEN check_violation THEN NULL; END;
BEGIN INSERT INTO public.pf_transactions(txn_date,kind,amount_pence) VALUES ('2026-11-01','income',1); RAISE EXCEPTION 'FAIL income type'; EXCEPTION WHEN check_violation THEN NULL; END;
BEGIN INSERT INTO public.pf_transactions(txn_date,kind,amount_pence,income_type) VALUES ('2026-11-01','saving',1,'salary'); RAISE EXCEPTION 'FAIL saving type'; EXCEPTION WHEN check_violation THEN NULL; END;
INSERT INTO _results(msg) VALUES ('PASS: expense, income and saving field constraints'); END $test$;
-- ===== Phase 2: bills, budgets, goals, notifications, grants =====
RESET ROLE;
-- Phase 2 totals use their own fixtures; phase 1's dated transactions
-- otherwise overlap the current month and change the budget expectation.
DELETE FROM public.pf_transactions WHERE user_id IN ('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222');
-- Grants: no TRUNCATE/TRIGGER/REFERENCES/MAINTAIN for authenticated, nothing for anon/service_role, on every pf_ table.
DO $test$ DECLARE r record; p text; BEGIN
FOR r IN SELECT c.oid::regclass::text AS t FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind='r' AND c.relname LIKE 'pf\_%' LOOP
 FOREACH p IN ARRAY ARRAY['TRUNCATE','TRIGGER','REFERENCES','MAINTAIN'] LOOP
  IF has_table_privilege('authenticated', r.t, p) THEN RAISE EXCEPTION 'FAIL: authenticated has % on %', p, r.t; END IF;
 END LOOP;
 FOREACH p IN ARRAY ARRAY['SELECT','INSERT','UPDATE','DELETE','TRUNCATE'] LOOP
  IF has_table_privilege('anon', r.t, p) OR has_table_privilege('service_role', r.t, p) THEN RAISE EXCEPTION 'FAIL: anon/service_role has % on %', p, r.t; END IF;
 END LOOP;
 IF NOT (has_table_privilege('authenticated', r.t, 'SELECT') AND has_table_privilege('authenticated', r.t, 'INSERT') AND has_table_privilege('authenticated', r.t, 'UPDATE') AND has_table_privilege('authenticated', r.t, 'DELETE')) THEN RAISE EXCEPTION 'FAIL: authenticated lacks row privileges on %', r.t; END IF;
 IF NOT (SELECT relrowsecurity AND relforcerowsecurity FROM pg_class WHERE oid = r.t::regclass) THEN RAISE EXCEPTION 'FAIL: RLS not forced on %', r.t; END IF;
END LOOP;
INSERT INTO _results(msg) VALUES ('PASS: grants: every pf_ table has only SELECT/INSERT/UPDATE/DELETE for authenticated, none for anon/service_role, forced RLS'); END $test$;
DO $test$ DECLARE f text; BEGIN
FOREACH f IN ARRAY ARRAY['public.pf_mark_bill_paid(uuid,date,bigint,date)','public.pf_refresh_notifications()','public.pf_budget_status(date)','public.pf_goal_progress()','public.pf_advance_due(date,text,integer)'] LOOP
 IF has_function_privilege('anon', f, 'EXECUTE') OR has_function_privilege('service_role', f, 'EXECUTE') OR NOT has_function_privilege('authenticated', f, 'EXECUTE') THEN RAISE EXCEPTION 'FAIL: execute grant on %', f; END IF;
 IF (SELECT prosecdef FROM pg_proc WHERE oid = f::regprocedure) THEN RAISE EXCEPTION 'FAIL: % is security definer', f; END IF;
END LOOP;
INSERT INTO _results(msg) VALUES ('PASS: new functions are security invoker, executable by authenticated only'); END $test$;

SET LOCAL ROLE authenticated; SELECT set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',true);
INSERT INTO public.pf_bills(id,name,amount_pence,frequency,next_due_date,anchor_day,category_id) VALUES
 ('b1111111-1111-4111-8111-111111111111','Phone',4599,'monthly',public.pf_uk_today()+2,extract(day FROM public.pf_uk_today()+2)::int,'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
 ('b2222222-2222-4222-8222-222222222222','Water',3000,'monthly',public.pf_uk_today()-5,extract(day FROM public.pf_uk_today()-5)::int,'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
 ('b3333333-3333-4333-8333-333333333333','TV licence',16950,'once',public.pf_uk_today()+20,NULL,'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
INSERT INTO public.pf_budgets(id,category_id,monthly_limit_pence) VALUES ('c1111111-1111-4111-8111-111111111111','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',1000);
INSERT INTO public.pf_goals(id,name,target_pence,starting_pence) VALUES ('91111111-1111-4111-8111-111111111111','Holiday',10000,9000);
INSERT INTO public.pf_transactions(txn_date,kind,amount_pence,category_id) VALUES (public.pf_uk_today(),'expense',1100,'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
INSERT INTO public.pf_transactions(txn_date,kind,amount_pence,goal_id) VALUES (public.pf_uk_today(),'saving',500,'91111111-1111-4111-8111-111111111111');
INSERT INTO public.pf_transactions(txn_date,kind,amount_pence) VALUES ((date_trunc('month',public.pf_uk_today()::timestamp) - interval '1 day')::date,'saving',3000);

DO $test$ BEGIN
IF public.pf_advance_due('2026-01-31','monthly',31) <> '2026-02-28' OR public.pf_advance_due('2026-02-28','monthly',31) <> '2026-03-31'
 OR public.pf_advance_due('2028-01-31','monthly',31) <> '2028-02-29' OR public.pf_advance_due('2028-02-29','yearly',29) <> '2029-02-28'
 OR public.pf_advance_due('2031-02-28','yearly',29) <> '2032-02-29' OR public.pf_advance_due('2026-11-30','quarterly',30) <> '2027-02-28'
 OR public.pf_advance_due('2026-12-29','weekly',NULL) <> '2027-01-05' OR public.pf_advance_due('2026-12-29','once',NULL) IS NOT NULL THEN RAISE EXCEPTION 'FAIL advance'; END IF;
IF public.pf_money(4599) <> '£45.99' OR public.pf_money(123456789) <> '£1,234,567.89' OR public.pf_money(5) <> '£0.05' OR public.pf_day('2026-11-05') <> '5 Nov 2026' THEN RAISE EXCEPTION 'FAIL wording helpers'; END IF;
INSERT INTO _results(msg) VALUES ('PASS: bill advance (month end, leap year, 29 Feb yearly, quarterly, weekly, once) and £/date wording match src/lib/myfiles-plan.ts'); END $test$;
DO $test$ BEGIN
BEGIN INSERT INTO public.pf_bills(name,amount_pence,frequency,next_due_date,category_id) VALUES ('X',1,'monthly','2026-11-01','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'); RAISE EXCEPTION 'FAIL anchor'; EXCEPTION WHEN check_violation THEN NULL; END;
BEGIN INSERT INTO public.pf_bills(name,amount_pence,frequency,next_due_date,anchor_day,category_id) VALUES ('X',0,'monthly','2026-11-01',1,'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'); RAISE EXCEPTION 'FAIL amount'; EXCEPTION WHEN check_violation THEN NULL; END;
BEGIN INSERT INTO public.pf_budgets(category_id,monthly_limit_pence) VALUES ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',5); RAISE EXCEPTION 'FAIL budget unique'; EXCEPTION WHEN unique_violation THEN NULL; END;
INSERT INTO public.pf_budgets(category_id,monthly_limit_pence) VALUES (NULL,500000);
BEGIN INSERT INTO public.pf_budgets(category_id,monthly_limit_pence) VALUES (NULL,5); RAISE EXCEPTION 'FAIL overall unique'; EXCEPTION WHEN unique_violation THEN NULL; END;
BEGIN INSERT INTO public.pf_transactions(txn_date,kind,amount_pence,category_id,goal_id) VALUES (public.pf_uk_today(),'expense',1,'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','91111111-1111-4111-8111-111111111111'); RAISE EXCEPTION 'FAIL goal kind'; EXCEPTION WHEN check_violation THEN NULL; END;
INSERT INTO _results(msg) VALUES ('PASS: bill anchor/amount checks, one budget per category and one overall, goal only on savings'); END $test$;
DO $test$ BEGIN
BEGIN UPDATE public.pf_bills SET user_id='22222222-2222-4222-8222-222222222222'; RAISE EXCEPTION 'FAIL'; EXCEPTION WHEN raise_exception THEN IF SQLERRM NOT LIKE 'Choose your own records%' THEN RAISE; END IF; END;
BEGIN UPDATE public.pf_budgets SET user_id='22222222-2222-4222-8222-222222222222'; RAISE EXCEPTION 'FAIL'; EXCEPTION WHEN raise_exception THEN IF SQLERRM NOT LIKE 'Choose your own records%' THEN RAISE; END IF; END;
BEGIN UPDATE public.pf_goals SET user_id='22222222-2222-4222-8222-222222222222'; RAISE EXCEPTION 'FAIL'; EXCEPTION WHEN raise_exception THEN IF SQLERRM NOT LIKE 'Choose your own records%' THEN RAISE; END IF; END;
INSERT INTO public.pf_notifications(kind,title,body,dedupe_key) VALUES ('document_ready','T','B','manual:1');
BEGIN UPDATE public.pf_notifications SET user_id='22222222-2222-4222-8222-222222222222'; RAISE EXCEPTION 'FAIL'; EXCEPTION WHEN raise_exception THEN IF SQLERRM NOT LIKE 'Choose your own records%' THEN RAISE; END IF; END;
INSERT INTO _results(msg) VALUES ('PASS: user_id immutable on pf_bills, pf_budgets, pf_goals, pf_notifications'); END $test$;
DO $test$ DECLARE n int; m int; ym text := to_char(public.pf_uk_today(),'YYYY-MM'); BEGIN
n := public.pf_refresh_notifications(); m := public.pf_refresh_notifications(); PERFORM public.pf_refresh_notifications();
IF m <> 0 OR n < 5 THEN RAISE EXCEPTION 'FAIL dedupe first=% second=%', n, m; END IF;
IF (SELECT count(*) FROM public.pf_notifications) <> n + 1 THEN RAISE EXCEPTION 'FAIL count'; END IF;
IF NOT EXISTS (SELECT 1 FROM public.pf_notifications WHERE dedupe_key = 'bill_due_soon:b1111111-1111-4111-8111-111111111111:' || (public.pf_uk_today()+2)
  AND body = '£45.99 for Phone is due on ' || public.pf_day(public.pf_uk_today()+2) || '.') THEN RAISE EXCEPTION 'FAIL due soon'; END IF;
IF NOT EXISTS (SELECT 1 FROM public.pf_notifications WHERE dedupe_key = 'bill_overdue:b2222222-2222-4222-8222-222222222222:' || (public.pf_uk_today()-5)
  AND title = 'Water is overdue') THEN RAISE EXCEPTION 'FAIL overdue'; END IF;
IF NOT EXISTS (SELECT 1 FROM public.pf_notifications WHERE dedupe_key = 'over_budget:aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa:' || ym || ':80')
 OR NOT EXISTS (SELECT 1 FROM public.pf_notifications WHERE dedupe_key = 'over_budget:aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa:' || ym || ':100'
  AND title = 'Food budget exceeded' AND body = 'You have spent £11.00 of your £10.00 Food budget this month (110%).') THEN RAISE EXCEPTION 'FAIL budget notices'; END IF;
IF NOT EXISTS (SELECT 1 FROM public.pf_notifications WHERE dedupe_key = 'goal_near:91111111-1111-4111-8111-111111111111' AND title = 'Holiday: 95% saved') THEN RAISE EXCEPTION 'FAIL goal near'; END IF;
IF EXISTS (SELECT 1 FROM public.pf_notifications WHERE dedupe_key LIKE 'bill_due_soon:b3333333%') THEN RAISE EXCEPTION 'FAIL 20-day bill notified'; END IF;
INSERT INTO _results(msg) VALUES ('PASS: notifications created once (repeat refreshes add 0) with factual wording; bill 20 days out not notified'); END $test$;
DO $test$ BEGIN
IF NOT EXISTS (SELECT 1 FROM public.pf_budget_status(public.pf_uk_today()) WHERE category_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' AND spent_pence=1100 AND limit_pence=1000 AND percentage=110)
 OR NOT EXISTS (SELECT 1 FROM public.pf_budget_status(public.pf_uk_today()) WHERE category_id IS NULL AND spent_pence=1100 AND percentage=0) THEN RAISE EXCEPTION 'FAIL budget status'; END IF;
IF NOT EXISTS (SELECT 1 FROM public.pf_goal_progress() WHERE goal_id='91111111-1111-4111-8111-111111111111' AND saved_pence=9500 AND percentage=95 AND avg_monthly_saving_pence=1000) THEN RAISE EXCEPTION 'FAIL goal progress'; END IF;
INSERT INTO _results(msg) VALUES ('PASS: budget status and goal progress (starting + linked savings; 3-month average)'); END $test$;
DO $test$ DECLARE t1 uuid; due date; BEGIN
SELECT next_due_date INTO due FROM public.pf_bills WHERE id='b1111111-1111-4111-8111-111111111111';
t1 := public.pf_mark_bill_paid('b1111111-1111-4111-8111-111111111111', public.pf_uk_today(), NULL, due);
BEGIN PERFORM public.pf_mark_bill_paid('b1111111-1111-4111-8111-111111111111', public.pf_uk_today(), NULL, due); RAISE EXCEPTION 'FAIL double pay';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM NOT LIKE 'This bill has already been marked as paid%' THEN RAISE; END IF; END;
IF (SELECT count(*) FROM public.pf_transactions WHERE merchant='Phone' AND description = 'Bill due ' || public.pf_day(due)) <> 1 THEN RAISE EXCEPTION 'FAIL one transaction'; END IF;
IF NOT EXISTS (SELECT 1 FROM public.pf_transactions WHERE id=t1 AND kind='expense' AND amount_pence=4599 AND category_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa') THEN RAISE EXCEPTION 'FAIL txn'; END IF;
IF (SELECT next_due_date FROM public.pf_bills WHERE id='b1111111-1111-4111-8111-111111111111') <> public.pf_advance_due(due,'monthly',extract(day FROM due)::int) THEN RAISE EXCEPTION 'FAIL advance'; END IF;
PERFORM public.pf_mark_bill_paid('b3333333-3333-4333-8333-333333333333', public.pf_uk_today(), 16000);
IF (SELECT active FROM public.pf_bills WHERE id='b3333333-3333-4333-8333-333333333333') THEN RAISE EXCEPTION 'FAIL once'; END IF;
BEGIN PERFORM public.pf_mark_bill_paid('b3333333-3333-4333-8333-333333333333', public.pf_uk_today()); RAISE EXCEPTION 'FAIL once twice';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM NOT LIKE 'Choose one of your own active bills%' THEN RAISE; END IF; END;
IF (SELECT count(*) FROM public.pf_transactions WHERE merchant='TV licence' AND amount_pence=16000) <> 1 THEN RAISE EXCEPTION 'FAIL once txn'; END IF;
INSERT INTO _results(msg) VALUES ('PASS: mark as paid: one transaction per due date, repeat call refused, next date advanced, one-off deactivated'); END $test$;

SELECT set_config('request.jwt.claim.sub','22222222-2222-4222-8222-222222222222',true);
DO $test$ DECLARE n bigint; BEGIN
IF EXISTS (SELECT 1 FROM public.pf_bills) OR EXISTS (SELECT 1 FROM public.pf_budgets) OR EXISTS (SELECT 1 FROM public.pf_goals) OR EXISTS (SELECT 1 FROM public.pf_notifications)
 OR EXISTS (SELECT 1 FROM public.pf_transactions WHERE goal_id IS NOT NULL) THEN RAISE EXCEPTION 'FAIL B select'; END IF;
UPDATE public.pf_bills SET name='x'; GET DIAGNOSTICS n = ROW_COUNT; IF n <> 0 THEN RAISE EXCEPTION 'FAIL B update bills'; END IF;
UPDATE public.pf_budgets SET monthly_limit_pence=1; GET DIAGNOSTICS n = ROW_COUNT; IF n <> 0 THEN RAISE EXCEPTION 'FAIL B update budgets'; END IF;
UPDATE public.pf_goals SET name='x'; GET DIAGNOSTICS n = ROW_COUNT; IF n <> 0 THEN RAISE EXCEPTION 'FAIL B update goals'; END IF;
UPDATE public.pf_notifications SET read_at=now(); GET DIAGNOSTICS n = ROW_COUNT; IF n <> 0 THEN RAISE EXCEPTION 'FAIL B update notifications'; END IF;
DELETE FROM public.pf_bills; GET DIAGNOSTICS n = ROW_COUNT; IF n <> 0 THEN RAISE EXCEPTION 'FAIL B delete bills'; END IF;
DELETE FROM public.pf_budgets; GET DIAGNOSTICS n = ROW_COUNT; IF n <> 0 THEN RAISE EXCEPTION 'FAIL B delete budgets'; END IF;
DELETE FROM public.pf_goals; GET DIAGNOSTICS n = ROW_COUNT; IF n <> 0 THEN RAISE EXCEPTION 'FAIL B delete goals'; END IF;
DELETE FROM public.pf_notifications; GET DIAGNOSTICS n = ROW_COUNT; IF n <> 0 THEN RAISE EXCEPTION 'FAIL B delete notifications'; END IF;
INSERT INTO _results(msg) VALUES ('PASS: B cannot select, update or delete A''s bills, budgets, goals, notifications or goal-linked savings'); END $test$;
DO $test$ DECLARE bcat uuid := (SELECT id FROM public.pf_categories ORDER BY sort_order LIMIT 1); own uuid; BEGIN
BEGIN INSERT INTO public.pf_bills(user_id,name,amount_pence,frequency,next_due_date,category_id) VALUES ('11111111-1111-4111-8111-111111111111','X',1,'once','2026-12-01',bcat); RAISE EXCEPTION 'FAIL'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
BEGIN INSERT INTO public.pf_budgets(user_id,category_id,monthly_limit_pence) VALUES ('11111111-1111-4111-8111-111111111111',bcat,1); RAISE EXCEPTION 'FAIL'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
BEGIN INSERT INTO public.pf_goals(user_id,name,target_pence) VALUES ('11111111-1111-4111-8111-111111111111','X',1); RAISE EXCEPTION 'FAIL'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
BEGIN INSERT INTO public.pf_notifications(user_id,kind,title,body,dedupe_key) VALUES ('11111111-1111-4111-8111-111111111111','goal_near','X','X','x'); RAISE EXCEPTION 'FAIL'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
INSERT INTO _results(msg) VALUES ('PASS: B cannot insert bills, budgets, goals or notifications as A'); END $test$;
DO $test$ DECLARE own uuid; BEGIN
BEGIN INSERT INTO public.pf_bills(name,amount_pence,frequency,next_due_date,category_id) VALUES ('X',1,'once','2026-12-01','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'); RAISE EXCEPTION 'FAIL'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
BEGIN INSERT INTO public.pf_budgets(category_id,monthly_limit_pence) VALUES ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',1); RAISE EXCEPTION 'FAIL'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
BEGIN INSERT INTO public.pf_transactions(txn_date,kind,amount_pence,goal_id) VALUES ('2026-11-01','saving',1,'91111111-1111-4111-8111-111111111111'); RAISE EXCEPTION 'FAIL'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
INSERT INTO public.pf_transactions(txn_date,kind,amount_pence) VALUES ('2026-11-01','saving',1) RETURNING id INTO own;
BEGIN UPDATE public.pf_transactions SET goal_id='91111111-1111-4111-8111-111111111111' WHERE id=own; RAISE EXCEPTION 'FAIL'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
INSERT INTO _results(msg) VALUES ('PASS: B cannot reference A''s category in a bill or budget, or A''s goal in a saving (insert or update)'); END $test$;
DO $test$ BEGIN
BEGIN PERFORM public.pf_mark_bill_paid('b2222222-2222-4222-8222-222222222222', public.pf_uk_today()); RAISE EXCEPTION 'FAIL';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM NOT LIKE 'Choose one of your own active bills%' THEN RAISE; END IF; END;
IF EXISTS (SELECT 1 FROM public.pf_budget_status(public.pf_uk_today())) OR EXISTS (SELECT 1 FROM public.pf_goal_progress()) THEN RAISE EXCEPTION 'FAIL B sees A'; END IF;
IF public.pf_refresh_notifications() <> 0 THEN RAISE EXCEPTION 'FAIL B refresh created notices from A data'; END IF;
INSERT INTO _results(msg) VALUES ('PASS: B cannot pay A''s bill; B''s budget status, goal progress and refresh see nothing of A'); END $test$;
SELECT set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',true);
DO $test$ BEGIN
IF (SELECT next_due_date FROM public.pf_bills WHERE id='b2222222-2222-4222-8222-222222222222') <> public.pf_uk_today()-5 OR (SELECT count(*) FROM public.pf_bills) <> 3
 OR (SELECT count(*) FROM public.pf_goals) <> 1 OR (SELECT count(*) FROM public.pf_budgets) <> 2 OR (SELECT count(*) FROM public.pf_notifications WHERE read_at IS NOT NULL) <> 0 THEN RAISE EXCEPTION 'FAIL A rows changed'; END IF;
BEGIN INSERT INTO storage.objects(bucket_id,name) VALUES ('my-files','11111111-1111-4111-8111-111111111111/evil.exe'); RAISE EXCEPTION 'FAIL ext';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
INSERT INTO storage.objects(bucket_id,name) VALUES ('my-files','11111111-1111-4111-8111-111111111111/ok.PDF');
INSERT INTO _results(msg) VALUES ('PASS: A''s phase 2 rows survived B''s attempts; storage rejects non JPEG/PNG/PDF names'); END $test$;

SET LOCAL ROLE anon; SELECT set_config('request.jwt.claim.sub','',true);
DO $test$ DECLARE t text; BEGIN
FOREACH t IN ARRAY ARRAY['pf_bills','pf_budgets','pf_goals','pf_notifications'] LOOP
 BEGIN EXECUTE format('SELECT 1 FROM public.%I', t); RAISE EXCEPTION 'FAIL anon select %', t; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN EXECUTE format('DELETE FROM public.%I', t); RAISE EXCEPTION 'FAIL anon delete %', t; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END LOOP;
BEGIN PERFORM public.pf_refresh_notifications(); RAISE EXCEPTION 'FAIL anon refresh'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
BEGIN PERFORM public.pf_mark_bill_paid('b2222222-2222-4222-8222-222222222222', '2026-11-01'); RAISE EXCEPTION 'FAIL anon pay'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
BEGIN PERFORM public.pf_goal_progress(); RAISE EXCEPTION 'FAIL anon goals'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
INSERT INTO _results(msg) VALUES ('PASS: anon denied on new tables and functions'); END $test$;
RESET ROLE;
SELECT msg FROM _results ORDER BY ord;
-- ===== Phase 3: facts, deletion (assistant questions are unlimited; no slot checks) =====
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','22222222-2222-4222-8222-222222222222',true);
DO $test$ DECLARE f jsonb; BEGIN
f := public.pf_assistant_facts(public.pf_uk_today());
IF f::text LIKE '%Holiday%' OR f::text LIKE '%Phone%' OR f::text LIKE '%Water%' OR f->'bills' <> '[]'::jsonb OR f->'budgets' <> '[]'::jsonb OR f->'goals' <> '[]'::jsonb THEN RAISE EXCEPTION 'FAIL facts leak A'; END IF;
IF (f->'food_and_groceries'->>'this_month_pence')::bigint <> 0 THEN RAISE EXCEPTION 'FAIL food figure'; END IF;
INSERT INTO _results(msg) VALUES ('PASS: assistant facts B contain nothing of A');
END $test$;
SELECT set_config('request.jwt.claim.sub','22222222-2222-4222-8222-222222222222',true);
DO $test$ DECLARE counts jsonb; BEGIN
counts := public.pf_delete_all_my_data();
IF EXISTS(SELECT 1 FROM public.pf_transactions) OR EXISTS(SELECT 1 FROM public.pf_categories) OR EXISTS(SELECT 1 FROM public.pf_documents) THEN RAISE EXCEPTION 'FAIL B deletion'; END IF;
INSERT INTO _results(msg) VALUES ('PASS: delete-all B removes only B records'); END $test$;
SELECT set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',true);
DO $test$ DECLARE counts jsonb; BEGIN
IF (SELECT count(*) FROM public.pf_bills) <> 3 OR (SELECT count(*) FROM public.pf_goals) <> 1 OR (SELECT count(*) FROM public.pf_categories) <> 1 OR NOT EXISTS(SELECT 1 FROM public.pf_documents) THEN RAISE EXCEPTION 'FAIL B deleted A'; END IF;
counts := public.pf_delete_all_my_data();
IF (counts->>'bills')::int <> 3 OR (counts->>'goals')::int <> 1 OR EXISTS(SELECT 1 FROM public.pf_transactions) OR EXISTS(SELECT 1 FROM public.pf_categories) OR EXISTS(SELECT 1 FROM public.pf_documents) OR EXISTS(SELECT 1 FROM public.pf_bills) OR EXISTS(SELECT 1 FROM public.pf_budgets) OR EXISTS(SELECT 1 FROM public.pf_goals) OR EXISTS(SELECT 1 FROM public.pf_notifications) THEN RAISE EXCEPTION 'FAIL A deletion'; END IF;
IF (public.pf_assistant_facts(public.pf_uk_today())->>'has_data')::boolean THEN RAISE EXCEPTION 'FAIL empty pack'; END IF;
INSERT INTO _results(msg) VALUES ('PASS: A survived B deletion; A delete-all removes all A records; empty facts has_data=false'); END $test$;
SET LOCAL ROLE anon; SELECT set_config('request.jwt.claim.sub','',true);
DO $test$ BEGIN
BEGIN PERFORM public.pf_assistant_facts('2026-11-01'); RAISE EXCEPTION 'FAIL anon facts'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
BEGIN PERFORM public.pf_delete_all_my_data(); RAISE EXCEPTION 'FAIL anon deletion'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
BEGIN PERFORM 1 FROM public.pf_assistant_usage; RAISE EXCEPTION 'FAIL anon usage'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
INSERT INTO _results(msg) VALUES ('PASS: anon denied on assistant facts, usage and delete-all'); END $test$;
RESET ROLE;
DO $test$ DECLARE f text; BEGIN
FOREACH f IN ARRAY ARRAY['public.pf_assistant_facts(date)','public.pf_delete_all_my_data()'] LOOP
IF has_function_privilege('anon',f,'EXECUTE') OR has_function_privilege('service_role',f,'EXECUTE') OR NOT has_function_privilege('authenticated',f,'EXECUTE') THEN RAISE EXCEPTION 'FAIL phase3 grants'; END IF;
IF (SELECT prosecdef OR NOT ('search_path=public'=ANY(proconfig)) FROM pg_proc WHERE oid=f::regprocedure) THEN RAISE EXCEPTION 'FAIL phase3 invoker/path'; END IF;
END LOOP;
INSERT INTO _results(msg) VALUES ('PASS: phase3 functions invoker, public search_path, authenticated execute only'); END $test$;
DO $test$ DECLARE t text; p text; BEGIN
IF NOT (SELECT relrowsecurity AND relforcerowsecurity FROM pg_class WHERE oid='public.pf_assistant_usage'::regclass) THEN RAISE EXCEPTION 'FAIL usage forced RLS'; END IF;
IF has_table_privilege('anon','public.pf_assistant_usage','SELECT') OR has_table_privilege('service_role','public.pf_assistant_usage','SELECT')
 OR NOT has_table_privilege('authenticated','public.pf_assistant_usage','SELECT,INSERT,UPDATE,DELETE') THEN RAISE EXCEPTION 'FAIL usage grants'; END IF;
FOR t IN SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind='r' AND c.relname LIKE 'pf\_%' LOOP
 FOREACH p IN ARRAY ARRAY['TRUNCATE','TRIGGER','REFERENCES','MAINTAIN'] LOOP
  IF has_table_privilege('authenticated','public.'||t,p) THEN RAISE EXCEPTION 'FAIL authenticated has % on %', p, t; END IF;
 END LOOP;
END LOOP;
BEGIN INSERT INTO public.pf_assistant_usage(user_id,access_denied_message) VALUES ('11111111-1111-4111-8111-111111111111','denied'); RAISE EXCEPTION 'FAIL sticky denial marker storable'; EXCEPTION WHEN check_violation THEN NULL; END;
INSERT INTO _results(msg) VALUES ('PASS: pf_assistant_usage forced RLS + authenticated-only grants; no TRUNCATE/TRIGGER/REFERENCES/MAINTAIN on any pf_ table; denial marker cannot be stored'); END $test$;
DO $test$ BEGIN
IF to_regprocedure('public.pf_assistant_take_slot()') IS NOT NULL THEN RAISE EXCEPTION 'FAIL question-limit function still exists'; END IF;
INSERT INTO _results(msg) VALUES ('PASS: no question-limit function (pf_assistant_take_slot dropped); questions unlimited'); END $test$;
SELECT msg FROM _results ORDER BY ord;
ROLLBACK;
