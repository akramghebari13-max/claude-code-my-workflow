CREATE OR REPLACE FUNCTION public.bank_match_candidates(_line_id uuid)
RETURNS TABLE(kind text, id uuid, label text, match_date date, signed_pence bigint)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE l public.bank_statement_lines;
BEGIN
  SELECT * INTO l FROM public.bank_statement_lines WHERE bank_statement_lines.id = _line_id;
  IF l.id IS NULL OR NOT public.is_business_member(l.business_id) THEN RAISE EXCEPTION 'Bank line not found'; END IF;
  RETURN QUERY
  SELECT 'invoice'::text, i.id, ('Invoice ' || i.invoice_number || coalesce(' · ' || c.name, ''))::text,
         coalesce(i.due_date, i.issue_date), (i.net_pence + i.vat_pence)::bigint
  FROM public.invoices i LEFT JOIN public.customers c ON c.id = i.customer_id
  WHERE l.amount_pence > 0 AND i.business_id = l.business_id AND i.status = 'sent'
    AND i.net_pence + i.vat_pence = l.amount_pence
  UNION ALL
  SELECT 'transaction'::text, t.id, coalesce(t.counterparty, 'Recorded money')::text, t.txn_date,
         (CASE WHEN t.direction = 'in' THEN t.gross_pence ELSE -t.gross_pence END)::bigint
  FROM public.transactions t
  WHERE t.business_id = l.business_id AND t.voided_at IS NULL AND t.bank_account_id = l.bank_account_id
    AND (CASE WHEN t.direction = 'in' THEN t.gross_pence ELSE -t.gross_pence END) = l.amount_pence
    AND abs(t.txn_date - l.line_date) <= 7
    AND NOT EXISTS (SELECT 1 FROM public.bank_statement_lines u WHERE u.transaction_id = t.id)
  ORDER BY 1, 4 LIMIT 50;
END $$;
REVOKE ALL ON FUNCTION public.bank_match_candidates(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.bank_match_candidates(uuid) TO authenticated;