# Database policy tests

Place pgTAP tests here with the migration that establishes their contract.
Cover direct table denial, foreign workspaces, wrong-parent relations and
privileged RPC scope. Run `pnpm db:test` against an approved disposable local
database after adding the first migration and policy tests.
