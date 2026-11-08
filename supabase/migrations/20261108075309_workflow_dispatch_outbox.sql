CREATE SCHEMA IF NOT EXISTS stylora_private;
REVOKE ALL ON SCHEMA stylora_private FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA stylora_private TO service_role;
CREATE TABLE public.workflow_dispatch_outbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL,
  operation_id uuid NOT NULL,
  dispatch_generation bigint NOT NULL CHECK (dispatch_generation > 0),
  is_current boolean NOT NULL DEFAULT true,
  state text NOT NULL DEFAULT 'pending' CHECK (state IN ('pending', 'leased', 'published')),
  due_at timestamptz NOT NULL CHECK (isfinite(due_at)),
  lease_token uuid,
  lease_until timestamptz,
  attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count BETWEEN 0 AND 32),
  last_error_code text CHECK (last_error_code ~ '^[A-Z][A-Z0-9_]{0,79}$'),
  published_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (workspace_id, id),
  UNIQUE (workspace_id, operation_id, dispatch_generation),
  FOREIGN KEY (workspace_id, operation_id) REFERENCES public.workflow_operations(workspace_id, id) ON DELETE CASCADE,
  CHECK ((state = 'leased') = (lease_until IS NOT NULL)),
  CHECK (state <> 'leased' OR lease_token IS NOT NULL),
  CHECK ((state = 'published') = (published_at IS NOT NULL))
);
CREATE UNIQUE INDEX workflow_dispatch_current_idx ON public.workflow_dispatch_outbox(workspace_id, operation_id) WHERE is_current;
CREATE INDEX workflow_dispatch_due_idx ON public.workflow_dispatch_outbox(workspace_id, due_at, id)
  WHERE is_current AND state IN ('pending', 'leased');
CREATE INDEX workflow_dispatch_published_idx ON public.workflow_dispatch_outbox(workspace_id, published_at)
  WHERE is_current AND state = 'published';
ALTER TABLE public.workflow_dispatch_outbox ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.workflow_dispatch_outbox FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.workflow_dispatch_outbox TO service_role;
CREATE TRIGGER workflow_dispatch_touch BEFORE UPDATE ON public.workflow_dispatch_outbox
  FOR EACH ROW EXECUTE FUNCTION public.stylora_touch_updated_at();

CREATE FUNCTION stylora_private.workflow_dispatch_due(p_operation public.workflow_operations)
RETURNS timestamptz LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE retry_after timestamptz;
BEGIN
  IF p_operation.kind = 'marketplace_search' THEN RETURN NULL; END IF;
  IF p_operation.status = 'queued' THEN
    RETURN greatest(coalesce(p_operation.next_attempt_at, clock_timestamp()), clock_timestamp());
  END IF;
  IF p_operation.status IN ('running', 'partial') THEN RETURN p_operation.lease_until; END IF;
  IF p_operation.status <> 'failed' OR p_operation.cancel_requested_at IS NOT NULL OR p_operation.attempt_count >= 3
    OR p_operation.result_ref->>'retryable' IS DISTINCT FROM 'true'
    OR NOT coalesce(public.stylora_workflow_retryable_code(p_operation.safe_error_code), false) THEN RETURN NULL; END IF;
  IF p_operation.provider_call_count >= 3 AND NOT EXISTS (
    SELECT 1 FROM public.operation_result_checkpoints WHERE workspace_id = p_operation.workspace_id
      AND operation_id = p_operation.id AND input_fingerprint = p_operation.input_fingerprint
  ) THEN RETURN NULL; END IF;
  BEGIN
    retry_after := (p_operation.result_ref->>'retryAfter')::timestamptz;
    IF retry_after IS NOT NULL AND NOT isfinite(retry_after) THEN RETURN NULL; END IF;
  EXCEPTION WHEN invalid_datetime_format OR datetime_field_overflow THEN RETURN NULL;
  END;
  RETURN greatest(coalesce(p_operation.next_attempt_at, p_operation.updated_at), coalesce(retry_after, p_operation.updated_at), clock_timestamp());
END; $$;

