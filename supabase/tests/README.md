# Database policy tests

`foundation.sql` is a standalone PostgreSQL smoke check, executed through
Supabase MCP against the explicitly authorized hosted project. It checks direct
table denial, workspace and parent relations, candidate ownership, per-option
selection, atomic snapshot saving and operation idempotency. Its synthetic rows
are rolled back; it never uploads objects or calls providers.

Run the complete file in one connection. Do not strip its transaction boundaries
or run fragments against shared data. A final success row is returned only after
the fixture transaction has been rolled back.

The existing `pnpm db:test` command is optional CLI/pgTAP tooling for future
pgTAP tests in an approved disposable environment. It is not the runner used for
this standalone MCP check. No local database was used for this setup.
