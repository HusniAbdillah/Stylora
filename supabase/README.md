# Supabase workflow

The app uses the team’s hosted project. Each environment selects its workspace
through `STYLORA_WORKSPACE_ID`. The Supabase CLI configuration is local tooling
for Owner 1 and optional disposable migration tests.

1. Review the baseline contract against [TDD.md](../docs/TDD.md) and the
   [architecture decisions](../docs/ARCHITECTURE.md).
2. Create the migration with `pnpm exec supabase migration new <name>`. Include
   workspace and parent integrity, RLS and grants, and private Storage in review.
3. Validate migrations and policies against an approved database before applying
   changes to the hosted project.
4. After the approved hosted schema is current, export `SUPABASE_PROJECT_ID` and
   `SUPABASE_ACCESS_TOKEN` in the shell or use an authenticated CLI session.
   Run `pnpm db:types` to generate `src/types/database.ts`, then type the client
   with the generated `Database` type.

Use `pnpm exec supabase --help` and the command-specific help for the pinned CLI.
Keep database passwords and CLI access tokens in the development shell. Vercel
uses only runtime variables from `.env.example`.
