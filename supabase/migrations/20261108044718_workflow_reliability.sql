ALTER TABLE public.workflow_operations
  ADD COLUMN next_attempt_at timestamptz CHECK (next_attempt_at IS NULL OR isfinite(next_attempt_at));
CREATE INDEX workflow_operations_due_idx ON public.workflow_operations(workspace_id, next_attempt_at, created_at)
  WHERE status = 'queued';

CREATE TABLE public.operation_result_checkpoints (
  workspace_id uuid NOT NULL,
  operation_id uuid NOT NULL,
  input_fingerprint text NOT NULL CHECK (input_fingerprint ~ '^[a-f0-9]{64}$'),
  kind text NOT NULL,
  result jsonb NOT NULL CHECK (jsonb_typeof(result) = 'object' AND octet_length(result::text) <= 524288),
  metadata jsonb NOT NULL DEFAULT '{}' CHECK (jsonb_typeof(metadata) = 'object' AND octet_length(metadata::text) <= 16384),
  prompt_version text NOT NULL CHECK (length(prompt_version) BETWEEN 1 AND 120),
  schema_version text NOT NULL CHECK (length(schema_version) BETWEEN 1 AND 120),
  model text NOT NULL CHECK (length(model) BETWEEN 1 AND 120),
  created_attempt integer NOT NULL CHECK (created_attempt BETWEEN 1 AND 3),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (workspace_id, operation_id, input_fingerprint),
  FOREIGN KEY (workspace_id, operation_id) REFERENCES public.workflow_operations(workspace_id, id) ON DELETE CASCADE
);

CREATE TABLE public.workflow_provider_daily_budgets (
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  budget_date date NOT NULL,
  text_calls bigint NOT NULL DEFAULT 0 CHECK (text_calls >= 0),
  image_calls bigint NOT NULL DEFAULT 0 CHECK (image_calls >= 0),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (workspace_id, budget_date)
);
-- Old rows have no per-request dates. Charge their recorded calls once on the
-- cutover day rather than erasing history or inventing historical call times.
INSERT INTO public.workflow_provider_daily_budgets(workspace_id, budget_date, text_calls, image_calls)
  SELECT workspace_id, (clock_timestamp() AT TIME ZONE 'UTC')::date,
    coalesce(sum(provider_call_count) FILTER (WHERE kind NOT IN ('preview_image', 'saved_avatar', 'marketplace_search')), 0),
    coalesce(sum(provider_call_count) FILTER (WHERE kind IN ('preview_image', 'saved_avatar')), 0)
  FROM public.workflow_operations GROUP BY workspace_id;

CREATE TABLE public.workflow_worker_heartbeats (
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  worker_id uuid NOT NULL,
  last_seen_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  active_jobs integer NOT NULL CHECK (active_jobs BETWEEN 0 AND 4),
  version text NOT NULL CHECK (length(btrim(version)) BETWEEN 1 AND 120),
  PRIMARY KEY (workspace_id, worker_id)
);
CREATE INDEX workflow_worker_heartbeats_seen_idx ON public.workflow_worker_heartbeats(workspace_id, last_seen_at);

ALTER TABLE public.operation_result_checkpoints ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workflow_provider_daily_budgets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workflow_worker_heartbeats ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.operation_result_checkpoints, public.workflow_provider_daily_budgets,
  public.workflow_worker_heartbeats FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT, DELETE ON public.operation_result_checkpoints TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.workflow_provider_daily_budgets, public.workflow_worker_heartbeats TO service_role;

CREATE FUNCTION public.stylora_guard_result_checkpoint() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
BEGIN
  IF NEW IS DISTINCT FROM OLD THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'WORKFLOW_CHECKPOINT_IMMUTABLE';
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER operation_result_checkpoints_immutable BEFORE UPDATE ON public.operation_result_checkpoints
  FOR EACH ROW EXECUTE FUNCTION public.stylora_guard_result_checkpoint();

CREATE FUNCTION public.checkpoint_workflow_result(
  p_workspace_id uuid, p_operation_id uuid, p_attempt integer, p_input_fingerprint text,
  p_result jsonb, p_metadata jsonb DEFAULT '{}'
) RETURNS public.operation_result_checkpoints LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE op public.workflow_operations; saved public.operation_result_checkpoints;
BEGIN
  SELECT * INTO op FROM public.workflow_operations WHERE workspace_id = p_workspace_id AND id = p_operation_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'OPERATION_NOT_FOUND'; END IF;
  IF op.attempt_count IS DISTINCT FROM p_attempt OR op.input_fingerprint IS DISTINCT FROM p_input_fingerprint
    OR op.status NOT IN ('running', 'partial') OR op.lease_until <= clock_timestamp() OR op.cancel_requested_at IS NOT NULL THEN
    RAISE EXCEPTION USING ERRCODE = '40001', MESSAGE = 'WORKFLOW_CHECKPOINT_STALE';
  END IF;
  IF op.kind = 'marketplace_search' OR op.prompt_version IS NULL OR op.schema_version IS NULL OR op.model IS NULL
    OR p_result IS NULL OR jsonb_typeof(p_result) <> 'object' OR octet_length(p_result::text) > 524288
    OR p_metadata IS NULL OR jsonb_typeof(p_metadata) <> 'object' OR octet_length(p_metadata::text) > 16384 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'WORKFLOW_CHECKPOINT_INVALID';
  END IF;
  IF op.kind IN ('preview_image', 'saved_avatar') THEN
    IF NOT (p_result ?& ARRAY['assetId', 'renderFingerprint'])
      OR p_result - ARRAY['assetId', 'renderFingerprint'] <> '{}'::jsonb
      OR coalesce(p_result->>'renderFingerprint', '') !~ '^[a-f0-9]{64}$' THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'WORKFLOW_IMAGE_CHECKPOINT_INVALID';
    END IF;
    PERFORM 1 FROM public.assets WHERE workspace_id = p_workspace_id AND id = (p_result->>'assetId')::uuid
      AND bucket = 'previews' AND status IN ('pending', 'ready') AND mime_type = 'image/png' FOR SHARE;
    IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'WORKFLOW_IMAGE_CHECKPOINT_ASSET_INVALID'; END IF;
  END IF;
  SELECT * INTO saved FROM public.operation_result_checkpoints
    WHERE workspace_id = p_workspace_id AND operation_id = op.id AND input_fingerprint = p_input_fingerprint;
  IF FOUND THEN
    IF saved.result IS DISTINCT FROM p_result OR saved.metadata IS DISTINCT FROM p_metadata THEN
      RAISE EXCEPTION USING ERRCODE = '40001', MESSAGE = 'WORKFLOW_CHECKPOINT_MISMATCH';
    END IF;
    RETURN saved;
  END IF;
  INSERT INTO public.operation_result_checkpoints(workspace_id, operation_id, input_fingerprint, kind, result, metadata,
    prompt_version, schema_version, model, created_attempt)
    VALUES (p_workspace_id, op.id, op.input_fingerprint, op.kind, p_result, p_metadata,
      op.prompt_version, op.schema_version, op.model, op.attempt_count) RETURNING * INTO saved;
  RETURN saved;
