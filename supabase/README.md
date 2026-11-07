# Supabase workflow

The application uses the existing hosted Stylora project. Each environment
selects its workspace through `STYLORA_WORKSPACE_ID`. There is no application
login; enabled workspaces are shared by every visitor.

## MCP baseline

For this setup the user authorized hosted production changes through Supabase
MCP. This overrides the CLI creation/application steps for this task. No local
Supabase stack is required.

1. Inspect the target project, public tables, migration history, Storage buckets
   and object policies before changing anything.
2. Review one complete baseline against [TDD.md](../docs/TDD.md) and the
   [architecture decisions](../docs/ARCHITECTURE.md). One coordinator combines
   the schema and Storage proposals; subagents never apply separate migrations.
3. Apply the reviewed SQL with MCP `apply_migration`. Record the actual remote
   version and name in the local migration filename, preserving the exact SQL.
4. Verify the tables, constraints, privileges and three private buckets. Run
   rollback-only SQL fixtures against the authorized hosted project.
5. Bootstrap workspace records separately, with generated IDs. Do not put
   credentials, inventory fixtures or uploaded objects in the schema migration.
6. Generate database types with MCP and save its unmodified output to
   `src/types/database.ts`. Do not hand-edit generated types.

Applied migrations are immutable. A later change gets an additive migration;
never replay the baseline or reset the hosted project.

## Runtime and Storage

Set `SUPABASE_URL`, `SUPABASE_SECRET_KEY` and `STYLORA_WORKSPACE_ID` in ignored
`.env.local`. Keep `DEMO_WRITES_ENABLED=false` until writes are intended. The
client and all Storage helpers are server-only. Every privileged query must
check workspace and parent membership because the secret key bypasses RLS.

The private buckets are `inspiration`, `wardrobe` and `previews`. Objects use
random workspace-scoped paths; records keep asset IDs and paths, never signed
URLs. Image bytes and cleanup use the Storage API, outside SQL transactions.
The image helper verifies actual format, dimensions and byte count and returns
verified metadata. Domain attachment promotes the asset to ready in its own
transaction. Signing an upload does not mean it has been verified.

`/api/health` reports configuration shape only. `pnpm db:verify` checks a real
scoped database read and bucket configuration. Its explicit `--write-storage`
mode requires the write gate and creates and removes only its own synthetic
objects. It never runs an AI or shopping provider.

The existing CLI configuration and `pnpm db:types` remain optional tooling for
Owner 1. Discover commands with the pinned CLI's help before using them. This
MCP setup does not require CLI login, a personal access token or a database
password. Vercel uses only the runtime variables from `.env.example`.
