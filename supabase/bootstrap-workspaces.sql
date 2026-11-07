BEGIN;

INSERT INTO public.workspaces (name)
VALUES ('demo'), ('preview'), ('dev-owner-1'), ('dev-owner-2'),
       ('dev-owner-3'), ('dev-owner-4')
ON CONFLICT (name) DO NOTHING;

INSERT INTO public.user_preferences (workspace_id)
SELECT id FROM public.workspaces
WHERE name IN ('demo', 'preview', 'dev-owner-1', 'dev-owner-2',
               'dev-owner-3', 'dev-owner-4')
ON CONFLICT (workspace_id) DO NOTHING;

COMMIT;

SELECT id, name FROM public.workspaces
WHERE name IN ('demo', 'preview', 'dev-owner-1', 'dev-owner-2',
               'dev-owner-3', 'dev-owner-4')
ORDER BY name;