END; $$;

CREATE FUNCTION public.reserve_workflow_provider_call(
  p_workspace_id uuid, p_operation_id uuid, p_attempt integer, p_input_fingerprint text,
  p_text_daily_limit integer DEFAULT 150, p_image_daily_limit integer DEFAULT 20
) RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE op public.workflow_operations; budget public.workflow_provider_daily_budgets; active_calls bigint; image_call boolean;
BEGIN
  IF p_text_daily_limit IS NULL OR p_text_daily_limit NOT BETWEEN 1 AND 100000
    OR p_image_daily_limit IS NULL OR p_image_daily_limit NOT BETWEEN 1 AND 10000 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'WORKFLOW_PROVIDER_LIMIT_INVALID';
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_workspace_id::text || ':create-provider-budget', 0));
  SELECT * INTO op FROM public.workflow_operations WHERE workspace_id = p_workspace_id AND id = p_operation_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'OPERATION_NOT_FOUND'; END IF;
  IF op.kind = 'marketplace_search' OR op.status NOT IN ('running', 'partial') OR op.attempt_count IS DISTINCT FROM p_attempt
    OR op.input_fingerprint IS DISTINCT FROM p_input_fingerprint OR op.lease_until <= clock_timestamp() OR op.cancel_requested_at IS NOT NULL THEN
    RAISE EXCEPTION USING ERRCODE = '40001', MESSAGE = 'OPERATION_STALE';
  END IF;
  IF public.stylora_subject_revision(p_workspace_id, op.subject_type, op.subject_id) IS DISTINCT FROM op.input_revision THEN
    RAISE EXCEPTION USING ERRCODE = '40001', MESSAGE = 'INPUT_SUPERSEDED';
  END IF;
  IF op.provider_call_count >= 3 THEN
    RAISE EXCEPTION USING ERRCODE = '54000', MESSAGE = 'PROVIDER_OPERATION_BUDGET_EXHAUSTED';
  END IF;
  image_call := op.kind IN ('preview_image', 'saved_avatar');
  INSERT INTO public.workflow_provider_daily_budgets(workspace_id, budget_date)
    VALUES (p_workspace_id, (clock_timestamp() AT TIME ZONE 'UTC')::date) ON CONFLICT DO NOTHING;
  SELECT * INTO budget FROM public.workflow_provider_daily_budgets
    WHERE workspace_id = p_workspace_id AND budget_date = (clock_timestamp() AT TIME ZONE 'UTC')::date FOR UPDATE;
  IF (image_call AND budget.image_calls >= p_image_daily_limit) OR (NOT image_call AND budget.text_calls >= p_text_daily_limit) THEN
    RAISE EXCEPTION USING ERRCODE = '54000', MESSAGE = 'PROVIDER_DAILY_BUDGET_EXHAUSTED';
  END IF;
  SELECT coalesce(sum(provider_inflight), 0) INTO active_calls FROM public.workflow_operations
    WHERE workspace_id = p_workspace_id AND status IN ('running', 'partial') AND lease_until > clock_timestamp()
      AND kind <> 'marketplace_search' AND (kind IN ('preview_image', 'saved_avatar')) = image_call;
  IF active_calls >= (CASE WHEN image_call THEN 1 ELSE 3 END) THEN
    RAISE EXCEPTION USING ERRCODE = '55P03', MESSAGE = 'PROVIDER_CAPACITY_BUSY';
  END IF;
  UPDATE public.workflow_provider_daily_budgets SET
    text_calls = text_calls + CASE WHEN image_call THEN 0 ELSE 1 END,
    image_calls = image_calls + CASE WHEN image_call THEN 1 ELSE 0 END, updated_at = clock_timestamp()
    WHERE workspace_id = p_workspace_id AND budget_date = budget.budget_date;
  UPDATE public.workflow_operations SET provider_call_count = provider_call_count + 1, provider_inflight = provider_inflight + 1
    WHERE workspace_id = p_workspace_id AND id = op.id;
END; $$;

CREATE FUNCTION public.release_workflow_provider_call(
  p_workspace_id uuid, p_operation_id uuid, p_attempt integer, p_input_fingerprint text
) RETURNS void LANGUAGE sql SECURITY INVOKER SET search_path = '' AS $$
  UPDATE public.workflow_operations SET provider_inflight = greatest(provider_inflight - 1, 0)
    WHERE workspace_id = p_workspace_id AND id = p_operation_id AND attempt_count = p_attempt AND input_fingerprint = p_input_fingerprint;