CREATE FUNCTION public.stylora_enqueue_workflow_dispatch(p_workspace_id uuid, p_operation_id uuid, p_force boolean DEFAULT false)
RETURNS uuid LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE op public.workflow_operations; existing public.workflow_dispatch_outbox; next_generation bigint; due timestamptz; dispatch_id uuid;
BEGIN
  SELECT * INTO op FROM public.workflow_operations WHERE workspace_id = p_workspace_id AND id = p_operation_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'DISPATCH_OPERATION_NOT_FOUND'; END IF;
  due := stylora_private.workflow_dispatch_due(op);
  SELECT * INTO existing FROM public.workflow_dispatch_outbox WHERE workspace_id = p_workspace_id AND operation_id = op.id AND is_current FOR UPDATE;
  IF due IS NULL THEN
    UPDATE public.workflow_dispatch_outbox SET is_current = false WHERE workspace_id = p_workspace_id AND operation_id = op.id AND is_current;
    RETURN NULL;
  END IF;
  IF existing.id IS NOT NULL AND NOT p_force AND NOT (
    existing.state = 'published' AND existing.published_at <= clock_timestamp() - interval '7 days'
  ) THEN RETURN existing.id; END IF;
  UPDATE public.workflow_dispatch_outbox SET is_current = false WHERE workspace_id = p_workspace_id AND operation_id = op.id AND is_current;
  SELECT coalesce(max(dispatch_generation), 0) + 1 INTO next_generation FROM public.workflow_dispatch_outbox
    WHERE workspace_id = p_workspace_id AND operation_id = op.id;
  INSERT INTO public.workflow_dispatch_outbox(workspace_id, operation_id, dispatch_generation, due_at)
    VALUES (p_workspace_id, op.id, next_generation, due) RETURNING id INTO dispatch_id;
  RETURN dispatch_id;
END; $$;

CREATE FUNCTION public.stylora_schedule_workflow_dispatch() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.status = 'queued' AND OLD.status = 'queued' AND NEW.next_attempt_at IS NOT DISTINCT FROM OLD.next_attempt_at THEN RETURN NEW; END IF;
    IF NEW.status IN ('running', 'partial') AND OLD.status IN ('running', 'partial') AND NEW.lease_until IS NOT DISTINCT FROM OLD.lease_until THEN RETURN NEW; END IF;
    IF NEW.status = 'failed' AND OLD.status = 'failed'
      AND NEW.safe_error_code IS NOT DISTINCT FROM OLD.safe_error_code
      AND NEW.attempt_count IS NOT DISTINCT FROM OLD.attempt_count
      AND NEW.provider_call_count IS NOT DISTINCT FROM OLD.provider_call_count
      AND NEW.cancel_requested_at IS NOT DISTINCT FROM OLD.cancel_requested_at
      AND NEW.next_attempt_at IS NOT DISTINCT FROM OLD.next_attempt_at
      AND NEW.result_ref->'retryable' IS NOT DISTINCT FROM OLD.result_ref->'retryable'
      AND NEW.result_ref->'retryAfter' IS NOT DISTINCT FROM OLD.result_ref->'retryAfter' THEN RETURN NEW; END IF;
    IF NEW.status IN ('succeeded', 'cancelled', 'superseded') AND NEW.status = OLD.status THEN RETURN NEW; END IF;
  END IF;
  PERFORM public.stylora_enqueue_workflow_dispatch(NEW.workspace_id, NEW.id, true);
  RETURN NEW;
END; $$;
CREATE TRIGGER workflow_operations_dispatch AFTER INSERT OR UPDATE OF status, lease_until, next_attempt_at,
  result_ref, safe_error_code, attempt_count, provider_call_count, cancel_requested_at ON public.workflow_operations
  FOR EACH ROW EXECUTE FUNCTION public.stylora_schedule_workflow_dispatch();

CREATE FUNCTION public.claim_workflow_dispatches(p_workspace_id uuid, p_limit integer DEFAULT 10, p_lease_seconds integer DEFAULT 60)
RETURNS SETOF public.workflow_dispatch_outbox LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE dispatch public.workflow_dispatch_outbox;
BEGIN
  IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 10 OR p_lease_seconds IS NULL OR p_lease_seconds NOT BETWEEN 15 AND 300 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'DISPATCH_CLAIM_INVALID';
  END IF;
  FOR dispatch IN SELECT d.* FROM public.workflow_dispatch_outbox d
    JOIN public.workflow_operations op ON op.workspace_id = d.workspace_id AND op.id = d.operation_id
    WHERE d.workspace_id = p_workspace_id AND d.is_current AND d.due_at <= clock_timestamp()
      AND (d.state = 'pending' OR (d.state = 'leased' AND d.lease_until <= clock_timestamp()))
      AND stylora_private.workflow_dispatch_due(op) IS NOT NULL
    ORDER BY d.due_at, d.id LIMIT p_limit FOR UPDATE OF d SKIP LOCKED LOOP
    UPDATE public.workflow_dispatch_outbox SET state = 'leased', lease_token = gen_random_uuid(),
      lease_until = clock_timestamp() + make_interval(secs => p_lease_seconds), attempt_count = least(attempt_count + 1, 32),
      published_at = NULL WHERE workspace_id = p_workspace_id AND id = dispatch.id RETURNING * INTO dispatch;
    RETURN NEXT dispatch;
  END LOOP;
