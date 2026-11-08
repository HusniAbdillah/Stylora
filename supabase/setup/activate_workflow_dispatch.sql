-- Reviewed activation template, not a migration. It creates no secrets.
-- Configure these Vault names through a trusted owner-only channel first:
-- stylora_dispatch_url: exact deployed HTTPS /api/internal/workflow-dispatch URL
-- stylora_dispatch_secret: dedicated STYLORA_DISPATCH_SECRET, 32 random bytes in base64url
-- stylora_dispatch_workspace_id: the same UUID configured server-side in that deployment
-- Never use an OpenAI key or Supabase secret key as this bearer token.
-- pg_net queues decrypted HTTP headers until send; database login roles may read
-- net.http_request_queue. Vault does not hide a header once pg_net queues it.
-- Confirm pg_cron, pg_net and Vault are enabled, then review and run in a transaction:
-- BEGIN;
-- SET LOCAL stylora.activate_workflow_dispatch = 'true';
-- <this file>
-- COMMIT;

DO $activate$
DECLARE endpoint text; bearer text; workspace text;
BEGIN
  IF current_setting('stylora.activate_workflow_dispatch', true) IS DISTINCT FROM 'true' THEN
    RAISE EXCEPTION 'DISPATCH_CRON_REQUIRES_REVIEWED_ACTIVATION';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM pg_extension WHERE extname='pg_cron')
    OR NOT EXISTS(SELECT 1 FROM pg_extension WHERE extname='pg_net')
    OR to_regclass('vault.decrypted_secrets') IS NULL THEN
    RAISE EXCEPTION 'DISPATCH_CRON_EXTENSIONS_REQUIRED';
  END IF;
  SELECT decrypted_secret INTO endpoint FROM vault.decrypted_secrets WHERE name='stylora_dispatch_url';
  SELECT decrypted_secret INTO bearer FROM vault.decrypted_secrets WHERE name='stylora_dispatch_secret';
  SELECT decrypted_secret INTO workspace FROM vault.decrypted_secrets WHERE name='stylora_dispatch_workspace_id';
  IF endpoint IS NULL OR endpoint !~ '^https://[A-Za-z0-9][A-Za-z0-9.-]*/api/internal/workflow-dispatch$'
    OR bearer IS NULL OR bearer !~ '^[A-Za-z0-9_-]{43,128}$'
    OR workspace IS NULL OR workspace !~ '^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$'
    OR NOT EXISTS(SELECT 1 FROM public.workspaces WHERE id=workspace::uuid) THEN
    RAISE EXCEPTION 'DISPATCH_CRON_CONFIGURATION_INVALID';
  END IF;
  PERFORM cron.schedule('stylora-workflow-dispatch', '* * * * *', $job$
    DO $tick$
    DECLARE endpoint text; bearer text; workspace uuid;
    BEGIN
      SELECT decrypted_secret INTO endpoint FROM vault.decrypted_secrets WHERE name='stylora_dispatch_url';
      SELECT decrypted_secret INTO bearer FROM vault.decrypted_secrets WHERE name='stylora_dispatch_secret';
      SELECT decrypted_secret::uuid INTO workspace FROM vault.decrypted_secrets WHERE name='stylora_dispatch_workspace_id';
      IF endpoint IS NULL OR endpoint !~ '^https://[A-Za-z0-9][A-Za-z0-9.-]*/api/internal/workflow-dispatch$'
        OR bearer IS NULL OR bearer !~ '^[A-Za-z0-9_-]{43,128}$' OR workspace IS NULL THEN
        RAISE EXCEPTION 'DISPATCH_CRON_CONFIGURATION_INVALID';
      END IF;
      PERFORM public.reconcile_workflow_dispatches(workspace, 100);
      IF EXISTS(SELECT 1 FROM public.workflow_dispatch_outbox d
        JOIN public.workflow_operations o ON o.workspace_id=d.workspace_id AND o.id=d.operation_id
        WHERE d.workspace_id=workspace AND d.is_current AND d.due_at<=clock_timestamp()
          AND (d.state='pending' OR (d.state='leased' AND d.lease_until<=clock_timestamp()))
          AND stylora_private.workflow_dispatch_due(o) IS NOT NULL) THEN
        PERFORM net.http_post(url:=endpoint, headers:=jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||bearer),
          body:='{}'::jsonb, timeout_milliseconds:=15000);
      END IF;
    END;
    $tick$;
  $job$);
END;
$activate$;

-- Check only job status, HTTP status, due age and safe dispatch codes. Do not
-- select decrypted Vault values or queued HTTP headers into logs or reports.
-- SELECT jobid, jobname, schedule, active FROM cron.job WHERE jobname='stylora-workflow-dispatch';
-- To stop repair: SELECT cron.unschedule('stylora-workflow-dispatch');