$$;
CREATE OR REPLACE FUNCTION public.reserve_create_provider_call(p_workspace_id uuid, p_operation_id uuid, p_attempt integer)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE op public.workflow_operations;
BEGIN
  SELECT * INTO op FROM public.workflow_operations WHERE workspace_id = p_workspace_id AND id = p_operation_id;
  IF NOT FOUND OR op.kind NOT IN ('inspiration_description', 'inspiration_confidence', 'wardrobe_match', 'outfit_options', 'option_regeneration') THEN
    RAISE EXCEPTION USING ERRCODE = '40001', MESSAGE = 'OPERATION_STALE';
  END IF;
  PERFORM public.reserve_workflow_provider_call(p_workspace_id, op.id, p_attempt, op.input_fingerprint);
END; $$;
CREATE OR REPLACE FUNCTION public.reserve_wardrobe_provider_call(p_workspace_id uuid, p_operation_id uuid, p_attempt integer)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE op public.workflow_operations;
BEGIN
  SELECT * INTO op FROM public.workflow_operations WHERE workspace_id = p_workspace_id AND id = p_operation_id;
  IF NOT FOUND OR op.kind <> 'wardrobe_description' THEN
    RAISE EXCEPTION USING ERRCODE = 'PT409', MESSAGE = 'WARDROBE_OPERATION_STALE';
  END IF;
  BEGIN
    PERFORM public.reserve_workflow_provider_call(p_workspace_id, op.id, p_attempt, op.input_fingerprint);
  EXCEPTION WHEN serialization_failure OR no_data_found THEN
    RAISE EXCEPTION USING ERRCODE = 'PT409', MESSAGE = 'WARDROBE_OPERATION_STALE';
  END;
END; $$;
CREATE OR REPLACE FUNCTION public.release_create_provider_call(p_workspace_id uuid, p_operation_id uuid, p_attempt integer)
RETURNS void LANGUAGE sql SECURITY INVOKER SET search_path = '' AS $$
  SELECT public.release_workflow_provider_call(p_workspace_id, p_operation_id, p_attempt, input_fingerprint)
    FROM public.workflow_operations WHERE workspace_id = p_workspace_id AND id = p_operation_id;
$$;

CREATE FUNCTION public.stylora_create_draft_active(p_workspace_id uuid, p_look_id uuid, p_draft_id uuid DEFAULT NULL)
RETURNS boolean LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE d public.workflow_drafts;
BEGIN
  SELECT * INTO d FROM public.workflow_drafts WHERE workspace_id = p_workspace_id AND look_id = p_look_id
    AND feature_kind = 'inspiration' AND (p_draft_id IS NULL OR id = p_draft_id)
    ORDER BY (status = 'active') DESC, id LIMIT 1 FOR SHARE;
  IF NOT FOUND THEN RETURN p_draft_id IS NULL; END IF;
  RETURN d.status = 'active';
END; $$;

DROP FUNCTION public.claim_workflow_operation(uuid, uuid, integer, integer);
CREATE FUNCTION public.claim_workflow_operation(
  p_workspace_id uuid, p_operation_id uuid, p_input_revision integer, p_lease_seconds integer DEFAULT 120,
  p_text_daily_limit integer DEFAULT 150, p_image_daily_limit integer DEFAULT 20
) RETURNS public.workflow_operations LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE op public.workflow_operations; revision integer; image_call boolean; active_count bigint;
  budget public.workflow_provider_daily_budgets; checkpoint_exists boolean;
BEGIN
  IF p_lease_seconds IS NULL OR p_lease_seconds NOT BETWEEN 1 AND 900
    OR p_text_daily_limit IS NULL OR p_text_daily_limit NOT BETWEEN 1 AND 100000
    OR p_image_daily_limit IS NULL OR p_image_daily_limit NOT BETWEEN 1 AND 10000 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'STYLORA_OPERATION_LEASE_INVALID';
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_workspace_id::text, 417));
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_workspace_id::text || ':create-provider-budget', 0));
  SELECT * INTO op FROM public.workflow_operations WHERE workspace_id = p_workspace_id AND id = p_operation_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'STYLORA_OPERATION_NOT_FOUND'; END IF;
  IF p_input_revision IS DISTINCT FROM op.input_revision THEN
    RAISE EXCEPTION USING ERRCODE = '40001', MESSAGE = 'STYLORA_OPERATION_REVISION_CONFLICT';
  END IF;
  IF op.status IN ('succeeded', 'failed', 'cancelled', 'superseded') THEN RETURN op; END IF;
  IF op.lease_until > clock_timestamp() OR op.next_attempt_at > clock_timestamp() THEN
    RAISE EXCEPTION USING ERRCODE = '55P03', MESSAGE = 'STYLORA_OPERATION_NOT_DUE';
  END IF;
  BEGIN
    revision := public.stylora_subject_revision(p_workspace_id, op.subject_type, op.subject_id);
  EXCEPTION WHEN no_data_found THEN revision := NULL;
  END;
  IF revision IS DISTINCT FROM op.input_revision OR op.cancel_requested_at IS NOT NULL OR op.attempt_count >= 3 THEN
    UPDATE public.workflow_operations SET
      status = CASE WHEN op.cancel_requested_at IS NOT NULL THEN 'cancelled' WHEN revision IS DISTINCT FROM op.input_revision THEN 'superseded' ELSE 'failed' END,
      lease_until = NULL, completed_at = clock_timestamp(), provider_inflight = 0, next_attempt_at = NULL,
      safe_error_code = CASE WHEN op.cancel_requested_at IS NOT NULL THEN NULL WHEN revision IS DISTINCT FROM op.input_revision THEN 'INPUT_SUPERSEDED' ELSE 'RETRY_BUDGET_EXHAUSTED' END
      WHERE workspace_id = p_workspace_id AND id = op.id RETURNING * INTO op;
    UPDATE public.saved_look_media SET status = 'failed' WHERE workspace_id = p_workspace_id AND operation_id = op.id;
    PERFORM public.stylora_record_operation_event(p_workspace_id, op.id, op.status);
    RETURN op;
  END IF;
  SELECT EXISTS (SELECT 1 FROM public.operation_result_checkpoints WHERE workspace_id = p_workspace_id
    AND operation_id = op.id AND input_fingerprint = op.input_fingerprint) INTO checkpoint_exists;
  image_call := op.kind IN ('preview_image', 'saved_avatar');
  IF op.kind <> 'marketplace_search' AND NOT checkpoint_exists THEN
    IF op.provider_call_count >= 3 THEN
      UPDATE public.workflow_operations SET status = 'failed', lease_until = NULL, completed_at = clock_timestamp(),
        provider_inflight = 0, next_attempt_at = NULL, safe_error_code = 'PROVIDER_OPERATION_BUDGET_EXHAUSTED'
        WHERE workspace_id = p_workspace_id AND id = op.id RETURNING * INTO op;
      PERFORM public.stylora_record_operation_event(p_workspace_id, op.id, 'failed');
      RETURN op;
    END IF;
    SELECT * INTO budget FROM public.workflow_provider_daily_budgets
      WHERE workspace_id = p_workspace_id AND budget_date = (clock_timestamp() AT TIME ZONE 'UTC')::date;
    IF (image_call AND coalesce(budget.image_calls, 0) >= p_image_daily_limit)
      OR (NOT image_call AND coalesce(budget.text_calls, 0) >= p_text_daily_limit) THEN
      RAISE EXCEPTION USING ERRCODE = '55P03', MESSAGE = 'PROVIDER_DAILY_BUDGET_EXHAUSTED';
    END IF;
  END IF;
  IF op.kind <> 'marketplace_search' THEN
    SELECT count(*) INTO active_count FROM public.workflow_operations WHERE workspace_id = p_workspace_id AND id <> op.id
      AND status IN ('running', 'partial') AND lease_until > clock_timestamp() AND kind <> 'marketplace_search'
      AND (kind IN ('preview_image', 'saved_avatar')) = image_call;
    IF active_count >= (CASE WHEN image_call THEN 1 ELSE 3 END) THEN
      RAISE EXCEPTION USING ERRCODE = '55P03', MESSAGE = 'PROVIDER_CAPACITY_BUSY';
    END IF;
  END IF;
  UPDATE public.workflow_operations SET status = 'running', attempt_count = attempt_count + 1,
    lease_until = clock_timestamp() + make_interval(secs => p_lease_seconds), provider_inflight = 0, next_attempt_at = NULL
    WHERE workspace_id = p_workspace_id AND id = op.id RETURNING * INTO op;
  PERFORM public.stylora_record_operation_event(p_workspace_id, op.id, 'started', jsonb_build_object('attemptCount', op.attempt_count));
  UPDATE public.saved_look_media SET status = 'running' WHERE workspace_id = p_workspace_id AND operation_id = op.id;
  RETURN op;
