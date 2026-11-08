ALTER TABLE public.workflow_provider_daily_budgets
  ADD COLUMN search_calls bigint NOT NULL DEFAULT 0 CHECK (search_calls >= 0);
ALTER TABLE public.shopping_searches
  ADD COLUMN provider_call_count integer NOT NULL DEFAULT 0 CHECK (provider_call_count BETWEEN 0 AND 3);

CREATE FUNCTION public.reserve_shopping_provider_call(
  p_workspace_id uuid, p_search_id uuid, p_daily_limit integer DEFAULT 100
) RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE search public.shopping_searches; budget public.workflow_provider_daily_budgets;
  budget_day date := (clock_timestamp() AT TIME ZONE 'UTC')::date;
BEGIN
  IF p_daily_limit IS NULL OR p_daily_limit NOT BETWEEN 1 AND 100000 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'SHOPPING_PROVIDER_LIMIT_INVALID';
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_workspace_id::text || ':create-provider-budget', 0));
  SELECT * INTO search FROM public.shopping_searches
    WHERE workspace_id = p_workspace_id AND id = p_search_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'SHOPPING_SEARCH_NOT_FOUND'; END IF;
  IF search.status <> 'running' THEN
    RAISE EXCEPTION USING ERRCODE = '40001', MESSAGE = 'SHOPPING_SEARCH_STALE';
  END IF;
  PERFORM 1 FROM public.outfit_options WHERE workspace_id = p_workspace_id AND look_id = search.look_id
    AND id = search.option_id AND revision = search.option_revision AND is_current FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE = '40001', MESSAGE = 'SHOPPING_SEARCH_STALE'; END IF;
  IF search.provider_call_count >= 3 THEN
    RAISE EXCEPTION USING ERRCODE = '54000', MESSAGE = 'SHOPPING_SEARCH_BUDGET_EXHAUSTED';
  END IF;
  INSERT INTO public.workflow_provider_daily_budgets(workspace_id, budget_date)
    VALUES (p_workspace_id, budget_day) ON CONFLICT DO NOTHING;
  SELECT * INTO budget FROM public.workflow_provider_daily_budgets
    WHERE workspace_id = p_workspace_id AND budget_date = budget_day FOR UPDATE;
  IF budget.search_calls >= p_daily_limit THEN
    RAISE EXCEPTION USING ERRCODE = '54000', MESSAGE = 'SHOPPING_DAILY_BUDGET_EXHAUSTED';
  END IF;
  UPDATE public.workflow_provider_daily_budgets SET search_calls = search_calls + 1, updated_at = clock_timestamp()
    WHERE workspace_id = p_workspace_id AND budget_date = budget_day;
  UPDATE public.shopping_searches SET provider_call_count = provider_call_count + 1
    WHERE workspace_id = p_workspace_id AND id = search.id;
END; $$;

REVOKE ALL ON FUNCTION public.reserve_shopping_provider_call(uuid,uuid,integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_shopping_provider_call(uuid,uuid,integer) TO service_role;