END; $$;

CREATE FUNCTION public.finish_workflow_dispatch(
  p_workspace_id uuid, p_outbox_id uuid, p_lease_token uuid, p_success boolean, p_error_code text DEFAULT NULL
) RETURNS public.workflow_dispatch_outbox LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE dispatch public.workflow_dispatch_outbox; backoff integer;
BEGIN
  IF p_success IS NULL OR (p_error_code IS NOT NULL AND p_error_code !~ '^[A-Z][A-Z0-9_]{0,79}$') THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'DISPATCH_FINISH_INVALID';
  END IF;
  SELECT * INTO dispatch FROM public.workflow_dispatch_outbox WHERE workspace_id = p_workspace_id AND id = p_outbox_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'DISPATCH_NOT_FOUND'; END IF;
  IF p_lease_token IS NULL OR dispatch.lease_token IS DISTINCT FROM p_lease_token THEN
    RAISE EXCEPTION USING ERRCODE = '40001', MESSAGE = 'DISPATCH_LEASE_CONFLICT';
  END IF;
  IF dispatch.state IN ('pending', 'published') THEN RETURN dispatch; END IF;
  IF dispatch.lease_until <= clock_timestamp() THEN RAISE EXCEPTION USING ERRCODE = '40001', MESSAGE = 'DISPATCH_LEASE_EXPIRED'; END IF;
  IF p_success THEN
    UPDATE public.workflow_dispatch_outbox SET state = 'published', lease_until = NULL, published_at = clock_timestamp(), last_error_code = NULL
      WHERE workspace_id = p_workspace_id AND id = dispatch.id RETURNING * INTO dispatch;
  ELSE
    backoff := least(900, (5 * power(2, least(dispatch.attempt_count, 8)))::integer + floor(random() * 5)::integer);
    UPDATE public.workflow_dispatch_outbox SET state = 'pending', lease_until = NULL,
      due_at = clock_timestamp() + make_interval(secs => backoff), last_error_code = coalesce(p_error_code, 'DISPATCH_PUBLISH_FAILED')
      WHERE workspace_id = p_workspace_id AND id = dispatch.id RETURNING * INTO dispatch;
  END IF;
  RETURN dispatch;
END; $$;

CREATE FUNCTION public.reconcile_workflow_dispatches(p_workspace_id uuid, p_limit integer DEFAULT 100)
RETURNS integer LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE op public.workflow_operations; repaired integer := 0;
BEGIN
  IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'DISPATCH_RECONCILE_INVALID'; END IF;
  FOR op IN SELECT o.* FROM public.workflow_operations o WHERE o.workspace_id = p_workspace_id
    AND o.status IN ('queued', 'running', 'partial', 'failed') AND o.kind <> 'marketplace_search'
    AND stylora_private.workflow_dispatch_due(o) IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM public.workflow_dispatch_outbox d WHERE d.workspace_id = p_workspace_id AND d.operation_id = o.id AND d.is_current
      AND (d.state <> 'published' OR d.published_at > clock_timestamp() - interval '7 days'))
    ORDER BY o.created_at, o.id LIMIT p_limit FOR UPDATE OF o SKIP LOCKED LOOP
    PERFORM public.stylora_enqueue_workflow_dispatch(p_workspace_id, op.id);
    repaired := repaired + 1;
  END LOOP;
  RETURN repaired;
END; $$;

REVOKE ALL ON FUNCTION stylora_private.workflow_dispatch_due(public.workflow_operations),
  public.stylora_enqueue_workflow_dispatch(uuid,uuid,boolean), public.stylora_schedule_workflow_dispatch(),
  public.claim_workflow_dispatches(uuid,integer,integer), public.finish_workflow_dispatch(uuid,uuid,uuid,boolean,text),
  public.reconcile_workflow_dispatches(uuid,integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION stylora_private.workflow_dispatch_due(public.workflow_operations),
  public.stylora_enqueue_workflow_dispatch(uuid,uuid,boolean), public.stylora_schedule_workflow_dispatch(),
  public.claim_workflow_dispatches(uuid,integer,integer), public.finish_workflow_dispatch(uuid,uuid,uuid,boolean,text),
  public.reconcile_workflow_dispatches(uuid,integer) TO service_role;

DO $$
DECLARE workspace uuid;
BEGIN
  FOR workspace IN SELECT DISTINCT workspace_id FROM public.workflow_operations LOOP
    PERFORM public.reconcile_workflow_dispatches(workspace, 100);
  END LOOP;
END; $$;