END; $$;

CREATE FUNCTION public.stylora_workflow_retryable_code(p_code text) RETURNS boolean
LANGUAGE sql IMMUTABLE STRICT SECURITY INVOKER SET search_path = '' AS $$
  SELECT p_code IN ('PROVIDER_TIMEOUT', 'PROVIDER_NETWORK_ERROR', 'PROVIDER_RATE_LIMITED', 'PROVIDER_SERVER_ERROR',
    'OPENAI_CONNECTION_FAILED', 'PROVIDER_CAPACITY_BUSY', 'PROVIDER_DAILY_BUDGET_EXHAUSTED',
    'WORKFLOW_CHECKPOINT_UNAVAILABLE', 'WORKFLOW_COMMIT_UNAVAILABLE', 'CHECKPOINT_UNAVAILABLE', 'CHECKPOINT_COMMIT_PENDING')
    OR p_code ~ '^OPENAI_HTTP_(429|500|502|503|504)$';
$$;
CREATE FUNCTION public.defer_workflow_operation(
  p_workspace_id uuid, p_operation_id uuid, p_attempt_count integer, p_input_fingerprint text,
  p_safe_error_code text, p_retry_after_seconds integer DEFAULT NULL
) RETURNS public.workflow_operations LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE op public.workflow_operations; revision integer; due_at timestamptz; checkpoint_exists boolean;
BEGIN
  IF NOT coalesce(public.stylora_workflow_retryable_code(p_safe_error_code), false)
    OR (p_retry_after_seconds IS NOT NULL AND p_retry_after_seconds NOT BETWEEN 0 AND 86400) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'STYLORA_OPERATION_RETRY_INELIGIBLE';
  END IF;
  SELECT * INTO op FROM public.workflow_operations WHERE workspace_id = p_workspace_id AND id = p_operation_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'STYLORA_OPERATION_NOT_FOUND'; END IF;
  IF op.attempt_count IS DISTINCT FROM p_attempt_count OR op.input_fingerprint IS DISTINCT FROM p_input_fingerprint THEN
    RAISE EXCEPTION USING ERRCODE = '40001', MESSAGE = 'STYLORA_OPERATION_ATTEMPT_CONFLICT';
  END IF;
  IF op.status = 'queued' AND op.next_attempt_at IS NOT NULL THEN RETURN op; END IF;
  IF op.status NOT IN ('running', 'partial', 'failed') OR op.cancel_requested_at IS NOT NULL
    OR (op.status IN ('running', 'partial') AND op.lease_until <= clock_timestamp())
    OR (op.status = 'failed' AND (op.safe_error_code IS DISTINCT FROM p_safe_error_code OR op.result_ref->>'retryable' IS DISTINCT FROM 'true'))
    OR op.attempt_count >= 3 THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'STYLORA_OPERATION_RETRY_INELIGIBLE';
  END IF;
  revision := public.stylora_subject_revision(p_workspace_id, op.subject_type, op.subject_id);
  IF revision IS DISTINCT FROM op.input_revision OR (op.input ? 'draftId'
    AND NOT public.stylora_create_draft_active(p_workspace_id, (op.input->>'lookId')::uuid, (op.input->>'draftId')::uuid)) THEN
    RAISE EXCEPTION USING ERRCODE = '40001', MESSAGE = 'STYLORA_OPERATION_REVISION_CONFLICT';
  END IF;
  SELECT EXISTS (SELECT 1 FROM public.operation_result_checkpoints WHERE workspace_id = p_workspace_id
    AND operation_id = op.id AND input_fingerprint = op.input_fingerprint) INTO checkpoint_exists;
  IF p_safe_error_code = 'CHECKPOINT_COMMIT_PENDING' AND NOT checkpoint_exists THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'STYLORA_OPERATION_RETRY_INELIGIBLE';
  END IF;
  IF op.provider_call_count >= 3 AND NOT checkpoint_exists THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'STYLORA_OPERATION_RETRY_INELIGIBLE';
  END IF;
  due_at := clock_timestamp() + make_interval(secs => greatest(coalesce(p_retry_after_seconds, 0),
    (power(2, op.attempt_count) * 2 + floor(random() * 3))::integer));
  IF op.result_ref ? 'retryAfter' THEN due_at := greatest(due_at, (op.result_ref->>'retryAfter')::timestamptz); END IF;
  IF p_safe_error_code = 'PROVIDER_DAILY_BUDGET_EXHAUSTED' THEN
    due_at := greatest(due_at, (date_trunc('day', clock_timestamp() AT TIME ZONE 'UTC') + interval '1 day') AT TIME ZONE 'UTC');
  END IF;
  UPDATE public.workflow_operations SET status = 'queued', lease_until = NULL, completed_at = NULL, provider_inflight = 0,
    next_attempt_at = due_at, safe_error_code = p_safe_error_code,
    result_ref = coalesce(result_ref, '{}') || jsonb_build_object('retryable', true, 'retryAfter', due_at)
    WHERE workspace_id = p_workspace_id AND id = op.id RETURNING * INTO op;
  UPDATE public.saved_look_media SET status = 'queued' WHERE workspace_id = p_workspace_id AND operation_id = op.id;
  RETURN op;
END; $$;

CREATE OR REPLACE FUNCTION public.retry_workflow_operation(p_workspace_id uuid, p_operation_id uuid)
RETURNS public.workflow_operations LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE op public.workflow_operations;
BEGIN
  SELECT * INTO op FROM public.workflow_operations WHERE workspace_id = p_workspace_id AND id = p_operation_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'STYLORA_OPERATION_NOT_FOUND'; END IF;
  IF op.status <> 'failed' OR op.attempt_count >= 3 OR op.cancel_requested_at IS NOT NULL
    OR coalesce(op.result_ref->'retryable' = 'false'::jsonb, false) OR NOT coalesce(public.stylora_workflow_retryable_code(op.safe_error_code), false)
    OR (op.safe_error_code = 'CHECKPOINT_COMMIT_PENDING' AND NOT EXISTS (SELECT 1 FROM public.operation_result_checkpoints
      WHERE workspace_id = p_workspace_id AND operation_id = op.id AND input_fingerprint = op.input_fingerprint))
    OR (op.provider_call_count >= 3 AND NOT EXISTS (SELECT 1 FROM public.operation_result_checkpoints
      WHERE workspace_id = p_workspace_id AND operation_id = op.id AND input_fingerprint = op.input_fingerprint)) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'STYLORA_OPERATION_RETRY_INELIGIBLE';
  END IF;
  IF public.stylora_subject_revision(p_workspace_id, op.subject_type, op.subject_id) IS DISTINCT FROM op.input_revision
    OR (op.input ? 'draftId' AND NOT public.stylora_create_draft_active(p_workspace_id, (op.input->>'lookId')::uuid, (op.input->>'draftId')::uuid)) THEN
    RAISE EXCEPTION USING ERRCODE = '40001', MESSAGE = 'STYLORA_OPERATION_REVISION_CONFLICT';
  END IF;
  IF greatest(op.next_attempt_at, (op.result_ref->>'retryAfter')::timestamptz) > clock_timestamp() THEN
    RAISE EXCEPTION USING ERRCODE = '55P03', MESSAGE = 'STYLORA_OPERATION_RETRY_BACKOFF';
  END IF;
  UPDATE public.workflow_operations SET status = 'queued', completed_at = NULL, lease_until = NULL, provider_inflight = 0,
    next_attempt_at = NULL, safe_error_code = NULL, result_ref = NULL
    WHERE workspace_id = p_workspace_id AND id = op.id RETURNING * INTO op;
  UPDATE public.saved_look_media SET status = 'queued' WHERE workspace_id = p_workspace_id AND operation_id = op.id;
  RETURN op;
END; $$;

CREATE OR REPLACE FUNCTION public.control_create_operation(p_workspace_id uuid, p_operation_id uuid, p_action text)
RETURNS public.workflow_operations LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE op public.workflow_operations;
BEGIN
  SELECT * INTO op FROM public.workflow_operations WHERE workspace_id = p_workspace_id AND id = p_operation_id FOR UPDATE;
  IF NOT FOUND OR op.kind NOT IN ('inspiration_description', 'inspiration_confidence', 'wardrobe_match', 'outfit_options', 'option_regeneration') THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'OPERATION_NOT_FOUND';
  END IF;
  IF p_action = 'retry' THEN RETURN public.retry_workflow_operation(p_workspace_id, p_operation_id);
  ELSIF p_action = 'cancel' THEN RETURN public.cancel_workflow_operation(p_workspace_id, p_operation_id);
  ELSE RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'OPERATION_ACTION_INVALID'; END IF;
END; $$;
CREATE OR REPLACE FUNCTION public.retry_wardrobe_description(p_workspace_id uuid, p_operation_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.workflow_operations WHERE workspace_id = p_workspace_id AND id = p_operation_id AND kind = 'wardrobe_description') THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'WARDROBE_OPERATION_NOT_FOUND';
  END IF;
  PERFORM public.retry_workflow_operation(p_workspace_id, p_operation_id);
END; $$;

CREATE FUNCTION public.record_workflow_worker_heartbeat(p_workspace_id uuid, p_worker_id uuid, p_active_jobs integer, p_version text)
RETURNS public.workflow_worker_heartbeats LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE heartbeat public.workflow_worker_heartbeats;
BEGIN
  INSERT INTO public.workflow_worker_heartbeats(workspace_id, worker_id, active_jobs, version)
    VALUES (p_workspace_id, p_worker_id, p_active_jobs, p_version)
    ON CONFLICT (workspace_id, worker_id) DO UPDATE SET last_seen_at = clock_timestamp(), active_jobs = excluded.active_jobs, version = excluded.version
    RETURNING * INTO heartbeat;
  RETURN heartbeat;
END; $$;

REVOKE ALL ON FUNCTION public.stylora_guard_result_checkpoint() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.checkpoint_workflow_result(uuid,uuid,integer,text,jsonb,jsonb),
  public.reserve_workflow_provider_call(uuid,uuid,integer,text,integer,integer), public.release_workflow_provider_call(uuid,uuid,integer,text),
  public.stylora_create_draft_active(uuid,uuid,uuid), public.claim_workflow_operation(uuid,uuid,integer,integer,integer,integer),
  public.stylora_workflow_retryable_code(text), public.defer_workflow_operation(uuid,uuid,integer,text,text,integer),
  public.record_workflow_worker_heartbeat(uuid,uuid,integer,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.checkpoint_workflow_result(uuid,uuid,integer,text,jsonb,jsonb),
  public.reserve_workflow_provider_call(uuid,uuid,integer,text,integer,integer), public.release_workflow_provider_call(uuid,uuid,integer,text),
  public.stylora_create_draft_active(uuid,uuid,uuid), public.claim_workflow_operation(uuid,uuid,integer,integer,integer,integer),
  public.stylora_workflow_retryable_code(text), public.defer_workflow_operation(uuid,uuid,integer,text,text,integer),
  public.record_workflow_worker_heartbeat(uuid,uuid,integer,text) TO service_role;
CREATE OR REPLACE FUNCTION public.finish_create_operation(p_workspace_id uuid,p_operation_id uuid,p_attempt integer,p_result jsonb,p_metadata jsonb)
RETURNS public.workflow_operations LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE op public.workflow_operations; l public.looks; item jsonb; opt jsonb; slot jsonb; option_id uuid; current_preferences jsonb; inventory_state jsonb; seq bigint; v_look_id uuid; stale boolean:=false; checkpoint public.operation_result_checkpoints;
BEGIN
 SELECT * INTO op FROM public.workflow_operations WHERE workspace_id=p_workspace_id AND id=p_operation_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='P0002',MESSAGE='OPERATION_NOT_FOUND'; END IF;
 IF op.attempt_count IS DISTINCT FROM p_attempt OR op.status NOT IN ('running','partial') OR op.lease_until<=clock_timestamp() THEN RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='OPERATION_STALE'; END IF;
 v_look_id := (op.input->>'lookId')::uuid;
 stale := NOT public.stylora_create_draft_active(p_workspace_id, v_look_id, (op.input->>'draftId')::uuid);
 SELECT * INTO checkpoint FROM public.operation_result_checkpoints
  WHERE workspace_id=p_workspace_id AND operation_id=op.id AND input_fingerprint=op.input_fingerprint;
 IF FOUND AND (checkpoint.result IS DISTINCT FROM p_result OR checkpoint.metadata IS DISTINCT FROM p_metadata) THEN
  RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='WORKFLOW_CHECKPOINT_MISMATCH';
 END IF;
 SELECT * INTO l FROM public.looks WHERE workspace_id=p_workspace_id AND id=v_look_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='P0002',MESSAGE='LOOK_NOT_FOUND'; END IF;
 stale := stale OR l.revision<>(op.input->>'lookRevision')::integer OR op.cancel_requested_at IS NOT NULL;
 IF op.input ? 'preferenceData' THEN
  SELECT jsonb_build_object('styleDna',style_dna,'fitPreferences',fit_preferences,'bodyProfile',body_profile) INTO current_preferences FROM public.user_preferences WHERE workspace_id=p_workspace_id FOR SHARE;
  stale := stale OR current_preferences IS DISTINCT FROM op.input->'preferenceData';
 END IF;
 IF op.input ? 'inventoryState' THEN
  SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'revision',revision) ORDER BY id),'[]') INTO inventory_state FROM public.wardrobe_items WHERE workspace_id=p_workspace_id AND (op.input->>'inventoryMode'='combined' OR (inventory_status='owned' AND archived_at IS NULL AND ((op.input->>'inventoryMode'='sample' AND source_type='sample') OR (op.input->>'inventoryMode'='live' AND source_type<>'sample'))));
  stale := stale OR inventory_state IS DISTINCT FROM op.input->'inventoryState';
 END IF;
 IF op.kind='option_regeneration' THEN
  PERFORM 1 FROM public.outfit_options WHERE workspace_id=p_workspace_id AND look_id=v_look_id AND id=op.subject_id AND revision=op.input_revision AND is_current FOR UPDATE;
  stale := stale OR NOT FOUND;
 END IF;
 IF stale THEN
  UPDATE public.workflow_operations SET status=CASE WHEN cancel_requested_at IS NULL THEN 'superseded' ELSE 'cancelled' END,lease_until=NULL,completed_at=clock_timestamp(),provider_inflight=0,next_attempt_at=NULL,safe_error_code='INPUT_SUPERSEDED' WHERE workspace_id=p_workspace_id AND id=op.id RETURNING * INTO op;
 ELSE
  IF op.kind='inspiration_description' THEN
   UPDATE public.inspiration_pieces SET removed_at=clock_timestamp() WHERE workspace_id=p_workspace_id AND look_id=l.id AND removed_at IS NULL;
   UPDATE public.wardrobe_matches SET is_current=false WHERE workspace_id=p_workspace_id AND look_id=l.id;
   UPDATE public.outfit_options SET is_current=false WHERE workspace_id=p_workspace_id AND look_id=l.id;
   FOR item IN SELECT value FROM jsonb_array_elements(p_result->'pieces') LOOP
    INSERT INTO public.inspiration_pieces(id,workspace_id,look_id,name,category,subcategory,description,attributes,provenance,uncertainty,confidence,source_type,position)
    VALUES((item->>'id')::uuid,p_workspace_id,l.id,item->>'name',item->>'category',item->>'subcategory',item->>'description',item->'attributes',item->'provenance',item->'uncertainty',(item->>'confidence')::numeric,'live',(item->>'position')::integer);
   END LOOP;
   UPDATE public.looks SET status=CASE WHEN status='draft' THEN 'analyzed' ELSE status END,provider_metadata=provider_metadata || jsonb_build_object('description',p_metadata) WHERE workspace_id=p_workspace_id AND id=l.id;
  ELSIF op.kind='inspiration_confidence' THEN
   UPDATE public.look_reviews SET is_current=false WHERE workspace_id=p_workspace_id AND look_id=l.id;
   INSERT INTO public.look_reviews(workspace_id,look_id,source_revision,preference_revision,explanation,inputs_used,uncertainty,input_metadata) VALUES(p_workspace_id,l.id,l.revision,NULL,p_result,jsonb_build_object('keys',p_result->'explanation'->'inputsUsed'),coalesce(p_result->'explanation'->'uncertainty','[]'),p_metadata);
  ELSIF op.kind='wardrobe_match' THEN
   UPDATE public.wardrobe_matches SET is_current=false WHERE workspace_id=p_workspace_id AND look_id=l.id;
   FOR item IN SELECT value FROM jsonb_array_elements(p_result->'matches') LOOP
    INSERT INTO public.wardrobe_matches(workspace_id,look_id,piece_id,wardrobe_item_id,match_type,rationale,shared_attributes,differences,rejected_candidates,evidence_coverage,confidence,source_revision,source_type,explanation,input_metadata)
    VALUES(p_workspace_id,l.id,(item->>'pieceId')::uuid,(item->>'wardrobeItemId')::uuid,item->>'outcome',item->'explanation'->>'summary',jsonb_build_object('values',item->'sharedAttributes'),jsonb_build_object('values',item->'differences'),item->'rejectedCandidates',(item->>'evidenceCoverage')::numeric,(item->>'score')::numeric,l.revision,item->>'sourceType',item->'explanation',p_metadata);
   END LOOP;
   UPDATE public.looks SET status='matched' WHERE workspace_id=p_workspace_id AND id=l.id;
  ELSIF op.kind IN ('outfit_options','option_regeneration') THEN
   FOR opt IN SELECT value FROM jsonb_array_elements(p_result->'options') LOOP
    UPDATE public.outfit_options SET is_current=false,status='unavailable' WHERE workspace_id=p_workspace_id AND look_id=l.id AND option_type=opt->>'optionType' AND is_current;
    INSERT INTO public.outfit_options(workspace_id,look_id,option_type,title,concept,rationale,explanation,inputs_used,uncertainty,status,source_revision,provider_metadata,source_type)
    VALUES(p_workspace_id,l.id,opt->>'optionType',opt->>'title',opt->>'concept',opt->'explanation'->>'summary',opt->'explanation',jsonb_build_object('keys',opt->'explanation'->'inputsUsed'),opt->'explanation'->'uncertainty',opt->>'status',l.revision,p_metadata,coalesce(opt->>'sourceType','live')) RETURNING id INTO option_id;
    FOR slot IN SELECT value FROM jsonb_array_elements(opt->'items') LOOP
     INSERT INTO public.outfit_option_items(workspace_id,look_id,option_id,slot_id,category,item_kind,piece_id,wardrobe_item_id,missing_brief,rationale,position)
     VALUES(p_workspace_id,l.id,option_id,slot->>'slotId',slot->>'category',slot->>'itemKind',(slot->>'pieceId')::uuid,(slot->>'wardrobeItemId')::uuid,nullif(slot->'missingBrief','null'::jsonb),slot->>'rationale',coalesce((slot->>'position')::integer,0));
    END LOOP;
   END LOOP;
   UPDATE public.looks SET status='options_ready' WHERE workspace_id=p_workspace_id AND id=l.id;
  ELSE RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='OPERATION_KIND_INVALID'; END IF;
  UPDATE public.workflow_operations SET status='succeeded',lease_until=NULL,completed_at=clock_timestamp(),provider_inflight=0,next_attempt_at=NULL,provider_request_id=p_metadata->>'requestId',result_ref=jsonb_build_object('lookId',l.id,'sourceRevision',l.revision,'metadata',p_metadata) WHERE workspace_id=p_workspace_id AND id=op.id RETURNING * INTO op;
 END IF;
 SELECT coalesce(max(sequence),0)+1 INTO seq FROM public.workflow_operation_events WHERE workspace_id=p_workspace_id AND operation_id=op.id;
 INSERT INTO public.workflow_operation_events(workspace_id,operation_id,sequence,source_revision,event_type,payload) VALUES(p_workspace_id,op.id,seq,op.input_revision,CASE WHEN op.status='succeeded' THEN 'completed' ELSE op.status END,coalesce(op.result_ref,'{}'));
 RETURN op;
END; $$;

CREATE OR REPLACE FUNCTION public.finish_workflow_operation(
  p_workspace_id uuid, p_operation_id uuid, p_attempt_count integer, p_input_fingerprint text,
  p_status text, p_result_ref jsonb DEFAULT NULL, p_safe_error_code text DEFAULT NULL
) RETURNS public.workflow_operations LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE v_operation public.workflow_operations; v_revision integer; v_status text := p_status; v_code text := p_safe_error_code;
  v_retry_after timestamptz;
BEGIN
  IF p_status IS NULL OR p_status NOT IN ('succeeded', 'failed') THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'STYLORA_OPERATION_STATUS_INVALID';
  END IF;
  SELECT * INTO v_operation FROM public.workflow_operations WHERE workspace_id = p_workspace_id AND id = p_operation_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'STYLORA_OPERATION_NOT_FOUND'; END IF;
  IF p_attempt_count IS DISTINCT FROM v_operation.attempt_count OR p_input_fingerprint IS DISTINCT FROM v_operation.input_fingerprint THEN
    RAISE EXCEPTION USING ERRCODE = '40001', MESSAGE = 'STYLORA_OPERATION_ATTEMPT_CONFLICT';
  END IF;
  IF v_operation.status IN ('succeeded', 'failed', 'cancelled', 'superseded') THEN RETURN v_operation; END IF;
  IF v_operation.status NOT IN ('running', 'partial') OR v_operation.lease_until <= clock_timestamp() THEN
    RAISE EXCEPTION USING ERRCODE = '40001', MESSAGE = 'STYLORA_OPERATION_LEASE_EXPIRED';
  END IF;
  BEGIN
    v_revision := public.stylora_subject_revision(p_workspace_id, v_operation.subject_type, v_operation.subject_id);
  EXCEPTION WHEN no_data_found THEN v_revision := NULL;
  END;
  IF v_revision IS DISTINCT FROM v_operation.input_revision THEN v_status := 'superseded'; v_code := 'INPUT_SUPERSEDED'; END IF;
  IF v_operation.cancel_requested_at IS NOT NULL THEN v_status := 'cancelled'; v_code := NULL; END IF;
  IF v_status = 'failed' AND (v_code IS NULL OR v_code !~ '^[A-Z][A-Z0-9_]{0,119}$') THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'STYLORA_OPERATION_ERROR_CODE_INVALID';
  END IF;
  IF v_status = 'failed' AND p_result_ref ? 'retryAfter' THEN
    v_retry_after := (p_result_ref ->> 'retryAfter')::timestamptz;
    IF v_retry_after IS NULL OR NOT isfinite(v_retry_after) THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'STYLORA_RETRY_AFTER_INVALID';
    END IF;
  END IF;
  IF v_status = 'failed' AND p_result_ref ? 'retryable' AND jsonb_typeof(p_result_ref -> 'retryable') <> 'boolean' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'STYLORA_RETRYABLE_INVALID';
  END IF;
  UPDATE public.workflow_operations SET status = v_status, lease_until = NULL, completed_at = clock_timestamp(), provider_inflight = 0, next_attempt_at = NULL,
    result_ref = CASE WHEN v_status = 'succeeded' THEN p_result_ref
      WHEN v_status = 'failed' THEN
        CASE WHEN p_result_ref ? 'retryable' THEN jsonb_build_object('retryable', p_result_ref -> 'retryable') ELSE '{}'::jsonb END
        || CASE WHEN v_retry_after IS NOT NULL THEN jsonb_build_object('retryAfter', v_retry_after) ELSE '{}'::jsonb END
        || CASE WHEN EXISTS (SELECT 1 FROM public.operation_result_checkpoints c WHERE c.workspace_id = p_workspace_id
          AND c.operation_id = p_operation_id AND c.input_fingerprint = p_input_fingerprint)
          THEN jsonb_build_object('checkpointed', true) ELSE '{}'::jsonb END
      ELSE NULL END,
    safe_error_code = CASE WHEN v_status = 'succeeded' THEN NULL ELSE v_code END
    WHERE workspace_id = p_workspace_id AND id = p_operation_id RETURNING * INTO v_operation;
  IF v_status <> 'succeeded' THEN
    UPDATE public.saved_look_media SET status = 'failed' WHERE workspace_id = p_workspace_id AND operation_id = p_operation_id;
  END IF;
  PERFORM public.stylora_record_operation_event(p_workspace_id, p_operation_id,
    CASE WHEN v_status = 'succeeded' THEN 'completed' ELSE v_status END,
    jsonb_build_object('attemptCount', v_operation.attempt_count, 'resultRef', v_operation.result_ref, 'safeErrorCode', v_operation.safe_error_code));
  RETURN v_operation;
END;
$$;


CREATE OR REPLACE FUNCTION public.stylora_guard_option_item() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE v_type text; v_combined boolean; v_current boolean; v_status text;
BEGIN
  SELECT o.option_type, coalesce(o.provider_metadata->>'inventoryMode'='combined',false), o.is_current, o.status INTO v_type,v_combined,v_current,v_status FROM public.outfit_options o
    WHERE o.workspace_id = NEW.workspace_id AND o.look_id = NEW.look_id AND o.id = NEW.option_id
    FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = '23503', MESSAGE = 'STYLORA_OPTION_PARENT_NOT_FOUND';
  END IF;
  IF v_type = 'from_wardrobe' AND NEW.item_kind <> 'owned' AND NOT (TG_OP = 'UPDATE' AND NOT v_current AND v_status = 'unavailable' AND OLD.item_kind = 'owned' AND NEW.item_kind = 'missing' AND NEW.wardrobe_item_id IS NULL) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'STYLORA_OWNED_ONLY_OPTION';
  END IF;
  IF NEW.item_kind = 'owned' AND NOT EXISTS (
    SELECT 1 FROM public.wardrobe_items w WHERE w.workspace_id = NEW.workspace_id
      AND w.id = NEW.wardrobe_item_id AND w.inventory_status = 'owned' AND (v_combined OR w.archived_at IS NULL)
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'STYLORA_OWNED_ITEM_REQUIRED';
  END IF;
  IF EXISTS (SELECT 1 FROM public.outfit_option_items i WHERE i.workspace_id = NEW.workspace_id
    AND i.option_id = NEW.option_id AND i.slot_id = NEW.slot_id AND i.id <> NEW.id
    AND (i.category <> NEW.category OR i.position <> NEW.position)) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'STYLORA_SLOT_CONTRACT_MISMATCH';
  END IF;
  RETURN NEW;
END;
$$;

